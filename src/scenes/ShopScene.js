import Phaser from 'phaser';
import * as Audio from '../Audio.js';
import * as Cosmetics from '../Cosmetics.js';
import { makeKartTexture } from '../textures.js';
import { addMuteButton, fadeIn, transitionTo } from '../ui.js';

// The kart shop: spend race/battle coins on paint jobs and exhaust flames.
// Everything bought lands in a shared garage; P1 and P2 equip independently.
export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    fadeIn(this);
    this.drawBackground(W, H);

    this.add.text(W / 2, H * 0.075, '🛒  KART SHOP', {
      fontFamily: 'monospace', fontSize: '42px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(5);

    this.walletText = this.add.text(W - 26, H * 0.075, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffd23f', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(1, 0.5).setDepth(5);

    // Who are we dressing? P1 / P2 equip independently.
    this.slot = 'p1';
    this.add.text(W / 2 - 116, H * 0.155, 'EQUIP FOR:', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5);
    this.slotButtons = [];
    this.makeSlotToggle(W / 2 - 16, H * 0.155, 'P1', 'p1', 0xff4d4d);
    this.makeSlotToggle(W / 2 + 64, H * 0.155, 'P2', 'p2', 0x4d8bff);

    this.cards = [];
    this.sectionLabel('🎨  PAINT JOBS', H * 0.225);
    this.buildPaintRow(H * 0.36);
    this.sectionLabel('🔥  EXHAUST FLAMES', H * 0.535);
    this.buildFlameRow(H * 0.665);

    this.promptText = this.add.text(W / 2, H * 0.80, 'Win races and battles to earn coins', {
      fontFamily: 'monospace', fontSize: '15px', color: '#cdbfff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5);

    this.makeBackButton(W / 2, H * 0.885);
    this.input.keyboard.on('keydown-ESC', () => transitionTo(this, 'TitleScene'));
    addMuteButton(this);
    Audio.resumeAudio();
    this.refresh();
  }

  sectionLabel(text, y) {
    this.add.text(this.scale.width / 2, y, text, {
      fontFamily: 'monospace', fontSize: '21px', color: '#8be8f0', fontStyle: 'bold',
      stroke: '#06212b', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
  }

  makeSlotToggle(x, y, label, slot, color) {
    const w = 64; const h = 34;
    const g = this.add.graphics().setDepth(5);
    const t = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);
    const btn = { g, t, slot, x, y, w, h, color };
    this.slotButtons.push(btn);
    this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.slot = slot; Audio.sfx('beep'); this.refresh(); });
  }

  // One row of cards. Each spec: { id, name, price, draw(g, x, y), imageKey }.
  buildRow(specs, cy, cardW, cardH, kind) {
    const W = this.scale.width;
    const gap = 12;
    const totalW = specs.length * cardW + (specs.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;
    specs.forEach((spec, i) => {
      const x = startX + i * (cardW + gap);
      const g = this.add.graphics().setDepth(2);
      let img = null;
      if (spec.imageKey) {
        img = this.add.image(x, cy - 22, spec.imageKey).setDepth(3);
        img.rotation = -Math.PI / 2;
        img.setScale(1.55);
      }
      const name = this.add.text(x, cy + 26, spec.name, {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(3);
      const status = this.add.text(x, cy + 48, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffd23f', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(3);
      const card = { spec, kind, x, cy, w: cardW, h: cardH, g, name, status, hover: false };
      this.cards.push(card);
      this.add.zone(x, cy, cardW, cardH).setInteractive({ useHandCursor: true })
        .on('pointerover', () => { card.hover = true; this.refresh(); })
        .on('pointerout', () => { card.hover = false; this.refresh(); })
        .on('pointerdown', () => this.pick(card));
    });
  }

  buildPaintRow(cy) {
    const specs = [{ id: null, name: 'STOCK', price: 0, imageKey: this.kartPreview(null) }];
    for (const p of Cosmetics.PAINTS) {
      specs.push({ id: p.id, name: p.name, price: p.price, imageKey: this.kartPreview(p) });
    }
    this.buildRow(specs, cy, 122, 138, 'paint');
  }

  buildFlameRow(cy) {
    const specs = [{ id: null, name: 'STOCK', price: 0, flameColor: 0xffd23f }];
    for (const f of Cosmetics.FLAMES) {
      specs.push({ id: f.id, name: f.name, price: f.price, flameColor: f.color });
    }
    this.buildRow(specs, cy, 156, 128, 'flame');
  }

  // A kart texture in the paint's colours (or roster red for STOCK).
  kartPreview(paint) {
    const key = paint ? `shop_${paint.id}` : 'shop_stock';
    makeKartTexture(this, key, paint ? paint.body : 0xff4d4d, paint ? paint.trim : 0xffe14d);
    return key;
  }

  pick(card) {
    const { spec, kind } = card;
    const eq = Cosmetics.equipped(this.slot);
    if (spec.id === null) {
      Cosmetics.setEquipped(this.slot, kind, null);
      Audio.sfx('beep');
      this.promptText.setText(`${this.slot.toUpperCase()} back to stock ${kind === 'paint' ? 'paint' : 'flames'}`);
    } else if (Cosmetics.isOwned(spec.id)) {
      const already = eq[kind] === spec.id;
      Cosmetics.setEquipped(this.slot, kind, already ? null : spec.id);
      Audio.sfx(already ? 'beep' : 'pickup');
      this.promptText.setText(already ? `${spec.name} unequipped` : `${spec.name} equipped for ${this.slot.toUpperCase()}`);
    } else if (Cosmetics.spend(spec.price)) {
      Cosmetics.own(spec.id);
      Cosmetics.setEquipped(this.slot, kind, spec.id);
      Audio.sfx('fanfare');
      this.promptText.setText(`Bought ${spec.name} — equipped for ${this.slot.toUpperCase()}!`);
    } else {
      Audio.sfx('hit');
      this.promptText.setText(`Not enough coins — ${spec.name} costs 🪙 ${spec.price}`);
    }
    this.refresh();
  }

  refresh() {
    this.walletText.setText(`🪙 ${Cosmetics.wallet()}`);
    // slot toggles
    for (const b of this.slotButtons) {
      const sel = b.slot === this.slot;
      b.g.clear();
      b.g.fillStyle(0x000000, 0.4); b.g.fillRoundedRect(b.x - b.w / 2 + 2, b.y - b.h / 2 + 3, b.w, b.h, 9);
      b.g.fillStyle(sel ? b.color : 0x3a2f55, 1); b.g.fillRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 9);
      b.g.lineStyle(sel ? 3 : 2, 0xffffff, sel ? 1 : 0.4); b.g.strokeRoundedRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 9);
    }
    const eqP1 = Cosmetics.equipped('p1');
    const eqP2 = Cosmetics.equipped('p2');
    const eqCur = this.slot === 'p1' ? eqP1 : eqP2;
    for (const c of this.cards) {
      const { spec, kind } = c;
      const ownedItem = spec.id === null || Cosmetics.isOwned(spec.id);
      const equippedHere = (eqCur[kind] || null) === spec.id;
      const g = c.g;
      g.clear();
      g.fillStyle(0x000000, 0.35); g.fillRoundedRect(c.x - c.w / 2 + 3, c.cy - c.h / 2 + 4, c.w, c.h, 13);
      g.fillStyle(0x140a26, c.hover || equippedHere ? 0.97 : 0.72);
      g.fillRoundedRect(c.x - c.w / 2, c.cy - c.h / 2, c.w, c.h, 13);
      g.lineStyle(equippedHere ? 4 : 2, equippedHere ? 0xffe14d : 0xffffff, equippedHere ? 1 : (c.hover ? 0.8 : 0.35));
      g.strokeRoundedRect(c.x - c.w / 2, c.cy - c.h / 2, c.w, c.h, 13);
      // flame cards draw their fire here (paint cards use a texture image)
      if (kind === 'flame') {
        const fx = c.x; const fy = c.cy - 22;
        g.fillStyle(spec.flameColor, 0.92);
        g.fillTriangle(fx - 7, fy - 16, fx + 7, fy - 16, fx, fy + 26);
        g.fillStyle(0xfff3b0, 0.9);
        g.fillTriangle(fx - 4, fy - 14, fx + 4, fy - 14, fx, fy + 10);
      }
      // P1/P2 chips when equipped by either player
      const chips = [];
      if ((eqP1[kind] || null) === spec.id && spec.id !== null) chips.push(['P1', 0xff4d4d]);
      if ((eqP2[kind] || null) === spec.id && spec.id !== null) chips.push(['P2', 0x4d8bff]);
      chips.forEach(([label, col], ci) => {
        const cx = c.x - c.w / 2 + 16 + ci * 26;
        const cyy = c.cy - c.h / 2 + 13;
        g.fillStyle(col, 1); g.fillRoundedRect(cx - 12, cyy - 8, 24, 16, 5);
        // text drawn once in refresh would stack — chips are graphics + a tiny
        // texture-less label via existing text objects is overkill; the colour
        // alone marks the player, and the card border marks "current".
      });
      if (spec.id === null) {
        c.status.setText(equippedHere ? 'EQUIPPED' : 'FREE');
        c.status.setColor(equippedHere ? '#ffffff' : '#9be8a0');
      } else if (!ownedItem) {
        c.status.setText(`🪙 ${spec.price}`);
        c.status.setColor(Cosmetics.wallet() >= spec.price ? '#ffd23f' : '#ff8a7a');
      } else {
        c.status.setText(equippedHere ? 'EQUIPPED' : 'OWNED');
        c.status.setColor(equippedHere ? '#ffffff' : '#9be8a0');
      }
    }
  }

  makeBackButton(x, y) {
    const w = 210; const h = 50;
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
      fontFamily: 'monospace', fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#102a5c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);
    this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { draw(true); text.setScale(1.05); })
      .on('pointerout', () => { draw(false); text.setScale(1); })
      .on('pointerdown', () => transitionTo(this, 'TitleScene'));
  }

  drawBackground(W, H) {
    const g = this.add.graphics().setDepth(0);
    const top = Phaser.Display.Color.ValueToColor(0x141026);
    const bot = Phaser.Display.Color.ValueToColor(0x2a1a4a);
    const bands = 48;
    for (let i = 0; i < bands; i += 1) {
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(top, bot, bands, i);
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
      g.fillRect(0, Math.floor((i * H) / bands), W, Math.ceil(H / bands) + 1);
    }
    let seed = 777;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 60; i += 1) {
      g.fillStyle(0xffffff, 0.10 + rnd() * 0.25);
      g.fillCircle(rnd() * W, rnd() * H * 0.95, rnd() * 1.5 + 0.5);
    }
    const cell = 16;
    for (let cI = 0; cI * cell < W; cI += 1) {
      g.fillStyle(cI % 2 ? 0x111111 : 0xffffff, 0.9); g.fillRect(cI * cell, 0, cell, cell / 2);
      g.fillStyle(cI % 2 ? 0xffffff : 0x111111, 0.9); g.fillRect(cI * cell, cell / 2, cell, cell / 2);
    }
  }
}
