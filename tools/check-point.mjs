// check:point (#93): which way a local points, and the arm that does it.
import { pointFromText, pointBearing, thingPoint, aimArm, pointVector } from '../src/game/pointing.js';
import { newAct, actStep, personPose, POINT_S, BONES } from '../src3/world3d/peopleLook.js';
import { WORLD } from '../src/world/world.js';

let fails = 0;
const fail = (m) => { console.log('FAIL', m); fails++; };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

// ---- words to a direction ----
eq(pointFromText('Go straight north out of town on the dirt road.'), { compass: 0 }, 'north');
eq(pointFromText("It's out the northeast side of town."), { compass: 45 }, 'northeast');
eq(pointFromText('Head south-west past the mill.'), { compass: 225 }, 'south-west');
eq(pointFromText('Keep on till you meet Pond Road and turn left.'), { turn: 'left' }, 'turn left');
eq(pointFromText('Turn right on Field Lane and follow it east.'), { turn: 'right' }, 'first direction wins');
eq(pointFromText('Back down to the fork, then east, then left.'), { compass: 90 }, 'first by position');
eq(pointFromText('Past the rusted car on your right.'), { turn: 'right' }, 'on your right');
eq(pointFromText('Straight on past the barn.'), { turn: 'ahead' }, 'straight on');
eq(pointFromText('Straight on, then turn left.'), { turn: 'left' }, 'turn beats straight on');
// no clear direction, no point
eq(pointFromText("Couldn't tell you, sorry."), null, 'no idea');
eq(pointFromText('Never heard of it, sorry.'), null, 'never heard');
eq(pointFromText('Right here by the station. All right?'), null, 'bare right');
eq(pointFromText('North Fork Road? Never been.'), null, 'a name');
eq(pointFromText("Don't go east, it's washed out."), null, 'negated');
eq(pointFromText(''), null, 'empty');

// Every line in the world: none throws, and some do point.
let lines = 0, pointing = 0;
const seen = new Set();
for (const l of WORLD.locals) {
  for (const t of Object.values(l.topics || {})) for (const s of t.lines) {
    lines++;
    const p = pointFromText(s);
    if (p) pointing++;
    if (p && p.compass != null && !(p.compass >= 0 && p.compass < 360)) fail(`bad bearing for: ${s}`);
  }
  for (const s of l.fallback || []) if (pointFromText(s)) fail(`fallback points: ${s}`);
  seen.add(l.id);
}
if (!(pointing > 20 && pointing < lines)) fail(`${pointing} of ${lines} lines point`);

// ---- relative turns use the player's facing ----
eq(pointBearing({ turn: 'left' }, 0), 270, 'left facing north');
eq(pointBearing({ turn: 'right' }, 90), 180, 'right facing east');
eq(pointBearing({ turn: 'ahead' }, 200), 200, 'ahead');
eq(pointBearing({ compass: 45 }, 123), 45, 'compass ignores facing');
eq(pointBearing(null, 0), null, 'null point');
eq(thingPoint(false, 80), null, 'does not know the thing');
eq(thingPoint(true, 370), { compass: 10 }, 'thing bearing');
eq(thingPoint(true, NaN), null, 'no bearing');

// ---- turning side-on when the point is behind them ----
import { pointFacing } from '../src/game/pointing.js';
eq(pointFacing(90, 0), 0, 'in front: keep facing the player');
eq(pointFacing(100, 0), 0, 'edge of the front');
eq(pointFacing(170, 0), 70, 'behind, to the right: turn until the arm is straight out');
eq(pointFacing(200, 0), 300, 'behind, to the left: turn the other way');
eq(pointFacing(270, 0), 0, 'to the left, in range');
eq(pointFacing(340, 100), 80, 'wraps round north');

