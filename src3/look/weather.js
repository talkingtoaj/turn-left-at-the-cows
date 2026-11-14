// Weather: the day drifts slowly between sunny, partly cloudy and overcast
// (SPEC 9h). One number, `w`, says where we are: 0 sunny, 0.5 partly cloudy,
// 1 overcast. Everything the weather touches is a blend of three key looks:
//   sky light (spherical harmonics), sun strength and colour, shadow
//   darkness, fog and horizon colour, the visible sky (clear photo, cloudy
//   photo, cloudy photo greyed out), and the cloud shadows on the ground.
// The sun's DIRECTION never changes (it is a navigation clue, SPEC 5); on an
// overcast stretch the sun is weak and shadows fade, so the clue is lost for
// a while.
//
// No extra passes: the sky light is a LightProbe whose 9 coefficients are
// blended on the CPU, and the sky dome mixes two small textures.
//
// Deterministic: the timeline is made from the world seed and the mission
// id, and runs on game minutes since the mission started, so a mission plays
// the same each time. A mission may pin its starting weather with an
// optional field `weather: 'sunny' | 'cloudy' | 'overcast'` (src/game/missions.js);
// without it the start comes from the seed too.
//
// Dev: ?weather=sunny|cloudy|overcast pins it; ?weather=cycle runs the
// timeline 15x faster for review; ?weather=<0..1> pins a raw value.

import * as THREE from 'three';
import { MISSIONS } from '../../src/game/missions.js';
import { weatherMinutes } from '../../src/game/clock.js';

export const W_OF = { sunny: 0, cloudy: 0.5, overcast: 1 };
const CYCLE_SPEED = 15;
const HOLD = [35, 90]; // game minutes a weather holds
const CHANGE = [14, 26]; // game minutes a change takes
const MISSION_BLEND = 12; // game minutes to ease into a new mission's weather

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A timeline of [{ t, w }] keys (game minutes): holds and smooth changes.
function timeline(seed, startW) {
  const rng = makeRng(seed);
  const pick = (from) => {
    if (from === 0) return 0.5;
    if (from === 1) return 0.5;
    return rng() < 0.55 ? 0 : 1; // partly cloudy goes either way
  };
  let w = startW === undefined ? [0, 0.5, 0.5, 1][Math.floor(rng() * 4)] : startW;
  const keys = [];
  let t = 0;
  for (let i = 0; i < 64; i++) {
    const hold = HOLD[0] + rng() * (HOLD[1] - HOLD[0]);
    keys.push({ t, w });
    t += hold;
    keys.push({ t, w });
    t += CHANGE[0] + rng() * (CHANGE[1] - CHANGE[0]);
    w = pick(w);
  }
  return keys;
}

function sample(keys, t) {
  if (t <= keys[0].t) return keys[0].w;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b.t) {
      const a = keys[i - 1];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return a.w + (b.w - a.w) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1].w;
}

// The weather clock: w over game time, per mission.
export function createWeatherClock(seed, param) {
  const pinned = param in W_OF ? W_OF[param] : (param !== null && param !== 'cycle' && Number.isFinite(Number(param)) ? THREE.MathUtils.clamp(Number(param), 0, 1) : null);
  const speed = param === 'cycle' ? CYCLE_SPEED : 1;
  let mission = -1;
  let keys = null;
  let t = 0;
  let lastClock = null;
  let w = pinned === null ? 0.5 : pinned;
  let from = null; // w when the mission changed, eased out over MISSION_BLEND
  return {
    get w() { return w; },
    update(state) {
      if (pinned !== null) return w;
      if (state.missionIndex !== mission) {
        const m = MISSIONS[state.missionIndex];
        const id = m ? m.id : String(state.missionIndex);
        const startW = m && m.weather in W_OF ? W_OF[m.weather] : undefined;
        if (mission !== -1) from = w;
        mission = state.missionIndex;
        keys = timeline((seed ^ hashStr(id)) >>> 0, startW);
        t = 0;
      }
      if (lastClock !== null) {
        let d = state.clockMinutes - lastClock;
        if (d < -720) d += 1440; // the clock wrapped past midnight
        if (d > 0 && d < 60) t += weatherMinutes(d) * speed;
      }
      lastClock = state.clockMinutes;
      w = sample(keys, t);
      if (from !== null) {
        const u = Math.min(1, t / (MISSION_BLEND * speed));
        w = from + (w - from) * u * u * (3 - 2 * u);
        if (u >= 1) from = null;
      }
      return w;
    },
  };
}

