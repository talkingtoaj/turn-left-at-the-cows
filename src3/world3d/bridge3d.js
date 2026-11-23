// Road bridges with real detail (#78, SPEC 9r). The intact road bridges:
// a bevelled concrete deck with a drip edge and expansion joints, girders or
// floor beams under it, concrete kerbs with steel posts and tube rails,
// concrete end posts with a cap, a yellow and black marker and a cast name
// plate (the road's own name), and a steel guardrail run in at each corner.
// The longer spans get a truss each side (bridgePlan.js): a low pony truss,
// or a through truss tied overhead with a lattice portal at each end that
// carries a big name plate. Dirt roads get a plank deck with runners and
// timber rails instead.
//
// Everything goes into the shared batch (and the words into the shared face
// atlas): no draw calls of its own.
//
// Local frame (the bridge's): x across (right), z along the road (ly, "back"),
// y up from the road level at the bridge (0). The deck top is DECK_TOP.

import * as THREE from 'three';
import { localToWorld } from '../../src/drive/geom.js';
import { box, cyl } from './shapes.js';
import { outline, slab, uprightSlab } from './roundShapes.js';
import { objMatrix } from './batch.js';
import { FaceAtlas, PAD } from './signtext.js';
import { bridgePlan, BRIDGE } from './bridgePlan.js';
import { DECK_TOP } from './ground.js'; // a loop, but only read when building

const CONCRETE = 0xa3a199;
const CONCRETE_DARK = 0x86847d;
const CONCRETE_LIGHT = 0xb9b7ae;
const ASPHALT = 0x66676a;
const JOINT = 0x3b3b39;
const GALV = 0xa9aeae; // galvanised rails and posts
const GIRDER = 0x6b665e;
const TRUSS = { through: 0x56705f, pony: 0x5f686b }; // old green, weathered grey
const GUSSET = { through: 0x4b6253, pony: 0x51595c };
const WOOD = [0x7a5a3a, 0x6b4e32, 0x86664a];
const WOOD_DARK = 0x4f3824;
const BRONZE = 0x5b4a2e;
const NC = { cast: false };

