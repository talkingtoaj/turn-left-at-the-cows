// Yards around buildings (#85, SPEC 9r): now and then a worn footpath sunk a
// little into the grass, a low bank or a soft hollow near a building, and a
// rail fence along one side of the lot. Pure (no three.js): the terrain
// (src3/world3d/yardGround.js) cuts the ground shapes into its height, the
// renderer (src3/world3d/yards3d.js) draws the fences and the collider makes
// their posts solid. Everything is chosen from hashes of building ids, so the
// same world always gets the same yards.
//
// Ground shapes are capsules (a polyline with a radius): a path has a flat
// worn floor and sloped sides, a bank or hollow is a smooth bell. They never
// touch a building, a road, a pad (parking, farmyard), a field, water, a
// landmark's clear ring or a small thing standing alone (mailbox, sign,
// pole, prop): mask() fades them to nothing near those.

import {
  distToSegment, distToPolyline, hashString, localToWorld, pointInPolygon, distToPolygonEdge, SegIndex, bbox,
} from '../drive/geom.js';
import { makePads, buildingSolids } from '../drive/layout.js';

export const PATH = { depth: 0.28, r: 1.8 }; // worn path: depth (m) and half width at the grass
export const RAIL_STEP = 2.6; // metres between fence posts (as field rail fences)
export const FENCE_POST_R = 0.4; // what the car hits (as layout.js FENCE.postR)

const KINDS = new Set(['shop', 'store', 'diner', 'gas', 'farmhouse']);
// Farms left alone: Okafor's yard belongs to the farm dog's fence (#68).
const SKIP_FARMS = new Set(['okafor']);

