// Fixed fallen trees, shared logic (no engine code).
//
// A handful of real roadside trees (from generateScenery) have blown down:
// the tree is taken out of the standing trees and lies with its root plate
// where it grew, the trunk part way across the road. There is always a
// car-width gap past the trunk (on the road, through the leafy top, or over
// the verge), so a fallen tree never changes a mission's route. Proved by
// npm run check:fallen (tools/check-fallen.mjs).
//
// Only trees that could really have fallen there are picked: at a forest
// edge, in a windbreak or in a roadside tree line; never near a bridge,
// creek or lake, a town, the start, a mission goal or a junction.
//
//   pickFallenTrees(world, trees) -> [{ id, tree, roadId, at, x, y, heading,
//     h, solidLen, roadW, side, gapLat, kind, r, tint }]
//   fallenShape(f) -> { solids: [{ x, y, r, kind: 'tree' }],
//     crown: [{ x, y, r, kind: 'branch' }], extent }
//
// (x, y) is the tree's base (the root plate), `heading` the direction it fell
// (degrees, 0 north, clockwise), `h` its height. The solid trunk runs from the
// base to `solidLen`; past that only the thin top and the crown (not solid,
// they slow the car and knock it like a branch). `side` is +1 when the base is
// to the right of the road's own direction; `gapLat` is the lateral offset
// (metres, right of the road's direction) of the middle of the gap left.

import {
  makeRng, DEG, nearestOnPolyline, distToPolyline, pointInPolygon, distToPolygonEdge, bbox, headingOf,
  measurePolyline, pointAlong,
} from '../drive/geom.js';

export const FALLEN = {
  count: 6, // how many to place
  minSpacing: 550, // metres between any two
  perRoad: 2,
  baseD: [11, 21], // base distance from the road centreline
  gapOnRoad: [2.9, 3.4], // m of road surface left clear on the far side
  tilt: [12, 30], // degrees off square to the road
  height: [12, 26], // a tree taller or shorter than this is not used
  solidFrac: 0.82, // the trunk is solid this far up; above it, the top
  clear: {
    start: 320, place: 220, bridge: 80, water: 14, town: 1.0, landmark: 45, sign: 20, local: 30, junction: 35,
  },
};

const STREETS = new Set(['ashford_st', 'millbrook_st', 'calder_st']);

export function pickFallenTrees(world, trees, opts = {}) {
  const C = { ...FALLEN, ...opts };
  const rng = makeRng(((world.seed || 1) ^ 0x5eed7) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const forests = (world.forests || []).map((f) => ({ f, bb: bbox(f.polygon) }));
  const lakes = (world.lakes || []).map((l) => ({ l, bb: bbox(l.polygon) }));
  const roads = world.roads.map((r) => ({ r, cum: measurePolyline(r.points) }));
  const K = C.clear;

  const nearForest = (x, y, reach) => forests.some(({ f, bb }) => x > bb.minX - reach && x < bb.maxX + reach && y > bb.minY - reach && y < bb.maxY + reach
    && (pointInPolygon(x, y, f.polygon) || distToPolygonEdge(x, y, f.polygon) < reach));
  const nearWater = (x, y, reach) => (world.creeks || []).some((c) => distToPolyline(x, y, c.points) < c.width / 2 + reach)
    || lakes.some(({ l, bb }) => x > bb.minX - reach && x < bb.maxX + reach && y > bb.minY - reach && y < bb.maxY + reach
      && (pointInPolygon(x, y, l.polygon) || distToPolygonEdge(x, y, l.polygon) < reach));
  const near = (list, x, y, r) => (list || []).some((p) => Math.hypot(p.x - x, p.y - y) < (typeof r === 'function' ? r(p) : r));

  // Trees on a coarse grid, for the tree-line count.
  const grid = new Map();
  const gk = (x, y) => Math.floor(x / 25) * 100003 + Math.floor(y / 25);
  for (const t of trees) {
    const k = gk(t.x, t.y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  const neighbours = (t, r) => {
    let n = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const o of grid.get(gk(t.x + i * 25, t.y + j * 25)) || []) if (o !== t && Math.hypot(o.x - t.x, o.y - t.y) < r) n++;
      }
    }
    return n;
  };

  const cands = [];
  for (const t of trees) {
    if (t.kind !== 'oak' && t.kind !== 'pine') continue;
    // Nearest road.
    let best = null;
    for (const rr of roads) {
      const q = nearestOnPolyline(t.x, t.y, rr.r.points);
      if (!best || q.d < best.q.d) best = { rr, q };
    }
    if (!best) continue;
    const { rr, q } = best;
    const road = rr.r;
    const L = rr.cum[rr.cum.length - 1];
    if (STREETS.has(road.id) || q.d < C.baseD[0] || q.d > C.baseD[1]) continue;
    if (q.along < 60 || q.along > L - 60) continue;
    // Any other road close by (a junction, or a parallel road the top could land on).
    if (roads.some((o) => o !== rr && distToPolyline(t.x, t.y, o.r.points) < K.junction + q.d)) continue;
    // Road fairly straight here, so the tree is seen in time.
    const a = pointAlong(road.points, rr.cum, q.along - 30);
    const b = pointAlong(road.points, rr.cum, q.along + 30);
    if (a.dx * b.dx + a.dy * b.dy < Math.cos(22 * DEG)) continue;
    // Places it must keep away from.
    if (Math.hypot(t.x - world.start.x, t.y - world.start.y) < K.start) continue;
    if (near(world.places, t.x, t.y, K.place)) continue;
    if (near(world.bridges, t.x, t.y, (b2) => K.bridge + (b2.length || 30) / 2)) continue;
    if (near(world.towns, t.x, t.y, (tw) => tw.ambienceR * K.town)) continue;
    if (near(world.landmarks, t.x, t.y, K.landmark) || near(world.signs, t.x, t.y, K.sign) || near(world.locals, t.x, t.y, K.local)) continue;
    if (nearWater(t.x, t.y, K.water) || nearWater(q.x, q.y, K.water)) continue;
    // Could a tree have stood here and come down: woods, windbreak or tree line.
    const forest = nearForest(t.x, t.y, 15);
    const line = neighbours(t, 25);
    let score = 0;
    if (forest) score += 3;
    if (t.windbreak) score += 2;
    if (line >= 1) score += 1 + Math.min(2, (line - 1) * 0.5);
    if (score < 1) continue;
    cands.push({ t, road, rr, q, score });
  }

  // Best spots first, with a little shuffle; spaced out over the map.
  for (const c of cands) c.key = c.score + rng() * 1.5;
  cands.sort((p, q2) => q2.key - p.key);
  const out = [];
  const perRoad = new Map();
  for (const c of cands) {
    if (out.length >= C.count) break;
    if ((perRoad.get(c.road.id) || 0) >= C.perRoad) continue;
    if (out.some((f) => Math.hypot(f.x - c.t.x, f.y - c.t.y) < C.minSpacing)) continue;
    const f = layOut(c, out.length, R, C);
    if (!f) continue;
    perRoad.set(c.road.id, (perRoad.get(c.road.id) || 0) + 1);
    out.push(f);
  }
  if (opts.debug) opts.debug.cands = cands.length;
  return out;
}