const _up = new THREE.Vector3(0, 1, 0);
// A box from point A to point B ([x, y, z] each). w and d are its size
// across the line: for a line in a y-z plane w runs along x; for a line in
// the x-y plane d runs along z.
function beam(A, B, w, d) {
  const a = new THREE.Vector3(...A);
  const b = new THREE.Vector3(...B);
  const dir = b.clone().sub(a);
  const g = new THREE.BoxGeometry(w, dir.length(), d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Outline mirrored to side s (+1 right, -1 left), winding kept.
function sided(pts, s) {
  const p = pts.map(([x, y, r]) => [s * x, y, r || 0]);
  return outline(s < 0 ? p.reverse() : p);
}

export function buildIntactBridge(world, b, batch, rng, H) {
  const road = world.roads.find((r) => r.id === b.roadId);
  const plan = bridgePlan(b, road);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, 0, b.angle, lx, ly, up, color, opts);
  const ground = (lx, ly) => {
    const p = localToWorld(b.x, b.y, b.angle, lx, ly);
    return H(p.x, p.y);
  };
  const ctx = { b, plan, P, ground, rng, batch, W: b.width, L: b.length };
  if (plan.paved) pavedDeck(ctx);
  else plankDeck(ctx);
  if (plan.truss) truss(ctx);
  else girders(ctx);
  if (plan.piers) piers(ctx);
  abutments(ctx);
  if (plan.paved) {
    steelRails(ctx);
    for (const e of [-1, 1]) for (const s of [-1, 1]) {
      endPost(ctx, s, e);
      guardrail(ctx, s, e);
    }
  } else {
    timberRails(ctx);
  }
}

// ---------------------------------------------------------------- decks

function pavedDeck({ P, W, L, b, plan }) {
  // Slab: bevelled edges, 0.45 thick, its top the deck.
  const prof = outline([[-W / 2, -0.45, 0.05], [W / 2, -0.45, 0.05], [W / 2, 0, 0.03], [-W / 2, 0, 0.03]]);
  P(slab(prof, L, 0.04, 'xy', 0, 2), 0, 0, DECK_TOP, CONCRETE);
  for (const s of [-1, 1]) {
    // Fascia proud of the slab, with a dark drip groove under it.
    P(box(0.1, 0.42, L), s * (W / 2 + 0.05), 0, DECK_TOP - 0.47, CONCRETE_LIGHT);
    P(box(0.12, 0.05, L), s * (W / 2 + 0.02), 0, DECK_TOP - 0.53, CONCRETE_DARK, NC);
  }
  // Ramps so the deck meets the road (as before).
  for (const dir of [-1, 1]) {
    P(box(W - 0.4, 0.3, 3).rotateX(dir * 0.1), 0, dir * (L / 2 + 1.2), -0.15, CONCRETE_DARK, NC);
  }
  const top = W - 1.0; // between the kerbs
  P(box(top, 0.02, L), 0, 0, DECK_TOP, ASPHALT, NC);
  for (let y = -L / 2 + 2; y < L / 2 - 3; y += 9) P(box(0.25, 0.02, 3), 0, y + 1.5, DECK_TOP + 0.01, 0xe6d690, NC);
  // Expansion joints: steel strips across each end.
  for (const e of [-1, 1]) {
    P(box(top, 0.025, 0.16), 0, e * (L / 2 - 0.12), DECK_TOP + 0.002, JOINT, NC);
    P(box(top, 0.026, 0.03), 0, e * (L / 2 - 0.22), DECK_TOP + 0.002, 0x8a8a86, NC);
  }
}

// County plank deck: cross planks a hair low, two runners for the wheels on
// top, timber stringers under, all on the same deck top height.
function plankDeck({ P, W, L, rng }) {
  for (let y = -L / 2; y < L / 2 - 0.01; y += 0.3) {
    P(box(W - 0.1, 0.1, 0.27), 0, y + 0.15, DECK_TOP - 0.15, WOOD[Math.floor(rng() * 3)], NC);
  }
  for (const x of [-1.15, -0.45, 0.45, 1.15]) {
    for (let y = -L / 2; y < L / 2 - 0.01; y += 4) {
      const len = Math.min(4, L / 2 - y) - 0.04;
      P(box(0.32, 0.05, len), x, y + len / 2 + 0.02, DECK_TOP - 0.05, WOOD[Math.floor(rng() * 3)], NC);
    }
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.5 + (i * (W - 1)) / (n - 1);
    P(box(0.22, 0.45, L), x, 0, DECK_TOP - 0.6, WOOD_DARK);
  }
  for (const dir of [-1, 1]) {
    P(box(W - 0.4, 0.3, 3).rotateX(dir * 0.1), 0, dir * (L / 2 + 1.2), -0.15, 0x9b9a94, NC);
  }
}

// ---------------------------------------------------------------- under

function girders({ P, W, L, plan }) {
  const xs = plan.paved ? [-0.375, -0.125, 0.125, 0.375].map((f) => f * W * 0.95) : [];
  for (const x of xs) {
    P(box(0.12, 0.7, L - 0.3), x, 0, DECK_TOP - 1.15, GIRDER);
    P(box(0.38, 0.06, L - 0.3), x, 0, DECK_TOP - 1.21, GIRDER);
  }
  // Diaphragms between girders at the quarter points.
  if (xs.length) for (const f of [-0.25, 0.25]) P(box(xs[3] - xs[0], 0.45, 0.1), 0, f * L, DECK_TOP - 1.0, GIRDER, NC);
}

// A pier pair in the water: round columns, a bevelled cap beam, a footing.
function piers({ P, W, L, ground, plan }) {
  if (!plan.paved) {
    // Timber pile bents for the plank bridge.
    for (const y of [-L / 4, L / 4]) {
      for (const x of [-W / 2 + 0.7, 0, W / 2 - 0.7]) {
        const g = ground(x, y) - 0.4;
        P(cyl(0.17, DECK_TOP - 0.82 - g, 7), x, y, g, WOOD_DARK);
      }
      P(box(W - 0.6, 0.3, 0.35), 0, y, DECK_TOP - 1.12, WOOD_DARK);
      // Cross bracing on the bent.
      const g0 = Math.max(ground(-W / 2 + 0.7, y), ground(W / 2 - 0.7, y));
      P(beam([-W / 2 + 0.7, g0 + 0.2, 0], [W / 2 - 0.7, DECK_TOP - 1.2, 0], 0.08, 0.12), 0, y + 0.22, 0, WOOD_DARK);
    }
    return;
  }
  for (const y of [-L / 6, L / 6]) {
    const cw = W * 0.82;
    P(slab(outline([[-cw / 2, 0, 0.12], [cw / 2, 0, 0.12], [cw / 2 + 0.2, 0.7, 0.05], [-cw / 2 - 0.2, 0.7, 0.05]]), 1.1, 0.05, 'xy', 0, 2),
      0, y, DECK_TOP - 1.95 - 0.02, CONCRETE);
    for (const x of [-cw / 2 + 1.1, cw / 2 - 1.1]) {
      const g = ground(x, y) - 0.6;
      P(cyl(0.48, DECK_TOP - 1.95 - g, 14), x, y, g, CONCRETE_DARK);
      P(uprightSlab(1.5, 1.5, 0.5, 0.15, 0.05), x, y, g - 0.2, CONCRETE_DARK);
    }
  }
}

// Abutment wall at each end, with wing walls splayed into the banks.
function abutments({ P, W, L, ground }) {
  for (const e of [-1, 1]) {
    const y = e * (L / 2 - 0.4);
    const g = Math.min(ground(0, y), ground(-W / 2, y), ground(W / 2, y)) - 1;
    const h = DECK_TOP - 0.45 - g;
    P(box(W + 0.4, h, 0.9), 0, y, g, CONCRETE_DARK);
    P(box(W + 0.6, 0.2, 1.1), 0, y, DECK_TOP - 0.65, CONCRETE, NC); // bearing seat
    for (const s of [-1, 1]) {
      const wing = box(0.45, h, 4.5).translate(0, 0, (e * 4.5) / 2);
      wing.rotateY(-s * e * 0.45);
      P(wing, s * (W / 2 + 0.2), y, g, CONCRETE_DARK);
    }
  }
}

// ---------------------------------------------------------------- rails

function steelRails({ P, W, L }) {
  for (const s of [-1, 1]) {
    // Kerb: chamfered on the road side.
    const kerb = sided([[-0.25, 0], [0.25, 0], [0.25, 0.5, 0.03], [-0.13, 0.5, 0.03], [-0.25, 0.36]], s);
    P(slab(kerb, L, 0.03, 'xy', 0, 2), s * (W / 2 - 0.25), 0, DECK_TOP, CONCRETE_LIGHT);
    const kx = s * (W / 2 - 0.2);
    const kt = DECK_TOP + 0.5;
    const n = Math.max(2, Math.round(L / 2));
    for (let i = 0; i <= n; i++) {
      const y = -L / 2 + 0.4 + (i * (L - 0.8)) / n;
      P(box(0.24, 0.03, 0.24), kx, y, kt, GALV, NC); // base plate
      P(box(0.09, 0.78, 0.15), kx, y, kt, GALV);
      P(box(0.14, 0.03, 0.18), kx, y, kt + 0.78, GALV, NC); // cap
    }
    // Two rectangular tube rails on the road side of the posts.
    for (const h of [0.36, 0.7]) P(box(0.12, 0.16, L - 0.4), kx - s * 0.1, 0, kt + h, GALV);
  }
}

function timberRails({ P, W, L, plan, b, batch }) {
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.2);
    // Wheel guard on spacer blocks.
    P(box(0.25, 0.22, L), x - s * 0.1, 0, DECK_TOP + 0.08, WOOD_DARK);
    for (let y = -L / 2 + 1; y < L / 2; y += 2) P(box(0.22, 0.08, 0.3), x - s * 0.1, y, DECK_TOP, WOOD_DARK, NC);
    const n = Math.max(2, Math.round(L / 2.4));
    for (let i = 0; i <= n; i++) {
      const y = -L / 2 + 0.3 + (i * (L - 0.6)) / n;
      const big = i === 0 || i === n;
      const sz = big ? 0.3 : 0.2;
      P(uprightSlab(sz, sz, big ? 1.4 : 1.15, 0.02, 0.04), x + s * 0.08, y, DECK_TOP - 0.25, WOOD[i % 3]);
      if (big) {
        // End posts painted white at the top with a red reflector facing out.
        P(box(sz + 0.01, 0.35, sz + 0.01), x + s * 0.08, y, DECK_TOP + 0.75, 0xeeeae0);
        P(box(0.12, 0.12, 0.02), x + s * 0.08, y + Math.sign(y) * (sz / 2 + 0.01), DECK_TOP + 0.9, 0xc0392b, NC);
        // The road's name on a plate on a board, on the right-hand end post
        // for traffic coming in at that end.
        const e = Math.sign(y);
        if (plan.plate && s === e) {
          const fy = y + e * (sz / 2 + 0.03);
          P(box(0.74, 0.36, 0.04), x + s * 0.08, fy, DECK_TOP + 0.3, WOOD[1], NC);
          face(batch, plan.plate, 0.6, 0.26, objMatrix(b.x, b.y, 0, b.angle, x + s * 0.08, fy + e * 0.022, DECK_TOP + 0.48, e > 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null));
        }
      }
    }
    for (const h of [0.5, 0.92]) P(box(0.1, 0.2, L - 0.6), x - s * 0.04, 0, DECK_TOP + h, WOOD[h > 0.6 ? 2 : 0]);
    // Diagonal braces from the end posts down to the wheel guard.
    for (const e of [-1, 1]) {
      const y0 = e * (L / 2 - 0.3);
      P(beam([0, DECK_TOP + 1.0, y0], [0, DECK_TOP + 0.3, y0 - e * 1.6], 0.08, 0.14), x - s * 0.02, 0, 0, WOOD_DARK);
    }
  }
}

