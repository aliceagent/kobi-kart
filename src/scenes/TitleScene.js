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
    const horizon = H * 0.6;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x6fc3f0, 1); g.fillRect(0, 0, W, horizon * 0.5);
    g.fillStyle(0x8fd2f3, 1); g.fillRect(0, horizon * 0.5, W, horizon * 0.5);
    g.fillStyle(0x7ec850, 1); g.fillRect(0, horizon, W, H - horizon);

    const sx = W - 110;
    const sy = 96;
    g.fillStyle(0xffe14d, 0.9);
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      g.fillTriangle(
        sx + Math.cos(a) * 52, sy + Math.sin(a) * 52,
        sx + Math.cos(a + 0.12) * 84, sy + Math.sin(a + 0.12) * 84,
        sx + Math.cos(a - 0.12) * 84, sy + Math.sin(a - 0.12) * 84,
      );
    }
    g.fillStyle(0xffd23f, 1); g.fillCircle(sx, sy, 50);
    g.fillStyle(0xffe884, 1); g.fillCircle(sx - 14, sy - 14, 20);

    const cloud = (cx, cy, s) => {
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(cx, cy, 20 * s); g.fillCircle(cx + 24 * s, cy + 4 * s, 16 * s);
      g.fillCircle(cx - 24 * s, cy + 4 * s, 15 * s); g.fillRect(cx - 36 * s, cy + 2 * s, 72 * s, 16 * s);
    };
    cloud(150, 90, 1); cloud(W * 0.42, 60, 0.8); cloud(330, 150, 0.7);

    const tree = (tx, ty, s) => {
      g.fillStyle(0x7a4a22, 1); g.fillRect(tx - 5 * s, ty, 10 * s, 26 * s);
      g.fillStyle(0x2f7d36, 1); g.fillCircle(tx, ty, 26 * s); g.fillCircle(tx - 18 * s, ty + 8 * s, 18 * s); g.fillCircle(tx + 18 * s, ty + 8 * s, 18 * s);
      g.fillStyle(0x57b24d, 1); g.fillCircle(tx - 6 * s, ty - 8 * s, 12 * s);
    };
    tree(70, horizon + 18, 1); tree(W - 60, horizon + 26, 1.1);

    const roadTop = H * 0.74;
    const roadBot = H * 0.85;
    g.fillStyle(0xffffff, 1); g.fillRect(0, roadTop - 5, W, roadBot - roadTop + 10);
    g.fillStyle(0x4a4a55, 1); g.fillRect(0, roadTop, W, roadBot - roadTop);
    const cell = 18;
    const fx = W * 0.5;
    for (let row = 0, yy = roadTop; yy < roadBot; yy += cell, row += 1) {
      for (let c = 0; c < 2; c += 1) {
        g.fillStyle((row + c) % 2 === 0 ? 0xffffff : 0x111111, 1);
        g.fillRect(fx + c * cell - cell, yy, cell, cell);
      }
    }
    g.fillStyle(0xffe14d, 0.9);
    for (let xx = 0; xx < W; xx += 60) g.fillRect(xx, (roadTop + roadBot) / 2 - 2, 32, 4);
  }

  // A self-playing demo brawl in the lower scenery: all eight colours roam an
  // arena, chase rivals (collide), fire shells (attack) and pop shields (defend).
  createDemo(W, H) {
    this.arena = { left: 26, right: W - 26, top: H * 0.6, bottom: H - 58 };
    this.demoKarts = [];
    this.demoShells = [];
    this.demoSparks = [];
    this.demoGfx = this.add.graphics().setDepth(6);
    const a = this.arena;
    ROSTER.forEach((r) => {
      const sprite = this.add.image(0, 0, `kart_${r.id}`).setDepth(5).setScale(1.35);
      this.karts.push(sprite); // so the psychedelic tint can reach them
      this.demoKarts.push({
        sprite,
        x: a.left + Math.random() * (a.right - a.left),
        y: a.top + Math.random() * (a.bottom - a.top),
        heading: Math.random() * Math.PI * 2,
        speed: 90 + Math.random() * 40,
        vx: 0, vy: 0, radius: 20,
        rival: null, wp: null, wpTimer: 0, aggro: 0,
        fireTimer: 1 + Math.random() * 2,
        shieldTimer: 0, spin: 0,
      });
    });
  }

  updateDemo(dt) {
    if (!this.demoKarts) return;
    const a = this.arena;
    const ks = this.demoKarts;

    for (const k of ks) {
      if (k.spin > 0) {
        k.spin -= dt; k.heading += 9 * dt; k.speed *= 0.92;
      } else {
        // Mostly roam to a wandering waypoint (keeps the pack spread out); now
        // and then go "aggro" and charge the nearest rival, firing as you close.
        if (k.aggro > 0) {
          k.aggro -= dt;
          if (!k.rival || k.rival.spin > 0) k.rival = this.nearestDemoKart(k);
        } else {
          if (!k.wp || k.wpTimer <= 0 || ((k.x - k.wp.x) ** 2 + (k.y - k.wp.y) ** 2) < 48 * 48) {
            k.wp = { x: a.left + Math.random() * (a.right - a.left), y: a.top + Math.random() * (a.bottom - a.top) };
            k.wpTimer = 2 + Math.random() * 2.5;
          }
          k.wpTimer -= dt;
          if (Math.random() < 0.005) { k.aggro = 1.3 + Math.random() * 1.2; k.rival = this.nearestDemoKart(k); }
        }
        const aim = (k.aggro > 0 && k.rival) ? k.rival : k.wp;
        const desired = aim ? Math.atan2(aim.y - k.y, aim.x - k.x) : k.heading;
        const diff = Phaser.Math.Angle.Wrap(desired - k.heading);
        k.heading += Phaser.Math.Clamp(diff, -4 * dt, 4 * dt);
        k.speed += ((k.aggro > 0 ? 180 : 120) - k.speed) * 0.05;
        k.fireTimer -= dt;
        if (k.fireTimer <= 0 && k.aggro > 0 && k.rival && Math.abs(diff) < 0.4) {
          this.spawnDemoShell(k, k.rival);
          k.fireTimer = 1.6 + Math.random() * 2;
        }
        if (k.shieldTimer <= 0 && Math.random() < 0.004) k.shieldTimer = 1.8 + Math.random();
      }
      if (k.shieldTimer > 0) k.shieldTimer -= dt;

      const fx = Math.cos(k.heading) * k.speed;
      const fy = Math.sin(k.heading) * k.speed;
      k.vx += (fx - k.vx) * 0.25; k.vy += (fy - k.vy) * 0.25;
      k.x += k.vx * dt; k.y += k.vy * dt;
      if (k.x < a.left) { k.x = a.left; k.heading = Math.PI - k.heading; k.vx = Math.abs(k.vx) * 0.5; }
      else if (k.x > a.right) { k.x = a.right; k.heading = Math.PI - k.heading; k.vx = -Math.abs(k.vx) * 0.5; }
      if (k.y < a.top) { k.y = a.top; k.heading = -k.heading; k.vy = Math.abs(k.vy) * 0.5; }
      else if (k.y > a.bottom) { k.y = a.bottom; k.heading = -k.heading; k.vy = -Math.abs(k.vy) * 0.5; }
      k.sprite.setPosition(k.x, k.y);
      k.sprite.rotation = k.heading;
    }

    // Collisions: bump apart; a fast rammer spins out the slower kart (unless shielded).
    for (let i = 0; i < ks.length; i += 1) {
      for (let j = i + 1; j < ks.length; j += 1) {
        const A = ks[i]; const B = ks[j];
        const dx = B.x - A.x; const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = A.radius + B.radius;
        if (d >= min) continue;
        const nx = dx / d; const ny = dy / d; const ov = min - d;
        A.x -= nx * ov / 2; A.y -= ny * ov / 2; B.x += nx * ov / 2; B.y += ny * ov / 2;
        A.vx -= nx * 60; A.vy -= ny * 60; B.vx += nx * 60; B.vy += ny * 60;
        const slow = A.speed > B.speed ? B : A;
        if (Math.abs(A.speed - B.speed) > 70 && slow.spin <= 0) {
          if (slow.shieldTimer > 0) { slow.shieldTimer = 0; this.demoBurst(slow.x, slow.y, 0x9fe8ff); }
          else { slow.spin = 0.9; this.demoBurst(slow.x, slow.y, 0xffffff); }
        } else {
          this.demoBurst((A.x + B.x) / 2, (A.y + B.y) / 2, 0xffe14d);
        }
      }
    }

    // Shells: red ones home, green ones go straight; shields block them.
    for (let i = this.demoShells.length - 1; i >= 0; i -= 1) {
      const s = this.demoShells[i];
      s.life -= dt;
      if (s.target && s.target.spin <= 0) {
        const cur = Math.atan2(s.vy, s.vx);
        const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const na = cur + Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want - cur), -3 * dt, 3 * dt);
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.sprite.setPosition(s.x, s.y); s.sprite.rotation += dt * 12;
      let dead = s.life <= 0 || s.x < a.left - 24 || s.x > a.right + 24 || s.y < a.top - 24 || s.y > a.bottom + 24;
      if (!dead) {
        for (const k of ks) {
          if (k === s.owner || k.spin > 0) continue;
          if ((k.x - s.x) ** 2 + (k.y - s.y) ** 2 < (k.radius + 8) ** 2) {
            if (k.shieldTimer > 0) { k.shieldTimer = 0; this.demoBurst(s.x, s.y, 0x9fe8ff); }
            else { k.spin = 1; this.demoBurst(s.x, s.y, s.tint); }
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

  nearestDemoKart(k) {
    let best = null; let bd = Infinity;
    for (const o of this.demoKarts) {
      if (o === k || o.spin > 0) continue;
      const d = (o.x - k.x) ** 2 + (o.y - k.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  spawnDemoShell(owner, target) {
    const red = Math.random() < 0.5;
    const ang = Math.atan2(target.y - owner.y, target.x - owner.x);
    const sp = 235;
    const sprite = this.add.image(owner.x + Math.cos(ang) * 22, owner.y + Math.sin(ang) * 22, red ? 'shell_red' : 'shell_green')
      .setDepth(6).setScale(0.85);
    this.demoShells.push({
      sprite, x: sprite.x, y: sprite.y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 3,
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
