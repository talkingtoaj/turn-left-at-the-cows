// Checks the seeded barn plans (#79): the same barn always gets the same
// plan, the barn and its lean-to stay inside the footprint from layout.js
// (what you see is what you hit), a lean-to never sits on the silo's (east)
// end, and nearby barns don't all come out the same.
import { WORLD } from '../src/world/world.js';
import { barnPlan, barnProfile, LEAN_DEPTH } from '../src3/world3d/barn3d.js';

let bad = 0;
const fail = (m) => { console.error('FAIL', m); bad++; };
const barns = WORLD.buildings.filter((b) => b.kind === 'barn');
if (barns.length < 3) fail('expected at least 3 barns, got ' + barns.length);
const key = (p) => [p.gambrel, p.lean, p.wall, p.roof, p.cupolas].join('/');
for (const b of barns) {
  for (const front of ['n', 's']) {
    const p = barnPlan(b, front);
    const q = barnPlan(b, front);
    if (JSON.stringify(p) !== JSON.stringify(q)) fail(b.id + ': plan is not the same twice');
    const { body } = p;
    const e = 1e-6;
    if (Math.abs(body.cx) + body.len / 2 > b.w / 2 + e) fail(b.id + ': body past the footprint in x');
    if (Math.abs(body.cz) + body.depth / 2 > b.h / 2 + e) fail(b.id + ': body past the footprint in z');
    if (p.lean === 'back' && Math.abs(body.depth + LEAN_DEPTH - b.h) > e) fail(b.id + ': back lean-to does not fill the footprint');
    if (p.lean === 'end' && (body.cx <= 0 || Math.abs(body.len + LEAN_DEPTH - b.w) > e)) fail(b.id + ': end lean-to not on the west end');
    if (p.lean === 'back' && Math.sign(body.cz) !== p.fs) fail(b.id + ': back lean-to is on the front');
    if (body.depth < 10) fail(b.id + ': body too shallow (' + body.depth + ')');
    const prof = barnProfile(body.depth, p.wallH, p.gambrel);
    const ridge = Math.max(...prof.map((r) => r[1]));
    if (ridge < p.wallH + 3 || ridge > 14) fail(b.id + ': odd ridge height ' + ridge);
  }
}
// Barns within 1 km of each other: not all one kind.
for (const b of barns) {
  const near = barns.filter((c) => Math.hypot(c.x - b.x, c.y - b.y) < 1000);
  if (near.length >= 3 && new Set(near.map((c) => key(barnPlan(c, 's')))).size < 2) fail('barns near ' + b.id + ' are all alike');
}
const shapes = new Set(barns.map((b) => barnPlan(b, 's').gambrel));
if (shapes.size < 2) fail('every barn has the same roof shape');
if (bad) process.exit(1);
console.log('barns ok:', barns.map((b) => b.id + ' ' + key(barnPlan(b, 's'))).join(', '));