// ---------------------------------------------------------------- truss

function truss(ctx) {
  const { P, W, L, plan } = ctx;
  const kind = plan.truss;
  const C = TRUSS[kind];
  const G = GUSSET[kind];
  const n = plan.panels;
  const p = plan.panelLen;
  const Ht = plan.height;
  const T = W / 2 + 0.15;
  const U0 = DECK_TOP - 0.1;
  const U1 = U0 + Ht;
  const z = (i) => -L / 2 + i * p;
  for (const s of [-1, 1]) {
    const x = s * T;
    // Bottom chord, top chord with a cover plate, inclined end posts.
    P(box(0.42, 0.5, L + 0.4), x, 0, U0 - 0.3, C);
    P(box(0.46, 0.42, L - 2 * p + 0.3), x, 0, U1 - 0.36, C);
    P(box(0.56, 0.04, L - 2 * p + 0.4), x, 0, U1 + 0.06, C, NC);
    P(beam([x, U0, z(0)], [x, U1 - 0.15, z(1)], 0.46, 0.44), 0, 0, 0, C);
    P(beam([x, U0, z(n)], [x, U1 - 0.15, z(n - 1)], 0.46, 0.44), 0, 0, 0, C);
    // Built-up members: two channels and a web, so they read as steel shapes.
    const member = (A, B) => {
      for (const o of [-0.12, 0.12]) P(beam([A[0] + o, A[1], A[2]], [B[0] + o, B[1], B[2]], 0.05, 0.26), 0, 0, 0, C);
      P(beam(A, B, 0.2, 0.06), 0, 0, 0, C);
    };
    for (let i = 1; i < n; i++) member([x, U0 + 0.2, z(i)], [x, U1 - 0.4, z(i)]);
    for (let i = 1; i < n - 1; i++) {
      if (i < n / 2) member([x, U1 - 0.4, z(i)], [x, U0 + 0.2, z(i + 1)]);
      else member([x, U1 - 0.4, z(i + 1)], [x, U0 + 0.2, z(i)]);
    }
    // Gusset plates at the joints, on both faces.
    for (const f of [-1, 1]) {
      const gx = x + f * 0.24;
      for (let i = 0; i <= n; i++) P(box(0.03, 0.85, i === 0 || i === n ? 0.9 : 1.1), gx, z(i), U0 - 0.4, G, NC);
      for (let i = 1; i < n; i++) P(box(0.03, 0.8, 1.1), gx, z(i), U1 - 0.75, G, NC);
    }
  }
  // Floor beams across at each panel point, stringers along.
  for (let i = 0; i <= n; i++) P(box(2 * T, 0.55, 0.3), 0, z(i), DECK_TOP - 1.0, G);
  for (const f of [-0.3, -0.1, 0.1, 0.3]) P(box(0.12, 0.4, L), f * W, 0, DECK_TOP - 0.85, GIRDER);
  if (kind === 'pony') {
    // Knee braces from the floor beams up the outside of each vertical.
    for (const s of [-1, 1]) for (let i = 1; i < n; i++) {
      P(beam([s * (T + 1.0), U0 - 0.5, z(i)], [s * (T + 0.2), U0 + 1.3, z(i)], 0.12, 0.12), 0, 0, 0, C);
    }
    for (let i = 1; i < n; i++) P(box(2 * T + 2.1, 0.2, 0.25), 0, z(i), U0 - 0.62, G, NC);
    return;
  }
  // Through truss: struts across the top, X bracing, and a portal at each end.
  for (let i = 2; i < n - 1; i++) P(beam([-T, U1 - 0.2, z(i)], [T, U1 - 0.2, z(i)], 0.32, 0.3), 0, 0, 0, C);
  for (let i = 1; i < n - 1; i++) {
    P(beam([-T, U1 - 0.1, z(i)], [T, U1 - 0.1, z(i + 1)], 0.08, 0.08), 0, 0, 0, C);
    P(beam([T, U1 - 0.1, z(i)], [-T, U1 - 0.1, z(i + 1)], 0.08, 0.08), 0, 0, 0, C);
  }
  for (const e of [-1, 1]) portal(ctx, e, T, U0, U1, p, C, G);
}

