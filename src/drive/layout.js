// Shared layout: the parts that make up each building and landmark, plus the
// seeded scenery (trees, yards, fields). Both the renderer and the collider read
// from here so what you see is what you hit.

import {
  makeRng, localToWorld, pointInPolygon, distToPolygonEdge,
  polygonArea, bbox, circleHitsRect, SegIndex, measurePolyline, pointAlong, nearestOnPolyline,
} from './geom.js';
import { pickFallenTrees } from '../world/fallenTrees.js';
import { AIRFIELD, airfieldFrame } from '../world/airfield.js';

// Gas station, in the building's local frame (w = 22, h = 14).
export const GAS = {
  canopy: { lx: 0, ly: -3.5, w: 22, h: 7 },
  shop: { lx: -4, ly: 4, w: 12, h: 6 },
  islands: [
    { lx: -5, ly: -3.5, w: 4, h: 1.4 },
    { lx: 5, ly: -3.5, w: 4, h: 1.4 },
  ],
  sign: { lx: -14, ly: -12, w: 2.2, h: 0.4 }, // price sign by the road (two posts)
};

export const CHURCH = {
  nave: { lx: 0, ly: 3, w: 11, h: 22 },
  tower: { lx: 0, ly: -11, w: 7, h: 7 },
};

export const WATER_TOWER = {
  legs: [[-6, -6], [6, -6], [6, 6], [-6, 6]], // splayed, so feet show past the tank
  legR: 0.7,
  tankR: 6.5,
  riserR: 0.8, // the pipe up the middle (#60)
};

// Burned mill: what is left of the walls, as local rects.
export const MILL = {
  walls: [
    { lx: -5.5, ly: -6.5, w: 7, h: 1.2 },
    { lx: 6, ly: -6.5, w: 5, h: 1.2 },
    { lx: 8.4, ly: -2.5, w: 1.2, h: 7 },
    { lx: -0.5, ly: 6.5, w: 15, h: 1.2 },
    { lx: -8.4, ly: 0.5, w: 1.2, h: 11 },
    { lx: 1.5, ly: 0, w: 1, h: 5 },
  ],
  chimney: { lx: -6, ly: 4, w: 2.4, h: 2.4 },
  // The water wheel, fallen in the fire, leaning on the creek-side wall.
  wheel: { lx: -5.5, ly: -8.4, w: 6.8, h: 1.8, r: 3.2 },
};

export const RADIO_MAST = {
  baseR: 1.5,
  anchorDist: 26,
  anchorAngles: [30, 150, 270],
  anchorR: 0.8,
};

export const SILO = { dx: 4.5, ly: -3, r: 3.2 }; // dx is past the barn's east end

// Calder grain silos: three tall bins in a row, an elevator leg and a scale house.
export const GRAIN = {
  bins: [{ lx: -10, ly: 2, r: 4.6 }, { lx: 0, ly: 2, r: 4.6 }, { lx: 10, ly: 2, r: 4.6 }],
  leg: { lx: 0, ly: -6.5, w: 3.4, h: 3.4 },
  office: { lx: 17, ly: 9, w: 6, h: 4.5 },
  binH: 24,
  legH: 36,
};

// Fire lookout: four splayed legs and a cab on top.
export const LOOKOUT = {
  legs: [[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]],
  legR: 0.45,
  cab: 4.6,
  H: 24,
};

// Covered bridge (sits on its bridge; local y runs along the road).
// The middle fell into the river; the two bank ends still stand.
export const COVERED = {
  wallT: 0.45, // wall thickness
  barrierBack: 4, // barrier sits this far back from the broken edge
};

// Quarry pit, in units of the landmark radius r. The haul ramp opens toward the road.
export const QUARRY = {
  terraces: [0.92, 0.74, 0.56, 0.38, 0.22],
  rimR: 0.97, // boulder ring
  boulderR: 1.1,
  boulderStep: 7, // metres between rim boulders
  gapHalf: 18, // degrees each side of the ramp opening left without boulders
};

// Campground: everything north of the centre (the road runs past the south side).
export const CAMP = {
  pads: [
    { lx: -24, ly: -10, tent: 0x3f7f5a }, { lx: -12, ly: -20, tent: 0xd08a2a },
    { lx: 2, ly: -24, tent: null }, { lx: 16, ly: -20, tent: 0x3a6fa8 },
    { lx: 27, ly: -9, tent: 0xb84a3a }, { lx: -3, ly: -4, tent: null },
  ],
  tent: { w: 2.6, h: 3.2 },
  tables: [[-24, -2], [-12, -12], [2, -15], [16, -12], [27, -1], [8, 3]],
  table: { w: 1.9, h: 0.9 },
  fire: { lx: 4, ly: -6, r: 1.1 },
  hut: { lx: -28, ly: -26, w: 4.5, h: 3.5 },
  loop: { lx: 2, ly: -10, rx: 32, ry: 17 },
};

