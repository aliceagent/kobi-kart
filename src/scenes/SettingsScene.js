import Phaser from 'phaser';
import * as Audio from '../Audio.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';

// level (1-3) drives the little indicator icon drawn on each card.
const DIFFICULTY = [
  { key: 'easy', label: 'EASY', color: 0x3f9a47, glow: 0x9bf06a, blurb: 'Relaxed rivals', level: 1 },
  { key: 'medium', label: 'MEDIUM', color: 0xd9a521, glow: 0xffe14d, blurb: 'Fair & competitive', level: 2 },
  { key: 'hard', label: 'HARD', color: 0xc8442f, glow: 0xff8a6a, blurb: 'Fast, aggressive AI', level: 3 },
];
const SPEED = [
  { key: 'slow', label: 'SLOW', color: 0x3f9a47, glow: 0x9bf06a, blurb: 'Easier to control', level: 1 },
  { key: 'medium', label: 'MEDIUM', color: 0xd9a521, glow: 0xffe14d, blurb: 'Default speed', level: 2 },
  { key: 'fast', label: 'FAST', color: 0xc8442f, glow: 0xff8a6a, blurb: '10% faster', level: 3 },
];

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  init(data) {
    // When opened from the kart-select screen, Back returns there (with the
    // chosen cup) instead of all the way out to the title.
    this.fromCharacter = !!(data && data.from === 'character');
    this.playerCount = (data && data.playerCount) || 1;
    this.cup = (data && data.cup) || 1;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.t = 0;
    this.allCards = [];
    fadeIn(this);

    this.drawBackground(W, H);
    this.glowGfx = this.add.graphics().setDepth(1); // animated selection halo (behind cards)

    const title = this.add.text(W / 2, H * 0.085, 'SETTINGS', {
      fontFamily: 'monospace', fontSize: '46px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(5);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.04 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.difficulty = this.registry.get('difficulty') || 'medium';
    this.carSpeed = this.registry.get('carSpeed') || 'medium';

    this.sectionLabel('🤖  AI DIFFICULTY', H * 0.165);
    this.diffRow = this.makeRow(DIFFICULTY, 'bars', H * 0.31, () => this.difficulty, (k) => this.pickDifficulty(k));

    this.sectionLabel('🏎  CAR SPEED', H * 0.45);
    this.speedRow = this.makeRow(SPEED, 'chevrons', H * 0.595, () => this.carSpeed, (k) => this.pickSpeed(k));

    this.promptText = this.add.text(W / 2, H * 0.715,
      'Click to choose — your picks are saved automatically', {
        fontFamily: 'monospace', fontSize: '14px', color: '#cdbfff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(5);

    this.makeBackButton(W / 2, H * 0.845);
    this.add.text(W / 2, H - 20,
      this.fromCharacter ? 'Esc or Back — return to kart select' : 'Esc or Back to return', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(5).setAlpha(0.55);

    this.input.keyboard.on('keydown-ESC', () => this.back());
    addMuteButton(this);
  }

  sectionLabel(text, y) {
    this.add.text(this.scale.width / 2, y, text, {
      fontFamily: 'monospace', fontSize: '22px', color: '#8be8f0', fontStyle: 'bold',
      stroke: '#06212b', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
  }

  // A row of three selectable cards. Returns { redraw }.
  makeRow(options, iconKind, cy, getCurrent, onPick) {
    const W = this.scale.width;
    const cardW = 240;
    const cardH = 120;
    const gap = 26;
    const totalW = options.length * cardW + (options.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;
    const cards = [];

    const redraw = () => {
      const cur = getCurrent();
      cards.forEach((c) => {
        const sel = c.opt.key === cur;
        const x = c.x;
        const g = c.g;
        g.clear();
        g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - cardW / 2 + 4, cy - cardH / 2 + 5, cardW, cardH, 16);
        const a = sel ? 1 : (c.hover ? 0.62 : 0.34);
        g.fillStyle(c.opt.color, a); g.fillRoundedRect(x - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
        g.fillStyle(0xffffff, sel ? 0.16 : 0.08); g.fillRoundedRect(x - cardW / 2 + 5, cy - cardH / 2 + 5, cardW - 10, cardH * 0.42, 12);
        g.fillStyle(0x000000, 0.12); g.fillRoundedRect(x - cardW / 2 + 5, cy + cardH * 0.04, cardW - 10, cardH * 0.42, 12);
        g.lineStyle(sel ? 4 : 3, 0xffffff, sel ? 1 : 0.45); g.strokeRoundedRect(x - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
        this.drawIcon(g, iconKind, x, cy - 34, c.opt.level, sel || c.hover);
        if (sel) this.drawCheck(g, x + cardW / 2 - 18, cy - cardH / 2 + 18);
        c.label.setScale(sel ? 1.04 : 1);
      });
    };

    options.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const g = this.add.graphics().setDepth(2);
      const label = this.add.text(x, cy + 8, opt.label, {
        fontFamily: 'monospace', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(3);
      this.add.text(x, cy + 38, opt.blurb, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', align: 'center',
        stroke: '#000000', strokeThickness: 3, wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setDepth(3).setAlpha(0.92);
      const card = { opt, x, cy, w: cardW, h: cardH, g, label, hover: false, current: getCurrent };
      cards.push(card);
      this.allCards.push(card);
      const zone = this.add.zone(x, cy, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { card.hover = true; Audio.sfx('beep'); redraw(); });
      zone.on('pointerout', () => { card.hover = false; redraw(); });
      zone.on('pointerdown', () => onPick(opt.key));
    });
    redraw();
    return { redraw };
  }

  // Ascending signal bars (difficulty) or speed chevrons, filled to `level`.
  drawIcon(g, kind, x, y, level, bright) {
    if (kind === 'bars') {
      const bw = 9; const step = bw + 6;
      for (let k = 0; k < 3; k += 1) {
        const bh = 8 + k * 10;
        const bx = x + (k - 1) * step - bw / 2;
        const by = y + 13 - bh;
        const on = k < level;
        g.fillStyle(0xffffff, on ? (bright ? 1 : 0.92) : 0.22);
        g.fillRoundedRect(bx, by, bw, bh, 2);
        g.lineStyle(1.5, 0x000000, on ? 0.5 : 0.3);
        g.strokeRoundedRect(bx, by, bw, bh, 2);
      }
    } else { // chevrons
      for (let k = 0; k < 3; k += 1) {
        const cx = x + (k - 1) * 15;
        const on = k < level;
        g.lineStyle(5, 0xffffff, on ? (bright ? 1 : 0.92) : 0.22);
        g.beginPath();
        g.moveTo(cx - 6, y - 9); g.lineTo(cx + 5, y); g.lineTo(cx - 6, y + 9);
        g.strokePath();
      }
    }
  }

  drawCheck(g, x, y) {
    g.fillStyle(0xffffff, 1); g.fillCircle(x, y, 11);
    g.lineStyle(3, 0x2aa84a, 1);
    g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x - 1, y + 5); g.lineTo(x + 6, y - 5); g.strokePath();
  }

  update(_t, deltaMs) {
    this.t += deltaMs / 1000;
    const g = this.glowGfx;
    if (!g) return;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (const c of this.allCards) {
      if (c.opt.key === c.current()) {
        g.lineStyle(8, c.opt.glow || 0xffffff, 0.3 + 0.45 * pulse);
        g.strokeRoundedRect(c.x - c.w / 2 - 4, c.cy - c.h / 2 - 4, c.w + 8, c.h + 8, 20);
      }
    }
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
    const w = 210;
    const h = 52;
    const g = this.add.graphics().setDepth(5);
    const draw = (hover) => {
      g.clear();
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 4, w, h, 13);
      g.fillStyle(0x4d8bff, hover ? 1 : 0.92); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 13);
      g.fillStyle(0xffffff, 0.14); g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.42, 9);
      g.lineStyle(3, 0xffffff, hover ? 1 : 0.85); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 13);
    };
    draw(false);
    const text = this.add.text(x, y, '← BACK', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#102a5c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); text.setScale(1.05); });
    zone.on('pointerout', () => { draw(false); text.setScale(1); });
    zone.on('pointerdown', () => this.back());
  }

  back() {
    if (this.fromCharacter) {
      transitionTo(this, 'CharacterSelectScene', { playerCount: this.playerCount, cup: this.cup });
    } else {
      transitionTo(this, 'TitleScene');
    }
  }

  // ------------------------------------------------------------ background ----
  drawBackground(W, H) {
    const g = this.add.graphics().setDepth(0);
    const top = Phaser.Display.Color.ValueToColor(0x141026);
    const bot = Phaser.Display.Color.ValueToColor(0x3a2358);
    const bands = 48;
    for (let i = 0; i < bands; i += 1) {
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, bands, i);
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
      g.fillRect(0, Math.floor((i * H) / bands), W, Math.ceil(H / bands) + 1);
    }
    g.fillStyle(0xffffff, 0.04);
    for (let k = -2; k < 12; k += 1) {
      const x = k * 150;
      g.fillTriangle(x, H, x + 70, H, x + 240, 0);
    }
    let seed = 4321;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 70; i += 1) {
      g.fillStyle(0xffffff, 0.12 + rnd() * 0.32);
      g.fillCircle(rnd() * W, rnd() * H * 0.95, rnd() * 1.6 + 0.5);
    }
    const cell = 16;
    for (let cI = 0; cI * cell < W; cI += 1) {
      g.fillStyle(cI % 2 ? 0x111111 : 0xffffff, 0.9); g.fillRect(cI * cell, 0, cell, cell / 2);
      g.fillStyle(cI % 2 ? 0xffffff : 0x111111, 0.9); g.fillRect(cI * cell, cell / 2, cell, cell / 2);
    }
  }
}
