// The road crew (#95, SPEC 9s item 9): a county crew clearing a ditch beside
// Highway 9, a few minutes into mission 1. An excavator digs the ditch and
// swings round to dump into a dump truck; a worker in a hard hat waves as you
// pass. Plain data and math, no engine code. src3/world3d/roadcrew3d.js draws
// it, src/audio/crewSound.js plays it, tools/check-roadcrew.mjs checks it.
//
// Where: ONE constant, ROAD_CREW. d is metres along the road from its first
// point (Ashford end); side +1 is right of travel toward Millbrook (the
// player's lane side). Highway 9 has a ditch on that side from d 1452 to 1622,
// about 1.5 km from the start: a few minutes in. It is a paved road the player
// passes, nowhere near the washed-out bridge (b_old, on Creek Road) and not on
// a mission waypoint (tools/check-roadcrew.mjs checks both).
//
// Local frame of the crew: u metres along the road in the direction of travel,
// off metres right of the centre line (as src/world/verge.js).

import { smoothstep } from './noise.js';

export const ROAD_CREW = {
  region: 'fenwick',
  roadId: 'hwy9',
  d: 1560, // centre of the crew along the road, inside the 1452..1622 ditch and clear of its power pole (d 1536 to 1541)
  side: 1,
};

// Where each part stands, in crew-local (u, off). Sizes are in roadcrew3d.js.
export const CREW_PLACES = {
  excavator: { u: 0, off: 6.2 }, // tracks on the shoulder and the bank, bucket over the ditch (off 8.1)
  truck: { u: 7.6, off: 5.9 }, // nose toward travel, wheels on the shoulder, clear of the player's lane
  worker: { u: -13, off: 5.0 }, // on the shoulder, before the work, facing the road
  // Cones along the tar edge, thinning toward the work; barricades before the excavator.
  cones: [-36, -30, -24, -18, -12, -6].map((u) => ({ u, off: 4.3 })).concat([{ u: 14, off: 4.3 }, { u: 18, off: 4.3 }]),
  barricades: [{ u: -3.2, off: 4.7 }, { u: 11.8, off: 4.9 }],
  spoil: [{ u: -2.4, off: 8.3 }, { u: 2.8, off: 9.6 }], // heaps of dug dirt on the far bank
};

// What the car and your feet bump into (excavator and truck; cones and the
// worker are small and soft). Centre (u, off), length along the road, width.
export const CREW_SOLIDS = [
  { id: 'excavator', ...CREW_PLACES.excavator, len: 4.2, w: 2.9 },
  { id: 'truck', ...CREW_PLACES.truck, len: 7.6, w: 2.6 },
];

// The crew spot on a road polyline: { x, y, tx, ty, rx, ry, heading } where
// (tx, ty) is the direction of travel and (rx, ry) is right of it.
export function crewFrame(world, spec = ROAD_CREW) {
  const road = world.roads.find((r) => r.id === spec.roadId);
  if (!road) return null;
  let acc = 0;
  for (let i = 1; i < road.points.length; i++) {
    const [ax, ay] = road.points[i - 1];
    const [bx, by] = road.points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (acc + len >= spec.d) {
      const f = (spec.d - acc) / len;
      const tx = (bx - ax) / len;
      const ty = (by - ay) / len;
      return {
        x: ax + (bx - ax) * f, y: ay + (by - ay) * f, tx, ty, rx: -ty, ry: tx,
        heading: ((Math.atan2(tx, -ty) * 180) / Math.PI + 360) % 360,
      };
    }
    acc += len;
  }
  return null;
}

// World (x, y) of crew-local (u, off).
export function crewToWorld(f, u, off) {
  return { x: f.x + f.tx * u + f.rx * off, y: f.y + f.ty * u + f.ry * off };
}

// Solid rects of the crew in world space, as src/drive/layout.js partRect
// gives them (x, y, w, h, angle): the collider takes these.
export function crewSolidRects(f) {
  return CREW_SOLIDS.map((s) => {
    const c = crewToWorld(f, s.u, s.off);
    return { id: s.id, x: c.x, y: c.y, w: s.w, h: s.len, angle: f.heading };
  });
}

