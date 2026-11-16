// The game's entry point. src3/boot.js imports it while the start screen is
// up, builds the first region quietly (preloadMenu) and shows it drifting
// slowly behind the menu's windshield; startGame() then only has to place
// the car.
// Renderer, car, camera, HUD and the main loop live for the whole session;
// the world is built one region at a time (src/world/regions.js): starting
// a mission builds its region behind a load screen, and leaving a region
// disposes everything it put on the GPU (src3/gpuTracker.js).
// Gameplay (physics, collisions, state updates) is shared engine-free code in src/.

import * as THREE from 'three';
import { learnMentions, learnNearby } from '../src/game/dialogue.js';
import { repairNear, needsRepair } from '../src/game/repair.js';
import { trackRegion, collectKeep, disposeTracked } from './gpuTracker.js';
import { WORLD, setRegion, REGIONS } from '../src/world/world.js';
import { GAME_MIN_PER_MS } from '../src/game/clock.js';
import { state } from '../src/state.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider } from '../src/drive/collider.js';
import { stepCar } from '../src/drive/car.js';
import { runtime } from './runtime.js';
import { updateGame, jumpToMission, missionRegion } from '../src/game/update.js';
import { MISSIONS, currentMission, currentGoal } from '../src/game/missions.js';
import { currentMissionId } from '../src/game/tourists.js';
import { showLoadScreen } from '../src/ui/loadScreen.js';
import { createHUD } from './hud/hud.js';
import { createMapOverlay } from './map/map.js';
import { buildWorld3D } from './world3d/world3d.js';
import { buildCar } from './world3d/car3d.js';
import { CameraRig } from './world3d/camera.js';
import { createAmbient } from '../src/ambient/ambient.js';
import { createAudio } from '../src/audio/audio.js';
import { createRadio } from '../src/radio/radio.js';
import { STATIONS } from '../src/radio/segments.js';
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
import { createPlanes3D } from './world3d/planes3d.js';
import { createTow } from './tow3d.js';
import { createOnFoot } from './onfoot.js';
import { WALK, localsAround, carGap } from '../src/game/onfoot.js';
import { lookablesFor, pickLookable, compassWord } from '../src/game/lookables.js';
import { createThunder } from '../src/game/thunder.js';
import { createLightning3D } from './world3d/lightning3d.js';
import { createTips, TIP_CONTEXT, setTipsEnabled, resetTips } from '../src/game/tips.js';
import { createTipsView } from './hud/tips.js';
import { warningLights } from '../src/game/damage.js';

const READ_RANGE = 15; // you read a sign (and learn its names) this close, facing its front
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
// Tips (src/game/tips.js): ?tips=off turns them off for good, ?tips=reset
// forgets which were shown and turns them back on.
if (params.get('tips') === 'off') setTipsEnabled(false);
else if (params.get('tips') === 'reset') resetTips();
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
let planes = null; // light planes, in a region with an airfield
let lightning = null; // lightning flashes in heavy rain (round 12)
let thunder = null; // when and where they strike (src/game/thunder.js)
let wetness = null;
let ownWeather = null; // without the new look there is no weather clock of its own: keep one here
let groundAt = null;
let gpuSet = null; // GPU resources this region uploaded (src3/gpuTracker.js)
let loading = 0; // region loads queued or running (the main loop waits)
let loadChain = Promise.resolve();
let firstLoad = true;
let currentLs = null; // the load screen of the region being built

const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// Frees everything the current region put on the GPU (the car and the
// look's shared textures stay) and drops its objects for the GC.
function disposeRegion() {
  if (!scene) return 0;
  if (dh && dh.dispose) dh.dispose();
  if (lightning) lightning.dispose();
  scene.remove(car3d.object);
  const keep = collectKeep([car3d.object], look ? look.keepTextures() : []);
  const n = gpuSet ? disposeTracked(gpuSet, keep) : 0;
  scene.clear();
  renderer.renderLists.dispose();
  scene = scenery = collider = world3d = amb = amb3d = dh = rain3d = planes = lightning = thunder = null;
  gpuSet = null;
  return n;
}

// Builds region `id` behind a load screen. `title`: the mission's title.
// Dev URL flags that place the car (?spot, ?fallen) only act on the first load.
// Loads run one after another; the main loop waits until none is left.
// quiet: build behind the start screen with the load screen hidden (it is
// revealed if the player starts while it is still going).
function loadRegion(id, title, { quiet = false, mission = null } = {}) {
  loading++;
  const run = () => buildRegion(id, title, quiet, mission === null ? state.missionIndex : mission).finally(() => {
    loading--;
    last = performance.now();
  });
  loadChain = loadChain.then(run, run);
  return loadChain;
}

