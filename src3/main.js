// The game's entry point (loaded by src3/boot.js after the start screen).
// Renderer, car, camera, HUD and the main loop live for the whole session;
// the world is built one region at a time (src/world/regions.js): starting
// a mission builds its region behind a load screen, and leaving a region
// disposes everything it put on the GPU (src3/gpuTracker.js).
// Gameplay (physics, collisions, state updates) is shared engine-free code in src/.

import * as THREE from 'three';
import { trackRegion, collectKeep, disposeTracked } from './gpuTracker.js';
import { WORLD, setRegion, REGIONS } from '../src/world/world.js';
import { state } from '../src/state.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider } from '../src/drive/collider.js';
import { stepCar } from '../src/drive/car.js';
import { runtime } from './runtime.js';
import { updateGame, jumpToMission } from '../src/game/update.js';
import { MISSIONS, currentMission } from '../src/game/missions.js';
import { showLoadScreen } from '../src/ui/loadScreen.js';
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
import { spotFor, spotRegion } from './spots.js';
import { setRoughnessEnabled, setRollEnabled } from '../src/world/roughness.js';
import { setScatterEnabled } from '../src/world/scatter.js';
import { districtsFor } from '../src/world/districts.js';
import { createWetness } from '../src/game/wetness.js';
import { createWeatherClock } from './look/weather.js';
import { createRain3D } from './world3d/rain3d.js';

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
// Dev: ?rain=on rains now (on an overcast day unless ?weather says otherwise).
if (params.get('rain') === 'on' && !params.has('weather')) params.set('weather', 'overcast');
const stats = createStats(renderer, params.has('stats'));
const res = createResScale(renderer, params);
// New light, sky, weather and textures (src3/look); ?look=old for the old look.
const look = params.get('look') !== 'old' ? await (await import('./look/look.js')).createLook(renderer, params) : null;
// Dev: ?districts=show also names the district under the car (in ?stats, or a small label).
const showDistricts = params.get('districts') === 'show';
const districtLabel = () => {
  const d = districtsFor(WORLD).at(state.car.x, state.car.y);
  return `${d.name} (${d.kind})`;
};
const statsExtra = () => `res ${res.ratio.toFixed(2)} (dpr ${window.devicePixelRatio})\nrain ${wetness.rain.toFixed(2)} wet ${wetness.wet.toFixed(2)} puddles ${wetness.puddle.toFixed(2)}${showDistricts ? `\n${districtLabel()}` : ''}`;
let districtEl = null;
if (showDistricts && !params.has('stats')) {
  districtEl = document.createElement('div');
  districtEl.style.cssText = 'position:fixed;left:6px;top:6px;z-index:9999;pointer-events:none;font:13px/1.3 sans-serif;color:#fff;background:rgba(0,0,0,0.55);padding:4px 8px;border-radius:4px';
  document.body.appendChild(districtEl);
}

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.8, 450);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world (one region at a time) ----------

if (params.get('rough') === 'off') setRoughnessEnabled(false); // dev: compare without rough ground
if (params.get('roll') === 'off') setRollEnabled(false); // dev: compare without the rolling layer
// Dev: ?scatter=off builds the world without the district scatter (rocks,
// shrubs, tussocks, outcrops) and without the district grass tints.
if (params.get('scatter') === 'off') setScatterEnabled(false);

// The player's car and camera outlive regions.
const car3d = buildCar({ env: look ? look.carEnv() : null });
const rig = new CameraRig(camera);
// Sound: one audio graph for the session; it follows the region (setWorld).
const audio = createAudio(WORLD, { weather: true });

// The current region's pieces (rebuilt by loadRegion).
let regionId = null;
let scene = null;
let scenery = null;
let collider = null;
let world3d = null;
let amb = null;
let amb3d = null;
let dh = null;
let rain3d = null;
let wetness = null;
let ownWeather = null; // without the new look there is no weather clock of its own: keep one here
let groundAt = null;
let gpuSet = null; // GPU resources this region uploaded (src3/gpuTracker.js)
let loading = false;
let firstLoad = true;

