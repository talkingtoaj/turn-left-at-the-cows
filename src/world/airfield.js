// A small country airfield (landmark kind 'airfield'): its layout, the wind
// it uses, and the light planes flying circuits from it. Engine-free and
// deterministic: the same seed and the same time always give the same
// planes in the same places (src3/world3d/planes3d.js draws them, the audio
// plays them).
//
// Layout is in runway coordinates: s along the runway axis (the landmark's
// `angle`, a heading), t to the right of it; (0, 0) is the runway centre.
//
// The wind (from the seed): mostly westerly. Planes take off and land into
// it, so it picks the runway direction in use, and the ambient wind
// (smoke, the windsock) blows the same way (world.windBase, set here).
//
// The circuit (all turns to one side, `circuit[heading]` 'left' | 'right'):
//   take-off roll and climb straight out past the far end of the runway,
//   crosswind turn, downwind leg parallel to the runway `offset` metres to
//   the side at 250 m, base turn, final approach, landing, roll-out. Some
//   circuits are touch-and-goes; some take-offs depart and curve away out
//   of the area, and come back later from far off to join the circuit.

import { makeRng, hashString } from '../drive/geom.js';

const DEG = Math.PI / 180;
const G = 9.81;

// ---------------------------------------------------------------- layout

// Parked planes, stands and the rest, in runway coordinates (s, t, heading
// relative to the runway axis). The apron and hangars are on the right (+t).
export const AIRFIELD = {
  windsock: { s: -120, t: 34 },
  pump: { s: 140, t: 63, w: 1.2, h: 0.8 },
  pumpPad: { s: 140, t: 63, w: 5, h: 4 },
  apron: { s: 85, t: 46, w: 210, h: 34 },
  carPark: { s: 22, t: 110, w: 34, h: 22 },
  // Static parked planes (color: stripe colour).
  parked: [
    { s: 22, t: 44, h: -12, color: 0x2d5aa8, kind: 'high' },
    { s: 50, t: 45, h: -4, color: 0xc0392b, kind: 'high' },
    { s: 168, t: 48, h: 20, color: 0x2f7a43, kind: 'low' },
  ],
  // Where the two flying planes park between flights.
  stands: [
    { s: 85, t: 44, h: 0 },
    { s: 118, t: 44, h: 0 },
  ],
  // Fuselage collision circles of a parked plane (offsets along its nose).
  planeHits: [{ f: 2.2, r: 0.8 }, { f: 0, r: 0.9 }, { f: -2.4, r: 0.7 }, { f: -4.6, r: 0.5 }],
};

// World frame of an airfield landmark.
export function airfieldFrame(l) {
  const a = (l.angle || 0) * DEG;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const rx = -uy; // right of the axis (y grows south)
  const ry = ux;
  return {
    x: l.x, y: l.y, angle: l.angle || 0, ux, uy, rx, ry,
    length: (l.runway && l.runway.length) || 800,
    width: (l.runway && l.runway.width) || 30,
    // runway (s, t) -> world { x, y }
    at(s, t) {
      return { x: l.x + ux * s + rx * t, y: l.y + uy * s + ry * t };
    },
    // world -> runway { s, t }
    local(x, y) {
      const dx = x - l.x;
      const dy = y - l.y;
      return { s: dx * ux + dy * uy, t: dx * rx + dy * ry };
    },
    heading: (h) => ((l.angle || 0) + h + 360) % 360,
  };
}

// The airfield landmark of a world, or null.
export const airfieldOf = (world) => (world.landmarks || []).find((l) => l.kind === 'airfield') || null;

// Wind for a world with an airfield: the direction it comes FROM (heading,
// degrees), picked from the seed, mostly westerly. The ambient wind blows
// toward windFrom + 180 (its `dir`).
export function seededWindFrom(seed) {
  const rng = makeRng(hashString(`wind:${seed}`));
  const westerly = rng() < 0.68;
  return Math.round((westerly ? 245 : 65) + rng() * 50);
}

// ---------------------------------------------------------------- flight paths

