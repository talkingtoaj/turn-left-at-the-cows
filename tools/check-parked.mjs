// Parked vehicles (#47, src/world/parked.js) and their air-brake hiss (#48,
// src/audio/airbrake.js):
// - every kind has a footprint; ids are unique
// - each sits clear of roads (with a margin), water, the map edge and every
//   other solid thing (buildings, landmarks, trees, props, fences)
// - only one surplus 6x6 is parked, at Hartley's (#71, SPEC 9r)
// - the collider blocks the car and a walker at the vehicle, and only there
// - the hiss: none while far, a first one a few seconds after you come
//   close, then spaced out; louder and brighter close up; stepping with
//   uneven frames gives the same hisses as even ones; leaving and coming back
//   starts over
//
//   npm run check:parked     exits 1 on any problem

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider, CAR_R } from '../src/drive/collider.js';
import { circleHitsRect, distToSegment, localToWorld, makeRng } from '../src/drive/geom.js';
import { PARKED, PARKED_KINDS, parkedIn, parkedSolids } from '../src/world/parked.js';
import { HISS, createHiss, hissAt, hissSources } from '../src/audio/airbrake.js';

const problems = [];
const bad = (m) => problems.push(m);
const ROAD_PAD = 3; // m between a parked vehicle and a road's edge

const ids = new Set();
const sixes = Object.values(PARKED).flat().filter((p) => p.kind === 'sixbysix').map((p) => p.id);
if (sixes.join() !== 'hartley_6x6') bad(`parked 6x6s: ${sixes.join(', ') || 'none'}, want only hartley_6x6`);
for (const id of Object.keys(PARKED)) if (!REGION_IDS.includes(id)) bad(`PARKED has unknown region ${id}`);
for (const id of REGION_IDS) {
  const W = setRegion(id);
  const list = parkedIn(id);
  if (!list.length) continue;
  const sc = generateScenery(W);
  const plain = new Collider({ ...W, regionId: null }, sc); // the world without parked vehicles
  const col = new Collider(W, sc);
  for (const p of list) {
    const k = PARKED_KINDS[p.kind];
    if (!k) { bad(`${p.id}: unknown kind ${p.kind}`); continue; }
    if (ids.has(p.id)) bad(`${p.id}: id used twice`);
    ids.add(p.id);
    const rect = parkedSolids(p).rects[0];
    // Sample the footprint: corners, edges and inside.
    const pts = [];
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 2; j++) pts.push(localToWorld(p.x, p.y, p.heading || 0, (j / 2 - 0.5) * k.w, (i / 8 - 0.5) * k.len));
    let nearRoad = null;
    for (const q of pts) {
      for (const s of col.roadIndex.near(q.x, q.y)) {
        const d = distToSegment(q.x, q.y, s.ax, s.ay, s.bx, s.by) - s.data.width / 2;
        if (d < ROAD_PAD && (!nearRoad || d < nearRoad.d)) nearRoad = { d, id: s.data.id };
      }
      const hit = plain.circleHit(q.x, q.y, 0.3);
      if (hit) { bad(`${p.id}: overlaps ${typeof hit === 'string' ? hit : hit.kind || hit.type} at ${q.x.toFixed(1)}, ${q.y.toFixed(1)}`); break; }
    }
    if (nearRoad) bad(`${p.id}: ${nearRoad.d.toFixed(1)} m from ${nearRoad.id} (want ${ROAD_PAD})`);
    // Solid: blocks the car (any heading) and a walker at its middle and ends,
    // and the plain world there was clear.
    for (const ly of [-k.len / 2 + 1, 0, k.len / 2 - 1]) {
      const c = localToWorld(p.x, p.y, p.heading || 0, 0, ly);
      if (!col.carBlocked(c.x, c.y, 0) || !col.carBlocked(c.x, c.y, 90)) bad(`${p.id}: the car can drive into it at ly ${ly}`);
      if (col.circleHit(c.x, c.y, 0.3) === null) bad(`${p.id}: a walker can walk into it at ly ${ly}`);
    }
    // Not solid a little way off its side.
    const off = localToWorld(p.x, p.y, p.heading || 0, k.w / 2 + CAR_R + 0.4, 0);
    if (circleHitsRect(off.x, off.y, CAR_R, rect)) bad(`${p.id}: footprint wider than the vehicle`);
  }
}

