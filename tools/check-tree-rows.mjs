// Tree rows and dead trees checker (#69, src/world/treeRows.js), for every
// region:
//   - row trees stand only beside dirt roads, ROW.offset from the centre
//     line, so they keep off the road and out of the roadside fill's verge
//     band (weeds, ditches and posts end about 9 m out on a dirt road);
//   - none in a town or hamlet, near a junction or another road (a driver can
//     see down the crossing road), a sign, a mailbox, a landmark, a named
//     place, a bridge or the start, or near a fallen tree;
//   - every row has trees on both sides;
//   - dead and broken trees keep DEAD.roadMin from every road;
//   - the plan is the same on a second run (seeded), and adding it leaves the
//     older trees and the fallen trees as they were.
//
//   npm run check:tree-rows      Exits 1 when any check fails.

import { setRegion, REGION_IDS, REGIONS } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { ROW, DEAD } from '../src/world/treeRows.js';
import { distToPolyline } from '../src/drive/geom.js';

let fails = 0;
const bad = (msg) => {
  fails++;
  console.log('  FAIL', msg);
};

for (const id of REGION_IDS) {
  const W = setRegion(id);
  const S = generateScenery(W);
  const S2 = generateScenery(W);
  const rows = S.trees.filter((t) => t.row === 'lane');
  const dead = S.trees.filter((t) => (t.kind === 'dead' || t.kind === 'snag') && !t.row);
  console.log(`=== ${id} (${REGIONS[id].name}): ${rows.length} row trees in ${new Set(rows.map((t) => t.stretch)).size} rows, ${dead.length} dead or broken trees`);

  // Seeded: the same both runs.
  const key = (list) => list.map((t) => `${t.kind}@${t.x.toFixed(2)},${t.y.toFixed(2)}`).join(';');
  if (key(S.trees) !== key(S2.trees)) bad('two runs give different trees');
  if (key(S.fallen.map((f) => f.tree)) !== key(S2.fallen.map((f) => f.tree))) bad('two runs give different fallen trees');
  // The older trees come first, unchanged, the new ones after them.
  const firstNew = S.trees.findIndex((t) => t.row === 'lane' || t.kind === 'dead' || t.kind === 'snag');
  if (firstNew >= 0 && S.trees.slice(firstNew).some((t) => !(t.row === 'lane' || t.kind === 'dead' || t.kind === 'snag'))) bad('new trees are mixed in among the older ones');

  const K = ROW.clear;
  const near = (list, t, r) => (list || []).find((p) => Math.hypot(p.x - t.x, p.y - t.y) < (typeof r === 'function' ? r(p) : r));
  for (const t of rows) {
    const at = `${t.kind} row tree at (${t.x.toFixed(0)}, ${t.y.toFixed(0)})`;
    let best = null;
    for (const r of W.roads) {
      const d = distToPolyline(t.x, t.y, r.points);
      if (!best || d < best.d) best = { r, d };
    }
    if (best.r.type !== 'dirt') bad(`${at}: nearest road ${best.r.id} is not dirt`);
    if (best.d < ROW.offset[0] - 0.6) bad(`${at}: ${best.d.toFixed(1)} m from ${best.r.id}'s centre (verge band, or the road)`);
    if (best.d > ROW.offset[1] + 0.6) bad(`${at}: ${best.d.toFixed(1)} m from the road, not lining it`);
    for (const r of W.roads) if (r !== best.r && distToPolyline(t.x, t.y, r.points) < K.junction - ROW.offset[1] - 1) bad(`${at}: near the junction with ${r.id}`);
    const town = near(W.towns, t, (q) => (q.kind === 'hamlet' ? K.hamlet : K.town) - ROW.offset[1] - 1);
    if (town) bad(`${at}: in ${town.id}`);
    const what = [['sign', W.signs, K.sign - ROW.offset[1] - 1], ['mailbox', W.mailboxes, K.mailbox - ROW.offset[1] - 1],
      ['landmark', W.landmarks, (l) => (l.clearR || 20) + K.landmark - ROW.offset[1] - 1], ['bridge', W.bridges, K.bridge - ROW.offset[1] - 1],
      ['fallen tree', S.fallen, (f) => f.h + K.fallen - ROW.offset[1] - 1]];
    for (const [name, list, r] of what) if (near(list, t, r)) bad(`${at}: too near a ${name}`);
    if (W.start && Math.hypot(W.start.x - t.x, W.start.y - t.y) < K.start - ROW.offset[1]) bad(`${at}: near the start`);
  }
  // Both sides of every row.
  const bySt = new Map();
  for (const t of rows) {
    if (!bySt.has(t.stretch)) bySt.set(t.stretch, []);
    bySt.get(t.stretch).push(t);
  }
  for (const [s, list] of bySt) {
    const road = W.roads.reduce((b, r) => (distToPolyline(list[0].x, list[0].y, r.points) < distToPolyline(list[0].x, list[0].y, b.points) ? r : b));
    // Side by cross product against the nearest road segment.
    const side = (t) => {
      let bestD = Infinity;
      let sg = 0;
      for (let i = 0; i < road.points.length - 1; i++) {
        const [ax, ay] = road.points[i];
        const [bx, by] = road.points[i + 1];
        const d = Math.hypot((ax + bx) / 2 - t.x, (ay + by) / 2 - t.y);
        if (d < bestD) {
          bestD = d;
          sg = Math.sign((bx - ax) * (t.y - ay) - (by - ay) * (t.x - ax));
        }
      }
      return sg;
    };
    const sides = new Set(list.map(side));
    if (sides.size < 2) bad(`row ${s} on ${road.id}: trees on one side only (${list.length})`);
  }
  for (const t of dead) {
    for (const r of W.roads) {
      const d = distToPolyline(t.x, t.y, r.points);
      if (d < DEAD.roadMin) bad(`${t.kind} at (${t.x.toFixed(0)}, ${t.y.toFixed(0)}): ${d.toFixed(1)} m from ${r.id}`);
    }
  }
}
console.log(fails ? `\n${fails} problems` : '\nTree rows OK');
process.exit(fails ? 1 : 0);
