// Add-on kits and dirt for traffic cars (#42, #43, SPEC 9q tier 2).
//
// Each traffic car gets a kit that fits its type: roof racks with a load,
// jerry cans or a spare wheel on wagons, toolboxes, ladders and bull bars on
// pickups, hay and a spare on the farm truck, mud flaps, rust on older cars,
// now and then a door from another car. The kit is seeded per car id, so a
// car keeps it, and no two cars of a type get the same one.
//
// Dirt sits on the lower body: every car starts at its own base (farm trucks
// dirtiest), it builds while the car drives a dirt road and slowly fades
// back to the base on paved roads.
//
//   const kit = carKit('car5')   // { type, mask, parts, rust, door, dirtBase }
//   dirt = dirtStep(dirt, kit.dirtBase, c.onDirt, c.speed, dt)
//
// Pure: no three.js here (the 3D side is src3/world3d/trafficKit.js).

import { carPaint } from './carpaint.js';

export const TRAFFIC_TYPES = ['sedan', 'wagon', 'pickup', 'hatch', 'farmtruck'];
// Types for the ten traffic cars (car0..car9), mixed so each shows up.
const TYPE_OF = ['sedan', 'wagon', 'pickup', 'hatch', 'sedan', 'farmtruck', 'wagon', 'hatch', 'pickup', 'sedan'];
const numOf = (id) => Number(String(id).replace(/\D/g, '')) || 0;
export function trafficType(id) {
  return TYPE_OF[numOf(id) % TYPE_OF.length];
}

// Kit parts, each one bit of the mask. 'door' is drawn by the shader (a
// door in another color), the rest are pieces of geometry (trafficKit.js).
export const KIT_PARTS = ['rack', 'rackLoad', 'rackCans', 'roofSpare', 'bullbar', 'flaps', 'ladder', 'toolbox', 'bedSpare', 'bedCans', 'hay', 'hay2', 'hay3', 'rearSpare', 'door'];
export const KIT_BIT = Object.fromEntries(KIT_PARTS.map((p, i) => [p, i]));
// A part that only goes on when another one is there.
export const KIT_NEEDS = { rackLoad: 'rack', rackCans: 'rack', roofSpare: 'rack', hay2: 'hay', hay3: 'hay2' };
// Which parts fit each type, and how often (given what it needs).
export const KIT_FITS = {
  sedan: { rack: 0.3, rackLoad: 0.6, flaps: 0.35, door: 0.2 },
  hatch: { rack: 0.35, rackLoad: 0.6, flaps: 0.3, door: 0.25 },
  wagon: { rack: 0.6, rackLoad: 0.5, rackCans: 0.4, roofSpare: 0.35, bullbar: 0.3, rearSpare: 0.3, flaps: 0.4, door: 0.15 },
  pickup: { bullbar: 0.4, flaps: 0.5, ladder: 0.35, toolbox: 0.45, bedSpare: 0.3, bedCans: 0.35, hay: 0.4, door: 0.15 },
  farmtruck: { hay: 1, hay2: 0.6, hay3: 0.45, rearSpare: 0.5, bedCans: 0.45, bullbar: 0.3, flaps: 0.4, door: 0.2 },
};
// The slow farm trucks in hazards3d.js have no id: two bales.
export const DEFAULT_KIT = { farmtruck: (1 << KIT_BIT.hay) | (1 << KIT_BIT.hay2) };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One seeded try at a kit for a type: each fitting part by its odds.
function rollMask(type, r) {
  let mask = 0;
  for (const [p, odds] of Object.entries(KIT_FITS[type])) {
    const need = KIT_NEEDS[p];
    if (need && !(mask & (1 << KIT_BIT[need]))) continue;
    if (r() < odds) mask |= 1 << KIT_BIT[p];
  }
  return mask;
}

