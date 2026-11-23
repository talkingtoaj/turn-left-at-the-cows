// Checks the roadside fill (src/world/verge.js, #66).
//
//   npm run check:verge
//
// Per region:
//   - every tar patch and crack seal lies on its own paved road's tar, off
//     the centre line, and not near water;
//   - nothing else (ditches, culverts, posts) on any road or its shoulder;
//   - posts keep clear of signs and mailboxes, so they never hide one;
//   - the same world gives the same fill every time;
//   - ditchAt is 1 on a ditch's line and 0 on the road; flowerAt is 0 on
//     the road and in town, and some verge somewhere has flowers.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { distToPolyline } from '../src/drive/geom.js';
import { makeVerge, vergeFor, VERGE } from '../src/world/verge.js';

let failed = 0;
const fail = (msg) => {
  failed++;
  if (failed <= 25) console.log('  FAIL ' + msg);
};

for (const id of REGION_IDS) {
  const W = setRegion(id);
  const V = vergeFor(W);
  const shoulder = (r) => (r.type === 'paved' ? VERGE.shoulderPaved : VERGE.shoulderDirt);
  // Metres past the nearest road's shoulder (negative on a road or shoulder).
  const offRoad = (x, y) => Math.min(...W.roads.map((r) => distToPolyline(x, y, r.points) - r.width / 2 - shoulder(r)));
  const byId = new Map(W.roads.map((r) => [r.id, r]));

  for (const p of V.patches) {
    const r = byId.get(p.road);
    if (!r || r.type !== 'paved') { fail(`${id} patch on ${p.road}: not a paved road`); continue; }
    const half = r.width / 2;
    if (Math.abs(p.off) - p.w / 2 < VERGE.centreGap - 0.01 || Math.abs(p.off) + p.w / 2 > half - VERGE.edgeGap + 0.01) fail(`${id} patch ${p.road}@${p.d} off ${p.off} w ${p.w} leaves its lane`);
    for (const t of [0, 0.5, 1]) {
      const f = V.frame(p.road, p.d + p.len * t);
      for (const o of [p.off - p.w / 2, p.off + p.w / 2]) {
        const q = V.at(f, o);
        if (distToPolyline(q.x, q.y, r.points) > half + 0.05) fail(`${id} patch ${p.road}@${p.d} off the tar at ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
      }
    }
  }
  for (const s of V.seals) {
    const r = byId.get(s.road);
    if (!r || r.type !== 'paved') { fail(`${id} seal on ${s.road}: not a paved road`); continue; }
    const f = V.frame(s.road, s.d);
    const ends = s.cross ? [s.off - s.len / 2, s.off + s.len / 2] : [s.off];
    for (const o of ends) {
      const q = V.at(f, o);
      if (distToPolyline(q.x, q.y, r.points) > r.width / 2 + 0.05) fail(`${id} seal ${s.road}@${s.d} off the tar`);
    }
  }
  for (const d of V.ditches) {
    for (const [x, y] of d.pts) {
      if (offRoad(x, y) < d.w / 2 - 0.05) { fail(`${id} ditch on ${d.road} reaches a road at ${x},${y}`); break; }
    }
    const [mx, my] = d.pts[Math.floor(d.pts.length / 2)];
    if (V.ditchAt(mx, my) < 0.95) fail(`${id} ditchAt ${V.ditchAt(mx, my).toFixed(2)} on the line of a ditch on ${d.road}`);
  }
  for (const c of V.culverts) if (offRoad(c.x, c.y) < 0.5) fail(`${id} culvert on a road at ${c.x},${c.y}`);
  for (const p of V.posts) {
    if (offRoad(p.x, p.y) < 3) fail(`${id} post ${p.x},${p.y} too near a road`);
    for (const s of [...(W.signs || []), ...(W.mailboxes || [])]) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < VERGE.postClear - 0.01) fail(`${id} post ${p.x},${p.y} by ${s.id}`);
    }
  }
  // On every road's centre: no ditch, no verge flowers.
  for (const r of W.roads) {
    for (const [x, y] of r.points.filter((_, i) => i % 7 === 0)) {
      if (V.ditchAt(x, y) > 0) fail(`${id} ditchAt > 0 on ${r.id}`);
      if (V.flowerAt(x, y) > 0) fail(`${id} flowerAt > 0 on ${r.id}`);
    }
  }
  for (const t of W.towns || []) if (V.flowerAt(t.x, t.y) > 0) fail(`${id} verge flowers in ${t.name}`);
  // Some verge has flowers: look along every road, 3.5 m past the shoulder.
  let bloom = 0;
  for (const r of W.roads) {
    for (let d = 10; d < 2000; d += 7) {
      const f = V.frame(r.id, d);
      if (!f) break;
      const q = V.at(f, r.width / 2 + shoulder(r) + 3.5);
      if (V.flowerAt(q.x, q.y) > 0.3) bloom++;
    }
  }
  if (bloom < 20) fail(`${id} only ${bloom} verge spots with flowers`);
  // Same world, same fill.
  const again = makeVerge(W);
  for (const k of ['patches', 'seals', 'ditches', 'culverts', 'posts']) {
    if (JSON.stringify(again[k]) !== JSON.stringify(V[k])) fail(`${id} ${k} differ between two runs`);
  }
  console.log(`${id}: ${V.patches.length} patches, ${V.seals.length} seals, ${V.ditches.length} ditches (${Math.round(V.ditches.reduce((s, d) => s + d.d1 - d.d0, 0))} m), ${V.culverts.length} culverts, ${V.posts.length} posts, ${bloom} verge flower spots`);
}

if (failed) {
  console.log(`check:verge FAILED (${failed})`);
  process.exit(1);
}
console.log('check:verge ok');