// A path built like a turtle: straight runs and turns, each with target
// altitude (m above the runway), speed (m/s) and throttle (0..1) reached
// smoothly by its end. Samples every few metres, each with its time.
class Path {
  constructor(x, y, heading, alt = 0, v = 0, throttle = 0, ground = true) {
    this.p = [];
    this.x = x;
    this.y = y;
    this.h = heading;
    this.alt = alt;
    this.v = v;
    this.th = throttle;
    this.ground = ground;
    this.t = 0;
    this.push();
  }

  push() {
    this.p.push({ t: this.t, x: this.x, y: this.y, h: this.h, alt: this.alt, v: this.v, th: this.th, g: this.ground });
  }

  // Moves `len` metres while the heading turns by `turn` degrees (0 = straight).
  run(len, turn, { alt = this.alt, v = this.v, th = this.th, ground = this.ground } = {}) {
    const n = Math.max(1, Math.ceil(len / (ground ? 3 : 12)));
    const a0 = this.alt;
    const v0 = this.v;
    const th0 = this.th;
    const h0 = this.h;
    const ds = len / n;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const e = k * k * (3 - 2 * k);
      const hm = h0 + turn * (k - 0.5 / n);
      const vPrev = this.v;
      this.x += Math.sin(hm * DEG) * ds;
      this.y -= Math.cos(hm * DEG) * ds;
      this.h = h0 + turn * k;
      this.alt = a0 + (alt - a0) * e;
      this.v = v0 + (v - v0) * k;
      this.th = th0 + (th - th0) * Math.min(1, k * 3);
      this.ground = ground;
      this.t += ds / Math.max(0.6, (vPrev + this.v) / 2);
      this.push();
    }
    return this;
  }

  straight(len, o) {
    return this.run(len, 0, o);
  }

  // Turn by `deg` (positive right) on a circle of radius r.
  turn(deg, r, o) {
    return this.run((Math.abs(deg) * DEG) * r, deg, o);
  }

  hold(seconds, th = this.th) {
    this.t += seconds;
    this.th = th;
    this.v = 0;
    this.push();
    return this;
  }

  // Turn toward (x, y) on radius r, then go straight to it.
  goTo(x, y, r, o = {}) {
    const want = (Math.atan2(x - this.x, -(y - this.y)) / DEG + 360) % 360;
    let d = ((want - this.h + 540) % 360) - 180;
    if (Math.abs(d) > 0.5) this.turn(d, r, { ...o, alt: this.alt + ((o.alt ?? this.alt) - this.alt) * 0.2 });
    const left = Math.hypot(x - this.x, y - this.y);
    if (left > 0.5) {
      const want2 = (Math.atan2(x - this.x, -(y - this.y)) / DEG + 360) % 360;
      d = ((want2 - this.h + 540) % 360) - 180;
      this.run(left, d, o);
    }
    return this;
  }
}

// Speeds (m/s) and heights (m) of a light single (a Cessna 152/172, a Cub).
const V = { rotate: 27, climb: 33, cruise: 46, base: 36, final: 31, touch: 27, taxi: 8 };
const H = { circuit: 250, depart: 600 };

// Everything one airfield's planes fly, as Path builders in world space.
function circuitGeometry(world, l) {
  const f = airfieldFrame(l);
  const windFrom = world.windFrom ?? seededWindFrom(world.seed);
  // Landing heading: the runway direction closest to into the wind.
  const d0 = Math.abs(((windFrom - f.angle + 540) % 360) - 180);
  const land = d0 <= 90 ? f.angle : (f.angle + 180) % 360;
  const dir = land === f.angle ? 1 : -1; // landing along +s or -s
  const c = l.circuit || {};
  const side = (c[land] || c[String(land)] || 'left') === 'left' ? -1 : 1; // turn sign
  const offset = c.offset || 850;
  const L = f.length;
  // Landing-direction frame: S along the landing heading from the threshold,
  // T to the right of it.
  const thr = f.at(-dir * L / 2, 0);
  const lh = land * DEG;
  const ux = Math.sin(lh);
  const uy = -Math.cos(lh);
  const at = (S, T) => ({ x: thr.x + ux * S - uy * T, y: thr.y + uy * S + ux * T });
  const toLand = (p) => ({ S: (p.x - thr.x) * ux + (p.y - thr.y) * uy, T: -(p.x - thr.x) * uy + (p.y - thr.y) * ux });
  return { f, land, side, offset, L, at, toLand, windFrom, thr };
}

