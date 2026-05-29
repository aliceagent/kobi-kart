import Phaser from 'phaser';
import { totalStandings } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

function ordinal(n) {
  return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
}

export default class ResultsScene extends Phaser.Scene {
  constructor() {
    super('ResultsScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.gp = this.registry.get('gp');
    this.cameras.main.setBackgroundColor('#15151f');
    const results = this.gp.lastResults || [];
    const isLast = this.gp.raceIndex >= 3;

    this.add.text(W / 2, 40, `RACE ${this.gp.raceIndex + 1} OF 4 — FINISHED`, {
      fontFamily: 'monospace', fontSize: '28px', color: '#ffe14d', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, 78, 'Finish order (+points)', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.8);

    results.forEach((r, i) => {
      const y = 116 + i * 40;
      this.add.image(W / 2 - 150, y, `kart_${r.id}`).setScale(1.1);
      this.add.text(W / 2 - 110, y, `${ordinal(r.place)}  ${r.name}`, {
        fontFamily: 'monospace', fontSize: '20px', color: Phaser.Display.Color.IntegerToColor(r.color).rgba,
      }).setOrigin(0, 0.5);
      this.add.text(W / 2 + 150, y, `+${r.points}`, {
        fontFamily: 'monospace', fontSize: '20px', color: '#ffffff',
      }).setOrigin(1, 0.5);
    });

    // Cumulative standings.
    this.add.text(W / 2, 300, 'OVERALL STANDINGS', {
      fontFamily: 'monospace', fontSize: '18px', color: '#8be8f0', fontStyle: 'bold',
    }).setOrigin(0.5);
    totalStandings(this.gp).forEach((r, i) => {
      const y = 336 + i * 30;
      this.add.text(W / 2, y, `${i + 1}.  ${r.name}  —  ${r.points} pts`, {
        fontFamily: 'monospace', fontSize: '18px', color: Phaser.Display.Color.IntegerToColor(r.color).rgba,
      }).setOrigin(0.5);
    });

    const prompt = this.add.text(W / 2, H - 40,
      isLast ? 'Press SPACE for the award ceremony' : 'Press SPACE for the next race', {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.3 }, duration: 700, yoyo: true, repeat: -1 });

    const go = () => this.advance(isLast);
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.keyboard.once('keydown-ENTER', go);
    this.add.zone(W / 2, H - 40, 460, 50).setInteractive({ useHandCursor: true }).once('pointerdown', go);
    this.time.delayedCall(12000, go); // auto-advance fallback

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
