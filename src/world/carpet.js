// The roadside carpet (SPEC 9q tier 1, roadside): grass blades near the
// camera and pebbles on dirt roads. Plain data and math, no engine code,
// seeded by position: the same spot always gets the same blades. The 3D
// side (src3/world3d/carpet3d.js) draws it; tools/check-carpet.mjs checks it.
//
// The ground is cut into TILE m squares. A tile's content is made once, the
// first time the camera comes near, and kept while it stays near:
//
//   const C = makeCarpet(world, R, heightAt, quarries)
//   C.tile(i, j) -> { grass: Float32Array (GRASS_STRIDE per blade clump),
//                     pebbles: Float32Array (PEBBLE_STRIDE per pebble) }
//   C.grassAt(x, y) -> 0 (none) .. 1 (full height) grass scale here
//
//   grass clump:  x, y (ground height), z, rot, scale, tint, rank
//   pebble:       x, y (top of the road bed), z, rot, size, tint
//
// World x, y map to three.js x, z as everywhere else (y is up in the
// records). rank (0..1) lets the far tiles draw only some clumps.
//
// Grass grows on open land and in pastures. Never on a road or its shoulder,
// a yard, pad, building, bridge, landmark, creek or lake (roughness fd), nor
// in a crop, hay or plowed field, a forest, a town lawn or a quarry.
// Pebbles lie on dirt roads: on the hump between the ruts and along the
// edges, never in the ruts, and not near road ends (junctions dip there).
//
// TileWindow decides, per camera move, which tiles should be up.

import { pointInPolygon, distToPolygonEdge, bbox, circleHitsRect } from '../drive/geom.js';
import { makePads } from '../drive/layout.js';
import { makeNoise, smoothstep } from './noise.js';

export const TILE = 8; // m
export const CARPET = {
  radius: 32, // m from the camera: no grass past this (the tussocks carry on)
  fade: 18, // m: blades start to shrink here, gone at radius
  full: 12, // m: every clump drawn inside this, fewer beyond
  farKeep: 0.35, // share of clumps drawn at the radius
  spacing: 0.5, // m between clumps (4 per square metre)
  roadGap: 1.25, // m beyond a road edge or flat feature before grass grows
  pebbleSpacing: 0.55,
  pebbleEndGap: 14, // m from a road end: no pebbles (junction dips)
};
export const GRASS_STRIDE = 7;
export const PEBBLE_STRIDE = 6;
const DIRT_LIFT = 0.04; // src3/world3d/ground.js
const NO_GRASS = new Set(['crop', 'hay', 'plowed', 'forest', 'lawn']);

// Position hash, 0..1.
const hash = (x, y, s) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

