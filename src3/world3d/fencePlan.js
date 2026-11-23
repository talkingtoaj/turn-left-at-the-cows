// Where the fence and power pole details go (#61). Pure: no three.js, so
// tools/check-poles.mjs can test it. Everything is chosen from hashes of ids,
// so the same world always gets the same gates, broken boards and
// transformer cans.

import { distToSegment, hashString } from '../../src/drive/geom.js';

// A field gate spans about this many metres of fence.
export const GATE_LEN = 4.2;
// Share of rail fence boards (per span, per rail) that are broken.
export const BROKEN_SHARE = 0.035;
// Share of power poles with a transformer can.
export const TRANSFORMER_SHARE = 0.16;

// Hash of a string to 0..1.
const unit = (s) => (hashString(s) % 100000) / 100000;

function roadDist(roads, x, y) {
  let best = Infinity;
  for (const r of roads) {
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) - (r.width || 0) / 2;
      if (d < best) best = d;
    }
  }
  return best;
}

// One gate per fenced field, on the stretch closest to a road (the way a
// tractor comes in). runs: the posts as drawn ([[{x, y}], ...]). Returns
// { run, i0, i1 } (posts i0 and i1 are the gate posts, the ones between are
// left out) or null when no run is long enough.
export function pickGate(runs, roads) {
  let best = null;
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    if (run.length < 2) continue;
    const step = Math.hypot(run[1].x - run[0].x, run[1].y - run[0].y) || 1;
    const n = Math.max(1, Math.round(GATE_LEN / step));
    // Keep a post or two of fence on each side of the gate.
    for (let i = 1; i + n < run.length - 1; i++) {
      const a = run[i];
      const b = run[i + n];
      // Only straight stretches (no corner inside the gate).
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < n * step * 0.97) continue;
      const d = roadDist(roads, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!best || d < best.d) best = { run: r, i0: i, i1: i + n, d };
    }
  }
  return best && { run: best.run, i0: best.i0, i1: best.i1 };
}

// How a rail fence board is broken, or null when it is whole. k: post index
// of the span's first post, rail: 0 (low) .. 2 (top).
//   'drop':    one end came off the post and lies on the ground
//   'missing': the board is gone
//   'snapped': broken in the middle, both halves hanging down
export function brokenBoard(fieldId, run, k, rail) {
  const u = unit(`${fieldId}:${run}:${k}:${rail}`);
  if (u >= BROKEN_SHARE) return null;
  const v = u / BROKEN_SHARE;
  return v < 0.45 ? 'drop' : v < 0.7 ? 'missing' : 'snapped';
}

// Transformer cans: on about one pole in six, never on a line's first or last
// two poles, a shared pole, or the pole after one that has a can.
export function hasTransformer(lineId, poles, i) {
  if (i < 2 || i > poles.length - 3 || poles[i].shared) return false;
  const has = (k) => unit(`${lineId}:tx:${k}`) < TRANSFORMER_SHARE;
  return has(i) && !(i - 1 >= 2 && has(i - 1));
}
