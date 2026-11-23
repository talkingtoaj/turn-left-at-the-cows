// The campground (#75, SPEC 9r): the gravel loop and pads (painted), a fire
// ring of stones with a steel grate on a swing post, tents with poles,
// guy ropes and pegs, picnic tables built like the real thing (planked top
// with gaps, A-frame legs, benches, braces), a log cabin with notched
// corners, a framed door and window, a porch roof on posts, a shingled roof
// with fascia and a stovepipe, a cast-iron hand pump on a pad, and a
// woodpile under a lean-to.
//
// Everything goes into the shared batch: no draw calls of its own.
// Solids: CAMP in layout.js, unchanged.

import * as THREE from 'three';
import { makeRng, hashString, localToWorld } from '../../src/drive/geom.js';
import { CAMP } from '../../src/drive/layout.js';
import { box, cyl, gable } from './shapes.js';
import { uprightSlab } from './roundShapes.js';
import { beam } from './bridge3d.js';

// Colours pick textures (src3/look/surfaces.js): boards, logs, shingles, concrete.
const PLANK = [0x8a6a45, 0x8a6c4a, 0x7a5d3e];
const FRAME = 0x6e5234;
const LOG = [0x7a5536, 0x6a4a2e];
const CHINK = 0xb9b2a2;
const ROOF = 0x4f6a5a;
const IRON = 0x2f3a33;
const PUMP = 0x2f5a3a;
const STONE = 0x7d786f;
const NC = { cast: false, share: true }; // small pieces join a bucket the chunk has (batch.js)

export function buildCampground(terrain, batch, l) {
  const A = batch.audit;
  const rng = makeRng(hashString(l.id));
  const range = (lx, ly, w, h) => terrain.groundRange({ rect: { x: l.x + lx, y: l.y + ly, w, h, angle: 0 } });
  const at = (lx, ly) => (geo, x, y, up, color, opts) => batch.place(geo, l.x + lx, l.y + ly, terrain.heightAt(l.x + lx, l.y + ly), 0, x, y, up, color, opts);
  // Gravel loop road (an ellipse ring) and a pad at each site, painted on.
  const lp = CAMP.loop;
  const ring = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    ring.push([l.x + lp.lx + Math.cos(t) * lp.rx, l.y + lp.ly + Math.sin(t) * lp.ry]);
  }
  if (batch.paint) {
    batch.paint.stroke(ring, 3.6, 0xa29d92);
    for (const p of CAMP.pads) batch.paint.polygon([[-3, -2.5], [3, -2.5], [3, 2.5], [-3, 2.5]].map(([x, y]) => [l.x + p.lx + x, l.y + p.ly + y]), 0xb3a98f);
  }
  fireRing(batch, l, range, at, rng);
  CAMP.pads.forEach((p, i) => tent(batch, l, range, at, p, i, A));
  for (const [tx, ty] of CAMP.tables) table(batch, l, range, tx, ty, A);
  cabin(batch, l, range, A, rng);
  const hu = CAMP.hut;
  pump(batch, l, terrain, hu.lx + 4, hu.ly + 1);
  return true;
}

// Fire ring: stones round a charred bed, crossed logs, and a steel cooking
// grate on a swing post.
function fireRing(batch, l, range, at, rng) {
  const f = CAMP.fire;
  const fb = range(f.lx, f.ly, f.r * 2, f.r * 2);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const sx = f.lx + Math.cos(ang) * f.r;
    const sy = f.ly + Math.sin(ang) * f.r;
    const s = 0.85 + rng() * 0.35;
    at(sx, sy)(new THREE.DodecahedronGeometry(0.32, 0), 0, 0, 0.05, i % 3 ? STONE : 0x86807a, { extra: new THREE.Matrix4().makeScale(s, s * 0.8, s) });
  }
  if (batch.paint) batch.paint.disc(l.x + f.lx, l.y + f.ly, f.r - 0.2, 0x2a2420);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().makeRotationY((i * Math.PI) / 4).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    batch.place(cyl(0.12, 1.4, 6).translate(0, -0.7, 0), l.x, l.y, fb.max, 0, f.lx, f.ly, 0.15, 0x3a2a1a, { extra: m });
  }
  // Swing post outside the ring, arm over the fire, a bar grate.
  const px = f.lx + f.r + 0.35;
  const P = at(px, f.ly);
  P(cyl(0.05, 0.9, 6), 0, 0, -0.2, IRON);
  P(box(0.7, 0.04, 0.04), -0.35, 0, 0.66, IRON, NC);
  const g = at(f.lx + 0.35, f.ly);
  for (let i = 0; i < 6; i++) g(box(0.04, 0.03, 0.5), -0.2 + i * 0.08, 0, 0.62, IRON, NC);
  for (const y of [-0.25, 0.25]) g(box(0.5, 0.03, 0.04), 0, y, 0.62, IRON, NC);
}

