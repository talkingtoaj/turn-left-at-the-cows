// The surplus 6x6 (#45, SPEC 9q tier 2): a farmer's ex-army truck with
// faded paint, a long flat-topped hood behind a bar grille guard, flat
// fenders, a flat-faced cab with a two-pane windshield and a sun visor, a
// spare wheel behind the cab, three axles on big single tyres, and a wooden
// cargo bed with steel ribs and bare canvas bows. Our own design.
//
// Drawn once through a builder (see roundShapes.js) for the coarse body
// (traffic3d.js) and the fine body (trafficfine.js). A parked copy can use
// vehicleMesh('sixbysix', n, env) from traffic3d.js (paint per instance:
// sixBySixPaint in src/ambient/sixbysix.js).
//
//   sixBySixInto(B)
//
// Car space: x right, y up, z back (the front is at -z). Kit pieces (hay,
// cans, flaps) are in trafficKit.js and sit on SIX.deck.

import * as THREE from 'three';
import { outline, slab, poly, sidePanels } from './roundShapes.js';

export const SIX = {
  wheelR: 0.56,
  track: 0.98, // wheel centre x
  axles: [-2.2, 1.35, 2.65],
  deck: 1.25, // top of the bed floor
  bed: [0.02, 3.62], // bed z range
  half: 3.32, // for the blinkers
  door: [-1.62, -0.62, 2.25, 0.95], // doorZone: z0, z1, top y, inner x
};

