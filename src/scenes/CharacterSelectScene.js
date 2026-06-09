import Phaser from 'phaser';
import { ROSTER, initGrandPrix, cupById } from '../GrandPrix.js';
import { makeKartTexture } from '../textures.js';
import * as Audio from '../Audio.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';

const PLAYER_TINT = [0xff4d4d, 0x4d8bff]; // P1 / P2 highlight colours

export default class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene');
  }

  init(data) {
    this.playerCount = (data && data.playerCount) || 1;
    this.cup = (data && data.cup) || 1;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    fadeIn(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));

    const bg = this.add.graphics();
    bg.fillStyle(0x1b1030, 1); bg.fillRect(0, 0, W, H);
    bg.fillStyle(0x2a1a4a, 1); bg.fillRect(0, H * 0.55, W, H * 0.45);

    this.add.text(W / 2, H * 0.12, 'CHOOSE YOUR KART', {
      fontFamily: 'monospace', fontSize: '40px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5);

    this.prompt = this.add.text(W / 2, H * 0.24, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Clickable summary chips — tap any to change cup / speed / AI difficulty.
    this.makeConfigChips(H * 0.185);

    this.makeBackButton();

    // Build the car cards in a 4-column grid (two rows for the 8 colours).
    this.picks = [];
    this.chooser = 0;
    this.locked = new Array(ROSTER.length).fill(-1); // which player locked each car (-1 = free)
    this.cards = [];
    const cols = 4;
    const cardW = 180;
    const cardH = 138;
    const gapX = 18;
    const gapY = 22;
    const gridW = cols * cardW + (cols - 1) * gapX;
    const startX = (W - gridW) / 2 + cardW / 2;
    const startY = H * 0.40;

    ROSTER.forEach((r, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      const g = this.add.graphics();
      const kart = this.add.image(x, cy - 6, `kart_${r.id}`).setScale(1.7);
      kart.rotation = -Math.PI / 2; // point up toward the player
      const name = this.add.text(x, cy + 44, r.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const tag = this.add.text(x, cy - 50, '', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.cards.push({ r, i, x, cy, cardW, cardH, g, kart, name, tag });
      this.add.zone(x, cy, cardW, cardH).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { if (this.isFree(i)) { this.cursor = i; this.redraw(); } })
        .on('pointerdown', () => { if (this.isFree(i)) { this.cursor = i; this.confirm(); } });
    });

    this.add.text(W / 2, H - 38,
      '←/→  (or A/D) move    ·    SPACE / ENTER / item key  pick    ·    click a car',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setAlpha(0.85);
    this.add.text(W / 2, H - 18,
      'tap the cup / speed / AI chips above to change them',
      { fontFamily: 'monospace', fontSize: '12px', color: '#ffe7b0', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setAlpha(0.8);

    this.cursor = 0;
    this.setupKeys();
    this.startChooser(0);
    addMuteButton(this);

    Audio.resumeAudio();
    this.input.keyboard.on('keydown-ESC', () => this.goBack());
  }

  // Three pill chips summarising the Grand Prix setup. Each is clickable and
  // jumps to the screen where that choice is made (cup → Cup Select; speed and
  // AI difficulty → Settings, which returns straight back here).
  makeConfigChips(y) {
    const W = this.scale.width;
    const cupData = cupById(this.cup);
    const cupAccent = { 1: 0x7be07b, 2: 0x49c6e0, 3: 0xff8a3c }[this.cup] || 0xffffff;
    const speed = (this.registry.get('carSpeed') || 'medium').toUpperCase();
    const diff = (this.registry.get('difficulty') || 'medium').toUpperCase();
    const chips = [
      { label: `${cupData.icon || '🏁'} ${cupData.name}`, accent: cupAccent, onClick: () => this.editCup() },
      { label: `🏎 SPEED ${speed}`, accent: 0x8be8f0, onClick: () => this.editSettings() },
      { label: `🤖 ${diff} AI`, accent: 0x8be8f0, onClick: () => this.editSettings() },
    ];
    const pad = 14;
    const gap = 14;
    const items = chips.map((ch) => {
      const txt = this.add.text(0, y, ch.label, {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffe7b0', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(21);
      return { ch, txt, w: txt.width + pad * 2 };
    });
    const total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
    let x = (W - total) / 2;
    items.forEach((it) => {
      const cx = x + it.w / 2;
      const g = this.add.graphics().setDepth(20);
      const draw = (hover) => {
        g.clear();
        g.fillStyle(0x000000, hover ? 0.5 : 0.3); g.fillRoundedRect(cx - it.w / 2, y - 16, it.w, 32, 9);
        g.lineStyle(2, it.ch.accent, hover ? 1 : 0.5); g.strokeRoundedRect(cx - it.w / 2, y - 16, it.w, 32, 9);
      };
      draw(false);
      it.txt.setX(cx);
      this.add.zone(cx, y, it.w, 32).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { draw(true); it.txt.setScale(1.05); })
        .on('pointerout', () => { draw(false); it.txt.setScale(1); })
        .on('pointerdown', it.ch.onClick);
      x += it.w + gap;
    });
  }

  editCup() {
    Audio.sfx('beep');
    transitionTo(this, 'CupSelectScene', { playerCount: this.playerCount });
  }

  editSettings() {
    Audio.sfx('beep');
    transitionTo(this, 'SettingsScene', { from: 'character', playerCount: this.playerCount, cup: this.cup });
  }

  // A "back" button (top-left) that returns to the cup-select screen.
  makeBackButton() {
    const x = 22;
    const y = 20;
    const w = 92;
    const h = 34;
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0xffffff, 0.85); g.strokeRoundedRect(x, y, w, h, 8);
    this.add.text(x + w / 2, y + h / 2, '← BACK', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(21);
    this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { g.clear(); g.fillStyle(0x000000, 0.55); g.fillRoundedRect(x, y, w, h, 8); g.lineStyle(2.5, 0xffe14d, 1); g.strokeRoundedRect(x, y, w, h, 8); })
      .on('pointerout', () => { g.clear(); g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x, y, w, h, 8); g.lineStyle(2, 0xffffff, 0.85); g.strokeRoundedRect(x, y, w, h, 8); })
      .on('pointerdown', () => this.goBack());
  }

  goBack() {
    Audio.sfx('beep');
    transitionTo(this, 'CupSelectScene', { playerCount: this.playerCount });
  }

  setupKeys() {
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.leftKeys = [KC.A, KC.LEFT].map((c) => this.input.keyboard.addKey(c));
    this.rightKeys = [KC.D, KC.RIGHT].map((c) => this.input.keyboard.addKey(c));
    this.confirmKeys = [KC.SPACE, KC.ENTER, KC.E, KC.W, KC.UP, KC.BACK_SLASH, KC.FORWARD_SLASH]
      .map((c) => this.input.keyboard.addKey(c));
    this.rightShiftFired = false;
    this.input.keyboard.on('keydown-SHIFT', (e) => { if (e.location === 2) this.rightShiftFired = true; });
  }

  isFree(i) {
    return this.locked[i] === -1;
  }

  firstFree() {
    for (let i = 0; i < ROSTER.length; i += 1) if (this.isFree(i)) return i;
    return 0;
  }

  startChooser(n) {
    this.chooser = n;
    this.cursor = this.firstFree();
    if (this.playerCount === 1) this.prompt.setText('PICK YOUR CAR');
    else this.prompt.setText(`PLAYER ${n + 1} — PICK YOUR CAR`);
    this.prompt.setColor(Phaser.Display.Color.IntegerToColor(PLAYER_TINT[n] || 0xffffff).rgba);
    this.redraw();
  }

  move(dir) {
    let i = this.cursor;
    for (let step = 0; step < ROSTER.length; step += 1) {
      i = (i + dir + ROSTER.length) % ROSTER.length;
      if (this.isFree(i)) { this.cursor = i; Audio.sfx('beep'); this.redraw(); return; }
    }
  }

  confirm() {
    if (!this.isFree(this.cursor)) return;
    this.locked[this.cursor] = this.chooser;
    this.picks.push(this.cursor);
    Audio.sfx('pickup');
    if (this.chooser + 1 < this.playerCount) {
      this.startChooser(this.chooser + 1);
    } else {
      this.redraw();
      this.start();
    }
  }

  start() {
    initGrandPrix(this.registry, this.playerCount, this.picks, this.cup);
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(260, () => transitionTo(this, 'RaceScene'));
  }

  redraw() {
    this.cards.forEach((c) => {
      const free = this.isFree(c.i);
      const owner = this.locked[c.i];
      const isCursor = free && c.i === this.cursor;
      const g = c.g;
      g.clear();
      // card background
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(c.x - c.cardW / 2 + 4, c.cy - c.cardH / 2 + 5, c.cardW, c.cardH, 16);
      g.fillStyle(c.r.color, free ? 0.22 : 0.42);
      g.fillRoundedRect(c.x - c.cardW / 2, c.cy - c.cardH / 2, c.cardW, c.cardH, 16);
      // border: bright cursor for the current chooser, owner colour if taken
      let bw = 3; let bc = 0xffffff; let ba = 0.4;
      if (isCursor) { bw = 6; bc = PLAYER_TINT[this.chooser] || 0xffffff; ba = 1; }
      else if (owner >= 0) { bw = 5; bc = PLAYER_TINT[owner] || 0xffffff; ba = 1; }
      g.lineStyle(bw, bc, ba);
      g.strokeRoundedRect(c.x - c.cardW / 2, c.cy - c.cardH / 2, c.cardW, c.cardH, 16);

      c.kart.setAlpha(free ? 1 : 0.85);
      c.tag.setText(owner >= 0 ? `P${owner + 1}` : '');
      if (owner >= 0) c.tag.setColor(Phaser.Display.Color.IntegerToColor(PLAYER_TINT[owner] || 0xffffff).rgba);
    });
  }

  update() {
    if (this.leftKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.move(-1);
    if (this.rightKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.move(1);
    let confirm = this.confirmKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
    if (this.rightShiftFired) { confirm = true; this.rightShiftFired = false; }
    if (confirm) this.confirm();
  }
}
