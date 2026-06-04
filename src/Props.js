// Themed off-road props. Each prop draws itself into a Phaser.Graphics and
// declares whether it's solid (becomes a collision obstacle) plus its size
// range and spawn weight. Flat props (flowers, starfish, sprinkles, snow) are
// pure decoration. `rFactor` is the collision radius as a fraction of `size`.

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function starPoints(cx, cy, outer, inner, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function shadow(g, x, y, w, h) {
  g.fillStyle(0x000000, 0.1);
  g.fillEllipse(x, y, w, h);
}

// ---------------------------------------------------------------- Grassy ----
const tree = {
  solid: true, rFactor: 0.62, min: 42, max: 60, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.72, s * 1.2, s * 0.4);
    g.fillStyle(0x7a4a22, 1);
    g.fillRect(x - s * 0.13, y + s * 0.1, s * 0.26, s * 0.72);
    g.fillStyle(0x2f7d36, 1);
    g.fillCircle(x - s * 0.45, y, s * 0.5);
    g.fillCircle(x + s * 0.45, y, s * 0.5);
    g.fillCircle(x, y - s * 0.35, s * 0.62);
    g.fillCircle(x, y + s * 0.05, s * 0.55);
    g.fillStyle(0x57b24d, 1);
    g.fillCircle(x - s * 0.18, y - s * 0.3, s * 0.3);
  },
};

const bush = {
  solid: true, rFactor: 0.58, min: 26, max: 38, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 1.4, s * 0.4);
    g.fillStyle(0x3f8f3a, 1);
    g.fillCircle(x - s * 0.5, y + s * 0.1, s * 0.5);
    g.fillCircle(x + s * 0.5, y + s * 0.1, s * 0.5);
    g.fillCircle(x, y - s * 0.1, s * 0.6);
    g.fillStyle(0x5fb353, 1);
    g.fillCircle(x - s * 0.15, y - s * 0.15, s * 0.3);
  },
};

const rock = {
  solid: true, rFactor: 0.6, min: 26, max: 40, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.3, s * 0.35);
    const pts = [
      { x: x - s * 0.7, y: y + s * 0.3 }, { x: x - s * 0.5, y: y - s * 0.35 },
      { x: x - s * 0.05, y: y - s * 0.55 }, { x: x + s * 0.5, y: y - s * 0.3 },
      { x: x + s * 0.7, y: y + s * 0.25 }, { x: x + s * 0.2, y: y + s * 0.45 },
    ];
    g.fillStyle(0x8b8f96, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0xa9adb3, 1);
    g.fillPoints([
      { x: x - s * 0.5, y: y - 0.34 * s }, { x: x - 0.05 * s, y: y - 0.55 * s },
      { x: x + 0.1 * s, y: y - 0.2 * s }, { x: x - 0.3 * s, y: y - 0.1 * s },
    ], true);
  },
};

const sheep = {
  solid: true, rFactor: 0.5, min: 30, max: 40, weight: 1,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.55, s * 1.3, s * 0.4);
    g.fillStyle(0x444444, 1);
    g.fillRect(x - s * 0.32, y + s * 0.28, s * 0.12, s * 0.35);
    g.fillRect(x + s * 0.2, y + s * 0.28, s * 0.12, s * 0.35);
    g.fillStyle(0xf2f2ee, 1);
    g.fillCircle(x - s * 0.35, y, s * 0.42);
    g.fillCircle(x + s * 0.35, y, s * 0.42);
    g.fillCircle(x, y - s * 0.15, s * 0.5);
    g.fillCircle(x, y + s * 0.1, s * 0.45);
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(x + s * 0.55, y - s * 0.05, s * 0.26);
    g.fillCircle(x + s * 0.72, y - s * 0.2, s * 0.1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + s * 0.6, y - s * 0.1, s * 0.06);
  },
};

const flowers = {
  solid: false, min: 30, max: 46, weight: 6,
  draw(g, x, y, s) {
    const colors = [0xff5d8f, 0xffd23f, 0xffffff, 0xb06bff];
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i += 1) {
      const fx = x + (Math.random() - 0.5) * s * 1.6;
      const fy = y + (Math.random() - 0.5) * s * 1.6;
      const c = randPick(colors);
      const r = s * 0.12;
      g.fillStyle(0x4e9a3a, 1);
      g.fillCircle(fx, fy + r, r * 0.5);
      g.fillStyle(c, 1);
      for (let k = 0; k < 5; k += 1) {
        const a = (k * Math.PI * 2) / 5;
        g.fillCircle(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.6);
      }
      g.fillStyle(0xffe08a, 1);
      g.fillCircle(fx, fy, r * 0.5);
    }
  },
};

// ----------------------------------------------------------------- Beach ----
const palm = {
  solid: true, rFactor: 0.4, min: 44, max: 60, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 1.0, s * 0.32);
    g.fillStyle(0xb07a43, 1);
    g.fillRect(x - s * 0.09, y - s * 0.2, s * 0.18, s * 0.92);
    const tx = x;
    const ty = y - s * 0.25;
    g.fillStyle(0x2fa86a, 1);
    const fr = s * 0.78;
    for (let k = 0; k < 6; k += 1) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.52;
      const w = s * 0.13;
      g.fillTriangle(
        tx, ty,
        tx + Math.cos(a) * fr - Math.sin(a) * w, ty + Math.sin(a) * fr + Math.cos(a) * w,
        tx + Math.cos(a) * fr + Math.sin(a) * w, ty + Math.sin(a) * fr - Math.cos(a) * w
      );
    }
    g.fillStyle(0x6b4423, 1);
    g.fillCircle(tx - s * 0.1, ty + s * 0.06, s * 0.1);
    g.fillCircle(tx + s * 0.12, ty + s * 0.09, s * 0.09);
  },
};

