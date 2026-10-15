// The phase 2 landmarks: grain silos, fire lookout, covered bridge (fallen in),
// quarry and campground. Low-poly pieces merged by the Batcher.

import * as THREE from 'three';
import { localToWorld } from '../../src/drive/geom.js';
import {
  GRAIN, LOOKOUT, CAMP, coveredParts, quarryBoulders,
} from '../../src/drive/layout.js';
import { box, cyl, cone, pyramid, gable, strut, disc, flatPolygon } from './shapes.js';
import { objMatrix } from './batch.js';
import { DECK_TOP } from './ground.js';
import { WATER_LEVEL, quarryPit, quarryWob } from './terrain.js';

const FOUND = 1.5;
// Footprints (what the car hits) come from src/drive/layout.js: GRAIN, LOOKOUT,
// CAMP, coveredParts, quarryBoulders. Only decoration lies outside them.

export function buildNewLandmark(world, terrain, batch, l, rng) {
  switch (l.kind) {
    case 'grain_silos': return silos(terrain, batch, l);
    case 'lookout_tower': return lookout(terrain, batch, l, rng);
    case 'covered_bridge': return coveredBridge(world, batch, l, rng);
    case 'quarry': return quarry(terrain, batch, l, rng);
    case 'campground': return campground(terrain, batch, l, rng);
    default: return false;
  }
}

function placer(batch, x, y, base, angle) {
  return (geo, lx, ly, up, color, opts) => batch.place(geo, x, y, base, angle, lx, ly, up, color, opts);
}

