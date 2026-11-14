// Radio maths with no browser in it (safe to import from node checks).
// The player (./radio.js) uses these; tools/check-radio-logic.mjs tests them.
//
//   stationClock(station, t)   which segment is on air at t seconds, and how far in
//   nextSegment(station, seg)  the one after it in the rotation
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

// Each station keeps its own clock: seconds since the game started, plus a
// private head start so the two stations are never at the same point.
export function stationPhase(station) {
  let h = 0;
  for (const c of station.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 997) * 3.7;
}

export function stationClock(station, tSec) {
  const { segs, length } = loopOf(station);
  let t = (((tSec + stationPhase(station)) % length) + length) % length;
  for (let i = 0; i < segs.length; i++) {
    if (t < segs[i].seconds) return { index: i, segment: segs[i], offset: t, remaining: segs[i].seconds - t };
    t -= segs[i].seconds;
  }
  const last = segs.length - 1;
  return { index: last, segment: segs[last], offset: 0, remaining: segs[last].seconds };
}

export function nextSegment(station, seg) {
  const { segs } = loopOf(station);
  const i = station.rotation.indexOf(seg.id);
  return segs[(i + 1) % segs.length];
}

export { STATIONS };
