// Printed maps: turns a map definition (WORLD.printedMaps[id]) into the plain
// lists a renderer draws, with the map's lies applied. Never includes the
// player or any position marker.
//
// Lie types:
//   hide_road { roadId }            road (and its bridges) left off
//   extra_road { road }             a road that does not exist (built like a real road)
//   bridge_intact { bridgeId }      a broken bridge shown as fine
//   simplify_road { roadId, keep }  road drawn as `keep` straight pieces
//   rename_road { roadId, name }    road given the wrong name
//   extend_road { roadId, points }  road drawn going further than it does
//   extra_place { place }           { id, name, x, y, symbol? } that is not there
//   extra_lake { lake }             { id, name, polygon } in the wrong place
//   extra_landmark { landmark }     { id, kind, name, x, y }
//   hide_landmark { id }
//   hide_building { id }            building left off (built after the map)
//   move { what: 'landmark'|'town'|'place', id, dx, dy }
//   scale { about: [x, y], sx, sy } whole map stretched (bad sense of distance)

import { WORLD, regionWorld, REGION_IDS } from '../world/world.js';
import { currentMission } from './missions.js';

export function getPrintedMap(id) {
  return WORLD.printedMaps[id] || null;
}

// A printed map by id in any region: { def, world }, the current region
// first (a sketch drawn on a map may be looked at from another region).
export function findPrintedMap(id) {
  if (WORLD.printedMaps[id]) return { def: WORLD.printedMaps[id], world: WORLD };
  for (const r of REGION_IDS) {
    const w = regionWorld(r);
    if (w.printedMaps[id]) return { def: w.printedMaps[id], world: w };
  }
  return null;
}

// Printed maps the player has in the current mission (definitions, in order).
export function printedMapsFor(state) {
  const m = currentMission(state);
  const ids = m ? m.printedMaps : ['county1987'];
  return ids.map(getPrintedMap).filter(Boolean);
}

const KINDS = ['roads', 'creeks', 'lakes', 'bridges', 'towns', 'buildings', 'landmarks', 'places', 'forests'];

function pick(def, kind, list) {
  // Landmarks marked printed: false (ruins, windpumps) never show on printed maps.
  if (kind === 'landmarks') list = list.filter((l) => l.printed !== false);
  if (def.include === 'all' || !def.include) return list;
  const ids = def.include[kind];
  if (ids === 'all') return list;
  if (!ids) return [];
  return list.filter((x) => ids.includes(x.id));
}

