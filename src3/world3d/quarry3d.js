// The quarry (#75, SPEC 9r): loose rock on the benches, the green pool, the
// rim boulders and gravel piles as before, and now: stacks of sawn stone
// blocks on the apron, a timber guard rail each side of the ramp top, a
// wheel loader built like the cars (lugged tires, hubs, an engine hood with
// a grille, a cab with posts and glass, lift arms, rams and a toothed
// bucket), and the derrick: lattice mast and boom, a bull wheel, a hoist
// winch, guy cables to concrete deadmen, and a sheave block on the hook.
//
// Everything goes into the shared batch: no draw calls of its own.
// Solids: quarryBoulders (layout.js), unchanged.

import * as THREE from 'three';
import { makeRng, hashString } from '../../src/drive/geom.js';
import { quarryBoulders } from '../../src/drive/layout.js';
import { box, cyl, strut, flatPolygon } from './shapes.js';
import { outline, slab, uprightSlab } from './roundShapes.js';
import { objMatrix } from './batch.js';
import { beam } from './bridge3d.js';
import { quarryPit, quarryWob } from './terrain.js';

const YELLOW = 0xe0a91a;
const YELLOW_DARK = 0xb88a14;
const BLACK = 0x1e1e1e;
const RUBBER = 0x262626;
const CAB_GLASS = 0x2b3238;
const STEEL = 0x7d7f80;
const CRANE = 0xc9a227;
const CABLE = 0x333333;
const STONE = [0xb8b0a0, 0xb9b2a2, 0x9c9480]; // concrete texture, cut faces
const WOOD = [0x6a5238, 0x8a6c4a, 0x5a4630];
const CONCRETE = 0xa9a69c;
const NC = { cast: false };
const I = new THREE.Matrix4();

export function buildQuarry(terrain, batch, l) {
  const q = terrain.quarries.find((p) => p.x === l.x && p.y === l.y);
  if (!q) return true;
  const rng = makeRng(hashString(l.id));
  const R = q.r;
  const oa = q.open;
  const rock = new THREE.DodecahedronGeometry(1, 0);
  // Loose rock on the benches (small, so driving over them reads fine).
  for (let i = 0; i < 90; i++) {
    const t = rng() * Math.PI * 2;
    const rr = R * (0.15 + rng() * 0.75);
    const x = l.x + Math.cos(t) * rr;
    const y = l.y + Math.sin(t) * rr;
    const pit = quarryPit(q, x, y);
    if (!pit || pit.wall || pit.ramp) continue;
    const s = 0.25 + rng() * 0.45;
    if (batch.audit) batch.audit.circle(l.id, 'quarry_rock', x, y, 0.6 * s, terrain.heightAt(x, y) - 0.1 - 0.56 * s);
    batch.add(rock, objMatrix(x, y, terrain.heightAt(x, y) - 0.1, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s * 0.7, s)),
      rng() < 0.5 ? 0x8a8170 : 0xb8b0a0, NC);
  }
  // Green pool at the bottom.
  const pool = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    pool.push([l.x + Math.cos(t) * R * 0.12 * quarryWob(t), l.y + Math.sin(t) * R * 0.12 * quarryWob(t)]);
  }
  batch.add(flatPolygon(pool), new THREE.Matrix4().makeTranslation(0, q.floor - 0.5, 0), 0x4f7f7a, { cast: false, material: 'water' });
  // Boulder ring along the rim: the solids from layout.js.
  for (const b of quarryBoulders(l, (oa * 180) / Math.PI)) {
    const bg = terrain.groundRange({ circle: { x: b.x, y: b.y, r: b.r * 0.6 } }).min;
    const m = objMatrix(b.x, b.y, bg - 0.15 * b.r, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(b.r, b.r * 0.75, b.r));
    if (batch.audit) batch.audit.circle(l.id, 'rim_boulder', b.x, b.y, b.r * 0.6, bg - 0.15 * b.r - 0.05 * b.r);
    batch.add(rock, m.multiply(new THREE.Matrix4().makeTranslation(0, 0.7, 0)), rng() < 0.5 ? 0x86807a : 0x9a948a);
  }
  // Gravel piles on the apron side of the rim.
  for (let i = 0; i < 3; i++) {
    const ang = oa + (i - 1) * 0.5;
    const rr = R * 1.05 + 6 + i * 3;
    const px = l.x + Math.cos(ang) * rr;
    const py = l.y + Math.sin(ang) * rr;
    const pr = 3.5 + i;
    batch.add(new THREE.ConeGeometry(pr, pr * 0.75, 10).translate(0, pr * 0.375, 0), objMatrix(px, py, terrain.heightAt(px, py) - 0.2, i * 40), 0xa59f93);
    if (batch.audit) batch.audit.circle(l.id, 'gravel_pile', px, py, pr, terrain.heightAt(px, py) - 0.2);
  }
  stoneStacks(terrain, batch, l, R, oa, rng);
  guardRail(terrain, batch, l, R, oa);
  loader(terrain, batch, l, R, oa);
  derrick(terrain, batch, l, q, R, oa);
  return true;
}

