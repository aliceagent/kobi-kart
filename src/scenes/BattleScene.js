import Phaser from 'phaser';
import Kart from '../Kart.js';
import { ROSTER, kartClass } from '../GrandPrix.js';
import { makeKartTexture, makeGameTextures } from '../textures.js';
import * as Audio from '../Audio.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';

// Balloon Battle: a single-screen walled arena (no laps). 2 players + AI fill a
// 4-kart field; each kart has 3 balloons; a spin-out hit pops one; last kart
// with balloons wins. Reuses Kart, the item textures, the SFX/engine audio and
// the kart classes — but is self-contained (no track/centerline/lap logic).

const ARENA = { x: 36, y: 86, w: 888, h: 518 }; // play field inside the walls
const START_BALLOONS = 3;
const ITEM_WEIGHTS = { boost: 3, greenShell: 3, redShell: 2, trap: 2, shield: 2, star: 1 };

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    const cfg = (data && data.picks) ? data : (this.registry.get('battle') || {});
    this.playerCount = cfg.playerCount || 2;
    this.picks = (cfg.picks && cfg.picks.length) ? cfg.picks.slice() : [0, 1];
  }

  create() {
    const W = this.scale.width;
    fadeIn(this);
    makeGameTextures(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));

    this.drawArena();

    this.skidGfx = this.add.graphics().setDepth(1);
    this.itemBoxes = [];
    this.projectiles = [];
    this.traps = [];
    this.dynGfx = this.add.graphics().setDepth(15);
    this.hudGfx = this.add.graphics().setDepth(30);
    this.particles = this.add.particles(0, 0, 'spark', {
      lifespan: 500, speed: { min: 40, max: 160 }, scale: { start: 0.8, end: 0 }, emitting: false,
    }).setDepth(16);

    this.createKarts();
    this.createItemBoxes(9);
    this.setupKeys();

    this.banner = this.add.text(W / 2, this.scale.height * 0.42, '', {
      fontFamily: 'monospace', fontSize: '72px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(40);

    this.state = 'countdown';
    this.countdown = 3.2;
    this.countText = '';
    this.elapsed = 0;

    Audio.resumeAudio();
    Audio.startMusic('Carnival');
    this.engineOn = false;
    this.humans.forEach((h) => Audio.startEngine(h.id));
    this.engineOn = true;
    this.events.once('shutdown', () => { Audio.stopMusic(); Audio.stopAllEngines(); });

    this.add.text(W / 2, this.scale.height - 16,
      'P1 A/D + E/Space   ·   P2 ←/→ + RShift   ·   pop all 3 balloons to win!', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(31).setAlpha(0.8);

    this.input.keyboard.on('keydown-ESC', () => this.leave('TitleScene'));
    addMuteButton(this);
  }

  leave(key, data) {
    transitionTo(this, key, data);
  }

  // ----------------------------------------------------------------- arena ----
  drawArena() {
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.add.graphics().setDepth(0);
    // Grass field.
    g.fillStyle(0x6fb84a, 1); g.fillRect(0, 0, W, H);
    let seed = 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 90; i += 1) {
      g.fillStyle(rnd() < 0.5 ? 0x66ad44 : 0x7cc657, 0.5);
      g.fillEllipse(rnd() * W, rnd() * H, 24 + rnd() * 30, 12 + rnd() * 14);
    }
    // Arena floor.
    g.fillStyle(0x000000, 0.12); g.fillRoundedRect(ARENA.x + 6, ARENA.y + 8, ARENA.w, ARENA.h, 22);
    g.fillStyle(0x46474f, 1); g.fillRoundedRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 22);
    g.fillStyle(0xffffff, 0.05); g.fillRoundedRect(ARENA.x + 8, ARENA.y + 8, ARENA.w - 16, ARENA.h * 0.4, 16);
    // Red/white kerb wall around the arena.
    this.drawKerbWall(g);
    // Title banner up top (small — the top strip also holds the balloon HUD).
    this.add.text(W / 2, 20, '⚔  BALLOON BATTLE', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2);
  }

  drawKerbWall(g) {
    const seg = 26;
    const stripe = (x, y, w, h, i) => { g.fillStyle(i % 2 ? 0xffffff : 0xe23b3b, 1); g.fillRect(x, y, w, h); };
    let i = 0;
    for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += seg) { stripe(x, ARENA.y - 8, Math.min(seg, ARENA.x + ARENA.w - x), 8, i); stripe(x, ARENA.y + ARENA.h, Math.min(seg, ARENA.x + ARENA.w - x), 8, i); i += 1; }
    i = 0;
    for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += seg) { stripe(ARENA.x - 8, y, 8, Math.min(seg, ARENA.y + ARENA.h - y), i); stripe(ARENA.x + ARENA.w, y, 8, Math.min(seg, ARENA.y + ARENA.h - y), i); i += 1; }
  }

  // ----------------------------------------------------------------- karts ----
  createKarts() {
    // Humans first (their picks), then AI fillers from the rest of the palette.
    const used = new Set(this.picks.slice(0, this.playerCount));
    const pool = ROSTER.map((_, i) => i).filter((i) => !used.has(i));
    for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const lineup = this.picks.slice(0, this.playerCount).concat(pool).slice(0, 4);

    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    this.karts = [];
    this.humans = [];
    lineup.forEach((idx, i) => {
      const r = ROSTER[idx];
      const a = (i / lineup.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * 230;
      const y = cy + Math.sin(a) * 150;
      const kart = new Kart(this, x, y, a + Math.PI, `kart_${r.id}`);
      kart.id = r.id; kart.name = r.name; kart.color = r.color;
      kart.isAI = i >= this.playerCount;
      const klass = kartClass(idx);
      kart.stats = { speed: klass.speed, accel: klass.accel, handling: klass.handling, weight: klass.weight };
      kart.balloons = START_BALLOONS;
      kart.battleInvuln = 0;
      kart.out = false;
      kart.aiTimer = 0;
      this.karts.push(kart);
      if (!kart.isAI) this.humans.push(kart);
    });
    this.soloDualInput = this.playerCount === 1;
  }

  createItemBoxes(count) {
    for (let i = 0; i < count; i += 1) {
      const cols = 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = ARENA.x + ARENA.w * (0.25 + col * 0.25);
      const y = ARENA.y + ARENA.h * (0.28 + row * 0.22);
      const sprite = this.add.image(x, y, 'itembox').setDepth(8);
      this.itemBoxes.push({ x, y, sprite, active: true, timer: 0 });
    }
  }

  setupKeys() {
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.keysP1 = this.input.keyboard.addKeys({ left: KC.A, right: KC.D, brake: KC.S, boost: KC.W });
    this.p1ItemKeys = [this.input.keyboard.addKey(KC.E), this.input.keyboard.addKey(KC.SPACE)];
    this.keysP2 = this.input.keyboard.addKeys({ left: KC.LEFT, right: KC.RIGHT, brake: KC.DOWN, boost: KC.UP });
    this.p2ItemKeys = [this.input.keyboard.addKey(KC.BACK_SLASH), this.input.keyboard.addKey(KC.FORWARD_SLASH)];
    this.p2RightShiftFired = false;
    this.input.keyboard.on('keydown-SHIFT', (e) => { if (e.location === 2) this.p2RightShiftFired = true; });
  }

  readKeys(keys) {
    let steer = 0;
    if (keys.left.isDown) steer -= 1;
    if (keys.right.isDown) steer += 1;
    return { steer, braking: keys.brake.isDown, boosting: keys.boost.isDown };
  }

  // ---------------------------------------------------------------- update ----
  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      const label = n > 0 ? String(n) : 'GO!';
      if (label !== this.countText) { this.countText = label; Audio.sfx(label === 'GO!' ? 'go' : 'beep'); this.banner.setText(label); }
      if (this.countdown <= 0) { this.state = 'battle'; this.time.delayedCall(500, () => this.banner.setText('')); }
      this.karts.forEach((k) => { k.frozen = true; });
      this.drawHUD();
      this.drawDynamic();
      return;
    }
    if (this.state === 'over') { this.drawHUD(); this.drawDynamic(); return; }

    this.karts.forEach((k) => { if (!k.out) k.frozen = false; if (k.battleInvuln > 0) k.battleInvuln -= dt; });
    this.karts.forEach((k) => this.driveKart(k, dt));
    this.karts.forEach((k) => this.releaseMiniTurbo(k));
    this.updateItemBoxes(dt);
    this.updateProjectiles(dt);
    this.updateTraps(dt);
    this.resolveCollisions();
    this.updateEngines();
    this.updateSkids(dt);
    this.drawDynamic();
    this.drawHUD();
  }

  driveKart(kart, dt) {
    if (kart.out) return;
    let input;
    let fire = false;
    if (kart.isAI) {
      input = this.aiControl(kart, dt);
      if (kart.heldItem && input.fire) fire = true;
    } else if (kart === this.humans[0]) {
      input = this.readKeys(this.keysP1);
      fire = this.p1ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (this.soloDualInput) {
        const in2 = this.readKeys(this.keysP2);
        input = { steer: Phaser.Math.Clamp(input.steer + in2.steer, -1, 1), braking: input.braking || in2.braking, boosting: input.boosting || in2.boosting };
        if (this.p2ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) fire = true;
        if (this.p2RightShiftFired) { fire = true; this.p2RightShiftFired = false; }
      }
    } else {
      input = this.readKeys(this.keysP2);
      fire = this.p2ItemKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (this.p2RightShiftFired) { fire = true; this.p2RightShiftFired = false; }
    }
    if (fire) this.useItem(kart);
    kart.drive(dt, input.steer, input.braking, input.boosting, true, {});
    this.clampToArena(kart);
  }

  // Simple battle AI: grab the nearest item box, then hunt the nearest rival and
  // fire when roughly facing them. Wander a touch so it isn't robotic.
  aiControl(kart, dt) {
    kart.aiTimer -= dt;
    let tx; let ty; let wantFire = false;
    if (!kart.heldItem) {
      const box = this.nearest(kart, this.itemBoxes.filter((b) => b.active));
      const t = box || this.center();
      tx = t.x; ty = t.y;
    } else {
      const foe = this.nearest(kart, this.karts.filter((k) => k !== kart && !k.out));
      const t = foe || this.center();
      tx = t.x; ty = t.y;
      const ang = Math.atan2(ty - kart.y, tx - kart.x);
      let d = Phaser.Math.Angle.Wrap(ang - kart.heading);
      if (Math.abs(d) < 0.3 && Math.random() < 0.04) wantFire = true;
    }
    const desired = Math.atan2(ty - kart.y, tx - kart.x);
    let diff = Phaser.Math.Angle.Wrap(desired - kart.heading);
    const steer = Phaser.Math.Clamp(diff * 2.2, -1, 1);
    return { steer, braking: false, boosting: Math.abs(diff) < 0.5, fire: wantFire };
  }

  nearest(kart, list) {
    let best = null; let bd = Infinity;
    for (const o of list) { const d = (o.x - kart.x) ** 2 + (o.y - kart.y) ** 2; if (d < bd) { bd = d; best = o; } }
    return best;
  }

  center() { return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 }; }

  // Keep karts inside the walls; bounce their velocity off the edge.
  clampToArena(kart) {
    const r = kart.radius;
    const l = ARENA.x + r; const rt = ARENA.x + ARENA.w - r;
    const tp = ARENA.y + r; const bt = ARENA.y + ARENA.h - r;
    if (kart.x < l) { kart.x = l; if (kart.vx < 0) kart.vx *= -0.4; kart.speed *= 0.7; }
    else if (kart.x > rt) { kart.x = rt; if (kart.vx > 0) kart.vx *= -0.4; kart.speed *= 0.7; }
    if (kart.y < tp) { kart.y = tp; if (kart.vy < 0) kart.vy *= -0.4; kart.speed *= 0.7; }
    else if (kart.y > bt) { kart.y = bt; if (kart.vy > 0) kart.vy *= -0.4; kart.speed *= 0.7; }
  }

  releaseMiniTurbo(kart) {
    if (!kart.miniTurbo) return;
    const t = kart.miniTurbo; kart.miniTurbo = 0;
    if (!kart.isAI) Audio.sfx('drift', t);
  }

  updateEngines() {
    if (!this.engineOn) return;
    for (const h of this.humans) {
      if (h.out) { Audio.updateEngine(h.id, 0, false); continue; }
      const sf = Math.max(0, h.speed) / 340;
      Audio.updateEngine(h.id, sf, h.boosting || h.itemBoostTimer > 0 || h.padBoostTimer > 0);
    }
  }

  // ---------------------------------------------------------------- items -----
  giveItem(kart) {
    let total = 0; for (const k in ITEM_WEIGHTS) total += ITEM_WEIGHTS[k];
    let r = Math.random() * total; let chosen = 'boost';
    for (const k in ITEM_WEIGHTS) { r -= ITEM_WEIGHTS[k]; if (r <= 0) { chosen = k; break; } }
    kart.heldItem = chosen;
  }

  useItem(kart) {
    const item = kart.heldItem;
    if (!item || kart.out) return;
    Audio.sfx('item');
    if (item === 'boost') { kart.itemBoostTimer = 1.4; Audio.sfx('boost'); this.burst(kart.x, kart.y, 0xffd23f); }
    else if (item === 'shield') { kart.shieldTimer = 6; Audio.sfx('shield'); }
    else if (item === 'star') { kart.starTimer = 5; Audio.sfx('star'); this.burst(kart.x, kart.y, 0xffe14d); }
    else if (item === 'greenShell') this.spawnProjectile(kart, 'green');
    else if (item === 'redShell') this.spawnProjectile(kart, 'red');
    else if (item === 'trap') this.spawnTrap(kart);
    kart.heldItem = null;
  }

  spawnProjectile(kart, type) {
    if (!kart.isAI) Audio.sfx('shell');
    const ox = Math.cos(kart.heading); const oy = Math.sin(kart.heading);
    const spd = type === 'red' ? 380 : 460;
    const sprite = this.add.image(kart.x + ox * 26, kart.y + oy * 26, `shell_${type}`).setDepth(13);
    this.projectiles.push({
      sprite, x: sprite.x, y: sprite.y, vx: ox * spd, vy: oy * spd, speed: spd,
      owner: kart, homing: type === 'red', turnRate: 4.2, life: 5,
      target: type === 'red' ? this.nearest(kart, this.karts.filter((k) => k !== kart && !k.out)) : null,
    });
  }

  spawnTrap(kart) {
    if (!kart.isAI) Audio.sfx('oildrop');
    const x = kart.x - Math.cos(kart.heading) * 28;
    const y = kart.y - Math.sin(kart.heading) * 28;
    const sprite = this.add.image(x, y, 'oil').setDepth(7);
    this.traps.push({ sprite, x, y, life: 12, grace: 0.5, owner: kart });
  }

  updateItemBoxes(dt) {
    for (const b of this.itemBoxes) {
      if (b.active) {
        b.sprite.rotation += dt * 1.5;
        b.sprite.setScale(1 + Math.sin(this.elapsed * 4 + b.x) * 0.08);
        for (const k of this.karts) {
          if (k.out || k.heldItem || k.spunOut) continue;
          if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 < (k.radius + 16) ** 2) {
            this.giveItem(k); if (!k.isAI) Audio.sfx('pickup');
            b.active = false; b.timer = 4; b.sprite.setVisible(false);
            break;
          }
        }
      } else {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; b.sprite.setVisible(true); b.sprite.setScale(1); }
      }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      p.life -= dt;
      let dead = p.life <= 0;
      if (p.homing) {
        if (!p.target || p.target.out) p.target = this.nearest(p.owner, this.karts.filter((k) => k !== p.owner && !k.out));
        if (p.target) {
          const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
          const cur = Math.atan2(p.vy, p.vx);
          const na = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(desired - cur), -p.turnRate * dt, p.turnRate * dt);
          p.vx = Math.cos(na) * p.speed; p.vy = Math.sin(na) * p.speed;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.sprite.setPosition(p.x, p.y); p.sprite.rotation += dt * 12;
      // Bounce green shells off the arena walls.
      if (!p.homing) {
        if (p.x < ARENA.x + 9) { p.x = ARENA.x + 9; p.vx = Math.abs(p.vx); }
        else if (p.x > ARENA.x + ARENA.w - 9) { p.x = ARENA.x + ARENA.w - 9; p.vx = -Math.abs(p.vx); }
        if (p.y < ARENA.y + 9) { p.y = ARENA.y + 9; p.vy = Math.abs(p.vy); }
        else if (p.y > ARENA.y + ARENA.h - 9) { p.y = ARENA.y + ARENA.h - 9; p.vy = -Math.abs(p.vy); }
      } else if (p.x < ARENA.x - 40 || p.x > ARENA.x + ARENA.w + 40 || p.y < ARENA.y - 40 || p.y > ARENA.y + ARENA.h + 40) {
        dead = true;
      }
      if (!dead) {
        for (const k of this.karts) {
          if (k === p.owner || k.out) continue;
          if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < (k.radius + 11) ** 2) {
            const landed = k.hit();
            this.burst(p.x, p.y, landed ? k.color : 0x9fd6f5);
            Audio.sfx(landed ? 'hit' : 'shieldbreak');
            if (landed) this.popBalloon(k);
            dead = true; break;
          }
        }
      }
      if (dead) { p.sprite.destroy(); this.projectiles.splice(i, 1); }
    }
  }

  updateTraps(dt) {
    for (let i = this.traps.length - 1; i >= 0; i -= 1) {
      const t = this.traps[i];
      t.life -= dt; if (t.grace > 0) t.grace -= dt;
      let dead = t.life <= 0;
      if (!dead) {
        for (const k of this.karts) {
          if (k.out) continue;
          if (k === t.owner && t.grace > 0) continue;
          if ((k.x - t.x) ** 2 + (k.y - t.y) ** 2 < (k.radius + 12) ** 2) {
            const landed = k.hit();
            this.burst(t.x, t.y, 0x15151c); Audio.sfx(landed ? 'hit' : 'shieldbreak');
            if (landed) { this.popBalloon(k); dead = true; break; }
          }
        }
      }
      if (dead) { t.sprite.destroy(); this.traps.splice(i, 1); }
    }
  }

  resolveCollisions() {
    for (let i = 0; i < this.karts.length; i += 1) {
      for (let j = i + 1; j < this.karts.length; j += 1) {
        const a = this.karts[i]; const b = this.karts[j];
        if (a.out || b.out) continue;
        this.resolveKartCollision(a, b);
      }
    }
  }

  resolveKartCollision(a, b) {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist; const ny = dy / dist;
    const overlap = minDist - dist;
    const aStar = a.starTimer > 0; const bStar = b.starTimer > 0;
    if (aStar !== bStar) {
      const victim = aStar ? b : a; const sign = aStar ? 1 : -1;
      victim.x += nx * overlap * sign; victim.y += ny * overlap * sign;
      if (victim.hit()) { victim.knockX += nx * sign * 340; victim.knockY += ny * sign * 340; this.burst(victim.x, victim.y, 0xffe14d); Audio.sfx('hit'); this.popBalloon(victim); }
      return;
    }
    a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
    b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
    const push = 150 + (a.speed + b.speed) * 0.25;
    a.knockX -= nx * push * 0.5; a.knockY -= ny * push * 0.5;
    b.knockX += nx * push * 0.5; b.knockY += ny * push * 0.5;
    if (!a.isAI || !b.isAI) Audio.sfx('bump');
  }

  // ------------------------------------------------------------- balloons -----
  popBalloon(kart) {
    if (kart.out || kart.battleInvuln > 0) return;
    kart.balloons -= 1;
    kart.battleInvuln = 2;
    this.burst(kart.x, kart.y, kart.color);
    this.cameras.main.shake(120, 0.006);
    if (kart.balloons <= 0) this.eliminate(kart);
    this.checkWin();
  }

  eliminate(kart) {
    kart.out = true;
    kart.frozen = true;
    kart.sprite.setVisible(false);
    this.burst(kart.x, kart.y, kart.color);
    Audio.sfx('zap');
  }

  checkWin() {
    if (this.state !== 'battle') return;
    const alive = this.karts.filter((k) => !k.out);
    if (alive.length <= 1) {
      this.state = 'over';
      const winner = alive[0] || this.karts.slice().sort((a, b) => b.balloons - a.balloons)[0];
      this.showResults(winner);
    }
  }

  showResults(winner) {
    const W = this.scale.width; const H = this.scale.height;
    Audio.sfx('fanfare');
    const dim = this.add.graphics().setDepth(45);
    dim.fillStyle(0x0a0a16, 0.6); dim.fillRect(0, 0, W, H);
    this.banner.setDepth(46).setText('');
    const name = winner ? winner.name.toUpperCase() : 'NOBODY';
    const t = this.add.text(W / 2, H * 0.38, `${name} WINS!`, {
      fontFamily: 'monospace', fontSize: '56px', color: '#ffe14d', fontStyle: 'bold', stroke: '#c0392b', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(46);
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.Out' });
    this.tweens.add({ targets: t, angle: { from: -3, to: 3 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.makeResultButton(W / 2 - 130, H * 0.62, 'REMATCH ▶', 0x57c75a, () => transitionTo(this, 'BattleScene', { playerCount: this.playerCount, picks: this.picks }));
    this.makeResultButton(W / 2 + 130, H * 0.62, 'TITLE', 0x4d8bff, () => this.leave('TitleScene'));
  }

  makeResultButton(x, y, label, color, onClick) {
    const w = 220; const h = 54;
    const g = this.add.graphics().setDepth(46);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 4, w, h, 13);
      g.fillStyle(color, hover ? 1 : 0.9); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 13);
      g.fillStyle(0xffffff, 0.14); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.42, 9);
      g.lineStyle(3, 0xffffff, hover ? 1 : 0.85); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 13);
    };
    draw(false);
    const text = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(47);
    this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { draw(true); text.setScale(1.05); })
      .on('pointerout', () => { draw(false); text.setScale(1); })
      .on('pointerdown', onClick);
  }

  // ----------------------------------------------------------------- draw -----
  updateSkids(dt) {
    const g = this.skidGfx; g.clear();
    // (kept minimal — skid trails would grow unbounded; a light per-frame dab)
    for (const k of this.karts) {
      if (k.drifting && !k.out) {
        const bx = k.x - Math.cos(k.heading) * 13; const by = k.y - Math.sin(k.heading) * 13;
        g.fillStyle(0x101012, 0.3); g.fillCircle(bx, by, 3.2);
      }
    }
  }

  drawDynamic() {
    const g = this.dynGfx; g.clear();
    for (const k of this.karts) {
      if (k.out) continue;
      // Shield bubble.
      if (k.shieldTimer > 0) { g.lineStyle(3, 0x9fe8ff, 0.8); g.strokeCircle(k.x, k.y, k.radius + 7); g.fillStyle(0x9fe8ff, 0.12); g.fillCircle(k.x, k.y, k.radius + 7); }
      // Star sparkle tint.
      if (k.starTimer > 0) { const hue = (this.elapsed * 1.4) % 1; k.sprite.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.8, 1).color); } else if (k.sprite.isTinted) k.sprite.clearTint();
      // Invulnerability blink after a pop.
      k.sprite.setAlpha(k.battleInvuln > 0 ? (0.4 + 0.4 * Math.sin(this.elapsed * 30)) : 1);
      // Boost flame.
      if ((k.itemBoostTimer > 0 || k.padBoostTimer > 0 || k.boosting) && !k.spunOut) {
        const bx = k.x - Math.cos(k.heading) * 16; const by = k.y - Math.sin(k.heading) * 16;
        const nx = -Math.sin(k.heading); const ny = Math.cos(k.heading);
        const len = 16 + (Math.sin(this.elapsed * 50 + k.x) + 1) * 5;
        g.fillStyle(0xffd23f, 0.85); g.fillTriangle(bx + nx * 6, by + ny * 6, bx - nx * 6, by - ny * 6, bx - Math.cos(k.heading) * len, by - Math.sin(k.heading) * len);
      }
    }
  }

  drawHUD() {
    const g = this.hudGfx; g.clear();
    const W = this.scale.width;
    const n = this.karts.length;
    const slotW = 150;
    const startX = W / 2 - (n * slotW) / 2 + slotW / 2;
    const y = 58;
    this.karts.forEach((k, i) => {
      const x = startX + i * slotW;
      // colour chip
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - 64, y - 13, 128, 26, 8);
      g.fillStyle(k.color, k.out ? 0.4 : 1); g.fillCircle(x - 50, y, 8);
      g.lineStyle(2, 0xffffff, k.out ? 0.4 : 0.9); g.strokeCircle(x - 50, y, 8);
      // balloons
      for (let b = 0; b < START_BALLOONS; b += 1) {
        const bx = x - 28 + b * 22;
        const on = b < k.balloons;
        g.fillStyle(on ? k.color : 0x2a2a33, on ? 1 : 0.7); g.fillCircle(bx, y - 1, 7);
        g.lineStyle(1.5, 0xffffff, on ? 0.9 : 0.3); g.strokeCircle(bx, y - 1, 7);
        g.lineStyle(1.5, 0xffffff, on ? 0.7 : 0.2); g.beginPath(); g.moveTo(bx, y + 6); g.lineTo(bx, y + 11); g.strokePath();
      }
    });
  }

  burst(x, y, tint) {
    this.particles.setParticleTint(tint);
    this.particles.emitParticleAt(x, y, 10);
  }
}
