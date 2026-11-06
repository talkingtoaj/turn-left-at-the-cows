// Countryside fill: procedural fields, props (hay bales, haystacks, rocks) and
// power lines along the paved roads. Deterministic from world.seed. Runs inside
// buildWorld once roads, bridges, signs and mailboxes are placed, so WORLD
// already holds it and both engines see the same countryside.
//
// Never makes buildings, mailboxes, signs or anything with a name: those are
// clues the player relies on. See CONTRACT_P3.md section 1 for the shapes.

import {
  makeRng, SegIndex, pointInPolygon, distToPolygonEdge, bbox, measurePolyline, pointAlong,
  headingOf, polygonArea, circleHitsRect,
} from '../drive/geom.js';
import { makePads } from '../drive/layout.js';

// Clearances (m) from each kind of thing to any fill.
const PAD = {
  road: 6, // from the road edge
  water: 12, // from the creek edge
  lake: 12,
  forest: 6,
  building: 25,
  town: 40, // beyond ambienceR
  place: 60, // beyond r
  landmark: 60,
  npc: 40,
  sign: 12,
  mailbox: 12,
  bridge: 40,
  authored: 30, // authored fields
  yard: 20, // farm yards, forecourts, gravel pads
  fill: 8, // other fill
  goal: 80, // mission goals and waypoints
  edge: 30, // world edge
};

// Mission waypoints (src/game/missions.js imports WORLD, so it cannot be
// imported here). Goals are places and are covered by those.
const WAYPOINTS = [
  { bridge: 'b_old', r: 50 },
  { bridge: 'b_covered', r: 60 },
  { town: 'calder', r: 90 },
  { x: 5150, y: 330, r: 40 }, // fire lookout
];

const FIELD_BUDGET = 60;
const PT_CELL = 64;
const POLE_STEP = 45;
const POLE_R = 0.3;
const BALE_R = 0.75;
const HAYSTACK_R = 2.4;

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// Segments a-b and c-d cross.
function segsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// Smallest gap between two polygons (0 if they touch or overlap).
function polyGap(a, b) {
  for (const p of a) if (pointInPolygon(p[0], p[1], b)) return 0;
  for (const p of b) if (pointInPolygon(p[0], p[1], a)) return 0;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) if (segsCross(a0, a1, b[j], b[(j + 1) % b.length])) return 0;
  }
  let best = Infinity;
  for (const p of a) best = Math.min(best, distToPolygonEdge(p[0], p[1], b));
  for (const p of b) best = Math.min(best, distToPolygonEdge(p[0], p[1], a));
  return best;
}

const rectPoly = (p) => {
  const c = Math.cos((p.angle || 0) * Math.PI / 180);
  const s = Math.sin((p.angle || 0) * Math.PI / 180);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = (u * p.w) / 2;
    const ly = (v * p.h) / 2;
    return [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
  });
};

// Heading (0..180) of a polygon's longest edge: the default row direction.
export function longAxisAngle(poly) {
  let best = 0;
  let ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) {
      best = l;
      ang = headingOf(b[0] - a[0], b[1] - a[1]) % 180;
    }
  }
  return r1(ang);
}

// New fields on authored fields, filled in if missing.
export function fieldDefaults(f) {
  const out = { ...f };
  if (out.kind === 'crop' && !out.crop) out.crop = 'hay';
  if (out.fence === undefined) out.fence = 'wire';
  if (out.windbreak === undefined) out.windbreak = false;
  if (out.rowAngle === undefined) out.rowAngle = longAxisAngle(out.polygon);
  if (out.animals === undefined) out.animals = null;
  if (out.procedural === undefined) out.procedural = false;
  return out;
}

