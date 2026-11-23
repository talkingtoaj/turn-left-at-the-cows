// The covered bridge (#75, SPEC 9r). The middle fell into the river; the two
// bank ends still stand. Board-and-batten walls with drip caps over a window
// strip, the truss (posts and braces) showing through it, a top plate and
// fascia, a shingled roof with bargeboards and a ridge board, white trim on
// the portals, a plank deck with wheel runners on cross beams, coursed stone
// abutments with a cap and wing walls, splintered chords and hanging boards
// at the break, and the red and white barrier.
//
// Everything goes into the shared batch: no draw calls of its own. Solids
// (what the car hits) are coveredParts in layout.js, unchanged.
// Local frame (the bridge's): x across, y along the road (ly), up from 0;
// the deck top is DECK_TOP.

import * as THREE from 'three';
import { makeRng, hashString, localToWorld } from '../../src/drive/geom.js';
import { coveredParts, COVERED } from '../../src/drive/layout.js';
import { box } from './shapes.js';
import { outline, slab, uprightSlab } from './roundShapes.js';
import { beam } from './bridge3d.js';
import { DECK_TOP } from './ground.js';
import { WATER_LEVEL } from './terrain.js';

// Colours pick textures (src3/look/surfaces.js): upright boards, boards,
// shingles, stone wall, siding.
const RED = 0xa3392c;
const RED_DARK = 0x7d2a21;
const BATTEN = 0x8c2a22;
const TRIM = 0xf1ede4;
const ROOF = 0x4f4a3f;
const ROOF_EDGE = 0x55585e;
const WOOD = [0x6a5238, 0x5a4630, 0x8a6c4a];
const TIMBER = 0x4a3420;
const TIMBER_DARK = 0x3a2c20;
const STONE = [0x877763, 0x857563, 0x8a7b68];
const NC = { cast: false };

const WALL_H = 4.2;
const LOW = 1.7; // lower siding band
const HIGH = 1.5; // upper siding band
const PITCH = 2.4;

export function buildCoveredBridge(world, batch, l) {
  const br = world.bridges.find((b) => b.id === l.bridgeId);
  const parts = coveredParts(l, br);
  const rng = makeRng(hashString(l.id));
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, parts.cx, parts.cy, 0, parts.a, lx, ly, up, color, opts);
  const ctx = { P, parts, rng, batch, W: parts.W, L: parts.L, wt: COVERED.wallT };
  for (const s of [-1, 1]) abutment(ctx, s);
  for (const e of parts.ends) {
    deck(ctx, e);
    for (const sx of [-1, 1]) sideWall(ctx, e, sx);
    portal(ctx, e);
    roof(ctx, e);
    breakEdge(ctx, e);
    barrier(ctx, e);
  }
  fallenMiddle(ctx);
  driftwood(ctx);
  return true;
}

// Coursed stone abutment on each bank: three courses stepping back, a
// dressed cap under the deck, and wing walls into the bank.
function abutment({ P, W, L }, s) {
  const y = s * (L / 2 - 1.5);
  const courses = [[W + 1.6, 3.4, -2.6], [W + 1.4, 3.2, -1.7], [W + 1.2, 3.0, -0.9]];
  courses.forEach(([w, d, up], i) => P(box(w, 0.95, d), 0, y, up, STONE[i % 2]));
  P(box(W + 1.5, 0.22, 3.2), 0, y, DECK_TOP - 0.72, STONE[2]); // cap
  for (const sx of [-1, 1]) {
    const wing = box(0.7, 2.4, 3.6).translate(0, 0, s * 1.8);
    wing.rotateY(-sx * s * 0.5);
    P(wing, sx * (W / 2 + 0.5), s * (L / 2 - 0.2), -2.2, STONE[1]);
    P(box(0.8, 0.18, 0.8), sx * (W / 2 + 0.5), s * (L / 2 - 0.2), 0.2, STONE[2], NC);
  }
}