export function makeCarpet(world, R, heightAt, quarries = []) {
  const nDry = makeNoise((world.seed || 1) + 4401);
  const nPatch = makeNoise((world.seed || 1) + 4402);
  // Forests and crop fields exactly (the roughness patches blend at their edges).
  const forests = [
    ...(world.forests || []).map((f) => ({ poly: f.polygon, bb: bbox(f.polygon), pad: 2 })),
    ...(world.fields || []).filter((f) => f.kind === 'crop').map((f) => ({ poly: f.polygon, bb: bbox(f.polygon), pad: 0.6 })),
  ];
  const ends = [];
  for (const r of world.roads) {
    ends.push(r.points[0], r.points[r.points.length - 1]);
  }
  const nearEnd = (x, y, d) => ends.some(([ex, ey]) => Math.abs(ex - x) < d && Math.abs(ey - y) < d && Math.hypot(ex - x, ey - y) < d);
  // Yards and pads exactly (fd rounds a big pad's corners off).
  const pads = makePads(world).filter((p) => p.kind !== 'field');
  const onPad = (x, y) => pads.some((p) => Math.abs(p.x - x) < p.w + p.h && Math.abs(p.y - y) < p.w + p.h && circleHitsRect(x, y, 0.8, p));
  const inQuarry = (x, y) => quarries.some((q) => Math.hypot(x - q.x, y - q.y) < q.r * 1.25);
  const inForest = (x, y) => forests.some((f) => x > f.bb.minX - f.pad && x < f.bb.maxX + f.pad && y > f.bb.minY - f.pad && y < f.bb.maxY + f.pad
    && (pointInPolygon(x, y, f.poly) || distToPolygonEdge(x, y, f.poly) < f.pad));

  // Grass scale here: 0 where none grows.
  function grassAt(x, y) {
    if (x < 2 || y < 2 || x > world.size.w - 2 || y > world.size.h - 2) return 0;
    const g = R.at(x, y);
    if (!(g.fd >= CARPET.roadGap)) return 0;
    if (NO_GRASS.has(g.type)) return 0;
    if (g.type !== 'pasture' && g.open < 0.5) return 0;
    if (inForest(x, y) || inQuarry(x, y) || onPad(x, y)) return 0;
    // Shorter in grazed pasture and right by the road (mown verge).
    let s = g.type === 'pasture' ? 0.6 : 1;
    s *= 0.6 + 0.4 * smoothstep(CARPET.roadGap, CARPET.roadGap + 3, g.fd);
    return s;
  }

  function tile(i, j) {
    const x0 = i * TILE;
    const y0 = j * TILE;
    const grass = [];
    const sp = CARPET.spacing;
    const n = Math.round(TILE / sp);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const gx = x0 + (a + 0.5) * (TILE / n);
        const gy = y0 + (b + 0.5) * (TILE / n);
        const x = gx + (hash(gx, gy, 1) - 0.5) * sp * 0.9;
        const y = gy + (hash(gx, gy, 2) - 0.5) * sp * 0.9;
        // Patchy: thinner in places, so it reads as a meadow, not a lawn.
        const patch = 0.5 + 0.5 * nPatch(x / 9, y / 9);
        if (hash(gx, gy, 3) > 0.35 + 0.65 * patch) continue;
        const s = grassAt(x, y);
        if (s <= 0) continue;
        const dry = 0.5 + 0.5 * nDry(x / 25, y / 25);
        grass.push(
          x, heightAt(x, y) - 0.02, y,
          hash(gx, gy, 4) * Math.PI * 2,
          s * (0.75 + 0.5 * hash(gx, gy, 5)) * (0.85 + 0.3 * patch),
          Math.min(1, dry * 0.7 + hash(gx, gy, 6) * 0.3),
          hash(gx, gy, 7),
        );
      }
    }

    // Pebbles: only if a dirt road can be in this tile.
    const pebbles = [];
    const cx = x0 + TILE / 2;
    const cy = y0 + TILE / 2;
    const near = R.roadDist(cx, cy);
    if (near < TILE * 0.75 + 1 && !nearEnd(cx, cy, CARPET.pebbleEndGap + TILE)) {
      const ps = CARPET.pebbleSpacing;
      const m = Math.round(TILE / ps);
      for (let a = 0; a < m; a++) {
        for (let b = 0; b < m; b++) {
          const gx = x0 + (a + 0.5) * (TILE / m);
          const gy = y0 + (b + 0.5) * (TILE / m);
          const x = gx + (hash(gx, gy, 11) - 0.5) * ps;
          const y = gy + (hash(gx, gy, 12) - 0.5) * ps;
          const k = pebbleAt(x, y);
          if (k <= 0 || hash(gx, gy, 13) > k) continue;
          const size = 0.05 + 0.1 * hash(gx, gy, 14) ** 2;
          pebbles.push(x, heightAt(x, y) + DIRT_LIFT - size * 0.25, y, hash(gx, gy, 15) * Math.PI * 2, size, hash(gx, gy, 16));
        }
      }
    }
    return { grass: new Float32Array(grass), pebbles: new Float32Array(pebbles) };
  }

  // Chance (0..1) of a pebble at (x, y): on a dirt road, on the hump and the
  // edges, none in the ruts or near a road end or a creek, bridge or yard.
  function pebbleAt(x, y) {
    const d = R.roadDist(x, y);
    const rd = R._road;
    if (!rd || rd.type !== 'dirt' || d > 0.7) return 0;
    if (nearEnd(x, y, CARPET.pebbleEndGap)) return 0;
    if (R.flatDist(x, y) < 0) return 0;
    const c = d + rd.half; // metres from the centre line
    const rel = c / rd.half;
    // Ruts at 0.44 of the half width (roadbumps.js RUT_AT 0.22 of the width).
    if (Math.abs(rel - 0.44) < 0.24) return 0;
    if (rel < 0.2) return 0.55; // the hump
    if (rel > 0.75) return rel > 1 ? 0.5 : 0.8; // the edge and the shoulder
    return 0.12;
  }

  return { tile, grassAt, pebbleAt };
}

// How many clumps of a tile to draw at distance d (m) from the camera: all
// within `full`, thinning to farKeep at the radius, none beyond.
export function keepShare(d) {
  if (d > CARPET.radius + TILE) return 0;
  return 1 - (1 - CARPET.farKeep) * smoothstep(CARPET.full, CARPET.radius, d);
}

// Which tiles should be up around the camera. update(x, y) says whether the
// set changed and which tiles to show; tiles not built yet are listed in
// `missing` (the caller builds a few per frame, nearest first).
export class TileWindow {
  constructor(radius = CARPET.radius) {
    this.radius = radius;
    this.ci = NaN;
    this.cj = NaN;
    this.keys = [];
  }

  // Returns { changed, tiles: [{ i, j, key, d }] } sorted nearest first.
  update(x, y) {
    const ci = Math.floor(x / TILE);
    const cj = Math.floor(y / TILE);
    if (ci === this.ci && cj === this.cj) return { changed: false, tiles: this.tiles };
    this.ci = ci;
    this.cj = cj;
    const span = Math.ceil(this.radius / TILE) + 1;
    const tiles = [];
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        // Nearest point of the tile to the camera tile's centre.
        const tx = Math.max(i * TILE, Math.min((i + 1) * TILE, (ci + 0.5) * TILE));
        const ty = Math.max(j * TILE, Math.min((j + 1) * TILE, (cj + 0.5) * TILE));
        const d = Math.hypot(tx - (ci + 0.5) * TILE, ty - (cj + 0.5) * TILE);
        if (d > this.radius + TILE * 0.5) continue;
        tiles.push({ i, j, key: `${i},${j}`, d });
      }
    }
    tiles.sort((a, b) => a.d - b.d);
    this.tiles = tiles;
    return { changed: true, tiles };
  }
}
