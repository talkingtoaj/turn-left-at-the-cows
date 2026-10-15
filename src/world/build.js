// Build step: turns the authored WORLD_SOURCE (control points, road-relative
// signs) into the WORLD every scene reads (dense smooth polylines, computed
// bridge positions, sign positions). Pure data in, pure data out.

import { smoothPolyline, polylineLength } from './spline.js';
import { nearestOnPolyline, headingOf, polylineCrossings, DEG } from '../drive/geom.js';
import { TOPICS } from './topics.js';
import { generateFill, fieldDefaults } from './fill.js';

const STEP = 9; // metres per polyline piece after smoothing

const clone = (o) => JSON.parse(JSON.stringify(o));

// Unit tangent of a dense polyline around distance `along`, averaged over +-span.
function tangentAt(pts, along, span = 10) {
  const a = pointAtDistance(pts, Math.max(0, along - span));
  const b = pointAtDistance(pts, along + span);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

function pointAtDistance(pts, d) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (acc + l >= d) {
      const t = l ? (d - acc) / l : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    acc += l;
  }
  return pts[pts.length - 1];
}

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}

// Builds one road: snaps its ends onto earlier roads, then smooths it.
function buildRoad(src, built) {
  const r = { ...src };
  const cps = src.points.map((p) => [p[0], p[1]]);
  const snap = (idx, targetId) => {
    const target = built.get(targetId);
    if (!target) throw new Error(`road ${src.id}: snap target ${targetId} not built yet`);
    const q = nearestOnPolyline(cps[idx][0], cps[idx][1], target.points);
    cps[idx] = [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100];
  };
  if (src.snapStart) snap(0, src.snapStart);
  if (src.snapEnd) snap(cps.length - 1, src.snapEnd);
  r.controlPoints = cps;
  r.points = smoothPolyline(cps, { step: STEP, curve: src.curve !== false });
  r.length = Math.round(polylineLength(r.points));
  delete r.snapStart;
  delete r.snapEnd;
  return r;
}

// Places a bridge where its road crosses its creek, and straightens the road
// across the deck so the car stays on it.
function buildBridge(src, roads, creeks) {
  const road = roads.get(src.roadId);
  const creek = creeks.get(src.creekId);
  if (!road || !creek) throw new Error(`bridge ${src.id}: missing road or creek`);
  const hits = polylineCrossings(road.points, creek.points);
  if (!hits.length) throw new Error(`bridge ${src.id}: ${src.roadId} does not cross ${src.creekId}`);
  let hit = hits[0];
  if (src.near) {
    let best = Infinity;
    for (const h of hits) {
      const d = Math.hypot(h.x - src.near[0], h.y - src.near[1]);
      if (d < best) {
        best = d;
        hit = h;
      }
    }
  }
  const cum = cumulative(road.points);
  const along = cum[hit.i] + Math.hypot(hit.x - road.points[hit.i][0], hit.y - road.points[hit.i][1]);
  const [tx, ty] = tangentAt(road.points, along, src.length / 2);

  // Straighten: full projection over the deck (+6 m), fading out over 20 m.
  const full = src.length / 2 + 6;
  const fade = 20;
  road.points = road.points.map((p, i) => {
    if (Math.abs(cum[i] - along) > full + fade + 10) return p;
    const s = (p[0] - hit.x) * tx + (p[1] - hit.y) * ty;
    const as = Math.abs(s);
    if (as > full + fade) return p;
    const w = as <= full ? 1 : 1 - (as - full) / fade;
    const qx = hit.x + tx * s;
    const qy = hit.y + ty * s;
    return [p[0] + (qx - p[0]) * w, p[1] + (qy - p[1]) * w];
  });

  const b = { ...src };
  delete b.near;
  b.x = Math.round(hit.x * 100) / 100;
  b.y = Math.round(hit.y * 100) / 100;
  b.angle = Math.round(headingOf(tx, ty) * 10) / 10;
  b.waterWidth = creek.width;
  return b;
}

// Right-hand normal of a unit direction (y grows south).
const rightOf = (dx, dy) => [-dy, dx];

