// Scripted drive for tuning rough-ground damage (TUNING.rough in
// src/game/damage.js): holds a steady speed on one surface with nothing to
// hit, and reports how far the car goes before a tyre is worn and before it
// breaks down. Averages over several runs (the knocks are random).
//
//   node tools/rough-drive.mjs            the standard cases
//   node tools/rough-drive.mjs dirt 80    one case (km/h)

import { stepCar } from '../src/drive/car.js';
import { resetDamage, damageMods, updateDamage, TUNING } from '../src/game/damage.js';

const RUNS = 40;
const DT = 1 / 60;
const MAX_KM = 40;

function drive(surface, kmh) {
  const target = kmh / 3.6;
  const collider = { surfaceAt: () => surface, carBlocked: () => false, surfaceEventsAt: () => {} };
  const state = { car: { x: 1000, y: 1e7, heading: 0, speed: target } };
  resetDamage(state);
  const mods = {};
  let dist = 0;
  let worn = null;
  let firstKm = null;
  let knocks = 0;
  const prev = { x: 0, y: 0, heading: 0 };
  while (dist < MAX_KM * 1000) {
    damageMods(state.damage, mods);
    mods.surfaceFeel = true;
    // Cruise control: throttle below the target, coast above it.
    const input = { up: state.car.speed < target };
    prev.x = state.car.x;
    prev.y = state.car.y;
    const r = stepCar(state.car, input, DT, collider, mods);
    dist += r.moved;
    const d = updateDamage(state, DT, r, collider, prev);
    for (const e of d.events) if (e.type === 'rough') {
      knocks++;
      if (firstKm === null) firstKm = dist / 1000;
    }
    if (worn === null && d.tyres < TUNING.tyreWorn) worn = dist / 1000;
    if (d.brokenDown) return { worn, broke: dist / 1000, firstKm, knocks, cause: d.cause };
  }
  return { worn, broke: null, firstKm, knocks, cause: null };
}

const avg = (xs) => {
  const v = xs.filter((x) => x !== null);
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : `none in ${MAX_KM}`;
};
const cases = process.argv[2] ? [[process.argv[2], Number(process.argv[3])]] : [['dirt', 58], ['dirt', 70], ['dirt', 90], ['grass', 32], ['grass', 45], ['grass', 60]];
for (const [s, kmh] of cases) {
  const rs = Array.from({ length: RUNS }, () => drive(s, kmh));
  const causes = {};
  for (const r of rs) if (r.cause) causes[r.cause] = (causes[r.cause] || 0) + 1;
  console.log(`${s.padEnd(5)} ${String(kmh).padStart(3)} km/h: first knock ${avg(rs.map((r) => r.firstKm))} km, worn ${avg(rs.map((r) => r.worn))} km, breakdown ${avg(rs.map((r) => r.broke))} km`
    + `  (${RUNS} runs, broke in ${rs.filter((r) => r.broke !== null).length}, causes ${JSON.stringify(causes)})`);
}
