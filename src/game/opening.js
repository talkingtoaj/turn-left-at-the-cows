// Mission 1's opening (SPEC 9q, #51): it always starts in steady rain under
// dark cloud on soaked roads; over the first minute the rain eases, the cloud
// breaks, the sun comes out and a faint rainbow shows opposite it for about
// 20 s. Then the mission's normal weather takes over, starting sunny.
//
// A pure function of time since the mission started, so it plays the same
// every time (replays too). Time is weather minutes (src/game/clock.js:
// WEATHER_SPEED of them per real minute), the same clock the weather
// (src3/look/weather.js) and the wetness (src/game/wetness.js) run on.
//
//   openingFor(missionIndex)  true when that mission opens this way
//   openingAt(tMin)           { w, rain, gloom, rainbow } during the opening, null after
//   OPENING.END_MIN           how long it lasts, in weather minutes
//
// Dev: ?opening=off skips it (shots of other things stay dry).

import { MISSION_LIST } from './missionList.js';
import { WEATHER_SPEED } from './clock.js';

const S = WEATHER_SPEED / 60; // weather minutes per real second

// Times in real seconds from the mission start.
export const OPENING = {
  RAIN: 0.62, // steady rain (below 0.7, so no lightning in the first minute)
  EASE_FROM: 14, // the rain starts to ease...
  RAIN_GONE: 46, // ...and has stopped
  SKY_FROM: 16, // the cloud starts to break...
  SKY_CLEAR: 55, // ...and the sun is fully out (w 0)
  BOW_IN: [34, 40], // the rainbow fades in...
  BOW_OUT: [52, 58], // ...and out: about 20 s in all
  GLOOM: 0.5, // dark cloud at the start (as the look's storm darkening)
  END: 60,
  WET: 1, // the ground at the start: soaked...
  PUDDLE: 0.85, // ...and the puddles nearly full
};
OPENING.END_MIN = OPENING.END * S;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function openingFor(missionIndex) {
  const m = MISSION_LIST[missionIndex];
  return !!(m && m.opening === 'clearing');
}

export function openingAt(tMin) {
  const s = tMin / S;
  if (!(s >= 0) || s >= OPENING.END) return null;
  const O = OPENING;
  return {
    w: 1 - smooth(O.SKY_FROM, O.SKY_CLEAR, s),
    rain: O.RAIN * (1 - smooth(O.EASE_FROM, O.RAIN_GONE, s)),
    gloom: O.GLOOM * (1 - smooth(O.SKY_FROM - 4, 40, s)),
    rainbow: smooth(O.BOW_IN[0], O.BOW_IN[1], s) * (1 - smooth(O.BOW_OUT[0], O.BOW_OUT[1], s)),
  };
}
