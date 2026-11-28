// Turn the key to start (SPEC 9s item 2, #91). The rules for the one smooth
// shot from the start screen into the chase view. Pure numbers, no three.js,
// so tools/check-keystart.mjs can test them. The drawing is in main.js
// (beginFly / flyFrame) and the dash wake is CSS in src/ui/splashStyle.js.

// Where a human may want to move things.
export const WAKE_MS = 900; // crank and dash wake: needles sweep, lamps flash
export const FLY_MS = 1700; // camera from the driver's seat out to the chase view
export const HOLD = 0.12; // share of the shot the camera waits at the seat
export const DASH_END = 0.7; // by this share the start screen's dash has slid away
export const EYE = { up: 1.25, ahead: 0.2, left: 0.35 }; // driver's eye, metres from the car's origin
export const MENU_FOV = 55; // the windshield view the shot starts from

// How a start plays. flag is the ?keystart= value.
//   off   today's start: no crank scene, no camera move
//   fade  reduced motion: a short fade only
//   wake  dash wake, no camera move (weak devices with the still or painted frame)
//   fly   the whole shot
export function keyStartMode({ flag = null, reducedMotion = false, weak = false, phone = false } = {}) {
  if (flag === 'off' || phone) return 'off';
  if (reducedMotion) return 'fade';
  if (weak) return 'wake';
  return 'fly';
}

// The ignition switch (#98). Only mission 1 gets the welcome start; every
// other mission jumps straight in as it did before #91.
export const KEY_MISSION = 'm1_parcel';
export function startsWithKey(missionId) {
  return missionId === KEY_MISSION;
}

// Where the marks sit round the bezel, degrees clockwise from 12 o'clock.
export const MARKS = [
  { name: 'OFF', deg: -50 },
  { name: 'ACC', deg: -17 },
  { name: 'ON', deg: 17 },
  { name: 'START', deg: 50 },
];
// The key's turn, [ms, mark index] keyframes. The key rests at OFF, goes
// round with a click at each mark, is held at START while the engine cranks,
// then springs back to ON when it catches. Move the times to taste.
const TURN = [[0, 0], [250, 0], [400, 1], [550, 1], [700, 2], [900, 2], [1000, 3], [1450, 3], [1550, 2]];
export const TURN_MS = 1550;
export const CATCH_MS = 1450; // the engine catches: the dash wakes from here
export const CRANK_FROM_MS = 1000;

// ms into the turn -> { deg, mark } (mark is the nearest mark the key has reached).
export function keyTurn(ms) {
  const t = Math.max(0, Math.min(TURN_MS, ms));
  let i = 0;
  while (i < TURN.length - 2 && t >= TURN[i + 1][0]) i++;
  const [t0, m0] = TURN[i];
  const [t1, m1] = TURN[i + 1];
  const k = t1 > t0 ? smoothStep((t - t0) / (t1 - t0)) : 1;
  let deg = MARKS[m0].deg + (MARKS[m1].deg - MARKS[m0].deg) * k;
  // The starter shudders the key while it is held at START.
  if (t >= CRANK_FROM_MS + 100 && t < CATCH_MS) deg += Math.sin(t * 0.09) * 1.6;
  return { deg, mark: k >= 0.5 ? m1 : m0 };
}
const smoothStep = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};

// The keychain: a pendulum hanging from the key's hole. psi is its angle from
// straight down (radians, positive swings right). pivotX is the hole's x on
// screen in px. The swing is pushed by how fast the hole speeds up sideways.
// The dwarf charm hangs about 80 px below the hole, so it swings slower than a small fob.
export const CHAIN = { len: 80, pull: 30, damp: 1.8, max: 1.1 };
export function newChain(pivotX = 0) {
  return { psi: 0, w: 0, x1: pivotX, x2: pivotX, seeded: false };
}
export function stepChain(s, dt, pivotX, sway = 0) {
  dt = Math.max(0, Math.min(0.05, dt));
  if (!dt) return s;
  if (!s.seeded) { s.x1 = s.x2 = pivotX; s.seeded = true; } // no jolt from where it was made
  const ax = (pivotX - 2 * s.x1 + s.x2) / (dt * dt); // sideways acceleration of the hole
  s.x2 = s.x1;
  s.x1 = pivotX;
  const n = Math.ceil(dt / (1 / 120));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const acc = -CHAIN.pull * Math.sin(s.psi) - CHAIN.damp * s.w - (ax + sway) / CHAIN.len;
    s.w += acc * h;
    s.psi += s.w * h;
    if (s.psi > CHAIN.max) { s.psi = CHAIN.max; s.w = Math.min(s.w, 0); }
    if (s.psi < -CHAIN.max) { s.psi = -CHAIN.max; s.w = Math.max(s.w, 0); }
  }
  return s;
}
// A small push for the keychain at rest (px/s^2 sideways), time in ms.
export const restSway = (ms) => Math.sin(ms * 0.0021) * 55;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  v = clamp01(v);
  return v * v * v * (v * (v * 6 - 15) + 10);
};

// ms into the shot -> { cam, dash, done }. cam 0 is the driver's seat, 1 is
// the chase view; dash 0 is the dash in place, 1 is gone (the glass fills
// the screen).
export function flyState(ms) {
  const p = clamp01(ms / FLY_MS);
  return {
    cam: smooth((p - HOLD) / (1 - HOLD)),
    dash: smooth(p / DASH_END),
    done: p >= 1,
  };
}

// A point between a and b (plain { x, y, z }), written into out.
export function lerp3(out, a, b, k) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
  return out;
}

// The driver's eye and what it looks at, for a car at (x, y, z) in three.js
// space (z is the world's y) heading `heading` degrees (0 north, clockwise).
export function eyePose(car, heading) {
  const h = (heading * Math.PI) / 180;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const rx = Math.cos(h); // to the right of the car
  const rz = Math.sin(h);
  const eye = {
    x: car.x + fx * EYE.ahead - rx * EYE.left,
    y: car.y + EYE.up,
    z: car.z + fz * EYE.ahead - rz * EYE.left,
  };
  const look = { x: eye.x + fx * 20, y: eye.y - 0.5, z: eye.z + fz * 20 };
  return { eye, look };
}