// Sign position from its road-relative description.
function placeSign(src, roads) {
  const s = { ...src };
  const road = roads.get(src.roadId);
  if (!road) throw new Error(`sign ${src.id}: unknown road ${src.roadId}`);
  const q = nearestOnPolyline(src.near[0], src.near[1], road.points);
  const fx = Math.sin(src.facing * DEG);
  const fy = -Math.cos(src.facing * DEG);
  // Road direction pointing the same way as the reader travels.
  let tx = q.dx;
  let ty = q.dy;
  if (tx * fx + ty * fy < 0) {
    tx = -tx;
    ty = -ty;
  }
  const [rx, ry] = rightOf(tx, ty);
  const side = src.side === 'left' ? -1 : 1;
  const off = road.width / 2 + (src.offset ?? 3);
  s.x = Math.round((q.x + rx * off * side) * 100) / 100;
  s.y = Math.round((q.y + ry * off * side) * 100) / 100;
  delete s.near;
  delete s.offset;
  return s;
}

// Mailbox at the roadside nearest its house, facing the road.
function placeMailbox(src, roads, buildings) {
  const road = roads.get(src.roadId);
  const house = buildings.get(src.house);
  if (!road || !house) throw new Error(`mailbox ${src.id}: missing road or house`);
  const q = nearestOnPolyline(house.x, house.y, road.points);
  const dx = house.x - q.x;
  const dy = house.y - q.y;
  const l = Math.hypot(dx, dy) || 1;
  const off = road.width / 2 + 1.5;
  const x = q.x + (dx / l) * off;
  const y = q.y + (dy / l) * off;
  return {
    id: src.id, name: src.name, house: src.house, roadId: src.roadId,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    facing: Math.round(headingOf(-dx, -dy)), // door looks at the road
  };
}

// Default sign facing from the nearest road tangent: the heading of a car
// that has the sign on its right-hand side.
export function defaultSignFacing(world, x, y) {
  let best = null;
  for (const r of world.roads) {
    const q = nearestOnPolyline(x, y, r.points);
    if (!best || q.d < best.d) best = q;
  }
  if (!best) return 0;
  const [rx, ry] = rightOf(best.dx, best.dy);
  const onRight = (x - best.x) * rx + (y - best.y) * ry >= 0;
  return Math.round(onRight ? headingOf(best.dx, best.dy) : headingOf(-best.dx, -best.dy));
}

export function buildWorld(source) {
  const src = clone(source);
  const w = { ...src };

  // Water first (roads do not depend on it, bridges need both).
  w.creeks = src.creeks.map((c) => ({
    ...c,
    controlPoints: c.points,
    points: smoothPolyline(c.points, { step: STEP, curve: c.curve !== false }),
  }));
  const creeks = new Map(w.creeks.map((c) => [c.id, c]));

  const roads = new Map();
  for (const r of src.roads) roads.set(r.id, buildRoad(r, roads));
  w.bridges = src.bridges.map((b) => buildBridge(b, roads, creeks));
  w.roads = [...roads.values()];

  const buildings = new Map(src.buildings.map((b) => [b.id, b]));
  const bridges = new Map(w.bridges.map((b) => [b.id, b]));
  w.landmarks = src.landmarks.map((l) => {
    if (!l.bridgeId) return l;
    const b = bridges.get(l.bridgeId);
    return { ...l, x: b.x, y: b.y, angle: b.angle };
  });

  w.signs = src.signs.map((s) => placeSign(s, roads));
  w.mailboxes = src.mailboxes.map((m) => placeMailbox(m, roads, buildings));

  // Printed maps: extra roads in lies are built like real roads.
  for (const def of Object.values(w.printedMaps)) {
    def.lies = def.lies.map((lie) => (lie.type === 'extra_road' ? { ...lie, road: buildRoad(lie.road, roads) } : lie));
  }
  // Legacy alias: the 1987 county map.
  w.oldMap = w.printedMaps.county1987;

  // Legacy: WORLD.goal is mission 1's goal. Game code should use
  // currentGoal(state) from src/game/missions.js instead.
  const farm = w.places.find((p) => p.id === 'hartley_farm');
  w.goal = { x: farm.x, y: farm.y, r: farm.r, name: farm.name };

  // Countryside fill: procedural fields, props and power lines (src/world/fill.js).
  w.fields = (src.fields || []).map(fieldDefaults);
  const fill = generateFill(w);
  w.fields = w.fields.concat(fill.fields);
  w.props = fill.props;
  w.powerLines = fill.powerLines;

  w.topics = TOPICS;
  return w;
}
