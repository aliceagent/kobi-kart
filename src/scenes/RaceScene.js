import Phaser from 'phaser';
import Kart, { TUNE } from '../Kart.js';
import { generateTrack } from '../TrackGenerator.js';
import { THEME_PROPS } from '../Props.js';
import { ROSTER, POINTS, LAPS, AI_DIFFICULTY, CAR_SPEEDS } from '../GrandPrix.js';
import { makeKartTexture, makeGameTextures } from '../textures.js';
import * as Audio from '../Audio.js';

const WORLD_W = 2800;
const WORLD_H = 2000;
const RAIL_DRAG = 380;
const RAIL_MIN_SPEED = 100;
const OBSTACLE_MIN_SPEED = 90;
// Race ends when everyone finishes — or, once 60s have passed, as soon as only
// a single straggler is left. A generous hard cap prevents a true soft-lock.
const STRAGGLER_GRACE = 60; // seconds the last racer gets after the 3rd finisher
const RACE_HARD_CAP = 240; // absolute safety cap (since GO)

// Position-based item odds (Mario-Kart style): leaders get defensive/area-denial
// items, trailers get catch-up items. Keyed by live race position (1 = first).
const ITEM_WEIGHTS = {
  1: { trap: 4, shield: 3, greenShell: 2, tripleShell: 2 },
  2: { greenShell: 3, trap: 2, shield: 2, boost: 2, redShell: 1, tripleShell: 2 },
  3: { boost: 3, greenShell: 2, redShell: 2, tripleShell: 2, tripleMushroom: 2, star: 1, trap: 1 },
  4: { boost: 2, redShell: 2, tripleMushroom: 3, star: 2, lightning: 1, shield: 1 },
};

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + t * dx, y: ay + t * dy };
}

function distToSegSq(px, py, ax, ay, bx, by) {
  const c = closestOnSeg(px, py, ax, ay, bx, by);
  return (px - c.x) ** 2 + (py - c.y) ** 2;
}

export default class RaceScene extends Phaser.Scene {
  constructor() {
    super('RaceScene');
  }

  create() {
    this.gp = this.registry.get('gp');
    this.aiCfg = AI_DIFFICULTY[this.gp.difficulty] || AI_DIFFICULTY.medium;
    this.carSpeed = CAR_SPEEDS[this.registry.get('carSpeed')] || 1;
    const themeName = this.gp.themeOrder[this.gp.raceIndex];

    const track = generateTrack(WORLD_W, WORLD_H, themeName);
    this.centerline = track.centerline;
    this.roadWidth = track.roadWidth;
    this.halfWidth = track.halfWidth;
    this.theme = track.theme;
    this.start = track.start;
    this.isRainbow = this.theme.name === 'Rainbow';
    this.fatalOffRoad = this.theme.offRoad === 'fatal'; // leaving the road = fall + respawn
    this.lowVis = !!this.theme.lowVis; // Neon: tighter camera + vignette
    // Worlds with a fatal void (Rainbow, Volcano) have no guard rails — you fall.
    this.rails = this.fatalOffRoad ? [] : track.rails;
    // Dirt shortcut (may be null): cuts a curve, a bit slower but shorter.
    this.shortcut = track.shortcut || null;
    this.shortcutHalf = (this.roadWidth * 0.72) / 2;

    // Per-world road features / hazards (filled by drawTrack + createHazards).
    this.boostPads = [];
    this.oilPatches = [];
    this.slowPatches = [];
    this.geysers = [];
    this.lightning = null;
    this.windPhase = 0;
    this.windX = 0;
    this.windY = 0;
    // Adventure-cup mechanics.
    this.currents = [];      // Coral: directional flow zones
    this.bouncePads = [];    // Carnival: springy bumpers
    this.movers = [];        // Desert: rolling tumbleweeds
    this.fogPatches = [];    // Haunted: drifting fog banks

    makeGameTextures(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));

    this.trackGfx = this.drawTrack();
    this.createRacers();
    this.createItemBoxes();
    this.createCoins();
    this.createHazards();
    this.createMovers();
    this.createFog();
    this.hazardGfx = this.add.graphics().setDepth(13); // telegraphs + eruptions + bolts
    this.fogGfx = this.add.graphics().setDepth(14);     // drifting fog (above karts)
    this.skidGfx = this.add.graphics().setDepth(1);     // drift skid marks (just above road)
    this.skidMarks = [];

    this.projectiles = [];
    this.traps = [];
    this.dynGfx = this.add.graphics().setDepth(15); // shields
    this.particles = this.add.particles(0, 0, 'spark', {
      lifespan: 450, speed: { min: 30, max: 120 }, scale: { start: 0.7, end: 0 },
      emitting: false, gravityY: 0,
    }).setDepth(12);

    // Colourful confetti burst for finish-line crossings.
    this.confetti = this.add.particles(0, 0, 'spark', {
      lifespan: 900, speed: { min: 90, max: 300 }, angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 160,
      emitting: false,
      tint: [0xff5d8f, 0x4d8bff, 0xffd23f, 0x57c75a, 0xb06bff, 0xffffff, 0xff8a3c],
    }).setDepth(16);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.minZoom = Math.max(this.cameras.main.width / WORLD_W, this.cameras.main.height / WORLD_H);
    this.camCenter = new Phaser.Math.Vector2(this.start.x, this.start.y);
    this.cameras.main.setBackgroundColor('#0e0e16');
    this.updateCamera(1);

    this.state = 'countdown';
    this.countdown = 3.999;
    this.countdownText = '';
    this.elapsed = 0;
    this.raceElapsed = 0; // time since GO (excludes the countdown)
    this.finishCount = 0;
    this.stragglerDeadline = null; // set when only the last racer remains
    this.order = this.racers.slice();

    Audio.resumeAudio();
    Audio.startMusic(this.isRainbow ? 'Funky' : this.theme.name);

    // HUD overlay scene (isolated from the world camera's zoom).
    this.scene.launch('UIScene', { race: this });
    this.events.once('shutdown', () => {
      this.scene.stop('UIScene');
      Audio.stopMusic();
    });

