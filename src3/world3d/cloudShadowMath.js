// Cloud shadows (#96): the numbers behind the scrolling noise shadows. No
// three.js here so tools/check-cloudshadows.mjs can run it in node.
//
// Shadows are shapes in world metres that slide with the wind. How dark and
// how much of the land they cover follows the weather:
//   sunny (cover 0.22)  few, light patches
//   broken cloud        the most, and the darkest
//   overcast, rain      none (the light is already flat)

// Metres a day-time cloud shadow slides per metre of wind. Same factor the
// ambient clouds use (src/ambient/ambient.js), so shadows and puffs agree.
export const DRIFT_K = 2.4;
export const DEG = Math.PI / 180;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// cover: 0..1 cloud cover. grey: 0..1, 1 = full overcast. rain: 0..1.
// Returns { amt: how dark a shadow is, 0..1, frac: share of the land in shadow }.
// amt is 0 when there is no shadow to draw, so the shader can skip all of it.
export function cloudShadowParams(cover, grey, rain) {
  const flat = (1 - clamp01(grey)) * (1 - clamp01(rain * 2.5));
  const amt = flat * (0.17 + 0.2 * smooth(0.2, 0.85, cover));
  const frac = 0.2 + 0.28 * smooth(0.2, 0.85, cover);
  return { amt: amt < 0.01 ? 0 : amt, frac };
}

// The noise level above which the land is in shadow, for a share `frac`.
export function thresholdFor(frac) {
  return 0.735 - (frac - 0.2) * 0.8;
}

// Slide the pattern `off` (a {x, y} in metres) with the wind for dt seconds.
// dir: degrees the wind blows towards, as amb.wind.dir (0 = north = -y).
export function advanceOffset(off, dir, speed, dt) {
  off.x += Math.sin(dir * DEG) * speed * DRIFT_K * dt;
  off.y += -Math.cos(dir * DEG) * speed * DRIFT_K * dt;
  return off;
}
