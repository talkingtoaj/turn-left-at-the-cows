// Building kinds added in phase 2: store, diner, cabin, shed.
// Each is built in a frame turned so its front (local +ly) faces the road.

import * as THREE from 'three';
import { localToWorld } from '../../src/drive/geom.js';
import { box, cyl, gable, strut } from './shapes.js';
import { uprightSlab } from './roundShapes.js';
import { framedWindow } from './shops3d.js';
import { NC, bench, gableUp, openSign, steps, ventStack } from './kindParts.js';

const WINDOW = 0x2c3a46;
const FOUND = 1.5;
const TURN = { s: 0, w: 90, n: 180, e: 270 };

// side: which local side of the footprint faces the road ('n'|'s'|'e'|'w').
// Returns false if the kind is not one of ours, else { chimney: {x, y, top} | null }
// (top = absolute height of the chimney top, for the smoke renderer).
export function buildKind(batch, b, base, side) {
  if (!['store', 'diner', 'cabin', 'shed'].includes(b.kind)) return false;
  const turn = TURN[side] ?? 0;
  const a = (b.angle || 0) + turn;
  const rotated = turn === 90 || turn === 270;
  const W = rotated ? b.h : b.w; // across the front
  const D = rotated ? b.w : b.h; // front to back
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, base, a, lx, ly, up, color, opts);
  const front = D / 2;
  let chim = null;
  if (b.kind === 'store') store(P, W, D, front);
  else if (b.kind === 'diner') diner(P, W, D, front);
  else if (b.kind === 'cabin') chim = cabin(P, W, D, front, b.chimney);
  else shed(P, W, D, front);
  if (!chim) return { chimney: null };
  const p = localToWorld(b.x, b.y, a, chim.lx, chim.ly);
  return { chimney: { x: p.x, y: p.y, top: base + chim.top } };
}