// Stacks of sawn blocks waiting for the trucks: bevelled, slightly out of
// line, on timber skids.
function stoneStacks(terrain, batch, l, R, oa, rng) {
  for (const da of [-0.85, 0.85]) {
    const ang = oa + da;
    const rr = R * 1.05 + 5;
    const x = l.x + Math.cos(ang) * rr;
    const y = l.y + Math.sin(ang) * rr;
    const head = (ang * 180) / Math.PI + 90;
    const g = terrain.groundRange({ rect: { x, y, w: 5, h: 3, angle: head } });
    const P = (geo, lx, ly, up, color, opts) => batch.place(geo, x, y, g.max, head, lx, ly, up, color, opts);
    if (batch.audit) batch.audit.rect(l.id, 'stone_stack', x, y, 5, 3, head, g.min - 0.1, null);
    for (const ly of [-0.9, 0.9]) P(box(5.2, 0.2 + g.max - g.min, 0.25), 0, ly, g.min - g.max - 0.1, WOOD[2]);
    let up = 0.1;
    for (let row = 0; row < 3; row++) {
      const n = 3 - row;
      for (let i = 0; i < n; i++) {
        const lx = (i - (n - 1) / 2) * 1.62 + (rng() - 0.5) * 0.1;
        const m = new THREE.Matrix4().makeRotationY((rng() - 0.5) * 0.06);
        P(uprightSlab(1.55, 2.2 - row * 0.2, 0.9, 0.04, 0.04), lx, (rng() - 0.5) * 0.1, up, STONE[(row + i) % 3], { extra: m });
      }
      up += 0.9;
    }
  }
}

// Post-and-rail guard rail along the rim each side of the ramp top.
function guardRail(terrain, batch, l, R, oa) {
  const r = R * 1.0 + 3.2;
  for (const s of [-1, 1]) {
    let prev = null;
    for (let d = 22; d <= 52; d += 3) {
      const a = oa + (s * d * Math.PI) / 180;
      const x = l.x + Math.cos(a) * r;
      const y = l.y + Math.sin(a) * r;
      const h = terrain.heightAt(x, y);
      batch.place(uprightSlab(0.2, 0.2, 1.6, 0.03, 0.03), x, y, h - 0.5, (a * 180) / Math.PI, 0, 0, 0, WOOD[0]);
      if (batch.audit) batch.audit.rect(l.id, 'quarry_rail_post', x, y, 0.2, 0.2, 0, h - 0.5, null);
      if (prev) {
        for (const up of [0.45, 0.95]) {
          batch.add(beam([prev[0], prev[2] + up, prev[1]], [x, h + up, y], 0.08, 0.16), I, WOOD[1], NC);
        }
      }
      prev = [x, y, h];
    }
  }
}

