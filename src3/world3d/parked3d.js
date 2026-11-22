// Parked vehicles in 3D (#47): each entry of src/world/parked.js is built by
// the builder of its kind, on the player car's atlas (caratlas.js) with the
// same trim builder and tyres as the fine traffic bodies (trafficfine.js).
// Paint is a vertex colour (the atlas paint swatch tinted per vehicle), with
// road dirt baked low on the body. Each vehicle is one THREE.LOD: the fine
// body near, a plain stand-in past NEAR_M, so one draw call per vehicle in
// view (plus its shadow).
//
//   createParked3D(scene, { list, terrain, env })   // env: PMREM texture or null
//
// Add a kind: a footprint in PARKED_KINDS (src/world/parked.js) and one line
// in BUILDERS below: kind -> (p, A) => { near: BufferGeometry, far: BufferGeometry },
// both on the atlas, nose toward -z, wheels on y = 0.

import * as THREE from 'three';
import { carAtlas } from './caratlas.js';
import { trimBuilder } from './car3d.js';
import { wheelInto } from './trafficfine.js';
import { DEG } from '../../src/drive/geom.js';
import { PARKED_KINDS } from '../../src/world/parked.js';

const NEAR_M = 70; // past this, the stand-in

// A side profile ([z, y] points) extruded w across x, its edges rounded by b
// (the outline stays where the points are).
function profile(pts, w, b, segs = 2) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.002, w - 2 * b);
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: segs, curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape x -> z, extrusion -> x
  return g;
}
const at = (g, x, y = 0, z = 0) => g.translate(x, y, z);

// Fender over a wheel at (zc, r): a skirt with the arch cut out, from z0
// (front) to z1 (rear), top at y1, bottom at y0.
function fenderPts(zc, r, R, z0, z1, y0, y1) {
  const dy = y0 - r;
  const dz = Math.sqrt(Math.max(0, R * R - dy * dy));
  const a0 = Math.atan2(dy, -dz);
  const a1 = Math.atan2(dy, dz);
  const pts = [[z1, y0], [z1, y1 - 0.2], [z1 - 0.4, y1], [z0 + 0.5, y1], [z0, y1 - 0.25], [z0, y0], [zc - dz, y0]];
  const n = 12;
  for (let i = 1; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / n; // over the top
    pts.push([zc + Math.cos(a) * R, r + Math.sin(a) * R]);
  }
  pts.push([zc + dz, y0]);
  return pts;
}

// Half-cylinder liner inside a wheel arch (inside faces, as trafficfine.js).
function linerInto(T, R, w, x, y, z) {
  const n = new THREE.CylinderGeometry(R, R, w, 12, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).toNonIndexed();
  const p = n.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
  T.geo(n.translate(x, y, z), 'liner');
}

// A wheel with a wide truck tyre (two tyre shells side by side).
function truckWheel(T, A, r, x, z, side) {
  wheelInto(T, A, r, x - side * 0.09, r, z, side);
  wheelInto(T, A, r, x, r, z, side);
}
// Dual wheels on one side of an axle: outer at x, inner 0.22 m in.
function duals(T, A, r, x, z, side) {
  wheelInto(T, A, r, x - side * 0.22, r, z, side);
  wheelInto(T, A, r, x, r, z, side);
}

function flapInto(T, A, x, y, z) {
  const f = A.rect('flap', 1);
  T.boxM(new THREE.Matrix4().makeTranslation(x, y, z), 0.6, 0.62, 0.02, ['rubber', 'rubber', 'rubber', 'rubber', f, f]);
}

// ---------- semi ----------
// A long-nose tractor (our own design: sloped hood, swept fenders, round air
// cleaners, twin stacks, a short sleeper) and a hopper or flatbed trailer.
// About 15.2 m nose to tail, z from -7.6 (nose) to 7.6.
const SEMI = {
  r: 0.52, // wheel radius
  steer: -6.0,
  drive: [-1.55, -0.3],
  trailer: [5.6, 6.85],
  half: 1.15, // cab half width
};

