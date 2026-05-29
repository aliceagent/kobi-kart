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

export const THEME_PROPS = {
  Grassy: [tree, bush, rock, sheep, flowers],
  Beach: [palm, umbrella, crab, starfish, shell],
  Ice: [snowman, pine, iceCrystal, penguin, snowPatch],
  Candy: [lollipop, peppermint, gumdrop, iceCream, sprinkles],
};
