// One look per mission (SPEC 9o): a fixed hour, a fixed sun, and the light,
// haze and grade that go with it. The sun never moves during a mission and
// there is no day and night cycle. The clock still runs (src/game/clock.js,
// start hour per mission in src/game/missionList.js) but the light does not
// follow it. Weather and rain (weather.js, wetness.js) work on top of this.
//
//   az, el     sun bearing (degrees from north, clockwise) and height
//   sunTint    multiplies the sun colour (linear rgb)
//   sunK       multiplies the sun strength (a low sun needs more, or the
//              ground goes dark: light on flat ground is sin(el))
//   skyTint    multiplies the sky light and the sky photo (the sky photo itself
//              is the same; this warms or cools it)
//   fogTint    multiplies the fog and horizon colour
//   fogNear, fogFar   multiply the fog distances (mist is closer fog)
//   grade      overrides for makeGrade (look/grade.js). The colour part of the
//              grade is compiled once, so per mission only the screen overlay
//              knobs (vig, grain) and `wash` ([r, g, b, alpha 0..1], a faint
//              colour over the whole picture) change.

import { MISSION_LIST } from '../../src/game/missionList.js';

const LOOKS = {
  // 09:00, light morning mist: the old morning sun, softer, paler, closer fog.
  m1_parcel: {
    az: 112, el: 30,
    sunTint: [1, 0.98, 0.94], sunK: 0.92,
    skyTint: [1.0, 1.0, 1.02], fogTint: [1.06, 1.06, 1.08],
    fogNear: 0.55, fogFar: 0.8,
    grade: { vig: 0.28, wash: [235, 240, 245, 0.05] },
  },
  // 16:00, warm afternoon: sun in the west-south-west, a little lower.
  m2_cabin: {
    az: 245, el: 26,
    sunTint: [1.0, 0.9, 0.74], sunK: 1.05,
    skyTint: [1.03, 0.99, 0.92], fogTint: [1.05, 0.98, 0.86],
    fogNear: 1, fogFar: 1,
    grade: { vig: 0.3, wash: [255, 190, 110, 0.06] },
  },
  // 18:30, golden hour: sun low in the west, long shadows, warm and strong.
  m3_airfield: {
    az: 285, el: 12,
    sunTint: [1.0, 0.72, 0.42], sunK: 2.1,
    skyTint: [1.08, 0.94, 0.8], fogTint: [1.1, 0.92, 0.72],
    fogNear: 0.95, fogFar: 0.95,
    grade: { vig: 0.34, wash: [255, 160, 70, 0.1] },
  },
};

const NEUTRAL = {
  az: 112, el: 30, sunTint: [1, 1, 1], sunK: 1, skyTint: [1, 1, 1], fogTint: [1, 1, 1], fogNear: 1, fogFar: 1, grade: {},
};

// The look for mission `index` (an index into MISSION_LIST). Dev: ?missionlook=1|2|3
// (look.js) forces one mission's look whatever the mission.
export function missionLookFor(index, force = null) {
  const m = MISSION_LIST[force !== null ? force : index];
  return (m && LOOKS[m.id]) || NEUTRAL;
}
