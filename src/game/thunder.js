// Thunder and lightning (round 12). Engine-free. Only in heavy rain
// (src/game/wetness.js rain at THUNDER.HEAVY or more): now and then a
// lightning strike somewhere 0.5 to 8 km off; its thunder arrives 3 s per
// km later (the speed of sound), louder and sharper when close, a low
// rumble when far. The flash is drawn by src3/world3d/lightning3d.js, the
// thunder played by src/audio/audio.js (audio.thunder).
//
// Deterministic like the rest of the weather: game time is cut into slots
// of THUNDER.SLOT seconds, and each slot's strike (if any: how likely grows
// with the rain) and its place come from a hash of the world seed and the
// slot number. Game seconds here are the wetness clock (game minutes x 6,
// i.e. real seconds at normal speed), so the same mission time gives the
// same storm.
//
//   const T = createThunder(seed)
//   T.update(tSec, rain) -> [strikes that happened since the last update]
//   strike = { t, km, bearing (degrees, from where you are), power 0..1 }
//   T.force(bearing, km)   strike at the next update (dev: ?thunder=now)

export const THUNDER = {
  HEAVY: 0.7, // rain at which the storm starts
  SLOT: 12, // seconds: at most one strike per slot
  CHANCE: [0.25, 0.7], // chance of a strike in a slot, at HEAVY and at full rain
  MIN_KM: 0.5,
  MAX_KM: 8,
  S_PER_KM: 3, // thunder arrives 3 s per km after the flash
};

function hash(seed, n, k) {
  let h = (2166136261 ^ seed) >>> 0;
  for (const v of [n, k]) {
    h = Math.imul(h ^ (v & 0xffff), 16777619);
    h = Math.imul(h ^ (v >>> 16), 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// The strike in slot n at this rain, or null.
export function strikeIn(seed, n, rain) {
  if (rain < THUNDER.HEAVY) return null;
  const k = Math.min(1, (rain - THUNDER.HEAVY) / (1 - THUNDER.HEAVY));
  const chance = THUNDER.CHANCE[0] + (THUNDER.CHANCE[1] - THUNDER.CHANCE[0]) * k;
  if (hash(seed, n, 1) >= chance) return null;
  // Far strikes are more common than close ones.
  const km = THUNDER.MIN_KM + (THUNDER.MAX_KM - THUNDER.MIN_KM) * hash(seed, n, 3) ** 1.5;
  return {
    t: (n + 0.1 + 0.8 * hash(seed, n, 2)) * THUNDER.SLOT,
    km,
    bearing: hash(seed, n, 4) * 360,
    power: 0.75 + 0.25 * hash(seed, n, 5),
  };
}

export function createThunder(seed) {
  let last = null;
  let forced = null;
  return {
    update(t, rain) {
      const out = [];
      if (forced) {
        out.push({ t, ...forced });
        forced = null;
      }
      if (last !== null && t > last && t - last < 60) {
        const n0 = Math.floor(last / THUNDER.SLOT);
        const n1 = Math.floor(t / THUNDER.SLOT);
        for (let n = n0; n <= n1; n++) {
          const s = strikeIn(seed, n, rain);
          if (s && s.t > last && s.t <= t) out.push(s);
        }
      }
      last = t;
      return out;
    },
    force(bearing = 30, km = 1.2) {
      forced = { km, bearing, power: 1, forced: true };
    },
  };
}

// Seconds from the flash to its thunder.
export const thunderDelay = (km) => km * THUNDER.S_PER_KM;
