import Phaser from 'phaser';
import { ROSTER, initGrandPrix } from '../GrandPrix.js';
import { makeKartTexture } from '../textures.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

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

    this.add.text(W / 2, H - 26,
      '←/→  (or A/D) move    ·    SPACE / ENTER / item key  pick    ·    click a car',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setAlpha(0.85);

    this.cursor = 0;
    this.setupKeys();
    this.startChooser(0);
    addMuteButton(this);

    Audio.resumeAudio();
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('TitleScene'));
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
    this.time.delayedCall(260, () => this.scene.start('RaceScene'));
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