// Deck: the structural slab (as before) on cross beams whose ends show,
// cross planks a hair low, and two runners for the wheels.
function deck({ P, W, rng }, e) {
  const { mid: cy, len, outer, inner } = e;
  P(box(W, 0.5, len), 0, cy, DECK_TOP - 0.5, 0x5a4029);
  for (let t = -len / 2 + 0.4; t < len / 2; t += 1.2) P(box(W + 0.7, 0.3, 0.26), 0, cy + t, DECK_TOP - 0.85, TIMBER);
  // Lower chord outside the beams, along each side.
  for (const sx of [-1, 1]) P(box(0.3, 0.42, len), sx * (W / 2 + 0.1), cy, DECK_TOP - 0.62, TIMBER_DARK);
  const a = Math.min(outer, inner);
  for (let y = a + 0.02; y < a + len - 0.2; y += 0.32) {
    P(box(W - 1.0, 0.06, 0.29), (rng() - 0.5) * 0.04, y + 0.15, DECK_TOP - 0.04, WOOD[Math.floor(rng() * 3)], NC);
  }
  for (const x of [-1.2, 1.2]) P(box(0.5, 0.05, len - 0.3), x, cy, DECK_TOP + 0.01, WOOD[2], NC);
}

// One side wall of a standing end: the two bands of siding (the solid
// walls, as before) with battens on the outside, drip caps, the truss
// posts and X braces in the window strip, and a top plate with fascia.
function sideWall({ P, W, wt, rng }, e, sx) {
  const { mid: cy, len } = e;
  const lx = sx * (W / 2 - wt / 2);
  const outX = sx * (W / 2 + 0.02);
  P(box(wt, LOW, len), lx, cy, DECK_TOP, RED);
  P(box(wt, HIGH, len), lx, cy, DECK_TOP + WALL_H - HIGH, RED);
  // Battens over the board joints, every half metre, both bands.
  for (let t = -len / 2 + 0.25; t < len / 2 - 0.1; t += 0.5) {
    P(box(0.05, LOW - 0.08, 0.07), outX, cy + t, DECK_TOP + 0.04, BATTEN, NC);
    P(box(0.05, HIGH - 0.06, 0.07), outX, cy + t, DECK_TOP + WALL_H - HIGH, BATTEN, NC);
  }
  // Drip cap over the lower band, head board under the upper one.
  P(box(0.16, 0.1, len), outX + sx * 0.04, cy, DECK_TOP + LOW - 0.02, TRIM, NC);
  P(box(0.12, 0.14, len), outX + sx * 0.02, cy, DECK_TOP + WALL_H - HIGH - 0.12, RED_DARK, NC);
  // Truss posts at each panel point, and an X of braces in each panel,
  // seen through the window strip.
  const panels = Math.max(2, Math.round(len / 2.4));
  const step = len / panels;
  for (let i = 0; i <= panels; i++) {
    const t = -len / 2 + i * step;
    P(box(wt + 0.1, WALL_H, 0.3), lx, cy + Math.max(-len / 2 + 0.15, Math.min(len / 2 - 0.15, t)), DECK_TOP, RED_DARK);
  }
  for (let i = 0; i < panels; i++) {
    const t0 = -len / 2 + i * step + 0.15;
    const t1 = t0 + step - 0.3;
    for (const [a, b] of [[t0, t1], [t1, t0]]) {
      P(beam([lx, DECK_TOP + 0.3, cy + a], [lx, DECK_TOP + WALL_H - 0.3, cy + b], 0.2, 0.18), 0, 0, 0, TIMBER, NC);
    }
  }
  // Top plate (the upper chord) and the fascia at the eave.
  P(box(wt + 0.12, 0.3, len), lx, cy, DECK_TOP + WALL_H - 0.3, TIMBER_DARK);
  P(box(0.06, 0.26, len + 0.6), sx * ((W + 1.4) / 2 + 0.02), cy + e.dir * 0.3, DECK_TOP + WALL_H - 0.2, TRIM, NC);
}

