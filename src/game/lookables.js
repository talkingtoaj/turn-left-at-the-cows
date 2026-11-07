// Things you can see from far off and ask about (round 12). Engine-free.
// On foot, the thing you are looking at (an angle test from your eyes, with
// a line-of-sight check over the ground) can be asked about: "What's that?"
// (src3/hud/talk.js). Only things that have a topic (src/world/topics.js)
// count: towers, the mast, elevators, windpumps, outcrops, churches, the
// mill, the airfield, farmhouses with a name, and the planes in the sky.
//
//   const L = lookablesFor(WORLD)            // [{ id, topicId, x, y, h, r }]
//   pickLookable(L, eye, yaw, pitch, groundAt, extra) -> { item, d, bearing } | null
//     eye = { x, y, z } (z: metres up), yaw/pitch in degrees (see onfoot.js),
//     groundAt(x, y) -> ground height, extra: more items (planes) this frame.

import { TOPICS } from '../world/topics.js';

export const LOOK = {
  maxD: 600, // metres: things further off are too small to point at
  minTol: 2.5, // degrees: the least slack around a thing's centre
  maxTol: 14, // degrees: the most (a big thing close up)
};

// How tall each kind of landmark stands (metres), to aim at its middle.
const HEIGHT = {
  church: 18, water_tower: 24, mill_ruin: 7, radio_mast: 55, grain_silos: 22, lookout_tower: 18,
  covered_bridge: 6, quarry: 8, campground: 4, farm_ruin: 6, rusty_truck: 2, railway: 3,
  grain_elevator: 28, windpump: 11, airfield: 3,
};

const cache = new WeakMap();

// Every lookable thing in a world: one per topic whose ref has a place in it.
export function lookablesFor(W) {
  if (cache.has(W)) return cache.get(W);
  const out = [];
  const find = (list, id) => (list || []).find((q) => q.id === id) || null;
  for (const t of TOPICS) {
    const ref = t.ref || {};
    let item = null;
    if (ref.type === 'landmark') {
      const l = find(W.landmarks, ref.id);
      if (l) item = { x: l.x, y: l.y, h: HEIGHT[l.kind] ?? 8, r: Math.min(150, l.r || (l.clearR ? l.clearR * 0.5 : 4)) };
    } else if (ref.type === 'outcrop') {
      const o = find(W.outcrops, ref.id);
      if (o) item = { x: o.x, y: o.y, h: 4, r: 14 };
    } else if (ref.type === 'building') {
      const b = find(W.buildings, ref.id);
      if (b) item = { x: b.x, y: b.y, h: 7, r: Math.max(b.w, b.h) / 2 };
    } else if (ref.type === 'place') {
      const p = find(W.places, ref.id);
      if (p && t.kind !== 'business') item = { x: p.x, y: p.y, h: 6, r: Math.min(60, p.r || 20) };
    } else if (ref.type === 'bridge') {
      const b = find(W.bridges, ref.id);
      if (b) item = { x: b.x, y: b.y, h: 2, r: 6 };
    }
    if (item) out.push({ id: `${ref.type}:${ref.id}:${t.id}`, topicId: t.id, ...item });
  }
  // Two topics on one thing (Kestrel Field, the windsock, the wind): keep the first.
  const seen = new Set();
  const list = out.filter((o) => {
    const k = `${Math.round(o.x)},${Math.round(o.y)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  cache.set(W, list);
  return list;
}

const DEG = Math.PI / 180;

// Compass words for a bearing (degrees).
export function compassWord(b) {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[Math.round((((b % 360) + 360) % 360) / 45) % 8];
}

// True if the ground hides (tx, ty, tz) from the eye.
function hidden(eye, tx, ty, tz, groundAt) {
  const n = 14;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    if (u > 0.92) break; // the thing's own foot
    const x = eye.x + (tx - eye.x) * u;
    const y = eye.y + (ty - eye.y) * u;
    const z = eye.z + (tz - eye.z) * u;
    if (groundAt(x, y) > z + 0.3) return true;
  }
  return false;
}

// The thing nearest the middle of your view, or null.
export function pickLookable(list, eye, yaw, pitch, groundAt, extra = null) {
  const cy = Math.cos(pitch * DEG);
  const vx = Math.sin(yaw * DEG) * cy;
  const vy = -Math.cos(yaw * DEG) * cy;
  const vz = Math.sin(pitch * DEG);
  let best = null;
  const consider = (o, maxD) => {
    const dx = o.x - eye.x;
    const dy = o.y - eye.y;
    const flat = Math.hypot(dx, dy);
    if (flat > maxD || flat < 2) return;
    const tz = o.z ?? groundAt(o.x, o.y) + o.h * 0.55;
    const dz = tz - eye.z;
    const d = Math.hypot(flat, dz);
    const cos = (dx * vx + dy * vy + dz * vz) / d;
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
    const size = Math.max(o.h * 0.5, o.r);
    const tol = Math.max(LOOK.minTol, Math.min(LOOK.maxTol, Math.atan(size / d) / DEG + 1.5));
    if (ang > tol) return;
    const score = ang / tol;
    if (best && score >= best.score) return;
    if (o.z === undefined && hidden(eye, o.x, o.y, tz, groundAt)) return;
    best = { item: o, d: flat, bearing: ((Math.atan2(dx, -dy) / DEG) + 360) % 360, score };
  };
  for (const o of list) consider(o, LOOK.maxD);
  for (const o of extra || []) consider(o, 4000);
  return best;
}
