// Traffic checker: the pure rules in src/ambient/trafficRules.js, then a
// short run of the real traffic (src/ambient/ambient.js) in every region
// with the player parked on a road:
//   - an AI car stops for the player only in its own lane, and passes an
//     oncoming car in the other lane (it may ease off, never stop),
//   - the car count stays the same,
//   - no car turns round in, or waits at, a fixed fallen tree's gap,
//   - no car stands stuck for long far from the player,
//   - a car the player holds up honks on the backoff schedule (HONK), then
//     turns round with a three-point turn that keeps to the road,
//   - junctions (SPEC 9q): cars slow for a turn and drive a curve that keeps
//     to the road, blink a few seconds first, stop fully at a STOP sign
//     (only on dirt roads), go one at a time, never move into a junction
//     the player stands in, and never flip round on the spot (dead ends and
//     broken bridges get a three-point turn).
//
//   npm run check:traffic
//
// Exits 1 when any check fails.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { createAmbient } from '../src/ambient/ambient.js';
import { fallenShape } from '../src/world/fallenTrees.js';
import {
  TRAFFIC, relTo, inLane, playerSpeedCap, seenByPlayer, respawnReason, goodRespawn,
  HONK, hornOn, honkStage, stepBlocked, turnPose, turnLength, TURN,
  JUNCTION, brakeCap, turnSpeed, turnSide, blinkLit, blinkNow, stopsAt, junctionCurve, curveAt, headedInto,
} from '../src/ambient/trafficRules.js';

let fails = 0;
function check(ok, what) {
  if (!ok) {
    fails++;
    console.log(`FAIL ${what}`);
  }
}

// ---------- Pure rules ----------
// relTo: north-facing car, a point 10 m north and 2 m east is 10 ahead, 2 right.
{
  const r = relTo(0, 0, 0, 2, -10);
  check(Math.abs(r.along - 10) < 1e-9 && Math.abs(r.lat - 2) < 1e-9, 'relTo north');
  const e = relTo(0, 0, 90, 10, 2); // facing east: 2 m south is to the right
  check(Math.abs(e.along - 10) < 1e-9 && Math.abs(e.lat - 2) < 1e-9, 'relTo east');
}
// Lanes are road width / 2 apart: 2.25 m on the narrowest dirt road, 4.5 m on paved 9.
for (const gap of [2.25, 3, 4, 4.5]) {
  // Oncoming player car centred in the other lane, close ahead: no stop.
  for (const along of [3, 10, 20]) {
    const cap = playerSpeedCap(along, -gap, false);
    check(cap > 3, `oncoming player car in other lane (lanes ${gap} m apart, ${along} m ahead) slows to ${cap}`);
  }
  // On foot at the far edge of the other lane: no stop.
  check(playerSpeedCap(10, -gap, true) > 3, `person in other lane (${gap} m) stops traffic`);
}
// In its own lane ahead: stops short.
check(playerSpeedCap(8, 0, false) === 0, 'player car dead ahead in lane: stop');
check(playerSpeedCap(8, 0.6, true) === 0, 'person in lane: stop');
check(playerSpeedCap(20, 0.5, false) < 14 * 1.1, 'player car 20 m ahead in lane: slow');
// Behind, or well off to the side: no limit.
check(playerSpeedCap(-10, 0, false) === Infinity, 'player behind: no limit');
check(playerSpeedCap(10, 8, false) === Infinity, 'player off the road: no limit');
check(!inLane(30, 0, 0.9), 'past the look window');
// Views and moving cars.
check(seenByPlayer(300, 0.9) && !seenByPlayer(300, -0.5) && seenByPlayer(40, -1) && !seenByPlayer(700, 1), 'seenByPlayer');
check(respawnReason(800, 0, true) === 'far', 'far car moves');
check(respawnReason(400, 0, false) === null, 'moving car in range stays');
check(respawnReason(100, 30, false) === null, 'stuck car near the player stays');
check(respawnReason(200, 30, false) === 'stuck', 'stuck car out of sight moves');
check(respawnReason(200, 30, true) === null, 'stuck car in sight stays a while');
check(respawnReason(200, TRAFFIC.stuckMaxT + 1, true) === 'stuck', 'stuck car moves in the end');
check(goodRespawn(500, false) && !goodRespawn(500, true) && !goodRespawn(300, false) && !goodRespawn(900, false), 'goodRespawn');

