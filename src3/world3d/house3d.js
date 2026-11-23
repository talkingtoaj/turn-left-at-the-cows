// Houses (#76): the town and roadside houses (kind 'house'). Each is built
// in a frame turned so its front, the side nearest the road, is local +ly
// (as kinds.js does). A seed from the building id picks the roof (side
// gable, front gable or hip), the way in (a stoop with a hood over the door,
// or a small porch on turned posts), shutters, door and shutter paint and a
// TV antenna, so neighbors differ. Every house gets a concrete foundation
// with vents, corner boards, a frieze, an overhanging roof with soffits, a
// fascia and rake boards, gutters and downspouts, cased windows with sills
// (farmhouse3d.js kits), a paneled door with a screen door, a porch light and
// a capped brick chimney. Everything goes into the shared batch, so houses
// add no draw calls.
// Colours pick textures (src3/look/surfaces.js): walls 'siding', roofs
// 'shingles' or 'tin', foundation and stoop 'concrete', deck 'boards',
// chimney 'brick'. Trim, gutters, shutters and doors are plain paint.

import * as THREE from 'three';
import { hashString, localToWorld } from '../../src/drive/geom.js';
import { box, strut } from './shapes.js';
import { poly } from './roundShapes.js';
import { windowGeo, doorGeo, postGeo, bracketGeo, railGeo, latticeGeo, KIT } from './farmhouse3d.js';

const FOUND = 1.5;
export const WALLS = [0xe8e2d0, 0xf1ede4, 0xe6d9a8, 0xc9d3d6, 0xd9b9a0, 0xcfd8c4]; // siding
export const ROOFS = [0x8e4b3a, 0x5a5f66, 0x6b4a3a, 0x4f6a5a, 0x7a3b3b, 0x6e6a60]; // shingles (one tin)
const SHUTTERS = [KIT.SHUTTER, 0x2b3a4f, 0x6a2a26, 0x2b2b2b, 0x4f5f6a];
const DOORS = [[KIT.DOOR, KIT.DOOR_DARK], [0x7a2e2a, 0x5e2320], [0x2f4a3a, 0x243a2e], [0x2e3f5a, 0x233149]];
export const ROOF_SHAPES = ['side', 'front', 'hip'];
const TRIM = KIT.TRIM;
const GUTTER = 0xe8e6e0;
const GUTTER_IN = 0x4a4c4e;
const STONE = 0x9a958a; // concrete
const DARK = 0x2a2622;
const DECK = 0x8a6c4a; // boards
const BRICK = 0x7b5a4a;
const FLUE = 0xa0553a;
const IRON = 0x23262a;
const LAMP = 0xf0dc9a;
const ANTENNA = 0x9b9ea0;

const TURN = { s: 0, w: 90, n: 180, e: 270 };
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

// Sizes (metres).
const FL = 0.45; // floor height (top of the foundation)
const K = 0.84; // gable pitch: rise per metre across (as the old houses)
const K_HIP = 0.6;
const K_FRONT = 0.72; // a front gable faces the road: a little lower, so it doesn't loom
const EAVE = 0.45; // eave overhang
const RAKE = 0.35; // overhang past a gable end
const ROOF_T = 0.14;
const STOOP = { w: 1.9, d: 1.2 }; // landing in front of the door
const PORCH = { w: 3.4, d: 2.0 };
const STEP = 0.3; // tread depth; two steps up to the floor

// Houses this close (metres) never share roof, way in and wall colour.
export const NEAR = 150;

