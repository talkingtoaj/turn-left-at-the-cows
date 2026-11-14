// The game clock (SPEC 9o). Engine-free.
//
// It runs at real speed: one game minute per real minute. The dash shows it
// CLOCK_FAST_MIN minutes fast (the car's clock was never right). Each mission
// starts at its own hour (startMinutes in missionList.js). A tow or repair
// still moves the clock on (SPEC 9k). The sun does not follow the clock: each
// mission has one fixed sun (src3/look/missionLook.js).

export const CLOCK_FAST_MIN = 4; // the dash runs this many minutes ahead
export const GAME_MIN_PER_MS = 1 / 60000; // real speed

// The weather and the rain were tuned when the clock ran 10x real time.
// They keep that pace in real time by counting small steps (normal frames)
// 10x. A big jump (a tow or a repair) counts as it is.
export const WEATHER_SPEED = 10;
export function weatherMinutes(d) {
  return d < 1 ? d * WEATHER_SPEED : d;
}

// Game minutes the trip timer gains for `minutes` of clock jump.
export function minutesToMs(minutes) {
  return minutes * 60000;
}
