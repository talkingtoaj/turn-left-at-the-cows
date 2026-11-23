// The farm dog (#68, SPEC 9r): Okafor's collie runs along its own fence,
// barking, as you pass, and stops at the end of its yard. Pure logic, no
// three.js: src/ambient/ambient.js steps it each frame, src3 draws it with
// the herd meshes (ambient3d.js) and the fence (dog3d.js), the collider gets
// the fence posts, and tools/check-dog.mjs tests it.
//
// The dog lives on a line 1.3 m inside the fence, so it can never reach the
// road: its whole run is checked to stay well clear of every road edge.

import { hashString } from '../drive/geom.js';

// Speeds in m/s, distances in m, times in s.
export const DOG = {
  run: 8.5, // flat-out gallop (a collie can do more, but it has a short yard)
  accel: 16, // how fast it gets up to speed or stops
  trot: 2.2, // going back to its spot by the gate
  notice: 60, // a car or walker this close to the fence gets chased
  giveUp: 5, // seconds it barks after you from where it lost you, before it trots home
  inset: 1.3, // its line inside the fence
  endGap: 1.6, // how close it gets to the corner posts
  stride: 1.7, // metres per gallop cycle
  postStep: 2.6, // fence post spacing (a rail fence, like layout.js FENCE.railStep)
  postR: 0.4, // collider circle per post (layout.js FENCE.postR)
};

// One dog per farm that has one. fence: the front fence along the road,
// west end first (the yard is on its right as you walk it). returns: short
// legs off each end, back into the yard (drawn and solid, not run along).
// gate: metres along the fence where the gate's middle is (by Ade's spot).
// home: where it lies when nobody is about.
export const FARM_DOGS = [
  {
    id: 'okafor_collie',
    farm: 'okafor',
    fence: [[4793, 2053], [4838, 2040], [4870, 2026], [4890, 2011], [4903, 1997], [4913, 1980], [4921, 1963], [4926, 1944]],
    returns: [[[4793, 2053], [4795, 2061]], [[4926, 1944], [4934, 1946]]],
    gate: 113,
    home: 118,
  },
];

// The dogs in this world (their farm has buildings here).
export function farmDogsIn(world) {
  return FARM_DOGS.filter((d) => world.buildings.some((b) => b.farm === d.farm));
}

// ---------- the fence as a line ----------

const lines = new WeakMap();
// { pts, cum, len }: cumulative length at each point.
export function fenceLine(dog) {
  let L = lines.get(dog);
  if (L) return L;
  const pts = dog.fence;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  L = { pts, cum, len: cum[cum.length - 1] };
  lines.set(dog, L);
  return L;
}

// The point s m along the line: { x, y, dx, dy } (dx, dy: unit direction).
export function pointAt(line, s) {
  const { pts, cum } = line;
  s = Math.max(0, Math.min(line.len, s));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const [ax, ay] = pts[i - 1];
  const [bx, by] = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / seg;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, dx: (bx - ax) / seg, dy: (by - ay) / seg };
}

// Nearest point on the line to (x, y): { s, d } (d: distance).
export function project(line, x, y) {
  const { pts, cum } = line;
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const vx = bx - ax;
    const vy = by - ay;
    const L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
    const d = Math.hypot(ax + vx * t - x, ay + vy * t - y);
    if (d < best.d) best = { s: cum[i - 1] + t * (cum[i] - cum[i - 1]), d };
  }
  return best;
}

// Where the dog stands for s m along its run: inside the fence.
export function runPoint(dog, s) {
  const p = pointAt(fenceLine(dog), s);
  return { x: p.x - p.dy * DOG.inset, y: p.y + p.dx * DOG.inset, dx: p.dx, dy: p.dy };
}

// The ends of its run (it stops this short of the corner posts).
export function runSpan(dog) {
  return [DOG.endGap, fenceLine(dog).len - DOG.endGap];
}

