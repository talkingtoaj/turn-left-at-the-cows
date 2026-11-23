// The farm dog (#68, src/world/farmDog.js):
// - its fence and its whole run stay well off every road (it never goes on
//   the road), and clear of Ade, the mailbox and the farm buildings
// - the fence is solid: the collider has a post every few metres
// - as a car drives past it runs along the fence after it, barking, and stops
//   at the end of its yard; it never leaves its run
// - when the car stops it comes and stands across the fence from it
// - when the car backs up it turns and follows
// - when you're gone it trots back to its spot and lies down
// - the same drive gives the same dog every time
//
//   npm run check:dog     exits 1 on any problem

import { setRegion } from '../src/world/world.js';
import { distToSegment } from '../src/drive/geom.js';
import { Collider } from '../src/drive/collider.js';
import {
  FARM_DOGS, DOG, farmDogsIn, fenceLine, fencePosts, project, runPoint, runSpan, dogStart, stepDog, dogLook,
} from '../src/world/farmDog.js';

const problems = [];
const bad = (m) => problems.push(m);
const W = setRegion('fenwick');
const roadEdge = (x, y) => Math.min(...W.roads.flatMap((r) => r.points.slice(1).map((p, i) => distToSegment(x, y, r.points[i][0], r.points[i][1], p[0], p[1]) - r.width / 2)));

const dogs = farmDogsIn(W);
if (dogs.length !== 1 || dogs[0].id !== 'okafor_collie') bad(`fenwick should have Okafor's collie, has ${dogs.map((d) => d.id)}`);
if (farmDogsIn(setRegion('brandt')).length) bad('brandt has a farm dog it should not');
setRegion('fenwick');

const MIN_ROAD = 12; // the run's nearest road edge
for (const dog of FARM_DOGS) {
  const line = fenceLine(dog);
  const [lo, hi] = runSpan(dog);
  // Every spot on the run, and every fence post, is far off the road.
  let nearest = Infinity;
  for (let s = lo; s <= hi; s += 0.25) {
    const p = runPoint(dog, s);
    nearest = Math.min(nearest, roadEdge(p.x, p.y));
  }
  if (nearest < MIN_ROAD) bad(`${dog.id}: its run comes ${nearest.toFixed(1)} m from a road edge (want >= ${MIN_ROAD})`);
  for (const run of fencePosts(dog)) {
    for (const p of run) if (roadEdge(p.x, p.y) < MIN_ROAD - 2) bad(`${dog.id}: a fence post at ${p.x.toFixed(0)},${p.y.toFixed(0)} is near the road`);
    for (let i = 1; i < run.length; i++) {
      const g = Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
      if (g > DOG.postStep * 1.25) bad(`${dog.id}: posts ${g.toFixed(1)} m apart`);
    }
  }
  // The run is on the yard side: further from the road than the fence.
  for (let s = lo; s <= hi; s += 10) {
    const p = runPoint(dog, s);
    const f = project(line, p.x, p.y);
    if (Math.abs(f.d - DOG.inset) > 0.05) bad(`${dog.id}: run is ${f.d.toFixed(2)} m from the fence at s=${s}`);
    const onFence = { x: p.x + p.dy * DOG.inset, y: p.y - p.dx * DOG.inset };
    if (roadEdge(p.x, p.y) <= roadEdge(onFence.x, onFence.y)) bad(`${dog.id}: the run is on the road side of the fence at s=${s}`);
  }
  // Clear of the local who stands there, the mailbox and the buildings.
  const ade = W.locals.find((l) => l.id === 'ade');
  if (!ade) bad('Ade is missing');
  else {
    const a = project(line, ade.x, ade.y);
    if (a.d < 3) bad(`${dog.id}: the fence is ${a.d.toFixed(1)} m from Ade`);
    if (Math.abs(a.s - dog.gate) > 6) bad(`${dog.id}: the gate (${dog.gate}) is not by Ade (${a.s.toFixed(0)})`);
  }
  for (const m of W.mailboxes) if (project(line, m.x, m.y).d < 4) bad(`${dog.id}: fence on mailbox ${m.id}`);
  for (const b of W.buildings) if (b.farm === dog.farm && project(line, b.x, b.y).d < Math.max(b.w, b.h) / 2 + 4) bad(`${dog.id}: fence runs into ${b.id}`);
  if (dog.home < lo || dog.home > hi) bad(`${dog.id}: home is off its run`);
}

