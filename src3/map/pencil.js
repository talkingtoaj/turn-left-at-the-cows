// Pure logic for the map's look and feel (#92). No DOM, so tools/check-map-fx.mjs
// can test every per-frame decision. map.js does the drawing and the sound.

// ---- opening and closing (CSS does the folding; this picks which show)
// 'fold' (panels), 'fade' (reduced motion) or 'none' (?mapfx=off).
export function unfoldMode({ fx, reduced }) {
  if (!fx) return 'none';
  return reduced ? 'fade' : 'fold';
}
export const FOLD_SECONDS = 0.42; // under half a second
export const FADE_SECONDS = 0.15;

// ---- road button: thin, dashed (dirt), thick (main), round and round
export const ROADS = ['thin', 'dash', 'thick'];
export const nextRoad = (road) => ROADS[(ROADS.indexOf(road) + 1) % ROADS.length];
export const roadFlags = (road) => ({ dashed: road === 'dash', thick: road === 'thick' });
export const roadOf = (dashed, thick) => (thick ? 'thick' : dashed ? 'dash' : 'thin');

// ---- pencil scratch sound: loudness follows how fast the hand moves
export const SCRATCH_MAX = 0.45;
export function scratchGain(speed) { // speed in map px per ms
  if (!(speed > 0.03)) return 0;
  return Math.min(1, 0.25 + speed / 1.2) * SCRATCH_MAX;
}

// ---- graphite look
function rngFrom(seed) {
  let a = (seed | 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const strokeSeed = (stroke) => {
  const p = stroke.points[0] || [0, 0];
  const q = stroke.points[stroke.points.length - 1] || [0, 0];
  return Math.round(p[0] * 31 + p[1] * 17 + q[0] * 7 + q[1] * 3 + stroke.points.length * 13) | 0;
};
// The same line nudged by under a pixel: drawn thin on top of the stroke it
// makes the graphite grain. Same seed, same grain, so a sketch never shimmers.
export function grainPoints(points, seed) {
  const r = rngFrom(seed);
  return points.map(([x, y]) => [x + (r() - 0.5) * 1.4, y + (r() - 0.5) * 1.4]);
}
// Little ragged dots where the pencil touched down and lifted.
export function endDots(stroke) {
  const r = rngFrom(strokeSeed(stroke) + 99);
  const w = stroke.width || 2;
  const at = (p) => ({ x: p[0] + (r() - 0.5) * 2.4, y: p[1] + (r() - 0.5) * 2.4, r: w * (0.45 + r() * 0.3) });
  const pts = stroke.points;
  if (!pts.length) return [];
  return [at(pts[0]), at(pts[pts.length - 1])];
}
// Only pencil grey gets the graphite look; blue and red stay as they were.
export const isGraphite = (stroke) => (stroke.color ?? 0x555555) === 0x555555;

// ---- eraser crumbs
export const CRUMB_LIFE = 0.9; // seconds
export function spawnCrumbs(x, y, rng, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const s = 12 + rng() * 26;
    out.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, age: 0, size: 1.2 + rng() * 1.6 });
  }
  return out;
}
export function stepCrumbs(list, dt) {
  const out = [];
  for (const c of list) {
    const age = c.age + dt;
    if (age >= CRUMB_LIFE) continue;
    out.push({ ...c, age, x: c.x + c.vx * dt, y: c.y + c.vy * dt, vy: c.vy + 60 * dt });
  }
  return out;
}
export const crumbAlpha = (c) => Math.max(0, 1 - c.age / CRUMB_LIFE) * 0.8;

// ---- damp spots from rain
export const DAMP = {
  RAIN_MIN: 0.08, // rain strength that wets the paper
  MAX_SPOTS: 9,
  SPAWN_PER_SEC: 0.7, // at full rain
  SOAK_SECONDS: 3, // a spot darkens this slowly
  DRY_SECONDS: 90, // a full spot dries away in this long
};
// spots: [{ x, y, r, a, goal }] a = 0..1 how dark now. Returns a new list.
// open: the map is open; raining only counts while it is open (rain falls on
// the paper only when you can see it). paper: { x, y, w, h }.
export function stepDamp(spots, dt, { rain, open, rng, paper }) {
  let out = spots.map((s) => {
    const wetting = open && rain > DAMP.RAIN_MIN;
    const a = wetting
      ? Math.min(s.goal, s.a + dt / DAMP.SOAK_SECONDS)
      : Math.max(0, s.a - dt / DAMP.DRY_SECONDS);
    return { ...s, a };
  }).filter((s) => s.a > 0 || s.goal > 0 && open);
  if (open && rain > DAMP.RAIN_MIN && out.length < DAMP.MAX_SPOTS && rng() < DAMP.SPAWN_PER_SEC * rain * dt) {
    out = out.concat({
      x: paper.x + 30 + rng() * (paper.w - 60),
      y: paper.y + 30 + rng() * (paper.h - 60),
      r: 14 + rng() * 22,
      a: 0,
      goal: 0.45 + rng() * 0.45,
    });
  }
  return out.filter((s) => s.a > 0 || s.goal > 0);
}