function lowestUnder(terrain, x, y, r) {
  let m = terrain.heightAt(x, y);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m = Math.min(m, terrain.heightAt(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  return m;
}

// ---------- grain silos ----------

function silos(terrain, batch, l) {
  const base = lowestUnder(terrain, l.x, l.y, 20);
  const a = l.angle || 0;
  const P = placer(batch, l.x, l.y, base, a);
  const steel = 0xc4c8c6;
  const band = 0x9aa09e;
  const H = GRAIN.binH;
  P(box(36, 0.3 + FOUND, 22), 0, 0, -FOUND, 0xa9a69c, { cast: false });
  for (const b of GRAIN.bins) {
    P(cyl(b.r, H + FOUND, 20), b.lx, b.ly, -FOUND, steel);
    for (let y = 1.2; y < H; y += 1.6) P(cyl(b.r + 0.05, 0.14, 20), b.lx, b.ly, y, band, { cast: false });
    P(cone(b.r + 0.3, b.r * 0.7, 20), b.lx, b.ly, H, 0xb3b8b6);
    P(cyl(0.6, 0.8, 8), b.lx, b.ly, H + b.r * 0.7 - 0.2, 0x8a908e);
    P(box(0.5, H, 0.12), b.lx, b.ly + b.r + 0.06, 0, 0x6d716f, { cast: false }); // ladder
  }
  // Elevator leg: a tall box with a red head house, the tallest thing in Calder.
  const g = GRAIN.leg;
  const LH = GRAIN.legH;
  P(box(g.w, LH + FOUND, g.h), g.lx, g.ly, -FOUND, 0xb9bdb9);
  P(box(g.w + 2.6, 4, g.h + 2.2), g.lx, g.ly, LH, 0xa8352b);
  P(gable(g.w + 3.2, g.h + 2.8, 1.6), g.lx, g.ly, LH + 4, 0x5a5f66);
  P(box(g.w + 2.7, 0.8, 0.12), g.lx, g.ly - g.h / 2 - 1.12, LH + 2.6, 0x2c3a46, { cast: false });
  // Spouts from the head house down to each bin roof.
  const head = new THREE.Vector3(g.lx, LH + 1, g.ly + 1.2);
  const m0 = objMatrix(l.x, l.y, base, a);
  for (const b of GRAIN.bins) {
    batch.add(strut(head, new THREE.Vector3(b.lx, H + b.r * 0.7 + 0.3, b.ly), 0.28, 6), m0, 0x8d928f);
  }
  // Catwalk across the bin tops.
  P(box(22, 0.3, 1.2), 0, GRAIN.bins[0].ly, H + 2.2, 0x6d716f);
  // Scale house / office.
  const o = GRAIN.office;
  P(box(o.w, 3 + FOUND, o.h), o.lx, o.ly, -FOUND, 0xf1ede4);
  P(gable(o.w + 0.6, o.h + 0.6, 1.4), o.lx, o.ly, 3, 0x7a3b3b);
  P(box(1.4, 0.9, 0.12), o.lx - 1, o.ly - o.h / 2, 1.1, 0x2c3a46, { cast: false });
  P(box(0.9, 2.0, 0.12), o.lx + 1.6, o.ly - o.h / 2, 0, 0x5b3a2a, { cast: false });
  return true;
}

// ---------- fire lookout ----------

function lookout(terrain, batch, l, rng) {
  const L = LOOKOUT;
  const H = L.H;
  const c = L.cab;
  const top = c / 2 - 0.3; // legs meet under the cab corners
  const base = Math.min(...L.legs.map(([x, y]) => terrain.heightAt(l.x + x, l.y + y)));
  const m0 = objMatrix(l.x, l.y, base, 0);
  const P = placer(batch, l.x, l.y, base, 0);
  const wood = 0x7a5a3a;
  const legs = L.legs.map(([x, z]) => [
    new THREE.Vector3(x, -FOUND, z),
    new THREE.Vector3(Math.sign(x) * top, H, Math.sign(z) * top),
  ]);
  for (const [x, z] of L.legs) P(box(1.0, 0.6 + FOUND, 1.0), x, z, -FOUND, 0xa9a69c);
  for (const [p, q] of legs) batch.add(strut(p, q, L.legR * 0.6, 5), m0, wood);
  const at = (leg, f) => new THREE.Vector3().lerpVectors(leg[0], leg[1], f);
  const levels = [0.1, 0.32, 0.54, 0.76, 0.97];
  for (let i = 0; i < 4; i++) {
    const A = legs[i];
    const B = legs[(i + 1) % 4];
    for (let k = 0; k < levels.length; k++) {
      batch.add(strut(at(A, levels[k]), at(B, levels[k]), 0.1, 4), m0, wood);
      if (k < levels.length - 1) {
        batch.add(strut(at(A, levels[k]), at(B, levels[k + 1]), 0.07, 4), m0, wood, { cast: false });
        batch.add(strut(at(B, levels[k]), at(A, levels[k + 1]), 0.07, 4), m0, wood, { cast: false });
      }
    }
  }
  // Zig-zag stairs up the middle.
  const flights = 8;
  for (let k = 0; k < flights; k++) {
    const y0 = (k * H) / flights;
    const y1 = ((k + 1) * H) / flights;
    const s = k % 2 ? 1 : -1;
    batch.add(strut(new THREE.Vector3(-1.1 * s, y0, 0.4), new THREE.Vector3(1.1 * s, y1, 0.4), 0.28, 4), m0, 0x5e4630, { cast: false });
    P(box(1, 0.12, 1), 1.1 * s, 0.4, y1, 0x5e4630, { cast: false });
  }
  // Catwalk, railing, cab with windows all round, hip roof, and a mast.
  P(box(c + 2.2, 0.25, c + 2.2), 0, 0, H, 0x6a4c2e);
  for (const [dx, dz, w, d] of [[0, -1, c + 2.2, 0.1], [0, 1, c + 2.2, 0.1], [-1, 0, 0.1, c + 2.2], [1, 0, 0.1, c + 2.2]]) {
    P(box(w, 0.1, d), dx * (c / 2 + 1.05), dz * (c / 2 + 1.05), H + 1.05, 0x6a4c2e, { cast: false });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) {
    P(box(0.12, 1.1, 0.12), sx * (c / 2 + 1.05), sz * (c / 2 + 1.05), H, 0x6a4c2e, { cast: false });
    P(box(0.12, 1.1, 0.12), sz * (c / 2 + 1.05), sx * (c / 2 + 1.05), H, 0x6a4c2e, { cast: false });
  }
  P(box(c, 1.0, c), 0, 0, H + 0.25, 0xd8cfb8);
  P(box(c - 0.1, 1.4, c - 0.1), 0, 0, H + 1.25, 0x324656);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(box(0.18, 1.4, 0.18), sx * c / 2, sz * c / 2, H + 1.25, 0xd8cfb8);
  P(box(c + 0.1, 0.25, c + 0.1), 0, 0, H + 2.65, 0xd8cfb8);
  P(pyramid(c + 1.4, 1.8), 0, 0, H + 2.9, 0x3f5a44);
  P(cyl(0.06, 3.5, 4), 0.6, 0.6, H + 3.8, 0x555555, { cast: false });
  // Boulders on the hilltop, clear of the turning patch.
  const rock = new THREE.DodecahedronGeometry(0.8, 0);
  for (let i = 0; i < 8; i++) {
    const ang = rng() * Math.PI * 2;
    const r = 13 + rng() * 6;
    const x = l.x + Math.cos(ang) * r;
    const y = l.y + Math.sin(ang) * r;
    const s = 0.4 + rng() * 0.6;
    batch.add(rock, objMatrix(x, y, terrain.heightAt(x, y) - 0.2, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s * 0.7, s)), 0x8b877e, { cast: false });
  }
  return true;
}

// ---------- covered bridge (roof fell in, middle sagging into the river) ----------

function coveredBridge(world, batch, l, rng) {
  const br = world.bridges.find((b) => b.id === l.bridgeId);
  const parts = coveredParts(l, br);
  const { W, L, stub } = parts;
  const a = parts.a;
  const red = 0xa3392c;
  const darkRed = 0x7d2a21;
  const roofC = 0x4f4842;
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, parts.cx, parts.cy, 0, a, lx, ly, up, color, opts);
  const wallH = 4.2;
  const wt = 0.45; // COVERED.wallT
  // Abutments of stone on each bank.
  for (const s of [-1, 1]) P(box(W + 1.2, 2.6, 3), 0, s * (L / 2 - 1.5), -2.3, 0x8a8478);
  // The two standing ends: deck, plank walls (the solids) with a window strip, roof.
  for (const e of parts.ends) {
    const s = e.dir;
    const len = e.len;
    const cy = e.mid;
    P(box(W, 0.5, len), 0, cy, DECK_TOP - 0.5, 0x5a4029);
    P(box(W - 0.6, 0.05, len), 0, cy, DECK_TOP, 0x7a5d3e, { cast: false });
    for (const sx of [-1, 1]) {
      const lx = sx * (W / 2 - wt / 2);
      P(box(wt, 1.7, len), lx, cy, DECK_TOP, red);
      P(box(wt, 1.5, len), lx, cy, DECK_TOP + wallH - 1.5, red);
      for (let t = -len / 2 + 0.4; t <= len / 2; t += 2.4) P(box(wt + 0.08, wallH, 0.3), lx, cy + t, DECK_TOP, darkRed);
    }
    // Header over the portal.
    P(box(W + 0.4, 0.9, 0.3), 0, e.outer, DECK_TOP + wallH - 0.7, red);
    // Roof over the standing end; the broken edge hangs down.
    P(gable(W + 1.4, len + 0.6, 2.4), 0, cy + s * 0.3, DECK_TOP + wallH, roofC);
    const droop = new THREE.Matrix4().makeRotationX(s * 0.35);
    batch.place(gable(W + 1.2, 3, 2.2), parts.cx, parts.cy, 0, a, 0, e.inner + s * 0.6, DECK_TOP + wallH - 0.6, roofC, { extra: droop });
    // Barrier (solid) back from the broken edge: red and white boards.
    const by = e.inner - s * 4; // COVERED.barrierBack
    const bw = W - wt * 2;
    for (let i = 0; i < 5; i++) {
      const x0 = -bw / 2 + (i + 0.5) * (bw / 5);
      P(box(bw / 5, 0.4, 0.14), x0, by, DECK_TOP + 0.9, i % 2 ? 0xffffff : 0xc0392b);
    }
    for (const x of [-bw / 2 + 0.3, bw / 2 - 0.3]) P(box(0.16, 1.3, 0.16), x, by, DECK_TOP, 0x555555);
    // Splintered beams sticking out over the gap.
    for (const x of [-W / 2 + 0.6, -1, 1.3, W / 2 - 0.6]) {
      const len2 = 0.8 + rng() * 1.8;
      P(box(0.3, 0.3, len2), x, e.inner - s * len2 / 2, DECK_TOP - 0.55, 0x3a2c20);
    }
  }
  // Middle: two pieces hinged at the broken ends, slumped into the river in a V.
  for (const e of parts.ends) {
    const s = e.dir;
    const span = Math.abs(e.inner) + 0.2;
    const tilt = 0.42 + rng() * 0.08;
    const piece = (geo, lx, up, along, color) => {
      const m = new THREE.Matrix4().makeRotationX(-s * tilt);
      m.multiply(new THREE.Matrix4().makeTranslation(lx, up, -s * along));
      batch.place(geo, parts.cx, parts.cy, 0, a, 0, e.inner, DECK_TOP - 0.2, color, { extra: m });
    };
    piece(box(W * 0.9, 0.4, span - 0.4), 0, -0.4, (span - 0.4) / 2, 0x4f3a26);
    // One wall survived on this piece, half its boards gone.
    for (let t = 0.6; t < span - 0.6; t += 1.1) {
      if (rng() < 0.3) continue;
      piece(box(0.22, 1.2 + rng() * 2.4, 1.0), s * (W / 2 - 0.2), 0, t, rng() < 0.3 ? darkRed : red);
    }
    const m = new THREE.Matrix4().makeRotationX(-s * (tilt + 0.25)).multiply(new THREE.Matrix4().makeRotationZ(s * 0.3));
    m.multiply(new THREE.Matrix4().makeTranslation(-s * 1.2, 1.2, -s * span * 0.45));
    batch.place(box(W * 0.75, 0.25, span * 0.8), parts.cx, parts.cy, 0, a, 0, e.inner, DECK_TOP + 1.2, roofC, { extra: m });
  }
  // Loose boards and shingles drifting in the river.
  for (let i = 0; i < 14; i++) {
    const p = localToWorld(parts.cx, parts.cy, a, (rng() - 0.5) * 40, (rng() - 0.5) * 12);
    batch.place(box(0.3, 0.1, 1.2 + rng() * 2), p.x, p.y, WATER_LEVEL - 0.03, rng() * 180, 0, 0, 0, rng() < 0.5 ? red : 0x5a4029, { cast: false });
  }
  return true;
}

