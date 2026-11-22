// Traffic paint (#50, SPEC 9q): the colors of real cars and trucks on rural
// Midwest roads, about 1980 to the early 2000s. Mostly white, silver, gray,
// black, maroon, dark green, navy and tan, with the odd faded red or brown.
// Each car gets a small seeded shift in shade, and older cars are sun-faded
// (duller and a little chalky). Some get a second, lower tone; the traffic
// 3D code paints it on pickups only.
//
//   carPaint('car3') -> { color, color2, age }   // color2 null when one tone
//
// Same id, same paint, every time.

import { makeRng, hashString } from '../drive/geom.js';

// [sRGB hex, weight]
export const PALETTE = [
  [0xe6e4de, 16], // white
  [0xa7abae, 12], // silver
  [0x787d82, 7], // medium gray
  [0x45484b, 5], // charcoal
  [0x1d1e20, 8], // black
  [0x5a1a1e, 9], // maroon
  [0x24402f, 8], // dark green
  [0x1f2a42, 8], // navy
  [0x3a5068, 3], // slate blue
  [0xb5a283, 8], // tan
  [0xc7b894, 3], // light gold (champagne)
  [0xd6cdb5, 3], // cream
  [0x4d3424, 4], // brown
  [0x8e2a24, 4], // red (kept dark: they fade)
  [0x2b5452, 2], // dark teal (1990s)
];
// Lower tones for two-tone paint, picked to go with the upper one.
const LOWER_ON_LIGHT = [0x5a1a1e, 0x1f2a42, 0x4d3424, 0xb5a283, 0x24402f, 0x45484b];
const LOWER_ON_DARK = [0xa7abae, 0xe6e4de, 0xb5a283, 0xd6cdb5];
const TWO_TONE = 0.45; // share of cars that carry a second tone (pickups show it)

const toRgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
const toHex = ([r, g, b]) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Shade shift (lightness by up to +-k), then sun fade: toward its own gray,
// and a little lighter and chalkier.
function weather(hex, r, age) {
  let c = toRgb(hex);
  const k = 1 + (r() * 2 - 1) * 0.07;
  c = c.map((v) => clamp01(v * k));
  const fade = Math.max(0, age - 0.55) / 0.45; // 0 newer, 1 oldest
  if (fade > 0) {
    const y = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    const chalk = 0.07 * fade;
    c = c.map((v) => clamp01(v + (y - v) * 0.4 * fade + (0.75 - v) * chalk));
  }
  return toHex(c);
}

function pick(list, r) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [c, w] of list) {
    x -= w;
    if (x < 0) return c;
  }
  return list[list.length - 1][0];
}

export function carPaint(id) {
  const r = makeRng(hashString(String(id)) || 1);
  const base = pick(PALETTE, r);
  const age = r(); // 0 new-ish, 1 an old car that lived outside
  const color = weather(base, r, age);
  let color2 = null;
  if (r() < TWO_TONE) {
    const [rr, gg, bb] = toRgb(base);
    const light = 0.3 * rr + 0.59 * gg + 0.11 * bb > 0.5;
    const opts = (light ? LOWER_ON_LIGHT : LOWER_ON_DARK).filter((c) => c !== base);
    color2 = weather(opts[Math.floor(r() * opts.length)], r, age);
  }
  return { color, color2, age };
}
