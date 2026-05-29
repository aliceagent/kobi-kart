import Phaser from 'phaser';
import { totalStandings } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const MEDAL = [0xffd23f, 0xc7ccd6, 0xcd7f32, 0x8a8f96]; // gold / silver / bronze / grey
const ORD = ['1st', '2nd', '3rd', '4th'];

export default class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.gp = this.registry.get('gp');
    const results = this.gp.lastResults || [];
    const totalRaces = this.gp.themeOrder.length;
    const isLast = this.gp.raceIndex >= totalRaces - 1;
    const themeName = (this.gp.themeOrder[this.gp.raceIndex] || '').toUpperCase();

    // Backdrop.
    const bg = this.add.graphics();
    bg.fillStyle(0x161528, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x20203a, 1); bg.fillRect(0, 96, W, H - 96);
    bg.fillStyle(0x3a2f6e, 1); bg.fillRect(0, 0, W, 8);

    // Light confetti celebration.
    this.add.particles(0, -10, 'spark', {
      x: { min: 0, max: W }, y: -10, lifespan: 5000,
      speedY: { min: 50, max: 130 }, speedX: { min: -30, max: 30 },
      scale: { min: 0.5, max: 1.0 }, rotate: { min: 0, max: 360 }, gravityY: 30,
      frequency: 130, quantity: 1,
      tint: [0xff5d8f, 0x4d8bff, 0xffd23f, 0x57c75a, 0xb06bff, 0xffffff],
    }).setDepth(1);

    this.add.text(W / 2, 30, `RACE ${this.gp.raceIndex + 1} / ${totalRaces} RESULTS`, {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(5);
    this.add.text(W / 2, 64, `${themeName} TRACK`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#8be8f0',
    }).setOrigin(0.5).setDepth(5);

    // Finish-order rows.
    const rowH = 64;
    const top = 120;
    const cardW = 540;
    const cx = W / 2;
    results.forEach((r, i) => {
      const y = top + i * (rowH + 8);
      const container = this.add.container(cx, y).setDepth(5);
      const g = this.add.graphics();
      const first = i === 0;
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(-cardW / 2 + 3, -rowH / 2 + 4, cardW, rowH, 12);
      g.fillStyle(first ? 0x3a3320 : 0x2b2b44, 1); g.fillRoundedRect(-cardW / 2, -rowH / 2, cardW, rowH, 12);
      g.lineStyle(first ? 4 : 2, MEDAL[i], first ? 1 : 0.7); g.strokeRoundedRect(-cardW / 2, -rowH / 2, cardW, rowH, 12);
      container.add(g);

      // Medal.
      const mx = -cardW / 2 + 40;
      const medal = this.add.graphics();
      medal.fillStyle(0x000000, 0.25); medal.fillCircle(mx + 2, 3, 22);
      medal.fillStyle(MEDAL[i], 1); medal.fillCircle(mx, 0, 22);
      medal.lineStyle(3, 0xffffff, 0.85); medal.strokeCircle(mx, 0, 22);
      container.add(medal);
      container.add(this.add.text(mx, 0, `${i + 1}`, {
        fontFamily: 'monospace', fontSize: '24px', color: '#222222', fontStyle: 'bold',
      }).setOrigin(0.5));

      // Kart + name.
      const kart = this.add.image(mx + 70, 0, `kart_${r.id}`).setScale(1.2);
      container.add(kart);
      container.add(this.add.text(mx + 110, 0, `${ORD[i]}   ${r.name}`, {
        fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold',
        color: Phaser.Display.Color.IntegerToColor(r.color).rgba,
      }).setOrigin(0, 0.5));

      // Points badge.
      const bx = cardW / 2 - 70;
      const badge = this.add.graphics();
      badge.fillStyle(0x57c75a, r.points > 0 ? 1 : 0.4);
      badge.fillRoundedRect(bx - 44, -16, 88, 32, 8);
      container.add(badge);
      container.add(this.add.text(bx, 0, `+${r.points}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5));

      if (first) {
        container.add(this.add.text(-cardW / 2 + 40, -rowH / 2 - 4, '👑', { fontSize: '20px' }).setOrigin(0.5));
      }

      // Slide-in animation.
      container.x = cx - 60;
      container.alpha = 0;
      this.tweens.add({ targets: container, x: cx, alpha: 1, duration: 320, delay: i * 130, ease: 'Back.out' });
    });

    // Cup standings strip.
    const stripY = top + 4 * (rowH + 8) + 30;
    this.add.text(W / 2, stripY, 'CUP STANDINGS', {
      fontFamily: 'monospace', fontSize: '16px', color: '#8be8f0', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5);

    const standings = totalStandings(this.gp);
    const miniW = 200;
    const gap = 14;
    const totalW = standings.length * miniW + (standings.length - 1) * gap;
    let sx = (W - totalW) / 2 + miniW / 2;
    const sy = stripY + 44;
    standings.forEach((r, i) => {
      const leader = i === 0;
      const g = this.add.graphics().setDepth(5);
      g.fillStyle(leader ? 0x3a3320 : 0x2b2b44, 1); g.fillRoundedRect(sx - miniW / 2, sy - 24, miniW, 48, 10);
      g.lineStyle(leader ? 3 : 2, leader ? 0xffd23f : 0xffffff, leader ? 1 : 0.5);
      g.strokeRoundedRect(sx - miniW / 2, sy - 24, miniW, 48, 10);
      this.add.text(sx - miniW / 2 + 16, sy, `${i + 1}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#ffe14d', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);
      this.add.image(sx - miniW / 2 + 44, sy, `kart_${r.id}`).setScale(0.9).setDepth(6);
      this.add.text(sx - miniW / 2 + 66, sy, r.name, {
        fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold',
        color: Phaser.Display.Color.IntegerToColor(r.color).rgba,
      }).setOrigin(0, 0.5).setDepth(6);
      this.add.text(sx + miniW / 2 - 14, sy, `${r.points}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(6);
      sx += miniW + gap;
    });

    // Continue.
    const prompt = this.add.text(W / 2, H - 34,
      isLast ? '▶  SPACE for the award ceremony' : '▶  SPACE for the next race', {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.35 }, duration: 700, yoyo: true, repeat: -1 });

    const go = () => this.advance(isLast);
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.keyboard.once('keydown-ENTER', go);
    this.add.zone(W / 2, H - 34, 460, 50).setInteractive({ useHandCursor: true }).once('pointerdown', go);
    this.time.delayedCall(15000, go);

    addMuteButton(this);
  }

  advance(isLast) {
    Audio.stopMusic();
    if (isLast) {
      this.scene.start('CeremonyScene');
    } else {
      this.gp.raceIndex += 1;
      this.registry.set('gp', this.gp);
      this.scene.start('RaceScene');
    }
  }
}
