// The burned mill (#75, SPEC 9r): coursed stone walls with a projecting
// footing, quoins at the free ends, ragged tops in stepped blocks with the
// soot on them, real window openings with stone sills and charred oak
// lintels, beam stubs left in their pockets, a tapered chimney with string
// courses and a corbelled cap, a collapsed floor, cut-stone rubble, two
// millstones (one flat, one leaning), a rusted pit gear, and the water
// wheel fallen against the creek wall. Moved here from structures.js.
//
// Everything goes into the shared batch: no draw calls of its own.
// Local frame as everywhere: lx east, ly south, up from the ground at the
// mill's centre. Footprints (what the car hits) are MILL in layout.js and
// stay as they were.

import * as THREE from 'three';
import { makeRng, hashString } from '../../src/drive/geom.js';
import { MILL } from '../../src/drive/layout.js';
import { box, cyl } from './shapes.js';
import { beam } from './bridge3d.js';

const FOUND = 1.5;
// Colours pick textures (src3/look/surfaces.js): stone wall, charred, rust, concrete.
const STONE = [0x877763, 0x857563, 0x8a7b68];
const QUOIN = 0x7a6c5b;
const SOOT = 0x3b342d;
const SOOT2 = 0x3c332b;
const CHAR = [0x2a2520, 0x2b2621, 0x3d3329];
const RUST = [0x5f3b25, 0x52301c, 0x6a3e24];
const MILLSTONE = 0x8f8a80;
const NC = { cast: false };

export function buildMill(terrain, batch, l) {
  const rng = makeRng(hashString(l.id));
  const base = terrain.heightAt(l.x, l.y);
  const A = batch.audit;
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, 0, lx, ly, up, color, opts);
  scorch(batch, l, rng);
  for (const w of MILL.walls) wall(P, A, l, base, w, rng);
  chimney(P, A, l, base);
  floorCollapse(P, rng);
  rubble(P, rng);
  millstones(P, A, l, base);
  pitGear(P);
  millWheel(terrain, batch, l, rng);
}

// Scorched ground with ash, painted onto the ground so it follows the slope.
function scorch(batch, l, rng) {
  if (!batch.paint) return;
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const r = 11 + rng() * 4;
    pts.push([l.x + Math.cos(ang) * r * 1.1, l.y + Math.sin(ang) * r * 0.85]);
  }
  batch.paint.polygon(pts, 0x4a4436);
  const ash = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    ash.push([l.x - 1 + Math.cos(ang) * 6.5 * 1.15, l.y + Math.sin(ang) * 6.5 * 0.85]);
  }
  batch.paint.polygon(ash, 0x34302a);
}

