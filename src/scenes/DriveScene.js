import Phaser from 'phaser';
import { WORLD } from '../world/world.js';
import { state } from '../state.js';
import { makeRng } from '../drive/geom.js';
import { generateScenery } from '../drive/layout.js';
import { Collider } from '../drive/collider.js';
import { stepCar, drawCar, drawCarShadow } from '../drive/car.js';
import {
  GRASS, GROUND_LAYERS, drawGround, drawTufts, drawTree, drawBush, drawBuilding, drawLandmark, drawSign, drawLocal,
} from '../drive/render.js';
import { updateGame } from '../game/update.js';

const ZOOM = 4.8; // about 200 m of world across the 960 px view
const CHUNK = 250; // metres per chunk of scenery
const CHUNK_MARGIN = 90; // draw chunks this far past the view (long shadows overhang)
const TALK_RANGE = 25;
const READ_RANGE = 25;

// Static scenery split into square chunks per layer. Only chunks near the
// camera are visible, so the renderer only walks a few thousand shapes.
class ChunkLayers {
  constructor(scene, layers) {
    this.scene = scene;
    this.layers = layers; // { name: depth }
    this.cols = Math.ceil(WORLD.size.w / CHUNK);
    this.rows = Math.ceil(WORLD.size.h / CHUNK);
    this.chunks = new Map(); // key -> { col, row, graphics: [] }
    this.lastRange = '';
  }

  get(layer, x, y) {
    const col = Phaser.Math.Clamp(Math.floor(x / CHUNK), 0, this.cols - 1);
    const row = Phaser.Math.Clamp(Math.floor(y / CHUNK), 0, this.rows - 1);
    const key = `${layer}:${col}:${row}`;
    let c = this.chunks.get(key);
    if (!c) {
      const g = this.scene.add.graphics().setDepth(this.layers[layer]).setVisible(false);
      c = { col, row, g };
      this.chunks.set(key, c);
    }
    return c.g;
  }

  updateVisible(view) {
    const c0 = Math.floor((view.x - CHUNK_MARGIN) / CHUNK);
    const c1 = Math.floor((view.right + CHUNK_MARGIN) / CHUNK);
    const r0 = Math.floor((view.y - CHUNK_MARGIN) / CHUNK);
    const r1 = Math.floor((view.bottom + CHUNK_MARGIN) / CHUNK);
    const range = `${c0},${c1},${r0},${r1}`;
    if (range === this.lastRange) return;
    this.lastRange = range;
    for (const c of this.chunks.values()) {
      c.g.setVisible(c.col >= c0 && c.col <= c1 && c.row >= r0 && c.row <= r1);
    }
  }
}

export default class DriveScene extends Phaser.Scene {
  constructor() {
    super('Drive');
  }

  create() {
    const { w, h } = WORLD.size;
    this.cameras.main.setBackgroundColor(GRASS);

    this.scenery = generateScenery(WORLD);
    this.collider = new Collider(WORLD, this.scenery);
    this.buildWorld();

    // Car: shadow and body are separate so the shadow keeps a fixed sun offset.
    this.carShadow = this.add.graphics().setDepth(9);
    drawCarShadow(this.carShadow);
    this.carG = this.add.graphics().setDepth(10);
    drawCar(this.carG);
    this.syncCarGraphics();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, h);
    cam.setZoom(ZOOM);
    cam.startFollow(this.carG, false, 0.15, 0.15);
    cam.centerOn(state.car.x, state.car.y);

    // No key capture, so DOM inputs (e.g. map labels) still get WASD/arrows.
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE', false);
    // Keys released while paused (map open) would otherwise stay "down".
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.input.keyboard.resetKeys());

    this.state = state; // handy for debugging: __game.scene.getScene('Drive').state
    this.scene.launch('HUD');
  }

  // Draw all static scenery once.
  buildWorld() {
    // Road and water layers sit between the flat ground (1) and lakes/bridges (1.5).
    const layers = { tufts: 0, shadow: 2, objects: 3, overhead: 11 };
    GROUND_LAYERS.forEach((name, i) => { layers[name] = 1.01 + i * 0.01; });
    const chunks = new ChunkLayers(this, layers);
    this.chunks = chunks;

    // Grass texture, one batch per chunk.
    const tuftRng = makeRng(WORLD.seed + 101);
    for (let col = 0; col < chunks.cols; col++) {
      for (let row = 0; row < chunks.rows; row++) {
        const x0 = col * CHUNK;
        const y0 = row * CHUNK;
        drawTufts(chunks.get('tufts', x0, y0), x0, y0, CHUNK, tuftRng);
      }
    }

    // Forest floor and yards in one Graphics; roads and water per chunk;
    // lakes and bridges on top.
    const ground = this.add.graphics().setDepth(1);
    const groundTop = this.add.graphics().setDepth(1.5);
    drawGround(ground, WORLD, this.scenery, (name, x, y) => chunks.get(name, x, y), groundTop);

    // Everything else goes in the chunk of its centre point.
    const at = (x, y) => [chunks.get('shadow', x, y), chunks.get('objects', x, y)];
    const over = (x, y) => chunks.get('overhead', x, y);
    const decoRng = makeRng(WORLD.seed + 202);
    for (const b of this.scenery.bushes) drawBush(chunks.get('objects', b.x, b.y), b);
    for (const t of this.scenery.trees) drawTree(...at(t.x, t.y), t);
    for (const b of WORLD.buildings) drawBuilding(...at(b.x, b.y), over(b.x, b.y), b);
    for (const l of WORLD.landmarks) drawLandmark(...at(l.x, l.y), over(l.x, l.y), l, decoRng);
    for (const s of WORLD.signs) drawSign(...at(s.x, s.y), s);
    WORLD.locals.forEach((l, i) => drawLocal(...at(l.x, l.y), l, i));
  }

  syncCarGraphics() {
    const c = state.car;
    const rot = Phaser.Math.DegToRad(c.heading);
    this.carG.setPosition(c.x, c.y).setRotation(rot);
    this.carShadow.setPosition(c.x - 0.6, c.y - 0.25).setRotation(rot);
  }

  update(_time, delta) {
    const dtMs = Math.min(delta, 50);
    const dt = dtMs / 1000;
    const car = state.car;

    // Input is ignored (and the car brakes) while talking, in the map, or after winning.
    const locked = state.inputLocked || state.won;
    const k = this.keys;
    const input = locked
      ? { brake: true }
      : {
        up: k.W.isDown || k.UP.isDown,
        down: k.S.isDown || k.DOWN.isDown,
        left: k.A.isDown || k.LEFT.isDown,
        right: k.D.isDown || k.RIGHT.isDown,
        brake: k.SPACE.isDown,
      };

    const result = stepCar(car, input, dt, this.collider);
    state.odometer += result.moved;
    if (result.hitSpeed > 6) this.cameras.main.shake(120, 0.0015 * Math.min(3, result.hitSpeed / 8));
    this.syncCarGraphics();

    // Clocks: game clock runs 10x real time; trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs / 6000) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    state.nearLocalId = nearestId(WORLD.locals, car, TALK_RANGE);
    state.nearSignId = nearestId(WORLD.signs, car, READ_RANGE);

    // Waypoint snapshots and arrival at the current mission's goal (sets state.won).
    updateGame(state, dt);

    this.chunks.updateVisible(this.cameras.main.worldView);
  }
}

function nearestId(list, car, range) {
  let best = null;
  let bestD = range;
  for (const item of list) {
    const d = Math.hypot(item.x - car.x, item.y - car.y);
    if (d <= bestD) {
      bestD = d;
      best = item.id;
    }
  }
  return best;
}
