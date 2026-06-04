import Phaser from 'phaser';
import { CUPS } from '../GrandPrix.js';
import { THEMES } from '../TrackGenerator.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const WORLD_LABEL = {
  Grassy: '🌳 Grassy', Beach: '🏖 Beach', Ice: '❄ Ice', Candy: '🍭 Candy',
  Desert: '🏜 Desert', Coral: '🐠 Coral', Haunted: '👻 Haunted', Carnival: '🎪 Carnival',
  Volcano: '🌋 Volcano', Storm: '⛈️ Storm', Jungle: '🌿 Jungle', Neon: '🌃 Neon',
};
const WORLD_TAG = {
  Desert: 'dust', Coral: 'flow', Haunted: 'fog', Carnival: 'bounce',
  Volcano: 'lava', Storm: 'wind', Jungle: 'mud', Neon: 'speed',
};
// Indexed to match the CUPS order: Starter / Adventure / Pro.
const CUP_COLOR = [0x3f9a47, 0x2f8fb0, 0xc8542a];
const CUP_GLOW = [0x9bf06a, 0x5fd8f0, 0xffb24d];
const CUP_BADGE = ['🥉', '🥈', '🏆'];
const CUP_PIPS = [1, 2, 3];
const CUP_WORD = ['EASY', 'MEDIUM', 'EXPERT'];
const CUP_WORD_COLOR = ['#bff5a0', '#a8e8ff', '#ffd0a0'];

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
    this.t = 0;

    this.drawBackground(W, H);

    const title = this.add.text(W / 2, H * 0.08, 'CHOOSE A CUP', {
      fontFamily: 'monospace', fontSize: '44px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.04 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(W / 2, H * 0.145,
      this.registry.get('rainbow') ? 'Win it for the cup — Rainbow Road waits at the end 🌈' : 'Win all four for the championship',
      { fontFamily: 'monospace', fontSize: '15px', color: '#cdbfff', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(20);

    this.cursor = 0;
    this.panels = [];

    // Responsive layout: fit however many cups there are across the screen.
    const n = CUPS.length;
    const gap = n >= 3 ? 22 : 50;
    const sideMargin = 18;
    const panelW = Math.min(400, (W - sideMargin * 2 - gap * (n - 1)) / n);
    const panelH = 452;
    const totalW = n * panelW + (n - 1) * gap;
    const firstCx = (W - totalW) / 2 + panelW / 2;
    const cy = H * 0.57;

    CUPS.forEach((cup, i) => {
      this.panels.push(this.buildPanel(cup, i, firstCx + i * (panelW + gap), cy, panelW, panelH));
    });

    this.add.text(W / 2, H - 20,
      '←/→ (or A/D) move    ·    SPACE / ENTER pick    ·    click a cup',
      { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(20).setAlpha(0.85);

    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.leftKeys = [KC.A, KC.LEFT].map((c) => this.input.keyboard.addKey(c));
    this.rightKeys = [KC.D, KC.RIGHT].map((c) => this.input.keyboard.addKey(c));
    this.confirmKeys = [KC.SPACE, KC.ENTER, KC.E, KC.W, KC.UP].map((c) => this.input.keyboard.addKey(c));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('TitleScene'));

    this.redraw();
    addMuteButton(this);
    Audio.resumeAudio();
  }

  // ---------------------------------------------------------------- panel ----
  buildPanel(cup, index, x, cy, w, h) {
    const c = this.add.container(x, cy).setDepth(10);
    const base = CUP_COLOR[index] || 0x666666;
    const top = -h / 2;
    const half = w / 2;
    const sc = Phaser.Math.Clamp(w / 400, 0.7, 1); // content scale for narrow panels
    const px = (n) => Math.round(n);

    // Drop shadow.
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4); shadow.fillRoundedRect(-half + 6, top + 8, w, h, 22);
    c.add(shadow);

    // Body with a glossy top sheen.
    const body = this.add.graphics();
    body.fillStyle(base, 1); body.fillRoundedRect(-half, top, w, h, 22);
    body.fillStyle(0xffffff, 0.13); body.fillRoundedRect(-half + 6, top + 6, w - 12, h * 0.4, 16);
    body.fillStyle(0x000000, 0.13); body.fillRoundedRect(-half + 6, top + h * 0.55, w - 12, h * 0.42, 16);
    c.add(body);

    // Header band: tier badge + cup name + sub.
    const hdH = 64;
    const hd = this.add.graphics();
    hd.fillStyle(0x000000, 0.3); hd.fillRoundedRect(-half + 12, top + 14, w - 24, hdH, 14);
    c.add(hd);
    const badge = this.add.text(-half + 22 + 16 * sc, top + 14 + hdH / 2, CUP_BADGE[index] || '🏁', {
      fontFamily: 'monospace', fontSize: `${px(34 * sc)}px`,
    }).setOrigin(0.5);
    c.add(badge);
    const name = this.add.text(10, top + 14 + hdH * 0.38, cup.name, {
      fontFamily: 'monospace', fontSize: `${px(28 * sc)}px`, color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    c.add(name);
    const sub = this.add.text(10, top + 14 + hdH * 0.76, cup.sub, {
      fontFamily: 'monospace', fontSize: `${px(12 * sc)}px`, color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.85);
    c.add(sub);

    // Difficulty: three pips + the word (EASY / MEDIUM / EXPERT), centred.
    const py = top + 108;
    const meter = this.add.graphics();
    const filled = CUP_PIPS[index] || 1;
    const pipStep = 18 * sc;
    const pipR = 6 * sc;
    const grpStart = -w * 0.2;
    for (let k = 0; k < 3; k += 1) {
      const on = k < filled;
      meter.fillStyle(on ? 0xffe14d : 0x000000, on ? 1 : 0.3);
      meter.fillCircle(grpStart + k * pipStep, py, pipR);
      meter.lineStyle(2, 0xffffff, 0.7); meter.strokeCircle(grpStart + k * pipStep, py, pipR);
    }
    c.add(meter);
    const word = this.add.text(grpStart + 3 * pipStep + 8, py, CUP_WORD[index] || '', {
      fontFamily: 'monospace', fontSize: `${px(14 * sc)}px`, color: CUP_WORD_COLOR[index] || '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    c.add(word);

    // Divider.
    const div = this.add.graphics();
    div.lineStyle(2, 0xffffff, 0.22); div.beginPath();
    div.moveTo(-half + 22, top + 132); div.lineTo(half - 22, top + 132); div.strokePath();
    c.add(div);

    // World rows: a mini track-tile swatch + icon + name (+ feature tag).
    const swS = Math.max(12, 16 * sc);
    const swX = -half + 16 + swS;
    const labelX = swX + swS + 8;
    const rowTop = top + 170;
    const rowGap = 52;
    cup.themes.forEach((themeName, k) => {
      const ry = rowTop + k * rowGap;
      this.drawSwatch(c, swX, ry, themeName, swS);
      const label = this.add.text(labelX, ry, WORLD_LABEL[themeName] || themeName, {
        fontFamily: 'monospace', fontSize: `${px(Phaser.Math.Clamp(20 * sc, 14, 20))}px`, color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      c.add(label);
      if (WORLD_TAG[themeName]) {
        const tag = this.add.text(half - 14, ry, WORLD_TAG[themeName], {
          fontFamily: 'monospace', fontSize: `${px(Phaser.Math.Clamp(13 * sc, 10, 13))}px`, color: '#ffe7b0', fontStyle: 'bold',
        }).setOrigin(1, 0.5).setAlpha(0.9);
        c.add(tag);
      }
    });

    // Animated selection border (drawn each frame in update).
    const border = this.add.graphics();
    c.add(border);

    // "Pick" hint at the bottom (only shown on the selected panel).
    const hint = this.add.text(0, h / 2 - 26, '▶  PRESS SPACE', {
      fontFamily: 'monospace', fontSize: `${px(15 * sc)}px`, color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);
    c.add(hint);

    this.add.zone(x, cy, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { if (this.cursor !== index) { this.cursor = index; Audio.sfx('beep'); this.redraw(); } })
      .on('pointerdown', () => { this.cursor = index; this.confirm(); });

    return { cup, index, container: c, border, hint, w, h, badge, badgeY: top + 14 + hdH / 2, targetScale: 1 };
  }

  // A mini top-down racetrack tile: a road loop on the world's terrain, with
  // edge lines and a tiny start/finish checker — using that world's real colours.
  drawSwatch(c, x, y, themeName, s = 18) {
    const t = THEMES.find((th) => th.name === themeName) || THEMES[0];
    const g = this.add.graphics();
    g.fillStyle(t.terrain, 1); g.fillRoundedRect(x - s, y - s, s * 2, s * 2, 6);

    const ow = s * 1.45; const oh = s * 1.15;
    g.lineStyle(s * 0.6, t.edge, 1); g.strokeEllipse(x, y, ow, oh);
    g.lineStyle(s * 0.4, t.road, 1); g.strokeEllipse(x, y, ow, oh);

    // Start/finish checker across the top of the loop.
    const cell = Math.max(1.5, s * 0.12);
    const sy = y - oh / 2 - cell;
    for (let col = 0; col < 2; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        g.fillStyle((col + row) % 2 ? 0x101014 : 0xffffff, 1);
        g.fillRect(x - cell + col * cell, sy + row * cell, cell, cell);
      }
    }

    g.lineStyle(2, 0xffffff, 0.6); g.strokeRoundedRect(x - s, y - s, s * 2, s * 2, 6);
    c.add(g);
  }

  // --------------------------------------------------------------- select ----
  redraw() {
    this.panels.forEach((p, i) => {
      const sel = i === this.cursor;
      p.targetScale = sel ? 1.03 : 0.965;
      p.hint.setVisible(sel);
    });
  }

  drawChrome() {
    this.panels.forEach((p, i) => {
      const sel = i === this.cursor;
      const g = p.border;
      const w = p.w; const h = p.h; const top = -h / 2;
      g.clear();
      if (sel) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
        const glow = CUP_GLOW[i] || 0xffffff;
        g.lineStyle(7, glow, 0.55 + 0.45 * pulse);
        g.strokeRoundedRect(-w / 2 - 3, top - 3, w + 6, h + 6, 24);
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(-w / 2, top, w, h, 22);
        p.hint.setAlpha(0.65 + 0.35 * pulse);
      } else {
        g.lineStyle(3, 0xffffff, 0.4);
        g.strokeRoundedRect(-w / 2, top, w, h, 22);
      }
    });
  }

  confirm() {
    Audio.sfx('pickup');
    const cup = this.panels[this.cursor].cup.id;
    this.cameras.main.flash(160, 255, 255, 255);
    this.time.delayedCall(140, () => this.scene.start('CharacterSelectScene', { playerCount: this.playerCount, cup }));
  }

  update(time, deltaMs) {
    this.t += deltaMs / 1000;
    this.panels.forEach((p, i) => {
      const s = Phaser.Math.Linear(p.container.scale, p.targetScale, 0.18);
      p.container.setScale(s);
      p.badge.y = p.badgeY + (i === this.cursor ? Math.sin(this.t * 4) * 3 : 0);
    });
    this.drawChrome();

    if (this.leftKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) && this.cursor > 0) {
      this.cursor -= 1; Audio.sfx('beep'); this.redraw();
    }
    if (this.rightKeys.some((k) => Phaser.Input.Keyboard.JustDown(k)) && this.cursor < this.panels.length - 1) {
      this.cursor += 1; Audio.sfx('beep'); this.redraw();
    }
    if (this.confirmKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.confirm();
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
    let seed = 1234;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 70; i += 1) {
      g.fillStyle(0xffffff, 0.12 + rnd() * 0.32);
      g.fillCircle(rnd() * W, rnd() * H * 0.92, rnd() * 1.6 + 0.5);
    }
    const cell = 16;
    for (let cI = 0; cI * cell < W; cI += 1) {
      g.fillStyle(cI % 2 ? 0x111111 : 0xffffff, 0.9); g.fillRect(cI * cell, 0, cell, cell / 2);
      g.fillStyle(cI % 2 ? 0xffffff : 0x111111, 0.9); g.fillRect(cI * cell, cell / 2, cell, cell / 2);
    }
  }
}
