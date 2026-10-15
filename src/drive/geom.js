// Small geometry and random helpers used by the Drive scene.
// All angles in degrees, 0 = north, clockwise. y grows south.

// Seeded PRNG (mulberry32). Returns a function giving floats in [0, 1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple string hash, handy for giving each building a stable look.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const DEG = Math.PI / 180;

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

export function distToPolyline(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// Distance to the edge of a closed polygon.
export function distToPolygonEdge(px, py, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = distToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

export function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

// Local frame -> world. Local x is "right", local y is "down/back" when angle = 0.
// Rotating by `angleDeg` turns the frame clockwise on screen.
export function localToWorld(cx, cy, angleDeg, lx, ly) {
  const c = Math.cos(angleDeg * DEG);
  const s = Math.sin(angleDeg * DEG);
  return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
}

// World -> local frame (inverse of localToWorld).
export function worldToLocal(cx, cy, angleDeg, px, py) {
  const c = Math.cos(angleDeg * DEG);
  const s = Math.sin(angleDeg * DEG);
  const dx = px - cx;
  const dy = py - cy;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

// Rect is { x, y, w, h, angle } centred on (x, y). w runs along local x, h along local y.
export function pointInRect(px, py, r) {
  const p = worldToLocal(r.x, r.y, r.angle || 0, px, py);
  return Math.abs(p.x) <= r.w / 2 && Math.abs(p.y) <= r.h / 2;
}

export function circleHitsRect(px, py, radius, r) {
  const p = worldToLocal(r.x, r.y, r.angle || 0, px, py);
  const hw = r.w / 2;
  const hh = r.h / 2;
  const qx = Math.max(-hw, Math.min(hw, p.x)) - p.x;
  const qy = Math.max(-hh, Math.min(hh, p.y)) - p.y;
  return qx * qx + qy * qy < radius * radius;
}

// Polyline helper: cumulative lengths, and a point (plus unit direction) at a distance.
export function measurePolyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return cum;
}

export function pointAlong(pts, cum, d) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / segLen));
  const dx = (b[0] - a[0]) / segLen;
  const dy = (b[1] - a[1]) / segLen;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx, dy, seg: i - 1 };
}

// Spatial index of line segments (and discs, as zero-length segments).
// Each item is stored in every grid cell its bounding box, grown by `pad`,
// touches. So a query at (x, y) sees every item within `pad` of that point.
export class SegIndex {
  constructor(cell = 48) {
    this.cell = cell;
    this.grid = new Map();
    this.count = 0;
  }

  // Adds segment a-b. `pad` is the largest distance it will be queried at.
  add(ax, ay, bx, by, pad, data = null) {
    const item = { ax, ay, bx, by, pad, data };
    const c = this.cell;
    const x0 = Math.floor((Math.min(ax, bx) - pad) / c);
    const x1 = Math.floor((Math.max(ax, bx) + pad) / c);
    const y0 = Math.floor((Math.min(ay, by) - pad) / c);
    const y1 = Math.floor((Math.max(ay, by) + pad) / c);
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) {
        const k = i * 100003 + j;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(item);
      }
    }
    this.count++;
    return item;
  }

  // Adds every segment of a polyline.
  addPolyline(pts, pad, data = null) {
    for (let i = 0; i < pts.length - 1; i++) this.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pad, data);
  }

  // Items stored in the cell holding (x, y). May include far ones; check distance.
  near(x, y) {
    return this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(y / this.cell)) || EMPTY;
  }

  // Smallest distance from (x, y) to an item, minus `bias(item)` if given.
  // Returns Infinity when nothing is within reach.
  minDist(x, y, bias = null) {
    let best = Infinity;
    for (const s of this.near(x, y)) {
      let d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      if (bias) d -= bias(s);
      if (d < best) best = d;
    }
    return best;
  }
}
const EMPTY = [];

// Closest point on a polyline: { x, y, d, seg, t, along, dx, dy } where
// (dx, dy) is the unit direction of that segment and `along` the distance
// from the start of the polyline.
export function nearestOnPolyline(px, py, pts) {
  let best = null;
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const len = Math.sqrt(l2);
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + dx * t;
    const y = ay + dy * t;
    const d = Math.hypot(px - x, py - y);
    if (!best || d < best.d) {
      best = { x, y, d, seg: i, t, along: along + len * t, dx: dx / (len || 1), dy: dy / (len || 1) };
    }
    along += len;
  }
  return best;
}

// Heading (deg, 0 = north, clockwise) of a direction vector in world axes.
export function headingOf(dx, dy) {
  const h = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (h + 360) % 360;
}

// All crossings of two polylines: [{ x, y, i, j }] (i, j = segment indexes).
export function polylineCrossings(a, b) {
  const out = [];
  for (let i = 0; i < a.length - 1; i++) {
    const [x1, y1] = a[i];
    const [x2, y2] = a[i + 1];
    for (let j = 0; j < b.length - 1; j++) {
      const [x3, y3] = b[j];
      const [x4, y4] = b[j + 1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), i, j });
    }
  }
  return out;
}
