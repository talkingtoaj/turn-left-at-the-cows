// Arcade car physics and the car's look.

import { DEG } from './geom.js';

export const MAX_SPEED = { paved: 25, dirt: 16, grass: 9 }; // m/s

const ACCEL = 7; // m/s^2 throttle
const BRAKE = 16; // m/s^2 when pressing against the motion
const REVERSE_ACCEL = 5;
const REVERSE_MAX = 6;
const COAST = 2.5; // rolling drag with no pedal
const OVERSPEED_DECEL = 12; // how fast you slow when leaving a faster surface
const TURN_RATE = 95; // deg/s at low-ish speed
const MAX_STEP = 0.5; // metres per physics sub-step, so nothing tunnels

function approach(v, target, amount) {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}

const NO_MODS = { vmaxMul: 1, accelMul: 1, pull: 0 };

// input: { up, down, left, right, brake }.
// mods (optional, from src/game/damage.js): { vmaxMul, accelMul, pull }.
//   vmaxMul scales top speed, accelMul scales engine power (0 = stalled,
//   the car coasts), pull is a steady turn in deg/s at speed (+ = right) from
//   a flat tyre or bent steering.
// Returns { moved, hitSpeed, surface, hit }. hit is the hardest knock this
// step or null: { speed, dir: 'front'|'rear'|'side', side: -1 left | 1 right,
// kind, x, y } where speed is the part of the car's speed going into what it
// hit (a glancing scrape is slow even when the car is fast).
export function stepCar(car, input, dt, collider, mods = NO_MODS) {
  const surface = collider.surfaceAt(car.x, car.y);
  const vmax = MAX_SPEED[surface] * (mods.vmaxMul ?? 1);
  const power = mods.accelMul ?? 1;
  let v = car.speed;

  // Throttle / brake / reverse.
  if (input.brake) {
    v = approach(v, 0, BRAKE * 1.2 * dt);
  } else if (input.up && !input.down && power > 0) {
    v = v < -0.1 ? v + BRAKE * dt : v + ACCEL * power * (1 - Math.max(0, v) / (vmax * 1.6)) * dt;
  } else if (input.down && !input.up && (power > 0 || v > 0.1)) {
    v = v > 0.1 ? v - BRAKE * dt : v - REVERSE_ACCEL * power * dt;
  } else {
    const drag = COAST + (surface === 'grass' ? 2 : 0) + Math.abs(v) * 0.03;
    v = approach(v, 0, drag * dt);
  }

  // Surface speed limits.
  const revMax = Math.min(REVERSE_MAX, vmax * 0.6);
  if (v > vmax) v = Math.max(vmax, v - OVERSPEED_DECEL * dt);
  if (v < -revMax) v = Math.min(-revMax, v + OVERSPEED_DECEL * dt);

  // Steering scales up with speed, eases off a bit at the top end.
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const speedFactor = Math.min(1, Math.abs(v) / 5) * (1 - 0.35 * Math.min(1, Math.abs(v) / 25));
  // Damage pull: grows with speed, none when nearly stopped.
  const pull = (mods.pull || 0) * Math.min(1, Math.abs(v) / 8) * Math.sign(v);
  const dHeading = (steer * TURN_RATE * speedFactor * Math.sign(v) + pull) * dt;

  // Move in small sub-steps, checking collisions each time.
  const steps = Math.max(1, Math.ceil((Math.abs(v) * dt) / MAX_STEP));
  const sub = dt / steps;
  const startX = car.x;
  const startY = car.y;
  let hitSpeed = 0;
  let hit = null;
  // If we somehow start inside something, let the car drive out freely.
  const stuck = collider.carBlocked(car.x, car.y, car.heading);

  for (let i = 0; i < steps; i++) {
    const nh = car.heading + dHeading / steps;
    const nx = car.x + Math.sin(nh * DEG) * v * sub;
    const ny = car.y - Math.cos(nh * DEG) * v * sub;
    if (stuck || !collider.carBlocked(nx, ny, nh)) {
      car.x = nx;
      car.y = ny;
      car.heading = nh;
      continue;
    }
    // Blocked: try sliding along one axis, losing speed.
    if (Math.abs(v) > hitSpeed) hit = hitInfo(collider, car, nx, ny, nh, v) || hit;
    hitSpeed = Math.max(hitSpeed, Math.abs(v));
    // Only slide along an axis that carries a fair share of the motion,
    // otherwise a head-on hit would "slide" in place at full speed.
    const ddx = Math.abs(nx - car.x);
    const ddy = Math.abs(ny - car.y);
    const minShare = 0.3 * Math.hypot(ddx, ddy);
    if (ddx > minShare && !collider.carBlocked(nx, car.y, nh)) {
      car.x = nx;
      car.heading = nh;
      v *= Math.pow(0.15, sub);
    } else if (ddy > minShare && !collider.carBlocked(car.x, ny, nh)) {
      car.y = ny;
      car.heading = nh;
      v *= Math.pow(0.15, sub);
    } else {
      // Dead stop with a small bounce back.
      if (!collider.carBlocked(car.x, car.y, nh)) car.heading = nh;
      v = Math.abs(v) > 4 ? -v * 0.15 : 0;
      break;
    }
  }

  car.heading = ((car.heading % 360) + 360) % 360;
  car.speed = v;
  return { moved: Math.hypot(car.x - startX, car.y - startY), hitSpeed, surface, hit };
}