// ---- hiss ----
{
  const src = hissSources([{ id: 'a', kind: 'semi', x: 0, y: 0 }, { id: 'b', kind: 'nope', x: 5, y: 5 }]);
  if (src.length !== 1) bad('hissSources: only kinds with hiss should hiss');
  // Louder and brighter close up, silent at the edge.
  const n = hissAt(5);
  const f = hissAt(50);
  if (!(n.vol > f.vol && n.lowpass > f.lowpass)) bad('hissAt: should be louder and brighter close up');
  if (hissAt(HISS.r).vol !== 0) bad('hissAt: should be silent at HISS.r');

  // Run a listener script: far for 30 s, then 10 m off for 300 s.
  const run = (steps) => {
    const rng = makeRng(7);
    const h = createHiss(rng);
    const times = [];
    let t = 0;
    for (const [dt, d] of steps) {
      t += dt;
      for (const e of h.step(dt, { x: d, y: 0 }, src)) times.push({ t, ...e });
    }
    return times;
  };
  const script = (dtOf) => {
    const s = [];
    let t = 0;
    let i = 0;
    while (t < 330) {
      const dt = dtOf(i++);
      t += dt;
      s.push([dt, t < 30 ? 200 : 10]);
    }
    return s;
  };
  const even = run(script(() => 1 / 60));
  const uneven = run(script((i) => [1 / 144, 1 / 30, 0.05, 1 / 60][i % 4]));
  if (even.some((e) => e.t < 30)) bad('hiss: heard while far');
  if (!even.length) bad('hiss: never heard close by');
  else {
    const first = even[0].t - 30;
    if (first < HISS.first[0] - 0.1 || first > HISS.first[1] + 0.1) bad(`hiss: first after ${first.toFixed(1)} s, want ${HISS.first.join(' to ')}`);
    for (let i = 1; i < even.length; i++) {
      const g = even[i].t - even[i - 1].t;
      if (g < HISS.gap[0] - 0.1 || g > HISS.gap[1] + 0.1) bad(`hiss: gap ${g.toFixed(1)} s, want ${HISS.gap.join(' to ')}`);
    }
    const want = 300 / ((HISS.gap[0] + HISS.gap[1]) / 2);
    if (even.length < want * 0.5 || even.length > want * 2) bad(`hiss: ${even.length} in 300 s, want about ${want.toFixed(0)}`);
    if (Math.abs(even[0].vol - hissAt(10).vol) > 1e-9) bad('hiss: volume does not follow hissAt');
  }
  if (even.length !== uneven.length || even.some((e, i) => Math.abs(e.t - uneven[i].t) > 0.06)) bad('hiss: uneven frames change when it hisses');
  // Leave and come back: a fresh short wait, not the old long one.
  const back = run([...script(() => 1 / 60), ...Array.from({ length: 60 }, () => [0.1, 200]), ...Array.from({ length: 150 }, () => [0.1, 10])]);
  const after = back.filter((e) => e.t > 336);
  if (!after.length || after[0].t - 336 > HISS.first[1] + 0.2) bad('hiss: coming back should hiss again after a short wait');
  console.log(`hiss: ${even.length} hisses in 300 s at 10 m, first after ${even.length ? (even[0].t - 30).toFixed(1) : '-'} s, vol ${hissAt(10).vol.toFixed(3)}, lowpass ${hissAt(10).lowpass.toFixed(0)} Hz at 10 m`);
}

console.log(`parked: ${ids.size} vehicles checked`);
if (problems.length) {
  console.log(`${problems.length} problems:`);
  for (const m of problems) console.log('  ' + m);
  process.exit(1);
}
console.log('ok');