// Fence posts every DOG.postStep m along the fence and the return legs,
// [[{ x, y }, ...], ...], one run per line. The renderer and collider share them.
export function fencePosts(dog) {
  const runs = [];
  const along = (pts) => {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / DOG.postStep));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n });
    }
    return out;
  };
  runs.push(along(dog.fence));
  for (const r of dog.returns || []) runs.push(along(r));
  return runs;
}

// Its doghouse: 3.2 m back from its spot, door to the road. { x, y, angle }
// (angle: the heading the door faces), about 1 x 1.2 m.
export function doghouseSpot(dog) {
  const p = runPoint(dog, dog.home);
  return { x: p.x - p.dy * 3.2, y: p.y + p.dx * 3.2, angle: (Math.atan2(p.dy, p.dx) * 180) / Math.PI };
}

// Collider shapes for every farm dog's fence (posts, as field fences have)
// and doghouse in this world.
export function dogFenceSolids(world) {
  const circles = [];
  for (const dog of farmDogsIn(world)) {
    for (const run of fencePosts(dog)) for (const p of run) circles.push({ x: p.x, y: p.y, r: DOG.postR, kind: 'fence' });
    const h = doghouseSpot(dog);
    circles.push({ x: h.x, y: h.y, r: 0.65, kind: 'prop' });
  }
  return { rects: [], circles };
}

// ---------- the chase ----------

// A stable 0..1 number for the dog's n-th bark gap.
const unit = (id, n) => (hashString(`${id}:${n}`) % 10000) / 10000;

// Heading in degrees (0 north, clockwise) of the direction (dx, dy).
const headingOf = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

// The dog at its spot, lying down.
export function dogStart(dog) {
  const p = runPoint(dog, dog.home);
  return {
    s: dog.home, // metres along the fence
    v: 0, // m/s along the fence (+ toward the far end)
    mode: 'rest', // 'rest' | 'chase' | 'home'
    calm: DOG.giveUp, // seconds since it last saw you
    barkT: 0, // seconds to its next bark
    barks: 0, // barks this step (for the sound)
    n: 0, // barks so far (seeds the gaps)
    phase: 0, // gallop cycle
    heading: headingOf(p.dy, -p.dx), // facing the road
    ps: null, // your last spot along the fence (to lead you)
    goal: dog.home, // where it's running to
  };
}