const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// Frees everything the current region put on the GPU (the car and the
// look's shared textures stay) and drops its objects for the GC.
function disposeRegion() {
  if (!scene) return 0;
  if (dh && dh.dispose) dh.dispose();
  scene.remove(car3d.object);
  const keep = collectKeep([car3d.object], look ? look.keepTextures() : []);
  const n = gpuSet ? disposeTracked(gpuSet, keep) : 0;
  scene.clear();
  renderer.renderLists.dispose();
  scene = scenery = collider = world3d = amb = amb3d = dh = rain3d = null;
  gpuSet = null;
  return n;
}

// Builds region `id` behind a load screen. `title`: the mission's title.
// Dev URL flags that place the car (?spot, ?fallen) only act on the first load.
async function loadRegion(id, title) {
  loading = true;
  const t0 = performance.now();
  const ls = showLoadScreen({ title, region: REGIONS[id] ? REGIONS[id].name : id });
  const step = async (f, text) => {
    ls.progress(f, text);
    await nextPaint();
  };
  try {
    await step(0.02, 'Folding the old map away');
    const freed = disposeRegion();
    await step(0.08, 'Reading the county records');
    setRegion(id);
    regionId = id;
    gpuSet = trackRegion();
    audio.setWorld(WORLD);
    const devParams = firstLoad ? params : new URLSearchParams([...params].filter(([k]) => k !== 'spot' && k !== 'fallen'));
    // Rain and wet ground (round 8, src/game/wetness.js), driven by the weather.
    // ?rain=on|off, ?wet=<0..1>; ?weather=cycle speeds it up like the weather.
    wetness = createWetness(WORLD.seed || 1, {
      rain: params.get('rain'),
      wet: params.has('wet') ? Number(params.get('wet')) : null,
      speed: params.get('weather') === 'cycle' ? 15 : 1,
    });
    ownWeather = look ? null : createWeatherClock(WORLD.seed || 1, params.get('weather'));
    await step(0.14, 'Planting trees');
    scenery = generateScenery(WORLD);
    collider = new Collider(WORLD, scenery);
    await step(0.3, 'Laying out the land, roads and farms');
    scene = new THREE.Scene();
    world3d = buildWorld3D(scene, WORLD, scenery, collider);
    groundAt = world3d.terrain.heightAt.bind(world3d.terrain);
    await step(0.7, 'Mixing the paint');
    if (look) look.apply(scene, world3d, WORLD, scenery);
    scene.add(car3d.object);
    await step(0.78, 'Waking the locals');
    // Ambient life (shared logic).
    amb = createAmbient(WORLD, scenery);
    // Smoke from chimneys our models put somewhere other than the shared house formula.
    const chimneyFix = [];
    for (const ch of amb.chimneys || []) {
      const mine = world3d.chimneys.get(ch.id);
      if (mine) chimneyFix.push({ from: ch, dx: mine.x - ch.x, dy: mine.y - ch.y, top: mine.top });
    }
    amb3d = createAmbient3D(scene, {
      terrain: world3d.terrain, surfaceAt: world3d.surfaceAt, scenery, sunDir: SUN_DIR,
      campfire: campfireOf(WORLD, world3d.terrain), chimneyFix, carEnv: look ? look.carEnv() : null,
    });
    addCloudShadowsTo(scene);
    if (look) look.afterAmbient(scene);
    // Damage, potholes and road hazards (also the ?hazard, ?fallen, ?spot dev flags).
    dh = createDamageHazards({ scene, scenery, collider, amb, world3d, rig, sunDir: SUN_DIR, params: devParams, env: look ? look.carEnv() : null });
    // Rain streaks and wheel spray.
    rain3d = createRain3D(scene);
    await step(0.9, 'Warming up the engine');
    // One frame with everything in, so the shaders compile behind the card.
    car3d.update(state.car, 0, world3d.surfaceAt, 0, state.damage || null, null);
    rig.update(car3d.object.position, state.car.heading, 0, runtime.cameraMode, groundAt, state.view.northUp);
    world3d.update(0, 0, state.car, rig.focus, rig.shadowRadius, camera, amb);
    renderer.render(scene, camera);
    await step(1, '');
    const ms = Math.round(performance.now() - t0);
    lastLoad = { region: id, ms, freed, memory: memoryNow() };
    console.info(`[region] ${id} built in ${ms} ms (freed ${freed} GPU resources of the region before)`);
    exposeDebug();
  } finally {
    ls.close();
    firstLoad = false;
    loading = false;
    last = performance.now();
  }
}