// Everything fill must keep away from, as one query object.
function makeKeepOut(world) {
  const lines = new SegIndex(48);
  // Road and creek vertices bucketed in a grid (none may sit inside a field).
  const linePts = new Map();
  const addPts = (pts) => {
    for (const p of pts) {
      const k = Math.floor(p[0] / PT_CELL) * 10000 + Math.floor(p[1] / PT_CELL);
      if (!linePts.has(k)) linePts.set(k, []);
      linePts.get(k).push(p);
    }
  };
  for (const r of world.roads) {
    lines.addPolyline(r.points, r.width / 2 + PAD.road + 4, r.width / 2 + PAD.road);
    addPts(r.points);
  }
  for (const c of world.creeks) {
    lines.addPolyline(c.points, c.width / 2 + PAD.water + 4, c.width / 2 + PAD.water);
    addPts(c.points);
  }
  // Long landmarks (the old railway bank) keep fill off like a road.
  for (const l of world.landmarks) {
    if (!l.points) continue;
    lines.addPolyline(l.points, 4 + PAD.road + 4, 4 + PAD.road);
    addPts(l.points);
  }
  const polys = [];
  const addPoly = (poly, pad) => polys.push({ poly, pad, bb: bbox(poly) });
  for (const l of world.lakes) addPoly(l.polygon, PAD.lake);
  for (const f of world.forests) addPoly(f.polygon, PAD.forest);
  for (const f of world.fields || []) addPoly(f.polygon, PAD.authored);
  for (const p of makePads(world)) addPoly(rectPoly(p), PAD.yard);

  const circles = [];
  const addCircle = (x, y, r) => circles.push({ x, y, r });
  for (const b of world.buildings) addCircle(b.x, b.y, Math.hypot(b.w, b.h) / 2 + PAD.building);
  for (const t of world.towns) addCircle(t.x, t.y, (t.ambienceR || 150) + PAD.town);
  for (const p of world.places) addCircle(p.x, p.y, (p.r || 25) + PAD.place);
  for (const l of world.landmarks) addCircle(l.x, l.y, (l.r || l.clearR || 15) + PAD.landmark);
  for (const l of world.locals) addCircle(l.x, l.y, PAD.npc);
  for (const s of world.signs) addCircle(s.x, s.y, PAD.sign);
  for (const m of world.mailboxes) addCircle(m.x, m.y, PAD.mailbox);
  for (const b of world.bridges) addCircle(b.x, b.y, b.length / 2 + PAD.bridge);
  for (const w of WAYPOINTS) {
    let p = w;
    if (w.bridge) p = world.bridges.find((b) => b.id === w.bridge);
    if (w.town) p = world.towns.find((t) => t.id === w.town);
    if (p) addCircle(p.x, p.y, w.r + PAD.goal);
  }
  for (const p of world.places) addCircle(p.x, p.y, (p.r || 25) + PAD.goal);

  const W = world.size.w;
  const H = world.size.h;
  const inWorld = (x, y, m) => x >= m && y >= m && x <= W - m && y <= H - m;

  // Circle (x, y, r) is clear of everything.
  function circleOk(x, y, r) {
    if (!inWorld(x, y, PAD.edge + r)) return false;
    if (lines.minDist(x, y, (s) => s.data + r) < 0) return false;
    for (const c of circles) {
      const rr = c.r + r;
      if (Math.abs(x - c.x) < rr && Math.abs(y - c.y) < rr && Math.hypot(x - c.x, y - c.y) < rr) return false;
    }
    for (const p of polys) {
      const m = p.pad + r;
      if (x < p.bb.minX - m || x > p.bb.maxX + m || y < p.bb.minY - m || y > p.bb.maxY + m) continue;
      if (pointInPolygon(x, y, p.poly) || distToPolygonEdge(x, y, p.poly) < m) return false;
    }
    return true;
  }

  // Polygon is clear of everything (extra = more room all round).
  function polyOk(poly, extra = 0) {
    for (const [x, y] of poly) if (!inWorld(x, y, PAD.edge)) return false;
    const bb = bbox(poly);
    // Roads and water: sample the outline (4 m step, so allow 2 m error),
    // and make sure no road or creek vertex sits inside.
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
      for (let k = 0; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const y = a[1] + ((b[1] - a[1]) * k) / n;
        if (lines.minDist(x, y, (s) => s.data + 2 + extra) < 0) return false;
      }
    }
    for (let cx = Math.floor(bb.minX / PT_CELL); cx <= Math.floor(bb.maxX / PT_CELL); cx++) {
      for (let cy = Math.floor(bb.minY / PT_CELL); cy <= Math.floor(bb.maxY / PT_CELL); cy++) {
        for (const p of linePts.get(cx * 10000 + cy) || []) if (pointInPolygon(p[0], p[1], poly)) return false;
      }
    }
    for (const c of circles) {
      const rr = c.r + extra;
      if (c.x < bb.minX - rr || c.x > bb.maxX + rr || c.y < bb.minY - rr || c.y > bb.maxY + rr) continue;
      if (pointInPolygon(c.x, c.y, poly) || distToPolygonEdge(c.x, c.y, poly) < rr) return false;
    }
    for (const p of polys) {
      const m = p.pad + extra;
      if (bb.maxX < p.bb.minX - m || bb.minX > p.bb.maxX + m || bb.maxY < p.bb.minY - m || bb.minY > p.bb.maxY + m) continue;
      if (polyGap(poly, p.poly) < m) return false;
    }
    return true;
  }

  return { circleOk, polyOk, addPoly, addCircle, circles, polys };
}

