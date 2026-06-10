import Phaser from 'phaser';
import Kart from '../Kart.js';
import { ROSTER, kartClass } from '../GrandPrix.js';
import { makeKartTexture, makeGameTextures } from '../textures.js';
import * as Audio from '../Audio.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';

// Balloon Battle: a single-screen walled arena (no laps). 2 players + 2-or-4 AI
// fight; each kart has 3 balloons; a spin-out hit pops one; last kart with
// balloons wins. Four themed arenas, each with a signature twist. Reuses Kart,
// the item textures, the SFX/engine audio and the kart classes.

const ARENA = { x: 36, y: 86, w: 888, h: 518 }; // play field inside the walls
const START_BALLOONS = 3;
// Base item odds, tweaked per arena (ice favours defence + precision, the maze
// favours traps + ricochets, the volcano favours speed).
const ITEM_WEIGHTS = { boost: 3, greenShell: 3, redShell: 2, trap: 2, shield: 2, star: 1, tripleShell: 2, dart: 2, lightning: 0.4 };
const ARENA_ITEM_TWEAKS = {
  stadium: { redShell: 3 },
  ice: { shield: 4, dart: 3 },
  maze: { trap: 4, greenShell: 4 },
  volcano: { boost: 4 },
};

// Feature coords are fractions of the ARENA box; abs() converts them.
const abs = (fx, fy) => ({ x: ARENA.x + fx * ARENA.w, y: ARENA.y + fy * ARENA.h });