// One wall from MILL.walls, cut into pieces about 1.5 m long, each its own
// height so the top is ragged. A wall runs along x (w >= h) or along y.
function wall(P, A, l, base, w, rng) {
  const along = w.w >= w.h;
  const len = along ? w.w : w.h;
  const thick = along ? w.h : w.w;
  const pieces = Math.max(1, Math.round(len / 1.5));
  const seg = len / pieces;
  const maxH = 2 + rng() * 4.5;
  // Part placer in the wall's own frame: u along the wall, v across it.
  const W = (geo, u, v, up, color, opts) => {
    const g = along ? geo : geo.clone().rotateY(Math.PI / 2);
    P(g, w.lx + (along ? u : v), w.ly + (along ? v : u), up, color, opts);
  };
  // Which way is inside (toward the mill's middle)?
  const inward = along ? -Math.sign(w.ly || 1) : -Math.sign(w.lx || 1);
  // Footing course, proud of the wall all round.
  W(box(len + 0.3, 0.5, thick + 0.3), 0, 0, -0.15, STONE[2]);
  // Heights wander from piece to piece (a random walk), so the top reads as
  // broken masonry and not as battlements.
  const hs = [];
  let walk = 0.55 + rng() * 0.45;
  for (let i = 0; i < pieces; i++) {
    walk = Math.min(1, Math.max(0.35, walk + (rng() - 0.5) * 0.45));
    hs.push(Math.max(0.9, maxH * walk));
  }
  for (let i = 0; i < pieces; i++) {
    const u = -len / 2 + seg * (i + 0.5);
    const hgt = hs[i];
    const col = STONE[i % 2];
    if (A) A.rect(l.id, 'mill_wall', l.x + w.lx + (along ? u : 0), l.y + w.ly + (along ? 0 : u), along ? seg : thick, along ? thick : seg, 0, base - FOUND, base + Math.min(0.5, hgt / 2));
    // A window where the piece is tall enough and not at the wall's end.
    const win = hgt > 3.1 && i > 0 && i < pieces - 1 && seg > 1.3 && (i % 2 === 1);
    const top = hgt - 0.35; // the ragged top course sits above this
    if (win) {
      const ww = Math.min(0.95, seg - 0.5);
      const jam = (seg - ww) / 2;
      const sill = 1.1;
      const head = 2.45;
      W(box(seg, sill + FOUND, thick), u, 0, -FOUND, col);
      for (const s of [-1, 1]) W(box(jam, head - sill, thick), u + s * (ww / 2 + jam / 2), 0, sill, col);
      W(box(seg, top - head, thick), u, 0, head, col);
      // Stone sill, proud of both faces and sloped a hair; charred oak lintel.
      W(box(ww + 0.3, 0.12, thick + 0.16), u, 0, sill - 0.04, STONE[2]);
      W(box(ww + 0.5, 0.26, thick + 0.06), u, 0, head - 0.02, CHAR[0]);
    } else {
      W(box(seg, top + FOUND, thick), u, 0, -FOUND, col);
    }
    // Ragged top: three or four loose stones of different sizes stepping
    // toward the next piece's height, soot on some.
    const next = hs[Math.min(pieces - 1, i + 1)] - 0.35;
    const n = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const bw = (seg / n) * (0.8 + rng() * 0.4);
      const f = (k + 0.5) / n;
      const bh = Math.max(0.08, 0.1 + rng() * 0.3 + Math.max(0, next - top) * f * 0.6);
      const bu = u - seg / 2 + (seg / n) * (k + 0.5);
      const col = rng() < 0.45 ? SOOT : STONE[(i + k) % 3];
      W(box(Math.min(bw, seg / n + 0.05), bh + 0.02, thick - 0.05 - rng() * 0.12), bu, (rng() - 0.5) * 0.08, top - 0.02, col);
    }
    if (rng() < 0.4) W(box(0.4, 0.22, thick * 0.5), u + (rng() - 0.5) * seg * 0.5, (rng() - 0.5) * 0.2, top + 0.2, SOOT2, NC);
    // Beam stubs burned off in their pockets on the inside face.
    if (hgt > 3.6 && rng() < 0.7) {
      const stub = 0.3 + rng() * 0.9;
      W(box(0.26, 0.3, stub), u + (rng() - 0.5) * 0.4, inward * (thick / 2 + stub / 2 - 0.05), 3.1, CHAR[1], NC);
    }
  }
  // Quoins: long and short dressed blocks at the free ends, a little proud.
  for (const e of [-1, 1]) {
    const hEnd = hs[e < 0 ? 0 : pieces - 1] - 0.4;
    for (let y = 0.35, k = 0; y < hEnd - 0.3; y += 0.42, k++) {
      const long = k % 2 === 0;
      W(box(long ? 0.62 : 0.36, 0.38, thick + 0.06), e * (len / 2 - (long ? 0.3 : 0.17) + 0.025), 0, y, QUOIN, NC);
    }
  }
}

// The chimney: three tapering stages with string courses, a corbelled cap
// stained black, and the dark flue.
function chimney(P, A, l, base) {
  const c = MILL.chimney;
  const stages = [[c.w, c.h, -FOUND, 4.6 + FOUND], [c.w - 0.2, c.h - 0.2, 4.6, 4.4], [c.w - 0.4, c.h - 0.4, 9, 3.6]];
  stages.forEach(([sw, sh, up, h], i) => {
    P(box(sw, h, sh), c.lx, c.ly, up, i === 2 ? 0x7a6c5b : 0x877763);
    if (i > 0) P(box(sw + 0.24, 0.22, sh + 0.24), c.lx, c.ly, up - 0.04, STONE[2], NC); // string course
  });
  P(box(c.w + 0.3, 0.3, c.h + 0.3), c.lx, c.ly, -0.1, STONE[2]); // plinth
  // Corbelled cap: two widening bands, then the soot.
  P(box(c.w - 0.1, 0.25, c.h - 0.1), c.lx, c.ly, 12.6, SOOT2);
  P(box(c.w + 0.15, 0.3, c.h + 0.15), c.lx, c.ly, 12.85, SOOT);
  for (const [dx, dz, w, d] of [[0, -1, c.w + 0.15, 0.3], [0, 1, c.w + 0.15, 0.3], [-1, 0, 0.3, c.w - 0.45], [1, 0, 0.3, c.w - 0.45]]) {
    P(box(w, 0.35, d), c.lx + dx * (c.w / 2 - 0.075), c.ly + dz * (c.h / 2 - 0.075), 13.15, SOOT2);
  }
  P(box(c.w - 0.9, 0.05, c.h - 0.9), c.lx, c.ly, 13.2, 0x111111, NC); // flue
  // A sooty opening at the foot where the boiler flue came in.
  P(box(0.7, 0.9, 0.06), c.lx + c.w / 2 + 0.03, c.ly, 0.6, 0x111111, { cast: false, extra: new THREE.Matrix4().makeRotationY(Math.PI / 2) });
}

