// The boxy old 4x4 in 3D (#44): a coarse body for traffic past about 40 m
// and a fine one for close up, both on the loft spec in fourbyfour.js.
// Upright body with soft edges, short overhangs, round headlamps in a black
// grille panel, steel bumpers, black flared arches over big chunky tires,
// side steps, mirrors on arms, a square back with the spare on the door.
// Kit pieces (rack, cans, roof spare, bull bar, flaps) come from
// trafficKit.js like the other types.
//
// The helpers come from the callers (traffic3d.js, trafficfine.js), so
// there is one copy of each and no import loop:
//   fourByFourCoarse({ loftShell, tag, box, quadZ, wheel, coarseKit })
//   fourByFourFine({ fineShell, trimPart, stripsFor, wheelInto, fineKit })

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carAtlas } from './caratlas.js';
import { trimBuilder } from './car3d.js';
import { FOURBYFOUR as S, FOUR } from './fourbyfour.js';

const half = S.half;
const hw = S.hw;
const WHEEL_X = hw - 0.09; // tire middle: the tread sits just inside the flares
const FLARE_R = S.archR + 0.035;
const FLARE_A = [0.28, Math.PI - 0.28]; // from the sill up over the wheel and back down

// Points along an arch flare: [y, z] for angle a (0 rear, pi front).
const flareAt = (wz, a, r = FLARE_R) => [S.wheelY + r * Math.sin(a), wz + r * Math.cos(a)];

export function fourByFourCoarse(h) {
  const parts = h.loftShell(S);
  const sp = FOUR.spare;
  // Front: grille panel, square lamps (round ones are on the fine body), bumpers, plates.
  parts.push(h.quadZ(hw * 2 - 0.22, 0.26, 0, FOUR.headY, -half - 0.012, 'black'));
  for (const x of [-1, 1]) parts.push(h.quadZ(0.2, 0.2, x * FOUR.headX, FOUR.headY, -half - 0.016, 'head'));
  for (const s of [-1, 1]) {
    parts.push(h.box(hw * 2 + 0.04, 0.2, 0.16, 0, FOUR.bumperY, s * (half + FOUR.bumperZ), 'satin'));
    parts.push(h.quadZ(0.3, 0.15, 0, FOUR.bumperY, s * (half + FOUR.bumperZ + 0.082), 'plate'));
  }
  // Back: the door window, tail lamps, the spare on the door.
  parts.push(h.quadZ(1.22, 0.48, 0, 1.57, half + 0.012, 'glass'));
  for (const x of [-1, 1]) parts.push(h.quadZ(0.15, 0.3, x * (hw - 0.13), FOUR.tailY, half + 0.012, 'tail'));
  for (const g of h.wheel(S.wheelR, FOUR.tyreW, 0, 0, 0)) parts.push(g.rotateY(-Math.PI / 2).translate(sp.x, sp.y, sp.z));
  // Sides: flares (a few straight pieces), side steps, mirrors on arms.
  for (const [wz] of S.wheels) for (const x of [-1, 1]) {
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a0 = FLARE_A[0] + ((FLARE_A[1] - FLARE_A[0]) * k) / n;
      const a1 = FLARE_A[0] + ((FLARE_A[1] - FLARE_A[0]) * (k + 1)) / n;
      const [y0, z0] = flareAt(wz, a0);
      const [y1, z1] = flareAt(wz, a1);
      const len = Math.hypot(y1 - y0, z1 - z0);
      const g = new THREE.BoxGeometry(0.08, 0.1, len + 0.02).rotateX(-Math.atan2(y1 - y0, z1 - z0)).translate(x * (hw + 0.02), (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push(h.tag(g, 'black'));
    }
  }
  const s0 = S.wheels[0][0] + S.archR + 0.08;
  const s1 = S.wheels[1][0] - S.archR - 0.08;
  for (const x of [-1, 1]) {
    parts.push(h.box(0.14, 0.05, s1 - s0, x * (hw - 0.01), 0.47, (s0 + s1) / 2, 'black'));
    parts.push(h.box(0.05, 0.2, 0.14, x * (hw + 0.12), S.belt(S.zA + 0.2) + 0.16, S.zA + 0.2, 'black'));
  }
  for (const [z] of S.wheels) for (const x of [-1, 1]) parts.push(...h.wheel(S.wheelR, FOUR.tyreW, x * WHEEL_X, S.wheelR, z, 12));
  parts.push(...h.coarseKit('fourbyfour'));
  return mergeGeometries(parts);
}

// A road wheel from the shared wheelInto, made wider (w) and placed by place(g).
function wheelAt(T, A, wheelInto, w, place) {
  const W = trimBuilder(A);
  wheelInto(W, A, S.wheelR, 0, 0, 0, 1);
  const g = W.build();
  g.scale(w / 0.204, 1, 1);
  place(g);
  T.geo(g, null, [0, 1, 1, 0]); // keep the uvs as they are
}

// Chunky tread blocks, two staggered rows, and a plain steel wheel with nuts.
function chunky(T, x, y, z, side, w) {
  const n = 14;
  const r = S.wheelR + 0.002;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < n; k++) {
      const a = ((k + row * 0.5) / n) * Math.PI * 2;
      const dx = (row ? 1 : -1) * w * 0.24;
      T.box(x + dx, y + r * Math.cos(a), z + r * Math.sin(a), w * 0.44, 0.028, 0.1, 'rubber', a);
    }
  }
  const fx = x + side * (w / 2 + 0.006);
  T.geo(new THREE.CircleGeometry(0.25, 16).rotateY(side * Math.PI / 2).translate(fx, y, z), 'steel');
  T.geo(new THREE.CircleGeometry(0.075, 10).rotateY(side * Math.PI / 2).translate(fx + side * 0.012, y, z), 'chrome');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    T.box(fx + side * 0.008, y + 0.13 * Math.cos(a), z + 0.13 * Math.sin(a), 0.016, 0.028, 0.028, 'black');
  }
}

