// Field flocks and wire birds (#97, SPEC 9s "birds lifting off"):
// - the plan: 20 to 40 birds per field flock inside open fields near roads, one
//   early on Highway 9 clear of the crop duster and the road crew, 6 to 15
//   birds on a wire span, the same every time for the same seed, none when off
// - a field flock stays down while the car is far, lifts when it comes within
//   about 40 m (further at speed) with one birds_scatter event, swirls up,
//   settles again at least 25 m away inside the field
// - wire birds lift as the car passes under, loop out, some return to the wire,
//   the rest settle in the field and rejoin the wire once the car is far
// Stepped over many frames with changing car input, not one call.
//
//   npm run check:fieldbirds     exits 1 on any problem

import { setRegion } from '../src/world/world.js';
import { pointInPolygon } from '../src/drive/geom.js';
import { createFieldBirds, FIELD_BIRDS } from '../src/ambient/fieldbirds.js';
import { DUSTER } from '../src/world/duster.js';
import { crewFrame } from '../src/world/roadcrew.js';

const bad = [];
const ok = (c, m) => { if (!c) bad.push(m); };
const world = setRegion('fenwick');
const make = () => createFieldBirds(world);

// ---- the plan ----
const fb = make();
const fieldFlocks = fb.flocks.filter((f) => f.kind === 'field');
const wireFlocks = fb.flocks.filter((f) => f.kind === 'wire');
ok(fieldFlocks.length >= 3, 'expected several field flocks, got ' + fieldFlocks.length);
ok(wireFlocks.length >= 3, 'expected several wire flocks, got ' + wireFlocks.length);
for (const f of fieldFlocks) {
  ok(f.members.length >= 20 && f.members.length <= 40, 'field flock size ' + f.members.length);
  ok(f.members.every((b) => pointInPolygon(b.x, b.y, f.poly)), 'field birds must start inside their field');
}
for (const f of wireFlocks) ok(f.members.length >= 6 && f.members.length <= 15, 'wire flock size ' + f.members.length);
ok(fb.birds.length === fb.flocks.reduce((n, f) => n + f.members.length, 0), 'birds list is every member');

// One early on Highway 9, a minute or two of driving from the start, clear of the duster and the crew.
const start = world.start;
const early = fb.early;
ok(early && early.kind === 'field', 'an early field flock exists');
if (early) {
  const c = early.members.reduce((a, b) => [a[0] + b.x / early.members.length, a[1] + b.y / early.members.length], [0, 0]);
  const toStart = Math.hypot(c[0] - start.x, c[1] - start.y);
  ok(toStart > 250 && toStart < 1000, 'early flock is ' + Math.round(toStart) + ' m from the start');
  ok(Math.hypot(c[0] - DUSTER.road.x, c[1] - DUSTER.road.y) > FIELD_BIRDS.keepClearDuster, 'early flock too close to the duster');
  const cf = crewFrame(world);
  ok(Math.hypot(c[0] - cf.x, c[1] - cf.y) > FIELD_BIRDS.keepClearCrew, 'early flock too close to the road crew');
  for (const f of fieldFlocks) {
    const fc = f.members[0];
    ok(Math.hypot(fc.x - DUSTER.road.x, fc.y - DUSTER.road.y) > FIELD_BIRDS.keepClearDuster - 100, 'a flock sits in the duster field');
  }
}

// Same seed, same birds. Off means none.
const again = make();
ok(again.birds.length === fb.birds.length && again.birds.every((b, i) => b.x === fb.birds[i].x && b.y === fb.birds[i].y), 'not deterministic');
ok(createFieldBirds(world, { enabled: false }).birds.length === 0, '?fieldbirds=off must give no birds');

