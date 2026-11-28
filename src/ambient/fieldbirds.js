// Field flocks and birds on the wire (#97, SPEC 9s "birds lifting off").
// Engine-free, deterministic from the world seed, with its own random stream so
// the older tree birds in ambient.js are untouched.
//
//   createFieldBirds(world, { enabled }) -> { birds, flocks, early, step(dt, time, player, events) }
//
// Every bird has the shape ambient3d.js already draws: { id, x, y, z, heading,
// flying, flap }, with no perchTree, so z is metres above the ground. step()
// pushes a 'birds_scatter' event (the sound that already exists) when a flock lifts.
// Units: metres, seconds. Headings in degrees clockwise from north.

import { makeRng, pointInPolygon, bbox, headingOf, distToSegment, centroid } from '../drive/geom.js';
import { DUSTER } from '../world/duster.js';
import { crewFrame } from '../world/roadcrew.js';

// WHERE and HOW MUCH: the numbers a human may want to move.
export const FIELD_BIRDS = {
  liftDist: 40, // m: a field flock lifts when the car is this close to a bird...
  liftPerSpeed: 1.2, // ...plus this many metres per m/s of car speed
  wireDist: 22, // m: wire birds lift this close...
  wirePerSpeed: 0.6, // ...plus this per m/s
  roadReach: 160, // m: a field must have its middle this near a road
  minFieldArea: 4000, // m2
  fieldChance: 0.4, // share of the right-sized fields near roads that get a flock
  maxFieldFlocks: 16,
  wireChance: 0.1, // share of pole spans that get birds
  maxWireFlocks: 40,
  earlyAlong: [350, 800], // m along Highway 9: where the guaranteed flock may stand (the start is 110 m before 0)
  earlyAim: 520,
  keepClearDuster: 450, // m from the crop duster's road point
  keepClearCrew: 150, // m from the road crew
  flight: [15, 18], // s: a field flock's lift, swirl and settle
  cooldown: 12, // s a settled flock ignores the car
  farStep: 300, // m: resting flocks farther than this from the car are not updated
};

