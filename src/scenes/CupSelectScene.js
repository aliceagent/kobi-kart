import Phaser from 'phaser';
import { CUPS } from '../GrandPrix.js';
import { THEMES } from '../TrackGenerator.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

const WORLD_LABEL = {
  Grassy: '🌳 Grassy', Beach: '🏖 Beach', Ice: '❄ Ice', Candy: '🍭 Candy',
  Volcano: '🌋 Volcano', Storm: '⛈️ Storm', Jungle: '🌿 Jungle', Neon: '🌃 Neon',
};
const WORLD_TAG = {
  Volcano: 'lava', Storm: 'wind', Jungle: 'mud', Neon: 'speed',
};
const CUP_COLOR = [0x3f9a47, 0xc8542a]; // Starter (green) / Pro (red-orange)
const CUP_GLOW = [0x9bf06a, 0xffb24d]; // selection glow per cup
const CUP_BADGE = ['🥇', '🏆']; // Starter medal / Pro trophy
const CUP_PIPS = [1, 3]; // track-difficulty out of 3

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

    const title = this.add.text(W / 2, H * 0.085, 'CHOOSE A CUP', {
      fontFamily: 'monospace', fontSize: '46px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#7a3bbf', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.04 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(W / 2, H * 0.155,
      this.registry.get('rainbow') ? 'Win it for the cup — Rainbow Road waits at the end 🌈' : 'Win all four for the championship',
      { fontFamily: 'monospace', fontSize: '15px', color: '#cdbfff', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(20);

    this.cursor = 0;
    this.panels = [];
    const panelW = 400;
    const panelH = 446;
    const gap = 56;
    const cx = W / 2 - (panelW + gap) / 2;
    const cy = H * 0.56;

    CUPS.forEach((cup, i) => {
      this.panels.push(this.buildPanel(cup, i, cx + i * (panelW + gap), cy, panelW, panelH));
    });

    this.add.text(W / 2, H - 22,
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
    const base = CUP_COLOR[index];
    const top = -h / 2;

    // Drop shadow.
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4); shadow.fillRoundedRect(-w / 2 + 7, top + 9, w, h, 24);
    c.add(shadow);

    // Body with a glossy top sheen.
    const body = this.add.graphics();
    body.fillStyle(base, 1); body.fillRoundedRect(-w / 2, top, w, h, 24);
    body.fillStyle(0xffffff, 0.13); body.fillRoundedRect(-w / 2 + 7, top + 7, w - 14, h * 0.4, 18);
    body.fillStyle(0x000000, 0.13); body.fillRoundedRect(-w / 2 + 7, top + h * 0.55, w - 14, h * 0.42, 18);
    c.add(body);

    // Header band.
    const hd = this.add.graphics();
    hd.fillStyle(0x000000, 0.3); hd.fillRoundedRect(-w / 2 + 16, top + 18, w - 32, 70, 16);
    c.add(hd);
    const badge = this.add.text(-w / 2 + 56, top + 53, CUP_BADGE[index], {
      fontFamily: 'monospace', fontSize: '40px',
    }).setOrigin(0.5);
    c.add(badge);
    const name = this.add.text(28, top + 44, cup.name, {
      fontFamily: 'monospace', fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);
    c.add(name);
    const sub = this.add.text(28, top + 72, cup.sub, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.85);
    c.add(sub);

    // Track-difficulty meter.
    const meter = this.add.graphics();
    const filled = CUP_PIPS[index];
    const py = top + 116;
    const px = 64;
    for (let k = 0; k < 3; k += 1) {
      const on = k < filled;
      meter.fillStyle(on ? 0xffe14d : 0x000000, on ? 1 : 0.3);
      meter.fillCircle(px + k * 22, py, 7);
      meter.lineStyle(2, 0xffffff, 0.7); meter.strokeCircle(px + k * 22, py, 7);
    }
    c.add(meter);
    const diffLabel = this.add.text(-w / 2 + 28, py, 'DIFFICULTY', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setAlpha(0.85);
    c.add(diffLabel);
    const diffWord = this.add.text(w / 2 - 28, py, index === 0 ? 'EASY' : 'EXPERT', {
      fontFamily: 'monospace', fontSize: '13px', color: index === 0 ? '#bff5a0' : '#ffd0a0', fontStyle: 'bold',
    }).setOrigin(1, 0.5);
    c.add(diffWord);

    // Divider.
    const div = this.add.graphics();
    div.lineStyle(2, 0xffffff, 0.25); div.beginPath();
    div.moveTo(-w / 2 + 26, top + 142); div.lineTo(w / 2 - 26, top + 142); div.strokePath();
    c.add(div);

    // World rows: a mini track-tile swatch + icon + name (+ hazard tag).
    cup.themes.forEach((themeName, k) => {
      const ry = top + 184 + k * 56;
      this.drawSwatch(c, -w / 2 + 52, ry, themeName);
      const label = this.add.text(-w / 2 + 84, ry, WORLD_LABEL[themeName] || themeName, {
        fontFamily: 'monospace', fontSize: '21px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5);
      c.add(label);
      if (WORLD_TAG[themeName]) {
        const tag = this.add.text(w / 2 - 28, ry, WORLD_TAG[themeName], {
          fontFamily: 'monospace', fontSize: '13px', color: '#ffe7b0', fontStyle: 'bold',
        }).setOrigin(1, 0.5).setAlpha(0.9);
        c.add(tag);
      }
    });

    // Animated selection border (drawn each frame in update).
    const border = this.add.graphics();
    c.add(border);

    // "Pick" hint at the bottom (only shown on the selected panel).
    const hint = this.add.text(0, h / 2 - 28, '▶  PRESS SPACE', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);
    c.add(hint);

    this.add.zone(x, cy, w, h).setInteractive({ useHandCursor: true })
      .on('pointerover', () => { if (this.cursor !== index) { this.cursor = index; Audio.sfx('beep'); this.redraw(); } })
      .on('pointerdown', () => { this.cursor = index; this.confirm(); });

    return { cup, index, container: c, border, hint, w, h, badge, targetScale: 1 };
  }

  // A mini top-down racetrack tile: a road loop on the world's terrain, with
  // edge lines and a tiny start/finish checker — using that world's real colours.
  drawSwatch(c, x, y, themeName) {
    const t = THEMES.find((th) => th.name === themeName) || THEMES[0];
    const s = 18;
    const g = this.add.graphics();
    // Terrain tile (also the infield once the loop is drawn over it).
    g.fillStyle(t.terrain, 1); g.fillRoundedRect(x - s, y - s, s * 2, s * 2, 6);

    // Oval loop: an edge ring, then the road ring on top (edge peeks out 2px).
    const ow = 26; const oh = 21; // ellipse diameters
    g.lineStyle(11, t.edge, 1); g.strokeEllipse(x, y, ow, oh);
    g.lineStyle(7, t.road, 1); g.strokeEllipse(x, y, ow, oh);

    // Start/finish checker across the top of the loop.
    const sy = y - oh / 2 - 4;
    for (let col = 0; col < 2; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        g.fillStyle((col + row) % 2 ? 0x101014 : 0xffffff, 1);
        g.fillRect(x - 2 + col * 2, sy + row * 2, 2, 2);
      }
    }

    g.lineStyle(2, 0xffffff, 0.6); g.strokeRoundedRect(x - s, y - s, s * 2, s * 2, 6);
    c.add(g);
  }

  // --------------------------------------------------------------- select ----
  redraw() {
    this.panels.forEach((p, i) => {
      const sel = i === this.cursor;
      p.targetScale = sel ? 1.035 : 0.97;
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
        g.strokeRoundedRect(-w / 2 - 3, top - 3, w + 6, h + 6, 26);
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(-w / 2, top, w, h, 24);
        p.hint.setAlpha(0.65 + 0.35 * pulse);
      } else {
        g.lineStyle(3, 0xffffff, 0.4);
        g.strokeRoundedRect(-w / 2, top, w, h, 24);
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
    // Smoothly ease each panel toward its target scale + bob the selected badge.
    this.panels.forEach((p, i) => {
      const s = Phaser.Math.Linear(p.container.scale, p.targetScale, 0.18);
      p.container.setScale(s);
      p.badge.y = (-p.h / 2 + 53) + (i === this.cursor ? Math.sin(this.t * 4) * 3 : 0);
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
    // Soft diagonal speed streaks.
    g.fillStyle(0xffffff, 0.04);
    for (let k = -2; k < 12; k += 1) {
      const x = k * 150;
      g.fillTriangle(x, H, x + 70, H, x + 240, 0);
    }
    // Sparkles (deterministic scatter).
    let seed = 1234;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 70; i += 1) {
      g.fillStyle(0xffffff, 0.12 + rnd() * 0.32);
      g.fillCircle(rnd() * W, rnd() * H * 0.92, rnd() * 1.6 + 0.5);
    }
    // Checkered strip across the top.
    const cell = 16;
    for (let cI = 0; cI * cell < W; cI += 1) {
      g.fillStyle(cI % 2 ? 0x111111 : 0xffffff, 0.9); g.fillRect(cI * cell, 0, cell, cell / 2);
      g.fillStyle(cI % 2 ? 0xffffff : 0x111111, 0.9); g.fillRect(cI * cell, cell / 2, cell, cell / 2);
    }
  }
}
