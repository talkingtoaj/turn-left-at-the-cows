// The road crew (#95, SPEC 9s item 9) and the showpiece gate:
// - the gate: skipped at the scaler's lowest step, shown when there is room,
//   forced by ?showpieces=on|off, and its state only ever changes out of sight
//   (checked over many frames with changing input), a latched piece stays
// - the crew: on the mission 1 route on a paved road, a few minutes in, with a
//   ditch there, far from the washed-out bridge and every waypoint, its solid
//   parts clear of the road lanes, the scenery and the other roads
// - the dig: the bucket digs in the ditch and dumps over the truck bed; the
//   loop is smooth; clanks fall once per hit however the frames fall
// - the wave: starts near, stops far, no flicker at the edge
// - the sound: loud close, silent far, panned the right way
//
//   npm run check:roadcrew     exits 1 on any problem

import { setRegion } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider, CAR_R } from '../src/drive/collider.js';
import { distToSegment, makeRng } from '../src/drive/geom.js';
import { vergeFor } from '../src/world/verge.js';
import {
  ROAD_CREW, CREW_PLACES, CREW_SOLIDS, crewFrame, crewToWorld, crewSolidRects, digPose, armTip, CYCLE_S, CLANKS, clankBetween,
  waving, waveAngle, WAVE_NEAR, WAVE_FAR, crewEligible, STORM_OVER_S,
} from '../src/world/roadcrew.js';
import { createShowpieceGate, showpiecesMode, wantShowpiece, sightOf, SIGHT_M } from '../src3/showpieces.js';
import { crewVoice, CREW_HEAR_R } from '../src/audio/crewSound.js';

const problems = [];
const bad = (m) => problems.push(m);

// ---- the gate ----
{
  const params = (s) => new URLSearchParams(s);
  if (showpiecesMode(params('showpieces=on')) !== 'on' || showpiecesMode(params('showpieces=off')) !== 'off') bad('gate: ?showpieces=on|off not read');
  if (showpiecesMode(params('')) !== 'auto' || showpiecesMode(params('showpieces=maybe')) !== 'auto') bad('gate: no flag or a bad one should be auto');
  if (wantShowpiece('auto', 0) || !wantShowpiece('auto', 0.34) || !wantShowpiece('on', 0) || wantShowpiece('off', 1)) bad('gate: wantShowpiece wrong');

  // A scripted drive: the scaler drops to its lowest step and recovers, the
  // player comes from 900 m out to the thing, passes it, turns and leaves.
  const rng = makeRng(11);
  const script = [];
  for (let i = 0; i < 4000; i++) {
    const dist = 900 - 800 * Math.abs(Math.sin(i / 400)) + (rng() - 0.5) * 20;
    script.push({ detail: [1, 0.67, 0.33, 0, 0, 0.33, 1][Math.floor(i / 130) % 7], dist: Math.max(5, dist), behind: rng() < 0.2, eligible: i > 300 });
  }
  for (const mode of ['auto', 'on', 'off']) {
    for (const latch of [false, true]) {
      const g = createShowpieceGate({ mode, latch });
      let prev = false;
      let everShown = false;
      script.forEach((f, i) => {
        const now = g.update(f);
        const inView = !f.behind && f.dist <= SIGHT_M;
        // The first frame of a forced mode is allowed: the load screen is up.
        if (i > 0 && now !== prev && inView) bad(`gate ${mode}${latch ? ' latch' : ''}: popped ${now ? 'in' : 'out'} in view at frame ${i}`);
        if (latch && prev && !now) bad(`gate ${mode} latch: a latched piece vanished at frame ${i}`);
        if (mode === 'off' && now) bad('gate off: shown');
        if (!f.eligible && now) bad(`gate ${mode}: shown while not eligible at frame ${i}`);
        prev = now;
        everShown ||= now;
      });
      if (mode !== 'off' && !everShown) bad(`gate ${mode}: never shown`);
    }
  }
  // Auto skips at the lowest step, but only changes out of sight.
  const g = createShowpieceGate({ mode: 'auto' });
  if (g.update({ detail: 0, dist: 800 })) bad('gate: shown at the lowest step');
  if (!g.update({ detail: 0.33, dist: 800 })) bad('gate: not shown with room, out of sight');
  if (!g.update({ detail: 0, dist: 100 })) bad('gate: hidden in view when the scaler dropped');
  if (g.update({ detail: 0, dist: 100, behind: true })) bad('gate: still shown after the scaler dropped, once behind the camera');
  if (g.update({ detail: 1, dist: 100 })) bad('gate: appeared in view when the scaler recovered');
  if (!g.update({ detail: 1, dist: 100, behind: true })) bad('gate: should show once out of sight with room');
  // A forced mode applies on the first frame, even close.
  if (!createShowpieceGate({ mode: 'on' }).update({ dist: 5 })) bad('gate on: not shown on the first frame');
  if (createShowpieceGate({ mode: 'auto' }).update({ dist: 5 })) bad('gate auto: appeared in view on the first frame');
  // sightOf: behind only when the whole disc is behind the camera plane.
  const cam = { x: 0, z: 0 };
  const north = { x: 0, z: -1 };
  const s1 = sightOf(cam, north, 0, -500, 40);
  const s2 = sightOf(cam, north, 0, 500, 40);
  const s3 = sightOf(cam, north, 0, 20, 40); // the disc straddles the camera: not behind
  const s4 = sightOf(cam, north, 0, 41, 40);
  if (s1.behind || !s2.behind || s3.behind || !s4.behind) bad('sightOf: behind wrong (' + [s1, s2, s3, s4].map((s) => s.behind).join(',') + ')');
  if (Math.abs(s1.dist - 460) > 1e-9 || s3.dist !== 0) bad('sightOf: dist wrong (' + s1.dist + ', ' + s3.dist + ')');
  console.log('gate: ok over ' + script.length + ' frames, 3 modes, with and without latch');
}

