// Building kinds added in phase 2: store, diner, cabin, shed.
// Each is built in a frame turned so its front (local +ly) faces the road.

import * as THREE from 'three';
import { localToWorld } from '../../src/drive/geom.js';
import { box, cyl, gable } from './shapes.js';

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

// General store: clapboard, a tall false front, a porch with posts and a bench.
// The whole footprint is solid, so the porch sits inside it.
function store(P, W, D, front) {
  const wall = 0xd8c9a3;
  const porch = 2.6;
  const fb = front - porch; // facade line
  const cy = (fb - D / 2) / 2;
  const d = D - porch;
  P(box(W, 4.6 + FOUND, d), 0, cy, -FOUND, wall);
  P(gable(W + 0.6, d + 0.6, 2.2), 0, cy, 4.6, 0x6e6a60);
  // False front rises above the roof line.
  P(box(W + 0.4, 3.6, 0.3), 0, fb + 0.05, 4.0, wall);
  P(box(W + 0.7, 0.3, 0.5), 0, fb + 0.05, 7.6, 0x7a5a3a);
  P(box(W * 0.62, 1.0, 0.1), 0, fb + 0.22, 5.4, 0x2f5a3a); // blank sign board
  P(box(W * 0.58, 0.12, 0.12), 0, fb + 0.26, 5.85, 0xe9dfc0, { cast: false });
  // Porch with posts and a shed roof.
  P(box(W, 0.35, porch), 0, fb + porch / 2, 0, 0x8a6a45, { cast: false });
  P(box(W + 0.2, 0.15, porch + 0.1), 0, fb + porch / 2, 3.2, 0x5a5f66);
  for (let x = -W / 2 + 0.3; x <= W / 2; x += (W - 0.6) / 4) P(box(0.22, 3.2, 0.22), x, front - 0.2, 0.3, 0xf1ede4);
  // Windows and a double door.
  P(box(W * 0.25, 1.6, 0.12), -W * 0.28, fb, 0.9, WINDOW);
  P(box(W * 0.25, 1.6, 0.12), W * 0.28, fb, 0.9, WINDOW);
  P(box(1.8, 2.3, 0.14), 0, fb, 0.3, 0x5b3a2a);
  for (const sx of [-1, 1]) P(box(0.12, 1.2, 1.2), sx * W / 2, cy, 1.4, WINDOW);
  // Bench and a barrel on the porch.
  P(box(2, 0.12, 0.5), -W / 2 + 2, fb + 0.6, 0.75, 0x6e5234);
  P(cyl(0.35, 0.9, 8), W / 2 - 1, fb + 0.7, 0.35, 0x7a5536);
}

// Calder diner in the old schoolhouse: a chrome dining car along the road,
// the white schoolhouse behind it with its bell cupola still on the roof.
function diner(P, W, D, front) {
  const vest = 1.4; // vestibule and step stay inside the solid footprint
  const carD = D * 0.5 - vest * 0.5;
  const carY = front - vest - carD / 2;
  const schoolD = D - carD - vest;
  const schoolY = -D / 2 + schoolD / 2;
  // Schoolhouse: white clapboard, steep roof, cupola with a bell.
  P(box(W * 0.75, 4.4 + FOUND, schoolD + 0.4), 0, schoolY, -FOUND, 0xf1ede4);
  P(gable(W * 0.75 + 0.8, schoolD + 1.2, 3.4), 0, schoolY, 4.4, 0x7a3b3b);
  P(box(1.8, 1.8, 1.8), 0, schoolY, 6.6, 0xf1ede4);
  P(box(1.2, 0.9, 1.9), 0, schoolY, 7.0, 0x2a2a2a, { cast: false });
  P(cyl(0.35, 0.5, 8, 0.2), 0, schoolY, 7.1, 0xc9a24a);
  P(gable(2.4, 2.4, 1.2), 0, schoolY, 8.4, 0x7a3b3b);
  for (const sx of [-1, 1]) {
    for (const ty of [-0.3, 0.3]) P(box(0.12, 1.8, 1.1), sx * W * 0.375, schoolY + ty * schoolD, 1.2, WINDOW);
  }
  // Dining car: stainless body, rounded ends, red stripe, a band of windows, barrel roof.
  const len = W;
  const chrome = 0xc8cdd2;
  const body = new THREE.CylinderGeometry(carD / 2, carD / 2, len - carD, 14, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2); // half drum, axis along x, curved side up
  P(box(len - carD, 3.0 + FOUND, carD), 0, carY, -FOUND, chrome);
  for (const sx of [-1, 1]) {
    P(cyl(carD / 2, 3.0 + FOUND, 14), sx * (len - carD) / 2, carY, -FOUND, chrome);
    P(cyl(carD / 2 + 0.06, 0.35, 14), sx * (len - carD) / 2, carY, 0.9, 0xc0392b, { cast: false });
    P(cyl(carD / 2 + 0.04, 0.9, 14), sx * (len - carD) / 2, carY, 1.5, WINDOW, { cast: false });
  }
  P(box(len - carD, 0.35, carD + 0.12), 0, carY, 0.9, 0xc0392b, { cast: false });
  P(box(len - carD, 0.9, carD + 0.08), 0, carY, 1.5, WINDOW, { cast: false });
  // Barrel roof with a monitor strip.
  P(body.clone().scale(1, 0.45, 1), 0, carY, 3.0, 0xaeb4ba);
  P(box(len - carD, 0.5, 1.4), 0, carY, 3.0 + carD * 0.22, 0xdfe3e6);
  // Front door with a little vestibule and a step.
  const cf = carY + carD / 2;
  P(box(2.2, 3.0, 1.0), 0, cf + 0.4, 0, 0xdfe3e6);
  P(box(1.0, 2.1, 0.1), 0, cf + 0.92, 0.1, 0x8a2a20);
  P(box(2.4, 0.2, 0.5), 0, cf + 1.15, 0, 0x9a9890, { cast: false });
  // A rooftop sign frame (no text) on poles.
  for (const sx of [-1, 1]) P(box(0.15, 1.6, 0.15), sx * 2.4, carY, 3.0 + carD * 0.3, 0x555555, { cast: false });
  P(box(5.6, 1.2, 0.2), 0, carY, 3.0 + carD * 0.3 + 1.4, 0xc0392b);
  P(box(5.0, 0.18, 0.22), 0, carY, 3.0 + carD * 0.3 + 1.9, 0xf2efe6, { cast: false });
}

