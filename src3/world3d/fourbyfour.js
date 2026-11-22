// The boxy old 4x4 (#44, SPEC 9q tier 2): our own design of an upright,
// short-overhang farm 4x4 with a five-door body. Its loft spec (carbody.js
// sections: flat sides with soft edges, near-upright glass, a flat roof to a
// square back), the kit pieces that fit it (trafficKit.js calls in here) and
// where its lamps and odd door sit. Pure: no three.js, so the checks can
// read it. The 3D bodies are in fourbyfour3d.js.

import { makeSpec } from './carbody.js';

// Car space as in carbody.js: x right, y up, z back. The roof runs to the
// very back (zR1 = half), so the back is one flat, upright cap; the rear
// door's window and the spare wheel go on it (fourbyfour3d.js).
export const FOURBYFOUR = makeSpec({
  L: 4.3, zA: -0.78, zR0: -0.56, zR1: 2.15, zC: 2.16,
  hw: 0.92, ghw: 0.85, y0: 0.55, wheelY: 0.4, wheelR: 0.4, archR: 0.5, roofY: 1.93, round: 0.2, roundIn: 0.07,
  belt: [[-2.15, 1.1], [-0.78, 1.17], [2.15, 1.19]],
  windows: [[-0.74, 0.3], [0.42, 1.18], [1.3, 2.02]], bPillar: [0.3, 0.42],
  wheels: [[-1.32], [1.28]],
});
const S = FOURBYFOUR;

// Front lamps, the bumpers and the spare on the back door.
export const FOUR = {
  headY: 0.93, headX: S.hw - 0.24, headR: 0.1, // round headlamps
  bumperY: 0.58, bumperZ: 0.09, // steel bumpers: height, how far past the body ends
  tailY: 0.86,
  spare: { x: 0.2, y: 1.0, z: S.half + 0.18 }, // on the back door, a little off center
  tyreW: 0.27, // chunky tires
};
export const FOURBYFOUR_LAMPS = { half: S.half + 0.02, hw: S.hw, yF: 0.77, yR: FOUR.tailY };

// Kit pieces (trafficKit.js builder B; helpers h = { rack, can, bullbar, flaps }
// from trafficKit.js, so there is one copy of each).
export function fourByFourKit(B, h) {
  const half = S.half;
  B.part('flaps');
  h.flaps(B, S, S.wheels.map(([z]) => z + S.archR + 0.03));
  B.part('rack');
  // A basket rack the length of the roof.
  const R = h.rack(S, B, true);
  B.part('rackLoad');
  // A tarp bundle at the front of the rack, roped down.
  B.box(0, R.barY + 0.16, R.z0 + 0.55, 1.05, 0.3, 0.8, 'tarp');
  if (B.fine) for (const dz of [-0.22, 0.22]) B.box(0, R.barY + 0.16, R.z0 + 0.55 + dz, 1.07, 0.31, 0.02, 'strap');
  B.part('rackCans');
  // Three cans standing at the back of the rack.
  for (const [x, m] of [[-0.42, 'jerry'], [-0.2, 'jerry'], [0.02, 'jerryRed']]) h.can(B, x, R.barY, R.z1 - 0.22, m, false);
  B.part('roofSpare');
  B.tyre(S.wheelR, FOUR.tyreW, 0.25, R.barY + 0.14, R.z1 - 0.75, 'y');
  B.part('bullbar');
  h.bullbar(B, S.hw - 0.3, FOUR.bumperY - 0.05, FOUR.headY + 0.22, -half - FOUR.bumperZ - 0.08, -half - FOUR.bumperZ - 0.22, 'black');
}
