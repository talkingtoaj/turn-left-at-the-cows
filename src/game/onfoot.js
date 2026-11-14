// Getting out of the car and walking (round 12). Engine-free: the three.js
// side (src3/onfoot.js) reads keys and the mouse, moves the camera and plays
// the footsteps; this file only knows where you stand and what you face.
//
// Angles in degrees like the car: yaw 0 = north, 90 = east (clockwise);
// pitch 0 = level, + looks up. World y grows south.
//
//   const w = createWalker()
//   placeBeside(car, isClear) -> { x, y } beside the driver's door, or null
//   stepWalker(w, input, dt, isClear) -> metres moved; input = { fwd, back, left, right, jog }
//   carReach(w, car) -> metres from you to the car's side (F works within WALK.carReach)
//   facing(w, x, y) -> degrees between where you look (flat) and a point

import { CAR_CIRCLES, CAR_R } from '../drive/collider.js';

export const WALK = {
  eye: 1.65, // eye height above the ground, metres
  walk: 1.4, // m/s
  jog: 3.0, // m/s with Shift
  accel: 8, // m/s^2: how fast you get up to speed and stop
  r: 0.3, // your body, for bumping into things
  exitSpeed: 1.0, // m/s: F only gets you out when the car is this slow
  carReach: 2.2, // metres from the car's side where F gets you back in
  talkR: 3, // metres: talk range on foot
  talkFacing: 40, // degrees either side of straight ahead that counts as facing someone
  stride: 0.72, // metres a walking step
  jogStride: 1.05, // metres a jogging step
};

const DEG = Math.PI / 180;

export function createWalker() {
  return { x: 0, y: 0, yaw: 0, pitch: 0, speed: 0, vx: 0, vy: 0, stepAcc: 0, steps: 0, jogging: false };
}

// The car's hit circles' centres for (x, y, heading).
function carCircles(car) {
  const sx = Math.sin(car.heading * DEG);
  const sy = -Math.cos(car.heading * DEG);
  return CAR_CIRCLES.map((off) => [car.x + sx * off, car.y + sy * off]);
}

// Metres from (x, y) to the car's body (0 inside it).
export function carGap(car, x, y) {
  let best = Infinity;
  for (const [cx, cy] of carCircles(car)) best = Math.min(best, Math.hypot(x - cx, y - cy) - CAR_R);
  return Math.max(0, best);
}

export const carReach = (w, car) => carGap(car, w.x, w.y);

// Where you stand after getting out: the driver's door (left side, the car
// is a left-hand drive), else the passenger side, else behind or in front.
// isClear(x, y, r) says whether a body of radius r fits there.
export function placeBeside(car, isClear) {
  const h = car.heading * DEG;
  const fx = Math.sin(h);
  const fy = -Math.cos(h);
  const rx = Math.cos(h); // right of the car
  const ry = Math.sin(h);
  const tries = [
    [-1.65, 0.3], [1.65, 0.3], [-1.65, -0.8], [1.65, -0.8], [0, -3.3], [0, 3.3], [-2.4, 0.3], [2.4, 0.3],
  ];
  for (const [side, fwd] of tries) {
    const x = car.x + rx * side + fx * fwd;
    const y = car.y + ry * side + fy * fwd;
    if (isClear(x, y, WALK.r) && carGap(car, x, y) > WALK.r) return { x, y };
  }
  return null;
}

// One frame of walking. isClear(x, y, r) is the world's say (buildings,
// fences, trees, rocks, water, people); the parked car is checked here.
// Slides along whatever stops you. Returns the metres moved.
export function stepWalker(w, input, dt, isClear, car = null) {
  const h = w.yaw * DEG;
  const fx = Math.sin(h);
  const fy = -Math.cos(h);
  const rx = Math.cos(h);
  const ry = Math.sin(h);
  let ax = 0;
  let ay = 0;
  if (input.fwd) { ax += fx; ay += fy; }
  if (input.back) { ax -= fx; ay -= fy; }
  if (input.right) { ax += rx; ay += ry; }
  if (input.left) { ax -= rx; ay -= ry; }
  const len = Math.hypot(ax, ay);
  w.jogging = !!input.jog && len > 0;
  const top = w.jogging ? WALK.jog : WALK.walk;
  const tvx = len > 0 ? (ax / len) * top : 0;
  const tvy = len > 0 ? (ay / len) * top : 0;
  // Ease toward the wanted velocity (you do not stop dead or start at full pace).
  const k = Math.min(1, WALK.accel * dt / Math.max(0.5, top));
  w.vx += (tvx - w.vx) * k;
  w.vy += (tvy - w.vy) * k;
  if (Math.abs(w.vx) < 1e-3 && Math.abs(w.vy) < 1e-3) {
    w.vx = 0;
    w.vy = 0;
  }
  const ok = (x, y) => isClear(x, y, WALK.r) && (!car || carGap(car, x, y) > WALK.r);
  const dx = w.vx * dt;
  const dy = w.vy * dt;
  const x0 = w.x;
  const y0 = w.y;
  if (dx || dy) {
    if (ok(w.x + dx, w.y + dy)) {
      w.x += dx;
      w.y += dy;
    } else if (dx && ok(w.x + dx, w.y)) {
      w.x += dx;
      w.vy *= 0.5;
    } else if (dy && ok(w.x, w.y + dy)) {
      w.y += dy;
      w.vx *= 0.5;
    } else {
      w.vx = 0;
      w.vy = 0;
    }
  }
  const moved = Math.hypot(w.x - x0, w.y - y0);
  w.speed = dt > 0 ? moved / dt : 0;
  // Footsteps: one each stride.
  w.stepAcc += moved;
  const stride = w.jogging ? WALK.jogStride : WALK.stride;
  w.stepped = false;
  if (w.stepAcc >= stride) {
    w.stepAcc -= stride;
    w.steps++;
    w.stepped = true;
  }
  if (moved < 1e-4 && len === 0) w.stepAcc = Math.min(w.stepAcc, stride * 0.6);
  return moved;
}

// Degrees between where you look (ignoring up and down) and the point (x, y).
export function facing(w, x, y) {
  const b = Math.atan2(x - w.x, -(y - w.y)) / DEG;
  let d = (b - w.yaw) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return Math.abs(d);
}

// The local you can talk to on foot: within WALK.talkR and roughly in front
// of you. posOf(id) gives where each one stands now. Returns
// { id, d, facing } for the closest such local, and `near` for the closest
// local within talk range whether you face them or not.
export function localsAround(w, locals, posOf, missionId = null) {
  let talk = null;
  let near = null;
  for (const l of locals) {
    if (l.onlyMission && l.onlyMission !== missionId) continue; // the tourist is in her own mission only
    const p = posOf(l.id) || l;
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    if (d > WALK.talkR) continue;
    const f = facing(w, p.x, p.y);
    if (!l.tourist && (!near || d < near.d)) near = { id: l.id, d, facing: f };
    if (f <= WALK.talkFacing && (!talk || d < talk.d)) talk = { id: l.id, d, facing: f };
  }
  return { talk, near };
}
