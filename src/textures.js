// Shared generated textures. Created once (guarded) and reused across scenes;
// Phaser's TextureManager is global, so a BootScene can prime them all.

// Top-down go-kart, nose pointing +x (heading 0). Tyres poke out the sides, a
// tapered chassis carries side pods and a cockpit with the driver's helmet
// (tinted with the car's trim so each racer reads at a glance), plus a glossy
// sheen.
export function makeKartTexture(scene, key, bodyColor, trimColor) {
  if (scene.textures.exists(key)) return;
  const w = 46;
  const h = 32;
  const cy = h / 2;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // Tyres (dark, with a lighter hub band). Rear pair a touch larger.
  const tyre = (tx, ty, tw, th) => {
    g.fillStyle(0x111116, 1); g.fillRoundedRect(tx, ty, tw, th, 3);
    g.fillStyle(0x33333c, 1); g.fillRoundedRect(tx + 1.5, ty + th * 0.32, tw - 3, th * 0.36, 2);
  };
  tyre(5, 0, 13, 9); tyre(5, h - 9, 13, 9);       // rear
  tyre(31, 1, 10, 8); tyre(31, h - 9, 10, 8);     // front

  // Rear wing / bumper.
  g.fillStyle(0x15151b, 1); g.fillRoundedRect(1, cy - 12, 6, 24, 3);

  // Chassis: dark hull, then the body colour inset a couple px for an outline.
  const hull = [
    { x: w - 2, y: cy }, { x: w - 13, y: cy - 8 }, { x: 13, y: cy - 11 },
    { x: 5, y: cy - 8 }, { x: 5, y: cy + 8 }, { x: 13, y: cy + 11 }, { x: w - 13, y: cy + 8 },
  ];
  const cxC = 22;
  const inset = hull.map((p) => ({ x: (p.x - cxC) * 0.86 + cxC, y: (p.y - cy) * 0.80 + cy }));
  g.fillStyle(0x14141a, 1); g.fillPoints(hull, true);
  g.fillStyle(bodyColor, 1); g.fillPoints(inset, true);

  // Front nose accent + lengthwise side stripes in the trim colour.
  g.fillStyle(trimColor, 1);
  g.fillTriangle(w - 4, cy, w - 13, cy - 5, w - 13, cy + 5);
  g.fillRect(13, cy - 9, 16, 2.5);
  g.fillRect(13, cy + 6.5, 16, 2.5);

  // Cockpit well + driver helmet (trim-tinted) with a dark visor + highlight.
  g.fillStyle(0x14141a, 1); g.fillEllipse(19, cy, 17, 16);
  g.fillStyle(0x0d0d11, 1); g.fillCircle(19, cy, 6.6);
  g.fillStyle(trimColor, 1); g.fillCircle(19, cy, 5.2);
  g.fillStyle(0x0d0d11, 1); g.fillRect(20.5, cy - 3.6, 4, 7.2);
  g.fillStyle(0xffffff, 0.55); g.fillCircle(16.8, cy - 2, 1.7);

  // Glossy sheen across the nose.
  g.fillStyle(0xffffff, 0.16); g.fillEllipse(31, cy - 5, 17, 7);

  g.generateTexture(key, w, h);
  g.destroy();
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

// A top-down turtle shell: domed shell with a central scute and radiating
// segment lines, a rim, and a highlight.
function makeShell(scene, key, base, rim, dark, light) {
  if (scene.textures.exists(key)) return;
  const s = 28;
  const c = s / 2;
  const R = s / 2;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x16161c, 1); g.fillCircle(c, c, R);          // dark outline
  g.fillStyle(rim, 1); g.fillCircle(c, c, R - 1.5);          // rim
  g.fillStyle(base, 1); g.fillCircle(c, c, R - 4);           // dome
  // Radiating segment lines.
  g.lineStyle(1.5, dark, 1);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * (R * 0.32), c + Math.sin(a) * (R * 0.32));
    g.lineTo(c + Math.cos(a) * (R - 4), c + Math.sin(a) * (R - 4));
    g.strokePath();
  }
  // Central scute (hexagon).
  const hex = [];
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    hex.push({ x: c + Math.cos(a) * R * 0.34, y: c + Math.sin(a) * R * 0.34 });
  }
  g.fillStyle(dark, 1); g.fillPoints(hex, true);
  g.fillStyle(light, 0.9); g.fillCircle(c, c, R * 0.16);
  g.fillStyle(0xffffff, 0.5); g.fillCircle(c - R * 0.4, c - R * 0.4, R * 0.16);
  g.generateTexture(key, s, s);
  g.destroy();
}