// Each road with its cumulative lengths: { road, cum, total }.
function roadInfo(world) {
  return world.roads.map((road) => {
    const cum = measurePolyline(road.points);
    return { road, cum, total: cum[cum.length - 1] };
  });
}

export function generateFill(world) {
  const rng = makeRng((world.seed ^ 0x3f1e7d) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const keep = makeKeepOut(world);
  const roads = roadInfo(world);
  const fields = [];
  const props = [];

  // Authored fields with animals stay unique clues: no same-kind pasture near them.
  const authoredAnimals = (world.fields || []).filter((f) => f.animals);
  function animalAllowed(kind, poly) {
    for (const f of authoredAnimals) {
      if (f.animals.kind === kind && polyGap(poly, f.polygon) < 400) return false;
    }
    return true;
  }

  // ---------- Fields along the roads ----------
  // Each road side gets a field every so often, the two sides staggered.
  // A field is a rectangle set back from the road and lined up with it:
  // polygon[0] -> polygon[1] is the road side, polygon[2] -> polygon[3] the far side.
  function tryField(info, s, side, L, D) {
    const { road, cum, total } = info;
    if (s < 0 || s + L > total) return null;
    const p0 = pointAlong(road.points, cum, s);
    const p1 = pointAlong(road.points, cum, s + L);
    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < L * 0.85) return null; // road bends too much here
    dx /= len;
    dy /= len;
    const nx = -dy * side;
    const ny = dx * side;
    // Set back from the road edge, measured at the middle as well (the road may bulge).
    const mid = pointAlong(road.points, cum, s + L / 2);
    const bulge = Math.max(0, ((mid.x - p0.x) * nx + (mid.y - p0.y) * ny));
    const back = road.width / 2 + PAD.road + 3 + R(1, 8) + bulge;
    const a = [p0.x + nx * back, p0.y + ny * back];
    const b = [a[0] + dx * len, a[1] + dy * len];
    const c = [b[0] + nx * D, b[1] + ny * D];
    const d = [a[0] + nx * D, a[1] + ny * D];
    const poly = [a, b, c, d];
    return { poly, heading: headingOf(dx, dy), nx, ny, dx, dy, len };
  }

  for (const info of roads) {
    if (fields.length >= FIELD_BUDGET) break;
    if (info.total < 200) continue;
    const startSide = rng() < 0.5 ? 1 : -1;
    for (const side of [startSide, -startSide]) {
      let s = side === startSide ? R(10, 60) : R(150, 260);
      while (s < info.total - 60 && fields.length < FIELD_BUDGET) {
        let placed = null;
        for (let attempt = 0; attempt < 4 && !placed; attempt++) {
          const L = attempt < 2 ? R(100, 180) : R(70, 110);
          const D = attempt < 2 ? R(70, 140) : R(50, 80);
          const windbreak = rng() < 0.3;
          const f = tryField(info, s, side, L, D);
          if (!f) continue;
          // A windbreak needs a strip beyond the far edge: check a deeper box.
          const check = windbreak
            ? [f.poly[0], f.poly[1], [f.poly[2][0] + f.nx * 10, f.poly[2][1] + f.ny * 10], [f.poly[3][0] + f.nx * 10, f.poly[3][1] + f.ny * 10]]
            : f.poly;
          for (const q of fields) if (polyGap(check, q.polygon) < PAD.fill) { f.bad = true; break; }
          if (f.bad || !keep.polyOk(check)) continue;
          placed = { ...f, windbreak };
        }
        if (!placed) {
          s += 25;
          continue;
        }
        fields.push(makeField(placed, fields.length));
        // Pairs now and then (a fence line apart), else a long gap.
        s += placed.len + (rng() < 0.25 ? R(10, 16) : R(650, 950));
      }
    }
  }

  function makeField(f, i) {
    const poly = f.poly.map(([x, y]) => [r2(x), r2(y)]);
    const rowAngle = r1((f.heading + (rng() < 0.65 ? 0 : 90)) % 180);
    const out = { id: `pf_${i}`, procedural: true, kind: 'crop', polygon: poly, rowAngle, fence: null, windbreak: f.windbreak, animals: null };
    if (rng() < 0.42) {
      out.kind = 'pasture';
      const options = [['cows', 0.45], ['sheep', 0.3], ['horses', 0.25]].filter(([k]) => animalAllowed(k, poly));
      let roll = rng() * options.reduce((t, o) => t + o[1], 0);
      let kind = 'horses';
      for (const [k, w] of options) {
        if (roll < w) {
          kind = k;
          break;
        }
        roll -= w;
      }
      const area = polygonArea(poly);
      const n = kind === 'horses' ? 2 + Math.floor(rng() * 4) : kind === 'sheep' ? 6 + Math.floor(rng() * 7) : 4 + Math.floor(rng() * 5);
      out.animals = rng() < 0.9 ? { kind, count: Math.min(n, Math.max(2, Math.floor(area / 900))) } : null;
      out.fence = out.animals && out.animals.kind === 'horses' ? 'rail' : 'wire';
    } else {
      out.crop = pick(['wheat', 'wheat', 'corn', 'corn', 'hay', 'hay', 'plowed']);
      out.fence = rng() < 0.15 ? 'wire' : null;
    }
    return out;
  }

  // ---------- Props in fields ----------
  // Spots inside a polygon, `inset` from its edge, apart from other props.
  function propSpot(poly, inset, r) {
    const bb = bbox(poly);
    for (let k = 0; k < 30; k++) {
      const x = R(bb.minX, bb.maxX);
      const y = R(bb.minY, bb.maxY);
      if (!pointInPolygon(x, y, poly) || distToPolygonEdge(x, y, poly) < inset + r) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 3)) continue;
      return { x, y };
    }
    return null;
  }
  const allFields = [...(world.fields || []), ...fields];
  for (const f of allFields) {
    const isHay = f.kind === 'crop' && f.crop === 'hay';
    const isPasture = f.kind === 'pasture';
    if (!isHay && !(isPasture && f.procedural)) continue;
    if (isHay) {
      const n = Math.max(5, Math.min(14, Math.round(polygonArea(f.polygon) / 1800)));
      for (let k = 0; k < n; k++) {
        const p = propSpot(f.polygon, 5, BALE_R);
        if (p) props.push({ id: `pr_${props.length}`, kind: 'bale', x: r2(p.x), y: r2(p.y), r: BALE_R, angle: r1(R(0, 180)) });
      }
    }
    if ((isPasture && rng() < 0.4) || (isHay && rng() < 0.25)) {
      const p = propSpot(f.polygon, 6, HAYSTACK_R);
      if (p) props.push({ id: `pr_${props.length}`, kind: 'haystack', x: r2(p.x), y: r2(p.y), r: HAYSTACK_R, angle: r1(R(0, 360)) });
    }
  }
  for (const f of fields) keep.addPoly(f.polygon, PAD.fill);

  // ---------- Power lines on paved roads ----------
  const powerLines = makePowerLines(world, fields, props);

  // ---------- Rock clusters where the road is still empty ----------
  // Walk each road; wherever nothing stands within REACH m for more than GAP m,
  // drop a small cluster of rocks in open ground beside it.
  const REACH = 70;
  const GAP = 180;
  const things = makeCoverage(world, fields, props);
  for (const info of roads) {
    const { road, cum, total } = info;
    let run = 0;
    for (let s = 0; s <= total; s += 10) {
      const p = pointAlong(road.points, cum, s);
      if (things.rural(p.x, p.y) === false || things.covered(p.x, p.y, REACH)) {
        run = 0;
        continue;
      }
      run += 10;
      if (run < GAP) continue;
      // Try a cluster around the middle of the empty run.
      const cluster = rockCluster(info, s - run / 2, road);
      if (cluster) {
        props.push(...cluster);
        for (const r of cluster) things.add(r.x, r.y);
      }
      run = 0;
    }
  }

  function rockCluster(info, s0, road) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const s = s0 + R(-60, 60);
      if (s < 0 || s > info.total) continue;
      const p = pointAlong(road.points, info.cum, s);
      const side = rng() < 0.5 ? 1 : -1;
      const off = road.width / 2 + PAD.road + 8 + R(0, 30);
      const cx = p.x - p.dy * off * side;
      const cy = p.y + p.dx * off * side;
      if (!keep.circleOk(cx, cy, 6)) continue;
      if (props.some((q) => Math.hypot(q.x - cx, q.y - cy) < 6 + q.r + PAD.fill)) continue;
      if (powerLines.some((l) => l.poles.some((q) => Math.hypot(q.x - cx, q.y - cy) < 6 + PAD.fill))) continue;
      const n = 2 + Math.floor(rng() * 4);
      const out = [];
      for (let k = 0; k < n * 4 && out.length < n; k++) {
        const r = R(0.4, 1.5);
        const a = R(0, Math.PI * 2);
        const d = out.length ? R(1.5, 5 - r) : 0;
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d;
        if (out.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r + 0.4)) continue;
        out.push({ id: '', kind: 'rock', x: r2(x), y: r2(y), r: r2(r), angle: r1(R(0, 360)) });
      }
      out.forEach((q, k) => { q.id = `pr_${props.length + k}`; });
      keep.addCircle(cx, cy, 6 + PAD.fill);
      return out;
    }
    return null;
  }

  return { fields, props, powerLines };
}

