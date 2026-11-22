// Cows (SPEC 9q, #37): how each cow looks and when it grazes head-down.
// Pure logic, no three.js, so tools/check-cows.mjs can test it.
//
// Every cow gets a coat colour, a patch colour, how much of it is patched, a
// seed (for timing) and an offset into the patch noise (cowPatch, mirrored in
// GLSL in ambient3d.js), so no two cows carry the same patches.

import { hashString } from '../../src/drive/geom.js';

// [coat, patch, min cover, max cover, weight]. Cover is the noise threshold
// (cowPatch): 0.3 patches about 8% of the cow, 0.4 about 25%, 0.5 half.
const BREEDS = [
  [0xf2efe8, 0x1f1b19, 0.42, 0.52, 5], // black and white
  [0xf2efe8, 0x6a3a20, 0.4, 0.5, 2], // brown and white
  [0x7a3c20, 0xf2efe8, 0.34, 0.41, 2], // red with white
  [0x26211f, 0xf2efe8, 0.31, 0.37, 2], // black with a little white
  [0xb27a48, 0x5e3a22, 0.37, 0.44, 1], // tan with darker brown
];
const OFF_SPAN = 60; // each cow's patches come from somewhere in a 60^3 noise cube
const WEIGHT = BREEDS.reduce((s, b) => s + b[4], 0);

// String to [0, 1), stable across runs.
export const hash01 = (s) => hashString(String(s)) / 4294967296;

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// The look of the cow with this id:
// { coat: [r,g,b], patch: [r,g,b], cover, seed, off: [x,y,z] }.
export function cowLook(id) {
  const a = hash01(`${id}|breed`);
  const b = hash01(`${id}|cover`);
  let w = a * WEIGHT;
  let br = BREEDS[0];
  for (const x of BREEDS) {
    if (w < x[4]) { br = x; break; }
    w -= x[4];
  }
  const off = ['x', 'y', 'z'].map((k) => hash01(`${id}|${k}`) * OFF_SPAN);
  return { coat: rgb(br[0]), patch: rgb(br[1]), cover: br[2] + (br[3] - br[2]) * b, seed: hash01(`${id}|seed`), off };
}

// ---------- patch noise (keep in step with COW_GLSL in ambient3d.js) ----------

const fract = (x) => x - Math.floor(x);
function h3(x, y, z) {
  x = fract(x * 0.3183099 + 0.1) * 17;
  y = fract(y * 0.3183099 + 0.1) * 17;
  z = fract(z * 0.3183099 + 0.1) * 17;
  return fract(x * y * z * (x + y + z));
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  );
}
export const PATCH_FREQ = 2.4; // patches per metre, roughly

// True where the cow at body point (x, y, z) (metres, cow space) is patch colour.
export function cowPatch(look, x, y, z) {
  const px = x * PATCH_FREQ + look.off[0];
  const py = y * PATCH_FREQ + look.off[1];
  const pz = z * PATCH_FREQ + look.off[2];
  const n = 0.72 * vnoise(px, py, pz) + 0.28 * vnoise(px * 2.7, py * 2.7, pz * 2.7);
  return n < look.cover;
}

// ---------- grazing ----------

// Head pose of a cow at `time` (s): 0 head up, 1 halfway, 2 head down grazing.
// A standing cow spends most of each cycle grazing and now and then looks up;
// the halfway pose is shown for TURN s on the way down and up. Each cow has
// its own cycle length and phase (from its seed), so a herd never moves as one.
// A walking cow keeps its head up.
export const TURN = 0.45;
export function cowPose(time, seed, moving) {
  if (moving) return 0;
  const period = 16 + seed * 14;
  const t = (time + seed * 97) % period; // seconds into this cow's cycle
  const up = 4 + seed * 4; // seconds with the head up per cycle
  if (t < up) return 0;
  if (t < up + TURN || t >= period - TURN) return 1;
  return 2;
}