const umbrella = {
  solid: true, rFactor: 0.45, min: 40, max: 52, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.8, s * 0.28);
    g.fillStyle(0x8a8d92, 1);
    g.fillRect(x - s * 0.04, y - s * 0.1, s * 0.08, s * 0.72);
    const r = s * 0.7;
    const cy = y - s * 0.1;
    const seg = 8;
    for (let k = 0; k < seg; k += 1) {
      const a0 = Math.PI + (k / seg) * Math.PI;
      const a1 = Math.PI + ((k + 1) / seg) * Math.PI;
      g.fillStyle(k % 2 ? 0xffffff : 0xe23b3b, 1);
      g.fillTriangle(x, cy, x + Math.cos(a0) * r, cy + Math.sin(a0) * r, x + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    }
  },
};

const crab = {
  solid: true, rFactor: 0.5, min: 26, max: 36, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.0, s * 0.3);
    g.lineStyle(s * 0.08, 0xc0392b, 1);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const ly = y - s * 0.1 + k * s * 0.18;
        g.beginPath();
        g.moveTo(x + side * s * 0.3, ly);
        g.lineTo(x + side * s * 0.7, ly + s * 0.1);
        g.strokePath();
      }
    }
    g.fillStyle(0xe2503b, 1);
    g.fillEllipse(x, y, s * 0.9, s * 0.6);
    g.fillCircle(x - s * 0.55, y - s * 0.2, s * 0.2);
    g.fillCircle(x + s * 0.55, y - s * 0.2, s * 0.2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x - s * 0.15, y - s * 0.25, s * 0.1);
    g.fillCircle(x + s * 0.15, y - s * 0.25, s * 0.1);
    g.fillStyle(0x000000, 1);
    g.fillCircle(x - s * 0.15, y - s * 0.25, s * 0.05);
    g.fillCircle(x + s * 0.15, y - s * 0.25, s * 0.05);
  },
};

const starfish = {
  solid: false, min: 26, max: 38, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xf2a23c, 1);
    g.fillPoints(starPoints(x, y, s * 0.5, s * 0.22, 5, Math.random() * Math.PI), true);
    g.fillStyle(0xffc56e, 1);
    for (let k = 0; k < 5; k += 1) {
      const a = Math.random() * Math.PI * 2;
      g.fillCircle(x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.18, s * 0.05);
    }
  },
};

const shell = {
  solid: false, min: 22, max: 32, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xf6d6c2, 1);
    g.fillTriangle(x, y + s * 0.4, x - s * 0.45, y - s * 0.35, x + s * 0.45, y - s * 0.35);
    g.fillCircle(x, y + s * 0.35, s * 0.12);
    g.lineStyle(s * 0.04, 0xd9a98f, 1);
    for (let k = -2; k <= 2; k += 1) {
      g.beginPath();
      g.moveTo(x, y + s * 0.35);
      g.lineTo(x + k * s * 0.16, y - s * 0.32);
      g.strokePath();
    }
  },
};

// ------------------------------------------------------------------- Ice ----
const snowman = {
  solid: true, rFactor: 0.5, min: 34, max: 46, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 1.1, s * 0.3);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y + s * 0.4, s * 0.5);
    g.fillCircle(x, y - s * 0.05, s * 0.38);
    g.fillCircle(x, y - s * 0.5, s * 0.28);
    g.fillStyle(0xd8e6f2, 1);
    g.fillCircle(x + s * 0.18, y + s * 0.42, s * 0.16);
    g.fillStyle(0x2a2a2a, 1);
    g.fillCircle(x - s * 0.1, y - s * 0.55, s * 0.05);
    g.fillCircle(x + s * 0.1, y - s * 0.55, s * 0.05);
    g.fillCircle(x, y - s * 0.05, s * 0.05);
    g.fillCircle(x, y + s * 0.15, s * 0.05);
    g.fillStyle(0xf08a2c, 1);
    g.fillTriangle(x, y - s * 0.45, x + s * 0.28, y - s * 0.42, x, y - s * 0.36);
  },
};

const pine = {
  solid: true, rFactor: 0.48, min: 36, max: 50, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.62, s * 0.9, s * 0.28);
    g.fillStyle(0x6b4423, 1);
    g.fillRect(x - s * 0.08, y + s * 0.35, s * 0.16, s * 0.3);
    g.fillStyle(0x2c6e49, 1);
    g.fillTriangle(x, y - s * 0.6, x - s * 0.5, y, x + s * 0.5, y);
    g.fillTriangle(x, y - s * 0.3, x - s * 0.6, y + s * 0.4, x + s * 0.6, y + s * 0.4);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(x, y - s * 0.6, x - s * 0.18, y - s * 0.32, x + s * 0.18, y - s * 0.32);
    g.fillTriangle(x, y - s * 0.3, x - s * 0.22, y + s * 0.02, x + s * 0.22, y + s * 0.02);
  },
};

const iceCrystal = {
  solid: true, rFactor: 0.45, min: 28, max: 40, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.45, s * 1.0, s * 0.25);
    const pts = [
      { x: x - s * 0.45, y: y + s * 0.35 }, { x: x - s * 0.3, y: y - s * 0.45 },
      { x: x + s * 0.35, y: y - s * 0.4 }, { x: x + s * 0.48, y: y + s * 0.3 },
    ];
    g.fillStyle(0x9fd6f5, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0xd6f0ff, 0.9);
    g.fillPoints([
      { x: x - s * 0.3, y: y - 0.45 * s }, { x: x + 0.1 * s, y: y - 0.42 * s },
      { x: x - 0.05 * s, y: y }, { x: x - 0.4 * s, y: y },
    ], true);
    g.lineStyle(s * 0.03, 0xffffff, 0.7);
    g.strokePoints(pts, true);
  },
};