// Things a driver would notice beside the road, for the gap filler.
function makeCoverage(world, fields, props) {
  const idx = new SegIndex(64);
  const REACH = 90;
  const addPoly = (poly) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      idx.add(a[0], a[1], b[0], b[1], REACH);
    }
  };
  for (const f of world.fields || []) addPoly(f.polygon);
  for (const f of fields) addPoly(f.polygon);
  for (const f of world.forests) addPoly(f.polygon);
  for (const l of world.lakes) addPoly(l.polygon);
  for (const c of world.creeks) idx.addPolyline(c.points, REACH);
  const add = (x, y) => idx.add(x, y, x, y, REACH);
  for (const b of world.buildings) add(b.x, b.y);
  for (const l of world.landmarks) add(l.x, l.y);
  for (const p of props) add(p.x, p.y);
  const forests = world.forests;
  return {
    add,
    covered(x, y, reach) {
      if (forests.some((f) => pointInPolygon(x, y, f.polygon))) return true;
      return idx.minDist(x, y) <= reach;
    },
    rural(x, y) {
      return !world.towns.some((t) => Math.hypot(t.x - x, t.y - y) < (t.ambienceR || 150));
    },
  };
}

// True if the wire span a-b crosses any road centre line.
export function spanCrossesRoad(world, a, b) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const pa = [a.x, a.y];
  const pb = [b.x, b.y];
  for (const r of world.roads) {
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      if (Math.max(p[0], q[0]) < minX || Math.min(p[0], q[0]) > maxX || Math.max(p[1], q[1]) < minY || Math.min(p[1], q[1]) > maxY) continue;
      if (segsCross(pa, pb, p, q)) return true;
    }
  }
  return false;
}

