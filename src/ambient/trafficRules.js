// Traffic rules, pure logic (no engine code, no state): when an AI car must
// slow for the player, and when a car should be taken away and put back
// somewhere else. Used by src/ambient/ambient.js, checked by
// npm run check:traffic (tools/check-traffic.mjs).
//
// Units: metres, seconds, m/s. Headings in degrees, 0 north, clockwise, y south.

import { DEG } from '../drive/geom.js';

export const TRAFFIC = {
  halfW: 0.9, // half width of an AI car
  playerHalfW: 0.9, // half width of the player's car
  footHalfW: 0.4, // half width of a person on foot
  margin: 0.3, // a little room to spare beside the lane
  look: 26, // m ahead an AI car watches its own lane
  stopGap: 9, // m it stops short of the player
  beside: 5, // m to the side that counts as the next lane over
  easeLook: 40, // m ahead it eases off for a car in the next lane
  farR: 700, // past this from the player (well past the 650 m draw range): move the car
  stuckT: 20, // s at a standstill before a stuck car is moved
  stuckNearR: 150, // ...but only while the player is further off than this
  stuckMaxT: 60, // s stuck before it is moved even if the player could see it
  spawnR: [450, 680], // a moved car comes back this far from the player
  viewR: 650, // cars are drawn this far out
  viewCos: 0.5, // in front of the player: within 60 degrees of where they face
  closeR: 60, // this close, the player sees it whichever way they face
};

// Where (x, y) is from a car at (cx, cy) facing `heading`: metres ahead
// (along) and metres to its right (lat).
export function relTo(cx, cy, heading, x, y) {
  const fx = Math.sin(heading * DEG);
  const fy = -Math.cos(heading * DEG);
  const dx = x - cx;
  const dy = y - cy;
  return { along: dx * fx + dy * fy, lat: dx * -fy + dy * fx };
}

// Is something `otherHalfW` wide at (along, lat) in the car's own lane ahead?
// The car drives at its lane centre, so lat is the offset from that centre.
export function inLane(along, lat, otherHalfW, T = TRAFFIC) {
  return along > -1 && along < T.look && Math.abs(lat) < T.halfW + otherHalfW + T.margin;
}

// Top speed an AI car may hold with the player at (along, lat) from it.
// In its lane: slow and stop short. In the next lane (an oncoming car
// passing): ease off a little, never stop. Otherwise no limit.
export function playerSpeedCap(along, lat, onFoot, T = TRAFFIC) {
  if (inLane(along, lat, onFoot ? T.footHalfW : T.playerHalfW, T)) return Math.max(0, (along - T.stopGap) * 0.6);
  if (along > -4 && along < T.easeLook && Math.abs(lat) < T.beside) return along < 12 ? 6 : 9;
  return Infinity;
}

// Could the player see a car at distance d, `cos` being how square in front
// of them it is (1 dead ahead, -1 behind)?
export function seenByPlayer(d, cos, T = TRAFFIC) {
  if (d > T.viewR) return false;
  return d < T.closeR || cos > T.viewCos;
}

// Should a car be moved: 'far' (well out of range), 'stuck' (standing still
// too long, the player not close), or null.
export function respawnReason(d, stuckT, seen, T = TRAFFIC) {
  if (d > T.farR) return 'far';
  if (stuckT > T.stuckT && d > T.stuckNearR && (!seen || stuckT > T.stuckMaxT)) return 'stuck';
  return null;
}

// Is a spot fit for a moved car to come back at?
export function goodRespawn(d, seen, T = TRAFFIC) {
  return d > T.spawnR[0] && d < T.spawnR[1] && !seen;
}