const unit = (s) => (hashString(s) % 100000) / 100000;
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Signed distance from (x, y) to a rect { x, y, w, h, angle } (negative inside).
export function rectDist(r, x, y) {
  const a = ((r.angle || 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - r.x;
  const dy = y - r.y;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const qx = Math.abs(lx) - r.w / 2;
  const qy = Math.abs(ly) - r.h / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

function roadDist(roads, x, y) {
  let best = Infinity;
  for (const s of roads.near(x, y)) {
    const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by) - s.data;
    if (d < best) best = d;
  }
  return best;
}

// Chaikin corner cutting: a few rounds turn a bent line into a soft curve.
function soften(pts, rounds = 2) {
  let p = pts;
  for (let k = 0; k < rounds; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// The lot around one target: a rect in the building's own frame that holds
// the building and its pad (gas forecourt, gravel parking) or, for a farm,
// the farmyard. front: unit vector (world) toward the nearest road.
function lotOf(world, b, pads, roads) {
  const a = b.angle || 0;
  let lot = { x: b.x, y: b.y, w: b.w, h: b.h, angle: a };
  const grow = (p) => {
    // Pads share the building's angle (makePads); grow in its frame.
    const x0 = Math.min(lot.x - lot.w / 2, p.x - p.w / 2);
    const x1 = Math.max(lot.x + lot.w / 2, p.x + p.w / 2);
    const y0 = Math.min(lot.y - lot.h / 2, p.y - p.h / 2);
    const y1 = Math.max(lot.y + lot.h / 2, p.y + p.h / 2);
    lot = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, angle: a };
  };
  for (const p of pads) {
    if ((p.angle || 0) !== a) continue;
    if (p.kind === 'yard' && b.kind === 'farmhouse' && rectDist(p, b.x, b.y) < 0) grow(p);
    if ((p.kind === 'concrete' || p.kind === 'gravel') && Math.hypot(p.x - b.x, p.y - b.y) < 6) grow(p);
  }
  // Which side of the building faces the road: the same pick as
  // structures.js roadSide, so the back of the lot is the back of the house.
  const sides = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  let best = null;
  for (const [k, [ux, uy]] of Object.entries(sides)) {
    const p = localToWorld(b.x, b.y, a, ux * b.w * 1.5, uy * b.h * 1.5);
    let d = Infinity;
    for (const r of world.roads) d = Math.min(d, distToPolyline(p.x, p.y, r.points));
    if (!best || d < best.d) best = { k, d, ux, uy };
  }
  const f = localToWorld(0, 0, a, best.ux, best.uy);
  const front = [f.x, f.y];
  const side = [-front[1], front[0]];
  const A = best.ux ? lot.h / 2 : lot.w / 2; // half width across the front
  const B = best.ux ? lot.w / 2 : lot.h / 2; // half depth, front to back
  return { ...lot, front, side, A, B };
}

// World point at (s across, t toward the road) in a lot's frame.
const at = (L, s, t) => [L.x + L.side[0] * s + L.front[0] * t, L.y + L.side[1] * s + L.front[1] * t];

const cache = new WeakMap();

// { features: [{ id, kind: 'path'|'bank'|'hollow', pts, r, h }], fences:
// [{ id, line: [[x, y], [x, y]] }], lots, mask(x, y), offset(x, y), wear(x, y) }
export function yardPlan(world) {
  if (cache.has(world)) return cache.get(world);
  const pads = makePads(world);
  const roads = new SegIndex(32);
  for (const r of world.roads) roads.addPolyline(r.points, r.width / 2 + 12, r.width / 2);

  // ---- The mask: 1 in open grass, 0 on anything the ground must not move under.
  const rects = [];
  for (const b of world.buildings) {
    const s = buildingSolids(b);
    // The farmhouse porch and steps stand outside the footprint.
    const m = b.kind === 'farmhouse' ? 5 : 2.5;
    for (const r of s.rects) rects.push({ ...r, m0: m, m1: m + 3 });
    for (const c of s.circles) rects.push({ x: c.x, y: c.y, w: c.r * 2, h: c.r * 2, angle: 0, m0: m, m1: m + 3 });
  }
  for (const p of pads) rects.push({ ...p, m0: 1, m1: 4 });
  const discs = [];
  for (const l of world.landmarks) {
    if (l.points) continue;
    const r = l.kind === 'church' ? 0 : l.clearR || l.r || 20;
    if (r) discs.push({ x: l.x, y: l.y, r0: r, r1: r + 6 });
  }
  const churches = world.landmarks.filter((l) => l.kind === 'church');
  // A church's graves stand at one height either side of the nave (church3d.js).
  for (const l of churches) rects.push({ x: l.x, y: l.y + 1.5, w: 33, h: 36, angle: 0, m0: 1.5, m1: 4.5 });
  const dots = new SegIndex(32);
  const dot = (x, y, r) => dots.add(x, y, x, y, r + 4, r);
  for (const m of world.mailboxes || []) dot(m.x, m.y, 1.5);
  for (const s of world.signs || []) dot(s.x, s.y, 2);
  for (const p of world.props || []) dot(p.x, p.y, (p.r || 1) + 1);
  for (const p of world.dressing || []) dot(p.x, p.y, (p.r || 2) + 1.5);
  for (const l of world.powerLines || []) for (const p of l.poles) dot(p.x, p.y, 1);
  for (const l of world.locals || []) dot(l.x, l.y, 1.5);
  const water = new SegIndex(32);
  for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + 18, c.width / 2);
  for (const b of world.bridges || []) water.add(b.x, b.y, b.x, b.y, (b.length || 20) / 2 + 18, (b.length || 20) / 2);
  const lakes = world.lakes.map((l) => ({ ...l, bb: bbox(l.polygon) }));
  const fields = (world.fields || []).map((f) => ({ ...f, bb: bbox(f.polygon) }));
  const forests = (world.forests || []).map((f) => ({ ...f, bb: bbox(f.polygon) }));

  const mask = (x, y) => {
    let m = sstep(4, 7.5, roadDist(roads, x, y));
    if (m <= 0) return 0;
    for (const r of rects) {
      if (Math.abs(x - r.x) > r.w + r.h + r.m1 || Math.abs(y - r.y) > r.w + r.h + r.m1) continue;
      m *= sstep(r.m0, r.m1, rectDist(r, x, y));
      if (m <= 0) return 0;
    }
    for (const d of discs) {
      const dd = Math.hypot(x - d.x, y - d.y);
      if (dd < d.r1) m *= sstep(d.r0, d.r1, dd);
    }
    for (const s of dots.near(x, y)) m *= sstep(s.data, s.data + 2.5, Math.hypot(x - s.ax, y - s.ay));
    for (const s of water.near(x, y)) m *= sstep(s.data + 10, s.data + 16, distToSegment(x, y, s.ax, s.ay, s.bx, s.by));
    for (const l of lakes) {
      if (x < l.bb.minX - 16 || x > l.bb.maxX + 16 || y < l.bb.minY - 16 || y > l.bb.maxY + 16) continue;
      m *= pointInPolygon(x, y, l.polygon) ? 0 : sstep(10, 16, distToPolygonEdge(x, y, l.polygon));
    }
    for (const list of [fields, forests]) {
      for (const f of list) {
        if (x < f.bb.minX - 5 || x > f.bb.maxX + 5 || y < f.bb.minY - 5 || y > f.bb.maxY + 5) continue;
        m *= pointInPolygon(x, y, f.polygon) ? 0 : sstep(2, 5, distToPolygonEdge(x, y, f.polygon));
      }
    }
    return m;
  };

  // ---- Targets: shops, stores, diners, gas stations, farmhouses, churches.
  const lots = [];
  for (const b of world.buildings) {
    if (!KINDS.has(b.kind) || (b.farm && SKIP_FARMS.has(b.farm))) continue;
    lots.push({ id: b.id, kind: b.kind, b, ...lotOf(world, b, pads, roads) });
  }
  for (const l of churches) {
    const b = { id: l.id, kind: 'church', x: l.x, y: l.y + 1.5, w: 33, h: 36, angle: 0 };
    lots.push({ id: l.id, kind: 'church', b, ...lotOf(world, b, [], roads) });
  }

  const features = [];
  const fences = [];
  // Mean of the mask along a line: how much of it would show.
  const open = (pts) => {
    let t = 0;
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const u = k / 4;
        t += mask(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u);
        n++;
      }
    }
    return n ? t / n : 0;
  };
  const crossesRoad = (a, b) => {
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      if (roadDist(roads, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u) < 3) return true;
    }
    return false;
  };
  const others = [...world.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, angle: b.angle || 0 })),
    ...churches.map((l) => ({ id: l.id, x: l.x, y: l.y + 1.5, w: 33, h: 36, angle: 0 }))];
  const paired = new Set();

  for (const L of lots) {
    const u = (k) => unit(L.id + ':' + k);
    const ps = u('side') < 0.5 ? -1 : 1; // the side the path takes; the fence goes on the other
    const { A, B } = L;
    // Path: between this lot and a neighbour across open grass, else round
    // the side to the back door. Farms: out from the yard to the nearest field.
    let path = null;
    if (L.kind !== 'farmhouse') {
      let best = null;
      for (const o of others) {
        if (o.id === L.id || o.id === L.b.id || paired.has(o.id + '|' + L.id)) continue;
        const d = Math.hypot(o.x - L.x, o.y - L.y);
        if (d > 80) continue;
        // Nearest points of the two lots, stepped out past their walls.
        const ux = (o.x - L.x) / d;
        const uy = (o.y - L.y) / d;
        let ta = 0;
        while (ta < d && rectDist(L, L.x + ux * ta, L.y + uy * ta) < 3) ta += 0.5;
        let tb = d;
        while (tb > ta && rectDist(o, L.x + ux * tb, L.y + uy * tb) < 3) tb -= 0.5;
        const gap = tb - ta;
        if (gap < 10 || gap > 50) continue;
        const a = [L.x + ux * ta, L.y + uy * ta];
        const b2 = [L.x + ux * tb, L.y + uy * tb];
        if (crossesRoad(a, b2)) continue;
        if (!best || gap < best.gap) best = { gap, a, b: b2, o, ux, uy };
      }
      if (best && u('between') < 0.75) {
        const bend = (u('bend') - 0.5) * best.gap * 0.25;
        const mid = [(best.a[0] + best.b[0]) / 2 - best.uy * bend, (best.a[1] + best.b[1]) / 2 + best.ux * bend];
        path = soften([best.a, mid, best.b]);
        paired.add(L.id + '|' + best.o.id);
      } else if (u('around') < 0.8) {
        path = soften([at(L, ps * (A + 2.8), B + 1), at(L, ps * (A + 3), -B + 1), at(L, ps * A * 0.5, -B - 3.4), at(L, -ps * A * 0.3, -B - 4.6)]);
      }
    } else {
      // Cow path from the farmyard to the nearest pasture or field edge.
      let best = null;
      for (const f of fields) {
        for (let i = 0; i < f.polygon.length; i++) {
          const [ax, ay] = f.polygon[i];
          const [bx, by] = f.polygon[(i + 1) % f.polygon.length];
          for (let k = 1; k < 8; k++) {
            const px = ax + ((bx - ax) * k) / 8;
            const py = ay + ((by - ay) * k) / 8;
            const d = rectDist(L, px, py);
            if (d > 10 && d < 60 && (!best || d < best.d)) best = { d, p: [px, py] };
          }
        }
      }
      if (best && u('cowpath') < 0.7) {
        const [px, py] = best.p;
        // From the yard edge nearest the field.
        let q = [L.x, L.y];
        for (let t = 0; t < 1; t += 0.01) {
          q = [L.x + (px - L.x) * t, L.y + (py - L.y) * t];
          if (rectDist(L, q[0], q[1]) > 1) break;
        }
        const bend = (u('bend') - 0.5) * best.d * 0.3;
        const dx = px - q[0];
        const dy = py - q[1];
        const len = Math.hypot(dx, dy) || 1;
        const mid = [(q[0] + px) / 2 - (dy / len) * bend, (q[1] + py) / 2 + (dx / len) * bend];
        if (!crossesRoad(q, best.p)) path = soften([q, mid, best.p]);
      }
    }
    if (path && open(path) > 0.35) features.push({ id: L.id, kind: 'path', pts: path, r: PATH.r, h: -PATH.depth });

    // A low bank and a soft hollow, on open grass behind and beside the lot.
    const tries = (list, make) => {
      for (const [s, t] of list) {
        const f = make(s, t);
        const c = f.pts[Math.floor(f.pts.length / 2)];
        if (mask(c[0], c[1]) > 0.95 && open(f.pts) > 0.85) return f;
      }
      return null;
    };
    const far = L.kind === 'farmhouse' ? 6 : 7;
    const bank = tries(
      [[0, -B - far - 3], [-ps * (A + far), 0], [ps * A * 0.5, -B - far - 6], [-ps * (A + far + 4), -B]],
      (s, t) => {
        const len = 8 + u('banklen') * 6;
        // Along the lot's back, or its side when it sits beside it.
        const along = Math.abs(t) > Math.abs(s) ? L.side : L.front;
        const [cx, cy] = at(L, s, t);
        return { id: L.id, kind: 'bank', pts: [[cx - along[0] * len / 2, cy - along[1] * len / 2], [cx + along[0] * len / 2, cy + along[1] * len / 2]], r: 4.6, h: 0.6 + u('bankh') * 0.3 };
      },
    );
    if (bank && u('hasbank') < 0.85) features.push(bank);
    const hollow = tries(
      [[ps * (A + far + 2), -B * 0.3], [-ps * (A + far + 3), -B - 4], [ps * (A + 4), -B - far - 4]],
      (s, t) => {
        const [cx, cy] = at(L, s, t);
        return { id: L.id, kind: 'hollow', pts: [[cx - 1.2, cy], [cx + 1.2, cy]], r: 5 + u('hr') * 1.5, h: -(0.45 + u('hh') * 0.2) };
      },
    );
    if (hollow && u('hashollow') < 0.7) features.push(hollow);

    // A rail fence along one side of the lot (the side the path doesn't take).
    if (u('fence') < 0.75) {
      const off = L.kind === 'farmhouse' ? 2 : 4.5;
      const s = -ps * (A + off);
      let t0 = B - 1;
      const t1 = -B - (L.kind === 'farmhouse' ? 1 : 7);
      // An occasional fence, not a wall round the farm: at most 36 m, the back part.
      if (t0 - t1 > 36) t0 = t1 + 36;
      fences.push({ id: L.id, line: [at(L, s, t0), at(L, s, t1)] });
    }
  }

  // Ground offset (m) at a point: the shapes, faded out by the mask.
  for (const f of features) {
    const bb = bbox(f.pts);
    f.bb = { minX: bb.minX - f.r, maxX: bb.maxX + f.r, minY: bb.minY - f.r, maxY: bb.maxY + f.r };
  }
  const shape = (f, x, y) => {
    if (x < f.bb.minX || x > f.bb.maxX || y < f.bb.minY || y > f.bb.maxY) return 0;
    let d = Infinity;
    for (let i = 0; i < f.pts.length - 1; i++) d = Math.min(d, distToSegment(x, y, f.pts[i][0], f.pts[i][1], f.pts[i + 1][0], f.pts[i + 1][1]));
    const t = d / f.r;
    if (t >= 1) return 0;
    // Path: a flat worn floor, sides sloping up to the grass. Bank and
    // hollow: a smooth bell, level at its rim.
    return f.kind === 'path' ? 1 - sstep(0.45, 1, t) : 0.5 + 0.5 * Math.cos(Math.PI * t);
  };
  const raw = (x, y) => {
    let h = 0;
    for (const f of features) {
      const p = shape(f, x, y);
      if (p) h += f.h * p;
    }
    return h;
  };
  const offset = (x, y) => {
    const h = raw(x, y);
    return h ? h * mask(x, y) : 0;
  };
  // How worn the grass is (0..1): the floor of a path.
  const wear = (x, y) => {
    let w = 0;
    for (const f of features) {
      if (f.kind !== 'path') continue;
      const p = shape(f, x, y);
      if (p > w) w = p;
    }
    return w ? w * Math.sqrt(w) * mask(x, y) : 0;
  };

  const plan = { features, fences, lots, mask, offset, wear };
  cache.set(world, plan);
  return plan;
}