// Which way it fell and how far it reaches, from the base and the road.
function layOut(c, i, R, C) {
  const { t, road, q } = c;
  const w = road.width;
  // Lateral axis: right of the road's own direction.
  const rx = -q.dy;
  const ry = q.dx;
  const baseLat = (t.x - q.x) * rx + (t.y - q.y) * ry;
  const side = baseLat >= 0 ? 1 : -1;
  // The solid trunk ends this far (laterally) from the road centre, on the
  // far side of it from the base: leaves gapOnRoad of road clear.
  const gap = R(...C.gapOnRoad);
  const tipLat = side * (-w / 2 + gap);
  const tilt = R(...C.tilt) * (R(0, 1) < 0.5 ? -1 : 1);
  const across = Math.abs(baseLat - tipLat);
  const solidLen = across / Math.cos(tilt * DEG);
  const h = solidLen / C.solidFrac;
  if (h < C.height[0] || h > C.height[1]) return null;
  // Direction of fall: toward the road (-side across), tilted along it.
  const ux = -side * rx * Math.cos(tilt * DEG) + q.dx * Math.sin(tilt * DEG);
  const uy = -side * ry * Math.cos(tilt * DEG) + q.dy * Math.sin(tilt * DEG);
  return {
    id: `fallen${i + 1}`, tree: t, roadId: road.id, at: q.along, x: t.x, y: t.y,
    heading: headingOf(ux, uy), h, solidLen, roadW: w, side, tilt,
    gapLat: side * (-w / 2 + gap / 2), gap,
    kind: t.kind, r: t.r, tint: t.tint,
  };
}

// Collision and surface parts of a fallen tree, in world space.
export function fallenShape(f) {
  const ux = Math.sin(f.heading * DEG);
  const uy = -Math.cos(f.heading * DEG);
  const px = -uy; // across the trunk
  const py = ux;
  const solids = [];
  // Root plate standing up at the base, across the trunk.
  for (const o of [-1.1, 0, 1.1]) solids.push({ x: f.x + px * o - ux * 0.2, y: f.y + py * o - uy * 0.2, r: 0.9, kind: 'tree' });
  // Trunk, tapering.
  for (let s = 1.0; s <= f.solidLen + 0.01; s += 0.6) {
    const k = s / f.solidLen;
    solids.push({ x: f.x + ux * s, y: f.y + uy * s, r: 0.5 - 0.2 * k, kind: 'tree' });
  }
  // Crown and top: leafy branches, not solid (a knock and a slow-down).
  const crown = [];
  const c0 = f.h * 0.45;
  for (let s = c0; s <= f.h; s += 1.8) {
    const k = (s - c0) / (f.h - c0);
    const r = (f.kind === 'pine' ? 1.6 : 2.4) * (1 - 0.55 * Math.abs(k - 0.4));
    crown.push({ x: f.x + ux * s, y: f.y + uy * s, r, kind: 'branch', id: `${f.id}_c${crown.length}` });
  }
  return { solids, crown, extent: f.h + 3 };
}