// Ruins and old things (drawn by src3/world3d/ruins3d.js). Local frames as
// usual: lx right, ly back (south at angle 0).
// Abandoned farmhouse: the house (sagging roof), a collapsed shed, a hand
// pump in the yard and a windpump with its wheel half gone.
export const FARM_RUIN = {
  house: { lx: 0, ly: 0, w: 11, h: 8.5 },
  shed: { lx: 13, ly: 5, w: 7, h: 5.5 },
  pump: { lx: -5.5, ly: 7.5, r: 0.35 },
  windpump: { lx: 10, ly: -9 },
};
// A rusting truck: its body, angle from the landmark.
export const TRUCK = { w: 2.3, h: 5.8 };
// A parked visitor's estate car (kind 'parked_car', issue 27): its footprint.
export const PARKED_CAR = { w: 1.9, h: 4.7 };
// Disused railway: the bank (bottom width, top width, height) along the
// landmark's `points`; the halt platform and shelter beside it.
export const RAILWAY = {
  bank: { bottom: 7.4, top: 3.6, h: 0.85 },
  platform: { w: 3.4, len: 28, h: 0.9 },
  shelter: { w: 2.4, len: 4.2, at: 5 }, // at: metres along from the platform middle
};
// Wooden grain elevator: the tall bin house and the low driveway shed in front.
export const ELEVATOR = {
  main: { lx: 0, ly: 0, w: 9, h: 9 },
  annex: { lx: 0, ly: 8.5, w: 7, h: 8 },
  H: 21,
};
// Farm windpump (windmill pumping water): four splayed legs.
export const WINDPUMP = {
  legs: [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]],
  legR: 0.18,
  H: 10.5,
  wheelR: 1.7,
};

// The track frame at a railway landmark's halt: nearest point on the line to
// (l.x, l.y), heading along the line (deg), and which side the platform is
// on (1 right of the heading, -1 left). Shared so solids and drawing agree.
export function railFrame(l) {
  const p = nearestOnPolyline(l.x, l.y, l.points);
  const side = (-p.dy) * (l.x - p.x) + p.dx * (l.y - p.y) > 0 ? 1 : -1;
  return { x: p.x, y: p.y, dx: p.dx, dy: p.dy, angle: (Math.atan2(-p.dx, p.dy) * 180) / Math.PI, side };
}

// A rect along segment a-b (world [x, y]) of the given width.
function segRect(a, b, w) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w, h: Math.hypot(dx, dy), angle: (Math.atan2(-dx, dy) * 180) / Math.PI };
}

export const TREE_HIT_R = 1.0;
export const LOCAL_HIT_R = 0.5;
export const POLE_R = 0.3; // power line poles (world.powerLines)

// Turn a local rect part into a world rect.
export function partRect(cx, cy, angle, p) {
  const c = localToWorld(cx, cy, angle, p.lx, p.ly);
  return { x: c.x, y: c.y, w: p.w, h: p.h, angle };
}

export function anchorPoints(l) {
  return RADIO_MAST.anchorAngles.map((a) => {
    const r = (a * Math.PI) / 180;
    return { x: l.x + Math.sin(r) * RADIO_MAST.anchorDist, y: l.y - Math.cos(r) * RADIO_MAST.anchorDist };
  });
}

// Solid shapes for one building: { rects: [...], circles: [...] }.
export function buildingSolids(b) {
  const a = b.angle || 0;
  if (b.kind === 'gas') {
    return {
      rects: [partRect(b.x, b.y, a, GAS.shop), ...GAS.islands.map((p) => partRect(b.x, b.y, a, p)), partRect(b.x, b.y, a, GAS.sign)],
      circles: [],
    };
  }
  const rects = [{ x: b.x, y: b.y, w: b.w, h: b.h, angle: a }];
  const circles = [];
  if (b.kind === 'barn') {
    const c = localToWorld(b.x, b.y, a, b.w / 2 + SILO.dx, SILO.ly);
    circles.push({ x: c.x, y: c.y, r: SILO.r });
  }
  return { rects, circles };
}

