// Terrain: a smooth, seeded height field, flattened near roads, water and
// buildings. Height is visual only; the gameplay stays 2D.
//
// The height grid is the single source of truth: the ground mesh is built from
// it with a known triangulation, and heightAt() interpolates the same
// triangles, so anything placed with heightAt() sits exactly on the ground.

import * as THREE from 'three';
import {
  makeRng, distToSegment, pointInPolygon, distToPolygonEdge, SegIndex, bbox,
} from '../../src/drive/geom.js';
import { buildingSolids, quarryOpening, QUARRY } from '../../src/drive/layout.js';
import { RoadBumps } from './roadbumps.js';
import { makeNoise, smoothstep } from '../../src/world/noise.js';
import { roughnessFor } from '../../src/world/roughness.js';
import { yardPlan } from '../../src/world/yards.js';
import { YardGround, SUB as YARD_SUB } from './yardGround.js';

export const CELL = 4; // metres between height samples
export const CHUNK = 250; // metres per ground mesh chunk
export const WATER_LEVEL = -0.6;
const BED = -1.7; // creek and lake bed

// Dirt roads keep this much of the hills under them (paved roads keep none),
// so they roll with the land.
export const DIRT_KEEP = 0.3;

// Seeded value noise and smoothstep live in src/world/noise.js (engine-free,
// shared with src/world/roughness.js).
export { makeNoise, smoothstep };

// ---------- quarry pit ----------

export const QUARRY_BENCH = 3.2; // metres per bench
const RAMP_HALF = 3.6;

// Same wobbly outline the Phaser renderer draws (render.js drawQuarry).
export const quarryWob = (t) => 1 + 0.05 * Math.sin(3 * t + 1) + 0.035 * Math.sin(5 * t + 2.3) + 0.02 * Math.sin(9 * t);

// Pit info for one quarry landmark: opening angle toward the road and the
// haul ramp polyline (curving down from the rim opening to the 4th bench).
export function quarryInfo(world, l) {
  const R = l.r || 90;
  const open = quarryOpening(world, l) * (Math.PI / 180);
  const ramp = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = open + t * 1.4;
    const rr = R * (0.96 - t * 0.7);
    ramp.push({ x: l.x + Math.cos(ang) * rr, y: l.y + Math.sin(ang) * rr, h: -QUARRY_BENCH * 4 * smoothstep(0.05, 1, t) });
  }
  return { x: l.x, y: l.y, r: R, open, ramp, floor: -QUARRY_BENCH * QUARRY.terraces.length };
}

// Height inside the pit, or null outside. { h, wall (0 bench, 1 face), level, ramp }
export function quarryPit(q, x, y) {
  const dx = x - q.x;
  const dy = y - q.y;
  const t = Math.atan2(dy, dx);
  const d = Math.hypot(dx, dy) / (q.r * quarryWob(t));
  if (d >= QUARRY.terraces[0] + 0.02) return null;
  let lvl = 0;
  let wall = 0;
  for (const k of QUARRY.terraces) {
    const s = smoothstep(k + 0.015, k - 0.02, d);
    lvl += s;
    if (s > 0.05 && s < 0.95) wall = 1;
  }
  let h = -QUARRY_BENCH * lvl;
  if (d < 0.13) h -= 1.2 * smoothstep(0.13, 0.09, d); // pool basin
  // Haul ramp: a smooth road cut down through the benches.
  let best = Infinity;
  let rh = 0;
  for (let i = 0; i < q.ramp.length - 1; i++) {
    const a = q.ramp[i];
    const b = q.ramp[i + 1];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey)));
    const dd = Math.hypot(x - a.x - ex * u, y - a.y - ey * u);
    if (dd < best) {
      best = dd;
      rh = a.h + (b.h - a.h) * u;
    }
  }
  let ramp = false;
  if (best < RAMP_HALF + 3) {
    const k = smoothstep(RAMP_HALF + 3, RAMP_HALF, best);
    h = h + (rh - h) * k;
    if (k > 0.5) {
      ramp = true;
      wall = 0;
    }
  }
  return { h, wall, level: Math.round(lvl), ramp };
}

// ---------- terrain ----------

