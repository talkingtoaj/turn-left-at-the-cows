// Runtime flags for the three.js version (the shared `state` lives in src/state.js).
export const runtime = {
  paused: false, // true while the map overlay is open: world, clock and timer freeze
  cameraMode: 'chase', // 'chase' (low, behind the car) | 'top' (close top-down)
};