const penguin = {
  solid: true, rFactor: 0.4, min: 28, max: 38, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 0.9, s * 0.28);
    g.fillStyle(0x2b2f36, 1);
    g.fillEllipse(x, y, s * 0.7, s * 0.95);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(x, y + s * 0.08, s * 0.42, s * 0.7);
    g.fillCircle(x - s * 0.12, y - s * 0.28, s * 0.09);
    g.fillCircle(x + s * 0.12, y - s * 0.28, s * 0.09);
    g.fillStyle(0x000000, 1);
    g.fillCircle(x - s * 0.12, y - s * 0.27, s * 0.045);
    g.fillCircle(x + s * 0.12, y - s * 0.27, s * 0.045);
    g.fillStyle(0xf0a02c, 1);
    g.fillTriangle(x - s * 0.08, y - s * 0.15, x + s * 0.08, y - s * 0.15, x, y - s * 0.03);
    g.fillCircle(x - s * 0.18, y + s * 0.46, s * 0.1);
    g.fillCircle(x + s * 0.18, y + s * 0.46, s * 0.1);
  },
};

const snowPatch = {
  solid: false, min: 30, max: 44, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(x, y, s * 0.45);
    g.fillCircle(x - s * 0.4, y + s * 0.1, s * 0.3);
    g.fillCircle(x + s * 0.4, y + s * 0.05, s * 0.3);
    g.fillStyle(0xbfe0ff, 1);
    for (let k = 0; k < 4; k += 1) {
      const a = Math.random() * 6.28;
      const r = Math.random() * s * 0.4;
      g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, s * 0.04);
    }
  },
};

// ----------------------------------------------------------------- Candy ----
const lollipop = {
  solid: true, rFactor: 0.45, min: 30, max: 42, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.55, s * 0.7, s * 0.2);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x - s * 0.05, y, s * 0.1, s * 0.6);
    const cy = y - s * 0.15;
    g.fillStyle(0xff4f9a, 1); g.fillCircle(x, cy, s * 0.45);
    g.fillStyle(0xffffff, 1); g.fillCircle(x, cy, s * 0.33);
    g.fillStyle(0xff4f9a, 1); g.fillCircle(x, cy, s * 0.22);
    g.fillStyle(0xffffff, 1); g.fillCircle(x, cy, s * 0.1);
  },
};

const peppermint = {
  solid: true, rFactor: 0.45, min: 28, max: 40, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 0.7, s * 0.2);
    const r = s * 0.45;
    const seg = 8;
    for (let k = 0; k < seg; k += 1) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      g.fillStyle(k % 2 ? 0xffffff : 0xe23b3b, 1);
      g.fillTriangle(x, y, x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x, y, s * 0.12);
  },
};

const gumdrop = {
  solid: true, rFactor: 0.42, min: 22, max: 32, weight: 3,
  draw(g, x, y, s) {
    const colors = [0x49c2e8, 0xff6f61, 0x8bd450, 0xffd23f, 0xb06bff];
    const c = randPick(colors);
    shadow(g, x, y + s * 0.4, s * 0.7, s * 0.2);
    g.fillStyle(c, 1);
    g.fillCircle(x, y, s * 0.4);
    g.fillRect(x - s * 0.4, y, s * 0.8, s * 0.32);
    g.fillStyle(0xffffff, 0.7);
    for (let k = 0; k < 6; k += 1) {
      const a = Math.random() * 6.28;
      const r = Math.random() * s * 0.32;
      g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r - s * 0.05, s * 0.03);
    }
  },
};

const iceCream = {
  solid: true, rFactor: 0.38, min: 30, max: 42, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.6, s * 0.18);
    g.fillStyle(0xd9a05b, 1);
    g.fillTriangle(x - s * 0.28, y - s * 0.05, x + s * 0.28, y - s * 0.05, x, y + s * 0.6);
    const colors = [0xff8fc1, 0xfff2b0, 0x8bd0c0];
    g.fillStyle(randPick(colors), 1); g.fillCircle(x - s * 0.12, y - s * 0.18, s * 0.22);
    g.fillStyle(randPick(colors), 1); g.fillCircle(x + s * 0.12, y - s * 0.18, s * 0.22);
    g.fillStyle(randPick(colors), 1); g.fillCircle(x, y - s * 0.38, s * 0.22);
    g.fillStyle(0xe23b3b, 1); g.fillCircle(x, y - s * 0.55, s * 0.08);
  },
};

const sprinkles = {
  solid: false, min: 34, max: 48, weight: 4,
  draw(g, x, y, s) {
    const colors = [0xff4f9a, 0x49c2e8, 0x8bd450, 0xffd23f, 0xffffff, 0xb06bff];
    const n = 8 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n; k += 1) {
      const sx = x + (Math.random() - 0.5) * s * 1.6;
      const sy = y + (Math.random() - 0.5) * s * 1.6;
      const a = Math.random() * Math.PI;
      g.lineStyle(s * 0.06, randPick(colors), 1);
      g.beginPath();
      g.moveTo(sx - Math.cos(a) * s * 0.12, sy - Math.sin(a) * s * 0.12);
      g.lineTo(sx + Math.cos(a) * s * 0.12, sy + Math.sin(a) * s * 0.12);
      g.strokePath();
    }
  },
};

// --------------------------------------------------------------- Volcano ----
const volcanoRock = {
  solid: true, rFactor: 0.6, min: 30, max: 46, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.3, s * 0.35);
    const pts = [
      { x: x - s * 0.7, y: y + s * 0.3 }, { x: x - s * 0.5, y: y - s * 0.35 },
      { x: x - s * 0.05, y: y - s * 0.55 }, { x: x + s * 0.5, y: y - s * 0.3 },
      { x: x + s * 0.7, y: y + s * 0.25 }, { x: x + s * 0.2, y: y + s * 0.45 },
    ];
    g.fillStyle(0x2a2622, 1); g.fillPoints(pts, true);
    g.fillStyle(0x3d3733, 1);
    g.fillPoints([
      { x: x - s * 0.5, y: y - 0.34 * s }, { x: x - 0.05 * s, y: y - 0.55 * s },
      { x: x + 0.1 * s, y: y - 0.2 * s }, { x: x - 0.3 * s, y: y - 0.1 * s },
    ], true);
    g.lineStyle(s * 0.05, 0xff5a1a, 0.9);
    g.beginPath(); g.moveTo(x - s * 0.3, y + s * 0.2); g.lineTo(x, y - s * 0.1); g.lineTo(x + s * 0.25, y + s * 0.25); g.strokePath();
  },
};

