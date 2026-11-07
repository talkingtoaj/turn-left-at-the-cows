// Breakdowns end in a tow, not a lost mission (SPEC 9k). Engine-free: the
// 3D side (src3/tow3d.js) plays the tow truck scene and calls these.
//
//   const g = garageFor(WORLD, x, y)    where the car is taken: the nearest town
//   const driver = towDriverFor(WORLD)  who drives the truck in this region
//   const line = towLine(WORLD, state, g)   what they say (picked by seed)
//   const minutes = towMinutes(g.dist)  how long it all takes (game clock)
//   applyTow(state, g, minutes)         car at the garage, fixed, clock on,
//                                       state.tows + 1 (the mission keeps going)

import { freshDamage } from './damage.js';
import { nearestOnPolyline, headingOf, localToWorld, hashString } from '../drive/geom.js';
import { GAS } from '../drive/layout.js';

// Who drives the tow truck, per region. ids are voice ids (src/audio/voice.js).
export const TOW_DRIVERS = {
  fenwick: { id: 'tow_wade', name: 'Wade', role: 'tow truck' },
  brandt: { id: 'tow_junie', name: 'Junie', role: 'tow truck' },
};
const DEFAULT_DRIVER = TOW_DRIVERS.fenwick;

// Who fixes the car in each town. Earl (Ashford) and Lou (Brandt) are locals
// you can meet; the others are only named.
const MECHANICS = { ashford: 'Earl', millbrook: 'Nell', calder: 'Sid', brandt: 'Lou' };

// What the tow driver says. {mech}: who fixes the car, {town}: where it goes.
export const TOW_LINES = [
  'Third one this week. Must be the cows.',
  "{mech} at the garage'll have you fixed by supper.",
  "Don't fret. These roads have been eating cars since before I was born.",
  'Hop in. Radio only gets the one station, and it is mostly hog prices.',
  "You're not the first car to lose a fight with this county.",
  'Seen worse. Fella last spring drove into a pond. Said it looked like a road.',
  "Lucky I was passing. Well, I'm always passing. Only tow truck for forty miles.",
  'Sounds like she just needs a rest. And a new everything.',
  "Folks get lost round here all the time. Signs point wherever the wind left 'em.",
  "Sit tight. I'll have you in {town} before the coffee's cold.",
];

const CAUSE_TEXT = {
  engine: 'The engine coughs, rattles and dies.',
  tyres: 'The tyre is in shreds. You are going nowhere on that.',
  steering: 'Something in the steering snapped. The wheel just spins.',
};
export const causeText = (cause) => CAUSE_TEXT[cause] || CAUSE_TEXT.engine;

// "once", "twice", "3 times": for the win screen and the share postcard.
export function towedText(n) {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

export function towDriverFor(W) {
  return TOW_DRIVERS[W.regionId] || DEFAULT_DRIVER;
}

// Nearest point on any road: { x, y, d, dx, dy, road }.
export function nearestRoad(W, x, y) {
  let best = null;
  for (const r of W.roads) {
    const p = nearestOnPolyline(x, y, r.points);
    if (p && (!best || p.d < best.d)) best = { ...p, road: r };
  }
  return best;
}

// Where the car is taken in town `t`: in front of the pumps at the town's gas
// station when it has one (`garage: true`), else at the side of the road
// nearest the town centre. { x, y, heading, garage }.
function spotIn(W, t) {
  const gas = (W.buildings || []).find((b) => b.kind === 'gas' && Math.hypot(b.x - t.x, b.y - t.y) < (t.ambienceR || 200) + 80);
  if (gas) {
    // On the forecourt just in front of the canopy (clear of the pumps and
    // their pillars, so the chase camera has a free view), along the front.
    const p = localToWorld(gas.x, gas.y, gas.angle || 0, GAS.canopy.lx - 2, GAS.canopy.ly - GAS.canopy.h / 2 - 3);
    return { x: p.x, y: p.y, heading: ((gas.angle || 0) + 90) % 360, garage: true };
  }
  const n = nearestRoad(W, t.x, t.y);
  if (!n) return { x: t.x, y: t.y, heading: 0, garage: false };
  // Pull in at the right-hand edge of the road, facing along it.
  const side = Math.max(0, (n.road.width || 6) / 2 - 1.3);
  return { x: n.x - n.dy * side, y: n.y + n.dx * side, heading: headingOf(n.dx, n.dy), garage: false };
}

// The garage the car is towed to from (x, y): the nearest town (hamlets
// have no garage). { townId, town, mechanic, x, y, heading, garage, dist }.
export function garageFor(W, x, y) {
  const towns = (W.towns || []).filter((t) => t.kind !== 'hamlet');
  const list = towns.length ? towns : W.towns || [];
  let best = null;
  for (const t of list) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (!best || d < best.d) best = { t, d };
  }
  if (!best) return { townId: null, town: 'town', mechanic: 'the mechanic', x: W.start.x, y: W.start.y, heading: W.start.heading, garage: false, dist: 0 };
  const s = spotIn(W, best.t);
  return {
    townId: best.t.id,
    town: best.t.name,
    mechanic: MECHANICS[best.t.id] || 'the mechanic',
    ...s,
    dist: Math.hypot(s.x - x, s.y - y),
  };
}

// Game minutes the tow costs: half an hour, plus a little for a long tow,
// in 5 minute steps, never more than an hour.
export function towMinutes(distM) {
  const m = 30 + (distM / 1000) * 6;
  return Math.max(30, Math.min(60, Math.round(m / 5) * 5));
}

// The tow driver's line, picked by the region seed, the mission and how
// many tows so far (so a second tow says something new).
export function towLine(W, state, g) {
  const mission = state.missionIndex || 0;
  const h = hashString(`${W.seed || 1}:${mission}:${state.tows || 0}:${Math.round(state.car.x / 50)}`);
  const text = TOW_LINES[h % TOW_LINES.length];
  return text.replace('{mech}', g.mechanic).replace('{town}', g.town);
}

// The tow itself, while the screen is dark: the car is at the garage, fixed
// (one small dent stays, for flavour; the dust is washed off), the clock
// and the trip timer run on by `minutes`, the odometer stays (you did not
// drive it), and the mission goes on. Bumps state.tows, and state.restarts
// so the road hazards start afresh.
export function applyTow(state, g, minutes) {
  const old = state.damage;
  const car = state.car;
  car.x = g.x;
  car.y = g.y;
  car.heading = g.heading;
  car.speed = 0;
  state.clockMinutes = (state.clockMinutes + minutes) % 1440;
  state.elapsedMs += minutes * 6000; // the clock runs 10x real time
  state.tows = (state.tows || 0) + 1;
  state.restarts = (state.restarts || 0) + 1;
  const d = freshDamage();
  const dent = old && old.dents && old.dents.length ? old.dents.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
  if (dent) {
    d.dents.push({ f: dent.f, r: dent.r, amount: Math.min(0.03, dent.amount * 0.3) });
    d.dentsV = 1;
  }
  state.damage = d;
  return d;
}