// General store: clapboard behind a tall false front with pilasters, a
// bracketed cornice and a raised middle; a blank sign board in a frame (no
// words until line review). A porch with turned-down posts on bases, corner
// brackets, a railing either side of the steps, and a bench out front. Big
// framed display windows on panelled bulkheads, a double door with glass, an
// OPEN sign in the window, and a vent stack on the roof.
// The whole footprint is solid, so the porch and its steps sit inside it.
function store(P, W, D, front) {
  const wall = 0xd8c9a3;
  const trim = 0xf1ede4;
  const brown = 0x7a5a3a;
  const green = 0x2f5a3a;
  const roofC = 0x6e6a60;
  const porch = 2.6;
  const fb = front - porch; // facade line
  const d = D - porch;
  const cy = (fb - D / 2) / 2;
  const deck = 0.35;
  const stepRun = 0.4;
  const postY = front - stepRun - 0.25;
  P(box(W, 4.6 + FOUND, d), 0, cy, -FOUND, wall);
  // Roof stops at the facade so the false front hides its gable end.
  const rw = W + 0.6;
  const rd = d + 0.3;
  const ry = cy - 0.15;
  P(gable(rw, rd, 2.2), 0, ry, 4.6, roofC);
  P(rw >= rd ? box(rw, 0.12, 0.3) : box(0.3, 0.12, rd), 0, ry, 6.74, 0x5a5650, NC); // ridge cap
  for (const sx of [-1, 1]) P(box(0.22, 4.6, 0.22), sx * (W / 2 + 0.01), -D / 2 + 0.1, 0, trim, NC); // back corner boards
  // False front: the board wall, a raised middle, pilasters, frieze, cornice on brackets.
  P(box(W + 0.7, 3.6, 0.3), 0, fb + 0.15, 4.0, wall);
  P(box(W * 0.4, 0.6, 0.3), 0, fb + 0.15, 7.6, wall);
  P(box(W * 0.4 + 0.3, 0.16, 0.5), 0, fb + 0.2, 8.2, brown);
  P(box(W + 1.0, 0.22, 0.55), 0, fb + 0.22, 7.38, brown);
  P(box(W + 0.7, 0.14, 0.08), 0, fb + 0.34, 6.75, trim, NC);
  const nb = Math.max(4, Math.round(W / 2.4));
  for (let i = 0; i <= nb; i++) P(box(0.14, 0.42, 0.3), -W / 2 - 0.2 + (i * (W + 0.4)) / nb, fb + 0.4, 6.96, brown, NC);
  for (const sx of [-1, 1]) {
    P(box(0.38, 3.7, 0.12), sx * (W / 2 + 0.16), fb + 0.36, 3.6, trim, NC);
    P(box(0.48, 0.16, 0.18), sx * (W / 2 + 0.16), fb + 0.38, 7.2, trim, NC);
  }
  // Blank sign board in a frame.
  const sw = W * 0.62;
  P(box(sw, 1.0, 0.1), 0, fb + 0.35, 5.3, green);
  for (const v of [5.2, 6.3]) P(box(sw + 0.24, 0.12, 0.14), 0, fb + 0.38, v, trim, NC);
  for (const sx of [-1, 1]) P(box(0.12, 1.22, 0.14), sx * (sw / 2 + 0.06), fb + 0.38, 5.2, trim, NC);
  // Porch: deck with a skirt board, steps in the middle, posts, beam, roof.
  P(box(W, deck, porch - stepRun), 0, fb + (porch - stepRun) / 2, 0, 0x8a6a45, { cast: false });
  P(box(W, 0.2, 0.06), 0, front - stepRun + 0.02, 0.1, 0x5e4630, NC);
  steps(P, 0, front - stepRun, 2.6, 1, deck / 2, stepRun, 0x8a6a45, 1, 0x6e5234);
  P(box(W + 0.2, 0.15, porch + 0.1), 0, fb + porch / 2, 3.2, 0x5a5f66);
  P(box(W + 0.2, 0.24, 0.06), 0, front + 0.06, 3.02, trim, NC); // fascia
  P(box(W - 0.2, 0.2, 0.2), 0, postY, 2.98, trim);
  const posts = [-1, -1 / 3, 1 / 3, 1].map((t) => t * (W / 2 - 0.3));
  for (const x of posts) {
    P(uprightSlab(0.22, 0.22, 2.63, 0.03, 0.01, 2), x, postY, deck, trim);
    P(box(0.32, 0.25, 0.32), x, postY, deck, trim, NC);
    P(box(0.32, 0.12, 0.32), x, postY, 2.86, trim, NC);
    for (const e of [-1, 1]) {
      if (Math.abs(x + e * 0.5) > W / 2 - 0.1) continue;
      P(strut(new THREE.Vector3(x + e * 0.1, 2.5, postY), new THREE.Vector3(x + e * 0.55, 2.97, postY), 0.04, 4), 0, 0, 0, trim, NC);
    }
  }
  // Railing in the outer bays and down the porch ends; the middle bay is open.
  const rail = (x0, x1) => {
    const L = x1 - x0;
    for (const v of [deck + 0.12, deck + 0.85]) P(box(L, 0.07, 0.09), (x0 + x1) / 2, postY, v, trim, NC);
    const n = Math.floor(L / 0.32);
    for (let i = 1; i < n; i++) P(box(0.05, 0.7, 0.05), x0 + (i * L) / n, postY, deck + 0.17, trim, NC);
  };
  rail(posts[0] + 0.11, posts[1] - 0.11);
  rail(posts[2] + 0.11, posts[3] - 0.11);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.3);
    const L = postY - fb - 0.2;
    for (const v of [deck + 0.12, deck + 0.85]) P(box(0.09, 0.07, L), x, fb + 0.1 + L / 2, v, trim, NC);
    for (let i = 1; i < Math.floor(L / 0.32); i++) P(box(0.05, 0.7, 0.05), x, fb + 0.1 + (i * L) / Math.floor(L / 0.32), deck + 0.17, trim, NC);
  }
  // Storefront: framed display windows on panelled bulkheads.
  const ww = W * 0.25;
  const wo = { frame: trim, sash: trim, sill: trim };
  for (const sx of [-1, 1]) {
    const x = sx * W * 0.28;
    P(box(ww + 0.24, 0.6, 0.06), x, fb + 0.03, deck + 0.1, green);
    for (const k of [-1, 1]) P(box(ww / 2 - 0.3, 0.36, 0.04), x + k * (ww / 4), fb + 0.07, deck + 0.22, 0x3a6a48, NC);
    framedWindow(P, x, fb, '+y', ww, 1.66, deck + 0.92, wo);
  }
  openSign(P, -W * 0.28 + ww * 0.22, fb + 0.07, deck + 1.95, 1, { board: 0xf1ede4, letters: 0x8c2a22, frame: green });
  // Double door with glass in a casing, brass knobs.
  for (const sx of [-1, 1]) {
    P(box(0.86, 2.3, 0.08), sx * 0.45, fb, deck, 0x5b3a2a);
    P(box(0.58, 1.0, 0.03), sx * 0.45, fb + 0.05, deck + 1.1, WINDOW, NC);
    P(box(0.58, 0.55, 0.03), sx * 0.45, fb + 0.05, deck + 0.25, 0x4a2e20, NC);
    P(box(0.06, 0.06, 0.06), sx * 0.09, fb + 0.07, deck + 1.0, 0xc8a24a, NC);
    P(box(0.14, 2.42, 0.16), sx * 1.0, fb + 0.04, deck, trim, NC);
  }
  P(box(2.3, 0.16, 0.18), 0, fb + 0.05, deck + 2.38, trim, NC);
  // Side windows.
  for (const sx of [-1, 1]) {
    for (const t of [-0.22, 0.22]) framedWindow(P, sx * W / 2, cy + t * d, sx < 0 ? '-x' : '+x', 1.0, 1.3, 1.3, wo);
  }
  // Bench and a barrel on the porch; a vent stack on the back slope.
  bench(P, -W / 2 + 1.9, fb + 0.55, deck, 1.9);
  P(cyl(0.35, 0.9, 10, 0.32), W / 2 - 1, fb + 0.7, deck, 0x7a5536);
  for (const v of [0.15, 0.7]) P(cyl(0.37, 0.06, 10), W / 2 - 1, fb + 0.7, deck + v, 0x3a3a38, NC);
  const vx = W * 0.25;
  const vy = ry - rd * 0.22;
  ventStack(P, vx, vy, 4.6 + gableUp(rw, rd, 2.2, vx, vy - ry) - 0.05, 1.0);
}

