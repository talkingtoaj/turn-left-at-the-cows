// Which traffic cars get the fine body (#40, SPEC 9q tier 2): cars within
// about 40 m of the player, the nearest FINE_MAX at most. A car crosses
// between the coarse and fine body with a dithered cross-fade over
// FINE_NEAR..FINE_FAR m, so there is no pop at the switch. When a car loses
// (or wins) its place among the nearest few, its fade slides over 1 / GATE_RATE
// seconds instead of snapping.
//
//   const lod = createFineLod()
//   const fade = lod.step([{ id, d }, ...], dt)   // Map id -> 0 (coarse) .. 1 (fine)
//
// Far stand-ins (#62): past FAR m every car shares one instanced mesh that
// holds three shapes, the low car, the tall van and the boxy 4x4
// (trafficfar.js). Each piece carries a bit past the kit bits, and
// farMask(type, kitMask) picks which pieces a car shows (the others fold
// away in the shader), so all three cost one draw call.
//   carInst.y of a far car = farMask(type, kit.mask)

import { KIT_BIT, KIT_PARTS } from '../../src/ambient/carkit.js';

export const FINE_NEAR = 36; // m: fully fine inside this
export const FINE_FAR = 44; // m: fully coarse past this
export const FINE_MAX = 6; // cars with a fine body at once
export const GATE_RATE = 3; // per second

export function distanceFade(d) {
  return Math.max(0, Math.min(1, (FINE_FAR - d) / (FINE_FAR - FINE_NEAR)));
}

export function createFineLod({ max = FINE_MAX, rate = GATE_RATE } = {}) {
  const gates = new Map(); // id -> 0..1
  const out = new Map();
  return {
    step(list, dt) {
      const sorted = [...list].sort((a, b) => a.d - b.d);
      const seen = new Set();
      out.clear();
      sorted.forEach(({ id, d }, rank) => {
        seen.add(id);
        const target = rank < max && d < FINE_FAR ? 1 : 0;
        let g = gates.get(id);
        if (g === undefined) g = target;
        else g = target > g ? Math.min(target, g + rate * dt) : Math.max(target, g - rate * dt);
        gates.set(id, g);
        out.set(id, Math.min(distanceFade(d), g));
      });
      for (const id of [...gates.keys()]) if (!seen.has(id)) gates.delete(id);
      return out;
    },
  };
}

export const FAR = 140; // m from the camera focus: past this, the stand-in
// Bits of the far pieces, after the kit bits (KIT_PARTS).
export const FAR_PIECES = ['low', 'van', 'fourbyfour', 'vanRack', 'fourbyfourRack'];
const FAR_BASE = KIT_PARTS.length + 1;
export const FAR_BIT = Object.fromEntries(FAR_PIECES.map((p, i) => [p, FAR_BASE + i]));
const has = (mask, part) => (mask & (1 << KIT_BIT[part])) !== 0;

// Which stand-in shape a traffic type gets.
export function farShape(type) {
  return type === 'van' || type === 'fourbyfour' ? type : 'low';
}

// The mask a far car is drawn with: its shape, a rack when its kit has
// one, and the van's business paint (stripe, lower tone: shader bits).
export function farMask(type, kitMask = 0) {
  const shape = farShape(type);
  let m = 1 << FAR_BIT[shape];
  if (shape === 'van') {
    if (has(kitMask, 'rack') || has(kitMask, 'ladder')) m |= 1 << FAR_BIT.vanRack;
    for (const p of ['stripe', 'lowerTone']) if (has(kitMask, p)) m |= 1 << KIT_BIT[p];
  }
  if (shape === 'fourbyfour' && has(kitMask, 'rack')) m |= 1 << FAR_BIT.fourbyfourRack;
  return m;
}
