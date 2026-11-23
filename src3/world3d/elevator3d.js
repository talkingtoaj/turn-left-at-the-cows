// Grain elevators and silos (#67): the Calder grain silos (three steel bins,
// a concrete leg tower with its bucket elevator, catwalk over the bin tops),
// the old wooden co-op elevators at Ashford and Brandt, and the stave silo
// beside a farm's barn. Caged ladders, catwalks with railings, conveyor legs
// and rust streaks. Everything goes into the shared batch, and the Brandt
// sign goes on the shared word atlas (signtext.js), so nothing here adds a
// draw call. Footprints still come from src/drive/layout.js (GRAIN,
// ELEVATOR, SILO): what you see matches what you hit.

import * as THREE from 'three';
import { localToWorld, makeRng, hashString } from '../../src/drive/geom.js';
import { GRAIN, ELEVATOR } from '../../src/drive/layout.js';
import { box, cyl, cone, gable, strut } from './shapes.js';
import { objMatrix } from './batch.js';
import { FaceAtlas, PAD } from './signtext.js';
import { stand, sign } from './ruins3d.js';

const FOUND = 1.5;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rotY = (t) => new THREE.Matrix4().makeRotationY(t);
const at = (m, x, y, z) => m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
// Colours pick the look's textures (src3/look/surfaces.js STANDING).
const RUST = [0x74462a, 0x5f3b25, 0x6a3e24, 0x52301c]; // heavy rust
const STAIN = [0x6a5446, 0x5c3b27]; // muted rust, for streaks on pale steel and concrete
const CONCRETE = 0xa9a69c;
const GALV = 0x9aa0a3; // tin (bright steel)
const DARK_STEEL = 0x4b4f52;
const GLASS = 0x2c3a46;
const COOP_TOWN_MAX = 2500; // further than this from any town: no name

// Elevators that stand empty (no grain since the railroad closed): more rust,
// a few rungs gone, the old painted sign (public/look/signs/coop.webp).
const ABANDONED = new Set(['ashford_elevator']);

// The name painted on a co-op elevator: the nearest town's name and CO-OP
// (no new words), or null when no town is near. Pure: world data in.
export function coopName(world, l) {
  let town = null;
  for (const t of world.towns || []) {
    const d = Math.hypot(t.x - l.x, t.y - l.y);
    if (d <= COOP_TOWN_MAX && (!town || d < town.d)) town = { d, name: t.name };
  }
  return town ? town.name.toUpperCase() + ' CO-OP' : null;
}

// ---------- shared pieces ----------

// A long thin taper hanging down from its top edge, facing +z: a rust streak.
function streak(w, len) {
  const b = w * 0.18;
  const pos = [-w / 2, 0, 0, -b, -len, 0, b, -len, 0, -w / 2, 0, 0, b, -len, 0, w / 2, 0, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// Streaks round a cylinder (centre cx, cz, radius r) in the frame M: n of
// them, hanging from heights picked from tops.
function cylStreaks(add, rng, cx, cz, r, tops, n, scale = 1) {
  for (let i = 0; i < n; i++) {
    const t = rng() * Math.PI * 2;
    const top = tops[Math.floor(rng() * tops.length)];
    const len = (0.8 + rng() * 3.2) * scale;
    const w = 0.12 + rng() * 0.2;
    const m = new THREE.Matrix4().makeTranslation(cx + Math.sin(t) * (r + 0.03), top, cz + Math.cos(t) * (r + 0.03)).multiply(rotY(t));
    add(streak(w, Math.min(len, top - 0.2)), m, STAIN[i % 2], { cast: false });
  }
}

// A ladder in frame M: rails at (x, z) offset 'off' out from a wall whose
// outward normal is (nx, nz), from y0 to y1. cage: [from, to] for hoops and
// cage bars, or null. gap: chance a rung is missing (old ladders).
function ladder(add, M, x, z, nx, nz, off, y0, y1, color, cage, rng = null, gap = 0) {
  const tx = -nz;
  const tz = nx;
  const P = (y, s, o = off) => V(x + tx * s + nx * o, y, z + tz * s + nz * o);
  const o = { cast: false };
  for (const s of [-0.23, 0.23]) add(strut(P(y0, s), P(y1, s), 0.035, 4), M, color, o);
  for (let y = y0 + 0.3; y < y1 - 0.15; y += 0.3) {
    if (rng && rng() < gap) continue;
    add(strut(P(y, -0.23), P(y, 0.23), 0.022, 3), M, color, o);
  }
  // Stand-offs back to the wall.
  for (let y = y0 + 1; y < y1; y += 2.4) for (const s of [-0.23, 0.23]) add(strut(P(y, s, 0), P(y, s), 0.03, 3), M, DARK_STEEL, o);
  if (!cage) return;
  const phi = Math.atan2(nx, nz);
  for (let y = cage[0]; y <= cage[1]; y += 0.9) {
    const hoop = new THREE.TorusGeometry(0.42, 0.028, 3, 8, Math.PI).rotateX(Math.PI / 2).rotateY(phi);
    hoop.translate(x + nx * off, y, z + nz * off);
    add(hoop, M, color, o);
  }
  for (const [d, s] of [[0.42, 0], [0.3, -0.3], [0.3, 0.3]]) add(strut(P(cage[0], s, off + d), P(cage[1], s, off + d), 0.02, 3), M, color, o);
}

// A railing along a straight edge from a to b (Vector3s at deck height):
// posts every ~1.8 m, a top rail and a knee rail, a toe board.
function railing(add, M, a, b, color, h = 1.05) {
  const o = { cast: false };
  const up = (p, y) => p.clone().setY(p.y + y);
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / n);
    add(strut(p, up(p, h), 0.03, 4), M, color, o);
  }
  add(strut(up(a, h), up(b, h), 0.03, 4), M, color, o);
  add(strut(up(a, h * 0.5), up(b, h * 0.5), 0.022, 3), M, color, o);
  add(strut(up(a, 0.06), up(b, 0.06), 0.045, 3), M, color, o);
}

