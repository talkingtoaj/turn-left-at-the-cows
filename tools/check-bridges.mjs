// Road bridges (#78, src3/world3d/bridgePlan.js):
// - every intact road bridge gets a plan; trusses only on intact bridges
// - long spans get a through truss, mid paved spans a pony truss, short or
//   dirt spans none; a truss bridge has no piers, a plain one has them
// - panels are even, at least 4, between 3 and 6 m long
// - a through truss leaves at least CLEAR_MIN of headroom over every lane
// - the name plate is exactly the road's own name (no new words)
// - plans follow the data: lengthen a bridge and its truss kind changes
//
//   npm run check:bridges     exits 1 on any problem

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { bridgePlan, trussKind, panelCount, portalClearance, BRIDGE } from '../src3/world3d/bridgePlan.js';

const problems = [];
const bad = (m) => problems.push(m);
const seen = { through: 0, pony: 0, plain: 0 };

for (const id of REGION_IDS) {
  const W = setRegion(id);
  const names = new Set(W.roads.map((r) => r.name && r.name.toUpperCase()));
  for (const b of W.bridges) {
    const road = W.roads.find((r) => r.id === b.roadId);
    const plan = bridgePlan(b, road);
    const tag = `${id}/${b.id}`;
    if (!b.intact || b.kind !== 'bridge') {
      if (plan.truss) bad(`${tag}: truss on a bridge that is not an intact road bridge`);
      continue;
    }
    seen[plan.truss || 'plain']++;
    if (plan.truss && plan.piers) bad(`${tag}: truss and piers`);
    if (!plan.truss && !plan.piers) bad(`${tag}: no truss and no piers`);
    if (plan.panels % 2 || plan.panels < 4) bad(`${tag}: ${plan.panels} panels`);
    if (plan.panelLen < 3 || plan.panelLen > 6) bad(`${tag}: panels ${plan.panelLen.toFixed(2)} m long`);
    if (!plan.plate) bad(`${tag}: no name plate`);
    else if (!names.has(plan.plate)) bad(`${tag}: plate "${plan.plate}" is not a road name in the game`);
    if (plan.truss === 'through') {
      const half = road.width / 2;
      for (let x = -half; x <= half + 1e-6; x += 0.25) {
        const c = portalClearance(b, x);
        if (c < BRIDGE.CLEAR_MIN) bad(`${tag}: ${c.toFixed(2)} m headroom at ${x.toFixed(2)} m`);
      }
    }
    if (plan.paved !== (road.type === 'paved')) bad(`${tag}: paved is ${plan.paved}`);
  }
}

// Every kind shows up somewhere in the game.
for (const k of Object.keys(seen)) if (!seen[k]) bad(`no ${k} bridge in any region`);

// Plans follow the data, call after call.
const base = { id: 't', kind: 'bridge', intact: true, length: 28, width: 11 };
const paved = { type: 'paved', name: 'Test Road', width: 8 };
const dirt = { type: 'dirt', name: 'Test Lane', width: 5 };
const cases = [
  [{ ...base, length: 28 }, paved, null],
  [{ ...base, length: 32 }, paved, 'pony'],
  [{ ...base, length: 40 }, paved, 'through'],
  [{ ...base, length: 32 }, dirt, null],
  [{ ...base, length: 40 }, dirt, 'through'],
  [{ ...base, length: 40, intact: false }, paved, null],
  [{ ...base, length: 32 }, paved, 'pony'],
];
for (const [b, r, want] of cases) {
  const got = trussKind(b, r);
  if (got !== want) bad(`${b.length} m ${r.type}${b.intact ? '' : ' washed out'}: truss ${got}, want ${want}`);
}
for (const L of [20, 28, 30, 32, 40, 52]) {
  const n = panelCount(L);
  if (n !== panelCount(L)) bad(`panelCount(${L}) changes between calls`);
}
if (bridgePlan(cases[1][0], paved).plate !== 'TEST ROAD') bad('plate is not the road name in capitals');

if (problems.length) {
  console.error(`check:bridges: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`check:bridges ok: ${seen.through} through truss, ${seen.pony} pony truss, ${seen.plain} plain`);