// Nearest point on any road to (x, y): { x, y, d }.
function nearestRoadPoint(world, x, y) {
  let best = null;
  for (const r of world.roads) {
    const p = nearestOnPolyline(x, y, r.points);
    if (!best || p.d < best.d) best = p;
  }
  return best;
}

// Angle (deg, clockwise from +x) from the quarry centre toward its road.
export function quarryOpening(world, l) {
  const p = nearestRoadPoint(world, l.x, l.y);
  if (!p || p.d > (l.r || 90) * 3) return 180;
  return (Math.atan2(p.y - l.y, p.x - l.x) * 180) / Math.PI;
}

// Boulders along the quarry rim, leaving a gap at the ramp and around any
// building that stands on the rim (the quarry office).
export function quarryBoulders(l, opening, world = null) {
  const R = (l.r || 90) * QUARRY.rimR;
  const near = world ? world.buildings.filter((b) => Math.hypot(b.x - l.x, b.y - l.y) < R + 40) : [];
  const n = Math.floor((2 * Math.PI * R) / QUARRY.boulderStep);
  const out = [];
  for (let i = 0; i < n; i++) {
    const deg = (i / n) * 360;
    let diff = Math.abs(((deg - opening) % 360 + 540) % 360 - 180);
    if (diff < QUARRY.gapHalf) continue;
    const wob = ((i * 37) % 7) / 7 - 0.5;
    const a = (deg * Math.PI) / 180;
    const x = l.x + Math.cos(a) * (R + wob * 2);
    const y = l.y + Math.sin(a) * (R + wob * 2);
    if (near.some((b) => circleHitsRect(x, y, 5, { x: b.x, y: b.y, w: b.w, h: b.h, angle: b.angle || 0 }))) continue;
    out.push({ x, y, r: QUARRY.boulderR * (0.8 + ((i * 13) % 5) / 10) });
  }
  return out;
}

// Covered bridge pieces in world rects: walls on each standing end and a barrier.
export function coveredParts(l, bridge) {
  const W = bridge ? bridge.width : 8;
  const L = bridge ? bridge.length : 40;
  const water = bridge ? bridge.waterWidth || 22 : 22;
  const a = bridge ? bridge.angle : l.angle || 0;
  const cx = bridge ? bridge.x : l.x;
  const cy = bridge ? bridge.y : l.y;
  const stub = (L - water) / 2 + 1.5; // standing length on each bank
  const ends = [];
  for (const dir of [-1, 1]) {
    const outer = dir * (L / 2);
    const inner = dir * (L / 2 - stub);
    const mid = (outer + inner) / 2;
    ends.push({
      dir, outer, inner, mid, len: stub,
      walls: [-1, 1].map((side) => partRect(cx, cy, a, { lx: side * (W / 2 - COVERED.wallT / 2), ly: mid, w: COVERED.wallT, h: stub })),
      barrier: partRect(cx, cy, a, { lx: 0, ly: inner + dir * COVERED.barrierBack, w: W - COVERED.wallT * 2, h: 0.5 }),
    });
  }
  return { cx, cy, a, W, L, water, stub, ends };
}

