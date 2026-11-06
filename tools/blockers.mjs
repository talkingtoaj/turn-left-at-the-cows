// Road blocker checks (used by tools/check-blockers.mjs).
//
// A blocker is a fallen tree across a road (src/ambient/hazards.js,
// setBlockers). It only works if the car cannot drive round it. Here the
// car's collision footprint is routed over the world on a grid: a cell is
// open when a circle of the car's half width (CAR_R, the narrowest part of
// the car) fits there. If even that circle cannot get past, the car cannot.
//
//   bypass(blocker)  searches within RADIUS m of the blocker for a way from
//                    the road APPROACH m before it to APPROACH m after it.
//   detour(blocker)  the quickest way round over the whole map (roads at
//                    their safe speeds, grass slow), for the length of the
//                    detour a blocker forces.

import { WORLD } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider, CAR_R } from '../src/drive/collider.js';
import { createHazards } from '../src/ambient/hazards.js';
import { measurePolyline, pointAlong } from '../src/drive/geom.js';

export const RADIUS = 150; // m around the blocker searched for a way round
export const APPROACH = 30; // m along the road before and after the blocker
const SPEED = { paved: 25, dirt: 16, grass: 9 }; // m/s, for the detour cost

const scenery = generateScenery(WORLD);
const collider = new Collider(WORLD, scenery);
const hz = createHazards(WORLD, scenery);

// Lazily filled grid of static solids: 0 unknown, 1 open, 2 blocked.
// Surface codes: 1 paved, 2 dirt, 3 grass.
function makeGrid(cell, clear) {
  const W = Math.ceil(WORLD.size.w / cell);
  const H = Math.ceil(WORLD.size.h / cell);
  const occ = new Uint8Array(W * H);
  const surf = new Uint8Array(W * H);
  const SURF = { paved: 1, dirt: 2, grass: 3 };
  return {
    cell, W, H,
    open(ix, iy) {
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
      const k = iy * W + ix;
      if (!occ[k]) occ[k] = collider.circleHit((ix + 0.5) * cell, (iy + 0.5) * cell, clear) === null ? 1 : 2;
      return occ[k] === 1;
    },
    surface(ix, iy) {
      const k = iy * W + ix;
      if (!surf[k]) surf[k] = SURF[collider.surfaceAt((ix + 0.5) * cell, (iy + 0.5) * cell)];
      return surf[k];
    },
  };
}
const fine = makeGrid(1, CAR_R);
const coarse = makeGrid(2, CAR_R * 1.05);

// Blocker solids as a quick point test for a circle of radius `clear`.
function blockerTest(b, clear) {
  const solids = [];
  hz.blockerSolids(b, solids);
  const ext = (b.extent || b.len) + 4;
  return (x, y) => {
    if (Math.abs(x - b.x) > ext || Math.abs(y - b.y) > ext) return false;
    for (const s of solids) {
      const dx = s.x - x;
      const dy = s.y - y;
      const rr = s.r + clear;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  };
}

// Points APPROACH m before and after the blocker along its road.
function ends(b) {
  const road = WORLD.roads.find((r) => r.id === b.roadId);
  const cum = measurePolyline(road.points);
  const L = cum[cum.length - 1];
  const a = pointAlong(road.points, cum, Math.max(0, b.at - APPROACH));
  const z = pointAlong(road.points, cum, Math.min(L, b.at + APPROACH));
  return [a, z];
}

// Resolve blocker defs ({ roadId, at } or { near }, plus reach etc.) to blockers.
export function resolve(defs) {
  return hz.setBlockers(defs).map((b) => ({ ...b, extra: [...b.extra] }));
}

const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// Nearest open cell to (x, y) within a few cells (the road point itself may
// sit just inside a blocker's reach or a signpost).
function seed(g, x, y, isOpen) {
  const cx = Math.floor(x / g.cell);
  const cy = Math.floor(y / g.cell);
  for (let r = 0; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isOpen(cx + dx, cy + dy)) return [cx + dx, cy + dy];
  }
  return null;
}