async function buildRegion(id, title, quiet = false, mission = 0) {
  const t0 = performance.now();
  const ls = showLoadScreen({ title, region: REGIONS[id] ? REGIONS[id].name : id, hidden: quiet && !started });
  currentLs = ls;
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
    // Things built once from the sun (trees, potholes, scatter) need this mission's sun now.
    if (look) look.presetSun(mission);
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
    collider.mission = currentMissionId(state);
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
    // Light planes flying circuits from the airfield (src/world/airfield.js).
    planes = createPlanes3D(scene, WORLD, world3d.terrain);
    // The tow truck that comes after a breakdown (src3/tow3d.js).
    tow.attach(scene, world3d);
    // Lightning in heavy rain; its thunder is played by the audio.
    lightning = createLightning3D(scene, { reducedMotion: reducedMotion() });
    thunder = createThunder((WORLD.seed || 1) ^ 0x7a11);
    foot.reset();
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
    currentLs = null;
    firstLoad = false;
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
// there, or you just drove over the county line from its approach leg):
// build that region and put the car at the mission's start.
let following = false;
async function followMission() {
  const m = currentMission(state);
  const want = missionRegion(state, m);
  if (!m || want === regionId || following) return;
  following = true;
  runtime.paused = true;
  try {
    const crossed = m.approach && state.leg !== 'approach';
    // Over the county line you keep the speed you crossed it at.
    const speed = crossed ? state.car.speed : 0;
    await loadRegion(want, crossed ? m.approach.crossing : m.title);
    const at = state.leg === 'approach' ? m.approach.start : m.start;
    Object.assign(state.car, at, { speed });
    state.missionStart = { ...at };
  } finally {
    following = false;
    runtime.paused = false;
  }
}

// ---------- UI wiring (see CONTRACT3.md) ----------

const ui = document.getElementById('ui');
const map = createMapOverlay(ui, { onClose: () => { runtime.paused = false; state.inputLocked = false; } });
const radio = createRadio();
const hud = createHUD(ui, { radio, openMap: () => { runtime.paused = true; state.inputLocked = true; foot.release(); map.open(); } });
// Breakdowns end in a tow to the nearest garage, not a lost mission.
// Dev: ?breakdown=1 breaks the car down at once.
const tow = createTow(ui, { audio, rig, params });
// Getting out of the car and walking; turning your head in the car (round 12).
const foot = createOnFoot({
  canvas: renderer.domElement, camera, rig,
  canLook: () => !menu && started && !runtime.paused && !state.inputLocked,
});
// Context tips (src/game/tips.js), drawn on a paper tag (src3/hud/tips.js).
const tips = createTips();
const tipsView = createTipsView(ui);
const tipCtx = { ...TIP_CONTEXT };
// When you last came on a shift (something the printed map has wrong).
const shiftTip = { n: 0, at: -Infinity };
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- input ----------

const keys = new Set();
const isTyping = (e) => {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};
const DRIVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
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
  } else if (e.code === 'KeyF' && plain) {
    toggleFoot();
  } else if (e.code === 'KeyC' && plain && !foot.active) {
    runtime.cameraMode = runtime.cameraMode === 'top' ? 'chase' : 'top';
  } else if (e.code === 'KeyN' && plain) {
    state.view.northUp = !state.view.northUp;
  } else if (e.code === 'KeyT' && plain && !menu) {
    radio.toggle();
  } else if (!menu && (e.code === 'Comma' || e.code === 'Period') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Radio volume: 10% a step. Held keys keep stepping. (It tunes itself.)
    radio.nudgeVolume(e.code === 'Comma' ? -0.1 : 0.1);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// F: out of the car (stopped or nearly) or back in (next to it).
const isClear = (x, y, r) => !!collider && collider.circleHit(x, y, r) === null;
function toggleFoot() {
  if (!collider || state.inputLocked || state.won || state.towing || (state.damage && state.damage.brokenDown)) return;
  if (foot.toggle(state.car, isClear)) {
    state.onFoot = foot.active;
    footTime = 0;
  }
}

function readInput() {
  if (foot.active) return { brake: true };
  if (state.inputLocked || state.won || state.towing || (state.damage && state.damage.brokenDown)) return { brake: true };
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp'),
    down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    brake: keys.has('Space'),
  };
}

