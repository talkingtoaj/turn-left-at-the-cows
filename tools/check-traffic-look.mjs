// Checks the traffic look logic (#40, #50, SPEC 9q):
// - paint (src/ambient/carpaint.js): seeded, mostly plain real colors, no
//   toy colors (baby blue, pink, mustard), sun-fade only dulls;
// - fine body choice (src3/world3d/trafficlod.js): the fade follows distance,
//   only the nearest few cars get the fine body, and losing a place slides
//   the fade over several ticks instead of snapping;
// - kits (src/ambient/carkit.js, src3/world3d/trafficKit.js, #42): seeded
//   per id, fitted to the type, no two alike within a type, pieces drawn
//   for every part that fits;
// - dirt (dirtStep, #43): builds on dirt roads over ticks, fades on paved.
//   node tools/check-traffic-look.mjs
import { carPaint, PALETTE } from '../src/ambient/carpaint.js';
import { createFineLod, distanceFade, FINE_NEAR, FINE_FAR, FINE_MAX, GATE_RATE } from '../src3/world3d/trafficlod.js';
import { carKit, dirtStep, trafficType, KIT_FITS, KIT_NEEDS, KIT_PARTS, TRAFFIC_TYPES, DIRT_MAX } from '../src/ambient/carkit.js';
import { kitInto } from '../src3/world3d/trafficKit.js';
import { setSixBySixDay, sixBySixRoll, sixBySixPaint, SIX_ODDS } from '../src/ambient/sixbysix.js';
import { engineOf } from '../src/audio/trafficSound.js';

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

// Kits (#42): seeded per id (the same in any order of asking), fitted to
// the type, never the same twice within a type.
{
  const kitIds = Array.from({ length: 60 }, (_, i) => `car${i}`);
  const a = kitIds.map((id) => carKit(id));
  const fresh = await import('../src/ambient/carkit.js?again');
  const b = [...kitIds].reverse().map((id) => fresh.carKit(id)).reverse();
  ok('kits seeded per id (fresh module, asked in reverse order)', a.every((k, i) => JSON.stringify(k) === JSON.stringify(b[i])));
  ok('kit type is the car type', a.every((k, i) => k.type === trafficType(kitIds[i])));
  const unfit = a.flatMap((k) => k.parts.filter((p) => !(p in KIT_FITS[k.type]) || (KIT_NEEDS[p] && !k.parts.includes(KIT_NEEDS[p]))).map((p) => `${k.type}:${p}`));
  ok('every part fits its type (and has what it needs)', unfit.length === 0, unfit.slice(0, 5).join(' '));
  ok('no roof racks on pickups or farm trucks', a.every((k) => !['pickup', 'farmtruck'].includes(k.type) || !k.parts.includes('rack')));
  ok('no ladders or toolboxes off pickups', a.every((k) => k.type === 'pickup' || !k.parts.some((p) => p === 'ladder' || p === 'toolbox')));
  const farm = a.filter((k) => k.type === 'farmtruck');
  ok('farm trucks carry hay and rust', farm.every((k) => k.parts.includes('hay') && k.rust >= 0.45), farm.map((k) => k.rust.toFixed(2)).join(' '));
  for (const t of TRAFFIC_TYPES) {
    const masks = a.filter((k) => k.type === t).map((k) => k.mask);
    ok(`no two ${t}s alike (${masks.length} cars)`, new Set(masks).size === masks.length);
  }
  const ten = a.slice(0, 10);
  ok('the ten traffic cars: some bare, some kitted', ten.some((k) => k.parts.length === 0 || k.parts.length === 1) && ten.some((k) => k.parts.length >= 3));
  ok('odd doors only with the door part, and not the body color', a.every((k, i) => (k.door != null) === k.parts.includes('door') && k.door !== carPaint(kitIds[i]).color));
  ok('rust between 0 and 1, older cars rustier', a.every((k) => k.rust >= 0 && k.rust <= 1)
    && a.filter((k, i) => carPaint(kitIds[i]).age < 0.4 && k.type !== 'farmtruck').every((k) => k.rust < 0.3));
  // Every fitting part has pieces to show (door is drawn by the shader).
  for (const t of TRAFFIC_TYPES) {
    const seen = new Set();
    let cur = null;
    const B = { fine: true, part(n) { cur = n; }, box() { seen.add(cur); }, rod() { seen.add(cur); }, tyre() { seen.add(cur); } };
    kitInto(t, B);
    const missing = Object.keys(KIT_FITS[t]).filter((p) => p !== 'door' && !seen.has(p));
    const extra = [...seen].filter((p) => !(p in KIT_FITS[t]));
    ok(`${t}: pieces for every fitting part, none for others`, !missing.length && !extra.length, `missing ${missing} extra ${extra}`);
  }
  ok('kit bits fit in a float mask', KIT_PARTS.length <= 23);
}
// Dirt (#43): builds on dirt roads over ticks, fades on paved to the car's
// base, never past DIRT_MAX or under the base.
{
  const base = 0.1;
  let d = base;
  const up = [];
  for (let k = 0; k < 1200; k++) up.push((d = dirtStep(d, base, true, 12, 0.5)));
  ok('dirt builds while driving a dirt road', up[1] > up[0] && up[20] > up[1] && up[199] > up[20], `${up[0].toFixed(3)} ${up[20].toFixed(3)} ${up[199].toFixed(3)}`);
  ok('dirt stops at DIRT_MAX', up.every((v) => v <= DIRT_MAX + 1e-9) && up[1199] > DIRT_MAX - 0.02, up[1199].toFixed(3));
  ok('a minute on dirt shows (over a third of max)', up[119] > DIRT_MAX * 0.35, up[119].toFixed(3));
  ok('standing on dirt: no change', dirtStep(0.4, base, true, 0, 1) === 0.4);
  const a1 = dirtStep(0.6, base, false, 14, 1);
  const a2 = dirtStep(a1, base, false, 14, 1);
  ok('fades on paved, slowly', a1 < 0.6 && a2 < a1 && 0.6 - a2 < 0.02, `${a1.toFixed(4)} ${a2.toFixed(4)}`);
  let e = 0.6;
  for (let k = 0; k < 2000; k++) e = dirtStep(e, base, false, 14, 1);
  ok('fades back to its base, not under', e === base);
  const avg = (t) => { const l = Array.from({ length: 60 }, (_, i) => carKit(`car${i}`)).filter((k) => k.type === t); return l.reduce((s, k) => s + k.dirtBase, 0) / l.length; };
  ok('farm trucks dirtiest, then pickups, then cars', avg('farmtruck') > avg('pickup') && avg('pickup') > avg('sedan') && avg('pickup') > avg('wagon'));
}