// The ids of a type in order (car numbers with that type), and the masks
// already given out, so a later car of the type never repeats one.
const taken = new Map(); // type -> [mask of ordinal 0, 1, ...]
function maskFor(type, ordinal) {
  if (!taken.has(type)) taken.set(type, []);
  const list = taken.get(type);
  while (list.length <= ordinal) {
    const k = list.length;
    const n = idNumber(type, k);
    const r = rng(hashStr(`kit:car${n}`));
    let mask = rollMask(type, r);
    // Re-roll a repeat; after a while take the next unused combination.
    for (let tries = 0; list.includes(mask) && tries < 40; tries++) mask = rollMask(type, r);
    for (let bump = 0; list.includes(mask) && bump < 1 << KIT_PARTS.length; bump++) mask = valid(type, mask + 1);
    list.push(mask);
  }
  return list[ordinal];
}
// The next mask at or after m that only uses parts that fit and have what they need.
function valid(type, m) {
  const fits = KIT_FITS[type];
  for (;; m++) {
    let okm = true;
    for (let b = 0; b < KIT_PARTS.length && okm; b++) {
      if (!(m & (1 << b))) continue;
      const p = KIT_PARTS[b];
      if (!(p in fits)) okm = false;
      else if (KIT_NEEDS[p] && !(m & (1 << KIT_BIT[KIT_NEEDS[p]]))) okm = false;
    }
    if (okm) return m;
  }
}
// The car number of the k-th car of a type.
function idNumber(type, k) {
  const slots = TYPE_OF.map((t, i) => (t === type ? i : -1)).filter((i) => i >= 0);
  return Math.floor(k / slots.length) * TYPE_OF.length + slots[k % slots.length];
}
function ordinalOf(id) {
  const n = numOf(id);
  const type = trafficType(id);
  const slots = TYPE_OF.map((t, i) => (t === type ? i : -1)).filter((i) => i >= 0);
  return Math.floor(n / TYPE_OF.length) * slots.length + slots.indexOf(n % TYPE_OF.length);
}

// A door in another color: primer gray, or a car's color from the yard.
const PRIMER = 0x7e807b;
function doorColor(id, body, r) {
  if (r() < 0.35) return PRIMER;
  for (let k = 0; k < 8; k++) {
    const c = carPaint(`${id}:door${k}`).color;
    const d = Math.abs(((c >> 16) & 255) - ((body >> 16) & 255)) + Math.abs(((c >> 8) & 255) - ((body >> 8) & 255)) + Math.abs((c & 255) - (body & 255));
    if (d > 150) return c;
  }
  return PRIMER;
}

export function carKit(id) {
  const type = trafficType(id);
  const mask = maskFor(type, ordinalOf(id));
  const r = rng(hashStr(`wear:${id}`));
  const paint = carPaint(id);
  // Rust: older cars, farm trucks most, pickups next.
  const rustBias = type === 'farmtruck' ? 0.45 : type === 'pickup' ? 0.1 : 0;
  let rust = Math.max(0, Math.min(1, (paint.age - 0.55) * 1.6 + rustBias + (r() - 0.5) * 0.3));
  if (type === 'farmtruck') rust = Math.max(rust, 0.45 + 0.3 * r()); // every farm truck has rust
  // Dirt they carry even on paved roads.
  const [lo, hi] = type === 'farmtruck' ? [0.4, 0.65] : type === 'pickup' ? [0.12, 0.38] : [0, 0.18];
  const dirtBase = lo + (hi - lo) * r();
  const door = mask & (1 << KIT_BIT.door) ? doorColor(id, paint.color, r) : null;
  return { type, mask, parts: KIT_PARTS.filter((p, b) => mask & (1 << b)), rust, door, dirtBase };
}

// Dirt per tick: builds on dirt roads (toward DIRT_MAX, faster at speed),
// fades slowly back to the car's base on paved roads.
export const DIRT_MAX = 0.85;
export const DIRT_UP = 1 / 90; // per second, at speed, on dirt
export const DIRT_DOWN = 1 / 400; // per second, on paved
export function dirtStep(d, base, onDirt, speed, dt) {
  if (onDirt && Math.abs(speed) > 2) return Math.min(DIRT_MAX, d + (DIRT_MAX - d) * DIRT_UP * dt * Math.min(1.5, Math.abs(speed) / 8));
  if (onDirt) return d;
  return Math.max(base, d - DIRT_DOWN * dt);
}