export function sixBySixInto(B) {
  const seg = B.fine ? 4 : 2;
  const { wheelR: WR, track: TX, deck: DT } = SIX;
  const [FZ, R1, R2] = SIX.axles;
  const [b0, b1] = SIX.bed;

  // Frame, long sills under the bed.
  for (const x of [-0.46, 0.46]) {
    B.box(x, 0.78, 0.2, 0.12, 0.22, 6.7, 'black');
    B.box(x, 0.98, (b0 + b1) / 2, 0.14, 0.18, b1 - b0, 'black');
  }
  // Front bumper: a heavy painted channel with tow shackles.
  const bumper = outline([[-3.34, 0.7, 0.02], [-3.34, 1.0, 0.02], [-3.12, 1.0, 0.02], [-3.12, 0.7, 0.02]]);
  B.smooth(slab(bumper, 2.36, 0.03, 'zy', 0, seg), 'paint');
  for (const x of [-0.72, 0.72]) {
    B.box(x - 0.06, 0.78, -3.4, 0.03, 0.12, 0.12, 'black');
    B.box(x + 0.06, 0.78, -3.4, 0.03, 0.12, 0.12, 'black');
    B.box(x, 0.84, -3.44, 0.15, 0.03, 0.04, 'black');
  }

  // Hood: long and flat-topped, slightly rounded edges.
  const hood = outline([[-0.62, 0.98, 0.02], [0.62, 0.98, 0.02], [0.62, 1.66, 0.07], [-0.62, 1.66, 0.07]]);
  B.smooth(slab(hood, 1.47, 0.04, 'xy', -2.435, seg), 'paint');
  // Radiator behind a guard of painted bars.
  B.box(0, 1.3, -3.175, 1.08, 0.6, 0.02, 'black');
  for (let x = -0.48; x <= 0.481; x += 0.12) B.box(x, 1.3, -3.22, 0.035, 0.64, 0.035, 'paint');
  for (const y of [1.0, 1.6]) B.box(0, y, -3.22, 1.06, 0.05, 0.05, 'paint');
  if (B.fine) {
    B.box(0, 1.665, -2.43, 0.03, 0.01, 1.4, 'black'); // hinge
    for (const s of [-1, 1]) for (let z = -2.95; z < -2.1; z += 0.17) B.box(s * 0.622, 1.38, z, 0.006, 0.26, 0.05, 'gap'); // louvers
  }

  // Flat fenders: a top plate and an angled front apron.
  const fender = outline([[-3.16, 1.0, 0.02], [-2.97, 1.38, 0.04], [-1.62, 1.38, 0.03], [-1.62, 1.31, 0.02], [-2.92, 1.31, 0.02], [-3.06, 1.0, 0.02]]);
  for (const s of [-1, 1]) {
    B.smooth(slab(fender, 0.62, 0.03, 'zy', s * 0.93, seg), 'paint');
    // Headlamp in a housing set into the apron, a guard over it.
    B.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.14, B.fine ? 12 : 8).rotateX(Math.PI / 2).translate(s * 0.88, 1.22, -3.08), 'black');
    B.disc([s * 0.88, 1.22, -3.152], [0, 0, -1], 0.095, 'head');
    for (const dx of [-0.07, 0.07]) B.box(s * 0.88 + dx, 1.22, -3.19, 0.025, 0.3, 0.025, 'paint');
    B.box(s * 1.12, 1.42, -2.95, 0.08, 0.07, 0.07, 'amber');
    // Step and battery box under the door.
    B.box(s * 1.0, 0.98, -1.15, 0.24, 0.05, 0.45, 'black');
  }
  B.box(-0.75, 0.92, -0.9, 0.42, 0.3, 0.42, 'black');
  B.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.85, B.fine ? 12 : 7).rotateX(Math.PI / 2).translate(0.72, 0.85, -1.0), 'black');

  // Cab: flat face with a sun visor, rounded roof edges.
  const cab = outline([[-1.7, 1.1, 0.03], [-1.72, 2.3, 0.04], [-1.82, 2.36, 0.02], [-1.79, 2.44, 0.04], [-0.32, 2.46, 0.12], [-0.3, 1.1, 0.03]]);
  B.smooth(slab(cab, 2.12, 0.06, 'zy', 0, seg), 'paint');
  // Two-pane windshield in black frames, a painted centre bar.
  for (const s of [-1, 1]) {
    const x0 = s * 0.06;
    const x1 = s * 0.96;
    B.geo(poly([[x0, 1.72, -1.726], [x1, 1.72, -1.726], [x1, 2.24, -1.726], [x0, 2.24, -1.726]], [0, 0, -1]), 'black');
    B.geo(poly([[x0 + s * 0.03, 1.75, -1.73], [x1 - s * 0.03, 1.75, -1.73], [x1 - s * 0.03, 2.21, -1.73], [x0 + s * 0.03, 2.21, -1.73]], [0, 0, -1]), 'glass');
  }
  // Door windows, rear window.
  sidePanels(B, [[-1.53, 1.7], [-0.78, 1.7], [-0.78, 2.24], [-1.53, 2.24]], 1.062, 'black');
  sidePanels(B, [[-1.5, 1.73], [-0.81, 1.73], [-0.81, 2.21], [-1.5, 2.21]], 1.066, 'glass');
  B.geo(poly([[-0.42, 1.8, -0.295], [0.42, 1.8, -0.295], [0.42, 2.16, -0.295], [-0.42, 2.16, -0.295]], [0, 0, 1]), 'glass');
  if (B.fine) {
    for (const s of [-1, 1]) {
      const x = s * 1.063;
      B.box(x, 1.65, -1.62, 0.006, 1.06, 0.014, 'gap');
      B.box(x, 1.65, -0.62, 0.006, 1.06, 0.014, 'gap');
      B.box(x, 1.13, -1.12, 0.006, 0.014, 1.0, 'gap');
      for (const y of [1.35, 1.95]) B.box(s * 1.075, y, -1.6, 0.03, 0.1, 0.06, 'black'); // hinges
      B.box(s * 1.075, 1.55, -0.72, 0.03, 0.03, 0.14, 'black');
    }
    for (const x of [-0.5, 0.5]) B.bar([x, 2.26, -1.74], [x + 0.3, 2.16, -1.75], 0.015, 0.015, 'black');
  }
  // Mirrors on rod arms.
  for (const s of [-1, 1]) {
    B.bar([s * 1.06, 2.1, -1.64], [s * 1.32, 2.1, -1.74], 0.03, 0.03, 'black');
    B.box(s * 1.34, 2.05, -1.74, 0.04, 0.28, 0.2, 'black');
    if (B.fine) B.box(s * 1.34, 2.05, -1.638, 0.03, 0.24, 0.005, 'mirror');
  }
  // Spare wheel behind the cab, exhaust stack.
  B.wheel(WR, 0.3, -0.45, 1.66, -0.13, -1, 'z'); // hubcap to the back
  B.box(-0.45, 1.66, -0.13, 0.12, 0.12, 0.32, 'black');
  B.geo(new THREE.CylinderGeometry(0.05, 0.05, 1.6, B.fine ? 10 : 6).translate(1.02, 1.9, -0.24), 'exhaust');

  // Wooden cargo bed: plank floor and sides, steel ribs and top rail,
  // front wall, tailgate on chains, bare bows for a canvas cover.
  B.box(0, DT - 0.05, (b0 + b1) / 2, 2.38, 0.1, b1 - b0, 'wood');
  if (B.fine) for (const z of [0.3, 0.9, 3.3]) B.box(0, DT - 0.15, z, 2.3, 0.1, 0.08, 'black');
  const sideY = [1.34, 1.51, 1.68, 1.85];
  for (const s of [-1, 1]) {
    for (const y of sideY) B.box(s * 1.17, y, (b0 + b1) / 2, 0.05, 0.155, b1 - b0, 'wood');
    if (B.fine) for (const y of [1.425, 1.595, 1.765]) B.box(s * 1.196, y, (b0 + b1) / 2, 0.004, 0.012, b1 - b0, 'gap');
    for (const z of [0.1, 0.95, 1.8, 2.65, 3.55]) B.box(s * 1.205, 1.6, z, 0.035, 0.74, 0.07, 'paint');
    B.box(s * 1.18, 1.97, (b0 + b1) / 2, 0.08, 0.06, b1 - b0, 'paint');
  }
  for (const y of [...sideY, 2.02]) B.box(0, y, b0 + 0.03, 2.3, 0.155, 0.05, 'wood');
  for (const y of sideY) B.box(0, y, b1 - 0.03, 2.3, 0.155, 0.05, 'wood');
  B.box(0, 1.97, b1 - 0.03, 2.36, 0.06, 0.07, 'paint');
  for (const s of [-1, 1]) {
    B.box(s * 0.6, 1.6, b1 - 0.002, 0.06, 0.74, 0.04, 'paint');
    if (B.fine) B.bar([s * 1.15, 1.96, b1 - 0.25], [s * 1.0, 1.9, b1 + 0.01], 0.015, 0.015, 'black');
  }
  if (B.fine) {
    for (const z of [0.5, 1.4, 2.3, 3.2]) {
      const pts = [[-1.17, 1.97], [-1.13, 2.5], [-0.75, 2.72], [0, 2.78], [0.75, 2.72], [1.13, 2.5], [1.17, 1.97]];
      for (let i = 0; i < pts.length - 1; i++) B.bar([pts[i][0], pts[i][1], z], [pts[i + 1][0], pts[i + 1][1], z], 0.04, 0.04, 'black');
    }
  }

  // Rear: small lamps in housings, plate, pintle hook.
  for (const s of [-1, 1]) {
    B.box(s * 0.95, 1.02, b1 + 0.02, 0.2, 0.14, 0.06, 'black');
    B.pic([s * 0.95, 1.02, b1 + 0.052], [1, 0, 0], [0, 1, 0], 0.16, 0.09, 'tail', s < 0);
  }
  B.pic([0, 1.0, b1 + 0.004], [1, 0, 0], [0, 1, 0], 0.3, 0.15, 'plate');
  B.box(0, 0.8, 3.55, 1.0, 0.16, 0.12, 'black');
  B.box(0, 0.78, 3.66, 0.12, 0.1, 0.16, 'steel');

  // Axles and diffs (fine), three axles on big single tyres.
  if (B.fine) {
    for (const z of [FZ, R1, R2]) {
      B.geo(new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8).rotateZ(Math.PI / 2).translate(0, WR, z), 'black');
      B.box(0, WR, z, 0.34, 0.3, 0.3, 'black');
    }
    for (const x of [-0.46, 0.46]) B.box(x, WR + 0.12, (R1 + R2) / 2, 0.1, 0.08, 1.9, 'black');
  }
  for (const s of [-1, 1]) for (const z of [FZ, R1, R2]) B.wheel(WR, 0.34, s * TX, WR, z, s);
}
