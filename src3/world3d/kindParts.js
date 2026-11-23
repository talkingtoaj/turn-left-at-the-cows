// Small built parts for the store, diner and cabin (kinds.js, #77): steps,
// a park bench, a roof vent stack and an OPEN sign whose letters are bars,
// so it needs no texture. All go through P(geo, lx, ly, up, color, opts)
// in the building's frame (front toward +ly), so they land in the shared
// batch and add no draw calls. Framed windows come from shops3d.js.

import * as THREE from 'three';
import { box, cyl } from './shapes.js';

export const NC = { cast: false, share: true };
const TIN = 0x8a8f92;
const IRON = 0x2e2e2c;

// Height above the eaves of a gable(w, d, h) roof at (dx, dy) from its middle.
export function gableUp(w, d, h, dx, dy) {
  const t = w >= d ? Math.abs(dy) / (d / 2) : Math.abs(dx) / (w / 2);
  return h * Math.max(0, 1 - t);
}

// n steps up to a door, w wide, starting at the wall line y and running out
// toward s * y (s = 1: toward +ly). The top step is next to the wall. Each
// tread can get a nosing strip (metal on the diner, a board edge elsewhere).
export function steps(P, x, y, w, n, rise, run, color, s = 1, nose = null) {
  for (let i = 0; i < n; i++) {
    const h = rise * (n - i);
    P(box(w, h + 0.25, run), x, y + s * run * (i + 0.5), -0.25, color);
    if (nose) P(box(w + 0.04, 0.04, 0.06), x, y + s * (run * (i + 1) - 0.02), h - 0.03, nose, NC);
  }
}

// A park bench at (x, y) on a floor at height up, len long across x, the
// sitter facing s * y: three seat slats, two back slats, iron ends with arms.
export function bench(P, x, y, up, len, s = 1, wood = 0x7a5a3a, iron = IRON) {
  for (const k of [-1, 0, 1]) P(box(len, 0.045, 0.11), x, y + s * k * 0.13, up + 0.42, wood, NC);
  for (const h of [0.58, 0.74]) P(box(len, 0.1, 0.035), x, y - s * 0.24, up + h, wood, NC);
  for (const e of [-1, 1]) {
    const ex = x + e * (len / 2 - 0.12);
    P(box(0.05, 0.42, 0.05), ex, y + s * 0.17, up, iron, NC); // front leg
    P(box(0.05, 0.86, 0.05), ex, y - s * 0.26, up, iron, NC); // back leg and back post
    P(box(0.05, 0.04, 0.46), ex, y - s * 0.04, up + 0.38, iron, NC); // seat rail
    P(box(0.05, 0.2, 0.05), ex, y + s * 0.17, up + 0.42, iron, NC); // arm post
    P(box(0.07, 0.04, 0.5), ex, y - s * 0.03, up + 0.62, iron, NC); // arm
  }
}

// A vent stack coming up through a roof at height up: a flashing boot, the
// pipe, and a cone rain cap on a short neck.
export function ventStack(P, x, y, up, h = 0.9, color = TIN) {
  P(cyl(0.18, 0.08, 8, 0.1), x, y, up - 0.02, color, NC);
  P(cyl(0.065, h, 8), x, y, up, color);
  P(cyl(0.045, 0.12, 6), x, y, up + h, IRON, NC);
  P(cyl(0.18, 0.12, 8, 0.03), x, y, up + h + 0.1, color);
}

// Bars of the letters O, P, E, N in a 0.22 x 0.3 cell: [u0, v0, u1, v1].
const LW = 0.22;
const LH = 0.3;
const T = 0.05;
const GLYPHS = {
  O: [[0, 0, T, LH], [LW - T, 0, LW, LH], [T, 0, LW - T, T], [T, LH - T, LW - T, LH]],
  P: [[0, 0, T, LH], [T, LH - T, LW, LH], [T, LH / 2 - T / 2, LW, LH / 2 + T / 2], [LW - T, LH / 2, LW, LH - T]],
  E: [[0, 0, T, LH], [T, LH - T, LW, LH], [T, LH / 2 - T / 2, LW * 0.8, LH / 2 + T / 2], [T, 0, LW, T]],
  N: [[0, 0, T, LH], [LW - T, 0, LW, LH], 'diag'],
};

// An OPEN sign on a dark board, read from the s * y side, bottom at up.
// letters: the letter colour (neon red on the diner, painted on the store).
export function openSign(P, x, y, up, s = 1, o = {}) {
  const board = o.board ?? 0x1c1f22;
  const letters = o.letters ?? 0xff4a3a;
  P(box(1.3, 0.5, 0.03), x, y, up, board, NC);
  if (o.frame) {
    for (const v of [0, 0.47]) P(box(1.36, 0.03, 0.05), x, y, up + v, o.frame, NC);
    for (const e of [-1, 1]) P(box(0.03, 0.5, 0.05), x + e * 0.665, y, up, o.frame, NC);
  }
  const ly = y + s * 0.025;
  const v0 = up + 0.1;
  'OPEN'.split('').forEach((ch, i) => {
    const off = -0.45 + i * 0.3 - LW / 2; // left edge of the letter, as read
    for (const bar of GLYPHS[ch]) {
      if (bar === 'diag') {
        const len = Math.hypot(LW - T, LH);
        const g = new THREE.BoxGeometry(T * 1.1, len, 0.025).rotateZ(s * Math.atan2(LW - T, LH));
        P(g, x + s * (off + LW / 2), ly, v0 + LH / 2, letters, NC);
        continue;
      }
      const [u0, w0, u1, w1] = bar;
      P(box(u1 - u0, w1 - w0, 0.025), x + s * (off + (u0 + u1) / 2), ly, v0 + w0, letters, NC);
    }
  });
}
