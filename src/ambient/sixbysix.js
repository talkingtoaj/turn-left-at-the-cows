// The surplus 6x6 (#45, SPEC 9q tier 2): a farmer's ex-army truck, bought
// cheap at a surplus sale, faded army paint and a wooden cargo bed. Rare on
// the road: mostly it sits parked at a farm. Traffic slot car5 (normally the
// farm truck) drives it on some missions only, seeded by the mission, so a
// replay of a mission meets the same truck.
//
//   setSixBySixDay(`${seed}:${missionId}`, params.get('sixbysix'))  // once per region build
//   sixBySixOn()                 // true when car5 is the 6x6 today
//   sixBySixPaint('car5')        // { color, color2, age }: faded olive or tan
//
// Pure: no three.js here (the 3D side is src3/world3d/sixbysix3d.js).

import { makeRng, hashString } from '../drive/geom.js';
import { weather } from './carpaint.js';

export const SIX_SLOT = 5; // car5, car15, ...: the farm truck's slot
export const SIX_ODDS = 0.25; // share of missions it drives instead of the farm truck

let on = false;
// key: anything that names the day (world seed and mission id). force: 'on' |
// 'off' (the ?sixbysix dev flag) or null for the seeded roll.
export function setSixBySixDay(key, force = null) {
  if (force === 'on' || force === 'off') on = force === 'on';
  else on = sixBySixRoll(key);
  return on;
}
export const sixBySixRoll = (key) => (hashString(`6x6:${key}`) % 1000) / 1000 < SIX_ODDS;
export const sixBySixOn = () => on;

// Old army paint, decades in the sun: olive drab, a greener forest green, or
// a darker tan. Old, sun-faded paint (age 0.75 to 0.9: duller, not chalk white).
const ARMY = [0x4b5320, 0x4b5320, 0x3f4a2c, 0x56583a, 0x857650];
export function sixBySixPaint(id) {
  const r = makeRng(hashString(`6x6paint:${id}`) || 1);
  const base = ARMY[Math.floor(r() * ARMY.length)];
  const age = 0.75 + 0.15 * r();
  return { color: weather(base, r, age), color2: null, age };
}
