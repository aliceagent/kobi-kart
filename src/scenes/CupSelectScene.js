import Phaser from 'phaser';
import { CUPS } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const WORLD_LABEL = {
  Grassy: '🌳 Grassy', Beach: '🏖 Beach', Ice: '❄ Ice', Candy: '🍭 Candy',
  Volcano: 'Volcano — lava', Storm: 'Storm — wind', Jungle: 'Jungle — mud', Neon: 'Neon — speed',
};
const CUP_COLOR = [0x57c75a, 0xff6a2c]; // Starter (green) / Pro (orange)

export default class CupSelectScene extends Phaser.Scene {
  constructor() {
    super('CupSelectScene');
  }

  init(data) {
    this.playerCount = (data && data.playerCount) || 1;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillStyle(0x161028, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x241a40, 1); bg.fillRect(0, H * 0.5, W, H * 0.5);

    this.add.text(W / 2, H * 0.12, 'CHOOSE A CUP', {
      fontFamily: 'monospace', fontSize: '42px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5);

    this.cursor = 0;
    this.panels = [];
    const panelW = 380;
    const panelH = 420;
    const gap = 60;
    const startX = W / 2 - (panelW + gap) / 2;
    const cy = H * 0.55;

    CUPS.forEach((cup, i) => {
      const x = startX + i * (panelW + gap);
      const g = this.add.graphics();
      const title = this.add.text(x, cy - panelH / 2 + 36, cup.name, {
        fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.add.text(x, cy - panelH / 2 + 70, cup.sub, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.85);
      cup.themes.forEach((t, k) => {
        this.add.text(x, cy - panelH / 2 + 120 + k * 48, WORLD_LABEL[t] || t, {
          fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5);
      });
      this.panels.push({ cup, x, cy, w: panelW, h: panelH, g, title });
      this.add.zone(x, cy, panelW, panelH).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { this.cursor = i; this.redraw(); })
        .on('pointerdown', () => { this.cursor = i; this.confirm(); });
    });

    this.add.text(W / 2, H - 26,
      '←/→ (or A/D) move   ·   SPACE / ENTER pick   ·   click a cup',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setAlpha(0.85);

    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.leftKeys = [KC.A, KC.LEFT].map((c) => this.input.keyboard.addKey(c));
    this.rightKeys = [KC.D, KC.RIGHT].map((c) => this.input.keyboard.addKey(c));
    this.confirmKeys = [KC.SPACE, KC.ENTER, KC.E, KC.W, KC.UP].map((c) => this.input.keyboard.addKey(c));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('TitleScene'));

    this.redraw();
    addMuteButton(this);
    Audio.resumeAudio();
  }

  redraw() {
    this.panels.forEach((p, i) => {
      const sel = i === this.cursor;
      const col = CUP_COLOR[i] || 0xffffff;
      const g = p.g;
      g.clear();
      g.fillStyle(0x000000, 0.3); g.fillRoundedRect(p.x - p.w / 2 + 5, p.cy - p.h / 2 + 6, p.w, p.h, 18);
      g.fillStyle(col, sel ? 0.55 : 0.25); g.fillRoundedRect(p.x - p.w / 2, p.cy - p.h / 2, p.w, p.h, 18);
      g.lineStyle(sel ? 6 : 3, 0xffffff, sel ? 1 : 0.5); g.strokeRoundedRect(p.x - p.w / 2, p.cy - p.h / 2, p.w, p.h, 18);
    });
  }

  confirm() {
    Audio.sfx('pickup');
    const cup = this.panels[this.cursor].cup.id;
    this.scene.start('CharacterSelectScene', { playerCount: this.playerCount, cup });
  }

  update() {
    if (this.leftKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) && this.cursor > 0) {
      this.cursor -= 1; Audio.sfx('beep'); this.redraw();
    }
    if (this.rightKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) && this.cursor < this.panels.length - 1) {
      this.cursor += 1; Audio.sfx('beep'); this.redraw();
    }
    if (this.confirmKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.confirm();
  }
}
