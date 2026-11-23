// The farmhouse (issue #63): a two-storey white house with a wraparound
// porch. The porch runs the whole front (the side that faces the road, where
// the door is) and turns the corner onto the side nearer the road: lattice
// skirt, turned posts with brackets, rails and balusters, steps up to a
// screen door, a hip where the two porch roofs meet, a pale blue ceiling, a
// swing and a rocking chair. Windows get casings, sills, sashes and shutters.
// Every piece goes into the shared batch, so the house adds no draw calls.
// Colours pick textures (src3/look/surfaces.js): walls 'siding', deck and
// treads 'boards', the roofs 'tin', the foundation 'concrete', the chimney
// 'brick'. Trim, shutters and the ceiling use plain paint colours.
//
// Local frame: x east, y south (back), up. Kits are built facing +z and
// turned to their wall (FACE).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { localToWorld } from '../../src/drive/geom.js';
import { box, cyl, strut } from './shapes.js';
import { outline, slab, poly } from './roundShapes.js';

const FOUND = 1.5;
const WALL = 0xf1ede4; // siding
const ROOF = 0x5d6066; // tin
const PORCH_ROOF = 0x8a8c8f; // tin
const TRIM = 0xf6f2e8; // plain white paint
const CEILING = 0xb9d3d6; // pale blue porch ceiling
const DECK = 0x8a6c4a; // boards
const DARK = 0x2a2622; // crawl space behind the lattice
const STONE = 0x9a958a; // concrete
const BRICK = 0x7b5a4a;
const GLASS = 0x2c3a46;
const SHUTTER = 0x3f5a48;
const DOOR = 0x5b3a2a; // boards
const DOOR_DARK = 0x4a3420; // boards
const SCREEN = 0x4a5258;
const IRON = 0x23262a;
const CHAIR = 0x7a5a3a; // boards
const MAT = 0x6e3b2c;
const POT = 0xa0553a;
const LEAF = 0x4d7a3a;
// Kit colours other models remap (house3d.js).
export const KIT = { TRIM, SHUTTER, DOOR, DOOR_DARK, GLASS };

// Porch sizes (metres).
const FL = 0.55; // deck height
const D = 2.4; // porch depth
const TOP = 3.55; // underside of the porch roof where it meets the wall
const SLOPE = 0.2; // drop per metre out from the wall
const OVER = 0.3; // roof overhang past the posts' line
const ROOF_T = 0.1;
const GAP = 0.95; // half the opening in the rail at the steps
const STAIR = 2 * GAP - 0.2; // width of the steps
const TREAD = 0.3;
const STEPS = 2;

const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
const NORMAL = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const NEXT = { n: ['e', 'w'], s: ['e', 'w'], e: ['n', 's'], w: ['n', 's'] };

// Pieces built once and shared by every house.
const kitCache = new Map();
function kit(name, make) {
  if (!kitCache.has(name)) kitCache.set(name, make());
  return kitCache.get(name);
}

