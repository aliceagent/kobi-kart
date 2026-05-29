import Phaser from 'phaser';
import { LAPS } from '../GrandPrix.js';
import { TUNE } from '../Kart.js';
import { addMuteButton } from '../ui.js';

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
    this.gfx = this.add.graphics().setDepth(10);

    this.banner = this.add.text(W / 2, 14, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5, 0).setDepth(11);

    this.countdownLabel = this.add.text(W / 2, this.scale.height / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '96px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12);

    const style = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
    this.p1Text = this.add.text(16, 12, '', style).setDepth(11);
    this.p2Text = this.add.text(W - 16, 12, '', style).setOrigin(1, 0).setDepth(11);

    addMuteButton(this);
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
    } else if (item === 'projectile') {
      g.fillStyle(0x1c1c22, 1); g.fillCircle(cx, cy, 11);
      g.fillStyle(0x33c75a, 1); g.fillCircle(cx, cy, 9);
      g.fillStyle(0x1f8f3f, 1);
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        g.fillCircle(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 2);
      }
      g.fillStyle(0xffffff, 0.85); g.fillCircle(cx - 3, cy - 3, 2);
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
    this.gfx.clear();
    const W = this.scale.width;

    const lead = race.humans[0] || race.order[0];
    const lap = Math.min((lead ? lead.lap : 0) + 1, LAPS);
    const themeName = race.theme ? race.theme.name.toUpperCase() : '';
    this.banner.setText(`RACE ${race.gp.raceIndex + 1}/4   ·   ${themeName}   ·   LAP ${lap}/${LAPS}`);
    this.countdownLabel.setText(race.countdownText || '');

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
  }
}
