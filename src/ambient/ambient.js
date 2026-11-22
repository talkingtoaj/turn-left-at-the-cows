// Ambient life for both renderers: birds, traffic, animals, people, dust,
// chimney smoke, cloud shadows, wind, and sound events (bell, birds, dogs,
// moo, whinny).
// Plain JS, no Phaser or three. Deterministic from WORLD.seed (given the same
// player inputs). API: see CONTRACT_P2.md.
//
// Units: metres, seconds. Headings in degrees, 0 = north, clockwise. y grows south.

import {
  makeRng, hashString, DEG, SegIndex, distToSegment, pointInPolygon, pointInRect,
  localToWorld, nearestOnPolyline, measurePolyline, bbox, headingOf, centroid,
} from '../drive/geom.js';
import {
  TRAFFIC, relTo, inLane, playerSpeedCap, seenByPlayer, respawnReason, goodRespawn,
  HONK, WAIT, waitState, stepWait, turnPose, turnLength, JAM, knotGiving,
  JUNCTION, brakeCap, turnSpeed, turnRoom, turnSide, blinkLit, blinkNow, stopsAt, junctionCurve, curveAt, headedInto,
} from './trafficRules.js';
import { carPaint } from './carpaint.js'; // traffic paint: real rural colors, seeded per car (#50)

// Level of detail: things within NEAR_R of the player get full updates.
const NEAR_R = 600;
const COARSE_STEP = 1.0; // seconds between coarse updates for far flocks

