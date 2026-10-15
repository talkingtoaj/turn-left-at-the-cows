// three.js version: entry point. Renderer, world, car, camera, main loop.
// Gameplay (physics, collisions, state updates) matches the Phaser DriveScene.

import * as THREE from 'three';
import { WORLD } from '../src/world/world.js';
import { state } from '../src/state.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider } from '../src/drive/collider.js';
import { stepCar } from '../src/drive/car.js';
import { runtime } from './runtime.js';
import { updateGame } from '../src/game/update.js';
import { createHUD } from './hud/hud.js';
import { createMapOverlay } from './map/map.js';
import { buildWorld3D } from './world3d/world3d.js';
import { buildCar } from './world3d/car3d.js';
import { CameraRig } from './world3d/camera.js';

const TALK_RANGE = 25;
const READ_RANGE = 25;
const MAX_DT_MS = 50;

// ---------- renderer and scene ----------

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.8, 450);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world ----------

const scenery = generateScenery(WORLD);
const collider = new Collider(WORLD, scenery);
const world3d = buildWorld3D(scene, WORLD, scenery, collider);
const car3d = buildCar();
scene.add(car3d.object);
const rig = new CameraRig(camera);

// ---------- UI wiring (see CONTRACT3.md) ----------

const ui = document.getElementById('ui');
const map = createMapOverlay(ui, { onClose: () => { runtime.paused = false; state.inputLocked = false; } });
const hud = createHUD(ui, { openMap: () => { runtime.paused = true; state.inputLocked = true; map.open(); } });

// ---------- input ----------

const keys = new Set();
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};
const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
window.addEventListener('keydown', (e) => {
  if (isTyping(e) || runtime.paused) return;
  if (DRIVE_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
  } else if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    runtime.cameraMode = runtime.cameraMode === 'top' ? 'chase' : 'top';
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput() {
  if (state.inputLocked || state.won) return { brake: true };
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp'),
    down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    brake: keys.has('Space'),
  };
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

// ---------- main loop ----------

const carPos = new THREE.Vector3();
let last = performance.now();
let steer = 0;
const fps = { frames: 0, acc: 0, value: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(Math.max(0, now - last), MAX_DT_MS);
  last = now;
  const dt = dtMs / 1000;
  const car = state.car;

  if (runtime.paused) {
    keys.clear(); // keys released while the map is open would otherwise stick
  } else {
    const input = readInput();
    const result = stepCar(car, input, dt, collider);
    state.odometer += result.moved;
    if (result.hitSpeed > 6) rig.shake(result.hitSpeed);
    steer += (((input.right ? 1 : 0) - (input.left ? 1 : 0)) - steer) * Math.min(1, dt * 10);

    // Clocks: game clock runs 10x real time; trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs / 6000) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    state.nearLocalId = nearestId(WORLD.locals, car, TALK_RANGE);
    state.nearSignId = nearestId(WORLD.signs, car, READ_RANGE);

    // Waypoint snapshots and arrival at the current mission's goal (sets state.won).
    updateGame(state, dt);
  }

  car3d.update(car, runtime.paused ? 0 : dt, world3d.surfaceAt, steer);
  carPos.copy(car3d.object.position);
  const e = rig.update(carPos, car.heading, dt, runtime.cameraMode, world3d.terrain.heightAt.bind(world3d.terrain));

  // Fog and draw distance: driver's view is hazy; top view sees its patch clearly.
  scene.fog.near = THREE.MathUtils.lerp(150, 260, e);
  scene.fog.far = THREE.MathUtils.lerp(420, 600, e);
  const far = scene.fog.far + 30;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  world3d.update(now / 1000, dt, car, rig.focus, rig.shadowRadius, camera);

  renderer.render(scene, camera);
  hud.update(dt);

  fps.frames++;
  fps.acc += now - (fps.prev || now);
  fps.prev = now;
  if (fps.acc >= 1000) {
    fps.value = Math.round((fps.frames * 1000) / fps.acc);
    fps.frames = 0;
    fps.acc = 0;
  }
}

// Debug handles.
window.__state = state;
window.__runtime = runtime;
window.__three = { renderer, scene, camera, fps };

requestAnimationFrame(frame);