// Is there a way round within RADIUS? Returns { bypass, path } where path
// is a list of [x, y] (every few metres) when there is one.
export function bypass(b) {
  const g = fine;
  const hit = blockerTest(b, CAR_R);
  const R2 = (RADIUS / g.cell) ** 2;
  const bx = b.x / g.cell;
  const by = b.y / g.cell;
  const isOpen = (ix, iy) => (ix + 0.5 - bx) ** 2 + (iy + 0.5 - by) ** 2 <= R2 && g.open(ix, iy) && !hit((ix + 0.5) * g.cell, (iy + 0.5) * g.cell);
  const [a, z] = ends(b);
  const s = seed(g, a.x, a.y, isOpen);
  const t = seed(g, z.x, z.y, isOpen);
  if (!s || !t) return { bypass: false, path: null, note: 'road end blocked' };
  const side = 2 * RADIUS + 4;
  const ox = Math.floor(bx) - RADIUS - 2;
  const oy = Math.floor(by) - RADIUS - 2;
  const prev = new Int32Array(side * side).fill(-1);
  const idx = (ix, iy) => (iy - oy) * side + (ix - ox);
  const queue = [s];
  prev[idx(...s)] = idx(...s);
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi];
    if (x === t[0] && y === t[1]) {
      const path = [];
      let k = idx(x, y);
      for (let n = 0; ; n++) {
        const px = (k % side) + ox;
        const py = Math.floor(k / side) + oy;
        if (n % 5 === 0) path.push([(px + 0.5) * g.cell, (py + 0.5) * g.cell]);
        if (prev[k] === k) break;
        k = prev[k];
      }
      return { bypass: true, path: path.reverse() };
    }
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      const k = idx(nx, ny);
      if (k < 0 || k >= prev.length || prev[k] !== -1) continue;
      // Diagonal moves need both side cells open too (no corner cutting).
      if (dx && dy && !(isOpen(x + dx, y) && isOpen(x, y + dy))) continue;
      if (!isOpen(nx, ny)) continue;
      prev[k] = idx(x, y);
      queue.push([nx, ny]);
    }
  }
  return { bypass: false, path: null };
}

// Binary heap for A*.
class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  push(key, val) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}

// Quickest way from (ax, ay) to (zx, zy) over the whole map, optionally with
// blocker b in place. Returns { time (s), dist (m), grass (m), path } or null.
export function route(ax, ay, zx, zy, b = null, useFine = false) {
  const g = useFine ? fine : coarse;
  const hit = b ? blockerTest(b, useFine ? CAR_R : CAR_R * 1.05) : () => false;
  const isOpen = (ix, iy) => g.open(ix, iy) && !hit((ix + 0.5) * g.cell, (iy + 0.5) * g.cell);
  const s = seed(g, ax, ay, isOpen);
  const t = seed(g, zx, zy, isOpen);
  if (!s || !t) return null;
  const n = g.W * g.H;
  const best = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const prev = new Int32Array(n).fill(-1);
  const sk = s[1] * g.W + s[0];
  const tk = t[1] * g.W + t[0];
  best[sk] = 0;
  const heap = new Heap();
  const hscale = g.cell / SPEED.paved;
  const hfun = (ix, iy) => Math.hypot(ix - t[0], iy - t[1]) * hscale;
  heap.push(hfun(...s), sk);
  const spd = [0, SPEED.paved, SPEED.dirt, SPEED.grass];
  while (heap.size) {
    const k = heap.pop();
    if (done[k]) continue; // a stale heap entry
    done[k] = 1;
    if (k === tk) break;
    const x = k % g.W;
    const y = (k - x) / g.W;
    const c0 = best[k];
    for (const [dx, dy, len] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
      if (dx && dy && !(isOpen(x + dx, y) && isOpen(x, y + dy))) continue;
      if (!isOpen(nx, ny)) continue;
      const nk = ny * g.W + nx;
      const c = c0 + (len * g.cell) / spd[g.surface(nx, ny)];
      if (c < best[nk]) {
        best[nk] = c;
        prev[nk] = k;
        heap.push(c + hfun(nx, ny), nk);
      }
    }
  }
  if (best[tk] === Infinity) return null;
  let dist = 0;
  let grass = 0;
  const path = [];
  let k = tk;
  let i = 0;
  while (k !== sk) {
    const p = prev[k];
    const x = k % g.W;
    const y = (k - x) / g.W;
    const px = p % g.W;
    const py = (p - px) / g.W;
    const d = Math.hypot(x - px, y - py) * g.cell;
    dist += d;
    if (g.surface(x, y) === 3) grass += d;
    if (i++ % (useFine ? 20 : 10) === 0) path.push([(x + 0.5) * g.cell, (y + 0.5) * g.cell]);
    k = p;
  }
  return { time: best[tk], dist, grass, path: path.reverse() };
}

// The detour a blocker forces between its two approach points.
export function detour(b) {
  const [a, z] = ends(b);
  const open = route(a.x, a.y, z.x, z.y, null, true);
  const shut = route(a.x, a.y, z.x, z.y, b, true);
  return { open, shut };
}

export { WORLD };