export function fourByFourFine(h) {
  const A = carAtlas();
  const { parts, T } = h.fineShell(S, A, 1);
  h.stripsFor(S, T, A);
  const sp = FOUR.spare;
  const fz = -half - 0.008;
  const rz = half + 0.008;
  // Front: a black grille panel, the grille, round headlamps in chrome rings,
  // indicators under them.
  T.box(0, FOUR.headY - 0.01, fz - 0.005, hw * 2 - 0.22, 0.26, 0.02, 'black');
  T.pic([0, FOUR.headY - 0.01, fz - 0.017], [-1, 0, 0], [0, 1, 0], 2 * (FOUR.headX - 0.16), 0.2, A.rect('grille', 1));
  const hr = FOUR.headR;
  for (const x of [-1, 1]) {
    const lx = x * FOUR.headX;
    T.geo(new THREE.CylinderGeometry(hr + 0.022, hr + 0.026, 0.05, 16, 1, true).rotateX(Math.PI / 2).translate(lx, FOUR.headY, fz - 0.03), 'chrome');
    T.geo(new THREE.CircleGeometry(hr, 16).rotateY(Math.PI).translate(lx, FOUR.headY, fz - 0.045), null, A.rect('head', 1));
    T.pic([x * (hw - 0.2), 0.77, fz - 0.016], [-1, 0, 0], [0, 1, 0], 0.15, 0.055, A.rect('indicator', 1));
  }
  // Steel bumpers with angled ends, plates, tow hooks, frame horns.
  for (const s of [-1, 1]) {
    const z = s * (half + FOUR.bumperZ);
    T.box(0, FOUR.bumperY, z, hw * 2 - 0.16, 0.2, 0.15, 'satin');
    T.box(0, FOUR.bumperY - 0.06, z + s * 0.004, hw * 2 - 0.14, 0.025, 0.152, 'black');
    for (const x of [-1, 1]) {
      T.box(x * (hw - 0.02), FOUR.bumperY, z - s * 0.05, 0.2, 0.2, 0.13, 'satin', 0, -x * s * 0.5, 0);
      T.box(x * 0.45, FOUR.bumperY, s * (half - 0.02), 0.1, 0.12, 0.2, 'black');
      T.box(x * 0.62, FOUR.bumperY - 0.12, z + s * 0.03, 0.04, 0.06, 0.1, 'steel');
    }
    T.pic([0, FOUR.bumperY + 0.01, z + s * 0.078], [s, 0, 0], [0, 1, 0], 0.32, 0.16, A.rect('plate', 2));
  }
  // Back: door window in a rubber surround, door shut lines and hinges,
  // a handle, tall tail lamps at the corners, the spare on a bracket.
  T.box(0, 1.57, rz + 0.004, 1.3, 0.56, 0.012, 'black');
  T.box(0, 1.57, rz + 0.011, 1.22, 0.48, 0.006, 'tglass');
  for (const x of [-1, 1]) T.box(x * (hw - 0.1), 1.26, rz + 0.002, 0.012, 1.22, 0.006, 'gap');
  T.box(0, 0.665, rz + 0.002, hw * 2 - 0.2, 0.012, 0.006, 'gap');
  for (const y of [0.9, 1.65]) T.box(-(hw - 0.06), y, rz + 0.01, 0.06, 0.1, 0.03, 'black');
  T.box(hw - 0.24, 1.22, rz + 0.02, 0.14, 0.03, 0.03, 'chrome');
  const tr = A.rect('tail', 1);
  for (const x of [-1, 1]) {
    T.box(x * (hw - 0.14), FOUR.tailY, rz + 0.004, 0.17, 0.36, 0.014, 'black');
    T.pic([x * (hw - 0.14), FOUR.tailY, rz + 0.013], [1, 0, 0], [0, 1, 0], 0.15, 0.33, x > 0 ? tr : [tr[2], tr[1], tr[0], tr[3]]);
  }
  T.box(sp.x, sp.y, (rz + sp.z) / 2 - 0.04, 0.16, 0.16, sp.z - rz - 0.1, 'black');
  wheelAt(T, A, h.wheelInto, FOUR.tyreW, (g) => g.rotateY(-Math.PI / 2).translate(sp.x, sp.y, sp.z));
  // Sides: black flares over the arches, side steps on brackets, square
  // mirrors on arms.
  for (const [wz] of S.wheels) for (const x of [-1, 1]) {
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a0 = FLARE_A[0] + ((FLARE_A[1] - FLARE_A[0]) * k) / n;
      const a1 = FLARE_A[0] + ((FLARE_A[1] - FLARE_A[0]) * (k + 1)) / n;
      const [y0, z0] = flareAt(wz, a0);
      const [y1, z1] = flareAt(wz, a1);
      const am = (a0 + a1) / 2;
      // Thick outward (x), wide across the arch edge; the up vector is the arch radius.
      T.rod([x * (hw + 0.02), y0, z0], [x * (hw + 0.02), y1, z1], 0.07, 0.11, 'black', [0, Math.sin(am), Math.cos(am)]);
    }
  }
  const s0 = S.wheels[0][0] + S.archR + 0.08;
  const s1 = S.wheels[1][0] - S.archR - 0.08;
  for (const x of [-1, 1]) {
    T.box(x * (hw - 0.01), 0.47, (s0 + s1) / 2, 0.15, 0.045, s1 - s0, 'black');
    T.box(x * (hw - 0.0), 0.475, (s0 + s1) / 2, 0.13, 0.008, s1 - s0 - 0.04, 'steel');
    for (const z of [s0 + 0.15, (s0 + s1) / 2, s1 - 0.15]) T.box(x * (hw - 0.12), 0.51, z, 0.12, 0.06, 0.05, 'black');
    const mz = S.zA + 0.2;
    const my = S.belt(mz) + 0.14;
    T.rod([x * (hw - 0.02), my - 0.12, mz + 0.05], [x * (hw + 0.1), my, mz], 0.025, 0.025, 'black');
    T.box(x * (hw + 0.12), my, mz, 0.05, 0.2, 0.14, 'black');
    const [mu, mv] = A.sw('mirror');
    T.pic([x * (hw + 0.12), my, mz + 0.072], [x, 0, 0], [0, 1, 0], 0.04, 0.17, [mu, mv, mu, mv]);
  }
  // Wheel liners, wide chunky wheels, axles and differentials, chassis
  // rails, underbody, exhaust.
  for (const [z] of S.wheels) {
    for (const x of [-1, 1]) {
      const n = new THREE.CylinderGeometry(S.archR, S.archR, 0.34, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).toNonIndexed();
      const p = n.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
      n.translate(x * (hw - 0.17), S.wheelY, z);
      T.geo(n, 'liner');
      wheelAt(T, A, h.wheelInto, FOUR.tyreW, (g) => {
        if (x < 0) g.rotateY(Math.PI);
        g.translate(x * WHEEL_X, S.wheelR, z);
      });
      chunky(T, x * WHEEL_X, S.wheelR, z, x, FOUR.tyreW);
    }
    T.box(0, S.wheelR, z, WHEEL_X * 2 - 0.3, 0.09, 0.09, 'black');
    T.box(0.12, S.wheelR, z, 0.3, 0.26, 0.26, 'black');
  }
  for (const x of [-1, 1]) T.box(x * 0.45, 0.5, 0, 0.1, 0.14, half * 2 - 0.1, 'black');
  T.box(0, S.y0 + 0.01, 0, hw * 2 - 0.15, 0.04, half * 2 - 0.7, 'liner');
  T.geo(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6).rotateX(Math.PI / 2).translate(-0.55, 0.48, half - 0.05), 'exhaust');
  parts.push(h.trimPart(T, A, 1), ...h.fineKit('fourbyfour', A));
  return mergeGeometries(parts);
}
