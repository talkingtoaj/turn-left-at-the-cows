// Add-on kit pieces for traffic cars (#42, SPEC 9q tier 2), drawn into each
// type's geometry once. Every piece carries the bit of its kit part
// (src/ambient/carkit.js KIT_PARTS); the traffic shader folds away the
// pieces a car's kit mask leaves out, so kits cost no extra draw calls.
//
// kitInto(type, B) calls a builder B, which the coarse (traffic3d.js) and
// fine (trafficfine.js) bodies each supply:
//   B.fine                                  more small pieces when true
//   B.part(name)                            the kit part the next pieces belong to
//   B.box(x, y, z, w, h, d, mat, ry = 0)    a box (centre, size, turn about y)
//   B.rod(a, b, th, mat)                    a square bar from point a to b
//   B.tyre(r, w, x, y, z, axis)             a spare wheel; axis 'x' | 'y' | 'z'
// mat: rack, steel, alu, jerry, jerryRed, tarp, carton, strap, hay,
// plankDark, black, flap.
//
// doorZone(type) is where the front right door is, for a door in another
// color: [z0, z1, top y, inner x] in car space (x right, z back).

import { SPECS, sectionAt } from './carbody.js';
import { FOURBYFOUR, fourByFourKit } from './fourbyfour.js';

const lampY = (S) => (S.belt(-S.half) + S.y0 + 0.2) / 2 + 0.02;

// A jerry can, upright or lying on its side (long way along z).
function can(B, x, y, z, mat, lying) {
  const [w, h, d] = lying ? [0.17, 0.35, 0.47] : [0.17, 0.47, 0.35];
  if (lying) {
    B.box(x, y + 0.085, z, 0.35, 0.17, 0.47, mat);
    if (B.fine) B.box(x, y + 0.175, z - 0.12, 0.2, 0.025, 0.05, mat);
    return;
  }
  B.box(x, y + h / 2, z, w, h, d, mat);
  if (B.fine) {
    B.box(x, y + h + 0.02, z - 0.06, 0.05, 0.04, 0.16, mat); // handle
    B.box(x, y + h + 0.02, z + 0.12, 0.04, 0.05, 0.04, 'black'); // spout cap
  }
}

// A lofted car's roof rack: load bars on feet at the roof edge, and on a
// basket rack, side rails and slats too.
function rack(S, B, basket) {
  const z0 = S.zR0 + 0.14;
  const z1 = S.zR1 - 0.12;
  const edge = sectionAt(S, (z0 + z1) / 2).pts[8];
  const fx = edge[0] - 0.03;
  const barY = S.roofY + 0.1;
  const bars = z1 - z0 > 1.4 ? [z0, (z0 + z1) / 2, z1] : [z0, z1];
  for (const z of bars) {
    B.box(0, barY, z, fx * 2 + 0.08, 0.03, 0.045, 'rack');
    for (const s of [-1, 1]) B.box(s * fx, (edge[1] + barY) / 2, z, 0.05, barY - edge[1] + 0.02, 0.07, 'rack');
  }
  if (basket) {
    const railY = barY + 0.09;
    for (const s of [-1, 1]) {
      B.box(s * fx, railY, (z0 + z1) / 2, 0.025, 0.025, z1 - z0 + 0.03, 'rack');
      for (const z of bars) B.box(s * fx, (barY + railY) / 2, z, 0.02, railY - barY, 0.02, 'rack');
    }
    for (const z of [z0, z1]) B.box(0, railY, z, fx * 2, 0.025, 0.025, 'rack');
    for (let z = z0 + 0.3; z < z1 - 0.15; z += 0.3) B.box(0, barY + 0.006, z, fx * 2, 0.015, 0.03, 'rack');
  }
  return { z0, z1, barY: barY + 0.015, fx };
}

// A bull bar in front of the bumper: two posts, a top hoop, a cross bar.
function bullbar(B, x, yLo, yHi, zBack, zFront, mat) {
  for (const s of [-1, 1]) {
    B.rod([s * x, yLo, zBack], [s * x, yHi, zFront], 0.055, mat);
    B.rod([s * x, yHi, zFront], [s * x, yHi, zBack + 0.05], 0.05, mat);
    if (B.fine) B.rod([s * x * 0.35, yLo + 0.12, zFront], [s * x * 0.35, yHi, zFront], 0.035, mat);
  }
  B.box(0, yHi, zFront, x * 2 + 0.055, 0.055, 0.055, mat);
  B.box(0, yLo + 0.16, zFront + 0.01, x * 2, 0.045, 0.045, mat);
}

function flaps(B, S, list) {
  for (const z of list) for (const s of [-1, 1]) {
    B.box(s * (S.hw - 0.14), S.y0 - 0.06, z, 0.24, 0.32, 0.015, 'flap');
    if (B.fine) B.box(s * (S.hw - 0.14), S.y0 + 0.11, z - 0.02, 0.24, 0.025, 0.04, 'steel');
  }
}

