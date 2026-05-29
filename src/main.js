import Phaser from 'phaser';
import { ROSTER } from './GrandPrix.js';
import { makeKartTexture, makeGameTextures } from './textures.js';
import TitleScene from './scenes/TitleScene.js';
import SettingsScene from './scenes/SettingsScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import RaceScene from './scenes/RaceScene.js';
import UIScene from './scenes/UIScene.js';
import ResultsScene from './scenes/ResultsScene.js';
import CeremonyScene from './scenes/CeremonyScene.js';

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    ROSTER.forEach((r) => makeKartTexture(this, `kart_${r.id}`, r.color, r.trim));
    makeGameTextures(this);
    // Seed the saved AI difficulty (defaults to medium).
    let saved = 'medium';
    try {
      const s = window.localStorage.getItem('kobikart.difficulty');
      if (s === 'easy' || s === 'medium' || s === 'hard') saved = s;
    } catch (e) { /* ignore */ }
    this.registry.set('difficulty', saved);
    // Seed the saved car-speed setting (defaults to medium).
    let speed = 'medium';
    try {
      const sp = window.localStorage.getItem('kobikart.carSpeed');
      if (sp === 'slow' || sp === 'medium' || sp === 'fast') speed = sp;
    } catch (e) { /* ignore */ }
    this.registry.set('carSpeed', speed);
    this.scene.start('TitleScene');
  }
}

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  parent: 'game',
  backgroundColor: '#0e0e16',
  pixelArt: false,
  scene: [BootScene, TitleScene, SettingsScene, TutorialScene, RaceScene, UIScene, ResultsScene, CeremonyScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
