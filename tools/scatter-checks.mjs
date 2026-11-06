// Checks for the district scatter (src/world/scatter.js), used by
// tools/check-world.mjs (placement) and tools/check-fallen.mjs (ways through).
// Each returns a list of problems { id, kind, type, by, x, y }.

import { scatterFor, SOLID_R, CLEAR } from '../src/world/scatter.js';
import { makePads } from '../src/drive/layout.js';
import {
  distToPolyline, pointInPolygon, distToPolygonEdge, circleHitsRect, bbox,
} from '../src/drive/geom.js';

const P = (id, kind, type, by, x, y) => ({ id, kind, type, by: +by.toFixed(2), x: Math.round(x), y: Math.round(y) });

// Never on a road, bridge, ford, yard, pad or track, in a field, forest,
// creek or lake, or in a town's middle. Each item's own footprint (r) must
// clear them; `pad` metres more for solid rocks.
export function scatterPlacementProblems(world, scenery) {
  const S = scatterFor(world, scenery);
  const out = [];
  const pads = makePads(world);
  const polys = (list, kind) => (list || []).map((f) => ({ kind, id: f.id, poly: f.polygon, bb: bbox(f.polygon) }));
  const areas = [...polys(world.fields, 'field'), ...polys(world.forests, 'forest'), ...polys(world.lakes, 'lake')];
  const items = [
    ...S.rocks.map((r) => ({ ...r, what: r.solid ? 'scatter_rock' : 'scatter_stone' })),
    ...S.shrubs.map((s) => ({ ...s, what: 'scatter_shrub' })),
    ...S.grass.map((t, i) => ({ ...t, id: `tuft${i}`, what: 'scatter_tuft' })),
  ];
  for (const it of items) {
    const r = it.r;
    const pad = it.what === 'scatter_rock' ? 6 : 0.5;
    for (const rd of world.roads) {
      const d = distToPolyline(it.x, it.y, rd.points) - rd.width / 2 - r;
      if (d < pad) out.push(P(it.id, it.what, `on road ${rd.id}`, pad - d, it.x, it.y));
    }
    for (const b of world.bridges) {
      const d = Math.hypot(b.x - it.x, b.y - it.y) - b.length / 2 - r;
      if (d < 4) out.push(P(it.id, it.what, `at bridge ${b.id}`, 4 - d, it.x, it.y));
    }
    for (const c of world.creeks) {
      const d = distToPolyline(it.x, it.y, c.points) - c.width / 2 - r;
      if (d < 2) out.push(P(it.id, it.what, `in creek ${c.id}`, 2 - d, it.x, it.y));
    }
    for (const p of pads) {
      if (circleHitsRect(it.x, it.y, r + pad, p)) out.push(P(it.id, it.what, `on ${p.kind} pad`, r, it.x, it.y));
    }
    for (const a of areas) {
      if (it.x < a.bb.minX - 30 || it.x > a.bb.maxX + 30 || it.y < a.bb.minY - 30 || it.y > a.bb.maxY + 30) continue;
      const inside = pointInPolygon(it.x, it.y, a.poly);
      const d = distToPolygonEdge(it.x, it.y, a.poly);
      if (inside || d < r) out.push(P(it.id, it.what, `in ${a.kind} ${a.id}`, inside ? d + r : r - d, it.x, it.y));
    }
    for (const t of world.towns) {
      const d = Math.hypot(t.x - it.x, t.y - it.y);
      if (d < (t.ambienceR || 150) * 0.7) out.push(P(it.id, it.what, `in town ${t.id}`, (t.ambienceR || 150) * 0.7 - d, it.x, it.y));
    }
  }
  return { problems: out, counts: { scatterRocks: S.rocks.length, scatterShrubs: S.shrubs.length, scatterTufts: S.grass.length } };
}

// Solid rocks never close a way: none within reach of a road, track or yard,
// and every solid rock leaves a car's width (carW) to every other solid thing
// (collider: the world without the scatter), except rocks of one outcrop,
// which may touch (they are one lump). Fallen trees: see check-fallen.
export function scatterWayProblems(world, scenery, collider, carW) {
  const S = scatterFor(world, scenery);
  const out = [];
  const pads = makePads(world).filter((p) => p.kind !== 'field');
  const solids = S.rocks.filter((r) => r.solid);
  const grid = new Map();
  const G = 16;
  const key = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`;
  for (const r of solids) {
    const k = key(r.x, r.y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(r);
  }
  for (const r of solids) {
    if (r.r < SOLID_R) out.push(P(r.id, 'scatter_rock', 'solid but small', SOLID_R - r.r, r.x, r.y));
    const rc = r.r * 0.85; // collision radius (scatter.js solids)
    for (const rd of world.roads) {
      const d = distToPolyline(r.x, r.y, rd.points) - rd.width / 2 - rc;
      if (d < 9) out.push(P(r.id, 'scatter_rock', `near road ${rd.id}`, 9 - d, r.x, r.y));
    }
    for (const p of pads) if (circleHitsRect(r.x, r.y, rc + 8, p)) out.push(P(r.id, 'scatter_rock', `near ${p.kind}`, 8, r.x, r.y));
    // A car's width to anything else solid.
    const hit = collider.circleHit(r.x, r.y, rc + carW);
    if (hit) out.push(P(r.id, 'scatter_rock', `pinches a gap with ${typeof hit === 'string' ? hit : hit.kind || hit.type}`, carW, r.x, r.y));
    // And to other scatter rocks (outcrop rocks may touch each other).
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const o of grid.get(`${Math.floor(r.x / G) + i},${Math.floor(r.y / G) + j}`) || []) {
          if (o === r || o.id < r.id) continue;
          const gap = Math.hypot(o.x - r.x, o.y - r.y) - (o.r + r.r) * 0.85;
          const sameLump = r.outcrop && r.outcrop === o.outcrop && gap < 0.6; // a slit no car fits: one lump
          if (!sameLump && gap < carW) out.push(P(r.id, 'scatter_rock', `pinches a gap with ${o.id}`, carW - gap, r.x, r.y));
        }
      }
    }
  }
  return { problems: out, solid: solids.length, CLEAR };
}