// A wheel loader parked on a lower bench. Local frame: front (bucket) at -y.
function loader(terrain, batch, l, R, oa) {
  const la = oa + 2.2;
  const lx = l.x + Math.cos(la) * R * 0.47;
  const ly = l.y + Math.sin(la) * R * 0.47;
  const lh = (la * 180) / Math.PI;
  const base = terrain.heightAt(lx, ly);
  const P = (geo, x, y, up, color, opts) => batch.place(geo, lx, ly, base, lh, x, y, up, color, opts);
  if (batch.audit) batch.audit.rect(l.id, 'loader', lx, ly, 2.6, 2.8, lh, base, base + 0.3);
  // Wheels: tire with lugs, a yellow rim and a dark hub.
  const tire = new THREE.CylinderGeometry(0.62, 0.62, 0.55, 16).rotateZ(Math.PI / 2).translate(0, 0.62, 0);
  for (const [x, y] of [[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]]) {
    const s = Math.sign(x);
    P(tire, x, y, 0, RUBBER);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(0.24, 0.08, 0.14).translate(s * 0.13 * (i % 2 ? 1 : -1), 1.25, 0).rotateY(i % 2 ? 0.4 : -0.4);
      const m = new THREE.Matrix4().makeTranslation(0, 0.62, 0).multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0, -0.62, 0));
      P(lug, x, y, 0, BLACK, { cast: false, extra: m });
    }
    P(cyl(0.36, 0.06, 12).rotateZ(Math.PI / 2), x + s * 0.27, y, 0.62, YELLOW, { cast: false, extra: null });
    P(cyl(0.14, 0.1, 8).rotateZ(Math.PI / 2), x + s * 0.31, y, 0.62, 0x3a3a3a, NC);
  }
  // Frames: front and rear, joined at the hinge.
  P(box(1.4, 0.55, 2.0), 0, -1.3, 0.45, YELLOW_DARK);
  P(box(1.6, 0.5, 2.2), 0, 1.4, 0.45, YELLOW_DARK);
  P(cyl(0.22, 0.6, 8), 0, 0.05, 0.4, 0x3a3a3a, NC);
  // Fenders over the wheels.
  for (const x of [-1.3, 1.3]) for (const y of [-1.4, 1.4]) {
    const f = outline([[-0.75, 0, 0.05], [0.75, 0, 0.05], [0.75, 0.08, 0.02], [-0.75, 0.08, 0.02]]);
    P(slab(f, 0.62, 0.02, 'zy', 0, 2), x, y, 1.3, YELLOW, NC);
  }
  // Engine hood at the back: rounded profile, a grille and a counterweight.
  const hood = outline([[0.2, 0.7, 0.05], [2.6, 0.7, 0.05], [2.6, 1.7, 0.25], [0.2, 1.75, 0.08]]);
  P(slab(hood, 1.7, 0.06, 'zy', 0, 3), 0, 0, 0, YELLOW);
  P(box(1.3, 0.75, 0.06), 0, 2.63, 0.85, 0x2a2a2a, NC);
  for (let i = 0; i < 5; i++) P(box(1.3, 0.05, 0.05), 0, 2.66, 0.9 + i * 0.14, 0x555555, NC);
  P(uprightSlab(1.9, 0.5, 0.5, 0.12, 0.04), 0, 2.75, 0.3, YELLOW_DARK);
  P(cyl(0.08, 0.9, 8), 0.45, 1.6, 1.7, 0x2a2a2a, NC); // exhaust stack
  P(cyl(0.11, 0.06, 8), 0.45, 1.6, 2.6, 0x2a2a2a, NC);
  // Cab: four posts, a roof with a lip, glass all round, lights on the roof.
  const cz = 0.35;
  P(box(1.4, 0.3, 1.5), 0, cz, 0.95, YELLOW_DARK);
  P(box(1.36, 1.25, 1.44), 0, cz, 1.25, CAB_GLASS);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) P(uprightSlab(0.12, 0.12, 1.3, 0.03, 0.02), sx * 0.7, cz + sy * 0.74, 1.22, YELLOW);
  P(uprightSlab(1.7, 1.75, 0.14, 0.15, 0.04), 0, cz, 2.5, YELLOW);
  for (const sx of [-0.45, 0.45]) {
    P(box(0.18, 0.12, 0.1), sx, cz - 0.85, 2.52, 0x333333, NC);
    P(box(0.13, 0.08, 0.02), sx, cz - 0.9, 2.54, 0xfff3d0, NC);
  }
  P(box(0.04, 0.3, 0.12), -0.78, cz - 0.3, 1.9, 0x333333, NC); // mirror arm
  // Lift arms from the front frame down to the bucket, with the rams.
  for (const s of [-1, 1]) {
    P(beam([s * 0.55, 1.3, -0.6], [s * 0.6, 0.75, -2.55], 0.16, 0.3), 0, 0, 0, YELLOW);
    P(beam([s * 0.4, 0.75, -0.7], [s * 0.45, 1.05, -1.9], 0.1, 0.1), 0, 0, 0, 0xc8c8c4, NC);
    P(beam([s * 0.4, 0.75, -0.7], [s * 0.42, 0.9, -1.4], 0.16, 0.16), 0, 0, 0, YELLOW_DARK, NC);
  }
  // Bucket: a curved back, side plates, and teeth on the cutting edge.
  const bk = outline([[-3.2, 0.05, 0], [-2.35, 0.05, 0.25], [-2.35, 1.0, 0.1], [-2.55, 1.05, 0], [-2.55, 0.25, 0.15], [-3.15, 0.2, 0]]);
  P(slab(bk, 2.2, 0.03, 'zy', 0, 3), 0, 0, 0, STEEL);
  for (const s of [-1, 1]) P(box(0.06, 0.7, 0.9), s * 1.08, -2.75, 0.1, STEEL);
  for (let i = 0; i < 7; i++) P(box(0.1, 0.06, 0.2), -0.9 + i * 0.3, -3.27, 0.06, 0x4a4a4a, NC);
}