// ---- a field flock, car driving at it ----
function drive(flock, opts) {
  const { speed, fromDist, dt = 0.1 } = opts;
  const c = flock.members[0];
  // Approach along a straight line from the south-west, aimed at the first bird.
  const ux = Math.SQRT1_2, uy = -Math.SQRT1_2;
  const car = { x: c.x - ux * fromDist, y: c.y - uy * fromDist, speed };
  const events = [];
  let liftAt = null;
  let t = 0;
  while (t < 1.2 * fromDist / Math.max(speed, 1) && liftAt === null) {
    car.x += ux * speed * dt; car.y += uy * speed * dt; t += dt;
    fb.step(dt, t, car, events);
    if (flock.members.some((b) => b.flying)) {
      liftAt = Math.min(...flock.members.map((b) => Math.hypot(b.x - car.x, b.y - car.y)));
    }
  }
  return { car, events, liftAt, t };
}

const target = early || fieldFlocks[0];
const startPos = target.members.map((b) => [b.x, b.y]);
// Far away and slow: nothing lifts across a hundred frames.
{
  const far = { x: startPos[0][0] - 400, y: startPos[0][1] + 400, speed: 8 };
  const ev = [];
  for (let i = 0; i < 100; i++) fb.step(0.1, i * 0.1, far, ev);
  ok(!target.members.some((b) => b.flying), 'birds lifted with the car 500 m away');
  ok(ev.length === 0, 'scatter event with the car far away');
}
const slow = drive(target, { speed: 6, fromDist: 150 });
ok(slow.liftAt !== null, 'slow car never made the flock lift');
ok(slow.liftAt !== null && slow.liftAt <= FIELD_BIRDS.liftDist + 6 && slow.liftAt >= FIELD_BIRDS.liftDist - 12, 'slow lift distance ' + slow.liftAt);
const mine = slow.events.filter((e) => e.type === 'birds_scatter' && Math.hypot(e.x - startPos[0][0], e.y - startPos[0][1]) < 60);
ok(mine.length === 1, 'exactly one scatter event for this flock, got ' + mine.length);

// Swirl and settle: step the rest of the flight with the car parked past the field.
{
  const car = { x: slow.car.x, y: slow.car.y, speed: 0 };
  let maxZ = 0, minZ = 1e9, wasFlying = true;
  const heights = [];
  let t = slow.t;
  let frames = 0;
  while (target.members.some((b) => b.flying) && frames < 1200) {
    fb.step(0.1, t += 0.1, car, []);
    frames++;
    for (const b of target.members) { maxZ = Math.max(maxZ, b.z); }
    heights.push(Math.max(...target.members.map((b) => b.z)));
  }
  ok(frames < 1200, 'flock never settled');
  ok(maxZ > 5, 'flock never climbed, max height ' + maxZ.toFixed(1));
  ok(frames * 0.1 > 6 && frames * 0.1 < 30, 'flight lasted ' + (frames * 0.1).toFixed(1) + ' s');
  ok(target.members.every((b) => !b.flying && b.z < 0.3), 'birds settle on the ground');
  ok(target.members.every((b) => pointInPolygon(b.x, b.y, target.poly)), 'birds land outside the field');
  const cx = target.members.reduce((a, b) => a + b.x, 0) / target.members.length;
  const cy = target.members.reduce((a, b) => a + b.y, 0) / target.members.length;
  const sx = startPos.reduce((a, p) => a + p[0], 0) / startPos.length;
  const sy = startPos.reduce((a, p) => a + p[1], 0) / startPos.length;
  ok(Math.hypot(cx - sx, cy - sy) >= 25, 'flock settled only ' + Math.hypot(cx - sx, cy - sy).toFixed(1) + ' m from where it lifted');
  // It went up and came down: the tallest frame is neither the first nor the last.
  const peak = heights.indexOf(Math.max(...heights));
  ok(peak > 5 && peak < heights.length - 5, 'height curve has no middle peak');
}
// Settled flock with the car still parked beside it: waits before lifting again.
{
  const c = target.members[0];
  const near = { x: c.x + 5, y: c.y, speed: 0 };
  const ev = [];
  for (let i = 0; i < 20; i++) fb.step(0.1, 500 + i * 0.1, near, ev);
  ok(!target.members.some((b) => b.flying), 'flock lifted again straight away');
}
// A faster car makes them go earlier than a slow one.
{
  const f2 = make();
  const t2 = f2.early || f2.flocks.find((f) => f.kind === 'field');
  const c = t2.members[0];
  const ux = Math.SQRT1_2, uy = -Math.SQRT1_2;
  const car = { x: c.x - ux * 200, y: c.y - uy * 200, speed: 25 };
  const ev = [];
  let t = 0, lift = null;
  while (t < 20 && lift === null) {
    car.x += ux * 25 * 0.05; car.y += uy * 25 * 0.05; t += 0.05;
    f2.step(0.05, t, car, ev);
    if (t2.members.some((b) => b.flying)) lift = Math.min(...t2.members.map((b) => Math.hypot(b.x - car.x, b.y - car.y)));
  }
  ok(lift !== null && slow.liftAt !== null && lift > slow.liftAt + 10, 'a fast car should startle them from further off: ' + lift + ' vs ' + slow.liftAt);
}

