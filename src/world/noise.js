// Seeded value noise (smooth, about -1..1) and smoothstep. Engine-free, so
// both the 3D terrain and shared logic (src/world/roughness.js) can use it.

import { makeRng } from '../drive/geom.js';

export function makeNoise(seed) {
  const rng = makeRng(seed);
  const N = 256;
  const vals = new Float32Array(N);
  const perm = new Uint8Array(N * 2);
  for (let i = 0; i < N; i++) {
    vals[i] = rng() * 2 - 1;
    perm[i] = i;
  }
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < N; i++) perm[N + i] = perm[i];
  const v = (ix, iy) => vals[perm[(ix & 255) + perm[iy & 255]]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = v(ix, iy);
    const b = v(ix + 1, iy);
    const c = v(ix, iy + 1);
    const d = v(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