// Merge boxes given as [w, h, d, x, y, z, rotZ] into one geometry.
function boxes(list) {
  const geos = list.map(([w, h, d, x, y, z, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    return g.translate(x, y, z);
  });
  return mergeGeometries(geos, false);
}

// Diagonal lattice, len along x, h tall (bottom at y = 0), facing +z.
// Strips run at 45 degrees both ways and are cut to the panel's ends.
export function latticeGeo(len, h) {
  return kit(`lat:${len.toFixed(2)}:${h.toFixed(2)}`, () => {
    const list = [];
    const step = 0.26;
    for (const dir of [1, -1]) {
      for (let cx = -len / 2 - h / 2; cx < len / 2 + h / 2; cx += step) {
        // Points cx + dir * t, h / 2 + t for t in [-h/2, h/2], kept inside |x| <= len/2.
        let t0 = -h / 2;
        let t1 = h / 2;
        if (dir > 0) { t0 = Math.max(t0, -len / 2 - cx); t1 = Math.min(t1, len / 2 - cx); } else { t0 = Math.max(t0, cx - len / 2); t1 = Math.min(t1, cx + len / 2); }
        if (t1 - t0 < 0.05) continue;
        const tm = (t0 + t1) / 2;
        const L = (t1 - t0) * Math.SQRT2;
        list.push([L, 0.04, 0.014, cx + dir * tm, h / 2 + tm, dir > 0 ? 0.008 : -0.008, dir * Math.PI / 4]);
      }
    }
    return boxes(list);
  });
}

// A run of railing len long between posts, deck top at y = 0.
export function railGeo(len) {
  return kit(`rail:${len.toFixed(2)}`, () => {
    const list = [
      [len, 0.06, 0.09, 0, 0.84, 0],
      [len, 0.04, 0.13, 0, 0.9, 0],
      [len, 0.06, 0.08, 0, 0.1, 0],
    ];
    const n = Math.max(1, Math.round(len / 0.14));
    for (let i = 0; i < n - 1; i++) list.push([0.045, 0.71, 0.045, -len / 2 + (len * (i + 1)) / n, 0.13 + 0.355, 0]);
    return boxes(list);
  });
}

// A turned post H tall: square plinth, round shaft with collars, square cap.
export function postGeo(H) {
  return kit(`post:${H.toFixed(2)}`, () => mergeGeometries([
    box(0.26, 0.24, 0.26).toNonIndexed(),
    cyl(0.1, 0.06, 8).translate(0, 0.24, 0).toNonIndexed(),
    cyl(0.075, H - 0.5, 8).translate(0, 0.3, 0).toNonIndexed(),
    cyl(0.095, 0.06, 8).translate(0, H - 0.26, 0).toNonIndexed(),
    box(0.22, 0.06, 0.22).translate(0, H - 0.2, 0).toNonIndexed(),
    box(0.26, 0.14, 0.26).translate(0, H - 0.14, 0).toNonIndexed(),
  ].map(stripAll), false));
}

function stripAll(g) {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

// A curved bracket under the beam, out along +x from the post's face, top at y = 0.
export function bracketGeo() {
  return kit('bracket', () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.42, 0);
    s.lineTo(0.42, -0.04);
    s.quadraticCurveTo(0.06, -0.06, 0.04, -0.42);
    s.lineTo(0, -0.42);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.025);
  });
}

// Window, sill at y = 0, glass face on the wall (z = 0), facing +z:
// casing, head with a cap, sill and apron, two sashes, shutters.
export function windowGeo(w, h, shutters) {
  return kit(`win:${w}:${h}:${shutters}`, () => {
    const parts = [
      [box(w, h, 0.03).translate(0, 0, 0.0), GLASS],
      [boxes([
        [0.12, h + 0.1, 0.07, -w / 2 - 0.06, h / 2, 0.035],
        [0.12, h + 0.1, 0.07, w / 2 + 0.06, h / 2, 0.035],
        [w + 0.4, 0.18, 0.08, 0, h + 0.09, 0.04],
        [w + 0.5, 0.05, 0.14, 0, h + 0.2, 0.06],
        [w + 0.34, 0.06, 0.16, 0, -0.03, 0.08],
        [w + 0.12, 0.12, 0.04, 0, -0.12, 0.02],
        // Sashes: frames round each pane, a meeting rail, one bar each.
        [w, 0.07, 0.05, 0, h / 2, 0.025],
        [w, 0.06, 0.04, 0, h - 0.03, 0.02],
        [w, 0.06, 0.04, 0, 0.03, 0.02],
        [0.035, h, 0.035, 0, h / 2, 0.02],
      ]), TRIM],
    ];
    if (shutters) {
      const sw = w * 0.48;
      const list = [];
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 + 0.14 + sw / 2);
        list.push([sw, h + 0.06, 0.04, x, h / 2, 0.02]);
        // Raised frame and a middle rail, so the panel reads as two halves.
        list.push([0.05, h + 0.06, 0.03, x - sw / 2 + 0.025, h / 2, 0.05], [0.05, h + 0.06, 0.03, x + sw / 2 - 0.025, h / 2, 0.05]);
        list.push([sw, 0.06, 0.03, x, h / 2, 0.05], [sw, 0.05, 0.03, x, h + 0.005, 0.05], [sw, 0.05, 0.03, x, 0.0, 0.05]);
      }
      parts.push([boxes(list), SHUTTER]);
    }
    return parts;
  });
}