// ---------- quarry ----------

function quarry(terrain, batch, l, rng) {
  const q = terrain.quarries.find((p) => p.x === l.x && p.y === l.y);
  if (!q) return true;
  const R = q.r;
  const oa = q.open;
  const I = new THREE.Matrix4();
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
    batch.add(rock, objMatrix(x, y, terrain.heightAt(x, y) - 0.1, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s * 0.7, s)),
      rng() < 0.5 ? 0x8a8170 : 0xb8b0a0, { cast: false });
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
    const m = objMatrix(b.x, b.y, terrain.heightAt(b.x, b.y) - 0.15 * b.r, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(b.r, b.r * 0.75, b.r));
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
  }
  // A yellow loader parked on a lower bench.
  const la = oa + 2.2;
  const lx = l.x + Math.cos(la) * R * 0.47;
  const ly = l.y + Math.sin(la) * R * 0.47;
  const lh = (la * 180) / Math.PI;
  const LP = placer(batch, lx, ly, terrain.heightAt(lx, ly), lh);
  const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.55, 10).rotateZ(Math.PI / 2).translate(0, 0.62, 0);
  for (const [x, y] of [[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]]) LP(wheel, x, y, 0, 0x1e1e1e);
  LP(box(2.2, 1.2, 4), 0, 0.4, 0.6, 0xe0a91a);
  LP(box(1.5, 1.4, 1.4), 0, 0.6, 1.8, 0x2b3238);
  LP(box(1.6, 0.15, 1.6), 0, 0.6, 3.2, 0xe0a91a);
  LP(box(3.2, 0.9, 0.9), 0, -2.6, 0.2, 0x7d7f80);
  for (const sx of [-1, 1]) LP(box(0.2, 0.3, 1.6), sx * 0.9, -1.8, 0.9, 0xe0a91a);
  // A derrick crane standing on a rim boulder opposite the ramp, boom over the pit.
  const ca = oa + Math.PI;
  const cr = R * 0.97;
  const cx = l.x + Math.cos(ca) * cr;
  const cy = l.y + Math.sin(ca) * cr;
  const ch = terrain.heightAt(cx, cy);
  const mast = new THREE.Vector3(cx, ch + 20, cy);
  batch.add(strut(new THREE.Vector3(cx, ch - 1, cy), mast, 0.35, 6), I, 0xc9a227);
  const tip = new THREE.Vector3(l.x + Math.cos(ca) * R * 0.45, ch + 24, l.y + Math.sin(ca) * R * 0.45);
  batch.add(strut(new THREE.Vector3(cx, ch + 2.5, cy), tip, 0.3, 4), I, 0xc9a227);
  batch.add(strut(mast, tip, 0.05, 3), I, 0x333333, { cast: false });
  const hookY = q.floor + 8;
  batch.add(strut(tip, new THREE.Vector3(tip.x, hookY, tip.z), 0.04, 3), I, 0x333333, { cast: false });
  batch.add(box(1.2, 1, 1.2), objMatrix(tip.x, tip.z, hookY - 1, 0), 0x333333);
  return true;
}

