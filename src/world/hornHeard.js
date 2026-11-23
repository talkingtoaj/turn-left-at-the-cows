// Horn reactions (#74, SPEC 9r): when you sound the horn, nearby locals wave,
// grazing cows lift their heads to look, and the farm dog runs its fence
// barking. Pure logic, no three.js: src/ambient/ambient.js calls hearHorn
// for the cows and the dog, src3/world3d/people3d.js for the locals, the
// renderers read the results, and tools/check-horn.mjs tests it.
//
// Each listener reacts after its own short delay (from its seed), so a herd
// or a row of people never moves as one.

import { fenceLine, project, runSpan } from './farmDog.js';

// Distances in m, times in s.
export const HORN_HEAR = {
  local: 60, // a local this close waves (about where they turn to watch you)
  cow: 110, // a cow this close looks up
  dog: 180, // the farm dog hears it from this far off its fence
};
export const HORN_LOOK = {
  delay: 0.2, // a cow lifts its head after delay + seed * spread
  spread: 1.1,
  hold: 4, // and keeps it up hold + seed * holdSpread, staring
  holdSpread: 3,
  turn: 0.45, // the halfway pose on the way up and down (cowLook.js TURN)
};
export const HORN_WAVE = {
  delay: 0.25, // a local starts to wave after delay + seed * spread
  spread: 0.6,
};

// ---------- cows ----------

// A cow `dist` m from the horn at time `now`: returns its look { at, end }
// (head up from at to end), or the look it had if it's out of earshot. A cow
// already looking keeps looking a little longer instead of starting over.
export function cowHears(look, dist, seed, now) {
  if (!(dist < HORN_HEAR.cow)) return look || null;
  const at = now + HORN_LOOK.delay + seed * HORN_LOOK.spread;
  const end = at + HORN_LOOK.hold + seed * HORN_LOOK.holdSpread;
  if (look && look.at <= at && look.end > now) return { at: look.at, end: Math.max(look.end, end) };
  return { at, end };
}

// The cow's head pose at `now`: `base` (cowPose: 0 up, 1 halfway, 2 down)
// unless it's looking at you. A grazing cow passes through halfway going up
// and coming back down; one already up just stays up.
export function cowHornPose(look, now, base) {
  if (!look || now < look.at || now >= look.end + HORN_LOOK.turn) return base;
  if (base === 0) return 0;
  if (now < look.at + HORN_LOOK.turn || now >= look.end) return 1;
  return 0;
}

// ---------- locals ----------

// A local `dist` m from the horn. act: their peopleLook act state. Returns
// the seconds until they wave, or null for no wave (too far, walking, sitting,
// or already waving).
export function localHears(act, dist, seed, { moving = false, seated = false } = {}) {
  if (!(dist < HORN_HEAR.local) || moving || seated || act.wave > 0) return null;
  return HORN_WAVE.delay + seed * HORN_WAVE.spread;
}

// ---------- the farm dog ----------

// The farm dog hears the horn at (x, y): if it's within earshot of its
// fence it gets up and runs to the nearest spot on its run, barking (the
// chase in farmDog.js does the rest: it barks a while there, then trots
// home). Returns the next state; the old one is left alone.
export function dogHears(dog, st, x, y) {
  const me = project(fenceLine(dog), x, y);
  if (!(me.d < HORN_HEAR.dog)) return st;
  const [lo, hi] = runSpan(dog);
  return {
    ...st,
    mode: 'chase',
    calm: 0,
    goal: Math.max(lo, Math.min(hi, me.s)),
    // First bark right away: a quarter second to get up.
    barkT: st.mode === 'chase' && st.barkT > 0 ? Math.min(st.barkT, 0.25) : 0.25,
  };
}