// Roof and way in for every house in a world, by id. Each house starts from
// its own seed; houses go in id order, and one that would match a house
// already placed within NEAR in roof, way in and wall colour turns to the
// next roof shape (then the other way in) until it differs.
const looksCache = new WeakMap();
export function houseLooks(world) {
  if (looksCache.has(world.buildings)) return looksCache.get(world.buildings);
  const houses = world.buildings.filter((q) => q.kind === 'house').sort((p, q) => (p.id < q.id ? -1 : 1));
  const out = new Map();
  const done = [];
  for (const b of houses) {
    const own = housePlan(b, 's');
    const r0 = ROOF_SHAPES.indexOf(own.roof);
    const near = done.filter((o) => Math.hypot(o.b.x - b.x, o.b.y - b.y) <= NEAR);
    let pick = null;
    for (let k = 0; k < 2 * ROOF_SHAPES.length && !pick; k++) {
      const roof = ROOF_SHAPES[(r0 + k) % ROOF_SHAPES.length];
      const entry = k < ROOF_SHAPES.length ? own.entry : (own.entry === 'hood' ? 'porch' : 'hood');
      if (!near.some((o) => o.roof === roof && o.entry === entry && o.wall === own.wall)) pick = { roof, entry };
    }
    pick = pick || { roof: own.roof, entry: own.entry };
    out.set(b.id, pick);
    done.push({ b, wall: own.wall, ...pick });
  }
  looksCache.set(world.buildings, out);
  return out;
}