export class Terrain {
  constructor(world) {
    this.world = world;
    this.cols = Math.round(world.size.w / CELL) + 1;
    this.rows = Math.round(world.size.h / CELL) + 1;
    this.h = new Float32Array(this.cols * this.rows);
    // Rough ground by patch (src/world/roughness.js): its big bumps go into
    // the height grid; the small ones are surface detail and ride only.
    this.rough = roughnessFor(world);
    this.roughGrid = new Uint8Array(this.cols * this.rows); // small roughness 0..255 per sample
    this.bumpGrid = new Float32Array(this.cols * this.rows); // big bump height (m) in each sample
    this.openGrid = new Uint8Array(this.cols * this.rows); // open countryside share 0..255 (districts tint)
    this.build();
    // Paths, banks and hollows by buildings (#85): finer cells cut into the grid.
    this.yard = new YardGround(this, yardPlan(world), CELL);
    this.bumps = new RoadBumps(world);
  }

  build() {
    const world = this.world;
    const noise = makeNoise(world.seed);
    const noise2 = makeNoise(world.seed + 31);

    // Raw rolling hills, mostly above road level.
    const mast = world.landmarks.find((l) => l.kind === 'radio_mast');
    const hills = world.hills || [];
    const raw = (x, y) => {
      let n = noise(x / 520, y / 520) * 0.6 + noise(x / 230 + 17, y / 230 + 5) * 0.3 + noise2(x / 90, y / 90) * 0.1;
      n = Math.max(0, n * 0.5 + 0.5);
      let h = 30 * Math.pow(n, 1.6);
      // The radio mast stands on a hill.
      if (mast) {
        const d2 = (x - mast.x) ** 2 + (y - mast.y) ** 2;
        h += 22 * Math.exp(-d2 / (2 * 130 * 130));
      }
      // Authored hills (world.hills), placed inside road bends.
      for (const hl of hills) {
        const dx = x - hl.x;
        const dy = y - hl.y;
        if (dx * dx + dy * dy > hl.r * hl.r * 6.25) continue;
        h += hl.h * Math.exp(-(dx * dx + dy * dy) / (2 * (hl.r * 0.6) ** 2));
      }
      return h;
    };

    const BLEND = 70;
    // Segments that pull the ground down to road level, each with its half
    // width, plus flat discs (as zero-length segments). Indexed by grid cell
    // so each height sample only checks nearby features.
    const flat = new SegIndex(64);
    for (const r of world.roads) if (r.type === 'paved') flat.addPolyline(r.points, r.width / 2 + 4 + BLEND, r.width / 2 + 4);
    // Dirt roads only flatten part way (DIRT_KEEP).
    const dirtFlat = new SegIndex(64);
    for (const r of world.roads) if (r.type !== 'paved') dirtFlat.addPolyline(r.points, r.width / 2 + 4 + BLEND, r.width / 2 + 4);
    const keep = (x, y) => THREE.MathUtils.lerp(DIRT_KEEP, 1, smoothstep(0, BLEND, dirtFlat.minDist(x, y, (s) => s.data)));
    for (const c of world.creeks) flat.addPolyline(c.points, c.width / 2 + 8 + BLEND, c.width / 2 + 8);
    const disc = (x, y, r) => flat.add(x, y, x, y, r + BLEND, r);
    for (const b of world.buildings) {
      const s = buildingSolids(b);
      for (const r of s.rects) disc(r.x, r.y, Math.hypot(r.w, r.h) / 2 + 10);
      for (const c of s.circles) disc(c.x, c.y, c.r + 10);
    }
    for (const l of world.landmarks) if (l.kind !== 'radio_mast' && l.kind !== 'lookout_tower') disc(l.x, l.y, l.r ? l.r + 10 : 30);
    // The old railway: graded level like a paved road.
    for (const l of world.landmarks) if (l.points) flat.addPolyline(l.points, 8 + BLEND, 8);
    for (const t of world.towns) disc(t.x, t.y, 90);
    for (const p of world.places || [world.goal]) disc(p.x, p.y, 70);
    const lakes = world.lakes.map((l) => ({ ...l, bb: bbox(l.polygon) }));
    const quarries = world.landmarks.filter((l) => l.kind === 'quarry').map((l) => quarryInfo(world, l));
    this.quarries = quarries;
    const water = new SegIndex(32);
    for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + 5, c);

    // Distance (beyond the flat zone) to the nearest flattening feature.
    const flatDist = (x, y) => {
      let best = flat.minDist(x, y, (s) => s.data);
      for (const l of lakes) {
        if (x < l.bb.minX - BLEND - 8 || x > l.bb.maxX + BLEND + 8 || y < l.bb.minY - BLEND - 8 || y > l.bb.maxY + BLEND + 8) continue;
        const d = pointInPolygon(x, y, l.polygon) ? -1 : distToPolygonEdge(x, y, l.polygon) - 8;
        if (d < best) best = d;
      }
      return best;
    };