// ---- the crew's place ----
const W = setRegion(ROAD_CREW.region);
const F = crewFrame(W);
if (!F) bad('crew: road ' + ROAD_CREW.roadId + ' not found');
else {
  const road = W.roads.find((r) => r.id === ROAD_CREW.roadId);
  if (road.type !== 'paved') bad('crew: not on a paved road');
  // The route: Ashford to Hartley Farm. Highway 9 carries it; the crew is between.
  const hartley = W.places.find((p) => p.id === 'hartley_farm');
  const along = ROAD_CREW.d;
  if (!(along > 900 && along < road.length - 300)) bad('crew: d ' + along + ' is not a few minutes along the road (' + road.length + ' m long)');
  const minutes = along / 14 / 60; // at a steady 14 m/s (about 50 km/h)
  if (minutes < 1.5 || minutes > 5) bad('crew: ' + minutes.toFixed(1) + ' min in at 14 m/s, want 1.5 to 5');
  // Not near the washed-out bridge (and its sign) or any waypoint.
  const bridgeOut = W.bridges.find((b) => b.id === 'b_old');
  const dBridge = Math.hypot(F.x - bridgeOut.x, F.y - bridgeOut.y);
  if (dBridge < 400) bad('crew: only ' + dBridge.toFixed(0) + ' m from the washed-out bridge, it would give the trap away');
  for (const s of W.signs) if (/BRIDGE/.test((s.lines && s.lines[0]) || '') && Math.hypot(s.x - F.x, s.y - F.y) < 120) bad('crew: near a bridge sign');
  for (const [x, y, id] of [[bridgeOut.x, bridgeOut.y, 'wp_old_bridge'], [hartley.x, hartley.y, 'goal']]) {
    if (Math.hypot(F.x - x, F.y - y) < 150) bad('crew: within 150 m of ' + id);
  }
  // A ditch runs along the whole crew.
  const V = vergeFor(W);
  const ditches = V.ditches.filter((d) => d.road === road.id || (d.road && d.road.id === road.id));
  const dl = ROAD_CREW.d - 40;
  const dr = ROAD_CREW.d + 40;
  const covered = (d) => ditches.some((x) => x.side === ROAD_CREW.side && d >= x.d0 - 4 && d <= x.d1 + 4);
  for (let d = dl; d <= dr; d += 4) if (!covered(d)) { bad('crew: no ditch beside the road at d ' + d); break; }
  // Solids: lanes stay clear, scenery stays clear.
  const sc = generateScenery(W);
  const plain = new Collider({ ...W, regionId: null }, sc);
  const laneEdge = road.width / 4 + CAR_R; // a car keeping right
  for (const s of CREW_SOLIDS) {
    const inner = s.off - s.w / 2;
    if (inner < road.width / 2 - 0.2) bad('crew: ' + s.id + ' stands ' + (road.width / 2 - inner).toFixed(1) + ' m on the tar (verge only)');
    if (inner - laneEdge < 0.5) bad('crew: ' + s.id + ' leaves only ' + (inner - laneEdge).toFixed(1) + ' m beside a car in the right lane');
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) {
      const p = crewToWorld(F, s.u + (i / 4 - 0.5) * s.len, s.off + (j / 2 - 0.5) * s.w);
      const hit = plain.circleHit(p.x, p.y, 0.4);
      if (hit && !(typeof hit === 'object' && hit.kind === 'verge')) { bad('crew: ' + s.id + ' overlaps ' + (typeof hit === 'string' ? hit : hit.kind || hit.type) + ' at ' + p.x.toFixed(1) + ', ' + p.y.toFixed(1)); i = 9; break; }
    }
  }
  // Every part, solid or soft, keeps off water and out of the other roads.
  const all = [...Object.entries(CREW_PLACES).flatMap(([k, v]) => (Array.isArray(v) ? v.map((p, i) => [k + i, p]) : [[k, v]]))];
  for (const [id, p] of all) {
    const w = crewToWorld(F, p.u, p.off);
    for (const r of W.roads) {
      if (r.id === road.id) continue;
      for (let i = 1; i < r.points.length; i++) {
        const d = distToSegment(w.x, w.y, r.points[i - 1][0], r.points[i - 1][1], r.points[i][0], r.points[i][1]) - r.width / 2;
        if (d < 12) { bad('crew: ' + id + ' is ' + d.toFixed(0) + ' m from ' + r.id); break; }
      }
    }
    if (plain.waterIndex.near(w.x, w.y).length) bad('crew: ' + id + ' is by water');
  }
  // With the solids added, the car cannot drive into the excavator or the truck, and the lane stays open.
  const col = new Collider({ ...W, regionId: null }, sc);
  col.addSolids({ rects: crewSolidRects(F).map((r) => ({ ...r, kind: 'crew' })), circles: [] });
  for (const s of CREW_SOLIDS) {
    const c = crewToWorld(F, s.u, s.off);
    if (!col.carBlocked(c.x, c.y, F.heading)) bad('crew: the car can drive into the ' + s.id);
  }
  for (let u = -40; u <= 40; u += 2) {
    const c = crewToWorld(F, u, road.width / 4);
    if (col.carBlocked(c.x, c.y, F.heading)) { bad('crew: the right lane is blocked at u ' + u); break; }
    const c2 = crewToWorld(F, u, -road.width / 4);
    if (col.carBlocked(c2.x, c2.y, F.heading)) { bad('crew: the oncoming lane is blocked at u ' + u); break; }
  }
  console.log('crew: at ' + F.x.toFixed(0) + ', ' + F.y.toFixed(0) + ', heading ' + F.heading.toFixed(0) + ', ' + dBridge.toFixed(0) + ' m from the washed-out bridge, ' + minutes.toFixed(1) + ' min in at 14 m/s');
}