// ---------- campground ----------

function campground(terrain, batch, l, rng) {
  const base = terrain.heightAt(l.x, l.y);
  const P = placer(batch, l.x, l.y, base, 0);
  const G = { cast: false, material: 'ground' };
  // Gravel loop road (an ellipse ring) and a pad at each site.
  const lp = CAMP.loop;
  const ring = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    ring.push([l.x + lp.lx + Math.cos(t) * lp.rx, l.y + lp.ly + Math.sin(t) * lp.ry]);
  }
  for (let i = 0; i < 48; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ang = (Math.atan2(bx - ax, -(by - ay)) * 180) / Math.PI;
    batch.place(box(3.6, 0.02, len + 0.6), (ax + bx) / 2, (ay + by) / 2, terrain.heightAt((ax + bx) / 2, (ay + by) / 2), ang, 0, 0, 0.04, 0xa29d92, G);
  }
  for (const p of CAMP.pads) P(box(6, 0.02, 5), p.lx, p.ly, 0.05, 0xb3a98f, G);
  // Fire ring: stones round a charred bed, crossed logs.
  const f = CAMP.fire;
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    P(new THREE.DodecahedronGeometry(0.32, 0), f.lx + Math.cos(ang) * f.r, f.ly + Math.sin(ang) * f.r, 0.1, 0x7d786f);
  }
  P(disc(f.r - 0.2, 10), f.lx, f.ly, 0.08, 0x2a2420, { cast: false });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().makeRotationY((i * Math.PI) / 4).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    batch.place(cyl(0.12, 1.4, 5).translate(0, -0.7, 0), l.x, l.y, base, 0, f.lx, f.ly, 0.25, 0x3a2a1a, { extra: m });
  }
  // Tents (solid rects CAMP.tent), door toward the fire.
  CAMP.pads.forEach((p, i) => {
    if (!p.tent) return;
    const T = placer(batch, l.x + p.lx, l.y + p.ly, base, 0);
    const toFire = f.ly > p.ly ? 1 : -1;
    const { w, h } = CAMP.tent;
    if (i % 2) {
      T(gable(w, h, 1.8), 0, 0, 0, p.tent);
      T(box(0.9, 1.2, 0.05), 0, toFire * (h / 2 + 0.02), 0, 0x2a2a2a, { cast: false });
    } else {
      T(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2, 1.3, h / 2), 0, 0, 0, p.tent);
      T(box(0.8, 0.9, 0.1), 0, toFire * (h / 2 - 0.1), 0, 0x2a2a2a, { cast: false });
    }
    // Guy ropes' pegs.
    for (const sx of [-1, 1]) T(box(0.06, 0.25, 0.06), sx * (w / 2 + 0.5), 0, 0, 0xdddddd, { cast: false });
  });
  // Picnic tables (solid rects CAMP.table).
  for (const [tx, ty] of CAMP.tables) {
    const { w, h } = CAMP.table;
    P(box(w, 0.08, 0.8), tx, ty, 0.75, 0x8a6a45);
    P(box(w, 0.06, 0.28), tx, ty - h / 2 + 0.05, 0.45, 0x8a6a45);
    P(box(w, 0.06, 0.28), tx, ty + h / 2 - 0.05, 0.45, 0x8a6a45);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) P(box(0.1, 0.75, h), tx + dx, ty, 0, 0x6e5234, { cast: false });
  }
  // Camp hut (solid rect CAMP.hut): log shelter with a little porch roof.
  const hu = CAMP.hut;
  P(box(hu.w, 2.6, hu.h), hu.lx, hu.ly, -0.3, 0x7a5a3a);
  P(gable(hu.w + 0.6, hu.h + 0.6, 1.2), hu.lx, hu.ly, 2.3, 0x4f6a5a);
  P(box(0.9, 1.9, 0.08), hu.lx - 0.8, hu.ly + hu.h / 2, 0, 0x5e4630, { cast: false });
  P(box(0.8, 0.6, 0.08), hu.lx + 1.1, hu.ly + hu.h / 2, 1.1, 0x2c3a46, { cast: false });
  // Water pump and a woodpile by the hut.
  P(cyl(0.1, 1.2, 6), hu.lx + 4, hu.ly + 1, 0, 0x2f5a3a);
  P(box(0.5, 0.15, 0.15), hu.lx + 4.2, hu.ly + 1, 1.0, 0x2f5a3a);
  return true;
}

// Campfire smoke source (world x, y, ground height) for the particle renderer.
export function campfireOf(world, terrain) {
  const c = world.landmarks.find((l) => l.kind === 'campground');
  if (!c) return null;
  const p = localToWorld(c.x, c.y, 0, CAMP.fire.lx, CAMP.fire.ly);
  return { x: p.x, y: p.y, h: terrain.heightAt(c.x, c.y) };
}