const lavaPool = {
  solid: false, min: 34, max: 50, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0x6a1c08, 1); g.fillEllipse(x, y, s * 1.2, s * 0.8);
    g.fillStyle(0xff4d12, 0.95); g.fillEllipse(x, y, s * 0.85, s * 0.5);
    g.fillStyle(0xffd23f, 0.9); g.fillEllipse(x - s * 0.1, y - s * 0.05, s * 0.4, s * 0.22);
  },
};

const charredTree = {
  solid: true, rFactor: 0.4, min: 40, max: 56, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 0.9, s * 0.3);
    g.fillStyle(0x1a1714, 1);
    g.fillRect(x - s * 0.1, y - s * 0.1, s * 0.2, s * 0.8);
    g.lineStyle(s * 0.08, 0x1a1714, 1);
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(x, y - s * 0.05); g.lineTo(x + side * s * 0.35, y - s * 0.4); g.strokePath();
      g.beginPath(); g.moveTo(x, y - s * 0.25); g.lineTo(x + side * s * 0.28, y - s * 0.55); g.strokePath();
    }
    g.fillStyle(0xff6a1a, 0.5); g.fillCircle(x, y - s * 0.1, s * 0.12);
  },
};

const emberVent = {
  solid: true, rFactor: 0.5, min: 28, max: 40, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.0, s * 0.3);
    g.fillStyle(0x231f1c, 1);
    g.fillTriangle(x - s * 0.6, y + s * 0.4, x + s * 0.6, y + s * 0.4, x, y - s * 0.4);
    g.fillStyle(0x3a3330, 1);
    g.fillTriangle(x - s * 0.25, y + s * 0.4, x + s * 0.25, y + s * 0.4, x, y - s * 0.1);
    g.fillStyle(0xff5a1a, 0.95); g.fillCircle(x, y - s * 0.2, s * 0.16);
    g.fillStyle(0xffd23f, 0.9); g.fillCircle(x, y - s * 0.24, s * 0.08);
  },
};

const cinders = {
  solid: false, min: 26, max: 40, weight: 5,
  draw(g, x, y, s) {
    const colors = [0xff6a1a, 0xffd23f, 0x7a3010];
    const n = 6 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k += 1) {
      const cx = x + (Math.random() - 0.5) * s * 1.6;
      const cy = y + (Math.random() - 0.5) * s * 1.6;
      g.fillStyle(randPick(colors), 0.8);
      g.fillCircle(cx, cy, s * 0.05 + Math.random() * s * 0.05);
    }
  },
};

// ----------------------------------------------------------------- Storm ----
const stormRock = {
  solid: true, rFactor: 0.6, min: 28, max: 42, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.2, s * 0.32);
    const pts = [
      { x: x - s * 0.65, y: y + s * 0.3 }, { x: x - s * 0.45, y: y - s * 0.3 },
      { x: x, y: y - s * 0.5 }, { x: x + s * 0.5, y: y - s * 0.25 }, { x: x + s * 0.6, y: y + s * 0.3 },
    ];
    g.fillStyle(0x4a4f57, 1); g.fillPoints(pts, true);
    g.fillStyle(0x5e636b, 1);
    g.fillPoints([{ x: x - s * 0.4, y: y - 0.28 * s }, { x: x, y: y - 0.5 * s }, { x: x + 0.05 * s, y: y - 0.15 * s }], true);
  },
};

const deadPine = {
  solid: true, rFactor: 0.4, min: 40, max: 54, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.62, s * 0.8, s * 0.26);
    g.fillStyle(0x3a3026, 1); g.fillRect(x - s * 0.07, y - s * 0.5, s * 0.14, s * 1.1);
    g.lineStyle(s * 0.06, 0x4a3f31, 1);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k += 1) {
        const ly = y - s * 0.4 + k * s * 0.3;
        g.beginPath(); g.moveTo(x, ly); g.lineTo(x + side * s * 0.4, ly - s * 0.18); g.strokePath();
      }
    }
  },
};

const puddle = {
  solid: false, min: 40, max: 58, weight: 5,
  draw(g, x, y, s) {
    g.fillStyle(0x2a3540, 0.8); g.fillEllipse(x, y, s * 1.3, s * 0.7);
    g.fillStyle(0x5a7488, 0.6); g.fillEllipse(x - s * 0.1, y - s * 0.05, s * 0.7, s * 0.32);
    g.fillStyle(0xaecadb, 0.4); g.fillEllipse(x - s * 0.2, y - s * 0.1, s * 0.3, s * 0.1);
  },
};

const reeds = {
  solid: false, min: 30, max: 44, weight: 4,
  draw(g, x, y, s) {
    const n = 5 + Math.floor(Math.random() * 4);
    g.lineStyle(s * 0.05, 0x4a5b3a, 1);
    for (let k = 0; k < n; k += 1) {
      const rx = x + (Math.random() - 0.5) * s * 1.2;
      const lean = (Math.random() - 0.5) * s * 0.3;
      g.beginPath(); g.moveTo(rx, y + s * 0.4); g.lineTo(rx + lean, y - s * 0.5); g.strokePath();
    }
  },
};

const signPost = {
  solid: true, rFactor: 0.32, min: 30, max: 42, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.5, s * 0.16);
    g.fillStyle(0x3a3026, 1); g.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.9);
    g.fillStyle(0x8a6a3a, 1); g.fillRect(x - s * 0.35, y - s * 0.5, s * 0.7, s * 0.3);
    g.lineStyle(s * 0.04, 0x5a4528, 1); g.strokeRect(x - s * 0.35, y - s * 0.5, s * 0.7, s * 0.3);
  },
};

