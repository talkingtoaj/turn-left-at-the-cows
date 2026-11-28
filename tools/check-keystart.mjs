// Checks the key start rules (src3/keystart.js, #91): which mode plays, and
// the shot's timeline over many frames.
import { keyStartMode, flyState, lerp3, eyePose, FLY_MS, HOLD } from '../src3/keystart.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.error('FAIL', m); } };

// Modes: same call with changing input.
ok(keyStartMode({}) === 'fly', 'default flies');
ok(keyStartMode({ flag: 'off' }) === 'off', '?keystart=off keeps today');
ok(keyStartMode({ phone: true }) === 'off', 'phone has no start scene');
ok(keyStartMode({ reducedMotion: true }) === 'fade', 'reduced motion fades');
ok(keyStartMode({ reducedMotion: true, weak: true }) === 'fade', 'reduced motion beats weak');
ok(keyStartMode({ weak: true }) === 'wake', 'weak device: no camera move');
ok(keyStartMode({ flag: 'off', reducedMotion: true }) === 'off', 'off beats reduced motion');
ok(keyStartMode({ flag: 'on' }) === 'fly', 'other flag values fly');

// Timeline: sampled every frame, it only ever moves forward and ends at 1.
let prev = flyState(0);
ok(prev.cam === 0 && prev.dash === 0 && !prev.done, 'starts at the seat');
let hold = true;
for (let ms = 16; ms <= FLY_MS + 100; ms += 16) {
  const s = flyState(ms);
  ok(s.cam >= prev.cam && s.dash >= prev.dash, 'never goes backward at ' + ms);
  ok(s.cam >= 0 && s.cam <= 1 && s.dash >= 0 && s.dash <= 1, 'stays in 0..1 at ' + ms);
  if (ms / FLY_MS < HOLD) hold = hold && s.cam === 0;
  prev = s;
}
ok(hold, 'camera waits at the seat first');
ok(flyState(FLY_MS).done && flyState(FLY_MS).cam === 1 && flyState(FLY_MS).dash === 1, 'ends at the chase view');
ok(!flyState(FLY_MS - 1).done, 'not done early');
ok(flyState(FLY_MS * 0.5).cam > 0 && flyState(FLY_MS * 0.5).cam < 1, 'mid-shot is between');
ok(flyState(-50).cam === 0, 'before the start is the seat');

// Eye: in front of and left of the origin for two headings.
for (const [h, fwd] of [[0, { x: 0, z: -1 }], [90, { x: 1, z: 0 }]]) {
  const { eye, look } = eyePose({ x: 10, y: 2, z: 20 }, h);
  ok(eye.y > 3, 'eye is above the car at heading ' + h);
  ok(((look.x - eye.x) * fwd.x + (look.z - eye.z) * fwd.z) > 19, 'looks forward at heading ' + h);
}
const n = eyePose({ x: 0, y: 0, z: 0 }, 0).eye;
ok(n.x < 0, 'driver sits on the left of a north-facing car');
const e90 = eyePose({ x: 0, y: 0, z: 0 }, 90).eye;
ok(e90.z < 0, 'driver sits on the left of an east-facing car (north side)');

// lerp3 into a reused object.
const out = { x: 0, y: 0, z: 0 };
lerp3(out, { x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5);
ok(out.x === 5 && out.y === 10 && out.z === 15, 'lerp3 half way');
lerp3(out, { x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 1);
ok(out.x === 10 && out.z === 30, 'lerp3 full');

if (bad) { console.error(bad + ' check(s) failed'); process.exit(1); }
console.log('check-keystart: ok');
