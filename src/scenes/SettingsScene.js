import Phaser from 'phaser';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const DIFFICULTY = [
  { key: 'easy', label: 'EASY', color: 0x57c75a, blurb: 'Relaxed rivals' },
  { key: 'medium', label: 'MEDIUM', color: 0xffd23f, blurb: 'Fair & competitive (default)' },
  { key: 'hard', label: 'HARD', color: 0xff4d4d, blurb: 'Fast, aggressive AI' },
];
const SPEED = [
  { key: 'slow', label: 'SLOW', color: 0x57c75a, blurb: 'Easier to control' },
  { key: 'medium', label: 'MEDIUM', color: 0xffd23f, blurb: 'Default speed' },
  { key: 'fast', label: 'FAST', color: 0xff4d4d, blurb: '10% faster' },
];

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg = this.add.graphics();
    bg.fillStyle(0x1b1030, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x2a1a4a, 1); bg.fillRect(0, H * 0.5, W, H * 0.5);

    this.add.text(W / 2, H * 0.09, 'SETTINGS', {
      fontFamily: 'monospace', fontSize: '46px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5);

    this.difficulty = this.registry.get('difficulty') || 'medium';
    this.carSpeed = this.registry.get('carSpeed') || 'medium';

    this.sectionLabel('AI DIFFICULTY', H * 0.19);
    this.diffRow = this.makeRow(DIFFICULTY, H * 0.30, () => this.difficulty, (k) => this.pickDifficulty(k));

    this.sectionLabel('CAR SPEED', H * 0.50);
    this.speedRow = this.makeRow(SPEED, H * 0.61, () => this.carSpeed, (k) => this.pickSpeed(k));

    this.promptText = this.add.text(W / 2, H * 0.735,
      'Click to choose — your picks are highlighted and saved', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.85);

    this.makeBackButton(W / 2, H * 0.86);
    this.add.text(W / 2, H - 20, 'Esc or Back to return', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.6);

    this.input.keyboard.on('keydown-ESC', () => this.back());
    addMuteButton(this);
  }

  sectionLabel(text, y) {
    this.add.text(this.scale.width / 2, y, text, {
      fontFamily: 'monospace', fontSize: '22px', color: '#8be8f0', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  // A row of three selectable cards. Returns { redraw }.
  makeRow(options, cy, getCurrent, onPick) {
    const W = this.scale.width;
    const cardW = 220;
    const cardH = 96;
    const gap = 22;
    const totalW = options.length * cardW + (options.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;
    const cards = [];

    const redraw = () => {
      const cur = getCurrent();
      cards.forEach((c) => {
        const sel = c.opt.key === cur;
        const g = c.g;
        g.clear();
        g.fillStyle(0x000000, 0.3); g.fillRoundedRect(c.x - cardW / 2 + 4, cy - cardH / 2 + 5, cardW, cardH, 14);
        g.fillStyle(c.opt.color, sel ? 1 : (c.hover ? 0.6 : 0.32)); g.fillRoundedRect(c.x - cardW / 2, cy - cardH / 2, cardW, cardH, 14);
        g.lineStyle(sel ? 5 : 3, 0xffffff, sel ? 1 : 0.5); g.strokeRoundedRect(c.x - cardW / 2, cy - cardH / 2, cardW, cardH, 14);
        if (sel) { g.fillStyle(0xffffff, 1); g.fillCircle(c.x + cardW / 2 - 16, cy - cardH / 2 + 16, 8); }
        c.label.setColor(sel || c.hover ? '#ffffff' : '#e9e9e9');
      });
    };

    options.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const g = this.add.graphics();
      const label = this.add.text(x, cy - 20, opt.label, {
        fontFamily: 'monospace', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(x, cy + 22, opt.blurb, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', align: 'center',
        wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setAlpha(0.85);
      const card = { opt, x, g, label, hover: false };
      cards.push(card);
      const zone = this.add.zone(x, cy, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { card.hover = true; redraw(); });
      zone.on('pointerout', () => { card.hover = false; redraw(); });
      zone.on('pointerdown', () => onPick(opt.key));
    });
    redraw();
    return { redraw };
  }

  pickDifficulty(key) {
    if (this.difficulty !== key) Audio.sfx('pickup');
    this.difficulty = key;
    this.registry.set('difficulty', key);
    try { window.localStorage.setItem('kobikart.difficulty', key); } catch (e) { /* ignore */ }
    this.diffRow.redraw();
    this.promptText.setText(`Saved — AI difficulty: ${key.toUpperCase()}`);
  }

  pickSpeed(key) {
    if (this.carSpeed !== key) Audio.sfx('pickup');
    this.carSpeed = key;
    this.registry.set('carSpeed', key);
    try { window.localStorage.setItem('kobikart.carSpeed', key); } catch (e) { /* ignore */ }
    this.speedRow.redraw();
    this.promptText.setText(`Saved — car speed: ${key.toUpperCase()}`);
  }

  makeBackButton(x, y) {
    const w = 200;
    const h = 50;
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 4, w, h, 12);
      g.fillStyle(0x4d8bff, hover ? 1 : 0.9); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
      g.lineStyle(3, 0xffffff, hover ? 1 : 0.8); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    };
    draw(false);
    const text = this.add.text(x, y, '‹ BACK', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); text.setScale(1.05); });
    zone.on('pointerout', () => { draw(false); text.setScale(1); });
    zone.on('pointerdown', () => this.back());
  }

  back() {
    this.scene.start('TitleScene');
  }
}
