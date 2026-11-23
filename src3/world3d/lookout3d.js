// The fire lookout (#75, SPEC 9r): timber legs on bevelled concrete piers
// with anchor plates, braced at five levels with steel gussets at the
// joints, zig-zag stairs with stringers, treads, handrails and landings,
// a plank catwalk with posts, two rails and a toe board, a cab with
// mullioned windows, sills, a door and awning shutters propped open, a
// firefinder on its stand inside, a hip roof with fascia, a lightning rod,
// and a mast with a wind cup and vane.
//
// Everything goes into the shared batch: no draw calls of its own.
// Footprints (what the car hits): LOOKOUT in layout.js, unchanged.

import * as THREE from 'three';
import { makeRng, hashString } from '../../src/drive/geom.js';
import { LOOKOUT } from '../../src/drive/layout.js';
import { box, cyl, pyramid, strut } from './shapes.js';
import { uprightSlab } from './roundShapes.js';
import { objMatrix } from './batch.js';
import { beam } from './bridge3d.js';

const FOUND = 1.5;
// Colours pick textures (src3/look/surfaces.js): boards, siding, concrete, shingles.
const WOOD = 0x7a5a3a;
const WOOD_DARK = 0x5e4630;
const DECK = [0x6a4c2e, 0x8a6a45, 0x6e5234];
const SIDING = 0xd8cfb8;
const GLASS = 0x324656;
const ROOF = 0x3f5a44;
const STEEL = 0x555555;
const CONCRETE = 0xa9a69c;
const NC = { cast: false };

export function buildLookout(terrain, batch, l) {
  const rng = makeRng(hashString(l.id));
  const L = LOOKOUT;
  const H = L.H;
  const c = L.cab;
  const top = c / 2 - 0.3; // legs meet under the cab corners
  const base = Math.min(...L.legs.map(([x, y]) => terrain.heightAt(l.x + x, l.y + y)));
  const m0 = objMatrix(l.x, l.y, base, 0);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, 0, lx, ly, up, color, opts);
  const legs = L.legs.map(([x, z]) => [
    new THREE.Vector3(x, -FOUND, z),
    new THREE.Vector3(Math.sign(x) * top, H, Math.sign(z) * top),
  ]);
  // Piers: bevelled concrete with a steel shoe and bolts where the leg lands.
  for (const [x, z] of L.legs) {
    const g = terrain.heightAt(l.x + x, l.y + z) - base;
    P(uprightSlab(1.0, 1.0, 0.6 + FOUND + g, 0.1, 0.06), x, z, -FOUND, CONCRETE);
    P(box(0.62, 0.05, 0.62), x, z, g + 0.6, STEEL, NC);
    for (const [bx, bz] of [[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]]) P(cyl(0.035, 0.1, 6), x + bx, z + bz, g + 0.62, STEEL, NC);
  }
  if (batch.audit) for (const [x, z] of L.legs) batch.audit.rect(l.id, 'lookout_footing', l.x + x, l.y + z, 1, 1, 0, base - FOUND, base + 0.5);
  for (const [p, q] of legs) batch.add(strut(p, q, L.legR * 0.6, 6), m0, WOOD);
  const at = (leg, f) => new THREE.Vector3().lerpVectors(leg[0], leg[1], f);
  const levels = [0.1, 0.32, 0.54, 0.76, 0.97];
  for (let i = 0; i < 4; i++) {
    const A = legs[i];
    const B = legs[(i + 1) % 4];
    for (let k = 0; k < levels.length; k++) {
      batch.add(strut(at(A, levels[k]), at(B, levels[k]), 0.1, 4), m0, WOOD);
      if (k < levels.length - 1) {
        batch.add(strut(at(A, levels[k]), at(B, levels[k + 1]), 0.07, 4), m0, WOOD, NC);
        batch.add(strut(at(B, levels[k]), at(A, levels[k + 1]), 0.07, 4), m0, WOOD, NC);
      }
      // Steel gusset plate and bolts where the girts meet the leg.
      const p = at(A, levels[k]);
      const g = new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(p.x, p.y, p.z);
      batch.add(g, m0, STEEL, NC);
    }
  }
  stairs(P, H);
  catwalk(P, c, H, rng);
  cab(P, c, H);
  roofAndMast(P, c, H);
  // Ground cable for the lightning rod, down one leg.
  batch.add(strut(new THREE.Vector3(top + 0.3, H + 0.2, top + 0.3), new THREE.Vector3(4.6, 0.1, 4.6), 0.02, 3), m0, 0x8a6a4a, NC);
  // Boulders on the hilltop, clear of the turning patch.
  const rock = new THREE.DodecahedronGeometry(0.8, 0);
  for (let i = 0; i < 8; i++) {
    const ang = rng() * Math.PI * 2;
    const r = 13 + rng() * 6;
    const x = l.x + Math.cos(ang) * r;
    const y = l.y + Math.sin(ang) * r;
    const s = 0.4 + rng() * 0.6;
    batch.add(rock, objMatrix(x, y, terrain.heightAt(x, y) - 0.2, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s * 0.7, s)), 0x8b877e, NC);
    if (batch.audit) batch.audit.circle(l.id, 'boulder', x, y, 0.6 * s, terrain.heightAt(x, y) - 0.2 - 0.56 * s);
  }
  return true;
}

