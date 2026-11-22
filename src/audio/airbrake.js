// Air-brake hiss near parked semis (#48): now and then, while you are within
// HISS.r of one, a semi lets its brakes out with a hiss, heard where it
// stands (pan, quieter and duller with distance). Pure logic, no Web Audio:
// audio.js plays what step() returns. Sound: public/sounds/traffic/airbrake.mp3.
//
//   const hiss = createHiss(rand)            // rand: () => 0..1 (Math.random)
//   const srcs = hissSources(parkedIn(world.regionId))
//   for (const h of hiss.step(dt, ear, srcs)) play(h)   // h: { id, x, y, d, vol, lowpass }

import { PARKED_KINDS } from '../world/parked.js';

export const HISS = {
  r: 70, // m: heard within this
  first: [3, 10], // s: the first hiss after you come close
  gap: [22, 55], // s: then one hiss every so often
  vol: 0.45, // at the semi; falls off as (1 - d / r)^2
  lowpassNear: 9000, // Hz at the semi
  lowpassFar: 1800, // Hz at r
};

// The parked vehicles that hiss (kinds with `hiss: true`).
export function hissSources(list) {
  return list.filter((p) => PARKED_KINDS[p.kind] && PARKED_KINDS[p.kind].hiss).map((p) => ({ id: p.id, x: p.x, y: p.y }));
}

// How a hiss at distance d sounds.
export function hissAt(d) {
  const k = Math.max(0, 1 - d / HISS.r);
  return { vol: HISS.vol * k * k, lowpass: HISS.lowpassFar + (HISS.lowpassNear - HISS.lowpassFar) * k };
}

export function createHiss(rand = Math.random) {
  const wait = new Map(); // id -> seconds to its next hiss, while in range
  const span = ([a, b]) => a + (b - a) * rand();
  return {
    step(dt, ear, sources) {
      const out = [];
      for (const s of sources) {
        const d = Math.hypot(s.x - ear.x, s.y - ear.y);
        if (d >= HISS.r) {
          wait.delete(s.id); // coming back starts over with a short wait
          continue;
        }
        if (!wait.has(s.id)) {
          wait.set(s.id, span(HISS.first));
          continue;
        }
        const t = wait.get(s.id) - dt;
        if (t > 0) {
          wait.set(s.id, t);
          continue;
        }
        wait.set(s.id, span(HISS.gap) + t); // keep the overshoot, so frame rate doesn't matter
        out.push({ id: s.id, x: s.x, y: s.y, d, ...hissAt(d) });
      }
      return out;
    },
    // Forget every timer (another region).
    reset() {
      wait.clear();
    },
  };
}
