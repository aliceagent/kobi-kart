import Phaser from 'phaser';
import { initGrandPrix, ROSTER } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.drawScenery(W, H);

    // Title.
    const title = this.add.text(W / 2, H * 0.22, 'KOBI KART', {
      fontFamily: 'monospace', fontSize: '76px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 11,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.05 }, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(W / 2, H * 0.345, '4-track cup  ·  power-ups  ·  same keyboard', {
      fontFamily: 'monospace', fontSize: '17px', color: '#11364f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.makeButton(W / 2, H * 0.45, '1 PLAYER', 0xff4d4d, () => this.startGame(1));
    this.makeButton(W / 2, H * 0.555, '2 PLAYERS', 0x4d8bff, () => this.startGame(2));

    const diff = (this.registry.get('difficulty') || 'medium').toUpperCase();
    this.makeButton(W / 2, H * 0.655, `SETTINGS · AI ${diff}`, 0x9b6bce,
      () => this.scene.start('SettingsScene'), { w: 320, h: 42, fontSize: 18 });

    this.add.text(W / 2, H - 22,
      'P1: A/D · S · W · E/Space      P2: ←/→ · ↓ · ↑ · RShift or \\ //      M: mute',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(20).setAlpha(0.85);

    addMuteButton(this);

    this.input.keyboard.once('keydown-ONE', () => this.startGame(1));
    this.input.keyboard.once('keydown-TWO', () => this.startGame(2));
    this.input.keyboard.once('keydown-S', () => this.scene.start('SettingsScene'));

    // Start cheery menu music (audio unlocks on the first user gesture).
    Audio.resumeAudio();
    Audio.startMusic('Menu');
    const unlock = () => { Audio.resumeAudio(); Audio.startMusic('Menu'); };
    this.input.once('pointerdown', unlock);
    this.input.keyboard.once('keydown', unlock);
    this.events.once('shutdown', () => Audio.stopMusic());
  }

  drawScenery(W, H) {
    const horizon = H * 0.6;
    const g = this.add.graphics().setDepth(0);

    // Sky (banded gradient) + grass.
    g.fillStyle(0x6fc3f0, 1); g.fillRect(0, 0, W, horizon * 0.5);
    g.fillStyle(0x8fd2f3, 1); g.fillRect(0, horizon * 0.5, W, horizon * 0.5);
    g.fillStyle(0x7ec850, 1); g.fillRect(0, horizon, W, H - horizon);

    // Sun with rays.
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

    // Clouds.
    const cloud = (cx, cy, s) => {
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(cx, cy, 20 * s); g.fillCircle(cx + 24 * s, cy + 4 * s, 16 * s);
      g.fillCircle(cx - 24 * s, cy + 4 * s, 15 * s); g.fillRect(cx - 36 * s, cy + 2 * s, 72 * s, 16 * s);
    };
    cloud(150, 90, 1); cloud(W * 0.42, 60, 0.8); cloud(330, 150, 0.7);

    // Trees on the grass.
    const tree = (tx, ty, s) => {
      g.fillStyle(0x7a4a22, 1); g.fillRect(tx - 5 * s, ty, 10 * s, 26 * s);
      g.fillStyle(0x2f7d36, 1); g.fillCircle(tx, ty, 26 * s); g.fillCircle(tx - 18 * s, ty + 8 * s, 18 * s); g.fillCircle(tx + 18 * s, ty + 8 * s, 18 * s);
      g.fillStyle(0x57b24d, 1); g.fillCircle(tx - 6 * s, ty - 8 * s, 12 * s);
    };
    tree(70, horizon + 18, 1); tree(W - 60, horizon + 26, 1.1);

    // Race track across the lower third.
    const roadTop = H * 0.74;
    const roadBot = H * 0.92;
    g.fillStyle(0xffffff, 1); g.fillRect(0, roadTop - 5, W, roadBot - roadTop + 10);
    g.fillStyle(0x4a4a55, 1); g.fillRect(0, roadTop, W, roadBot - roadTop);
    // Checkered start/finish strip.
    const cell = 18;
    const fx = W * 0.5;
    for (let row = 0, yy = roadTop; yy < roadBot; yy += cell, row += 1) {
      for (let c = 0; c < 2; c += 1) {
        g.fillStyle((row + c) % 2 === 0 ? 0xffffff : 0x111111, 1);
        g.fillRect(fx + c * cell - cell, yy, cell, cell);
      }
    }
    // Dashed centre line.
    g.fillStyle(0xffe14d, 0.9);
    for (let xx = 0; xx < W; xx += 60) g.fillRect(xx, (roadTop + roadBot) / 2 - 2, 32, 4);

    // Karts cruising along the track.
    const laneY = (roadTop + roadBot) / 2;
    ROSTER.forEach((r, i) => {
      const k = this.add.image(-80 - i * 120, laneY + (i % 2 ? 18 : -16), `kart_${r.id}`).setDepth(5).setScale(1.5);
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

  startGame(count) {
    Audio.resumeAudio();
    initGrandPrix(this.registry, count);
    this.scene.start('RaceScene');
  }
}
