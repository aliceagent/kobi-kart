import Phaser from 'phaser';
import * as Audio from '../Audio.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';
import { ARENAS } from './BattleScene.js';

// Battle setup: pick a themed arena and how many AI opponents (2 or 4), then
// head to Character Select (battle mode) and into the arena.
export default class BattleSetupScene extends Phaser.Scene {
  constructor() {
    super('BattleSetupScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    fadeIn(this);

    const bg = this.add.graphics();
    bg.fillStyle(0x1b1030, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x2a1a4a, 1); bg.fillRect(0, H * 0.58, W, H * 0.42);

    this.add.text(W / 2, H * 0.1, '⚔  BATTLE SETUP', {
      fontFamily: 'monospace', fontSize: '42px', color: '#ffe14d', fontStyle: 'bold', stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.185, 'PICK AN ARENA', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.selected = 0;
    this.players = 2;
    this.aiCount = 2;
    this.cards = [];
    const cw = 200;
    const ch = 196;
    const gap = 22;
    const totalW = ARENAS.length * cw + (ARENAS.length - 1) * gap;
    const startX = (W - totalW) / 2 + cw / 2;
    const cy = H * 0.40;

    ARENAS.forEach((ar, i) => {
      const x = startX + i * (cw + gap);
      const g = this.add.graphics();
      const preview = this.add.graphics();
      this.drawArenaPreview(preview, ar, x, cy - 18, cw - 40, 96);
      const name = this.add.text(x, cy + 56, `${ar.icon} ${ar.name}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const sub = this.add.text(x, cy + 76, ar.sub, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffe7b0', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      this.cards.push({ ar, i, x, cy, cw, ch, g, name, sub });
      this.add.zone(x, cy, cw, ch).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { this.selected = i; Audio.sfx('beep'); this.redraw(); })
        .on('pointerdown', () => { this.selected = i; Audio.sfx('pickup'); this.redraw(); });
    });

    // Player + AI count selectors, side by side.
    this.add.text(W * 0.32, H * 0.66, 'PLAYERS', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.playerButtons = [];
    [1, 2].forEach((nval, i) => {
      const x = W * 0.32 + (i === 0 ? -70 : 70);
      const y = H * 0.74;
      const g = this.add.graphics();
      const label = this.add.text(x, y, String(nval), { fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      this.playerButtons.push({ nval, x, y, g, label });
      this.add.zone(x, y, 92, 52).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { this.players = nval; Audio.sfx('beep'); this.redraw(); })
        .on('pointerdown', () => { this.players = nval; Audio.sfx('pickup'); this.redraw(); });
    });
    this.add.text(W * 0.68, H * 0.66, 'AI OPPONENTS', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.aiButtons = [];
    [2, 4].forEach((nval, i) => {
      const x = W * 0.68 + (i === 0 ? -70 : 70);
      const y = H * 0.74;
      const g = this.add.graphics();
      const label = this.add.text(x, y, String(nval), { fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      this.aiButtons.push({ nval, x, y, g, label });
      this.add.zone(x, y, 92, 52).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { this.aiCount = nval; Audio.sfx('beep'); this.redraw(); })
        .on('pointerdown', () => { this.aiCount = nval; Audio.sfx('pickup'); this.redraw(); });
    });
    this.add.text(W / 2, H * 0.805, 'solo players can drive with either control set', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cdbfff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    // Start + back.
    this.makeButton(W / 2, H * 0.89, 'START ▶', 0x57c75a, () => this.startBattle(), 260, 52);
    this.makeBackButton();

    this.setupKeys();
    addMuteButton(this);
    Audio.resumeAudio();
    this.input.keyboard.on('keydown-ESC', () => transitionTo(this, 'TitleScene'));
    this.redraw();
  }

  drawArenaPreview(g, ar, cx, cy, w, h) {
    const x = cx - w / 2; const y = cy - h / 2;
    g.fillStyle(ar.terrain, 1); g.fillRoundedRect(x, y, w, h, 8);
    g.fillStyle(ar.floor, 1); g.fillRoundedRect(x + 8, y + 8, w - 16, h - 16, 6);
    g.lineStyle(2.5, ar.kerb[0], 1); g.strokeRoundedRect(x + 8, y + 8, w - 16, h - 16, 6);
    // signature hint
    g.fillStyle(ar.accent, 0.9);
    if (ar.id === 'stadium') { g.fillCircle(cx - 18, cy, 7); g.fillCircle(cx + 18, cy, 7); }
    else if (ar.id === 'ice') { for (let k = 0; k < 4; k += 1) { const a = (k / 4) * Math.PI * 2; g.fillRect(cx + Math.cos(a) * 16 - 1, cy + Math.sin(a) * 12 - 8, 2, 16); } }
    else if (ar.id === 'volcano') { [[-20, -8], [20, 8], [0, 0]].forEach(([dx, dy]) => { g.fillStyle(0xff5a1a, 0.9); g.fillCircle(cx + dx, cy + dy, 6); }); }
    else if (ar.id === 'maze') { g.lineStyle(3, ar.accent, 0.9); g.beginPath(); g.moveTo(cx - 22, cy); g.lineTo(cx - 4, cy); g.moveTo(cx + 4, cy); g.lineTo(cx + 22, cy); g.moveTo(cx, cy - 16); g.lineTo(cx, cy - 4); g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 16); g.strokePath(); }
  }

  redraw() {
    this.cards.forEach((c) => {
      const sel = c.i === this.selected;
      c.g.clear();
      c.g.fillStyle(0x000000, 0.3); c.g.fillRoundedRect(c.x - c.cw / 2 + 4, c.cy - c.ch / 2 + 5, c.cw, c.ch, 16);
      c.g.fillStyle(0x140a26, sel ? 0.95 : 0.7); c.g.fillRoundedRect(c.x - c.cw / 2, c.cy - c.ch / 2, c.cw, c.ch, 16);
      c.g.lineStyle(sel ? 5 : 3, sel ? 0xffe14d : 0xffffff, sel ? 1 : 0.4); c.g.strokeRoundedRect(c.x - c.cw / 2, c.cy - c.ch / 2, c.cw, c.ch, 16);
      c.name.setColor(sel ? '#ffe14d' : '#ffffff');
    });
    const drawToggle = (b, sel, color) => {
      b.g.clear();
      b.g.fillStyle(0x000000, 0.4); b.g.fillRoundedRect(b.x - 46 + 3, b.y - 26 + 4, 92, 52, 12);
      b.g.fillStyle(sel ? color : 0x3a2f55, 1); b.g.fillRoundedRect(b.x - 46, b.y - 26, 92, 52, 12);
      b.g.lineStyle(sel ? 4 : 2, 0xffffff, sel ? 1 : 0.4); b.g.strokeRoundedRect(b.x - 46, b.y - 26, 92, 52, 12);
    };
    this.playerButtons.forEach((b) => drawToggle(b, b.nval === this.players, 0x4d8bff));
    this.aiButtons.forEach((b) => drawToggle(b, b.nval === this.aiCount, 0xff8a2c));
  }

  makeButton(x, y, label, color, onClick, w, h) {
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 4, w, h, 13);
      g.fillStyle(color, hover ? 1 : 0.92); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 13);
      g.fillStyle(0xffffff, 0.14); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.42, 9);
      g.lineStyle(3, 0xffffff, hover ? 1 : 0.85); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 13);
    };
    draw(false);
    const text = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { draw(true); text.setScale(1.05); })
      .on('pointerout', () => { draw(false); text.setScale(1); })
      .on('pointerdown', onClick);
  }

  makeBackButton() {
    const x = 22; const y = 20; const w = 92; const h = 34;
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0xffffff, 0.85); g.strokeRoundedRect(x, y, w, h, 8);
    this.add.text(x + w / 2, y + h / 2, '← BACK', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(21);
    this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true }).on('pointerdown', () => transitionTo(this, 'TitleScene'));
  }

  setupKeys() {
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.input.keyboard.on('keydown-LEFT', () => { this.selected = (this.selected + ARENAS.length - 1) % ARENAS.length; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-RIGHT', () => { this.selected = (this.selected + 1) % ARENAS.length; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-A', () => { this.selected = (this.selected + ARENAS.length - 1) % ARENAS.length; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-D', () => { this.selected = (this.selected + 1) % ARENAS.length; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-UP', () => { this.aiCount = this.aiCount === 2 ? 4 : 2; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-DOWN', () => { this.aiCount = this.aiCount === 2 ? 4 : 2; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-ONE', () => { this.players = 1; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-TWO', () => { this.players = 2; Audio.sfx('beep'); this.redraw(); });
    this.input.keyboard.on('keydown-ENTER', () => this.startBattle());
    this.input.keyboard.on('keydown-SPACE', () => this.startBattle());
  }

  startBattle() {
    if (this._starting) return;
    this._starting = true;
    Audio.sfx('pickup');
    const arena = ARENAS[this.selected].id;
    transitionTo(this, 'CharacterSelectScene', { mode: 'battle', playerCount: this.players, arena, aiCount: this.aiCount });
  }
}