// Returns { def, bounds, roads, creeks, lakes, bridges, towns, buildings,
// landmarks, places, forests, notes }. Lines are clipped to def.bounds (a
// line may come back as several pieces with the same id), points outside
// are dropped. Coordinates are world metres, after any `scale` lie.
export function resolvePrintedMap(def, world = WORLD) {
  const lies = def.lies || [];
  const of = (type) => lies.filter((l) => l.type === type);
  const out = {};
  for (const k of KINDS) out[k] = pick(def, k, world[k] || []).map((x) => ({ ...x }));

  const hidden = new Set(of('hide_road').map((l) => l.roadId));
  out.roads = out.roads.filter((r) => !hidden.has(r.id));
  out.bridges = out.bridges.filter((b) => !hidden.has(b.roadId));
  for (const l of of('extra_road')) out.roads.push({ ...l.road });
  const fixed = new Set(of('bridge_intact').map((l) => l.bridgeId));
  out.bridges = out.bridges.map((b) => ({ ...b, intact: b.intact || fixed.has(b.id) }));
  for (const l of of('simplify_road')) {
    const r = out.roads.find((q) => q.id === l.roadId);
    if (r) {
      const n = Math.max(2, l.keep || 2);
      r.points = Array.from({ length: n }, (_, i) => r.points[Math.round((i * (r.points.length - 1)) / (n - 1))]);
    }
  }
  for (const l of of('rename_road')) {
    const r = out.roads.find((q) => q.id === l.roadId);
    if (r) r.name = l.name;
  }
  for (const l of of('extend_road')) {
    const r = out.roads.find((q) => q.id === l.roadId);
    if (r) r.points = r.points.concat(l.points);
  }
  for (const l of of('extra_place')) out.places.push({ ...l.place });
  for (const l of of('extra_lake')) out.lakes.push({ ...l.lake });
  for (const l of of('extra_landmark')) out.landmarks.push({ ...l.landmark });
  const hiddenBl = new Set(of('hide_building').map((l) => l.id));
  out.buildings = out.buildings.filter((b) => !hiddenBl.has(b.id));
  const hiddenLm = new Set(of('hide_landmark').map((l) => l.id));
  out.landmarks = out.landmarks.filter((l) => !hiddenLm.has(l.id));
  for (const l of of('move')) {
    const list = out[l.what + 's'] || [];
    const f = list.find((q) => q.id === l.id);
    if (f) {
      f.x += l.dx;
      f.y += l.dy;
    }
  }
  out.notes = (def.notes || []).map((n) => ({ ...n }));

  // Clip to the map's area.
  const b = def.bounds || { x: 0, y: 0, w: world.size.w, h: world.size.h };
  const inside = (p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const clipLines = (list) => list.flatMap((f) => clipPolyline(f.points, b).map((points) => ({ ...f, points })));
  out.roads = clipLines(out.roads);
  out.creeks = clipLines(out.creeks);
  out.lakes = out.lakes.map((l) => ({ ...l, polygon: clipPolygon(l.polygon, b) })).filter((l) => l.polygon.length >= 3);
  out.forests = out.forests.map((f) => ({ ...f, polygon: clipPolygon(f.polygon, b) })).filter((f) => f.polygon.length >= 3);
  for (const k of ['bridges', 'towns', 'buildings', 'landmarks', 'places']) out[k] = out[k].filter(inside);

  // Distortion of the whole sheet.
  for (const l of of('scale')) {
    const [ax, ay] = l.about;
    const fx = (x) => ax + (x - ax) * l.sx;
    const fy = (y) => ay + (y - ay) * l.sy;
    const pts = (a) => a.map(([x, y]) => [fx(x), fy(y)]);
    for (const r of out.roads) r.points = pts(r.points);
    for (const c of out.creeks) c.points = pts(c.points);
    for (const lk of out.lakes) lk.polygon = pts(lk.polygon);
    for (const f of out.forests) f.polygon = pts(f.polygon);
    for (const k of ['bridges', 'towns', 'buildings', 'landmarks', 'places', 'notes']) {
      for (const p of out[k]) {
        p.x = fx(p.x);
        p.y = fy(p.y);
      }
    }
  }
  out.def = def;
  out.bounds = b;
  return out;
}

// Clips a polyline to a rect; returns a list of pieces.
export function clipPolyline(pts, r) {
  const pieces = [];
  let cur = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], r);
    if (!seg) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    const [a, c] = seg;
    if (!cur.length) cur.push(a);
    else {
      const last = cur[cur.length - 1];
      if (Math.abs(last[0] - a[0]) > 1e-6 || Math.abs(last[1] - a[1]) > 1e-6) {
        if (cur.length > 1) pieces.push(cur);
        cur = [a];
      }
    }
    cur.push(c);
    // Segment left the rect: close this piece.
    if (c[0] !== pts[i + 1][0] || c[1] !== pts[i + 1][1]) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}

// Liang-Barsky segment clip. Returns [a, b] or null.
function clipSegment(p, q, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const tests = [[-dx, p[0] - r.x], [dx, r.x + r.w - p[0]], [-dy, p[1] - r.y], [dy, r.y + r.h - p[1]]];
  for (const [pp, qq] of tests) {
    if (pp === 0) {
      if (qq < 0) return null;
    } else {
      const t = qq / pp;
      if (pp < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  const a = t0 === 0 ? p : [p[0] + dx * t0, p[1] + dy * t0];
  const b = t1 === 1 ? q : [p[0] + dx * t1, p[1] + dy * t1];
  return [a, b];
}

// Sutherland-Hodgman polygon clip to a rect.
export function clipPolygon(poly, r) {
  const edges = [
    (p) => p[0] >= r.x, (p) => p[0] <= r.x + r.w, (p) => p[1] >= r.y, (p) => p[1] <= r.y + r.h,
  ];
  const cut = [
    (a, b) => lerpAt(a, b, (r.x - a[0]) / (b[0] - a[0])),
    (a, b) => lerpAt(a, b, (r.x + r.w - a[0]) / (b[0] - a[0])),
    (a, b) => lerpAt(a, b, (r.y - a[1]) / (b[1] - a[1])),
    (a, b) => lerpAt(a, b, (r.y + r.h - a[1]) / (b[1] - a[1])),
  ];
  let out = poly;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const inC = edges[e](cur);
      const inP = edges[e](prev);
      if (inC) {
        if (!inP) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (inP) out.push(cut[e](prev, cur));
    }
  }
  return out;
}

const lerpAt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
