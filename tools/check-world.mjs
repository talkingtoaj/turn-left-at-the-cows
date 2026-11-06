// World checker: builds the 3D world exactly like the game does (same build
// functions, no DOM) and checks every placed thing against the ground height.
// Lists anything floating or buried by more than about 10 cm.
// Also the district scatter (src/world/scatter.js): rocks, shrubs and
// tussocks must never sit on a road, bridge, yard, track or pad, in a field,
// forest, creek or lake, or in a town (tools/scatter-checks.mjs). And the
// puddles (tools/puddle-checks.mjs): flat on the ground, in real hollows,
// never on paved roads, bridges or water.
//
//   npm run check:world            summary plus the first problems
//   npm run check:world -- --all   every problem
//   npm run check:world -- --json  machine readable
//
// Exits 1 when there are problems.

import { WORLD } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Terrain } from '../src3/world3d/terrain.js';
import { Batcher } from '../src3/world3d/batch.js';
import { buildObjects } from '../src3/world3d/world3d.js';
import { Audit, checkAudit, TOL } from '../src3/world3d/audit.js';
import { GroundPaint } from '../src3/world3d/paint.js';
import { scatterPlacementProblems } from './scatter-checks.mjs';
import { puddleProblems } from './puddle-checks.mjs';

const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const scenery = generateScenery(WORLD);
const terrain = new Terrain(WORLD);
const batch = new Batcher();
batch.audit = new Audit();
batch.paint = new GroundPaint(WORLD);
const built = buildObjects(WORLD, scenery, terrain, batch, { glowTex: null });
const { problems, counts } = checkAudit(batch.audit, (x, y) => terrain.heightAt(x, y));

// Rough ground (src/world/roughness.js) must fade to nothing at roads,
// bridges and fords, so no road gets a lip: its big bumps within a few
// metres of any road edge, bridge or ford must be (almost) zero.
let roughWorst = { h: 0 };
const roughAt = (x, y, what) => {
  const h = Math.abs(terrain.rough.height(x, y));
  if (h > roughWorst.h) roughWorst = { h, x: Math.round(x), y: Math.round(y), what };
};
for (const r of WORLD.roads) {
  for (let i = 0; i < r.points.length - 1; i++) {
    const [ax, ay] = r.points[i];
    const [bx, by] = r.points[i + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / L;
    const ny = (bx - ax) / L;
    for (const off of [0, r.width / 2, r.width / 2 + 3, -r.width / 2, -r.width / 2 - 3]) roughAt(ax + nx * off, ay + ny * off, `road ${r.id}`);
  }
}
for (const b of WORLD.bridges) roughAt(b.x, b.y, `bridge ${b.id}`);
const ROUGH_TOL = 0.03;
if (roughWorst.h > ROUGH_TOL) {
  problems.push({ id: roughWorst.what, kind: 'rough_ground', type: 'lip', by: +roughWorst.h.toFixed(2), x: roughWorst.x, y: roughWorst.y });
}
counts.roughRoads = WORLD.roads.length;

// Scatter placement.
const sp = scatterPlacementProblems(WORLD, scenery);
problems.push(...sp.problems);
Object.assign(counts, sp.counts);

// Puddles: exactly on the ground, in real hollows, never on paved roads,
// bridges or water (tools/puddle-checks.mjs).
const pp = puddleProblems(WORLD, batch.audit, (x, y) => terrain.heightAt(x, y), built.puddles);
problems.push(...pp.problems);
Object.assign(counts, pp.counts);

if (args.has('--json')) {
  console.log(JSON.stringify({ counts, problems }, null, 1));
} else {
  console.log(`World check (tolerance ${TOL * 100} cm), built in ${Date.now() - t0} ms`);
  console.log(`checked: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  console.log(`rough ground at road edges and bridges: biggest bump ${(roughWorst.h * 100).toFixed(1)} cm (limit ${ROUGH_TOL * 100} cm)`);
  console.log(`puddles: ${pp.counts.puddlesOffRoad} in hollows, ${pp.counts.puddlesOnRoad} on dirt roads; full radius median ${pp.sizes.median} m, max ${pp.sizes.max} m; ${pp.sizes.tris} triangles; decals within ${(Math.abs(pp.worstBy.puddle) * 100).toFixed(2)} cm of the ground off-road, ${(Math.abs(pp.worstBy.puddle_road) * 100).toFixed(2)} cm on dirt roads (limits 2 and 3 cm)`);
  const byKind = new Map();
  for (const p of problems) {
    const k = `${p.kind} ${p.type}`;
    const e = byKind.get(k) || { n: 0, worst: 0 };
    e.n++;
    e.worst = Math.max(e.worst, p.by);
    byKind.set(k, e);
  }
  if (!problems.length) {
    console.log('OK: nothing floating or buried.');
  } else {
    console.log(`\n${problems.length} problems:`);
    for (const [k, e] of [...byKind].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(e.n).padStart(5)}  ${k} (worst ${e.worst.toFixed(2)} m)`);
    const list = [...problems].sort((a, b) => b.by - a.by);
    const show = args.has('--all') ? list : list.slice(0, 25);
    console.log(`\n${args.has('--all') ? 'All' : 'Worst 25'}:`);
    for (const p of show) console.log(`  ${p.type.padEnd(8)} ${p.by.toFixed(2).padStart(6)} m  ${p.kind.padEnd(14)} ${String(p.id).padEnd(18)} at ${p.x},${p.y}`);
  }
}
process.exit(problems.length ? 1 : 0);