function semiTractor(T, A) {
  const S = SEMI;
  const r = S.r;
  // Frame rails, the bumper, the hood with a crown.
  for (const x of [-0.45, 0.45]) T.box(x, 0.95, -3.3, 0.12, 0.28, 7.8, 'black');
  T.geo(profile([[-7.62, 0.45], [-7.62, 0.8], [-7.3, 0.82], [-7.3, 0.45]], 2.45, 0.05), 'chrome');
  T.geo(profile([[-7.4, 0.85], [-7.4, 1.95], [-7.25, 2.06], [-4.75, 2.22], [-4.75, 0.85]], 1.56, 0.1, 3), 'tpaint');
  // Grille: a chrome surround, three rows of the grille picture, an emblem.
  T.box(0, 1.42, -7.41, 1.2, 1.06, 0.04, 'chrome');
  for (const y of [1.1, 1.42, 1.74]) T.pic([0, y, -7.435], [-1, 0, 0], [0, 1, 0], 1.08, 0.3, A.rect('grille', 1));
  T.box(0, 2.0, -7.3, 0.36, 0.05, 0.06, 'chrome');
  // Swept fenders over the steer wheels, liners, headlamps in the fender fronts.
  for (const s of [-1, 1]) {
    const x = s * 0.99;
    T.geo(at(profile(fenderPts(S.steer, r, 0.66, -7.32, -4.75, 0.62, 1.5), 0.5, 0.06, 2), x), 'tpaint');
    linerInto(T, 0.64, 0.46, x, r, S.steer);
    T.box(x, 1.12, -7.33, 0.38, 0.26, 0.03, 'chrome');
    T.pic([x, 1.12, -7.35], [-1, 0, 0], [0, 1, 0], 0.32, 0.2, A.rect('head', 1));
    T.pic([s * 1.245, 1.3, -7.0], [0, 0, -s], [0, 1, 0], 0.16, 0.06, A.rect('indicator', 1));
    // Air cleaner by the cowl, on a bracket.
    T.geo(new THREE.CylinderGeometry(0.21, 0.21, 0.8, 14).translate(s * 0.96, 1.92, -4.95), 'chrome');
    T.geo(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14).translate(s * 0.96, 2.33, -4.95), 'satin');
    T.box(s * 0.85, 1.6, -4.95, 0.22, 0.06, 0.08, 'black');
  }
  // Cab with a short sleeper.
  T.geo(profile([[-4.76, 0.95], [-4.76, 2.24], [-4.46, 3.12], [-1.62, 3.2], [-1.38, 2.98], [-1.38, 0.95]], S.half * 2, 0.09, 3), 'tpaint');
  // Windscreen in two panes with a centre post, a sun visor, roof lamps.
  const ws = [0, 2.68, -4.61];
  const up = new THREE.Vector3(0, 0.84, 0.29).normalize();
  const n = [0, 0.33, -0.95];
  for (const s of [-1, 1]) T.pic([s * 0.5 + n[0] * 0.012, ws[1] + n[1] * 0.012, ws[2] + n[2] * 0.012], [-1, 0, 0], [up.x, up.y, up.z], 0.92, 0.8, [...A.sw('tglass'), ...A.sw('tglass')]);
  T.box(0, ws[1], ws[2] - 0.005, 0.07, 0.82, 0.03, 'black', Math.atan2(0.29, 0.84));
  T.box(0, 3.16, -4.6, 2.2, 0.05, 0.4, 'black', 0.12);
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) T.box(x, 3.22, -4.35, 0.12, 0.05, 0.06, 'amber');
  // Doors: windows, shut lines, handles, grab bars, steps, mirrors.
  for (const s of [-1, 1]) {
    const x = s * (S.half + 0.003);
    const r = [0, 0, -s];
    T.pic([s * (S.half + 0.004), 2.62, -3.68], r, [0, 1, 0], 1.12, 0.68, [...A.sw('black'), ...A.sw('black')]);
    T.pic([s * (S.half + 0.008), 2.62, -3.68], r, [0, 1, 0], 1.04, 0.6, [...A.sw('tglass'), ...A.sw('tglass')]);
    T.pic([s * (S.half + 0.008), 2.55, -2.05], r, [0, 1, 0], 0.5, 0.32, [...A.sw('tglass'), ...A.sw('tglass')]);
    T.box(x, 1.95, -4.3, 0.008, 1.95, 0.012, 'gap');
    T.box(x, 1.95, -2.95, 0.008, 1.95, 0.012, 'gap');
    T.box(x, 1.0, -3.62, 0.008, 0.012, 1.35, 'gap');
    T.box(s * (S.half + 0.02), 2.12, -3.12, 0.03, 0.04, 0.16, 'chrome');
    T.rod([s * (S.half + 0.04), 1.3, -2.85], [s * (S.half + 0.04), 2.6, -2.85], 0.035, 0.035, 'chrome');
    T.rod([s * (S.half + 0.04), 1.4, -4.42], [s * (S.half + 0.04), 2.2, -4.42], 0.035, 0.035, 'chrome');
    for (const [y, out] of [[0.45, 0.12], [0.78, 0.06]]) T.geo(at(profile([[-4.25, -0.03], [-4.25, 0.03], [-3.45, 0.03], [-3.45, -0.03]], 0.32, 0.015), s * (S.half - 0.12 + out), y), 'alu');
    T.box(s * (S.half - 0.12), 0.62, -3.85, 0.04, 0.4, 0.8, 'black');
    // Fuel tank with straps, behind the steps.
    T.geo(new THREE.CylinderGeometry(0.33, 0.33, 1.4, 16).rotateX(Math.PI / 2).translate(s * 0.86, 0.72, -2.65), 'alu');
    for (const z of [-3.15, -2.15]) T.geo(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16).rotateX(Math.PI / 2).translate(s * 0.86, 0.72, z), 'black');
    // West coast mirror on two arms.
    T.rod([s * S.half, 2.3, -4.38], [s * 1.48, 2.3, -4.5], 0.025, 0.025, 'chrome');
    T.rod([s * S.half, 2.85, -4.38], [s * 1.48, 2.85, -4.5], 0.025, 0.025, 'chrome');
    T.box(s * 1.49, 2.58, -4.5, 0.1, 0.56, 0.16, 'black');
    T.pic([s * 1.49, 2.58, -4.42], [s, 0, 0], [0, 1, 0], 0.08, 0.5, [...A.sw('mirror'), ...A.sw('mirror')]);
    // Twin stacks behind the cab with heat shields and angled tips.
    T.geo(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 12).translate(s * 0.98, 2.45, -1.2), 'chrome');
    T.geo(new THREE.CylinderGeometry(0.115, 0.115, 1.0, 12).translate(s * 0.98, 2.2, -1.2), 'steel');
    T.geo(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12).rotateX(0.5).translate(s * 0.98, 4.02, -1.25), 'chrome');
    T.box(s * 0.98, 1.6, -1.3, 0.06, 0.06, 0.2, 'black');
  }
  // Wheels: wide singles in front, duals on the tandem drive axles, quarter
  // fenders and mud flaps behind.
  for (const s of [-1, 1]) {
    truckWheel(T, A, r, s * 1.0, S.steer, s);
    for (const z of S.drive) duals(T, A, r, s * 1.02, z, s);
    T.geo(at(profile([[-2.3, 1.1], [-2.3, 1.16], [0.45, 1.16], [0.45, 1.1]], 0.66, 0.02), s * 0.92), 'black');
    flapInto(T, A, s * 0.92, 0.62, 0.5);
  }
  // Fifth wheel and the frame end.
  T.box(0, 1.15, -0.9, 1.1, 0.12, 1.0, 'black');
  T.box(0, 0.95, 0.42, 1.0, 0.2, 0.08, 'black');
}