// A window or door on a wall facing -z in frame F (bottom middle at u, v):
// a sunk pane and a frame and sill that stand proud of it.
function framed(add, F, u, v, w, h, pane, trim, depth = 0.14, sill = true) {
  const o = { cast: false };
  add(box(w, h, 0.04), at(F, u, v, -0.02), pane, o);
  add(box(w + 0.26, 0.13, depth), at(F, u, v + h, -depth / 2), trim, o);
  for (const s of [-1, 1]) add(box(0.13, h, depth), at(F, u + s * (w / 2 + 0.065), v, -depth / 2), trim, o);
  if (sill) add(box(w + 0.4, 0.1, depth + 0.1), at(F, u, v - 0.1, -(depth + 0.1) / 2), trim, o);
}

// Faces of a block (half sizes hx, hz, centred on the origin of frame M):
// a frame whose -z is the face's outward side. k: 0 north (-z), 1 west,
// 2 south, 3 east.
function face(M, hx, hz, k) {
  const half = k % 2 ? hx : hz;
  return M.clone().multiply(rotY((k * Math.PI) / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -half));
}

// ---------- Calder grain silos ----------

export function buildCalderSilos(terrain, batch, l) {
  const base = lowestUnder(terrain, l.x, l.y, 20);
  const a = l.angle || 0;
  const M = objMatrix(l.x, l.y, base, a);
  const add = (geo, m, color, opts) => batch.add(geo, m, color, opts);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, a, lx, ly, up, color, opts);
  const rng = makeRng(hashString(l.id) + 67);
  const steel = 0xbfc1bc;
  const band = 0x8f918e;
  const roof = 0x9ea3a6;
  const H = GRAIN.binH;
  if (batch.audit) batch.audit.rect(l.id, 'silo_pad', l.x, l.y, 36, 22, a, base - FOUND, base + 0.3);
  P(box(36, 0.3 + FOUND, 22), 0, 0, -FOUND, CONCRETE, { cast: false });

  const bands = [];
  for (let y = 1.2; y < H; y += 1.6) bands.push(y);
  for (const [i, b] of GRAIN.bins.entries()) {
    const r = b.r;
    // Concrete ring footing, the bin, its stiffening bands and upright
    // stiffeners, an eave lip and the cone roof with its ribs.
    P(cyl(r + 0.35, 0.45 + FOUND, 20), b.lx, b.ly, -FOUND, CONCRETE);
    P(cyl(r, H + FOUND, 20), b.lx, b.ly, -FOUND, steel);
    for (const y of bands) P(cyl(r + 0.05, 0.14, 20), b.lx, b.ly, y, band, { cast: false });
    for (let k = 0; k < 10; k++) {
      const t = ((k + 0.5) / 10) * Math.PI * 2;
      P(box(0.16, H - 0.4, 0.1), b.lx + Math.sin(t) * (r + 0.05), b.ly + Math.cos(t) * (r + 0.05), 0.4, band, { cast: false, extra: rotY(t) });
    }
    P(cyl(r + 0.32, 0.22, 20), b.lx, b.ly, H - 0.05, band);
    const RH = r * 0.7;
    P(cone(r + 0.3, RH, 20), b.lx, b.ly, H + 0.1, roof);
    for (let k = 0; k < 10; k++) {
      const t = (k / 10) * Math.PI * 2;
      const p = V(b.lx + Math.sin(t) * (r + 0.28), H + 0.16, b.ly + Math.cos(t) * (r + 0.28));
      const q = V(b.lx + Math.sin(t) * 0.7, H + 0.1 + RH * (1 - 0.7 / (r + 0.3)) + 0.06, b.ly + Math.cos(t) * 0.7);
      add(strut(p, q, 0.05, 3), M, band, { cast: false });
    }
    // Peak ring (manway) and two roof vents with caps.
    P(cyl(0.75, 0.55, 10), b.lx, b.ly, H + RH - 0.35, 0x8a908e);
    P(cyl(0.85, 0.08, 10), b.lx, b.ly, H + RH + 0.2, DARK_STEEL);
    for (const t of [0.9, 0.9 + Math.PI]) {
      const rho = r * 0.55;
      const y = H + 0.1 + RH * (1 - rho / (r + 0.3));
      const vx = b.lx + Math.sin(t) * rho;
      const vz = b.ly + Math.cos(t) * rho;
      P(cyl(0.28, 0.55, 8), vx, vz, y - 0.1, band, { cast: false });
      P(cone(0.48, 0.32, 8), vx, vz, y + 0.42, roof, { cast: false });
    }
    // Caged ladder up the road side, and a roof ladder up the cone.
    ladder(add, M, b.lx, b.ly + r, 0, 1, 0.22, 0.3, H + 0.5, GALV, [2.6, H + 0.3]);
    const e = V(b.lx, H + 0.3, b.ly + r + 0.1);
    const pk = V(b.lx, H + RH - 0.2, b.ly + 0.8);
    for (const s of [-0.25, 0.25]) add(strut(e.clone().setX(e.x + s), pk.clone().setX(pk.x + s), 0.03, 3), M, GALV, { cast: false });
    for (let f = 0.12; f < 1; f += 0.12) {
      const p = new THREE.Vector3().lerpVectors(e, pk, f).setY(new THREE.Vector3().lerpVectors(e, pk, f).y + 0.05);
      add(strut(p.clone().setX(p.x - 0.25), p.clone().setX(p.x + 0.25), 0.02, 3), M, GALV, { cast: false });
    }
    railing(add, M, V(e.x - 0.42, e.y, e.z - 0.05), V(pk.x - 0.42, pk.y, pk.z), GALV, 0.9);
    // Aeration fan on the back, and an access door near the ladder.
    P(box(1.3, 1.2, 1.1), b.lx, b.ly - r - 0.5, 0, 0x9aa0a3);
    P(cyl(0.48, 0.5, 12), b.lx, b.ly - r - 1.55, 0.62, DARK_STEEL, { extra: new THREE.Matrix4().makeRotationX(Math.PI / 2) });
    P(box(0.7, 0.4, 0.5), b.lx + 0.45, b.ly - r - 0.6, 1.2, 0x5d6066, { cast: false });
    const dt = 0.55;
    const F = M.clone().multiply(new THREE.Matrix4().makeTranslation(b.lx + Math.sin(dt) * (r + 0.02), 0, b.ly + Math.cos(dt) * (r + 0.02))).multiply(rotY(dt + Math.PI));
    framed(add, F, 0, 0.5, 0.9, 1.3, 0x5d6066, band, 0.12, false);
    // Rust bleeding from the bands, the bolts round the eave and the door.
    cylStreaks((g, m, c, o) => add(g, M.clone().multiply(m), c, o), rng, b.lx, b.ly, r, bands.slice(-6), 4 + i * 2);
    cylStreaks((g, m, c, o) => add(g, M.clone().multiply(m), c, o), rng, b.lx, b.ly, r, [H - 0.1], 4, 1.2);
  }

  // The leg tower: the bucket elevator's concrete tower, with corner posts and
  // girts, the twin leg casings up its face, a caged ladder and landings, and
  // the red head house on top.
  const g = GRAIN.leg;
  const LH = GRAIN.legH;
  const tower = 0xb9b6ae;
  P(box(g.w, LH + FOUND, g.h), g.lx, g.ly, -FOUND, tower);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(box(0.32, LH, 0.32), g.lx + sx * g.w / 2, g.ly + sz * g.h / 2, 0, band);
  for (let y = 4; y < LH; y += 4) P(box(g.w + 0.16, 0.18, g.h + 0.16), g.lx, g.ly, y, band, { cast: false });
  const legZ = g.ly + g.h / 2 + 0.45;
  P(box(2.4, 2.2, 1.8), g.lx, legZ + 0.2, 0, 0x8a8c8f); // boot
  for (const s of [-0.5, 0.5]) P(box(0.62, LH - 2.2, 0.62), g.lx + s, legZ, 2.2, GALV);
  for (let y = 4; y < LH; y += 3.2) P(box(1.8, 0.12, 0.8), g.lx, legZ, y, DARK_STEEL, { cast: false }); // brackets
  const towerStreak = (geo, m, c, o) => add(geo, m, c, o);
  for (let k = 0; k < 4; k++) {
    const F = face(at(M, g.lx, 0, g.ly), g.w / 2, g.h / 2, k);
    for (let n = 0; n < 4; n++) {
      const y = 4 * (1 + Math.floor(rng() * 8));
      towerStreak(streak(0.14 + rng() * 0.2, 0.8 + rng() * 2.4), at(F, (rng() - 0.5) * (g.w - 0.8), y, -0.02).multiply(rotY(Math.PI)), STAIN[n % 2], { cast: false });
    }
  }
  // Caged ladder up the east face, landings every 9 m with rails.
  const lx = g.lx + g.w / 2;
  ladder(add, M, lx, g.ly - 0.6, 1, 0, 0.24, 0, LH + 0.2, GALV, [2.6, LH - 0.4]);
  for (let y = 9; y < LH - 2; y += 9) {
    P(box(1.3, 0.1, 1.6), lx + 0.65, g.ly + 0.4, y, DARK_STEEL, { cast: false });
    railing(add, M, V(lx + 1.3, y + 0.1, g.ly - 0.4), V(lx + 1.3, y + 0.1, g.ly + 1.2), GALV);
    railing(add, M, V(lx, y + 0.1, g.ly + 1.2), V(lx + 1.3, y + 0.1, g.ly + 1.2), GALV);
    add(strut(V(lx, y - 1.2, g.ly + 1.1), V(lx + 1.25, y, g.ly + 1.1), 0.05, 3), M, DARK_STEEL, { cast: false });
  }
  // Head house: red siding, a band of framed windows, eave trim, and the
  // pulley hood where the leg casings go in.
  const hw = g.w + 2.6;
  const hd = g.h + 2.2;
  P(box(hw, 4, hd), g.lx, g.ly, LH, 0xa8352b);
  P(box(hw + 0.2, 0.25, hd + 0.2), g.lx, g.ly, LH - 0.1, 0xf0ece2);
  P(box(hw + 0.3, 0.3, hd + 0.3), g.lx, g.ly, LH + 3.75, 0xf0ece2);
  P(gable(hw + 0.6, hd + 0.6, 1.6), g.lx, g.ly, LH + 4, 0x5a5f66);
  for (let k = 0; k < 4; k++) {
    const F = face(at(M, g.lx, 0, g.ly), hw / 2, hd / 2, k);
    const span = k % 2 ? hd : hw;
    for (const u of [-span / 4, span / 4]) framed(add, F, u, LH + 1.7, 1.0, 1.1, GLASS, 0xf0ece2);
  }
  P(box(1.8, 1.2, 1.0), g.lx, legZ + 0.1, LH - 1.0, 0x8a8c8f); // pulley hood, under the head house
  // Spouts from the head house down to each bin roof, with a distributor.
  P(cyl(0.6, 1.0, 10), g.lx, g.ly + hd / 2 + 0.3, LH - 0.6, DARK_STEEL);
  const head = V(g.lx, LH - 0.4, g.ly + hd / 2 + 0.3);
  for (const b of GRAIN.bins) add(strut(head, V(b.lx, H + b.r * 0.7 + 0.3, b.ly), 0.28, 6), M, 0x8d928f);
  // Catwalk over the bin tops: deck, rails both sides, a truss under it with
  // the belt conveyor, and legs down onto each bin's peak ring.
  const b0 = GRAIN.bins[0];
  const deckY = H + b0.r * 0.7 + 1.0;
  const x0 = GRAIN.bins[0].lx - 1.2;
  const x1 = GRAIN.bins[GRAIN.bins.length - 1].lx + 1.2;
  const cz = b0.ly;
  P(box(x1 - x0, 0.14, 1.3), (x0 + x1) / 2, cz, deckY, DARK_STEEL);
  for (const s of [-0.65, 0.65]) railing(add, M, V(x0, deckY + 0.14, cz + s), V(x1, deckY + 0.14, cz + s), GALV);
  for (const s of [-0.62, 0.62]) add(strut(V(x0, deckY - 0.9, cz + s), V(x1, deckY - 0.9, cz + s), 0.05, 3), M, GALV, { cast: false });
  const bays = Math.round((x1 - x0) / 1.6);
  for (let i = 0; i < bays; i++) {
    const xa = x0 + ((x1 - x0) * i) / bays;
    const xb = x0 + ((x1 - x0) * (i + 1)) / bays;
    for (const s of [-0.62, 0.62]) {
      add(strut(V(xa, i % 2 ? deckY : deckY - 0.9, cz + s), V(xb, i % 2 ? deckY - 0.9 : deckY, cz + s), 0.035, 3), M, GALV, { cast: false });
    }
  }
  P(box(x1 - x0, 0.45, 0.7), (x0 + x1) / 2, cz, deckY - 0.75, 0x9aa0a3, { cast: false }); // belt housing
  for (const b of GRAIN.bins) {
    P(box(0.9, deckY - (H + b.r * 0.7 + 0.2), 0.9), b.lx, b.ly, H + b.r * 0.7 + 0.2, 0x8a908e, { cast: false });
  }
  // A walkway from the head house down to the catwalk.
  const top = V(g.lx + hw / 2 - 0.6, LH + 0.1, g.ly + hd / 2);
  const foot = V(g.lx + 1.6, deckY + 0.14, cz - 0.65);
  add(strut(top, foot, 0.06, 4), M, DARK_STEEL, { cast: false });
  add(strut(top.clone().setX(top.x - 0.7), foot.clone().setX(foot.x - 0.7), 0.06, 4), M, DARK_STEEL, { cast: false });
  railing(add, M, top, foot, GALV);

  // Scale house / office: framed windows and door, a step, a chimney pipe.
  const o = GRAIN.office;
  P(box(o.w, 3 + FOUND, o.h), o.lx, o.ly, -FOUND, 0xf1ede4);
  P(gable(o.w + 0.6, o.h + 0.6, 1.4), o.lx, o.ly, 3, 0x7a3b3b);
  const OF = face(at(M, o.lx, 0, o.ly), o.w / 2, o.h / 2, 0);
  framed(add, OF, 1, 1.1, 1.4, 0.9, GLASS, 0xf0ece2);
  framed(add, OF, -1.6, 0, 0.9, 2.0, 0x5b3a2a, 0xf0ece2, 0.14, false);
  P(box(1.4, 0.2, 0.8), o.lx + 1.6, o.ly - o.h / 2 - 0.4, 0, CONCRETE, { cast: false });
  const OS = face(at(M, o.lx, 0, o.ly), o.w / 2, o.h / 2, 2);
  framed(add, OS, 0, 1.1, 1.4, 0.9, GLASS, 0xf0ece2);
  P(cyl(0.12, 1.4, 6), o.lx - 1.5, o.ly + 0.8, 3.6, DARK_STEEL, { cast: false });
  return true;
}