// Zig-zag stairs up the middle: each flight has two stringers, treads and a
// handrail on posts; a landing with joists at each turn.
function stairs(P, H) {
  const flights = 8;
  const z0 = 0.0;
  const z1 = 0.8;
  for (let k = 0; k < flights; k++) {
    const y0 = (k * H) / flights;
    const y1 = ((k + 1) * H) / flights;
    const s = k % 2 ? 1 : -1;
    const xa = -1.1 * s + 0.5 * s;
    const xb = 1.1 * s - 0.5 * s;
    for (const z of [z0, z1]) P(beam([xa, y0, z], [xb, y1 - 0.1, z], 0.1, 0.24), 0, 0, 0, WOOD_DARK);
    const n = 11;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      P(box(0.26, 0.05, z1 - z0 - 0.02), xa + (xb - xa) * f, (z0 + z1) / 2, y0 + (y1 - y0) * f - 0.05, DECK[i % 3], NC);
    }
    // Handrail on the open side.
    const zr = k % 2 ? z1 + 0.08 : z0 - 0.08;
    P(beam([xa, y0 + 0.95, zr], [xb, y1 + 0.85, zr], 0.06, 0.06), 0, 0, 0, WOOD, NC);
    for (const f of [0.15, 0.85]) {
      const x = xa + (xb - xa) * f;
      const y = y0 + (y1 - y0) * f;
      P(box(0.06, 0.92, 0.06), x, zr, y - 0.02, WOOD, NC);
    }
    // Landing at the top of the flight.
    if (k < flights - 1) {
      P(box(1.2, 0.08, 1.0), 1.1 * s, 0.4, y1 - 0.05, DECK[k % 3], NC);
      for (const z of [0.0, 0.8]) P(box(1.2, 0.18, 0.1), 1.1 * s, z, y1 - 0.24, WOOD_DARK, NC);
      P(box(0.08, 1.0, 1.0), 1.1 * s + 0.6 * s, 0.4, y1, WOOD, NC);
    }
  }
}

// Catwalk: joists, a plank floor, posts, top and middle rails and a toe board.
function catwalk(P, c, H, rng) {
  const w = c + 2.2;
  P(box(w, 0.16, w), 0, 0, H, 0x4a3420);
  for (const x of [-w / 2 + 0.1, -1.2, 1.2, w / 2 - 0.1]) P(box(0.14, 0.25, w), x, 0, H - 0.25, WOOD_DARK, NC);
  for (let y = -w / 2; y < w / 2 - 0.05; y += 0.3) P(box(w, 0.06, 0.27), 0, y + 0.15, H + 0.16, DECK[Math.floor(rng() * 3)], NC);
  const r = c / 2 + 1.05;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const along = dz !== 0; // a rail running along x
    for (const [h, t] of [[1.05, 0.1], [0.55, 0.07]]) P(box(along ? w : 0.08, t, along ? 0.08 : w), dx * r, dz * r, H + 0.16 + h, 0x6a4c2e, NC);
    P(box(along ? w : 0.04, 0.18, along ? 0.04 : w), dx * (r + 0.02), dz * (r + 0.02), H + 0.2, 0x6a4c2e, NC); // toe board
  }
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = -r + (2 * r * i) / n;
    for (const s of [-1, 1]) {
      P(box(0.12, 1.2, 0.12), s * r, t, H + 0.16, 0x6a4c2e, NC);
      P(box(0.12, 1.2, 0.12), t, s * r, H + 0.16, 0x6a4c2e, NC);
    }
  }
}