// Landing legs, the trailer axles with duals, flaps, ICC bar, lamps, plate.
function trailerRunning(T, A) {
  const S = SEMI;
  for (const s of [-1, 1]) {
    T.box(s * 0.72, 0.85, 0.1, 0.12, 1.0, 0.12, 'black');
    T.box(s * 0.72, 0.05, 0.1, 0.3, 0.06, 0.3, 'black');
    for (const z of S.trailer) duals(T, A, S.r, s * 1.02, z, s);
    flapInto(T, A, s * 0.92, 0.62, 7.4);
    T.box(s * 0.45, 0.62, 7.42, 0.08, 0.55, 0.08, 'steel');
    T.pic([s * 1.25, 1.25, 7.3], [0, 0, -s], [0, 1, 0], 0.12, 0.06, A.rect('tail', 1));
    T.pic([s * 1.25, 1.25, -1.5], [0, 0, -s], [0, 1, 0], 0.12, 0.06, A.rect('indicator', 1));
  }
  T.box(0, 1.2, 6.2, 1.0, 0.25, 2.8, 'black'); // running gear sub-frame
  for (const z of S.trailer) T.geo(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 8).rotateZ(Math.PI / 2).translate(0, S.r, z), 'black');
  T.box(0, 0.36, 7.42, 2.2, 0.12, 0.1, 'steel');
  T.box(0, 1.25, 7.58, 2.3, 0.18, 0.04, 'black');
  const tr = A.rect('tail', 1);
  for (const s of [-1, 1]) T.pic([s * 0.95, 1.25, 7.605], [1, 0, 0], [0, 1, 0], 0.3, 0.13, s > 0 ? tr : [tr[2], tr[1], tr[0], tr[3]]);
  T.pic([0, 0.9, 7.48], [1, 0, 0], [0, 1, 0], 0.32, 0.16, A.rect('plate', 2));
}