// ---------- Honk backoff ----------
// Sample the horn every 10 ms over a 60 s block: the bursts it sounds.
{
  const runs = [];
  let on = false;
  for (let i = 0; i <= 6000; i++) {
    const t = i / 100;
    const h = hornOn(t);
    if (h && !on) runs.push({ at: t, len: 0 });
    if (h) runs[runs.length - 1].len = t - runs[runs.length - 1].at + 0.01;
    on = h;
  }
  const near = (a, b) => Math.abs(a - b) < 0.03;
  const starts = runs.map((r) => r.at);
  // 4 s: 1 beep. 8 s: 2. 16 s: 3, the last long. 32 s: a solid 10 s lean.
  const want = [4, 8, 8.55, 16, 16.6, 17.2, 32];
  check(runs.length === want.length && want.every((w, k) => near(starts[k], w)), `horn starts ${starts.join(', ')}`);
  const lens = runs.map((r) => r.len);
  check(lens.length === want.length && near(lens[6], HONK.leanLen), `lean lasts ${lens[6]} s`);
  check(lens[5] > lens[4] * 2, 'third burst ends in a long honk');
  check(!hornOn(3.99) && !hornOn(12) && !hornOn(25) && !hornOn(42.01), 'quiet between bursts and after the lean');
  check(honkStage(2) === 'wait' && honkStage(5) === 'honk' && honkStage(33) === 'lean' && honkStage(42) === 'turn', 'honk stages');
  // Each gap at least doubles until the lean (backoff).
  const bursts = HONK.bursts.map((b) => b.at).concat(HONK.leanAt);
  for (let k = 2; k < bursts.length; k++) check(bursts[k] - bursts[k - 1] >= 2 * (bursts[k - 1] - bursts[k - 2]) - 1e-9, `backoff gap ${k}`);
  // The count: runs while blocked, survives a blink of clear, resets after grace.
  const st = { t: 0, clearT: 0 };
  for (let i = 0; i < 100; i++) stepBlocked(st, true, 0.1);
  check(Math.abs(st.t - 10) < 1e-6, 'blocked count runs');
  stepBlocked(st, false, HONK.grace / 2);
  stepBlocked(st, true, 0.1);
  check(st.t > 10, 'a blink of clear does not reset');
  for (let i = 0; i < 20; i++) stepBlocked(st, false, 0.1);
  check(st.t === 0, 'clear for the grace time resets');
}

// ---------- Three-point turn ----------
// Ends in the other lane facing back, never goes past 4 m ahead (the player
// is TRAFFIC.stopGap ahead), keeps the car's corners on the road plus a
// metre of verge, and moves smoothly.
for (const w of [4.5, 6, 7, 9]) {
  const L = turnLength();
  const end = turnPose(w, L + 1);
  check(end.done && Math.abs(end.v + w / 4) < 1e-6 && Math.abs(end.h + 180) < 1e-6, `turn ends in the other lane facing back (w ${w})`);
  check(Math.abs(turnPose(w, 0).v - w / 4) < 1e-6, `turn starts in the lane (w ${w})`);
  let prev = turnPose(w, 0);
  let maxU = -Infinity;
  let worstEdge = 0;
  let worstStep = 0;
  for (let t = 0.05; t <= L; t += 0.05) {
    const q = turnPose(w, t);
    maxU = Math.max(maxU, q.u);
    worstStep = Math.max(worstStep, Math.hypot(q.u - prev.u, q.v - prev.v));
    const cu = Math.cos(q.h * Math.PI / 180);
    const cv = Math.sin(q.h * Math.PI / 180);
    for (const [a, b] of [[2.2, 0.9], [2.2, -0.9], [-2.2, 0.9], [-2.2, -0.9]]) {
      const v = q.v + cv * a + cu * b;
      worstEdge = Math.max(worstEdge, Math.abs(v) - w / 2);
    }
    prev = q;
  }
  check(maxU < TRAFFIC.stopGap - 5, `turn reaches ${maxU.toFixed(1)} m ahead (w ${w})`);
  check(worstEdge < 1.5, `turn puts a corner ${worstEdge.toFixed(2)} m off the road (w ${w})`);
  check(worstStep < 0.4, `turn jumps ${worstStep.toFixed(2)} m in a step (w ${w})`);
}
check(TURN.legs.length === 3, 'three legs');