// ---------- Honking at the player ----------
// A car the player holds up (their car, them on foot, or the parked car in
// its lane) honks with backoff. `blockedT` is seconds it has stood blocked.
// Bursts start at `at` s, the marks doubling (4, 8, 16), and each has more
// beeps than the last, the third ending in a long one. At `leanAt` it leans
// on the horn for `leanLen` s, then turns round (see turnPose).
// `grace`: s it must be clear before the count starts again, so a car
// creeping up a metre does not reset it.
export const HONK = {
  bursts: [
    { at: 4, beeps: [0.35] },
    { at: 8, beeps: [0.35, 0.35] },
    { at: 16, beeps: [0.4, 0.4, 1.1] },
  ],
  gap: 0.2, // s between beeps in a burst
  leanAt: 32,
  leanLen: 10,
  grace: 1,
  speed: 0.5, // m/s: slower than this...
  capBelow: 1, // ...with the player's speed cap (playerSpeedCap) below this counts as blocked
};

// Is the horn sounding after `blockedT` s blocked?
export function hornOn(blockedT, H = HONK) {
  if (blockedT >= H.leanAt) return blockedT < H.leanAt + H.leanLen;
  for (const b of H.bursts) {
    let t = blockedT - b.at;
    if (t < 0) break;
    for (const len of b.beeps) {
      if (t < len) return true;
      t -= len + H.gap;
      if (t < 0) break;
    }
  }
  return false;
}

// 'wait' (before the first honk), 'honk' (short bursts), 'lean', or 'turn'
// (time to turn round).
export function honkStage(blockedT, H = HONK) {
  if (blockedT >= H.leanAt + H.leanLen) return 'turn';
  if (blockedT >= H.leanAt) return 'lean';
  return blockedT >= H.bursts[0].at ? 'honk' : 'wait';
}

// Step a car's honk count, st = { t, clearT }. Returns st.t.
export function stepBlocked(st, blocked, dt, H = HONK) {
  if (blocked) {
    st.t += dt;
    st.clearT = 0;
  } else {
    st.clearT += dt;
    if (st.clearT >= H.grace) st.t = 0;
  }
  return st.t;
}

// A three-point turn on a road `w` m wide, in the car's own frame at the
// start: u metres ahead along the road, v metres right of the centre line,
// h degrees turned (negative = left). Forward on left lock to the far side,
// back on right lock to the near side, forward into the other lane facing
// back the way it came. The car centre keeps `edgeIn` m inside each edge,
// so only a corner reaches the verge. It goes at most 3 m forward, so it
// turns short of the player who stopped it (stopGap ahead).
export const TURN = {
  edgeIn: 1.3,
  legs: [2.6, 2.2, 2.6], // s per leg
};
function turnKeys(w) {
  const e = w / 2 - TURN.edgeIn;
  return [
    { u: 0, v: w / 4, h: 0 },
    { u: 1.5, v: -e, h: -95, rev: false },
    { u: 3, v: e, h: -150, rev: true },
    { u: -1.5, v: -w / 4, h: -180, rev: false },
  ];
}
export const turnLength = () => TURN.legs.reduce((a, b) => a + b, 0);

// Pose `t` s into the turn: { u, v, h, reverse, done }.
export function turnPose(w, t) {
  const K = turnKeys(w);
  let i = 0;
  while (i < TURN.legs.length - 1 && t > TURN.legs[i]) t -= TURN.legs[i++];
  const x = Math.max(0, Math.min(1, t / TURN.legs[i]));
  const s = x * x * (3 - 2 * x); // eases to a stop at each keyframe
  const a = K[i];
  const b = K[i + 1];
  const dir = b.rev ? -1 : 1;
  const L = Math.hypot(b.u - a.u, b.v - a.v);
  // Hermite curve whose ends point the way the car faces (backwards when
  // reversing), so it moves like a car instead of sliding sideways.
  const au = Math.cos(a.h * DEG) * dir * L;
  const av = Math.sin(a.h * DEG) * dir * L;
  const bu = Math.cos(b.h * DEG) * dir * L;
  const bv = Math.sin(b.h * DEG) * dir * L;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return {
    u: h00 * a.u + h10 * au + h01 * b.u + h11 * bu,
    v: h00 * a.v + h10 * av + h01 * b.v + h11 * bv,
    h: a.h + (b.h - a.h) * s,
    reverse: !!b.rev,
    done: i === TURN.legs.length - 1 && x >= 1,
  };
}