// Which side of the car hit something, and how hard (see stepCar).
function hitInfo(collider, car, nx, ny, nh, v) {
  if (!collider.contact) return null;
  const c = collider.contact(nx, ny, nh);
  if (!c) return null;
  const fx = Math.sin(nh * DEG);
  const fy = -Math.cos(nh * DEG);
  // Velocity into the obstacle.
  const speed = Math.max(0, (fx * c.dx + fy * c.dy) * v);
  const cosA = fx * c.dx + fy * c.dy;
  const right = Math.cos(nh * DEG) * c.dx + Math.sin(nh * DEG) * c.dy;
  const dir = cosA > 0.6 ? 'front' : cosA < -0.6 ? 'rear' : 'side';
  return { speed, dir, side: right >= 0 ? 1 : -1, kind: c.kind, x: car.x, y: car.y };
}

function tint(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const gg = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (gg << 8) | b;
}

// Car drawn at the origin pointing north (-y). Rotate the Graphics by heading.
// `color` is the body paint (the player's car is the default red).
export function drawCar(g, color = 0xd0553b) {
  const L = 4.5;
  const W = 1.9;
  // Tyres.
  g.fillStyle(0x1e1e1e, 1);
  for (const [x, y] of [[-1, -1.45], [1, -1.45], [-1, 1.4], [1, 1.4]]) g.fillRect(x - 0.22, y - 0.42, 0.44, 0.84);
  // Body.
  g.fillStyle(tint(color, 0.75), 1);
  g.fillRoundedRect(-W / 2 - 0.05, -L / 2 - 0.05, W + 0.1, L + 0.1, 0.55);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-W / 2, -L / 2, W, L, 0.5);
  // Bonnet line.
  g.fillStyle(tint(color, 1.08), 1);
  g.fillRect(-0.55, -2.0, 1.1, 0.9);
  // Windscreen and rear window.
  g.fillStyle(0x24323d, 1);
  g.fillPoints([{ x: -0.8, y: -0.75 }, { x: 0.8, y: -0.75 }, { x: 0.68, y: -0.15 }, { x: -0.68, y: -0.15 }], true);
  g.fillPoints([{ x: -0.68, y: 1.25 }, { x: 0.68, y: 1.25 }, { x: 0.78, y: 1.7 }, { x: -0.78, y: 1.7 }], true);
  // Roof.
  g.fillStyle(tint(color, 0.93), 1);
  g.fillRect(-0.7, -0.15, 1.4, 1.4);
  // Headlights and tail lights.
  g.fillStyle(0xfff3c4, 1);
  g.fillRect(-0.85, -2.28, 0.45, 0.18);
  g.fillRect(0.4, -2.28, 0.45, 0.18);
  g.fillStyle(0x7a1010, 1);
  g.fillRect(-0.85, 2.12, 0.4, 0.16);
  g.fillRect(0.45, 2.12, 0.4, 0.16);
}

export function drawCarShadow(g) {
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(-1.05, -2.3, 2.1, 4.6, 0.6);
}