// ---------- the three key looks ----------

const lum3 = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const grey3 = (a, s, tint = [1, 1, 1]) => {
  const l = lum3(a) * s;
  return [l * tint[0], l * tint[1], l * tint[2]];
};

// cloudy, sunny: sky.json contents. opts: the URL knobs (sky, sun scale).
// Brightness is set per look by eye (the photos are each normalised so their
// sky alone gives 1 on an upward face): a sunny day is a bit brighter with
// a strong sun and deep shadows; overcast is dimmer, almost all sky light.
export function keyLooks(cloudy, sunny, opts, bounce) {
  const P = opts.sky;
  const S = opts.sun;
  const look = (sh, skyK, sun, sunK, horizon, extra) => {
    // Ground bounce scales with the light falling on the ground.
    const up = skyK + lum3(sun) * sunK * 0.5;
    const b = scale3(bounce, up / 4.7);
    const c = sh.map((v) => scale3(v, skyK * P));
    c[0] = c[0].map((v, i) => v + b[i] * 0.282095 * 2 * Math.PI * P);
    c[1] = c[1].map((v, i) => v - b[i] * 0.488603 * Math.PI * P);
    const sMax = Math.max(...sun);
    return {
      sh: c,
      sunColor: [(sun[0] / sMax) * 1.0, (sun[1] / sMax) * 0.97, (sun[2] / sMax) * 0.9],
      sun: sMax * sunK * P * S,
      fog: scale3(horizon, skyK * P),
      ...extra,
    };
  };
  const sunnyK = { sky: 0.66, sun: 0.46 };
  const overK = { sky: 2.3, sun: 0.11 };
  // Overcast: the cloudy sky greyed, its brightness evened out (a little
  // brighter overhead than at the horizon, no bright side towards the sun).
  const ovSh = cloudy.sh.map((v, i) => {
    if (i === 0) return grey3(v, 1, [0.97, 1.0, 1.04]);
    if (i === 1) return grey3(v, 0.8, [0.97, 1.0, 1.04]);
    return grey3(v, 0.12);
  });
  return [
    look(sunny.sh, sunnyK.sky, sunny.sun, sunnyK.sun, sunny.horizon,
      { skyMix: 0, grey: 0, gain: sunnyK.sky * P, shadow: 1, cover: 0.22, dark: 0.32 }),
    look(cloudy.sh, 1, cloudy.sun, 1, cloudy.horizon,
      { skyMix: 1, grey: 0, gain: P, shadow: 1, cover: 1, dark: 0.3 }),
    look(ovSh, overK.sky, cloudy.sun, overK.sun, grey3(cloudy.horizon, 0.82, [0.98, 1.0, 1.03]),
      { skyMix: 1, grey: 1, gain: 1.5 * P, shadow: 0.35, cover: 1, dark: 0.08 }),
  ];
}

// Blend of the key looks at w, written into `out` (reused every frame).
export function lookAt(keys, w, out) {
  const x = THREE.MathUtils.clamp(w, 0, 1) * 2;
  const i = Math.min(1, Math.floor(x));
  const u = x - i;
  const a = keys[i];
  const b = keys[i + 1];
  const m = (p, q) => p + (q - p) * u;
  for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) out.sh[k][c] = m(a.sh[k][c], b.sh[k][c]);
  for (let c = 0; c < 3; c++) {
    out.sunColor[c] = m(a.sunColor[c], b.sunColor[c]);
    out.fog[c] = m(a.fog[c], b.fog[c]);
  }
  for (const k of ['sun', 'skyMix', 'grey', 'gain', 'shadow', 'cover', 'dark']) out[k] = m(a[k], b[k]);
  return out;
}

export function emptyLook() {
  return { sh: Array.from({ length: 9 }, () => [0, 0, 0]), sunColor: [1, 1, 1], fog: [1, 1, 1] };
}
