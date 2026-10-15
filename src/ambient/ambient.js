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

// Level of detail: things within NEAR_R of the player get full updates.
const NEAR_R = 600;
const COARSE_STEP = 1.0; // seconds between coarse updates for far flocks

const CAR_COLORS = [0xb03a2e, 0x2e5e8c, 0xe8e4d8, 0x3c6e47, 0x2b2b2e, 0xc9a227, 0x7d8a96, 0x6b3f2a, 0x8fb3c9, 0x9b2f4d];

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
    road: r, pts: r.points, cum: measurePolyline(r.points), len: 0, junctions: [], blocks: [],
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
  // Broken bridges: traffic turns around before them.
  for (const b of world.bridges) {
    if (b.intact) continue;
    const n = netById.get(b.roadId);
    if (!n) continue;
    const q = nearestOnPolyline(b.x, b.y, n.pts);
    if (q) n.blocks.push(q.along);
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
      if (n.blocks.some((b) => Math.abs(b - s) < 40)) continue;
      const p = roadPoint(n, s, {});
      if (rng() > townScore(p.x, p.y)) continue;
      if (filter && !filter(p)) continue;
      return { n, s, p };
    }
    return null;
  }
  function placeCar(c, cs, sp) {
    cs.n = sp.n;
    cs.s = sp.s;
    cs.dir = rng() < 0.5 ? 1 : -1;
    cs.seg = undefined;
    cs.skip = 0;
    const t = carTarget(cs);
    c.x = t.x;
    c.y = t.y;
    c.heading = t.h;
    c.speed = 0;
    c.onDirt = cs.n.road.type !== 'paved';
  }
  function carTarget(cs) {
    const p = roadPoint(cs.n, cs.s, cs);
    const dx = p.dx * cs.dir;
    const dy = p.dy * cs.dir;
    const off = cs.n.road.width / 4;
    // Right of travel (y south): (-dy, dx).
    return { x: p.x - dy * off, y: p.y + dx * off, h: headingOf(dx, dy) };
  }
  const nCars = 10;
  for (let i = 0; i < nCars; i++) {
    const c = { id: `car${i}`, x: 0, y: 0, heading: 0, speed: 0, color: CAR_COLORS[i % CAR_COLORS.length], onDirt: false };
    const cs = { n: null, s: 0, dir: 1, seg: 0, skip: 0, cruise: R(0.85, 1.1), relocT: R(10, 25) };
    const sp = pickSpawn();
    if (!sp) continue;
    placeCar(c, cs, sp);
    cars.push(c);
    carState.push(cs);
  }

  function chooseDirOn(n, at) {
    if (at < 5) return 1;
    if (at > n.len - 5) return -1;
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
    return townScore(p.x, p.y) * dead;
  }
  function turnOnto(cs, j) {
    cs.n = j.to;
    cs.s = j.toAt;
    cs.seg = undefined;
    cs.dir = chooseDirOn(j.to, j.toAt);
    cs.skip = 15;
  }

  function stepCar(c, cs, dt, player) {
    const n = cs.n;
    const surface = n.road.type === 'paved' ? 'paved' : 'dirt';
    c.onDirt = surface === 'dirt';
    let target = (surface === 'paved' ? 14 : 8.5) * cs.cruise;
    if (inTown(c.x, c.y)) target = Math.min(target, 9);

    // Stop when the player is close ahead (or very close anywhere).
    const fx = fwdX(c.heading);
    const fy = fwdY(c.heading);
    if (player) {
      const px = player.x - c.x;
      const py = player.y - c.y;
      const along = px * fx + py * fy;
      const lat = Math.abs(px * fy - py * fx);
      if (Math.hypot(px, py) < 6) target = 0;
      else if (along > 0 && along < 26 && lat < 5) target = Math.min(target, Math.max(0, (along - 9) * 0.6));
    }
    // Don't drive into other traffic going the same way.
    for (const o of cars) {
      if (o === c) continue;
      const ox = o.x - c.x;
      const oy = o.y - c.y;
      if (Math.abs(ox) > 30 || Math.abs(oy) > 30) continue;
      const along = ox * fx + oy * fy;
      const lat = Math.abs(ox * fy - oy * fx);
      if (along > 0 && along < 18 && lat < 2.5) target = Math.min(target, Math.max(0, (along - 8) * 0.8));
    }
    // Slow before a broken bridge or a road end.
    const endAt = cs.dir > 0 ? n.len : 0;
    const toEnd = Math.abs(endAt - cs.s);
    if (toEnd < 40) target = Math.min(target, 4 + toEnd * 0.2);
    for (const b of n.blocks) {
      const ahead = (b - cs.s) * cs.dir;
      if (ahead > 0 && ahead < 70) target = Math.min(target, 2.5 + (ahead - 25) * 0.25);
    }

    const acc = target > c.speed ? 2.2 : 5.5;
    c.speed += Math.max(-acc * dt, Math.min(acc * dt, target - c.speed));
    if (c.speed < 0.02 && target === 0) c.speed = 0;

    const prev = cs.s;
    cs.s += cs.dir * c.speed * dt;
    const moved = Math.abs(cs.s - prev);
    cs.skip = Math.max(0, cs.skip - moved);

    // Broken bridge ahead: U-turn.
    for (const b of n.blocks) {
      const ahead = (b - cs.s) * cs.dir;
      if (ahead > 0 && ahead < 25) {
        cs.dir = -cs.dir;
        cs.skip = 10;
        break;
      }
    }
    // Junctions passed this step.
    const atEnd = (cs.dir < 0 && cs.s <= 0.5) || (cs.dir > 0 && cs.s >= n.len - 0.5);
    if (atEnd || (cs.skip <= 0 && moved > 0)) {
      const lo = Math.min(prev, cs.s);
      const hi = Math.max(prev, cs.s);
      const passed = n.junctions.filter((j) => j.at > lo && j.at <= hi && j.at > 6 && j.at < n.len - 6);
      if (atEnd) {
        const here = n.junctions.filter((j) => Math.abs(j.at - (cs.dir > 0 ? n.len : 0)) < 6);
        if (here.length) {
          let tot = 0;
          const w = here.map((j) => (tot += junctionWeight(j)));
          const k = rng() * tot;
          turnOnto(cs, here[w.findIndex((v) => k < v)] || here[0]);
        } else {
          cs.dir = -cs.dir; // dead end: turn around
          cs.skip = 10;
        }
      } else if (passed.length) {
        const j = passed[0];
        if (rng() < 0.35 * Math.min(1.5, junctionWeight(j) / townScore(c.x, c.y))) turnOnto(cs, j);
      }
    }
    cs.s = Math.max(0, Math.min(cs.n.len, cs.s));

    // Smoothly follow the lane target (rounds corners and junction jumps).
    const t = carTarget(cs);
    const k = Math.min(1, dt * 6);
    const nx = c.x + (t.x - c.x) * k;
    const ny = c.y + (t.y - c.y) * k;
    const mdx = nx - c.x;
    const mdy = ny - c.y;
    if (mdx * mdx + mdy * mdy > 1e-4) c.heading = turnToward(c.heading, headingOf(mdx, mdy), 200 * dt);
    else c.heading = turnToward(c.heading, t.h, 90 * dt);
    c.x = nx;
    c.y = ny;
  }

  // Move far cars to roads near the player now and then, so traffic is seen.
  function maybeRelocate(c, cs, dt, player) {
    if (!player) return;
    cs.relocT -= dt;
    if (cs.relocT > 0) return;
    cs.relocT = R(15, 30);
    if (Math.hypot(c.x - player.x, c.y - player.y) < 1500) return;
    let nearby = 0;
    for (const o of cars) if (Math.hypot(o.x - player.x, o.y - player.y) < 1300) nearby++;
    if (nearby >= 3) return;
    const sp = pickSpawn((p) => {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      return d > 450 && d < 1200;
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
      const rr = t.r * R(0.15, 0.7);
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
    peopleState.set(l.id, { hx: l.x, hy: l.y, timer: R(3, 12), tx: l.x, ty: l.y, blds, idleH: p.heading });
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
  const windBase = 260 + rng() * 60;
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
    surfaceAt, // additive: road surface lookup
    time: 0,

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
      for (let i = 0; i < cars.length; i++) {
        stepCar(cars[i], carState[i], dt, player);
        maybeRelocate(cars[i], carState[i], dt, player);
        const c = cars[i];
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
        if ((p.x - px) ** 2 + (p.y - py) ** 2 < nearSq) stepPerson(p, peopleState.get(id), dt, player);
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