let lastLoad = null;
function memoryNow() {
  const m = renderer.info.memory;
  const pm = performance.memory;
  return {
    geometries: m.geometries,
    textures: m.textures,
    programs: renderer.info.programs ? renderer.info.programs.length : null,
    heapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null,
  };
}

// The mission now playing is in another region (the one before it ended
// there): build that region and put the car at the mission's start.
async function followMission() {
  const m = currentMission(state);
  if (!m || m.region === regionId) return;
  runtime.paused = true;
  await loadRegion(m.region, m.title);
  Object.assign(state.car, m.start, { speed: 0 });
  state.missionStart = { ...m.start };
  runtime.paused = false;
}

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
const personPos = (id) => amb.personPos(id);
let last = performance.now();
let steer = 0;
const ground = { type: 'paved', rough: 0, plow: 0, plowAngle: 0, offRoad: false };
const fps = { frames: 0, acc: 0, value: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  if (loading || !scene) return;
  // A finished mission handed over to one in another region: load it.
  const cm = currentMission(state);
  if (cm && cm.region !== regionId && !state.won) {
    followMission();
    return;
  }
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
    dh.setWet(wetness.wet);
    const prev = dh.beforeStep();
    const result = stepCar(car, input, dt, collider, dh.mods());
    // The ground under the car (src/world/roughness.js): safe speed off-road,
    // ride bounce and camera rumble.
    const g = world3d.terrain.rough.at(car.x, car.y);
    ground.type = g.type;
    ground.rough = g.rough;
    ground.plow = g.plow;
    ground.plowAngle = g.plowAngle;
    ground.offRoad = result.surface === 'grass';
    result.ground = ground;
    state.odometer += result.moved;
    if (result.hitSpeed > 6) rig.shake(result.hitSpeed);
    steer += (((input.right ? 1 : 0) - (input.left ? 1 : 0)) - steer) * Math.min(1, dt * 10);

    // Clocks: game clock runs 10x real time; trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs / 6000) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    // Ambient life moves after the car (dust, birds scatter, traffic stops).
    amb.update(dt, state);
    dh.afterStep(dt, result, prev);
    // Through a shrub: a little bounce of the body and the camera. Through a
    // puddle: a splash at the wheel and a small jolt.
    for (const ev of (state.damage && state.damage.events) || []) {
      if (ev.type === 'bump' && ev.kind === 'shrub') {
        car3d.kick(0.05 + 0.12 * ev.strength);
        rig.shake(2 + 4 * ev.strength);
      } else if (ev.type === 'bump' && ev.kind === 'puddle') {
        // Both front wheels throw water (the puddle counts once, at the first wheel in).
        const h = car.heading * (Math.PI / 180);
        for (const side of [-0.85, 0.85]) {
          const wx = car.x + Math.sin(h) * 1.4 + Math.cos(h) * side;
          const wy = car.y - Math.cos(h) * 1.4 + Math.sin(h) * side;
          rain3d.splash(wx, world3d.surfaceAt(wx, wy), wy, Math.abs(car.speed), car.heading, ev.r >= 3);
        }
        car3d.kick(0.03 + 0.05 * ev.strength);
        rig.shake(1 + 2 * ev.strength);
      }
    }
    // Fine spray off the rear tyres on a wet road at speed.
    if (wetness.wet > 0.3 && result.surface !== 'grass') {
      const h = car.heading * (Math.PI / 180);
      const fx = Math.sin(h);
      const fy = -Math.cos(h);
      const amount = (wetness.wet - 0.3) * (result.surface === 'paved' ? 1 : 0.6);
      for (const side of [-0.8, 0.8]) {
        const wx = car.x - fx * 1.4 - fy * side;
        const wy = car.y - fy * 1.4 + fx * side;
        rain3d.spray(wx, world3d.surfaceAt(wx, wy), wy, Math.abs(car.speed), car.heading, amount, dt);
      }
    }
    // Locals wander a few metres; talk range follows where they are now.
    state.nearLocalId = nearestId(WORLD.locals, car, TALK_RANGE, personPos);
    state.nearSignId = nearestId(WORLD.signs, car, READ_RANGE);

    // Waypoint snapshots and arrival at the current mission's goal (sets state.won).
    updateGame(state, dt);
  }

  car3d.update(car, runtime.paused ? 0 : dt, world3d.surfaceAt, steer, state.damage || null, ground.offRoad ? ground : null);
  carPos.copy(car3d.object.position);
  // Camera rumble: dirt road bumps, or the ground's own small bumps off-road.
  const roadRumble = world3d.terrain.bumps.roughness(car.x, car.y) * Math.min(1, Math.abs(car.speed) / 20);
  const groundRumble = ground.offRoad ? ground.rough * 0.85 * Math.min(1, Math.abs(car.speed) / 14) : 0;
  rig.rumble(Math.max(roadRumble, groundRumble) * (runtime.paused ? 0 : 1));
  const e = rig.update(carPos, car.heading, dt, runtime.cameraMode, groundAt, state.view.northUp);
  // Sound every frame, even paused (it ducks while the map is open).
  audio.update(dt, state, amb, { paused: runtime.paused, rain: wetness });

  // Fog and draw distance: driver's view is hazy; top view sees its patch
  // clearly. Rain closes it in.
  const wv = look ? (look.weather ?? 0.5) : ownWeather.update(state);
  if (!runtime.paused) wetness.update(state, wv);
  scene.fog.near = THREE.MathUtils.lerp(150, 260, e) * (1 - 0.45 * wetness.rain);
  scene.fog.far = THREE.MathUtils.lerp(420, 600, e) * (1 - 0.25 * wetness.rain);
  const far = scene.fog.far + 30;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  if (look) look.update(state, wetness.rain, wetness.wet); // weather drift, rain
  world3d.puddles.update(wetness.puddle, wetness.rain, now / 1000, scene.fog.color);
  rain3d.update(runtime.paused ? 0 : dt, now / 1000, camera, wetness.rain, scene.fog.color);
  world3d.update(now / 1000, dt, car, rig.focus, rig.shadowRadius, camera, amb);
  amb3d.wet = wetness.wet;
  amb3d.update(amb, runtime.paused ? 0 : dt, camera, rig.focus, scene.fog, e, renderer, dh.hz.animals);
  dh.render(runtime.paused ? 0 : dt, rig.focus, car3d.object, camera, scene.fog, renderer);

  // The world is frozen behind the map overlay: keep the last shadow map.
  renderer.shadowMap.autoUpdate = !runtime.paused;
  renderer.render(scene, camera);
  hud.update(dt);
  stats.end(statsExtra);
  if (districtEl && (fps.frames & 15) === 0) districtEl.textContent = districtLabel();

  fps.frames++;
  fps.acc += now - (fps.prev || now);
  fps.prev = now;
  if (fps.acc >= 1000) {
    fps.value = Math.round((fps.frames * 1000) / fps.acc);
    fps.frames = 0;
    fps.acc = 0;
  }
}

