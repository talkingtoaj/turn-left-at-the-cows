// The farm truck (#55, SPEC 9q tier 2): an old 1980s-90s stake-bed farm
// truck, drawn once through a builder for the coarse body (traffic3d.js) and
// the fine body (trafficfine.js), so both match and the 36-44 m cross-fade
// doesn't pop. Rounded cab with a raked windshield, a hood that drops a
// little to the front, separate front fenders standing off the hood and
// running back into the running boards, a steel channel bumper on brackets,
// a stake bed on sills with wooden stakes and rails, dual rear wheels, an
// exhaust stack and west-coast mirrors.
//
//   farmTruckInto(B)   // B: see roundShapes.js
//
// Car space: x right, y up, z back (the front is at -z). Kit pieces (hay,
// spare, cans, bull bar, flaps) are in trafficKit.js and sit on FARM.deck.

import * as THREE from 'three';
import { outline, slab, warp, poly, sidePanels } from './roundShapes.js';

export const FARM = {
  wheelR: 0.46,
  front: -1.85, // front axle z
  rear: 1.6, // rear axle z (duals)
  deck: 1.02, // top of the bed floor
  bed: [0.04, 2.8], // bed floor z range
  half: 2.66, // for the blinkers
  door: [-1.12, -0.2, 2.0, 0.9], // doorZone: z0, z1, top y, inner x
};