// Hopper trailer: tall aluminium sides that dip into two hoppers, ribs, a
// black roll tarp, gates under the hoppers.
function grainTrailer(T, A) {
  T.geo(profile([[-1.75, 1.35], [-1.75, 2.9], [-1.62, 2.98], [7.45, 2.98], [7.58, 2.9], [7.58, 1.35], [5.3, 1.35], [4.72, 0.74], [4.0, 0.74],
    [3.42, 1.35], [2.72, 1.35], [2.14, 0.74], [1.42, 0.74], [0.84, 1.35]], 2.5, 0.05), 'alu');
  for (const s of [-1, 1]) {
    for (let z = -1.4; z <= 7.3; z += 0.72) T.box(s * 1.255, 2.2, z, 0.03, 1.4, 0.06, 'steel');
    T.box(s * 1.26, 2.97, 2.9, 0.05, 0.06, 9.3, 'steel');
    T.box(s * 1.26, 1.38, 2.9, 0.05, 0.08, 9.3, 'satin');
  }
  T.box(0, 3.0, 2.92, 2.42, 0.05, 9.25, 'black');
  T.geo(new THREE.CylinderGeometry(0.08, 0.08, 9.2, 10).rotateX(Math.PI / 2).translate(1.12, 3.06, 2.92), 'black');
  for (const z of [1.78, 4.36]) T.box(0, 0.68, z, 0.9, 0.12, 0.62, 'black');
  for (const y of [1.6, 1.95, 2.3, 2.65]) T.box(0.6, y, -1.77, 0.4, 0.03, 0.03, 'black');
  for (const x of [0.42, 0.78]) T.box(x, 2.15, -1.77, 0.03, 1.3, 0.03, 'black');
  trailerRunning(T, A);
}

// Flatbed with a plank deck, tapered beams, stake pockets, six tarped pallets
// of seed strapped down and a bundle of lumber at the back.
function flatbedTrailer(T, A) {
  T.box(0, 1.47, 2.92, 2.55, 0.06, 9.3, 'plank');
  for (const s of [-1, 1]) {
    T.geo(at(profile([[-1.75, 1.44], [-1.75, 1.22], [0.4, 0.98], [4.9, 0.98], [5.3, 1.2], [7.58, 1.2], [7.58, 1.44]], 0.14, 0.02), s * 0.5), 'black');
    T.box(s * 1.28, 1.42, 2.92, 0.05, 0.12, 9.3, 'alu');
    for (let z = -1.5; z <= 7.4; z += 0.62) T.box(s * 1.29, 1.32, z, 0.06, 0.1, 0.08, 'black');
  }
  for (const z of [-1.15, 0.0, 1.15, 2.3]) {
    for (const x of [-0.62, 0.62]) {
      T.box(x, 1.57, z, 1.15, 0.14, 1.1, 'plank');
      T.geo(at(profile([[z - 0.52, 1.64], [z - 0.52, 2.6], [z + 0.52, 2.6], [z + 0.52, 1.64]], 1.12, 0.1, 3), x), 'tarp');
    }
    // Strap over the row, tensioned by a winch under the rail.
    const pts = [[-1.3, 1.45], [-1.22, 2.62], [1.22, 2.62], [1.3, 1.45]];
    for (let i = 0; i < 3; i++) T.rod([pts[i][0], pts[i][1] + 0.01, z], [pts[i + 1][0], pts[i + 1][1] + 0.01, z], 0.05, 0.012, 'strap');
    for (const s of [-1, 1]) T.box(s * 1.2, 1.25, z, 0.12, 0.14, 0.18, 'black');
  }
  // Lumber: stacked boards, darker end grain, two straps.
  const lz = 5.55;
  T.box(0, 1.85, lz, 2.3, 0.7, 3.4, 'plank');
  for (let y = 1.58; y < 2.2; y += 0.12) for (const s of [-1, 1]) T.box(0, y, lz + s * 1.702, 2.28, 0.01, 0.004, 'plankDark');
  for (const z of [lz - 1.1, lz + 1.1]) {
    T.rod([-1.3, 1.46, z], [-1.16, 2.21, z], 0.05, 0.012, 'strap');
    T.rod([-1.16, 2.21, z], [1.16, 2.21, z], 0.05, 0.012, 'strap');
    T.rod([1.16, 2.21, z], [1.3, 1.46, z], 0.05, 0.012, 'strap');
  }
  trailerRunning(T, A);
}