// Tents (solid rects CAMP.tent), door toward the fire. They sit at the low
// corner and the fabric reaches the ground all round. Poles, guy ropes,
// pegs; a ridge seam on the A-frames and hoop lines on the domes.
function tent(batch, l, range, at, p, i, A) {
  if (!p.tent) return;
  const { w, h } = CAMP.tent;
  const g = range(p.lx, p.ly, w, h);
  const sink = g.max - g.min;
  const T = (geo, x, y, up, color, opts) => batch.place(geo, l.x + p.lx, l.y + p.ly, g.min - 0.05, 0, x, y, up, color, opts);
  if (A) A.rect(l.id, 'tent', l.x + p.lx, l.y + p.ly, w, h, 0, g.min - 0.05, null);
  const toFire = CAMP.fire.ly > p.ly ? 1 : -1;
  const darker = new THREE.Color(p.tent).multiplyScalar(0.7).getHex();
  if (i % 2) {
    const ht = 1.8 + sink;
    T(gable(w, h, ht), 0, 0, 0, p.tent);
    // Ridge seam and the poles at each end.
    T(box(0.08, 0.06, h + 0.04), 0, 0, ht - 0.03, darker, NC);
    for (const e of [-1, 1]) T(cyl(0.025, ht + 0.2, 4), 0, e * (h / 2 + 0.03), 0, 0x9a9a9a, NC);
    // Door: a dark opening with the flaps tied back.
    T(box(0.9, 1.2, 0.05), 0, toFire * (h / 2 + 0.02), sink, 0x2a2a2a, NC);
    for (const s of [-1, 1]) T(box(0.18, 1.1, 0.06), s * 0.55, toFire * (h / 2 + 0.03), sink + 0.05, darker, NC);
    // Guy ropes from each pole top out to a peg along the ridge line.
    for (const e of [-1, 1]) {
      const yy = e * (h / 2 + 1.1);
      T(beam([0, ht + 0.15, e * (h / 2 + 0.03)], [0, sink + 0.05, yy], 0.015, 0.015), 0, 0, 0, 0xdddddd, NC);
      T(box(0.05, 0.25, 0.05), 0, yy, sink - 0.1, 0xb0b0b0, NC);
    }
  } else {
    const ht = 1.3 + sink;
    T(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, ht, h / 2), 0, 0, 0, p.tent);
    // Two crossing pole hoops over the dome.
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const hoop = new THREE.TorusGeometry(1, 0.012, 3, 16, Math.PI).scale(w / 2 + 0.02, ht + 0.02, h / 2 + 0.02);
      T(hoop.rotateY(r), 0, 0, 0, darker, NC);
    }
    T(box(0.8, 0.9, 0.1), 0, toFire * (h / 2 - 0.1), sink, 0x2a2a2a, NC);
    for (const sx of [-1, 1]) {
      T(beam([sx * (w / 2 - 0.3), ht * 0.65, 0], [sx * (w / 2 + 0.5), sink + 0.05, 0], 0.015, 0.015), 0, 0, 0, 0xdddddd, NC);
    }
  }
  // Pegs at the corners.
  for (const sx of [-1, 1]) at(p.lx + sx * (w / 2 + 0.5), p.ly)(box(0.06, 0.25, 0.06), 0, 0, -0.05, 0xdddddd, NC);
}

