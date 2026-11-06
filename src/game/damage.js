// Car damage, shared logic (no engine code). Four parts with health 0..1:
// tyres, engine, steering, compass. Knocks come from stepCar's `hit` (which
// side, how hard) and from the wheels rolling over surface events (potholes,
// branches, logs) found with collider.surfaceEventsAt.
//
// Use (three.js main loop):
//   resetDamage(state)                 // startMission does this: fresh car
//   const mods = damageMods(state.damage)
//   const result = stepCar(car, input, dt, collider, mods)
//   updateDamage(state, dt, result, collider, prevPose)
//   state.damage.events                // this frame: [{ type: 'crash'|'bump'|'stall'|'flat'|'breakdown', strength, ... }]
//   compassHeading(state)              // what the dash compass shows
//
// Feel rules (SPEC 9f): small low-speed bumps do nothing; speed matters a lot
// (damage grows faster than speed); a careful driver never breaks down; about
// 3 or 4 hard crashes, or lots of fast pothole hits, break the car.

import { DEG } from '../drive/geom.js';
import { WHEELS } from '../drive/collider.js';

// All the numbers in one place, for tuning (three.html?damage shows health).
export const TUNING = {
  // Crashes: impact speed is the part of the car's speed going into the thing hit.
  crashMin: 5, // m/s (18 km/h): softer knocks do nothing
  crashRef: 15, // m/s above crashMin where a hit costs crashScale
  crashScale: 0.26, // so 20 m/s (72 km/h) head-on costs 0.26 engine, 25 m/s about 0.40
  crashPow: 1.5,
  hardCrash: 0.08, // a crash costing more than this plays the crash sound loud and jolts the compass
  // Potholes, branches and logs: car speed over them.
  bumpMin: 7, // m/s (25 km/h): slower is free
  bumpRef: 14,
  bumpPow: 2, // speed matters a lot: 16 m/s costs 3x what 12 m/s does
  potholeScale: 0.04, // x pothole size (r / 0.75 m): 0.017 at dirt top speed, 0.066 at 90 km/h
  branchScale: 0.04,
  logScale: 0.08,
  // Curb: leaving a paved road onto grass fast.
  curbMin: 14, // m/s (50 km/h)
  curbScale: 0.04,
  // Shrubs (3D district scatter): each one you drive through keeps this much of your speed.
  shrubSlow: 0.95,
  // Too fast on rough ground (3D surface feel): above a surface's safe speed,
  // stones and ruts chip at the car. Chance of a knock per second:
  //   chance = rate[surface] * (over / safe + 0.05)^2,  over = speed - safe > 0
  // (safe x flatSafeMul on a flat tyre: riding a flat over stones shreds it)
  // Each knock costs `size` (x a random 0.6..1.4), mostly to the tyres.
  rough: {
    safe: { paved: Infinity, dirt: 16, grass: 9 }, // m/s (dirt 58, grass 32 km/h)
    // Off-road the ground's own roughness (src/world/roughness.js, 0..1) sets
    // the safe speed instead of safe.grass: from groundSafe[0] on smooth
    // ground to groundSafe[1] on the roughest, so mown hay is about 40 km/h,
    // an average pasture about 30 (rough 0.6, round 5) and rough scrub 20.
    groundSafe: [44 / 3.6, 20 / 3.6],
    rate: { paved: 0, dirt: 0.95, grass: 0.9 },
    offset: 0.05,
    flatSafeMul: 0.6, // on a flat tyre rough ground is safe only at 60% of the speed
    size: 0.025,
    split: { tyres: 0.7, steering: 0.2, engine: 0.1 }, // share of knocks per part
    partMul: { tyres: 1, steering: 0.8, engine: 0.5 }, // size for that part
    heavy: 1.15, // knocks over size x this are a heavier underbody thump
  },
  // Wet ground (round 8, 3D surface feel only; src/game/wetness.js says how
  // wet). Each surface's grip at full wetness, as multipliers on its dry
  // SURFACE_FEEL (src/drive/car.js): accel (how hard you can speed up),
  // brake (how hard you can stop: braking distance grows as 1 / brake),
  // turn (steering rate) and drag (rolling drag). Blended in by wetness
  // (wet^1.2, so a damp road is barely different from a dry one).
  wet: {
    paved: { accel: 0.96, brake: 0.82, turn: 0.97, drag: 1 },
    dirt: { accel: 0.84, brake: 0.66, turn: 0.92, drag: 1.15 },
    grass: { accel: 0.8, brake: 0.66, turn: 0.9, drag: 1.2 },
    // Mud (src/world/mud.js: Willow Bottoms, creek low ground), on top of
    // the above on dirt and off-road, scaled by how muddy (0..1) and how wet.
    mud: { accel: 0.75, brake: 0.8, turn: 0.88, drag: 1.45 },
    // Puddles (src3/world3d/puddles3d.js): each one you drive through keeps
    // this much of your speed (a big one a little less) and splashes.
    puddleSlow: 0.95,
    puddleBigSlow: 0.9, // a puddle of radius puddleBigR m or more
    puddleBigR: 3.5,
    puddleMinSpeed: 2.5, // m/s: slower than this just wades in quietly
  },
  // Effects.
  tyreWorn: 0.75, // below: a soft tyre, pulls a little
  tyreFlat: 0.45, // below: flat, flaps, pulls hard, slower
  engineWeak: 0.8, // below: less power
  engineSmoke: 0.65, // below: smokes (more as it drops)
  engineStall: 0.4, // below: stalls now and then
  steerBent: 0.8, // below: drifts off straight
  compassWobble: 0.75, // below: needle wobbles
  compassStick: 0.3, // below: needle sticks
};

