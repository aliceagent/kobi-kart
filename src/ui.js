import * as Audio from './Audio.js';

// A small speaker toggle in the bottom-right corner, plus the "M" key.
export function addMuteButton(scene) {
  const x = scene.scale.width - 28;
  const y = scene.scale.height - 26;
  const g = scene.add.graphics().setDepth(60).setScrollFactor(0);

  const draw = () => {
    g.clear();
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(x, y, 17);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeCircle(x, y, 17);
    // Speaker body + cone.
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(x - 8, y - 4, 4, 8);
    g.fillTriangle(x - 4, y - 7, x - 4, y + 7, x + 2, y);
    if (Audio.isMuted()) {
      g.lineStyle(3, 0xff5555, 1);
      g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.strokePath();
    } else {
      g.lineStyle(2, 0xffffff, 0.9);
      g.beginPath(); g.arc(x + 3, y, 6, -0.7, 0.7); g.strokePath();
      g.beginPath(); g.arc(x + 3, y, 9, -0.6, 0.6); g.strokePath();
    }
  };
  draw();

  const zone = scene.add.zone(x, y, 42, 42).setInteractive({ useHandCursor: true })
    .setScrollFactor(0).setDepth(60);
  zone.on('pointerdown', () => { Audio.resumeAudio(); Audio.toggleMute(); draw(); });

  const mKey = scene.input.keyboard.addKey('M');
  mKey.on('down', () => { Audio.toggleMute(); draw(); });

  return { zone, redraw: draw };
}
