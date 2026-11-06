// Blocker checker: every planned road blocker (mission.blockers in
// src/game/missions.js, and the preview candidates in
// src3/blockerCandidates.js) must be impossible to drive round. Routes the
// car's footprint over the world within 150 m (tools/blockers.mjs) and fails
// if it finds a way past.
//
//   npm run check:blockers                 check them all
//   npm run check:blockers -- --detour     also the detour each one forces
//   npm run check:blockers -- --scan farm_rd,ridge_rd   list spots on these
//       roads (every 20 m) with the least brush reach that would seal them
//
// Exits 1 when a blocker can be bypassed.

import { MISSIONS } from '../src/game/missions.js';
import { CANDIDATES } from '../src3/blockerCandidates.js';
import { resolve, bypass, detour, RADIUS, WORLD } from './blockers.mjs';
import { measurePolyline } from '../src/drive/geom.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const t0 = Date.now();

if (has('--scan')) {
  const roads = (args[args.indexOf('--scan') + 1] || '').split(',').filter(Boolean);
  const step = 20;
  const reaches = has('--wide') ? [8, 20, 36, 50, 65] : [8, 14, 20, 28, 36];
  for (const id of roads) {
    const road = WORLD.roads.find((r) => r.id === id);
    const L = measurePolyline(road.points).at(-1);
    for (let at = 40; at < L - 40; at += step) {
      let sealed = null;
      for (const R of reaches) {
        const [b] = resolve([{ id: 'scan', roadId: id, at, tilt: 0, reach: [R, R] }]);
        if (!bypass(b).bypass) {
          sealed = R;
          break;
        }
      }
      if (sealed !== null) {
        const [b] = resolve([{ id: 'scan', roadId: id, at, tilt: 0 }]);
        console.log(`${id.padEnd(10)} at ${String(at).padStart(5)}  (${b.x.toFixed(0)}, ${b.y.toFixed(0)})  sealed with reach ${sealed}`);
      }
    }
  }
  console.log(`scan done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

const list = [];
for (const m of MISSIONS) for (const def of m.blockers || []) list.push({ from: m.id, def });
for (const [name, c] of Object.entries(CANDIDATES)) list.push({ from: `candidate ${name}`, def: c.def });

let bad = 0;
console.log(`Blocker check: ${list.length} blockers, way round searched within ${RADIUS} m`);
for (const { from, def } of list) {
  const [b] = resolve([def]);
  if (!b) {
    console.log(`  FAIL ${from}: does not resolve to a road point`);
    bad++;
    continue;
  }
  const r = bypass(b);
  const where = `${b.roadId} at ${Math.round(b.at)} m (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
  if (r.bypass) {
    bad++;
    const via = r.path.filter((_, i) => i % 8 === 0).map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
    console.log(`  FAIL ${from}: ${where} can be driven round, via ${via}`);
  } else {
    console.log(`  ok   ${from}: ${where}${r.note ? ` (${r.note})` : ''}`);
  }
  if (has('--detour')) {
    const d = detour(b);
    if (!d.shut) console.log('         detour: none (no way round at all)');
    else {
      const km = (m) => (m / 1000).toFixed(2);
      console.log(`         detour: ${km(d.shut.dist)} km instead of ${km(d.open.dist)} km (+${km(d.shut.dist - d.open.dist)} km, ${km(d.shut.grass)} km off road), `
        + `about +${((d.shut.time - d.open.time) / 60).toFixed(1)} min at safe speeds`);
      const via = d.shut.path.filter((_, i) => i % 25 === 0).map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
      console.log(`         via ${via}`);
    }
  }
}
console.log(`${bad ? `${bad} FAILED` : 'OK: no blocker can be driven round'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad ? 1 : 0);
