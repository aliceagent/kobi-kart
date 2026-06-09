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
    this.miniTrackGfx = this.add.graphics().setDepth(9); // minimap track (static)
    this.miniDotGfx = this.add.graphics().setDepth(9); // minimap kart dots (per frame)
    this.gfx = this.add.graphics().setDepth(10);

    this.banner = this.add.text(W / 2, 14, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(11);

    this.lightsGfx = this.add.graphics().setDepth(12); // start-light gantry
    this.countdownLabel = this.add.text(W / 2, this.scale.height / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '96px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(12);

    this.revHint = this.add.text(W / 2, this.scale.height / 2 + 34, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);

    this.attractText = this.add.text(W / 2, this.scale.height - 28, '', {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(40);

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

    const coinStyle = {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    };
    this.coinP1 = this.add.text(34, 116, '', coinStyle).setOrigin(0, 0.5).setDepth(11);
    this.coinP2 = this.add.text(W - 34, 116, '', coinStyle).setOrigin(1, 0.5).setDepth(11);

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

    this.buildMinimap();

    addMuteButton(this);
  }

  // Build the static minimap panel + track outline, fitting the track's bounding
  // box into a small box in the bottom-left corner.
  buildMinimap() {
    const race = this.race;
    this.minimap = null;
    if (!race || !race.centerline || !race.centerline.length) return;
    const cl = race.centerline;
    const H = this.scale.height;
    const mw = 150; const mh = 108; const pad = 10;
    const mx = 14; const my = H - mh - 14;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of cl) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const bw = (maxX - minX) || 1; const bh = (maxY - minY) || 1;
    const scale = Math.min((mw - 2 * pad) / bw, (mh - 2 * pad) / bh);
    const offX = mx + (mw - bw * scale) / 2 - minX * scale;
    const offY = my + (mh - bh * scale) / 2 - minY * scale;
    this.minimap = { mx, my, mw, mh, scale, offX, offY };

    const g = this.miniTrackGfx;
    g.clear();
    g.fillStyle(0x000000, 0.45); g.fillRoundedRect(mx, my, mw, mh, 8);
    g.lineStyle(2, 0xffffff, 0.5); g.strokeRoundedRect(mx, my, mw, mh, 8);
    const step = Math.max(1, Math.floor(cl.length / 130));
    const pts = [];
    for (let i = 0; i < cl.length; i += step) pts.push({ x: offX + cl[i].x * scale, y: offY + cl[i].y * scale });
    const loop = (wdt, col, al) => {
      g.lineStyle(wdt, col, al);
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
      g.closePath(); g.strokePath();
    };
    loop(4.5, 0x000000, 0.55);
    loop(2.4, 0xdfe6f2, 0.9);
    const sc = race.shortcut;
    if (sc) {
      g.lineStyle(2.4, 0x9c7b50, 0.95);
      g.beginPath();
      g.moveTo(offX + sc.ax * scale, offY + sc.ay * scale);
      g.lineTo(offX + sc.bx * scale, offY + sc.by * scale);
      g.strokePath();
    }
    g.fillStyle(0xffe14d, 1); g.fillCircle(offX + cl[0].x * scale, offY + cl[0].y * scale, 3); // start line
  }

  drawMinimapDots() {
    const m = this.minimap;
    if (!m) return;
    const g = this.miniDotGfx;
    g.clear();
    for (const r of this.race.racers) {
      const x = Phaser.Math.Clamp(m.offX + r.x * m.scale, m.mx + 3, m.mx + m.mw - 3);
      const y = Phaser.Math.Clamp(m.offY + r.y * m.scale, m.my + 3, m.my + m.mh - 3);
      const human = !r.isAI;
      const rad = human ? 4.5 : 3.5;
      g.fillStyle(0x000000, 0.6); g.fillCircle(x, y, rad + 1.5);
      g.fillStyle(r.color, r.finished ? 0.45 : 1); g.fillCircle(x, y, rad);
      if (human) { g.lineStyle(1.5, 0xffffff, 0.95); g.strokeCircle(x, y, rad); }
    }
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

  drawCoinTag(x, y, count) {
    const g = this.gfx;
    g.fillStyle(0x9a6b12, 1); g.fillCircle(x, y, 8);
    g.fillStyle(count > 0 ? 0xffd23f : 0x6a6a52, 1); g.fillCircle(x, y, 6.5);
    g.fillStyle(0xfff0a0, count > 0 ? 1 : 0.5); g.fillCircle(x, y, 3.5);
  }

  drawItemBox(x, y, size, item, accent, count) {
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
    if (item === 'boost' || item === 'tripleMushroom') {
      if (item === 'tripleMushroom') {
        g.fillStyle(0xefe6cf, 1); g.fillRect(cx - 3, cy, 6, 9);
        g.fillStyle(0xff5a4d, 1); g.fillEllipse(cx, cy, 22, 16);
        g.fillStyle(0xffffff, 0.85); g.fillCircle(cx - 5, cy - 2, 2.4); g.fillCircle(cx + 4, cy - 1, 2);
      } else {
        g.fillStyle(0xffd23f, 1);
        g.fillTriangle(cx - 10, cy - 8, cx - 10, cy + 8, cx - 1, cy);
        g.fillTriangle(cx - 1, cy - 8, cx - 1, cy + 8, cx + 8, cy);
      }
    } else if (item === 'greenShell' || item === 'redShell' || item === 'blueShell' || item === 'tripleShell') {
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
    } else if (item === 'star') {
      const pts = [];
      for (let k = 0; k < 10; k += 1) {
        const rr = k % 2 === 0 ? 12 : 5;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      }
      g.fillStyle(0xffe14d, 1); g.fillPoints(pts, true);
      g.fillStyle(0xfff7c0, 0.8); g.fillCircle(cx, cy, 3);
    } else if (item === 'lightning') {
      g.fillStyle(0xffe14d, 1);
      g.fillPoints([
        { x: cx + 3, y: cy - 11 }, { x: cx - 7, y: cy + 2 }, { x: cx - 1, y: cy + 2 },
        { x: cx - 3, y: cy + 11 }, { x: cx + 7, y: cy - 2 }, { x: cx + 1, y: cy - 2 },
      ], true);
    }

    // Ammo pips for the multi-use items (triple mushroom / triple shell).
    if (count > 1) {
      for (let i = 0; i < count; i += 1) {
        g.fillStyle(0x000000, 0.6); g.fillCircle(x + size - 7 - i * 7, y + size - 6, 3);
        g.fillStyle(0xffffff, 1); g.fillCircle(x + size - 7 - i * 7, y + size - 6, 2);
      }
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
    this.drawMinimapDots();
    const W = this.scale.width;

    const lead = race.humans[0] || race.order[0];
    const lap = Math.min((lead ? lead.lap : 0) + 1, LAPS);
    const themeName = race.theme ? race.theme.name.toUpperCase() : '';
    const total = race.gp.themeOrder.length;
    this.banner.setText(`RACE ${race.gp.raceIndex + 1}/${total}   ·   ${themeName}   ·   LAP ${lap}/${LAPS}`);
    // Start lights: red bulbs ramp 3→2→1, all flash green on GO. The number
    // mirrors them (the "4" warm-up second shows just the empty gantry).
    let cLabel = race.countdownText && race.countdownText !== '4' ? race.countdownText : '';
    if (race.state === 'countdown') {
      const cd = race.countdown;
      this.drawStartLights(cd <= 1 ? 3 : cd <= 2 ? 2 : cd <= 3 ? 1 : 0, false);
    } else if (race.state === 'racing' && race.raceElapsed < 0.7) {
      this.drawStartLights(0, true);
      cLabel = 'GO!';
    } else {
      this.lightsGfx.clear();
    }
    this.countdownLabel.setText(cLabel);
    const attract = !!(race.gp && race.gp.attract);
    this.revHint.setText(race.state === 'countdown' && !attract ? 'tap BOOST as GO! flashes for a 🚀 rocket start' : '');
    if (attract) {
      this.attractText.setText('▶  DEMO  —  press any key to play');
      this.attractText.setAlpha(0.55 + 0.45 * Math.sin((race.elapsed || 0) * 4));
    } else {
      this.attractText.setText('');
    }

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
      this.drawItemBox(16, 54, 42, h0.heldItem, h0.color, h0.heldCount || h0.orbitShells || 0);
      this.drawCoinTag(22, 116, h0.coins || 0); this.coinP1.setText(`× ${h0.coins || 0}`);
    }
    const h1 = race.humans[1];
    if (h1) {
      this.p2Text.setText(`${ordinal(h1.livePlace || 1)}  P2${h1.finished ? '  done' : ''}`);
      this.drawBar(W - 16, 34, h1, h1.color, true);
      this.drawItemBox(W - 16 - 42, 54, 42, h1.heldItem, h1.color, h1.heldCount || h1.orbitShells || 0);
      this.drawCoinTag(W - 22, 116, h1.coins || 0); this.coinP2.setText(`× ${h1.coins || 0}`);
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

  // Start-light gantry: 3 bulbs. red 1→2→3 over the countdown, all green on GO.
  drawStartLights(redOn, green) {
    const g = this.lightsGfx;
    g.clear();
    const cx = this.scale.width / 2;
    const cy = this.scale.height * 0.24;
    const n = 3; const spacing = 58; const r = 18;
    const hw = (n - 1) * spacing + r * 2 + 30; const hh = r * 2 + 22;
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(cx - hw / 2 + 3, cy - hh / 2 + 4, hw, hh, 13);
    g.fillStyle(0x222530, 1); g.fillRoundedRect(cx - hw / 2, cy - hh / 2, hw, hh, 13);
    g.lineStyle(2, 0x000000, 0.5); g.strokeRoundedRect(cx - hw / 2, cy - hh / 2, hw, hh, 13);
    for (let i = 0; i < n; i += 1) {
      const x = cx - ((n - 1) * spacing) / 2 + i * spacing;
      const lit = green || i < redOn;
      const onCol = green ? 0x33d14a : 0xff3b30;
      g.fillStyle(0x0a0a0e, 1); g.fillCircle(x, cy, r + 2);
      if (lit) {
        g.fillStyle(onCol, 0.28); g.fillCircle(x, cy, r + 9);
        g.fillStyle(onCol, 1); g.fillCircle(x, cy, r);
        g.fillStyle(0xffffff, 0.65); g.fillCircle(x - 5, cy - 5, r * 0.34);
      } else {
        g.fillStyle(green ? 0x123a18 : 0x3a1414, 1); g.fillCircle(x, cy, r);
      }
    }
  }

  showFinalLap() {
    Audio.sfx('finallap');
    Audio.setMusicRate(1.2); // ramp the music for last-lap tension
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