// The fence is solid: the collider holds a post circle every few metres
// along it (a car is about 2 m wide, so the 1.8 m gaps stop it).
const col = new Collider(W, { trees: [] });
const dog = dogs[0];
{
  const line = fenceLine(dog);
  const circles = [...new Set([...col.grid.values()].flat())].filter((c) => c.type === 'circle' && c.kind === 'fence');
  let gaps = 0;
  for (let s = 0; s <= line.len; s += 0.7) {
    const p = runPoint(dog, s);
    const f = { x: p.x + p.dy * DOG.inset, y: p.y - p.dx * DOG.inset };
    if (!circles.some((c) => Math.hypot(c.x - f.x, c.y - f.y) <= DOG.postStep / 2 + 0.05)) gaps++;
  }
  if (gaps) bad(`${dog.id}: ${gaps} spots along the fence with no solid post nearby`);
  if (DOG.postStep - 2 * DOG.postR > 2.0) bad('fence posts too far apart to stop a car');
}

// ---------- the chase, over many calls ----------

const road = W.roads.find((r) => r.id === 'river_rd').points;
// Points along river_rd from x 4600 to the end of the bend (the way you drive past).
function roadPath(fromX, toY) {
  const pts = [];
  for (let i = 1; i < road.length; i++) {
    const [ax, ay] = road[i - 1];
    const [bx, by] = road[i];
    if (bx < fromX && ax < fromX) continue;
    if (ay < toY) break;
    pts.push([ax, ay]);
  }
  return pts;
}
// Drive along pts at speed m/s, stepping dt; calls fn(state, car, t) each step.
function drive(st, pts, speed, dt, fn) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < L; d += speed * dt) {
      const car = { x: ax + ((bx - ax) * d) / L, y: ay + ((by - ay) * d) / L };
      st = stepDog(dog, st, car, dt);
      fn(st, car, (t += dt));
    }
  }
  return st;
}
const DT = 1 / 60;
const [lo, hi] = runSpan(dog);
const checkRun = (st, what) => {
  if (!(st.s >= lo - 1e-6 && st.s <= hi + 1e-6)) bad(`${what}: dog left its run (s=${st.s.toFixed(2)})`);
  const p = dogLook(dog, st);
  if (roadEdge(p.x, p.y) < MIN_ROAD) bad(`${what}: dog at ${roadEdge(p.x, p.y).toFixed(1)} m from the road`);
  if (!Number.isFinite(p.heading)) bad(`${what}: heading is not a number`);
};

// 1. A car drives past at 15 m/s (about 34 mph) and on north.
let st = dogStart(dog);
if (dogLook(dog, st).pose !== 3) bad('at the start the dog should be lying down');
const path = roadPath(4600, 1700);
let barks = 0;
let maxV = 0;
let chased = 0;
let atEnd = 0;
let endBarks = 0;
const atEndNow = (s) => {
  if (s.mode === 'chase' && Math.abs(s.s - hi) < 0.01 && s.v === 0) {
    atEnd++;
    endBarks += s.barks;
  }
};
st = drive(st, path, 15, DT, (s) => {
  checkRun(s, 'drive past');
  atEndNow(s);
  barks += s.barks;
  maxV = Math.max(maxV, Math.abs(s.v));
  if (s.mode === 'chase' && Math.abs(s.v) > 3) chased++;
});
if (barks < 4) bad(`drive past: only ${barks} barks`);
if (maxV < DOG.run * 0.9) bad(`drive past: the dog never got up to speed (max ${maxV.toFixed(1)} m/s)`);
if (chased < 60) bad('drive past: the dog hardly ran');
// The car's gone round the bend and up the road: the dog runs on to the end
// of its yard and stops there, barking after it.
const away = { x: 4875, y: 1720 };
for (let k = 0; k < 60 * 12 && st.mode === 'chase'; k++) {
  st = stepDog(dog, st, away, DT);
  checkRun(st, 'after the car');
  atEndNow(st);
}
if (atEnd < 60 * 2) bad(`after the car: the dog should stop at the end of its yard a while, ${(atEnd / 60).toFixed(1)} s there`);
if (endBarks < 1) bad('after the car: no barks from the end of the yard');
// Then it gives up, trots home and lies down, quiet.
let quietBarks = 0;
let lay = -1;
for (let k = 0; k < 60 * 90; k++) {
  const before = st.s;
  st = stepDog(dog, st, away, DT);
  checkRun(st, 'going home');
  if (st.mode === 'home' && Math.abs(st.v) > DOG.trot + 1e-6) bad(`going home: too fast (${st.v.toFixed(2)})`);
  if (st.mode !== 'chase') quietBarks += st.barks;
  if (st.mode === 'rest' && lay < 0) lay = k;
  void before;
}
if (quietBarks) bad(`going home: ${quietBarks} barks after it gave up`);
if (lay < 0) bad(`going home: never lay down (mode ${st.mode}, s ${st.s.toFixed(1)})`);
else if (Math.abs(st.s - dog.home) > 0.1) bad('going home: lay down away from its spot');
if (dogLook(dog, st).pose !== 3) bad('going home: should be lying down at the end');