    // Pause (P). While paused, the race update is frozen but key listeners
    // still fire, so you can resume (P) or quit to the menu (Q / Esc).
    this.paused = false;
    this.input.keyboard.on('keydown-P', () => { if (this.state !== 'finished') this.togglePause(); });
    this.input.keyboard.on('keydown-Q', () => { if (this.paused) this.scene.start('TitleScene'); });
    this.input.keyboard.on('keydown-ESC', () => { if (this.paused) this.scene.start('TitleScene'); });
  }

  togglePause() {
    this.paused = !this.paused;
    Audio.sfx('beep');
  }

  // ---------------------------------------------------------------- setup ----
  createRacers() {
    const cl = this.centerline;
    const n = cl.length;

    // Grid slots sit on the road just behind the start line. Positions follow
    // the centerline (each point's own tangent/normal) so karts always spawn ON
    // the road even when the start straight has a slight bend.
    const slots = [
      { back: 3, side: -1 }, { back: 3, side: 1 },
      { back: 7, side: -1 }, { back: 7, side: 1 },
    ];
    // Randomise which racer takes which slot ("who's in front").
    const slotOrder = [0, 1, 2, 3];
    for (let i = slotOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotOrder[i], slotOrder[j]] = [slotOrder[j], slotOrder[i]];
    }
    const offset = this.roadWidth * 0.22;

    // The 4-kart lineup (humans first, then AI), chosen at Grand Prix start.
    const lineup = (this.gp.lineup && this.gp.lineup.length) ? this.gp.lineup : [0, 1, 2, 3];
    const ordered = lineup.map((idx) => ROSTER[idx]);

    this.racers = [];
    this.humans = [];
    ordered.forEach((r, i) => {
      const slot = slots[slotOrder[i]];
      const idx = (((-slot.back) % n) + n) % n;
      const p = cl[idx];
      const pn = cl[(idx + 1) % n];
      let tx = pn.x - p.x;
      let ty = pn.y - p.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const x = p.x + -ty * slot.side * offset;
      const y = p.y + tx * slot.side * offset;
      const kart = new Kart(this, x, y, Math.atan2(ty, tx), `kart_${r.id}`);
      kart.id = r.id;
      kart.name = r.name;
      kart.color = r.color;
      kart.isAI = this.gp.debugAllAI || i >= this.gp.playerCount;
      kart.speedScale = this.carSpeed; // slow/medium/fast applies to everyone
      kart.idxPos = idx;
      kart.halfway = false;
      this.racers.push(kart);
      if (!kart.isAI) this.humans.push(kart);
    });

    // Human control keys. Both sets are always created; in 1-player mode the
    // single human can drive with EITHER P1 (WASD) or P2 (arrows) controls.
    this.soloDualInput = this.gp.playerCount === 1;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.keysP1 = this.input.keyboard.addKeys({
      left: KC.A, right: KC.D, brake: KC.S, boost: KC.W,
    });
    this.p1ItemKeys = [this.input.keyboard.addKey(KC.E), this.input.keyboard.addKey(KC.SPACE)];
    this.keysP2 = this.input.keyboard.addKeys({
      left: KC.LEFT, right: KC.RIGHT, brake: KC.DOWN, boost: KC.UP,
    });
    this.p2ItemKeys = [this.input.keyboard.addKey(KC.BACK_SLASH), this.input.keyboard.addKey(KC.FORWARD_SLASH)];
    // Right Shift (item) is matched specifically via the DOM event location.
    this.p2RightShiftFired = false;
    this.input.keyboard.on('keydown-SHIFT', (e) => { if (e.location === 2) this.p2RightShiftFired = true; });
  }

  createItemBoxes() {
    const n = this.centerline.length;
    this.itemBoxes = [];
    const count = 18;
    // Keep a clear zone around the start line (idx 0) so no boxes sit on the
    // starting grid or right in front of the cars at GO.
    const gap = Math.max(12, Math.round(n * 0.08));
    const span = n - 2 * gap;
    for (let i = 0; i < count; i += 1) {
      const idx = Math.round(gap + ((i + 0.5) * span) / count) % n;
      const p = this.centerline[idx];
      const sprite = this.add.image(p.x, p.y, 'itembox').setDepth(8);
      this.itemBoxes.push({ x: p.x, y: p.y, sprite, active: true, timer: 0 });
    }
  }

  // ---------------------------------------------------------------- input ----
  readKeys(keys) {
    let steer = 0;
    if (keys.left.isDown) steer -= 1;
    if (keys.right.isDown) steer += 1;
    return { steer, braking: keys.brake.isDown, boosting: keys.boost.isDown };
  }

  aiControl(kart) {
    const n = this.centerline.length;
    const idx = this.nearestIndex(kart.x, kart.y);
    // Short lookahead so the AI hugs the racing line instead of cutting across.
    const look = 3 + Math.round(kart.speed / 150);
    const target = this.centerline[(idx + look) % n];
    const desired = Math.atan2(target.y - kart.y, target.x - kart.x);
    const diff = Phaser.Math.Angle.Wrap(desired - kart.heading);
    const steer = Phaser.Math.Clamp(diff / 0.4, -1, 1);
    // Only brake when moving fast, so the AI never brakes itself to a standstill.
    const braking = Math.abs(diff) > 0.85 && kart.speed > 170;
    const boosting = Math.abs(diff) < 0.12 && kart.boostFuel > this.aiCfg.boostGate;
    return { steer, braking, boosting };
  }

  // ---------------------------------------------------------- geometry -------
  minDistSqToCenterline(x, y) {
    const pts = this.centerline;
    const n = pts.length;
    let min = Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const d = distToSegSq(x, y, a.x, a.y, b.x, b.y);
      if (d < min) min = d;
    }
    return min;
  }

  nearestIndex(x, y) {
    const pts = this.centerline;
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return bi;
  }

  isOnRoad(x, y) {
    return this.minDistSqToCenterline(x, y) <= this.halfWidth * this.halfWidth || this.onShortcut(x, y);
  }

  // On the dirt shortcut strip? (counts as "road" so it isn't off-road-slow).
  onShortcut(x, y) {
    const s = this.shortcut;
    if (!s) return false;
    return distToSegSq(x, y, s.ax, s.ay, s.bx, s.by) <= this.shortcutHalf * this.shortcutHalf;
  }

  // ---------------------------------------------------------- progress -------
  progress(kart) {
    return kart.lap * this.centerline.length + kart.idxPos;
  }

  // Advance progress by the racer's nearest centerline index. Only accept
  // small forward steps (ignores backward motion and off-track index jumps),
  // and require passing the track midpoint before a finish-line crossing
  // counts as a lap.
  // If a racer is wedged off the track (e.g. jammed into a V of guard rails)
  // and barely moving for a couple seconds, pop them back onto the racing line.
  rescueIfStuck(kart, dt) {
    if (kart.finished || kart.falling) { kart.stuckTimer = 0; return; }
    if (this.fatalOffRoad) return; // fatal-void worlds handle off-track via falling
    if (Math.abs(kart.speed) < 45 && !this.isOnRoad(kart.x, kart.y)) {
      kart.stuckTimer += dt;
      if (kart.stuckTimer > 2.5) {
        const n = this.centerline.length;
        const idx = this.nearestIndex(kart.x, kart.y);
        const p = this.centerline[idx];
        const pn = this.centerline[(idx + 1) % n];
        kart.x = p.x;
        kart.y = p.y;
        kart.heading = Math.atan2(pn.y - p.y, pn.x - p.x);
        kart.speed = 80;
        kart.knockX = 0;
        kart.knockY = 0;
        kart.stuckTimer = 0;
        this.burst(p.x, p.y, 0xffffff);
      }
    } else {
      kart.stuckTimer = Math.max(0, kart.stuckTimer - dt * 2);
    }
  }

  updateProgress(kart) {
    if (kart.finished) return;
    const n = this.centerline.length;
    const ni = this.nearestIndex(kart.x, kart.y);
    const prev = kart.idxPos;
    const gap = (((ni - prev) % n) + n) % n;
    if (gap === 0 || gap > 30) return;
    const wrapped = prev + gap >= n;
    kart.idxPos = ni;
    if (ni > n * 0.4 && ni < n * 0.6) kart.halfway = true;
    if (wrapped && kart.halfway) {
      kart.halfway = false;
      const lapTime = this.raceElapsed - kart.lapStart;
      kart.lapStart = this.raceElapsed;
      if (lapTime > 0 && (kart.bestLap == null || lapTime < kart.bestLap)) kart.bestLap = lapTime;
      kart.lap += 1;
      if (kart.lap >= LAPS) {
        this.finishRacer(kart);
      } else {
        if (!kart.isAI) Audio.sfx('lap');
        this.celebrateCrossing(kart, false);
      }
    }
  }

  finishRacer(kart) {
    if (kart.finished) return;
    kart.finished = true;
    this.finishCount += 1;
    kart.place = this.finishCount;
    if (!kart.isAI) Audio.sfx('finish');
    this.celebrateCrossing(kart, true);
    // Once everyone but the last racer is in, give that straggler 60s to finish.
    const unfinished = this.racers.reduce((c, r) => c + (r.finished ? 0 : 1), 0);
    if (unfinished === 1 && this.stragglerDeadline === null) {
      this.stragglerDeadline = this.raceElapsed + STRAGGLER_GRACE;
    }
  }

  endRace() {
    this.state = 'finished';
    const live = this.racers.filter((r) => !r.finished)
      .sort((a, b) => this.progress(b) - this.progress(a));
    live.forEach((r) => { this.finishRacer(r); });

    const order = this.racers.slice().sort((a, b) => a.place - b.place);
    const results = order.map((k, i) => ({
      id: k.id, name: k.name, color: k.color, place: k.place, points: POINTS[i] || 0,
      bestLap: k.bestLap, coins: k.coins,
    }));
    results.forEach((r) => { this.gp.points[r.id] += r.points; });
    this.gp.lastResults = results;
    this.registry.set('gp', this.gp);

    this.cameras.main.flash(300, 255, 255, 255);
    this.time.delayedCall(1000, () => this.scene.start('ResultsScene'));
  }

  // ------------------------------------------------------------- items -------
  giveItem(kart) {
    const place = Phaser.Math.Clamp(kart.livePlace || 1, 1, 4);
    // Last place has a 1-in-10 shot at the dreaded blue (leader-seeking) shell.
    if (place === 4 && Math.random() < 0.1) { this.grantItem(kart, 'blueShell'); return; }
    const weights = ITEM_WEIGHTS[place];
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = Math.random() * total;
    let chosen = 'boost';
    for (const k in weights) { r -= weights[k]; if (r <= 0) { chosen = k; break; } }
    this.grantItem(kart, chosen);
  }

  // Hand a kart an item, seeding the ammo count for the multi-use ones.
  grantItem(kart, item) {
    kart.heldItem = item;
    kart.heldCount = item === 'tripleMushroom' ? 3 : 0;
    kart.orbitShells = item === 'tripleShell' ? 3 : 0;
  }

  useItem(kart) {
    const item = kart.heldItem;
    if (!item) return;
    Audio.sfx('item');
    if (item === 'boost') { kart.itemBoostTimer = 1.6; Audio.sfx('boost'); this.burst(kart.x, kart.y, 0xffd23f); }
    else if (item === 'tripleMushroom') { kart.itemBoostTimer = 1.35; Audio.sfx('boost'); this.burst(kart.x, kart.y, 0xff5fa2); }
    else if (item === 'shield') { kart.shieldTimer = 6; }
    else if (item === 'star') { kart.starTimer = 5.5; Audio.sfx('boost'); this.burst(kart.x, kart.y, 0xffe14d); }
    else if (item === 'greenShell') this.spawnProjectile(kart, 'green');
    else if (item === 'redShell') this.spawnProjectile(kart, 'red');
    else if (item === 'blueShell') this.spawnProjectile(kart, 'blue');
    else if (item === 'tripleShell') this.spawnProjectile(kart, 'green'); // launches one orbiting shell
    else if (item === 'trap') this.spawnTrap(kart);
    else if (item === 'lightning') this.lightningStrike(kart);

    // Multi-use items keep their slot until the ammo runs out.
    if (item === 'tripleMushroom') { kart.heldCount -= 1; if (kart.heldCount <= 0) kart.heldItem = null; }
    else if (item === 'tripleShell') { kart.orbitShells -= 1; if (kart.orbitShells <= 0) kart.heldItem = null; }
    else kart.heldItem = null;
  }

  // Lightning: zap every other racer (spin-out) with a screen flash. Rare,
  // last-place-only — a dramatic comeback.
  lightningStrike(kart) {
    Audio.sfx('zap');
    this.cameras.main.flash(220, 230, 230, 140);
    for (const r of this.racers) {
      if (r === kart || r.finished || r.falling) continue;
      if (r.hit()) this.burst(r.x, r.y, 0xfff3b0);
    }
  }

  // The racer one place ahead of this kart (a red shell's prey).
  racerAhead(kart) {
    let best = null;
    for (const r of this.racers) {
      if (r === kart || r.finished) continue;
      if ((r.livePlace || 99) < (kart.livePlace || 99)) {
        if (!best || r.livePlace > best.livePlace) best = r;
      }
    }
    return best;
  }

  // type: 'green' (straight), 'red' (homing), 'blue' (leader-seeking).
  spawnProjectile(kart, type) {
    const ox = Math.cos(kart.heading);
    const oy = Math.sin(kart.heading);
    const homing = type !== 'green';
    const blue = type === 'blue';
    const key = `shell_${type}`;
    const sprite = this.add.image(kart.x + ox * 28, kart.y + oy * 28, key).setDepth(13);

    let speed; let turnRate; let life;
    if (type === 'green') { speed = 480 + kart.speed; turnRate = 0; life = 4.5; } // bounces, so lives a bit longer
    else if (type === 'red') { speed = 470; turnRate = 4.2; life = 5; } // locks onto the racer ahead
    else { speed = 473; turnRate = 4.6; life = 11; } // blue: 10% faster, tighter turns, long reach

    this.projectiles.push({
      sprite, x: sprite.x, y: sprite.y,
      vx: ox * speed, vy: oy * speed, speed,
      owner: kart, homing, blue, turnRate, life,
      target: type === 'red' ? this.racerAhead(kart) : null,
      hitSet: new Set(), // racers a blue shell has already spun out (passes through them)
    });
  }

  spawnTrap(kart) {
    const ox = Math.cos(kart.heading);
    const oy = Math.sin(kart.heading);
    const x = kart.x - ox * 28;
    const y = kart.y - oy * 28;
    const sprite = this.add.image(x, y, 'oil').setDepth(7);
    this.traps.push({ sprite, x, y, life: 14, grace: 0.6, owner: kart });
  }

  // Reflect a (green) shell off the nearest rail or obstacle it overlaps,
  // pushing it clear of the surface so it doesn't stick. One bounce per frame.
  bounceProjectile(p) {
    const r = 9;
    const reflect = (nx, ny, surfaceX, surfaceY, minD) => {
      p.x = surfaceX + nx * minD;
      p.y = surfaceY + ny * minD;
      const vdot = p.vx * nx + p.vy * ny;
      if (vdot < 0) {
        p.vx -= 2 * vdot * nx;
        p.vy -= 2 * vdot * ny;
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
        this.burst(p.x, p.y, 0x9bf0a6);
        Audio.sfx('bump');
      }
    };
    for (const o of this.obstacles) {
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const dist = Math.hypot(dx, dy);
      const minD = r + o.radius;
      if (dist < minD && dist > 0.0001) { reflect(dx / dist, dy / dist, o.x, o.y, minD); return; }
    }
    for (const s of this.rails) {
      const c = closestOnSeg(p.x, p.y, s.ax, s.ay, s.bx, s.by);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dist = Math.hypot(dx, dy);
      const minD = r + 6;
      if (dist < minD && dist > 0.0001) { reflect(dx / dist, dy / dist, c.x, c.y, minD); return; }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.homing) {
        const onRoad = this.isOnRoad(p.x, p.y);
        const eff = onRoad ? p.speed : p.speed * 0.5; // rough terrain slows it
        const cur = Math.atan2(p.vy, p.vx);
        let desired = cur;
        if (p.blue) {
          // Blue shell follows the racing line toward the distant leader.
          const n = this.centerline.length;
          const idx = this.nearestIndex(p.x, p.y);
          const aim = this.centerline[(idx + (onRoad ? 5 : 2)) % n];
          desired = Math.atan2(aim.y - p.y, aim.x - p.x);
        } else {
          // Red shell locks straight onto the racer ahead. Its turn rate is the
          // only limit — at close range a hard turn + a speed boost can make it
          // overshoot, but otherwise it WILL run you down.
          if (!p.target || p.target.finished) p.target = this.racerAhead(p.owner);
          if (p.target) desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        }
        const turn = Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(desired - cur), -p.turnRate * dt, p.turnRate * dt);
        const a = cur + turn;
        p.vx = Math.cos(a) * eff;
        p.vy = Math.sin(a) * eff;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.sprite.setPosition(p.x, p.y);
      if (p.homing) p.sprite.rotation = Math.atan2(p.vy, p.vx);
      else p.sprite.rotation += dt * 12;
      let dead = p.life <= 0 || p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H;
      // Orbiting triple-shells intercept an incoming projectile (one shell each).
      if (!dead) {
        for (const r of this.racers) {
          if (r === p.owner || r.finished || r.orbitShells <= 0) continue;
          if ((r.x - p.x) ** 2 + (r.y - p.y) ** 2 < (r.radius + 20) ** 2) {
            r.orbitShells -= 1;
            if (r.orbitShells <= 0 && r.heldItem === 'tripleShell') r.heldItem = null;
            this.burst(p.x, p.y, 0x9bf0a6); Audio.sfx('bump');
            dead = true; break;
          }
        }
      }
      if (!dead) {
        for (const r of this.racers) {
          if (r === p.owner || r.finished) continue;
          if ((r.x - p.x) ** 2 + (r.y - p.y) ** 2 >= (r.radius + 11) ** 2) continue;
          if (p.blue) {
            if (r.livePlace === 1) {
              // Reached the leader — spin them out and detonate.
              const landed = r.hit();
              this.burst(p.x, p.y, landed ? 0x4d8bff : 0x9fd6f5);
              Audio.sfx('hit');
              dead = true;
              break;
            } else if (!p.hitSet.has(r.id)) {
              // A bystander in the path — spin them once, then keep going.
              r.hit();
              p.hitSet.add(r.id);
              this.burst(r.x, r.y, 0x9fd6f5);
              Audio.sfx('bump');
            }
          } else {
            const landed = r.hit();
            this.burst(p.x, p.y, landed ? 0x33c75a : 0x9fd6f5);
            Audio.sfx('hit');
            dead = true;
            break;
          }
        }
      }
      // Green shells ricochet off rails and obstacles. Red and blue shells are
      // relentless homing missiles — they fly over walls so you can't dodge by
      // ducking behind one.
      if (!dead && !p.homing) this.bounceProjectile(p);
      if (dead) { p.sprite.destroy(); this.projectiles.splice(i, 1); }
    }
  }

  updateTraps(dt) {
    for (let i = this.traps.length - 1; i >= 0; i -= 1) {
      const t = this.traps[i];
      t.life -= dt;
      if (t.grace > 0) t.grace -= dt;
      let dead = t.life <= 0;
      if (!dead) {
        for (const r of this.racers) {
          if (r.finished) continue;
          if (r === t.owner && t.grace > 0) continue;
          if ((r.x - t.x) ** 2 + (r.y - t.y) ** 2 < (r.radius + 12) ** 2) {
            const landed = r.hit();
            this.burst(t.x, t.y, 0x15151c);
            Audio.sfx('hit');
            if (landed) { dead = true; break; }
          }
        }
      }
      if (dead) { t.sprite.destroy(); this.traps.splice(i, 1); }
    }
  }

  updateItemBoxes(dt) {
    for (const box of this.itemBoxes) {
      if (box.active) {
        box.sprite.rotation += dt * 1.5;
        box.sprite.setScale(1 + Math.sin(this.elapsed * 4 + box.x) * 0.08);
        for (const r of this.racers) {
          if (r.finished || r.heldItem || r.spunOut) continue;
          if ((r.x - box.x) ** 2 + (r.y - box.y) ** 2 < (r.radius + 18) ** 2) {
            this.giveItem(r);
            box.active = false;
            box.timer = 4;
            box.sprite.setVisible(false);
            if (!r.isAI) Audio.sfx('pickup');
            break;
          }
        }
      } else {
        box.timer -= dt;
        if (box.timer <= 0) { box.active = true; box.sprite.setVisible(true); box.sprite.setScale(1); }
      }
    }
  }

  burst(x, y, tint) {
    this.particles.setParticleTint(tint);
    this.particles.emitParticleAt(x, y, 10);
  }

  // -------------------------------------------------------------- coins ------
  createCoins() {
    const n = this.centerline.length;
    this.coins = [];
    const count = 26;
    const gap = Math.max(10, Math.round(n * 0.05));
    const span = n - 2 * gap;
    for (let i = 0; i < count; i += 1) {
      const idx = Math.round(gap + ((i + 0.5) * span) / count) % n;
      const p = this.centerline[idx];
      const pn = this.centerline[(idx + 1) % n];
      let tx = pn.x - p.x; let ty = pn.y - p.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty; const ny = tx;
      const off = ((i % 3) - 1) * this.halfWidth * 0.42; // weave -1 / 0 / 1
      const sprite = this.add.image(p.x + nx * off, p.y + ny * off, 'coin').setDepth(7);
      this.coins.push({ x: sprite.x, y: sprite.y, sprite, active: true, timer: 0 });
    }
  }

  updateCoins(dt) {
    for (const c of this.coins) {
      if (c.active) {
        c.sprite.rotation += dt * 4;
        c.sprite.setScale(1 + Math.sin(this.elapsed * 5 + c.x) * 0.12);
        for (const r of this.racers) {
          if (r.finished || r.falling || r.spunOut) continue;
          if ((r.x - c.x) ** 2 + (r.y - c.y) ** 2 < (r.radius + 12) ** 2) {
            this.giveCoin(r);
            c.active = false; c.timer = 6; c.sprite.setVisible(false);
            break;
          }
        }
      } else {
        c.timer -= dt;
        if (c.timer <= 0) { c.active = true; c.sprite.setVisible(true); c.sprite.setScale(1); }
      }
    }
  }

  giveCoin(kart) {
    kart.coins = Math.min(10, kart.coins + 1);
    kart.coinMul = 1 + 0.012 * kart.coins;
    if (!kart.isAI) Audio.sfx('coin');
    this.burst(kart.x, kart.y, 0xffe14d);
  }

  // Spinning out scatters a couple of coins (risk of carrying a big stack).
  coinDropCheck(kart) {
    const spun = kart.spinTimer > 0;
    if (spun && !kart._coinPrevSpun && kart.coins > 0) {
      kart.coins = Math.max(0, kart.coins - 2);
      kart.coinMul = 1 + 0.012 * kart.coins;
      this.burst(kart.x, kart.y, 0xffd23f);
    }
    kart._coinPrevSpun = spun;
  }

  // ---------------------------------------------------------- slipstream -----
  // Tucking into another kart's wake (close, directly behind, aligned) builds a
  // draft that raises your top speed up to +12% — a skill-based catch-up.
  updateDraft(dt) {
    const DIST = 80;
    const CONE = 0.5;
    for (const f of this.racers) {
      let drafting = false;
      if (!f.finished && !f.falling && !f.spunOut) {
        for (const l of this.racers) {
          if (l === f || l.finished) continue;
          const dx = f.x - l.x; const dy = f.y - l.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 2 * f.radius || dist > DIST) continue;
          const lfx = Math.cos(l.heading); const lfy = Math.sin(l.heading);
          if (dx * lfx + dy * lfy > 0) continue;          // f must be BEHIND l
          if (Math.abs(dx * lfy - dy * lfx) / dist > CONE) continue; // within the wake cone
          drafting = true; break;
        }
      }
      f.drafting = drafting;
      f.draftTimer = drafting
        ? Math.min(1.5, f.draftTimer + dt)
        : Math.max(0, f.draftTimer - dt * 1.5);
      f.draftMul = 1 + Math.min(0.12, f.draftTimer * 0.1);
    }
  }

  // A festive confetti + popup when a racer crosses the line (lap or finish).
  celebrateCrossing(kart, finished) {
    this.confetti.emitParticleAt(kart.x, kart.y, finished ? 48 : 26);
    if (finished) this.cameras.main.flash(220, 255, 255, 220);
    if (kart.isAI) return;
    const msg = finished ? 'FINISH!' : `LAP ${Math.min(kart.lap + 1, LAPS)}`;
    const t = this.add.text(kart.x, kart.y - 28, msg, {
      fontFamily: 'monospace', fontSize: '34px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: t, y: t.y - 80, alpha: { from: 1, to: 0 }, scale: { from: 0.5, to: 1.35 },
      duration: 1150, ease: 'Cubic.Out', onComplete: () => t.destroy(),
    });
  }

  // -------------------------------------------------------- collisions -------
  resolveKartCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    // A star racer plows through: the other kart spins out and is flung away,
    // the star kart keeps its momentum.
    const aStar = a.starTimer > 0;
    const bStar = b.starTimer > 0;
    if (aStar !== bStar) {
      const victim = aStar ? b : a;
      const sign = aStar ? 1 : -1;
      victim.x += nx * overlap * sign; victim.y += ny * overlap * sign;
      if (victim.hit()) {
        victim.knockX += nx * sign * 360; victim.knockY += ny * sign * 360;
        this.burst(victim.x, victim.y, 0xffe14d); Audio.sfx('hit');
      }
      return;
    }

    a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
    b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
    const push = 150 + (a.speed + b.speed) * 0.25;
    a.knockX -= nx * push; a.knockY -= ny * push;
    b.knockX += nx * push; b.knockY += ny * push;
    a.speed *= 0.85; b.speed *= 0.85;
  }

  resolveRails(kart, dt) {
    const r = kart.radius;
    for (const s of this.rails) {
      const c = closestOnSeg(kart.x, kart.y, s.ax, s.ay, s.bx, s.by);
      const dx = kart.x - c.x;
      const dy = kart.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist <= 0.0001) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      kart.x += nx * (r - dist);
      kart.y += ny * (r - dist);
      const into = -(kart.knockX * nx + kart.knockY * ny);
      if (into > 0) { kart.knockX += nx * into; kart.knockY += ny * into; }
      if (kart.speed > RAIL_MIN_SPEED) kart.speed = Math.max(RAIL_MIN_SPEED, kart.speed - RAIL_DRAG * dt);
    }
  }

  resolveObstacles(kart) {
    for (const o of this.obstacles) {
      const dx = kart.x - o.x;
      const dy = kart.y - o.y;
      const dist = Math.hypot(dx, dy);
      const minDist = kart.radius + o.radius;
      if (dist >= minDist || dist <= 0.0001) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      kart.x += nx * (minDist - dist);
      kart.y += ny * (minDist - dist);
      const into = -(kart.knockX * nx + kart.knockY * ny);
      if (into > 0) { kart.knockX += nx * into; kart.knockY += ny * into; }
      const bounce = 150 + kart.speed * 0.3;
      kart.knockX += nx * bounce; kart.knockY += ny * bounce;
      if (kart.speed > OBSTACLE_MIN_SPEED) kart.speed = Math.max(OBSTACLE_MIN_SPEED, kart.speed * 0.6);
    }
  }

  clampToWorld(kart) {
    kart.x = Phaser.Math.Clamp(kart.x, kart.radius, WORLD_W - kart.radius);
    kart.y = Phaser.Math.Clamp(kart.y, kart.radius, WORLD_H - kart.radius);
  }

  // ----------------------------------------------------------- camera --------
  updateCamera(dt) {
    const cam = this.cameras.main;
    const view = this.humans.length ? this.humans : this.racers;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of view) {
      minX = Math.min(minX, k.x); maxX = Math.max(maxX, k.x);
      minY = Math.min(minY, k.y); maxY = Math.max(maxY, k.y);
    }
    // Low-visibility worlds (Neon) pull the camera in tight.
    const pad = this.lowVis ? 150 : 300;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const maxZoom = this.lowVis ? (view.length > 1 ? 1.3 : 1.55) : (view.length > 1 ? 1.1 : 0.95);
    const targetZoom = Phaser.Math.Clamp(
      Math.min(cam.width / (maxX - minX), cam.height / (maxY - minY)),
      this.minZoom, maxZoom
    );
    const t = 1 - Math.exp(-6 * dt);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, t));
    this.camCenter.x = Phaser.Math.Linear(this.camCenter.x, (minX + maxX) / 2, t);
    this.camCenter.y = Phaser.Math.Linear(this.camCenter.y, (minY + maxY) / 2, t);
    cam.centerOn(this.camCenter.x, this.camCenter.y);
  }

  // ------------------------------------------------------- rocket start ------
  // True while this human holds boost (P1: W; P2: ↑; solo merges both sets).
  humanBoostHeld(kart) {
    if (kart === this.humans[0]) {
      if (this.keysP1.boost.isDown) return true;
      return this.soloDualInput && this.keysP2.boost.isDown;
    }
    return this.keysP2.boost.isDown;
  }

  // During the countdown, remember when each human first started revving, and
  // puff a little exhaust so they can see they're charging.
  updateRev(dt) {
    for (const h of this.humans) {
      if (this.humanBoostHeld(h)) {
        if (h.revStartCd == null) h.revStartCd = this.countdown;
        if (Math.random() < 0.35) {
          this.burst(h.x - Math.cos(h.heading) * 16, h.y - Math.sin(h.heading) * 16, 0xffd23f);
        }
      } else {
        h.revStartCd = null;
      }
    }
  }

  // At GO: a well-timed rev (started in the last ~0.55s) launches; revving too
  // early bogs you down. AI rolls a rocket by difficulty so it stays competitive.
  launchStart() {
    const ROCKET_WINDOW = 0.55;
    const aiChance = { easy: 0.2, medium: 0.55, hard: 0.85 }[this.gp.difficulty] || 0.55;
    for (const r of this.racers) {
      if (r.isAI) {
        if (Math.random() < aiChance) this.applyRocket(r, false);
      } else if (r.revStartCd != null) {
        if (r.revStartCd <= ROCKET_WINDOW) this.applyRocket(r, true);
        else this.applyBog(r);
      }
    }
  }

  applyRocket(kart, human) {
    kart.itemBoostTimer = Math.max(kart.itemBoostTimer, 1.0);
    this.burst(kart.x, kart.y, 0xffd23f);
    if (human) { Audio.sfx('boost'); this.rocketPopup(kart); }
  }

  applyBog(kart) {
    kart.bogTimer = 1.1;
    this.burst(kart.x, kart.y, 0x222226);
    Audio.sfx('bump');
  }

  rocketPopup(kart) {
    const t = this.add.text(kart.x, kart.y - 30, 'ROCKET START!', {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: t, y: t.y - 70, alpha: { from: 1, to: 0 }, scale: { from: 0.5, to: 1.3 },
      duration: 1100, ease: 'Cubic.Out', onComplete: () => t.destroy(),
    });
  }

  applyRubberBand() {
    // Lead = furthest progressed racer. The AI's base pace comes from the
    // chosen difficulty; trailing AI catch up by the difficulty's band amount.
    const cfg = this.aiCfg;
    let lead = -Infinity;
    for (const r of this.racers) lead = Math.max(lead, this.progress(r));
    for (const r of this.racers) {
      if (!r.isAI) { r.speedMul = 1; continue; }
      const behind = lead - this.progress(r);
      r.speedMul = Phaser.Math.Clamp(cfg.speedMul + behind * cfg.band, cfg.speedMul - 0.06, cfg.speedMul + 0.18);
    }
  }

  // ----------------------------------------------------------- update --------
  update(time, deltaMs) {
    if (this.paused) return; // frozen until P resumes
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      const label = n > 0 ? String(n) : 'GO!';
      if (label !== this.countdownText) {
        this.countdownText = label;
        Audio.sfx(label === 'GO!' ? 'go' : 'beep');
      }
      this.updateRev(dt);
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.countdownText = '';
        this.racers.forEach((r) => { r.frozen = false; });
        this.launchStart();
      }
      this.updateCamera(dt);
      return;
    }

    if (this.state === 'finished') {
      this.racers.forEach((r) => this.driveRacer(r, dt, true));
      this.updateCamera(dt);
      return;
    }

    this.raceElapsed += dt;
    this.applyRubberBand();
    if (this.fatalOffRoad) this.racers.forEach((r) => this.updateFall(r, dt));
    this.updateWind(dt);
    this.racers.forEach((r) => this.driveRacer(r, dt, false));
    this.racers.forEach((r) => this.releaseMiniTurbo(r));
    this.racers.forEach((r) => this.applyRoadFeatures(r));
    this.updateHazards(dt);
    this.updateMovers(dt);
    this.updateFog(dt);
    this.updateSkids(dt);
    this.shakeOnHit();

    // Collisions among all racers (falling karts are intangible).
    for (let i = 0; i < this.racers.length; i += 1) {
      for (let j = i + 1; j < this.racers.length; j += 1) {
        if (this.racers[i].falling || this.racers[j].falling) continue;
        this.resolveKartCollision(this.racers[i], this.racers[j]);
      }
    }
    this.racers.forEach((r) => { this.resolveRails(r, dt); this.resolveObstacles(r); this.clampToWorld(r); });

    this.racers.forEach((r) => this.rescueIfStuck(r, dt));
    this.racers.forEach((r) => this.updateProgress(r));
    this.updateItemBoxes(dt);
    this.updateCoins(dt);
    this.updateDraft(dt);
    this.racers.forEach((r) => this.coinDropCheck(r));
    this.updateProjectiles(dt);
    this.updateTraps(dt);

    this.computeOrder();

    // End when everyone has finished, or — once 60s have elapsed — as soon as
    // only one racer is still going (we stop waiting on a lone straggler).
    const unfinished = this.racers.reduce((c, r) => c + (r.finished ? 0 : 1), 0);
    if (unfinished === 0
      || (this.stragglerDeadline !== null && this.raceElapsed >= this.stragglerDeadline)
      || this.raceElapsed >= RACE_HARD_CAP) {
      this.endRace();
    }

    this.updateCamera(dt);
    this.drawDynamic();
  }

  // Rainbow Road: leaving the track means tumbling into space, then respawning
  // back on the road where you fell off.
  updateFall(kart, dt) {
    if (kart.finished) return;
    if (kart.falling) {
      kart.fallTimer -= dt;
      const t = Phaser.Math.Clamp(kart.fallTimer / 0.9, 0, 1);
      kart.sprite.setScale(Math.max(0.05, t)); // shrink as it falls away
      kart.sprite.rotation += dt * 14; // tumble
      kart.speed = 0;
      kart.vx = 0;
      kart.vy = 0;
      if (kart.fallTimer <= 0) {
        const r = kart.respawn;
        kart.x = r.x;
        kart.y = r.y;
        kart.heading = r.heading;
        kart.speed = 70;
        kart.knockX = 0;
        kart.knockY = 0;
        kart.falling = false;
        kart.sprite.setScale(1);
        kart.sprite.rotation = r.heading;
        this.burst(r.x, r.y, 0xffffff);
      }
      return;
    }
    if (!this.isOnRoad(kart.x, kart.y)) {
      // Fell off — start the tumble, and remember where to drop back in.
      const n = this.centerline.length;
      const idx = this.nearestIndex(kart.x, kart.y);
      const p = this.centerline[idx];
      const pn = this.centerline[(idx + 1) % n];
      kart.respawn = { x: p.x, y: p.y, heading: Math.atan2(pn.y - p.y, pn.x - p.x) };
      kart.falling = true;
      kart.fallTimer = 0.9;
      kart.speed = 0;
      if (!kart.isAI) Audio.sfx('hit');
    }
  }

  // --------------------------------------------------------- wind + hazards ---
  // Storm: a gusting crosswind whose strength swells/fades and direction wanders.
  updateWind(dt) {
    if (!this.theme.wind) { this.windX = 0; this.windY = 0; return; }
    this.windPhase += dt;
    const gust = 0.55 + 0.45 * Math.sin(this.windPhase * 0.9); // 0.1 .. 1.0
    const dir = Math.PI * 0.5 + Math.sin(this.windPhase * 0.25) * 0.8; // mostly sideways, wandering
    const mag = this.theme.wind * gust;
    this.windX = Math.cos(dir) * mag;
    this.windY = Math.sin(dir) * mag;
  }

  createHazards() {
    if (this.theme.hazard === 'geyser') this.createGeysers();
    if (this.theme.hazard === 'lightning') this.lightning = { timer: 2.6, strike: null };
  }

  // Volcano: lava geysers sit just off the racing line and erupt on a stagger.
  createGeysers() {
    const cl = this.centerline;
    const n = cl.length;
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const frac = 0.1 + ((i + 0.5) / count) * 0.8; // skip the start grid
      const idx = Math.round(frac * n) % n;
      const p = cl[idx];
      const pn = cl[(idx + 1) % n];
      let tx = pn.x - p.x; let ty = pn.y - p.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty; const ny = tx;
      const side = (i % 2) ? 1 : -1;
      const off = this.halfWidth * 0.5 * side; // sit to one side so the far lane stays threadable
      this.geysers.push({ x: p.x + nx * off, y: p.y + ny * off, r: 36, t: (i * 0.9) % 4.65, phase: 'idle' });
    }
  }

  updateHazards(dt) {
    const g = this.hazardGfx;
    if (g) g.clear();
    else return;

    // Geysers: idle (a dark vent) -> warn (growing telegraph) -> erupt (damage).
    const IDLE = 2.6; const WARN = 1.1; const ERUPT = 0.95; const CYCLE = IDLE + WARN + ERUPT;
    for (const gy of this.geysers) {
      gy.t = (gy.t + dt) % CYCLE;
      if (gy.t < IDLE) {
        gy.phase = 'idle';
        g.fillStyle(0x1a0d07, 0.9); g.fillCircle(gy.x, gy.y, gy.r * 0.5);
        g.fillStyle(0x3a1a0a, 0.85); g.fillCircle(gy.x, gy.y, gy.r * 0.32);
      } else if (gy.t < IDLE + WARN) {
        gy.phase = 'warn';
        const k = (gy.t - IDLE) / WARN;
        g.fillStyle(0xff7a1a, 0.18 + 0.25 * k); g.fillCircle(gy.x, gy.y, gy.r * (0.5 + 0.5 * k));
        g.lineStyle(2.5, 0xffd23f, 0.55 + 0.35 * Math.sin(this.elapsed * 30)); g.strokeCircle(gy.x, gy.y, gy.r);
      } else {
        gy.phase = 'erupt';
        const wob = 0.9 + 0.1 * Math.sin(this.elapsed * 40);
        g.fillStyle(0xff3b00, 0.85); g.fillCircle(gy.x, gy.y, gy.r * wob);
        g.fillStyle(0xffd23f, 0.9); g.fillCircle(gy.x, gy.y, gy.r * 0.55);
        for (const r of this.racers) {
          if (r.finished || r.falling || r.spunOut) continue;
          if ((r.x - gy.x) ** 2 + (r.y - gy.y) ** 2 < (gy.r + r.radius) ** 2 && r.hit()) {
            r.knockX += (r.x - gy.x) * 3; r.knockY += (r.y - gy.y) * 3;
            this.burst(r.x, r.y, 0xff7a1a);
            if (!r.isAI) Audio.sfx('hit');
          }
        }
      }
    }

    // Lightning: wait -> telegraph a locked spot for ~1.2s -> strike (spin-out).
    if (this.lightning) {
      const L = this.lightning;
      if (!L.strike) {
        L.timer -= dt;
        if (L.timer <= 0) {
          const live = this.racers.filter((r) => !r.finished && !r.falling);
          const tk = live.length ? live[Math.floor(Math.random() * live.length)] : null;
          L.strike = { x: tk ? tk.x : WORLD_W / 2, y: tk ? tk.y : WORLD_H / 2, warn: 1.2, flash: 0, r: 62 };
        }
      } else {
        const s = L.strike;
        if (s.warn > 0) {
          s.warn -= dt;
          const k = 1 - s.warn / 1.2;
          g.lineStyle(3, 0xcfe0ee, 0.6 + 0.4 * Math.sin(this.elapsed * 30));
          g.strokeCircle(s.x, s.y, s.r * (1.7 - 0.7 * k));
          g.lineStyle(2, 0xffffff, 0.5); g.strokeCircle(s.x, s.y, s.r);
          if (s.warn <= 0) {
            s.flash = 0.3;
            this.cameras.main.flash(140, 210, 225, 255);
            Audio.sfx('hit');
            for (const r of this.racers) {
              if (r.finished || r.falling) continue;
              if ((r.x - s.x) ** 2 + (r.y - s.y) ** 2 < (s.r + r.radius) ** 2) r.hit();
            }
            this.burst(s.x, s.y, 0xffffff);
          }
        } else {
          s.flash -= dt;
          g.fillStyle(0xffffff, Math.max(0, s.flash / 0.3) * 0.6); g.fillCircle(s.x, s.y, s.r);
          this.drawBolt(g, s.x, s.y);
          if (s.flash <= 0) { L.strike = null; L.timer = 2.2 + Math.random() * 1.8; }
        }
      }
    }
  }

  drawBolt(g, x, y) {
    g.lineStyle(4, 0xffffff, 0.95);
    g.beginPath();
    const top = y - 340;
    g.moveTo(x, top);
    const segs = 6;
    for (let i = 1; i <= segs; i += 1) {
      const ny = top + (340 * i) / segs;
      const nx = x + Math.sin(i * 1.7) * 20 * (1 - i / segs);
      g.lineTo(nx, ny);
    }
    g.strokePath();
  }

  driveRacer(kart, dt, finishedMode) {
    if (kart.falling) return; // tumbling through space — no control
    let input;
    if (kart.isAI || kart.finished || finishedMode) {
      input = this.aiControl(kart);
    } else if (kart === this.humans[0]) {
      input = this.readKeys(this.keysP1);
      let fire = this.p1ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (this.soloDualInput) {
        // Solo player may use either control set — merge them.
        const in2 = this.readKeys(this.keysP2);
        input = {
          steer: Phaser.Math.Clamp(input.steer + in2.steer, -1, 1),
          braking: input.braking || in2.braking,
          boosting: input.boosting || in2.boosting,
        };
        if (this.p2ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) fire = true;
        if (this.p2RightShiftFired) { fire = true; this.p2RightShiftFired = false; }
      }
      if (fire) this.useItem(kart);
    } else {
      input = this.readKeys(this.keysP2);
      let fire = this.p2ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (this.p2RightShiftFired) { fire = true; this.p2RightShiftFired = false; }
      if (fire) this.useItem(kart);
    }
    // AI uses items shortly after grabbing one.
    if (kart.isAI && kart.heldItem && !kart.spunOut && Math.random() < this.aiCfg.itemChance) this.useItem(kart);

    const onRoad = this.isOnRoad(kart.x, kart.y);
    kart.drive(dt, input.steer, input.braking, input.boosting, onRoad, this.terrainFor(kart, onRoad));
    // Crosswind shoves the kart sideways (Storm).
    if ((this.windX || this.windY) && !kart.falling) {
      kart.x += this.windX * dt;
      kart.y += this.windY * dt;
    }
    // Currents (Coral): flow zones push the kart along the seabed. Forward-flow
    // zones are free speed; cross-flow zones nudge you toward the wall.
    if (this.currents.length && !kart.falling && !kart.spunOut) {
      for (const cur of this.currents) {
        if ((kart.x - cur.x) ** 2 + (kart.y - cur.y) ** 2 < cur.r * cur.r) {
          kart.x += cur.dx * cur.strength * dt;
          kart.y += cur.dy * cur.strength * dt;
          break;
        }
      }
    }
  }

  // Surface descriptor for the kart this frame: off-road type, on-road grip
  // (wet worlds slide), and a cap multiplier for on-road mud slow-patches.
  terrainFor(kart, onRoad) {
    const t = this.theme;
    const terrain = {
      offRoad: t.offRoad || 'grass',
      grip: t.grip != null ? t.grip : 1,
      capMul: 1,
    };
    if (onRoad && this.slowPatches.length) {
      for (const s of this.slowPatches) {
        if ((kart.x - s.x) ** 2 + (kart.y - s.y) ** 2 < s.r * s.r) { terrain.capMul = 0.5; break; }
      }
    }
    // Dirt shortcut: counts as road but a bit slower + looser than tarmac.
    if (this.shortcut && this.minDistSqToCenterline(kart.x, kart.y) > this.halfWidth * this.halfWidth
        && this.onShortcut(kart.x, kart.y)) {
      terrain.capMul *= 0.82;
      terrain.grip = Math.min(terrain.grip, 0.9);
    }
    return terrain;
  }

  // Boost pads / speed strips give a brief boost; oil slicks spin you out.
  applyRoadFeatures(kart) {
    if (kart.finished || kart.falling || kart.spunOut) return;
    if (this.boostPads.length) {
      for (const pad of this.boostPads) {
        if ((kart.x - pad.x) ** 2 + (kart.y - pad.y) ** 2 < pad.r * pad.r) {
          if (kart.padBoostTimer <= 0) { this.burst(pad.x, pad.y, pad.tint); if (!kart.isAI) Audio.sfx('boost'); }
          kart.padBoostTimer = Math.max(kart.padBoostTimer, 0.45);
          break;
        }
      }
    }
    // Oil slicks spin you out — but only once per pass. After a hit the kart is
    // briefly immune and gets a shove along its travel direction, so it slides
    // off the slick instead of stopping dead on it and re-triggering forever.
    if (this.oilPatches.length && kart.oilImmune <= 0) {
      for (const oil of this.oilPatches) {
        if ((kart.x - oil.x) ** 2 + (kart.y - oil.y) ** 2 < oil.r * oil.r) {
          if (kart.hit()) { this.burst(kart.x, kart.y, 0x2a2440); if (!kart.isAI) Audio.sfx('hit'); }
          const sp = Math.hypot(kart.vx, kart.vy);
          const dx = sp > 20 ? kart.vx / sp : Math.cos(kart.heading);
          const dy = sp > 20 ? kart.vy / sp : Math.sin(kart.heading);
          kart.knockX += dx * 170; kart.knockY += dy * 170;
          kart.oilImmune = 2.6;
          break;
        }
      }
    }
    // Bounce pads (Carnival): springy bumpers fling you away from their centre.
    if (this.bouncePads.length && kart.bounceCd <= 0) {
      for (const pad of this.bouncePads) {
        const dx = kart.x - pad.x;
        const dy = kart.y - pad.y;
        if (dx * dx + dy * dy < pad.r * pad.r) {
          const d = Math.hypot(dx, dy) || 1;
          kart.knockX += (dx / d) * 320; kart.knockY += (dy / d) * 320;
          kart.padBoostTimer = Math.max(kart.padBoostTimer, 0.2);
          kart.bounceCd = 0.5;
          this.burst(pad.x, pad.y, 0xffe14d);
          if (!kart.isAI) Audio.sfx('bump');
          break;
        }
      }
    }
  }

  computeOrder() {
    const finished = this.racers.filter((r) => r.finished).sort((a, b) => a.place - b.place);
    const n = this.centerline.length;
    const distToNext = (k) => {
      const p = this.centerline[(k.idxPos + 1) % n];
      return (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
    };
    const live = this.racers.filter((r) => !r.finished).sort((a, b) => {
      const pd = this.progress(b) - this.progress(a);
      if (pd !== 0) return pd;
      return distToNext(a) - distToNext(b);
    });
    this.order = finished.concat(live);
    this.order.forEach((k, i) => { k.livePlace = i + 1; });
  }

  // A charged drift just popped → spark burst + a quick "boost" zip (humans only,
  // since only they drift). miniTurbo holds the tier (1 blue / 2 orange / 3 purple).
  releaseMiniTurbo(kart) {
    if (!kart.miniTurbo) return;
    const tier = TUNE.driftTiers[kart.miniTurbo - 1];
    const t = kart.miniTurbo;
    kart.miniTurbo = 0;
    this.burst(kart.x, kart.y, tier ? tier.color : 0xffffff);
    if (!kart.isAI) {
      Audio.sfx('boost');
      if (t >= 3) this.cameras.main.shake(140, 0.004); // a little punch on an ultra
    }
  }

  // Drift skid marks: dark dabs laid at the rear wheels of any drifting kart,
  // fading over ~2s. Bounded so the buffer never grows unbounded.
  updateSkids(dt) {
    for (const r of this.racers) {
      if (r.drifting && !r.falling) {
        const bx = r.x - Math.cos(r.heading) * 13;
        const by = r.y - Math.sin(r.heading) * 13;
        const nx = -Math.sin(r.heading);
        const ny = Math.cos(r.heading);
        this.skidMarks.push({ x: bx + nx * 8, y: by + ny * 8, life: 2 });
        this.skidMarks.push({ x: bx - nx * 8, y: by - ny * 8, life: 2 });
      }
    }
    if (this.skidMarks.length > 520) this.skidMarks.splice(0, this.skidMarks.length - 520);
    const g = this.skidGfx;
    g.clear();
    for (let i = this.skidMarks.length - 1; i >= 0; i -= 1) {
      const m = this.skidMarks[i];
      m.life -= dt;
      if (m.life <= 0) { this.skidMarks.splice(i, 1); continue; }
      g.fillStyle(0x101012, Math.min(0.45, m.life * 0.22));
      g.fillCircle(m.x, m.y, 3.6);
    }
  }

  // Gentle camera shake the instant a human kart gets spun out (shell, oil,
  // lightning, geyser — any source).
  shakeOnHit() {
    for (const h of this.humans) {
      const spun = h.spunOut;
      if (spun && !h._wasSpun) this.cameras.main.shake(220, 0.011);
      h._wasSpun = spun;
    }
  }

  drawDynamic() {
    const g = this.dynGfx;
    g.clear();
    for (const r of this.racers) {
      if (r.shieldTimer > 0) {
        g.lineStyle(3, 0x9fe8ff, 0.5 + 0.3 * Math.sin(this.elapsed * 14));
        g.strokeCircle(r.x, r.y, r.radius + 7);
      }

      const bx = r.x - Math.cos(r.heading) * 14;
      const by = r.y - Math.sin(r.heading) * 14;
      const nx = -Math.sin(r.heading);
      const ny = Math.cos(r.heading);

      // Slipstream: faint wind streaks flanking a kart that's charging a draft.
      if (r.drafting && r.draftTimer > 0.35 && !r.falling) {
        const a = 0.25 + 0.45 * Math.min(1, r.draftTimer);
        g.lineStyle(2, 0xeafcff, a);
        for (const side of [-1, 1]) {
          const ox = r.x + nx * side * 11; const oy = r.y + ny * side * 11;
          g.beginPath();
          g.moveTo(ox - Math.cos(r.heading) * 6, oy - Math.sin(r.heading) * 6);
          g.lineTo(ox + Math.cos(r.heading) * 16, oy + Math.sin(r.heading) * 16);
          g.strokePath();
        }
      }

      // Boost flames + a speed-stretch on the kart whenever it's boosting.
      const boosting = r.itemBoostTimer > 0 || r.padBoostTimer > 0 || r.boosting;
      if (!r.falling) {
        const stretched = boosting && !r.spunOut;
        const tx = stretched ? 1.16 : 1;
        const ty = stretched ? 0.9 : 1;
        r.sprite.scaleX += (tx - r.sprite.scaleX) * 0.25;
        r.sprite.scaleY += (ty - r.sprite.scaleY) * 0.25;
      }
      if (boosting && !r.falling) {
        const hot = r.itemBoostTimer > 0;
        const len = 18 + (Math.sin(this.elapsed * 50 + r.x) + 1) * 5;
        const tipx = bx - Math.cos(r.heading) * len;
        const tipy = by - Math.sin(r.heading) * len;
        g.fillStyle(hot ? 0xff7a1a : 0xffd23f, 0.85);
        g.fillTriangle(bx + nx * 7, by + ny * 7, bx - nx * 7, by - ny * 7, tipx, tipy);
        g.fillStyle(0xfff3b0, 0.9);
        g.fillTriangle(bx + nx * 4, by + ny * 4, bx - nx * 4, by - ny * 4, bx - Math.cos(r.heading) * (len * 0.55), by - Math.sin(r.heading) * (len * 0.55));
      }

      // Drift sparks at the rear wheels, colour-coded by charge tier.
      if (r.drifting && r.driftSparkTier > 0) {
        const col = TUNE.driftTiers[r.driftSparkTier - 1].color;
        for (const side of [-1, 1]) {
          const fl = 1.6 + Math.sin(this.elapsed * 40 + side) * 1.2;
          g.fillStyle(0xffffff, 0.9);
          g.fillCircle(bx + nx * side * 8, by + ny * side * 8, fl * 0.6);
          g.fillStyle(col, 0.9);
          g.fillCircle(bx + nx * side * 8, by + ny * side * 8, fl);
        }
      }

      // Invincibility star: flashing rainbow tint + a sparkly ring.
      if (r.starTimer > 0) {
        const hue = (this.elapsed * 1.4) % 1;
        r.sprite.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.8, 1).color);
        g.lineStyle(2, Phaser.Display.Color.HSVToRGB((hue + 0.5) % 1, 0.7, 1).color, 0.8);
        g.strokeCircle(r.x, r.y, r.radius + 5 + Math.sin(this.elapsed * 20) * 2);
      } else if (r.sprite.isTinted) {
        r.sprite.clearTint();
      }

      // Orbiting triple-shells circling the kart (defensive + ammo).
      if (r.orbitShells > 0) {
        for (let i = 0; i < r.orbitShells; i += 1) {
          const a = this.elapsed * 3.2 + (i * Math.PI * 2) / 3;
          const ox = r.x + Math.cos(a) * (r.radius + 13);
          const oy = r.y + Math.sin(a) * (r.radius + 13);
          g.fillStyle(0x14662b, 1); g.fillCircle(ox, oy, 6);
          g.fillStyle(0x3ecf5a, 1); g.fillCircle(ox, oy, 4.5);
          g.fillStyle(0xffffff, 0.6); g.fillCircle(ox - 1.5, oy - 1.5, 1.4);
        }
      }
    }
  }

  // --------------------------------------------------------- rendering -------
  drawTrack() {
    const t = this.theme;
    const g = this.add.graphics();
    g.setDepth(0);
    g.fillStyle(t.terrain, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    if (this.isRainbow) {
      this.obstacles = []; // space: nothing to bump into off-track
      this.drawStarfield(g);
      this.drawRainbowRoad(g);
      this.drawStartLine(g);
      return g;
    }

    this.drawThickLoop(g, this.centerline, this.roadWidth + 12, t.edge);
    this.drawThickLoop(g, this.centerline, this.roadWidth, t.road);
    this.drawShortcut(g);
    this.placeRoadFeatures(g);
    this.drawStartLine(g);
    this.drawRails(g);
    this.placeProps(g);
    return g;
  }

  drawStarfield(g) {
    // Deterministic-ish scatter of stars across the void.
    let seed = 1337;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 320; i += 1) {
      const x = rnd() * WORLD_W;
      const y = rnd() * WORLD_H;
      const r = rnd() * 1.8 + 0.6;
      const b = 0.5 + rnd() * 0.5;
      const tint = rnd() < 0.15 ? 0x9fd6f5 : (rnd() < 0.15 ? 0xffd9a0 : 0xffffff);
      g.fillStyle(tint, b);
      g.fillCircle(x, y, r);
    }
  }

  drawRainbowRoad(g) {
    const pts = this.centerline;
    const n = pts.length;
    const w = this.roadWidth;
    // Soft white glow under the road.
    this.drawThickLoop(g, pts, w + 16, 0xffffff);
    g.fillStyle(0xffffff, 1);
    // Rainbow body: hue cycles a few times around the loop.
    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const hue = ((i / n) * 3) % 1; // 3 full rainbow cycles around the lap
      const col = Phaser.Display.Color.HSVToRGB(hue, 0.85, 1).color;
      g.lineStyle(w, col, 1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
      g.fillStyle(col, 1);
      g.fillCircle(a.x, a.y, w / 2); // fill the joins so the band is continuous
    }
  }

  drawThickLoop(g, pts, width, color) {
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
    g.fillStyle(color, 1);
    const r = width / 2;
    for (let i = 0; i < pts.length; i += 1) g.fillCircle(pts[i].x, pts[i].y, r);
  }

  // The dirt shortcut: a packed-earth strip across the inside of a curve, with
  // direction chevrons so it reads as a faster (if rougher) line.
  drawShortcut(g) {
    const s = this.shortcut;
    if (!s) return;
    const w = this.shortcutHalf * 2;
    let tx = s.bx - s.ax; let ty = s.by - s.ay;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty; const ny = tx;
    g.lineStyle(w + 8, 0x000000, 0.22);
    g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.strokePath();
    g.lineStyle(w, 0x9c7b50, 1);
    g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.strokePath();
    g.fillStyle(0x9c7b50, 1); g.fillCircle(s.ax, s.ay, w / 2); g.fillCircle(s.bx, s.by, w / 2);
    g.fillStyle(0x7a5d38, 0.6);
    for (let f = 0.18; f < 0.85; f += 0.22) {
      const cx = s.ax + (s.bx - s.ax) * f; const cy = s.ay + (s.by - s.ay) * f;
      g.fillTriangle(cx - nx * 10 - tx * 7, cy - ny * 10 - ty * 7,
        cx + nx * 10 - tx * 7, cy + ny * 10 - ty * 7, cx + tx * 11, cy + ty * 11);
    }
  }

  drawRails(g) {
    const strokeAll = (width, color) => {
      g.lineStyle(width, color, 1);
      for (const s of this.rails) { g.beginPath(); g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); g.strokePath(); }
    };
    strokeAll(12, 0x222222);
    strokeAll(9, 0xe23b3b);
    strokeAll(2.5, 0xffffff);
    g.fillStyle(0x222222, 1);
    for (const s of this.rails) g.fillCircle(s.ax, s.ay, 5);
  }

  drawStartLine(g) {
    const pts = this.centerline;
    const a = pts[0];
    const b = pts[1];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty;
    const ny = tx;
    const cell = 22;
    const cols = Math.max(2, Math.floor((this.halfWidth * 2) / cell));
    const h = cell / 2;
    for (let row = 0; row < 2; row += 1) {
      for (let c = 0; c < cols; c += 1) {
        const black = (c + row) % 2 === 0;
        const along = (c - (cols - 1) / 2) * cell;
        const depth = (row - 0.5) * cell;
        const px = a.x + nx * along + tx * depth;
        const py = a.y + ny * along + ty * depth;
        g.fillStyle(black ? 0x000000 : 0xffffff, 1);
        g.fillPoints([
          { x: px - tx * h - nx * h, y: py - ty * h - ny * h },
          { x: px + tx * h - nx * h, y: py + ty * h - ny * h },
          { x: px + tx * h + nx * h, y: py + ty * h + ny * h },
          { x: px - tx * h + nx * h, y: py - ty * h + ny * h },
        ], true);
      }
    }
  }

  placeProps(g) {
    this.obstacles = [];
    const all = THEME_PROPS[this.theme.name] || [];
    const solids = all.filter((p) => p.solid);
    const flats = all.filter((p) => !p.solid);
    const placed = [];
    // Jungle is the most cluttered world; fatal-void worlds skip solids
    // (you fall before ever reaching an off-road obstacle).
    let solidTarget = 16;
    if (this.theme.name === 'Jungle') solidTarget = 28;
    else if (this.fatalOffRoad) solidTarget = 0;
    this.placePropGroup(g, solids, solidTarget, placed);
    this.placePropGroup(g, flats, 26, placed);
  }

  placePropGroup(g, props, target, placed) {
    if (!props.length) return;
    const totalWeight = props.reduce((sum, p) => sum + (p.weight || 1), 0);
    let count = 0;
    let attempts = 0;
    while (count < target && attempts < target * 50) {
      attempts += 1;
      let r = Math.random() * totalWeight;
      let prop = props[0];
      for (const p of props) { r -= p.weight || 1; if (r <= 0) { prop = p; break; } }
      const size = Phaser.Math.Between(prop.min, prop.max);
      const x = Phaser.Math.Between(70, WORLD_W - 70);
      const y = Phaser.Math.Between(70, WORLD_H - 70);
      const collR = prop.solid ? size * prop.rFactor : size * 0.5;
      const clear = this.halfWidth + collR + 24;
      if (this.minDistSqToCenterline(x, y) < clear * clear) continue;
      const myR = prop.solid ? collR : size * 0.45;
      let ok = true;
      for (const p of placed) {
        const need = p.r + myR + 12;
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < need * need) { ok = false; break; }
      }
      if (!ok) continue;
      prop.draw(g, x, y, size);
      placed.push({ x, y, r: myR });
      if (prop.solid) this.obstacles.push({ x, y, radius: collR });
      count += 1;
    }
  }

  // ---------------------------------------------------- per-world features ----
  // Boost pads / speed strips, oil slicks, and mud slow-patches, laid along the
  // racing line and drawn onto the road. They feed driveRacer/applyRoadFeatures.
  placeRoadFeatures(g) {
    const cl = this.centerline;
    const n = cl.length;
    const at = (frac, side, offFrac) => {
      const idx = Math.round(frac * n) % n;
      const p = cl[idx];
      const pn = cl[(idx + 1) % n];
      let tx = pn.x - p.x; let ty = pn.y - p.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty; const ny = tx;
      return { x: p.x + nx * side * this.halfWidth * offFrac, y: p.y + ny * side * this.halfWidth * offFrac, tx, ty };
    };

    if (this.theme.boostPads) {
      const tint = this.theme.name === 'Neon' ? 0x00e5ff : 0xff7a1a;
      const count = 9;
      for (let i = 0; i < count; i += 1) {
        const frac = 0.1 + ((i + 0.5) / count) * 0.8;
        const side = (i % 3 === 0) ? 0 : ((i % 2) ? 1 : -1);
        const pad = at(frac, side, 0.4);
        pad.r = 30; pad.tint = tint;
        this.boostPads.push(pad);
        this.drawBoostPad(g, pad, tint);
      }
    }

    if (this.theme.oilPatches) {
      const count = 8;
      for (let i = 0; i < count; i += 1) {
        const frac = 0.13 + ((i + 0.3) / count) * 0.8;
        const o = at(frac, (i % 2) ? -1 : 1, 0.5);
        o.r = 26;
        this.oilPatches.push(o);
        this.drawOilPatch(g, o);
      }
    }

    if (this.theme.slowPatches) {
      const count = 11;
      for (let i = 0; i < count; i += 1) {
        const frac = 0.1 + ((i + 0.5) / count) * 0.82;
        const s = at(frac, (i % 2) ? 1 : -1, 0.35);
        s.r = 30;
        this.slowPatches.push(s);
        this.drawSlowPatch(g, s);
      }
    }

    // Coral currents: forward-flow zones (free speed) and cross-flow zones
    // (push you toward a wall — counter-steer). Telegraphed by seabed chevrons.
    if (this.theme.currents) {
      const count = 7;
      for (let i = 0; i < count; i += 1) {
        const frac = 0.1 + ((i + 0.5) / count) * 0.8;
        const c = at(frac, 0, 0);
        const nx = -c.ty; const ny = c.tx;
        if (i % 3 === 0) { const s = (i % 2) ? 1 : -1; c.dx = nx * s; c.dy = ny * s; c.strength = 95; c.cross = true; }
        else { c.dx = c.tx; c.dy = c.ty; c.strength = 150; c.cross = false; }
        c.r = 40;
        this.currents.push(c);
        this.drawCurrent(g, c);
      }
    }

    // Carnival bounce pads: springy bumpers placed to the side of the line.
    if (this.theme.bouncePads) {
      const count = 6;
      for (let i = 0; i < count; i += 1) {
        const frac = 0.12 + ((i + 0.4) / count) * 0.78;
        const pad = at(frac, (i % 2) ? 1 : -1, 0.45);
        pad.r = 26;
        this.bouncePads.push(pad);
        this.drawBouncePad(g, pad);
      }
    }
  }

  drawBoostPad(g, pad, tint) {
    const { x, y, tx, ty } = pad;
    const nx = -ty; const ny = tx;
    g.fillStyle(0x0a0a12, 0.55); g.fillCircle(x, y, pad.r);
    g.fillStyle(tint, 0.95);
    for (let c = 0; c < 2; c += 1) {
      const bx = x + tx * (c * 13 - 9);
      const by = y + ty * (c * 13 - 9);
      g.fillTriangle(
        bx - nx * 15 - tx * 7, by - ny * 15 - ty * 7,
        bx + nx * 15 - tx * 7, by + ny * 15 - ty * 7,
        bx + tx * 11, by + ty * 11,
      );
    }
  }

  drawOilPatch(g, o) {
    g.fillStyle(0x05040a, 0.85); g.fillCircle(o.x, o.y, o.r);
    g.fillStyle(0x3a2d6b, 0.5); g.fillCircle(o.x - o.r * 0.25, o.y - o.r * 0.2, o.r * 0.5);
    g.fillStyle(0x6f4fb0, 0.4); g.fillCircle(o.x + o.r * 0.2, o.y + o.r * 0.15, o.r * 0.35);
  }

  drawSlowPatch(g, s) {
    g.fillStyle(0x3a2a16, 0.85); g.fillCircle(s.x, s.y, s.r);
    g.fillStyle(0x55401f, 0.7); g.fillCircle(s.x - s.r * 0.3, s.y + s.r * 0.2, s.r * 0.55);
    g.fillStyle(0x241809, 0.6); g.fillCircle(s.x + s.r * 0.25, s.y - s.r * 0.25, s.r * 0.4);
  }

  // Seabed flow marker: a faint disc + chevrons pointing the way the water pushes.
  drawCurrent(g, c) {
    const dx = c.dx; const dy = c.dy;
    const nx = -dy; const ny = dx;
    const col = c.cross ? 0xffd23f : 0x7ffff0;
    g.fillStyle(col, 0.12); g.fillCircle(c.x, c.y, c.r);
    g.lineStyle(3, col, 0.8);
    for (let k = 0; k < 3; k += 1) {
      const bx = c.x + dx * (k * 13 - 16);
      const by = c.y + dy * (k * 13 - 16);
      g.beginPath();
      g.moveTo(bx - nx * 11 - dx * 7, by - ny * 11 - dy * 7);
      g.lineTo(bx + dx * 7, by + dy * 7);
      g.lineTo(bx + nx * 11 - dx * 7, by + ny * 11 - dy * 7);
      g.strokePath();
    }
  }

  // Carnival bumper: bright concentric springy rings.
  drawBouncePad(g, pad) {
    g.fillStyle(0xffffff, 0.95); g.fillCircle(pad.x, pad.y, pad.r);
    g.fillStyle(0xe2403a, 1); g.fillCircle(pad.x, pad.y, pad.r * 0.78);
    g.fillStyle(0xffd23f, 1); g.fillCircle(pad.x, pad.y, pad.r * 0.5);
    g.fillStyle(0xffffff, 1); g.fillCircle(pad.x, pad.y, pad.r * 0.22);
    g.lineStyle(2, 0x9a2a25, 1); g.strokeCircle(pad.x, pad.y, pad.r);
  }

  // -------------------------------------------------------- movers (desert) ----
  createMovers() {
    if (this.theme.movers !== 'tumbleweed') return;
    for (let i = 0; i < 6; i += 1) {
      const m = { sprite: this.add.image(0, 0, 'tumbleweed').setDepth(9).setScale(0.9), spin: 0 };
      this.respawnMover(m, 0.12 + (i / 6) * 0.76);
      this.movers.push(m);
    }
  }

  // Park a tumbleweed just off one side of the road, rolling across to the other.
  respawnMover(m, frac) {
    const cl = this.centerline;
    const n = cl.length;
    const f = frac != null ? frac : Math.random();
    const idx = Math.round(f * n) % n;
    const p = cl[idx];
    const pn = cl[(idx + 1) % n];
    let tx = pn.x - p.x; let ty = pn.y - p.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty; const ny = tx;
    const side = Math.random() < 0.5 ? 1 : -1;
    const speed = 70 + Math.random() * 50;
    m.x = p.x + nx * side * (this.halfWidth + 36);
    m.y = p.y + ny * side * (this.halfWidth + 36);
    m.vx = -nx * side * speed + tx * (Math.random() - 0.5) * 40;
    m.vy = -ny * side * speed + ty * (Math.random() - 0.5) * 40;
    m.r = 14;
    m.life = 0;
  }

  updateMovers(dt) {
    for (const m of this.movers) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life += dt;
      m.spin += dt * 7;
      m.sprite.setPosition(m.x, m.y);
      m.sprite.rotation = m.spin;
      // Bounce off rails so they tumble believably along the canyon.
      for (const s of this.rails) {
        const c = closestOnSeg(m.x, m.y, s.ax, s.ay, s.bx, s.by);
        const dx = m.x - c.x; const dy = m.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < m.r + 6 && dist > 0.0001) {
          const nx = dx / dist; const ny = dy / dist;
          m.x = c.x + nx * (m.r + 6); m.y = c.y + ny * (m.r + 6);
          const vd = m.vx * nx + m.vy * ny;
          if (vd < 0) { m.vx -= 2 * vd * nx; m.vy -= 2 * vd * ny; }
        }
      }
      // Gentle bump on contact — knock the kart, shave its speed (no spin-out).
      for (const r of this.racers) {
        if (r.finished || r.falling) continue;
        const dx = r.x - m.x; const dy = r.y - m.y;
        const dist = Math.hypot(dx, dy);
        if (dist < r.radius + m.r && dist > 0.0001) {
          const nx = dx / dist; const ny = dy / dist;
          r.knockX += nx * 150; r.knockY += ny * 150;
          r.speed *= 0.78;
          m.vx -= nx * 120; m.vy -= ny * 120; // tumbleweed deflects away
          if (!r.isAI) Audio.sfx('bump');
        }
      }
      // Drifted well clear of the track (or stalled) → roll a fresh one in.
      if (m.life > 1 && this.minDistSqToCenterline(m.x, m.y) > (this.halfWidth + 80) ** 2) this.respawnMover(m);
      if (m.x < -40 || m.x > WORLD_W + 40 || m.y < -40 || m.y > WORLD_H + 40) this.respawnMover(m);
    }
  }

  // ---------------------------------------------------------- fog (haunted) ----
  createFog() {
    if (!this.theme.fogPatches) return;
    const cl = this.centerline;
    const n = cl.length;
    for (let i = 0; i < 6; i += 1) {
      const idx = Math.round((0.08 + (i / 6) * 0.84) * n) % n;
      const p = cl[idx];
      this.fogPatches.push({ ax: p.x, ay: p.y, r: 78, phase: i * 1.3 });
    }
  }

  updateFog(dt) {
    const g = this.fogGfx;
    if (!g) return;
    g.clear();
    if (!this.fogPatches.length) return;
    this.fogPhase = (this.fogPhase || 0) + dt;
    for (const f of this.fogPatches) {
      const x = f.ax + Math.sin(this.fogPhase * 0.3 + f.phase) * 34;
      const y = f.ay + Math.cos(this.fogPhase * 0.23 + f.phase) * 28;
      g.fillStyle(0xb9c4d8, 0.16); g.fillCircle(x, y, f.r);
      g.fillStyle(0xc7d2e4, 0.18); g.fillCircle(x - f.r * 0.2, y, f.r * 0.72);
      g.fillStyle(0xdfe6f2, 0.2); g.fillCircle(x + f.r * 0.18, y - f.r * 0.1, f.r * 0.46);
    }
  }
}
