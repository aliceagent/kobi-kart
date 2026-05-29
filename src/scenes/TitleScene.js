import Phaser from 'phaser';
import { initGrandPrix, ROSTER } from '../GrandPrix.js';
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
    this.addCruisingKarts(W, H);

    // Title.
    this.titleText = this.add.text(W / 2, H * 0.18, 'KOBI KART', {
      fontFamily: 'monospace', fontSize: '72px', color: '#ffe14d', fontStyle: 'bold',
      stroke: this.psychedelic ? '#5a1ea0' : '#c0392b', strokeThickness: 11,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: this.titleText, scale: { from: 1, to: 1.05 }, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(W / 2, H * 0.285,
      this.psychedelic ? '★ RAINBOW ROAD UNLOCKED ★  ·  5 races' : '4-track cup  ·  power-ups  ·  same keyboard', {
        fontFamily: 'monospace', fontSize: '16px',
        color: this.psychedelic ? '#ffffff' : '#11364f', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(20);

    this.makeButton(W / 2, H * 0.36, '1 PLAYER', 0xff4d4d, () => this.startGame(1), { h: 48 });
    this.makeButton(W / 2, H * 0.455, '2 PLAYERS', 0x4d8bff, () => this.startGame(2), { h: 48 });

    this.makeSpeedSelector(W / 2, H * 0.595);

    const diff = (this.registry.get('difficulty') || 'medium').toUpperCase();
    this.makeButton(W / 2 - 162, H * 0.688, 'HOW TO PLAY', 0x2fa86a,
      () => this.scene.start('TutorialScene'), { w: 300, h: 40, fontSize: 18 });
    this.makeButton(W / 2 + 162, H * 0.688, `SETTINGS · AI ${diff}`, 0x9b6bce,
      () => this.scene.start('SettingsScene'), { w: 300, h: 40, fontSize: 16 });

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
    if (!this.psychedelic || !this.psyGfx) return;
    const dt = deltaMs / 1000;
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

  addCruisingKarts(W, H) {
    const laneY = (H * 0.74 + H * 0.85) / 2;
    ROSTER.forEach((r, i) => {
      const k = this.add.image(-80 - i * 120, laneY + (i % 2 ? 18 : -16), `kart_${r.id}`).setDepth(5).setScale(1.5);
      this.karts.push(k);
      this.tweens.add({
        targets: k, x: W + 90, duration: 4600 + i * 700, repeat: -1, delay: i * 700,
        onRepeat: () => { k.y = laneY + (Math.random() < 0.5 ? -16 : 18); },
      });
    });
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

  // Segmented Slow / Medium / Fast car-speed picker.
  makeSpeedSelector(cx, y) {
    this.add.text(cx, y - 30, 'CAR SPEED', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    const opts = [
      { label: 'SLOW', key: 'slow', color: 0x57c75a },
      { label: 'MEDIUM', key: 'medium', color: 0xffd23f },
      { label: 'FAST', key: 'fast', color: 0xff4d4d },
    ];
    const bw = 120;
    const bh = 38;
    const gap = 10;
    const total = opts.length * bw + (opts.length - 1) * gap;
    const x0 = cx - total / 2 + bw / 2;

    this.speedButtons = [];
    opts.forEach((o, i) => {
      const x = x0 + i * (bw + gap);
      const g = this.add.graphics().setDepth(20);
      const text = this.add.text(x, y, o.label, {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(21);
      this.speedButtons.push({ x, y, bw, bh, g, key: o.key, color: o.color });
      this.add.zone(x, y, bw, bh).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.selectSpeed(o.key));
    });
    this.drawSpeedButtons();
  }

  drawSpeedButtons() {
    const cur = this.registry.get('carSpeed') || 'medium';
    this.speedButtons.forEach((b) => {
      const sel = b.key === cur;
      b.g.clear();
      b.g.fillStyle(0x000000, 0.3); b.g.fillRoundedRect(b.x - b.bw / 2 + 3, b.y - b.bh / 2 + 3, b.bw, b.bh, 10);
      b.g.fillStyle(b.color, sel ? 1 : 0.32); b.g.fillRoundedRect(b.x - b.bw / 2, b.y - b.bh / 2, b.bw, b.bh, 10);
      b.g.lineStyle(sel ? 4 : 2, 0xffffff, sel ? 1 : 0.5); b.g.strokeRoundedRect(b.x - b.bw / 2, b.y - b.bh / 2, b.bw, b.bh, 10);
    });
  }

  selectSpeed(key) {
    if ((this.registry.get('carSpeed') || 'medium') !== key) Audio.sfx('pickup');
    this.registry.set('carSpeed', key);
    try { window.localStorage.setItem('kobikart.carSpeed', key); } catch (e) { /* ignore */ }
    this.drawSpeedButtons();
  }

  startGame(count) {
    Audio.resumeAudio();
    initGrandPrix(this.registry, count);
    this.scene.start('RaceScene');
  }
}
