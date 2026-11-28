// Which way a local points while they answer (#93, SPEC 9s item 7).
// Engine-free: no three.js, no DOM except reading the URL flag. The arm
// itself is in src3/world3d/peopleLook.js; src3/hud/talk.js feeds each page
// of an answer through here and puts the result in state.talkPoint.
//
// The direction comes from the words of the answer, which are the local's own
// belief. A local who sends you north when the place is south points north
// too. We never look at where the place really is, except for "What's that?",
// where they point at the thing you are looking at.
//
// A point is { compass } (degrees clockwise from north, the same as
// lookables.js bearings) or { turn: 'left' | 'right' | 'ahead' } (relative to
// the way the player faces, which is toward the local). null means no point.

// ?point=off turns every local's pointing off.
export const POINT_ON = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('point') !== 'off';

const COMPASS = {
  north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315,
};

// "north", "north-east", "northeast", "northward". Whole words only.
const COMPASS_RE = /\b(north|south)[- ]?(east|west)(?:ern|ward|wards)?\b|\b(north|south|east|west)(?:ern|ward|wards)?\b/gi;
// "turn left", "bear right", "on your right", "the left fork", "hang a left".
// A bare "right" ("right here", "all right") never counts.
const TURN_RE = /\b(?:turn|bear|veer|hang|swing|go|head|take a|on your|to your|on the|to the)\s+(?:a\s+|the\s+)?(?:sharp\s+|hard\s+|slight\s+)?(left|right)\b|\bthe\s+(left|right)(?:-hand|\s+hand)?\s+(?:fork|road|lane|one|turn|side)\b/gi;
const AHEAD_RE = /\b(?:straight\s+(?:on|ahead)|keep\s+going\s+straight|go\s+straight|straight\s+up|straight\s+down|straight\s+out)\b/i;
const NEGATED_RE = /(?:don't|do not|doesn't|never|not|nobody|won't)\s+(?:\w+\s+){0,2}$/i;

// A capitalized compass word before another capitalized word is a name
// ("North Fork", "East Main"), not a direction.
function isName(text, m) {
  if (m[0][0] !== m[0][0].toUpperCase()) return false;
  return /^[ -]?[A-Z]/.test(text.slice(m.index + m[0].length)) && /^\s+[A-Z]/.test(text.slice(m.index + m[0].length));
}

// The first direction an answer gives: { at (index), point } or null.
export function firstDirection(text) {
  if (!text) return null;
  let best = null;
  const consider = (at, point, m) => {
    if (NEGATED_RE.test(text.slice(Math.max(0, at - 24), at))) return;
    if (best && best.at <= at) return;
    best = { at, point, m };
  };
  COMPASS_RE.lastIndex = 0;
  let m;
  while ((m = COMPASS_RE.exec(text))) {
    if (isName(text, m)) continue;
    const key = (m[1] ? m[1] + m[2] : m[3]).toLowerCase();
    consider(m.index, { compass: COMPASS[key] }, m);
  }
  TURN_RE.lastIndex = 0;
  while ((m = TURN_RE.exec(text))) consider(m.index, { turn: (m[1] || m[2]).toLowerCase() }, m);
  return best;
}

// Where a page of dialogue sends you, or null: no point. "Straight on" counts
// only when nothing else on the page names a direction.
export function pointFromText(text) {
  const d = firstDirection(text);
  if (d) return d.point;
  return AHEAD_RE.test(text || '') ? { turn: 'ahead' } : null;
}

const norm = (deg) => ((deg % 360) + 360) % 360;

// The compass bearing (degrees) a point means, given the bearing the player
// faces (from the player toward the local). null for no point.
export function pointBearing(point, facing) {
  if (!point) return null;
  if (point.compass != null) return norm(point.compass);
  if (point.turn === 'left') return norm(facing - 90);
  if (point.turn === 'right') return norm(facing + 90);
  if (point.turn === 'ahead') return norm(facing);
  return null;
}

// "What's that?": the local points at the thing, if they know it. `knows` is
// from dialogue.js whatsThatKnows. `bearing`: from the player to the thing.
export function thingPoint(knows, bearing) {
  return knows && Number.isFinite(bearing) ? { compass: norm(bearing) } : null;
}

// Joint angles that aim an arm along a direction in the person's own frame:
// x right, y up, -z forward (the model faces -z). The arm hangs down at rest.
// Returns { a, c } for uaR/uaL: rotation x = a, rotation z = c, y = 0 (three's
// XYZ order, +z lifts the right arm out). Left arm: mirror x, then negate c.
export function aimArm(v, side) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  let x = v[0] / len;
  const y = v[1] / len;
  const z = v[2] / len;
  if (side < 0) x = -x;
  const c = Math.asin(Math.max(-1, Math.min(1, x)));
  const a = Math.abs(x) > 0.9995 ? 0 : Math.atan2(-z, -y);
  return { a, c: side < 0 ? -c : c };
}

// The compass bearing a local should face to point at `bearing` while they
// talk to someone at `viewer` (the bearing from the local to the player): the
// way they face the player, unless the point is more than SIDE_ON degrees off
// that, then side-on (arm straight out, head still on the player).
export const SIDE_ON = 100;
export function pointFacing(bearing, viewer) {
  const diff = ((((bearing - viewer) % 360) + 540) % 360) - 180;
  if (Math.abs(diff) <= SIDE_ON) return norm(viewer);
  return norm(bearing - Math.sign(diff) * SIDE_ON);
}

// The way to point as a vector in the person's frame, from a compass bearing
// and the compass bearing they face (degrees). A little above level.
export const POINT_LIFT = 0.18;
export function pointVector(bearing, facing, lift = POINT_LIFT) {
  const r = ((bearing - facing) * Math.PI) / 180; // clockwise from forward = toward their right
  const k = Math.sqrt(1 - lift * lift);
  return [Math.sin(r) * k, lift, -Math.cos(r) * k];
}