// What house b looks like, from its id; side: the side nearest the road
// ('n' | 's' | 'e' | 'w', as roadSide() in structures.js picks it);
// looks: { roof, entry } from houseLooks() when given.
// W runs across the front, D front to back.
export function housePlan(b, side, looks = null) {
  const hsh = hashString(b.id);
  const r = (k) => (Math.imul(hsh ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) / 4294967296;
  const pick = (list, k) => list[Math.floor(r(k) * list.length)];
  const turn = TURN[side] ?? 0;
  const rotated = turn === 90 || turn === 270;
  const floors = hsh % 3 === 0 ? 2 : 1;
  return {
    side,
    turn,
    W: rotated ? b.h : b.w,
    D: rotated ? b.w : b.h,
    floors,
    wallH: floors === 2 ? 5.6 : 3.5,
    wall: WALLS[(hsh >>> 3) % WALLS.length], // >>> : ids hashing past 2^31 went negative and got no colour before #76
    roofColor: ROOFS[hsh % ROOFS.length],
    roof: pick(ROOF_SHAPES, 1),
    entry: r(2) < 0.5 ? 'hood' : 'porch',
    shutters: r(3) < 0.6,
    shutterColor: pick(SHUTTERS, 4),
    door: pick(DOORS, 5),
    antenna: r(6) < 0.3,
    belt: floors === 2 && r(7) < 0.6,
    ...(looks || {}),
  };
}

// The ground the stoop or porch covers, in front of the house, as a world
// rectangle { x, y, w, h, angle } (w across the front), steps included.
export function entryFootprint(b, plan) {
  const e = plan.entry === 'porch' ? PORCH : STOOP;
  const depth = e.d + 2 * STEP;
  const a = (b.angle || 0) + plan.turn;
  const p = localToWorld(b.x, b.y, a, 0, plan.D / 2 + depth / 2);
  return { x: p.x, y: p.y, w: e.w + 0.1, h: depth, angle: a };
}

// A board (box) from a to b ([x, up, y] centres), thick along n, h across.
function board(a, b, thick, h, n) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const x = B.clone().sub(A);
  const len = x.length();
  x.normalize();
  const z = new THREE.Vector3(...n);
  z.addScaledVector(x, -z.dot(x)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(A.add(B).multiplyScalar(0.5));
  return new THREE.BoxGeometry(len, h, thick).applyMatrix4(m);
}

// A gable or hip roof over a rectangle centred (cx, cy): Hu half its length
// along the ridge, Hv half its span, along 'x' or 'y'. Its underside meets
// the wall line at height base and slopes k per metre; O overhang at the
// eaves, R past the gable ends. Top in color, soffits in trim, fascia and
// rake boards, ridge and hip caps; gable end walls (in wall colour, at the
// ends listed in o.ends) and gutters with downspouts when asked.
// Returns the height of the roof's top at a local point.
function roof(P, o) {
  const { cx = 0, cy = 0, along, Hu, Hv, base, k, O, R = 0, type, color, trim, wall, ends = [-1, 1] } = o;
  const T = o.T ?? ROOF_T;
  const hip = type === 'hip';
  const rise = k * Hv;
  const hU = (u, v) => base + k * (hip ? Math.min(Hv - Math.abs(v), Hu - Math.abs(u)) : Hv - Math.abs(v));
  const p3 = (u, v, up) => (along === 'x' ? [cx + u, up, cy + v] : [cx + v, up, cy + u]);
  const nU = (e) => (along === 'x' ? [e, 0, 0] : [0, 0, e]);
  const nV = (s) => (along === 'x' ? [0, 0, s] : [s, 0, 0]);
  const eu = hip ? Hu + O : Hu + R;
  const ev = Hv + O;
  const ru = hip ? Math.max(0, Hu - Hv) : eu;
  const faces = [];
  for (const s of [-1, 1]) faces.push(ru > 1e-3 ? [[-eu, s * ev], [eu, s * ev], [ru, 0], [-ru, 0]] : [[-eu, s * ev], [eu, s * ev], [0, 0]]);
  if (hip) for (const e of [-1, 1]) faces.push([[e * eu, -ev], [e * eu, ev], [e * ru, 0]]);
  for (const f of faces) {
    P(poly(f.map(([u, v]) => p3(u, v, hU(u, v) + T)), [0, 1, 0]), 0, 0, 0, color);
    P(poly(f.map(([u, v]) => p3(u, v, hU(u, v))), [0, -1, 0]), 0, 0, 0, trim, { cast: false });
  }
  const hE = base - k * O; // underside at the eave edge
  const fasciaZ = hE + T / 2 - 0.02;
  // Fascia along the eaves (all four sides of a hip).
  for (const s of [-1, 1]) P(board(p3(-eu, s * (ev + 0.025), fasciaZ), p3(eu, s * (ev + 0.025), fasciaZ), 0.05, T + 0.14, nV(s)), 0, 0, 0, trim, { cast: false });
  if (hip) {
    for (const e of [-1, 1]) P(board(p3(e * (eu + 0.025), -ev - 0.05, fasciaZ), p3(e * (eu + 0.025), ev + 0.05, fasciaZ), 0.05, T + 0.14, nU(e)), 0, 0, 0, trim, { cast: false });
    // Hip caps and the ridge cap.
    for (const e of [-1, 1]) {
      for (const s of [-1, 1]) {
        const a = p3(e * eu, s * ev, hE + T + 0.03);
        const c = p3(e * ru, 0, base + rise + T + 0.03);
        P(strut(new THREE.Vector3(...a), new THREE.Vector3(...c), 0.07, 4), 0, 0, 0, color, { cast: false });
      }
    }
  } else {
    // Gable ends: a wall up under the roof, rake boards along the slopes.
    for (const e of ends) {
      P(poly([p3(e * Hu, -Hv, base), p3(e * Hu, Hv, base), p3(e * Hu, 0, base + rise)], nU(e)), 0, 0, 0, wall);
      for (const s of [-1, 1]) {
        const z0 = hE + T / 2 - 0.03;
        const z1 = base + rise + T / 2 - 0.03;
        P(board(p3(e * (eu + 0.03), s * (ev + 0.03), z0), p3(e * (eu + 0.03), 0, z1 + 0.03), 0.06, T + 0.16, nU(e)), 0, 0, 0, trim, { cast: false });
      }
    }
  }
  if (ru > 1e-3) P(board(p3(-ru - (hip ? 0 : 0.02), 0, base + rise + T + 0.03), p3(ru + (hip ? 0 : 0.02), 0, base + rise + T + 0.03), 0.07, 0.3, [0, 1, 0]), 0, 0, 0, color, { cast: false });
  // Gutters along the eaves, a dark trough on top, and downspouts at two
  // opposite corners: out to the wall, down it, and a kick at the foot.
  if (o.gutters) {
    const gv = ev + 0.11;
    const runs = [[-1, -eu, eu, 'v'], [1, -eu, eu, 'v']];
    if (hip) runs.push([-1, -ev, ev, 'u'], [1, -ev, ev, 'u']);
    for (const [s, a0, a1, kind] of runs) {
      const at = (t, up) => (kind === 'v' ? p3(t, s * gv, up) : p3(s * (eu + 0.11), t, up));
      const n = kind === 'v' ? nV(s) : nU(s);
      P(board(at(a0, hE - 0.02), at(a1, hE - 0.02), 0.13, 0.13, n), 0, 0, 0, GUTTER, { cast: false });
      P(board(at(a0 + 0.03, hE + 0.045), at(a1 - 0.03, hE + 0.045), 0.08, 0.012, [0, 1, 0]), 0, 0, 0, GUTTER_IN, { cast: false });
    }
    for (const [e, s] of [[1, 1], [-1, -1]]) {
      const u = e * (Hu - 0.18);
      const pts = [p3(u, s * gv, hE - 0.05), p3(u, s * (Hv + 0.07), hE - 0.45), p3(u, s * (Hv + 0.07), 0.32), p3(u, s * (Hv + 0.32), 0.14)];
      for (let i = 0; i < pts.length - 1; i++) {
        P(strut(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1]), 0.045, 4), 0, 0, 0, GUTTER, { cast: false });
      }
      const [bx, , by] = p3(u, s * (Hv + 0.05), 0);
      for (const up of [1.2, hE - 1.0]) P(box(0.1, 0.04, 0.1), bx, by, up, GUTTER, { cast: false }); // straps
    }
  }
  return (lx, ly) => {
    const u = along === 'x' ? lx - cx : ly - cy;
    const v = along === 'x' ? ly - cy : lx - cx;
    return hU(u, v) + T;
  };
}

