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
//   C.flowerTile(i, j) -> Float32Array (FLOWER_STRIDE per flower clump)
//   C.dampAt(x, y)  -> 0 (dry) .. 1 (wet bottom)
//   C.flowerAt(x, y), C.cloverAt(x, y) -> 0..1 patch strength here
//
//   grass clump:  x, y (ground height), z, rot, scale, tint, rank
//   pebble:       x, y (top of the road bed), z, rot, size, tint
//   clover:       x, y, z, rot, scale, bloom (0 white .. 1 red), rank
//   flower:       x, y, z, rot, scale, kind (index into FLOWER_KINDS), rank
//
// Wildflowers and clover (SPEC 9q tier 1, item 6) grow in patches over the
// same ground as the grass (never on a road, its verge gap, or a yard), and
// the patches are bigger and thicker in damp bottoms: Willow Bottoms, the
// low ground by creeks and lakes (./mud.js) and hollows. Clover comes with
// the grass tiles (same reach). Flowers have their own, wider reach
// (FLOWER.radius), so a patch shows from further off: C.flowerTile.
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
import { mudFor } from './mud.js';

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
export const CLOVER_STRIDE = 7;
export const FLOWER_STRIDE = 7;
// Wildflowers (and clover) patches.
export const FLOWER = {
  radius: 64, // m from the camera: flowers drawn this far
  fade: 46, // m: they shrink into the ground from here to radius
  full: 24, // m: every clump drawn inside this, fewer beyond
  farKeep: 0.45,
  spacing: 1.0, // m between flower clump tries inside a patch
  cloverSpacing: 0.5,
};
// Midwest roadside and meadow flowers. damp: 1 likes wet ground, 0 dry, 0.5
// either. h: height (m) at scale 1.
export const FLOWER_KINDS = [
  { name: 'daisy', color: 0xeeeadb, damp: 0.3, h: 0.45 }, // oxeye daisy, Queen Anne's lace
  { name: 'susan', color: 0xe8ae1c, damp: 0.2, h: 0.5 }, // black-eyed Susan, goldenrod
  { name: 'chicory', color: 0x8199e0, damp: 0.1, h: 0.55 }, // chicory
  { name: 'ironweed', color: 0x8a46a6, damp: 0.85, h: 0.8 }, // ironweed, wild bergamot
  { name: 'joepye', color: 0xcd84a6, damp: 0.95, h: 0.75 }, // Joe-Pye weed
  { name: 'marigold', color: 0xf0c83a, damp: 1, h: 0.35 }, // marsh marigold
];
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
  const nFlower = makeNoise((world.seed || 1) + 4403);
  const nFlower2 = makeNoise((world.seed || 1) + 4404);
  const nKind = makeNoise((world.seed || 1) + 4405);
  const nClover = makeNoise((world.seed || 1) + 4406);
  const mud = mudFor(world);
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
  // While a tile is made, only the pads, forests and quarries that can
  // reach it are tested (scope); the answers are the same.
  let near = { pads, forests, quarries };
  const all = near;
  const scoped = (x0, y0, size) => {
    const x1 = x0 + size;
    const y1 = y0 + size;
    const m = 1; // m: points are jittered a little past the tile's edge
    return {
      pads: pads.filter((p) => p.x + p.w + p.h > x0 - m && p.x - p.w - p.h < x1 + m && p.y + p.w + p.h > y0 - m && p.y - p.w - p.h < y1 + m),
      forests: forests.filter((f) => f.bb.maxX + f.pad > x0 - m && f.bb.minX - f.pad < x1 + m && f.bb.maxY + f.pad > y0 - m && f.bb.minY - f.pad < y1 + m),
      quarries: quarries.filter((q) => q.x + q.r * 1.25 > x0 - m && q.x - q.r * 1.25 < x1 + m && q.y + q.r * 1.25 > y0 - m && q.y - q.r * 1.25 < y1 + m),
    };
  };
  const onPad = (x, y) => near.pads.some((p) => Math.abs(p.x - x) < p.w + p.h && Math.abs(p.y - y) < p.w + p.h && circleHitsRect(x, y, 0.8, p));
  const inQuarry = (x, y) => near.quarries.some((q) => Math.hypot(x - q.x, y - q.y) < q.r * 1.25);
  const inForest = (x, y) => near.forests.some((f) => x > f.bb.minX - f.pad && x < f.bb.maxX + f.pad && y > f.bb.minY - f.pad && y < f.bb.maxY + f.pad
    && (pointInPolygon(x, y, f.poly) || distToPolygonEdge(x, y, f.poly) < f.pad));

  // Grass scale here: 0 where none grows.
  function grassAt(x, y) {
    if (x < 2 || y < 2 || x > world.size.w - 2 || y > world.size.h - 2) return 0;
    return grassFrom(x, y, R.at(x, y));
  }
  // The same, from the ground at (x, y) already looked up (R.at).
  function grassFrom(x, y, g) {
    if (x < 2 || y < 2 || x > world.size.w - 2 || y > world.size.h - 2) return 0;
    if (!(g.fd >= CARPET.roadGap)) return 0;
    if (NO_GRASS.has(g.type)) return 0;
    if (g.type !== 'pasture' && g.open < 0.5) return 0;
    if (inForest(x, y) || inQuarry(x, y) || onPad(x, y)) return 0;
    // Shorter in grazed pasture and right by the road (mown verge).
    let s = g.type === 'pasture' ? 0.6 : 1;
    s *= 0.6 + 0.4 * smoothstep(CARPET.roadGap, CARPET.roadGap + 3, g.fd);
    return s;
  }

  // How damp the ground is: the wet bottoms (mud.js) and hollows.
  function dampAt(x, y) {
    return dampFrom(x, y, R.at(x, y, true).h);
  }
  // h: the ground's bump height there (R.at with height).
  function dampFrom(x, y, h) {
    return Math.min(1, Math.max(mud.at(x, y), 0.8 * smoothstep(0.1, -0.6, h)));
  }
  // Patch strength (0..1) of wildflowers here, before the ground rules; damp
  // ground lowers the bar, so its patches are bigger and run together.
  function flowerPatch(x, y, damp) {
    const n = 0.7 * nFlower(x / 26, y / 26) + 0.3 * nFlower2(x / 7, y / 7);
    const bar = 0.38 - 0.22 * damp;
    return smoothstep(bar, bar + 0.18, n);
  }
  function cloverPatch(x, y, damp, pasture) {
    const n = 0.75 * nClover(x / 11, y / 11) + 0.25 * nFlower2(x / 3.5 + 40, y / 3.5);
    const bar = 0.4 - 0.25 * damp - (pasture ? 0.15 : 0);
    return smoothstep(bar, bar + 0.15, n);
  }
  function flowerAt(x, y) {
    if (grassAt(x, y) <= 0) return 0;
    const pasture = R.at(x, y).type === 'pasture';
    return flowerPatch(x, y, dampAt(x, y)) * (pasture ? 0.45 : 1);
  }
  function cloverAt(x, y) {
    if (grassAt(x, y) <= 0) return 0;
    return cloverPatch(x, y, dampAt(x, y), R.at(x, y).type === 'pasture');
  }
  // Which flower grows here: the patch's own pick (low noise) leaning to the
  // wet-ground kinds in damp bottoms.
  function kindAt(x, y, damp, h) {
    const k = 0.5 + 0.5 * nKind(x / 40, y / 40);
    let best = 0;
    let bestS = -Infinity;
    for (let i = 0; i < FLOWER_KINDS.length; i++) {
      const f = FLOWER_KINDS[i];
      const s = -1.3 * Math.abs(f.damp - damp) - 1.6 * Math.abs(k - (i + 0.5) / FLOWER_KINDS.length) + 0.9 * h * hash(i, h, 9);
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    return best;
  }

  function flowerTile(i, j) {
    near = scoped(i * TILE, j * TILE, TILE);
    try {
      return flowerTileIn(i, j);
    } finally {
      near = all;
    }
  }
  function flowerTileIn(i, j) {
    const x0 = i * TILE;
    const y0 = j * TILE;
    const out = [];
    const sp = FLOWER.spacing;
    const n = Math.round(TILE / sp);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const gx = x0 + (a + 0.5) * (TILE / n);
        const gy = y0 + (b + 0.5) * (TILE / n);
        // Cheap reject first: no patch even at the dampest.
        const n0 = 0.7 * nFlower(gx / 26, gy / 26) + 0.3 * nFlower2(gx / 7, gy / 7);
        if (n0 < 0.02) continue;
        const x = gx + (hash(gx, gy, 21) - 0.5) * sp * 0.95;
        const y = gy + (hash(gx, gy, 22) - 0.5) * sp * 0.95;
        // One ground look-up (with height) serves grass, damp and pasture.
        const g = R.at(x, y, true);
        if (grassFrom(x, y, g) <= 0) continue;
        const pasture = g.type === 'pasture';
        const damp = dampFrom(x, y, g.h);
        const p = flowerPatch(x, y, damp) * (pasture ? 0.45 : 1);
        if (hash(gx, gy, 23) >= p * 0.75) continue;
        const kind = kindAt(x, y, damp, hash(gx, gy, 24));
        out.push(
          x, heightAt(x, y) - 0.02, y,
          hash(gx, gy, 25) * Math.PI * 2,
          (0.7 + 0.5 * hash(gx, gy, 26)) * (0.75 + 0.25 * p),
          kind,
          hash(gx, gy, 27),
        );
      }
    }
    return new Float32Array(out);
  }

  // Clover clumps in this tile (a finer grid, only inside clover patches).
  // A step of tileSteps: pauses (yield) every few rows.
  function* cloverTile(x0, y0, mine) {
    const out = [];
    const sp = FLOWER.cloverSpacing;
    const n = Math.round(TILE / sp);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const gx = x0 + (a + 0.5) * (TILE / n);
        const gy = y0 + (b + 0.5) * (TILE / n);
        const n0 = 0.75 * nClover(gx / 11, gy / 11) + 0.25 * nFlower2(gx / 3.5 + 40, gy / 3.5);
        if (n0 < 0.0) continue;
        const x = gx + (hash(gx, gy, 31) - 0.5) * sp * 0.9;
        const y = gy + (hash(gx, gy, 32) - 0.5) * sp * 0.9;
        const g = R.at(x, y, true);
        if (grassFrom(x, y, g) <= 0) continue;
        const pasture = g.type === 'pasture';
        const p = cloverPatch(x, y, dampFrom(x, y, g.h), pasture);
        if (hash(gx, gy, 33) >= p * 0.85) continue;
        out.push(
          x, heightAt(x, y) - 0.01, y,
          hash(gx, gy, 34) * Math.PI * 2,
          0.75 + 0.5 * hash(gx, gy, 35),
          hash(gx, gy, 36) < 0.25 ? 1 : hash(gx, gy, 37) * 0.3, // a few red clover heads among the white
          hash(gx, gy, 38),
        );
      }
      if ((a & 3) === 3) {
        near = all;
        yield;
        near = mine;
      }
    }
    return new Float32Array(out);
  }

  function tile(i, j) {
    const steps = tileSteps(i, j);
    let r = steps.next();
    while (!r.done) r = steps.next();
    return r.value;
  }
  // The same tile made in small steps: a generator that pauses (yield) every
  // few rows and returns the tile, so a caller can spread one tile over
  // frames. Other tiles may be made between its steps.
  function* tileSteps(i, j) {
    const mine = scoped(i * TILE, j * TILE, TILE);
    near = mine;
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
      if ((a & 3) === 3) {
        near = all;
        yield;
        near = mine;
      }
    }

    // Pebbles: only if a dirt road can be in this tile.
    const pebbles = [];
    const cx = x0 + TILE / 2;
    const cy = y0 + TILE / 2;
    const roadNear = R.roadDist(cx, cy);
    if (roadNear < TILE * 0.75 + 1 && !nearEnd(cx, cy, CARPET.pebbleEndGap + TILE)) {
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
        if ((a & 3) === 3) {
          near = all;
          yield;
          near = mine;
        }
      }
    }
    const clover = yield* cloverTile(x0, y0, mine);
    near = all;
    return { grass: new Float32Array(grass), pebbles: new Float32Array(pebbles), clover };
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

  return { tile, tileSteps, flowerTile, grassAt, pebbleAt, dampAt, flowerAt, cloverAt };
}

// How many clumps of a tile to draw at distance d (m) from the camera: all
// within `full`, thinning to farKeep at the radius, none beyond.
export function keepShare(d) {
  if (d > CARPET.radius + TILE) return 0;
  return 1 - (1 - CARPET.farKeep) * smoothstep(CARPET.full, CARPET.radius, d);
}

// The same for flowers, over their wider reach.
export function flowerKeepShare(d) {
  if (d > FLOWER.radius + TILE) return 0;
  return 1 - (1 - FLOWER.farKeep) * smoothstep(FLOWER.full, FLOWER.radius, d);
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
