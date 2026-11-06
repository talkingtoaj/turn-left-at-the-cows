// Wires damage and road hazards into the three.js main loop, so main.js stays
// small. Shared logic lives in src/game/damage.js and src/ambient/hazards.js;
// drawing in src3/world3d/hazards3d.js.
//
// Per frame (not paused):
//   const prev = dh.beforeStep()                 // fills collider.dynamic / surfaceDynamic
//   const result = stepCar(car, input, dt, collider, dh.mods())
//   ... amb.update(dt, state) ...
//   dh.afterStep(dt, result, prev)               // damage, hazards, camera shake
// Every frame: dh.render(dt, focus, carObj, camera, fog, renderer)
//
// Dev URL flags: ?hazard=cows|sheep|tractor|truck|deer|branch|log (spawns one
// just ahead, again each time you press G), ?blocker=demo (a fallen tree on
// the road near the start), ?spot=x,y,heading (start there).
// Keys: B horn.

import { WORLD } from '../src/world/world.js';
import { state } from '../src/state.js';
import { CAR_CIRCLES, CAR_R } from '../src/drive/collider.js';
import { potholesFor } from '../src/world/potholes.js';
import { damageMods, updateDamage, smokeLevel, addDent } from '../src/game/damage.js';
import { currentMission } from '../src/game/missions.js';
import { createHazards, HAZARD_KINDS } from '../src/ambient/hazards.js';
import { createHazards3D } from './world3d/hazards3d.js';
import { DEG } from '../src/drive/geom.js';

const SOLID_R = 45; // hazards and traffic within this range are solid
const ANIMALS = new Set(['cow', 'sheep', 'deer']);

// The demo blocker: on the first road north of the start.
const DEMO_BLOCKER = { id: 'demo_tree', near: [WORLD.start.x, WORLD.start.y - 140] };

export function createDamageHazards({ scene, scenery, collider, amb, world3d, rig, sunDir, params }) {
  const potholes = potholesFor(WORLD);
  collider.addSurfaceEvents(potholes);
  const hz = createHazards(WORLD, scenery);
  const hz3d = createHazards3D(scene, { terrain: world3d.terrain, surfaceAt: world3d.surfaceAt, potholes, sunDir });
  const mods = {};
  const prev = { x: 0, y: 0, heading: 0 };
  const devHazard = params.get('hazard');
  const devBlocker = params.get('blocker');
  let pendingSpawn = devHazard && HAZARD_KINDS.includes(devHazard) ? devHazard : null;
  let seenRestarts = state.restarts || 0;
  let seenMission = -1;

  if (params.has('spot')) {
    const [x, y, h] = params.get('spot').split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      state.car.x = x;
      state.car.y = y;
      state.car.heading = Number.isFinite(h) ? h : state.car.heading;
      state.missionStart = { x, y, heading: state.car.heading };
    }
  }

  // Mission blockers (mission.blockers), plus the dev demo one.
  function applyBlockers() {
    const m = currentMission(state);
    const defs = [...((m && m.blockers) || [])];
    if (devBlocker === 'demo') defs.push(DEMO_BLOCKER);
    const list = hz.setBlockers(defs);
    amb.setRoadBlocks(list.map((b) => ({ roadId: b.roadId, at: b.at })));
  }

  // Horn: B. One honk per press; animals and slow vehicles ahead may react.
  let hornCool = 0;
  let honkNow = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyB' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    honkNow = true;
  });

  if (devHazard) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && !e.repeat) pendingSpawn = devHazard;
    });
  }

  const dh = {
    hz,
    group: hz3d.group,
    mods() {
      damageMods(state.damage, mods);
      mods.surfaceFeel = true; // surfaces change grip and drag, not top speed (car.js)
      return mods;
    },

    beforeStep() {
      const car = state.car;
      prev.x = car.x;
      prev.y = car.y;
      prev.heading = car.heading;
      // Solids near the car this frame: hazards and traffic.
      const dyn = collider.dynamic;
      dyn.length = 0;
      hz.pushSolids(car.x, car.y, SOLID_R, dyn);
      for (const c of amb.cars) {
        const dx = c.x - car.x;
        const dy = c.y - car.y;
        if (dx * dx + dy * dy > SOLID_R * SOLID_R) continue;
        const h = (c.heading || 0) * DEG;
        for (const off of CAR_CIRCLES) dyn.push({ x: c.x + Math.sin(h) * off, y: c.y - Math.cos(h) * off, r: CAR_R * 0.95, kind: 'car' });
      }
      collider.surfaceDynamic.length = 0;
      hz.pushSurface(car.x, car.y, SOLID_R, collider.surfaceDynamic);
      return prev;
    },

    afterStep(dt, result, p) {
      if (state.missionIndex !== seenMission) {
        seenMission = state.missionIndex;
        hz.reset();
        applyBlockers();
      }
      if ((state.restarts || 0) !== seenRestarts) {
        seenRestarts = state.restarts || 0;
        hz.reset();
      }
      const d = updateDamage(state, dt, result, collider, p);
      for (const e of d.events) {
        if (e.type === 'bump' && e.amount > 0) rig.shake(3 + 10 * e.strength);
        if (e.type === 'rough') rig.shake(e.heavy ? 5 : 2);
      }
      if (result.hit && ANIMALS.has(result.hit.kind)) hz.startle(state.car.x, state.car.y);
      hornCool = Math.max(0, hornCool - dt);
      if (honkNow && hornCool <= 0 && !state.inputLocked) {
        hornCool = 0.5;
        dh.honk();
      }
      honkNow = false;
      hz.update(dt, state, amb);
      for (const e of hz.events) amb.events.push(e);
      if (pendingSpawn && hz.spawn(pendingSpawn, { car: state.car, ahead: 45, force: true })) pendingSpawn = null;
    },

    // Dev helpers (window.__dh): put the car on a road `at` metres along it,
    // driving with (dir 1) or against (dir -1) the road's points, in the right lane.
    placeOnRoad(roadId, at, dir = 1) {
      const road = WORLD.roads.find((r) => r.id === roadId);
      if (!road) return false;
      const pts = road.points;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        if (acc + L >= at || i === pts.length - 2) {
          const t = Math.min(1, (at - acc) / L);
          const fx = ((bx - ax) / L) * dir;
          const fy = ((by - ay) / L) * dir;
          const off = road.width / 4;
          state.car.x = ax + (bx - ax) * t - fy * off;
          state.car.y = ay + (by - ay) * t + fx * off;
          state.car.heading = ((Math.atan2(fx, -fy) / DEG) + 360) % 360;
          state.car.speed = 0;
          return true;
        }
        acc += L;
      }
      return false;
    },
    // Sound the horn (also the B key).
    honk() {
      amb.events.push({ type: 'horn', x: state.car.x, y: state.car.y });
      hz.honk(state.car);
    },
    spawn(kind, ahead = 45) {
      return hz.spawn(kind, { car: state.car, ahead, force: true });
    },
    setDamage(part, v) {
      if (state.damage) state.damage[part] = v;
    },
    // Dev: dent the car as if hit from car-space direction (f forward, r right),
    // e.g. dent(1, 0) front, dent(0, -1) left side, dent(-1, 0.3) rear.
    dent(f, r, amount = 0.2) {
      if (state.damage) addDent(state.damage, { f, r }, amount);
    },

    render(dt, focus, carObj, camera, fog, renderer) {
      hz3d.update(hz, dt, focus, state.car, carObj, smokeLevel(state.damage), amb.wind, camera, fog, renderer);
    },
  };
  return dh;
}