// ---------------------------------------------------------------- Jungle ----
const jungleTree = {
  solid: true, rFactor: 0.55, min: 46, max: 64, weight: 4,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.74, s * 1.3, s * 0.4);
    g.fillStyle(0x6b4a26, 1); g.fillRect(x - s * 0.12, y + s * 0.05, s * 0.24, s * 0.75);
    g.fillStyle(0x1f5a23, 1);
    g.fillCircle(x - s * 0.5, y - s * 0.05, s * 0.5);
    g.fillCircle(x + s * 0.5, y - s * 0.05, s * 0.5);
    g.fillCircle(x, y - s * 0.45, s * 0.62);
    g.fillCircle(x, y, s * 0.55);
    g.fillStyle(0x2f8a33, 1);
    g.fillCircle(x - s * 0.2, y - s * 0.4, s * 0.32);
    g.fillCircle(x + s * 0.25, y - s * 0.1, s * 0.26);
  },
};

const fern = {
  solid: false, min: 34, max: 50, weight: 6,
  draw(g, x, y, s) {
    g.lineStyle(s * 0.05, 0x2f7d32, 1);
    const n = 7;
    for (let k = 0; k < n; k += 1) {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.32;
      g.beginPath(); g.moveTo(x, y + s * 0.4);
      g.lineTo(x + Math.cos(a) * s * 0.7, y + s * 0.4 + Math.sin(a) * s * 0.7); g.strokePath();
    }
  },
};

const ruinPillar = {
  solid: true, rFactor: 0.5, min: 34, max: 50, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.9, s * 0.3);
    g.fillStyle(0x8d8472, 1); g.fillRect(x - s * 0.3, y - s * 0.5, s * 0.6, s * 1.1);
    g.fillStyle(0x9e9683, 1); g.fillRect(x - s * 0.3, y - s * 0.5, s * 0.2, s * 1.1);
    g.fillStyle(0x6f6757, 1); g.fillRect(x - s * 0.38, y - s * 0.6, s * 0.76, s * 0.14);
    g.lineStyle(s * 0.05, 0x3f8f3a, 1);
    g.beginPath(); g.moveTo(x + s * 0.2, y - s * 0.5); g.lineTo(x + s * 0.05, y); g.lineTo(x + s * 0.2, y + s * 0.4); g.strokePath();
  },
};

const idol = {
  solid: true, rFactor: 0.5, min: 34, max: 48, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.9, s * 0.3);
    g.fillStyle(0x6f7768, 1); g.fillRect(x - s * 0.35, y - s * 0.45, s * 0.7, s * 1.0);
    g.fillStyle(0x596051, 1);
    g.fillTriangle(x - s * 0.35, y - s * 0.45, x + s * 0.35, y - s * 0.45, x, y - s * 0.7);
    g.fillStyle(0xffd23f, 0.9); g.fillCircle(x - s * 0.13, y - s * 0.2, s * 0.08); g.fillCircle(x + s * 0.13, y - s * 0.2, s * 0.08);
    g.fillStyle(0x2a2e26, 1); g.fillRect(x - s * 0.2, y + s * 0.05, s * 0.4, s * 0.08);
  },
};

const vineRock = {
  solid: true, rFactor: 0.58, min: 30, max: 44, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.2, s * 0.32);
    const pts = [
      { x: x - s * 0.65, y: y + s * 0.3 }, { x: x - s * 0.4, y: y - s * 0.3 },
      { x: x + s * 0.1, y: y - s * 0.45 }, { x: x + s * 0.55, y: y - s * 0.2 }, { x: x + s * 0.6, y: y + s * 0.3 },
    ];
    g.fillStyle(0x6b6f63, 1); g.fillPoints(pts, true);
    g.fillStyle(0x3f8f3a, 1);
    g.fillEllipse(x - s * 0.2, y + s * 0.2, s * 0.5, s * 0.25);
    g.fillEllipse(x + s * 0.25, y + s * 0.1, s * 0.4, s * 0.2);
  },
};

const mushrooms = {
  solid: false, min: 26, max: 38, weight: 5,
  draw(g, x, y, s) {
    const colors = [0xff5a4d, 0xffa83c, 0xc06bff];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k += 1) {
      const mx = x + (Math.random() - 0.5) * s * 1.3;
      const my = y + (Math.random() - 0.5) * s * 1.0;
      g.fillStyle(0xefe6cf, 1); g.fillRect(mx - s * 0.04, my, s * 0.08, s * 0.2);
      g.fillStyle(randPick(colors), 1); g.fillEllipse(mx, my, s * 0.28, s * 0.18);
      g.fillStyle(0xffffff, 0.8); g.fillCircle(mx - s * 0.05, my - s * 0.02, s * 0.03);
    }
  },
};

// ------------------------------------------------------------------ Neon ----
const neonPylon = {
  solid: true, rFactor: 0.4, min: 40, max: 56, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 0.7, s * 0.24);
    g.fillStyle(0x15131f, 1); g.fillRect(x - s * 0.08, y - s * 0.6, s * 0.16, s * 1.3);
    g.fillStyle(0x00e5ff, 0.95); g.fillRect(x - s * 0.06, y - s * 0.55, s * 0.12, s * 1.15);
    g.fillStyle(0xff3df0, 0.9); g.fillCircle(x, y - s * 0.6, s * 0.12);
  },
};

const neonSign = {
  solid: true, rFactor: 0.5, min: 34, max: 50, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.6, s * 0.8, s * 0.24);
    g.fillStyle(0x1a1730, 1); g.fillRect(x - s * 0.05, y - s * 0.2, s * 0.1, s * 0.8);
    const col = randPick([0x00e5ff, 0xff3df0, 0x9b6bff, 0xffd23f]);
    g.fillStyle(0x0e0c1a, 1); g.fillRoundedRect(x - s * 0.5, y - s * 0.6, s, s * 0.5, 6);
    g.lineStyle(s * 0.06, col, 1); g.strokeRoundedRect(x - s * 0.5, y - s * 0.6, s, s * 0.5, 6);
    g.fillStyle(col, 0.85); g.fillRect(x - s * 0.34, y - s * 0.46, s * 0.68, s * 0.06);
    g.fillRect(x - s * 0.34, y - s * 0.3, s * 0.4, s * 0.06);
  },
};