// One step. player: { x, y } (the car, or you on foot). Returns the next
// state (the old one is left alone).
export function stepDog(dog, st, player, dt) {
  const line = fenceLine(dog);
  const [lo, hi] = runSpan(dog);
  const me = project(line, player.x, player.y);
  const seen = me.d < DOG.notice;
  const out = { ...st, barks: 0 };
  // It gives up only once it has stopped where it last saw you.
  out.calm = seen ? 0 : st.mode === 'chase' && (Math.abs(st.s - st.goal) > 0.1 || st.v !== 0) ? 0 : st.calm + dt;
  // How fast you're going along the fence: it runs a little ahead of you.
  const vs = st.ps == null || !seen || dt <= 0 ? 0 : (me.s - st.ps) / dt;
  out.ps = seen ? me.s : null;

  let target;
  if (seen) {
    out.mode = 'chase';
    target = Math.max(lo, Math.min(hi, me.s + Math.max(-3, Math.min(3, vs * 0.25))));
    out.goal = target;
  } else if (st.mode === 'chase' && out.calm < DOG.giveUp) {
    // You're gone: it runs on to where it last saw you (the end of its
    // yard, if you drove on), barks after you a while, then gives up.
    target = st.goal;
  } else {
    out.mode = st.mode === 'rest' ? 'rest' : 'home';
    target = dog.home;
  }

  const top = out.mode === 'home' ? DOG.trot : DOG.run;
  const err = target - st.s;
  const want = Math.max(-top, Math.min(top, err * 2.5));
  const dv = Math.max(-DOG.accel * dt, Math.min(DOG.accel * dt, want - st.v));
  out.v = st.v + dv;
  let s = st.s + out.v * dt;
  // Close enough: it stands right there.
  if (Math.abs(err) < 0.05 && Math.abs(out.v) < 0.4) {
    out.v = 0;
    s = target;
  }
  // Don't overshoot the target in one step.
  if ((err > 0 && s > target) || (err < 0 && s < target)) {
    s = target;
    out.v = 0;
  }
  if (s <= lo || s >= hi) {
    s = Math.max(lo, Math.min(hi, s));
    out.v = 0;
  }
  out.s = s;
  if (out.mode === 'home' && Math.abs(s - dog.home) < 0.1 && out.v === 0) out.mode = 'rest';
  out.phase = (st.phase + (Math.abs(out.v) * dt) / DOG.stride) % 1;

  // Facing: along the fence when it runs, at you when it stands and barks,
  // at the road when it rests.
  const p = runPoint(dog, s);
  if (Math.abs(out.v) > 0.5) out.heading = headingOf(p.dx * Math.sign(out.v), p.dy * Math.sign(out.v));
  else if (out.mode === 'chase') out.heading = headingOf(player.x - p.x, player.y - p.y);
  else if (out.mode === 'rest') out.heading = headingOf(p.dy, -p.dx);

  // Barks: while it chases, and a while after it loses you, a bark every 0.6 to 1.5 s.
  const loud = out.mode === 'chase';
  if (loud) {
    out.barkT = st.barkT - dt;
    if (out.barkT <= 0) {
      out.barks = 1;
      out.n = st.n + 1;
      out.barkT = 0.6 + 0.9 * unit(dog.id, out.n);
    }
  } else out.barkT = 0;
  return out;
}

// The dog held at s m along its run, running at v m/s on the spot (or
// standing, v = 0, facing (toward.x, toward.y), or lying down, rest: true):
// for screenshots (tools/shots.mjs through amb.farmDogs[i].hold).
export function dogHeld(dog, st, hold, dt) {
  const p = runPoint(dog, hold.s);
  const v = hold.rest ? 0 : hold.v || 0;
  const t = hold.rest ? null : hold.toward;
  return {
    ...st,
    s: hold.s,
    v,
    mode: hold.rest ? 'rest' : 'chase',
    calm: 0,
    barks: 0,
    phase: (st.phase + (Math.abs(v) * dt) / DOG.stride) % 1,
    heading: v ? headingOf(p.dx * Math.sign(v), p.dy * Math.sign(v)) : t ? headingOf(t.x - p.x, t.y - p.y) : headingOf(p.dy, -p.dx),
  };
}

// How to draw it: { x, y, heading, pose, bob, pitch, moving, running }.
// pose: 0 standing, 1 gallop stretched out, 2 gallop gathered, 3 lying down.
export function dogLook(dog, st) {
  const p = runPoint(dog, st.s);
  const speed = Math.abs(st.v);
  let pose = 0;
  let bob = 0;
  let pitch = 0;
  if (speed > 0.5) {
    pose = st.phase < 0.5 ? 1 : 2;
    bob = speed > 3 ? 0.05 + Math.sin(st.phase * Math.PI * 2) * 0.05 : 0.02;
    pitch = speed > 3 ? Math.sin(st.phase * Math.PI * 2) * 0.08 : 0;
  } else if (st.mode === 'rest') pose = 3;
  else if (st.barkT > 0) {
    // Each bark throws the head and chest up a little.
    const since = 0.6 + 0.9 * unit(dog.id, st.n) - st.barkT;
    if (since < 0.25) pitch = -0.12 * Math.sin((since / 0.25) * Math.PI);
  }
  return { x: p.x, y: p.y, heading: st.heading, pose, bob, pitch, moving: speed > 0.5, running: speed > 3 };
}