// Calder diner in the old schoolhouse: a stainless dining car along the
// road with domed ends, chrome window posts, sill and head bands, ribbed
// skirt; a rounded vestibule with a porthole door, a canopy and steps; an
// OPEN sign in neon red; a blank rooftop sign with bulbs; a bench out front.
// The white schoolhouse behind keeps its bell cupola and gets framed
// windows and the kitchen's vent stacks.
function diner(P, W, D, front) {
  const vest = 1.4; // vestibule and steps stay inside the solid footprint
  const carD = D * 0.5 - vest * 0.5;
  const carY = front - vest - carD / 2;
  const schoolD = D - carD - vest;
  const schoolY = -D / 2 + schoolD / 2;
  const red = 0x7a3b3b;
  // Schoolhouse: white clapboard, steep roof, cupola with a bell.
  const sw = W * 0.75;
  P(box(sw, 4.4 + FOUND, schoolD + 0.4), 0, schoolY, -FOUND, 0xf1ede4);
  const rw = sw + 0.8;
  const rd = schoolD + 1.2;
  P(gable(rw, rd, 3.4), 0, schoolY, 4.4, red);
  P(box(1.8, 1.8, 1.8), 0, schoolY, 6.6, 0xf1ede4);
  P(box(1.2, 0.9, 1.9), 0, schoolY, 7.0, 0x2a2a2a, { cast: false });
  P(cyl(0.35, 0.5, 8, 0.2), 0, schoolY, 7.1, 0xc9a24a);
  P(gable(2.4, 2.4, 1.2), 0, schoolY, 8.4, red);
  const so = { frame: red, sash: 0xf1ede4, sill: 0xdcd6c8 };
  for (const sx of [-1, 1]) {
    for (const ty of [-0.3, 0.3]) framedWindow(P, sx * sw / 2, schoolY + ty * schoolD, sx < 0 ? '-x' : '+x', 1.0, 1.7, 1.2, so);
    framedWindow(P, sx * sw * 0.25, -D / 2 - 0.2, '-y', 1.0, 1.7, 1.2, so);
  }
  // Kitchen vent stacks through the back slope.
  for (const [vx, h] of [[-sw * 0.28, 1.1], [sw * 0.12, 0.7]]) {
    const vy = schoolY - rd * 0.2;
    ventStack(P, vx, vy, 4.4 + gableUp(rw, rd, 3.4, vx, vy - schoolY) - 0.05, h);
  }
  // Dining car.
  const len = W;
  const mid = len - carD; // straight part between the round ends
  const R = carD / 2;
  const chrome = 0xc8cdd2;
  const bright = 0xe4e8eb;
  P(box(mid, 3.0 + FOUND, carD), 0, carY, -FOUND, chrome);
  const band = (up, h, out, color, opts) => {
    P(box(mid, h, carD + 2 * out), 0, carY, up, color, opts);
    for (const sx of [-1, 1]) P(cyl(R + out, h, 16), sx * mid / 2, carY, up, color, opts);
  };
  for (const sx of [-1, 1]) P(cyl(R, 3.0 + FOUND, 16), sx * mid / 2, carY, -FOUND, chrome);
  band(-0.2, 0.42, 0.03, 0x3a3d40, NC); // dark skirt
  band(0.42, 0.05, 0.05, bright, NC); // ribs
  band(0.62, 0.05, 0.05, bright, NC);
  band(0.9, 0.35, 0.06, 0xc0392b, NC); // red stripe
  band(1.42, 0.07, 0.1, bright, NC); // sill
  band(1.5, 0.9, 0.04, WINDOW, NC); // glass
  band(2.4, 0.08, 0.08, bright, NC); // head
  // Window posts round the front and the ends, clear of the door and the sign.
  const cf = carY + R;
  const sign = { x0: 1.4, x1: 3.0 };
  for (let x = -mid / 2 + 0.5; x < mid / 2 - 0.2; x += 1.05) {
    if (Math.abs(x) < 1.3 || (x > sign.x0 && x < sign.x1)) continue;
    P(box(0.08, 0.9, 0.08), x, cf + 0.05, 1.5, bright, NC);
  }
  for (const sx of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const f = (k * Math.PI) / 5;
      P(box(0.08, 0.9, 0.08), sx * (mid / 2 + (R + 0.05) * Math.cos(f)), carY + (R + 0.05) * Math.sin(f), 1.5, bright, NC);
    }
  }
  // Barrel roof with domed ends and a monitor strip.
  const roof = new THREE.CylinderGeometry(R, R, mid, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.45, 1);
  P(roof, 0, carY, 3.0, 0xaeb4ba);
  for (const sx of [-1, 1]) {
    const dome = new THREE.SphereGeometry(R, 10, 4, sx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(1, 0.45, 1);
    P(dome, sx * mid / 2, carY, 3.0, 0xaeb4ba);
  }
  P(box(mid, 0.5, 1.4), 0, carY, 3.0 + carD * 0.22, 0xdfe3e6);
  P(box(mid + 0.1, 0.06, 1.5), 0, carY, 3.0 + carD * 0.22 + 0.5, bright, NC);
  // Vestibule with rounded corners, a porthole door in a chrome frame, a
  // canopy with a lamp, and two steps with metal nosing.
  P(uprightSlab(2.3, 1.0, 3.0, 0.14), 0, cf + 0.4, 0, 0xdfe3e6);
  P(box(2.36, 0.1, 1.06), 0, cf + 0.4, 3.0, bright, NC);
  const vf = cf + 0.9;
  P(box(1.0, 2.0, 0.1), 0, vf, 0.3, 0x8a2a20);
  P(cyl(0.2, 0.04, 14).rotateX(Math.PI / 2), 0, vf + 0.06, 1.55, WINDOW, NC);
  P(cyl(0.25, 0.05, 14).rotateX(Math.PI / 2), 0, vf + 0.05, 1.5, bright, NC);
  P(box(0.06, 0.06, 0.1), 0.38, vf + 0.08, 1.2, bright, NC); // handle
  for (const e of [-1, 1]) P(box(0.08, 2.12, 0.08), e * 0.54, vf + 0.03, 0.3, bright, NC);
  P(box(1.16, 0.08, 0.08), 0, vf + 0.03, 2.3, bright, NC);
  P(box(1.7, 0.08, 0.5), 0, vf + 0.2, 2.55, bright);
  P(cyl(0.08, 0.1, 8), 0, vf + 0.3, 2.45, 0xf2e6b8, NC);
  steps(P, 0, vf + 0.05, 1.8, 2, 0.15, 0.22, 0x9a9890, 1, bright);
  // OPEN in neon red in the window right of the door.
  openSign(P, (sign.x0 + sign.x1) / 2, cf + 0.06, 1.68, 1, { frame: bright });
  // A rooftop sign frame (no words) on poles, with a row of bulbs top and bottom.
  const sy = 3.0 + carD * 0.3;
  for (const sx of [-1, 1]) P(box(0.15, 1.6, 0.15), sx * 2.4, carY, sy, 0x555555, { cast: false });
  P(box(5.6, 1.2, 0.2), 0, carY, sy + 1.4, 0xc0392b);
  P(box(5.0, 0.18, 0.22), 0, carY, sy + 1.9, 0xf2efe6, { cast: false });
  for (const v of [0, 1.1]) P(box(5.8, 0.1, 0.26), 0, carY, sy + 1.4 + v, bright, NC);
  for (const e of [-1, 1]) P(box(0.1, 1.2, 0.26), e * 2.85, carY, sy + 1.4, bright, NC);
  for (let x = -2.6; x <= 2.61; x += 0.4) {
    for (const v of [1.55, 2.35]) P(box(0.1, 0.1, 0.05), x, carY + 0.12, sy + v, 0xf6e7a8, NC);
  }
  // A bench out front beside the vestibule.
  bench(P, -3.6, cf + 0.75, 0, 1.8, 1, 0xb03a2e, 0x8a8f92);
}

