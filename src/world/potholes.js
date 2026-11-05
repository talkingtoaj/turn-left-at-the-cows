// Potholes: fixed in the world, made from the world seed so they are the same
// every run. Plain data, no engine code. Not part of buildWorld (this file is
// additive); call potholesFor(world) to get them (cached per world).
//
// Pothole: { id, x, y, r, depth, angle, roadId, kind: 'pothole', big }
//   r: radius in metres (0.45 .. 1.15); big: r >= BIG_R (also hurts steering)
//   angle: heading of the long axis (they are a little oval)
//
// Rules: dirt roads get many, quiet stretches of paved road a few, town
// streets and the middle of towns none. Never on or near bridges and fords,
// never right by the mission start, never in the first or last metres of a
// road (junction mouths).

import { makeRng, measurePolyline, pointAlong, distToPolyline } from '../drive/geom.js';

export const BIG_R = 0.95;

// Average metres of road between pothole clusters.
const SPACING = { dirt: 90, paved: 520 };
// Paved roads shorter than this are town streets: no potholes.
const MIN_PAVED_LEN = 1000;
const BRIDGE_CLEAR = 14; // metres past each end of a bridge deck
const START_CLEAR = 90;
const END_CLEAR = 18;

const cache = new WeakMap();

export function potholesFor(world) {
  let list = cache.get(world);
  if (!list) {
    list = generatePotholes(world);
    cache.set(world, list);
  }
  return list;
}

export function generatePotholes(world) {
  const rng = makeRng(((world.seed || 1) ^ 0x9071e5) >>> 0);
  const out = [];
  const towns = world.towns || [];
  const bridges = world.bridges || [];
  const start = world.start;
  let n = 0;

  for (const road of world.roads) {
    const type = road.type === 'paved' ? 'paved' : 'dirt';
    if (type === 'paved' && road.length < MIN_PAVED_LEN) continue;
    const pts = road.points;
    const cum = measurePolyline(pts);
    const len = cum[cum.length - 1];
    const spacing = SPACING[type];
    let s = END_CLEAR + rng() * spacing;
    while (s < len - END_CLEAR) {
      const p = pointAlong(pts, cum, s);
      if (spotOk(p.x, p.y, road, type, towns, bridges, start)) {
        // A cluster: 1 to 3 holes within a few metres of each other.
        const count = type === 'dirt' ? 1 + Math.floor(rng() * rng() * 3.2) : 1;
        let along = s;
        for (let k = 0; k < count; k++) {
          const q = pointAlong(pts, cum, along);
          // Unit along the road at q.
          const a = pointAlong(pts, cum, Math.min(len, along + 1));
          let ux = a.x - q.x;
          let uy = a.y - q.y;
          const ul = Math.hypot(ux, uy) || 1;
          ux /= ul;
          uy /= ul;
          const r = 0.45 + rng() * rng() * 0.7 + (type === 'dirt' ? 0.05 : 0);
          // Mostly in the wheel tracks (about 1 m either side of each lane's middle).
          const half = road.width / 2 - r - 0.2;
          const track = (rng() < 0.5 ? -1 : 1) * road.width * 0.25 + (rng() < 0.5 ? -0.85 : 0.85);
          const lat = Math.max(-half, Math.min(half, track + (rng() - 0.5) * 0.8));
          const x = q.x - uy * lat;
          const y = q.y + ux * lat;
          if (spotOk(x, y, road, type, towns, bridges, start)) {
            out.push({
              id: `ph${n++}`, x, y, r, depth: 0.5 + rng() * 0.5, angle: (Math.atan2(ux, -uy) * 180) / Math.PI + (rng() - 0.5) * 50,
              roadId: road.id, kind: 'pothole', big: r >= BIG_R, roadType: type,
            });
          }
          along += 2.5 + rng() * 5;
        }
      }
      s += spacing * (0.4 + rng() * 1.2);
    }
  }
  return out;
}

function spotOk(x, y, road, type, towns, bridges, start) {
  if (start && Math.hypot(x - start.x, y - start.y) < START_CLEAR) return false;
  for (const t of towns) {
    const r = type === 'paved' ? t.ambienceR * 1.1 : t.ambienceR * 0.5;
    if (Math.hypot(x - t.x, y - t.y) < r) return false;
  }
  for (const b of bridges) {
    const reach = (b.length || 20) / 2 + BRIDGE_CLEAR;
    if (Math.hypot(x - b.x, y - b.y) < reach) return false;
  }
  return true;
}

// Distance helper for checks: how far a pothole is from its road's centre line.
export function potholeOffset(world, p) {
  const road = world.roads.find((r) => r.id === p.roadId);
  return road ? distToPolyline(p.x, p.y, road.points) : Infinity;
}
