// Water tower (#60): where the name and the ladder go (towerPlan in
// src3/world3d/watertower3d.js).
// - The name faces the nearest road and follows it when the road moves
//   (checked across calls on a made-up tower).
// - The name is the nearest town's name in capitals, or none when no town is
//   near: no new words.
// - On every water tower in every region: the name is an existing town name,
//   it faces the nearest road, the name fits on its facets, and the ladder is
//   clear of both names (front and back) and of the legs.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { WATER_TOWER } from '../src/drive/layout.js';
import { towerPlan, nameSlices } from '../src3/world3d/watertower3d.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const near = (a, b, tol = 1e-6) => angDiff(a, b) < tol;
const DA = (Math.PI * 2) / 32;

// 1. A made-up tower; the road moves round it between calls.
const tower = { id: 't', x: 0, y: 0 };
const towns = [{ name: 'Ashford', x: 600, y: 0 }, { name: 'Calder', x: -3000, y: 0 }];
const cases = [
  [[[50, -100], [50, 100]], Math.PI / 2], // road to the east: name faces +x
  [[[-100, -40], [100, -40]], Math.PI], // road to the north (-y)
  [[[-30, -100], [-30, 100]], -Math.PI / 2], // road to the west
  [[[-100, 70], [100, 70]], 0], // road to the south
];
for (const [pts, want] of cases) {
  const p = towerPlan({ roads: [{ id: 'r', points: pts }], towns }, tower);
  if (!near(p.nameAngle, want)) fail(`road ${JSON.stringify(pts)}: name at ${p.nameAngle.toFixed(3)}, want ${want.toFixed(3)}`);
  if (!near(p.ladderAngle, want + Math.PI / 2)) fail('ladder is not a quarter turn from the name');
  if (p.name !== 'ASHFORD') fail(`name ${p.name}, want ASHFORD`);
}
// The nearer of two roads wins, and the pick changes when they swap.
const two = (a, b) => ({ roads: [{ id: 'e', points: [[a, -50], [a, 50]] }, { id: 'w', points: [[-b, -50], [-b, 50]] }], towns });
if (!near(towerPlan(two(40, 60), tower).nameAngle, Math.PI / 2)) fail('east road nearer, name not east');
if (!near(towerPlan(two(60, 40), tower).nameAngle, -Math.PI / 2)) fail('west road nearer, name not west');
// Towns: the nearest within reach, else no name.
if (towerPlan({ roads: [], towns: [{ name: 'Oakham', x: 0, y: 2400 }, { name: 'Brandt', x: 0, y: 2450 }] }, tower).name !== 'OAKHAM') fail('nearest town not picked');
if (towerPlan({ roads: [], towns: [{ name: 'Oakham', x: 0, y: 2600 }] }, tower).name !== null) fail('a town 2.6 km off still names the tower');

// 2. Every water tower in every region.
let n = 0;
for (const id of REGION_IDS) {
  const W = setRegion(id);
  const names = new Set(W.towns.map((t) => t.name.toUpperCase()));
  for (const l of W.landmarks.filter((q) => q.kind === 'water_tower')) {
    n++;
    const p = towerPlan(W, l);
    if (p.name && !names.has(p.name)) fail(`${id}/${l.id}: "${p.name}" is not a town in the game`);
    if (!p.name) console.log(`note: ${id}/${l.id} has no town near, no name`);
    // Facing: the point on the nearest road lies along the name's direction.
    let best = null;
    for (const r of W.roads) for (const [x, y] of r.points) {
      const d = Math.hypot(x - l.x, y - l.y);
      if (!best || d < best.d) best = { d, a: Math.atan2(x - l.x, y - l.y) };
    }
    if (angDiff(best.a, p.nameAngle) > 0.35) fail(`${id}/${l.id}: name faces ${p.nameAngle.toFixed(2)}, road is at ${best.a.toFixed(2)}`);
    if (p.name) {
      const s = nameSlices(p.name);
      if (s.n * s.chord < s.w) fail(`${id}/${l.id}: name wider than its facets`);
      const half = (s.n * DA) / 2;
      for (const back of [0, Math.PI]) {
        if (angDiff(p.ladderAngle, p.nameAngle + back) < half + 0.2) fail(`${id}/${l.id}: ladder runs over the name`);
      }
    }
    // Ladder foot (7.85 m out) is clear of every leg.
    const lx = l.x + Math.sin(p.ladderAngle) * 7.85;
    const ly = l.y + Math.cos(p.ladderAngle) * 7.85;
    for (const [x, y] of WATER_TOWER.legs) {
      if (Math.hypot(l.x + x - lx, l.y + y - ly) < WATER_TOWER.legR + 1.2) fail(`${id}/${l.id}: ladder foot on a leg pier`);
    }
  }
}
if (!n) fail('no water towers found');
console.log(fails ? `check:tower: ${fails} failed` : `check:tower: OK (${n} towers)`);
process.exit(fails ? 1 : 0);