const SEAT = 0.17;
const ARM_UP = 7.9;
const POLE_TOP = 8.6 - 0.3;
const GROUND = 0.04; // a bird standing on the ground
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export function createFieldBirds(world, opts = {}) {
  const out = { birds: [], flocks: [], early: null, step() {} };
  if (opts.enabled === false) return out;
  const rng = makeRng(((world.seed ^ 0xb12d97) >>> 0) || 1);
  const R = (a, b) => a + rng() * (b - a);
  const C = FIELD_BIRDS;
  let id = 0;
  const newBird = (x, y, z, heading) => ({ id: `fb${id++}`, x, y, z, heading, flying: false, flap: 0, _phase: R(0, 10) });

  // ---------- where things are ----------
  const roads = world.roads || [];
  const roadDist = (x, y) => {
    let best = Infinity;
    for (const r of roads) for (let i = 1; i < r.points.length; i++) {
      const d = distToSegment(x, y, r.points[i - 1][0], r.points[i - 1][1], r.points[i][0], r.points[i][1]);
      if (d < best) best = d;
    }
    return best;
  };
  // Metres along a road to its nearest point to (x, y).
  const alongRoad = (road, x, y) => {
    let best = Infinity, acc = 0, at = 0;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, ay] = road.points[i - 1];
      const [bx, by] = road.points[i];
      const len = Math.hypot(bx - ax, by - ay);
      const d = distToSegment(x, y, ax, ay, bx, by);
      if (d < best) { best = d; const t = len ? ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len) : 0; at = acc + Math.max(0, Math.min(1, t)) * len; }
      acc += len;
    }
    return { d: best, along: at };
  };
  const crew = crewFrame(world);
  const clearOfShows = (x, y, pad = 0) =>
    Math.hypot(x - DUSTER.road.x, y - DUSTER.road.y) > C.keepClearDuster + pad &&
    (!crew || Math.hypot(x - crew.x, y - crew.y) > C.keepClearCrew + pad);
  const area = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a) / 2; };
  const inField = (f, x, y, inset = 0) => {
    if (!pointInPolygon(x, y, f.poly)) return false;
    if (!inset) return true;
    for (let i = 1; i <= f.poly.length; i++) {
      const a = f.poly[i - 1], b = f.poly[i % f.poly.length];
      if (distToSegment(x, y, a[0], a[1], b[0], b[1]) < inset) return false;
    }
    return true;
  };
  const spotIn = (f, near, rad) => {
    for (let k = 0; k < 40; k++) {
      let x, y;
      if (near) { const a = R(0, Math.PI * 2), r = rad * Math.sqrt(rng()); x = near[0] + Math.cos(a) * r; y = near[1] + Math.sin(a) * r; }
      else { x = R(f.bb.minX, f.bb.maxX); y = R(f.bb.minY, f.bb.maxY); }
      if (inField(f, x, y, 3)) return [x, y];
    }
    return near ? [near[0], near[1]] : centroid(f.poly);
  };

  // ---------- field flocks ----------
  const eligible = [];
  for (const fd of world.fields || []) {
    if (fd.animals || (fd.kind !== 'crop' && fd.kind !== 'pasture')) continue;
    if (area(fd.polygon) < C.minFieldArea) continue;
    const c = centroid(fd.polygon);
    if (!clearOfShows(c[0], c[1])) continue;
    if (roadDist(c[0], c[1]) > C.roadReach) continue;
    eligible.push({ kind: 'field', poly: fd.polygon, bb: bbox(fd.polygon), c, id: fd.id });
  }
  const hwy = roads.find((r) => r.id === 'hwy9');
  let earlyField = null;
  if (hwy) {
    let bestGap = Infinity;
    for (const f of eligible) {
      const a = alongRoad(hwy, f.c[0], f.c[1]);
      if (a.d > 120 || a.along < C.earlyAlong[0] || a.along > C.earlyAlong[1]) continue;
      const gap = Math.abs(a.along - C.earlyAim);
      if (gap < bestGap) { bestGap = gap; earlyField = f; }
    }
  }
  const chosen = eligible.filter((f) => f === earlyField || (rng() < C.fieldChance));
  if (earlyField) chosen.splice(chosen.indexOf(earlyField), 1), chosen.unshift(earlyField);
  for (const f of chosen.slice(0, C.maxFieldFlocks)) {
    const n = 20 + Math.floor(rng() * 21);
    const members = [];
    for (let k = 0; k < n; k++) {
      const [x, y] = spotIn(f, null);
      const b = newBird(x, y, GROUND, R(0, 360));
      b._hop = R(0.3, 3);
      members.push(b);
    }
    const fl = { kind: 'field', poly: f.poly, bb: f.bb, members, state: 'ground', cool: 0, t: 0 };
    out.flocks.push(fl);
    if (f === earlyField) out.early = fl;
  }

  // ---------- wire flocks ----------
  const spans = [];
  for (const line of world.powerLines || []) {
    const ps = line.poles || [];
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 32 || len > 70) continue;
      spans.push({ a, b, len, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
  }
  const makeWire = (sp) => {
    const dx = (sp.b.x - sp.a.x) / sp.len, dy = (sp.b.y - sp.a.y) / sp.len;
    const axis = [dx, dy];
    const side = [-dy, dx];
    const lx = [-1.1, 0, 1.1][Math.floor(rng() * 3)];
    const up = (lx === 0 ? POLE_TOP : ARM_UP) + SEAT;
    const sag = 0.025 * sp.len;
    const n = 6 + Math.floor(rng() * 10);
    const ts = [];
    for (let k = 0; k < 60 && ts.length < n; k++) {
      const t = R(0.12, 0.88);
      if (ts.every((u) => Math.abs(u - t) * sp.len >= 1.8)) ts.push(t);
    }
    const members = ts.map((t) => {
      const z = up - 4 * sag * t * (1 - t) + 0.02;
      const b = newBird(sp.a.x + dx * sp.len * t + side[0] * lx, sp.a.y + dy * sp.len * t + side[1] * lx, z, (headingOf(dx, dy) + (rng() < 0.5 ? 0 : 180)) % 360);
      b._home = [b.x, b.y, z];
      b._returns = rng() < 0.6;
      return b;
    });
    return { kind: 'wire', members, axis, side, mid: [sp.mx, sp.my], state: 'wire', cool: 0, t: 0 };
  };
  const wireSpans = [];
  const hwyLine = (world.powerLines || []).find((l) => l.roadId && l.roadId.startsWith('hwy9'));
  if (hwy && hwyLine) {
    const aim = (() => { // the road point at the early distance
      let acc = 0;
      for (let i = 1; i < hwy.points.length; i++) {
        const [ax, ay] = hwy.points[i - 1], [bx, by] = hwy.points[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (acc + len >= C.earlyAim) { const f = (C.earlyAim - acc) / len; return [ax + (bx - ax) * f, ay + (by - ay) * f]; }
        acc += len;
      }
      return null;
    })();
    if (aim) {
      let best = null, bd = Infinity;
      for (const sp of spans) {
        const d = Math.hypot(sp.mx - aim[0], sp.my - aim[1]);
        if (d < bd && d < 200 && clearOfShows(sp.mx, sp.my)) { bd = d; best = sp; }
      }
      if (best) wireSpans.push(best);
    }
  }
  for (const sp of spans) {
    if (wireSpans.length >= C.maxWireFlocks) break;
    if (!wireSpans.includes(sp) && rng() < C.wireChance && clearOfShows(sp.mx, sp.my)) wireSpans.push(sp);
  }
  for (const sp of wireSpans) out.flocks.push(makeWire(sp));
  for (const f of out.flocks) out.birds.push(...f.members);

  // ---------- stepping ----------
  const nearest = (f, p) => { let d = Infinity; for (const b of f.members) { const e = Math.hypot(b.x - p.x, b.y - p.y); if (e < d) d = e; } return d; };
  const faceMove = (b, nx, ny) => { const dx = nx - b.x, dy = ny - b.y; if (dx * dx + dy * dy > 1e-4) b.heading = headingOf(dx, dy); b.x = nx; b.y = ny; };

  function liftField(f, p, events) {
    const n = f.members.length;
    const S = [f.members.reduce((a, b) => a + b.x, 0) / n, f.members.reduce((a, b) => a + b.y, 0) / n];
    // Settle spot: well away from here, across the field, and not toward the car.
    let D = S, bestScore = -Infinity;
    for (let k = 0; k < 30; k++) {
      const c = spotIn(f, null);
      const away = Math.hypot(c[0] - S[0], c[1] - S[1]);
      const score = Math.min(away, 70) + 0.5 * Math.hypot(c[0] - p.x, c[1] - p.y) - (away < 30 ? 200 : 0);
      if (score > bestScore) { bestScore = score; D = c; }
    }
    const dir = rng() < 0.5 ? 1 : -1;
    const dists = f.members.map((b) => Math.hypot(b.x - p.x, b.y - p.y));
    const dmin = Math.min(...dists);
    f.fl = { S, D, T: R(C.flight[0], C.flight[1]), dir, birds: f.members.map((b, i) => ({
      q: [b.x - S[0], b.y - S[1]], x0: b.x, y0: b.y,
      r: R(5, 16), phi: R(0, Math.PI * 2), w: dir * R(0.7, 1.1) * R(0.85, 1.15), alt: R(5, 16),
      delay: (dists[i] - dmin) * 0.05 + R(0, 0.3), land: spotIn(f, D, 9), done: false })) };
    f.state = 'fly';
    f.t = 0;
    events.push({ type: 'birds_scatter', x: S[0], y: S[1] });
  }
  function flyField(f, dt, time) {
    f.t += dt;
    const { S, D, T, birds } = f.fl;
    let left = 0;
    f.members.forEach((b, i) => {
      const s = f.t - birds[i].delay;
      const k = birds[i];
      if (s < 0) { left++; return; }
      if (s >= T) { if (!k.done) { k.done = true; b.flying = false; b.x = k.land[0]; b.y = k.land[1]; b.z = GROUND; b.flap = 0; } return; }
      left++;
      b.flying = true;
      const e1 = smooth(s / 3), e2 = smooth((s - (T - 4.5)) / 4.5);
      const cu = smooth(s / T);
      const a = k.phi + k.w * s;
      const ox = k.q[0] * (1 - e1) + k.r * Math.cos(a) * e1;
      const oy = k.q[1] * (1 - e1) + k.r * Math.sin(a) * e1;
      const nx = S[0] + (D[0] - S[0]) * cu + ox * (1 - e2) + (k.land[0] - D[0]) * e2;
      const ny = S[1] + (D[1] - S[1]) * cu + oy * (1 - e2) + (k.land[1] - D[1]) * e2;
      b.z = GROUND + (k.alt + 0.9 * Math.sin(time * 1.3 + b._phase)) * e1 * (1 - e2);
      if (b.z < GROUND) b.z = GROUND;
      b.flap = 0.5 + 0.5 * Math.sin(time * 22 + b._phase);
      faceMove(b, nx, ny);
    });
    if (!left) { f.state = 'ground'; f.cool = C.cooldown; f.fl = null; }
  }
  function groundField(f, dt, time) {
    for (const b of f.members) {
      b._hop -= dt;
      if (b._hopT > 0) {
        b._hopT -= dt;
        const u = 1 - Math.max(0, b._hopT) / 0.25;
        b.z = GROUND + 0.3 * Math.sin(Math.PI * u);
        b.flap = 0.5 + 0.5 * Math.sin(time * 30 + b._phase);
        if (b._hopT <= 0) { b.z = GROUND; b.flap = 0; }
      } else if (b._hop <= 0) {
        b._hop = R(0.6, 3);
        b.heading = (b.heading + R(-90, 90) + 360) % 360;
        if (rng() < 0.55) {
          const d = R(0.4, 1.5);
          const nx = b.x + Math.sin(b.heading * Math.PI / 180) * d, ny = b.y - Math.cos(b.heading * Math.PI / 180) * d;
          if (pointInPolygon(nx, ny, f.poly)) { b.x = nx; b.y = ny; b._hopT = 0.25; }
        }
      }
    }
  }

  function liftWire(f, p, events) {
    const m = f.mid;
    const sgn = (p.x - m[0]) * f.side[0] + (p.y - m[1]) * f.side[1];
    const away = Math.abs(sgn) < 4 ? (f.members.length % 2 ? 1 : -1) : sgn > 0 ? -1 : 1;
    const n = [f.side[0] * away, f.side[1] * away];
    const loopDir = rng() < 0.5 ? 1 : -1;
    f.fl = { n, birds: f.members.map((b) => ({ r: R(7, 13), alt: R(3, 9), T: R(6.5, 8.5), delay: R(0, 0.6), dir: loopDir, ret: b._returns, land: null, done: false })) };
    f.members.forEach((b, i) => {
      const k = f.fl.birds[i];
      k.x0 = b._home[0]; k.y0 = b._home[1]; k.z0 = b._home[2];
      // The ones that stay out come down on the ground out in the field.
      if (!k.ret) k.land = [k.x0 + n[0] * k.r * 2 + R(-2, 2), k.y0 + n[1] * k.r * 2 + R(-2, 2)];
    });
    f.state = 'fly';
    f.t = 0;
    events.push({ type: 'birds_scatter', x: m[0], y: m[1] });
  }
  function flyWire(f, dt, time) {
    f.t += dt;
    const { n, birds } = f.fl;
    let left = 0;
    f.members.forEach((b, i) => {
      const k = birds[i];
      const s = f.t - k.delay;
      if (s < 0) { left++; return; }
      if (s >= k.T) {
        if (!k.done) {
          k.done = true; b.flying = false; b.flap = 0;
          if (k.ret) { b.x = k.x0; b.y = k.y0; b.z = k.z0; } else { b.x = k.land[0]; b.y = k.land[1]; b.z = GROUND; }
        }
        return;
      }
      left++;
      b.flying = true;
      const u = smooth(s / k.T);
      const alpha = (k.ret ? 2 * Math.PI : Math.PI) * u;
      // A circle through the perch, leaning out over the field.
      const along = [f.axis[0] * k.dir, f.axis[1] * k.dir];
      const cx = k.x0 + n[0] * k.r, cy = k.y0 + n[1] * k.r;
      const nx = cx - n[0] * k.r * Math.cos(alpha) + along[0] * k.r * Math.sin(alpha);
      const ny = cy - n[1] * k.r * Math.cos(alpha) + along[1] * k.r * Math.sin(alpha);
      const dz = k.ret ? 0 : (GROUND - k.z0) * smooth(u * 1.15);
      b.z = Math.max(GROUND, k.z0 + dz + k.alt * Math.sin(Math.PI * u));
      b.flap = 0.5 + 0.5 * Math.sin(time * 22 + b._phase);
      faceMove(b, nx, ny);
    });
    if (!left) { f.state = 'rest'; f.cool = C.cooldown; f.fl = null; f.restT = 0; }
  }
  function restWire(f, dt, p) {
    f.restT = (f.restT || 0) + dt;
    if (nearest(f, p) > 100 && f.restT > 20) {
      for (const b of f.members) { b.x = b._home[0]; b.y = b._home[1]; b.z = b._home[2]; b.flying = false; }
      f.state = 'wire';
    }
  }

  out.step = (dt, time, player, events) => {
    if (!player) return;
    const speed = Math.abs(player.speed || 0);
    for (const f of out.flocks) {
      f.cool = Math.max(0, f.cool - dt);
      if (f.state === 'fly') { f.kind === 'field' ? flyField(f, dt, time) : flyWire(f, dt, time); continue; }
      const d = nearest(f, player);
      if (f.kind === 'field') {
        if (d > C.farStep) continue;
        if (f.cool <= 0 && d < C.liftDist + speed * C.liftPerSpeed) { liftField(f, player, events); continue; }
        groundField(f, dt, time);
      } else if (f.state === 'wire') {
        if (f.cool <= 0 && d < C.wireDist + speed * C.wirePerSpeed) liftWire(f, player, events);
      } else restWire(f, dt, player);
    }
  };
  return out;
}
