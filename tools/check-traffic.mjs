// Traffic checker: the pure rules in src/ambient/trafficRules.js, then a
// short run of the real traffic (src/ambient/ambient.js) in every region
// with the player parked on a road:
//   - an AI car stops for the player only in its own lane, and passes an
//     oncoming car in the other lane (it may ease off, never stop),
//   - the car count stays the same,
//   - no car turns round in, or waits at, a fixed fallen tree's gap,
//   - no car stands stuck for long far from the player.
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

// ---------- Simulation per region ----------
const DT = 0.05;
const SIM = 600; // s
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
  for (let t = 0; t < SIM; t += DT) {
    amb.obstacles.length = 0;
    amb.update(DT, state);
    check(amb.cars.length === n0, `${id}: car count changed`);
    for (const c of amb.cars) {
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
  const near = amb.cars.filter((c) => Math.hypot(c.x - car.x, c.y - car.y) < TRAFFIC.farR).length;
  console.log(`${id}: ${n0} cars, ${near} within ${TRAFFIC.farR} m after ${SIM} s, longest far stuck ${worstStuck.toFixed(1)} s, ${fallen.length} fallen trees`);
}

if (fails) {
  console.log(`${fails} check(s) failed`);
  process.exit(1);
}
console.log('traffic checks ok');