// ---- The dig loop ---------------------------------------------------------
// The arm works in the cab's vertical plane. Angles are absolute, from the
// horizontal, positive up (so the stick and bucket hang negative when they dig).
// swing: cab turn from the direction of travel, radians, positive toward the
// ditch (right).
export const ARM = {
  foot: { r: 0.7, h: 1.5 }, // boom foot: out from the swing axis, up from the ground the tracks stand on
  boom: 3.5,
  stick: 2.0,
  bucket: 0.95,
};
export const CYCLE_S = 12; // seconds for dig, swing, dump, swing back

const D = Math.PI / 180;
// Keyframes: t (s), swing, boom, stick, bucket (degrees).
const KEYS = [
  [0.0, 90, 34, -108, -62], // reaching over the ditch, bucket open
  [1.7, 90, 2, -135, -62], // bucket on the ditch floor
  [2.8, 90, 2, -135, -150], // curled, loaded
  [4.0, 90, 48, -70, -150], // lifted clear
  [6.2, 0, 44, -22, -150], // swung round over the truck bed
  [7.4, 0, 44, -22, -35], // bucket opens: the dirt drops
  [8.6, 0, 44, -22, -35], // hold, dirt falling
  [10.4, 90, 38, -100, -62], // swing back
  [12.0, 90, 34, -108, -62],
];

export function digPose(tSec) {
  const t = ((tSec % CYCLE_S) + CYCLE_S) % CYCLE_S;
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1][0]) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = smoothstep(a[0], b[0], t);
  const m = (j) => (a[j] + (b[j] - a[j]) * k) * D;
  const pose = { swing: m(1), boom: m(2), stick: m(3), bucket: m(4), t };
  // Dirt in the bucket: from the curl until it drops.
  pose.loaded = t >= 2.8 && t < 7.6 ? 1 : 0;
  // Dirt falling into the bed.
  pose.dropping = t >= 7.4 && t < 8.6 ? 1 : 0;
  const tip = armTip(pose);
  pose.reach = tip.r;
  pose.tipH = tip.h;
  return pose;
}

// Bucket tip in the arm plane: r out from the swing axis, h above the tracks' ground.
export function armTip(p) {
  const bx = ARM.foot.r + ARM.boom * Math.cos(p.boom);
  const by = ARM.foot.h + ARM.boom * Math.sin(p.boom);
  const sx = bx + ARM.stick * Math.cos(p.stick);
  const sy = by + ARM.stick * Math.sin(p.stick);
  return { r: sx + ARM.bucket * Math.cos(p.bucket), h: sy + ARM.bucket * Math.sin(p.bucket) };
}

// Clanks: when the bucket meets the ditch floor and when it knocks the bed.
export const CLANKS = [1.7, 7.4]; // seconds into the cycle
// Did a clank fall in (tPrev, tNow]? Both are seconds on the crew clock.
export function clankBetween(tPrev, tNow) {
  if (!(tNow > tPrev)) return false;
  for (let c = Math.floor(tPrev / CYCLE_S); c <= Math.floor(tNow / CYCLE_S); c++) {
    for (const k of CLANKS) {
      const at = c * CYCLE_S + k;
      if (at > tPrev && at <= tNow) return true;
    }
  }
  return false;
}

// ---- The wave -------------------------------------------------------------
export const WAVE_NEAR = 45; // m: starts waving
export const WAVE_FAR = 60; // m: stops (a gap so he does not flicker at the edge)
// Waving or not, from where you are now and what it was a moment ago.
export function waving(distM, was) {
  if (distM < WAVE_NEAR) return true;
  if (distM > WAVE_FAR) return false;
  return !!was;
}
// The raised arm's swing, radians, at crew time t while waving.
export function waveAngle(t) {
  return Math.sin(t * 7.5) * 0.35;
}

// ---- Eligibility ----------------------------------------------------------
// "After the opening storm": mission 1 opens in rain that clears at
// OPENING.END (60 s). The crew is not eligible before that, nor anywhere but
// its region.
export const STORM_OVER_S = 60;
export function crewEligible({ regionId, secs, opening }) {
  if (regionId !== ROAD_CREW.region) return false;
  return !opening || secs >= STORM_OVER_S;
}