// The portal: white trim round the opening, a header, and the boarded
// gable above it with battens and bargeboards.
function portal({ P, W, wt }, e) {
  const y = e.outer;
  const s = e.dir;
  const inW = W - wt * 2;
  P(box(W + 0.4, 0.9, 0.3), 0, y, DECK_TOP + WALL_H - 0.7, RED);
  for (const sx of [-1, 1]) {
    P(uprightSlab(0.3, 0.2, WALL_H - 0.05, 0.03, 0.02), sx * (inW / 2 + 0.05), y + s * 0.06, DECK_TOP, TRIM);
  }
  P(box(inW + 0.5, 0.25, 0.2), 0, y + s * 0.06, DECK_TOP + WALL_H - 0.95, TRIM, NC);
  // Gable boards: a triangle filling the roof end, a little in from it.
  const tri = outline([[-W / 2 - 0.6, 0], [W / 2 + 0.6, 0], [0, PITCH - 0.05]]);
  P(slab(tri, 0.12, 0.02, 'xy', 0, 1), 0, y + s * 0.15, DECK_TOP + WALL_H, RED);
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.6) {
    const h = (PITCH - 0.05) * (1 - Math.abs(x) / (W / 2 + 0.6)) - 0.1;
    if (h > 0.2) P(box(0.07, h, 0.05), x, y + s * 0.23, DECK_TOP + WALL_H + 0.02, BATTEN, NC);
  }
  // Bargeboards along the roof edge, white.
  const half = (W + 1.4) / 2 + 0.05;
  const yb = y + s * 0.62;
  for (const sx of [-1, 1]) {
    P(beam([sx * half, DECK_TOP + WALL_H - 0.12, 0], [0, DECK_TOP + WALL_H + PITCH + 0.06, 0], 0.32, 0.07), 0, yb, 0, TRIM, NC);
  }
}

// Shingled roof over the standing end, a ridge board, and the broken edge
// hanging down over the gap.
function roof({ P, parts, W, batch }, e) {
  const s = e.dir;
  const RL = e.len + 0.6;
  const half = (W + 1.4) / 2;
  const slope = Math.atan2(PITCH, half);
  const sl = Math.hypot(PITCH, half);
  // Two slopes as thick boards so the eave shows its edge.
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationZ(-sx * slope);
    P(box(sl + 0.05, 0.16, RL).translate(-sx * sl / 2, 0, 0), sx * half, e.mid + s * 0.3, DECK_TOP + WALL_H, ROOF, { extra: m });
    // Shingle courses: thin strips stepping down the slope.
    for (let k = 1; k < 6; k++) {
      const d = (k / 6) * sl;
      P(box(0.05, 0.04, RL - 0.02).translate(-sx * d, 0.16, 0), sx * half, e.mid + s * 0.3, DECK_TOP + WALL_H, ROOF_EDGE, { cast: false, extra: m });
    }
  }
  P(box(0.3, 0.14, RL + 0.05), 0, e.mid + s * 0.3, DECK_TOP + WALL_H + PITCH + 0.02, ROOF_EDGE);
  // The broken end of the roof hangs down into the gap.
  const droop = new THREE.Matrix4().makeRotationX(s * 0.35);
  for (const sx of [-1, 1]) {
    const m = droop.clone().multiply(new THREE.Matrix4().makeTranslation(sx * half * 0.92, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(-sx * slope));
    batch.place(box(sl, 0.14, 3).translate(-sx * sl / 2, 0, 0), parts.cx, parts.cy, 0, parts.a, 0, e.inner + s * 0.6, DECK_TOP + WALL_H - 0.6, ROOF, { extra: m });
  }
}

// At the break: splintered chord and floor beam ends over the gap, and
// boards hanging off the wall ends at odd angles.
function breakEdge({ P, W, rng }, e) {
  const s = e.dir;
  for (const x of [-W / 2 + 0.6, -1, 1.3, W / 2 - 0.6]) {
    const len2 = 0.8 + rng() * 1.8;
    P(box(0.3, 0.3, len2), x, e.inner - s * len2 / 2, DECK_TOP - 0.55, TIMBER_DARK);
    // Splinters at the tip.
    for (let k = 0; k < 2; k++) {
      P(box(0.06, 0.06, 0.4 + rng() * 0.4).translate(0, 0, -s * 0.2), x + (rng() - 0.5) * 0.2, e.inner - s * len2, DECK_TOP - 0.45 + (rng() - 0.5) * 0.15, WOOD[2], { cast: false, extra: new THREE.Matrix4().makeRotationY((rng() - 0.5) * 0.5) });
    }
  }
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const h = 1.2 + rng() * 2.2;
      const m = new THREE.Matrix4().makeRotationX(s * (0.15 + rng() * 0.5));
      P(box(0.06, h, 0.3), sx * (W / 2 + 0.03), e.inner - s * (0.1 + k * 0.32), DECK_TOP + WALL_H - 0.4 - h, k % 2 ? RED : RED_DARK, { cast: false, extra: m });
    }
  }
}

