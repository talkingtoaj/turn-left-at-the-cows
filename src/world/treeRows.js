// More trees (#69, SPEC 9r): rows of trees lining stretches of dirt road
// near farms, like old farm lanes, and a few dead and broken trees out in the
// open. Shared logic, no engine code, seeded: the same world always gets the
// same trees. generateScenery (src/drive/layout.js) adds them after the fallen
// trees are picked, so the older scenery, the fallen trees and their random
// streams stay as they were. Proved by npm run check:tree-rows.
//
//   planTreeRows(world, { reject, tooClose, avoid }) -> { stretches, trees }
//     stretches [{ roadId, d0, d1, kind }]   d: metres along the road
//     trees     [{ x, y, kind, r, tint, row: 'lane', stretch }]
//   planDeadTrees(world, { reject, tooClose }) -> [{ x, y, kind: 'dead'|'snag', r, tint, h }]
//
// reject(x, y): true where no tree may stand (roads, water, buildings, signs,
// mailboxes, landmarks, poles; layout.js makeTreeRejector). tooClose(x, y, d):
// true when another tree is within d. avoid: [{ x, y, r }] more spots to keep
// clear (the fallen trees).
//
// Where rows go:
//   - only dirt roads, only where a farm yard is near or the road runs past
//     fields;
//   - never in a town or hamlet, never near a junction or another road (so
//     a driver can always see down the crossing road), a sign, a mailbox, a
//     landmark, a named place, the start, a bridge or creek, or a fallen tree;
//   - out of forests (a row in a wood is just more wood);
//   - ROW.offset from the centre line: past the verge band of the roadside
//     fill (#66: weeds, ditches and leaning posts end about 9 m out on a dirt
//     road) and the 12 m every tree keeps from a road.

import {
  makeRng, measurePolyline, pointAlong, distToPolyline, pointInPolygon, distToPolygonEdge, bbox,
} from '../drive/geom.js';

export const ROW = {
  offset: [12.6, 13.6], // m from the road's centre line
  step: [9, 11.5], // m between trees along a row
  sample: 4, // m between checks along a road
  minLen: 90, // m: shorter clear runs get no row
  len: [110, 240], // m: how long a row runs
  gap: [60, 160], // m between two rows on one road
  take: 0.7, // share of the clear runs that get a row
  missing: 0.08, // share of row trees that are gone (gaps in old rows)
  deadInRow: 0.05, // share that stand dead
  farmReach: 650, // m from a farm yard building
  fieldReach: 45, // m from a field edge
  clear: {
    town: 380, hamlet: 240, start: 160, junction: 55, sign: 30, mailbox: 25, landmark: 25, place: 40,
    creek: 30, bridge: 60, forest: 15, fallen: 40,
  },
};

export const DEAD = {
  count: 55, // dead and broken trees across a 6.5 x 3.2 km region (scaled by area)
  snagShare: 0.45, // share that are broken stumps, the rest stand whole and bare
  roadMin: 16, // m from any road's centre line
  town: 300,
};

function makeChecks(world) {
  const roads = world.roads.map((r) => ({ r, cum: measurePolyline(r.points) }));
  const forests = (world.forests || []).map((f) => ({ p: f.polygon, bb: bbox(f.polygon) }));
  const fields = (world.fields || []).map((f) => ({ p: f.polygon, bb: bbox(f.polygon) }));
  const farmB = (world.buildings || []).filter((b) => b.farm);
  const inBB = (bb, x, y, m) => x > bb.minX - m && x < bb.maxX + m && y > bb.minY - m && y < bb.maxY + m;
  const nearPoly = (list, x, y, m) => list.some(({ p, bb }) => inBB(bb, x, y, m) && (pointInPolygon(x, y, p) || distToPolygonEdge(x, y, p) < m));
  const nearPt = (list, x, y, r) => (list || []).some((p) => Math.hypot(p.x - x, p.y - y) < (typeof r === 'function' ? r(p) : r));
  const townR = (t) => (t.kind === 'hamlet' ? ROW.clear.hamlet : ROW.clear.town);
  return {
    roads,
    inTown: (x, y, extra = 0) => nearPt(world.towns, x, y, (t) => townR(t) + extra),
    nearFarm: (x, y) => nearPt(farmB, x, y, ROW.farmReach) || nearPoly(fields, x, y, ROW.fieldReach),
    inForest: (x, y, m) => nearPoly(forests, x, y, m),
    deepInForest: (x, y, m) => forests.some(({ p, bb }) => inBB(bb, x, y, 0) && pointInPolygon(x, y, p) && distToPolygonEdge(x, y, p) > m),
    nearPt,
  };
}

