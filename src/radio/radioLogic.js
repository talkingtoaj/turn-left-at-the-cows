// Radio maths with no browser in it (safe to import from node checks).
// The player (./radio.js) uses these; tools/check-radio-logic.mjs tests them.
//
//   startPosition / advance / resumeAfterGap   where a station is in its loop (see below)
//   hearStep(state, clear, dt) when a station counts as heard (hysteresis)
//   nextSegment(station, pos)  the item after this place in the rotation
//   signalAt(distanceM)        0..1, how strong a mast is this far away
//   tuneQuality(freq, stFreq)  0..1, how well the dial sits on a station
//   mixFor(signal, quality)    voice level, static level and muffle for the sound
//   globalPos(region, x, y)    a point in the one shared map of the counties

import { STATIONS, SEGMENTS } from './segments.js';

export const DIAL_MIN = 540;
export const DIAL_MAX = 1600;
export const DIAL_STEP = 10;

// Each region has its own x, y. For the radio they sit in one shared frame, so
// a station in the other county is far away, not at some made-up spot. Fenwick
// is the frame. Brandt's west edge (its x 0, y 1700) is Route 40, 22 km east of
// Calder (4700, 1160).
export const REGION_ORIGIN = {
  fenwick: { x: 0, y: 0 },
  brandt: { x: 4700 + 22000, y: 1160 - 1700 },
};

export function globalPos(region, x, y) {
  const o = REGION_ORIGIN[region] || REGION_ORIGIN.fenwick;
  return { x: o.x + x, y: o.y + y };
}

// Distance (m) to signal. About 0.86 at 1 km, 0.23 at 5.5 km (the far end of
// Fenwick from the Ashford mast), 0.03 at 27 km (the other county).
export const SIGNAL_RANGE = 2500;
export function signalAt(d) {
  return 1 / (1 + Math.pow(Math.max(0, d) / SIGNAL_RANGE, 1.5));
}

// The dial sits on a station within this many kHz and the voice comes through.
export const TUNE_WINDOW = 25;
export function tuneQuality(freq, stFreq) {
  const x = 1 - Math.abs(freq - stFreq) / TUNE_WINDOW;
  if (x <= 0) return 0;
  return x * x * (3 - 2 * x); // smoothstep
}

// What you hear. signal and quality are both 0..1.
//   voice   level of the station (0..1)
//   noise   level of the static (0..1)
//   lowpass muffle cutoff in Hz (a weak signal is dull)
export function mixFor(signal, quality) {
  const clear = signal * quality; // 1 = strong and right on the dial
  const voice = Math.pow(clear, 0.8);
  // Static is steady between stations and fades to a thin hiss on a strong one.
  const noise = 0.08 + 0.4 * (1 - Math.pow(clear, 0.6));
  const lowpass = 700 + 2900 * Math.pow(clear, 0.7);
  return { voice, noise, lowpass };
}

// ---------------------------------------------------------------- schedule

const BY_ID = new Map(SEGMENTS.map((s) => [s.id, s]));
export const segmentById = (id) => BY_ID.get(id);

const loopCache = new Map();
function loopOf(station) {
  let l = loopCache.get(station.id);
  if (!l) {
    const segs = station.rotation.map((id) => BY_ID.get(id));
    const length = segs.reduce((a, s) => a + s.seconds, 0);
    l = { segs, length };
    loopCache.set(station.id, l);
  }
  return l;
}

export function loopLength(station) {
  return loopOf(station).length;
}

// A station's place in its loop is { index, offset }: which item of the rotation
// and how many seconds into it. It only moves while the station is heard.
export const segmentAt = (station, pos) => loopOf(station).segs[pos.index];

// A mission starts each station at the start of a random item. rand is
// Math.random in the game and a fixed function in the checks.
export function startPosition(station, rand = Math.random) {
  const n = loopOf(station).segs.length;
  return { index: Math.min(n - 1, Math.floor(rand() * n)), offset: 0 };
}

// Move forward dt seconds, rolling into the next item (and from the last back
// to the first) when one ends.
export function advance(station, pos, dt) {
  const { segs } = loopOf(station);
  let index = pos.index;
  let offset = pos.offset + Math.max(0, dt);
  for (let guard = 0; offset >= segs[index].seconds && guard < 10000; guard++) {
    offset -= segs[index].seconds;
    index = (index + 1) % segs.length;
  }
  return { index, offset };
}

// A short gap is as if it kept playing. A longer one lands in the item after
// the one that was playing, a little way in (music and jingles 3 s, talk 1 s).
export const GAP_CARRY_ON = 5;
export const RESUME_IN_MUSIC = 3;
export const RESUME_IN_TALK = 1;
export function resumeAfterGap(station, pos, gapSec) {
  if (gapSec < GAP_CARRY_ON) return advance(station, pos, gapSec);
  const { segs } = loopOf(station);
  const index = (pos.index + 1) % segs.length;
  const seg = segs[index];
  const into = seg.spoken ? RESUME_IN_TALK : RESUME_IN_MUSIC;
  return { index, offset: Math.min(into, seg.seconds / 2) };
}

// Heard = radio on, dial on the station, and clear (signal x dial quality)
// high enough. At clear 0.1 the voice is about 16% against static at 0.38 and
// the muffle is near 1.3 kHz, so it is mostly buried. Lost when clear stays
// under HEAR_LOST for HEAR_LOST_AFTER seconds, back at HEAR_BACK or more (the
// gap between the two stops flicker at the edge).
export const HEAR_LOST = 0.1;
export const HEAR_BACK = 0.14;
export const HEAR_LOST_AFTER = 1;
export function hearStep(state, clear, dt) {
  if (!state.heard) return { heard: clear >= HEAR_BACK, lowFor: 0 };
  if (clear >= HEAR_LOST) return { heard: true, lowFor: 0 };
  const lowFor = state.lowFor + dt;
  return { heard: lowFor < HEAR_LOST_AFTER, lowFor };
}

// Takes a position, not a segment: the jingle comes up more than once a loop.
export function nextSegment(station, pos) {
  const { segs } = loopOf(station);
  return segs[(pos.index + 1) % segs.length];
}

export { STATIONS };
