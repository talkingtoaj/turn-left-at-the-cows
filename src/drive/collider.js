// Collision and surface queries for the car.

import {
  pointInPolygon, distToPolygonEdge, pointInRect, circleHitsRect, bbox, DEG, SegIndex, distToSegment,
} from './geom.js';
import {
  buildingSolids, landmarkSolids, fenceSolids, TREE_HIT_R, LOCAL_HIT_R,
} from './layout.js';

const CELL = 32;

// Car hit shape: three circles along its long axis (covers ~4.5 x 2 m).
export const CAR_CIRCLES = [-1.25, 0, 1.25];
export const CAR_R = 1.0;

export class Collider {
  // opts.staticLocals (default true): people are fixed circles at their home
  // spot. Pass false when the caller moves people and fills `dynamic` instead.
  constructor(world, scenery, opts = {}) {
    this.world = world;
    this.grid = new Map();
    // Moving obstacles (people, traffic), refilled by the caller each frame:
    // [{ x, y, r }]. Checked after the static grid.
    this.dynamic = [];

    // Solid things go into a spatial grid so each query only checks nearby ones.
    for (const b of world.buildings) this.addSolids(buildingSolids(b));
    for (const l of world.landmarks) this.addSolids(landmarkSolids(l, world));
    this.addSolids(fenceSolids(world));
    for (const t of scenery.trees) this.addCircle({ x: t.x, y: t.y, r: TREE_HIT_R });
    if (opts.staticLocals !== false) {
      for (const l of world.locals) this.addCircle({ x: l.x, y: l.y, r: LOCAL_HIT_R });
    }

    this.intactBridges = world.bridges
      .filter((b) => b.intact)
      .map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.length, angle: b.angle, roadId: b.roadId }));
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
    const { w, h } = this.world.size;
    if (x - r < 0 || y - r < 0 || x + r > w || y + r > h) return true;

    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
        const list = this.grid.get(cx * 10000 + cy);
        if (!list) continue;
        for (const s of list) {
          if (s.type === 'circle') {
            const dx = s.x - x;
            const dy = s.y - y;
            const rr = s.r + r;
            if (dx * dx + dy * dy < rr * rr) return true;
          } else if (circleHitsRect(x, y, r, s)) return true;
        }
      }
    }

    for (const c of this.dynamic) {
      const dx = c.x - x;
      const dy = c.y - y;
      const rr = c.r + r;
      if (dx * dx + dy * dy < rr * rr) return true;
    }

    // Creek water blocks unless this point is on an intact bridge deck.
    for (const s of this.waterIndex.near(x, y)) {
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      if (d < s.data.width / 2 + r * 0.5) {
        if (!this.onIntactBridge(x, y)) return true;
        break;
      }
    }

    for (const l of this.lakes) {
      if (x < l.bb.minX - r || x > l.bb.maxX + r || y < l.bb.minY - r || y > l.bb.maxY + r) continue;
      if (pointInPolygon(x, y, l.polygon) || distToPolygonEdge(x, y, l.polygon) < r * 0.5) return true;
    }
    return false;
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