// ---------- Junction rules ----------
// Braking: zero at the line, faster further out, the turn speed at the turn.
{
  check(brakeCap(0) === 0 && brakeCap(-3) === 0, 'brakeCap stops at the line');
  let prev = -1;
  for (const d of [0, 1, 5, 20, 60]) {
    const v = brakeCap(d, 4);
    check(v > prev, `brakeCap grows with distance (${d} m)`);
    prev = v;
  }
  check(Math.abs(brakeCap(0, 4.5) - 4.5) < 1e-9, 'brakeCap at the turn is the turn speed');
  // A car braking for a stop line from 14 m/s, stepped like the game: it
  // stops at the line, not past it.
  let s = 0;
  let v = 14;
  const line = 80;
  for (let t = 0; t < 30; t += 0.05) {
    const target = brakeCap(line - 0.3 - s);
    v += Math.max(-5.5 * 0.05, Math.min(2.2 * 0.05, target - v));
    if (v < 0.02 && target <= 0.05) v = 0;
    s += v * 0.05;
  }
  check(v === 0 && s < line && s > line - 1.5, `brakes to a stop at the line (${(line - s).toFixed(2)} m short)`);
}
check(turnSpeed(90) === JUNCTION.turnV[0] && turnSpeed(0) === JUNCTION.turnV[1] && turnSpeed(45) < turnSpeed(10), 'turn speed by angle');
// Turn side over a sweep of exit headings, entering facing east.
{
  const want = [[90, 0], [100, 0], [180, 1], [260, 1], [0, -1], [20, -1], [80, 0]];
  for (const [h, side] of want) check(turnSide(90, h) === side, `turnSide 90 -> ${h} is ${side}`);
  check(turnSide(350, 80) === 1 && turnSide(10, 280) === -1, 'turnSide across north');
}
// Blinker: lit, dark, lit again over a second and a half; starts before the turn.
{
  const seq = [0, 0.2, 0.45, 0.6, 0.85, 1.25].map((t) => blinkLit(t));
  check(seq.join() === 'true,true,false,false,true,false', `blink sequence ${seq.join()}`);
  check(blinkNow(30, 10) && !blinkNow(60, 10) && blinkNow(15, 0) && !blinkNow(25, 2), 'blink starts a few seconds out');
}
// Which arms stop: dirt meeting a paved road that carries on through.
{
  const P = (through) => ({ paved: true, through });
  const D = (through) => ({ paved: false, through });
  check(stopsAt([P(true), D(false)]).join() === 'false,true', 'T: dirt road ends on a paved one, dirt stops');
  check(stopsAt([P(false), P(false), D(false), D(false)]).join() === 'false,false,true,true', 'two paved ends and two dirt ends: dirt stops');
  check(stopsAt([P(false), D(false)]).join() === 'false,false', 'paved runs on into dirt end to end: no stop');
  check(stopsAt([D(true), D(false)]).join() === 'false,false', 'dirt with dirt: no stop');
  check(stopsAt([P(true), P(false)]).join() === 'false,false', 'paved never stops');
}
// Curves: start and end where asked, facing the right way, no kinks, inside
// a square corner (a right turn on 9 m road onto 4.5 m road).
{
  for (const [h3, p3, label] of [[90, [6, -8], 'right'], [270, [-8, -10], 'left'], [0, [0, -16], 'straight'], [135, [9, -3], 'sharp right']]) {
    const p0 = [0, 0];
    const cv = junctionCurve(p0, 0, p3, h3);
    const a = curveAt(cv, 0);
    const b = curveAt(cv, cv.len + 1);
    check(Math.hypot(a.x - p0[0], a.y - p0[1]) < 1e-9 && Math.hypot(b.x - p3[0], b.y - p3[1]) < 1e-9, `${label} curve ends`);
    check(Math.abs(turnSide(curveAt(cv, cv.len - 0.01).h, h3)) === 0 && Math.abs(turnSide(curveAt(cv, 0.01).h, 0)) === 0, `${label} curve leaves and arrives facing its lanes`);
    let worst = 0;
    let prev = curveAt(cv, 0);
    for (let u = 0.25; u <= cv.len; u += 0.25) {
      const q = curveAt(cv, u);
      let d = Math.abs(q.h - prev.h);
      if (d > 180) d = 360 - d;
      worst = Math.max(worst, d / 0.25);
      prev = q;
    }
    check(worst < 40, `${label} curve turns ${worst.toFixed(0)} deg per metre at most`);
  }
}
// Headed into a junction: inside, or coming at it soon; not going away or parked.
{
  check(headedInto(0, 0, 0, 0, 2, -2, 5), 'inside the junction');
  check(headedInto(0, 60, 0, 14, 0, 0, 8), 'coming at 14 m/s from 60 m');
  check(!headedInto(0, 200, 0, 14, 0, 0, 8), 'far off');
  check(!headedInto(0, 60, 180, 14, 0, 0, 8), 'going away');
  check(!headedInto(0, 30, 0, 0, 0, 0, 8), 'parked outside');
  check(!headedInto(40, 30, 0, 14, 0, 0, 8), 'passing to one side');
}

