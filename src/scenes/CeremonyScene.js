import Phaser from 'phaser';
import { totalStandings } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

export default class CeremonyScene extends Phaser.Scene {
  constructor() {
    super('CeremonyScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.gp = this.registry.get('gp');
    const standings = totalStandings(this.gp);
    const champ = standings[0];

    // Backdrop.
    const bg = this.add.graphics().setDepth(0);
    bg.fillStyle(0x1a0f3a, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x2c1a5e, 1); bg.fillRect(0, H * 0.5, W, H * 0.5);

    const baseY = H * 0.86;
    const slots = [
      { rank: 1, x: W / 2, h: 200, color: 0xffd23f, label: '1' },
      { rank: 2, x: W / 2 - 165, h: 150, color: 0xc7ccd6, label: '2' },
      { rank: 3, x: W / 2 + 165, h: 110, color: 0xcd7f32, label: '3' },
    ];

    // Spotlight cones onto each podium.
    const spot = this.add.graphics().setDepth(1);
    slots.forEach((s) => {
      spot.fillStyle(0xfff4c2, 0.08);
      spot.fillTriangle(W / 2, 120, s.x - 70, baseY - s.h, s.x + 70, baseY - s.h);
    });

    // Glow behind the champion.
    const glow = this.add.graphics().setDepth(2);
    const drawGlow = (rot) => {
      glow.clear();
      glow.fillStyle(0xffe14d, 0.12);
      const cx = W / 2; const cy = 96;
      for (let k = 0; k < 12; k += 1) {
        const a = rot + (k / 12) * Math.PI * 2;
        glow.fillTriangle(cx, cy, cx + Math.cos(a) * 220, cy + Math.sin(a) * 220, cx + Math.cos(a + 0.18) * 220, cy + Math.sin(a + 0.18) * 220);
      }
    };
    drawGlow(0);
    this.tweens.addCounter({ from: 0, to: Math.PI * 2, duration: 16000, repeat: -1, onUpdate: (t) => drawGlow(t.getValue()) });

    // Confetti.
    this.add.particles(0, -10, 'spark', {
      x: { min: 0, max: W }, y: -10, lifespan: 4500,
      speedY: { min: 70, max: 180 }, speedX: { min: -50, max: 50 },
      scale: { min: 0.6, max: 1.3 }, rotate: { min: 0, max: 360 }, gravityY: 45,
      frequency: 45, quantity: 3,
      tint: [0xff5d8f, 0x4d8bff, 0xffd23f, 0x57c75a, 0xb06bff, 0xffffff, 0xff8a3c],
    }).setDepth(30);

    this.add.text(W / 2, 44, 'GRAND PRIX CHAMPION', {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(22);

    const champName = this.add.text(W / 2, 92, `${champ.name}!`, {
      fontFamily: 'monospace', fontSize: '42px', fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(champ.color).rgba,
    }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: champName, scale: { from: 1, to: 1.12 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // Podiums.
    slots.forEach((slot) => {
      const racer = standings[slot.rank - 1];
      if (!racer) return;
      const top = baseY - slot.h;
      const bw = 130;
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(slot.x - bw / 2 + 5, top + 6, bw, slot.h, 10);
      g.fillStyle(slot.color, 1); g.fillRoundedRect(slot.x - bw / 2, top, bw, slot.h, 10);
      g.fillStyle(0xffffff, 0.25); g.fillRoundedRect(slot.x - bw / 2, top, bw, 14, 10);
      g.lineStyle(3, 0xffffff, 0.85); g.strokeRoundedRect(slot.x - bw / 2, top, bw, slot.h, 10);
      this.add.text(slot.x, top + slot.h / 2 + 10, slot.label, {
        fontFamily: 'monospace', fontSize: '44px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);

      const scale = slot.rank === 1 ? 2.4 : 1.8;
      const kart = this.add.image(slot.x, top - 30, `kart_${racer.id}`).setScale(scale).setDepth(12);
      kart.rotation = -Math.PI / 2;
      this.tweens.add({ targets: kart, y: top - 44, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

      this.add.text(slot.x, top - 66, racer.name, {
        fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold',
        color: Phaser.Display.Color.IntegerToColor(racer.color).rgba,
      }).setOrigin(0.5).setDepth(12);
      this.add.text(slot.x, baseY + 18, `${racer.points} pts`, {
        fontFamily: 'monospace', fontSize: '15px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(12);
    });

    // Trophy above the champion.
    this.drawTrophy(W / 2, baseY - slots[0].h - 92);

    if (standings[3]) {
      this.add.text(W / 2, baseY + 48, `4th: ${standings[3].name} (${standings[3].points} pts)`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#cccccc',
      }).setOrigin(0.5).setDepth(22);
    }

    const prompt = this.add.text(W / 2, H - 24, 'Press SPACE for the title screen', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.3 }, duration: 700, yoyo: true, repeat: -1 });

    Audio.resumeAudio();
    Audio.sfx('fanfare');
    Audio.startMusic('Beach');
    this.time.delayedCall(900, () => Audio.sfx('fanfare'));
    this.events.once('shutdown', () => Audio.stopMusic());

    const go = () => this.scene.start('TitleScene');
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.keyboard.once('keydown-ENTER', go);
    this.add.zone(W / 2, H - 24, 460, 50).setInteractive({ useHandCursor: true }).once('pointerdown', go);

    addMuteButton(this);
  }

  drawTrophy(x, y) {
    const g = this.add.graphics().setDepth(13);
    // Cup bowl.
    g.fillStyle(0xffd23f, 1);
    g.fillEllipse(x, y, 46, 18);
    g.fillTriangle(x - 23, y, x + 23, y, x, y + 34);
    // Handles.
    g.lineStyle(5, 0xffd23f, 1);
    g.beginPath(); g.arc(x - 24, y + 4, 12, -1.2, 1.6); g.strokePath();
    g.beginPath(); g.arc(x + 24, y + 4, 12, 1.5, 4.3, true); g.strokePath();
    // Stem + base.
    g.fillStyle(0xe0a82e, 1);
    g.fillRect(x - 4, y + 30, 8, 14);
    g.fillRect(x - 16, y + 44, 32, 8);
    // Shine.
    g.fillStyle(0xffffff, 0.6); g.fillCircle(x - 9, y - 1, 4);
    this.tweens.add({ targets: g, y: -6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
}
