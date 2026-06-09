import Phaser from 'phaser';
import Kart, { TUNE } from '../Kart.js';
import { makeKartTexture, makeGameTextures } from '../textures.js';
import { ROSTER } from '../GrandPrix.js';
import * as Audio from '../Audio.js';
import { addMuteButton } from '../ui.js';

// A practice oval (road band between two ellipses) centred on screen.
const OVAL = { cx: 480, cy: 415, outerRx: 410, outerRy: 195, innerRx: 250, innerRy: 75 };

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    makeGameTextures(this);
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));

    this.drawTrack();

    // Player kart — a touch slower than race pace so it's easy to learn on.
    const sx = OVAL.cx;
    const sy = OVAL.cy + (OVAL.outerRy + OVAL.innerRy) / 2;
    this.kart = new Kart(this, sx, sy, Math.PI, 'kart_red');
    this.kart.frozen = false;
    this.kart.speedScale = 0.62;

    this.setupKeys();

    // Item box (created lazily for the "grab an item" step).
    this.itemBox = null;
    this.flags = {};
    this.resetFlags();

    this.dyn = this.add.graphics().setDepth(8); // item box pulse

    // --- UI ---------------------------------------------------------------
    this.panel = this.add.graphics().setDepth(20);
    this.titleText = this.add.text(W / 2, 26, '', {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffe14d', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5, 0).setDepth(21);
    this.bodyText = this.add.text(W / 2, 64, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3, align: 'center', lineSpacing: 6,
      wordWrap: { width: W - 120 },
    }).setOrigin(0.5, 0).setDepth(21);
    this.iconGfx = this.add.graphics().setDepth(21); // item-type icons
    this.iconLabels = [];
    this.promptText = this.add.text(W / 2, H - 30, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(21);
    this.tweens.add({ targets: this.promptText, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
    this.progressText = this.add.text(16, H - 26, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setDepth(21);

    this.makeSkipButton(W - 70, 24);
    addMuteButton(this);

    Audio.resumeAudio();
    Audio.startMusic('Menu');
    this.events.once('shutdown', () => Audio.stopMusic());

    // Continue / exit keys.
    this.contKeys = this.input.keyboard.addKeys({
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
    });
    this.input.keyboard.on('keydown-ESC', () => this.exit());

    this.buildSteps();
    this.stepIndex = 0;
    this.stepDone = false;
    this.doneTimer = 0;
    this.enterStep(0);
  }

  // -------------------------------------------------------------- input ----
  setupKeys() {
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this.k = this.input.keyboard.addKeys({
      a: KC.A, d: KC.D, s: KC.S, w: KC.W,
      left: KC.LEFT, right: KC.RIGHT, down: KC.DOWN, up: KC.UP,
    });
    this.itemKeys = [KC.E, KC.SPACE, KC.BACK_SLASH, KC.FORWARD_SLASH].map((c) => this.input.keyboard.addKey(c));
    this.rightShiftFired = false;
    this.input.keyboard.on('keydown-SHIFT', (e) => { if (e.location === 2) this.rightShiftFired = true; });
  }

  readInput() {
    const k = this.k;
    let steer = 0;
    if (k.a.isDown || k.left.isDown) steer -= 1;
    if (k.d.isDown || k.right.isDown) steer += 1;
    let itemPressed = this.itemKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    if (this.rightShiftFired) { itemPressed = true; this.rightShiftFired = false; }
    return {
      steer,
      braking: k.s.isDown || k.down.isDown,
      boosting: k.w.isDown || k.up.isDown,
      itemPressed,
      left: k.a.isDown || k.left.isDown,
      right: k.d.isDown || k.right.isDown,
    };
  }

  // -------------------------------------------------------------- track ----
  isOnRoad(x, y) {
    const dxo = (x - OVAL.cx) / OVAL.outerRx;
    const dyo = (y - OVAL.cy) / OVAL.outerRy;
    const dxi = (x - OVAL.cx) / OVAL.innerRx;
    const dyi = (y - OVAL.cy) / OVAL.innerRy;
    return dxo * dxo + dyo * dyo <= 1 && dxi * dxi + dyi * dyi > 1;
  }

  drawTrack() {
    const W = this.scale.width;
    const H = this.scale.height;
    const { cx, cy, outerRx, outerRy, innerRx, innerRy } = OVAL;
    const g = this.add.graphics().setDepth(0);

    // Grass field — same palette as the Grassy world (terrain 0x7ec850).
    g.fillStyle(0x7ec850, 1);
    g.fillRect(0, 0, W, H);

    // Subtle grass mottle for texture (deco / decoAlt greens).
    let seed = 20259;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 130; i += 1) {
      g.fillStyle(rnd() < 0.5 ? 0x74c046 : 0x8ad65c, 0.5);
      g.fillEllipse(rnd() * W, rnd() * H, 26 + rnd() * 34, 13 + rnd() * 16);
    }

    // Soft grounding shadow beneath the track.
    g.fillStyle(0x000000, 0.10);
    g.fillEllipse(cx, cy + 12, outerRx * 2 + 30, outerRy * 2 + 30);

    // Asphalt loop with the infield cut back out to grass.
    g.fillStyle(0x4a4a55, 1);
    g.fillEllipse(cx, cy, outerRx * 2, outerRy * 2);
    g.fillStyle(0x55555f, 1); // faint asphalt sheen on the upper arc
    g.fillEllipse(cx, cy - 6, outerRx * 2 - 18, outerRy * 2 - 18);
    g.fillStyle(0x4a4a55, 1);
    g.fillEllipse(cx, cy + 4, outerRx * 2 - 6, outerRy * 2 - 6);
    g.fillStyle(0x7ec850, 1);
    g.fillEllipse(cx, cy, innerRx * 2, innerRy * 2);

    // Red/white kerbs hugging both road edges + crisp white edge lines.
    this.drawKerb(g, cx, cy, outerRx, outerRy, 10);
    this.drawKerb(g, cx, cy, innerRx, innerRy, 10);
    g.lineStyle(2.5, 0xffffff, 0.9);
    g.strokeEllipse(cx, cy, (outerRx - 8) * 2, (outerRy - 8) * 2);
    g.strokeEllipse(cx, cy, (innerRx + 8) * 2, (innerRy + 8) * 2);

    // Dashed yellow centre line.
    this.drawDashedEllipse(g, cx, cy, (outerRx + innerRx) / 2, (outerRy + innerRy) / 2, 4, 0xffe14d);

    // Checkered start / finish across the bottom straight (where the kart spawns).
    this.drawStartLine(g);

    // Roadside scenery — all kept clear of the road band.
    this.drawTyres(g, 30, cy);
    this.drawTyres(g, W - 30, cy);
    this.drawTree(g, 58, H - 66, 1.1);
    this.drawTree(g, W - 58, H - 70, 1.2);
    this.drawTree(g, 92, 224, 0.85);
    this.drawTree(g, W - 96, 218, 0.9);
    this.drawFlowers(g, cx, cy);
  }

  // A red/white kerb ring centred on an ellipse edge.
  drawKerb(g, cx, cy, rx, ry, thick) {
    const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const segs = Math.max(16, Math.round(perim / 20));
    let prev = null;
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const pt = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
      if (prev) {
        g.lineStyle(thick, i % 2 ? 0xe2403a : 0xffffff, 1);
        g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(pt.x, pt.y); g.strokePath();
      }
      prev = pt;
    }
  }

  // A dashed ellipse outline (lane marking).
  drawDashedEllipse(g, cx, cy, rx, ry, thick, color) {
    const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const segs = Math.max(16, Math.round(perim / 24));
    let prev = null;
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const pt = { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
      if (prev && i % 2 === 1) {
        g.lineStyle(thick, color, 0.9);
        g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(pt.x, pt.y); g.strokePath();
      }
      prev = pt;
    }
  }

  drawStartLine(g) {
    const { cx, cy, innerRy, outerRy } = OVAL;
    const top = cy + innerRy + 4;
    const bot = cy + outerRy - 4;
    const cell = 19;
    const cols = 2;
    const cw = 38 / cols;
    const x0 = cx - 19;
    for (let r = 0, yy = top; yy < bot; yy += cell, r += 1) {
      for (let c = 0; c < cols; c += 1) {
        g.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x111111, 1);
        g.fillRect(x0 + c * cw, yy, cw + 0.5, Math.min(cell, bot - yy) + 0.5);
      }
    }
  }

  drawTree(g, tx, ty, s) {
    g.fillStyle(0x000000, 0.12); g.fillEllipse(tx, ty + 26 * s, 46 * s, 13 * s);
    g.fillStyle(0x6b4423, 1); g.fillRect(tx - 5 * s, ty, 10 * s, 28 * s);
    g.fillStyle(0x2f7d36, 1);
    g.fillCircle(tx, ty - 2 * s, 26 * s); g.fillCircle(tx - 18 * s, ty + 8 * s, 18 * s); g.fillCircle(tx + 18 * s, ty + 8 * s, 18 * s);
    g.fillStyle(0x57b24d, 1); g.fillCircle(tx - 7 * s, ty - 10 * s, 12 * s);
  }

  drawTyres(g, x, y) {
    g.fillStyle(0x000000, 0.12); g.fillEllipse(x, y + 8, 26, 9);
    for (let i = 0; i < 3; i += 1) {
      const cyy = y - i * 11;
      g.fillStyle(0x1c1c22, 1); g.fillCircle(x, cyy, 9);
      g.fillStyle(0x33333c, 1); g.fillCircle(x, cyy, 4.5);
    }
  }

  drawFlowers(g, cx, cy) {
    const cols = [0xff5d8f, 0xffd23f, 0xffffff, 0x4d8bff, 0xff8a3c];
    let seed = 99;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 24; i += 1) {
      const a = rnd() * Math.PI * 2;
      const rr = 0.3 + rnd() * 0.7;
      const x = cx + Math.cos(a) * rr * 205;
      const y = cy + Math.sin(a) * rr * 54;
      g.fillStyle(0x3f8a32, 1); g.fillCircle(x, y + 2, 2);
      g.fillStyle(cols[i % cols.length], 1); g.fillCircle(x, y, 3.2);
      g.fillStyle(0xffe884, 0.95); g.fillCircle(x, y, 1.3);
    }
  }

  // -------------------------------------------------------------- steps ----
  resetFlags() {
    this.flags = { left: false, right: false, boost: false, reverse: false, offRoad: false, drift: false, item: false };
  }

  buildSteps() {
    this.steps = [
      {
        title: 'STEERING', type: 'do',
        body: 'Your kart drives forward on its own.\nPress  LEFT / RIGHT  (or  A / D)  to steer.\nSteer BOTH ways to follow the track!',
        check: () => this.flags.left && this.flags.right,
      },
      {
        title: 'GO FASTER', type: 'do',
        body: 'Hold  UP  (or  W)  to BOOST for extra speed.\nWatch the boost bar — it drains as you use it\nand refills when you let go.',
        onEnter: () => { this.kart.boostFuel = TUNE.boostMax; this.kart.boostDepleted = false; },
        check: () => this.flags.boost,
      },
      {
        title: 'REVERSE', type: 'do',
        body: 'Hold  DOWN  (or  S)  to brake.\nKeep holding it and you’ll back up in REVERSE.',
        check: () => this.flags.reverse,
      },
      {
        title: 'STAY ON THE TRACK', type: 'do',
        body: 'The road is fast — the grass is SLOW.\nSteer off onto the grass to feel it drag,\nthen get back on the road.',
        check: () => this.flags.offRoad,
      },
      {
        title: 'DRIFT BOOST', type: 'do',
        body: 'At speed, hold BRAKE (↓ / S) WHILE you TURN to\nDRIFT — you slide through the corner.\nHold the slide to charge the sparks (blue →\norange → purple), then let go for a MINI-BOOST!',
        check: () => this.flags.drift,
      },
      {
        title: 'GRAB AN ITEM', type: 'do',
        body: 'Power-ups live in the glowing  ?  boxes.\nDrive through the box to pick one up!',
        onEnter: () => { this.kart.heldItem = null; this.spawnItemBox(); },
        check: () => this.flags.item,
      },
      {
        title: 'THE ITEMS', type: 'info',
        body: '',
        items: [
          ['boost', 'Boost', 'a burst of speed'],
          ['tripleMushroom', 'Triple boost', 'three quick speed bursts'],
          ['greenShell', 'Green shell', 'fires straight, bounces off walls'],
          ['tripleShell', 'Triple shells', 'three orbit you — fire or block'],
          ['redShell', 'Red shell', 'homes onto the racer ahead'],
          ['blueShell', 'Blue shell', 'rare — last place, hunts 1st'],
          ['trap', 'Oil slick', 'drop it behind to spin out chasers'],
          ['shield', 'Shield', 'blocks the next hit'],
          ['star', 'Star', 'brief invincibility — plow through!'],
          ['lightning', 'Lightning', 'rare — zaps every other racer'],
        ],
      },
      {
        title: 'DANGERS', type: 'info',
        body: 'Shells and oil slicks SPIN YOU OUT — you lose\ncontrol for a moment and slow right down.\n\nBumping other karts knocks you off course,\nand the grass always slows you.\n\nHolding a SHIELD blocks the next hit — handy!',
      },
      {
        title: "THAT’S IT!", type: 'done',
        body: 'You’re ready to race.\nUse the item button:  E / Space  or\nRight-Shift, \\ or /.\n\nIn 1-player you can use EITHER control set.',
      },
    ];
  }

  enterStep(i) {
    const step = this.steps[i];
    this.stepIndex = i;
    this.stepDone = false;
    this.doneTimer = 0;
    this.resetFlags();
    this.clearIcons();
    if (this.itemBox && step.type !== 'do') this.removeItemBox();

    // Freeze the kart during reading-only (info/done) steps.
    this.kart.frozen = step.type !== 'do';

    this.titleText.setText(step.title);
    this.bodyText.setVisible(true).setText(step.body || '');

    if (step.onEnter) step.onEnter();
    if (step.items) this.showItemList(step);

    this.refreshPanel();
    this.refreshPrompt();
  }

  refreshPanel() {
    const W = this.scale.width;
    const step = this.steps[this.stepIndex];
    const tall = step.type !== 'do';
    const h = tall ? 360 : 150;
    this.panel.clear();
    this.panel.fillStyle(0x12121c, 0.82);
    this.panel.fillRoundedRect(40, 12, W - 80, h, 14);
    this.panel.lineStyle(3, 0xffffff, 0.5);
    this.panel.strokeRoundedRect(40, 12, W - 80, h, 14);
  }

  refreshPrompt() {
    const step = this.steps[this.stepIndex];
    this.progressText.setText(`Step ${this.stepIndex + 1} / ${this.steps.length}   ·   Esc to skip`);
    if (step.type === 'do') {
      this.promptText.setText('');
    } else if (step.type === 'done') {
      this.promptText.setText('Press SPACE to return to the menu');
    } else {
      this.promptText.setText('Press SPACE to continue');
    }
  }

  // ----------------------------------------------------------- item box ----
  spawnItemBox() {
    const x = OVAL.cx; // top-centre of the road
    const y = OVAL.cy - (OVAL.outerRy + OVAL.innerRy) / 2;
    this.itemBox = { x, y, sprite: this.add.image(x, y, 'itembox').setDepth(7) };
  }

  removeItemBox() {
    if (this.itemBox) { this.itemBox.sprite.destroy(); this.itemBox = null; }
  }

  // -------------------------------------------------------- item icons -----
  clearIcons() {
    if (this.iconGfx) this.iconGfx.clear();
    this.iconLabels.forEach((t) => t.destroy());
    this.iconLabels = [];
  }

  showItemList(step) {
    const many = step.items.length > 7;
    const startY = many ? 80 : 96;
    const rowH = many ? 36 : 42;
    const x = 84;
    const fontSize = many ? 14 : 16;
    step.items.forEach((it, i) => {
      const cy = startY + i * rowH;
      this.drawItemIcon(this.iconGfx, x, cy, it[0]);
      const label = this.add.text(x + 30, cy, `${it[1]} — ${it[2]}`, {
        fontFamily: 'monospace', fontSize: `${fontSize}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5).setDepth(21);
      this.iconLabels.push(label);
    });
  }

  drawItemIcon(g, cx, cy, kind) {
    if (kind === 'boost') {
      g.fillStyle(0xffd23f, 1);
      g.fillTriangle(cx - 11, cy - 9, cx - 11, cy + 9, cx - 1, cy);
      g.fillTriangle(cx - 1, cy - 9, cx - 1, cy + 9, cx + 9, cy);
    } else if (kind === 'trap') {
      g.fillStyle(0x15151c, 0.95); g.fillEllipse(cx, cy + 2, 30, 17);
      g.fillStyle(0x6f6ab0, 0.85); g.fillEllipse(cx - 4, cy - 2, 10, 6);
    } else if (kind === 'shield') {
      g.fillStyle(0x9fe8ff, 0.3); g.fillCircle(cx, cy, 12);
      g.lineStyle(3, 0x9fe8ff, 1); g.strokeCircle(cx, cy, 12);
    } else if (kind === 'tripleMushroom') {
      g.fillStyle(0xefe6cf, 1); g.fillRect(cx - 3, cy, 6, 10);
      g.fillStyle(0xff5a4d, 1); g.fillEllipse(cx, cy, 24, 17);
      g.fillStyle(0xffffff, 0.85); g.fillCircle(cx - 5, cy - 2, 2.6); g.fillCircle(cx + 4, cy - 1, 2.2);
    } else if (kind === 'star') {
      const pts = [];
      for (let k = 0; k < 10; k += 1) { const rr = k % 2 === 0 ? 13 : 5.5; const a = -Math.PI / 2 + (k * Math.PI) / 5; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr }); }
      g.fillStyle(0xffe14d, 1); g.fillPoints(pts, true);
      g.fillStyle(0xfff7c0, 0.85); g.fillCircle(cx, cy, 3.5);
    } else if (kind === 'lightning') {
      g.fillStyle(0xffe14d, 1);
      g.fillPoints([
        { x: cx + 3, y: cy - 12 }, { x: cx - 8, y: cy + 2 }, { x: cx - 1, y: cy + 2 },
        { x: cx - 3, y: cy + 12 }, { x: cx + 8, y: cy - 2 }, { x: cx + 1, y: cy - 2 },
      ], true);
    } else {
      // shells (green / red / blue / triple)
      let base = 0x3ecf5a; let rim = 0x1f8f3f; let dark = 0x14662b;
      if (kind === 'redShell') { base = 0xff5a5a; rim = 0xc0392b; dark = 0x8e1f1f; }
      else if (kind === 'blueShell') { base = 0x4d8bff; rim = 0x1e46b0; dark = 0x122e6e; }
      g.fillStyle(0x16161c, 1); g.fillCircle(cx, cy, 13);
      g.fillStyle(rim, 1); g.fillCircle(cx, cy, 11.5);
      g.fillStyle(base, 1); g.fillCircle(cx, cy, 9);
      const hex = [];
      for (let k = 0; k < 6; k += 1) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; hex.push({ x: cx + Math.cos(a) * 4.5, y: cy + Math.sin(a) * 4.5 }); }
      g.fillStyle(dark, 1); g.fillPoints(hex, true);
      g.fillStyle(0xffffff, 0.5); g.fillCircle(cx - 4, cy - 4, 2.5);
    }
  }

  // --------------------------------------------------------- skip / exit ---
  makeSkipButton(x, y) {
    const w = 110;
    const h = 30;
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.lineStyle(2, 0xffffff, 0.7); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    this.add.text(x, y, 'SKIP ▶', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(41);
    this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.exit());
  }

  exit() {
    this.scene.start('TitleScene');
  }

  advance() {
    if (this.stepIndex >= this.steps.length - 1) { this.exit(); return; }
    Audio.sfx('lap');
    this.enterStep(this.stepIndex + 1);
  }

  // -------------------------------------------------------------- update ---
  update(time, deltaMs) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const step = this.steps[this.stepIndex];

    // Reading-only steps: kart sits still; advance on the continue key. (We
    // must NOT read item keys here — Space is an item key, and reading it would
    // swallow the "just pressed" state before the continue check sees it.)
    if (step.type !== 'do') {
      this.kart.drive(dt, 0, false, false, true);
      if (Phaser.Input.Keyboard.JustDown(this.contKeys.space)
        || Phaser.Input.Keyboard.JustDown(this.contKeys.enter)) {
        this.advance();
      }
      return;
    }

    const inp = this.readInput();
    const onRoad = this.isOnRoad(this.kart.x, this.kart.y);
    this.kart.drive(dt, inp.steer, inp.braking, inp.boosting, onRoad);
    this.kart.x = Phaser.Math.Clamp(this.kart.x, 24, this.scale.width - 24);
    this.kart.y = Phaser.Math.Clamp(this.kart.y, 170, this.scale.height - 24);

    // Track demonstrated skills.
    if (inp.left) this.flags.left = true;
    if (inp.right) this.flags.right = true;
    if (inp.boosting && this.kart.boostFuel < TUNE.boostMax - 8) this.flags.boost = true;
    if (this.kart.speed < -20) this.flags.reverse = true;
    if (!onRoad) this.flags.offRoad = true;
    if (this.kart.driftSparkTier > 0 || this.kart.miniTurbo > 0) { this.flags.drift = true; this.kart.miniTurbo = 0; }

    // Item box pickup.
    if (this.itemBox) {
      this.itemBox.sprite.rotation += dt * 1.5;
      this.itemBox.sprite.setScale(1 + Math.sin(time / 180) * 0.08);
      if (Math.hypot(this.kart.x - this.itemBox.x, this.kart.y - this.itemBox.y) < this.kart.radius + 18) {
        this.kart.heldItem = 'boost';
        this.flags.item = true;
        Audio.sfx('pickup');
        this.removeItemBox();
      }
    }

    // Auto-advance once the skill is demonstrated (brief "Nice!" beat first).
    if (!this.stepDone && step.check()) {
      this.stepDone = true;
      this.doneTimer = 1.0;
      Audio.sfx('pickup');
      this.titleText.setText(`${step.title}   ✓`);
      this.promptText.setText('Nice!');
    }
    if (this.stepDone) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this.advance();
    }
  }
}