// ---- the dig loop ----
{
  const ex = CREW_PLACES.excavator;
  const tr = CREW_PLACES.truck;
  const truck = CREW_SOLIDS.find((s) => s.id === 'truck');
  // The bucket reaches the ditch floor: out over the ditch (off 6.4 to 9.8), below ground.
  const floor = digPose(CLANKS[0]);
  const fo = ex.off + floor.reach * Math.sin(floor.swing);
  if (!(fo > 6.4 && fo < 9.8)) bad('dig: the bucket meets the floor at off ' + fo.toFixed(1) + ', not in the ditch (6.4 to 9.8)');
  if (!(floor.tipH < -0.3)) bad('dig: the bucket does not go below ground (' + floor.tipH.toFixed(2) + ')');
  // It dumps over the truck bed: along u inside the bed, above the sides.
  const dump = digPose(CLANKS[1]);
  const du = ex.u + dump.reach * Math.cos(dump.swing);
  const bedTail = tr.u - truck.len / 2;
  const bedEnd = tr.u + truck.len / 2 - 3.3; // the cab and hood take the front 3.3 m
  if (!(du > bedTail + 0.5 && du < bedEnd)) bad('dig: the dump is at u ' + du.toFixed(1) + ', bed spans ' + bedTail.toFixed(1) + ' to ' + bedEnd.toFixed(1));
  if (!(dump.tipH > 2.2)) bad('dig: the dump is at height ' + dump.tipH.toFixed(2) + ', below the bed sides');
  // The arm never goes through the ground or the cab; swing covers both.
  let minH = 9;
  let maxSwing = -9;
  let minSwing = 9;
  let step = 0;
  let prevP = digPose(0);
  for (let t = 0.02; t < CYCLE_S * 2; t += 0.02) {
    const p = digPose(t);
    minH = Math.min(minH, p.tipH);
    maxSwing = Math.max(maxSwing, p.swing);
    minSwing = Math.min(minSwing, p.swing);
    step = Math.max(step, Math.abs(p.swing - prevP.swing), Math.abs(p.boom - prevP.boom), Math.abs(p.stick - prevP.stick), Math.abs(p.bucket - prevP.bucket));
    prevP = p;
  }
  if (minH < -1.2) bad('dig: the tip goes ' + minH.toFixed(2) + ' m below the ground');
  if (step > 0.06) bad('dig: a joint jumps ' + step.toFixed(3) + ' rad in 20 ms');
  if (maxSwing < 1.5 || minSwing > 0.05) bad('dig: the cab does not swing between the ditch and the truck');
  const a = digPose(3.3);
  const b = digPose(3.3 + CYCLE_S);
  if (Math.abs(a.swing - b.swing) + Math.abs(a.boom - b.boom) > 1e-9) bad('dig: the loop does not repeat');
  const e = digPose(CYCLE_S - 0.001);
  const s0 = digPose(0);
  if (Math.abs(e.swing - s0.swing) + Math.abs(e.boom - s0.boom) + Math.abs(e.stick - s0.stick) + Math.abs(e.bucket - s0.bucket) > 0.01) bad('dig: the loop has a jump at its seam');
  // Loaded between the scoop and the dump.
  if (!digPose(5).loaded || digPose(1).loaded || digPose(9.5).loaded) bad('dig: the bucket is loaded at the wrong times');
  // Clanks: one per hit, however the frames fall (steady, uneven, in a hitch).
  const countClanks = (dtOf, total) => {
    let t = 0;
    let n = 0;
    let i = 0;
    while (t < total) {
      const dt = dtOf(i++);
      if (clankBetween(t, t + dt)) n++;
      t += dt;
    }
    return n;
  };
  const want = CLANKS.length * 5;
  const c1 = countClanks(() => 1 / 60, CYCLE_S * 5 + 0.001);
  const c2 = countClanks((i) => [1 / 144, 1 / 30, 0.05, 1 / 60][i % 4], CYCLE_S * 5 + 0.001);
  const c3 = countClanks(() => 0.4, CYCLE_S * 5 + 0.001);
  if (c1 !== want || c2 !== want || c3 !== want) bad('clank: want ' + want + ' in 5 loops, got ' + c1 + ' steady, ' + c2 + ' uneven, ' + c3 + ' with big steps');
  if (clankBetween(5, 5) || clankBetween(6, 5)) bad('clank: none for an empty or backwards step');
  console.log('dig: floor at off ' + fo.toFixed(1) + ', ' + floor.tipH.toFixed(2) + ' m; dump at u ' + du.toFixed(1) + ', ' + dump.tipH.toFixed(2) + ' m high; ' + c1 + ' clanks in 5 loops');
}

