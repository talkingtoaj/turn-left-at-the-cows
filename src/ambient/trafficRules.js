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