const cone = {
  solid: true, rFactor: 0.4, min: 22, max: 32, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.45, s * 0.7, s * 0.2);
    g.fillStyle(0xff6a2c, 1);
    g.fillTriangle(x - s * 0.35, y + s * 0.4, x + s * 0.35, y + s * 0.4, x, y - s * 0.45);
    g.fillStyle(0xffffff, 0.95); g.fillRect(x - s * 0.2, y - s * 0.05, s * 0.4, s * 0.1);
    g.fillStyle(0x3a1a0a, 1); g.fillRect(x - s * 0.4, y + s * 0.4, s * 0.8, s * 0.1);
  },
};

const holoPalm = {
  solid: true, rFactor: 0.35, min: 42, max: 56, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 0.7, s * 0.22);
    g.fillStyle(0xff3df0, 0.8); g.fillRect(x - s * 0.07, y - s * 0.2, s * 0.14, s * 0.9);
    g.fillStyle(0x00e5ff, 0.8);
    const fr = s * 0.7;
    for (let k = 0; k < 6; k += 1) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.5;
      g.fillTriangle(
        x, y - s * 0.25,
        x + Math.cos(a) * fr, y - s * 0.25 + Math.sin(a) * fr,
        x + Math.cos(a + 0.12) * fr, y - s * 0.25 + Math.sin(a + 0.12) * fr,
      );
    }
  },
};

const gridTile = {
  solid: false, min: 40, max: 56, weight: 5,
  draw(g, x, y, s) {
    g.lineStyle(s * 0.03, 0x2a2455, 0.8);
    for (let k = -1; k <= 1; k += 1) {
      g.beginPath(); g.moveTo(x - s * 0.6, y + k * s * 0.3); g.lineTo(x + s * 0.6, y + k * s * 0.3); g.strokePath();
      g.beginPath(); g.moveTo(x + k * s * 0.3, y - s * 0.6); g.lineTo(x + k * s * 0.3, y + s * 0.6); g.strokePath();
    }
    g.fillStyle(0x00e5ff, 0.5); g.fillCircle(x, y, s * 0.05);
  },
};

// --------------------------------------------------------------- Desert -----
const mesaRock = {
  solid: true, rFactor: 0.6, min: 36, max: 54, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 1.4, s * 0.35);
    g.fillStyle(0x9c5a2a, 1); g.fillRect(x - s * 0.6, y - s * 0.2, s * 1.2, s * 0.7);
    g.fillStyle(0xb56a32, 1); g.fillRect(x - s * 0.45, y - s * 0.5, s * 0.9, s * 0.32);
    g.fillStyle(0xc77f3a, 1); g.fillRect(x - s * 0.28, y - s * 0.7, s * 0.56, s * 0.24);
    g.fillStyle(0x7a4420, 0.5); g.fillRect(x - s * 0.6, y - s * 0.02, s * 1.2, s * 0.05);
    g.fillStyle(0x7a4420, 0.5); g.fillRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.05);
  },
};

const saguaro = {
  solid: true, rFactor: 0.36, min: 38, max: 54, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.66, s * 0.7, s * 0.22);
    g.fillStyle(0x3f7d34, 1);
    g.fillRoundedRect(x - s * 0.13, y - s * 0.6, s * 0.26, s * 1.25, 5);
    g.fillRoundedRect(x - s * 0.5, y - s * 0.1, s * 0.18, s * 0.5, 5);
    g.fillRoundedRect(x - s * 0.5, y - s * 0.1, s * 0.5, s * 0.16, 5);
    g.fillRoundedRect(x + s * 0.32, y - s * 0.25, s * 0.18, s * 0.5, 5);
    g.fillRoundedRect(x + s * 0.14, y - s * 0.25, s * 0.36, s * 0.16, 5);
    g.fillStyle(0x4f9a3f, 1); g.fillRoundedRect(x - s * 0.09, y - s * 0.55, s * 0.08, s * 1.1, 4);
  },
};

const cowSkull = {
  solid: false, min: 26, max: 36, weight: 3,
  draw(g, x, y, s) {
    g.fillStyle(0xece4d2, 1);
    g.fillEllipse(x, y, s * 0.7, s * 0.6);
    g.fillTriangle(x - s * 0.18, y + s * 0.2, x + s * 0.18, y + s * 0.2, x, y + s * 0.5);
    g.fillStyle(0xd8cdb5, 1);
    g.fillEllipse(x - s * 0.45, y - s * 0.18, s * 0.4, s * 0.16);
    g.fillEllipse(x + s * 0.45, y - s * 0.18, s * 0.4, s * 0.16);
    g.fillStyle(0x3a2a18, 1);
    g.fillCircle(x - s * 0.16, y - s * 0.02, s * 0.08);
    g.fillCircle(x + s * 0.16, y - s * 0.02, s * 0.08);
  },
};

const desertBrush = {
  solid: false, min: 26, max: 38, weight: 5,
  draw(g, x, y, s) {
    g.lineStyle(s * 0.05, 0x8a7a3a, 1);
    const n = 6 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k += 1) {
      const a = -Math.PI / 2 + (k - n / 2) * 0.32;
      g.beginPath(); g.moveTo(x, y + s * 0.4);
      g.lineTo(x + Math.cos(a) * s * 0.5, y + s * 0.4 + Math.sin(a) * s * 0.5); g.strokePath();
    }
  },
};

const duneRipple = {
  solid: false, min: 40, max: 58, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xefcb86, 0.6); g.fillEllipse(x, y, s * 1.3, s * 0.5);
    g.lineStyle(s * 0.04, 0xc9a25c, 0.8);
    for (let k = -1; k <= 1; k += 1) {
      g.beginPath(); g.arc(x, y + k * s * 0.16 + s * 0.1, s * 0.5, Math.PI * 1.05, Math.PI * 1.95); g.strokePath();
    }
  },
};

