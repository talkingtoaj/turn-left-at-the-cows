// Shared layout: the parts that make up each building and landmark, plus the
// seeded scenery (trees, yards, fields). Both the renderer and the collider read
// from here so what you see is what you hit.

import {
  makeRng, localToWorld, pointInPolygon, distToPolygonEdge,
  polygonArea, bbox, circleHitsRect, SegIndex, measurePolyline, pointAlong,
} from './geom.js';

// Gas station, in the building's local frame (w = 22, h = 14).
export const GAS = {
  canopy: { lx: 0, ly: -3.5, w: 22, h: 7 },
  shop: { lx: -4, ly: 4, w: 12, h: 6 },
  islands: [
    { lx: -5, ly: -3.5, w: 4, h: 1.4 },
    { lx: 5, ly: -3.5, w: 4, h: 1.4 },
  ],
};

export const CHURCH = {
  nave: { lx: 0, ly: 3, w: 11, h: 22 },
  tower: { lx: 0, ly: -11, w: 7, h: 7 },
};

export const WATER_TOWER = {
  legs: [[-6, -6], [6, -6], [6, 6], [-6, 6]], // splayed, so feet show past the tank
  legR: 0.7,
  tankR: 6.5,
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
};

export const RADIO_MAST = {
  baseR: 1.5,
  anchorDist: 26,
  anchorAngles: [30, 150, 270],
  anchorR: 0.8,
};

export const SILO = { dx: 4.5, ly: -3, r: 3.2 }; // dx is past the barn's east end

export const TREE_HIT_R = 1.0;
export const LOCAL_HIT_R = 0.5;

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
      rects: [partRect(b.x, b.y, a, GAS.shop), ...GAS.islands.map((p) => partRect(b.x, b.y, a, p))],
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

export function landmarkSolids(l) {
  const rects = [];
  const circles = [];
  if (l.kind === 'church') {
    rects.push(partRect(l.x, l.y, 0, CHURCH.nave), partRect(l.x, l.y, 0, CHURCH.tower));
  } else if (l.kind === 'water_tower') {
    for (const [lx, ly] of WATER_TOWER.legs) circles.push({ x: l.x + lx, y: l.y + ly, r: WATER_TOWER.legR });
  } else if (l.kind === 'mill_ruin') {
    for (const w of MILL.walls) rects.push(partRect(l.x, l.y, 0, w));
    rects.push(partRect(l.x, l.y, 0, MILL.chimney));
  } else if (l.kind === 'radio_mast') {
    circles.push({ x: l.x, y: l.y, r: RADIO_MAST.baseR });
    for (const p of anchorPoints(l)) circles.push({ x: p.x, y: p.y, r: RADIO_MAST.anchorR });
  }
  return { rects, circles };
}

// Yards and fields drawn on the ground. Not solid, but trees keep off them.
// kind: 'concrete' | 'yard' | 'field' | 'gravel'
function makePads(world) {
  const pads = [];
  for (const b of world.buildings) {
    if (b.kind === 'gas') pads.push({ kind: 'concrete', x: b.x, y: b.y - 2, w: b.w + 12, h: b.h + 10, angle: b.angle || 0 });
    if (b.kind === 'shop' || b.kind === 'store' || b.kind === 'diner') {
      pads.push({ kind: 'gravel', x: b.x - 4, y: b.y, w: b.w + 14, h: b.h + 8, angle: b.angle || 0 });
    }
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
  ];
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
    for (const c of clear) if (Math.abs(x - c.x) < c.r && Math.abs(y - c.y) < c.r && Math.hypot(x - c.x, y - c.y) < c.r) return true;
    return false;
  };
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
  function addTree(x, y, kind, r) {
    const t = { x, y, kind, r, tint: rng() };
    trees.push(t);
    const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
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

  return { trees, pads, bushes };
}