export const ARENAS = [
  {
    id: 'stadium', name: 'GRASS STADIUM', sub: 'Open field with cover', icon: '🏟',
    terrain: 0x6fb84a, floor: 0x46474f, kerb: [0xe23b3b, 0xffffff], accent: 0xffe14d,
    grip: 1, music: 'Carnival',
    blocks: [{ fx: 0.32, fy: 0.5, r: 26 }, { fx: 0.68, fy: 0.5, r: 26 }],
  },
  {
    id: 'ice', name: 'ICE RINK', sub: 'Everything slides!', icon: '❄',
    terrain: 0xbfe3f5, floor: 0xdfeefb, kerb: [0x8fbcd6, 0xffffff], accent: 0x49a8ec,
    grip: 0.3, music: 'Ice',
    blocks: [{ fx: 0.2, fy: 0.24, r: 22 }, { fx: 0.8, fy: 0.76, r: 22 }],
  },
  {
    id: 'volcano', name: 'VOLCANO PIT', sub: 'Mind the geysers', icon: '🌋',
    terrain: 0x5a1f10, floor: 0x2f2b2b, kerb: [0xff7a1a, 0x3a1a10], accent: 0xff7a1a,
    grip: 1, music: 'Volcano',
    geysers: [{ fx: 0.5, fy: 0.5, r: 50 }, { fx: 0.24, fy: 0.3, r: 42 }, { fx: 0.76, fy: 0.7, r: 42 }],
  },
  {
    id: 'maze', name: 'NEON MAZE', sub: 'Corridors & ambushes', icon: '🌀',
    terrain: 0x110f1e, floor: 0x1d1b30, kerb: [0x00e5ff, 0xff3df0], accent: 0x00e5ff,
    grip: 1, music: 'Neon',
    walls: [
      { fx: 0.08, fy: 0.5, fw: 0.32, fh: 0, t: 22 }, // left arm
      { fx: 0.6, fy: 0.5, fw: 0.32, fh: 0, t: 22 }, // right arm
      { fx: 0.5, fy: 0.08, fw: 0, fh: 0.3, t: 22 }, // top arm
      { fx: 0.5, fy: 0.62, fw: 0, fh: 0.3, t: 22 }, // bottom arm
    ],
  },
];

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    const cfg = (data && data.picks) ? data : (this.registry.get('battle') || {});
    this.playerCount = cfg.playerCount || 2;
    this.aiCount = cfg.aiCount || 2;
    this.picks = (cfg.picks && cfg.picks.length) ? cfg.picks.slice() : [0, 1];
    this.arenaId = cfg.arena || 'stadium';
    this.arena = ARENAS.find((a) => a.id === this.arenaId) || ARENAS[0];
  }

  create() {
    const W = this.scale.width;
    fadeIn(this);
    makeGameTextures(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));
    if (!this.textures.exists('dart')) {
      const dg = this.make.graphics({ x: 0, y: 0, add: false });
      dg.fillStyle(0xff8a2c, 1); dg.fillRect(0, 4, 7, 4);
      dg.fillStyle(0xffe14d, 1); dg.fillTriangle(5, 1, 5, 11, 17, 6);
      dg.generateTexture('dart', 18, 12);
      dg.destroy();
    }

    this.geysers = [];
    this.blocks = [];
    this.walls = [];
    this.drawArena();
    this.buildArenaFeatures();

    this.skidGfx = this.add.graphics().setDepth(1);
    this.itemBoxes = [];
    this.projectiles = [];
    this.traps = [];
    this.hazardGfx = this.add.graphics().setDepth(12);
    this.dynGfx = this.add.graphics().setDepth(15);
    this.hudGfx = this.add.graphics().setDepth(30);
    this.particles = this.add.particles(0, 0, 'spark', {
      lifespan: 500, speed: { min: 40, max: 160 }, scale: { start: 0.8, end: 0 }, emitting: false,
    }).setDepth(16);

    this.createKarts();
    this.createItemBoxes();
    this.setupKeys();

    this.banner = this.add.text(W / 2, this.scale.height * 0.42, '', {
      fontFamily: 'monospace', fontSize: '72px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(40);

    this.state = 'countdown';
    this.countdown = 3.2;
    this.countText = '';
    this.elapsed = 0;

    // Sudden death: a 90s match timer; at zero the arena shrinks until someone
    // wins, and a hard cap ends it on balloons (fewest hits taken tiebreak).
    this.bounds = { x: ARENA.x, y: ARENA.y, w: ARENA.w, h: ARENA.h };
    this.matchTime = 90;
    this.suddenDeath = false;
    this.hardCap = 30;
    this.timerText = this.add.text(ARENA.x + ARENA.w, 20, '1:30', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(1, 0.5).setDepth(31);

    // Bonus balloon: floats near the centre every ~20s; grab it to restore one.
    this.bonusBalloon = null;
    this.balloonTimer = 14;

    // Battle AI skill knobs (react = threat-detection range in px, fire =
    // per-frame fire chance when lined up, dodge = chance to evade incoming).
    const diff = this.registry.get('difficulty') || 'medium';
    this.battleAi = ({
      easy: { react: 90, fire: 0.02, dodge: 0.4 },
      medium: { react: 150, fire: 0.04, dodge: 0.75 },
      hard: { react: 220, fire: 0.07, dodge: 1 },
    })[diff] || { react: 150, fire: 0.04, dodge: 0.75 };

    Audio.resumeAudio();
    Audio.startMusic(this.arena.music || 'Carnival');
    this.engineOn = false;
    this.humans.forEach((h) => Audio.startEngine(h.id));
    this.engineOn = true;
    this.events.once('shutdown', () => { Audio.stopMusic(); Audio.stopAllEngines(); });

    const hint = this.playerCount === 1
      ? 'steer A/D or ←/→   ·   item E/Space or RShift   ·   pop all 3 balloons to win!'
      : 'P1 A/D + E/Space   ·   P2 ←/→ + RShift   ·   pop all 3 balloons to win!';
    this.add.text(W / 2, this.scale.height - 16, hint, {
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
    const ar = this.arena;
    const g = this.add.graphics().setDepth(0);
    // Outer terrain.
    g.fillStyle(ar.terrain, 1); g.fillRect(0, 0, W, H);
    let seed = 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 80; i += 1) {
      g.fillStyle(rnd() < 0.5 ? 0xffffff : 0x000000, 0.05);
      g.fillEllipse(rnd() * W, rnd() * H, 24 + rnd() * 30, 12 + rnd() * 14);
    }
    // Arena floor.
    g.fillStyle(0x000000, 0.14); g.fillRoundedRect(ARENA.x + 6, ARENA.y + 8, ARENA.w, ARENA.h, 22);
    g.fillStyle(ar.floor, 1); g.fillRoundedRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 22);
    g.fillStyle(0xffffff, 0.05); g.fillRoundedRect(ARENA.x + 8, ARENA.y + 8, ARENA.w - 16, ARENA.h * 0.4, 16);
    // Themed floor detail.
    this.drawFloorDetail(g, ar);
    // Kerb wall.
    this.drawKerbWall(g, ar.kerb);
    // Title strip.
    this.add.text(W / 2, 20, `${ar.icon}  ${ar.name}`, {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(2);
  }

  drawFloorDetail(g, ar) {
    if (ar.id === 'ice') {
      // Frosty cracks.
      g.lineStyle(2, 0xffffff, 0.5);
      let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 14; i += 1) {
        const a = abs(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7);
        g.beginPath(); g.moveTo(a.x, a.y);
        for (let k = 0; k < 3; k += 1) g.lineTo(a.x + (rnd() - 0.5) * 90, a.y + (rnd() - 0.5) * 90);
        g.strokePath();
      }
    } else if (ar.id === 'volcano') {
      // Glowing lava cracks.
      let s = 13; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 16; i += 1) {
        const a = abs(0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8);
        g.lineStyle(3, 0xff5a1a, 0.5); g.beginPath(); g.moveTo(a.x, a.y);
        g.lineTo(a.x + (rnd() - 0.5) * 70, a.y + (rnd() - 0.5) * 70); g.strokePath();
      }
    } else if (ar.id === 'maze') {
      // Neon grid.
      g.lineStyle(1.5, ar.accent, 0.18);
      for (let x = ARENA.x + 40; x < ARENA.x + ARENA.w; x += 56) { g.beginPath(); g.moveTo(x, ARENA.y + 6); g.lineTo(x, ARENA.y + ARENA.h - 6); g.strokePath(); }
      for (let y = ARENA.y + 40; y < ARENA.y + ARENA.h; y += 56) { g.beginPath(); g.moveTo(ARENA.x + 6, y); g.lineTo(ARENA.x + ARENA.w - 6, y); g.strokePath(); }
    }
  }

  drawKerbWall(g, kerb) {
    const seg = 26;
    const stripe = (x, y, w, h, i) => { g.fillStyle(i % 2 ? kerb[0] : kerb[1], 1); g.fillRect(x, y, w, h); };
    let i = 0;
    for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += seg) { stripe(x, ARENA.y - 8, Math.min(seg, ARENA.x + ARENA.w - x), 8, i); stripe(x, ARENA.y + ARENA.h, Math.min(seg, ARENA.x + ARENA.w - x), 8, i); i += 1; }
    i = 0;
    for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += seg) { stripe(ARENA.x - 8, y, 8, Math.min(seg, ARENA.y + ARENA.h - y), i); stripe(ARENA.x + ARENA.w, y, 8, Math.min(seg, ARENA.y + ARENA.h - y), i); i += 1; }
  }

  // Build the arena's signature features (obstacles / inner walls / geysers).
  buildArenaFeatures() {
    const ar = this.arena;
    const g = this.add.graphics().setDepth(3);
    (ar.blocks || []).forEach((b) => {
      const p = abs(b.fx, b.fy);
      this.blocks.push({ x: p.x, y: p.y, r: b.r });
      // Tyre-stack / boulder look.
      g.fillStyle(0x000000, 0.25); g.fillEllipse(p.x, p.y + b.r * 0.5, b.r * 2, b.r * 0.7);
      g.fillStyle(0x1c1c22, 1); g.fillCircle(p.x, p.y, b.r);
      g.fillStyle(ar.accent, 0.9); g.fillCircle(p.x, p.y, b.r * 0.6);
      g.fillStyle(0x1c1c22, 1); g.fillCircle(p.x, p.y, b.r * 0.32);
    });
    (ar.walls || []).forEach((w) => {
      const cp = abs(w.fx, w.fy);
      const ww = (w.fw * ARENA.w) || w.t;
      const wh = (w.fh * ARENA.h) || w.t;
      const rect = { x: cp.x - ww / 2, y: cp.y - wh / 2, w: ww, h: wh };
      this.walls.push(rect);
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(rect.x + 3, rect.y + 4, rect.w, rect.h, 7);
      g.fillStyle(0x2a2740, 1); g.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 7);
      g.lineStyle(3, ar.accent, 0.95); g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 7);
      g.lineStyle(8, ar.accent, 0.18); g.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 7);
    });
    (ar.geysers || []).forEach((gy) => {
      const p = abs(gy.fx, gy.fy);
      this.geysers.push({ x: p.x, y: p.y, r: gy.r, phase: 'wait', timer: 1.5 + Math.random() * 2 });
    });
  }

  // ----------------------------------------------------------------- karts ----
  createKarts() {
    const total = this.playerCount + this.aiCount;
    const used = new Set(this.picks.slice(0, this.playerCount));
    const pool = ROSTER.map((_, i) => i).filter((i) => !used.has(i));
    for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const lineup = this.picks.slice(0, this.playerCount).concat(pool).slice(0, total);

    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    this.karts = [];
    this.humans = [];
    lineup.forEach((idx, i) => {
      const r = ROSTER[idx];
      const a = (i / lineup.length) * Math.PI * 2;
      const x = cx + Math.cos(a) * (ARENA.w * 0.36);
      const y = cy + Math.sin(a) * (ARENA.h * 0.34);
      const kart = new Kart(this, x, y, a + Math.PI, `kart_${r.id}`);
      kart.id = r.id; kart.name = r.name; kart.color = r.color;
      kart.isAI = i >= this.playerCount;
      const klass = kartClass(idx);
      kart.stats = { speed: klass.speed, accel: klass.accel, handling: klass.handling, weight: klass.weight };
      kart.balloons = START_BALLOONS;
      kart.battleInvuln = 0;
      kart.out = false;
      kart.aiTimer = 0;
      kart.hitsTaken = 0; // timeout tiebreak: fewer hits taken wins
      kart.stealCd = 0; // ram-steal guard: one theft per spin-out
      this.karts.push(kart);
      if (!kart.isAI) this.humans.push(kart);
    });
    this.soloDualInput = this.playerCount === 1;
  }

  createItemBoxes() {
    // A ring of boxes plus a centre cluster — kept clear of inner walls/geysers.
    const spots = [
      [0.5, 0.22], [0.78, 0.32], [0.78, 0.68], [0.5, 0.78], [0.22, 0.68], [0.22, 0.32],
      [0.38, 0.5], [0.62, 0.5],
    ];
    for (const [fx, fy] of spots) {
      const p = abs(fx, fy);
      if (this.blocked(p.x, p.y, 30)) continue;
      const sprite = this.add.image(p.x, p.y, 'itembox').setDepth(8);
      this.itemBoxes.push({ x: p.x, y: p.y, sprite, active: true, timer: 0 });
    }
  }

  blocked(x, y, pad) {
    for (const b of this.blocks) { if ((x - b.x) ** 2 + (y - b.y) ** 2 < (b.r + pad) ** 2) return true; }
    for (const w of this.walls) { if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return true; }
    return false;
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
      this.drawHazards(dt);
      this.drawHUD();
      this.drawDynamic();
      return;
    }
    if (this.state === 'over') { this.drawHazards(0); this.drawHUD(); this.drawDynamic(); return; }

    this.updateMatchTimer(dt);
    this.karts.forEach((k) => {
      if (!k.out) k.frozen = false;
      if (k.battleInvuln > 0) k.battleInvuln -= dt;
      if (k.stealCd > 0) k.stealCd -= dt;
    });
    this.karts.forEach((k) => this.driveKart(k, dt));
    this.karts.forEach((k) => this.releaseMiniTurbo(k));
    this.karts.forEach((k) => this.resolveBlocks(k));
    this.updateItemBoxes(dt);
    this.updateBonusBalloon(dt);
    this.updateProjectiles(dt);
    this.updateTraps(dt);
    this.updateGeysers(dt);
    this.resolveCollisions();
    this.updateEngines();
    this.updateSkids(dt);
    this.drawHazards(dt);
    this.drawDynamic();
    this.drawHUD();
  }

  // Tick the 90s match clock; at zero begin sudden death (the playable bounds
  // shrink toward the centre over ~25s, forcing the survivors together), and
  // after a further hard cap decide the winner on balloons.
  updateMatchTimer(dt) {
    if (!this.suddenDeath) {
      this.matchTime -= dt;
      const t = Math.max(0, this.matchTime);
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      this.timerText.setText(`${m}:${String(s).padStart(2, '0')}`);
      this.timerText.setColor(t < 16 ? '#ff5a5a' : '#ffffff');
      if (this.matchTime <= 0) this.startSuddenDeath();
      return;
    }
    const minW = ARENA.w * 0.34;
    const minH = ARENA.h * 0.34;
    const rate = dt / 25; // full shrink takes ~25s
    if (this.bounds.w > minW) { const dw = Math.min((ARENA.w - minW) * rate, this.bounds.w - minW); this.bounds.x += dw / 2; this.bounds.w -= dw; }
    if (this.bounds.h > minH) { const dh = Math.min((ARENA.h - minH) * rate, this.bounds.h - minH); this.bounds.y += dh / 2; this.bounds.h -= dh; }
    this.timerText.setText('SUDDEN DEATH');
    this.timerText.setColor('#ff5a5a');
    this.hardCap -= dt;
    if (this.hardCap <= 0) this.timeoutEnd();
  }

  startSuddenDeath() {
    this.suddenDeath = true;
    Audio.sfx('finallap');
    this.cameras.main.shake(200, 0.005);
    this.banner.setText('HURRY UP!');
    this.tweens.add({ targets: this.banner, scale: { from: 0.6, to: 1 }, duration: 300, ease: 'Back.Out' });
    this.time.delayedCall(1500, () => { if (this.state === 'battle') { this.banner.setText(''); this.banner.setScale(1); } });
  }

  // Hard-cap timeout: most balloons wins; fewer hits taken breaks ties.
  timeoutEnd() {
    if (this.state !== 'battle') return;
    this.state = 'over';
    const ranked = this.karts.filter((k) => !k.out)
      .sort((a, b) => (b.balloons - a.balloons) || (a.hitsTaken - b.hitsTaken));
    this.banner.setText('');
    this.showResults(ranked[0] || this.karts[0]);
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
    kart.drive(dt, input.steer, input.braking, input.boosting, true, { grip: this.arena.grip });
    this.clampToArena(kart);
  }

  // Decision stack: dodge incoming fire → survive on the last balloon → shop
  // for items → hunt the leader. Skill knobs come from this.battleAi.
  aiControl(kart, dt) {
    kart.aiTimer -= dt;
    const cfg = this.battleAi;
    const threat = this.incomingThreat(kart, cfg.react);

    // Shield discipline: keep it pocketed until something is actually incoming.
    let wantFire = kart.heldItem === 'shield' ? !!threat : false;

    // Dodge: break perpendicular to the incoming projectile's flight path.
    if (threat && Math.random() < cfg.dodge) {
      const va = Math.atan2(threat.vy, threat.vx);
      const left = va + Math.PI / 2;
      const right = va - Math.PI / 2;
      const dl = Math.abs(Phaser.Math.Angle.Wrap(left - kart.heading));
      const dr = Math.abs(Phaser.Math.Angle.Wrap(right - kart.heading));
      const diff = Phaser.Math.Angle.Wrap((dl < dr ? left : right) - kart.heading);
      return { steer: Phaser.Math.Clamp(diff * 3, -1, 1), braking: false, boosting: true, fire: wantFire };
    }

    // Survival on the last balloon: limp to the heal, else keep your distance
    // (with a centre-ward bias so fleeing never pins them against a wall).
    if (kart.balloons <= 1 && kart.starTimer <= 0) {
      if (this.bonusBalloon) return this.steerToward(kart, this.bonusBalloon.x, this.bonusBalloon.y, wantFire);
      const danger = this.nearest(kart, this.karts.filter((k) => k !== kart && !k.out && (k.heldItem || k.starTimer > 0)));
      if (danger && ((danger.x - kart.x) ** 2 + (danger.y - kart.y) ** 2) < 360 * 360) {
        const c = this.center();
        const away = Math.atan2(kart.y - danger.y, kart.x - danger.x);
        const toC = Math.atan2(c.y - kart.y, c.x - kart.x);
        const desired = away + Phaser.Math.Angle.Wrap(toC - away) * 0.35;
        const diff = Phaser.Math.Angle.Wrap(desired - kart.heading);
        return { steer: Phaser.Math.Clamp(diff * 2.4, -1, 1), braking: false, boosting: true, fire: wantFire };
      }
    }

    // Unarmed: go shopping.
    if (!kart.heldItem) {
      const box = this.nearest(kart, this.itemBoxes.filter((b) => b.active));
      const t = box || this.center();
      return this.steerToward(kart, t.x, t.y, false);
    }

    // Armed: hunt the leader (nearest among the most-ballooned rivals).
    const foe = this.pickTarget(kart) || this.center();
    if (kart.heldItem !== 'shield') {
      if (kart.heldItem === 'lightning') {
        wantFire = Math.random() < cfg.fire; // hits everyone — no aim needed
      } else {
        const ang = Math.atan2(foe.y - kart.y, foe.x - kart.x);
        if (Math.abs(Phaser.Math.Angle.Wrap(ang - kart.heading)) < 0.3 && Math.random() < cfg.fire) wantFire = true;
      }
    }
    return this.steerToward(kart, foe.x, foe.y, wantFire);
  }

  steerToward(kart, tx, ty, fire) {
    const desired = Math.atan2(ty - kart.y, tx - kart.x);
    const diff = Phaser.Math.Angle.Wrap(desired - kart.heading);
    return { steer: Phaser.Math.Clamp(diff * 2.2, -1, 1), braking: false, boosting: Math.abs(diff) < 0.5, fire: !!fire };
  }

  // Kill the leader: the nearest rival among those holding the most balloons.
  pickTarget(kart) {
    const rivals = this.karts.filter((k) => k !== kart && !k.out);
    if (!rivals.length) return null;
    const maxB = Math.max(...rivals.map((k) => k.balloons));
    return this.nearest(kart, rivals.filter((k) => k.balloons === maxB));
  }

  // The closest enemy projectile that is closing on this kart (or a red shell
  // locked onto it), within `range` px.
  incomingThreat(kart, range) {
    let best = null; let bd = range * range;
    for (const p of this.projectiles) {
      if (p.owner === kart) continue;
      const dx = kart.x - p.x; const dy = kart.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > bd) continue;
      if (p.homing && p.target === kart) { best = p; bd = d2; continue; }
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const dist = Math.sqrt(d2) || 1;
      const closing = (p.vx * dx + p.vy * dy) / (sp * dist);
      if (closing > 0.6) { best = p; bd = d2; }
    }
    return best;
  }

  nearest(kart, list) {
    let best = null; let bd = Infinity;
    for (const o of list) { const d = (o.x - kart.x) ** 2 + (o.y - kart.y) ** 2; if (d < bd) { bd = d; best = o; } }
    return best;
  }

  center() { return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 }; }

  clampToArena(kart) {
    const r = kart.radius;
    const b = this.bounds; // shrinks during sudden death
    const l = b.x + r; const rt = b.x + b.w - r;
    const tp = b.y + r; const bt = b.y + b.h - r;
    if (kart.x < l) { kart.x = l; if (kart.vx < 0) kart.vx *= -0.4; kart.speed *= 0.7; }
    else if (kart.x > rt) { kart.x = rt; if (kart.vx > 0) kart.vx *= -0.4; kart.speed *= 0.7; }
    if (kart.y < tp) { kart.y = tp; if (kart.vy < 0) kart.vy *= -0.4; kart.speed *= 0.7; }
    else if (kart.y > bt) { kart.y = bt; if (kart.vy > 0) kart.vy *= -0.4; kart.speed *= 0.7; }
  }

  // Push a kart out of inner blocks (circles) and walls (rects).
  resolveBlocks(kart) {
    if (kart.out) return;
    const r = kart.radius;
    for (const b of this.blocks) {
      const dx = kart.x - b.x; const dy = kart.y - b.y;
      const dist = Math.hypot(dx, dy); const minD = r + b.r;
      if (dist < minD && dist > 0.0001) { const nx = dx / dist; const ny = dy / dist; kart.x = b.x + nx * minD; kart.y = b.y + ny * minD; kart.speed *= 0.6; }
    }
    for (const w of this.walls) {
      const cx = Phaser.Math.Clamp(kart.x, w.x, w.x + w.w);
      const cy = Phaser.Math.Clamp(kart.y, w.y, w.y + w.h);
      const dx = kart.x - cx; const dy = kart.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < r && dist > 0.0001) { const nx = dx / dist; const ny = dy / dist; kart.x = cx + nx * r; kart.y = cy + ny * r; kart.speed *= 0.6; }
      else if (dist === 0) { kart.x = w.x - r; } // dead-centre nudge
    }
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
    const weights = { ...ITEM_WEIGHTS, ...(ARENA_ITEM_TWEAKS[this.arenaId] || {}) };
    let total = 0; for (const k in weights) total += weights[k];
    let r = Math.random() * total; let chosen = 'boost';
    for (const k in weights) { r -= weights[k]; if (r <= 0) { chosen = k; break; } }
    kart.heldItem = chosen;
    kart.orbitShells = chosen === 'tripleShell' ? 3 : 0;
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
    else if (item === 'tripleShell') this.spawnProjectile(kart, 'green'); // fires one orbiter
    else if (item === 'trap') this.spawnTrap(kart);
    else if (item === 'dart') this.spawnDart(kart);
    else if (item === 'lightning') this.lightningStrike(kart);
    // Triple shells keep their slot until the ammo runs out.
    if (item === 'tripleShell') { kart.orbitShells -= 1; if (kart.orbitShells <= 0) kart.heldItem = null; }
    else kart.heldItem = null;
  }

  spawnDart(kart) {
    if (!kart.isAI) Audio.sfx('shell');
    const ox = Math.cos(kart.heading); const oy = Math.sin(kart.heading);
    const sprite = this.add.image(kart.x + ox * 26, kart.y + oy * 26, 'dart').setDepth(13);
    sprite.rotation = kart.heading;
    this.projectiles.push({
      sprite, x: sprite.x, y: sprite.y, vx: ox * 640, vy: oy * 640, speed: 640,
      owner: kart, homing: false, dart: true, life: 2.5,
    });
  }

  // Lightning: zap every rival — spin + pop a balloon unless shield/star saves them.
  lightningStrike(kart) {
    Audio.sfx('zap');
    this.cameras.main.flash(220, 230, 230, 140);
    for (const r of this.karts) {
      if (r === kart || r.out) continue;
      if (r.hit()) { this.burst(r.x, r.y, 0xfff3b0); this.popBalloon(r); }
    }
  }

  // Orbiting triple shells physically intercept one incoming shell/dart each.
  orbitBlock(kart) {
    if (kart.orbitShells <= 0) return false;
    kart.orbitShells -= 1;
    if (kart.orbitShells <= 0 && kart.heldItem === 'tripleShell') kart.heldItem = null;
    this.burst(kart.x, kart.y, 0x3ecf5a);
    Audio.sfx('shieldbreak');
    return true;
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
    const bd = this.bounds;
    for (const b of this.itemBoxes) {
      // Boxes swallowed by the closing arena are gone for the rest of the match.
      if (this.suddenDeath && (b.x < bd.x + 16 || b.x > bd.x + bd.w - 16 || b.y < bd.y + 16 || b.y > bd.y + bd.h - 16)) {
        b.active = false; b.timer = 99999; b.sprite.setVisible(false);
        continue;
      }
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

  // Reflect a shell off a circle/point surface.
  reflectShell(p, nx, ny, sx, sy, minD) {
    p.x = sx + nx * minD; p.y = sy + ny * minD;
    const vdot = p.vx * nx + p.vy * ny;
    if (vdot < 0) { p.vx -= 2 * vdot * nx; p.vy -= 2 * vdot * ny; this.burst(p.x, p.y, 0x9bf0a6); Audio.sfx('bump'); }
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
      p.sprite.setPosition(p.x, p.y);
      if (p.dart) p.sprite.rotation = Math.atan2(p.vy, p.vx);
      else p.sprite.rotation += dt * 12;
      if (p.dart) {
        // Darts fly straight and shatter on any wall instead of bouncing.
        const bd = this.bounds;
        if (p.x < bd.x + 6 || p.x > bd.x + bd.w - 6 || p.y < bd.y + 6 || p.y > bd.y + bd.h - 6) dead = true;
        if (!dead) { for (const b of this.blocks) { if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + 6) ** 2) { dead = true; break; } } }
        if (!dead) { for (const w of this.walls) { if (p.x > w.x - 6 && p.x < w.x + w.w + 6 && p.y > w.y - 6 && p.y < w.y + w.h + 6) { dead = true; break; } } }
        if (dead) this.burst(p.x, p.y, 0xffe14d);
      } else if (!p.homing) {
        // Bounce off the (possibly shrunken) arena bounds.
        const bd = this.bounds;
        if (p.x < bd.x + 9) { p.x = bd.x + 9; p.vx = Math.abs(p.vx); }
        else if (p.x > bd.x + bd.w - 9) { p.x = bd.x + bd.w - 9; p.vx = -Math.abs(p.vx); }
        if (p.y < bd.y + 9) { p.y = bd.y + 9; p.vy = Math.abs(p.vy); }
        else if (p.y > bd.y + bd.h - 9) { p.y = bd.y + bd.h - 9; p.vy = -Math.abs(p.vy); }
        // Bounce off inner blocks + walls.
        for (const b of this.blocks) { const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy); const minD = 9 + b.r; if (d < minD && d > 0.0001) { this.reflectShell(p, dx / d, dy / d, b.x, b.y, minD); break; } }
        for (const w of this.walls) { const cx = Phaser.Math.Clamp(p.x, w.x, w.x + w.w); const cy = Phaser.Math.Clamp(p.y, w.y, w.y + w.h); const dx = p.x - cx; const dy = p.y - cy; const d = Math.hypot(dx, dy); if (d < 9 && d > 0.0001) { this.reflectShell(p, dx / d, dy / d, cx, cy, 9); break; } }
      } else if (p.x < ARENA.x - 40 || p.x > ARENA.x + ARENA.w + 40 || p.y < ARENA.y - 40 || p.y > ARENA.y + ARENA.h + 40) {
        dead = true;
      }
      if (!dead) {
        for (const k of this.karts) {
          if (k === p.owner || k.out) continue;
          if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < (k.radius + 11) ** 2) {
            if (p.dart) {
              // Precision hit: pops a balloon with NO spin-out. Star, shield and
              // orbiting shells all still defend against it.
              if (k.starTimer > 0) { this.burst(p.x, p.y, 0x9fd6f5); }
              else if (k.shieldTimer > 0) { k.shieldTimer = 0; Audio.sfx('shieldbreak'); this.burst(p.x, p.y, 0x9fe8ff); }
              else if (!this.orbitBlock(k)) { this.burst(p.x, p.y, k.color); Audio.sfx('hit'); this.popBalloon(k); }
              dead = true; break;
            }
            if (this.orbitBlock(k)) { dead = true; break; }
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

  // Volcano geysers: wait → telegraph → erupt (pops a balloon if you're on it).
  updateGeysers(dt) {
    for (const gy of this.geysers) {
      gy.timer -= dt;
      if (gy.phase === 'wait') { if (gy.timer <= 0) { gy.phase = 'warn'; gy.timer = 1.1; } }
      else if (gy.phase === 'warn') { if (gy.timer <= 0) {
        gy.phase = 'erupt'; gy.timer = 0.5; Audio.sfx('hit'); this.cameras.main.shake(150, 0.006);
        for (const k of this.karts) { if (k.out) continue; if ((k.x - gy.x) ** 2 + (k.y - gy.y) ** 2 < (gy.r + k.radius) ** 2) { if (k.hit()) { this.burst(k.x, k.y, 0xff7a1a); this.popBalloon(k); } } }
      } }
      else if (gy.phase === 'erupt') { if (gy.timer <= 0) { gy.phase = 'wait'; gy.timer = 2.2 + Math.random() * 2; } }
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
      const thief = aStar ? a : b;
      victim.x += nx * overlap * sign; victim.y += ny * overlap * sign;
      if (victim.hit()) {
        victim.knockX += nx * sign * 340; victim.knockY += ny * sign * 340;
        this.burst(victim.x, victim.y, 0xffe14d); Audio.sfx('hit');
        // A star contact steals the balloon when there's room for it.
        if (!this.stealBalloon(thief, victim, true)) this.popBalloon(victim);
      }
      return;
    }
    a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
    b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
    const push = 150 + (a.speed + b.speed) * 0.25;
    a.knockX -= nx * push * 0.5; a.knockY -= ny * push * 0.5;
    b.knockX += nx * push * 0.5; b.knockY += ny * push * 0.5;
    if (!a.isAI || !b.isAI) Audio.sfx('bump');
    // Ramming a spun-out rival steals one of their balloons (once per spin).
    if (a.spunOut !== b.spunOut) {
      const victim = a.spunOut ? a : b;
      const thief = a.spunOut ? b : a;
      this.stealBalloon(thief, victim, false);
    }
  }

  // ------------------------------------------------------------- balloons -----
  // Transfer one balloon from victim to thief. `asHit` means this steal IS the
  // hit event (star contact): it respects + sets battleInvuln like a pop.
  // Otherwise (ramming an already-spinning kart) it's an extra theft guarded by
  // stealCd, so each spin-out can only be robbed once.
  stealBalloon(thief, victim, asHit) {
    if (thief.out || victim.out || thief.balloons >= START_BALLOONS) return false;
    if (asHit) {
      if (victim.battleInvuln > 0) return false;
    } else if (victim.stealCd > 0 || victim.spinTimer <= 0) {
      return false;
    }
    victim.balloons -= 1;
    victim.hitsTaken += 1;
    if (asHit) victim.battleInvuln = 2; else victim.stealCd = 2.5;
    thief.balloons = Math.min(START_BALLOONS, thief.balloons + 1);
    this.burst(victim.x, victim.y, victim.color);
    this.burst(thief.x, thief.y, 0xffe14d);
    if (!thief.isAI || !victim.isAI) Audio.sfx('coin');
    this.floatPopup(thief.x, thief.y - 26, 'STOLE!', '#ffe14d');
    this.cameras.main.shake(100, 0.005);
    if (victim.balloons <= 0) this.eliminate(victim);
    this.checkWin();
    return true;
  }

  floatPopup(x, y, msg, color) {
    const t = this.add.text(x, y, msg, {
      fontFamily: 'monospace', fontSize: '18px', color, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 44, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  // The floating bonus balloon: first hurt kart to touch it gets one back.
  updateBonusBalloon(dt) {
    if (!this.bonusBalloon) {
      this.balloonTimer -= dt;
      if (this.balloonTimer <= 0) this.spawnBonusBalloon();
      return;
    }
    const bb = this.bonusBalloon;
    const bd = this.bounds; // stay inside the closing ring during sudden death
    bb.x = Phaser.Math.Clamp(bb.x, bd.x + 24, bd.x + bd.w - 24);
    bb.y = Phaser.Math.Clamp(bb.y, bd.y + 24, bd.y + bd.h - 24);
    for (const k of this.karts) {
      if (k.out || k.balloons >= START_BALLOONS) continue;
      if ((k.x - bb.x) ** 2 + (k.y - bb.y) ** 2 < (k.radius + 15) ** 2) {
        k.balloons += 1;
        this.bonusBalloon = null;
        this.balloonTimer = 20;
        this.burst(bb.x, bb.y, k.color);
        if (!k.isAI) Audio.sfx('pickup');
        this.floatPopup(k.x, k.y - 26, '+1 BALLOON', '#9fe8ff');
        return;
      }
    }
  }

  spawnBonusBalloon() {
    const bd = this.bounds;
    for (let tries = 0; tries < 10; tries += 1) {
      const x = bd.x + bd.w / 2 + (Math.random() - 0.5) * Math.min(240, bd.w * 0.4);
      const y = bd.y + bd.h / 2 + (Math.random() - 0.5) * Math.min(160, bd.h * 0.4);
      if (!this.blocked(x, y, 24)) { this.bonusBalloon = { x, y }; return; }
    }
    this.balloonTimer = 6; // centre crowded by arena features — retry shortly
  }

  popBalloon(kart) {
    if (kart.out || kart.battleInvuln > 0) return;
    kart.balloons -= 1;
    kart.hitsTaken += 1;
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
    const cfg = { playerCount: this.playerCount, picks: this.picks, arena: this.arenaId, aiCount: this.aiCount };
    this.makeResultButton(W / 2 - 130, H * 0.62, 'REMATCH ▶', 0x57c75a, () => transitionTo(this, 'BattleScene', cfg));
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
    for (const k of this.karts) {
      if (k.drifting && !k.out) {
        const bx = k.x - Math.cos(k.heading) * 13; const by = k.y - Math.sin(k.heading) * 13;
        g.fillStyle(0x101012, 0.3); g.fillCircle(bx, by, 3.2);
      }
    }
  }

  drawHazards() {
    const g = this.hazardGfx; g.clear();
    for (const gy of this.geysers) {
      if (gy.phase === 'warn') {
        const k = 1 - gy.timer / 1.1;
        g.lineStyle(3, 0xffd23f, 0.5 + 0.4 * Math.sin(this.elapsed * 30));
        g.strokeCircle(gy.x, gy.y, gy.r * (1.5 - 0.5 * k));
        g.fillStyle(0xff5a1a, 0.18 * k); g.fillCircle(gy.x, gy.y, gy.r);
      } else if (gy.phase === 'erupt') {
        const wob = 0.9 + 0.1 * Math.sin(this.elapsed * 40);
        g.fillStyle(0xff3b00, 0.85); g.fillCircle(gy.x, gy.y, gy.r * wob);
        g.fillStyle(0xffd23f, 0.9); g.fillCircle(gy.x, gy.y, gy.r * 0.55);
        g.fillStyle(0xfff3b0, 0.9); g.fillCircle(gy.x, gy.y, gy.r * 0.25);
      } else {
        g.fillStyle(0x000000, 0.25); g.fillCircle(gy.x, gy.y, gy.r * 0.6);
        g.lineStyle(2, 0xff7a1a, 0.4); g.strokeCircle(gy.x, gy.y, gy.r * 0.6);
      }
    }
    // Sudden death: the arena closes in — tint the dead zone + animated edge.
    if (this.suddenDeath) {
      const b = this.bounds;
      g.fillStyle(0xe23b3b, 0.16 + 0.04 * Math.sin(this.elapsed * 10));
      g.fillRect(ARENA.x, ARENA.y, b.x - ARENA.x, ARENA.h);
      g.fillRect(b.x + b.w, ARENA.y, (ARENA.x + ARENA.w) - (b.x + b.w), ARENA.h);
      g.fillRect(b.x, ARENA.y, b.w, b.y - ARENA.y);
      g.fillRect(b.x, b.y + b.h, b.w, (ARENA.y + ARENA.h) - (b.y + b.h));
      g.lineStyle(4, 0xff5a5a, 0.7 + 0.3 * Math.sin(this.elapsed * 12));
      g.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  drawDynamic() {
    const g = this.dynGfx; g.clear();
    // Bonus balloon — bobbing, with a string and a shine.
    if (this.bonusBalloon) {
      const bb = this.bonusBalloon;
      const by = bb.y + Math.sin(this.elapsed * 3) * 4;
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.beginPath(); g.moveTo(bb.x, by + 13); g.lineTo(bb.x + 3, by + 26); g.strokePath();
      g.fillStyle(0xff5d8f, 1); g.fillEllipse(bb.x, by, 22, 27);
      g.fillStyle(0xffffff, 0.45); g.fillCircle(bb.x - 5, by - 7, 4);
      g.lineStyle(2, 0xffffff, 0.85); g.strokeEllipse(bb.x, by, 22, 27);
    }
    for (const k of this.karts) {
      if (k.out) continue;
      if (k.shieldTimer > 0) { g.lineStyle(3, 0x9fe8ff, 0.8); g.strokeCircle(k.x, k.y, k.radius + 7); g.fillStyle(0x9fe8ff, 0.12); g.fillCircle(k.x, k.y, k.radius + 7); }
      if (k.starTimer > 0) { const hue = (this.elapsed * 1.4) % 1; k.sprite.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.8, 1).color); } else if (k.sprite.isTinted) k.sprite.clearTint();
      k.sprite.setAlpha(k.battleInvuln > 0 ? (0.4 + 0.4 * Math.sin(this.elapsed * 30)) : 1);
      // Orbiting triple shells circle the kart while held.
      if (k.orbitShells > 0) {
        for (let s = 0; s < k.orbitShells; s += 1) {
          const a = this.elapsed * 3 + (s / 3) * Math.PI * 2;
          const sx = k.x + Math.cos(a) * (k.radius + 13);
          const sy = k.y + Math.sin(a) * (k.radius + 13);
          g.fillStyle(0x1f8f3f, 1); g.fillCircle(sx, sy, 7);
          g.fillStyle(0x3ecf5a, 1); g.fillCircle(sx, sy, 5);
          g.fillStyle(0xffffff, 0.5); g.fillCircle(sx - 2, sy - 2, 1.8);
        }
      }
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
    const slotW = Math.min(150, (W - 40) / n);
    const startX = W / 2 - (n * slotW) / 2 + slotW / 2;
    const y = 58;
    this.karts.forEach((k, i) => {
      const x = startX + i * slotW;
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - slotW / 2 + 4, y - 13, slotW - 8, 26, 8);
      g.fillStyle(k.color, k.out ? 0.4 : 1); g.fillCircle(x - slotW / 2 + 18, y, 8);
      g.lineStyle(2, 0xffffff, k.out ? 0.4 : 0.9); g.strokeCircle(x - slotW / 2 + 18, y, 8);
      for (let b = 0; b < START_BALLOONS; b += 1) {
        const bx = x - slotW / 2 + 40 + b * 20;
        const on = b < k.balloons;
        g.fillStyle(on ? k.color : 0x2a2a33, on ? 1 : 0.7); g.fillCircle(bx, y - 1, 6.5);
        g.lineStyle(1.5, 0xffffff, on ? 0.9 : 0.3); g.strokeCircle(bx, y - 1, 6.5);
        g.lineStyle(1.5, 0xffffff, on ? 0.7 : 0.2); g.beginPath(); g.moveTo(bx, y + 5.5); g.lineTo(bx, y + 10); g.strokePath();
      }
      if (k.heldItem && !k.out) this.drawItemIcon(g, x + slotW / 2 - 18, y, k.heldItem);
    });
  }

  // Tiny held-item glyphs for the HUD chips (kept crude but readable at 14px).
  drawItemIcon(g, cx, cy, item) {
    if (item === 'boost') {
      g.fillStyle(0xffd23f, 1);
      g.fillTriangle(cx - 6, cy - 5, cx - 6, cy + 5, cx, cy);
      g.fillTriangle(cx, cy - 5, cx, cy + 5, cx + 6, cy);
    } else if (item === 'greenShell' || item === 'tripleShell') {
      g.fillStyle(0x1f8f3f, 1); g.fillCircle(cx, cy, 6);
      g.fillStyle(0x3ecf5a, 1); g.fillCircle(cx, cy, 4);
      if (item === 'tripleShell') { g.fillStyle(0xffffff, 0.95); g.fillCircle(cx + 5, cy - 5, 2.2); }
    } else if (item === 'redShell') {
      g.fillStyle(0xc0392b, 1); g.fillCircle(cx, cy, 6);
      g.fillStyle(0xff5a5a, 1); g.fillCircle(cx, cy, 4);
    } else if (item === 'trap') {
      g.fillStyle(0x15151c, 1); g.fillEllipse(cx, cy, 13, 8);
      g.fillStyle(0x6f6ab0, 0.85); g.fillEllipse(cx - 2, cy - 1, 4, 2.5);
    } else if (item === 'shield') {
      g.lineStyle(2, 0x9fe8ff, 1); g.strokeCircle(cx, cy, 6);
      g.fillStyle(0x9fe8ff, 0.25); g.fillCircle(cx, cy, 6);
    } else if (item === 'star') {
      g.fillStyle(0xffe14d, 1);
      g.fillTriangle(cx - 6, cy + 4, cx + 6, cy + 4, cx, cy - 7);
      g.fillTriangle(cx - 6, cy - 3, cx + 6, cy - 3, cx, cy + 8);
    } else if (item === 'dart') {
      g.fillStyle(0xff8a2c, 1); g.fillRect(cx - 7, cy - 1.5, 5, 3);
      g.fillStyle(0xffe14d, 1); g.fillTriangle(cx - 3, cy - 4, cx - 3, cy + 4, cx + 7, cy);
    } else if (item === 'lightning') {
      g.fillStyle(0xffe14d, 1);
      g.fillPoints([
        { x: cx + 2, y: cy - 7 }, { x: cx - 5, y: cy + 1 }, { x: cx - 1, y: cy + 1 },
        { x: cx - 2, y: cy + 7 }, { x: cx + 5, y: cy - 1 }, { x: cx + 1, y: cy - 1 },
      ], true);
    }
  }

  burst(x, y, tint) {
    this.particles.setParticleTint(tint);
    this.particles.emitParticleAt(x, y, 10);
  }
}