// Front door with a screen door in front of it, bottom at y = 0, facing +z.
export function doorGeo() {
  return kit('door', () => {
    const w = 0.95;
    const h = 2.05;
    const screen = [];
    const sz = 0.1;
    // Screen door frame: stiles, three rails, a push bar, corner braces.
    screen.push([0.08, h, 0.04, -w / 2 + 0.04, h / 2, sz], [0.08, h, 0.04, w / 2 - 0.04, h / 2, sz]);
    screen.push([w, 0.1, 0.04, 0, h - 0.05, sz], [w, 0.14, 0.04, 0, 0.07, sz], [w, 0.1, 0.04, 0, 0.95, sz]);
    screen.push([w - 0.16, 0.05, 0.04, 0, 1.15, sz + 0.02]);
    for (const sx of [-1, 1]) screen.push([0.24, 0.04, 0.03, sx * (w / 2 - 0.16), h - 0.18, sz + 0.02, sx * 0.785]);
    return [
      [box(w, h, 0.04).translate(0, 0, 0.01), DOOR],
      [boxes([
        [w * 0.32, 0.6, 0.03, -w * 0.2, 0.25, 0.04],
        [w * 0.32, 0.6, 0.03, w * 0.2, 0.25, 0.04],
        [w * 0.32, 0.55, 0.03, -w * 0.2, 1.05, 0.04],
        [w * 0.32, 0.55, 0.03, w * 0.2, 1.05, 0.04],
      ]), DOOR_DARK],
      [box(w * 0.7, 0.42, 0.02).translate(0, 1.5, 0.035), GLASS],
      [boxes([
        [0.14, h + 0.12, 0.08, -w / 2 - 0.07, (h + 0.12) / 2, 0.04],
        [0.14, h + 0.12, 0.08, w / 2 + 0.07, (h + 0.12) / 2, 0.04],
        [w + 0.42, 0.2, 0.09, 0, h + 0.1, 0.045],
        [w + 0.52, 0.05, 0.15, 0, h + 0.22, 0.07],
        ...screen,
      ]), TRIM],
      // Screen panels (mesh) above and below the middle rail.
      [boxes([[w - 0.16, h - 1.05, 0.01, 0, 1.0 + (h - 1.05) / 2, sz - 0.005], [w - 0.16, 0.81, 0.01, 0, 0.14 + 0.81 / 2 - 0.01, sz - 0.005]]), SCREEN],
      [new THREE.SphereGeometry(0.035, 6, 4).translate(w / 2 - 0.12, 1.0, sz + 0.05), IRON],
      [new THREE.SphereGeometry(0.03, 6, 4).translate(w / 2 - 0.15, 1.0, 0.06), 0xc9a64a],
    ];
  });
}

// Rocking chair, seat front facing +z, on the deck at y = 0.
function rockerGeo() {
  return kit('rocker', () => {
    const R = 1.1;
    const runner = new THREE.Shape();
    runner.absarc(0, R, R, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36, false);
    runner.absarc(0, R, R - 0.05, -Math.PI / 2 + 0.36, -Math.PI / 2 - 0.36, true);
    const parts = [];
    for (const sx of [-1, 1]) {
      parts.push(slab(runner, 0.04, 0, 'zy', sx * 0.24, 6).translate(0, 0, -0.04));
      // Legs: front short, back long and leaning back as the back posts.
      parts.push(cyl(0.022, 0.4, 6).translate(sx * 0.24, 0.03, 0.18));
      parts.push(strut(new THREE.Vector3(sx * 0.24, 0.03, -0.22), new THREE.Vector3(sx * 0.24, 1.05, -0.36), 0.025, 6));
      // Arm on a short post.
      parts.push(cyl(0.02, 0.24, 6).translate(sx * 0.26, 0.43, 0.16));
      parts.push(box(0.07, 0.035, 0.5).translate(sx * 0.27, 0.66, -0.03));
    }
    parts.push(box(0.52, 0.04, 0.46).translate(0, 0.41, -0.02));
    parts.push(box(0.5, 0.08, 0.03).translate(0, 0.96, -0.33).rotateX(0));
    parts.push(box(0.5, 0.05, 0.03).translate(0, 0.52, -0.26));
    for (let i = 0; i < 5; i++) {
      const x = -0.16 + i * 0.08;
      parts.push(strut(new THREE.Vector3(x, 0.54, -0.26), new THREE.Vector3(x, 0.95, -0.33), 0.012, 4));
    }
    return mergeGeometries(parts.map((g) => stripAll(g.index ? g.toNonIndexed() : g)), false);
  });
}

