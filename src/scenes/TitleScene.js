import Phaser from 'phaser';
import { ROSTER } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

function hueHex(h) {
  const c = Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, 0.9, 1).color;
  return `#${c.toString(16).padStart(6, '0')}`;
}

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data) {
    this.justUnlocked = !!(data && data.justUnlocked);
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.psychedelic = !!this.registry.get('rainbow');
    this.psyPhase = 0;
    this.karts = [];

    if (this.psychedelic) {
      this.psyGfx = this.add.graphics().setDepth(0); // animated in update()
    } else {
      this.drawScenery(W, H);
    }
    this.createDemo(W, H);

    // Title.
    this.titleText = this.add.text(W / 2, H * 0.18, 'KOBI KART', {
      fontFamily: 'monospace', fontSize: '72px', color: '#ffe14d', fontStyle: 'bold',
      stroke: this.psychedelic ? '#5a1ea0' : '#c0392b', strokeThickness: 11,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: this.titleText, scale: { from: 1, to: 1.05 }, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(W / 2, H * 0.285,
      this.psychedelic ? '★ RAINBOW ROAD UNLOCKED ★  ·  5 races' : '3 cups  ·  power-ups  ·  same keyboard', {
        fontFamily: 'monospace', fontSize: '16px',
        color: this.psychedelic ? '#ffffff' : '#11364f', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(20);

    this.add.text(W / 2, H * 0.355,
      '💨 hold BRAKE while turning to DRIFT — release for a mini-boost!', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#11364f', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(20);

    this.makeButton(W / 2, H * 0.43, '1 PLAYER', 0xff4d4d, () => this.startGame(1), { h: 52 });
    this.makeButton(W / 2, H * 0.54, '2 PLAYERS', 0x4d8bff, () => this.startGame(2), { h: 52 });

    this.makeButton(W / 2 - 162, H * 0.645, 'HOW TO PLAY', 0x2fa86a,
      () => this.scene.start('TutorialScene'), { w: 300, h: 44, fontSize: 18 });
    this.makeButton(W / 2 + 162, H * 0.645, 'SETTINGS', 0x9b6bce,
      () => this.scene.start('SettingsScene'), { w: 300, h: 44, fontSize: 20 });

    // Controls — one labelled line per player so every key is clear. A dark
    // strip + outline keeps them readable over the grass.
    const cg = this.add.graphics().setDepth(19);
    cg.fillStyle(0x000000, 0.4);
    cg.fillRect(0, H - 54, W, 54);
    const ctrlStyle = {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    };
    this.add.text(W / 2, H - 40,
      'P1:  A/D steer · S brake · W boost · E or SPACE = use item        M = mute',
      ctrlStyle).setOrigin(0.5).setDepth(20);
    this.add.text(W / 2, H - 20,
      'P2:  ←/→ steer · ↓ brake · ↑ boost · RIGHT-SHIFT, \\ or / = use item',
      ctrlStyle).setOrigin(0.5).setDepth(20);

    addMuteButton(this);

    this.input.keyboard.once('keydown-ONE', () => this.startGame(1));
    this.input.keyboard.once('keydown-TWO', () => this.startGame(2));
    this.input.keyboard.once('keydown-S', () => this.scene.start('SettingsScene'));
    this.input.keyboard.once('keydown-H', () => this.scene.start('TutorialScene'));
    this.setupKonami();

    // Menu music (funky once Rainbow Road is unlocked). Audio unlocks on the
    // first user gesture.
    const track = this.psychedelic ? 'Funky' : 'Menu';
    Audio.resumeAudio();
    Audio.startMusic(track);
    const unlock = () => { Audio.resumeAudio(); Audio.startMusic(track); };
    this.input.once('pointerdown', unlock);
    this.input.keyboard.once('keydown', unlock);
    this.events.once('shutdown', () => Audio.stopMusic());

    if (this.justUnlocked) this.showUnlockToast(W, H);
  }

  setupKonami() {
    this.konamiPos = 0;
    this.input.keyboard.on('keydown', (e) => {
      if (this.registry.get('rainbow')) return; // already unlocked
      if (e.code === KONAMI[this.konamiPos]) {
        this.konamiPos += 1;
        if (this.konamiPos === KONAMI.length) this.unlockRainbow();
      } else {
        this.konamiPos = e.code === KONAMI[0] ? 1 : 0;
      }
    });
  }

  unlockRainbow() {
    this.registry.set('rainbow', true);
    Audio.resumeAudio();
    Audio.sfx('fanfare');
    this.scene.restart({ justUnlocked: true });
  }

  showUnlockToast(W, H) {
    const t = this.add.text(W / 2, H * 0.46, '🌈  RAINBOW ROAD UNLOCKED!  🌈', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, scale: { from: 0.4, to: 1.2 }, duration: 500, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, delay: 1600, duration: 700, onComplete: () => t.destroy() });
  }

  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.demoT = (this.demoT || 0) + dt;
    this.updateDemo(dt);

    if (this.clouds) {
      const W = this.scale.width;
      for (const c of this.clouds) { c.x += 5 * dt; if (c.x > W + 70) c.x = -70; }
      this.drawClouds();
    }

    if (!this.psychedelic || !this.psyGfx) return;
    this.psyPhase += dt;
    const W = this.scale.width;
    const H = this.scale.height;
    const g = this.psyGfx;
    g.clear();
    // Concentric rainbow rings pulsing out from centre.
    const cx = W / 2;
    const cy = H * 0.5;
    const maxR = Math.hypot(W, H) / 2 + 30;
    for (let r = maxR; r > 0; r -= 26) {
      const hue = (r / 130 - this.psyPhase * 0.5);
      g.fillStyle(Phaser.Display.Color.HSVToRGB(((hue % 1) + 1) % 1, 0.65, 1).color, 1);
      g.fillCircle(cx, cy, r);
    }
    // Hue-cycle + wobble the title.
    this.titleText.setColor(hueHex(this.psyPhase * 0.4));
    this.titleText.rotation = Math.sin(this.psyPhase * 2.5) * 0.04;
    // Rainbow-tint the cruising karts.
    this.karts.forEach((k, i) => k.setTint(Phaser.Display.Color.HSVToRGB(((this.psyPhase * 0.5 + i * 0.2) % 1), 0.8, 1).color));
  }

  drawScenery(W, H) {
    const horizon = H * 0.46;
    const roadTop = H * 0.66;
    const roadBot = H - 56;
    const g = this.add.graphics().setDepth(0);

    // Sky gradient.
    const skyTop = Phaser.Display.Color.ValueToColor(0x49a8ec);
    const skyBot = Phaser.Display.Color.ValueToColor(0xc7ecff);
    const bands = 18;
    for (let i = 0; i < bands; i += 1) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(skyTop, skyBot, bands, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, Math.floor((i * horizon) / bands), W, Math.ceil(horizon / bands) + 1);
    }

    // Sun with glow + rays.
    const sx = W - 118; const sy = 82;
    g.fillStyle(0xfff3a0, 0.22); g.fillCircle(sx, sy, 96);
    g.fillStyle(0xffe14d, 0.9);
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      g.fillTriangle(sx + Math.cos(a) * 50, sy + Math.sin(a) * 50,
        sx + Math.cos(a + 0.1) * 82, sy + Math.sin(a + 0.1) * 82,
        sx + Math.cos(a - 0.1) * 82, sy + Math.sin(a - 0.1) * 82);
    }
    g.fillStyle(0xffd23f, 1); g.fillCircle(sx, sy, 48);
    g.fillStyle(0xffe884, 1); g.fillCircle(sx - 13, sy - 13, 18);

    // Rolling hills + grass.
    g.fillStyle(0x68bd54, 1);
    for (let hx = -40; hx < W + 90; hx += 150) g.fillCircle(hx, horizon + 26, 80);
    g.fillStyle(0x7ec850, 1); g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle(0x88d35a, 1); g.fillRect(0, horizon, W, 8);

    // Grandstand + crowd, roadside trees and tyre stacks.
    this.drawGrandstand(g, W, roadTop - 8);
    this.drawTree(g, 56, roadTop - 14, 1.0);
    this.drawTree(g, W - 54, roadTop - 10, 1.15);
    this.drawTyreStack(g, 118, roadTop - 13);
    this.drawTyreStack(g, W - 140, roadTop - 13);

    // ---- Wide racetrack ----
    const rsH = 11;
    this.drawRumble(g, roadTop - rsH, W, rsH);
    this.drawRumble(g, roadBot, W, rsH);
    g.fillStyle(0xffffff, 1); g.fillRect(0, roadTop - 2, W, 4); g.fillRect(0, roadBot - 2, W, 4);
    g.fillStyle(0x4a4a55, 1); g.fillRect(0, roadTop, W, roadBot - roadTop);
    g.fillStyle(0xffffff, 0.05); g.fillRect(0, roadTop, W, (roadBot - roadTop) * 0.45);
    const lane1 = roadTop + (roadBot - roadTop) / 3;
    const lane2 = roadTop + (2 * (roadBot - roadTop)) / 3;
    g.fillStyle(0xffe14d, 0.85);
    for (let xx = 8; xx < W; xx += 66) { g.fillRect(xx, lane1 - 2, 34, 4); g.fillRect(xx + 33, lane2 - 2, 34, 4); }
    this.drawChecker(g, W * 0.5 - 19, roadTop, 38, roadBot - roadTop, 12);

    // Bunting across the top + drifting clouds (animated in update()).
    this.drawBunting(g, W);
    this.cloudGfx = this.add.graphics().setDepth(1);
    this.clouds = [
      { x: W * 0.18, y: 70, s: 1 }, { x: W * 0.5, y: 48, s: 0.8 },
      { x: W * 0.82, y: 104, s: 0.7 }, { x: W * 0.36, y: 128, s: 0.6 },
    ];
    this.drawClouds();
  }

  drawClouds() {
    const g = this.cloudGfx;
    if (!g) return;
    g.clear();
    for (const c of this.clouds) {
      const s = c.s;
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(c.x, c.y, 20 * s); g.fillCircle(c.x + 24 * s, c.y + 5 * s, 16 * s);
      g.fillCircle(c.x - 24 * s, c.y + 5 * s, 15 * s); g.fillRect(c.x - 36 * s, c.y + 3 * s, 72 * s, 15 * s);
      g.fillStyle(0xdff2ff, 0.85); g.fillRect(c.x - 36 * s, c.y + 14 * s, 72 * s, 4 * s);
    }
  }

  drawTree(g, tx, ty, s) {
    g.fillStyle(0x6b4423, 1); g.fillRect(tx - 5 * s, ty, 10 * s, 28 * s);
    g.fillStyle(0x2f7d36, 1);
    g.fillCircle(tx, ty - 2 * s, 26 * s); g.fillCircle(tx - 18 * s, ty + 8 * s, 18 * s); g.fillCircle(tx + 18 * s, ty + 8 * s, 18 * s);
    g.fillStyle(0x57b24d, 1); g.fillCircle(tx - 7 * s, ty - 10 * s, 12 * s);
  }

  drawTyreStack(g, x, y) {
    for (let i = 0; i < 3; i += 1) {
      const cy = y - i * 11;
      g.fillStyle(0x1c1c22, 1); g.fillCircle(x, cy, 9);
      g.fillStyle(0x33333c, 1); g.fillCircle(x, cy, 4.5);
    }
  }

  drawRumble(g, y, W, h) {
    const cell = 26;
    for (let i = 0, x = 0; x < W; x += cell, i += 1) {
      g.fillStyle(i % 2 ? 0xffffff : 0xe2403a, 1);
      g.fillRect(x, y, cell, h);
    }
  }

  drawChecker(g, x, y, w, h, cell) {
    const cols = Math.max(2, Math.round(w / cell));
    const cw = w / cols;
    for (let r = 0, yy = y; yy < y + h; yy += cell, r += 1) {
      for (let c = 0; c < cols; c += 1) {
        g.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x111111, 1);
        g.fillRect(x + c * cw, yy, cw + 0.5, Math.min(cell, y + h - yy) + 0.5);
      }
    }
  }

  drawGrandstand(g, W, baseY) {
    const sw = 300; const sh = 56;
    const sx = W / 2 - sw / 2; const sy = baseY - sh;
    g.fillStyle(0x3a4a8c, 1); g.fillRect(sx - 12, sy - 12, sw + 24, 14); // roof
    g.fillStyle(0x6f7794, 1); g.fillRect(sx, sy, sw, sh); // stand
    const cols = [0xff5d8f, 0x4d8bff, 0xffd23f, 0x57c75a, 0xb06bff, 0xffffff, 0xff8a3c];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 130; i += 1) {
      g.fillStyle(cols[Math.floor(rnd() * cols.length)], 1);
      g.fillCircle(sx + 6 + rnd() * (sw - 12), sy + 6 + rnd() * (sh - 10), 2.4);
    }
  }

  drawBunting(g, W) {
    const cols = [0xe2403a, 0xffd23f, 0x57c75a, 0x4d8bff, 0xb06bff];
    const span = 30;
    g.fillStyle(0x222222, 0.55); g.fillRect(0, 7, W, 2);
    for (let i = 0, x = 0; x < W; x += span, i += 1) {
      g.fillStyle(cols[i % cols.length], 0.95);
      g.fillTriangle(x + 2, 9, x + span - 2, 9, x + span / 2, 24);
    }
  }

  // A self-playing demo RACE in the lower scenery: up to four karts stream
  // left→right, weaving and overtaking, jostling on contact (collision), firing
  // shells forward (attack) and popping shields (defense). When a kart exits the
  // right it loops back in on the left as the next colour, so all eight cycle by.
  createDemo(W, H) {
    // Keep the racers inside the asphalt (matches the road drawn in drawScenery).
    const roadTop = H * 0.66; const roadBot = H - 56;
    this.demoBand = { top: roadTop + 24, bottom: roadBot - 24, left: -60, right: W + 40 };
    this.demoKarts = [];
    this.demoShells = [];
    this.demoSparks = [];
    this.demoColorIdx = 0;
    this.demoGfx = this.add.graphics().setDepth(6);
    const b = this.demoBand;
    for (let i = 0; i < 4; i += 1) {
      const sprite = this.add.image(0, 0, 'kart_red').setDepth(5).setScale(1.35);
      this.karts.push(sprite); // so the psychedelic tint can reach them
      const k = {
        sprite,
        x: b.left - i * 170, // staggered, entering from the left
        y: b.top + Math.random() * (b.bottom - b.top),
        laneY: 0, laneTimer: 0,
        speed: 130 + Math.random() * 80,
        baseSpeed: 0, vy: 0, radius: 20,
        heading: 0, spin: 0, shieldTimer: 0, fireTimer: 1.5 + Math.random() * 3,
      };
      k.baseSpeed = k.speed; k.laneY = k.y;
      this.assignDemoColor(k);
      this.demoKarts.push(k);
    }
  }

  assignDemoColor(k) {
    const r = ROSTER[this.demoColorIdx % ROSTER.length];
    this.demoColorIdx += 1;
    k.id = r.id;
    k.sprite.setTexture(`kart_${r.id}`);
  }

  recycleDemoKart(k) {
    const b = this.demoBand;
    k.x = b.left - Math.random() * 140;
    k.y = b.top + Math.random() * (b.bottom - b.top);
    k.laneY = k.y; k.laneTimer = 0; k.vy = 0; k.heading = 0;
    k.speed = 130 + Math.random() * 80; k.baseSpeed = k.speed;
    k.spin = 0; k.shieldTimer = 0; k.fireTimer = 1.5 + Math.random() * 3;
    this.assignDemoColor(k);
  }

  updateDemo(dt) {
    if (!this.demoKarts) return;
    const b = this.demoBand;
    const ks = this.demoKarts;

    for (const k of ks) {
      if (k.spin > 0) {
        // Spun by a shell: wobble but keep drifting forward, then recover.
        k.spin -= dt;
        k.heading += 11 * dt;
        k.x += k.speed * 0.45 * dt;
      } else {
        // Weave between lanes while racing rightward; overtaking comes from the
        // per-kart speed differences.
        k.laneTimer -= dt;
        if (k.laneTimer <= 0) { k.laneY = b.top + Math.random() * (b.bottom - b.top); k.laneTimer = 1.2 + Math.random() * 1.8; }
        k.vy += ((k.laneY - k.y) * 2 - k.vy) * 0.1;
        k.vy = Phaser.Math.Clamp(k.vy, -70, 70);
        k.y += k.vy * dt;
        k.heading = Phaser.Math.Clamp(k.vy / 240, -0.22, 0.22); // slight tilt with the weave
        k.speed += (k.baseSpeed - k.speed) * 0.05;
        k.x += k.speed * dt;
        k.fireTimer -= dt;
        if (k.fireTimer <= 0) {
          this.spawnDemoShell(k, this.demoKartAhead(k));
          k.fireTimer = 2.5 + Math.random() * 3.5;
        }
        if (k.shieldTimer <= 0 && Math.random() < 0.003) k.shieldTimer = 1.6 + Math.random();
      }
      if (k.shieldTimer > 0) k.shieldTimer -= dt;
      if (k.y < b.top) { k.y = b.top; k.vy = Math.abs(k.vy); }
      else if (k.y > b.bottom) { k.y = b.bottom; k.vy = -Math.abs(k.vy); }
      k.sprite.setPosition(k.x, k.y);
      k.sprite.rotation = k.heading;
      if (k.x > b.right + 30) this.recycleDemoKart(k);
    }

    // Collisions: jostle apart as they overtake (a little spark, no spin).
    for (let i = 0; i < ks.length; i += 1) {
      for (let j = i + 1; j < ks.length; j += 1) {
        const A = ks[i]; const B = ks[j];
        const dx = B.x - A.x; const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = A.radius + B.radius;
        if (d >= min) continue;
        const ny = dy / d; const ov = min - d;
        A.y -= ny * ov / 2; B.y += ny * ov / 2; // separate vertically so they keep racing
        A.vy -= ny * 40; B.vy += ny * 40;
        this.demoBurst((A.x + B.x) / 2, (A.y + B.y) / 2, 0xffe14d);
      }
    }

    // Shells fly forward; red ones home onto the kart ahead, shields block them.
    for (let i = this.demoShells.length - 1; i >= 0; i -= 1) {
      const s = this.demoShells[i];
      s.life -= dt;
      if (s.target && s.target.spin <= 0) {
        const cur = Math.atan2(s.vy, s.vx);
        const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const na = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - cur), -2.5 * dt, 2.5 * dt);
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.sprite.setPosition(s.x, s.y); s.sprite.rotation += dt * 12;
      let dead = s.life <= 0 || s.x < b.left - 30 || s.x > b.right + 30;
      if (!dead) {
        for (const k of ks) {
          if (k === s.owner || k.spin > 0) continue;
          if ((k.x - s.x) ** 2 + (k.y - s.y) ** 2 < (k.radius + 8) ** 2) {
            if (k.shieldTimer > 0) { k.shieldTimer = 0; this.demoBurst(s.x, s.y, 0x9fe8ff); }
            else { k.spin = 0.9; this.demoBurst(s.x, s.y, s.tint); }
            dead = true; break;
          }
        }
      }
      if (dead) { s.sprite.destroy(); this.demoShells.splice(i, 1); }
    }

    // Shields + spark bursts.
    const g = this.demoGfx;
    g.clear();
    for (const k of ks) {
      if (k.shieldTimer > 0) {
        g.lineStyle(3, 0x9fe8ff, 0.5 + 0.3 * Math.sin(this.demoT * 14 + k.x));
        g.strokeCircle(k.x, k.y, k.radius + 5);
      }
    }
    for (let i = this.demoSparks.length - 1; i >= 0; i -= 1) {
      const p = this.demoSparks[i];
      p.life -= dt;
      if (p.life <= 0) { this.demoSparks.splice(i, 1); continue; }
      g.fillStyle(p.color, Math.max(0, p.life * 2.4));
      g.fillCircle(p.x, p.y, 2 + (0.35 - p.life) * 12);
    }
  }

  // The kart just ahead (to the right) of this one — a red shell's prey.
  demoKartAhead(k) {
    let best = null; let bd = Infinity;
    for (const o of this.demoKarts) {
      if (o === k || o.spin > 0 || o.x <= k.x) continue;
      const d = o.x - k.x;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  spawnDemoShell(owner, target) {
    const red = !!target && Math.random() < 0.6; // red homes; green flies straight
    const ang = target ? Math.atan2(target.y - owner.y, target.x - owner.x) : 0;
    const sp = 240;
    const sprite = this.add.image(owner.x + Math.cos(ang) * 22, owner.y + Math.sin(ang) * 22, red ? 'shell_red' : 'shell_green')
      .setDepth(6).setScale(0.85);
    this.demoShells.push({
      sprite, x: sprite.x, y: sprite.y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 3.5,
      owner, target: red ? target : null, tint: red ? 0xff5a5a : 0x33c75a,
    });
  }

  demoBurst(x, y, color) {
    for (let i = 0; i < 5; i += 1) {
      this.demoSparks.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, color, life: 0.35 });
    }
  }

  makeButton(x, y, label, color, onClick, opts = {}) {
    const w = opts.w || 280;
    const h = opts.h || 54;
    const fontSize = opts.fontSize || 26;
    const g = this.add.graphics().setDepth(20);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 5, w, h, 14);
      g.fillStyle(color, hover ? 1 : 0.9); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
      g.lineStyle(3, 0xffffff, hover ? 1 : 0.8); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    };
    draw(false);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); text.setScale(1.05); });
    zone.on('pointerout', () => { draw(false); text.setScale(1); });
    zone.on('pointerdown', onClick);
  }

  startGame(count) {
    Audio.resumeAudio();
    this.scene.start('CupSelectScene', { playerCount: count });
  }
}