// ---------- Simulation per region ----------
const DT = 0.05;
const SIM = 600; // s
let allTurns = 0;
for (const id of REGION_IDS) {
  const world = setRegion(id);
  const scenery = generateScenery(world);
  const amb = createAmbient(world, scenery);
  const n0 = amb.cars.length;
  // Player parked in the right lane of the longest paved road, half way.
  const road = world.roads.filter((r) => r.type === 'paved').sort((a, b) => b.points.length - a.points.length)[0] || world.roads[0];
  const k = Math.floor(road.points.length / 2);
  const [ax, ay] = road.points[k];
  const [bx, by] = road.points[k + 1] || road.points[k - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (bx - ax) / L;
  const dy = (by - ay) / L;
  const off = road.width / 4;
  const car = { x: ax - dy * off, y: ay + dx * off, heading: (Math.atan2(dx, -dy) * 180) / Math.PI, speed: 0 };
  const state = { car };
  const fallen = scenery.fallen || [];
  const solids = fallen.flatMap((f) => fallenShape(f).solids);
  const stuck = new Map();
  let worstStuck = 0;
  let inGap = 0;
  let oncomingStops = 0;
  let hornFrames = 0;
  let turns = 0;
  const wasTurning = new Map();
  for (let t = 0; t < SIM; t += DT) {
    amb.obstacles.length = 0;
    amb.update(DT, state);
    check(amb.cars.length === n0, `${id}: car count changed`);
    hornFrames += amb.horns.length;
    for (const c of amb.cars) {
      if (wasTurning.get(c.id) && !c.turning) turns++;
      wasTurning.set(c.id, c.turning);
      const d = Math.hypot(c.x - car.x, c.y - car.y);
      const s = c.speed < 0.3 ? (stuck.get(c.id) || 0) + DT : 0;
      stuck.set(c.id, s);
      if (d > 200 && s > worstStuck) worstStuck = s;
      if (solids.some((o) => Math.hypot(c.x - o.x, c.y - o.y) < 6)) inGap++;
      // A car stopped close by with the player in the other lane.
      const r = relTo(c.x, c.y, c.heading, car.x, car.y);
      if (c.speed < 0.5 && r.along > 0 && r.along < 26 && Math.abs(r.lat) > 2 && Math.abs(r.lat) < 5) {
        const blockedBy = amb.cars.some((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 15);
        if (!blockedBy) oncomingStops++;
      }
    }
  }
  check(worstStuck < TRAFFIC.stuckMaxT + 5, `${id}: a car stood stuck ${worstStuck.toFixed(0)} s far from the player`);
  check(inGap === 0, `${id}: cars went into a fallen tree's gap (${inGap} frames)`);
  check(oncomingStops === 0, `${id}: cars stopped for the player in the other lane (${oncomingStops} frames)`);
  allTurns += turns;
  const near = amb.cars.filter((c) => Math.hypot(c.x - car.x, c.y - car.y) < TRAFFIC.farR).length;
  console.log(`${id}: ${n0} cars, ${near} within ${TRAFFIC.farR} m after ${SIM} s, longest far stuck ${worstStuck.toFixed(1)} s, ${fallen.length} fallen trees, horn ${(hornFrames * DT).toFixed(1)} s, ${turns} turned round`);
}

// The parked player blocks some car somewhere: it must have turned round.
check(allTurns > 0, 'no car turned round for the parked player in any region');

// ---------- Junctions in the running traffic ----------
// Three runs per region. Start: the player parked where the region starts. Roaming: the player hops to a new spot every two
// minutes so traffic comes and goes all over. Parked: the player stands in
// the middle of a STOP junction, and no car may drive into it.
// Every frame, every car (skipping frames where it was put back elsewhere):
// no jump, no flip on the spot, curves on the road, a blink 2 s before
// each turn, a full stop before going at a STOP line (dirt roads only),
// one car at a time in a junction.
function junctionRun(id, mode) {
  const world = setRegion(id);
  const amb = createAmbient(world, generateScenery(world));
  const stopNode = amb.junctions.find((j) => amb.stopSigns.some((g) => Math.hypot(g.x - j.x, g.y - j.y) < 20));
  const car = mode === 'parked' ? { x: stopNode.x, y: stopNode.y, heading: 0, speed: 0 }
    : mode === 'start' ? { ...world.start, speed: 0 } : { x: world.size.w / 2, y: world.size.h / 2, heading: 0, speed: 0 };
  const still = new Map();
  let worstStill = 0;
  const prev = new Map();
  const st = { curves: 0, offRoad: 0, gos: 0, earlyGo: 0, pavedStop: 0, maxRate: 0, maxStep: 0, lateBlink: 0, shared: 0, intoPlayer: 0, turnRounds: 0 };
  const T = mode === 'roam' ? 600 : 900;
  for (let i = 0; i * DT < T; i++) {
    const t = i * DT;
    if (mode === 'roam' && i % 2400 === 0) {
      const c = amb.cars[(i / 2400) % amb.cars.length];
      car.x = c.x + 300;
      car.y = c.y;
    }
    amb.update(DT, { car });
    const inJ = new Set();
    for (const c of amb.cars) {
      const p = prev.get(c.id);
      if (c.junction) {
        if (inJ.has(c.junction)) st.shared++;
        inJ.add(c.junction);
        if (mode === 'parked' && c.junction === stopNode.id) st.intoPlayer++;
      }
      if (c.stage === 'stopped' && !c.onDirt) st.pavedStop++;
      // Standing still near the parked player: it should honk and turn
      // round, never wait for good.
      const sNear = mode !== 'roam' && c.speed < 0.3 && Math.hypot(c.x - car.x, c.y - car.y) < 100 ? (still.get(c.id) || 0) + DT : 0;
      still.set(c.id, sNear);
      worstStill = Math.max(worstStill, sNear);
      if (p && p.placed === c.placed) {
        let d = Math.abs(c.heading - p.heading);
        if (d > 180) d = 360 - d;
        st.maxRate = Math.max(st.maxRate, d / DT);
        st.maxStep = Math.max(st.maxStep, Math.hypot(c.x - p.x, c.y - p.y));
        if (c.stage === 'curve' && p.stage !== 'curve') {
          st.curves++;
          if (c.signal && p.sigT < 2 && t - p.placedT > 10) st.lateBlink++;
        }
        if (c.stage === 'curve' && amb.surfaceAt(c.x, c.y) === 'grass') st.offRoad++;
        if (c.stage === 'go' && p.stage !== 'go') {
          st.gos++;
          if (p.stage !== 'stopped' || p.speed !== 0 || p.stoppedT + 2 * DT < JUNCTION.stopWait - 1e-6) st.earlyGo++;
        }
        if (c.turning && !p.turning) st.turnRounds++;
      }
      const same = p && p.placed === c.placed;
      prev.set(c.id, {
        x: c.x, y: c.y, heading: c.heading, placed: c.placed, stage: c.stage, speed: c.speed, signal: c.signal, turning: c.turning,
        sigT: same && c.signal && c.signal === p.signal ? p.sigT + DT : 0,
        stoppedT: same && c.stage === 'stopped' && p.stage === 'stopped' ? p.stoppedT + DT : 0,
        placedT: same ? p.placedT : t,
      });
    }
  }
  const tag = `${id} ${mode}`;
  check(st.maxStep < 1.2, `${tag}: a car jumped ${st.maxStep.toFixed(2)} m in a frame`);
  check(st.maxRate < 120, `${tag}: a car turned ${st.maxRate.toFixed(0)} deg/s (a flip on the spot?)`);
  check(st.offRoad === 0, `${tag}: cars left the road in a junction curve (${st.offRoad} frames)`);
  check(st.lateBlink === 0, `${tag}: ${st.lateBlink} turns blinked less than 2 s first`);
  check(st.earlyGo === 0, `${tag}: ${st.earlyGo} cars went from a STOP line without a full stop`);
  check(st.pavedStop === 0, `${tag}: cars on paved roads stopped at a STOP line (${st.pavedStop} frames)`);
  check(st.shared === 0, `${tag}: two cars in one junction at once (${st.shared} frames)`);
  check(st.intoPlayer === 0, `${tag}: cars drove into the junction the player stands in (${st.intoPlayer} frames)`);
  check(worstStill < 75, `${tag}: a car stood ${worstStill.toFixed(0)} s still near the parked player`);
  if (mode === 'roam') check(st.curves > 10 && st.gos > 0, `${tag}: too little junction traffic (${st.curves} turns, ${st.gos} STOP starts)`);
  console.log(`${tag}: ${amb.stopSigns.length} STOP signs, ${st.curves} turns, ${st.gos} STOP starts, ${st.turnRounds} three-point turns, worst ${st.maxRate.toFixed(0)} deg/s, longest still near the player ${worstStill.toFixed(0)} s`);
}
for (const id of REGION_IDS) {
  junctionRun(id, 'roam');
  junctionRun(id, 'parked');
  junctionRun(id, 'start'); // parked where the region starts (Brandt: near a dead end)
}

if (fails) {
  console.log(`${fails} check(s) failed`);
  process.exit(1);
}
console.log('traffic checks ok');