// A shed roof from the wall (y0, top at h) out to y1, falling slope per metre,
// x0..x1 across: top, soffit, fascia on the three open edges.
function shedRoof(P, { x0, x1, y0, y1, h, slope, color }) {
  const T = 0.1;
  const z = (y) => h - slope * (y - y0);
  const q = (dz) => [[x0, z(y0) + dz, y0], [x1, z(y0) + dz, y0], [x1, z(y1) + dz, y1], [x0, z(y1) + dz, y1]];
  P(poly(q(0), [0, 1, 0]), 0, 0, 0, color);
  P(poly(q(-T), [0, -1, 0]), 0, 0, 0, TRIM, { cast: false });
  P(board([x0 - 0.03, z(y1) - T / 2, y1 + 0.025], [x1 + 0.03, z(y1) - T / 2, y1 + 0.025], 0.05, T + 0.12, [0, 0, 1]), 0, 0, 0, TRIM, { cast: false });
  for (const [x, s] of [[x0 - 0.025, -1], [x1 + 0.025, 1]]) {
    P(board([x, z(y0) - T / 2, y0], [x, z(y1) - T / 2, y1 + 0.05], 0.05, T + 0.12, [s, 0, 0]), 0, 0, 0, TRIM, { cast: false });
  }
  return z;
}

// A wall lantern (porch light), back on the wall at z = 0, facing +z.
function lanternParts() {
  return [
    [box(0.14, 0.26, 0.03).translate(0, -0.13, 0.015), IRON],
    [box(0.04, 0.04, 0.16).translate(0, 0.02, 0.08), IRON],
    [box(0.15, 0.2, 0.15).translate(0, -0.2, 0.16), LAMP],
    [box(0.2, 0.04, 0.2).translate(0, 0.0, 0.16), IRON],
    [box(0.17, 0.03, 0.17).translate(0, -0.23, 0.16), IRON],
  ];
}

