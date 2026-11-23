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
import { makeVerge, vergeFor, culvertMouths, VERGE } from '../src/world/verge.js';

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
  for (const c of V.culverts) {
    const r = byId.get(c.road);
    if (!r) { fail(`${id} culvert crosses unknown road ${c.road}`); continue; }
    // Both mouths off every road, on opposite sides of the one it crosses.
    for (const [x, y] of [[c.x, c.y], [c.x2, c.y2]]) if (offRoad(x, y) < VERGE.culvertGap - 0.3) fail(`${id} culvert mouth on a road at ${x},${y}`);
    const side = (x, y) => {
      let best = Infinity, sg = 0;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        const ax = a.x ?? a[0], ay = a.y ?? a[1], bx = b.x ?? b[0], by = b.y ?? b[1];
        const d = distToPolyline(x, y, [a, b]);
        if (d < best) { best = d; sg = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); }
      }
      return sg;
    };
    if (side(c.x, c.y) === side(c.x2, c.y2)) fail(`${id} culvert at ${c.x},${c.y} has both mouths on one side of ${c.road}`);
    // The pipe's axis runs across that road (at least 45 degrees off its line)
    // and is long enough to span it.
    let nearest = Infinity, roadAng = 0;
    const mx = (c.x + c.x2) / 2, my = (c.y + c.y2) / 2;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const ax = a.x ?? a[0], ay = a.y ?? a[1], bx = b.x ?? b[0], by = b.y ?? b[1];
      const d = distToPolyline(mx, my, [a, b]);
      if (d < nearest) { nearest = d; roadAng = Math.atan2(by - ay, bx - ax); }
    }
    const axis = Math.atan2(c.y2 - c.y, c.x2 - c.x);
    let da = Math.abs(((axis - roadAng) * 180) / Math.PI) % 180;
    if (da > 90) da = 180 - da;
    if (da < 45) fail(`${id} culvert at ${c.x},${c.y} runs along ${c.road} (${da.toFixed(0)} degrees), not across`);
    if (Math.hypot(c.x2 - c.x, c.y2 - c.y) < r.width) fail(`${id} culvert at ${c.x},${c.y} is shorter than ${c.road} is wide`);
    // The heading is the pipe's direction, first mouth to second.
    const h = (c.angle * Math.PI) / 180;
    if (Math.abs(-Math.sin(h) - (c.x2 - c.x) / Math.hypot(c.x2 - c.x, c.y2 - c.y)) > 0.02) fail(`${id} culvert at ${c.x},${c.y} heading ${c.angle} does not point at its far mouth`);
    // Mouths are sunk: the pipe's bottom well below the ground, its centre no more than half a radius above, on a slope too.
    for (const slope of [0, 0.3, -0.3]) {
      const H = (x, y) => 5 + slope * (x - c.x);
      for (const m of culvertMouths(c, H)) if (m.z - VERGE.culvertR > H(m.x, m.y) - 0.2 || m.z > H(m.x, m.y) + VERGE.culvertR / 2) fail(`${id} culvert mouth not sunk into the bank at ${m.x},${m.y}`);
    }
  }
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
