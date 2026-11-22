// Collision and surface queries for the car.

import {
  pointInPolygon, distToPolygonEdge, pointInRect, circleHitsRect, bbox, DEG, SegIndex, distToSegment,
} from './geom.js';
import {
  buildingSolids, landmarkSolids, fenceSolids, TREE_HIT_R, LOCAL_HIT_R, POLE_R,
} from './layout.js';

const CELL = 32;

// Car hit shape: three circles along its long axis (covers ~4.5 x 2 m).
export const CAR_CIRCLES = [-1.25, 0, 1.25];
export const CAR_R = 1.0;
// Wheel spots in car space: [right, forward] metres (front left, front right,
// rear left, rear right).
export const WHEELS = [[-0.85, 1.42], [0.85, 1.42], [-0.85, -1.38], [0.85, -1.38]];
// Unit directions probed around a blocked car circle to find the contact side.
const PROBES = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)]);

export class Collider {
  // opts.staticLocals (default true): people are fixed circles at their home
  // spot. Pass false when the caller moves people and fills `dynamic` instead.
  constructor(world, scenery, opts = {}) {
    this.world = world;
    this.grid = new Map();
    // Moving obstacles (people, traffic), refilled by the caller each frame:
    // [{ x, y, r }]. Checked after the static grid.
    this.dynamic = [];
    // Surface events (not solid): potholes and the like, things the wheels roll
    // over. Static ones go in a grid (addSurfaceEvents); `surfaceDynamic` is
    // refilled by the caller like `dynamic`. Items: { x, y, r, kind, ... }.
    this.surfaceGrid = new Map();
    this.surfaceDynamic = [];

    // Solid things go into a spatial grid so each query only checks nearby ones.
    for (const b of world.buildings) this.addSolids(buildingSolids(b));
    // Things that belong to one mission (`onlyMission`: a tourist, her car) are
    // solid only while that mission plays (set `collider.mission`).
    this.mission = null;
    for (const l of world.landmarks) {
      const solids = landmarkSolids(l, world);
      if (l.onlyMission) for (const s of [...solids.rects, ...solids.circles]) s.only = l.onlyMission;
      this.addSolids(solids);
    }
    this.addSolids(fenceSolids(world));
    for (const t of scenery.trees) this.addCircle({ x: t.x, y: t.y, r: TREE_HIT_R, kind: 'tree' });
    // Countryside fill: bales, haystacks, rocks and power poles.
    for (const p of world.props || []) this.addCircle({ x: p.x, y: p.y, r: p.r, kind: p.kind });
    for (const p of world.dressing || []) if (p.r) this.addCircle({ x: p.x, y: p.y, r: p.r, kind: 'prop' });
    for (const l of world.powerLines || []) for (const p of l.poles) this.addCircle({ x: p.x, y: p.y, r: POLE_R, kind: 'pole' });
    if (opts.staticLocals !== false) {
      for (const l of world.locals) this.addCircle({ x: l.x, y: l.y, r: LOCAL_HIT_R, only: l.onlyMission });
    }

    this.intactBridges = world.bridges
      .filter((b) => b.intact)
      .map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.length, angle: b.angle, roadId: b.roadId, kind: b.kind }));
    // Roads and water in spatial indexes (each segment knows its road/creek).
    this.roadIndex = new SegIndex(32);
    for (const r of world.roads) this.roadIndex.addPolyline(r.points, r.width / 2 + 0.5, r);
    this.waterIndex = new SegIndex(32);
    for (const c of world.creeks) this.waterIndex.addPolyline(c.points, c.width / 2 + 2, c);
    this.lakes = world.lakes.map((l) => ({ ...l, bb: bbox(l.polygon) }));
  }

  addSolids({ rects, circles }) {
    for (const r of rects) {
      const ext = Math.hypot(r.w, r.h) / 2;
      this.insert({ type: 'rect', ...r }, r.x - ext, r.y - ext, r.x + ext, r.y + ext);
    }
    for (const c of circles) this.addCircle(c);
  }

  addCircle(c) {
    this.insert({ type: 'circle', ...c }, c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
  }

  insert(item, x0, y0, x1, y1) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = cx * 10000 + cy;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(item);
      }
    }
  }

  onIntactBridge(x, y) {
    for (const b of this.intactBridges) if (pointInRect(x, y, b)) return b;
    return null;
  }

  // True if a circle of radius r at (x, y) touches anything solid.
  circleBlocked(x, y, r) {
    return this.circleHit(x, y, r) !== null;
  }

  // What a circle of radius r at (x, y) touches: the solid item (it may carry
  // a `kind`), a dynamic item, or one of the strings 'edge', 'water', 'lake'.
  // Null when clear.
  circleHit(x, y, r) {
    const { w, h } = this.world.size;
    if (x - r < 0 || y - r < 0 || x + r > w || y + r > h) return 'edge';

    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
        const list = this.grid.get(cx * 10000 + cy);
        if (!list) continue;
        for (const s of list) {
          if (s.only && s.only !== this.mission) continue;
          if (s.type === 'circle') {
            const dx = s.x - x;
            const dy = s.y - y;
            const rr = s.r + r;
            if (dx * dx + dy * dy < rr * rr) return s;
          } else if (circleHitsRect(x, y, r, s)) return s;
        }
      }
    }

    for (const c of this.dynamic) {
      const dx = c.x - x;
      const dy = c.y - y;
      const rr = c.r + r;
      if (dx * dx + dy * dy < rr * rr) return c;
    }

    // Creek water blocks unless this point is on an intact bridge deck.
    for (const s of this.waterIndex.near(x, y)) {
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      if (d < s.data.width / 2 + r * 0.5) {
        if (!this.onIntactBridge(x, y)) return 'water';
        break;
      }
    }

    for (const l of this.lakes) {
      if (x < l.bb.minX - r || x > l.bb.maxX + r || y < l.bb.minY - r || y > l.bb.maxY + r) continue;
      if (pointInPolygon(x, y, l.polygon) || distToPolygonEdge(x, y, l.polygon) < r * 0.5) return 'lake';
    }
    return null;
  }

  // Car at (x, y) facing heading (degrees).
  carBlocked(x, y, heading) {
    const sx = Math.sin(heading * DEG);
    const sy = -Math.cos(heading * DEG);
    for (const off of CAR_CIRCLES) {
      if (this.circleBlocked(x + sx * off, y + sy * off, CAR_R)) return true;
    }
    return false;
  }

  // Where the car at (x, y, heading) touches something: probes a ring of
  // small points around each car circle that is blocked. Returns
  // { dx, dy, kind } where (dx, dy) is the unit direction from the car toward
  // what it hit, and kind is the hit item's kind (or 'edge', 'water', ...),
  // or null when nothing touches.
  contact(x, y, heading) {
    const sx = Math.sin(heading * DEG);
    const sy = -Math.cos(heading * DEG);
    let ax = 0;
    let ay = 0;
    let kind = null;
    let any = false;
    for (const off of CAR_CIRCLES) {
      const cx = x + sx * off;
      const cy = y + sy * off;
      const hit = this.circleHit(cx, cy, CAR_R);
      if (hit === null) continue;
      any = true;
      if (kind === null) kind = typeof hit === 'string' ? hit : hit.kind || hit.type || 'solid';
      for (let k = 0; k < PROBES.length; k++) {
        const [px, py] = PROBES[k];
        if (this.circleHit(cx + px * CAR_R, cy + py * CAR_R, 0.15) !== null) {
          ax += px;
          ay += py;
        }
      }
    }
    if (!any) return null;
    const len = Math.hypot(ax, ay);
    if (len < 1e-6) return { dx: sx, dy: sy, kind };
    return { dx: ax / len, dy: ay / len, kind };
  }

  // Static surface events (potholes): [{ x, y, r, kind, ... }].
  addSurfaceEvents(list) {
    for (const p of list) {
      const x0 = Math.floor((p.x - p.r) / CELL);
      const x1 = Math.floor((p.x + p.r) / CELL);
      const y0 = Math.floor((p.y - p.r) / CELL);
      const y1 = Math.floor((p.y + p.r) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = cx * 10000 + cy;
          let l = this.surfaceGrid.get(k);
          if (!l) this.surfaceGrid.set(k, (l = []));
          l.push(p);
        }
      }
    }
  }

  // Surface events under a point (a wheel). Calls fn(item) for each.
  surfaceEventsAt(x, y, fn) {
    const list = this.surfaceGrid.get(Math.floor(x / CELL) * 10000 + Math.floor(y / CELL));
    if (list) {
      for (const p of list) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < p.r * p.r) fn(p);
      }
    }
    for (const p of this.surfaceDynamic) {
      if (p.hw !== undefined) {
        // A long thing (branch, log): a box hl long and hw wide (half sizes),
        // its long axis along heading `angle` (degrees).
        const a = (p.angle || 0) * DEG;
        const dx = x - p.x;
        const dy = y - p.y;
        const along = dx * Math.sin(a) - dy * Math.cos(a);
        const across = dx * Math.cos(a) + dy * Math.sin(a);
        if (Math.abs(along) < p.hl && Math.abs(across) < p.hw) fn(p);
        continue;
      }
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy < p.r * p.r) fn(p);
    }
  }

  // 'paved' | 'dirt' | 'grass' under the point.
  surfaceAt(x, y) {
    let best = 'grass';
    const bridge = this.onIntactBridge(x, y);
    if (bridge) {
      const road = this.world.roads.find((r) => r.id === bridge.roadId);
      if (road) best = road.type;
    }
    for (const s of this.roadIndex.near(x, y)) {
      if (best === 'paved') break;
      const r = s.data;
      if (distToSegment(x, y, s.ax, s.ay, s.bx, s.by) <= r.width / 2 + 0.5) best = r.type === 'paved' ? 'paved' : 'dirt';
    }
    return best;
  }
}
