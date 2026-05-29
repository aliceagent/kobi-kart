import Phaser from 'phaser';
import Kart, { TUNE } from '../Kart.js';
import { generateTrack } from '../TrackGenerator.js';
import { THEME_PROPS } from '../Props.js';
import { ROSTER, POINTS, LAPS, AI_DIFFICULTY } from '../GrandPrix.js';
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
  1: { trap: 4, shield: 3, greenShell: 2 },
  2: { greenShell: 3, trap: 2, shield: 1, boost: 2, redShell: 1 },
  3: { boost: 3, greenShell: 2, redShell: 2, trap: 1, shield: 1 },
  4: { boost: 4, redShell: 3, shield: 1, greenShell: 1 },
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
    const themeName = this.gp.themeOrder[this.gp.raceIndex];

    const track = generateTrack(WORLD_W, WORLD_H, themeName);
    this.centerline = track.centerline;
    this.roadWidth = track.roadWidth;
    this.halfWidth = track.halfWidth;
    this.rails = track.rails;
    this.theme = track.theme;
    this.start = track.start;

    makeGameTextures(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));

    this.trackGfx = this.drawTrack();
    this.createRacers();
    this.createItemBoxes();

    this.projectiles = [];
    this.traps = [];
    this.dynGfx = this.add.graphics().setDepth(15); // shields
    this.particles = this.add.particles(0, 0, 'spark', {
      lifespan: 450, speed: { min: 30, max: 120 }, scale: { start: 0.7, end: 0 },
      emitting: false, gravityY: 0,
    }).setDepth(12);

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
    Audio.startMusic(this.theme.name);

    // HUD overlay scene (isolated from the world camera's zoom).
    this.scene.launch('UIScene', { race: this });
    this.events.once('shutdown', () => {
      this.scene.stop('UIScene');
      Audio.stopMusic();
    });
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

    this.racers = [];
    this.humans = [];
    ROSTER.forEach((r, i) => {
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
      kart.idxPos = idx;
      kart.halfway = false;
      this.racers.push(kart);
      if (!kart.isAI) this.humans.push(kart);
    });

    // Human control keys.
    const KC = Phaser.Input.Keyboard.KeyCodes;
    if (this.humans[0]) {
      this.keysP1 = this.input.keyboard.addKeys({
        left: KC.A, right: KC.D, brake: KC.S, boost: KC.W,
      });
      // P1 launches an item with E or Space.
      this.p1ItemKeys = [this.input.keyboard.addKey(KC.E), this.input.keyboard.addKey(KC.SPACE)];
    }
    if (this.humans[1]) {
      this.keysP2 = this.input.keyboard.addKeys({
        left: KC.LEFT, right: KC.RIGHT, brake: KC.DOWN, boost: KC.UP,
      });
      // P2 launches an item with \ or / ...
      this.p2ItemKeys = [this.input.keyboard.addKey(KC.BACK_SLASH), this.input.keyboard.addKey(KC.FORWARD_SLASH)];
      // ...or the RIGHT Shift specifically (edge-triggered via the DOM event).
      this.p2RightShiftFired = false;
      this.input.keyboard.on('keydown-SHIFT', (e) => { if (e.location === 2) this.p2RightShiftFired = true; });
    }
  }

  createItemBoxes() {
    const n = this.centerline.length;
    this.itemBoxes = [];
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const idx = Math.round(((i + 0.5) * n) / count) % n;
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
    return this.minDistSqToCenterline(x, y) <= this.halfWidth * this.halfWidth;
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
    if (kart.finished) { kart.stuckTimer = 0; return; }
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
      kart.lap += 1;
      if (kart.lap >= LAPS) this.finishRacer(kart);
      else if (!kart.isAI) Audio.sfx('lap');
    }
  }

  finishRacer(kart) {
    if (kart.finished) return;
    kart.finished = true;
    this.finishCount += 1;
    kart.place = this.finishCount;
    if (!kart.isAI) Audio.sfx('finish');
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
    if (place === 4 && Math.random() < 0.1) { kart.heldItem = 'blueShell'; return; }
    const weights = ITEM_WEIGHTS[place];
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = Math.random() * total;
    let chosen = 'boost';
    for (const k in weights) { r -= weights[k]; if (r <= 0) { chosen = k; break; } }
    kart.heldItem = chosen;
  }

  useItem(kart) {
    const item = kart.heldItem;
    if (!item) return;
    kart.heldItem = null;
    Audio.sfx('item');
    if (item === 'boost') { kart.itemBoostTimer = 1.6; Audio.sfx('boost'); this.burst(kart.x, kart.y, 0xffd23f); }
    else if (item === 'shield') { kart.shieldTimer = 6; }
    else if (item === 'greenShell') this.spawnProjectile(kart, 'green');
    else if (item === 'redShell') this.spawnProjectile(kart, 'red');
    else if (item === 'blueShell') this.spawnProjectile(kart, 'blue');
    else if (item === 'trap') this.spawnTrap(kart);
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
    if (type === 'green') { speed = 480 + kart.speed; turnRate = 0; life = 3; }
    else if (type === 'red') { speed = 430; turnRate = 3.8; life = 5; }
    else { speed = 473; turnRate = 4.6; life = 11; } // blue: 10% faster, tighter turns, long reach

    this.projectiles.push({
      sprite, x: sprite.x, y: sprite.y,
      vx: ox * speed, vy: oy * speed, speed,
      owner: kart, homing, blue, turnRate, life,
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

  // True if a shell at (x,y) with radius r is touching a guard rail or a solid
  // off-road prop.
  hitsEnvironment(x, y, r) {
    for (const o of this.obstacles) {
      if ((x - o.x) ** 2 + (y - o.y) ** 2 < (r + o.radius) ** 2) return true;
    }
    const railReach = r + 6; // rails are ~12px thick
    for (const s of this.rails) {
      if (distToSegSq(x, y, s.ax, s.ay, s.bx, s.by) < railReach * railReach) return true;
    }
    return false;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.life -= dt;

      // Red shells chase along the racing line (so they stay on the road)
      // rather than cutting straight at the target. Limited turn rate + 5s
      // lifetime keep them escapable by boosting away. If one does stray off
      // the track, rough terrain slows it down just like a kart.
      if (p.homing) {
        const n = this.centerline.length;
        const onRoad = this.isOnRoad(p.x, p.y);
        const idx = this.nearestIndex(p.x, p.y);
        const look = onRoad ? 5 : 2; // off-road: aim closer to cut back onto the track
        const aim = this.centerline[(idx + look) % n];
        const desired = Math.atan2(aim.y - p.y, aim.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        const turn = Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(desired - cur), -p.turnRate * dt, p.turnRate * dt);
        const a = cur + turn;
        const eff = onRoad ? p.speed : p.speed * 0.5; // rough-terrain penalty
        p.vx = Math.cos(a) * eff;
        p.vy = Math.sin(a) * eff;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.sprite.setPosition(p.x, p.y);
      if (p.homing) p.sprite.rotation = Math.atan2(p.vy, p.vx);
      else p.sprite.rotation += dt * 12;
      let dead = p.life <= 0 || p.x < 0 || p.x > WORLD_W || p.y < 0 || p.y > WORLD_H;
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
      // Green/red shells shatter on walls and solid props. Blue shells are
      // relentless — they plough through everything on the way to the leader.
      if (!dead && !p.blue && this.hitsEnvironment(p.x, p.y, 9)) {
        this.burst(p.x, p.y, p.homing ? 0xff8a8a : 0x9bf0a6);
        Audio.sfx('bump');
        dead = true;
      }
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
    const pad = 300;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const targetZoom = Phaser.Math.Clamp(
      Math.min(cam.width / (maxX - minX), cam.height / (maxY - minY)),
      this.minZoom, view.length > 1 ? 1.1 : 0.95
    );
    const t = 1 - Math.exp(-6 * dt);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, t));
    this.camCenter.x = Phaser.Math.Linear(this.camCenter.x, (minX + maxX) / 2, t);
    this.camCenter.y = Phaser.Math.Linear(this.camCenter.y, (minY + maxY) / 2, t);
    cam.centerOn(this.camCenter.x, this.camCenter.y);
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
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.countdownText = '';
        this.racers.forEach((r) => { r.frozen = false; });
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
    this.racers.forEach((r) => this.driveRacer(r, dt, false));

    // Collisions among all racers.
    for (let i = 0; i < this.racers.length; i += 1) {
      for (let j = i + 1; j < this.racers.length; j += 1) {
        this.resolveKartCollision(this.racers[i], this.racers[j]);
      }
    }
    this.racers.forEach((r) => { this.resolveRails(r, dt); this.resolveObstacles(r); this.clampToWorld(r); });

    this.racers.forEach((r) => this.rescueIfStuck(r, dt));
    this.racers.forEach((r) => this.updateProgress(r));
    this.updateItemBoxes(dt);
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

  driveRacer(kart, dt, finishedMode) {
    let input;
    if (kart.isAI || kart.finished || finishedMode) {
      input = this.aiControl(kart);
    } else if (kart === this.humans[0]) {
      input = this.readKeys(this.keysP1);
      if (this.p1ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.useItem(kart);
    } else {
      input = this.readKeys(this.keysP2);
      let fire = this.p2ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (this.p2RightShiftFired) { fire = true; this.p2RightShiftFired = false; }
      if (fire) this.useItem(kart);
    }
    // AI uses items shortly after grabbing one.
    if (kart.isAI && kart.heldItem && !kart.spunOut && Math.random() < this.aiCfg.itemChance) this.useItem(kart);

    kart.drive(dt, input.steer, input.braking, input.boosting, this.isOnRoad(kart.x, kart.y));
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

  drawDynamic() {
    const g = this.dynGfx;
    g.clear();
    for (const r of this.racers) {
      if (r.shieldTimer > 0) {
        g.lineStyle(3, 0x9fe8ff, 0.5 + 0.3 * Math.sin(this.elapsed * 14));
        g.strokeCircle(r.x, r.y, r.radius + 7);
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
    this.drawThickLoop(g, this.centerline, this.roadWidth + 12, t.edge);
    this.drawThickLoop(g, this.centerline, this.roadWidth, t.road);
    this.drawStartLine(g);
    this.drawRails(g);
    this.placeProps(g);
    return g;
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
    this.placePropGroup(g, solids, 16, placed);
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
}