// Poles about POLE_STEP m apart on one side of each paved road. A pole that
// would land on something moves a little along the road or is left out.
function makePowerLines(world, fields, props) {
  const roadIdx = new SegIndex(32);
  for (const r of world.roads) roadIdx.addPolyline(r.points, r.width / 2 + 3, r.width / 2 + 2.5);
  const waterIdx = new SegIndex(32);
  for (const c of world.creeks) waterIdx.addPolyline(c.points, c.width / 2 + 6, c.width / 2 + 5);
  const allFields = [...(world.fields || []), ...fields];
  const blds = world.buildings.map((b) => ({ x: b.x, y: b.y, w: b.w + 6, h: b.h + 6, angle: b.angle || 0 }));
  const spots = [
    ...world.signs.map((s) => ({ x: s.x, y: s.y, r: 5 })),
    ...world.mailboxes.map((m) => ({ x: m.x, y: m.y, r: 4 })),
    ...world.locals.map((l) => ({ x: l.x, y: l.y, r: 5 })),
    ...world.bridges.map((b) => ({ x: b.x, y: b.y, r: b.length / 2 + 6 })),
    ...world.landmarks.map((l) => ({ x: l.x, y: l.y, r: l.r ? l.r + 10 : l.clearR || 20 })),
    ...props.map((p) => ({ x: p.x, y: p.y, r: p.r + 3 })),
  ];
  function ok(x, y) {
    if (x < 5 || y < 5 || x > world.size.w - 5 || y > world.size.h - 5) return false;
    if (roadIdx.minDist(x, y, (s) => s.data) < 0) return false;
    if (waterIdx.minDist(x, y, (s) => s.data) < 0) return false;
    for (const l of world.lakes) if (pointInPolygon(x, y, l.polygon) || distToPolygonEdge(x, y, l.polygon) < 5) return false;
    for (const b of blds) if (Math.abs(b.x - x) < 40 && Math.abs(b.y - y) < 40 && circleHitsRect(x, y, POLE_R, b)) return false;
    for (const s of spots) if (Math.hypot(s.x - x, s.y - y) < s.r) return false;
    for (const f of allFields) if (pointInPolygon(x, y, f.polygon) || distToPolygonEdge(x, y, f.polygon) < 2) return false;
    return true;
  }
  const lines = [];
  for (const road of world.roads) {
    if (road.type !== 'paved' || road.length < 150) continue;
    const cum = measurePolyline(road.points);
    const total = cum[cum.length - 1];
    const off = road.width / 2 + 3.5;
    // Try both sides, keep the one with more poles.
    let best = null;
    for (const side of [1, -1]) {
      const poles = [];
      for (let s = 8; s <= total - 4; s += POLE_STEP) {
        for (const ds of [0, 6, -6, 12, -12, 18, -18]) {
          const d = s + ds;
          if (d < 0 || d > total) continue;
          const p = pointAlong(road.points, cum, d);
          const x = p.x - p.dy * off * side;
          const y = p.y + p.dx * off * side;
          if (!ok(x, y)) continue;
          poles.push({ x: r2(x), y: r2(y), along: d });
          break;
        }
      }
      if (!best || poles.length > best.length) best = poles;
    }
    // Split where poles are missing for a long way (a river crossing, a town
    // square), and wherever a span would cross a road (own road included):
    // every line keeps to one side and never wires over a junction.
    let cur = [];
    const flush = () => {
      if (cur.length >= 2) lines.push({ id: `pl_${road.id}_${lines.filter((l) => l.roadId === road.id).length}`, roadId: road.id, poles: cur.map(({ x, y }) => ({ x, y })) });
      cur = [];
    };
    for (const p of best) {
      const prev = cur[cur.length - 1];
      if (prev && (p.along - prev.along > POLE_STEP * 2.6 || spanCrossesRoad(world, prev, p))) flush();
      cur.push(p);
    }
    flush();
  }
  return lines;
}

// Exported for checks.
export const FILL_PAD = PAD;
export const FILL_WAYPOINTS = WAYPOINTS;
export { POLE_R, polyGap };
