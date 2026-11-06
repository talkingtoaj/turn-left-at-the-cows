// Where the ground turns to mud in the wet (round 8). Plain data and math,
// no engine code: the 3D ground shader tints it (src3/world3d/world3d.js) and
// the car's grip takes it (src/game/damage.js, TUNING.wet.mud).
//
// Mud 0..1: Willow Bottoms (src/world/districts.js), the low ground along the
// creeks (fading out over about 45 m from the bank) and lake shores. Paved
// roads never get muddy (the caller keeps mud to dirt and off-road).
//
//   const M = mudFor(world)
//   M.at(x, y)  -> 0..1

import { SegIndex, pointInPolygon, distToPolygonEdge, bbox } from '../drive/geom.js';
import { districtsFor, KIND_LIST } from './districts.js';
import { smoothstep } from './noise.js';

const CREEK_REACH = 45; // m beyond a creek bank where its low ground ends
const LAKE_REACH = 30;
const WILLOW = KIND_LIST.indexOf('willow');

const cache = new WeakMap();

export function mudFor(world) {
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Mud(world)));
  return m;
}

class Mud {
  constructor(world) {
    this.D = districtsFor(world);
    this.creeks = new SegIndex(48);
    for (const c of world.creeks || []) this.creeks.addPolyline(c.points, c.width / 2 + CREEK_REACH, c);
    this.lakes = (world.lakes || []).map((l) => ({ poly: l.polygon, bb: bbox(l.polygon) }));
  }

  at(x, y) {
    let m = this.D.weights(x, y)[WILLOW];
    const d = this.creeks.minDist(x, y, (s) => s.data.width / 2);
    if (d < CREEK_REACH) m = Math.max(m, 0.85 * (1 - smoothstep(2, CREEK_REACH, d)));
    for (const l of this.lakes) {
      if (x < l.bb.minX - LAKE_REACH || x > l.bb.maxX + LAKE_REACH || y < l.bb.minY - LAKE_REACH || y > l.bb.maxY + LAKE_REACH) continue;
      const e = pointInPolygon(x, y, l.poly) ? 0 : distToPolygonEdge(x, y, l.poly);
      m = Math.max(m, 0.6 * (1 - smoothstep(0, LAKE_REACH, e)));
    }
    return Math.max(0, Math.min(1, m));
  }
}
