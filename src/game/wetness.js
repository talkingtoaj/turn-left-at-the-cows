// Rain and wet ground (round 8). Plain logic, no engine code. The weather
// (src3/look/weather.js: w = 0 sunny .. 1 overcast) drives it:
//
//   rain    0..1  how hard it rains now. Only when overcast enough (w above
//                 RAIN_FROM); how hard drifts slowly and deterministically
//                 between a drizzle and a downpour over game time. Not every
//                 overcast spell rains: one in DRY_EVERY stays dry (which
//                 one is seeded per mission, see spellDry).
//   wet     0..1  how wet the ground is. Rises while it rains (dry to soaked
//                 in about WET_UP game minutes of full rain), dries slowly
//                 once it stops (DRY_OVERCAST minutes under cloud, DRY_SUN in
//                 sunshine).
//   puddle  0..1  how full the puddles are. They fill behind the wet ground
//                 and drain slower still, so they last well after the rain.
//
// Time is game minutes (the game clock runs 10x real time, so 1 game minute
// is 6 s), sped up with ?weather=cycle like the weather. Everything is a
// function of the weather and game time from the mission start, so a mission
// plays the same each time.
//
//   const W = createWetness(seed, { rain: 'on'|'off'|null, wet: 0..1|null, speed, opening: true|false })
//   W.update(state, w)    every frame; returns W
//   W.rain, W.wet, W.puddle
//   W.spell, W.dry   overcast spells so far this mission (0 before the
//                    first), and whether the current one stays dry
//   W.rainbow 0..1   the opening's rainbow (src/game/opening.js), else 0
//   W.gloom   0..1   the opening's dark cloud (as storm darkening), else 0
//   W.restart()      start the current mission's opening over (a replay)
//
// Mission 1 opens in steady rain on soaked ground that eases off within a
// minute (src/game/opening.js); the ground then dries in the sun as usual.
//
// Dev: ?rain=on (rain now, ground already soaked unless ?wet is given),
// ?rain=off (never rains), ?wet=<0..1> pins the ground's wetness and the
// puddles. Handling numbers live in src/game/damage.js (TUNING.wet).

import { weatherMinutes } from './clock.js';
import { openingFor, openingAt, OPENING } from './opening.js';

export const WETNESS = {
  RAIN_FROM: 0.8, // weather w where rain can start...
  RAIN_FULL: 0.95, // ...and where it can be at full strength
  RAIN_MIN: 0.45, // the lightest rain of a rainy spell (x the w ramp)
  WET_UP: 14, // game minutes of full rain from dry to soaked
  DRY_OVERCAST: 80, // game minutes from soaked to dry under cloud
  DRY_SUN: 45, // ... and in full sun
  PUDDLE_UP: 22, // puddles fill (from empty to full, following the wet ground)
  PUDDLE_DOWN: 130, // and drain this slowly
  START: 0.7, // at a mission start in the rain, the ground is already this wet
  DRY_EVERY: 3, // one overcast spell in this many stays dry
  SPELL_END: 0.72, // an overcast spell ends when w drops below this (starts above RAIN_FROM)
};

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Whether overcast spell n (1, 2, ...) of a mission stays dry: one in every
// DRY_EVERY, at a seeded offset per mission, so dry spells come evenly.
export function spellDry(seed, missionIndex, n) {
  const off = hashStr(`dry:${seed}:${missionIndex}`) % WETNESS.DRY_EVERY;
  return (n - 1 + off) % WETNESS.DRY_EVERY === 0;
}