export function makeGameTextures(scene) {
  // Item box: bright rounded square with a white star.
  if (!scene.textures.exists('itembox')) {
    const s = 40;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a2a33, 1);
    g.fillRoundedRect(0, 0, s, s, 9);
    g.fillStyle(0x37c9d6, 1);
    g.fillRoundedRect(3, 3, s - 6, s - 6, 7);
    g.fillStyle(0x8be8f0, 1);
    g.fillRoundedRect(3, 3, s - 6, (s - 6) / 2, 7);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(starPoints(s / 2, s / 2, s * 0.3, s * 0.13, 5, -Math.PI / 2), true);
    g.generateTexture('itembox', s, s);
    g.destroy();
  }

  // Projectile turtle shells (green = straight, red = homing, blue = leader-seeking).
  makeShell(scene, 'shell_green', 0x3ecf5a, 0x1f8f3f, 0x14662b, 0x9bf0a6);
  makeShell(scene, 'shell_red', 0xff5a5a, 0xc0392b, 0x8e1f1f, 0xffc2c2);
  makeShell(scene, 'shell_blue', 0x4d8bff, 0x1e46b0, 0x122e6e, 0xbcd4ff);

  // Trap: an oil slick.
  if (!scene.textures.exists('oil')) {
    const w = 36;
    const h = 24;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x15151c, 0.92);
    g.fillEllipse(w / 2, h / 2, w, h);
    g.fillStyle(0x3a3550, 0.9);
    g.fillEllipse(w / 2, h / 2, w * 0.6, h * 0.55);
    g.fillStyle(0x6f6ab0, 0.7);
    g.fillEllipse(w * 0.4, h * 0.4, w * 0.18, h * 0.16);
    g.generateTexture('oil', w, h);
    g.destroy();
  }

  // Small square for confetti / sparks (tinted at runtime).
  if (!scene.textures.exists('spark')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }

  // Coin: a shiny gold disc with a rim, a star, and a highlight.
  if (!scene.textures.exists('coin')) {
    const s = 22;
    const c = s / 2;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x9a6b12, 1); g.fillCircle(c, c, c);
    g.fillStyle(0xffd23f, 1); g.fillCircle(c, c, c - 2);
    g.fillStyle(0xfff0a0, 1); g.fillCircle(c, c, c - 5);
    g.fillStyle(0xe8a81e, 1);
    g.fillPoints(starPoints(c, c, c - 5, (c - 5) * 0.45, 5, -Math.PI / 2), true);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(c - 3, c - 3, 1.8);
    g.generateTexture('coin', s, s);
    g.destroy();
  }

  // Tumbleweed: a tangled ball of dry twigs (Desert moving obstacle).
  if (!scene.textures.exists('tumbleweed')) {
    const s = 30;
    const c = s / 2;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x6e4a22, 0.35); g.fillCircle(c, c, c - 1);
    g.lineStyle(2, 0x8a5e2c, 1);
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 2, c + Math.sin(a) * 2);
      g.lineTo(c + Math.cos(a + 0.6) * (c - 1), c + Math.sin(a + 0.6) * (c - 1));
      g.strokePath();
    }
    g.lineStyle(1.5, 0xb0823f, 1);
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2 + 0.4;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * (c * 0.3), c + Math.sin(a) * (c * 0.3));
      g.lineTo(c + Math.cos(a - 0.5) * (c - 2), c + Math.sin(a - 0.5) * (c - 2));
      g.strokePath();
    }
    g.generateTexture('tumbleweed', s, s);
    g.destroy();
  }
}