// ---------------------------------------------------------------- Coral -----
const coralFan = {
  solid: true, rFactor: 0.5, min: 34, max: 48, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 1.0, s * 0.28);
    const col = randPick([0xff6f91, 0xff9a5b, 0xb06bff]);
    g.lineStyle(s * 0.12, col, 1);
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI / 2 + (k - 2) * 0.42;
      g.beginPath(); g.moveTo(x, y + s * 0.5);
      g.lineTo(x + Math.cos(a) * s * 0.7, y + s * 0.5 + Math.sin(a) * s * 0.9); g.strokePath();
    }
    g.fillStyle(col, 1);
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI / 2 + (k - 2) * 0.42;
      g.fillCircle(x + Math.cos(a) * s * 0.7, y + s * 0.5 + Math.sin(a) * s * 0.9, s * 0.1);
    }
  },
};

const brainCoral = {
  solid: true, rFactor: 0.55, min: 28, max: 42, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.4, s * 1.1, s * 0.3);
    g.fillStyle(0x3fe0c8, 1); g.fillCircle(x, y, s * 0.5);
    g.lineStyle(s * 0.05, 0x1f9a88, 1);
    for (let k = -2; k <= 2; k += 1) {
      g.beginPath(); g.arc(x, y, s * (0.18 + Math.abs(k) * 0.1), 0, Math.PI * 2); g.strokePath();
    }
  },
};

const kelp = {
  solid: false, min: 40, max: 56, weight: 5,
  draw(g, x, y, s) {
    g.lineStyle(s * 0.08, 0x2f9a4f, 0.95);
    for (let b = -1; b <= 1; b += 1) {
      const bx = x + b * s * 0.22;
      g.beginPath(); g.moveTo(bx, y + s * 0.5);
      g.lineTo(bx + Math.sin(b) * s * 0.15, y);
      g.lineTo(bx - s * 0.1, y - s * 0.5); g.strokePath();
    }
  },
};

const seaStar = {
  solid: false, min: 26, max: 36, weight: 3,
  draw(g, x, y, s) {
    g.fillStyle(0xffb24d, 1);
    g.fillPoints(starPoints(x, y, s * 0.5, s * 0.22, 5, Math.random() * Math.PI), true);
    g.fillStyle(0xffd28a, 1);
    for (let k = 0; k < 5; k += 1) g.fillCircle(x + (Math.random() - 0.5) * s * 0.3, y + (Math.random() - 0.5) * s * 0.3, s * 0.04);
  },
};

const bubbles = {
  solid: false, min: 24, max: 36, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xeafff8, 0.5); g.lineStyle(1.5, 0xbfeee6, 0.8);
    const n = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k += 1) {
      const bx = x + (Math.random() - 0.5) * s * 1.2;
      const by = y + (Math.random() - 0.5) * s * 1.2;
      const r = s * (0.07 + Math.random() * 0.1);
      g.fillCircle(bx, by, r); g.strokeCircle(bx, by, r);
    }
  },
};

// -------------------------------------------------------------- Haunted -----
const gravestone = {
  solid: true, rFactor: 0.46, min: 32, max: 46, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.55, s * 0.9, s * 0.26);
    g.fillStyle(0x6b6f82, 1);
    g.fillRoundedRect(x - s * 0.32, y - s * 0.45, s * 0.64, s * 1.0, s * 0.32);
    g.fillStyle(0x565a6c, 1); g.fillRect(x - s * 0.32, y + s * 0.2, s * 0.64, s * 0.35);
    g.fillStyle(0x3c3f4d, 1);
    g.fillRect(x - s * 0.06, y - s * 0.28, s * 0.12, s * 0.4);
    g.fillRect(x - s * 0.18, y - s * 0.16, s * 0.36, s * 0.12);
  },
};

const deadTreeH = {
  solid: true, rFactor: 0.4, min: 42, max: 58, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.7, s * 0.8, s * 0.26);
    g.fillStyle(0x241c33, 1); g.fillRect(x - s * 0.1, y - s * 0.5, s * 0.2, s * 1.15);
    g.lineStyle(s * 0.08, 0x241c33, 1);
    for (const side of [-1, 1]) {
      g.beginPath(); g.moveTo(x, y - s * 0.1); g.lineTo(x + side * s * 0.4, y - s * 0.45);
      g.lineTo(x + side * s * 0.55, y - s * 0.7); g.strokePath();
      g.beginPath(); g.moveTo(x, y - s * 0.35); g.lineTo(x + side * s * 0.3, y - s * 0.6); g.strokePath();
    }
    g.fillStyle(0x6ad0a0, 0.4); g.fillCircle(x - s * 0.3, y - s * 0.4, s * 0.06);
  },
};

const jackOLantern = {
  solid: true, rFactor: 0.5, min: 26, max: 38, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.45, s * 0.9, s * 0.26);
    g.fillStyle(0xe07a1f, 1); g.fillEllipse(x, y, s * 0.95, s * 0.8);
    g.fillStyle(0xc25f12, 1); g.fillEllipse(x - s * 0.3, y, s * 0.3, s * 0.78);
    g.fillStyle(0xc25f12, 1); g.fillEllipse(x + s * 0.3, y, s * 0.3, s * 0.78);
    g.fillStyle(0x3a6b1f, 1); g.fillRect(x - s * 0.06, y - s * 0.5, s * 0.12, s * 0.16);
    g.fillStyle(0xffe14d, 1);
    g.fillTriangle(x - s * 0.28, y - s * 0.05, x - s * 0.1, y - s * 0.05, x - s * 0.19, y - s * 0.22);
    g.fillTriangle(x + s * 0.1, y - s * 0.05, x + s * 0.28, y - s * 0.05, x + s * 0.19, y - s * 0.22);
    g.fillRect(x - s * 0.22, y + s * 0.16, s * 0.44, s * 0.08);
  },
};

const ghostProp = {
  solid: false, min: 30, max: 44, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0xdfe6f2, 0.5);
    g.fillCircle(x, y - s * 0.12, s * 0.4);
    g.fillRect(x - s * 0.4, y - s * 0.12, s * 0.8, s * 0.5);
    for (let k = 0; k < 3; k += 1) g.fillCircle(x - s * 0.4 + k * s * 0.4, y + s * 0.38, s * 0.13);
    g.fillStyle(0x2a2440, 0.8);
    g.fillCircle(x - s * 0.13, y - s * 0.16, s * 0.07);
    g.fillCircle(x + s * 0.13, y - s * 0.16, s * 0.07);
  },
};

