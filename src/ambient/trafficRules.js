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

// ---------- Junctions (SPEC 9q) ----------
// Traffic slows before a turn and drives a curve from its lane on one road
// to its lane on the next; blinks the amber lamp a few seconds first; on a
// dirt road meeting a paved one it stops at the STOP sign, waits, and goes
// when clear (paved roads never stop); it waits for cars already in the
// junction and for the player. Dead ends and broken bridges: a three-point
// turn (turnPose), never a flip on the spot.
export const JUNCTION = {
  brake: 2.2, // m/s² a car slows at for a turn or a stop line
  turnV: [4.5, 11], // m/s through a square turn ... a gentle bend
  blinkT: 3.5, // s before the turn the amber lamp starts
  blinkMin: 18, // ...and at least this many metres out
  blinkPeriod: 0.8, // s per on / off cycle
  stopWait: 1.2, // s stood still at a STOP sign before it may go
  stopBack: 3.8, // m behind the paved road's edge the car centre stops
  entryRoom: 2.5, // m past the other road's edge the curve starts and ends
  clearT: 4, // s: a car this soon to reach the junction is in the way
  clearPad: 6, // m around the junction that counts as in it
  bendDeg: 20, // turning less than this is no turn (no blink)
  deadEndStop: 7, // m short of a dead end the car stops to turn round
  blockStop: 22, // m short of a fallen tree it stops to turn round
  bridgeStop: 8, // m short of a broken bridge's end
  pathOn: 16, // m of lane past the junction that must be free of the player
  pathClear: 3.2, // m from that path the player counts as in the way
};

// Top speed `dist` m before a point it must pass at `vAt` m/s (0 to stop there).
export function brakeCap(dist, vAt = 0, J = JUNCTION) {
  return Math.sqrt(vAt * vAt + 2 * J.brake * Math.max(0, dist));
}

// Speed through a turn of `deg` degrees (0 straight on, 90 square, 180 back).
// Sharper than square (a hairpin onto a road that runs back) is slower still.
export function turnSpeed(deg, J = JUNCTION) {
  const k = Math.min(1.25, Math.abs(deg) / 90);
  return Math.max(J.turnV[0] * 0.75, J.turnV[1] + (J.turnV[0] - J.turnV[1]) * k);
}

// Extra metres a turn of `deg` degrees starts and ends from the junction:
// none up to a square turn, more for a hairpin so it is not taken on the spot.
export function turnRoom(deg) {
  return Math.max(0, Math.abs(deg) - 80) * 0.09;
}

// -1 a left turn, 1 right, 0 straight on (headings in degrees, clockwise).
export function turnSide(hIn, hOut, J = JUNCTION) {
  let d = (hOut - hIn) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  if (Math.abs(d) < J.bendDeg) return 0;
  return d > 0 ? 1 : -1;
}

// Is the blinker lit `t` s after it started? Starts lit.
export function blinkLit(t, J = JUNCTION) {
  return ((t / J.blinkPeriod) % 1 + 1) % 1 < 0.5;
}

// Should the blinker be on `dist` m before the turn at `speed` m/s?
export function blinkNow(dist, speed, J = JUNCTION) {
  return dist < Math.max(J.blinkMin, speed * J.blinkT);
}

// Which road arms at a junction stop. `arms`: [{ paved, through }], one per
// road meeting there, `through` when the junction is part way along it (two
// arms) rather than at its end (one). A dirt road stops where a paved road
// carries on through the junction (two paved arms or more): not where it
// only runs on into one paved road end to end. Paved roads never stop.
export function stopsAt(arms) {
  const paved = arms.reduce((s, a) => s + (a.paved ? (a.through ? 2 : 1) : 0), 0);
  return arms.map((a) => !a.paved && paved >= 2);
}

// A curve in the car's lane from p0 (heading h0) to p3 (heading h3):
// a cubic Bezier sampled into short steps. { pts: [[x, y]], cum, len }.
export function junctionCurve(p0, h0, p3, h3, steps = 24) {
  const L = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  // Control arm: about the corner radius for a square turn, longer on a
  // gentle bend so the car does not swerve.
  const turn = Math.abs(turnSideDeg(h0, h3));
  const arm = L * (turn > 120 ? 0.75 : 0.42 + 0.2 * (1 - Math.min(1, turn / 90)));
  const f0 = [Math.sin(h0 * Math.PI / 180), -Math.cos(h0 * Math.PI / 180)];
  const f3 = [Math.sin(h3 * Math.PI / 180), -Math.cos(h3 * Math.PI / 180)];
  const p1 = [p0[0] + f0[0] * arm, p0[1] + f0[1] * arm];
  const p2 = [p3[0] - f3[0] * arm, p3[1] - f3[1] * arm];
  const pts = [];
  const cum = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t * t;
    const d = t ** 3;
    const p = [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
    cum.push(i ? cum[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0);
    pts.push(p);
  }
  return { pts, cum, len: cum[steps], h0, h3 };
}
function turnSideDeg(h0, h3) {
  let d = (h3 - h0) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Point `u` m along a junction curve: { x, y, h } (h: heading in degrees).
export function curveAt(cv, u) {
  const { pts, cum } = cv;
  const n = pts.length - 1;
  if (u <= 0) return { x: pts[0][0], y: pts[0][1], h: cv.h0 };
  if (u >= cv.len) return { x: pts[n][0], y: pts[n][1], h: cv.h3 };
  let i = 0;
  while (i < n - 1 && cum[i + 1] < u) i++;
  const t = (u - cum[i]) / (cum[i + 1] - cum[i] || 1);
  const a = pts[i];
  const b = pts[i + 1];
  const h = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, h: (h + 360) % 360 };
}

// Is a car at (x, y) going `speed` m/s on heading `h` about to reach a
// junction at (jx, jy) with radius `r`: inside it, or heading for it and
// there within clearT s?
export function headedInto(x, y, h, speed, jx, jy, r, J = JUNCTION) {
  const d = Math.hypot(jx - x, jy - y);
  if (d < r) return true;
  if (speed < 1) return false;
  const rel = relTo(x, y, h, jx, jy);
  if (rel.along <= 0 || Math.abs(rel.lat) > r) return false;
  return d - r < speed * J.clearT;
}