// Is the road point (x, y) on road `id` a fine place for a row? (Both sides
// are checked tree by tree later; this is the stretch test.)
function stretchOk(world, C, id, x, y, avoid) {
  const K = ROW.clear;
  if (C.inTown(x, y)) return false;
  if (world.start && Math.hypot(world.start.x - x, world.start.y - y) < K.start) return false;
  if (!C.nearFarm(x, y)) return false;
  for (const { r } of C.roads) if (r.id !== id && distToPolyline(x, y, r.points) < K.junction) return false;
  if (C.nearPt(world.signs, x, y, K.sign) || C.nearPt(world.mailboxes, x, y, K.mailbox)) return false;
  if (C.nearPt(world.landmarks, x, y, (l) => (l.clearR || 20) + K.landmark)) return false;
  if (C.nearPt(world.places, x, y, (p) => (p.r || 25) + K.place)) return false;
  if (C.nearPt(world.bridges, x, y, K.bridge)) return false;
  for (const c of world.creeks || []) if (distToPolyline(x, y, c.points) < c.width / 2 + K.creek) return false;
  if (C.inForest(x, y, K.forest + 14)) return false;
  if (C.nearPt(avoid, x, y, (a) => (a.r || 0) + K.fallen)) return false;
  return true;
}

export function planTreeRows(world, { reject, tooClose, avoid = [] }) {
  const rng = makeRng(((world.seed || 1) ^ 0x7e5e0) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const C = makeChecks(world);
  const stretches = [];
  const trees = [];
  for (const { r, cum } of C.roads) {
    if (r.type !== 'dirt') continue;
    const total = cum[cum.length - 1];
    // Clear runs along the road.
    const runs = [];
    let run = null;
    for (let d = 0; d <= total; d += ROW.sample) {
      const p = pointAlong(r.points, cum, d);
      if (stretchOk(world, C, r.id, p.x, p.y, avoid)) {
        if (!run) run = { d0: d, d1: d };
        else run.d1 = d;
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
    if (run) runs.push(run);
    let next = 0; // the next row starts no earlier than this
    for (const u of runs) {
      let d0 = Math.max(u.d0 + 6, next);
      while (u.d1 - d0 >= ROW.minLen) {
        const want = R(ROW.len[0], ROW.len[1]);
        const d1 = Math.min(u.d1 - 6, d0 + want);
        if (d1 - d0 < ROW.minLen) break;
        if (rng() < ROW.take) {
          const s = { roadId: r.id, d0, d1, kind: rng() < 0.8 ? 'oak' : 'pine' };
          const id = stretches.length;
          stretches.push(s);
          const size = s.kind === 'pine' ? R(3.0, 3.6) : R(3.3, 4.1);
          const off = R(ROW.offset[0], ROW.offset[1]);
          for (const side of [-1, 1]) {
            for (let d = d0 + R(0, 3); d <= d1; d += R(ROW.step[0], ROW.step[1])) {
              const p = pointAlong(r.points, cum, d);
              const o = side * (off + R(-0.5, 0.5));
              const x = p.x - p.dy * o;
              const y = p.y + p.dx * o;
              const gone = rng() < ROW.missing;
              const dead = rng() < ROW.deadInRow;
              const rr = size * R(0.88, 1.12);
              const tint = rng();
              if (gone || reject(x, y) || tooClose(x, y, 4) || C.inForest(x, y, ROW.clear.forest)) continue;
              const t = dead
                ? { x, y, kind: 'dead', r: rr * 0.8, tint, h: rr * 3.4, row: 'lane', stretch: id }
                : { x, y, kind: s.kind, r: rr, tint, row: 'lane', stretch: id };
              trees.push(t);
            }
          }
          d0 = d1 + R(ROW.gap[0], ROW.gap[1]);
        } else d0 += R(ROW.len[0], ROW.len[1]) * 0.6;
      }
      next = d0;
    }
  }
  return { stretches, trees };
}

// Dead and broken trees out in the open country and at wood edges. Whole dead
// trees are 'dead' (bare branches); broken ones are 'snag' (a stump of trunk
// snapped off at h metres).
export function planDeadTrees(world, { reject, tooClose }) {
  const rng = makeRng(((world.seed || 1) ^ 0xdeadb) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const C = makeChecks(world);
  const n = Math.round((DEAD.count * world.size.w * world.size.h) / (6500 * 3200));
  const out = [];
  for (let k = 0; k < n * 8 && out.length < n; k++) {
    const x = R(20, world.size.w - 20);
    const y = R(20, world.size.h - 20);
    if (reject(x, y) || tooClose(x, y, 5) || C.inTown(x, y, DEAD.town - ROW.clear.town)) continue;
    if (C.roads.some(({ r }) => distToPolyline(x, y, r.points) < DEAD.roadMin)) continue;
    // Deep in a wood they are lost among the others: keep to edges and open ground.
    if (C.deepInForest(x, y, 25)) continue;
    const snag = rng() < DEAD.snagShare;
    const r = R(2.6, 3.8);
    out.push(snag
      ? { x, y, kind: 'snag', r, tint: rng(), h: R(2.2, 5.5) }
      : { x, y, kind: 'dead', r, tint: rng(), h: r * R(3.0, 3.8) });
  }
  return out;
}
