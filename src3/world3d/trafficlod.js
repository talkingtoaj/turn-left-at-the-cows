// Which traffic cars get the fine body (#40, SPEC 9q tier 2): cars within
// about 40 m of the player, the nearest FINE_MAX at most. A car crosses
// between the coarse and fine body with a dithered cross-fade over
// FINE_NEAR..FINE_FAR m, so there is no pop at the switch. When a car loses
// (or wins) its place among the nearest few, its fade slides over 1 / GATE_RATE
// seconds instead of snapping.
//
//   const lod = createFineLod()
//   const fade = lod.step([{ id, d }, ...], dt)   // Map id -> 0 (coarse) .. 1 (fine)

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