// The nearest sign ahead of you within range, and which side of it you see.
// A sign's `facing` is the heading of the car meant to read it: you read the
// front when you face roughly that way, and see the blank back when you face
// the other way. Signs side-on or behind you are not shown. Signs with no
// facing can be read from anywhere.
const SIGN_FRONT = Math.cos(70 * Math.PI / 180);
function signInView(signs, v, range) {
  const hx = Math.sin(v.heading * Math.PI / 180);
  const hy = -Math.cos(v.heading * Math.PI / 180);
  let best = null;
  let bestD = range;
  for (const s of signs) {
    const dx = s.x - v.x;
    const dy = s.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > bestD) continue;
    let back = false;
    if (s.facing != null) {
      // Ahead of you (or right beside you, within a few metres).
      if (d > 4 && (dx * hx + dy * hy) / d < 0) continue;
      const fx = Math.sin(s.facing * Math.PI / 180);
      const fy = -Math.cos(s.facing * Math.PI / 180);
      const along = hx * fx + hy * fy;
      if (along >= SIGN_FRONT) back = false;
      else if (along <= -SIGN_FRONT) back = true;
      else continue;
    }
    bestD = d;
    best = { id: s.id, back };
  }
  return best;
}

// ---------- main loop ----------

const carPos = new THREE.Vector3();
const listener = { x: 0, y: 0, z: 0 };
const personPos = (id) => amb.personPos(id);
let last = performance.now();
let steer = 0;
const ground = { type: 'paved', rough: 0, plow: 0, plowAngle: 0, offRoad: false };
const fps = { frames: 0, acc: 0, value: 0 };
// On foot, the world sees you (not the car) as the player: ambient life,
// traffic, birds and the locals react to where you stand.
const viewer = { x: 0, y: 0, heading: 0, speed: 0 };
const footState = Object.create(state);
footState.car = viewer;
let footTime = 0; // seconds since you got out
let driveTime = 0; // seconds driven this mission
let lookFrame = 0;
let learnFrame = 0;
let lastSignRead = null;
let thunderForced = params.get('thunder') !== 'now';
const ear = { x: 0, y: 0, heading: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  if (loading > 0 || !scene) return;
  if (menu) {
    menuFrame(now);
    return;
  }
  // A finished mission handed over to one in another region: load it.
  const cm = currentMission(state);
  if (cm && missionRegion(state, cm) !== regionId && !state.won) {
    followMission();
    return;
  }
  stats.begin(now);
  collider.mission = currentMissionId(state);
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

    // Clocks: game clock runs at real speed (src/game/clock.js); trip timer stops on arrival.
    state.clockMinutes = (state.clockMinutes + dtMs * GAME_MIN_PER_MS) % 1440;
    if (!state.won) state.elapsedMs += dtMs;

    // On foot: walk (the car stays parked with the handbrake on).
    if (foot.active) {
      if (state.towing) foot.reset();
      foot.step(dt, keys, isClear, car);
      footTime += dt;
      if (foot.walker.stepped) audio.step(amb.surfaceAt(foot.walker.x, foot.walker.y), foot.walker.jogging);
    } else if (Math.abs(car.speed) > 1) driveTime += dt;
    state.onFoot = foot.active;
    state.lookYaw = foot.active ? foot.walker.yaw : null;
    viewer.x = foot.active ? foot.walker.x : car.x;
    viewer.y = foot.active ? foot.walker.y : car.y;
    viewer.heading = foot.active ? foot.walker.yaw : car.heading;
    viewer.speed = foot.active ? 0 : car.speed;

    // Ambient life moves after the car (dust, birds scatter, traffic stops).
    amb.update(dt, foot.active ? footState : state);
    dh.afterStep(dt, result, prev);
    // Traffic waits behind the parked car while you are out of it (r is
    // about its half width: traffic in the other lane drives past), and
    // honks at it in the end (player: true, see HONK in trafficRules.js).
    if (foot.active && amb.obstacles) amb.obstacles.push({ x: car.x, y: car.y, r: 1, player: true });
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
    // You talk on foot only: within 3 m, facing them (round 12).
    if (foot.active) {
      const around = localsAround(foot.walker, WORLD.locals, personPos, currentMissionId(state));
      state.nearLocalId = around.talk ? around.talk.id : null;
      state.nearLocalAny = around.near ? around.near.id : null;
      state.nearCar = carGap(car, foot.walker.x, foot.walker.y) <= WALK.carReach;
      // What you are looking at (a few times a second).
      if ((lookFrame++ & 3) === 0) updateLookAt();
    } else {
      state.nearLocalId = null;
      state.nearLocalAny = null;
      state.nearCar = false;
      state.lookAt = null;
    }
    const seen = signInView(WORLD.signs, viewer, READ_RANGE);
    state.nearSignId = seen && !seen.back ? seen.id : null;
    // Names you read on a sign, or are close to, can be asked about.
    if (state.nearSignId && state.nearSignId !== lastSignRead) {
      const sign = WORLD.signs.find((s) => s.id === state.nearSignId);
      if (sign) learnMentions(sign.lines.join('\n'), state, WORLD);
    }
    lastSignRead = state.nearSignId;
    if ((learnFrame++ & 7) === 0) learnNearby(state, viewer.x, viewer.y, WORLD);
    // A garage (or farm workshop) in reach, the car stopped and needing work.
    const shop = !state.won && !state.towing && (foot.active || Math.abs(car.speed) < 0.6)
      ? repairNear(WORLD, viewer.x, viewer.y, foot.active) : null;
    state.nearRepair = shop && needsRepair(state.damage) ? shop : null;

    // Driving over the county line on a mission's approach leg: the next
    // frame loads the mission's own region (followMission).
    const cmNow = currentMission(state);
    if (state.leg === 'approach' && !foot.active && cmNow && cmNow.approach && cmNow.approach.exit(car.x, car.y)) {
      state.leg = null;
    }
    // Waypoint snapshots and arrival at the current mission's goal (sets state.won),
    // by car or on foot.
    state.footPos = foot.active ? viewer : null;
    updateGame(state, dt);
  }

  car3d.update(car, runtime.paused ? 0 : dt, world3d.surfaceAt, foot.active ? 0 : steer, state.damage || null, ground.offRoad ? ground : null);
  // The tow scene: the truck, and the winch lifting the car's front.
  tow.update(dt, car3d.object);
  carPos.copy(car3d.object.position);
  // Camera rumble: dirt road bumps, or the ground's own small bumps off-road.
  const roadRumble = world3d.terrain.bumps.roughness(car.x, car.y) * Math.min(1, Math.abs(car.speed) / 20);
  const groundRumble = ground.offRoad ? ground.rough * 0.85 * Math.min(1, Math.abs(car.speed) / 14) : 0;
  rig.rumble(Math.max(roadRumble, groundRumble) * (runtime.paused || foot.active ? 0 : 1));
  let e = 0;
  if (foot.active) {
    foot.camera(dt, world3d.surfaceAt);
  } else {
    e = rig.update(carPos, car.heading, dt, runtime.cameraMode, groundAt, state.view.northUp);
    foot.glance(dt, e);
  }
  foot.blend(dt);
  // Where you hear from: your ears on foot, the driver's seat in the car.
  ear.x = foot.active ? foot.walker.x : car.x;
  ear.y = foot.active ? foot.walker.y : car.y;
  ear.heading = foot.active ? foot.walker.yaw : car.heading;
  // Planes by the game clock (seconds), so the same time shows the same sky.
  if (planes) {
    camera.updateMatrixWorld();
    listener.x = ear.x;
    listener.y = ear.y;
    listener.z = groundAt(ear.x, ear.y) + (foot.active ? WALK.eye : 1.2);
    planes.update(state.clockMinutes * 60, camera, scene.fog.color, wetness.rain, listener);
  }
  // Lightning in heavy rain, and its thunder 3 s per km later.
  if (!runtime.paused && thunder) {
    if (!thunderForced) {
      thunderForced = true;
      thunder.force((ear.heading + 25) % 360, 1.2);
    }
    for (const s of thunder.update(wetness.t * 6, wetness.rain)) {
      lightning.strike(s, ear);
      radio.crackle(s); // at once: radio waves come with the flash
      audio.thunder(s, ear);
    }
  }
  lightning.update(runtime.paused ? 0 : dt, camera, wetness.rain);
  // Sound every frame, even paused (it ducks while the map is open). The radio
  // gets real time, not the capped step: its clips play in real time, so below
  // 20 fps a capped clock fell behind and left silence after each clip.
  radio.update(Math.min(rawMs, 10000) / 1000, { region: regionId, x: ear.x, y: ear.y, paused: runtime.paused, inCar: !foot.active });
  audio.update(dt, state, amb, {
    paused: runtime.paused, rain: wetness, planes: planes ? planes.sound : null, tow: tow.sound,
    listener: ear, onFoot: foot.active,
  });

  // Fog and draw distance: driver's view is hazy; top view sees its patch
  // clearly. Rain closes it in.
  const wv = look ? (look.weather ?? 0.5) : ownWeather.update(state);
  if (!runtime.paused) wetness.update(state, wv);
  scene.fog.near = THREE.MathUtils.lerp(150, 260, e) * (1 - 0.45 * wetness.rain) * (look ? look.fogK.near : 1);
  scene.fog.far = THREE.MathUtils.lerp(420, 600, e) * (1 - 0.25 * wetness.rain) * (look ? look.fogK.far : 1);
  const far = scene.fog.far + 30;
  if (camera.far !== far) {
    camera.far = far;
    camera.updateProjectionMatrix();
  }
  if (look) look.update(state, wetness.rain, wetness.wet, lightning ? lightning.storm : 0); // weather drift, rain, storm
  world3d.puddles.update(wetness.puddle, wetness.rain, now / 1000, scene.fog.color);
  rain3d.update(runtime.paused ? 0 : dt, now / 1000, camera, wetness.rain, scene.fog.color);
  world3d.update(now / 1000, dt, foot.active ? viewer : car, rig.focus, rig.shadowRadius, camera, amb);
  amb3d.wet = wetness.wet;
  amb3d.update(amb, runtime.paused ? 0 : dt, camera, rig.focus, scene.fog, e, renderer, dh.hz.animals);
  dh.render(runtime.paused ? 0 : dt, rig.focus, car3d.object, camera, scene.fog, renderer);

  // The world is frozen behind the map overlay: keep the last shadow map.
  renderer.shadowMap.autoUpdate = !runtime.paused;
  renderer.render(scene, camera);
  hud.update(dt);
  // A conversation, the map, a card or help needs the mouse pointer back.
  if (foot.locked && (state.inputLocked || runtime.paused)) foot.release();
  updateTips(dt);
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

