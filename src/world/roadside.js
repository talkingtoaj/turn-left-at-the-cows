// How far a point stands from the nearest road surface: the distance to the
// road's centre line minus half its width, over every road (negative when
// the point is on a road). Used to keep signs off the road (#87) and by
// tools/check-signs.mjs.

import { nearestOnPolyline } from '../drive/geom.js';

// Metres a sign's post keeps clear of any road edge (the board hangs about
// 0.4 m out from the post).
export const SIGN_CLEAR = 0.8;

export function roadGap(x, y, roads) {
  let gap = Infinity;
  for (const r of roads) {
    const q = nearestOnPolyline(x, y, r.points);
    if (q) gap = Math.min(gap, q.d - r.width / 2);
  }
  return gap;
}