// 2. A car comes along and stops by the middle of the fence: the dog comes
//    to stand across the fence from it, facing it, barking.
st = dogStart(dog);
const stopAt = { x: 4850, y: 2008 }; // on river_rd
const stopS = project(fenceLine(dog), stopAt.x, stopAt.y).s;
barks = 0;
const side = [];
for (let k = 0; k < 60 * 8; k++) {
  st = stepDog(dog, st, stopAt, DT);
  checkRun(st, 'car stopped');
  barks += st.barks;
  side.push(st.s);
}
if (Math.abs(st.s - stopS) > 0.5) bad(`car stopped: dog at s=${st.s.toFixed(1)}, car across at ${stopS.toFixed(1)}`);
if (Math.abs(st.v) > 0.01) bad('car stopped: the dog should stand still');
const look = dogLook(dog, st);
if (look.pose !== 0) bad(`car stopped: pose ${look.pose}, want standing`);
{
  const p = runPoint(dog, st.s);
  const want = ((Math.atan2(stopAt.x - p.x, -(stopAt.y - p.y)) * 180) / Math.PI + 360) % 360;
  const diff = Math.abs(((look.heading - want + 540) % 360) - 180);
  if (diff > 2) bad(`car stopped: dog faces ${look.heading.toFixed(0)}, car is at ${want.toFixed(0)}`);
}
if (barks < 5) bad(`car stopped: only ${barks} barks in 8 s`);

// 3. The car backs up 40 m along the road: the dog turns and follows.
const back = roadPath(4600, 1990).reverse().filter((p) => p[0] <= stopAt.x && p[0] >= stopAt.x - 45);
let turned = false;
st = drive(st, [[stopAt.x, stopAt.y], ...back], 3, DT, (s) => {
  checkRun(s, 'reversing');
  if (s.v < -0.5) turned = true;
});
const lastBack = back[back.length - 1];
const backS = project(fenceLine(dog), lastBack[0], lastBack[1]).s;
for (let k = 0; k < 60 * 3; k++) st = stepDog(dog, st, { x: lastBack[0], y: lastBack[1] }, DT);
if (!turned) bad('reversing: the dog never ran back');
if (Math.abs(st.s - Math.max(lo, backS)) > 0.6) bad(`reversing: dog at ${st.s.toFixed(1)}, car across at ${backS.toFixed(1)}`);

// 4. Far off, nothing happens: it lies still and quiet.
st = dogStart(dog);
for (let k = 0; k < 600; k++) {
  st = stepDog(dog, st, { x: 4300, y: 2100 }, DT);
  if (st.barks || st.v !== 0 || st.mode !== 'rest') {
    bad('far off: the dog stirred');
    break;
  }
}

// 5. Same drive, same dog (no randomness outside the state).
const run1 = [];
const run2 = [];
drive(dogStart(dog), path, 12, DT, (s) => run1.push(`${s.s.toFixed(4)}:${s.barks}`));
drive(dogStart(dog), path, 12, DT, (s) => run2.push(`${s.s.toFixed(4)}:${s.barks}`));
if (run1.join() !== run2.join()) bad('the same drive gave a different dog');
// stepDog leaves the state it's given alone.
const s0 = dogStart(dog);
const copy = JSON.stringify(s0);
stepDog(dog, s0, stopAt, DT);
if (JSON.stringify(s0) !== copy) bad('stepDog changed the state it was given');

if (problems.length) {
  console.log(`check-dog: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 30)) console.log(' -', p);
  process.exit(1);
}
console.log(`check-dog: ok (fence ${fenceLine(dog).len.toFixed(0)} m, run ${lo.toFixed(1)}..${hi.toFixed(1)}, home ${dog.home}, gate ${dog.gate})`);