// On foot: the thing in the middle of your view that has a name (a tower,
// the mast, a windpump, an outcrop, a plane...), or null. state.lookAt =
// { topicId, d, dir } for the HUD (E: "What's that?").
const planeSpots = [];
function updateLookAt() {
  const w = foot.walker;
  const eye = { x: w.x, y: w.y, z: world3d.surfaceAt(w.x, w.y) + WALK.eye };
  planeSpots.length = 0;
  if (planes) {
    for (const p of planes.states) {
      if (!p || !p.visible || p.ground) continue;
      const ref = groundAt(planes.info.landmark.x, planes.info.landmark.y);
      planeSpots.push({ id: 'plane', topicId: 'planes', x: p.x, y: p.y, z: ref + p.alt, h: 3, r: 30 }); // generous: it moves
    }
  }
  const hit = pickLookable(lookablesFor(WORLD), eye, w.yaw, w.pitch, groundAt, planeSpots);
  state.lookAt = hit ? { topicId: hit.item.topicId, d: hit.d, dir: compassWord(hit.bearing) } : null;
}

// Tips: fill the context, let the engine pick, show it.
function updateTips(dt) {
  const car = state.car;
  const c = tipCtx;
  c.onFoot = foot.active;
  c.speed = Math.abs(car.speed);
  c.busy = runtime.paused || state.inputLocked || state.won || !!state.towing;
  c.canTalk = !!state.nearLocalId;
  c.locked = foot.locked;
  c.footTime = footTime;
  c.driveTime = driveTime;
  c.rain = wetness.rain;
  c.damaged = Object.values(warningLights(state.damage)).some((v) => v > 0);
  c.repairNear = !!state.nearRepair;
  c.namesShown = !!state.namesShown;
  c.talkedTo = state.talkedTo.size;
  c.sketchEmpty = !state.sketch.strokes.length && !state.sketch.stamps.length && !state.sketch.labels.length;
  const m = currentMission(state);
  c.planeClue = !!(planes && m && (m.goalTopic === 'kestrel_field' || state.knownTopics.has('planes')));
  c.planeD = Infinity;
  if (planes) {
    for (const p of planes.sound) if (p.engine) c.planeD = Math.min(c.planeD, Math.hypot(p.x - ear.x, p.y - ear.y, p.dz));
  }
  c.driveLocalD = Infinity;
  c.footLocalD = Infinity;
  if (amb) {
    const vx = foot.active ? foot.walker.x : car.x;
    const vy = foot.active ? foot.walker.y : car.y;
    const mid = currentMissionId(state);
    for (const l of WORLD.locals) {
      if (l.onlyMission && l.onlyMission !== mid) continue; // another mission's tourist is not here
      const p = amb.personPos(l.id) || l;
      const d = Math.hypot(p.x - vx, p.y - vy);
      if (foot.active) c.footLocalD = Math.min(c.footLocalD, d);
      else c.driveLocalD = Math.min(c.driveLocalD, d);
    }
  }
  c.carD = foot.active ? carGap(car, foot.walker.x, foot.walker.y) : Infinity;
  c.radioOn = radio.on && !foot.active;
  let sig = 0;
  for (const k in radio.signals) sig = Math.max(sig, radio.signals[k]);
  c.radioSignal = sig;
  const now = performance.now() / 1000;
  const nShifts = state.shiftsSeen ? state.shiftsSeen.size : 0;
  // A shift seen on the last stretch to the goal (Pike Lane runs right up to
  // Kestrel Field's gate) doesn't call the map wrong: you're about to arrive
  // (owner, 16 Nov). Nor does anything once you've arrived.
  const goal = currentGoal(state);
  const vx = foot.active ? foot.walker.x : car.x;
  const vy = foot.active ? foot.walker.y : car.y;
  const nearGoal = !!goal && Math.hypot(vx - goal.x, vy - goal.y) < goal.r + 250;
  if (nShifts > shiftTip.n && !nearGoal && !state.won) shiftTip.at = now;
  if (state.won) shiftTip.at = -Infinity;
  shiftTip.n = nShifts; // drops back to 0 when a mission starts
  c.shiftAge = now - shiftTip.at;
  tipsView.show(tips.update(c, now));
}