// ---- the arm aims where asked ----
// Rotate (0,-1,0) by Rx(a) Ry(0) Rz(c), three's XYZ order, and compare.
const hang = ({ a, c }) => {
  const x1 = Math.sin(c), y1 = -Math.cos(c); // Rz
  return [x1, y1 * Math.cos(a), y1 * Math.sin(a)]; // Rx
};
for (const bearing of [0, 30, 90, 150, 180, 250, 300]) {
  for (const side of [1, -1]) {
    const v = pointVector(bearing, 0);
    const got = hang(aimArm(v, side)); // the left arm's own mirror makes the same world aim
    const err = Math.hypot(got[0] - v[0], got[1] - v[1], got[2] - v[2]);
    if (err > 1e-6) fail(`arm ${side} bearing ${bearing}: aim off by ${err.toFixed(3)}`);
  }
}
// To their right (east when facing north) lifts the right arm out; to the left lifts the left.
const r = aimArm(pointVector(90, 0), 1), l = aimArm(pointVector(270, 0), -1);
if (!(r.c > 1.2)) fail(`right arm out: z ${r.c}`);
if (!(l.c < -1.2)) fail(`left arm out: z ${l.c}`);
// Their facing counts: pointing north while facing east is to their left.
if (!(pointVector(0, 90)[0] < -0.9)) fail('bearing is not relative to facing');

// ---- the blend, over several calls with changing input ----
const look = { seed: 0.3, idle: 'hips' };
const a = newAct();
const inp = { carDist: 5, carSpeed: 0, onFoot: true, moving: false, talking: true, pointVec: pointVector(90, 0) };
const pose = () => personPose(look, a, 1, { moving: false, walk: 0, headYaw: 0 });
for (const b of BONES) if (!pose().rot[b].every(Number.isFinite)) fail('rest pose not finite');
const restZ = pose().rot.uaR[2];
actStep(a, inp, 0.1);
const z1 = pose().rot.uaR[2];
actStep(a, inp, 0.1);
const z2 = pose().rot.uaR[2];
actStep(a, inp, 0.2);
const z3 = pose().rot.uaR[2];
if (!(restZ < z1 && z1 < z2 && z2 < z3)) fail(`arm does not rise: ${restZ} ${z1} ${z2} ${z3}`);
if (Math.abs(a.point - 1) > 1e-9) fail(`point ${a.point} after ${POINT_S} s`);
if (a.pointArm !== 1) fail('right-hand target should use the right arm');
// Held while the page is on screen, the aim follows a new direction.
inp.pointVec = pointVector(100, 0);
for (let i = 0; i < 30; i++) actStep(a, inp, 0.1);
if (a.point !== 1) fail('point not held');
// No direction: the arm drops over about 0.3 s.
inp.pointVec = null;
actStep(a, inp, 0.1);
const d1 = pose().rot.uaR[2];
if (!(a.point > 0 && a.point < 1 && d1 < z3)) fail(`arm does not ease down: ${a.point} ${d1}`);
actStep(a, inp, 0.25);
if (a.point !== 0) fail('arm not down after the blend');
if (Math.abs(pose().rot.uaR[2] - restZ) > 0.5) fail('arm not back near rest');
// A target to their left picks the left arm, and holds it if the aim wanders.
inp.pointVec = pointVector(270, 0);
actStep(a, inp, 0.1);
if (a.pointArm !== -1) fail('left target should use the left arm');
inp.pointVec = pointVector(300, 0);
actStep(a, inp, 0.1);
if (a.pointArm !== -1) fail('arm flipped mid-point');
if (!(pose().rot.uaL[2] < -0.5)) fail(`left arm not up: ${pose().rot.uaL[2]}`);
// Not talking (or walking off): the arm comes down; the fisher keeps her rod.
inp.talking = false;
for (let i = 0; i < 5; i++) actStep(a, inp, 0.1);
if (a.point !== 0) fail('still pointing after the talk ended');
const fisher = { seed: 0.5, idle: 'cast', seated: true };
const fa = newAct();
fa.point = 1;
fa.pointVec = pointVector(90, 0);
if (personPose(fisher, fa, 1, { moving: false, walk: 0, headYaw: 0 }).rot.uaR[2] > 1) fail('the rod hand points');

console.log(`check:point: ${pointing} of ${lines} lines give a direction`);
if (fails) { console.log(`check:point: ${fails} failures`); process.exit(1); }
console.log('check:point: ok');