// A log lying along y, centred on the origin (cyl() stands on its base, so
// turning it on its side would shift it by half its length).
const logGeo = (r, len) => new THREE.CylinderGeometry(r, r, len, 6);

// Log cabin: stacked logs, notched corners, stone chimney, a porch with a
// bench, braced posts and a step, framed windows with shutters, a plank door
// in a casing, a stovepipe vent; all inside the footprint (it is solid).
function cabin(P, W, D, front, chimney) {
  const wallH = 3.0;
  const r = 0.18;
  const logA = 0x7a5536;
  const logB = 0x6a4a2e;
  const board = 0x8a6a45;
  const porch = 2;
  const d = D - porch;
  const cy = -porch / 2;
  const fb = front - porch;
  const w = W - 0.8; // room for the chimney on the side
  const cx = 0.4;
  const deck = 0.25;
  const stepRun = 0.35;
  const postY = front - stepRun - 0.2;
  P(box(w - 0.4, wallH, d - 0.4), cx, cy, -0.3, 0x5a3e26);
  let i = 0;
  for (let y = 0; y < wallH; y += r * 2, i++) {
    const c = i % 2 ? logA : logB;
    for (const sy of [-1, 1]) {
      const lg = logGeo(r, w + 0.4).rotateZ(Math.PI / 2).translate(0, r, 0);
      P(lg, cx, cy + sy * (d / 2 - 0.2), y, c);
    }
    for (const sx of [-1, 1]) {
      const lg = logGeo(r, d + 0.4).rotateX(Math.PI / 2).translate(0, r, 0);
      P(lg, cx + sx * (w / 2 - 0.2), cy, y + r, c);
    }
  }
  const rw = w + 0.8;
  const rd = d + 0.9;
  P(gable(rw, rd, 2.4), cx, cy, wallH, 0x4f4a3f);
  P(rw >= rd ? box(rw, 0.1, 0.26) : box(0.26, 0.1, rd), cx, cy, wallH + 2.37, 0x3e3a32, NC); // ridge cap
  // Plank door in a casing, a batten and a latch.
  const wf = fb - 0.02; // face of the front logs
  P(box(1.0, 2.0, 0.12), cx, wf - 0.04, deck, 0x4a3420);
  for (const e of [-0.25, 0, 0.25]) P(box(0.03, 1.96, 0.03), cx + e, wf + 0.03, deck + 0.02, 0x37261a, NC);
  P(box(0.9, 0.12, 0.04), cx, wf + 0.04, deck + 0.9, 0x5a4028, NC);
  P(box(0.05, 0.14, 0.06), cx + 0.36, wf + 0.07, deck + 1.0, 0x2a2a28, NC);
  for (const e of [-1, 1]) P(box(0.14, 2.12, 0.16), cx + e * 0.57, wf + 0.04, deck, board, NC);
  P(box(1.3, 0.16, 0.18), cx, wf + 0.05, deck + 2.1, board, NC);
  // Framed windows with shutters on the front, one framed window on the side.
  const wo = { frame: board, sash: 0xe8e2d0, sill: board };
  for (const sx of [-1, 1]) {
    const x = cx + sx * w * 0.3;
    framedWindow(P, x, wf, '+y', 0.8, 0.9, 1.1, wo);
    P(box(0.3, 0.95, 0.06), x + sx * 0.71, wf + 0.03, 1.08, 0x2f5a3a, NC);
    for (const v of [1.25, 1.6]) P(box(0.24, 0.03, 0.03), x + sx * 0.71, wf + 0.07, v, 0x24462e, NC);
  }
  framedWindow(P, cx + w / 2 - 0.02, cy + d * 0.15, '+x', 0.8, 0.9, 1.1, wo);
  // Porch boards, a step, braced posts on a beam, and a lean-to roof.
  P(box(w, deck, porch - stepRun), cx, fb + (porch - stepRun) / 2, 0, board, { cast: false });
  for (let k = 1; k < 8; k++) P(box(0.02, 0.01, porch - stepRun), cx - w / 2 + (k * w) / 8, fb + (porch - stepRun) / 2, deck, 0x6e5234, NC);
  steps(P, cx, front - stepRun, 1.4, 1, deck / 2, stepRun, board, 1, 0x6e5234);
  P(box(w + 0.2, 0.12, porch + 0.2), cx, fb + porch / 2, 2.4, 0x4f4a3f);
  P(logGeo(0.12, w - 0.2).rotateZ(Math.PI / 2).translate(0, 0.12, 0), cx, postY, 2.16, logA);
  for (const sx of [-1, 1]) {
    const x = cx + sx * (w / 2 - 0.3);
    P(cyl(0.12, 2.2, 6), x, postY, deck, logA);
    P(strut(new THREE.Vector3(x, 1.8, postY), new THREE.Vector3(x - sx * 0.5, 2.28, postY), 0.05, 5), 0, 0, 0, logB, NC);
  }
  // Bench by the door; the woodpile at the other end.
  bench(P, cx - w / 2 + 1.2, fb + 0.45, deck, 1.5, 1, 0x8a6a45, 0x5a4028);
  for (let k = 0; k < 8; k++) {
    const lg = logGeo(0.14, 0.9).rotateZ(Math.PI / 2).translate(0, 0.14, 0);
    P(lg, cx + w / 2 - 0.9, fb + 0.3 + (k % 4) * 0.28 + (k >= 4 ? 0.14 : 0), deck + Math.floor(k / 4) * 0.26, 0x8a6a45);
  }
  // Stovepipe through the roof on the far side from the chimney.
  const vx = rw >= rd ? w * 0.25 : rw * 0.25;
  const vy = rw >= rd ? -rd * 0.25 : d * 0.2;
  ventStack(P, cx + vx, cy + vy, wallH + gableUp(rw, rd, 2.4, vx, vy) - 0.05, 0.8, 0x3a3a38);
  // Stone chimney up the west wall.
  if (chimney === false) return null;
  const chx = -W / 2 + 0.6;
  const chy = cy - d * 0.1;
  P(box(1.2, wallH + 3.4, 1.1), chx, chy, -0.2, 0x8a847a);
  P(box(1.0, 0.4, 0.9), chx, chy, wallH + 3.2, 0x6e6a62);
  return { lx: chx, ly: chy, top: wallH + 3.6 };
}