// Fence posts along each yard fence, cut where something is in the way:
// roads, pads, buildings, trees, poles and the like. Shared by the renderer
// and the collider. trees: scenery.trees. Returns [{ id, runs: [[{x, y}]] }].
const runCache = new WeakMap();
export function yardFenceRuns(world, trees = []) {
  if (runCache.has(world)) return runCache.get(world);
  const plan = yardPlan(world);
  const pads = makePads(world);
  const roads = new SegIndex(32);
  for (const r of world.roads) roads.addPolyline(r.points, r.width / 2 + 12, r.width / 2);
  const solids = [];
  for (const b of world.buildings) {
    const s = buildingSolids(b);
    for (const r of s.rects) solids.push({ ...r, m: b.kind === 'farmhouse' ? 4 : 2 });
    for (const c of s.circles) solids.push({ x: c.x, y: c.y, w: c.r * 2, h: c.r * 2, angle: 0, m: 2 });
  }
  for (const p of pads) solids.push({ ...p, m: 1.2 });
  for (const l of world.landmarks.filter((q) => q.kind === 'church')) solids.push({ x: l.x, y: l.y + 1.5, w: 33, h: 36, angle: 0, m: 1 });
  const spots = new SegIndex(16);
  const spot = (x, y, r) => spots.add(x, y, x, y, r, r);
  for (const t of trees) spot(t.x, t.y, 2.2);
  for (const m of world.mailboxes || []) spot(m.x, m.y, 3);
  for (const s of world.signs || []) spot(s.x, s.y, 3);
  for (const p of world.props || []) spot(p.x, p.y, (p.r || 1) + 1.5);
  for (const p of world.dressing || []) spot(p.x, p.y, (p.r || 2) + 1.5);
  for (const l of world.powerLines || []) for (const p of l.poles) spot(p.x, p.y, 2);
  for (const l of world.locals || []) spot(l.x, l.y, 2.5);
  for (const l of world.landmarks) if (!l.points && l.kind !== 'church') spot(l.x, l.y, (l.clearR || l.r || 20) + 2);
  for (const c of world.creeks) for (let i = 0; i < c.points.length - 1; i++) spots.add(c.points[i][0], c.points[i][1], c.points[i + 1][0], c.points[i + 1][1], c.width / 2 + 8, c.width / 2 + 8);
  const fields = (world.fields || []).map((f) => ({ ...f, bb: bbox(f.polygon) }));
  const paths = plan.features.filter((f) => f.kind === 'path');
  const blocked = (x, y) => {
    if (roadDist(roads, x, y) < 4.5) return true;
    for (const r of solids) {
      if (Math.abs(x - r.x) > r.w + r.h + 6 || Math.abs(y - r.y) > r.w + r.h + 6) continue;
      if (rectDist(r, x, y) < r.m) return true;
    }
    if (spots.minDist(x, y, (s) => s.data) < 0) return true;
    for (const f of fields) {
      if (x < f.bb.minX - 3 || x > f.bb.maxX + 3 || y < f.bb.minY - 3 || y > f.bb.maxY + 3) continue;
      if (pointInPolygon(x, y, f.polygon) || distToPolygonEdge(x, y, f.polygon) < 3) return true;
    }
    for (const p of paths) {
      for (let i = 0; i < p.pts.length - 1; i++) if (distToSegment(x, y, p.pts[i][0], p.pts[i][1], p.pts[i + 1][0], p.pts[i + 1][1]) < p.r + 0.5) return true;
    }
    return x < 5 || y < 5 || x > world.size.w - 5 || y > world.size.h - 5;
  };
  const out = [];
  for (const f of plan.fences) {
    const [[ax, ay], [bx, by]] = f.line;
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / RAIL_STEP));
    const runs = [];
    let run = [];
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      if (blocked(x, y)) {
        if (run.length >= 3) runs.push(run);
        run = [];
      } else run.push({ x, y });
    }
    if (run.length >= 3) runs.push(run);
    if (runs.length) out.push({ id: 'yard_' + f.id, runs });
  }
  runCache.set(world, out);
  return out;
}

export function yardFenceSolids(world, trees = []) {
  const circles = [];
  for (const f of yardFenceRuns(world, trees)) for (const run of f.runs) for (const p of run) circles.push({ x: p.x, y: p.y, r: FENCE_POST_R });
  return { rects: [], circles };
}
