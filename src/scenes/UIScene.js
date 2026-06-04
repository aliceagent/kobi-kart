import Phaser from 'phaser';
import { LAPS } from '../GrandPrix.js';
import { TUNE } from '../Kart.js';
import { addMuteButton } from '../ui.js';
import * as Audio from '../Audio.js';

function ordinal(n) {
  return ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
}

// Transparent overlay drawn at true screen coordinates, immune to the race
// camera's zoom/scroll.
export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  init(data) {
    this.race = data.race;
  }

  create() {
    const W = this.scale.width;
    this.speedGfx = this.add.graphics().setDepth(8); // boost speed-lines (behind HUD)
    this.lastLeadLap = 0;
    this.announcedFinalLap = false;
    this.gfx = this.add.graphics().setDepth(10);

    this.banner = this.add.text(W / 2, 14, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(11);

    this.countdownLabel = this.add.text(W / 2, this.scale.height / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '96px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(12);

    const style = {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    };
    this.p1Text = this.add.text(16, 12, '', style).setDepth(11);
    this.p2Text = this.add.text(W - 16, 12, '', style).setOrigin(1, 0).setDepth(11);

    // "Use item" key reminder under each player's item box.
    const hintStyle = {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe08a',
      stroke: '#000000', strokeThickness: 3,
    };
    if (this.race && this.race.humans && this.race.humans[0]) {
      this.add.text(16, 99, 'item: E / Space', hintStyle).setDepth(11);
    }
    if (this.race && this.race.humans && this.race.humans[1]) {
      this.add.text(W - 16, 99, 'item: R-Shift \\ /', hintStyle).setOrigin(1, 0).setDepth(11);
    }

    this.stragglerText = this.add.text(W / 2, 40, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(11);

    // Pause overlay (shown when the race is paused).
    const H = this.scale.height;
    this.pauseDim = this.add.graphics().setDepth(30).setVisible(false);
    this.pauseDim.fillStyle(0x000000, 0.6); this.pauseDim.fillRect(0, 0, W, H);
    this.pauseTitle = this.add.text(W / 2, H / 2 - 30, 'PAUSED', {
      fontFamily: 'monospace', fontSize: '64px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.pauseHint = this.add.text(W / 2, H / 2 + 34, 'P — resume     ·     Q / Esc — quit to menu', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(31).setVisible(false);

    // Neon: a dark vignette closing in around the action (reduced visibility).
    if (this.race && this.race.lowVis) this.addVignette();

    addMuteButton(this);
  }

  addVignette() {
    const W = this.scale.width;
    const H = this.scale.height;
    const key = 'neonVignette';
    try {
      if (!this.textures.exists(key)) {
        const tex = this.textures.createCanvas(key, W, H);
        const ctx = tex && tex.getContext('2d');
        if (!ctx) return;
        const grd = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.62);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(0.7, 'rgba(2,2,10,0.35)');
        grd.addColorStop(1, 'rgba(0,0,6,0.92)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
        tex.refresh();
      }
      this.add.image(W / 2, H / 2, key).setDepth(9).setScrollFactor(0);
    } catch (e) { /* vignette is decorative — never break the HUD */ }
  }

  drawBar(x, y, kart, color, rightAlign) {
    const w = 150;
    const h = 13;
    const bx = rightAlign ? x - w : x;
    const pct = kart.boostFuel / TUNE.boostMax;
    this.gfx.fillStyle(0x000000, 0.45);
    this.gfx.fillRoundedRect(bx - 3, y - 3, w + 6, h + 6, 4);
    this.gfx.fillStyle(kart.boostDepleted ? 0x9a9a9a : color, 1);
    this.gfx.fillRoundedRect(bx, y, Math.max(0, w * pct), h, 3);
    this.gfx.lineStyle(2, 0xffffff, 0.85);
    this.gfx.strokeRoundedRect(bx, y, w, h, 3);
  }

  drawItemBox(x, y, size, item, accent) {
    const g = this.gfx;
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x, y, size, size, 7);
    g.lineStyle(2.5, accent, 0.95);
    g.strokeRoundedRect(x, y, size, size, 7);
    const cx = x + size / 2;
    const cy = y + size / 2;

    if (!item) {
      g.fillStyle(0xffffff, 0.22);
      g.fillCircle(cx, cy, 3);
      return;
    }
    if (item === 'boost') {
      g.fillStyle(0xffd23f, 1);
      g.fillTriangle(cx - 10, cy - 8, cx - 10, cy + 8, cx - 1, cy);
      g.fillTriangle(cx - 1, cy - 8, cx - 1, cy + 8, cx + 8, cy);
    } else if (item === 'greenShell' || item === 'redShell' || item === 'blueShell') {
      let base = 0x3ecf5a; let rim = 0x1f8f3f; let dark = 0x14662b;
      if (item === 'redShell') { base = 0xff5a5a; rim = 0xc0392b; dark = 0x8e1f1f; }
      else if (item === 'blueShell') { base = 0x4d8bff; rim = 0x1e46b0; dark = 0x122e6e; }
      g.fillStyle(0x16161c, 1); g.fillCircle(cx, cy, 12);
      g.fillStyle(rim, 1); g.fillCircle(cx, cy, 10.5);
      g.fillStyle(base, 1); g.fillCircle(cx, cy, 8);
      g.lineStyle(1.5, dark, 1);
      const hex = [];
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        hex.push({ x: cx + Math.cos(a) * 4, y: cy + Math.sin(a) * 4 });
      }
      g.fillStyle(dark, 1); g.fillPoints(hex, true);
      g.fillStyle(0xffffff, 0.5); g.fillCircle(cx - 4, cy - 4, 2);
    } else if (item === 'trap') {
      g.fillStyle(0x15151c, 0.95); g.fillEllipse(cx, cy + 2, 28, 16);
      g.fillStyle(0x6f6ab0, 0.8); g.fillEllipse(cx - 4, cy - 2, 9, 5);
    } else if (item === 'shield') {
      g.fillStyle(0x9fe8ff, 0.28); g.fillCircle(cx, cy, 11);
      g.lineStyle(3, 0x9fe8ff, 1); g.strokeCircle(cx, cy, 11);
    }
  }

  update() {
    const race = this.race;
    if (!race || !race.scene || !race.racers) return;
    const paused = !!race.paused;
    this.pauseDim.setVisible(paused);
    this.pauseTitle.setVisible(paused);
    this.pauseHint.setVisible(paused);
    this.gfx.clear();
    const W = this.scale.width;

    const lead = race.humans[0] || race.order[0];
    const lap = Math.min((lead ? lead.lap : 0) + 1, LAPS);
    const themeName = race.theme ? race.theme.name.toUpperCase() : '';
    const total = race.gp.themeOrder.length;
    this.banner.setText(`RACE ${race.gp.raceIndex + 1}/${total}   ·   ${themeName}   ·   LAP ${lap}/${LAPS}`);
    this.countdownLabel.setText(race.countdownText || '');

    // When only the last racer remains, show their 60s finish clock.
    if (race.stragglerDeadline !== null && race.state === 'racing') {
      const left = Math.max(0, Math.ceil(race.stragglerDeadline - race.raceElapsed));
      this.stragglerText.setText(`LAST RACER — ${left}s to finish`);
    } else {
      this.stragglerText.setText('');
    }

    const h0 = race.humans[0];
    if (h0) {
      this.p1Text.setText(`P1  ${ordinal(h0.livePlace || 1)}${h0.finished ? '  done' : ''}`);
      this.drawBar(16, 34, h0, h0.color, false);
      this.drawItemBox(16, 54, 42, h0.heldItem, h0.color);
    }
    const h1 = race.humans[1];
    if (h1) {
      this.p2Text.setText(`${ordinal(h1.livePlace || 1)}  P2${h1.finished ? '  done' : ''}`);
      this.drawBar(W - 16, 34, h1, h1.color, true);
      this.drawItemBox(W - 16 - 42, 54, 42, h1.heldItem, h1.color);
    }

    // Boost speed-lines: intensity from the fastest human's boost state.
    let boostF = 0;
    for (const h of race.humans) {
      if (h.itemBoostTimer > 0) boostF = Math.max(boostF, 1);
      else if (h.padBoostTimer > 0) boostF = Math.max(boostF, 0.75);
      else if (h.boosting) boostF = Math.max(boostF, 0.55);
    }
    this.drawSpeedLines(paused ? 0 : boostF);

    // "FINAL LAP!" stinger the moment the lead human starts their last lap.
    if (race.state === 'racing' && race.humans.length && !this.announcedFinalLap) {
      const maxLap = race.humans.reduce((m, h) => Math.max(m, h.lap), 0);
      if (maxLap >= LAPS - 1) { this.announcedFinalLap = true; this.showFinalLap(); }
    }
  }

  drawSpeedLines(factor) {
    const g = this.speedGfx;
    g.clear();
    if (factor <= 0) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const ph = (this.race.elapsed || 0);
    const n = 20;
    const r1 = Math.max(W, H) * 0.42;
    g.lineStyle(2, 0xffffff, 0.08 + 0.12 * factor);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.sin(ph * 5 + i) * 0.04;
      const r2 = r1 + (34 + Math.abs(Math.sin(ph * 9 + i * 1.3)) * 36) * factor;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.strokePath();
    }
  }

  showFinalLap() {
    Audio.sfx('finallap');
    const W = this.scale.width;
    const H = this.scale.height;
    this.race.cameras.main.flash(180, 255, 230, 120);
    const t = this.add.text(W / 2, H * 0.4, 'FINAL LAP!', {
      fontFamily: 'monospace', fontSize: '52px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#c0392b', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, scale: { from: 0.4, to: 1.15 }, duration: 450, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, delay: 1400, duration: 700, onComplete: () => t.destroy() });
  }
}