// Circuit legs from the current point of `p` (airborne, climbing out along
// the landing heading) round to touchdown. `climbTo`: height at the turn.
function flyCircuit(p, g, climbTo = 130) {
  const R = 300;
  const s = g.side;
  const lat = g.offset;
  // Climb out to S = L + 450, then crosswind.
  const here = g.toLand(p);
  p.straight(Math.max(50, g.L + 450 - here.S), { alt: climbTo, v: V.climb, th: 1, ground: false });
  p.turn(90 * s, R, { alt: climbTo + 50, v: V.climb, th: 0.95 });
  p.straight(Math.max(50, lat - 2 * R), { alt: H.circuit - 20, v: 40, th: 0.85 });
  p.turn(90 * s, R, { alt: H.circuit, v: V.cruise, th: 0.68 });
  return finishFromDownwind(p, g);
}

// Take-off from standing on the threshold.
function takeOff(p, g) {
  p.straight(320, { alt: 0, v: V.rotate, th: 1, ground: true });
  p.straight(260, { alt: 25, v: V.climb, th: 1, ground: false });
  return p;
}

// After touchdown: a touch-and-go (power up, off again).
function touchAndGo(p) {
  p.straight(220, { alt: 0, v: 23, th: 0.15, ground: true });
  p.straight(240, { alt: 0, v: V.rotate, th: 1, ground: true });
  p.straight(200, { alt: 20, v: V.climb, th: 1, ground: false });
  return p;
}

// From a stand to the threshold, facing the landing heading, ready to go.
function taxiOut(g, stand) {
  const sp = g.f.at(stand.s, stand.t);
  const p = new Path(sp.x, sp.y, g.f.heading(stand.h ?? 0), 0, 0, 0.15, true);
  p.hold(4, 0.2);
  const entry = g.f.at(stand.s, 0);
  p.goTo(entry.x, entry.y, 9, { v: V.taxi, th: 0.2 });
  // Backtrack along the runway to the threshold, turn round.
  const back = g.at(25, 0);
  p.goTo(back.x, back.y, 9, { v: V.taxi, th: 0.2 });
  // Line up a little left of the centreline: the U-turn (to the left, facing
  // back down the runway) ends just right of it.
  const t0 = g.at(-6, -4);
  p.goTo(t0.x, t0.y, 6, { v: 3, th: 0.18 });
  p.turn(((g.land - p.h + 540) % 360) - 180, 4, { v: 3, th: 0.2 });
  p.hold(18, 0.45); // run-up checks
  return p;
}

// After a full-stop landing: roll out, turn off and taxi to the stand.
function rollOutAndPark(p, g, stand) {
  const tl = g.toLand(p);
  const entry = g.f.at(stand.s, 0);
  const eL = g.toLand(entry);
  const runTo = Math.max(eL.S, tl.S + 260);
  const slow = g.at(runTo, 0);
  p.goTo(slow.x, slow.y, 9, { v: V.taxi, th: 0.05, ground: true });
  if (eL.S < runTo) p.goTo(entry.x, entry.y, 9, { v: V.taxi, th: 0.2 }); // backtrack to the turn-off
  const sp = g.f.at(stand.s, stand.t);
  p.goTo(sp.x, sp.y, 9, { v: 4, th: 0.2 });
  p.turn(((g.f.heading(stand.h ?? 0) - p.h + 540) % 360) - 180, 6, { v: 2, th: 0.15 });
  p.hold(6, 0);
  return p;
}

// Depart: climb out and curve away, out of the area.
function depart(p, g, rng) {
  const here = g.toLand(p);
  p.straight(Math.max(50, g.L + 300 - here.S), { alt: 140, v: V.climb, th: 1, ground: false });
  const turn = (rng() < 0.5 ? -1 : 1) * (40 + rng() * 110);
  p.turn(turn, 450, { alt: 320, v: 40, th: 0.95 });
  p.straight(7000, { alt: H.depart, v: V.cruise + 4, th: 0.8 });
  return p;
}

