// Cloud shadows (#96, SPEC 9s item 10): the weather rules and the wind drift.
// - none in full overcast or rain, light in a clear sky, strongest in broken cloud
// - the pattern slides the way the wind blows, a few metres a second
// - same inputs always give the same result, and the numbers stay in range
// Checked over several calls with changing input, not one.
//
//   npm run check:cloudshadows     exits 1 on any problem

import { cloudShadowParams, thresholdFor, advanceOffset } from '../src3/world3d/cloudShadowMath.js';

const bad = [];
const ok = (c, m) => { if (!c) bad.push(m); };

// Weather sweep: sunny (cover 0.22) through broken (0.6) to cloudy (1), then overcast and rain.
let prev = null;
for (const cover of [0.22, 0.3, 0.45, 0.6, 0.8, 1]) {
  const p = cloudShadowParams(cover, 0, 0);
  ok(p.amt > 0 && p.amt < 0.5, `cover ${cover}: amt ${p.amt} out of range`);
  ok(p.frac > 0.1 && p.frac < 0.6, `cover ${cover}: frac ${p.frac} out of range`);
  if (prev) ok(p.amt >= prev.amt - 1e-9 && p.frac >= prev.frac - 1e-9, `cover ${cover}: shadows got weaker as cloud grew`);
  prev = p;
}
const sunny = cloudShadowParams(0.22, 0, 0);
const broken = cloudShadowParams(0.8, 0, 0);
ok(broken.amt > sunny.amt * 1.5, 'broken cloud should be much darker than a clear sky');
ok(broken.frac > sunny.frac, 'broken cloud should cover more land than a clear sky');
ok(sunny.amt > 0, 'a clear sky still has light shadows');

// Overcast fades them out, in steps, to nothing.
let last = Infinity;
for (const grey of [0, 0.25, 0.5, 0.75, 1]) {
  const p = cloudShadowParams(1, grey, 0);
  ok(p.amt <= last + 1e-9, `grey ${grey}: shadow got darker as the sky greyed`);
  last = p.amt;
}
ok(cloudShadowParams(1, 1, 0).amt === 0, 'full overcast must have no shadows');
// Rain fades them out too, even under broken cloud.
last = Infinity;
for (const rain of [0, 0.1, 0.2, 0.4, 1]) {
  const p = cloudShadowParams(0.8, 0, rain);
  ok(p.amt <= last + 1e-9, `rain ${rain}: shadow got darker as the rain grew`);
  last = p.amt;
}
ok(cloudShadowParams(0.8, 0, 0.4).amt === 0, 'steady rain must have no shadows');
ok(cloudShadowParams(0.8, 0, 1).amt === 0, 'heavy rain must have no shadows');
// Back to fair weather: they come back (no state is kept).
ok(cloudShadowParams(0.8, 0, 0).amt === broken.amt, 'same input must give the same result');

// More land in shadow means a lower noise threshold.
ok(thresholdFor(0.45) < thresholdFor(0.2), 'a wider shadow share needs a lower threshold');
ok(thresholdFor(0.2) < 1 && thresholdFor(0.5) > 0, 'threshold out of 0..1');

// Drift: the way the wind blows (0 = north = -y, 90 = east = +x), a few m/s.
const off = { x: 0, y: 0 };
advanceOffset(off, 90, 3, 1);
ok(off.x > 3 && off.x < 12 && Math.abs(off.y) < 1e-6, `east wind should push east, got ${JSON.stringify(off)}`);
advanceOffset(off, 0, 3, 1);
ok(off.y < -3 && off.y > -12, `north wind should push to -y, got ${off.y}`);
const x0 = off.x;
for (let i = 0; i < 60; i++) advanceOffset(off, 90, 3, 1 / 60); // one second of small frames
const one = { x: 0, y: 0 };
advanceOffset(one, 90, 3, 1);
ok(Math.abs((off.x - x0) - one.x) < 1e-9, 'frame size must not change how far the shadows slide');
const w = { x: 0, y: 0 };
advanceOffset(w, 290, 3, 10);
ok(w.x < 0 && w.y < 0, 'a 290 degree wind blows west-north-west');

if (bad.length) { console.error('cloud shadow check FAILED:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('cloud shadow check ok');