// Lattice portal across the end posts at end e, leaning with them, with the
// road's name plate on its outer face.
function portal({ P, b, L, plan, batch }, e, T, U0, U1, p, C, G) {
  const D = BRIDGE.PORTAL_DEPTH;
  const Ht = U1 - U0;
  const hc = U1 - D / 2 - 0.15;
  const zc = e * (L / 2 - (p * (hc - U0)) / Ht);
  const tilt = -e * Math.atan2(p, Ht); // lean with the end posts
  const place = (g) => P(g.rotateX(tilt).translate(0, hc, zc), 0, 0, 0, C);
  const w = 2 * T;
  place(box(w, 0.18, 0.3).translate(0, D / 2 - 0.18, 0));
  place(box(w, 0.18, 0.3).translate(0, -D / 2, 0));
  const k = 10;
  for (let j = 0; j < k; j++) {
    const x0 = -T + (j * w) / k;
    const x1 = -T + ((j + 1) * w) / k;
    const [y0, y1] = j % 2 ? [D / 2 - 0.1, -D / 2 + 0.1] : [-D / 2 + 0.1, D / 2 - 0.1];
    place(beam([x0, y0, 0], [x1, y1, 0], 0.07, 0.2));
  }
  // Knee braces down to the end posts.
  for (const s of [-1, 1]) place(beam([s * (T - 1.6), -D / 2 + 0.05, 0], [s * (T - 0.15), -D / 2 - BRIDGE.KNEE, 0], 0.16, 0.2));
  // Name plate: a bronze backing and the cast face, facing traffic coming in at this end.
  if (!plan.plate) return;
  const pw = 2.4;
  const ph = 0.5;
  P(box(pw + 0.12, ph + 0.12, 0.05).translate(0, -(ph + 0.12) / 2, 0).rotateX(tilt).translate(0, hc, zc + e * 0.17), 0, 0, 0, BRONZE, NC);
  const m = new THREE.Matrix4().makeRotationX(tilt).multiply(new THREE.Matrix4().makeTranslation(0, 0, e * 0.2));
  if (e > 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  face(batch, plan.plate, pw, ph, objMatrix(b.x, b.y, 0, b.angle, 0, zc, hc, m));
}

// ---------------------------------------------------------------- ends

// Concrete end post at corner (s, e): rounded, bevelled, with a cap, a cast
// plate on the end face and a yellow and black marker standing out in front.
function endPost({ P, W, L, plan, b, batch, ground }, s, e) {
  const x = s * (W / 2 - 0.3);
  const y = e * (L / 2 + 0.55);
  const g = Math.min(0, ground(x, y)) - 0.3;
  const top = DECK_TOP + 1.05;
  P(uprightSlab(0.7, 1.0, top - g, 0.07, 0.03), x, y, g, CONCRETE_LIGHT);
  P(uprightSlab(0.84, 1.14, 0.16, 0.08, 0.04), x, y, top, CONCRETE);
  P(uprightSlab(0.6, 0.9, 0.1, 0.06, 0.03), x, y, top + 0.16, CONCRETE, NC);
  // Recessed panel on the outer side.
  P(box(0.03, 0.5, 0.7), x + s * 0.35, y, DECK_TOP + 0.3, CONCRETE_DARK, NC);
  if (plan.plate) {
    const pw = 0.6;
    const ph = 0.3;
    const fy = y + e * 0.51;
    P(box(pw + 0.06, ph + 0.06, 0.03), x, fy, DECK_TOP + 0.62 - 0.03, BRONZE, NC);
    face(batch, plan.plate, pw, ph, objMatrix(b.x, b.y, 0, b.angle, x, fy + e * 0.017, DECK_TOP + 0.62 + ph / 2, e > 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null));
  }
  // Object marker: yellow board, black stripes slanting down toward the road.
  const my = y + e * 2.2;
  const mx = s * (W / 2 + 0.05);
  const mg = ground(mx, my);
  P(box(0.06, 1.5, 0.06), mx, my + e * 0.05, mg - 0.2, GALV);
  P(box(0.32, 0.92, 0.03), mx, my, mg + 1.0, 0x9a9a96, NC);
  if (!batch.faces) batch.faces = new FaceAtlas();
  const rot = new THREE.Matrix4();
  if (e > 0) rot.makeRotationY(Math.PI);
  batch.faces.add(`bridgemark:${s * e}`, 0.3, 0.9, 120, drawMarker(s * e), objMatrix(b.x, b.y, mg, b.angle, mx, my + e * 0.017, 1.46, rot));
}

// W-beam guardrail from the end post out along the road, flaring away from
// it, the far end turned down into the ground.
function guardrail({ P, W, L, ground }, s, e) {
  const x0 = s * (W / 2 - 0.45); // on the road side of the end post
  const y0 = e * (L / 2 + 1.05);
  const run = 14;
  const flare = (t) => (t < 6 ? 0 : 0.9 * ((t - 6) / (run - 6)) ** 1.5);
  const pts = [];
  for (let t = 0; t <= run + 0.01; t += 1.9) pts.push(t);
  const at = (t) => [x0 + s * flare(t), y0 + e * t];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = at(pts[i]);
    const g = ground(x, y);
    if (i === 0) continue; // bolted to the end post
    const last = i === pts.length - 1;
    P(box(0.15, 1.2, 0.2), x + s * 0.12, y, g - 0.45, WOOD_DARK);
    if (!last) P(box(0.12, 0.2, 0.15), x + s * 0.02, y, g + 0.5, WOOD_DARK, NC); // blockout
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [xa, ya] = at(pts[i]);
    const [xb, yb] = at(pts[i + 1]);
    const ga = ground(xa, ya);
    const gb = ground(xb, yb);
    const last = i === pts.length - 2;
    const ha = i === 0 ? DECK_TOP + 0.62 - ga : 0.62;
    const hb = last ? 0.15 : 0.62;
    for (const [dh, dx, h] of [[0.08, 0, 0.13], [-0.08, 0, 0.13], [0, 0.035, 0.07]]) {
      P(beam([xa - s * (0.05 + dx), ga + ha + dh, ya], [xb - s * (0.05 + dx), gb + hb + dh, yb], 0.04, h), 0, 0, 0, GALV);
    }
  }
}

