// The panel van's pieces beyond its lofted body (#46, SPEC 9q tier 2),
// drawn through the same builder as the other kits (trafficKit.js), so the
// coarse and the fine van carry the same pieces and the 36 to 44 m
// cross-fade doesn't pop.
//
// Every van (B.part(null), no kit bit): two rear doors with a split line,
// glass, hinges and a handle; tall tail lamps on the coarse body (the fine
// body draws its own, trafficfine.js); a sliding side door on the right
// (curb) side with its track; a roof vent.
// Kit parts (src/ambient/carkit.js KIT_FITS.van): a roof rack with a rear
// ladder ('rack'), pipes on it ('rackLoad'), a ladder on two roof bars
// ('ladder'), mud flaps ('flaps'). The business paint ('stripe',
// 'lowerTone') and the odd door are drawn by the traffic shader.
//
//   vanKit(B)   // B: the kit builder (trafficKit.js)

import { SPECS, sectionAt } from './carbody.js';

const S = SPECS.van;

// x of the right side at height y, at station z (the section points
// from the sill to the roof edge), pushed out by lift.
function sideX(z, y, lift = 0.006) {
  const { pts } = sectionAt(S, z);
  for (let j = 0; j < 8; j++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[j + 1];
    if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / (by - ay || 1) + lift;
  }
  return pts[3][0] + lift;
}

// A thin dark line drawn down the right side at z, from y0 to y1.
function lineDown(B, z, y0, y1, th = 0.012) {
  const n = 6;
  for (let k = 0; k < n; k++) {
    const ya = y0 + ((y1 - y0) * k) / n;
    const yb = y0 + ((y1 - y0) * (k + 1)) / n;
    B.rod([sideX(z, ya), ya, z], [sideX(z, yb), yb, z], th, 'gap');
  }
}
// A thin line (or bar) along the right side at height y, from z0 to z1.
function lineAlong(B, y, z0, z1, th = 0.012, mat = 'gap', lift = 0.006) {
  const n = Math.max(1, Math.ceil((z1 - z0) / 0.5));
  for (let k = 0; k < n; k++) {
    const za = z0 + ((z1 - z0) * k) / n;
    const zb = z0 + ((z1 - z0) * (k + 1)) / n;
    B.rod([sideX(za, y, lift), y, za], [sideX(zb, y, lift), y, zb], th, mat);
  }
}

// Sliding door on the right side: its edges, top and bottom lines, a handle,
// and the track it runs on, from the door's back edge to the rear corner.
const SLIDE = [0.42, 1.62]; // z of its front and back edge
function slidingDoor(B) {
  const yLo = S.y0 + 0.1;
  const yHi = S.roofY - S.edge - 0.06;
  const [z0, z1] = SLIDE;
  if (B.fine) {
    lineDown(B, z0, yLo, yHi);
    lineDown(B, z1, yLo, yHi);
    lineAlong(B, yHi, z0, z1);
    lineAlong(B, yLo + 0.02, z0, z1);
    // Handle near the front edge.
    const hy = 1.18;
    const hx = sideX(z0 + 0.16, hy, 0.014);
    B.box(hx, hy, z0 + 0.16, 0.024, 0.034, 0.17, 'satin');
    B.box(hx + 0.008, hy + 0.006, z0 + 0.16, 0.012, 0.01, 0.15, 'chrome');
  }
  // The track: a dark channel along the side at the belt, behind the door.
  lineAlong(B, 1.3, z1 - 0.05, S.half - 0.32, B.fine ? 0.035 : 0.04, 'satin', 0.012);
}

// Rear doors on the flat back (z = half): split line, glass in black rubber,
// hinges, a handle, and on the coarse body the tall tail lamps.
function rearDoors(B) {
  const h = S.half;
  const z = h + 0.012;
  for (const x of [-1, 1]) {
    B.box(x * 0.4, 1.56, z - 0.002, 0.64, 0.48, 0.012, 'black');
    B.box(x * 0.4, 1.56, z + 0.002, 0.58, 0.42, 0.012, 'glass');
    if (B.fine) {
      for (const y of [0.78, 1.72]) B.box(x * 0.83, y, z, 0.08, 0.12, 0.03, 'black');
    } else {
      // Tall tail lamps (the fine body draws its own from the atlas).
      B.box(x * (S.hw - 0.12), 0.95, z, 0.2, 0.36, 0.02, 'tail');
    }
  }
  if (B.fine) {
    B.box(0, (S.y0 + 0.14 + S.roofY - 0.1) / 2, z, 0.012, S.roofY - 0.1 - S.y0 - 0.14, 0.006, 'gap');
    B.box(0.11, 1.2, z + 0.01, 0.16, 0.035, 0.03, 'chrome');
    B.box(0.11, 1.2, z + 0.002, 0.2, 0.06, 0.01, 'satin');
  }
}

