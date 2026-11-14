// Checks the clock rules (SPEC 9o): each mission has its own start hour, the
// dash shows the clock 4 minutes fast, a tow moves the clock on, and the
// weather keeps its old pace in real time.
//   node tools/check-clock.mjs
import { MISSION_LIST } from '../src/game/missionList.js';
import { CLOCK_FAST_MIN, GAME_MIN_PER_MS, weatherMinutes, WEATHER_SPEED, minutesToMs } from '../src/game/clock.js';
import { clockText } from '../src/hud/format.js';
import { applyTow } from '../src/game/tow.js';

let bad = 0;
const eq = (name, got, want) => {
  const ok = got === want || (typeof want === 'number' && Math.abs(got - want) < 1e-9);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`);
};

eq('mission 1 start', MISSION_LIST[0].startMinutes, 9 * 60);
eq('mission 2 start', MISSION_LIST[1].startMinutes, 16 * 60);
eq('mission 3 start', MISSION_LIST[2].startMinutes, 18 * 60 + 30);
eq('dash fast by', CLOCK_FAST_MIN, 4);
eq('dash at 09:00', clockText(9 * 60), '09:04');
eq('dash wraps midnight', clockText(23 * 60 + 58), '00:02');
eq('one real minute is one game minute', 60000 * GAME_MIN_PER_MS, 1);
eq('a normal frame (16 ms) keeps the old weather pace', weatherMinutes(16 * GAME_MIN_PER_MS), 16 * GAME_MIN_PER_MS * WEATHER_SPEED);
eq('a 30 minute tow counts 30 for the weather', weatherMinutes(30), 30);

const state = { clockMinutes: 18 * 60 + 40, elapsedMs: 0, tows: 0, car: { x: 0, y: 0, heading: 0, speed: 5 }, damage: null };
applyTow(state, { x: 10, y: 20, heading: 90 }, 30);
eq('a tow moves the clock on', state.clockMinutes, 19 * 60 + 10);
eq('and the trip timer by the same time', state.elapsedMs, minutesToMs(30));

if (bad) {
  console.log(`${bad} failed`);
  process.exit(1);
}
console.log('all ok');