// Porch swing, seat front facing +z, hung by chains from `drop` above the deck.
function swingGeo(drop) {
  return kit(`swing:${drop.toFixed(2)}`, () => {
    const W = 1.3;
    const seat = 0.45;
    const list = [];
    for (let i = 0; i < 5; i++) list.push([W, 0.03, 0.08, 0, seat, 0.2 - i * 0.095]);
    list.push([W + 0.04, 0.06, 0.05, 0, seat - 0.05, 0.22], [W + 0.04, 0.06, 0.05, 0, seat - 0.05, -0.2]);
    for (let i = 0; i < 4; i++) list.push([W, 0.07, 0.025, 0, seat + 0.12 + i * 0.11, -0.24 - i * 0.012]);
    for (const sx of [-1, 1]) {
      list.push([0.05, 0.5, 0.05, sx * (W / 2), seat + 0.25, -0.25]);
      list.push([0.06, 0.04, 0.5, sx * (W / 2 + 0.02), seat + 0.25, -0.01]);
      list.push([0.04, 0.25, 0.04, sx * (W / 2 + 0.02), seat + 0.12, 0.2]);
    }
    const chains = [];
    for (const sx of [-1, 1]) {
      const top = new THREE.Vector3(sx * (W / 2 + 0.02), drop, -0.02);
      chains.push(strut(new THREE.Vector3(sx * (W / 2 + 0.02), seat + 0.27, 0.2), top, 0.008, 4));
      chains.push(strut(new THREE.Vector3(sx * (W / 2 + 0.02), seat + 0.5, -0.25), top, 0.008, 4));
    }
    return [[boxes(list), SHUTTER], [mergeGeometries(chains.map((g) => stripAll(g.toNonIndexed())), false), IRON]];
  });
}

