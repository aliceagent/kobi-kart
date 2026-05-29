// Shared generated textures. Created once (guarded) and reused across scenes;
// Phaser's TextureManager is global, so a BootScene can prime them all.

export function makeKartTexture(scene, key, bodyColor, trimColor) {
  if (scene.textures.exists(key)) return;
  const w = 42;
  const h = 28;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x1c1c22, 1);
  g.fillRoundedRect(0, 0, w, h, 7);
  g.fillStyle(bodyColor, 1);
  g.fillRoundedRect(3, 3, w - 6, h - 6, 6);
  g.fillStyle(trimColor, 1);
  g.fillRect(6, h / 2 - 2, w - 12, 4);
  g.fillStyle(0xbfe9ff, 1);
  g.fillRoundedRect(w - 16, 6, 10, h - 12, 3);
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
}