// Quarry office shed: corrugated metal walls, a single-slope roof, small windows.
function shed(P, W, D, front) {
  const metal = 0x9aa0a3;
  const hiH = 3.6;
  const loH = 2.8;
  P(box(W, loH + FOUND, D), 0, 0, -FOUND, metal);
  // Ribs on the long walls.
  for (let x = -W / 2 + 0.4; x < W / 2; x += 0.8) {
    P(box(0.08, loH, 0.06), x, front + 0.02, 0, 0x7f8588, { cast: false });
  }
  // Sloped roof: front high, back low.
  const roof = new THREE.Matrix4().makeRotationX(-Math.atan2(hiH - loH, D));
  P(box(W + 0.6, 0.12, D + 0.8), 0, 0, (hiH + loH) / 2, 0x6f7477, { extra: roof });
  // Front wall top up to the high side.
  P(box(W, hiH - loH, 0.12), 0, front, loH, metal);
  P(box(1.0, 2.1, 0.12), -W * 0.25, front + 0.02, 0, 0x5b6a74);
  P(box(2.0, 1.0, 0.12), W * 0.15, front + 0.02, 1.2, WINDOW);
  P(box(1.2, 0.15, 0.6), -W * 0.25, front + 0.3, 2.2, 0x6f7477);
}
