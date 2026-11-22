// Checks the traffic look logic (#40, #50, SPEC 9q):
// - paint (src/ambient/carpaint.js): seeded, mostly plain real colors, no
//   toy colors (baby blue, pink, mustard), sun-fade only dulls;
// - fine body choice (src3/world3d/trafficlod.js): the fade follows distance,
//   only the nearest few cars get the fine body, and losing a place slides
//   the fade over several ticks instead of snapping.
//   node tools/check-traffic-look.mjs
import { carPaint, PALETTE } from '../src/ambient/carpaint.js';
import { createFineLod, distanceFade, FINE_NEAR, FINE_FAR, FINE_MAX, GATE_RATE } from '../src3/world3d/trafficlod.js';

let bad = 0;
const ok = (name, cond, info = '') => {
  if (!cond) bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? `: ${info}` : ''}`);
};

// HSV of an sRGB hex: [hue 0..360, sat 0..1, value 0..1].
function hsv(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
// A toy or cartoon color: bright and strong, or pink / magenta, or baby blue.
function toy(hex) {
  const [h, s, v] = hsv(hex);
  if (s > 0.25 && h > 280 && h < 350) return 'pink';
  if (s > 0.2 && v > 0.65 && h > 180 && h < 240) return 'baby blue';
  if (s > 0.45 && v > 0.65) return 'bright';
  if (s > 0.75) return 'saturated';
  return '';
}

// Paint.
const ids = Array.from({ length: 2000 }, (_, i) => `car${i}`);
const paints = ids.map(carPaint);
ok('same id, same paint', ids.every((id, i) => JSON.stringify(carPaint(id)) === JSON.stringify(paints[i])));
ok('different ids, different paint', new Set(paints.map((p) => p.color)).size > 300, `${new Set(paints.map((p) => p.color)).size} shades`);
const toys = paints.flatMap((p) => [p.color, p.color2].filter((c) => c != null)).filter(toy);
ok('no toy colors', toys.length === 0, toys.slice(0, 5).map((c) => `${c.toString(16)} ${toy(c)}`).join(', '));
ok('no toy colors in the palette', PALETTE.every(([c]) => !toy(c)));
const plain = paints.filter((p) => {
  const [, s, v] = hsv(p.color);
  return s < 0.2 || v < 0.3;
}).length / paints.length;
ok('mostly plain (white, silver, gray, black, dark)', plain > 0.55, `${(plain * 100).toFixed(0)}%`);
const two = paints.filter((p) => p.color2 != null).length / paints.length;
ok('some cars carry a second tone', two > 0.3 && two < 0.6, `${(two * 100).toFixed(0)}%`);
ok('ten traffic cars: at least 6 distinct colors', new Set(paints.slice(0, 10).map((p) => p.color)).size >= 6);
// Sun fade: the oldest cars are duller than their base color on average.
const satOf = (list) => list.reduce((s, p) => s + hsv(p.color)[1], 0) / list.length;
const old = paints.filter((p) => p.age > 0.85);
const young = paints.filter((p) => p.age < 0.4);
ok('older cars are duller', satOf(old) < satOf(young), `sat ${satOf(old).toFixed(3)} vs ${satOf(young).toFixed(3)}`);

// Fine body fade.
ok('fully fine inside FINE_NEAR', distanceFade(FINE_NEAR - 1) === 1 && distanceFade(5) === 1);
ok('fully coarse past FINE_FAR', distanceFade(FINE_FAR) === 0 && distanceFade(100) === 0);
ok('fade falls steadily across the band', distanceFade(38) > distanceFade(40) && distanceFade(40) > distanceFade(42));
{
  // A car driving away: fade goes 1 -> 0 through the band, tick by tick.
  const lod = createFineLod();
  const seen = [];
  for (let d = 30; d <= 50; d += 1) seen.push(lod.step([{ id: 'a', d }], 1 / 60).get('a'));
  const mono = seen.every((f, i) => i === 0 || f <= seen[i - 1]);
  const steps = seen.filter((f) => f > 0 && f < 1).length;
  ok('driving away: fade only falls, with in-between steps', mono && steps >= 5, seen.map((f) => f.toFixed(2)).join(' '));
}
{
  // More cars close than FINE_MAX: only the nearest get the fine body.
  const lod = createFineLod();
  const cars = Array.from({ length: FINE_MAX + 3 }, (_, i) => ({ id: `c${i}`, d: 5 + i * 3 }));
  const f = lod.step(cars, 0.016);
  const fine = [...f.values()].filter((v) => v > 0).length;
  ok('at most FINE_MAX fine bodies', fine === FINE_MAX, `${fine}`);
  ok('the nearest ones', cars.slice(0, FINE_MAX).every((c) => f.get(c.id) === 1) && cars.slice(FINE_MAX).every((c) => f.get(c.id) === 0));
  // A new car arrives nearest: the last of the fine ones slides out over ticks.
  const out = cars[FINE_MAX - 1].id;
  const more = [{ id: 'new', d: 2 }, ...cars];
  const a = lod.step(more, 0.05).get(out);
  const b = lod.step(more, 0.05).get(out);
  let c = b;
  for (let k = 0; k < 20; k++) c = lod.step(more, 0.05).get(out);
  ok('bumped car fades out over several ticks', a < 1 && a > 0 && b < a && c === 0, `${a.toFixed(2)} ${b.toFixed(2)} ${c}`);
  ok('the new nearest car is fine at once (never seen before)', lod.step(more, 0.05).get('new') === 1);
  ok('gate rate is what the ticks show', Math.abs(1 - a - GATE_RATE * 0.05) < 1e-9);
}
{
  // Cars that leave the list are forgotten (no growth).
  const lod = createFineLod();
  for (let k = 0; k < 50; k++) lod.step([{ id: `x${k}`, d: 10 }], 0.016);
  const f = lod.step([{ id: 'y', d: 10 }], 0.016);
  ok('only listed cars come back', f.size === 1 && f.get('y') === 1);
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
