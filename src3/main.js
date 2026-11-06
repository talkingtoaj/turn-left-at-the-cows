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
import { createAmbient } from '../src/ambient/ambient.js';
import { createAudio } from '../src/audio/audio.js';
import { createAmbient3D } from './world3d/ambient3d.js';
import { addCloudShadowsTo, cloudUniforms } from './world3d/clouds.js';
import { campfireOf } from './world3d/landmarks3d.js';
import { SUN_DIR } from './world3d/world3d.js';
import { createStats } from './stats.js';
import { createResScale } from './resscale.js';
import { createDamageHazards } from './damageHazards.js';
import { spotFor } from './spots.js';

const TALK_RANGE = 25;
const READ_RANGE = 25;
const MAX_DT_MS = 50;

// ---------- renderer and scene ----------

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const params = new URLSearchParams(window.location.search);
const stats = createStats(renderer, params.has('stats'));
const res = createResScale(renderer, params);
// New light, sky, weather and textures (src3/look); ?look=old for the old look.
const look = params.get('look') !== 'old' ? await (await import('./look/look.js')).createLook(renderer, params) : null;
const statsExtra = () => `res ${res.ratio.toFixed(2)} (dpr ${window.devicePixelRatio})`;

// Dev: ?spot=<name> starts the car at a review spot (src3/spots.js).
const spot = params.has('spot') ? spotFor(params.get('spot'), WORLD) : null;
if (spot) Object.assign(state.car, spot, { speed: 0 });

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
if (look) look.apply(scene, world3d, WORLD, scenery);
const car3d = buildCar();
scene.add(car3d.object);
const rig = new CameraRig(camera);

// Ambient life (shared logic) and sound.
const amb = createAmbient(WORLD, scenery);
const audio = createAudio(WORLD);
// Smoke from chimneys our models put somewhere other than the shared house formula.
const chimneyFix = [];
for (const ch of amb.chimneys || []) {
  const mine = world3d.chimneys.get(ch.id);
  if (mine) chimneyFix.push({ from: ch, dx: mine.x - ch.x, dy: mine.y - ch.y, top: mine.top });
}
const amb3d = createAmbient3D(scene, {
  terrain: world3d.terrain, surfaceAt: world3d.surfaceAt, scenery, sunDir: SUN_DIR,
  campfire: campfireOf(WORLD, world3d.terrain), chimneyFix,
});
addCloudShadowsTo(scene);
if (look) look.afterAmbient(scene);
// Damage, potholes and road hazards (also the ?hazard, ?blocker, ?spot dev flags).
const dh = createDamageHazards({ scene, scenery, collider, amb, world3d, rig, sunDir: SUN_DIR, params });

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
  if (isTyping(e)) return;
  const plain = !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (e.code === 'KeyK' && plain) {
    audio.toggleMute();
    return;
  }
  if (runtime.paused) return;
  if (DRIVE_KEYS.has(e.code)) {
    keys.add(e.code);
    e.preventDefault();
  } else if (e.code === 'KeyC' && plain) {
    runtime.cameraMode = runtime.cameraMode === 'top' ? 'chase' : 'top';
  } else if (e.code === 'KeyN' && plain) {
    state.view.northUp = !state.view.northUp;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput() {
  if (state.inputLocked || state.won || (state.damage && state.damage.brokenDown)) return { brake: true };
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp'),
    down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    brake: keys.has('Space'),
  };
}

function nearestId(list, car, range, posOf = null) {
  let best = null;
  let bestD = range;
  for (const item of list) {
    const p = (posOf && posOf(item.id)) || item;
    const d = Math.hypot(p.x - car.x, p.y - car.y);
    if (d <= bestD) {
      bestD = d;
      best = item.id;
    }
  }
  return best;
}

// ---------- main loop ----------

const carPos = new THREE.Vector3();
const groundAt = world3d.terrain.heightAt.bind(world3d.terrain);
const personPos = (id) => amb.personPos(id);
let last = performance.now();
let steer = 0;
const fps = { frames: 0, acc: 0, value: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  stats.begin(now);
  const rawMs = Math.max(0, now - last);
  const dtMs = Math.min(rawMs, MAX_DT_MS);
  last = now;
  res.update(rawMs);
  const dt = dtMs / 1000;
  const car = state.car;

  if (runtime.paused) {
    keys.clear(); // keys released while the map is open would otherwise stick
  } else {
    const input = readInput();
    const prev = dh.beforeStep();
    const result = stepCar(car, input, dt, collider, dh.mods());
    state.odometer += result.moved;
    if (result.hitSpeed > 6) rig.shake(result.hitSpeed);
    steer += (((input.right ? 1 : 0) - (input.left ? 1 : 0)) - steer) * Math.min(1, dt * 10);

    // Clocks: game clock runs 10x real time; trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs / 6000) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    // Ambient life moves after the car (dust, birds scatter, traffic stops).
    amb.update(dt, state);
    dh.afterStep(dt, result, prev);
    // Locals wander a few metres; talk range follows where they are now.
    state.nearLocalId = nearestId(WORLD.locals, car, TALK_RANGE, personPos);
    state.nearSignId = nearestId(WORLD.signs, car, READ_RANGE);

    // Waypoint snapshots and arrival at the current mission's goal (sets state.won).
    updateGame(state, dt);
  }

  car3d.update(car, runtime.paused ? 0 : dt, world3d.surfaceAt, steer, state.damage || null);
  carPos.copy(car3d.object.position);
  rig.rumble(world3d.terrain.bumps.roughness(car.x, car.y) * Math.min(1, Math.abs(car.speed) / 20) * (runtime.paused ? 0 : 1));
  const e = rig.update(carPos, car.heading, dt, runtime.cameraMode, groundAt, state.view.northUp);
  // Sound every frame, even paused (it ducks while the map is open).
  audio.update(dt, state, amb, { paused: runtime.paused });

  // Fog and draw distance: driver's view is hazy; top view sees its patch clearly.
  scene.fog.near = THREE.MathUtils.lerp(150, 260, e);
  scene.fog.far = THREE.MathUtils.lerp(420, 600, e);
  const far = scene.fog.far + 30;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  if (look) look.update(state); // weather drift
  world3d.update(now / 1000, dt, car, rig.focus, rig.shadowRadius, camera, amb);
  amb3d.update(amb, runtime.paused ? 0 : dt, camera, rig.focus, scene.fog, e, renderer, dh.hz.animals);
  dh.render(runtime.paused ? 0 : dt, rig.focus, car3d.object, camera, scene.fog, renderer);

  // The world is frozen behind the map overlay: keep the last shadow map.
  renderer.shadowMap.autoUpdate = !runtime.paused;
  renderer.render(scene, camera);
  hud.update(dt);
  stats.end(statsExtra);

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
window.__three = { renderer, scene, camera, fps, THREE, world3d, stats, res };
window.__amb = amb;
window.__dh = dh;
window.__audio = audio;
window.__cloudUniforms = cloudUniforms;
window.__look = look;

requestAnimationFrame(frame);
