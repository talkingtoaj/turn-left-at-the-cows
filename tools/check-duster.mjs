// Crop duster checker (#90, src/world/duster.js): the flight is a pure
// function of time since it appears. It must start low and dive to the field,
// spray only on the field passes, cross Highway 9 low, bank in the turns,
// leave for good, and give the same answer every time it is asked.
//
//   node tools/check-duster.mjs
import { DUSTER, dusterAt, dusterLength } from '../src/world/duster.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };

const total = dusterLength();
ok(total > 40 && total < 200, 'flight lasts 40 to 200 s, got ' + total);

// Before it appears and after it has gone: not visible.
ok(!dusterAt(-1).visible, 'hidden before the start');
ok(!dusterAt(total + 1).visible, 'hidden after the end');
ok(dusterAt(0.5).visible && dusterAt(total - 0.5).visible, 'visible just inside both ends');

// Walk the flight at 0.25 s steps.
const road = DUSTER.road; // { x, y, ux, uy } a point on Highway 9 and its direction
let sprayed = 0, crossings = [], maxBank = 0, minAlt = 1e9, sawPitchDown = false, sawPitchUp = false;
let prevSide = null;
for (let t = 0; t <= total; t += 0.25) {
  const s = dusterAt(t);
  if (!s.visible) { ok(false, 'gap in flight at ' + t); break; }
  // Lateral distance from the road line (positive south).
  const l = (s.x - road.x) * -road.uy + (s.y - road.y) * road.ux;
  const a = (s.x - road.x) * road.ux + (s.y - road.y) * road.uy;
  if (s.spray) {
    sprayed++;
    ok(s.alt < 8, 'spraying low at ' + t + ' alt ' + s.alt);
    ok(l > 20 && l < 120, 'spraying over the field side of the road, l ' + l);
    ok(Math.abs(a) < DUSTER.passLen / 2 + 1, 'spraying inside the field length');
  }
  const side = l > 0 ? 1 : -1;
  if (prevSide !== null && side !== prevSide) crossings.push(s.alt);
  prevSide = side;
  maxBank = Math.max(maxBank, Math.abs(s.bank));
  minAlt = Math.min(minAlt, s.alt);
  if (s.pitch < -0.05) sawPitchDown = true;
  if (s.pitch > 0.05) sawPitchUp = true;
  ok(Math.abs(Math.hypot(s.vx, s.vy) - DUSTER.speed) < 3, 'ground speed near ' + DUSTER.speed + ' at ' + t);
}
ok(sprayed * 0.25 > 12, 'sprays for at least 12 s in all, got ' + sprayed * 0.25);
ok(crossings.length >= 4, 'crosses the road at least 4 times, got ' + crossings.length);
ok(crossings.every((h) => h >= 15 && h <= 30), 'every crossing 15 to 30 m up: ' + crossings.map((h) => h.toFixed(1)).join(' '));
ok(maxBank > 0.5 && maxBank < 1.2, 'banks 30 to 70 degrees in the turns, got ' + maxBank);
ok(minAlt < 6, 'gets down to spray height, min ' + minAlt);
ok(sawPitchDown && sawPitchUp, 'dives and pulls up');

// Same answer on a second call, and the spray is off in the turns.
const A = dusterAt(30.3, {}), B = dusterAt(30.3, {});
ok(JSON.stringify(A) === JSON.stringify(B), 'same time, same state');
let offTurn = false;
for (let t = 0; t <= total; t += 0.5) { const s = dusterAt(t); if (!s.spray && Math.abs(s.bank) > 0.6) offTurn = true; }
ok(offTurn, 'spray is off while banking round');

// Per-frame use: states change as time moves, and the object passed in is reused.
const o = {};
const p1 = { ...dusterAt(10, o) };
const p2 = { ...dusterAt(11, o) };
ok(Math.hypot(p2.x - p1.x, p2.y - p1.y) > 20, 'moves between frames');

if (fails) { console.log(fails + ' problem(s)'); process.exit(1); }
console.log('duster ok: ' + total.toFixed(0) + ' s, sprays ' + (sprayed * 0.25).toFixed(0) + ' s, max bank ' + (maxBank * 57.3).toFixed(0) + ' deg');
