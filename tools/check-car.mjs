// Checks the player car's old dings (carbody.js wearDings, SPEC 9q tier 1
// item 2): each ding sits on the body and moves it, only inward and only
// inside its ellipsoid, the scuff only darkens, and it is the same every
// build (it runs on both the paint and the trim, which must stay joined).
//   node tools/check-car.mjs
import { SPECS, SEDAN_DINGS, loftBody, wearDings } from '../src3/world3d/carbody.js';

let bad = 0;
const ok = (name, cond, info = '') => {
  if (!cond) bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? `: ${info}` : ''}`);
};

const body = loftBody(SPECS.sedan, { step: 0.07 });
const rest = Float32Array.from(body.paint.pos);
const pos = rest.slice();
const col = new Float32Array(rest.length).fill(0.6);
const moved = wearDings(pos, col);
ok('the dings move some paint vertices', moved > 10, `${moved}`);

SEDAN_DINGS.forEach((d, n) => {
  // The centre is on the body: a vertex within 4 cm (stations are 7 cm apart).
  let near = Infinity;
  let hit = 0;
  let maxMove = 0;
  let outward = 0;
  for (let i = 0; i < rest.length; i += 3) {
    near = Math.min(near, Math.hypot(rest[i] - d.c[0], rest[i + 1] - d.c[1], rest[i + 2] - d.c[2]));
    const q = ((rest[i] - d.c[0]) / d.rx) ** 2 + ((rest[i + 1] - d.c[1]) / d.ry) ** 2 + ((rest[i + 2] - d.c[2]) / d.rz) ** 2;
    if (q >= 1) continue;
    hit++;
    const mv = [pos[i] - rest[i], pos[i + 1] - rest[i + 1], pos[i + 2] - rest[i + 2]];
    maxMove = Math.max(maxMove, Math.hypot(...mv));
    if (mv[0] * d.n[0] + mv[1] * d.n[1] + mv[2] * d.n[2] < -1e-6) outward++;
  }
  ok(`ding ${n} sits on the body`, near < 0.04, `${near.toFixed(3)} m to the nearest vertex`);
  ok(`ding ${n} moves several vertices`, hit >= 3, `${hit}`);
  ok(`ding ${n} is no deeper than its depth`, maxMove <= d.depth + 1e-6 && maxMove > d.depth * 0.3, `${maxMove.toFixed(3)} of ${d.depth}`);
  ok(`ding ${n} only pushes in`, outward === 0);
  ok(`ding ${n} has scratches`, d.scratches && d.scratches.length > 0);
});

// Vertices outside every ding stay put and keep their colour; inside, the paint only darkens.
const C0 = Math.fround(0.6);
let strayMove = 0;
let lighter = 0;
for (let i = 0; i < rest.length; i += 3) {
  const inAny = SEDAN_DINGS.some((d) => ((rest[i] - d.c[0]) / d.rx) ** 2 + ((rest[i + 1] - d.c[1]) / d.ry) ** 2 + ((rest[i + 2] - d.c[2]) / d.rz) ** 2 < 1);
  const mv = Math.abs(pos[i] - rest[i]) + Math.abs(pos[i + 1] - rest[i + 1]) + Math.abs(pos[i + 2] - rest[i + 2]);
  if (!inAny && (mv > 0 || col[i] !== C0)) strayMove++;
  if (col[i] > C0) lighter++;
}
ok('nothing outside the dings changes', strayMove === 0, `${strayMove}`);
ok('the scuff never lightens the paint', lighter === 0);

// Same every build, and the copies of a corner (same rest position) move together.
const again = rest.slice();
wearDings(again, null);
let diff = 0;
for (let i = 0; i < again.length; i++) if (again[i] !== pos[i]) diff++;
ok('the same on every build', diff === 0, `${diff} differ`);
ok('the copies of a point move together', (() => {
  const seen = new Map();
  for (let i = 0; i < rest.length; i += 3) {
    const k = `${rest[i]},${rest[i + 1]},${rest[i + 2]}`;
    const v = `${pos[i]},${pos[i + 1]},${pos[i + 2]}`;
    if (seen.has(k) && seen.get(k) !== v) return false;
    seen.set(k, v);
  }
  return true;
})());

console.log(bad ? `\n${bad} check(s) failed` : '\nall car checks passed');
process.exit(bad ? 1 : 0);