function angDiff(a, b) {
  // Smallest signed difference b - a in degrees (-180..180).
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function turnToward(h, target, maxStep) {
  const d = angDiff(h, target);
  const s = Math.max(-maxStep, Math.min(maxStep, d));
  return (h + s + 360) % 360;
}
const fwdX = (h) => Math.sin(h * DEG);
const fwdY = (h) => -Math.cos(h * DEG);

export function createAmbient(world, scenery) {
  const rng = makeRng((world.seed ^ 0x5a17b3) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const trees = (scenery && scenery.trees) || [];

  // ---------- Road index (surface lookup) ----------
  const roadIndex = new SegIndex(32);
  for (const r of world.roads) roadIndex.addPolyline(r.points, r.width / 2 + 1.5, r);
  const intactBridges = world.bridges
    .filter((b) => b.intact)
    .map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.length, angle: b.angle, roadId: b.roadId }));
  const roadById = new Map(world.roads.map((r) => [r.id, r]));
  // 'paved' | 'dirt' | 'grass' under a point (same rule as the car collider).
  function surfaceAt(x, y) {
    let best = 'grass';
    for (const b of intactBridges) {
      if (pointInRect(x, y, b)) {
        const r = roadById.get(b.roadId);
        if (r) best = r.type === 'paved' ? 'paved' : 'dirt';
      }
    }
    for (const s of roadIndex.near(x, y)) {
      if (best === 'paved') break;
      const r = s.data;
      if (distToSegment(x, y, s.ax, s.ay, s.bx, s.by) <= r.width / 2 + 0.5) best = r.type === 'paved' ? 'paved' : 'dirt';
    }
    return best;
  }
  // Distance from a point to the nearest road edge (negative = on the road). Only looks ~1.5 m out.
  function roadEdgeDist(x, y) {
    let best = Infinity;
    for (const s of roadIndex.near(x, y)) {
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by) - s.data.width / 2;
      if (d < best) best = d;
    }
    return best;
  }

  // ---------- Towns ----------
  const towns = world.towns || [];
  function townScore(x, y) {
    let best = 0;
    for (const t of towns) {
      const d = Math.hypot(x - t.x, y - t.y);
      const s = Math.max(0, 1 - Math.max(0, d - t.ambienceR) / 1400) * (t.kind === 'hamlet' ? 0.7 : 1);
      if (s > best) best = s;
    }
    return 0.12 + best;
  }
  function inTown(x, y) {
    for (const t of towns) if (Math.hypot(x - t.x, y - t.y) < t.ambienceR * 0.8) return true;
    return false;
  }

  // ---------- Road network for traffic ----------
  const net = world.roads.map((r) => ({
    road: r, pts: r.points, cum: measurePolyline(r.points), len: 0, junctions: [], blocks: [], broken: [],
  }));
  for (const n of net) n.len = n.cum[n.cum.length - 1];
  const netById = new Map(net.map((n) => [n.road.id, n]));
  function addJ(a, at, b, toAt) {
    if (a === b) return;
    if (a.junctions.some((j) => j.to === b && Math.abs(j.at - at) < 8 && Math.abs(j.toAt - toAt) < 8)) return;
    a.junctions.push({ at, to: b, toAt });
  }
  // Junctions from shared endpoints / snaps: each road end lying on another road.
  for (const a of net) {
    for (const [endAt, p] of [[0, a.pts[0]], [a.len, a.pts[a.pts.length - 1]]]) {
      for (const b of net) {
        if (b === a) continue;
        const q = nearestOnPolyline(p[0], p[1], b.pts);
        if (q && q.d < 4) {
          addJ(a, endAt, b, q.along);
          addJ(b, q.along, a, endAt);
        }
      }
    }
  }
  for (const n of net) n.junctions.sort((p, q) => p.at - q.at);
  // Road ends at the map edge with no junction there (rt40 runs off both
  // sides of Brandt). Past the last junction such a stretch leads nowhere:
  // traffic never picks it as a way on unless there is no other, and no car
  // is placed on it facing the edge. Otherwise a car would only drive to the
  // edge and turn round, and a player parked near the edge traps it there.
  const EDGE_END = 15; // m from the map border that counts as at the edge
  for (const n of net) {
    const atEdge = (p) => p[0] < EDGE_END || p[1] < EDGE_END || p[0] > world.size.w - EDGE_END || p[1] > world.size.h - EDGE_END;
    const free = (endAt) => !n.junctions.some((j) => Math.abs(j.at - endAt) < 6);
    n.edgeEnd = { 0: atEdge(n.pts[0]) && free(0), 1: atEdge(n.pts[n.pts.length - 1]) && free(n.len) };
  }
  // Junction nodes: the junctions at one spot share a node (where traffic
  // waits for whoever is in it). node.stop: road id -> stops at the STOP
  // line there (stopsAt). node.r: the junction's own radius.
  const nodes = [];
  for (const n of net) {
    for (const j of n.junctions) {
      const p = roadPoint(n, j.at, {});
      let node = nodes.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < 8);
      if (!node) nodes.push((node = { id: `j${nodes.length}`, x: p.x, y: p.y, arms: new Map(), stop: new Map(), r: 0, pavedHalf: 0 }));
      j.node = node;
      if (!node.arms.has(n.road.id)) node.arms.set(n.road.id, { n, at: j.at });
    }
  }
  for (const node of nodes) {
    const arms = [...node.arms.values()];
    const st = stopsAt(arms.map((a) => ({ paved: a.n.road.type === 'paved', through: a.at > 6 && a.at < a.n.len - 6 })));
    arms.forEach((a, i) => node.stop.set(a.n.road.id, st[i]));
    for (const a of arms) {
      node.r = Math.max(node.r, a.n.road.width / 2 + 2);
      if (a.n.road.type === 'paved') node.pavedHalf = Math.max(node.pavedHalf, a.n.road.width / 2);
    }
  }
  // STOP signs (SPEC 9q): one at each stop line, on the right of the lane
  // that stops, facing the cars that come to it. Upright in town, a slight
  // lean out on rural roads. Not a map trap tell. [{ x, y, heading, leanX, leanY }]
  // heading: the way the stopping traffic drives (the board faces back up it);
  // leanX / leanY: degrees the post leans to the traffic's right / forward.
  // Metres back from the junction along arm `a` (driving `dir` toward it)
  // to where the paved road's centre is `want` m off: the paved edge plus
  // room, measured from the real road, as a dirt road end can stop short of
  // the paved centre line or run past it.
  function backFromPaved(node, a, dir, want) {
    const paved = [...node.arms.values()].filter((b) => b.n.road.type === 'paved');
    for (let k = 0; k <= 40; k += 0.25) {
      const s = a.at - dir * k;
      if (s < 0 || s > a.n.len) return k;
      const p = roadPoint(a.n, s, {});
      const d = Math.min(...paved.map((b) => nearestOnPolyline(p.x, p.y, b.n.pts).d));
      if (d >= want) return k;
    }
    return want;
  }
  const stopSigns = [];
  for (const node of nodes) {
    node.stopBack = new Map();
    for (const a of node.arms.values()) {
      if (!node.stop.get(a.n.road.id)) continue;
      const dirs = [];
      if (a.at > 6) dirs.push(1); // comes in going +s
      if (a.at < a.n.len - 6) dirs.push(-1);
      for (const dir of dirs) {
        node.stopBack.set(`${a.n.road.id}:${dir}`, backFromPaved(node, a, dir, node.pavedHalf + JUNCTION.stopBack));
        const s = a.at - dir * backFromPaved(node, a, dir, node.pavedHalf + 1.4);
        if (s < 0 || s > a.n.len) continue;
        const p = roadPoint(a.n, s, {});
        const fx = p.dx * dir;
        const fy = p.dy * dir;
        const off = a.n.road.width / 2 + 1.1;
        const x = p.x - fy * off;
        const y = p.y + fx * off;
        const h = hashString(`${node.id}:${a.n.road.id}:${dir}`);
        const rural = !inTown(x, y);
        stopSigns.push({
          id: `stop_${node.id}_${a.n.road.id}_${dir > 0 ? 'f' : 'b'}`, x, y, heading: headingOf(fx, fy),
          leanX: rural ? 1.5 + (h % 40) / 10 : 0, // out toward the field
          leanY: rural ? ((h >> 6) % 50) / 10 - 2.5 : 0,
        });
      }
    }
  }
  // Broken bridges: traffic turns around before them.
  for (const b of world.bridges) {
    if (b.intact) continue;
    const n = netById.get(b.roadId);
    if (!n) continue;
    const q = nearestOnPolyline(b.x, b.y, n.pts);
    if (q) {
      n.blocks.push(q.along);
      n.broken.push({ at: q.along, half: (b.length || 20) / 2 });
    }
  }
  // Fixed fallen trees part way across a road: traffic turns around before
  // them too. The gap they leave is one car wide, so two cars meeting in it
  // would block each other for good; the gap is the player's way past.
  for (const f of (scenery && scenery.fallen) || []) {
    const n = netById.get(f.roadId);
    if (n) n.blocks.push(f.at);
  }
  for (const n of net) n.baseBlocks = n.blocks.slice();
  // Metres to the nearest block (broken bridge, fallen tree) from `at`
  // going `dir` along the road, or Infinity.
  function blockAhead(n, at, dir) {
    let best = Infinity;
    for (const b of n.blocks) {
      const ahead = (b - at) * dir;
      if (ahead > 0 && ahead < best) best = ahead;
    }
    return best;
  }

  // Point on a road at distance s (cached segment index in obj.seg).
  function roadPoint(n, s, obj) {
    const cum = n.cum;
    let i;
    if (obj.seg === undefined) {
      // Binary search when there is no cached segment.
      let lo = 0;
      let hi = cum.length - 2;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (cum[m] <= s) lo = m;
        else hi = m - 1;
      }
      i = lo;
    } else i = Math.min(obj.seg, cum.length - 2);
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    while (i > 0 && cum[i] > s) i--;
    obj.seg = i;
    const a = n.pts[i];
    const b = n.pts[i + 1];
    const L = cum[i + 1] - cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i]) / L));
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / L, dy: (b[1] - a[1]) / L };
  }

  // ---------- Traffic ----------
  const cars = [];
  // Things traffic slows and stops for, refilled by the hazards each frame: [{ x, y, r }].
  const obstacles = [];
  const carState = []; // parallel internal data
  const totalLen = net.reduce((s, n) => s + n.len, 0);
  function pickSpawn(filter) {
    for (let attempt = 0; attempt < 200; attempt++) {
      let k = rng() * totalLen;
      let n = net[0];
      for (const m of net) {
        if (k < m.len) { n = m; break; }
        k -= m.len;
      }
      const s = R(10, Math.max(11, n.len - 10));
      if (n.blocks.some((b) => Math.abs(b - s) < 60)) continue;
      if (edgePocket(n, s)) continue;
      const p = roadPoint(n, s, {});
      if (rng() > townScore(p.x, p.y)) continue;
      if (filter && !filter(p)) continue;
      // Not on top of another car.
      if (cars.some((o) => Math.abs(o.x - p.x) < 40 && Math.abs(o.y - p.y) < 40)) continue;
      return { n, s, p };
    }
    return null;
  }
  function placeCar(c, cs, sp) {
    cs.n = sp.n;
    cs.s = sp.s;
    cs.dir = rng() < 0.5 ? 1 : -1;
    // Not straight at a block close ahead.
    if (blockAhead(sp.n, sp.s, cs.dir) < 150) cs.dir = -cs.dir;
    // Never facing the map edge on a stretch with no junction before it.
    if (edgeStubAhead(sp.n, sp.s, cs.dir) && !edgeStubAhead(sp.n, sp.s, -cs.dir)) cs.dir = -cs.dir;
    cs.seg = undefined;
    cs.skip = 0;
    cs.stuckT = 0;
    if (cs.honk) cs.honk.t = cs.honk.clearT = 0;
    if (cs.jam) cs.jam.t = cs.jam.clearT = 0;
    c.wait = '';
    cs.leave = null;
    cs.plan = null;
    cs.curve = null;
    cs.inNode = null;
    cs.lastNode = null;
    c.horn = false;
    c.turning = false;
    c.blink = c.signal = 0;
    c.stage = '';
    c.placed = (c.placed || 0) + 1;
    const t = carTarget(cs);
    c.x = t.x;
    c.y = t.y;
    c.heading = t.h;
    c.speed = 0;
    c.onDirt = cs.n.road.type !== 'paved';
  }
  // The road's direction at s, averaged over a few metres either side, so
  // the lane point rounds a sharp corner (town streets turn square) instead
  // of jumping across it.
  const dirScratch = {};
  const LANE_ROUND = 5; // m
  const BEND_LOOK = [0, 2, 4, 7, 11, 16, 24, 34]; // m ahead it looks for a sharp bend
  const BEND_DEG = 4; // deg/m: ...one turning faster than this
  const CURVE_RATE = 90; // deg/s at most while it drives a junction curve or a sharp bend
  const roundOut = { x: 0, y: 0, dx: 0, dy: 0 };
  // Rounded road point at s (reuses one object: read it before the next call).
  function roundPoint(n, s) {
    const h = Math.min(Math.max(LANE_ROUND, n.road.width * 0.5), s, n.len - s);
    if (!(h > 0.5)) return null;
    const a = roadPoint(n, s - h, dirScratch);
    const i0 = dirScratch.seg;
    const b = roadPoint(n, s + h, dirScratch);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(L > 1e-6)) return null;
    // Position: the road's average point over [s - h, s + h] (a box filter,
    // which rounds a corner smoothly; its direction is the chord a -> b).
    const o = roundOut;
    o.dx = (b.x - a.x) / L;
    o.dy = (b.y - a.y) / L;
    if (dirScratch.seg === i0) {
      o.x = (a.x + b.x) / 2;
      o.y = (a.y + b.y) / 2;
      return o;
    }
    const cum = n.cum;
    let sx = 0;
    let sy = 0;
    for (let i = i0; i <= dirScratch.seg; i++) {
      const lo = Math.max(cum[i], s - h);
      const hi = Math.min(cum[i + 1], s + h);
      if (hi <= lo) continue;
      const P = n.pts[i];
      const Q = n.pts[i + 1];
      const segL = cum[i + 1] - cum[i] || 1;
      const tm = ((lo + hi) / 2 - cum[i]) / segL;
      sx += (P[0] + (Q[0] - P[0]) * tm) * (hi - lo);
      sy += (P[1] + (Q[1] - P[1]) * tm) * (hi - lo);
    }
    o.x = sx / (2 * h);
    o.y = sy / (2 * h);
    return o;
  }
  // Heading of travel at s on n going dir (rounded the same way).
  function travelHeading(n, s, dir) {
    const q = roundPoint(n, s) || roadPoint(n, s, dirScratch);
    return headingOf(q.dx * dir, q.dy * dir);
  }
  function carTarget(cs) {
    const p0 = roadPoint(cs.n, cs.s, cs);
    const p = roundPoint(cs.n, cs.s) || p0;
    const dx = p.dx * cs.dir;
    const dy = p.dy * cs.dir;
    const off = cs.n.road.width / 4;
    // Right of travel (y south): (-dy, dx).
    return { x: p.x - dy * off, y: p.y + dx * off, h: headingOf(dx, dy) };
  }
  const nCars = 10;
  for (let i = 0; i < nCars; i++) {
    const c = {
      id: `car${i}`, x: 0, y: 0, heading: 0, speed: 0, ...carPaint(`car${i}`), onDirt: false,
      horn: false, // additive: its horn is sounding now (see WAIT)
      turning: false, // additive: turning round or backing up, across both lanes
      blink: 0, // additive: amber lamp lit this frame, -1 left, 1 right, 0 none
      signal: 0, // additive: side it is signalling (lit or not), -1 / 0 / 1
      stage: '', // additive: at a junction: 'stopping' | 'stopped' | 'go' | 'waiting' | 'curve' | ''
      placed: 0, // additive: times it was (re)placed on the roads (a jump, not a drive)
      junction: '', // additive: id of the junction it is in (crossing or turning), see amb.junctions
      wait: '', // additive: standing held up: 'player' (by the player, or a queue the player holds) | 'car' (other traffic, a STOP line) | ''
    };
    const cs = {
      n: null, s: 0, dir: 1, seg: 0, skip: 0, cruise: R(0.85, 1.1), relocT: R(1, 3), stuckT: 0,
      honk: waitState(hashString(`${world.seed}:${i}:honk`)), jam: waitState(hashString(`${world.seed}:${i}:jam`)), leave: null, plan: null, curve: null, inNode: null, lastNode: null, blinkT: 0,
    };
    const sp = pickSpawn();
    if (!sp) continue;
    placeCar(c, cs, sp);
    cars.push(c);
    carState.push(cs);
  }

  function chooseDirOn(n, at) {
    if (at < 5) return 1;
    if (at > n.len - 5) return -1;
    // A map-edge stub one way and not the other: go the other way.
    const ef = edgeStubAhead(n, at, 1);
    const eb = edgeStubAhead(n, at, -1);
    if (ef !== eb) return ef ? -1 : 1;
    // A block close one way and not the other: go the open way.
    const bf = blockAhead(n, at, 1) < 300;
    const bb = blockAhead(n, at, -1) < 300;
    if (bf !== bb) return bf ? -1 : 1;
    const a = roadPoint(n, Math.min(n.len, at + 300), {});
    const b = roadPoint(n, Math.max(0, at - 300), {});
    const wa = townScore(a.x, a.y);
    const wb = townScore(b.x, b.y);
    return rng() * (wa + wb) < wa ? 1 : -1;
  }
  function junctionWeight(j) {
    const n = j.to;
    const dir = j.toAt < 5 ? 1 : j.toAt > n.len - 5 ? -1 : 0;
    const probe = dir === 0 ? n.len / 2 : j.toAt + dir * Math.min(400, n.len * 0.5);
    const p = roadPoint(n, probe, {});
    // Dead-end stubs (no junction at the far end) are less attractive.
    const farEnd = dir === 1 ? n.len : 0;
    const dead = dir !== 0 && !n.junctions.some((k) => Math.abs(k.at - farEnd) < 6) ? 0.4 : 1;
    // A road blocked soon after the turn is a poor choice: the car would only turn back.
    const blocked = dir !== 0 && blockAhead(n, j.toAt, dir) < 400 ? 0.1 : 1;
    if (intoEdgeStub(j)) return 0;
    return townScore(p.x, p.y) * dead * blocked;
  }
  // Lane centre `s` m along road n going `dir`: { x, y, h }.
  function lanePoint(n, s, dir) {
    const p = roundPoint(n, s) || roadPoint(n, s, {});
    const dx = p.dx * dir;
    const dy = p.dy * dir;
    const off = n.road.width / 4;
    return { x: p.x - dy * off, y: p.y + dx * off, h: headingOf(dx, dy) };
  }
  const clampS = (n, s) => Math.max(0, Math.min(n.len, s));
  // Driving `dir` from s on road n: does it reach the road's end at the map
  // edge (see EDGE_END) with no junction and no block (broken bridge, fallen
  // tree) on the way? A block first makes it a real dead end, which keeps
  // the usual rules (the car turns round at the block).
  function edgeStubAhead(n, s, dir) {
    if (!n.edgeEnd[dir > 0 ? 1 : 0]) return false;
    if (blockAhead(n, s, dir) < Infinity) return false;
    return !n.junctions.some((j) => (j.at - s) * dir > 0.5);
  }
  // Is s on a stretch with no way out that touches the map edge: one way a
  // map-edge stub, the other a stub too or a block (broken bridge, fallen
  // tree) before any junction? A car placed there could only bounce
  // between the two, and a player parked there traps it.
  function blockFirst(n, s, dir) {
    const b = blockAhead(n, s, dir);
    const j = n.junctions.reduce((m, k) => ((k.at - s) * dir > 0.5 ? Math.min(m, (k.at - s) * dir) : m), Infinity);
    return b < j;
  }
  function edgePocket(n, s) {
    const f = edgeStubAhead(n, s, 1);
    const b = edgeStubAhead(n, s, -1);
    return (f || b) && (f || blockFirst(n, s, 1)) && (b || blockFirst(n, s, -1));
  }
  // Turning at junction j onto j.to: does every way along it lead to a
  // map-edge stub?
  function intoEdgeStub(j) {
    const n = j.to;
    if (j.toAt < 5) return edgeStubAhead(n, j.toAt, 1);
    if (j.toAt > n.len - 5) return edgeStubAhead(n, j.toAt, -1);
    return edgeStubAhead(n, j.toAt, 1) && edgeStubAhead(n, j.toAt, -1);
  }
  // Metres before a block (broken bridge, fallen tree) a car stops to turn round.
  function blockGap(n, b) {
    const br = n.broken.find((k) => Math.abs(k.at - b) < 1);
    return br ? br.half + JUNCTION.bridgeStop : JUNCTION.blockStop;
  }

  // ---------- Junction plan ----------
  // Some 150 m out a car picks what it does at the next junction: turn (and
  // onto which road, which way) or carry on. A turn is a curve (junctionCurve)
  // from its lane on this road to its lane on the next, started rIn m short
  // of the junction. On a dirt road meeting a paved one it also stops at the
  // STOP line first.
  function makePlan(c, cs) {
    const n = cs.n;
    const dir = cs.dir;
    let best = null;
    let bestAhead = 150;
    for (const j of n.junctions) {
      const ahead = (j.at - cs.s) * dir;
      if (ahead > -0.5 && ahead < bestAhead && j.node !== cs.lastNode) {
        bestAhead = ahead;
        best = j;
      }
    }
    if (!best) return null;
    const node = best.node;
    const at = best.at;
    // No hairpins back down a road meeting at a sharp angle, unless there is
    // no other way on.
    const hIn = lanePoint(n, at, dir).h;
    const hairpin = (j) => Math.abs(angDiff(hIn, lanePoint(j.to, j.toAt, j.toAt < 5 ? 1 : j.toAt > j.to.len - 5 ? -1 : 1).h)) > 140
      && (j.toAt < 5 || j.toAt > j.to.len - 5 || Math.abs(angDiff(hIn, lanePoint(j.to, j.toAt, -1).h)) > 140);
    const all = n.junctions.filter((j) => j.node === node);
    const easy = all.filter((j) => !hairpin(j));
    const opts = easy.length ? easy : all;
    const atEnd = dir > 0 ? n.len - at < 6 : at < 6;
    // Not into a map-edge stub unless there is no other way on: carrying on
    // into one makes the turn a must, and turns into one are left out.
    const carryStub = !atEnd && edgeStubAhead(n, at, dir);
    let outs = opts.filter((j) => !intoEdgeStub(j));
    if (!outs.length && carryStub) outs = all.filter((j) => !intoEdgeStub(j));
    const pick = outs.length ? outs : opts;
    let tj = null;
    if (atEnd || (carryStub && outs.length) || rng() < 0.35 * Math.min(1.5, pick.reduce((m, j) => Math.max(m, junctionWeight(j)), 0) / townScore(c.x, c.y))) {
      let tot = 0;
      const w = pick.map((j) => (tot += junctionWeight(j)));
      const k = rng() * tot;
      tj = pick[w.findIndex((v) => k < v)] || pick[0];
    }
    const plan = { n, dir, node, at, turn: null, stop: !!node.stop.get(n.road.id), stopAt: 0, stoppedT: 0, go: false, committed: false };
    if (plan.stop) {
      plan.stopAt = at - dir * (node.stopBack.get(`${n.road.id}:${dir}`) ?? node.pavedHalf + JUNCTION.stopBack);
      if ((plan.stopAt - cs.s) * dir < 0) plan.stop = false; // already past the line (just placed here)
    }
    if (tj) {
      const to = tj.to;
      let toDir = chooseDirOn(to, tj.toAt);
      const mid = tj.toAt >= 5 && tj.toAt <= to.len - 5;
      if (mid && Math.abs(angDiff(hIn, lanePoint(to, tj.toAt, toDir).h)) > 140 && !edgeStubAhead(to, tj.toAt, -toDir)) toDir = -toDir;
      const room = turnRoom(angDiff(lanePoint(n, at, dir).h, lanePoint(to, tj.toAt, toDir).h));
      let entryAt = clampS(n, at - dir * (to.road.width / 2 + JUNCTION.entryRoom + room));
      if ((entryAt - cs.s) * dir < 0) entryAt = cs.s;
      const exitAt = clampS(to, tj.toAt + toDir * (n.road.width / 2 + JUNCTION.entryRoom + room));
      const a = lanePoint(n, entryAt, dir);
      const b = lanePoint(to, exitAt, toDir);
      const deg = angDiff(a.h, b.h);
      plan.turn = {
        to, toDir, entryAt, exitAt,
        curve: junctionCurve([a.x, a.y], a.h, [b.x, b.y], b.h),
        side: turnSide(a.h, b.h),
        v: turnSpeed(deg),
      };
    }
    // The way it will drive through: the curve (or straight across), then
    // its lane on past the junction, far enough that the player standing
    // there would stop it (TRAFFIC.stopGap) after it went in.
    plan.path = [];
    const run = JUNCTION.pathOn;
    if (plan.turn) {
      const tn = plan.turn;
      for (let u = 0; u < tn.curve.len; u += 2) {
        const q = curveAt(tn.curve, u);
        plan.path.push([q.x, q.y]);
      }
      for (let k = 0; k <= run; k += 2) {
        const q = lanePoint(tn.to, clampS(tn.to, tn.exitAt + tn.toDir * k), tn.toDir);
        plan.path.push([q.x, q.y]);
      }
    } else {
      const from = plan.stop ? plan.stopAt : at - dir * node.r;
      for (let k = 0; k <= Math.abs(at - from) + node.r + run; k += 2) {
        const q = lanePoint(n, clampS(n, from + dir * k), dir);
        plan.path.push([q.x, q.y]);
      }
    }
    return plan;
  }
  // Is the junction clear for this car to go: nobody in it, the player not
  // in or about to be, and (unless a plain right turn) no car about to come
  // through that will not stop for it.
  function junctionClear(c, cs, plan, player) {
    const node = plan.node;
    const R = node.r + JUNCTION.clearPad;
    if (player) {
      const d = Math.hypot(player.x - node.x, player.y - node.y);
      if (d < node.r + 3 || headedInto(player.x, player.y, player.heading || 0, Math.max(0, player.speed || 0), node.x, node.y, R)) return 'player';
      if (d < 60 && plan.path.some(([x, y]) => Math.hypot(player.x - x, player.y - y) < JUNCTION.pathClear)) return 'player';
    }
    const rightOnly = plan.turn && plan.turn.side === 1 && !plan.stop;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o === c) continue;
      const os = carState[i];
      if (os.inNode === node) return 'car';
      if (rightOnly || o.speed <= 1 || os.leave) continue;
      if (Math.abs(o.x - node.x) > 120 || Math.abs(o.y - node.y) > 120) continue;
      // Will stop at this junction's STOP line anyway.
      if (os.plan && os.plan.node === node && os.plan.stop && !os.plan.go) continue;
      // Behind this car on the same approach: it follows.
      const r = relTo(c.x, c.y, c.heading, o.x, o.y);
      if (r.along < 0 && Math.abs(angDiff(c.heading, o.heading)) < 60) continue;
      if (headedInto(o.x, o.y, o.heading, o.speed, node.x, node.y, R)) return 'car';
    }
    return null;
  }
  // The cars in this car's knot (itself too), for knotGiving.
  const knot = [];
  function knotOf(c) {
    knot.length = 0;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) > JAM.knotR) continue;
      const os = carState[i];
      knot.push({ i, giving: !!(os.leave && !os.leave.forced) }); // giving way or giving up on the player
    }
    return knot;
  }
  function setBlink(c, cs, side, dt) {
    if (side !== c.signal) cs.blinkT = 0;
    else cs.blinkT += dt;
    c.signal = side;
    c.blink = side && blinkLit(cs.blinkT) ? side : 0;
  }

  function stepCar(c, cs, dt, player, onFoot) {
    if (cs.leave) {
      setBlink(c, cs, 0, dt);
      c.stage = '';
      c.wait = cs.leave.px !== undefined ? 'player' : ''; // giving up on the player
      stepLeave(c, cs, dt, player);
      return;
    }
    const n = cs.n;
    const cv = cs.curve;
    const surface = (cv ? cv.to : n).road.type === 'paved' ? 'paved' : 'dirt';
    c.onDirt = surface === 'dirt';
    let target = (surface === 'paved' ? 14 : 8.5) * cs.cruise;
    if (inTown(c.x, c.y)) target = Math.min(target, 9);
    // The lowest cap the player sets (them, or their parked car): when it
    // holds the car at a standstill, the car honks (see HONK below).
    let capP = Infinity;

    // The player (in the car or on foot): stop only when they are in this
    // car's own lane ahead. A car in the other lane is passed, a little slower.
    if (player && Math.abs(player.x - c.x) < 50 && Math.abs(player.y - c.y) < 50) {
      const r = relTo(c.x, c.y, c.heading, player.x, player.y);
      capP = playerSpeedCap(r.along, r.lat, onFoot);
      target = Math.min(target, capP);
    }
    // Hazards on the road (livestock, a tractor, a deer, the parked car):
    // slow down and wait when one is in this car's lane.
    for (const o of obstacles) {
      if (Math.abs(o.x - c.x) > 30 || Math.abs(o.y - c.y) > 30) continue;
      const r = relTo(c.x, c.y, c.heading, o.x, o.y);
      if (r.along > 0 && inLane(r.along, r.lat, o.r || 0)) {
        const cap = Math.max(0, (r.along - 8) * 0.6);
        target = Math.min(target, cap);
        if (o.player) capP = Math.min(capP, cap);
      }
    }
    // Don't drive into other traffic going the same way (cars coming the
    // other way keep to their own lane and pass). A car turning round
    // blocks both lanes; a car crossing or turning in a junction blocks
    // whatever lane it is across.
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o === c) continue;
      if (Math.abs(o.x - c.x) > 32 || Math.abs(o.y - c.y) > 32) continue;
      const across = !!carState[i].inNode && carState[i].inNode !== cs.inNode;
      if (!o.turning && !across && Math.abs(angDiff(c.heading, o.heading)) > 70) continue;
      const r = relTo(c.x, c.y, c.heading, o.x, o.y);
      const lat = o.turning ? n.road.width / 2 + 1.5 : across ? 2.8 : TRAFFIC.halfW * 2 + TRAFFIC.margin;
      if (r.along > 0 && r.along < (across ? 30 : 18) && Math.abs(r.lat) < lat) {
        const cap = Math.max(0, (r.along - 8) * 0.8);
        target = Math.min(target, cap);
        // In a queue behind a car the player holds up (it is honking or
        // giving up): held up by the player too, so it honks and turns round
        // in its turn instead of waiting for good.
        if (!across && !o.turning && carState[i].honk.t >= WAIT.queueAt) capP = Math.min(capP, cap);
      }
    }

    // A sharp bend in the road ahead (town streets turn square): slow for it.
    if (!cv) {
      for (const d of BEND_LOOK) {
        const s1 = cs.s + cs.dir * d;
        const s2 = s1 + cs.dir * 2;
        if (s2 < 0 || s2 > n.len) break;
        const degPerM = Math.abs(angDiff(travelHeading(n, s1, cs.dir), travelHeading(n, s2, cs.dir))) / 2;
        if (degPerM > BEND_DEG) target = Math.min(target, brakeCap(d, CURVE_RATE / degPerM));
      }
    }
    if (cv) {
      // In a junction, on the curve to the next road. Slower where it bends
      // tight (a junction on a square corner), so it never swings round.
      target = Math.min(target, cv.v);
      let prevH = curveAt(cv.cv, cv.u).h;
      for (let u = cv.u + 0.5; u <= Math.min(cv.cv.len, cv.u + 6); u += 0.5) {
        const h = curveAt(cv.cv, u).h;
        const degPerM = Math.abs(angDiff(prevH, h)) * 2;
        prevH = h;
        if (degPerM > 1) target = Math.min(target, Math.max(0.8, CURVE_RATE / degPerM));
      }
      setBlink(c, cs, cv.side, dt);
      c.stage = 'curve';
    } else {
      // Dead end or a block ahead: stop short, then turn round (three-point turn).
      const endAt = cs.dir > 0 ? n.len : 0;
      const toEnd = Math.abs(endAt - cs.s);
      let turnBack = false;
      if (toEnd < 80 && !n.junctions.some((j) => Math.abs(j.at - endAt) < 6)) {
        const d = toEnd - JUNCTION.deadEndStop;
        target = Math.min(target, brakeCap(d));
        if (d < 1) turnBack = true;
      }
      for (const b of n.blocks) {
        const ahead = (b - cs.s) * cs.dir;
        if (ahead <= 0 || ahead > 90) continue;
        const d = ahead - blockGap(n, b);
        target = Math.min(target, brakeCap(d));
        if (d < 1) turnBack = true;
      }
      if (turnBack && c.speed < 0.3) {
        cs.leave = { mode: 'hold', forced: true, t: 0, backed: 0, checkT: 0 };
        setBlink(c, cs, 0, dt);
        c.speed = 0;
        return;
      }
      // The junction ahead.
      if (cs.plan && (cs.plan.n !== n || cs.plan.dir !== cs.dir || (cs.plan.at - cs.s) * cs.dir < -cs.plan.node.r)) {
        if (cs.inNode === cs.plan.node) cs.inNode = null;
        cs.lastNode = cs.plan.node;
        cs.plan = null;
      }
      if (!cs.plan) cs.plan = makePlan(c, cs);
      if (!cs.plan && toEnd < 6 && cs.lastNode) {
        // At a junction at the road's end with nothing planned: plan it again.
        cs.lastNode = null;
        cs.plan = makePlan(c, cs);
      }
      const plan = cs.plan;
      c.stage = '';
      let side = 0;
      if (plan) {
        const tn = plan.turn;
        const dEntry = tn ? (tn.entryAt - cs.s) * cs.dir : Infinity;
        if (tn && tn.side && blinkNow(dEntry, c.speed)) side = tn.side;
        if (tn) target = Math.min(target, brakeCap(dEntry, tn.v));
        let hold = false; // must wait at the line / entry
        if (plan.stop && !plan.go) {
          // STOP sign: a full stop at the line, a moment, then go when clear.
          const dStop = (plan.stopAt - cs.s) * cs.dir;
          target = Math.min(target, brakeCap(dStop - 0.3));
          c.stage = 'stopping';
          if (dStop < 1.2) target = 0;
          if (dStop < 1.2 && c.speed < 0.05) {
            c.speed = 0;
            plan.stoppedT += dt;
            c.stage = 'stopped';
            if (plan.stoppedT >= JUNCTION.stopWait) {
              const why = junctionClear(c, cs, plan, player);
              if (!why) {
                plan.go = true;
                plan.committed = true;
                cs.inNode = plan.node; // crossing: other traffic waits for it
                c.stage = 'go';
              } else if (why === 'player') capP = 0;
            }
          }
          if (!plan.go) hold = true;
        } else if (tn && !plan.committed && dEntry < 30) {
          // Before turning in: wait for a clear junction at the entry.
          const why = junctionClear(c, cs, plan, player);
          if (why) {
            hold = true;
            target = Math.min(target, brakeCap(dEntry - 0.5));
            c.stage = 'waiting';
            if (why === 'player' && c.speed < HONK.speed) capP = 0;
          } else if (dEntry < 4) {
            plan.committed = true;
            cs.inNode = plan.node; // claimed: nobody else goes in now
          }
        }
        if (plan.go && c.stage === '') c.stage = 'go';
        if (tn && !hold && dEntry <= 0.05) {
          // Into the junction: follow the curve onto the next road.
          cs.curve = { cv: tn.curve, u: 0, to: tn.to, toAt: tn.exitAt, toDir: tn.toDir, side: tn.side, v: tn.v, node: plan.node };
          cs.inNode = plan.node;
          c.stage = 'curve';
          side = tn.side;
        }
      }
      setBlink(c, cs, side, dt);
    }

    const acc = target > c.speed ? 2.2 : 5.5;
    c.speed += Math.max(-acc * dt, Math.min(acc * dt, target - c.speed));
    if (c.speed < 0.02 && target <= 0.05) c.speed = 0;
    // How long it has stood still (see maybeRespawn).
    if (c.speed < 0.3) cs.stuckT += dt;
    else if (c.speed > 1) cs.stuckT = 0;
    // Held up by the player: once a second a growing chance to honk (longer
    // the longer it waits) and to give up and turn round (see WAIT), one car
    // in a queue at a time. Clear for a moment and the wait starts over.
    const blocked = capP < HONK.capBelow && c.speed < HONK.speed;
    stepWait(cs.honk, blocked, dt);
    c.horn = blocked && cs.honk.horn > 0;
    if (blocked && cs.honk.give && !cs.curve && !knotGiving(knotOf(c))) {
      if (cs.inNode) cs.inNode = null;
      cs.plan = null;
      cs.leave = { mode: 'back', t: 0, backed: 0, checkT: 0, px: player.x, py: player.y };
      c.horn = false;
      return;
    }
    // Held up by other cars instead (a knot, or a queue going its way): the
    // same rolls (see WAIT); it gives way only when no one else in its knot
    // is, so a knot always clears, one car at a time.
    const jammed = !blocked && capP >= HONK.capBelow && c.speed < HONK.speed && !cs.curve;
    c.wait = blocked || (capP < HONK.capBelow && c.speed < HONK.speed) ? 'player' : jammed ? 'car' : '';
    stepWait(cs.jam, jammed, dt);
    if (jammed && cs.jam.horn > 0) c.horn = true;
    if (jammed && cs.jam.give && !knotGiving(knotOf(c))) {
      if (cs.inNode) cs.inNode = null;
      cs.plan = null;
      cs.leave = { mode: 'back', jam: true, t: 0, backed: 0, checkT: 0, holdT: 0 };
      setBlink(c, cs, 0, dt);
      c.stage = '';
      c.horn = false;
      return;
    }

    let t;
    if (cs.curve) {
      const C = cs.curve;
      C.u += c.speed * dt;
      if (C.u >= C.cv.len) {
        // Out of the junction, in its lane on the next road.
        cs.n = C.to;
        cs.s = C.toAt;
        cs.dir = C.toDir;
        cs.seg = undefined;
        cs.curve = null;
        cs.plan = null;
        cs.lastNode = C.node;
        if (cs.inNode === C.node) cs.inNode = null;
        t = carTarget(cs);
      } else t = curveAt(C.cv, C.u);
    } else {
      cs.s = clampS(n, cs.s + cs.dir * c.speed * dt);
      t = carTarget(cs);
    }

    // Smoothly follow the lane target.
    const k = Math.min(1, dt * 6);
    const nx = c.x + (t.x - c.x) * k;
    const ny = c.y + (t.y - c.y) * k;
    const mdx = nx - c.x;
    const mdy = ny - c.y;
    // Face the way it moves, unless it is creeping or the move is mostly
    // sideways (a few cm of drift back into the lane after a three-point
    // turn): then turn calmly to face the lane.
    const mh = mdx * mdx + mdy * mdy > 1e-4 ? headingOf(mdx, mdy) : null;
    if (mh !== null && c.speed > 1 && Math.abs(angDiff(mh, t.h)) < 60) c.heading = turnToward(c.heading, mh, 200 * dt);
    else c.heading = turnToward(c.heading, t.h, 90 * dt);
    c.x = nx;
    c.y = ny;
  }

  // ---------- Turning round ----------
  // At a dead end, a broken bridge or a fallen tree the car stops short and
  // makes the same three-point turn (a forced leave: it never backs up or
  // gives up on it, it waits until there is room).
  // When the player will not move:
  // After leaning on the horn the car gives up and goes back the way it
  // came: a three-point turn (turnPose) where it stands when there is room.
  // Where there is not (on a bridge, by a fallen tree's gap, the player or
  // another car in the way, traffic coming) it backs up slowly along its
  // own lane, up to LEAVE.backMax m, and turns as soon as there is room.
  // When it cannot back up either (a car right behind, the road's end) it
  // waits quietly and tries again; it drives on as normal once the player
  // has moved LEAVE.releaseR m from where they held it up.
  const LEAVE = { backSpeed: 2, backMax: 40, clearR: 3.4, trafficR: 40, releaseR: 15 };

  // Frame of a turn starting at s on the car's road: origin on the centre line.
  function turnFrame(cs) {
    const p = roadPoint(cs.n, cs.s, {});
    const fx = p.dx * cs.dir;
    const fy = p.dy * cs.dir;
    return { x: p.x, y: p.y, fx, fy, rx: -fy, ry: fx, h: headingOf(fx, fy), w: cs.n.road.width };
  }
  function turnAt(F, t) {
    const q = turnPose(F.w, t);
    return { x: F.x + F.fx * q.u + F.rx * q.v, y: F.y + F.fy * q.u + F.ry * q.v, h: (F.h + q.h + 360) % 360, q };
  }
  // Room to turn here: not on a bridge or by a road block, no moving
  // traffic near, and nothing (player, parked car, hazard, stopped car)
  // within clearR of the car's path.
  function turnClear(c, cs, player) {
    const n = cs.n;
    if (n.blocks.some((b) => Math.abs(b - cs.s) < 15)) return false;
    for (const b of world.bridges) if (Math.hypot(b.x - c.x, b.y - c.y) < (b.length || 20) / 2 + 6) return false;
    const things = [];
    if (player) things.push(player);
    for (const o of obstacles) if (Math.abs(o.x - c.x) < 20 && Math.abs(o.y - c.y) < 20) things.push(o);
    for (const o of cars) {
      if (o === c) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      // Traffic coming at it (not creeping, not going away) or turning round.
      if (d < LEAVE.trafficR && (o.turning || (o.speed > 2 && relTo(o.x, o.y, o.heading, c.x, c.y).along > -3))) return false;
      if (d < 20) things.push(o);
    }
    const F = turnFrame(cs);
    const L = turnLength();
    for (let t = 0; t <= L; t += 0.3) {
      const p = turnAt(F, t);
      for (const o of things) if (Math.hypot(o.x - p.x, o.y - p.y) < LEAVE.clearR + (o.r || 0)) return false;
    }
    return true;
  }
  // Room to back up: not at the road's start, no car close behind in this lane.
  function backClear(c, cs) {
    if (cs.leave.backed >= LEAVE.backMax) return false;
    if ((cs.dir > 0 ? cs.s : cs.n.len - cs.s) < 8) return false;
    for (const o of cars) {
      if (o === c || Math.abs(o.x - c.x) > 20 || Math.abs(o.y - c.y) > 20) continue;
      const r = relTo(c.x, c.y, c.heading, o.x, o.y);
      if (r.along < 0 && r.along > -9 && Math.abs(r.lat) < TRAFFIC.halfW * 2 + TRAFFIC.margin) return false;
    }
    return true;
  }
  function stepLeave(c, cs, dt, player) {
    const L = cs.leave;
    c.horn = false;
    if (L.mode === 'turn') {
      L.t += dt;
      const p = turnAt(L.F, L.t);
      c.speed = Math.hypot(p.x - c.x, p.y - c.y) / dt;
      c.x = p.x;
      c.y = p.y;
      c.heading = p.h;
      cs.stuckT = 0;
      if (p.q.done) {
        // Back on the road, in the other lane, going the other way.
        cs.s = Math.max(0, Math.min(cs.n.len, cs.s + cs.dir * p.q.u));
        cs.dir = -cs.dir;
        cs.seg = undefined;
        cs.skip = 10;
        // Facing back now: the junction it last came through is ahead of it
        // again, so it must plan it (it used to skip it, drive to the road's
        // end and sit there with its speed up, and a jam built behind it).
        cs.lastNode = null;
        cs.plan = null;
        cs.leave = null;
        cs.honk.t = cs.honk.clearT = 0;
        cs.jam.t = cs.jam.clearT = 0;
        c.turning = false;
        c.speed = 0;
      }
      return;
    }
    if (!L.forced && L.mode === 'hold' && (L.holdT = (L.holdT || 0) + dt) > JAM.holdMax) {
      // No room to give way or turn here: wait and roll as before (another
      // car in the knot may go instead).
      cs.leave = null;
      c.turning = false;
      return;
    }
    if (!L.forced && !L.jam && player && Math.hypot(player.x - L.px, player.y - L.py) > LEAVE.releaseR) {
      // The player has moved on: carry on as before.
      cs.leave = null;
      cs.honk.t = cs.honk.clearT = 0;
      c.turning = false;
      return;
    }
    L.checkT -= dt;
    if (L.checkT <= 0) {
      L.checkT = 0.25;
      if (turnClear(c, cs, player)) {
        L.mode = 'turn';
        L.t = 0;
        L.F = turnFrame(cs);
        c.turning = true;
        return;
      }
      if (L.mode === 'back' && !backClear(c, cs)) L.mode = 'hold';
      else if (L.mode === 'hold' && !L.forced && backClear(c, cs)) L.mode = 'back';
    }
    if (L.mode === 'back') {
      // Reverse slowly along its own lane, still facing the player.
      const step = LEAVE.backSpeed * dt;
      cs.s = Math.max(0, Math.min(cs.n.len, cs.s - cs.dir * step));
      L.backed += step;
      c.speed = LEAVE.backSpeed;
      cs.stuckT = 0;
      const t = carTarget(cs);
      c.x = t.x;
      c.y = t.y;
      c.heading = turnToward(c.heading, t.h, 60 * dt);
    } else {
      c.speed = 0;
      cs.stuckT += dt;
    }
  }

  // Take a car away and put it back on a road out of the player's sight
  // when it is far off (so traffic stays round the player) or has stood
  // stuck a long while with the player not close. The car count stays the same.
  function seenFrom(player, x, y) {
    const dx = x - player.x;
    const dy = y - player.y;
    const d = Math.hypot(dx, dy);
    const cos = d > 0 ? (dx * fwdX(player.heading || 0) + dy * fwdY(player.heading || 0)) / d : 1;
    return { d, seen: seenByPlayer(d, cos) };
  }
  function maybeRespawn(c, cs, dt, player) {
    if (!player) return;
    cs.relocT -= dt;
    if (cs.relocT > 0) return;
    cs.relocT = R(1.5, 3);
    const v = seenFrom(player, c.x, c.y);
    if (!respawnReason(v.d, cs.stuckT, v.seen)) return;
    const sp = pickSpawn((p) => {
      const w = seenFrom(player, p.x, p.y);
      return goodRespawn(w.d, w.seen);
    });
    if (sp) placeCar(c, cs, sp);
  }

  // ---------- Trees grid for birds ----------
  const TCELL = 50;
  const treeGrid = new Map();
  trees.forEach((t, i) => {
    const k = Math.floor(t.x / TCELL) * 10007 + Math.floor(t.y / TCELL);
    let l = treeGrid.get(k);
    if (!l) treeGrid.set(k, (l = []));
    l.push(i);
  });
  function treesNear(x, y, r) {
    const out = [];
    const c0 = Math.floor((x - r) / TCELL);
    const c1 = Math.floor((x + r) / TCELL);
    const r0 = Math.floor((y - r) / TCELL);
    const r1 = Math.floor((y + r) / TCELL);
    for (let i = c0; i <= c1; i++) {
      for (let j = r0; j <= r1; j++) {
        const l = treeGrid.get(i * 10007 + j);
        if (!l) continue;
        for (const ti of l) {
          const t = trees[ti];
          if ((t.x - x) ** 2 + (t.y - y) ** 2 <= r * r) out.push(ti);
        }
      }
    }
    return out;
  }
  const perchZ = (t) => (t.kind === 'pine' ? 1.25 : t.kind === 'willow' ? 1.2 : 1.4) * t.r;
  // A tree from `minD` to `maxD` away, optionally away from (ax, ay).
  function pickTree(x, y, minD, maxD, ax, ay) {
    for (let k = 0; k < 12; k++) {
      let a = rng() * Math.PI * 2;
      if (ax !== undefined) {
        const away = Math.atan2(y - ay, x - ax);
        a = away + (rng() - 0.5) * 1.6;
      }
      const d = R(minD, maxD);
      const cx = x + Math.cos(a) * d;
      const cy = y + Math.sin(a) * d;
      const cand = treesNear(cx, cy, 40);
      if (cand.length) return cand[Math.floor(rng() * cand.length)];
    }
    return -1;
  }

  // ---------- Birds ----------
  const birds = [];
  const flocks = [];
  let birdId = 0;
  function assignPerches(f, ti) {
    const t0 = trees[ti];
    const near = treesNear(t0.x, t0.y, 18);
    for (const b of f.members) {
      const pi = near.length && rng() < 0.6 ? near[Math.floor(rng() * near.length)] : ti;
      const t = trees[pi];
      const a = rng() * Math.PI * 2;
      // Near the crown: the CC0 tree models are narrower than r up top, so a
      // wider spot put birds on the steep sides of the canopy.
      const rr = t.r * R(0.05, 0.3);
      b._px = t.x + Math.cos(a) * rr;
      b._py = t.y + Math.sin(a) * rr;
      b._pz = perchZ(t) * R(0.85, 1.0);
      b.perchTree = pi;
    }
    f.tree = ti;
    f.x = t0.x;
    f.y = t0.y;
  }
  if (trees.length) {
    const nFlocks = Math.max(8, Math.min(48, Math.round(trees.length / 100)));
    for (let i = 0; i < nFlocks; i++) {
      // Half the flocks start near towns, the rest anywhere.
      let ti = Math.floor(rng() * trees.length);
      if (i % 2 === 0 && towns.length) {
        const t = towns[i % towns.length];
        const c = treesNear(t.x, t.y, t.ambienceR + 250);
        if (c.length) ti = c[Math.floor(rng() * c.length)];
      }
      const f = { members: [], tree: ti, x: 0, y: 0, flying: false, t: 0, timer: R(15, 120), acc: 0 };
      const n = 3 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) {
        const b = { id: `b${birdId++}`, x: 0, y: 0, z: 0, heading: rng() * 360, flying: false, flap: 0, perchTree: ti };
        b._phase = rng() * 10;
        b._hop = R(2, 12);
        f.members.push(b);
        birds.push(b);
      }
      assignPerches(f, ti);
      for (const b of f.members) {
        b.x = b._px;
        b.y = b._py;
        b.z = b._pz;
      }
      flocks.push(f);
    }
  }
  function launchFlock(f, ti) {
    if (ti < 0) return;
    f.flying = true;
    f.t = 0;
    for (const b of f.members) {
      b._sx = b.x;
      b._sy = b.y;
      b._sz = b.z;
      b._delay = R(0, 0.5);
    }
    assignPerches(f, ti);
    const dist = Math.hypot(trees[ti].x - f.members[0]._sx, trees[ti].y - f.members[0]._sy);
    f.dur = Math.max(3, dist / R(8, 11));
    f.arc = Math.min(28, 8 + dist * 0.06);
    for (const b of f.members) {
      b.flying = true;
      b.heading = headingOf(b._px - b._sx, b._py - b._sy);
    }
  }
  function stepFlock(f, dt, time, player, events) {
    if (!f.flying) {
      f.timer -= dt;
      // Scatter when the player comes close.
      if (player) {
        let near = false;
        for (const b of f.members) {
          if ((b.x - player.x) ** 2 + (b.y - player.y) ** 2 < 25 * 25) { near = true; break; }
        }
        if (near) {
          events.push({ type: 'birds_scatter', x: f.x, y: f.y });
          launchFlock(f, pickTree(f.x, f.y, 90, 260, player.x, player.y));
          return;
        }
      }
      if (f.timer <= 0) {
        f.timer = R(45, 140);
        const long = rng() < 0.1;
        let ti = pickTree(f.x, f.y, long ? 300 : 60, long ? 600 : 300);
        if (ti >= 0 && player) {
          const t = trees[ti];
          if ((t.x - player.x) ** 2 + (t.y - player.y) ** 2 < 40 * 40) ti = -1;
        }
        launchFlock(f, ti);
        return;
      }
      // Perched: an occasional hop or turn.
      for (const b of f.members) {
        b._hop -= dt;
        if (b._hop <= 0) {
          b._hop = R(2, 12);
          b.heading = (b.heading + R(-120, 120) + 360) % 360;
          b._flapT = 0.25;
        }
        if (b._flapT > 0) {
          b._flapT -= dt;
          b.flap = 0.5 + 0.5 * Math.sin(time * 30 + b._phase);
        } else b.flap = 0;
      }
      return;
    }
    f.t += dt;
    let landed = 0;
    for (const b of f.members) {
      const u = Math.max(0, Math.min(1, (f.t - b._delay) / f.dur));
      const e = u * u * (3 - 2 * u);
      const wob = Math.sin(time * 1.7 + b._phase) * 1.5 * Math.sin(Math.PI * u);
      const dx = b._px - b._sx;
      const dy = b._py - b._sy;
      const L = Math.hypot(dx, dy) || 1;
      b.x = b._sx + dx * e - (dy / L) * wob;
      b.y = b._sy + dy * e + (dx / L) * wob;
      b.z = b._sz + (b._pz - b._sz) * e + f.arc * Math.sin(Math.PI * u);
      b.flap = u < 1 ? 0.5 + 0.5 * Math.sin(time * 22 + b._phase) : 0;
      if (u >= 1) {
        landed++;
        b.flying = false;
        b.x = b._px;
        b.y = b._py;
        b.z = b._pz;
      } else if (u > 0) b.heading = headingOf(dx, dy);
    }
    if (landed === f.members.length) {
      f.flying = false;
      f.timer = R(45, 140);
    }
  }

  // ---------- Animals ----------
  // Field animals (cow, sheep, horse) graze inside their field polygon.
  // Deer roam free near forest edges and bolt from the player car.
  // Every animal: { id, kind, x, y, heading, moving, running }.
  const ANIMAL_KIND = { cows: 'cow', sheep: 'sheep', horses: 'horse' };
  const ANIMAL_SPEED = { cow: 0.6, sheep: 0.8, horse: 0.9 };
  const animals = [];
  const animalState = [];
  const herds = []; // fields with animals, for moo / whinny events
  for (const fd of world.fields || []) {
    if (!fd.animals || !fd.animals.count) continue;
    const bb = bbox(fd.polygon);
    const kind = ANIMAL_KIND[fd.animals.kind] || 'cow';
    const herd = { kind, members: [], x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2, timer: 0 };
    herds.push(herd);
    const margin = 3;
    const inside = (x, y) => pointInPolygon(x, y, fd.polygon) && insideMargin(fd.polygon, x, y, margin);
    for (let i = 0; i < fd.animals.count; i++) {
      let x = 0, y = 0;
      for (let k = 0; k < 60; k++) {
        x = R(bb.minX, bb.maxX);
        y = R(bb.minY, bb.maxY);
        if (inside(x, y)) break;
      }
      const a = { id: `${fd.id}_${i}`, kind, x, y, heading: rng() * 360, moving: false, running: false };
      animals.push(a);
      herd.members.push(a);
      animalState.push({ field: fd, bb, inside, timer: R(2, 15), tx: x, ty: y, speed: ANIMAL_SPEED[kind] });
    }
    herd.timer = R(15, 60);
  }
  function insideMargin(poly, x, y, m) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (distToSegment(x, y, p[0], p[1], q[0], q[1]) < m) return false;
    }
    return true;
  }
  function stepAnimal(a, s, dt) {
    if (a.moving) {
      const dx = s.tx - a.x;
      const dy = s.ty - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.3) {
        a.moving = false;
        a.running = false;
        s.speed = ANIMAL_SPEED[a.kind];
        s.timer = R(5, 25);
        return;
      }
      a.heading = turnToward(a.heading, headingOf(dx, dy), 90 * dt);
      const step = Math.min(d, s.speed * dt);
      const nx = a.x + fwdX(a.heading) * step;
      const ny = a.y + fwdY(a.heading) * step;
      if (s.inside(nx, ny)) {
        a.x = nx;
        a.y = ny;
      } else {
        a.moving = false;
        a.running = false;
        s.speed = ANIMAL_SPEED[a.kind];
        s.timer = R(2, 8);
      }
      return;
    }
    s.timer -= dt;
    if (s.timer <= 0) {
      // Horses now and then trot a longer way.
      const trot = a.kind === 'horse' && rng() < 0.3;
      const reach = trot ? 35 : 12;
      // Sheep drift toward the flock middle, cows wander.
      let cx = a.x, cy = a.y;
      if (a.kind === 'sheep') {
        const c = centroid(s.field.polygon);
        cx = a.x + (c[0] - a.x) * 0.15;
        cy = a.y + (c[1] - a.y) * 0.15;
      }
      for (let k = 0; k < 8; k++) {
        const tx = cx + R(-reach, reach);
        const ty = cy + R(-reach, reach);
        if (s.inside(tx, ty) && s.inside((a.x + tx) / 2, (a.y + ty) / 2)) {
          s.tx = tx;
          s.ty = ty;
          a.moving = true;
          a.running = trot;
          s.speed = trot ? 2.8 : ANIMAL_SPEED[a.kind];
          break;
        }
      }
      if (!a.moving) s.timer = R(2, 6);
    } else if (rng() < dt * 0.1) {
      a.heading = (a.heading + R(-30, 30) + 360) % 360; // grazing shuffle
    }
  }

  // ---------- Deer ----------
  // A few small groups just outside forest edges. Own random stream so the
  // rest of the ambient world keeps its sequence.
  const drng = makeRng((world.seed ^ 0xd3e7) >>> 0);
  const DR = (a, b) => a + drng() * (b - a);
  const waterIndex = new SegIndex(32);
  for (const c of world.creeks || []) waterIndex.addPolyline(c.points, c.width / 2 + 3, c);
  const lakeList = (world.lakes || []).map((l) => ({ poly: l.polygon, bb: bbox(l.polygon) }));
  const fieldList = (world.fields || []).map((f) => ({ poly: f.polygon, bb: bbox(f.polygon) }));
  const forestList = (world.forests || []).map((f) => ({ poly: f.polygon, bb: bbox(f.polygon) }));
  const inPoly = (list, x, y, m = 0) => list.some((p) => x > p.bb.minX - m && x < p.bb.maxX + m && y > p.bb.minY - m
    && y < p.bb.maxY + m && pointInPolygon(x, y, p.poly));
  // Deer can stand here (running deer may cross roads and fields, never water or houses).
  function deerOk(x, y, running) {
    if (x < 20 || y < 20 || x > world.size.w - 20 || y > world.size.h - 20) return false;
    for (const s of waterIndex.near(x, y)) if (distToSegment(x, y, s.ax, s.ay, s.bx, s.by) < s.data.width / 2 + 2) return false;
    if (inPoly(lakeList, x, y)) return false;
    for (const b of world.buildings) if (Math.abs(b.x - x) < 30 && Math.abs(b.y - y) < 30 && pointInRect(x, y, { x: b.x, y: b.y, w: b.w + 3, h: b.h + 3, angle: b.angle || 0 })) return false;
    if (running) return true;
    return roadEdgeDist(x, y) > 6 && !inPoly(fieldList, x, y) && !inTown(x, y);
  }
  const deerGroups = [];
  for (const f of forestList) {
    if (drng() > 0.75) continue;
    const poly = f.poly;
    for (let attempt = 0; attempt < 20; attempt++) {
      const i = Math.floor(drng() * poly.length);
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const t = drng();
      const ex = p[0] + (q[0] - p[0]) * t;
      const ey = p[1] + (q[1] - p[1]) * t;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      let nx = (q[1] - p[1]) / len;
      let ny = -(q[0] - p[0]) / len;
      if (pointInPolygon(ex + nx * 5, ey + ny * 5, poly)) {
        nx = -nx;
        ny = -ny;
      }
      const off = DR(8, 25);
      const hx = ex + nx * off;
      const hy = ey + ny * off;
      if (!deerOk(hx, hy, false) || inPoly(forestList, hx, hy)) continue;
      const g = { hx, hy, ox: hx, oy: hy, members: [], fleeT: 0, fleeH: 0 };
      const n = 2 + Math.floor(drng() * 2);
      for (let k = 0; k < n; k++) {
        const x = hx + DR(-5, 5);
        const y = hy + DR(-5, 5);
        const a = { id: `deer_${deerGroups.length}_${k}`, kind: 'deer', x, y, heading: drng() * 360, moving: false, running: false };
        animals.push(a);
        g.members.push({ a, timer: DR(2, 10), tx: x, ty: y, speed: 1.1 });
      }
      deerGroups.push(g);
      break;
    }
  }
  function stepDeerGroup(g, dt, player) {
    const dPlayer = (a) => (player ? Math.hypot(player.x - a.x, player.y - a.y) : Infinity);
    // Bolt together when the car comes close.
    if (g.fleeT <= 0 && g.members.some((m) => dPlayer(m.a) < 40)) {
      const lead = g.members[0].a;
      g.fleeT = DR(3.5, 6);
      g.fleeH = headingOf(lead.x - player.x, lead.y - player.y) + DR(-30, 30);
      for (const m of g.members) {
        m.a.running = true;
        m.a.moving = true;
        m.a.heading = (g.fleeH + DR(-15, 15) + 360) % 360;
      }
    }
    if (g.fleeT > 0) {
      g.fleeT -= dt;
      for (const m of g.members) {
        const a = m.a;
        const away = player && dPlayer(a) < 70 ? headingOf(a.x - player.x, a.y - player.y) : g.fleeH;
        a.heading = turnToward(a.heading, away, 120 * dt);
        const v = 10 * dt;
        let moved = false;
        for (const turn of [0, 35, -35, 70, -70, 120, -120]) {
          const h = a.heading + turn;
          const nx = a.x + fwdX(h) * v;
          const ny = a.y + fwdY(h) * v;
          if (!deerOk(nx, ny, true)) continue;
          a.x = nx;
          a.y = ny;
          if (turn) a.heading = turnToward(a.heading, (h + 360) % 360, 400 * dt);
          moved = true;
          break;
        }
        if (!moved) a.heading = (a.heading + 180) % 360;
      }
      if (g.fleeT <= 0) {
        if (g.members.some((m) => dPlayer(m.a) < 60)) g.fleeT = 1.5; // keep going
        else {
          const c = g.members[0].a;
          // New home where they stopped, unless they ran far from the woods.
          const far = Math.hypot(c.x - g.ox, c.y - g.oy) > 250;
          g.hx = far ? g.ox : c.x;
          g.hy = far ? g.oy : c.y;
          for (const m of g.members) {
            m.a.running = false;
            m.a.moving = false;
            m.timer = DR(1, 4);
          }
        }
      }
      return;
    }
    for (const m of g.members) {
      const a = m.a;
      if (a.moving) {
        const dx = m.tx - a.x;
        const dy = m.ty - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.4) {
          a.moving = false;
          m.timer = DR(4, 18);
          continue;
        }
        a.heading = turnToward(a.heading, headingOf(dx, dy), 120 * dt);
        const step = Math.min(d, m.speed * dt);
        const nx = a.x + fwdX(a.heading) * step;
        const ny = a.y + fwdY(a.heading) * step;
        if (deerOk(nx, ny, true)) {
          a.x = nx;
          a.y = ny;
        } else {
          a.moving = false;
          m.timer = DR(2, 6);
        }
        continue;
      }
      m.timer -= dt;
      if (m.timer <= 0) {
        // Wander near the group's home (walk back if they ran off).
        const far = Math.hypot(a.x - g.hx, a.y - g.hy) > 30;
        for (let k = 0; k < 8; k++) {
          const tx = (far ? g.hx : a.x) + DR(-10, 10);
          const ty = (far ? g.hy : a.y) + DR(-10, 10);
          if (deerOk(tx, ty, far)) {
            m.tx = tx;
            m.ty = ty;
            m.speed = far ? 1.6 : 1.0;
            a.moving = true;
            break;
          }
        }
        if (!a.moving) m.timer = DR(2, 6);
      } else if (drng() < dt * 0.15) {
        a.heading = (a.heading + DR(-40, 40) + 360) % 360;
      }
    }
  }

  // ---------- People ----------
  const people = new Map();
  const peopleState = new Map();
  for (const l of world.locals || []) {
    const rd = nearestRoadPoint(l.x, l.y);
    const p = { x: l.x, y: l.y, heading: rd ? headingOf(rd.x - l.x, rd.y - l.y) : 180, moving: false };
    people.set(l.id, p);
    const blds = world.buildings.filter((b) => Math.hypot(b.x - l.x, b.y - l.y) < 40);
    peopleState.set(l.id, { hx: l.x, hy: l.y, timer: R(3, 12), tx: l.x, ty: l.y, blds, idleH: p.heading, stay: !!l.stay });
  }
  function nearestRoadPoint(x, y) {
    let best = null;
    for (const r of world.roads) {
      const q = nearestOnPolyline(x, y, r.points);
      if (q && (!best || q.d < best.d)) best = q;
    }
    return best;
  }
  function personSpotOk(st, x, y) {
    if (Math.hypot(x - st.hx, y - st.hy) > 6) return false;
    if (roadEdgeDist(x, y) < 1.2) return false;
    for (const b of st.blds) if (pointInRect(x, y, { x: b.x, y: b.y, w: b.w + 1.2, h: b.h + 1.2, angle: b.angle })) return false;
    return true;
  }
  function stepPerson(p, st, dt, player) {
    const dPlayer = player ? Math.hypot(player.x - p.x, player.y - p.y) : Infinity;
    if (dPlayer < 15) {
      p.moving = false;
      p.heading = turnToward(p.heading, headingOf(player.x - p.x, player.y - p.y), 150 * dt);
      st.timer = Math.max(st.timer, 3);
      return;
    }
    if (p.moving) {
      const dx = st.tx - p.x;
      const dy = st.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.15) {
        p.moving = false;
        st.timer = R(4, 14);
        st.idleH = (p.heading + R(-90, 90) + 360) % 360;
        return;
      }
      p.heading = turnToward(p.heading, headingOf(dx, dy), 240 * dt);
      const step = Math.min(d, 1.1 * dt);
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      return;
    }
    p.heading = turnToward(p.heading, st.idleH, 60 * dt);
    st.timer -= dt;
    if (st.timer > 0) return;
    if (rng() < 0.35) {
      for (let k = 0; k < 8; k++) {
        const a = rng() * Math.PI * 2;
        const r = rng() * 5.5;
        const tx = st.hx + Math.cos(a) * r;
        const ty = st.hy + Math.sin(a) * r;
        if (personSpotOk(st, tx, ty) && personSpotOk(st, (tx + p.x) / 2, (ty + p.y) / 2)) {
          st.tx = tx;
          st.ty = ty;
          p.moving = true;
          break;
        }
      }
    } else {
      st.idleH = (p.heading + R(-100, 100) + 360) % 360;
    }
    if (!p.moving) st.timer = R(4, 14);
  }

  // ---------- Wind, clouds, smoke, dust ----------
  const wind = { dir: 290, speed: 3 };
  const windRoll = 260 + rng() * 60;
  // Regions with an airfield set their prevailing wind (src/world/airfield.js).
  const windBase = world.windBase ?? windRoll;
  const clouds = [];
  const CM = 400; // margin outside the world for wrapping
  const W = world.size.w;
  const H = world.size.h;
  const nClouds = Math.round((W * H) / 900000);
  for (let i = 0; i < nClouds; i++) {
    clouds.push({ x: R(-CM, W + CM), y: R(-CM, H + CM), rx: R(70, 200), ry: R(45, 120), angle: R(0, 180) });
  }

  const chimneys = [];
  for (const b of world.buildings) {
    if (!b.chimney) continue;
    // Same chimney spot as both renderers draw it (hash of the building id).
    const h = hashString(b.id);
    const lx = ((h >> 4) % 2 ? 1 : -1) * b.w * 0.25;
    const ly = ((h >> 6) % 2 ? 1 : -1) * b.h * 0.2;
    const p = localToWorld(b.x, b.y, b.angle || 0, lx, ly);
    const floors = b.kind === 'farmhouse' || h % 3 === 0 ? 2 : 1;
    const wallH = floors === 2 ? 5.6 : 3.2;
    const z = wallH + Math.min(b.w, b.h) * 0.42 + 1.4;
    chimneys.push({ id: b.id, x: p.x, y: p.y, z, t: R(0, 1) });
  }
  const smoke = [];
  const dust = [];
  const MAX_DUST = 400;
  function emitDust(x, y, heading, speed, dt, acc) {
    acc.v = (acc.v || 0) + dt * Math.min(14, Math.abs(speed) * 0.9);
    const back = speed >= 0 ? -1 : 1;
    while (acc.v >= 1) {
      acc.v -= 1;
      if (dust.length >= MAX_DUST) dust.shift();
      const side = R(-0.9, 0.9);
      dust.push({
        x: x + fwdX(heading) * 2.3 * back + fwdY(heading) * -side,
        y: y + fwdY(heading) * 2.3 * back + fwdX(heading) * side,
        z: 0.3, age: 0, life: R(1.4, 2.6), size: R(0.8, 1.3),
        vx: fwdX(heading) * back * Math.abs(speed) * 0.08 + R(-0.4, 0.4),
        vy: fwdY(heading) * back * Math.abs(speed) * 0.08 + R(-0.4, 0.4),
      });
    }
  }

  // ---------- Sound events ----------
  const bellLm = world.landmarks.find((l) => l.id === (world.ambient && world.ambient.bellTower)) ||
    world.landmarks.find((l) => l.kind === 'church');
  let lastHour = null;
  const farms = [];
  {
    const groups = new Map();
    for (const b of world.buildings) {
      if (!b.farm) continue;
      if (!groups.has(b.farm)) groups.set(b.farm, []);
      groups.get(b.farm).push(b);
    }
    for (const [id, bs] of groups) {
      const house = bs.find((b) => b.kind === 'farmhouse') || bs[0];
      farms.push({ id, x: house.x + 6, y: house.y + 8, timer: R(3, 10) });
    }
  }

  // ---------- Update ----------
  const events = [];
  let time = 0;
  const playerDustAcc = {};
  const carDustAcc = cars.map(() => ({}));

  const amb = {
    birds, cars, animals, people, dust, smoke, clouds, wind, events,
    chimneys, // additive: [{ id, x, y, z }] chimney tops (z = metres above ground)
    playerSurface: 'paved', // additive: surface under the player car ('paved'|'dirt'|'grass')
    flocks, // additive (internal-ish): bird groups
    carState, // internal: per-car traffic state, same order as cars (for tools/check-traffic.mjs)
    // internal: road ends at the map edge with no junction, [{ x, y }] (for tools/check-traffic.mjs)
    edgeEnds: net.flatMap((n) => [0, 1].filter((e) => n.edgeEnd[e]).map((e) => { const p = n.pts[e ? n.pts.length - 1 : 0]; return { x: p[0], y: p[1] }; })),
    surfaceAt, // additive: road surface lookup
    junctions: nodes.map((k) => ({ id: k.id, x: k.x, y: k.y, r: k.r })), // additive: junction centres (cars' `junction` names the one they are in)
    stopSigns, // additive: [{ id, x, y, heading, leanX, leanY }] STOP signs at minor-to-paved junctions (SPEC 9q)
    obstacles, // additive: [{ x, y, r, player? }] hazards traffic waits behind (the caller refills it); player: true for the parked car, which traffic honks at
    horns: [], // additive: [{ id, x, y }] vehicles sounding their horn this frame (traffic, then hazards add theirs)
    time: 0,

    // Additive: extra places traffic turns around (fallen trees across a
    // road): [{ roadId, at }] with `at` in metres along the road. Replaces
    // the previous extra list.
    setRoadBlocks(list) {
      for (const n of net) n.blocks = n.baseBlocks.slice();
      for (const b of list || []) {
        const n = netById.get(b.roadId);
        if (n) n.blocks.push(b.at);
      }
    },

    personPos(npcId) {
      return people.get(npcId) || null;
    },

    update(dt, state) {
      events.length = 0;
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      time += dt;
      amb.time = time;
      const player = state && state.car ? state.car : null;
      const px = player ? player.x : W / 2;
      const py = player ? player.y : H / 2;
      const nearSq = NEAR_R * NEAR_R;

      // Wind slowly veers and gusts.
      wind.dir = (windBase + 25 * Math.sin(time / 170) + 8 * Math.sin(time / 41) + 360) % 360;
      wind.speed = 3 + 1.4 * Math.sin(time / 97 + 1) + 0.6 * Math.sin(time / 13);
      const wx = fwdX(wind.dir) * wind.speed;
      const wy = fwdY(wind.dir) * wind.speed;

      // Traffic (everywhere, cheap).
      amb.horns.length = 0;
      for (let i = 0; i < cars.length; i++) {
        stepCar(cars[i], carState[i], dt, player, !!(state && state.onFoot));
        maybeRespawn(cars[i], carState[i], dt, player);
        const c = cars[i];
        c.junction = carState[i].inNode ? carState[i].inNode.id : '';
        if (c.horn) amb.horns.push({ id: c.id, x: c.x, y: c.y });
        if (c.onDirt && c.speed > 3 && (c.x - px) ** 2 + (c.y - py) ** 2 < nearSq) emitDust(c.x, c.y, c.heading, c.speed, dt, carDustAcc[i]);
      }

      // Player dust.
      if (player) {
        amb.playerSurface = surfaceAt(player.x, player.y);
        if (amb.playerSurface === 'dirt' && Math.abs(player.speed) > 3) emitDust(player.x, player.y, player.heading, player.speed, dt, playerDustAcc);
      }

      // Birds: full updates near the player, coarse far away.
      for (const f of flocks) {
        const near = (f.x - px) ** 2 + (f.y - py) ** 2 < nearSq || (f.flying && (f.members[0].x - px) ** 2 + (f.members[0].y - py) ** 2 < nearSq);
        if (near) {
          if (f.acc > 0) { stepFlock(f, f.acc, time, player, events); f.acc = 0; }
          stepFlock(f, dt, time, player, events);
        } else {
          f.acc += dt;
          if (f.acc >= COARSE_STEP) {
            stepFlock(f, f.acc, time, null, events);
            f.acc = 0;
          }
        }
      }

      // Animals and people: only near the player.
      for (let i = 0; i < animalState.length; i++) {
        const a = animals[i];
        if ((a.x - px) ** 2 + (a.y - py) ** 2 < nearSq) stepAnimal(a, animalState[i], dt);
      }
      for (const g of deerGroups) {
        const a = g.members[0].a;
        if (g.fleeT > 0 || (a.x - px) ** 2 + (a.y - py) ** 2 < nearSq) stepDeerGroup(g, dt, player);
      }
      // Now and then a cow moos or a horse whinnies, when the player is near.
      for (const h of herds) {
        if (h.kind === 'sheep') continue;
        const d = Math.hypot(h.x - px, h.y - py);
        if (d > 250) continue;
        h.timer -= dt;
        if (h.timer <= 0) {
          h.timer = h.kind === 'horse' ? R(50, 130) : R(45, 120);
          const a = h.members[Math.floor(rng() * h.members.length) % h.members.length];
          events.push({ type: h.kind === 'horse' ? 'whinny' : 'moo', x: a.x, y: a.y });
        }
      }
      for (const [id, p] of people) {
        const ps = peopleState.get(id);
        if (ps.stay) continue; // the tourist stands by her car
        if ((p.x - px) ** 2 + (p.y - py) ** 2 < nearSq) stepPerson(p, ps, dt, player);
      }

      // Dust particles.
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.age += dt;
        if (d.age >= d.life) { dust.splice(i, 1); continue; }
        d.x += (d.vx + wx * 0.35) * dt;
        d.y += (d.vy + wy * 0.35) * dt;
        d.vx *= 1 - dt * 1.5;
        d.vy *= 1 - dt * 1.5;
        d.z += dt * 0.6;
        d.size += dt * 2.2;
      }

      // Chimney smoke (within 2.5 km, the 3D view can see far).
      for (const ch of chimneys) {
        if ((ch.x - px) ** 2 + (ch.y - py) ** 2 > 2500 * 2500) continue;
        ch.t -= dt;
        if (ch.t <= 0) {
          ch.t = R(0.45, 0.8);
          smoke.push({ x: ch.x + R(-0.2, 0.2), y: ch.y + R(-0.2, 0.2), z: ch.z, age: 0, life: R(7, 10), size: R(0.6, 0.9) });
        }
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.age += dt;
        if (s.age >= s.life) { smoke.splice(i, 1); continue; }
        const lift = 1.1 / (1 + s.age * 0.4);
        s.z += lift * dt;
        const drift = Math.min(1, s.age / 2) * 0.7;
        s.x += wx * drift * dt;
        s.y += wy * drift * dt;
        s.size += dt * 0.45;
      }

      // Cloud shadows drift faster than ground wind and wrap round the world.
      for (const c of clouds) {
        c.x += wx * 2.4 * dt;
        c.y += wy * 2.4 * dt;
        if (c.x < -CM) c.x += W + 2 * CM;
        else if (c.x > W + CM) c.x -= W + 2 * CM;
        if (c.y < -CM) c.y += H + 2 * CM;
        else if (c.y > H + CM) c.y -= H + 2 * CM;
      }

      // Church bell on each game hour.
      if (state && typeof state.clockMinutes === 'number' && bellLm) {
        const hour = Math.floor(state.clockMinutes / 60) % 24;
        if (lastHour !== null && hour !== lastHour) {
          events.push({ type: 'bell', count: hour % 12 || 12, x: bellLm.x, y: bellLm.y });
        }
        lastHour = hour;
      }

      // Dogs bark at farms when the player is near.
      for (const fm of farms) {
        const d = Math.hypot(fm.x - px, fm.y - py);
        if (d > 280) { fm.timer = Math.max(fm.timer, R(1, 4)); continue; }
        fm.timer -= dt * (d < 80 ? 2 : 1);
        if (fm.timer <= 0) {
          fm.timer = R(8, 25);
          events.push({ type: 'dog_bark', x: fm.x, y: fm.y, count: 1 + Math.floor(rng() * 3) });
        }
      }
    },
  };
  return amb;
}