// Log cabin: stacked logs, notched corners, stone chimney, small porch, all
// inside the footprint (it is solid).
function cabin(P, W, D, front, chimney) {
  const wallH = 3.0;
  const r = 0.18;
  const logA = 0x7a5536;
  const logB = 0x6a4a2e;
  const porch = 2;
  const d = D - porch;
  const cy = -porch / 2;
  const fb = front - porch;
  const w = W - 0.8; // room for the chimney on the side
  const cx = 0.4;
  P(box(w - 0.4, wallH, d - 0.4), cx, cy, -0.3, 0x5a3e26);
  let i = 0;
  for (let y = 0; y < wallH; y += r * 2, i++) {
    const c = i % 2 ? logA : logB;
    for (const sy of [-1, 1]) {
      const lg = cyl(r, w + 0.4, 6).rotateZ(Math.PI / 2).translate(0, r, 0);
      P(lg, cx, cy + sy * (d / 2 - 0.2), y, c);
    }
    for (const sx of [-1, 1]) {
      const lg = cyl(r, d + 0.4, 6).rotateX(Math.PI / 2).translate(0, r, 0);
      P(lg, cx + sx * (w / 2 - 0.2), cy, y + r, c);
    }
  }
  P(gable(w + 0.8, d + 0.9, 2.4), cx, cy, wallH, 0x4f4a3f);
  // Door, windows with shutters.
  P(box(1.0, 2.0, 0.12), cx, fb - 0.05, 0, 0x4a3420);
  for (const sx of [-1, 1]) {
    P(box(0.9, 0.9, 0.12), cx + sx * w * 0.3, fb - 0.05, 1.1, WINDOW);
    P(box(0.3, 0.9, 0.14), cx + sx * (w * 0.3 + 0.62), fb - 0.05, 1.1, 0x2f5a3a);
  }
  // Porch boards, posts and a lean-to roof.
  P(box(w, 0.25, porch), cx, fb + porch / 2, 0, 0x8a6a45, { cast: false });
  P(box(w + 0.2, 0.12, porch + 0.2), cx, fb + porch / 2, 2.4, 0x4f4a3f);
  for (const sx of [-1, 1]) P(cyl(0.12, 2.4, 6), cx + sx * (w / 2 - 0.3), front - 0.25, 0, logA);
  // Woodpile on the porch.
  for (let k = 0; k < 8; k++) {
    const lg = cyl(0.14, 0.9, 6).rotateZ(Math.PI / 2).translate(0, 0.14, 0);
    P(lg, cx + w / 2 - 0.9, fb + 0.3 + (k % 4) * 0.28 + (k >= 4 ? 0.14 : 0), 0.25 + Math.floor(k / 4) * 0.26, 0x8a6a45);
  }
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