export function landmarkSolids(l, world = null) {
  const rects = [];
  const circles = [];
  if (l.kind === 'grain_silos') {
    for (const b of GRAIN.bins) {
      const c = localToWorld(l.x, l.y, l.angle || 0, b.lx, b.ly);
      circles.push({ x: c.x, y: c.y, r: b.r });
    }
    rects.push(partRect(l.x, l.y, l.angle || 0, GRAIN.leg), partRect(l.x, l.y, l.angle || 0, GRAIN.office));
  } else if (l.kind === 'lookout_tower') {
    for (const [lx, ly] of LOOKOUT.legs) circles.push({ x: l.x + lx, y: l.y + ly, r: LOOKOUT.legR });
  } else if (l.kind === 'covered_bridge') {
    const bridge = world && world.bridges.find((b) => b.id === l.bridgeId);
    for (const e of coveredParts(l, bridge).ends) rects.push(...e.walls, e.barrier);
  } else if (l.kind === 'quarry') {
    const open = world ? quarryOpening(world, l) : 180;
    circles.push(...quarryBoulders(l, open, world));
  } else if (l.kind === 'campground') {
    for (const p of CAMP.pads) if (p.tent) rects.push(partRect(l.x, l.y, 0, { lx: p.lx, ly: p.ly, ...CAMP.tent }));
    for (const [lx, ly] of CAMP.tables) rects.push(partRect(l.x, l.y, 0, { lx, ly, ...CAMP.table }));
    const f = localToWorld(l.x, l.y, 0, CAMP.fire.lx, CAMP.fire.ly);
    circles.push({ x: f.x, y: f.y, r: CAMP.fire.r });
    rects.push(partRect(l.x, l.y, 0, CAMP.hut));
  }
  if (l.kind === 'church') {
    rects.push(partRect(l.x, l.y, 0, CHURCH.nave), partRect(l.x, l.y, 0, CHURCH.tower));
  } else if (l.kind === 'water_tower') {
    for (const [lx, ly] of WATER_TOWER.legs) circles.push({ x: l.x + lx, y: l.y + ly, r: WATER_TOWER.legR });
    circles.push({ x: l.x, y: l.y, r: WATER_TOWER.riserR });
  } else if (l.kind === 'mill_ruin') {
    for (const w of MILL.walls) rects.push(partRect(l.x, l.y, 0, w));
    rects.push(partRect(l.x, l.y, 0, MILL.chimney), partRect(l.x, l.y, 0, MILL.wheel));
  } else if (l.kind === 'radio_mast') {
    circles.push({ x: l.x, y: l.y, r: RADIO_MAST.baseR });
    for (const p of anchorPoints(l)) circles.push({ x: p.x, y: p.y, r: RADIO_MAST.anchorR });
  } else if (l.kind === 'farm_ruin') {
    const a = l.angle || 0;
    rects.push(partRect(l.x, l.y, a, FARM_RUIN.house), partRect(l.x, l.y, a, FARM_RUIN.shed));
    const p = localToWorld(l.x, l.y, a, FARM_RUIN.pump.lx, FARM_RUIN.pump.ly);
    circles.push({ x: p.x, y: p.y, r: FARM_RUIN.pump.r });
    const w = localToWorld(l.x, l.y, a, FARM_RUIN.windpump.lx, FARM_RUIN.windpump.ly);
    for (const [lx, ly] of WINDPUMP.legs) circles.push({ x: w.x + lx, y: w.y + ly, r: WINDPUMP.legR });
  } else if (l.kind === 'rusty_truck') {
    rects.push(partRect(l.x, l.y, l.angle || 0, { lx: 0, ly: 0, ...TRUCK }));
  } else if (l.kind === 'parked_car') {
    rects.push(partRect(l.x, l.y, l.angle || 0, { lx: 0, ly: 0, ...PARKED_CAR }));
  } else if (l.kind === 'railway') {
    // The bank is solid (a car cannot climb it), with the platform and shelter.
    const B = RAILWAY.bank;
    for (let i = 0; i < l.points.length - 1; i++) rects.push(segRect(l.points[i], l.points[i + 1], B.bottom - 1.2));
    for (const p of l.points.slice(1, -1)) circles.push({ x: p[0], y: p[1], r: (B.bottom - 1.2) / 2 });
    const f = railFrame(l);
    const off = B.bottom / 2 + RAILWAY.platform.w / 2 - 0.4;
    const rx = -f.dy * f.side;
    const ry = f.dx * f.side;
    const pa = [f.x + rx * off - f.dx * RAILWAY.platform.len / 2, f.y + ry * off - f.dy * RAILWAY.platform.len / 2];
    const pb = [f.x + rx * off + f.dx * RAILWAY.platform.len / 2, f.y + ry * off + f.dy * RAILWAY.platform.len / 2];
    rects.push(segRect(pa, pb, RAILWAY.platform.w));
  } else if (l.kind === 'grain_elevator') {
    rects.push(partRect(l.x, l.y, l.angle || 0, ELEVATOR.main), partRect(l.x, l.y, l.angle || 0, ELEVATOR.annex));
  } else if (l.kind === 'windpump') {
    for (const [lx, ly] of WINDPUMP.legs) circles.push({ x: l.x + lx, y: l.y + ly, r: WINDPUMP.legR });
  } else if (l.kind === 'airfield') {
    // Parked planes (their fuselages; the car fits under a high wing), the
    // windsock pole and the fuel pump. The hangars and clubhouse are buildings.
    const f = airfieldFrame(l);
    for (const pl of AIRFIELD.parked) {
      const c = f.at(pl.s, pl.t);
      const h = f.heading(pl.h) * (Math.PI / 180);
      for (const hit of AIRFIELD.planeHits) circles.push({ x: c.x + Math.sin(h) * hit.f, y: c.y - Math.cos(h) * hit.f, r: hit.r });
    }
    const ws = f.at(AIRFIELD.windsock.s, AIRFIELD.windsock.t);
    circles.push({ x: ws.x, y: ws.y, r: 0.25 });
    const pp = f.at(AIRFIELD.pump.s, AIRFIELD.pump.t);
    rects.push({ x: pp.x, y: pp.y, w: AIRFIELD.pump.w, h: AIRFIELD.pump.h, angle: f.angle });
  }
  return { rects, circles };
}