export function createWetness(seed, opts = {}) {
  const forceRain = opts.rain === 'on' ? 1 : opts.rain === 'off' ? 0 : null;
  const pinWet = Number.isFinite(opts.wet) ? Math.max(0, Math.min(1, opts.wet)) : null;
  const speed = opts.speed || 1;
  const useOpening = opts.opening !== false;
  // Seeded phases for the drizzle / downpour drift (periods 9 to 31 game minutes).
  const h = hashStr(`rain:${seed}`);
  const ph = [h & 1023, (h >>> 10) & 1023, (h >>> 20) & 1023].map((v) => (v / 1024) * Math.PI * 2);
  const strength = (t) => 0.5 + 0.5 * (0.5 * Math.sin(t / 31 * 6.283 + ph[0]) + 0.3 * Math.sin(t / 17 * 6.283 + ph[1]) + 0.2 * Math.sin(t / 9 * 6.283 + ph[2]));
  let t = 0; // game minutes since the first update (x speed)
  let lastClock = null;
  let started = false;
  let mission = null;
  let inSpell = false;
  let tm = 0; // weather minutes since this mission started (x speed)
  let opening = false;
  const W = {
    rain: 0,
    wet: pinWet ?? 0,
    puddle: pinWet ?? 0,
    t: 0,
    spell: 0,
    dry: false,
    rainbow: 0,
    gloom: 0,
    restart() {
      mission = null; // the next update starts the mission afresh
    },
    rainAt(w, tt) {
      if (forceRain !== null) return forceRain;
      if (W.dry) return 0;
      const ramp = smooth(WETNESS.RAIN_FROM, WETNESS.RAIN_FULL, w);
      if (ramp <= 0) return 0;
      return ramp * (WETNESS.RAIN_MIN + (1 - WETNESS.RAIN_MIN) * strength(tt));
    },
    update(state, w) {
      let dMin = 0;
      if (lastClock !== null) {
        let d = state.clockMinutes - lastClock;
        if (d < -720) d += 1440;
        if (d > 0 && d < 60) dMin = weatherMinutes(d) * speed;
      }
      lastClock = state.clockMinutes;
      t += dMin;
      tm += dMin;
      W.t = t;
      // Overcast spells, counted afresh each mission.
      if (state.missionIndex !== mission) {
        mission = state.missionIndex;
        W.spell = 0;
        inSpell = false;
        tm = 0;
        opening = useOpening && forceRain === null && openingFor(mission);
        if (opening && pinWet === null) {
          started = true;
          W.wet = OPENING.WET;
          W.puddle = OPENING.PUDDLE;
        }
      }
      if (!inSpell && w > WETNESS.RAIN_FROM) {
        inSpell = true;
        W.spell++;
        W.dry = spellDry(seed, mission, W.spell);
      } else if (inSpell && w < WETNESS.SPELL_END) {
        inSpell = false;
        W.dry = false;
      }
      const o = opening ? openingAt(tm) : null;
      W.rainbow = o && forceRain === null ? o.rainbow : 0;
      W.gloom = o && forceRain === null ? o.gloom : 0;
      W.rain = o && forceRain === null ? o.rain : W.rainAt(w, t);
      if (!started) {
        started = true;
        if (pinWet === null) {
          const r = forceRain === 1 ? 1 / WETNESS.START : W.rain;
          W.wet = Math.min(1, r * WETNESS.START);
          W.puddle = W.wet * 0.85;
        }
      }
      if (pinWet !== null) return W;
      if (W.rain > 0.02) {
        W.wet = Math.min(1, W.wet + (W.rain / WETNESS.WET_UP) * dMin);
      } else {
        const dry = WETNESS.DRY_OVERCAST + (WETNESS.DRY_SUN - WETNESS.DRY_OVERCAST) * (1 - Math.min(1, w * 1.4));
        W.wet = Math.max(0, W.wet - dMin / dry);
      }
      // Puddles follow the wet ground up, and drain slowly behind it.
      if (W.wet > W.puddle) W.puddle = Math.min(W.wet, W.puddle + dMin / WETNESS.PUDDLE_UP);
      else if (W.rain <= 0.02) W.puddle = Math.max(W.wet, W.puddle - dMin / WETNESS.PUDDLE_DOWN);
      return W;
    },
  };
  return W;
}