// ---------- start screen backdrop ----------
// While the start screen is up the world shows behind its windshield: set
// shots (MENU_SHOTS) where the region has them, else the camera stands above
// the mission's start and turns about 1 degree a second. No car, no sound, no clock (so no weather change);
// ambient life, the mast light and planes keep going. About 30 frames a
// second, drawn only into the windshield's rectangle. `still` (reduced
// motion, or a device too slow for it) draws a few frames and stops.
const MENU_UP = 13; // metres above the ground
const MENU_PITCH = -5 * (Math.PI / 180);
const MENU_TURN = Math.PI / 180; // radians a second
let menu = null;
const menuFocus = new THREE.Vector3();
const menuLook = new THREE.Vector3();

// Set shots for the start screen, per region (owner's picks): the camera
// circles slowly round a target, then cuts to the next. A region with none
// gets the old slow turn above the mission start. World metres; bearing is
// a compass bearing from the target out to the camera; `pan` turns the view
// left (degrees) so the target sits right of the sign; `storm` pours rain
// and throws lightning while it is on screen. ?menushot=<id> holds one (dev).
const MENU_SHOTS = {
  fenwick: [
    { id: 'church', at: [470, 2440], lookUp: 10, dist: 46, up: 2, bearing: 150, sweep: 14, secs: 15, fov: 40, pan: 24 },
    { id: 'mill', at: [1530, 1500], lookUp: 4, dist: 30, up: 1.8, bearing: 120, sweep: 10, secs: 15, fov: 40, pan: 24, storm: true },
  ],
};