// ---- the wave ----
{
  let was = false;
  const path = [200, 100, 70, 55, 44, 30, 10, 30, 44, 50, 59, 61, 55, 40, 70];
  const want = [false, false, false, false, true, true, true, true, true, true, true, false, false, true, false];
  path.forEach((d, i) => {
    was = waving(d, was);
    if (was !== want[i]) bad('wave: at ' + d + ' m (step ' + i + ') waving ' + was + ', want ' + want[i]);
  });
  if (!(WAVE_FAR > WAVE_NEAR)) bad('wave: no gap between start and stop');
  let lo = 9;
  let hi = -9;
  for (let t = 0; t < 5; t += 0.01) { lo = Math.min(lo, waveAngle(t)); hi = Math.max(hi, waveAngle(t)); }
  if (!(lo < -0.2 && hi > 0.2)) bad('wave: the arm does not swing');
}

// ---- eligibility ----
{
  if (crewEligible({ regionId: 'fenwick', secs: 10, opening: true })) bad('eligible: before the storm clears');
  if (!crewEligible({ regionId: 'fenwick', secs: STORM_OVER_S + 1, opening: true })) bad('eligible: after the storm');
  if (!crewEligible({ regionId: 'fenwick', secs: 0, opening: false })) bad('eligible: no storm, no wait');
  if (crewEligible({ regionId: 'brandt', secs: 999, opening: false })) bad('eligible: wrong region');
}