// Field fences: runs of posts along each field's polygon, broken where a road
// or a mailbox comes close. Shared by the renderer and the collider.
// Fields with `fence: null` have none. style: 'wire' | 'rail' (wooden rails,
// posts further apart).
// Returns [{ fieldId, field, style, runs: [[{x, y}, ...], ...] }]; cached per world.
export const FENCE = { step: 1.5, railStep: 2.6, postR: 0.4, roadPad: 4 };
const fenceCache = new WeakMap();
export function fenceRuns(world) {
  if (fenceCache.has(world)) return fenceCache.get(world);
  const roads = new SegIndex(32);
  for (const r of world.roads) roads.addPolyline(r.points, r.width / 2 + FENCE.roadPad, r.width / 2 + FENCE.roadPad);
  const mbs = world.mailboxes || [];
  const blocked = (x, y) => roads.minDist(x, y, (s) => s.data) < 0
    || mbs.some((m) => Math.hypot(m.x - x, m.y - y) < 4);
  const out = [];
  for (const f of world.fields || []) {
    const style = f.fence === undefined ? 'wire' : f.fence;
    if (!style) continue;
    const step = style === 'rail' ? FENCE.railStep : FENCE.step;
    // Every post around the loop, with a flag for gaps.
    const pts = [];
    const poly = f.polygon;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const y = ay + ((by - ay) * k) / n;
        pts.push({ x, y, gap: blocked(x, y) });
      }
    }
    const runs = [];
    const firstGap = pts.findIndex((p) => p.gap);
    if (firstGap < 0) {
      runs.push(pts.concat([pts[0]]));
    } else {
      // Start just after a gap so no run wraps round the end of the list.
      let run = [];
      for (let k = 1; k <= pts.length; k++) {
        const p = pts[(firstGap + k) % pts.length];
        if (p.gap) {
          if (run.length > 1) runs.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length > 1) runs.push(run);
    }
    out.push({ fieldId: f.id, field: f, style, runs });
  }
  fenceCache.set(world, out);
  return out;
}

export function fenceSolids(world) {
  const circles = [];
  for (const f of fenceRuns(world)) for (const run of f.runs) for (const p of run) circles.push({ x: p.x, y: p.y, r: FENCE.postR });
  return { rects: [], circles };
}