// Far stand-in: hood, cab, trailer and plain wheels.
function semiFar(p, A) {
  const T = trimBuilder(A);
  const S = SEMI;
  T.box(0, 1.5, -6.05, 1.56, 1.3, 2.7, 'tpaint');
  T.box(0, 1.0, -7.45, 2.45, 0.35, 0.2, 'chrome');
  T.box(0, 2.07, -3.07, S.half * 2, 2.25, 3.38, 'tpaint');
  T.box(0, 2.68, -4.77, 2.0, 0.75, 0.02, 'tglass');
  for (const s of [-1, 1]) T.box(s * 0.99, 1.1, -6.05, 0.5, 0.75, 2.5, 'tpaint');
  if (p.trailer === 'flatbed') {
    T.box(0, 1.3, 2.92, 2.55, 0.35, 9.3, 'black');
    T.box(0, 2.1, 0.58, 2.3, 1.0, 4.5, 'tarp');
    T.box(0, 1.85, 5.55, 2.3, 0.7, 3.4, 'plank');
  } else {
    T.box(0, 2.16, 2.92, 2.5, 1.62, 9.3, 'alu');
    T.box(0, 1.05, 2.92, 1.8, 0.6, 3.8, 'alu');
  }
  const wheels = [[S.steer, 1.0], ...S.drive.map((z) => [z, 0.9]), ...S.trailer.map((z) => [z, 0.9])];
  for (const [z, x] of wheels) T.geo(new THREE.CylinderGeometry(S.r, S.r, x === 1.0 ? 0.32 : 0.55, 8).rotateZ(Math.PI / 2).translate(x, S.r, z), 'rubber');
  for (const [z, x] of wheels) T.geo(new THREE.CylinderGeometry(S.r, S.r, x === 1.0 ? 0.32 : 0.55, 8).rotateZ(Math.PI / 2).translate(-x, S.r, z), 'rubber');
  return T.build();
}

function semi(p, A) {
  const T = trimBuilder(A);
  semiTractor(T, A);
  if (p.trailer === 'flatbed') flatbedTrailer(T, A);
  else grainTrailer(T, A);
  return { near: T.build(), far: semiFar(p, A) };
}

// The builder registry: one line per kind.
const BUILDERS = {
  semi,
};

// Vertex colours: the paint swatch takes the vehicle's colour, the rest stays
// white; then road dirt low down (as the traffic's dirt, baked).
function paintAndDirt(g, A, color, dirt) {
  const [pu, pv] = A.sw('tpaint');
  const uv = g.attributes.uv.array;
  const pos = g.attributes.position.array;
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const base = new THREE.Color(0xdddddd); // the swatch's own gray, undone
  const tint = [c.r / base.r, c.g / base.g, c.b / base.b];
  const mud = [0.36, 0.29, 0.2];
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const paint = Math.abs(uv[i * 2] - pu) < 1e-6 && Math.abs(uv[i * 2 + 1] - pv) < 1e-6;
    const y = pos[i * 3 + 1];
    const x = pos[i * 3];
    const z = pos[i * 3 + 2];
    const wob = 0.8 + 0.2 * Math.sin(x * 9 + z * 3.1) * Math.sin(z * 6.3 + y * 11);
    const t = Math.min(1, Math.max(0, (1.25 - y) / 0.9));
    const k = Math.min(0.75, dirt * t * t * (3 - 2 * t) * wob);
    for (let j = 0; j < 3; j++) {
      const v = paint ? tint[j] : 1;
      col[i * 3 + j] = v * (1 - k) + (mud[j] / 0.85) * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function makeMaterial(A, env) {
  if (!env) return new THREE.MeshLambertMaterial({ map: A.map, vertexColors: true });
  return new THREE.MeshStandardMaterial({
    map: A.map, roughnessMap: A.mr, metalnessMap: A.mr, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 1.1,
    emissiveMap: A.emissive, emissive: 0xffffff, emissiveIntensity: 0.15, vertexColors: true,
  });
}

export function createParked3D(scene, { list, terrain, env = null }) {
  const group = new THREE.Group();
  group.name = 'parked';
  const A = carAtlas();
  const mat = makeMaterial(A, env);
  for (const p of list) {
    const build = BUILDERS[p.kind];
    const k = PARKED_KINDS[p.kind];
    if (!build || !k) continue;
    const { near, far } = build(p, A);
    const lod = new THREE.LOD();
    for (const [g, d] of [[near, 0], [far, NEAR_M]]) {
      paintAndDirt(g, A, p.color ?? 0xb0b0b0, p.dirt ?? 0.35);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      lod.addLevel(m, d);
    }
    const ground = terrain.groundRange({ rect: { x: p.x, y: p.y, w: k.w, h: k.len, angle: p.heading || 0 } });
    lod.position.set(p.x, ground.max + (p.lift || 0), p.y);
    lod.rotation.y = -(p.heading || 0) * DEG;
    lod.name = p.id;
    group.add(lod);
  }
  scene.add(group);
  return { group };
}