// ---- the sound ----
{
  const ear = { x: 0, y: 0, heading: 0 }; // facing north
  const near = crewVoice(ear, { x: 20, y: 0 }, 0.5); // 20 m east: on the right
  const far = crewVoice(ear, { x: 150, y: 0 }, 0.5);
  const gone = crewVoice(ear, { x: CREW_HEAR_R + 1, y: 0 }, 1);
  const left = crewVoice(ear, { x: -20, y: 0 }, 0.5);
  const ahead = crewVoice(ear, { x: 0, y: -20 }, 0.5);
  if (!(near.level > far.level && far.level > 0)) bad('sound: should be louder near than far, and still heard at 150 m');
  if (gone.level !== 0) bad('sound: should be silent past ' + CREW_HEAR_R + ' m');
  if (!(near.pan > 0.5 && left.pan < -0.5 && Math.abs(ahead.pan) < 0.1)) bad('sound: pan wrong (right ' + near.pan.toFixed(2) + ', left ' + left.pan.toFixed(2) + ', ahead ' + ahead.pan.toFixed(2) + ')');
  if (!(near.lowpass > far.lowpass)) bad('sound: should be brighter near');
  // Turn to face east: the thing that was on the right is now ahead.
  const turned = crewVoice({ x: 0, y: 0, heading: 90 }, { x: 20, y: 0 }, 0.5);
  if (Math.abs(turned.pan) > 0.1) bad('sound: facing it should centre it, got ' + turned.pan.toFixed(2));
  if (!(crewVoice(ear, { x: 20, y: 0 }, 1).level > crewVoice(ear, { x: 20, y: 0 }, 0).level)) bad('sound: should rev louder under load');
}

if (problems.length) {
  console.log(problems.length + ' problems:');
  for (const m of problems) console.log('  ' + m);
  process.exit(1);
}
console.log('ok');