// Yards and fields drawn on the ground. Not solid, but trees keep off them.
// kind: 'concrete' | 'yard' | 'field' | 'gravel'
export function makePads(world) {
  const pads = [];
  for (const b of world.buildings) {
    if (b.kind === 'gas') pads.push({ kind: 'concrete', x: b.x, y: b.y - 2, w: b.w + 12, h: b.h + 10, angle: b.angle || 0 });
    if (b.kind === 'shop' || b.kind === 'store' || b.kind === 'diner') {
      pads.push({ kind: 'gravel', x: b.x - 4, y: b.y, w: b.w + 14, h: b.h + 8, angle: b.angle || 0 });
    }
  }
  // Airfield: a gravel apron in front of the hangars, the car park, and a
  // concrete pad under the fuel pump (src/world/airfield.js).
  for (const l of world.landmarks) {
    if (l.kind !== 'airfield') continue;
    const f = airfieldFrame(l);
    for (const [kind, r] of [['gravel', AIRFIELD.apron], ['gravel', AIRFIELD.carPark], ['concrete', AIRFIELD.pumpPad]]) {
      const c = f.at(r.s, r.t);
      // Pads are w across and h along `angle` (a heading): along the runway is w here.
      pads.push({ kind, x: c.x, y: c.y, w: r.h, h: r.w, angle: f.angle });
    }
  }

  // Quarry: a gravel apron from the end of its road to the pit rim.
  for (const l of world.landmarks) {
    if (l.kind !== 'quarry') continue;
    const open = (quarryOpening(world, l) * Math.PI) / 180;
    const R = (l.r || 90) * QUARRY.terraces[0];
    const end = nearestRoadPoint(world, l.x, l.y);
    const rim = { x: l.x + Math.cos(open) * (R - 6), y: l.y + Math.sin(open) * (R - 6) };
    const from = end && end.d < (l.r || 90) * 3 ? end : { x: l.x + Math.cos(open) * (R + 30), y: l.y + Math.sin(open) * (R + 30) };
    const dx = rim.x - from.x;
    const dy = rim.y - from.y;
    pads.push({
      kind: 'gravel', x: (rim.x + from.x) / 2, y: (rim.y + from.y) / 2, w: 34, h: Math.hypot(dx, dy) + 8,
      angle: (Math.atan2(-dx, dy) * 180) / Math.PI,
    });
  }

  // Fire lookout: a dirt track from the nearest road to the tower foot.
  for (const l of world.landmarks) {
    if (l.kind !== 'lookout_tower') continue;
    const end = nearestRoadPoint(world, l.x, l.y);
    if (!end || end.d < 12) continue;
    const dx = l.x - end.x;
    const dy = l.y - end.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const stop = len - 8; // ends at a small turning patch by the legs
    pads.push({
      kind: 'track', x: end.x + (ux * stop) / 2, y: end.y + (uy * stop) / 2, w: 3.6, h: stop,
      angle: (Math.atan2(-dx, dy) * 180) / Math.PI,
    });
    pads.push({ kind: 'track', x: l.x - ux * 2, y: l.y - uy * 2, w: 16, h: 16, angle: (Math.atan2(-dx, dy) * 180) / Math.PI });
  }

  // One yard per farm (buildings sharing a `farm` id).
  const farms = new Map();
  for (const b of world.buildings) {
    if (!b.farm) continue;
    if (!farms.has(b.farm)) farms.set(b.farm, []);
    farms.get(b.farm).push(b);
  }
  for (const [farmId, list] of farms) {
    const barn = list.find((b) => b.kind === 'barn');
    const farmhouse = list.find((b) => b.kind === 'farmhouse');
    if (!barn || !farmhouse) continue;
    const minX = Math.min(barn.x - barn.w / 2, farmhouse.x - farmhouse.w / 2) - 10;
    const maxX = Math.max(barn.x + barn.w / 2, farmhouse.x + farmhouse.w / 2) + 16;
    const minY = Math.min(barn.y - barn.h / 2, farmhouse.y - farmhouse.h / 2) - 8;
    const maxY = Math.max(barn.y + barn.h / 2, farmhouse.y + farmhouse.h / 2) + 14;
    pads.push({ kind: 'yard', x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, angle: 0 });
    // Hartley Farm has a crop field north of the farm buildings.
    if (farmId === 'hartley') pads.push({ kind: 'field', x: barn.x - 5, y: minY - 45, w: 110, h: 60, angle: 0, rows: 0 });
  }
  return pads;
}

