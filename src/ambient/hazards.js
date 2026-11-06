// Road hazards, shared logic (no engine code).
//
// Moving hazards, each in its own kind of place, one about every 2 to 4
// minutes of driving, spawned out of sight ahead on the road you are on and
// cleaned up once far behind:
//   cows / sheep  near pasture: wander onto the road, stand there a while,
//                 then walk off. They leave early if you creep up slowly.
//   tractor / truck  on dirt roads near farmland: slow traffic going your way.
//   deer          near forest: wait by the road, then dart across (rare).
// Fallen branches and small logs (not solid, a knock and a slow-down if you
// drive over them fast) turn up on roads under trees, on their own timer.
// A few fixed fallen trees (scenery.fallen, src/world/fallenTrees.js) lie
// part way across roads: the trunk and root plate are solid, the crown is
// brush that slows you and knocks the car like a branch. There is always a
// way past (npm run check:fallen).
//
// API:
//   const hz = createHazards(world, scenery, { rngSeed })
//   hz.update(dt, state, amb)          // after amb.update, when not paused
//   hz.animals   [{ id, kind: 'cow'|'sheep'|'deer', x, y, heading, moving, running }]
//   hz.vehicles  [{ id, kind: 'tractor'|'truck', x, y, heading, speed, color }]
//   hz.debris    [{ id, kind: 'branch'|'log', x, y, angle, len, hl, hw, r }]  (surface events)
//   hz.fallen    [{ id, roadId, at, x, y, heading, h, solidLen, solids, crown, extent, ... }] (fixed fallen trees)
//   hz.pushSolids(x, y, range, out)    // solid circles near (x, y) for collider.dynamic
//   hz.spawn(kind, opts)               // dev: force one now ('cows'|'sheep'|'tractor'|'truck'|'deer'|'branch'|'log')
//   hz.startle(x, y)                   // an animal was hit: its group runs off
//   hz.honk(car)                       // the player sounded the horn (see HORN)
//   hz.reset()                         // clears moving hazards and debris (mission restart)
//   hz.events    this frame's [{ type: 'moo', x, y }] (merged into amb.events by the caller)
//
// Units: metres, seconds, headings in degrees (0 north, clockwise), y south.

import {
  makeRng, DEG, SegIndex, distToSegment, measurePolyline, pointAlong, pointInPolygon, distToPolygonEdge,
  bbox, centroid, headingOf,
} from '../drive/geom.js';
import { fallenShape } from '../world/fallenTrees.js';

export const HAZARD_KINDS = ['cows', 'sheep', 'tractor', 'truck', 'deer', 'branch', 'log'];

const T = {
  movingEvery: [120, 240], // seconds of driving between moving hazards
  firstMoving: [70, 140],
  debrisEvery: [90, 200],
  spawnAhead: [230, 300], // metres along the road
  minStraight: 190, // never spawn closer than this in a straight line
  cleanupR: 420, // removed once this far from the player
  maxActive: 3,
  minDriveSpeed: 2, // the timers only run while you drive
};

// The horn. Each animal on or near the road ahead (within `range`) rolls
// against its courage, the chance it ignores the honk. A brave animal that
// stays loses a little courage with each honk (`braveDecay`), so repeated
// honks move even a stubborn cow in the end, though it only ambles
// (`amble` x its walking speed). Sheep trot off; deer bolt back into cover.
// Tractors and trucks you sit behind may pull onto the verge and slow down
// for `pullTime` seconds so you can pass.
export const HORN = {
  range: 40, // metres
  behind: 6, // metres behind the car that still count (an animal beside you)
  courage: { cow: 0.75, sheep: 0.4, deer: 0.1, horse: 0.45, tractor: 0.3, truck: 0.5 },
  braveDecay: 0.8, // courage x this after each honk it ignores
  amble: { cow: 0.65, sheep: 1.5, horse: 1 },
  pullTime: 14, // s on the verge
  pullSpeed: { tractor: 2.5, truck: 3.5 }, // m/s while pulled over
};