// What is left of the upper floor: joists fallen from the south wall into
// the middle, a few boards still nailed across them, charred.
function floorCollapse(P, rng) {
  const top = 3.3;
  for (let k = 0; k < 4; k++) {
    const x = -5 + k * 1.3;
    const end = 4.5 + rng() * 2;
    P(beam([x, top - 0.4, 5.8], [x + (rng() - 0.5) * 0.8, 0.15, 5.8 - end], 0.24, 0.3), 0, 0, 0, CHAR[k % 2]);
  }
  // Boards across the joists, some snapped short.
  for (let i = 0; i < 6; i++) {
    const t = 0.15 + i * 0.13;
    const y = 5.8 - t * 5.2;
    const z = top - 0.4 + (0.15 - top + 0.4) * t + 0.2;
    const len = i % 3 === 2 ? 2.2 : 4.3;
    P(box(len, 0.06, 0.26), -3.1 - (4.3 - len) / 2, y, z, CHAR[2], { cast: false, extra: new THREE.Matrix4().makeRotationX(0.62) });
  }
  // Loose charred timbers on the floor, a couple leaning on the walls.
  const lies = [[-2.5, -3.5, 0.3, 4.2], [3.8, 2.5, 1.2, 5], [5.5, -4, 2.4, 3.6], [-6.5, -2.5, 0.9, 3.2]];
  for (const [x, y, ang, len] of lies) {
    P(box(0.32, 0.3, len), x, y, 0.05, CHAR[0], { extra: new THREE.Matrix4().makeRotationY(ang) });
  }
  P(beam([7.4, 0.05, -1], [7.75, 3.2, 0.6], 0.3, 0.3), 0, 0, 0, CHAR[1]);
  P(beam([-7.6, 0.05, 3.5], [-7.75, 2.6, 1.6], 0.28, 0.28), 0, 0, 0, CHAR[0]);
}

// Rubble: fallen dressed stones and broken lumps heaped along the walls.
function rubble(P, rng) {
  const lump = new THREE.DodecahedronGeometry(0.4, 0);
  const spots = [[-5, -5.2], [5, -5.3], [7, 3], [-7, -2], [-1, 5.2], [2.5, 0], [-3, 2]];
  for (let i = 0; i < 44; i++) {
    const [sx, sy] = spots[i % spots.length];
    const x = sx + (rng() - 0.5) * 3.2;
    const y = sy + (rng() - 0.5) * 2.4;
    const tilt = new THREE.Matrix4().makeRotationY(rng() * 3).multiply(new THREE.Matrix4().makeRotationX((rng() - 0.5) * 0.6));
    if (i % 2) {
      const s = 0.5 + rng() * 1.1;
      P(lump, x, y, 0, rng() < 0.5 ? STONE[1] : 0x5f554a, { cast: false, extra: tilt.multiply(new THREE.Matrix4().makeScale(s, s * 0.6, s)) });
    } else {
      const w = 0.45 + rng() * 0.35;
      P(box(w, 0.3, 0.32), x, y, -0.05, rng() < 0.7 ? STONE[i % 3] : SOOT, { cast: false, extra: tilt });
    }
  }
}

// A millstone: a bevelled disc with the eye in the middle and the dressing
// cut into the face (dark furrows).
function millstoneGeo(R, t) {
  const e = 0.18;
  const pts = [[e, 0], [R - 0.07, 0], [R, 0.07], [R, t - 0.07], [R - 0.07, t], [e, t], [e, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 18);
}

function millstones(P, A, l, base) {
  const R = 1.4;
  P(millstoneGeo(R, 0.45), 11, 5, 0, MILLSTONE);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P(box(0.07, 0.02, R - 0.35).translate(0, 0, (R - 0.35) / 2 + 0.2).rotateY(a + 0.35), 11, 5, 0.45, 0x5e574e, NC);
  }
  if (A) A.circle(l.id, 'millstone', l.x + 11, l.y + 5, 1.4, base, base + 0.2);
  // The bed stone, cracked in two, leaning on the east wall's outer face.
  const lean = new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.25);
  P(millstoneGeo(1.3, 0.4), 9.6, -3.2, 0.05, 0x9a968c, { extra: lean });
}