// sides: distance from each side ('n' | 's' | 'e' | 'w') to the nearest road.
export function buildFarmhouse(terrain, batch, b, base, hsh, sides) {
  const a = b.angle || 0;
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, base, a, lx, ly, up, color, opts);
  const rot = (t) => new THREE.Matrix4().makeRotationY(t);
  const A = batch.audit;
  const wallH = 5.6;
  const short = Math.min(b.w, b.h);
  const len = (k) => (k === 'n' || k === 's' ? b.w : b.h);

  // ---- The house: walls, roof, foundation, corner boards, eave trim, chimney.
  P(box(b.w, wallH + FOUND, b.h), 0, 0, -FOUND, WALL);
  P(box(b.w + 0.12, FL + FOUND, b.h + 0.12), 0, 0, -FOUND, STONE);
  P(box(b.w + 0.18, 0.06, b.h + 0.18), 0, 0, FL, TRIM, { cast: false });
  const rise = short * 0.42;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) P(box(0.2, wallH - FL, 0.2), sx * (b.w / 2 + 0.03), sy * (b.h / 2 + 0.03), FL, TRIM, { cast: false });
  P(box(b.w + 0.1, 0.32, b.h + 0.1), 0, 0, wallH - 0.32, TRIM, { cast: false });
  // Fascia under the eaves and rake boards up the gable ends.
  const alongX = b.w >= b.h;
  const eave = (alongX ? b.h : b.w) / 2 + 0.4;
  const ridgeLen = (alongX ? b.w : b.h) + 0.8;
  for (const s of [-1, 1]) {
    if (alongX) P(box(ridgeLen, 0.2, 0.06), 0, s * eave, wallH - 0.2, TRIM, { cast: false });
    else P(box(0.06, 0.2, ridgeLen), s * eave, 0, wallH - 0.2, TRIM, { cast: false });
  }
  // Roof: two sloping tin panels (top and underside), so the gable ends
  // can be siding with an attic window instead of the roof's own end caps.
  const R = ridgeLen / 2;
  const xz = (u, up, v) => (alongX ? [u, up, v] : [v, up, u]); // u along the ridge, v across
  for (const s of [-1, 1]) {
    for (const [dy, n, c] of [[0, 1, ROOF], [-0.12, -1, TRIM]]) {
      const pts = [xz(-R, wallH + dy, s * eave), xz(R, wallH + dy, s * eave), xz(R, wallH + rise + dy, 0), xz(-R, wallH + rise + dy, 0)];
      P(poly(pts, [0, n, 0]), 0, 0, 0, c, { cast: n > 0 });
    }
  }
  const halfAcross = (alongX ? b.h : b.w) / 2;
  // Gable ends: a five-sided wall up under the roof; the long walls rise to meet its underside.
  const lip = rise * (1 - halfAcross / eave) - 0.12; // underside of the roof above the wall line
  P(box(b.w, lip + 0.02, b.h), 0, 0, wallH, WALL, { cast: false });
  for (const e of [-1, 1]) {
    const u = e * (alongX ? b.w : b.h) / 2;
    const pts = [xz(u, wallH, -halfAcross), xz(u, wallH, halfAcross), xz(u, wallH + lip, halfAcross),
      xz(u, wallH + rise - 0.12, 0), xz(u, wallH + lip, -halfAcross)];
    P(poly(pts, alongX ? [e, 0, 0] : [0, 0, e]), 0, 0, 0, WALL);
  }
  const pitch = Math.atan2(rise, eave);
  const run = Math.hypot(rise, eave);
  for (const e of [-1, 1]) {
    for (const s of [-1, 1]) {
      const m = alongX ? new THREE.Matrix4().makeRotationX(s * pitch) : new THREE.Matrix4().makeRotationZ(-s * pitch);
      const g = alongX ? new THREE.BoxGeometry(0.08, 0.26, run + 0.1) : new THREE.BoxGeometry(run + 0.1, 0.26, 0.08);
      const lx = alongX ? e * (ridgeLen / 2 + 0.02) : s * eave / 2;
      const ly = alongX ? s * eave / 2 : e * (ridgeLen / 2 + 0.02);
      P(g, lx, ly, wallH + rise / 2 - 0.08, TRIM, { extra: m, cast: false });
    }
  }
  // Chimney where the shared house formula puts it (the smoke rises there), with a cap.
  const cx = ((hsh >> 4) % 2 ? 1 : -1) * b.w * 0.25;
  const cy = ((hsh >> 6) % 2 ? 1 : -1) * b.h * 0.2;
  P(box(1, rise + 1.4, 1), cx, cy, wallH, BRICK);
  P(box(1.2, 0.14, 1.2), cx, cy, wallH + rise + 1.26, BRICK);

  // ---- Which way the porch goes (porchPlan below).
  const { front, wrap, dA, dB, LA, LB, L, doorL, aDoor } = porchPlan(b, sides);
  const angA = Math.atan2(-dA[1], dA[0]); // turns kit +x along A
  const angB = Math.atan2(-dB[1], dB[0]);
  // An axis-aligned box over the (a, b) rectangle, from up to up + h.
  const bx = (a0, a1, b0, b1, up, h, color, opts) => {
    const [lx, ly] = L((a0 + a1) / 2, (b0 + b1) / 2);
    const da = Math.abs(a1 - a0);
    const db = Math.abs(b1 - b0);
    const g = dA[0] !== 0 ? box(da, h, db) : box(db, h, da);
    P(g, lx, ly, up, color, opts);
    return [lx, ly, dA[0] !== 0 ? da : db, dA[0] !== 0 ? db : da];
  };
  // A kit placed at (a, b) on the deck, turned by t.
  const at = (geo, pa, pb, up, t, color, opts = {}) => {
    const [lx, ly] = L(pa, pb);
    P(geo, lx, ly, up, color, { ...opts, extra: rot(t) });
  };
  const roofUnder = (v) => TOP - SLOPE * v; // v: metres out from the wall

  // ---- Deck, rim board, lattice skirt over a dark crawl space.
  const g = terrain.groundRange({ rect: { ...worldRect(b, L, -D, LA, -D, 0), angle: a } });
  const g2 = terrain.groundRange({ rect: { ...worldRect(b, L, -D, 0, 0, LB), angle: a } });
  const below = Math.min(-0.3, Math.min(g.min, g2.min) - base - 0.2);
  const strips = [[-D, LA, -D, 0, 0, 0.12], [-D, 0, 0, LB, 0.12, 0]];
  for (const [a0, a1, b0, b1, ia, ib] of strips) {
    bx(a0 - 0.04, a1 + (ib ? 0.04 : 0), b0 - 0.04, b1 + (ia ? 0.04 : 0), FL - 0.09, 0.09, DECK);
    bx(a0 + 0.12, a1 - ib, b0 + 0.12, b1 - ia, below, FL - 0.09 - below, DARK, { cast: false });
    if (A) {
      const r = worldRect(b, L, a0, a1, b0, b1);
      A.rect(b.id, 'porch', r.x, r.y, r.w, r.h, a, base + below, base);
    }
  }
  const pi = 0.1; // posts' line in from the deck edge
  const skirtH = FL - 0.31 - below;
  // Rim board and lattice along the outer edges and the two ends.
  // in: which way is inward from the edge (+1: toward larger a or b).
  const edges = [
    { a0: -D, a1: LA, b: -D, in: 1, along: 'A' },
    { b0: -D, b1: LB, a: -D, in: 1, along: 'B' },
    { b0: -D, b1: 0, a: LA, in: -1, along: 'B' },
    { a0: -D, a1: 0, b: LB, in: -1, along: 'A' },
  ];
  for (const e of edges) {
    if (e.along === 'A') {
      bx(e.a0, e.a1, e.b, e.b + 0.05 * e.in, FL - 0.31, 0.22, TRIM, { cast: false });
      at(latticeGeo(e.a1 - e.a0, skirtH), (e.a0 + e.a1) / 2, e.b + 0.07 * e.in, below, angA, TRIM, { cast: false });
    } else {
      bx(e.a, e.a + 0.05 * e.in, e.b0, e.b1, FL - 0.31, 0.22, TRIM, { cast: false });
      at(latticeGeo(e.b1 - e.b0, skirtH), e.a + 0.07 * e.in, (e.b0 + e.b1) / 2, below, angB, TRIM, { cast: false });
    }
  }

  // ---- Posts, beam, brackets.
  const beamTop = roofUnder(D - pi);
  const beamH = 0.24;
  const postH = beamTop - beamH - FL;
  const post = postGeo(postH);
  const gap = GAP;
  const fill = (from, to, maxStep = 2.6) => {
    const n = Math.max(1, Math.ceil((to - from) / maxStep));
    return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
  };
  const corner = -D + pi;
  const frontPosts = [...new Set([...fill(corner, aDoor - gap), ...fill(aDoor + gap, LA - pi)].map((v) => +v.toFixed(3)))];
  const sidePosts = fill(corner, LB - pi);
  for (const pa of frontPosts) at(post, pa, corner, FL, 0, TRIM);
  for (const pb of sidePosts.slice(1)) at(post, corner, pb, FL, 0, TRIM);
  bx(corner - 0.09, LA, corner - 0.09, corner + 0.09, beamTop - beamH, beamH, TRIM);
  bx(corner - 0.09, corner + 0.09, corner - 0.09, LB, beamTop - beamH, beamH, TRIM);
  const br = bracketGeo();
  for (const pa of frontPosts) {
    for (const s of [-1, 1]) {
      if ((s < 0 && pa <= corner + 0.01) || (s > 0 && pa >= LA - pi - 0.01)) continue;
      at(br, pa + s * 0.075, corner, beamTop - beamH, s > 0 ? angA : angA + Math.PI, TRIM, { cast: false });
    }
  }
  for (const pb of sidePosts) {
    for (const s of [-1, 1]) {
      if ((s < 0 && pb <= corner + 0.01) || (s > 0 && pb >= LB - pi - 0.01)) continue;
      at(br, corner, pb + s * 0.075, beamTop - beamH, s > 0 ? angB : angB + Math.PI, TRIM, { cast: false });
    }
  }

  // ---- Rails between posts (open at the stairs), and from the end posts to the wall.
  const railA = (p0, p1, pb = corner) => {
    const l = p1 - p0 - 0.2;
    if (l > 0.2) at(railGeo(l), (p0 + p1) / 2, pb, FL, angA, TRIM, { cast: false });
  };
  const railB = (p0, p1, pa = corner) => {
    const l = p1 - p0 - 0.2;
    if (l > 0.2) at(railGeo(l), pa, (p0 + p1) / 2, FL, angB, TRIM, { cast: false });
  };
  for (let i = 0; i < frontPosts.length - 1; i++) {
    const p0 = frontPosts[i];
    const p1 = frontPosts[i + 1];
    if (p0 < aDoor && p1 > aDoor) continue;
    railA(p0, p1);
  }
  for (let i = 0; i < sidePosts.length - 1; i++) railB(sidePosts[i], sidePosts[i + 1]);
  railB(corner, 0.1, LA - pi); // the front porch's far end, back to the wall
  railA(corner, 0.1, LB - pi); // the side porch's end, back to the wall

  // ---- Roof: two sloping planes that meet in a hip over the corner, a tin
  // top, a pale blue ceiling, fascia along the edges and boards over the ends.
  const E = D + OVER - pi;
  const endA = LA + 0.25;
  const endB = LB + 0.25;
  const p3 = (pa, pb, up) => {
    const [lx, ly] = L(pa, pb);
    return [lx, up, ly];
  };
  const hAt = (pa, pb) => roofUnder(Math.max(-pa, -pb, 0));
  const faces = [
    [[endA, 0], [0, 0], [-E, -E], [endA, -E]],
    [[0, 0], [0, endB], [-E, endB], [-E, -E]],
  ];
  for (const f of faces) {
    P(poly(f.map(([pa, pb]) => p3(pa, pb, hAt(pa, pb) + ROOF_T)), [0, 1, 0]), 0, 0, 0, PORCH_ROOF);
    P(poly(f.map(([pa, pb]) => p3(pa, pb, hAt(pa, pb))), [0, -1, 0]), 0, 0, 0, CEILING, { cast: false });
  }
  const hE = roofUnder(E);
  bx(-E - 0.04, endA, -E - 0.04, -E + 0.02, hE - 0.12, ROOF_T + 0.16, TRIM, { cast: false });
  bx(-E - 0.04, -E + 0.02, -E - 0.04, endB, hE - 0.12, ROOF_T + 0.16, TRIM, { cast: false });
  // End boards: thin sloped faces closing the roof's ends.
  const n3 = (d) => [d[0], 0, d[1]];
  P(poly([p3(endA, 0, TOP + ROOF_T + 0.04), p3(endA, -E, hE + ROOF_T + 0.04), p3(endA, -E, hE - 0.12), p3(endA, 0, TOP - 0.12)], n3(dA)), 0, 0, 0, TRIM, { cast: false });
  P(poly([p3(0, endB, TOP + ROOF_T + 0.04), p3(-E, endB, hE + ROOF_T + 0.04), p3(-E, endB, hE - 0.12), p3(0, endB, TOP - 0.12)], n3(dB)), 0, 0, 0, TRIM, { cast: false });
  // Ledger board where the roof meets the walls.
  bx(0, endA, -0.06, 0, TOP - 0.14, 0.14, TRIM, { cast: false });
  bx(-0.06, 0, 0, endB, TOP - 0.14, 0.14, TRIM, { cast: false });

  // ---- Steps down from the opening at the door, handrails to newel posts.
  const sw = STAIR;
  const tread = TREAD;
  const nSteps = STEPS;
  for (let k = 1; k <= nSteps; k++) {
    const top = (FL * (nSteps + 1 - k)) / (nSteps + 1);
    const b0 = -D - tread * k;
    bx(aDoor - sw / 2, aDoor + sw / 2, b0 - 0.03, b0 + tread, top - 0.05, 0.05, DECK);
    bx(aDoor - sw / 2 + 0.02, aDoor + sw / 2 - 0.02, b0, b0 + tread, below, top - 0.05 - below, TRIM, { cast: false });
    if (A) {
      const r = worldRect(b, L, aDoor - sw / 2, aDoor + sw / 2, b0, b0 + tread);
      A.rect(b.id, 'porch_steps', r.x, r.y, r.w, r.h, a, base + below, base);
    }
  }
  const bFoot = -D - tread * nSteps + 0.08;
  for (const s of [-1, 1]) {
    const pa = aDoor + s * (gap - 0.02);
    at(postGeo(0.95), pa, bFoot, 0, 0, TRIM, { cast: false });
    const v = (pb, up) => { const [lx, ly] = L(pa, pb); return new THREE.Vector3(lx, up, ly); };
    P(strut(v(corner, FL + 0.9), v(bFoot, 0.95), 0.035, 6), 0, 0, 0, TRIM, { cast: false });
    if (A) {
      const [wx, wy] = toWorld(b, L(pa, bFoot));
      A.rect(b.id, 'porch_newel', wx, wy, 0.26, 0.26, a, base, base);
    }
  }

  // ---- Doors and windows. The front door opens onto the porch.
  const door = doorGeo();
  for (const [geo, color] of door) P(geo, doorL[0], doorL[1], FL, color, { extra: rot(FACE[front]), cast: false });
  for (const k of ['n', 's', 'e', 'w']) {
    const l = len(k);
    const n = Math.max(1, Math.floor(l / 3.5));
    for (let f = 0; f < 2; f++) {
      for (let i = 0; i < n; i++) {
        const t = -l / 2 + (l * (i + 0.5)) / n;
        if (k === front && f === 0 && i === Math.floor(n / 2)) continue; // the door
        const lx = k === 'n' || k === 's' ? t : NORMAL[k][0] * b.w / 2;
        const ly = k === 'n' || k === 's' ? NORMAL[k][1] * b.h / 2 : t;
        const kitParts = f === 0 ? windowGeo(0.95, 1.4, true) : windowGeo(0.95, 1.25, true);
        for (const [geo, color] of kitParts) P(geo, lx, ly, f === 0 ? 1.0 : 3.85, color, { extra: rot(FACE[k]), cast: false });
      }
    }
  }
  // A small attic window in each gable end.
  for (const s of [-1, 1]) {
    const k = alongX ? (s < 0 ? 'w' : 'e') : (s < 0 ? 'n' : 's');
    const lx = alongX ? s * b.w / 2 : 0;
    const ly = alongX ? 0 : s * b.h / 2;
    for (const [geo, color] of windowGeo(0.6, 0.8, false)) P(geo, lx, ly, wallH + 0.7, color, { extra: rot(FACE[k]), cast: false });
  }

  // ---- On the porch: a doormat, two potted plants by the steps, a rocking
  // chair by the door, and a swing on the side porch.
  at(box(0.9, 0.02, 0.5), aDoor, -0.4, FL, angA, MAT, { cast: false });
  for (const s of [-1, 1]) {
    const pa = aDoor + s * (gap + 0.35);
    at(cyl(0.16, 0.3, 8, 0.2), pa, -D + 0.45, FL, 0, POT);
    at(new THREE.IcosahedronGeometry(0.26, 0).scale(1, 0.8, 1), pa, -D + 0.45, FL + 0.45, s, LEAF);
  }
  const chairA = aDoor + gap + 1.5 < LA - 1 ? aDoor + gap + 1.5 : aDoor - gap - 1.5;
  at(rockerGeo(), chairA, -D * 0.5, FL, FACE[front] + 0.35, CHAIR);
  const swingB = Math.min(LB - 1.2, Math.max(1.0, LB * 0.55));
  const drop = roofUnder(D * 0.45) - FL;
  for (const [geo, color] of swingGeo(drop)) at(geo, -D * 0.45, swingB, FL, FACE[wrap], color, { cast: color !== IRON });
}