// b: the building; base: floor height of its ground; side: the side nearest the road.
// Returns { chimney: { x, y, top } | null } (top: absolute height the smoke leaves from).
export function buildHouse(world, terrain, batch, b, base, side) {
  const p = housePlan(b, side, houseLooks(world).get(b.id));
  const hsh = hashString(b.id);
  const a = (b.angle || 0) + p.turn;
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, base, a, lx, ly, up, color, opts);
  const rot = (t) => new THREE.Matrix4().makeRotationY(t);
  const place = (parts, lx, ly, up, face, remap = new Map()) => {
    for (const [geo, color] of parts) P(geo, lx, ly, up, remap.get(color) ?? color, { extra: rot(face), cast: false });
  };
  const A = batch.audit;
  const { W, D, wallH } = p;
  const front = D / 2;

  // ---- Body: walls, foundation with vents, water table, corner boards, frieze.
  P(box(W, wallH + FOUND, D), 0, 0, -FOUND, p.wall);
  P(box(W + 0.1, FL + FOUND, D + 0.1), 0, 0, -FOUND, STONE);
  P(box(W + 0.18, 0.1, D + 0.18), 0, 0, FL, TRIM, { cast: false });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) P(box(0.18, wallH - FL - 0.1, 0.18), sx * (W / 2 + 0.02), sy * (D / 2 + 0.02), FL + 0.1, TRIM, { cast: false });
  P(box(W + 0.08, 0.26, D + 0.08), 0, 0, wallH - 0.26, TRIM, { cast: false });
  if (p.belt) P(box(W + 0.08, 0.14, D + 0.08), 0, 0, 3.1, TRIM, { cast: false });
  for (const s of [-1, 1]) for (const x of [-0.3, 0.3]) P(box(0.42, 0.16, 0.04), x * W, s * (D / 2 + 0.05), 0.12, DARK, { cast: false });

  // ---- Roof.
  const spec = p.roof === 'front' ? { along: 'y', Hu: D / 2, Hv: W / 2, type: 'gable', k: K_FRONT }
    : p.roof === 'hip' ? (W >= D ? { along: 'x', Hu: W / 2, Hv: D / 2 } : { along: 'y', Hu: D / 2, Hv: W / 2 })
    : { along: 'x', Hu: W / 2, Hv: D / 2, type: 'gable', k: K };
  if (p.roof === 'hip') Object.assign(spec, { type: 'hip', k: K_HIP });
  const roofTop = roof(P, { ...spec, base: wallH, O: EAVE, R: RAKE, color: p.roofColor, trim: TRIM, wall: p.wall, gutters: true });
  const rise = spec.k * spec.Hv;
  // Attic windows in each gable end: a pair in a tall gable, else one small one.
  if (spec.type === 'gable') {
    const tall = rise > 3.2;
    for (const e of [-1, 1]) {
      const k = spec.along === 'x' ? (e < 0 ? 'w' : 'e') : (e < 0 ? 'n' : 's');
      for (const off of tall ? [-0.62, 0.62] : [0]) {
        const lx = spec.along === 'x' ? e * W / 2 : off;
        const ly = spec.along === 'x' ? -off * e : e * D / 2;
        place(tall ? windowGeo(0.75, 1.05, false) : windowGeo(0.6, 0.8, false), lx, ly, wallH + (tall ? 0.75 : Math.min(0.7, rise * 0.25)), FACE[k]);
      }
    }
  }

  // ---- Chimney where the shared house formula puts it (ambient.js), in
  // this house's turned frame, capped, a clay flue on top.
  const cx0 = ((hsh >> 4) % 2 ? 1 : -1) * b.w * 0.25;
  const cy0 = ((hsh >> 6) % 2 ? 1 : -1) * b.h * 0.2;
  const cw = localToWorld(b.x, b.y, b.angle || 0, cx0, cy0);
  const ex = localToWorld(0, 0, a, 1, 0);
  const ey = localToWorld(0, 0, a, 0, 1);
  const tx = (cw.x - b.x) * ex.x + (cw.y - b.y) * ex.y;
  const ty = (cw.x - b.x) * ey.x + (cw.y - b.y) * ey.y;
  const ctop = Math.max(roofTop(tx, ty) + 1.0, wallH + rise * 0.6 + 0.9);
  P(box(0.9, ctop - wallH + 0.3, 0.9), tx, ty, wallH - 0.3, BRICK);
  P(box(1.04, 0.14, 1.04), tx, ty, ctop - 0.42, BRICK, { cast: false });
  P(box(1.08, 0.1, 1.08), tx, ty, ctop, STONE, { cast: false });
  P(box(0.3, 0.24, 0.3), tx, ty, ctop + 0.1, FLUE, { cast: false });

  // ---- TV antenna on the ridge, at the other end from the chimney.
  if (p.antenna) {
    const ax = spec.along === 'x' ? -Math.sign(tx || 1) * W * 0.28 : 0;
    const ay = spec.along === 'x' ? 0 : -Math.sign(ty || 1) * D * 0.28;
    const at = roofTop(ax, ay);
    const v = (x, up, y) => new THREE.Vector3(ax + x, up, ay + y);
    P(strut(v(0, at - 0.1, 0), v(0, at + 2.6, 0), 0.03, 5), 0, 0, 0, ANTENNA);
    for (const [up, half] of [[1.7, 0.9], [2.05, 0.7], [2.35, 0.5]]) {
      P(strut(v(-half, at + up, 0.05), v(half, at + up, 0.05), 0.012, 3), 0, 0, 0, ANTENNA, { cast: false });
      for (const s of [-1, 1]) P(strut(v(s * half, at + up, 0.05), v(s * half, at + up, 0.45), 0.01, 3), 0, 0, 0, ANTENNA, { cast: false });
    }
    P(strut(v(0, at + 2.0, 0), v(0, at + 2.0, 0.6), 0.015, 3), 0, 0, 0, ANTENNA, { cast: false });
  }

  // ---- Windows: cased, with sills; shutters on the front when the house has them.
  const shut = new Map([[KIT.SHUTTER, p.shutterColor]]);
  for (const k of ['s', 'n', 'e', 'w']) {
    const across = k === 's' || k === 'n';
    const l = across ? W : D;
    const n = Math.max(1, Math.floor(l / 3.5));
    for (let f = 0; f < p.floors; f++) {
      for (let i = 0; i < n; i++) {
        if (k === 's' && f === 0 && i === Math.floor(n / 2)) continue; // the door
        const t = -l / 2 + (l * (i + 0.5)) / n;
        const lx = across ? t : (k === 'e' ? W / 2 : -W / 2);
        const ly = across ? (k === 's' ? D / 2 : -D / 2) : t;
        const h = f === 0 ? 1.35 : 1.25;
        place(windowGeo(0.95, h, p.shutters && k === 's'), lx, ly, f === 0 ? FL + 0.5 : 3.75, FACE[k], shut);
      }
    }
  }

  // ---- The front door, a porch light beside it.
  place(doorGeo(), 0, front, FL, 0, new Map([[KIT.DOOR, p.door[0]], [KIT.DOOR_DARK, p.door[1]]]));
  place(lanternParts(), 0.9, front, FL + 2.0, 0);

  // ---- The way in.
  const e = p.entry === 'porch' ? PORCH : STOOP;
  const fp = entryFootprint(b, p);
  const g = terrain.groundRange({ rect: fp });
  const below = Math.min(-0.3, g.min - base - 0.2);
  if (A) A.rect(b.id, p.entry === 'porch' ? 'house_porch' : 'house_stoop', fp.x, fp.y, fp.w, fp.h, a, base + below, base);
  // Gable roofs over the door only where they clear the main eaves.
  const gableOk = p.floors === 2 || p.roof === 'front';
  const steps = (w, y0, tread, riser) => {
    for (let s = 1; s <= 2; s++) {
      const top = (FL * (3 - s)) / 3;
      const yy = y0 + STEP * (s - 1);
      P(box(w, 0.05, STEP + 0.03), 0, yy + STEP / 2, top - 0.05, tread);
      P(box(w - 0.04, top - 0.05 - below, STEP), 0, yy + STEP / 2, below, riser, { cast: false });
    }
  };
  if (p.entry === 'hood') {
    P(box(e.w, FL - below, e.d), 0, front + e.d / 2, below, STONE);
    steps(e.w - 0.3, front + e.d, STONE, STONE);
    const hb = 2.88; // underside of the hood at the wall
    for (const s of [-1, 1]) P(bracketGeo(), s * 0.72, front, hb, TRIM, { extra: rot(-Math.PI / 2), cast: false });
    if (gableOk) roof(P, { along: 'y', cx: 0, cy: front + 0.45, Hu: 0.45, Hv: 0.85, base: hb, k: 0.7, O: 0.08, R: 0.1, type: 'gable', color: p.roofColor, trim: TRIM, wall: TRIM, ends: [1], T: 0.1 });
    else shedRoof(P, { x0: -0.95, x1: 0.95, y0: front, y1: front + 1.0, h: hb + 0.2, slope: 0.3, color: p.roofColor });
  } else {
    // Deck on a lattice skirt, two turned posts, rails, steps, a roof.
    const { w: PW, d: PD } = e;
    const yF = front + PD;
    P(box(PW, 0.08, PD), 0, front + PD / 2, FL - 0.08, DECK);
    P(box(PW - 0.12, FL - 0.08 - below, PD - 0.12), 0, front + PD / 2 - 0.03, below, DARK, { cast: false });
    P(box(PW, 0.2, 0.05), 0, yF + 0.025, FL - 0.28, TRIM, { cast: false });
    for (const s of [-1, 1]) P(box(0.05, 0.2, PD), s * (PW / 2 + 0.025), front + PD / 2, FL - 0.28, TRIM, { cast: false });
    const skirtH = FL - 0.28 - below;
    P(latticeGeo(PW, skirtH), 0, yF + 0.06, below, TRIM, { cast: false });
    for (const s of [-1, 1]) P(latticeGeo(PD, skirtH), s * (PW / 2 + 0.06), front + PD / 2, below, TRIM, { extra: rot(s * Math.PI / 2), cast: false });
    steps(1.5, yF, DECK, TRIM);
    const px = PW / 2 - 0.15;
    const py = yF - 0.15;
    const slope = 0.16;
    const roofAtWall = p.floors === 2 ? 3.25 : wallH - 0.38;
    const beamTop = gableOk && p.roof === 'front' && p.floors === 1 ? 2.75 : roofAtWall - slope * (py - front) - 0.1;
    const beamH = 0.22;
    const post = postGeo(beamTop - beamH - FL);
    for (const s of [-1, 1]) P(post, s * px, py, FL, TRIM);
    P(box(PW - 0.04, beamH, 0.18), 0, py, beamTop - beamH, TRIM);
    for (const s of [-1, 1]) P(box(0.18, beamH, py - front), s * px, front + (py - front) / 2, beamTop - beamH, TRIM, { cast: false });
    for (const s of [-1, 1]) {
      const l = px - 0.13 - 0.8;
      P(railGeo(l), s * (0.8 + l / 2), py, FL, TRIM, { cast: false });
      const l2 = py - front - 0.2;
      P(railGeo(l2), s * px, front + 0.05 + l2 / 2, FL, TRIM, { extra: rot(Math.PI / 2), cast: false });
    }
    if (gableOk && p.roof === 'front' && p.floors === 1) {
      roof(P, { along: 'y', cx: 0, cy: front + (PD + 0.1) / 2, Hu: (PD + 0.1) / 2, Hv: px, base: beamTop, k: 0.6, O: 0.25, R: 0.15, type: 'gable', color: p.roofColor, trim: TRIM, wall: TRIM, ends: [1], T: 0.1 });
    } else {
      shedRoof(P, { x0: -PW / 2 - 0.2, x1: PW / 2 + 0.2, y0: front, y1: yF + 0.3, h: roofAtWall, slope, color: p.roofColor });
    }
  }

  if (!b.chimney) return { chimney: null };
  return { chimney: { x: cw.x, y: cw.y, top: base + ctop + 0.35 } };
}
