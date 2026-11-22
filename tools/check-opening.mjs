// Checks mission 1's opening (#51, src/game/opening.js): rain that clears
// in 40 to 60 s with a rainbow, the same every time and on a replay, and the
// weather and wetness carrying on normally after it.
//   node tools/check-opening.mjs
import { openingAt, openingFor, OPENING } from '../src/game/opening.js';
import { createWetness } from '../src/game/wetness.js';
import { createWeatherClock } from '../src3/look/weather.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };

ok(openingFor(0) && !openingFor(1) && !openingFor(2), 'only mission 1 opens in clearing rain');

// Run a mission for secs real seconds, one frame a second (the clock runs at real speed).
function run(missionIndex, secs, opts = {}, w0 = null, wc0 = null) {
  const wet = w0 || createWetness(7, opts);
  const wc = wc0 || createWeatherClock(7, null, opts);
  const state = { missionIndex, clockMinutes: 9 * 60 };
  const out = [];
  for (let s = 0; s <= secs; s++) {
    state.clockMinutes = 9 * 60 + s / 60;
    const w = wc.update(state);
    wet.update(state, w);
    out.push({ s, w, rain: wet.rain, wet: wet.wet, puddle: wet.puddle, bow: wet.rainbow });
  }
  return { out, wet, wc };
}

const a = run(0, 400);
const at = (s) => a.out[s];
ok(at(1).rain > 0.55 && at(1).w > 0.99, 'opens in steady rain under dark cloud: ' + JSON.stringify(at(1)));
ok(at(1).wet >= 0.99 && at(1).puddle > 0.8, 'opens on soaked ground with puddles');
ok(at(10).rain > 0.55, 'still raining at 10 s');
ok(at(30).rain < at(10).rain && at(30).rain > 0, 'easing at 30 s');
const stop = a.out.find((f) => f.s > 5 && f.rain <= 0.001).s;
ok(stop >= 40 && stop <= 60, 'rain stops between 40 and 60 s (at ' + stop + ')');
ok(at(58).w < 0.02, 'sun out by the end (w ' + at(58).w.toFixed(3) + ')');
const bowOn = a.out.filter((f) => f.bow > 0.05).map((f) => f.s);
const bowLen = bowOn.length ? bowOn[bowOn.length - 1] - bowOn[0] : 0;
ok(bowLen >= 14 && bowLen <= 24, 'rainbow shows for about 20 s (' + bowLen + ' s, from ' + bowOn[0] + ')');
ok(at(5).bow === 0 && at(70).bow === 0, 'no rainbow outside the clearing');
ok(Math.max(...a.out.slice(0, 61).map((f) => f.rain)) < 0.7, 'no lightning-strength rain in the opening');
// After: the normal weather carries on (starting sunny) and the ground dries over a few minutes.
ok(a.out.slice(61).every((f) => f.rain === 0), 'no rain right after the opening (sunny spell)');
ok(at(120).wet < at(61).wet && at(61).wet > 0.8, 'ground starts to dry once the sun is out');
ok(at(400).wet < 0.2, 'dry within a few minutes (wet ' + at(400).wet.toFixed(2) + ' at 400 s)');
ok(Math.abs(at(61).w - at(60).w) < 0.02, 'no jump in the weather when the opening hands over');

// Every time: a second run, and a replay (restart) on the same objects, match.
const b = run(0, 400);
ok(JSON.stringify(a.out) === JSON.stringify(b.out), 'plays the same every time');
a.wet.restart();
a.wc.restart();
const r = run(0, 120, {}, a.wet, a.wc);
ok(r.out[1].rain > 0.55 && r.out[1].wet >= 0.99 && r.out[1].w > 0.99, 'replay opens in rain again: ' + JSON.stringify(r.out[1]));
ok(Math.abs(r.out[50].rain - at(50).rain) < 1e-9 && Math.abs(r.out[45].bow - at(45).bow) < 1e-9, 'replay clears the same way');

// Other missions and dev switches.
const m2 = run(1, 30);
ok(m2.out.every((f) => f.bow === 0), 'mission 2 has no opening rainbow');
const off = run(0, 30, { opening: false });
ok(off.out[1].rain !== at(1).rain || off.out[1].w !== at(1).w, '?opening=off skips it');
const dry = run(0, 30, { rain: 'off' });
ok(dry.out.every((f) => f.rain === 0 && f.bow === 0), '?rain=off: no rain, no rainbow');
ok(OPENING.END_MIN > 0, 'OPENING.END_MIN set');

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('check-opening: all passed');