const TRACTOR_COLORS = [0x3f7a35, 0xb8352a, 0x2f5f9a];
const TRUCK_COLORS = [0x6b7f8c, 0x8a4b2a, 0xc9b48a, 0x4a5a3a];

function angDiff(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function turnToward(h, target, maxStep) {
  const d = angDiff(h, target);
  return (h + Math.max(-maxStep, Math.min(maxStep, d)) + 360) % 360;
}

export function createHazards(world, scenery, opts = {}) {
  const rng = makeRng((((world.seed || 1) ^ 0x4a2a7d) + (opts.rngSeed || 0)) >>> 0);
  const R = (a, b) => a + rng() * (b - a);
  const trees = (scenery && scenery.trees) || [];

  // ---------- road lookup ----------
  const roads = world.roads.map((road) => ({ road, cum: measurePolyline(road.points) }));
  for (const r of roads) r.len = r.cum[r.cum.length - 1];
  const roadById = new Map(roads.map((r) => [r.road.id, r]));
  const segs = new SegIndex(32);
  for (const r of roads) {
    const p = r.road.points;
    for (let i = 0; i < p.length - 1; i++) segs.add(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], r.road.width / 2 + 4, { r, i });
  }
  // Nearest road under / beside (x, y): { r, s, d, dx, dy } or null.
  function roadAt(x, y, maxD) {
    let best = null;
    for (const sg of segs.near(x, y)) {
      const d = distToSegment(x, y, sg.ax, sg.ay, sg.bx, sg.by);
      if (d > maxD || (best && d >= best.d)) continue;
      const ex = sg.bx - sg.ax;
      const ey = sg.by - sg.ay;
      const L = Math.hypot(ex, ey) || 1;
      const t = Math.max(0, Math.min(1, ((x - sg.ax) * ex + (y - sg.ay) * ey) / (L * L)));
      best = { r: sg.data.r, s: sg.data.r.cum[sg.data.i] + t * L, d, dx: ex / L, dy: ey / L };
    }
    return best;
  }
  const at = (r, s) => pointAlong(r.road.points, r.cum, Math.max(0, Math.min(r.len, s)));

  // ---------- places ----------
  const ctr = (poly) => {
    const [x, y] = centroid(poly);
    return { x, y };
  };
  const pastures = (world.fields || [])
    .filter((f) => f.kind === 'pasture' || (f.animals && f.animals.kind !== 'horses'))
    .map((f) => ({ f, bb: bbox(f.polygon), c: ctr(f.polygon) }));
  const farmland = (world.fields || []).map((f) => ({ f, bb: bbox(f.polygon), c: ctr(f.polygon) }));
  const forests = (world.forests || []).map((f) => ({ f, bb: bbox(f.polygon) }));
  const towns = world.towns || [];
  const bridges = world.bridges || [];

  const nearPoly = (list, x, y, reach) => {
    let best = null;
    let bestD = reach;
    for (const p of list) {
      const bb = p.bb;
      if (x < bb.minX - reach || x > bb.maxX + reach || y < bb.minY - reach || y > bb.maxY + reach) continue;
      const poly = p.f.polygon;
      const d = pointInPolygon(x, y, poly) ? 0 : distToPolygonEdge(x, y, poly);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  const treesNear = (x, y, r) => {
    let n = 0;
    for (const t of trees) {
      if (Math.abs(t.x - x) < r && Math.abs(t.y - y) < r) n++;
      if (n >= 6) break;
    }
    return n;
  };
  const inTown = (x, y) => towns.some((t) => Math.hypot(t.x - x, t.y - y) < t.ambienceR * 0.9);
  const nearBridge = (x, y) => bridges.some((b) => Math.hypot(b.x - x, b.y - y) < (b.length || 20) / 2 + 20);

  // Which kinds fit at a road point.
  function fits(kind, p, r) {
    if (inTown(p.x, p.y) || nearBridge(p.x, p.y)) return false;
    const dirt = r.road.type !== 'paved';
    switch (kind) {
      case 'cows':
      case 'sheep': {
        const f = nearPoly(pastures, p.x, p.y, 45);
        if (!f) return false;
        const k = f.f.animals ? f.f.animals.kind : 'cows';
        return kind === 'sheep' ? k === 'sheep' : k !== 'sheep';
      }
      case 'tractor':
      case 'truck':
        return dirt && !!nearPoly(farmland, p.x, p.y, 120);
      case 'deer':
        return !!nearPoly(forests, p.x, p.y, 70);
      case 'branch':
      case 'log':
        return treesNear(p.x, p.y, 35) >= 2 || !!nearPoly(forests, p.x, p.y, 30);
      default:
        return false;
    }
  }

  // ---------- state ----------
  const list = []; // active hazard groups
  const animals = [];
  const vehicles = [];
  const debris = [];
  const fallen = ((scenery && scenery.fallen) || []).map((f) => ({ ...f, ...fallenShape(f) }));
  const events = [];
  let nextId = 1;
  let movingT = R(...T.firstMoving);
  let debrisT = R(...T.debrisEvery);

  // The player's road and which way along it they drive (+1 / -1), or null.
  function playerRoad(car) {
    const q = roadAt(car.x, car.y, 12);
    if (!q) return null;
    const fx = Math.sin(car.heading * DEG);
    const fy = -Math.cos(car.heading * DEG);
    const dot = fx * q.dx + fy * q.dy;
    if (Math.abs(dot) < 0.3) return null; // crossing the road, not driving it
    return { ...q, dir: dot > 0 ? 1 : -1 };
  }

  // Road point `ahead` metres in front of the player along their road.
  function spotAhead(car, ahead) {
    const pr = playerRoad(car);
    if (!pr) return null;
    const s = pr.s + pr.dir * ahead;
    if (s < 15 || s > pr.r.len - 15) return null;
    const p = at(pr.r, s);
    return { r: pr.r, s, dir: pr.dir, p };
  }

  // A distance ahead (within spawnAhead) where `kind` fits, or null.
  function fitAhead(kind, car) {
    const [a, b] = T.spawnAhead;
    const start = rng();
    for (let k = 0; k < 6; k++) {
      const ahead = a + ((start + k / 6) % 1) * (b - a);
      const sp = spotAhead(car, ahead);
      if (!sp) continue;
      if (Math.hypot(sp.p.x - car.x, sp.p.y - car.y) < T.minStraight) continue;
      if (fits(kind, sp.p, sp.r) && farFromOthers(sp.p.x, sp.p.y)) return ahead;
    }
    return null;
  }

  function farFromOthers(x, y) {
    for (const h of list) if (Math.hypot(h.x - x, h.y - y) < 150) return false;
    return true;
  }

  // ---------- spawning ----------
  function spawn(kind, o = {}) {
    const car = o.car;
    let spot = null;
    const tries = o.ahead !== undefined ? [o.ahead] : [R(...T.spawnAhead), R(...T.spawnAhead), T.spawnAhead[0] - 20];
    for (const ahead of tries) {
      const sp = car && spotAhead(car, ahead);
      if (!sp) continue;
      if (!o.force && Math.hypot(sp.p.x - car.x, sp.p.y - car.y) < T.minStraight) continue;
      if (!o.force && (!fits(kind, sp.p, sp.r) || !farFromOthers(sp.p.x, sp.p.y))) continue;
      spot = sp;
      break;
    }
    if (!spot) return null;
    const h = { id: `hz${nextId++}`, kind, x: spot.p.x, y: spot.p.y, r: spot.r, s: spot.s, dir: spot.dir, t: 0 };
    if (kind === 'cows' || kind === 'sheep') makeHerd(h, spot);
    else if (kind === 'deer') makeDeer(h, spot);
    else if (kind === 'tractor' || kind === 'truck') makeVehicle(h, spot);
    else makeDebris(h, spot);
    list.push(h);
    return h;
  }

  // Lateral unit (right of the road's own direction) at a road point.
  const rightOf = (p) => ({ x: -p.dy, y: p.dx });

  function makeHerd(h, spot) {
    const w = spot.r.road.width;
    const f = nearPoly(pastures, spot.p.x, spot.p.y, 60);
    const rt = rightOf(spot.p);
    // The herd comes from the field's side of the road.
    const c = f ? f.c : { x: spot.p.x + rt.x, y: spot.p.y + rt.y };
    const side = (c.x - spot.p.x) * rt.x + (c.y - spot.p.y) * rt.y >= 0 ? 1 : -1;
    const cow = h.kind === 'cows';
    const n = cow ? 3 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 4);
    h.members = [];
    h.phase = 'in';
    h.side = side;
    h.standT = R(25, 45);
    h.creepT = 0;
    h.mooed = false;
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * (cow ? 2.6 : 1.7) + R(-0.8, 0.8);
      const q = at(spot.r, spot.s + along);
      const qr = rightOf(q);
      const startLat = side * (w / 2 + R(3, 8));
      const roadLat = R(-w / 2 + 0.9, w / 2 - 0.9);
      const a = {
        id: `${h.id}_${i}`, kind: cow ? 'cow' : 'sheep',
        x: q.x + qr.x * startLat, y: q.y + qr.y * startLat, heading: 0, moving: true, running: false,
      };
      a.heading = headingOf(-qr.x * side, -qr.y * side);
      const m = { a, q, qr, lat: startLat, target: roadLat, speed: cow ? R(0.8, 1.1) : R(1, 1.4), delay: R(0, 3), idleT: R(2, 6) };
      h.members.push(m);
      animals.push(a);
    }
  }

  function makeDeer(h, spot) {
    const w = spot.r.road.width;
    const side = rng() < 0.5 ? -1 : 1;
    const n = rng() < 0.4 ? 2 : 1;
    h.members = [];
    h.phase = 'wait';
    for (let i = 0; i < n; i++) {
      const q = at(spot.r, spot.s + i * 3);
      const qr = rightOf(q);
      const lat = side * (w / 2 + R(9, 14));
      const a = {
        id: `${h.id}_${i}`, kind: 'deer', x: q.x + qr.x * lat, y: q.y + qr.y * lat,
        heading: headingOf(-qr.x * side, -qr.y * side), moving: false, running: false,
      };
      h.members.push({ a, q, qr, lat, target: -side * (w / 2 + R(22, 30)), delay: i * 0.45 });
      animals.push(a);
    }
  }

  function makeVehicle(h, spot) {
    const truck = h.kind === 'truck';
    const v = {
      id: h.id, kind: truck ? 'truck' : 'tractor', x: spot.p.x, y: spot.p.y, heading: 0, speed: 0,
      color: (truck ? TRUCK_COLORS : TRACTOR_COLORS)[Math.floor(rng() * (truck ? TRUCK_COLORS.length : TRACTOR_COLORS.length))],
    };
    h.v = v;
    h.cruise = truck ? R(6.5, 8) : R(4, 5);
    placeVehicle(h);
    vehicles.push(v);
  }

  function placeVehicle(h) {
    const p = at(h.r, h.s);
    const fx = p.dx * h.dir;
    const fy = p.dy * h.dir;
    const off = h.r.road.width * 0.24 + (h.pull || 0);
    h.v.x = p.x - fy * off;
    h.v.y = p.y + fx * off;
    h.v.heading = headingOf(fx, fy);
    h.x = h.v.x;
    h.y = h.v.y;
  }

  function makeDebris(h, spot) {
    const w = spot.r.road.width;
    const log = h.kind === 'log';
    const len = log ? R(1.8, 2.8) : R(2.4, 4);
    const lat = R(-w / 2 + 0.8, w / 2 - 0.8);
    const rt = rightOf(spot.p);
    const roadH = headingOf(spot.p.dx, spot.p.dy);
    const d = {
      id: h.id, kind: log ? 'log' : 'branch', x: spot.p.x + rt.x * lat, y: spot.p.y + rt.y * lat,
      angle: roadH + R(55, 125) * (rng() < 0.5 ? 1 : -1), len, hl: len / 2, hw: log ? 0.32 : 0.45, r: len / 2,
      seed: Math.floor(rng() * 1e6),
    };
    h.d = d;
    debris.push(d);
  }

  function remove(h) {
    const i = list.indexOf(h);
    if (i >= 0) list.splice(i, 1);
    if (h.members) for (const m of h.members) {
      const k = animals.indexOf(m.a);
      if (k >= 0) animals.splice(k, 1);
    }
    if (h.v) vehicles.splice(vehicles.indexOf(h.v), 1);
    if (h.d) debris.splice(debris.indexOf(h.d), 1);
  }

  // ---------- stepping ----------
  function stepHerd(h, dt, car) {
    const dx = car.x - h.x;
    const dy = car.y - h.y;
    const dist = Math.hypot(dx, dy);
    const speed = Math.abs(car.speed);
    if (!h.mooed && h.kind === 'cows' && dist < 45) {
      h.mooed = true;
      events.push({ type: 'moo', x: h.x, y: h.y });
    }
    // Creep up slowly and they make way.
    if (h.phase === 'stand' || h.phase === 'in') {
      if (dist < 22 && speed < 4 && speed > 0.3) h.creepT += dt;
      else if (dist < 14 && speed <= 0.3) h.creepT += dt * 0.3;
      if (h.creepT > 2.2) leave(h, car);
    }
    if (h.phase === 'stand') {
      h.standT -= dt;
      if (h.standT <= 0) leave(h, car);
    }
    let allThere = true;
    let sx = 0;
    let sy = 0;
    for (const m of h.members) {
      const a = m.a;
      if (m.delay > 0) {
        m.delay -= dt;
        a.moving = false;
        allThere = false;
      } else {
        const diff = m.target - m.lat;
        if (Math.abs(diff) > 0.15) {
          const step = Math.sign(diff) * Math.min(Math.abs(diff), m.speed * (h.phase === 'leave' ? 1.3 : 1) * dt);
          m.lat += step;
          a.moving = true;
          const hx = m.qr.x * Math.sign(diff);
          const hy = m.qr.y * Math.sign(diff);
          a.heading = turnToward(a.heading, headingOf(hx, hy), 120 * dt);
          allThere = false;
        } else {
          a.moving = false;
          // Idle on the road: turn now and then, look about.
          m.idleT -= dt;
          if (m.idleT <= 0) {
            m.idleT = R(3, 8);
            m.face = (a.heading + R(-70, 70) + 360) % 360;
          }
          if (m.face !== undefined) a.heading = turnToward(a.heading, m.face, 40 * dt);
        }
      }
      a.x = m.q.x + m.qr.x * m.lat;
      a.y = m.q.y + m.qr.y * m.lat;
      sx += a.x;
      sy += a.y;
    }
    h.x = sx / h.members.length;
    h.y = sy / h.members.length;
    if (h.phase === 'in' && allThere) h.phase = 'stand';
    if (h.phase === 'leave' && allThere) h.phase = 'off';
  }

  // Animals walk off the road: away from the car's side when it is close.
  function leave(h, car) {
    if (h.phase === 'leave' || h.phase === 'off') return;
    h.phase = 'leave';
    const w = h.r.road.width;
    for (const m of h.members) {
      let side = h.side;
      if (car) {
        const toCar = (car.x - m.a.x) * m.qr.x + (car.y - m.a.y) * m.qr.y;
        if (Math.abs(toCar) > 1 && Math.hypot(car.x - m.a.x, car.y - m.a.y) < 30) side = toCar > 0 ? -1 : 1;
      }
      m.target = side * (w / 2 + R(4, 9));
      m.delay = R(0, 1.2);
    }
  }

  function stepDeer(h, dt, car) {
    const dist = Math.hypot(car.x - h.x, car.y - h.y);
    if (h.phase === 'wait' && dist < 60) h.phase = 'dash';
    if (h.phase !== 'dash') return;
    let done = true;
    let sx = 0;
    let sy = 0;
    for (const m of h.members) {
      const a = m.a;
      if (m.delay > 0) {
        m.delay -= dt;
        done = false;
      } else {
        const diff = m.target - m.lat;
        if (Math.abs(diff) > 0.2) {
          m.lat += Math.sign(diff) * Math.min(Math.abs(diff), 10 * dt);
          a.moving = a.running = true;
          a.heading = headingOf(m.qr.x * Math.sign(diff), m.qr.y * Math.sign(diff));
          done = false;
        } else a.moving = a.running = false;
      }
      a.x = m.q.x + m.qr.x * m.lat;
      a.y = m.q.y + m.qr.y * m.lat;
      sx += a.x;
      sy += a.y;
    }
    h.x = sx / h.members.length;
    h.y = sy / h.members.length;
    if (done) h.phase = 'gone';
  }

  function stepVehicle(h, dt, car) {
    const v = h.v;
    let target = h.cruise;
    // Pulled over after a honk: onto the verge and slow, then back.
    const w = h.r.road.width;
    const pullTo = h.pullT > 0 ? w * 0.26 + 1 : 0;
    if (h.pullT > 0) {
      h.pullT -= dt;
      target = Math.min(target, HORN.pullSpeed[v.kind] || 3);
    }
    h.pull = (h.pull || 0) + Math.max(-0.8 * dt, Math.min(0.8 * dt, pullTo - (h.pull || 0)));
    const fx = Math.sin(v.heading * DEG);
    const fy = -Math.cos(v.heading * DEG);
    const px = car.x - v.x;
    const py = car.y - v.y;
    const along = px * fx + py * fy;
    const lat = Math.abs(px * fy - py * fx);
    if (Math.hypot(px, py) < 5.5) target = 0;
    else if (along > 0 && along < 16 && lat < 3.2) target = Math.min(target, Math.max(0, (along - 7) * 0.5));
    // Slow near the road ends, then stop there.
    const toEnd = h.dir > 0 ? h.r.len - h.s : h.s;
    if (toEnd < 30) target = Math.min(target, Math.max(0, (toEnd - 6) * 0.2));
    const acc = target > v.speed ? 1.2 : 4;
    v.speed += Math.max(-acc * dt, Math.min(acc * dt, target - v.speed));
    if (v.speed < 0.02 && target === 0) v.speed = 0;
    h.s += h.dir * v.speed * dt;
    h.s = Math.max(0, Math.min(h.r.len, h.s));
    const hPrev = v.heading;
    placeVehicle(h);
    // Ease the heading so corners do not snap.
    v.heading = turnToward(hPrev, v.heading, 60 * dt);
  }

  // ---------- horn ----------
  // Is (x, y) on or near the road ahead of the car, within the horn's range?
  function inHornReach(car, x, y) {
    const dx = x - car.x;
    const dy = y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > HORN.range) return false;
    const fwd = dx * Math.sin(car.heading * DEG) - dy * Math.cos(car.heading * DEG);
    return fwd > -HORN.behind;
  }

  function honk(car) {
    const C = HORN.courage;
    for (const h of list) {
      if (h.members && (h.kind === 'cows' || h.kind === 'sheep')) {
        if (h.phase === 'leave' || h.phase === 'off') continue;
        const w = h.r.road.width;
        let staying = 0;
        let ignored = 0;
        for (const m of h.members) {
          if (m.honked) continue;
          const a = m.a;
          if (!inHornReach(car, a.x, a.y)) {
            staying++;
            continue;
          }
          const courage = (C[a.kind] ?? 0.5) * (m.brave ?? 1);
          if (rng() < courage) {
            // Ignores it, but looks round at you, and is a bit less sure next time.
            m.brave = (m.brave ?? 1) * HORN.braveDecay;
            m.face = headingOf(car.x - a.x, car.y - a.y);
            m.idleT = R(3, 6);
            staying++;
            ignored++;
            continue;
          }
          // Moves off the road, away from the car's side.
          m.honked = true;
          const toCar = (car.x - a.x) * m.qr.x + (car.y - a.y) * m.qr.y;
          const side = Math.abs(toCar) > 1.5 ? (toCar > 0 ? -1 : 1) : h.side;
          m.target = side * (w / 2 + R(4, 9));
          m.speed *= HORN.amble[a.kind] ?? 1;
          m.delay = a.kind === 'cow' ? R(0.6, 2) : R(0.1, 0.6);
        }
        if (ignored && h.kind === 'cows' && rng() < 0.5) events.push({ type: 'moo', x: h.x, y: h.y });
        if (!staying) h.phase = 'leave';
      } else if (h.members && h.kind === 'deer') {
        if (h.phase !== 'wait' || !h.members.some((m) => inHornReach(car, m.a.x, m.a.y))) continue;
        if (rng() < C.deer) continue;
        // Bolts back the way it came, into cover, instead of across the road.
        const w = h.r.road.width;
        for (const m of h.members) {
          m.target = Math.sign(m.lat || 1) * (w / 2 + R(22, 30));
          m.delay *= 0.5;
        }
        h.phase = 'dash';
      } else if (h.v) {
        // Only when you are behind it, going its way.
        const v = h.v;
        if (h.pullT > 0 || !inHornReach(car, v.x, v.y)) continue;
        const fx = Math.sin(v.heading * DEG);
        const fy = -Math.cos(v.heading * DEG);
        const behind = (car.x - v.x) * fx + (car.y - v.y) * fy < -2;
        const sameWay = Math.sin(car.heading * DEG) * fx - Math.cos(car.heading * DEG) * fy > 0.5;
        if (!behind || !sameWay) continue;
        if (rng() < (C[v.kind] ?? 0.4) * (h.brave ?? 1)) {
          h.brave = (h.brave ?? 1) * HORN.braveDecay;
          continue;
        }
        h.pullT = HORN.pullTime;
      }
    }
  }

  // ---------- public ----------
  const hz = {
    animals, vehicles, debris, fallen, events, list,

    update(dt, state, amb) {
      events.length = 0;
      if (!(dt > 0)) return;
      const car = state.car;
      const speed = Math.abs(car.speed);
      if (speed > T.minDriveSpeed && !state.won) {
        movingT -= dt;
        debrisT -= dt;
      }
      if (movingT <= 0) {
        const moving = list.filter((h) => h.kind !== 'branch' && h.kind !== 'log').length;
        if (moving < T.maxActive) {
          // Pick from what fits somewhere ahead; weighted. Retry soon if nothing fits.
          const pool = [];
          for (const [k, w] of [['cows', 3], ['sheep', 2], ['tractor', 1.6], ['truck', 0.8], ['deer', 1.2]]) {
            const ahead = fitAhead(k, car);
            if (ahead !== null) pool.push([k, w, ahead]);
          }
          let made = null;
          if (pool.length) {
            let tot = 0;
            for (const [, w] of pool) tot += w;
            let x = rng() * tot;
            for (const [k, w, ahead] of pool) {
              if ((x -= w) <= 0) {
                made = spawn(k, { car, ahead });
                break;
              }
            }
          }
          movingT = made ? R(...T.movingEvery) : 6;
        } else movingT = 10;
      }
      if (debrisT <= 0) {
        const k = rng() < 0.3 ? 'log' : 'branch';
        const ahead = fitAhead(k, car);
        const made = ahead === null ? null : spawn(k, { car, ahead });
        debrisT = made ? R(...T.debrisEvery) : 8;
      }

      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        h.t += dt;
        if (h.members && h.kind === 'deer') stepDeer(h, dt, car);
        else if (h.members) stepHerd(h, dt, car);
        else if (h.v) stepVehicle(h, dt, car);
        const d = Math.hypot(h.x - car.x, h.y - car.y);
        if (d > T.cleanupR || (h.kind === 'deer' && h.phase === 'gone' && d > 120)) remove(h);
      }

      // Traffic waits for animals and slow vehicles on the road.
      if (amb && amb.obstacles) {
        const ob = amb.obstacles;
        ob.length = 0;
        for (const a of animals) ob.push({ x: a.x, y: a.y, r: a.kind === 'cow' ? 0.9 : 0.5 });
        for (const v of vehicles) ob.push({ x: v.x, y: v.y, r: 1.4 });
      }
    },

    // Solid circles within `range` of (x, y), appended to `out` (collider.dynamic).
    pushSolids(x, y, range, out) {
      const r2 = range * range;
      const close = (px, py) => (px - x) * (px - x) + (py - y) * (py - y) < r2;
      for (const a of animals) {
        if (!close(a.x, a.y)) continue;
        if (a.kind === 'cow') {
          const fx = Math.sin(a.heading * DEG);
          const fy = -Math.cos(a.heading * DEG);
          out.push({ x: a.x + fx * 0.55, y: a.y + fy * 0.55, r: 0.6, kind: 'cow' });
          out.push({ x: a.x - fx * 0.55, y: a.y - fy * 0.55, r: 0.6, kind: 'cow' });
        } else out.push({ x: a.x, y: a.y, r: a.kind === 'deer' ? 0.45 : 0.5, kind: a.kind });
      }
      for (const v of vehicles) {
        if (!close(v.x, v.y)) continue;
        const fx = Math.sin(v.heading * DEG);
        const fy = -Math.cos(v.heading * DEG);
        const offs = v.kind === 'truck' ? [-1.5, 0, 1.5] : [-1.1, 0.2, 1.4];
        for (const o of offs) out.push({ x: v.x + fx * o, y: v.y + fy * o, r: v.kind === 'truck' ? 1.0 : 1.15, kind: v.kind });
      }
      for (const f of fallen) {
        if (Math.hypot(f.x - x, f.y - y) > range + f.extent) continue;
        for (const c of f.solids) out.push(c);
      }
    },

    // Debris near (x, y) for collider.surfaceDynamic.
    pushSurface(x, y, range, out) {
      for (const d of debris) if (Math.hypot(d.x - x, d.y - y) < range) out.push(d);
      for (const f of fallen) {
        if (Math.hypot(f.x - x, f.y - y) > range + f.extent) continue;
        for (const c of f.crown) out.push(c);
      }
    },

    spawn(kind, o = {}) {
      return spawn(kind, o);
    },

    honk,

    startle(x, y) {
      for (const h of list) {
        if (!h.members || Math.hypot(h.x - x, h.y - y) > 25) continue;
        if (h.kind === 'deer') h.phase = 'dash';
        else leave(h, { x, y });
      }
    },

    reset() {
      for (let i = list.length - 1; i >= 0; i--) remove(list[i]);
      movingT = R(...T.firstMoving);
      debrisT = R(...T.debrisEvery);
    },

    // Dev panel / checks.
    get timers() {
      return { moving: movingT, debris: debrisT };
    },
    fits(kind, x, y) {
      const q = roadAt(x, y, 12);
      return q ? fits(kind, at(q.r, q.s), q.r) : false;
    },
  };
  return hz;
}

export const HAZARD_TUNING = T;