const crookedFence = {
  solid: false, min: 34, max: 48, weight: 4,
  draw(g, x, y, s) {
    g.fillStyle(0x3a3550, 1);
    for (let k = -2; k <= 2; k += 1) {
      const px = x + k * s * 0.24;
      g.fillRect(px - s * 0.04, y - s * 0.3 + Math.abs(k) * s * 0.04, s * 0.08, s * 0.6);
    }
    g.fillRect(x - s * 0.5, y - s * 0.05, s, s * 0.07);
  },
};

// ------------------------------------------------------------- Carnival -----
const bigTent = {
  solid: true, rFactor: 0.5, min: 46, max: 64, weight: 3,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.55, s * 1.3, s * 0.32);
    g.fillStyle(0xf4efe6, 1); g.fillRect(x - s * 0.55, y - s * 0.1, s * 1.1, s * 0.6);
    const seg = 6;
    for (let k = 0; k < seg; k += 1) {
      g.fillStyle(k % 2 ? 0xffffff : 0xe2403a, 1);
      const x0 = x - s * 0.6 + (k / seg) * s * 1.2;
      const x1 = x - s * 0.6 + ((k + 1) / seg) * s * 1.2;
      g.fillTriangle(x0, y - s * 0.1, x1, y - s * 0.1, (x0 + x1) / 2, y - s * 0.6);
    }
    g.fillStyle(0xe2403a, 1); g.fillRect(x - s * 0.55, y - s * 0.12, s * 1.1, s * 0.06);
    g.fillStyle(0xffd23f, 1); g.fillCircle(x, y - s * 0.64, s * 0.08);
  },
};

const balloons = {
  solid: false, min: 36, max: 52, weight: 5,
  draw(g, x, y, s) {
    const cols = [0xe2403a, 0x49c2e8, 0xffd23f, 0x57c75a, 0xb06bff];
    g.lineStyle(1.5, 0xffffff, 0.6);
    for (let k = 0; k < 4; k += 1) {
      const bx = x + (k - 1.5) * s * 0.26;
      const by = y - s * 0.2 - (k % 2) * s * 0.18;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y + s * 0.4); g.strokePath();
      g.fillStyle(cols[k % cols.length], 1); g.fillEllipse(bx, by, s * 0.26, s * 0.32);
      g.fillStyle(0xffffff, 0.5); g.fillCircle(bx - s * 0.06, by - s * 0.08, s * 0.05);
    }
  },
};

const popcornCart = {
  solid: true, rFactor: 0.48, min: 34, max: 48, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.5, s * 1.0, s * 0.26);
    g.fillStyle(0xf4efe6, 1); g.fillRect(x - s * 0.4, y - s * 0.1, s * 0.8, s * 0.55);
    const seg = 5;
    for (let k = 0; k < seg; k += 1) {
      g.fillStyle(k % 2 ? 0xffffff : 0xe2403a, 1);
      g.fillRect(x - s * 0.4 + (k / seg) * s * 0.8, y - s * 0.1, s * 0.8 / seg, s * 0.55);
    }
    g.fillStyle(0x2a2a33, 1); g.fillCircle(x - s * 0.24, y + s * 0.5, s * 0.12); g.fillCircle(x + s * 0.24, y + s * 0.5, s * 0.12);
    g.fillStyle(0xffd23f, 1); g.fillRect(x - s * 0.46, y - s * 0.28, s * 0.92, s * 0.12);
    g.fillStyle(0xfff0b0, 1); g.fillCircle(x - s * 0.1, y - s * 0.34, s * 0.08); g.fillCircle(x + s * 0.12, y - s * 0.36, s * 0.07);
  },
};

const lightPost = {
  solid: true, rFactor: 0.3, min: 40, max: 56, weight: 2,
  draw(g, x, y, s) {
    shadow(g, x, y + s * 0.62, s * 0.5, s * 0.16);
    g.fillStyle(0x46465f, 1); g.fillRect(x - s * 0.05, y - s * 0.6, s * 0.1, s * 1.25);
    const cols = [0xffd23f, 0xe2403a, 0x49c2e8, 0x57c75a];
    for (let k = 0; k < 4; k += 1) {
      g.fillStyle(cols[k], 1); g.fillCircle(x, y - s * 0.5 + k * s * 0.3, s * 0.1);
    }
  },
};

const confettiPatch = {
  solid: false, min: 34, max: 48, weight: 4,
  draw(g, x, y, s) {
    const cols = [0xe2403a, 0x49c2e8, 0xffd23f, 0x57c75a, 0xb06bff, 0xffffff];
    const n = 10 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n; k += 1) {
      g.fillStyle(randPick(cols), 0.9);
      g.fillRect(x + (Math.random() - 0.5) * s * 1.5, y + (Math.random() - 0.5) * s * 1.5, s * 0.1, s * 0.06);
    }
  },
};

export const THEME_PROPS = {
  Grassy: [tree, bush, rock, sheep, flowers],
  Beach: [palm, umbrella, crab, starfish, shell],
  Ice: [snowman, pine, iceCrystal, penguin, snowPatch],
  Candy: [lollipop, peppermint, gumdrop, iceCream, sprinkles],
  Desert: [mesaRock, saguaro, cowSkull, desertBrush, duneRipple],
  Coral: [coralFan, brainCoral, kelp, seaStar, bubbles],
  Haunted: [gravestone, deadTreeH, jackOLantern, ghostProp, crookedFence],
  Carnival: [bigTent, balloons, popcornCart, lightPost, confettiPatch],
  Volcano: [volcanoRock, charredTree, emberVent, lavaPool, cinders],
  Storm: [stormRock, deadPine, signPost, puddle, reeds],
  Jungle: [jungleTree, ruinPillar, idol, vineRock, fern, mushrooms],
  Neon: [neonPylon, neonSign, cone, holoPalm, gridTile],
  Rainbow: [], // outer space — nothing off-track but the void
};
