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

  // Projectile: a green spiky shell.
  if (!scene.textures.exists('shell')) {
    const s = 24;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x1c1c22, 1);
    g.fillCircle(s / 2, s / 2, s / 2);
    g.fillStyle(0x33c75a, 1);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(0x1f8f3f, 1);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2;
      g.fillCircle(s / 2 + Math.cos(a) * 5, s / 2 + Math.sin(a) * 5, 2.5);
    }
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(s * 0.38, s * 0.38, 2.5);
    g.generateTexture('shell', s, s);
    g.destroy();
  }

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
