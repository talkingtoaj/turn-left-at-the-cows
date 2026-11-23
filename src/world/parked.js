// Parked vehicles (#47, SPEC 9q tier 2): big rigs and other things that stand
// in one spot and never drive. A list per region (src/world/regions.js ids).
// They are solid like buildings (src/drive/collider.js adds parkedSolids),
// drawn by src3/world3d/parked3d.js (a builder per kind) and heard by
// src/audio/airbrake.js (the semis' air brakes hiss now and then).
//
//   { id, kind, x, y, heading, ...look }
//   kind: a key of PARKED_KINDS (and of the builder registry in parked3d.js)
//   heading: degrees, 0 = the nose points north, 90 = east (as the car)
//   lift: metres above the ground (0.3 on the Calder silos' concrete pad)
//   look fields depend on the kind (semi: trailer 'grain' | 'flatbed',
//   color: the cab's paint)
//
// Keep them off roads where traffic drives (tools/check-parked.mjs).
// To add a kind: a footprint here and a builder in parked3d.js.

import { partRect } from '../drive/layout.js';
import { sixBySixPaint } from '../ambient/sixbysix.js';

// Footprint per kind (what the car and your feet bump into): w across, len
// along the vehicle, centred on (x, y).
export const PARKED_KINDS = {
  // A long-nose tractor with a hopper or flatbed trailer, about 15 m.
  semi: { w: 2.6, len: 15.2, hiss: true },
  // The farmer's surplus 6x6 (#45, src3/world3d/sixbysix3d.js), about 7 m.
  sixbysix: { w: 2.45, len: 7.0 },
};

export const PARKED = {
  fenwick: [
    // Waiting by the scale house at the Calder grain silos, on the pad.
    { id: 'calder_semi', kind: 'semi', x: 4954, y: 1119.2, heading: 90, lift: 0.3, trailer: 'grain', color: 0x7a1f1a },
    // The surplus 6x6 (#45) at home beside the Hartley barn (kit: the parts
    // shown, carkit.js KIT_PARTS names). Only this one is parked (#71, SPEC
    // 9r): more would read as several of the one farmer's truck.
    { id: 'hartley_6x6', kind: 'sixbysix', x: 2700, y: 434, heading: 90, color: sixBySixPaint('hartley_6x6').color, kit: ['hay', 'bedCans'], dirt: 0.5 },
  ],
  brandt: [
    // Pulled up to the driveway shed of the Brandt co-op elevator, a load
    // of seed under tarps.
    { id: 'brandt_semi', kind: 'semi', x: 1745, y: 1427, heading: 0, trailer: 'flatbed', color: 0xd8d6cc },
  ],
};

// The parked vehicles of a region ([] for none).
export function parkedIn(regionId) {
  return PARKED[regionId] || [];
}

// Solid footprint of one parked vehicle, for the collider.
export function parkedSolids(p) {
  const k = PARKED_KINDS[p.kind];
  if (!k) return { rects: [], circles: [] };
  return { rects: [{ ...partRect(p.x, p.y, p.heading || 0, { lx: 0, ly: 0, w: k.w, h: k.len }), kind: 'parked' }], circles: [] };
}