// The surplus 6x6 (#45): car5 drives it on some missions only, seeded by
// the day key; the ?sixbysix flag forces it; nothing else changes type.
{
  const keys = Array.from({ length: 400 }, (_, i) => `12345:m${i}`);
  const share = keys.filter(sixBySixRoll).length / keys.length;
  ok('the 6x6 drives on some missions, not most', share > SIX_ODDS - 0.08 && share < SIX_ODDS + 0.08, share.toFixed(2));
  ok('same day key, same answer', keys.every((k) => sixBySixRoll(k) === sixBySixRoll(k)));
  const on = keys.find(sixBySixRoll);
  const off = keys.find((k) => !sixBySixRoll(k));
  const others = Array.from({ length: 10 }, (_, i) => `car${i}`).filter((id) => id !== 'car5');
  const before = others.map(trafficType);
  // Over several region builds, car5 follows each day; the rest never change.
  const seen = [];
  for (const [k, f] of [[on, null], [off, null], [on, 'off'], [off, 'on'], [off, null]]) {
    setSixBySixDay(k, f);
    seen.push(trafficType('car5'));
    if (others.map(trafficType).join() !== before.join()) seen.push('OTHER CHANGED');
  }
  ok('car5 is the 6x6 on its days and with ?sixbysix=on, else the farm truck', seen.join() === 'sixbysix,farmtruck,farmtruck,sixbysix,farmtruck', seen.join());
  setSixBySixDay(off, 'on');
  const k = carKit('car5');
  ok('the 6x6 kit fits it', k.type === 'sixbysix' && k.parts.every((p) => p in KIT_FITS.sixbysix) && k.rust <= 0.3 && k.dirtBase >= 0.4, k.parts.join(' '));
  ok('the 6x6 kit is seeded', JSON.stringify(carKit('car5')) === JSON.stringify(k));
  setSixBySixDay(off, 'off');
  ok('back to the farm truck kit', carKit('car5').type === 'farmtruck' && carKit('car5').parts.includes('hay'));
  const p = Array.from({ length: 30 }, (_, i) => sixBySixPaint(`car${i}`));
  const [h, s, v] = hsv(p[0].color);
  ok('6x6 paint: dull army colors (olive, green, tan), faded', p.every((q) => { const [hh, ss, vv] = hsv(q.color); return hh >= 35 && hh <= 110 && ss < 0.6 && vv < 0.6 && q.age >= 0.75; }), `${h.toFixed(0)} ${s.toFixed(2)} ${v.toFixed(2)}`);
  ok('6x6 has a diesel', engineOf('sixbysix') === 'diesel');
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
