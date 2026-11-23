// Checks the mud on the player's car (src/game/mud.js, #73) over many calls
// with changing input: it builds on dirt, faster when wet and at speed, never
// on pavement, stays put on a dry highway, washes off in rain, and stays in 0..1.
//   node tools/check-mud.mjs
import { stepMud, MUD } from '../src/game/mud.js';

let bad = 0;
const ok = (name, cond, info = '') => {
  if (!cond) bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? `: ${info}` : ''}`);
};
// Run a list of [seconds, input] legs at 60 fps; returns the mud after each leg.
const run = (start, legs) => {
  let m = start;
  return legs.map(([s, inp]) => {
    for (let t = 0; t < s; t += 1 / 60) m = stepMud(m, 1 / 60, inp);
    return m;
  });
};
const DIRT = { surface: 'dirt', speed: 18, rain: 0, wet: 0 };
const HWY = { surface: 'paved', speed: 25, rain: 0, wet: 0 };

// A trip: highway, a dirt road, back on the highway, then rain.
const [a, b, c, d, e] = run(0, [[60, HWY], [60, DIRT], [60, HWY], [30, { ...HWY, rain: 1, wet: 1 }], [200, { surface: 'paved', speed: 0, rain: 1, wet: 1 }]]);
ok('clean on the highway', a === 0, a.toFixed(3));
ok('a minute of dirt road makes it muddy', b > 0.3 && b < 0.5, b.toFixed(3));
ok('a dry highway keeps the mud on', c === b, c.toFixed(3));
ok('rain starts washing it', d < c - 0.1, d.toFixed(3));
ok('enough rain washes it clean', e === 0, e.toFixed(3));

// Rates: wet ground and speed build faster; crawling builds none; grass less.
const one = (inp) => run(0, [[20, inp]])[0];
ok('wet dirt builds faster than dry', one({ ...DIRT, wet: 1 }) > one(DIRT) * 2, `${one({ ...DIRT, wet: 1 }).toFixed(3)} vs ${one(DIRT).toFixed(3)}`);
ok('slow builds less than fast', one({ ...DIRT, speed: 8 }) < one(DIRT));
ok('a crawl throws up nothing', one({ ...DIRT, speed: MUD.MIN_SPEED - 0.5 }) === 0);
ok('reversing counts like forward', one({ ...DIRT, speed: -18 }) === one(DIRT));
ok('grass builds less than a dirt road', one({ ...DIRT, surface: 'grass' }) < one(DIRT) && one({ ...DIRT, surface: 'grass' }) > 0);
ok('pavement never builds', one({ ...HWY, wet: 1 }) === 0);

// A dirt road in the rain: the road wins, the car stays muddy.
const [r] = run(0, [[60, { ...DIRT, rain: 1, wet: 1 }]]);
ok('dirt road in the rain still muddies it', r > 0.3, r.toFixed(3));
// Driving in rain washes faster than parked.
const [p] = run(1, [[30, { surface: 'paved', speed: 0, rain: 1, wet: 1 }]]);
const [q] = run(1, [[30, { ...HWY, rain: 1, wet: 1 }]]);
ok('driving in rain washes faster than parked', q < p, `${q.toFixed(3)} vs ${p.toFixed(3)}`);
// Bounds, and a paused frame changes nothing.
const [top] = run(0.95, [[600, { ...DIRT, wet: 1 }]]);
ok('never above 1', top === 1);
ok('dt 0 changes nothing', stepMud(0.4, 0, { ...DIRT, rain: 1 }) === 0.4);
ok('a bad value clamps', stepMud(-3, 0.1, HWY) === 0 && stepMud(7, 0.1, HWY) === 1);

console.log(bad ? `\n${bad} check(s) failed` : '\nall mud checks passed');
process.exit(bad ? 1 : 0);