function lowestUnder(terrain, x, y, r) {
  let m = terrain.heightAt(x, y);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    m = Math.min(m, terrain.heightAt(x + Math.cos(t) * r, y + Math.sin(t) * r));
  }
  return m;
}

// ---------- the wooden co-op elevators (Ashford, Brandt) ----------

export function buildGrainElevator(world, terrain, batch, l) {
  const a = l.angle || 0;
  const E = ELEVATOR;
  const A = batch.audit;
  const old = ABANDONED.has(l.id);
  const rng = makeRng(hashString(l.id) + 67);
  const clad = 0xb2b0ab; // galvanised tin cladding
  const head = 0x84827e; // the head house, darker
  const tin = 0x5a2c1a; // rusty tin roofs
  const trim = old ? 0x84827e : 0x9aa0a3;
  const ladderC = old ? RUST[2] : GALV;
  const m = E.main;
  const mc = localToWorld(l.x, l.y, a, m.lx, m.ly);
  const st = stand(terrain, batch, mc.x, mc.y, m.w, m.h, a);
  if (A) A.rect(l.id, 'elevator', mc.x, mc.y, m.w, m.h, a, st.bottom, st.base);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, mc.x, mc.y, st.base, a, lx, ly, up, color, opts);
  const M = objMatrix(mc.x, mc.y, st.base, a);
  const add = (geo, mm, color, opts) => batch.add(geo, mm, color, opts);
  const top = E.H + 0.9; // eave height
  P(box(m.w + 0.4, 0.9 + FOUND, m.h + 0.4), 0, 0, st.bottom - st.base, 0xa9a69c); // concrete footing
  P(box(m.w, E.H, m.h), 0, 0, 0.9, clad);
  // Corner boards, two storey bands and a fascia under the eave break up the
  // tall flat walls.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(box(0.34, E.H, 0.34), sx * m.w / 2, sz * m.h / 2, 0.9, trim);
  for (const y of [7.5, 14]) P(box(m.w + 0.14, 0.2, m.h + 0.14), 0, 0, y, trim, { cast: false });
  P(box(m.w + 0.3, 0.35, m.h + 0.3), 0, 0, top - 0.35, trim);
  P(gable(m.w + 0.6, m.h + 0.6, 2.2), 0, 0, top, tin);
  // Head house (cupola) on the ridge, with its own roof, eave trim, framed
  // windows on every side and a door onto the roof walk.
  const hx = 1.6;
  const hz = (m.h * 0.75) / 2;
  P(box(hx * 2, 4.2, hz * 2), 0, 0, E.H + 1.6, head);
  P(box(hx * 2 + 0.2, 0.25, hz * 2 + 0.2), 0, 0, E.H + 5.55, trim);
  P(gable(hx * 2 + 0.6, hz * 2 + 0.5, 1.4), 0, 0, E.H + 5.8, 0x4a2416);
  const HM = M;
  for (let k = 0; k < 4; k++) {
    const F = face(HM, hx, hz, k);
    // The long sides (west, east) get two windows, the south one; the north
    // side has the door onto the roof walk.
    if (k % 2) {
      framed(add, F, 1.6, E.H + 3.6, 0.8, 0.9, 0x1c1f22, trim);
      framed(add, F, -1.6, E.H + 3.6, 0.8, 0.9, 0x1c1f22, trim);
    } else if (k === 2) {
      framed(add, F, 0, E.H + 3.6, 0.9, 1.0, 0x1c1f22, trim);
    }
  }
  framed(add, face(HM, hx, hz, 0), 0, E.H + 1.75, 0.8, 1.8, 0x3e3a34, trim, 0.14, false);
  // The name, painted on a board band near the top of every side.
  const bandUp = top - 2.3;
  const name = coopName(world, l);
  const paint = name && name !== 'ASHFORD CO-OP' && typeof document !== 'undefined';
  for (let k = 0; k < 4; k++) {
    const half = (k % 2 ? m.w : m.h) / 2;
    const len = k % 2 ? m.h : m.w;
    const fm = M.clone().multiply(rotY((k * Math.PI) / 2));
    batch.add(box(len - 0.2, 1.9, 0.06), at(fm, 0, bandUp - 0.95, -half - 0.03), head, { cast: false });
    for (const s of [-1, 1]) batch.add(box(len - 0.1, 0.12, 0.12), at(fm, 0, bandUp + s * 0.98 - 0.06, -half - 0.06), trim, { cast: false });
    const w = len - 0.5;
    const h = w / 5.1;
    if (paint) {
      if (!batch.faces) batch.faces = new FaceAtlas();
      batch.faces.add('coop:' + name, w, h, 64, drawCoop(name, hashString(l.id)), at(fm, 0, bandUp, -half - 0.09));
    } else if (name) {
      sign(batch, 'coop', at(fm, 0, bandUp, -half - 0.09).multiply(rotY(Math.PI)), w, h);
    }
  }
  // Doors and a loading window with frames; the big door slides on a track.
  const N = face(M, m.w / 2, m.h / 2, 0);
  framed(add, N, 2.6, 0.9, 1.4, 2.4, 0x3e3a34, trim, 0.16, false);
  add(box(3.4, 0.14, 0.12), at(N, 2.1, 3.4, -0.2), DARK_STEEL, { cast: false });
  framed(add, N, 0, E.H - 7, 0.9, 0.9, 0x1c1f22, trim);
  framed(add, face(M, m.w / 2, m.h / 2, 1), 1.5, E.H - 3, 0.8, 0.8, 0x1c1f22, trim);
  // Rust weeping from the eave, the bands and the sign's bottom edge.
  for (let k = 0; k < 4; k++) {
    const F = face(M, m.w / 2, m.h / 2, k);
    const span = (k % 2 ? m.h : m.w) - 1;
    const n = old ? 9 : 4;
    for (let i = 0; i < n; i++) {
      const y = [top - 0.35, bandUp - 1.0, 14, 7.5][Math.floor(rng() * 4)];
      const len = (old ? 1.5 + rng() * 4.5 : 0.6 + rng() * 1.8);
      add(streak(0.16 + rng() * 0.3, len), at(F, (rng() - 0.5) * span, y, -0.035).multiply(rotY(Math.PI)), RUST[i % 3], { cast: false });
    }
  }
  // Caged ladder up the north-west corner to a railed landing at the eave,
  // a walk along the eave and a short roof ladder up to the head house door.
  const lxL = -m.w / 2 + 0.55;
  ladder(add, M, lxL, -m.h / 2, 0, -1, 0.3, 1.2, top + 1.1, ladderC, [3.2, top - 0.2], rng, old ? 0.08 : 0);
  const wz = -m.h / 2 - 0.8;
  P(box(m.w / 2 + 0.6, 0.12, 1.0), lxL + (m.w / 2 + 0.6) / 2 - 0.5, wz + 0.4, top, DARK_STEEL, { cast: false });
  railing(add, M, V(lxL - 0.5, top + 0.12, wz - 0.1), V(0.6, top + 0.12, wz - 0.1), ladderC);
  for (const x of [lxL - 0.3, 0.4]) add(strut(V(x, top - 1.4, -m.h / 2), V(x, top, wz), 0.05, 3), M, DARK_STEEL, { cast: false });
  const r0 = V(0, top + 0.1, -m.h / 2 - 0.25);
  const r1 = V(0, top + 2.2 * (1 - hz / (m.h / 2 + 0.3)) + 0.1, -hz - 0.1);
  for (const s of [-0.25, 0.25]) add(strut(r0.clone().setX(s), r1.clone().setX(s), 0.03, 3), M, ladderC, { cast: false });
  for (let f = 0.2; f < 1; f += 0.2) {
    const p = new THREE.Vector3().lerpVectors(r0, r1, f);
    add(strut(p.clone().setX(-0.25), p.clone().setX(0.25), 0.022, 3), M, ladderC, { cast: false });
  }
  // The loading spout toward where the rails were, its hanger and its
  // swivel head.
  const s0 = V(m.w / 2, E.H - 4, 0);
  const s1 = V(m.w / 2 + 4.5, 4.5, 0);
  add(strut(s0, s1, 0.22, 6), M, RUST[1]);
  add(cyl(0.3, 0.6, 8).translate(s1.x, s1.y - 0.6, s1.z), M, RUST[2]);
  add(strut(V(m.w / 2, top - 0.5, 0), new THREE.Vector3().lerpVectors(s0, s1, 0.6), 0.03, 3), M, DARK_STEEL, { cast: false });
  // Brandt still takes grain: a steel bucket leg up the west side, from a
  // boot by the driveway to a head above the roof, spouting into the head
  // house.
  if (!old) {
    const x = -m.w / 2 - 0.45;
    const z = 1.6;
    P(box(1.3, 1.5, 1.6), x - 0.1, z, 0, 0x8a8c8f);
    for (const s of [-0.36, 0.36]) P(box(0.5, top + 6 - 1.5, 0.5), x, z + s, 1.5, GALV);
    for (let y = 3; y < top + 4; y += 3) P(box(0.9, 0.1, 1.4), x + 0.2, z, y, DARK_STEEL, { cast: false });
    P(box(1.1, 1.3, 1.5), x, z, top + 4.5, 0x8a8c8f);
    P(gable(1.3, 1.7, 0.4), x, z, top + 5.8, 0x6f7477);
    add(strut(V(x + 0.4, top + 4.8, z), V(-hx, E.H + 3.2, z), 0.22, 6), M, GALV);
    ladder(add, M, x - 0.55, z, -1, 0, 0.0, top - 0.3, top + 5.8, GALV, null);
  }

  // Driveway shed in front: open ends, tin roof, a header with trim.
  const n = E.annex;
  const nc = localToWorld(l.x, l.y, a, n.lx, n.ly);
  const ns = stand(terrain, batch, nc.x, nc.y, n.w, n.h, a);
  if (A) A.rect(l.id, 'elevator_shed', nc.x, nc.y, n.w, n.h, a, ns.bottom, ns.base);
  const NP = (geo, lx, ly, up, color, opts) => batch.place(geo, nc.x, nc.y, ns.base, a, lx, ly, up, color, opts);
  for (const s of [-1, 1]) NP(box(0.25, 5 + FOUND, n.h), s * (n.w / 2 - 0.12), 0, ns.bottom - ns.base, clad);
  for (const s of [-1, 1]) for (const e of [-1, 1]) NP(box(0.34, 5, 0.34), s * (n.w / 2 - 0.1), e * (n.h / 2 - 0.1), 0, trim);
  NP(gable(n.w + 0.6, n.h + 0.4, 1.6), 0, 0, 5, tin);
  NP(box(n.w - 0.5, 1.2, 0.12), 0, n.h / 2, 3.8, clad);
  NP(box(n.w - 0.3, 0.14, 0.18), 0, n.h / 2, 3.7, trim, { cast: false });
  // A scale-house shack beside it, with a window and a door.
  const sh = localToWorld(l.x, l.y, a, -7.5, 6);
  const ss = stand(terrain, batch, sh.x, sh.y, 3.2, 3, a);
  batch.place(box(3.2, 2.6 + FOUND, 3), sh.x, sh.y, ss.bottom, a, 0, 0, 0, 0xd8cfb8);
  batch.place(gable(3.6, 3.4, 1), sh.x, sh.y, ss.base + 2.6 - (ss.base - ss.bottom) + FOUND, a, 0, 0, 0, tin);
  const SM = objMatrix(sh.x, sh.y, ss.base, a);
  framed(add, face(SM, 1.6, 1.5, 2), -0.6, 1.0, 0.9, 0.8, GLASS, 0xf0ece2);
  framed(add, face(SM, 1.6, 1.5, 3), 0, 0, 0.8, 1.9, 0x5b3a2a, 0xf0ece2, 0.12, false);
  if (A) A.rect(l.id, 'scale_house', sh.x, sh.y, 3.2, 3, a, ss.bottom, ss.base);
  return true;
}