export function farmTruckInto(B) {
  const seg = B.fine ? 4 : 2;
  const { wheelR: WR, front: FZ, rear: RZ, deck: DT } = FARM;
  const [b0, b1] = FARM.bed;

  // Frame rails, crossmembers, long sills under the bed.
  for (const x of [-0.42, 0.42]) {
    B.box(x, 0.62, 0.1, 0.1, 0.2, 5.25, 'black');
    B.box(x, 0.84, (b0 + b1) / 2, 0.12, 0.24, b1 - b0, 'black');
  }
  B.box(0, 0.62, -2.45, 0.9, 0.16, 0.12, 'black');
  B.box(0, 0.62, 2.7, 0.9, 0.16, 0.12, 'black');

  // Cab: side profile with a raked windshield, rounded on every edge.
  const cab = outline([[-1.4, 0.8, 0.03], [-1.4, 1.38, 0.05], [-1.3, 1.42, 0.05], [-1.1, 2.03, 0.12], [-0.08, 2.05, 0.18], [-0.06, 0.8, 0.04]]);
  B.smooth(slab(cab, 1.94, 0.08, 'zy', 0, seg + 1), 'paint');
  // Windshield in a black rubber surround, along the rake.
  const ws = (inset, lift) => {
    const d = [0.2, 0.61];
    const L = Math.hypot(...d);
    const n = [-d[1] / L, d[0] / L]; // (z, y) outward
    const p = (t) => [-1.3 + d[0] * t + n[0] * lift, 1.42 + d[1] * t + n[1] * lift];
    const [z0, y0] = p(0.1 + inset);
    const [z1, y1] = p(0.9 - inset);
    return [[0, y0, z0], [0, y1, z1]];
  };
  B.bar(...ws(0, 0.004), 1.74, 0.01, 'black');
  B.bar(...ws(0.03, 0.01), 1.64, 0.01, 'glass');
  // Door windows (front edge along the windshield), rear window.
  const win = [[-1.08, 1.5], [-0.3, 1.5], [-0.3, 1.95], [-0.933, 1.95]];
  sidePanels(B, win.map(([z, y]) => [z + (z < -0.6 ? -0.03 : 0.03), y + (y < 1.7 ? -0.03 : 0.03)]), 0.972, 'black');
  sidePanels(B, win, 0.976, 'glass');
  B.geo(poly([[-0.66, 1.53, -0.055], [0.66, 1.53, -0.055], [0.66, 1.95, -0.055], [-0.66, 1.95, -0.055]], [0, 0, 1]), 'black');
  B.geo(poly([[-0.62, 1.56, -0.05], [0.62, 1.56, -0.05], [0.62, 1.92, -0.05], [-0.62, 1.92, -0.05]], [0, 0, 1]), 'glass');
  if (B.fine) {
    for (const s of [-1, 1]) {
      const x = s * 0.975;
      // Door shut lines, vent window bar, handle, drip rail.
      B.box(x, 1.16, -1.12, 0.006, 0.62, 0.014, 'gap');
      B.bar([x, 1.47, -1.12], [x, 1.99, -0.96], 0.006, 0.014, 'gap', [1, 0, 0]);
      B.box(x, 1.42, -0.2, 0.006, 1.14, 0.014, 'gap');
      B.box(x, 0.86, -0.66, 0.006, 0.014, 0.92, 'gap');
      B.bar([s * 0.98, 1.5, -0.9], [s * 0.98, 1.95, -0.9], 0.006, 0.02, 'black', [1, 0, 0]);
      B.box(s * 0.99, 1.4, -0.36, 0.03, 0.03, 0.15, 'chrome');
      B.box(s * 0.985, 2.0, -0.6, 0.02, 0.025, 0.95, 'black');
    }
    // Wipers, roof marker lamps.
    for (const x of [-0.45, 0.25]) B.bar([x, 1.47, -1.34], [x + 0.32, 1.6, -1.31], 0.015, 0.015, 'black');
    for (const x of [-0.32, 0, 0.32]) B.box(x, 2.07, -1.0, 0.09, 0.05, 0.06, 'amber');
  }

  // Hood: rounded top edges, dropping a little to the front.
  const hood = outline([[-0.76, 0.84, 0.03], [0.76, 0.84, 0.03], [0.76, 1.3, 0.17], [-0.76, 1.3, 0.17]]);
  const hg = slab(hood, 1.2, 0.05, 'xy', -2.0, seg + 1);
  B.smooth(warp(hg, (v) => {
    const t = Math.min(1, Math.max(0, (-v.z - 1.4) / 1.2));
    if (v.y > 1.0) v.y -= 0.06 * t * t;
  }), 'paint');
  // Grille in a chrome surround with bars, round headlamps in square bezels.
  const gz = -2.605;
  B.pic([0, 1.06, gz - 0.004], [-1, 0, 0], [0, 1, 0], 0.76, 0.3, 'grille');
  for (const y of [0.9, 1.22]) B.box(0, y, gz - 0.02, 0.84, 0.04, 0.05, 'chrome');
  for (const x of [-0.4, 0.4]) B.box(x, 1.06, gz - 0.02, 0.04, 0.36, 0.05, 'chrome');
  for (const y of [1.0, 1.12]) B.box(0, y, gz - 0.02, 0.78, 0.02, 0.03, 'chrome');
  B.box(0, 1.06, gz - 0.02, 0.025, 0.3, 0.03, 'chrome');
  for (const s of [-1, 1]) {
    B.box(s * 0.58, 1.07, gz - 0.02, 0.28, 0.26, 0.05, 'chrome');
    B.disc([s * 0.58, 1.07, gz - 0.047], [0, 0, -1], 0.1, 'head');
    B.box(s * 0.58, 0.9, gz - 0.02, 0.2, 0.07, 0.04, 'amber');
  }

  // Front fenders: an arch over the wheel, standing off the hood, running
  // back into the running board under the door.
  const a = Math.asin(0.25 / 0.58);
  const fender = outline([
    [-0.05, 0.8, 0.02], [-0.05, 0.71, 0.02],
    { arc: [FZ, WR, 0.58, a, Math.PI - a] },
    [-2.56, 0.71, 0.03], [-2.58, 0.98, 0.12], [-2.36, 1.17, 0.2], [-1.62, 1.19, 0.22], [-1.32, 1.02, 0.12], [-1.2, 0.8, 0.06],
  ]);
  for (const s of [-1, 1]) {
    B.smooth(slab(fender, 0.32, 0.05, 'zy', s * 0.945, seg + 1), 'paint');
    B.box(s * 0.775, 0.98, -1.95, 0.03, 0.3, 1.1, 'black'); // inner apron in the gap
  }
  // Steel channel bumper on brackets, plate on its face.
  const bumper = outline([[-2.86, 0.47, 0.02], [-2.86, 0.75, 0.02], [-2.68, 0.75, 0.01], [-2.68, 0.71, 0.005], [-2.81, 0.71, 0.01], [-2.81, 0.51, 0.01], [-2.68, 0.51, 0.005], [-2.68, 0.47, 0.01]]);
  B.smooth(slab(bumper, 2.04, 0.025, 'zy', 0, seg), 'steel');
  for (const x of [-0.42, 0.42]) B.box(x, 0.61, -2.58, 0.1, 0.12, 0.22, 'black');
  B.pic([0, 0.61, -2.866], [-1, 0, 0], [0, 1, 0], 0.3, 0.15, 'plate');
  if (B.fine) for (const x of [-0.8, -0.5, 0.5, 0.8]) B.box(x, 0.61, -2.866, 0.03, 0.03, 0.012, 'black');

  // Mirrors: a tall head on a tube frame by each door.
  for (const s of [-1, 1]) {
    B.bar([s * 0.97, 1.52, -1.0], [s * 1.22, 1.52, -1.02], 0.03, 0.03, 'black');
    B.bar([s * 0.97, 1.9, -1.0], [s * 1.22, 1.9, -1.02], 0.03, 0.03, 'black');
    B.box(s * 1.24, 1.71, -1.03, 0.05, 0.36, 0.17, 'black');
    if (B.fine) B.box(s * 1.24, 1.71, -0.943, 0.04, 0.32, 0.005, 'mirror');
  }
  // Exhaust stack behind the cab, fuel tank under the left door.
  B.geo(new THREE.CylinderGeometry(0.045, 0.045, 1.6, B.fine ? 10 : 6).translate(0.86, 1.55, 0.0), 'exhaust');
  B.box(0.86, 2.37, 0.02, 0.1, 0.03, 0.12, 'black', 0.35);
  B.geo(new THREE.CylinderGeometry(0.19, 0.19, 0.75, B.fine ? 12 : 7).rotateX(Math.PI / 2).translate(-0.6, 0.5, -0.75), 'steel');
  if (B.fine) for (const z of [-1.0, -0.5]) B.box(-0.6, 0.5, z, 0.4, 0.4, 0.03, 'black');

  // Stake bed: sills, plank floor, rub rail, stakes in pockets, side rails
  // in two panels each side, front and rear rails.
  if (B.fine) for (const z of [0.2, 0.65, 2.35, 2.72]) B.box(0, 0.93, z, 2.1, 0.08, 0.08, 'black');
  B.box(0, DT - 0.03, (b0 + b1) / 2, 2.16, 0.06, b1 - b0, 'wood');
  if (B.fine) for (let x = -0.9; x < 0.95; x += 0.2) B.box(x, DT + 0.001, (b0 + b1) / 2, 0.012, 0.004, b1 - b0 - 0.02, 'gap');
  const stakes = [0.14, 0.98, 1.84, 2.7];
  for (const s of [-1, 1]) {
    B.box(s * 1.09, DT - 0.05, (b0 + b1) / 2, 0.05, 0.11, b1 - b0, 'black');
    for (const z of stakes) {
      B.box(s * 1.055, DT + 0.37, z, 0.08, 0.84, 0.08, 'woodDark');
      if (B.fine) B.box(s * 1.12, DT - 0.05, z, 0.04, 0.12, 0.11, 'black');
    }
    for (const y of [1.2, 1.44, 1.68]) {
      for (const [z0, z1] of [[0.06, 1.4], [1.44, 2.78]]) B.box(s * 0.998, y, (z0 + z1) / 2, 0.035, 0.11, z1 - z0, 'wood');
    }
  }
  for (const y of [1.2, 1.44, 1.68]) {
    B.box(0, y, 0.08, 1.96, 0.11, 0.035, 'wood');
    B.box(0, y, 2.765, 1.96, 0.11, 0.035, 'wood');
  }
  for (const x of [-0.35, 0.35]) B.box(x, DT + 0.37, 2.765, 0.08, 0.84, 0.05, 'woodDark');

  // Rear: lamps in black housings, plate on a bracket, hitch.
  for (const s of [-1, 1]) {
    B.box(s * 0.88, 0.89, 2.8, 0.24, 0.14, 0.06, 'black');
    B.pic([s * 0.88, 0.89, 2.832], [1, 0, 0], [0, 1, 0], 0.2, 0.1, 'tail', s < 0);
  }
  B.box(0, 0.83, 2.79, 0.34, 0.2, 0.03, 'black');
  B.pic([0, 0.8, 2.808], [1, 0, 0], [0, 1, 0], 0.3, 0.15, 'plate');
  B.box(0, 0.56, 2.82, 0.12, 0.1, 0.24, 'steel');

  // Axles and springs (fine), wheels: singles in front, duals at the back.
  if (B.fine) {
    B.box(0, WR - 0.05, FZ, 1.5, 0.1, 0.1, 'black');
    B.geo(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8).rotateZ(Math.PI / 2).translate(0, WR, RZ), 'black');
    for (const x of [-0.42, 0.42]) for (const z of [FZ, RZ]) B.box(x, WR + 0.08, z, 0.08, 0.06, 1.1, 'black');
  }
  for (const s of [-1, 1]) {
    B.wheel(WR, 0.26, s * 0.86, WR, FZ, s);
    B.wheel(WR, 0.22, s * 1.0, WR, RZ, s);
    B.geo(new THREE.CylinderGeometry(WR, WR, 0.2, B.fine ? 12 : 8).rotateZ(Math.PI / 2).translate(s * 0.77, WR, RZ), 'rubber');
  }
}