    const flatK = (x, y) => Math.min(smoothstep(0, BLEND, flatDist(x, y)), keep(x, y));
    const mastH = mast ? raw(mast.x, mast.y) * flatK(mast.x, mast.y) : 0;

    for (let j = 0; j < this.rows; j++) {
      const y = j * CELL;
      for (let i = 0; i < this.cols; i++) {
        const x = i * CELL;
        let h = raw(x, y) * flatK(x, y);
        if (mast) {
          const dm = Math.hypot(x - mast.x, y - mast.y);
          if (dm < 55) h = THREE.MathUtils.lerp(mastH, h, smoothstep(32, 55, dm));
        }
        const g = this.rough.at(x, y, true);
        h += g.h;
        this.roughGrid[j * this.cols + i] = this.rough.off ? 0 : Math.round(g.rough * 255);
        this.bumpGrid[j * this.cols + i] = g.h;
        this.openGrid[j * this.cols + i] = Math.round(Math.max(0, Math.min(1, g.open)) * smoothstep(1, 8, g.fd) * 255);
        // Water: creek channel and lake basin.
        for (const s of water.near(x, y)) {
          const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
          const half = s.data.width / 2;
          if (d < half + 5) h = Math.min(h, THREE.MathUtils.lerp(BED, 0, smoothstep(half - 1, half + 4, d)));
        }
        for (const l of lakes) {
          if (x < l.bb.minX || x > l.bb.maxX || y < l.bb.minY || y > l.bb.maxY) continue;
          const inside = pointInPolygon(x, y, l.polygon);
          if (inside) h = Math.min(h, THREE.MathUtils.lerp(-0.2, BED, smoothstep(0, 6, distToPolygonEdge(x, y, l.polygon))));
        }
        for (const q of quarries) {
          const pit = quarryPit(q, x, y);
          if (pit) h = Math.min(h, pit.h);
        }
        this.h[j * this.cols + i] = h;
      }
    }
  }

  // Height at any world point: the ground mesh, plus the bumps and ruts of
  // dirt roads (drawn by the road mesh, see roadbumps.js).
  heightAt(x, y) {
    return this.gridHeightAt(x, y) + this.bumps.at(x, y);
  }

  // Height of the ground mesh itself, matching its triangles exactly.
  gridHeightAt(x, y) {
    const gx = Math.max(0, Math.min(this.cols - 1.001, x / CELL));
    const gy = Math.max(0, Math.min(this.rows - 1.001, y / CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const c = this.cols;
    const h00 = this.h[j * c + i];
    const h10 = this.h[j * c + i + 1];
    const h01 = this.h[(j + 1) * c + i];
    const h11 = this.h[(j + 1) * c + i + 1];
    // Cells split along the 00-11 diagonal (see buildMeshes).
    const g = fx >= fy ? h00 + (h10 - h00) * fx + (h11 - h10) * fy : h00 + (h11 - h01) * fx + (h01 - h00) * fy;
    return this.yard ? g + this.yard.at(i, j, fx, fy) : g; // yard cells (yardGround.js)
  }

  // Lowest and highest ground under a footprint: { rect: { x, y, w, h, angle } }
  // or { circle: { x, y, r } }. Samples corners, edges and a grid finer than
  // the terrain cells, so on the piecewise-flat ground it is exact to a few cm.
  groundRange(foot) {
    let min = Infinity;
    let max = -Infinity;
    const at = (x, y) => {
      const h = this.heightAt(x, y);
      if (h < min) min = h;
      if (h > max) max = h;
    };
    if (foot.circle) {
      const { x, y, r } = foot.circle;
      at(x, y);
      const rings = Math.max(1, Math.ceil(r / 1));
      for (let k = 1; k <= rings; k++) {
        const rr = (r * k) / rings;
        const n = Math.max(8, Math.ceil((2 * Math.PI * rr) / 1));
        for (let i = 0; i < n; i++) at(x + Math.cos((i / n) * 2 * Math.PI) * rr, y + Math.sin((i / n) * 2 * Math.PI) * rr);
      }
    } else {
      const { x, y, w, h, angle = 0 } = foot.rect;
      const c = Math.cos((angle * Math.PI) / 180);
      const s = Math.sin((angle * Math.PI) / 180);
      const nx = Math.max(1, Math.ceil(w / 1));
      const ny = Math.max(1, Math.ceil(h / 1));
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= ny; j++) {
          const lx = -w / 2 + (w * i) / nx;
          const ly = -h / 2 + (h * j) / ny;
          at(x + lx * c - ly * s, y + lx * s + ly * c);
        }
      }
    }
    return { min, max };
  }

  // Ground meshes, one per chunk so far ones get culled. material is a
  // Material or fn(ci, cj) -> Material (painted chunks get their own).
  // mudFn(x, y, h, bump) (optional): how muddy the ground gets in the wet,
  // 0..1, per vertex as `lookMud` (src3/look/shaders.js).
  buildMeshes(material, colorFn, mudFn = null) {
    const group = new THREE.Group();
    const per = Math.round(CHUNK / CELL);
    const nc = Math.ceil((this.cols - 1) / per);
    const nr = Math.ceil((this.rows - 1) / per);
    const col = new THREE.Color();
    for (let cj = 0; cj < nr; cj++) {
      for (let ci = 0; ci < nc; ci++) {
        const i0 = ci * per;
        const j0 = cj * per;
        const i1 = Math.min(this.cols - 1, i0 + per);
        const j1 = Math.min(this.rows - 1, j0 + per);
        const w = i1 - i0 + 1;
        const hgt = j1 - j0 + 1;
        const yardCells = this.yard ? this.yard.cellsIn(i0, j0, i1, j1) : [];
        const nv = w * hgt + yardCells.length * (YARD_SUB + 1) ** 2;
        const pos = new Float32Array(nv * 3);
        const colors = new Float32Array(nv * 3);
        const uvs = new Float32Array(nv * 2);
        const rough = new Float32Array(nv * 2);
        const mudA = mudFn ? new Float32Array(nv) : null;
        for (let j = 0; j < hgt; j++) {
          for (let i = 0; i < w; i++) {
            const gi = i0 + i;
            const gj = j0 + j;
            const k = j * w + i;
            const x = gi * CELL;
            const y = gj * CELL;
            pos[k * 3] = x;
            pos[k * 3 + 1] = this.h[gj * this.cols + gi];
            pos[k * 3 + 2] = y;
            uvs[k * 2] = x / 14;
            uvs[k * 2 + 1] = y / 14;
            rough[k * 2] = this.roughGrid[gj * this.cols + gi] / 255;
            rough[k * 2 + 1] = this.bumpGrid[gj * this.cols + gi];
            if (mudA) mudA[k] = mudFn(x, y, this.h[gj * this.cols + gi], this.bumpGrid[gj * this.cols + gi]);
            colorFn(x, y, this.h[gj * this.cols + gi], col, this.roughGrid[gj * this.cols + gi] / 255, this.openGrid[gj * this.cols + gi] / 255);
            colors[k * 3] = col.r;
            colors[k * 3 + 1] = col.g;
            colors[k * 3 + 2] = col.b;
          }
        }
        const idx = [];
        for (let j = 0; j < hgt - 1; j++) {
          for (let i = 0; i < w - 1; i++) {
            if (yardCells.length && this.yard.has(i0 + i, j0 + j)) continue; // drawn finer below
            const a = j * w + i; // (i, j)
            const b = a + 1; // (i+1, j)
            const c = a + w; // (i, j+1)
            const d = c + 1; // (i+1, j+1)
            // Counter-clockwise seen from above (+y), split on a-d diagonal.
            idx.push(a, d, b, a, c, d);
          }
        }
        if (yardCells.length) this.yard.fill(this, yardCells, { pos, colors, uvs, rough, mud: mudA, idx }, w * hgt, colorFn, mudFn, col);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        // Small roughness and big bump height, for the look shader's surface
        // detail and the shade in hollows (see src3/look/shaders.js).
        g.setAttribute('lookRough', new THREE.BufferAttribute(rough, 2));
        if (mudA) g.setAttribute('lookMud', new THREE.BufferAttribute(mudA, 1));
        g.setIndex(idx);
        g.computeVertexNormals();
        if (yardCells.length) this.yard.normals(this, yardCells, g, i0, j0, w, w * hgt); // no seam round yard cells
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, typeof material === 'function' ? material(ci, cj) : material);
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        group.add(m);
      }
    }
    return group;
  }
}

export function distToPolylineFast(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