export const PARTS = ['tyres', 'engine', 'steering', 'compass'];

export function freshDamage() {
  return {
    tyres: 1, engine: 1, steering: 1, compass: 1,
    flatSide: 1, // which side the worst tyre is on (-1 left, 1 right)
    driftSide: 1, // which way bent steering pulls
    brokenDown: false,
    cause: null, // 'engine' | 'tyres' | 'steering' once broken down
    stopT: 0, // seconds since the car came to rest after breaking down
    events: [],
    stall: 0, // seconds of stall left (no power)
    stallNext: 8,
    crashCool: 0,
    recent: new Map(), // surface event -> seconds since rolled over (one knock per item)
    jolt: 0, // compass swing from the last knock (degrees, decays)
    compassShown: null,
    compassT: 0,
    time: 0,
    lastSurface: null,
    hits: 0, // knocks that did damage (for the dev panel)
    // Dents for the car's look: [{ f, r, amount }] where (f, r) is the hit
    // direction in car space (forward, right) and amount the damage it did.
    dents: [],
    dentsV: 0, // bumped whenever dents change (so the model only rebuilds then)
    flatWheel: -1, // WHEELS index of the worst tyre (-1: front tyre on flatSide)
  };
}

export function resetDamage(state) {
  state.damage = freshDamage();
  return state.damage;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const curve = (s, min, ref, pow) => (s <= min ? 0 : ((s - min) / ref) ** pow);

// Drive modifiers for stepCar from the current damage.
export function damageMods(d, out = {}) {
  out.vmaxMul = 1;
  out.accelMul = 1;
  out.pull = 0;
  if (!d) return out;
  const T = TUNING;
  if (d.tyres < T.tyreFlat) {
    out.vmaxMul *= 0.72;
    out.pull += d.flatSide * 7;
  } else if (d.tyres < T.tyreWorn) {
    out.vmaxMul *= 0.93;
    out.pull += d.flatSide * 2.5 * ((T.tyreWorn - d.tyres) / (T.tyreWorn - T.tyreFlat));
  }
  if (d.engine < T.engineWeak) {
    out.accelMul *= 0.45 + 0.55 * (d.engine / T.engineWeak);
    if (d.engine < 0.5) out.vmaxMul *= 0.8 + 0.4 * d.engine;
  }
  if (d.steering < T.steerBent) out.pull += d.driftSide * (T.steerBent - d.steering) * 10;
  if (d.stall > 0 || d.brokenDown) out.accelMul = 0;
  return out;
}

// Grip in the wet (TUNING.wet) for stepCar's surface feel: fills and returns
// out = { accel, brake, turn, drag } multipliers for `surface` at wetness
// `wet` (0..1) with `mud` (0..1) under the car. All 1 when dry.
export function wetGrip(surface, wet, mud = 0, out = {}) {
  const T = TUNING.wet;
  const S = T[surface] || T.paved;
  const k = Math.max(0, Math.min(1, wet)) ** 1.2;
  const m = surface === 'paved' ? 0 : Math.max(0, Math.min(1, mud)) * k;
  for (const p of ['accel', 'brake', 'turn', 'drag']) {
    out[p] = (1 + (S[p] - 1) * k) * (1 + (T.mud[p] - 1) * m);
  }
  return out;
}

// How much the engine smokes, 0..1.
export function smokeLevel(d) {
  if (!d) return 0;
  if (d.brokenDown && d.cause === 'engine') return 1;
  return clamp01((TUNING.engineSmoke - d.engine) / TUNING.engineSmoke);
}

export function tyreFlat(d) {
  return !!d && d.tyres < TUNING.tyreFlat;
}

// Warning lights: 0 off, 1 on (worn / damaged), 2 bad (blinks).
export function warningLights(d) {
  const T = TUNING;
  if (!d) return { tyres: 0, engine: 0, steering: 0, compass: 0 };
  return {
    tyres: d.tyres < T.tyreFlat ? 2 : d.tyres < T.tyreWorn ? 1 : 0,
    engine: d.engine < T.engineStall ? 2 : d.engine < T.engineWeak ? 1 : 0,
    steering: d.steering < 0.4 ? 2 : d.steering < T.steerBent ? 1 : 0,
    compass: d.compass < T.compassStick ? 2 : d.compass < T.compassWobble ? 1 : 0,
  };
}

function hurt(d, part, amount) {
  if (amount <= 0) return;
  d[part] = clamp01(d[part] - amount);
}

// A crash: hit = stepCar's hit info.
function applyCrash(d, hit) {
  const T = TUNING;
  const a = T.crashScale * curve(hit.speed, T.crashMin, T.crashRef, T.crashPow);
  if (a <= 0) return 0;
  if (hit.dir === 'front') {
    hurt(d, 'engine', a);
    hurt(d, 'steering', a * 0.25);
    hurt(d, 'tyres', a * 0.15);
  } else if (hit.dir === 'side') {
    hurt(d, 'steering', a * 0.8);
    hurt(d, 'tyres', a * 0.35);
    hurt(d, 'engine', a * 0.1);
    d.flatSide = hit.side;
    d.driftSide = hit.side;
    d.flatWheel = (hit.side < 0 ? 0 : 1) + ((hit.f ?? 0) < -0.2 ? 2 : 0);
  } else {
    hurt(d, 'engine', a * 0.2);
    hurt(d, 'tyres', a * 0.2);
    hurt(d, 'steering', a * 0.15);
  }
  // Rocks are low and hard: they find the tyres.
  if (hit.kind === 'rock') hurt(d, 'tyres', a * 0.6);
  if (a > T.hardCrash * 0.6) hurt(d, 'compass', a * 0.6);
  addDent(d, hit, a);
  d.jolt += Math.min(60, a * 160) * (Math.random() < 0.5 ? -1 : 1);
  d.hits++;
  return a;
}

// Remember where the car was hit, for the dents on the 3D body. Hits close
// to an old dent deepen it instead of making a new one.
export function addDent(d, hit, a) {
  if (a < 0.01 || !d.dents) return;
  let f = hit.f;
  let r = hit.r;
  if (f === undefined) {
    f = hit.dir === 'front' ? 1 : hit.dir === 'rear' ? -1 : 0;
    r = hit.dir === 'side' ? hit.side : 0;
  }
  const len = Math.hypot(f, r) || 1;
  f /= len;
  r /= len;
  for (const o of d.dents) {
    if (o.f * f + o.r * r > 0.92) {
      o.amount += a;
      d.dentsV++;
      return;
    }
  }
  d.dents.push({ f, r, amount: a });
  if (d.dents.length > 8) d.dents.sort((x, y) => y.amount - x.amount).length = 8;
  d.dentsV++;
}

// Rolling over a pothole, branch or log at `speed` with wheel index `wheel`.
function applyBump(d, item, speed, wheel) {
  const T = TUNING;
  const k = curve(speed, T.bumpMin, T.bumpRef, T.bumpPow);
  let a;
  if (item.kind === 'pothole') a = T.potholeScale * (item.r / 0.75) * k;
  else if (item.kind === 'log') a = T.logScale * k;
  else a = T.branchScale * k;
  const side = WHEELS[wheel][0] < 0 ? -1 : 1;
  if (a > 0) {
    hurt(d, 'tyres', a);
    if (d.tyres < 0.8) {
      d.flatSide = side;
      d.flatWheel = wheel;
    }
    if (item.big || item.kind === 'log') hurt(d, 'steering', a * 0.5);
    if (a > 0.03) hurt(d, 'compass', a * 0.4);
    d.hits++;
  }
  d.jolt += Math.min(25, 4 + a * 200) * (side < 0 ? -1 : 1) * Math.min(1, speed / 10);
  return a;
}

const _seen = new Set();

// Safe speed (m/s) on `surface`; off-road (grass) with ground = { rough }
// from src/world/roughness.js it follows the ground's roughness.
export function roughSafe(surface, ground = null, d = null) {
  const R = TUNING.rough;
  let safe = R.safe[surface] ?? Infinity;
  if (surface === 'grass' && ground && Number.isFinite(ground.rough)) {
    const r = Math.max(0, Math.min(1, ground.rough));
    safe = R.groundSafe[0] + (R.groundSafe[1] - R.groundSafe[0]) * r;
  }
  return safe * (d && d.tyres < TUNING.tyreFlat ? R.flatSafeMul : 1);
}

// Chance per second of a rough-ground knock at `speed` on `surface`.
export function roughChance(surface, speed, d = null, ground = null) {
  const R = TUNING.rough;
  const safe = roughSafe(surface, ground, d);
  const over = speed - safe;
  if (!(over > 0)) return 0;
  return (R.rate[surface] || 0) * (over / safe + R.offset) ** 2;
}

function rough(d, surface, speed, dt, ground) {
  const R = TUNING.rough;
  const chance = roughChance(surface, speed, d, ground);
  const safe = roughSafe(surface, ground, d);
  d.rough = { surface: surface || '?', safe, chance, ground: ground ? ground.type : null, r: ground ? ground.rough : null };
  if (chance <= 0 || Math.random() >= 1 - Math.exp(-chance * dt)) return;
  let k = Math.random();
  let part = 'tyres';
  for (const [p, share] of Object.entries(R.split)) {
    if ((k -= share) <= 0) {
      part = p;
      break;
    }
  }
  const m = 0.6 + Math.random() * 0.8;
  const a = R.size * m * R.partMul[part];
  const before = d.tyres;
  hurt(d, part, a);
  if (part === 'tyres' && before >= 0.8 && d.tyres < 0.8) d.flatWheel = Math.floor(Math.random() * 4);
  d.jolt += (2 + 6 * m) * (Math.random() < 0.5 ? -1 : 1);
  d.hits++;
  d.events.push({
    type: 'rough', part, amount: a, heavy: m > R.heavy, strength: Math.min(1, speed / 25),
    pan: Math.random() * 1.6 - 0.8,
  });
}

// Call after stepCar each frame (not while paused). prev = { x, y, heading }
// where the car was before the step.
export function updateDamage(state, dt, result, collider, prev) {
  const d = state.damage || resetDamage(state);
  const car = state.car;
  const T = TUNING;
  d.events.length = 0;
  d.frame = (d.frame || 0) + 1; // lets listeners tell a new frame's events from old ones
  d.time += dt;
  d.crashCool = Math.max(0, d.crashCool - dt);
  const speed = Math.abs(car.speed);
  const wasBroken = d.brokenDown;
  const before = { tyres: d.tyres };

  if (!d.brokenDown) {
    // Crashes (one per short spell, so sliding along a wall is one knock).
    const hit = result && result.hit;
    if (hit && hit.speed > T.crashMin && d.crashCool <= 0) {
      const a = applyCrash(d, hit);
      d.crashCool = 0.4;
      d.events.push({ type: 'crash', strength: Math.min(1, a / 0.3), speed: hit.speed, dir: hit.dir, amount: a });
    }

    // Wheels over potholes, branches, logs: sweep from prev to now so a fast
    // car does not skip a small hole between frames.
    for (const [item, t] of d.recent) {
      if (t + dt > 1.2) d.recent.delete(item);
      else d.recent.set(item, t + dt);
    }
    if (prev && collider.surfaceEventsAt) {
      const dist = Math.hypot(car.x - prev.x, car.y - prev.y);
      const steps = Math.max(1, Math.ceil(dist / 0.4));
      _seen.clear();
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const x = prev.x + (car.x - prev.x) * f;
        const y = prev.y + (car.y - prev.y) * f;
        const h = car.heading * DEG;
        const fx = Math.sin(h);
        const fy = -Math.cos(h);
        for (let w = 0; w < WHEELS.length; w++) {
          const [rt, fw] = WHEELS[w];
          const wx = x + fx * fw - fy * rt;
          const wy = y + fy * fw + fx * rt;
          collider.surfaceEventsAt(wx, wy, (item) => {
            if (_seen.has(item) || d.recent.has(item)) return;
            _seen.add(item);
            d.recent.set(item, 0);
            // Shrubs (3D district scatter): drive-through, no damage; a small
            // slowdown, and a bump event for the swish and a little bounce.
            // Puddles (3D, in the wet): no damage; a splash and a small slowdown.
            if (item.kind === 'puddle') {
              const W = T.wet;
              if (speed > W.puddleMinSpeed) {
                car.speed *= item.r >= W.puddleBigR ? W.puddleBigSlow : W.puddleSlow;
                d.events.push({ type: 'bump', kind: 'puddle', strength: Math.min(1, speed / 18), amount: 0, id: item.id, x: wx, y: wy, r: item.r, wheel: w });
              }
              return;
            }
            if (item.kind === 'shrub') {
              if (speed > 1.5) {
                car.speed *= T.shrubSlow;
                d.events.push({ type: 'bump', kind: 'shrub', strength: Math.min(1, speed / 18), amount: 0, id: item.id });
              }
              return;
            }
            const a = applyBump(d, item, speed, w);
            // Branches and logs slow you a little; a big hole too.
            const slow = item.kind === 'log' ? 0.8 : item.kind === 'branch' ? 0.9 : item.big ? 0.93 : 0.97;
            if (speed > 3) car.speed *= slow;
            d.events.push({ type: 'bump', kind: item.kind, strength: Math.min(1, speed / 20), amount: a, id: item.id });
          });
        }
      }
    }

    // Too fast on rough ground (only with the 3D surface feel, result.feel).
    // result.ground (optional): { type, rough } of the ground under the car.
    if (result && result.feel) rough(d, result && result.surface, speed, dt, result.ground);

    // Curb: off a paved road onto grass, fast.
    const surface = result && result.surface;
    if (d.lastSurface === 'paved' && surface === 'grass' && speed > T.curbMin) {
      const a = T.curbScale * clamp01((speed - T.curbMin) / 11);
      hurt(d, 'tyres', a);
      d.jolt += 6;
      d.events.push({ type: 'bump', kind: 'curb', strength: Math.min(1, speed / 20), amount: a });
    }
    d.lastSurface = surface || d.lastSurface;

    // Stalls: a bad engine cuts out now and then for a moment.
    if (d.stall > 0) d.stall = Math.max(0, d.stall - dt);
    if (d.engine < T.engineStall && speed > 1) {
      d.stallNext -= dt;
      if (d.stallNext <= 0) {
        d.stall = 0.8 + Math.random() * 0.8;
        d.stallNext = 6 + Math.random() * (6 + 30 * d.engine);
        d.events.push({ type: 'stall', strength: 1 });
      }
    }

    if (before.tyres >= T.tyreFlat && d.tyres < T.tyreFlat) d.events.push({ type: 'flat', strength: 1 });

    // Broken down?
    const cause = d.engine <= 0 ? 'engine' : d.steering <= 0 ? 'steering' : d.tyres <= 0 ? 'tyres' : null;
    if (cause) {
      d.brokenDown = true;
      d.cause = cause;
      d.stopT = 0;
    }
  }
  if (d.brokenDown) {
    if (speed < 0.3) d.stopT += dt;
    if (!wasBroken) d.events.push({ type: 'breakdown', strength: 1, cause: d.cause });
  }

  updateCompass(d, car.heading, dt);
  return d;
}

