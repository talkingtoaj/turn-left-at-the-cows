// Mud on the player's car (#73). Plain logic, no engine code: how muddy the
// car is (0 clean .. 1 caked) from where it drives, how fast, and the rain.
//
//   - Dirt roads build mud, faster at speed (none below MIN_SPEED) and much
//     faster on wet ground (wetness.js wet), when it is real mud, not dust.
//     Grass off-road builds it more slowly.
//   - Rain washes it off (rain 0..1 from wetness.js), a little faster while
//     driving. On a dirt road in the rain, the road wins: the car stays muddy.
//   - Nothing else changes it: a muddy car on the highway stays muddy, so a
//     local can tell you came in off the dirt.
//
// Time is real seconds (the frame dt), so it reads the same at any clock speed.
//
//   mud = stepMud(mud, dt, { surface: 'dirt'|'grass'|'paved'|null, speed m/s, rain 0..1, wet 0..1 })

export const MUD = {
  DIRT_UP: 150, // s of dry dirt road at SPEED_FULL from clean to caked
  GRASS: 0.5, // grass builds this much of the dirt road's rate
  WET_BOOST: 2.5, // on soaked ground mud builds this many times faster
  MIN_SPEED: 3, // m/s: slower than this throws up nothing
  SPEED_FULL: 15, // m/s: the full rate from here up
  WASH: 180, // s of full rain parked from caked to clean
  WASH_DRIVE: 0.5, // driving at SPEED_FULL in rain washes this much faster
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function stepMud(mud, dt, { surface = null, speed = 0, rain = 0, wet = 0 } = {}) {
  if (!(dt > 0)) return clamp01(mud);
  const v = Math.abs(speed);
  const fast = clamp01((v - MUD.MIN_SPEED) / (MUD.SPEED_FULL - MUD.MIN_SPEED));
  const ground = surface === 'dirt' ? 1 : surface === 'grass' ? MUD.GRASS : 0;
  const build = (ground * fast * (1 + (MUD.WET_BOOST - 1) * clamp01(wet))) / MUD.DIRT_UP;
  const wash = (clamp01(rain) * (1 + MUD.WASH_DRIVE * clamp01(v / MUD.SPEED_FULL))) / MUD.WASH;
  return clamp01(mud + (build - wash) * dt);
}