// The painted name on a white board band: plank seams, weathering and
// dark red letters, worn in places.
function drawCoop(text, seed) {
  return (ctx, x, y, pw, ph) => {
    const rng = makeRng(seed);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    ctx.clip();
    ctx.fillStyle = '#d9d5c9';
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = 'rgba(96,88,76,' + (0.04 + rng() * 0.1).toFixed(3) + ')';
      ctx.fillRect(x + rng() * pw, y + rng() * ph, 3 + rng() * pw * 0.12, 1 + rng() * 2);
    }
    ctx.fillStyle = 'rgba(60,54,46,0.45)';
    for (let i = 1; i < 6; i++) ctx.fillRect(x, y + (i * ph) / 6, pw, Math.max(1, ph * 0.014));
    const px = Math.round(ph * 0.6);
    ctx.font = '900 ' + px + 'px "Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
    ctx.fillStyle = '#86281f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const want = pw * 0.9;
    ctx.save();
    ctx.translate(x + pw / 2, y + ph / 2 + px * 0.04);
    ctx.scale(want / tw, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // Paint worn off the letters in flecks, and a grimy bottom edge.
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = 'rgba(217,213,201,' + (0.5 + rng() * 0.5).toFixed(3) + ')';
      ctx.fillRect(x + rng() * pw, y + rng() * ph, 1 + rng() * 4, 1 + rng() * 2);
    }
    const grd = ctx.createLinearGradient(0, y + ph * 0.75, 0, y + ph);
    grd.addColorStop(0, 'rgba(80,70,58,0)');
    grd.addColorStop(1, 'rgba(80,70,58,0.35)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y + ph * 0.75, pw, ph * 0.25);
    ctx.restore();
  };
}