// Points the camera for shot `sh` at t seconds into it; true if it applied.
function aimMenuShot(sh, t) {
  const b = (sh.bearing + sh.sweep * (t / sh.secs - 0.5)) * (Math.PI / 180);
  const [tx, ty] = sh.at;
  const cx = tx + Math.sin(b) * sh.dist;
  const cy = ty - Math.cos(b) * sh.dist;
  const gt = groundAt(tx, ty);
  camera.position.set(cx, Math.max(groundAt(cx, cy), gt) + sh.up, cy);
  // Toward the target, turned left by `pan`.
  const a = Math.atan2(tx - cx, -(ty - cy)) - (sh.pan || 0) * (Math.PI / 180);
  const d = sh.dist;
  menuLook.set(cx + Math.sin(a) * d, gt + sh.lookUp, cy - Math.cos(a) * d);
  camera.up.set(0, 1, 0);
  camera.lookAt(menuLook);
  menuFocus.set(tx, gt, ty);
}

// The storm shot: heavy rain, wet ground and a strike every few seconds,
// ahead of the camera. Put back as it was when the shot or the menu ends.
function menuWeather(on) {
  if (on && !menu.savedWet) {
    menu.savedWet = { rain: wetness.rain, wet: wetness.wet, puddle: wetness.puddle };
    wetness.rain = 1;
    wetness.wet = 1;
    wetness.puddle = 0.8;
    menu.nextStrike = 1.2;
  } else if (!on && menu.savedWet) {
    Object.assign(wetness, menu.savedWet);
    menu.savedWet = null;
  }
}