// ---------------------------------------------------------------- faces

function face(batch, text, w, h, matrix) {
  if (!batch.faces) batch.faces = new FaceAtlas();
  batch.faces.add(`bridgeplate:${text}:${w}`, w, h, 300, drawPlate(text), matrix);
}

// Cast bronze plate: dark field, raised rim, raised pale letters.
function drawPlate(text) {
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = '#5b4a2e';
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    const rim = Math.max(4, Math.round(ph * 0.07));
    ctx.strokeStyle = '#c9b582';
    ctx.lineWidth = rim;
    ctx.strokeRect(x + rim, y + rim, pw - 2 * rim, ph - 2 * rim);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + rim * 1.6, y + rim * 1.6, pw - 3.2 * rim, ph - 3.2 * rim);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = Math.round(ph * 0.55);
    ctx.font = `bold ${px}px Georgia, "Times New Roman", serif`;
    const w = ctx.measureText(text).width;
    const maxW = pw - 6 * rim;
    ctx.save();
    ctx.translate(x + pw / 2, y + ph / 2 + px * 0.04);
    if (w > maxW) ctx.scale(maxW / w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; // shadow under the raised letters
    ctx.fillText(text, 2, 3);
    ctx.fillStyle = '#e2d2a4';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
}

// Yellow board with black stripes; dir flips the slant so stripes always run
// down toward the road.
function drawMarker(dir) {
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, pw, ph);
    ctx.clip();
    ctx.fillStyle = '#1c1c1c';
    const step = pw * 0.9;
    for (let k = -3; k < 8; k++) {
      const y0 = y + k * step;
      ctx.beginPath();
      if (dir > 0) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x + pw, y0 + pw);
        ctx.lineTo(x + pw, y0 + pw + step / 2);
        ctx.lineTo(x, y0 + step / 2);
      } else {
        ctx.moveTo(x + pw, y0);
        ctx.lineTo(x, y0 + pw);
        ctx.lineTo(x, y0 + pw + step / 2);
        ctx.lineTo(x + pw, y0 + step / 2);
      }
      ctx.fill();
    }
    ctx.restore();
  };
}
