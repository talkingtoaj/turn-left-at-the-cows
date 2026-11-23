// Power poles and fences (#61, src3/world3d/fencePlan.js):
// - every fenced field in every region gets one gate, on a straight stretch
//   with fence left on both sides, nearer a road than most of its fence
// - moving a road moves the gate toward it (the choice follows the roads)
// - broken boards are rare (a few in a hundred) and the same on every call
// - transformer cans: about one pole in six, never at a line's ends, on a
//   shared pole or on two poles in a row
//
//   npm run check:poles     exits 1 on any problem

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { fenceRuns } from '../src/drive/layout.js';
import { distToSegment } from '../src/drive/geom.js';
import { pickGate, brokenBoard, hasTransformer, GATE_LEN, BROKEN_SHARE } from '../src3/world3d/fencePlan.js';

const problems = [];
const bad = (m) => problems.push(m);
const drawn = (f) => f.runs.map((run) => (f.style === 'rail' ? run.filter((_, i) => i % 2 === 0 || i === run.length - 1) : run));
const roadDist = (roads, x, y) => Math.min(...roads.flatMap((r) => r.points.slice(1).map((p, i) => distToSegment(x, y, r.points[i][0], r.points[i][1], p[0], p[1]) - r.width / 2)));

let gates = 0;
let boards = 0;
let brokenN = 0;
let poles = 0;
let cans = 0;
for (const id of REGION_IDS) {
  const W = setRegion(id);
  for (const f of fenceRuns(W)) {
    const runs = drawn(f);
    const g = pickGate(runs, W.roads);
    if (!g) { bad(`${id}/${f.fieldId}: no gate`); continue; }
    gates++;
    const run = runs[g.run];
    if (g.i0 < 1 || g.i1 > run.length - 2) bad(`${id}/${f.fieldId}: gate at the end of a run (${g.i0}..${g.i1} of ${run.length})`);
    const a = run[g.i0];
    const b = run[g.i1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 2.5 || L > 6) bad(`${id}/${f.fieldId}: gate ${L.toFixed(1)} m wide`);
    // Nearer a road than at least 90% of the fence's posts.
    const dg = roadDist(W.roads, (a.x + b.x) / 2, (a.y + b.y) / 2);
    const all = runs.flat().map((p) => roadDist(W.roads, p.x, p.y)).sort((x, y) => x - y);
    if (dg > all[Math.floor(all.length * 0.1)] + GATE_LEN) bad(`${id}/${f.fieldId}: gate ${dg.toFixed(0)} m from a road, the fence comes to ${all[0].toFixed(0)} m`);
    // Same answer twice.
    const g2 = pickGate(runs, W.roads);
    if (JSON.stringify(g2) !== JSON.stringify(g)) bad(`${id}/${f.fieldId}: gate moved between calls`);
    if (f.style === 'rail') {
      runs.forEach((pts, r) => {
        for (let k = 0; k < pts.length - 1; k++) for (let q = 0; q < 3; q++) {
          boards++;
          const x = brokenBoard(f.fieldId, r, k, q);
          if (x !== brokenBoard(f.fieldId, r, k, q)) bad(`${f.fieldId}: board ${k}/${q} changes between calls`);
          if (x && !['drop', 'missing', 'snapped'].includes(x)) bad(`${f.fieldId}: unknown break ${x}`);
          if (x) brokenN++;
        }
      });
    }
  }
  for (const l of W.powerLines || []) {
    let prev = false;
    l.poles.forEach((p, i) => {
      if (p.shared) return;
      poles++;
      const t = hasTransformer(l.id, l.poles, i);
      if (t) cans++;
      if (t && (i < 2 || i > l.poles.length - 3)) bad(`${l.id}: can on end pole ${i}`);
      if (t && prev) bad(`${l.id}: cans on poles ${i - 1} and ${i}`);
      prev = t;
    });
  }
}

// The gate follows the roads: a square field with a road along its east
// side gets its gate on the east side; move the road west and it moves too.
const sq = [];
for (let k = 0; k < 40; k++) sq.push({ x: k * 1.5, y: 0 });
for (let k = 0; k < 40; k++) sq.push({ x: 60, y: k * 1.5 });
for (let k = 0; k < 40; k++) sq.push({ x: 60 - k * 1.5, y: 60 });
for (let k = 0; k <= 40; k++) sq.push({ x: 0, y: 60 - k * 1.5 });
const east = pickGate([sq], [{ points: [[80, -50], [80, 110]], width: 6 }]);
const west = pickGate([sq], [{ points: [[-20, -50], [-20, 110]], width: 6 }]);
const mid = (g) => (sq[g.i0].x + sq[g.i1].x) / 2;
if (!east || mid(east) !== 60) bad(`road to the east: gate at x = ${east && mid(east)}`);
if (!west || mid(west) !== 0) bad(`road to the west: gate at x = ${west && mid(west)}`);
if (pickGate([[{ x: 0, y: 0 }, { x: 1.5, y: 0 }]], [])) bad('a 2-post run got a gate');

const share = brokenN / Math.max(1, boards);
if (share > BROKEN_SHARE * 2 || share < BROKEN_SHARE / 3) bad(`${(share * 100).toFixed(1)}% of boards broken`);
const canShare = cans / Math.max(1, poles);
if (canShare < 0.08 || canShare > 0.25) bad(`${(canShare * 100).toFixed(0)}% of poles have a can`);

console.log(`gates ${gates}, broken boards ${brokenN}/${boards}, cans ${cans}/${poles}`);
if (problems.length) {
  for (const p of problems) console.log('PROBLEM', p);
  process.exit(1);
}
console.log('poles and fences ok');