// Everything trees must keep away from. Returns true if (x, y) is a bad spot.
function makeTreeRejector(world, pads) {
  const solids = [];
  for (const b of world.buildings) {
    const s = buildingSolids(b);
    solids.push(...s.rects.map((r) => ({ ...r, w: r.w + 8, h: r.h + 8 })));
  }
  // Roads and water in a spatial index, so each check only looks nearby.
  const lines = new SegIndex(48);
  for (const r of world.roads) lines.addPolyline(r.points, 12, 12);
  for (const c of world.creeks) lines.addPolyline(c.points, c.width / 2 + 3, c.width / 2 + 3);
  // Long landmarks (the old railway bank).
  for (const l of world.landmarks) if (l.points) lines.addPolyline(l.points, 10, 10);
  const lakes = world.lakes.map((l) => ({ ...l, bb: bbox(l.polygon) }));
  const fields = (world.fields || []).map((f) => ({ ...f, bb: bbox(f.polygon) }));
  const clear = [
    { x: world.start.x, y: world.start.y, r: 20 },
    ...(world.places || []).map((p) => ({ x: p.x, y: p.y, r: (p.r || 25) + 5 })),
    ...world.landmarks.map((l) => ({
      x: l.x, y: l.y, r: l.clearR || (l.kind === 'radio_mast' ? 34 : l.kind === 'church' ? 26 : 20),
    })),
    ...world.signs.map((s) => ({ x: s.x, y: s.y, r: 8 })),
    ...world.locals.map((l) => ({ x: l.x, y: l.y, r: 10 })),
    ...(world.mailboxes || []).map((m) => ({ x: m.x, y: m.y, r: 4 })),
    ...(world.props || []).map((p) => ({ x: p.x, y: p.y, r: p.r + 3 })),
    ...(world.dressing || []).map((p) => ({ x: p.x, y: p.y, r: (p.r || 2) + 3 })),
    ...(world.powerLines || []).flatMap((l) => l.poles.map((p) => ({ x: p.x, y: p.y, r: 4 }))),
  ];
  // Clear circles in a spatial index too (zero-length segments, data = radius).
  const clearIdx = new SegIndex(48);
  for (const c of clear) clearIdx.add(c.x, c.y, c.x, c.y, c.r, c.r);
  return function reject(x, y) {
    if (x < 5 || y < 5 || x > world.size.w - 5 || y > world.size.h - 5) return true;
    if (lines.minDist(x, y, (s) => s.data) < 0) return true;
    for (const l of lakes) {
      if (x < l.bb.minX - 6 || x > l.bb.maxX + 6 || y < l.bb.minY - 6 || y > l.bb.maxY + 6) continue;
      if (pointInPolygon(x, y, l.polygon) || distToPolygonEdge(x, y, l.polygon) < 6) return true;
    }
    for (const f of fields) {
      if (x < f.bb.minX - 4 || x > f.bb.maxX + 4 || y < f.bb.minY - 4 || y > f.bb.maxY + 4) continue;
      if (pointInPolygon(x, y, f.polygon) || distToPolygonEdge(x, y, f.polygon) < 4) return true;
    }
    for (const r of solids) if (Math.abs(x - r.x) < 40 && Math.abs(y - r.y) < 40 && circleHitsRect(x, y, 4, r)) return true;
    for (const p of pads) if (Math.abs(x - p.x) < 120 && Math.abs(y - p.y) < 120 && circleHitsRect(x, y, 5, p)) return true;
    if (clearIdx.minDist(x, y, (s) => s.data) < 0) return true;
    return false;
  };
}

const centroidOf = (poly) => [
  poly.reduce((t, p) => t + p[0], 0) / poly.length,
  poly.reduce((t, p) => t + p[1], 0) / poly.length,
];

// The polygon edge furthest from any road (by its midpoint): where a windbreak goes.
export function farEdge(world, poly) {
  let best = null;
  let bestD = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const p = nearestRoadPoint(world, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const d = p ? p.d : 0;
    if (d > bestD) {
      bestD = d;
      best = [a, b];
    }
  }
  return best;
}