// Lattice from A to B: n chords round the line, r out from it (r0 at A, r1
// at B), with zigzag lacing between neighbours every `step`.
function lattice(batch, A, B, r0, r1, n, step, color, chordR = 0.07) {
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length();
  dir.normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(dir);
  if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);
  const off = (k, f) => {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    const r = r0 + (r1 - r0) * f;
    return new THREE.Vector3().copy(A).addScaledVector(dir, len * f).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
  };
  for (let k = 0; k < n; k++) batch.add(strut(off(k, 0), off(k, 1), chordR, 4), I, color);
  const m = Math.max(2, Math.round(len / step));
  for (let i = 0; i < m; i++) {
    const f0 = i / m;
    const f1 = (i + 1) / m;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      batch.add(strut(i % 2 ? off(k, f0) : off(k2, f0), i % 2 ? off(k2, f1) : off(k, f1), chordR * 0.45, 3), I, color, NC);
    }
  }
}

// The derrick standing on the rim opposite the ramp, its boom over the pit.
function derrick(terrain, batch, l, q, R, oa) {
  const ca = oa + Math.PI;
  const cr = R * 0.97;
  const cx = l.x + Math.cos(ca) * cr;
  const cy = l.y + Math.sin(ca) * cr;
  const ch = terrain.heightAt(cx, cy);
  const V = (x, up, y) => new THREE.Vector3(x, up, y);
  const top = V(cx, ch + 20, cy);
  lattice(batch, V(cx, ch - 1, cy), top, 0.55, 0.3, 3, 1.4, CRANE, 0.08);
  if (batch.audit) batch.audit.circle(l.id, 'crane', cx, cy, 0.35, ch - 1);
  // Footing and the bull wheel the mast turns on.
  batch.add(uprightSlab(2.4, 2.4, 1.0, 0.2, 0.06), objMatrix(cx, cy, ch - 0.7, 0), CONCRETE);
  batch.add(new THREE.TorusGeometry(1.8, 0.07, 4, 24).rotateX(Math.PI / 2), objMatrix(cx, cy, ch + 1.1, 0), CRANE, NC);
  for (let i = 0; i < 6; i++) batch.add(box(1.8, 0.08, 0.08).translate(0.9, 0, 0).rotateY((i * Math.PI) / 3), objMatrix(cx, cy, ch + 1.08, 0), CRANE, NC);
  // Boom from the mast foot out over the pit.
  const tip = V(l.x + Math.cos(ca) * R * 0.45, ch + 24, l.y + Math.sin(ca) * R * 0.45);
  const foot = V(cx, ch + 2.5, cy);
  lattice(batch, foot, tip, 0.25, 0.25, 4, 1.8, CRANE, 0.07);
  // Mast to tip stay, hoist rope and the hook.
  batch.add(strut(top, tip, 0.04, 3), I, CABLE, NC);
  const hookY = q.floor + 8;
  batch.add(strut(tip, V(tip.x, hookY + 1.2, tip.z), 0.035, 3), I, CABLE, NC);
  const hm = objMatrix(tip.x, tip.z, hookY, ca * 57.3 + 90);
  batch.add(uprightSlab(0.6, 0.35, 1.0, 0.12, 0.04), hm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0)), 0xc9a227);
  batch.add(cyl(0.28, 0.1, 10).rotateX(Math.PI / 2), hm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0)), 0x333333, NC);
  batch.add(new THREE.TorusGeometry(0.2, 0.05, 4, 10, Math.PI * 1.4).rotateZ(Math.PI * 0.8), hm.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.05, 0)), 0x333333, NC);
  // Guy cables from the mast top back to three deadmen away from the pit.
  for (const da of [-0.9, 0, 0.9]) {
    const a = ca + da;
    const dx = cx + Math.cos(a) * 22;
    const dy = cy + Math.sin(a) * 22;
    const dh = terrain.heightAt(dx, dy);
    batch.add(uprightSlab(1.2, 1.2, 0.9, 0.15, 0.05), objMatrix(dx, dy, dh - 0.5, (a * 180) / Math.PI), CONCRETE);
    if (batch.audit) batch.audit.rect(l.id, 'deadman', dx, dy, 1.2, 1.2, (a * 180) / Math.PI, dh - 0.5, null);
    batch.add(strut(V(top.x, top.y - 0.2, top.z), V(dx, dh + 0.4, dy), 0.03, 3), I, CABLE, NC);
  }
  // Hoist winch beside the mast: a drum on a frame, an engine box.
  const wa = ca + 0.5;
  const wx = cx + Math.cos(wa) * 6;
  const wy = cy + Math.sin(wa) * 6;
  const wh = terrain.groundRange({ rect: { x: wx, y: wy, w: 3, h: 2, angle: (wa * 180) / Math.PI } });
  const WP = (geo, x, y, up, color, opts) => batch.place(geo, wx, wy, wh.max, (wa * 180) / Math.PI, x, y, up, color, opts);
  if (batch.audit) batch.audit.rect(l.id, 'winch', wx, wy, 3, 2, (wa * 180) / Math.PI, wh.min - 0.3, null);
  WP(box(3.2, 0.3 + wh.max - wh.min, 2.2), 0, 0, wh.min - wh.max - 0.1, CONCRETE);
  for (const s of [-1, 1]) WP(box(0.12, 1.1, 1.2), s * 0.7, 0.3, 0.2, 0x5a5a5a);
  WP(cyl(0.45, 1.3, 12).rotateZ(Math.PI / 2), 0, 0.3, 0.95, 0x4a4a4a);
  WP(box(1.2, 0.9, 0.9), 0.5, -0.6, 0.2, 0x56634a);
  batch.add(strut(V(wx, wh.max + 1.0, wy), V(cx, ch + 3, cy), 0.03, 3), I, CABLE, NC);
}
