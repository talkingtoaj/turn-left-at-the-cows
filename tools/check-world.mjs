// World checker: builds the 3D world exactly like the game does (same build
// functions, no DOM) and checks every placed thing against the ground height.
// Lists anything floating or buried by more than about 10 cm.
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

const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const scenery = generateScenery(WORLD);
const terrain = new Terrain(WORLD);
const batch = new Batcher();
batch.audit = new Audit();
buildObjects(WORLD, scenery, terrain, batch, { glowTex: null });
const { problems, counts } = checkAudit(batch.audit, (x, y) => terrain.heightAt(x, y));

if (args.has('--json')) {
  console.log(JSON.stringify({ counts, problems }, null, 1));
} else {
  console.log(`World check (tolerance ${TOL * 100} cm), built in ${Date.now() - t0} ms`);
  console.log(`checked: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
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