// ---------- the stave silo beside a farm's barn ----------

// (lx, ly): the silo's centre in the barn's frame; r: its radius; H: wall
// height. Concrete footing, steel hoops with rust weeping below them, a
// covered chute with a caged ladder down the yard side, the fill pipe up the
// back, and a vent on the dome.
export function buildFarmSilo(batch, b, base, lx, ly, r, H) {
  const a = b.angle || 0;
  const M = objMatrix(b.x, b.y, base, a);
  const add = (geo, m, color, opts) => batch.add(geo, m, color, opts);
  const P = (geo, x, z, up, color, opts) => batch.place(geo, b.x, b.y, base, a, x, z, up, color, opts);
  const rng = makeRng(hashString(b.id) + 67);
  const stave = 0xbfc1bc;
  const hoop = 0x8f918e;
  P(cyl(r + 0.3, 0.4 + FOUND, 14), lx, ly, -FOUND, CONCRETE);
  P(cyl(r, H + FOUND, 14), lx, ly, -FOUND, stave);
  const hoops = [];
  for (let y = 1.2; y < H; y += 1.4) hoops.push(y);
  for (const y of hoops) P(cyl(r + 0.06, 0.12, 14), lx, ly, y, hoop, { cast: false });
  P(cyl(r + 0.12, 0.3, 14), lx, ly, H - 0.1, hoop);
  const dome = new THREE.SphereGeometry(r + 0.05, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  P(dome, lx, ly, H + 0.15, 0x9ea3a6);
  P(cyl(0.35, 0.5, 8), lx, ly, H + r - 0.1, hoop);
  P(cone(0.55, 0.35, 8), lx, ly, H + r + 0.4, 0x9ea3a6);
  cylStreaks((g, m, c, o) => add(g, M.clone().multiply(m), c, o), rng, lx, ly, r, hoops, 12, 0.8);
  // Chute on the side facing +z (the yard): a narrow box with a roof, and
  // the ladder inside it shows through the open face.
  const cz = ly + r + 0.35;
  P(box(0.9, H + 0.3, 0.7), lx, cz - 0.1, 0, 0xb9b6ae);
  P(gable(1.1, 0.9, 0.5), lx, cz - 0.1, H + 0.3, 0x5a5f66);
  for (const s of [-1, 1]) P(box(0.12, H + 0.3, 0.16), lx + s * 0.52, cz + 0.2, 0, hoop, { cast: false });
  for (let y = 0.6; y < H; y += 1.4) P(box(1.16, 0.1, 0.14), lx, cz + 0.22, y, hoop, { cast: false });
  ladder(add, M, lx, cz + 0.25, 0, 1, 0.12, 0.2, H + 0.4, GALV, [2.4, H - 0.2]);
  // Fill pipe up the back, over the dome's shoulder.
  const t = Math.PI * 0.8;
  const px = lx + Math.sin(t) * (r + 0.2);
  const pz = ly + Math.cos(t) * (r + 0.2);
  add(strut(V(px, 0.6, pz), V(px, H + 0.3, pz), 0.14, 6), M, GALV);
  add(strut(V(px, H + 0.3, pz), V(lx + Math.sin(t) * (r * 0.6), H + r * 0.75, ly + Math.cos(t) * (r * 0.6)), 0.14, 6), M, GALV);
  for (let y = 2; y < H; y += 3) add(strut(V(px, y, pz), V(lx + Math.sin(t) * r, y, ly + Math.cos(t) * r), 0.04, 3), M, DARK_STEEL, { cast: false });
  P(box(0.6, 0.5, 0.6), px, pz, 0.2, 0x8a8c8f);
}