// Arrive from far off and join the downwind leg.
function arrive(g, rng) {
  const join = g.at(g.L + 400, g.side * g.offset);
  const bearing = rng() * 360;
  const start = { x: join.x + Math.sin(bearing * DEG) * 7000, y: join.y - Math.cos(bearing * DEG) * 7000 };
  const p = new Path(start.x, start.y, (bearing + 180) % 360, H.depart, V.cruise + 4, 0.75, false);
  p.goTo(join.x, join.y, 500, { alt: H.circuit + 30, v: V.cruise, th: 0.65 });
  const want = (g.land + 180) % 360;
  p.turn(((want - p.h + 540) % 360) - 180, 300, { alt: H.circuit, v: V.cruise, th: 0.62 });
  return p;
}

// From the downwind leg (after a circuit's crosswind, or joining from far
// off): downwind on past the threshold, base, final, touchdown at S = 120.
function finishFromDownwind(p, g) {
  const s = g.side;
  const d = g.toLand(p);
  // Downwind to S = -980 (abeam the threshold, then on).
  p.straight(Math.max(100, d.S - -980), { alt: H.circuit, v: V.cruise, th: 0.62 });
  // Base: power back, descend. Its length takes up whatever lateral
  // distance there really is, so the final turn ends on the centreline.
  p.turn(90 * s, 280, { alt: 190, v: V.base, th: 0.3 });
  const lat = Math.abs(g.toLand(p).T);
  p.straight(Math.max(40, lat - 280), { alt: 150, v: V.base, th: 0.28 });
  p.turn(90 * s, 280, { alt: 95, v: V.final, th: 0.25 });
  const tdn = g.at(120, 0);
  p.goTo(tdn.x, tdn.y, 400, { alt: 0, v: V.touch, th: 0.12, ground: false });
  p.ground = true;
  p.alt = 0;
  p.push();
  return p;
}

// ---------------------------------------------------------------- schedule

// Each plane's day as a list of segments { t0, t1, kind, path | at }:
//   'parked' at its stand (engine off), 'fly' along a path, 'away' (gone).
// Plane 0 flies most of the time; plane 1 mostly sits and sometimes joins.
function makeSchedule(world, l, g, idx) {
  const rng = makeRng(hashString(`planes:${world.seed}:${idx}`));
  const stand = AIRFIELD.stands[idx];
  const sp = g.f.at(stand.s, stand.t);
  const parkedAt = { x: sp.x, y: sp.y, h: g.f.heading(stand.h ?? 0) };
  const segs = [];
  let t = idx === 0 ? -rng() * 400 : -rng() * 1500;
  const add = (kind, dur, extra) => {
    segs.push({ kind, t0: t, t1: t + dur, ...extra });
    t += dur;
  };
  const flight = (path) => add('fly', path.t, { path: path.p });
  return {
    segs,
    // Extend the schedule until it covers time T.
    cover(T) {
      while (t <= T + 1) {
        const busy = idx === 0 ? 0.9 : 0.3;
        if (rng() > busy) {
          add('parked', (idx === 0 ? 60 : 400) + rng() * (idx === 0 ? 120 : 900), { at: parkedAt });
          continue;
        }
        add('parked', 15 + rng() * 40, { at: parkedAt });
        // A session: taxi out, take off, circuits or a departure, back to park.
        const p = taxiOut(g, stand);
        takeOff(p, g);
        if (rng() < 0.22) {
          // Departure: curve away out of the area, gone a while, come back.
          depart(p, g, rng);
          flight(p);
          add('away', 240 + rng() * 900);
          const a = arrive(g, rng);
          finishFromDownwind(a, g);
          rollOutAndPark(a, g, stand);
          flight(a);
        } else {
          const n = idx === 0 ? 3 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 2);
          for (let i = 0; i < n; i++) {
            flyCircuit(p, g, i === 0 ? 130 : 110);
            if (i < n - 1) touchAndGo(p);
          }
          rollOutAndPark(p, g, stand);
          flight(p);
        }
      }
    },
  };
}