function loftKit(type, B) {
  const S = SPECS[type];
  const h = S.half;
  const wr = S.wheelR;
  const arch = S.archR || 0.43;
  const ly = lampY(S);
  B.part('flaps');
  flaps(B, S, type === 'pickup' ? [S.wheels[1][0] + arch + 0.03] : S.wheels.map(([z]) => z + arch + 0.03));
  if (type !== 'pickup') {
    B.part('rack');
    const R = rack(S, B, type === 'wagon');
    const mid = (R.z0 + R.z1) / 2;
    B.part('rackLoad');
    if (type === 'wagon') {
      // A tarp bundle, roped down.
      B.box(0, R.barY + 0.16, 1.05, 1.0, 0.3, 0.75, 'tarp');
      if (B.fine) for (const dz of [-0.2, 0.2]) B.box(0, R.barY + 0.16, 1.05 + dz, 1.02, 0.31, 0.02, 'strap');
    } else {
      // A suitcase and a carton, strapped.
      B.box(-0.12, R.barY + 0.12, mid - 0.05, 0.62, 0.22, 0.46, 'tarp');
      B.box(0.2, R.barY + 0.36, mid, 0.38, 0.26, 0.34, 'carton');
      if (B.fine) {
        B.box(-0.12, R.barY + 0.12, mid - 0.05, 0.63, 0.225, 0.03, 'strap');
        B.box(0.2, R.barY + 0.36, mid, 0.39, 0.265, 0.03, 'strap');
      }
    }
    if (type === 'wagon') {
      B.part('rackCans');
      can(B, -0.2, R.barY, R.z1 - 0.3, 'jerry', true);
      can(B, 0.2, R.barY, R.z1 - 0.3, 'jerryRed', true);
      B.part('roofSpare');
      B.tyre(wr, 0.2, 0, R.barY + 0.1, R.z0 + 0.4, 'y');
      B.part('rearSpare');
      B.tyre(wr, 0.2, 0, 0.88, h + 0.14, 'z');
      B.box(0, 0.88, h + 0.03, 0.12, 0.12, 0.06, 'black');
    }
  }
  if (type === 'wagon' || type === 'pickup') {
    B.part('bullbar');
    bullbar(B, S.hw - 0.4, S.y0 + 0.02, ly + 0.2, -h - 0.1, -h - 0.22, 'black');
  }
  if (type === 'pickup') {
    const z0 = S.zC + 0.12;
    const z1 = h - 0.05;
    const top = S.belt(h) + 0.03;
    const hw = S.hw;
    B.part('toolbox');
    B.box(0, top + 0.16, z0 + 0.25, hw * 2 - 0.14, 0.3, 0.42, 'alu');
    if (B.fine) {
      B.box(0, top + 0.25, z0 + 0.25, hw * 2 - 0.13, 0.012, 0.425, 'black');
      for (const x of [-0.45, 0.45]) B.box(x, top + 0.2, z0 + 0.465, 0.08, 0.05, 0.012, 'black');
    }
    B.part('ladder');
    // Ladder rack over the bed, a ladder on top running out over the cab.
    const ry = S.roofY + 0.08;
    for (const z of [z0 + 0.02, z1 - 0.08]) {
      for (const s of [-1, 1]) B.box(s * (hw - 0.09), (top + ry) / 2, z, 0.05, ry - top, 0.05, 'rack');
      B.box(0, ry, z, hw * 2 - 0.13, 0.05, 0.05, 'rack');
    }
    const lz0 = z0 - 0.7;
    const lz1 = z1 + 0.15;
    for (const s of [-1, 1]) B.box(s * 0.22, ry + 0.05, (lz0 + lz1) / 2, 0.04, 0.06, lz1 - lz0, 'alu');
    for (let z = lz0 + 0.14; z < lz1 - 0.05; z += 0.28) B.box(0, ry + 0.05, z, 0.44, 0.025, 0.03, 'alu');
    B.part('bedSpare');
    B.tyre(wr, 0.22, -0.4, top + 0.11, z1 - 0.42, 'y');
    B.part('bedCans');
    for (const [z, m] of [[1.3, 'jerry'], [1.52, 'jerryRed']]) can(B, -(hw - 0.22), top, z, m, false);
    B.part('hay');
    B.box(0.25, top + 0.19, z1 - 0.6, 0.55, 0.38, 0.45, 'hay');
    if (B.fine) for (const dz of [-0.12, 0.12]) B.box(0.25, top + 0.19, z1 - 0.6 + dz, 0.56, 0.39, 0.012, 'plankDark');
  }
}

function farmKit(B) {
  const bale = (x, y, z) => {
    B.box(x, y, z, 0.6, 0.45, 0.9, 'hay');
    if (B.fine) for (const dz of [-0.22, 0.22]) B.box(x, y, z + dz, 0.61, 0.46, 0.014, 'plankDark');
  };
  B.part('hay');
  bale(0.35, 1.12, 1.6);
  B.part('hay2');
  bale(-0.35, 1.12, 1.1);
  B.part('hay3');
  bale(0, 1.575, 1.35);
  B.part('rearSpare');
  B.tyre(0.45, 0.22, -0.5, 1.36, 0.32, 'z');
  B.box(-0.5, 1.36, 0.19, 0.14, 0.14, 0.05, 'black');
  B.part('bedCans');
  for (const [z, m] of [[0.42, 'jerry'], [0.64, 'jerry']]) can(B, 0.78, 0.88, z, m, false);
  B.part('bullbar');
  bullbar(B, 0.72, 0.5, 1.36, -2.72, -2.86, 'steel');
  B.part('flaps');
  for (const s of [-1, 1]) B.box(s * 0.9, 0.3, 2.05, 0.34, 0.42, 0.02, 'flap');
}

export function kitInto(type, B) {
  if (type === 'farmtruck') farmKit(B);
  else if (type === 'fourbyfour') fourByFourKit(B, { rack, can, bullbar, flaps });
  else loftKit(type, B);
}

export function doorZone(type) {
  if (type === 'farmtruck') return [-1.12, -0.02, 1.5, 0.95];
  const S = type === 'fourbyfour' ? FOURBYFOUR : SPECS[type];
  const front = S.windows[0][0] - 0.08;
  const mid = (S.bPillar[0] + S.bPillar[1]) / 2 + (S.bPillar[0] === S.bPillar[1] ? 0.03 : 0);
  return [front, mid, S.belt(mid) + 0.02, S.hw - 0.3];
}