// Builds the seeded scenery. Same seed gives the same world every run.
export function generateScenery(world) {
  const rng = makeRng(world.seed);
  const pads = makePads(world);
  const reject = makeTreeRejector(world, pads);
  const trees = [];

  // Keep trees from overlapping each other using a coarse grid.
  const CELL = 8;
  const grid = new Map();
  const key = (cx, cy) => cx * 10000 + cy;
  function tooClose(x, y, minD) {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = grid.get(key(cx + i, cy + j));
        if (!list) continue;
        for (const t of list) if (Math.hypot(t.x - x, t.y - y) < minD) return true;
      }
    }
    return false;
  }
  function addTreeToGrid(t) {
    const k = key(Math.floor(t.x / CELL), Math.floor(t.y / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  function addTree(x, y, kind, r) {
    const t = { x, y, kind, r, tint: rng() };
    trees.push(t);
    addTreeToGrid(t);
  }
  function tryTree(x, y, kind, r, minD = 3.5) {
    if (reject(x, y) || tooClose(x, y, minD)) return false;
    addTree(x, y, kind, r);
    return true;
  }

  // Forests: a mix of pines and broadleaf trees.
  for (const f of world.forests) {
    const target = Math.round(polygonArea(f.polygon) * f.density);
    const bb = bbox(f.polygon);
    let placed = 0;
    for (let attempt = 0; attempt < target * 6 && placed < target; attempt++) {
      const x = bb.minX + rng() * (bb.maxX - bb.minX);
      const y = bb.minY + rng() * (bb.maxY - bb.minY);
      if (!pointInPolygon(x, y, f.polygon)) continue;
      const pine = rng() < 0.55;
      if (tryTree(x, y, pine ? 'pine' : 'oak', pine ? 2.8 + rng() * 1.8 : 3.4 + rng() * 2.4, 5)) placed++;
    }
  }

  // Willows along the creek banks.
  for (const c of world.creeks) {
    const cum = measurePolyline(c.points);
    const total = cum[cum.length - 1];
    for (let d = rng() * 40; d < total; d += 25 + rng() * 60) {
      const p = pointAlong(c.points, cum, d);
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (c.width / 2 + 5 + rng() * 6);
      tryTree(p.x - p.dy * off, p.y + p.dx * off, 'willow', 3 + rng() * 1.5);
    }
  }

  // Windbreaks: a row of trees just beyond the field edge furthest from the
  // road. Own random stream, so the rest of the scenery keeps its sequence.
  const wrng = makeRng((world.seed ^ 0x77a1c3) >>> 0);
  for (const f of world.fields || []) {
    if (!f.windbreak) continue;
    const [a, b] = farEdge(world, f.polygon);
    const [cx, cy] = centroidOf(f.polygon);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    // Outward normal: away from the field middle.
    let nx = -uy;
    let ny = ux;
    if ((a[0] - cx) * nx + (a[1] - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const pine = wrng() < 0.5;
    for (let d = 3 + wrng() * 3; d < len - 2; d += 6 + wrng() * 2.5) {
      const off = 5.5 + wrng() * 1.5;
      const x = a[0] + ux * d + nx * off;
      const y = a[1] + uy * d + ny * off;
      if (reject(x, y) || tooClose(x, y, 3.5)) continue;
      const t = { x, y, kind: pine ? 'pine' : 'oak', r: pine ? 3 + wrng() * 1.2 : 3.6 + wrng() * 1.4, tint: wrng(), windbreak: true };
      trees.push(t);
      const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(t);
    }
  }

  // Loose trees and small clumps across the open country (70 per 9 km2).
  const clumps = Math.round((70 * world.size.w * world.size.h) / 9e6);
  for (let i = 0; i < clumps; i++) {
    const cx = rng() * world.size.w;
    const cy = rng() * world.size.h;
    const n = 1 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() - 0.5) * 24;
      const y = cy + (rng() - 0.5) * 24;
      tryTree(x, y, rng() < 0.3 ? 'pine' : 'oak', 2.6 + rng() * 2);
    }
  }

  // Garden trees in town yards.
  for (const town of world.towns) {
    for (let k = 0; k < 14; k++) {
      const a = rng() * Math.PI * 2;
      const d = 20 + rng() * 90;
      tryTree(town.x + Math.cos(a) * d, town.y + Math.sin(a) * d, 'oak', 2.4 + rng() * 1.6, 6);
    }
  }

  // Undergrowth in the forests: decoration only, not solid.
  const bushes = [];
  for (const f of world.forests) {
    const n = Math.round(polygonArea(f.polygon) * f.density * 1.6);
    const bb = bbox(f.polygon);
    for (let i = 0; i < n * 3; i++) {
      const x = bb.minX + rng() * (bb.maxX - bb.minX);
      const y = bb.minY + rng() * (bb.maxY - bb.minY);
      if (!pointInPolygon(x, y, f.polygon) || reject(x, y)) continue;
      bushes.push({ x, y, r: 0.8 + rng() * 1.2, tint: rng() });
    }
  }

  // A few roadside trees have blown down (src/world/fallenTrees.js): they
  // leave the standing trees and lie part way across the road instead.
  const fallen = pickFallenTrees(world, trees);
  const down = new Set(fallen.map((f) => f.tree));
  const standing = trees.filter((t) => !down.has(t));
  // Where the fallen tree stood among few others, its roadside row goes on:
  // a couple more of its kind along the road at the same distance.
  const frng = makeRng((world.seed ^ 0x3f11a) >>> 0);
  for (const f of fallen) {
    const near = standing.filter((t) => Math.hypot(t.x - f.x, t.y - f.y) < 25).length;
    if (near >= 3) continue;
    const road = world.roads.find((r) => r.id === f.roadId);
    const q = nearestOnPolyline(f.x, f.y, road.points);
    for (const along of [-1, 1, -2, 2]) {
      const d = along * (8 + frng() * 3);
      const x = f.x + q.dx * d + (frng() - 0.5) * 2;
      const y = f.y + q.dy * d + (frng() - 0.5) * 2;
      if (reject(x, y) || tooClose(x, y, 4)) continue;
      const t = { x, y, kind: f.kind, r: f.r * (0.85 + frng() * 0.3), tint: frng(), row: true };
      standing.push(t);
      addTreeToGrid(t);
    }
  }

  return { trees: standing, pads, bushes, fallen };
}