// Picnic table (solid rect CAMP.table): a level top of five planks with
// gaps, two benches, A-frame legs down to the ground, braces under the top.
function table(batch, l, range, tx, ty, A) {
  const { w, h } = CAMP.table;
  const g = range(tx, ty, w, h);
  const P = (geo, x, y, up, color, opts) => batch.place(geo, l.x, l.y, g.max, 0, x, y, up, color, opts);
  for (let i = 0; i < 5; i++) P(box(w, 0.06, 0.15), tx, ty - 0.33 + i * 0.165, 0.73, PLANK[i % 3]);
  for (const s of [-1, 1]) {
    for (const k of [0, 1]) P(box(w, 0.05, 0.13), tx, ty + s * (h / 2 - 0.08 - k * 0.15), 0.43, PLANK[(k + 1) % 3]);
  }
  const drop = g.max - g.min + 0.1;
  for (const dx of [-w / 2 + 0.25, w / 2 - 0.25]) {
    // A-frame: two legs splayed from under the top to the ground.
    for (const s of [-1, 1]) P(beam([dx, 0.72, s * 0.18], [dx, -drop, s * (h / 2 - 0.02)], 0.07, 0.11), tx, ty, 0, FRAME, NC);
    P(box(0.08, 0.08, 0.78), tx + dx, ty, 0.65, FRAME, NC); // top cleat
    P(box(0.08, 0.08, h + 0.02), tx + dx, ty, 0.35, FRAME, NC); // seat support
  }
  // Diagonal braces from the seat supports up to the middle of the top.
  for (const s of [-1, 1]) P(beam([s * (w / 2 - 0.3), 0.4, 0], [0, 0.69, 0], 0.06, 0.06), tx, ty, 0, FRAME, NC);
  if (A) A.rect(l.id, 'picnic_table', l.x + tx, l.y + ty, w, h, 0, g.max - drop, g.max + 0.3);
}

// The camp hut (solid rect CAMP.hut): a log cabin on a stone footing where
// the ground falls away. Logs with notched corners that stick out, chinking
// between them, a framed door and window with a sill, a porch roof on two
// posts over the door, a shingled roof with fascia, and a stovepipe.
function cabin(batch, l, range, A, rng) {
  const hu = CAMP.hut;
  const hg = range(hu.lx, hu.ly, hu.w, hu.h);
  const P = (geo, x, y, up, color, opts) => batch.place(geo, l.x, l.y, hg.max, 0, x, y, up, color, opts);
  const foot = hg.max - hg.min + 0.3;
  if (foot > 0.4) P(box(hu.w + 0.3, foot + 0.15, hu.h + 0.3), hu.lx, hu.ly, -foot, 0x8a847a);
  if (A) A.rect(l.id, 'camp_hut', l.x + hu.lx, l.y + hu.ly, hu.w, hu.h, 0, hg.max - Math.max(foot, 0.3), hg.max);
  // The solid core (as before), a little inside the logs.
  P(box(hu.w - 0.2, 2.6, hu.h - 0.2), hu.lx, hu.ly, -0.3, CHINK);
  const r = 0.15;
  const courses = 8;
  for (let k = 0; k < courses; k++) {
    const up = -0.1 + k * 0.3 + r;
    // Alternate courses: long walls one row, end walls the next (notched).
    const sideRow = k % 2 === 0;
    const lenX = hu.w + 0.5;
    const lenY = hu.h + 0.5;
    for (const s of [-1, 1]) {
      const logX = new THREE.CylinderGeometry(r, r, lenX + (rng() - 0.5) * 0.15, 7).rotateZ(Math.PI / 2);
      const logY = new THREE.CylinderGeometry(r, r, lenY + (rng() - 0.5) * 0.15, 7).rotateX(Math.PI / 2);
      P(logX, hu.lx, hu.ly + s * (hu.h / 2 - r * 0.6), up + (sideRow ? 0 : 0.15), LOG[(k + (s > 0 ? 1 : 0)) % 2]);
      P(logY, hu.lx + s * (hu.w / 2 - r * 0.6), hu.ly, up + (sideRow ? 0.15 : 0), LOG[(k + 1) % 2]);
    }
  }
  // Roof with a fascia and a ridge board.
  P(gable(hu.w + 0.8, hu.h + 0.8, 1.2), hu.lx, hu.ly, 2.4, ROOF);
  for (const s of [-1, 1]) P(box(hu.w + 0.82, 0.18, 0.05), hu.lx, hu.ly + s * (hu.h / 2 + 0.41), 2.32, FRAME, NC);
  P(box(hu.w + 0.85, 0.08, 0.16), hu.lx, hu.ly, 3.58, FRAME, NC);
  // Stovepipe with a cap.
  P(cyl(0.1, 1.3, 8), hu.lx + 1.2, hu.ly - 0.4, 3.0, 0x3a3a3a, NC);
  P(cyl(0.16, 0.06, 8), hu.lx + 1.2, hu.ly - 0.4, 4.32, 0x3a3a3a, NC);
  // Door (south face): frame, planks, a Z brace, a latch.
  const dy = hu.ly + hu.h / 2 + 0.02;
  const dx = hu.lx - 0.8;
  P(box(1.1, 2.05, 0.1), dx, dy + 0.05, -0.05, FRAME);
  P(box(0.86, 1.92, 0.06), dx, dy + 0.1, 0, 0x5e4630, NC);
  for (const y of [0.3, 1.6]) P(box(0.8, 0.1, 0.04), dx, dy + 0.14, y, 0x4a3420, NC);
  P(beam([dx - 0.35, 0.4, dy + 0.14], [dx + 0.35, 1.6, dy + 0.14], 0.1, 0.04), 0, 0, 0, 0x4a3420, NC);
  P(box(0.12, 0.04, 0.05), dx + 0.3, dy + 0.17, 1.0, 0x2a2a2a, NC);
  // Window: frame, sash cross, glass, sill.
  const wx = hu.lx + 1.1;
  P(box(0.95, 0.8, 0.1), wx, dy + 0.05, 1.05, FRAME);
  P(box(0.75, 0.6, 0.04), wx, dy + 0.1, 1.15, 0x2c3a46, NC);
  P(box(0.05, 0.6, 0.06), wx, dy + 0.11, 1.15, FRAME, NC);
  P(box(0.75, 0.05, 0.06), wx, dy + 0.11, 1.42, FRAME, NC);
  P(box(1.1, 0.06, 0.2), wx, dy + 0.1, 1.0, PLANK[2], NC);
  // Porch roof on two posts over the door.
  P(box(2.2, 0.08, 1.4), dx + 0.3, dy + 0.75, 2.2, ROOF, { extra: new THREE.Matrix4().makeRotationX(0.18) });
  for (const s of [-1, 1]) P(uprightSlab(0.14, 0.14, 2.15, 0.02, 0.02), dx + 0.3 + s * 0.95, dy + 1.3, -0.1, LOG[0]);
  P(box(2.1, 0.12, 0.12), dx + 0.3, dy + 1.3, 1.98, FRAME, NC);
  // Woodpile against the east wall under a lean-to.
  const wpx = hu.lx + hu.w / 2 + 0.55;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 7 - (row % 2); i++) {
      const y = hu.ly - 1.2 + i * 0.36 + (row % 2) * 0.18;
      P(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6).rotateZ(Math.PI / 2), wpx, y, 0.15 + row * 0.27, LOG[(row + i) % 2], NC);
    }
  }
  P(box(0.9, 0.06, 2.8), wpx + 0.1, hu.ly, 1.35, 0x6a6f72, { extra: new THREE.Matrix4().makeRotationZ(-0.25) });
  for (const s of [-1, 1]) P(box(0.08, 1.2, 0.08), wpx + 0.45, hu.ly + s * 1.3, -0.1, FRAME, NC);
}