// The cab: siding to sill height, a sill, mullioned windows all round, a
// head board, a door on the stair side, shutters propped open as awnings,
// and the firefinder on its stand inside.
function cab(P, c, H) {
  const up = H + 0.22;
  P(box(c, 1.0, c), 0, 0, up, SIDING);
  P(box(c - 0.3, 1.45, c - 0.3), 0, 0, up + 1.0, GLASS);
  P(box(c + 0.14, 0.08, c + 0.14), 0, 0, up + 0.98, 0xf0ece2, NC); // sill
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(box(0.2, 1.45, 0.2), sx * (c / 2 - 0.1), sz * (c / 2 - 0.1), up + 1.0, SIDING);
  const n = 5;
  for (let i = 1; i < n; i++) {
    const t = -c / 2 + (c * i) / n;
    for (const s of [-1, 1]) {
      P(box(0.08, 1.45, 0.1), t, s * (c / 2 - 0.15), up + 1.0, SIDING, NC);
      P(box(0.1, 1.45, 0.08), s * (c / 2 - 0.15), t, up + 1.0, SIDING, NC);
    }
  }
  for (const s of [-1, 1]) {
    P(box(c - 0.2, 0.05, 0.1), 0, s * (c / 2 - 0.15), up + 1.7, SIDING, NC); // meeting rail
    P(box(0.1, 0.05, c - 0.2), s * (c / 2 - 0.15), 0, up + 1.7, SIDING, NC);
  }
  P(box(c + 0.1, 0.3, c + 0.1), 0, 0, up + 2.43, SIDING); // head board
  // Door on the south face: frame, panel with two raised fields, knob.
  const dz = c / 2 + 0.03;
  P(box(0.95, 2.1, 0.06), -1.2, dz, up, 0xeceae3, NC);
  P(box(0.78, 2.0, 0.05), -1.2, dz + 0.03, up, 0x5b6b5e, NC);
  for (const y of [0.25, 1.15]) P(box(0.56, 0.65, 0.04), -1.2, dz + 0.05, up + y, 0x6a7a6d, NC);
  P(cyl(0.035, 0.06, 6).rotateX(Math.PI / 2), -0.92, dz + 0.08, up + 1.0, 0xc9a227, NC);
  // Awning shutters, hinged at the head and propped out, on three sides.
  for (const [rx, rz, ry] of [[0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    const m = new THREE.Matrix4().makeRotationY(ry).multiply(new THREE.Matrix4().makeRotationX(-1.05)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.65));
    P(box(c - 0.2, 0.05, 1.3), rx * (c / 2 + 0.04), rz * (c / 2 + 0.04), up + 2.4, SIDING, { extra: m });
    for (const t of [-c / 2 + 0.5, c / 2 - 0.5]) {
      const ax = rx ? rx * (c / 2 + 0.05) : t;
      const az = rz ? rz * (c / 2 + 0.05) : t;
      const bx = rx ? rx * (c / 2 + 0.95) : t;
      const bz = rz ? rz * (c / 2 + 0.95) : t;
      P(beam([ax, up + 1.0, az], [bx, up + 2.9, bz], 0.04, 0.04), 0, 0, 0, WOOD, NC);
    }
  }
  // Firefinder: a stand with a round map table on top.
  P(box(0.5, 1.0, 0.5), 0.4, -0.3, up, WOOD_DARK, NC);
  P(cyl(0.45, 0.08, 12), 0.4, -0.3, up + 1.0, 0xc9a227, NC);
}

// Hip roof with a fascia band, a lightning rod with a ball, and a mast
// with a cup on an arm and a vane.
function roofAndMast(P, c, H) {
  const up = H + 0.22 + 2.73;
  P(box(c + 1.42, 0.2, c + 1.42), 0, 0, up - 0.04, 0xeceae3, NC); // fascia
  P(pyramid(c + 1.4, 1.8), 0, 0, up + 0.15, ROOF);
  P(cyl(0.12, 0.25, 8), 0, 0, up + 1.85, 0x3a3a3a, NC);
  P(cyl(0.025, 1.0, 4), 0, 0, up + 1.95, 0x8a6a4a, NC);
  P(new THREE.SphereGeometry(0.08, 6, 4), 0, 0, up + 2.95, 0x8a6a4a, NC);
  // Mast off the corner.
  P(cyl(0.06, 3.5, 4), 0.6, 0.6, up + 0.9, STEEL, NC);
  P(box(1.2, 0.04, 0.04), 0.6, 0.6, up + 4.1, STEEL, NC);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P(cyl(0.06, 0.1, 6, 0.08).rotateZ(Math.PI / 2), 0.6 + Math.cos(a) * 0.32, 0.6 + Math.sin(a) * 0.32, up + 4.3, STEEL, NC);
    P(box(0.32, 0.02, 0.02).translate(0.16, 0, 0).rotateY(-a), 0.6, 0.6, up + 4.33, STEEL, NC);
  }
  P(box(0.03, 0.25, 0.5), 0.6, 0.6 + 0.4, up + 3.75, STEEL, NC);
}