function menuFrame(now) {
  const rawMs = now - last;
  if (menu.done || rawMs < 30) return;
  last = now;
  const dt = Math.min(rawMs, 100) / 1000;
  const t0 = performance.now();
  if (!menu.still) menu.t += dt;
  const shots = MENU_SHOTS[regionId] || [];
  let shot = null;
  if (shots.length) {
    const pinned = shots.findIndex((sh) => sh.id === params.get('menushot'));
    if (pinned >= 0) menu.shot = pinned;
    shot = shots[menu.shot % shots.length];
    menu.shotT += menu.still ? 0 : dt;
    if (menu.shotT > shot.secs && pinned < 0) {
      menu.shot++;
      menu.shotT = 0;
      shot = shots[menu.shot % shots.length];
      menu.freshShadows = 3; // shadows for the new place
    }
    menuWeather(!!shot.storm);
    aimMenuShot(shot, menu.shotT);
  } else {
    const yaw = menu.yaw0 + menu.t * MENU_TURN;
    const { x, y } = menu.at;
    const gy = groundAt(x, y);
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    camera.position.set(x, gy + MENU_UP, y);
    menuLook.set(x + fx * 100, gy + MENU_UP + Math.tan(MENU_PITCH) * 100, y + fz * 100);
    camera.up.set(0, 1, 0);
    camera.lookAt(menuLook);
    menuFocus.set(x + fx * 45, gy, y + fz * 45);
  }
  // Draw only where the windshield is.
  const r = menu.rect ? menu.rect() : null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const vx = r ? r.x : 0;
  const vw = r ? Math.max(1, r.w) : W;
  const vh = r ? Math.max(1, r.h) : H;
  const vy = r ? H - r.y - vh : 0; // WebGL counts from the bottom
  const aspect = vw / vh;
  const fov = shot && shot.fov ? shot.fov : 55;
  if (camera.aspect !== aspect || camera.fov !== fov) {
    camera.aspect = aspect;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.far = 640;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  scene.fog.near = 220 * (1 - 0.45 * wetness.rain) * (look ? look.fogK.near : 1);
  scene.fog.far = 620 * (1 - 0.25 * wetness.rain) * (look ? look.fogK.far : 1);

  amb.update(dt, state);
  if (planes) planes.update(state.clockMinutes * 60 + menu.t, camera, scene.fog.color, wetness.rain, listener);
  // Lightning in the storm shot, a little to one side of the view.
  if (shot && shot.storm && !menu.still) {
    menu.nextStrike -= dt;
    if (menu.nextStrike <= 0) {
      menu.nextStrike = 4 + Math.random() * 4;
      const view = (Math.atan2(menuLook.x - camera.position.x, -(menuLook.z - camera.position.z)) * 180) / Math.PI;
      lightning.strike({ km: 1.2 + Math.random() * 1.8, bearing: view + (Math.random() - 0.5) * 50, power: 1.2, t: menu.t }, { x: camera.position.x, y: camera.position.z });
    }
  }
  if (lightning) lightning.update(dt, camera, wetness.rain);
  if (look) look.update(state, wetness.rain, wetness.wet, lightning ? lightning.storm : 0);
  if (rain3d) rain3d.update(dt, now / 1000, camera, wetness.rain, scene.fog.color);
  world3d.puddles.update(wetness.puddle, wetness.rain, now / 1000, scene.fog.color);
  world3d.update(now / 1000, dt, state.car, menuFocus, 110, camera, amb);
  amb3d.update(amb, dt, camera, menuFocus, scene.fog, 1, renderer, dh.hz.animals);
  // The sun never moves and the camera barely does: the shadow map needs
  // only an occasional refresh.
  renderer.shadowMap.autoUpdate = menu.frames < 3 || (menu.freshShadows || 0) > 0 || menu.frames % 20 === 0;
  if (menu.freshShadows > 0) menu.freshShadows--;
  renderer.setViewport(vx, vy, vw, vh);
  renderer.setScissor(vx, vy, vw, vh);
  renderer.setScissorTest(true);
  renderer.render(scene, camera);
  menu.frames++;
  // A device that takes too long per frame gets a still picture instead:
  // the time between drawn frames (it includes waiting on the GPU) or the
  // CPU time of one, smoothed.
  const cost = Math.max(performance.now() - t0, menu.frames > 1 ? rawMs - 33 : 0);
  menu.cost = menu.cost === undefined ? cost : menu.cost * 0.85 + cost * 0.15;
  if (menu.frames > 12 && menu.cost > 70 && !menu.still) {
    menu.still = true;
    console.info(`[menu] ${menu.cost.toFixed(0)} ms a frame: holding a still picture`);
  }
  if (menu.frames === 3 && menu.onReady) menu.onReady();
  if (menu.still && menu.frames >= 4) menu.done = true;
}

function exitMenu() {
  if (!menu) return;
  menuWeather(false);
  menu = null;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  camera.fov = 62;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.shadowMap.autoUpdate = true;
  car3d.object.visible = true;
  rig.first = true;
}

// The mission startGame(index) will really play (?spot can move it to
// another region's first mission).
function resolveIndex(index) {
  const spotName = params.get('spot');
  const sr = spotName ? spotRegion(spotName) : null;
  if (sr && MISSIONS[index].region !== sr) {
    const i = MISSIONS.findIndex((m) => m.region === sr);
    if (i >= 0) return i;
  }
  return index;
}

let looping = false;
function startLoop() {
  if (looping) return;
  looping = true;
  requestAnimationFrame(frame);
}

// Called by the start screen as soon as it shows: builds mission `index`'s
// region quietly, then (live) drifts the camera over it, drawn into
// rect() = { x, y, w, h } (CSS px, from the top left). onReady() runs once
// the first frames are on screen. live false: build only, draw nothing.
export async function preloadMenu(index = 0, { live = true, still = false, rect = null, onReady = null } = {}) {
  index = resolveIndex(index);
  const m = MISSIONS[index];
  // A mission with an approach leg starts in that leg's region.
  const region0 = m.approach ? m.approach.region : m.region;
  const start0 = m.approach ? m.approach.start : m.start;
  await loadRegion(region0, m.title, { quiet: true, mission: index });
  if (started || !live || regionId !== region0) return;
  // The weather follows this mission's timeline (startGame sets it properly).
  state.missionIndex = index;
  radio.setOn(false); // the start screen is quiet; startGame switches it back on
  menu = { at: { x: start0.x, y: start0.y }, yaw0: (start0.heading || 0) * (Math.PI / 180), t: 0, frames: 0, still, rect, onReady, shot: 0, shotT: 0, savedWet: null, nextStrike: 0 };
  car3d.object.visible = false;
  exposeDebug();
  startLoop();
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
  window.__planes = planes;
  window.__towScene = tow;
  window.__foot = foot;
  window.__collider = collider;
  window.__tips = tips;
  window.__lightning = lightning;
  window.__thunder = thunder;
  window.__radio = radio;
  // Dev: play a mission now, building its region if need be (memory checks):
  // await __playMission('m3_airfield').
  window.__playMission = playMission;
}

// Called by the start screen (src3/boot.js) with the mission to play:
// Continue (the first unfinished one) or any finished one to replay.
// Dev: ?spot=<name> starts the car at a review spot (src3/spots.js); a
// spot in another region plays that region's first mission instead.
// The region may already be built (preloadMenu): then this only places the
// car. If that build is still going, its load screen shows now.
let started = false;
export async function startGame(index = 0) {
  started = true;
  const t0 = performance.now();
  // The start screen made and resumed the AudioContext in its click.
  audio.wake();
  audio.ignition();
  radio.start();
  if (currentLs) currentLs.reveal();
  index = resolveIndex(index);
  const spotName = params.get('spot');
  jumpToMission(state, index);
  const m = MISSIONS[index];
  // A review spot in the mission's own region skips its approach leg (so does ?shifts=now).
  if (m.approach && ((spotName && spotRegion(spotName) === m.region) || params.get('shifts') === 'now')) {
    state.leg = null;
    Object.assign(state.car, m.start, { speed: 0 });
  }
  await loadChain;
  if (missionRegion(state, m) !== regionId) await loadRegion(missionRegion(state, m), m.title);
  // The radio is on when you set off, tuned to the home station of the county
  // you start in (the start screen keeps it quiet).
  const home = STATIONS.find((s) => s.id === (missionRegion(state, m) === 'brandt' ? 'brandt' : 'ashford'));
  if (home) radio.setStation(home.id);
  radio.setOn(true);
  exitMenu();
  foot.reset();
  state.onFoot = false;
  const spot = spotName ? spotFor(spotName, WORLD) : null;
  if (spot) {
    Object.assign(state.car, spot, { speed: 0 });
    state.missionStart = { x: spot.x, y: spot.y, heading: spot.heading };
  }
  // Dev: ?shifts=now opens the win screen with sample marks (src3/devShifts.js).
  if (params.get('shifts') === 'now') (await import('./devShifts.js')).fakeShiftRun(state);
  last = performance.now();
  startLoop();
  // The sharp sky downloads now and swaps in when it is here (SPEC 9n).
  if (look) look.sharpenSky();
  console.info(`[start] driving ${Math.round(performance.now() - t0)} ms after Start`);
}

// Plays mission `idOrIndex` from its own start (dev and checks).
async function playMission(idOrIndex) {
  const i = typeof idOrIndex === 'number' ? idOrIndex : MISSIONS.findIndex((m) => m.id === idOrIndex);
  if (i < 0) return;
  jumpToMission(state, i);
  const want = missionRegion(state, MISSIONS[i]);
  if (want !== regionId) await loadRegion(want, MISSIONS[i].title);
}