// A cast-iron hand pump on a concrete pad: the barrel, a spout, the handle
// raised, and a drain stone under the spout.
function pump(batch, l, terrain, lx, ly) {
  const p = localToWorld(l.x, l.y, 0, lx, ly);
  const g = terrain.groundRange({ circle: { x: p.x, y: p.y, r: 0.6 } });
  const P = (geo, x, y, up, color, opts) => batch.place(geo, p.x, p.y, g.max, 0, x, y, up, color, opts);
  P(uprightSlab(1.1, 1.1, 0.15 + g.max - g.min, 0.08, 0.03), 0, 0, g.min - g.max - 0.05, 0xa9a69c);
  P(cyl(0.1, 0.7, 8), 0, 0, 0.1, PUMP);
  P(cyl(0.14, 0.45, 10), 0, 0, 0.75, PUMP);
  P(cyl(0.17, 0.06, 10), 0, 0, 1.2, PUMP, NC);
  P(cyl(0.05, 0.4, 6).rotateX(Math.PI / 2 - 0.3), 0, 0.2, 0.85, PUMP, NC); // spout
  P(beam([0, 1.25, -0.1], [0, 1.55, -0.65], 0.05, 0.05), 0, 0, 0, PUMP, NC); // handle
  P(box(0.06, 0.25, 0.06), 0, -0.08, 1.15, PUMP, NC);
  P(box(0.5, 0.06, 0.4), 0, 0.45, 0.1, 0x86807a, NC);
}
