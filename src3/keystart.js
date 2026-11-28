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
