import Phaser from 'phaser';
import DriveScene from './scenes/DriveScene.js';
import HUDScene from './scenes/HUDScene.js';
import MapScene from './scenes/MapScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 640,
  backgroundColor: '#5f8f4a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [DriveScene, HUDScene, MapScene],
});

// Handy for debugging in the browser console.
window.__game = game;