// The pit gear that drove the stones: an iron ring with teeth and four
// arms, half sunk in the ash.
function pitGear(P) {
  const R = 1.1;
  const parts = [new THREE.TorusGeometry(R, 0.09, 4, 18), new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8).rotateX(Math.PI / 2)];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    parts.push(new THREE.BoxGeometry(0.12, 0.16, 0.2).translate(0, R + 0.12, 0).rotateZ(a));
  }
  for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.1, R, 0.12).translate(0, R / 2, 0).rotateZ((i * Math.PI) / 2 + 0.3));
  const m = new THREE.Matrix4().makeRotationY(0.5).multiply(new THREE.Matrix4().makeRotationX(1.25));
  for (const g of parts) P(g, -3.2, -2.8, 0.35, RUST[0], { extra: m });
}

// The water wheel: fallen off its axle in the fire and leaning back against
// the creek-side wall, charred paddles and shrouds between two rusted iron
// rims, its foot sunk in the bank. The axle's bearing block is still on the wall.
function millWheel(terrain, batch, l, rng) {
  const W = MILL.wheel;
  const R = W.r;
  const cx = l.x + W.lx;
  const cy = l.y + W.ly;
  const g = terrain.groundRange({ rect: { x: cx, y: cy, w: W.w, h: W.h, angle: 0 } });
  const lean = new THREE.Matrix4().makeRotationX(0.3).multiply(new THREE.Matrix4().makeRotationZ(0.12));
  const frame = new THREE.Matrix4().makeTranslation(cx, g.min + R - 0.55, cy).multiply(lean);
  const at = (z) => frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z));
  const rim = new THREE.TorusGeometry(R, 0.11, 4, 22);
  for (const z of [-0.55, 0.55]) batch.add(rim, at(z), RUST[0]);
  batch.add(new THREE.CylinderGeometry(0.35, 0.35, 1.5, 8).rotateX(Math.PI / 2), frame, RUST[1]);
  // Hub flanges with bolt heads.
  for (const z of [-0.5, 0.5]) {
    batch.add(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 10).rotateX(Math.PI / 2), at(z), RUST[2], NC);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      batch.add(new THREE.BoxGeometry(0.08, 0.08, 0.14).translate(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0), at(z), RUST[1], NC);
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const z of [-0.5, 0.5]) batch.add(box(0.14, R, 0.14).rotateZ(a), at(z), 0x3a3430, NC);
  }
  // Paddles (buckets): a float board and a short sole board, some burned away;
  // shroud boards round the rim on both faces.
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    if (rng() < 0.3) continue;
    const col = rng() < 0.5 ? CHAR[1] : 0x3a3430;
    batch.add(new THREE.BoxGeometry(0.08, 0.7, 1.2).translate(0, R - 0.3, 0).rotateZ(a), frame, col, NC);
    batch.add(new THREE.BoxGeometry(0.4, 0.06, 1.2).translate(0.18, R - 0.62, 0).rotateZ(a), frame, col, NC);
  }
  for (let i = 0; i < 22; i++) {
    if (rng() < 0.35) continue;
    const a = ((i + 0.5) / 22) * Math.PI * 2;
    for (const z of [-0.6, 0.6]) batch.add(new THREE.BoxGeometry(0.95, 0.35, 0.05).translate(0, R - 0.2, 0).rotateZ(a - Math.PI / 2), at(z), CHAR[2], NC);
  }
  if (batch.audit) batch.audit.rect(l.id, 'mill_wheel', cx, cy, 1.0, 0.8, 0, g.min - 0.55 + R - R * Math.cos(0.12) - 0.4, null);
  // Bearing block on the north wall where the axle sat, its strap torn.
  const base = terrain.heightAt(l.x, l.y);
  batch.place(box(0.7, 0.5, 0.35), l.x, l.y, base, 0, W.lx + 0.8, -7.25, 2.4, RUST[1]);
  batch.place(box(0.12, 0.7, 0.4), l.x, l.y, base, 0, W.lx + 0.8, -7.3, 2.9, RUST[0], { cast: false, extra: new THREE.Matrix4().makeRotationZ(0.5) });
}