// Debug handles (refreshed after every region load).
function exposeDebug() {
  window.__state = state;
  window.__runtime = runtime;
  window.__three = { renderer, scene, camera, fps, THREE, world3d, stats, res, regionId, lastLoad, memoryNow };
  window.__amb = amb;
  window.__dh = dh;
  window.__audio = audio;
  window.__cloudUniforms = cloudUniforms;
  window.__look = look;
  window.__car3d = car3d;
  window.__wet = wetness;
  window.__rain3d = rain3d;
  // Dev: load a region now (memory checks): await __loadRegion('fenwick').
  window.__loadRegion = (id) => loadRegion(id, `Region ${id}`);
}

// Called by the start screen (src3/boot.js) with the mission to play:
// Continue (the first unfinished one) or any finished one to replay.
// Dev: ?spot=<name> starts the car at a review spot (src3/spots.js); a
// spot in another region plays that region's first mission instead.
export async function startGame(index = 0) {
  const spotName = params.get('spot');
  const sr = spotName ? spotRegion(spotName) : null;
  if (sr && MISSIONS[index].region !== sr) {
    const i = MISSIONS.findIndex((m) => m.region === sr);
    if (i >= 0) index = i;
  }
  jumpToMission(state, index);
  const m = MISSIONS[index];
  await loadRegion(m.region, m.title);
  const spot = spotName ? spotFor(spotName, WORLD) : null;
  if (spot) {
    Object.assign(state.car, spot, { speed: 0 });
    state.missionStart = { x: spot.x, y: spot.y, heading: spot.heading };
  }
  last = performance.now();
  requestAnimationFrame(frame);
}