// ---- wire birds ----
{
  const f3 = make();
  const w = f3.flocks.find((f) => f.kind === 'wire');
  ok(w.members.every((b) => b.z > 6 && b.z < 9.5), 'wire birds sit at wire height, got ' + w.members.map((b) => b.z.toFixed(1)).join(','));
  const home = w.members.map((b) => [b.x, b.y, b.z]);
  const m0 = w.members[Math.floor(w.members.length / 2)];
  // The car drives along the road beside the line and passes it.
  const dirx = w.axis[0], diry = w.axis[1];
  const car = { x: m0.x - dirx * 120 + w.side[0] * 9, y: m0.y - diry * 120 + w.side[1] * 9, speed: 15 };
  const ev = [];
  let t = 0, lifted = false, maxAlong = -1e9;
  while (t < 14) {
    car.x += dirx * 15 * 0.1; car.y += diry * 15 * 0.1; t += 0.1;
    f3.step(0.1, t, car, ev);
    if (!lifted && w.members.some((b) => b.flying)) { lifted = true; }
  }
  ok(lifted, 'wire birds never lifted');
  ok(ev.filter((e) => e.type === 'birds_scatter' && Math.hypot(e.x - w.mid[0], e.y - w.mid[1]) < 1).length === 1, 'wire flock: one scatter event');
  // Let the loop finish with the car well away (still, near the end of the run).
  const away = { x: car.x, y: car.y, speed: 0 };
  let frames = 0;
  while (w.members.some((b) => b.flying) && frames < 600) { f3.step(0.1, t += 0.1, away, []); frames++; }
  ok(frames < 600, 'wire birds never landed');
  const back = w.members.filter((b, i) => Math.hypot(b.x - home[i][0], b.y - home[i][1]) < 0.6 && Math.abs(b.z - home[i][2]) < 0.3).length;
  ok(back >= 1 && back < w.members.length, 'some, not all, return to the wire: ' + back + ' of ' + w.members.length);
  // Far car: the rest rejoin the wire.
  const gone = { x: m0.x + 400, y: m0.y + 400, speed: 0 };
  for (let i = 0; i < 1200; i++) f3.step(0.1, t += 0.1, gone, []);
  const all = w.members.every((b, i) => Math.hypot(b.x - home[i][0], b.y - home[i][1]) < 0.6 && !b.flying && !b.hidden);
  ok(all, 'wire birds did not all rejoin the wire');
}

if (bad.length) {
  console.error('fieldbirds check FAILED:\n- ' + bad.join('\n- '));
  process.exit(1);
}
console.log('fieldbirds check ok: ' + fieldFlocks.length + ' field flocks, ' + wireFlocks.length + ' wire flocks');