// Tall work van mirrors on top of the small car ones (trafficfine / traffic3d).
function mirrors(B) {
  const z = S.zA + 0.16;
  const y = S.belt(z) + 0.2;
  for (const s of [-1, 1]) {
    B.box(s * (S.hw + 0.13), y, z, 0.05, 0.3, 0.17, 'black');
    B.rod([s * (S.hw - 0.02), y - 0.12, z], [s * (S.hw + 0.12), y - 0.12, z], 0.025, 'black');
  }
}

// Roof: a low vent near the middle.
function roofVent(B) {
  const y = S.roofY + 0.04;
  B.box(0, y + 0.03, 0.9, 0.5, 0.06, 0.5, 'satin');
  if (B.fine) B.box(0, y + 0.07, 0.9, 0.42, 0.02, 0.42, 'black');
}

// The roof's edge (the drip rail) at z, and the height of the roof bars.
const edgeAt = (z) => sectionAt(S, z).pts[8];
const BAR_Y = S.roofY + 0.13;

// Roof rack: side rails on feet over the drip rails, cross bars, and a
// ladder down the right rear door.
function roofRack(B) {
  const z0 = -0.55;
  const z1 = S.half - 0.22;
  const rx = 0.76;
  const ry = BAR_Y + 0.06;
  const bars = [z0, -0.55 + (z1 - z0) * 0.25, -0.55 + (z1 - z0) * 0.5, -0.55 + (z1 - z0) * 0.75, z1];
  for (const s of [-1, 1]) {
    B.box(s * rx, ry, (z0 + z1) / 2, 0.035, 0.035, z1 - z0 + 0.04, 'rack');
    for (const z of bars) {
      const e = edgeAt(z);
      B.rod([s * (e[0] - 0.02), e[1], z], [s * rx, ry, z], 0.045, 'rack');
    }
  }
  for (const z of bars) B.box(0, BAR_Y, z, rx * 2, 0.035, 0.045, 'rack');
  if (B.fine) for (const z of bars.slice(0, -1)) B.box(0, BAR_Y, z + (z1 - z0) / 8, rx * 2, 0.02, 0.03, 'rack');
  // Rear ladder: two rails standing off the right door, rungs, a hoop over the top.
  const lz = S.half + 0.1;
  const lx = [0.52, 0.82];
  for (const x of lx) {
    B.rod([x, 0.62, lz], [x, ry, lz], 0.035, 'rack');
    B.rod([x, ry, lz], [x, ry, z1], 0.035, 'rack');
    for (const y of [0.75, 1.75]) B.rod([x, y, lz], [x, y, S.half + 0.01], 0.03, 'rack');
  }
  for (let y = 0.8; y < ry - 0.1; y += B.fine ? 0.28 : 0.56) B.box((lx[0] + lx[1]) / 2, y, lz, lx[1] - lx[0], 0.025, 0.025, 'rack');
}

// Pipes on the rack: a strapped bundle of long conduit.
function rackPipes(B) {
  const y = BAR_Y + 0.06;
  const z0 = -0.75;
  const z1 = S.half - 0.05;
  for (const [x, dy] of [[-0.42, 0], [-0.34, 0], [-0.26, 0], [-0.38, 0.07], [-0.3, 0.07]]) B.rod([x, y + dy, z0], [x, y + dy, z1], 0.06, 'steel');
  if (B.fine) for (const z of [-0.1, 1.9]) B.box(-0.34, y + 0.035, z, 0.26, 0.16, 0.03, 'strap');
}

// A ladder on two roof bars (bars of its own, on feet at the drip rails).
function roofLadder(B) {
  const zs = [-0.2, 1.9];
  for (const z of zs) {
    const e = edgeAt(z);
    B.box(0, BAR_Y, z, e[0] * 2 - 0.08, 0.035, 0.045, 'rack');
    for (const s of [-1, 1]) B.rod([s * (e[0] - 0.02), e[1], z], [s * (e[0] - 0.03), BAR_Y, z], 0.045, 'rack');
  }
  const y = BAR_Y + 0.045;
  const z0 = -1.05;
  const z1 = S.half + 0.12;
  for (const x of [0.16, 0.6]) B.box(x, y, (z0 + z1) / 2, 0.04, 0.06, z1 - z0, 'alu');
  for (let z = z0 + 0.14; z < z1 - 0.05; z += B.fine ? 0.28 : 0.56) B.box(0.38, y, z, 0.44, 0.025, 0.03, 'alu');
}

function flaps(B) {
  const z = S.wheels[1][0] + S.archR + 0.03;
  for (const s of [-1, 1]) {
    B.box(s * (S.hw - 0.15), S.y0 - 0.06, z, 0.26, 0.34, 0.015, 'flap');
    if (B.fine) B.box(s * (S.hw - 0.15), S.y0 + 0.12, z - 0.02, 0.26, 0.025, 0.04, 'steel');
  }
}

export function vanKit(B) {
  B.part(null);
  rearDoors(B);
  slidingDoor(B);
  roofVent(B);
  mirrors(B);
  B.part('rack');
  roofRack(B);
  B.part('rackLoad');
  rackPipes(B);
  B.part('ladder');
  roofLadder(B);
  B.part('flaps');
  flaps(B);
}
