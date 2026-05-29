import Phaser from 'phaser';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const OPTIONS = [
  { key: 'easy', label: 'EASY', color: 0x57c75a, blurb: 'Relaxed rivals — great for younger or new players' },
  { key: 'medium', label: 'MEDIUM', color: 0xffd23f, blurb: 'A fair, competitive race (default)' },
  { key: 'hard', label: 'HARD', color: 0xff4d4d, blurb: 'Fast, aggressive AI that fights for every place' },
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

    this.add.text(W / 2, H * 0.13, 'SETTINGS', {
      fontFamily: 'monospace', fontSize: '46px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.24, 'AI Difficulty', {
      fontFamily: 'monospace', fontSize: '22px', color: '#8be8f0', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.current = this.registry.get('difficulty') || 'medium';
    this.cards = [];
    const cardW = 230;
    const gap = 20;
    const totalW = OPTIONS.length * cardW + (OPTIONS.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;
    const cy = H * 0.45;

    OPTIONS.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const g = this.add.graphics();
      const label = this.add.text(x, cy - 28, opt.label, {
        fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const blurb = this.add.text(x, cy + 26, opt.blurb, {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', align: 'center',
        wordWrap: { width: cardW - 28 },
      }).setOrigin(0.5).setAlpha(0.85);

      const card = { opt, x, cy, g, label, blurb, w: cardW, h: 150 };
      this.cards.push(card);

      const zone = this.add.zone(x, cy, cardW, 150).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { if (this.current !== opt.key) { card.hover = true; this.redraw(); } });
      zone.on('pointerout', () => { card.hover = false; this.redraw(); });
      zone.on('pointerdown', () => this.select(opt.key));
    });
    this.redraw();

    const prompt = this.add.text(W / 2, H * 0.7,
      'Click a difficulty  ·  current is highlighted', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.8);
    this.promptText = prompt;

    this.makeBackButton(W / 2, H * 0.84);
    this.add.text(W / 2, H - 22, 'Esc or Back to return', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.6);

    this.input.keyboard.on('keydown-ESC', () => this.back());
    addMuteButton(this);
  }

  redraw() {
    this.cards.forEach((c) => {
      const selected = this.current === c.opt.key;
      const g = c.g;
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(c.x - c.w / 2 + 4, c.cy - c.h / 2 + 5, c.w, c.h, 14);
      g.fillStyle(c.opt.color, selected ? 1 : (c.hover ? 0.6 : 0.32));
      g.fillRoundedRect(c.x - c.w / 2, c.cy - c.h / 2, c.w, c.h, 14);
      g.lineStyle(selected ? 5 : 3, selected ? 0xffffff : 0xffffff, selected ? 1 : 0.5);
      g.strokeRoundedRect(c.x - c.w / 2, c.cy - c.h / 2, c.w, c.h, 14);
      if (selected) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(c.x + c.w / 2 - 18, c.cy - c.h / 2 + 18, 9);
        g.fillStyle(c.opt.color, 1);
        // check mark
        g.lineStyle(3, c.opt.color, 1);
      }
      c.label.setColor(selected || c.hover ? '#ffffff' : '#e9e9e9');
    });
  }

  select(key) {
    if (this.current !== key) Audio.sfx('pickup');
    this.current = key;
    this.registry.set('difficulty', key);
    try { window.localStorage.setItem('kobikart.difficulty', key); } catch (e) { /* ignore */ }
    this.cards.forEach((c) => { c.hover = false; });
    this.redraw();
    const opt = OPTIONS.find((o) => o.key === key);
    this.promptText.setText(`Saved — AI set to ${opt.label}`);
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