// Interpolated state on a path at local time u.
function sampleAt(path, u, out) {
  let lo = 0;
  let hi = path.length - 1;
  if (u <= path[0].t) return copyState(path[0], path[0], 0, out);
  if (u >= path[hi].t) return copyState(path[hi], path[hi], 0, out);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= u) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const k = b.t > a.t ? (u - a.t) / (b.t - a.t) : 0;
  copyState(a, b, k, out);
  // Bank from the rate of turn; pitch from the climb (plus a little nose up in the air).
  const dt = Math.max(0.05, b.t - a.t);
  const turnRate = ((((b.h - a.h + 540) % 360) - 180) * DEG) / dt;
  out.bank = out.ground ? 0 : Math.max(-0.6, Math.min(0.6, Math.atan((out.v * turnRate) / G)));
  const ds = Math.max(0.1, Math.hypot(b.x - a.x, b.y - a.y));
  out.pitch = out.ground ? 0 : Math.atan2(b.alt - a.alt, ds) + 0.05;
  // Velocity (m/s, world x, y and up), for the Doppler shift.
  out.vx = (b.x - a.x) / dt;
  out.vy = (b.y - a.y) / dt;
  out.vz = (b.alt - a.alt) / dt;
  return out;
}

function copyState(a, b, k, out) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  const dh = ((b.h - a.h + 540) % 360) - 180;
  out.heading = (a.h + dh * k + 360) % 360;
  out.alt = a.alt + (b.alt - a.alt) * k;
  out.v = a.v + (b.v - a.v) * k;
  out.throttle = a.th + (b.th - a.th) * k;
  out.ground = k < 0.5 ? a.g : b.g;
  out.bank = 0;
  out.pitch = 0;
  out.vx = 0;
  out.vy = 0;
  out.vz = 0;
  return out;
}

const cache = new WeakMap();

// The airfield's planes for a world (null if it has none):
//   { field: frame, land (landing heading), windFrom, side, offset, count,
//     at(i, T, out) -> state of plane i at time T (seconds):
//       { visible, engine, x, y, alt, heading, bank, pitch, v, vx, vy, vz,
//         throttle (0..1), ground } }
export function planesFor(world) {
  if (cache.has(world)) return cache.get(world);
  const l = airfieldOf(world);
  if (!l) {
    cache.set(world, null);
    return null;
  }
  const g = circuitGeometry(world, l);
  const scheds = AIRFIELD.stands.map((_, i) => makeSchedule(world, l, g, i));
  const out = {
    landmark: l,
    field: g.f,
    land: g.land,
    windFrom: g.windFrom,
    side: g.side,
    offset: g.offset,
    count: scheds.length,
    // A whole circuit as points (for the review map): take-off to touchdown.
    circuitPath() {
      const p = new Path(g.thr.x, g.thr.y, g.land, 0, 0, 1, true);
      takeOff(p, g);
      flyCircuit(p, g);
      return p.p;
    },
    at(i, T, o = {}) {
      const s = scheds[i];
      s.cover(T);
      // Segments are in time order; find the one holding T.
      let seg = null;
      for (let k = s.segs.length - 1; k >= 0; k--) {
        if (s.segs[k].t0 <= T) {
          seg = s.segs[k];
          break;
        }
      }
      if (!seg || seg.kind === 'away') {
        o.visible = false;
        o.engine = false;
        return o;
      }
      if (seg.kind === 'parked') {
        copyState({ x: seg.at.x, y: seg.at.y, h: seg.at.h, alt: 0, v: 0, th: 0, g: true }, { x: seg.at.x, y: seg.at.y, h: seg.at.h, alt: 0, v: 0, th: 0, g: true }, 0, o);
        o.visible = true;
        o.engine = false;
        return o;
      }
      sampleAt(seg.path, T - seg.t0, o);
      o.visible = true;
      o.engine = true;
      // Gone over the horizon on a departure (or not yet in sight arriving).
      if (Math.hypot(o.x - l.x, o.y - l.y) > 6500) o.visible = false;
      return o;
    },
  };
  cache.set(world, out);
  return out;
}