// Smooth made-up noise (sum of sines), about -1..1.
const wobble = (t) => Math.sin(t * 1.3) * 0.55 + Math.sin(t * 3.7 + 1.1) * 0.3 + Math.sin(t * 0.47 + 2.3) * 0.25;

function angDiff(a, b) {
  let x = (b - a) % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function updateCompass(d, heading, dt) {
  const T = TUNING;
  d.jolt *= Math.exp(-dt * 2.2);
  if (Math.abs(d.jolt) < 0.05) d.jolt = 0;
  // A swinging needle: the jolt oscillates as it dies away.
  const swing = d.jolt * Math.cos(d.time * 9);
  if (d.compassShown === null) d.compassShown = heading;
  if (d.compass < T.compassStick) {
    // Sticks: holds a reading, then jumps most of the way to the truth.
    d.compassT -= dt;
    if (d.compassT <= 0) {
      d.compassT = d.compass <= 0.02 ? Infinity : 3 + Math.random() * 6;
      d.compassShown = (heading + angDiff(heading, d.compassShown) * 0.25 + (Math.random() - 0.5) * 30 + 360) % 360;
    }
    d.compassOut = (d.compassShown + swing * 0.3 + 360) % 360;
    return;
  }
  const amp = d.compass < T.compassWobble ? (T.compassWobble - d.compass) * 50 : 0;
  d.compassShown = heading;
  d.compassT = 0;
  d.compassOut = (heading + swing + amp * wobble(d.time) + 720) % 360;
}

// The heading the dash compass shows (wobbly or stuck when damaged).
export function compassHeading(state) {
  const d = state.damage;
  if (!d || d.compassOut === undefined) return state.car.heading;
  return d.compassOut;
}