// The barrier (solid) back from the broken edge: red and white boards on
// bevelled posts with a reflector.
function barrier({ P, W, wt }, e) {
  const s = e.dir;
  const by = e.inner - s * COVERED.barrierBack;
  const bw = W - wt * 2;
  for (let i = 0; i < 5; i++) {
    const x0 = -bw / 2 + (i + 0.5) * (bw / 5);
    P(box(bw / 5, 0.4, 0.1), x0, by, DECK_TOP + 0.9, i % 2 ? 0xffffff : 0xc0392b);
    P(box(bw / 5, 0.3, 0.1), x0, by, DECK_TOP + 0.4, i % 2 ? 0xc0392b : 0xffffff);
  }
  for (const x of [-bw / 2 + 0.3, bw / 2 - 0.3]) {
    P(uprightSlab(0.18, 0.18, 1.4, 0.03, 0.03), x, by - s * 0.1, DECK_TOP, 0x555555);
    P(box(0.1, 0.1, 0.02), x, by - s * 0.2, DECK_TOP + 1.2, 0xffb020, NC);
  }
}

// Middle: two pieces hinged at the broken ends, slumped into the river in
// a V, planked, one wall left on each with half its boards gone.
function fallenMiddle({ P, parts, W, rng, batch }) {
  for (const e of parts.ends) {
    const s = e.dir;
    const span = Math.abs(e.inner) + 0.2;
    const tilt = 0.42 + rng() * 0.08;
    const piece = (geo, lx, up, along, color, opts = {}) => {
      const m = new THREE.Matrix4().makeRotationX(-s * tilt);
      m.multiply(new THREE.Matrix4().makeTranslation(lx, up, -s * along));
      batch.place(geo, parts.cx, parts.cy, 0, parts.a, 0, e.inner, DECK_TOP - 0.2, color, { ...opts, extra: m });
    };
    piece(box(W * 0.9, 0.4, span - 0.4), 0, -0.4, (span - 0.4) / 2, 0x4f3a26);
    for (let t = 0.3; t < span - 0.5; t += 0.36) {
      if (rng() < 0.15) continue;
      piece(box(W * 0.9 - rng() * 1.2, 0.06, 0.3), (rng() - 0.5) * 0.6, 0, t, WOOD[Math.floor(rng() * 3)], NC);
    }
    for (let t = 0.6; t < span - 0.6; t += 1.1) {
      if (rng() < 0.3) continue;
      const h = 1.2 + rng() * 2.4;
      piece(box(0.22, h, 1.0), s * (W / 2 - 0.2), 0, t, rng() < 0.3 ? RED_DARK : RED);
      piece(box(0.05, h - 0.1, 0.07), s * (W / 2 - 0.07), 0.05, t, BATTEN, NC);
    }
    const m = new THREE.Matrix4().makeRotationX(-s * (tilt + 0.25)).multiply(new THREE.Matrix4().makeRotationZ(s * 0.3));
    m.multiply(new THREE.Matrix4().makeTranslation(-s * 1.2, 1.2, -s * span * 0.45));
    batch.place(box(W * 0.75, 0.25, span * 0.8), parts.cx, parts.cy, 0, parts.a, 0, e.inner, DECK_TOP + 1.2, ROOF, { extra: m });
  }
}

// Loose boards and shingles drifting in the river.
function driftwood({ parts, rng, batch }) {
  for (let i = 0; i < 14; i++) {
    const p = localToWorld(parts.cx, parts.cy, parts.a, (rng() - 0.5) * 40, (rng() - 0.5) * 12);
    batch.place(box(0.3, 0.1, 1.2 + rng() * 2), p.x, p.y, WATER_LEVEL - 0.03, rng() * 180, 0, 0, 0, rng() < 0.5 ? RED : 0x5a4029, NC);
  }
}
