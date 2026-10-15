import Phaser from 'phaser';
import { WORLD } from '../world/world.js';
import { state } from '../state.js';
import { makeRng, bbox } from '../drive/geom.js';
import { generateScenery } from '../drive/layout.js';
import { Collider } from '../drive/collider.js';
import { stepCar, drawCar, drawCarShadow } from '../drive/car.js';
import { CAR_CIRCLES, CAR_R } from '../drive/collider.js';
import { LOCAL_HIT_R } from '../drive/layout.js';
import {
  GRASS, GROUND_LAYERS, drawGround, drawTufts, drawTree, drawBush, drawBuilding, drawLandmark, drawSign,
  drawFences, drawMailbox, drawProp, drawPowerLines, cheapCircles,
} from '../drive/render.js';
import { AmbientView, addHills } from '../drive/ambientDraw.js';
import { updateGame } from '../game/update.js';
import { createAmbient } from '../ambient/ambient.js';
import { createAudio } from '../audio/audio.js';

const ZOOM = 4.8; // about 200 m of world across the 960 px view
const CHUNK = 250; // metres per chunk of scenery
const CHUNK_MARGIN = 90; // draw chunks this far past the view (long shadows overhang)
const TALK_RANGE = 25;
const READ_RANGE = 25;
const MAILBOX_RANGE = 12;
const OBSTACLE_RANGE = 30; // people and traffic this close to the car are solid
const TURN_SMOOTH = 7; // heading-up camera: higher follows the car's turns faster

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
      const g = cheapCircles(this.scene.add.graphics().setDepth(this.layers[layer]).setVisible(false), ZOOM);
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
    // People move (ambient), so they are dynamic obstacles, not fixed circles.
    this.collider = new Collider(WORLD, this.scenery, { staticLocals: false });
    this.buildWorld();

    // Ambient life and sound (shared modules, see CONTRACT_P2.md).
    this.amb = createAmbient(WORLD, this.scenery);
    this.audio = createAudio(WORLD);
    this.buildAmbientLayers();

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

    // Heading-up view: the camera turns so the car points up the screen.
    this.camAngle = state.view.northUp ? 0 : -Phaser.Math.DegToRad(state.car.heading);
    cam.setRotation(this.camAngle);

    // No key capture, so DOM inputs (e.g. map labels) still get WASD/arrows.
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE', false);
    // Keys released while paused (map open) would otherwise stay "down".
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.input.keyboard.resetKeys());
    this.input.keyboard.on('keydown-N', () => { state.view.northUp = !state.view.northUp; });
    this.input.keyboard.on('keydown-K', () => this.audio.toggleMute());

    // Audio runs from a game-level hook so it keeps going (and fades) while
    // this scene is paused for the map.
    this.onGameStep = (_t, delta) => {
      this.audio.update(Math.min(delta, 100) / 1000, state, this.amb, { paused: this.scene.isPaused() });
    };
    this.game.events.on(Phaser.Core.Events.POST_STEP, this.onGameStep);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.POST_STEP, this.onGameStep));

    this.state = state; // handy for debugging: __game.scene.getScene('Drive').state
    this.scene.launch('HUD');
  }

  // Draw all static scenery once.
  buildWorld() {
    // Road and water layers sit between the flat ground (1) and lakes/bridges (1.5).
    // Power line wires (3.8) sit over ground objects and animals but under the car.
    const layers = { tufts: 0, shadow: 2, objects: 3, wires: 3.8, overhead: 11 };
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
    const ground = cheapCircles(this.add.graphics().setDepth(1), ZOOM);
    const groundTop = cheapCircles(this.add.graphics().setDepth(1.5), ZOOM);
    // Each farm field gets its own Graphics, shown only when its box is in view.
    this.fieldGs = [];
    const fieldG = (f) => {
      const g = cheapCircles(this.add.graphics().setDepth(1.002).setVisible(false), ZOOM);
      this.fieldGs.push({ g, ...bbox(f.polygon) });
      return g;
    };
    drawGround(ground, WORLD, this.scenery, (name, x, y) => chunks.get(name, x, y), groundTop, fieldG);

    // Everything else goes in the chunk of its centre point.
    const at = (x, y) => [chunks.get('shadow', x, y), chunks.get('objects', x, y)];
    const over = (x, y) => chunks.get('overhead', x, y);
    const decoRng = makeRng(WORLD.seed + 202);
    for (const b of this.scenery.bushes) drawBush(chunks.get('objects', b.x, b.y), b);
    for (const t of this.scenery.trees) drawTree(...at(t.x, t.y), t);
    for (const b of WORLD.buildings) drawBuilding(...at(b.x, b.y), over(b.x, b.y), b, WORLD);
    for (const l of WORLD.landmarks) drawLandmark(...at(l.x, l.y), over(l.x, l.y), l, decoRng, WORLD);
    for (const s of WORLD.signs) drawSign(...at(s.x, s.y), s);
    for (const m of WORLD.mailboxes || []) drawMailbox(...at(m.x, m.y), m);
    drawFences(WORLD, at);
    for (const p of WORLD.props || []) drawProp(...at(p.x, p.y), p);
    drawPowerLines(WORLD, (x, y) => [chunks.get('shadow', x, y), chunks.get('wires', x, y)]);

    // Hills: soft light and shade plus contours, over the grass and forest
    // floor but under the roads.
    addHills(this, WORLD, 1.005);
  }

  // Pooled images for things that move (see src/drive/ambientDraw.js).
  buildAmbientLayers() {
    this.ambView = new AmbientView(this, WORLD);
  }

  // Box of world space the camera can see, allowing for its rotation.
  viewBox() {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const hw = cam.width / 2 / cam.zoom;
    const hh = cam.height / 2 / cam.zoom;
    const c = Math.abs(Math.cos(cam.rotation));
    const s = Math.abs(Math.sin(cam.rotation));
    const ex = hw * c + hh * s;
    const ey = hw * s + hh * c;
    return { x0: cx - ex, y0: cy - ey, x1: cx + ex, y1: cy + ey };
  }

  // People and traffic close to the car become solid for this frame.
  updateObstacles() {
    const car = state.car;
    const dyn = this.collider.dynamic;
    dyn.length = 0;
    const r2 = OBSTACLE_RANGE * OBSTACLE_RANGE;
    for (const l of WORLD.locals) {
      const p = this.amb.personPos(l.id) || l;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      if (dx * dx + dy * dy < r2) dyn.push({ x: p.x, y: p.y, r: LOCAL_HIT_R });
    }
    for (const c of this.amb.cars) {
      const dx = c.x - car.x;
      const dy = c.y - car.y;
      if (dx * dx + dy * dy > r2) continue;
      const h = Phaser.Math.DegToRad(c.heading || 0);
      for (const off of CAR_CIRCLES) dyn.push({ x: c.x + Math.sin(h) * off, y: c.y - Math.cos(h) * off, r: CAR_R * 0.95 });
    }
  }

  // Smoothly turns the camera: 0 for north-up, minus the car heading for heading-up.
  updateCameraRotation(dt) {
    const cam = this.cameras.main;
    const target = state.view.northUp ? 0 : -Phaser.Math.DegToRad(state.car.heading);
    let diff = target - this.camAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest way round
    this.camAngle += diff * (1 - Math.exp(-TURN_SMOOTH * dt));
    if (Math.abs(diff) < 1e-4) this.camAngle = target;
    cam.setRotation(this.camAngle);
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

    this.updateObstacles();
    const result = stepCar(car, input, dt, this.collider);
    state.odometer += result.moved;
    if (result.hitSpeed > 6) this.cameras.main.shake(120, 0.0015 * Math.min(3, result.hitSpeed / 8));
    this.syncCarGraphics();

    // Clocks: game clock runs 10x real time; trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs / 6000) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    // Ambient life moves (traffic, birds, people, animals, puffs, clouds).
    this.amb.update(dt, state);

    // Talk range uses where people are now, not their home spot.
    const people = WORLD.locals.map((l) => {
      const p = this.amb.personPos(l.id);
      return p ? { id: l.id, x: p.x, y: p.y } : l;
    });
    state.nearLocalId = nearestId(people, car, TALK_RANGE);
    state.nearSignId = nearestId(WORLD.signs, car, READ_RANGE);
    // Added at runtime (not in state.js): mailbox near enough to read its name.
    this.nearMailboxId = nearestId(WORLD.mailboxes || [], car, MAILBOX_RANGE);
    state.nearMailboxId = this.nearMailboxId;

    // Waypoint snapshots and arrival at the current mission's goal (sets state.won).
    updateGame(state, dt);

    this.updateCameraRotation(dt);
    const view = this.viewBox();
    this.chunks.updateVisible({ x: view.x0, y: view.y0, right: view.x1, bottom: view.y1 });
    for (const f of this.fieldGs) {
      const on = f.maxX > view.x0 - 10 && f.minX < view.x1 + 10 && f.maxY > view.y0 - 10 && f.minY < view.y1 + 10;
      if (f.g.visible !== on) f.g.setVisible(on);
    }
    this.ambView.draw(this.amb, view);
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