// Where the porch goes on house b. sides: each side's distance to the
// nearest road. The front is the side nearest the road (ties go n, s, e, w,
// as roadSide() in structures.js picks the door side); the porch turns the
// corner onto the neighbouring side nearer the road.
// Porch coordinates (a, b): a runs along the front wall from the corner it
// wraps round, b along the side wall from that corner; out from the walls
// is negative. L(a, b) gives the house's local [x, y].
// rects: what stands on the ground, as [a0, a1, b0, b1]: the two deck strips and the steps.
export function porchPlan(b, sides) {
  const len = (k) => (k === 'n' || k === 's' ? b.w : b.h);
  const half = (k) => (k === 'n' || k === 's' ? b.h / 2 : b.w / 2);
  let front = 'n';
  for (const k of ['n', 's', 'e', 'w']) if (sides[k] < sides[front]) front = k;
  const [k1, k2] = NEXT[front];
  const wrap = sides[k1] <= sides[k2] ? k1 : k2;
  const nF = NORMAL[front];
  const nW = NORMAL[wrap];
  const C = [nF[0] * half(front) + nW[0] * half(wrap), nF[1] * half(front) + nW[1] * half(wrap)];
  const dA = [-nW[0], -nW[1]]; // along the front wall, away from the corner
  const dB = [-nF[0], -nF[1]]; // along the side wall, away from the corner
  const LA = len(front);
  const LB = len(wrap) * 0.62;
  const L = (pa, pb) => [C[0] + pa * dA[0] + pb * dB[0], C[1] + pa * dA[1] + pb * dB[1]];
  // The door: the middle window slot of the front wall (as other houses place it).
  const nSlots = Math.max(1, Math.floor(LA / 3.5));
  const tDoor = -LA / 2 + (LA * (Math.floor(nSlots / 2) + 0.5)) / nSlots;
  const doorL = front === 'n' || front === 's' ? [tDoor, nF[1] * b.h / 2] : [nF[0] * b.w / 2, tDoor];
  const aDoor = (doorL[0] - C[0]) * dA[0] + (doorL[1] - C[1]) * dA[1];
  const rects = [[-D, LA, -D, 0], [-D, 0, 0, LB], [aDoor - STAIR / 2, aDoor + STAIR / 2, -D - TREAD * STEPS, -D]];
  return { front, wrap, nF, C, dA, dB, LA, LB, L, doorL, aDoor, rects };
}

// The world rectangles (centre, size, the house's angle) of a plan's rects.
export function porchFootprint(b, plan) {
  return plan.rects.map(([a0, a1, b0, b1]) => ({ ...worldRect(b, plan.L, a0, a1, b0, b1), angle: b.angle || 0 }));
}

function toWorld(b, [lx, ly]) {
  const p = localToWorld(b.x, b.y, b.angle || 0, lx, ly);
  return [p.x, p.y];
}

// The world rectangle (centre and size in the house's turned frame) over a porch (a, b) rectangle.
function worldRect(b, L, a0, a1, b0, b1) {
  const p = L(a0, b0);
  const q = L(a1, b1);
  const [x, y] = toWorld(b, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  return { x, y, w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
}
