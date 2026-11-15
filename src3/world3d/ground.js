// Things lying on the ground: roads, creek, lake, yards and fields, bridges.

import * as THREE from 'three';
import {
  makeRng, measurePolyline, pointAlong, centroid, localToWorld, SegIndex, distToPolyline, pointInPolygon,
} from '../../src/drive/geom.js';
import { box, cyl, flat, disc, flatPolygon } from './shapes.js';
import { objMatrix } from './batch.js';
import { WATER_LEVEL } from './terrain.js';

const ID = new THREE.Matrix4();
const NO_SHADOW = { cast: false, material: 'ground' };

// Deck top height of bridges above the road (0).
export const DECK_TOP = 0.3;

// Ribbon along a polyline, draped on the ground. Pieces where skip(x, y) is
// true are left out. Samples every `step` metres, and more often where the
// ground bends between samples (near creek banks), so it never floats or
// sinks. Returns a non-indexed BufferGeometry or null.
export function ribbon(pts, width, lift, heightAt, skip = null, step = 3, offset = 0) {
  const cum = measurePolyline(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(total / step) + 1);
  const K = Math.max(1, Math.ceil(width / 2));
  const sampleAt = (d) => {
    const p = pointAlong(pts, cum, d);
    // Smooth direction across bends: look a bit ahead and behind.
    const a = pointAlong(pts, cum, Math.max(0, d - 1.5));
    const b = pointAlong(pts, cum, Math.min(total, d + 1.5));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    const cx = p.x + nx * offset;
    const cy = p.y + ny * offset;
    const lx = cx + nx * width / 2;
    const ly = cy + ny * width / 2;
    const rx = cx - nx * width / 2;
    const ry = cy - ny * width / 2;
    // Points across, from right to left edge; `fine` when the ground bends
    // across the ribbon here (then the piece uses all of them).
    const cols = [];
    let fine = false;
    const hr = heightAt(rx, ry);
    const hl = heightAt(lx, ly);
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      const x = rx + (lx - rx) * t;
      const y = ry + (ly - ry) * t;
      const h = k === 0 ? hr : k === K ? hl : heightAt(x, y);
      if (Math.abs(h - (hr + (hl - hr) * t)) > 0.03) fine = true;
      cols.push([x, h + lift, y]);
    }
    return {
      d,
      l: cols[K],
      r: cols[0],
      cols,
      fine,
      skip: skip ? skip(cx, cy) : false,
    };
  };
  const samples = [];
  const refine = (s0, s1, depth) => {
    if (depth < 4 && s1.d - s0.d > 0.4) {
      const m = sampleAt((s0.d + s1.d) / 2);
      if (Math.abs(m.l[1] - (s0.l[1] + s1.l[1]) / 2) > 0.03 || Math.abs(m.r[1] - (s0.r[1] + s1.r[1]) / 2) > 0.03) {
        refine(s0, m, depth + 1);
        samples.push(m);
        refine(m, s1, depth + 1);
      }
    }
  };
  let prev = sampleAt(0);
  samples.push(prev);
  for (let i = 1; i < n; i++) {
    const cur = sampleAt((total * i) / (n - 1));
    refine(prev, cur, 0);
    samples.push(cur);
    prev = cur;
  }
  const v = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    if (s0.skip || s1.skip) continue;
    // Counter-clockwise from above. Left side is +normal = (-dy, dx).
    if (s0.fine || s1.fine) {
      for (let k = 0; k < K; k++) {
        const a0 = s0.cols[k];
        const b0 = s0.cols[k + 1];
        const a1 = s1.cols[k];
        const b1 = s1.cols[k + 1];
        v.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      }
    } else {
      v.push(...s0.r, ...s0.l, ...s1.l, ...s0.r, ...s1.l, ...s1.r);
    }
  }
  if (!v.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  fixWinding(g);
  return g;
}

const DIRT = { shoulder: 0x9a8157, road: 0xbda275, rut: 0xa98f63 };
// Lanes built since 1987 (road.fresh): new pale crushed stone, not yet worn brown.
const FRESH = { shoulder: 0x9f9480, road: 0xcdc6b4, rut: 0xbab19c };
const dirtColours = (r) => (r.fresh ? FRESH : DIRT);
const DIRT_LIFT = 0.04;

// A dirt road as one mesh: a cross-section of points (shoulder, road edge,
// either side of each rut, centre) every metre along it, each on heightAt(),
// which includes the road's bumps and ruts. Vertex colours: darker shoulder
// and ruts. Pieces where skip(x, y) is true are left out. Returns geometries.
function dirtRoad(r, heightAt, skip) {
  const { rows, across, cols } = dirtRoadRows(r, heightAt, skip);
  return dirtRoadMesh(rows, across, cols);
}

// The dirt road's rows of cross-section points (also used by the puddles,
// src3/world3d/puddles3d.js, so a puddle on the road lies exactly on it):
// { rows: [{ d, skip, v: [[x, y, z] per across] }], across, cols, lift }.
export function dirtRoadRows(r, heightAt, skip) {
  const pts = r.points;
  const half = r.width / 2;
  const rut = r.width * 0.22;
  const DIRT = dirtColours(r);
  // Offsets across (right to left) and their colours.
  const across = [-(half + 0.8), -(half + 0.4), -half, -(half - 0.8), -(rut + 0.45), -rut, -(rut - 0.45), 0, rut - 0.45, rut, rut + 0.45, half - 0.8, half, half + 0.4, half + 0.8];
  const C = (hex) => new THREE.Color(hex);
  const cols = across.map((o) => {
    const a = Math.abs(o);
    if (a > half + 0.01) return C(DIRT.shoulder);
    if (a > half - 0.01) return C(DIRT.shoulder).lerp(C(DIRT.road), 0.5);
    if (Math.abs(a - rut) < 0.01) return C(DIRT.rut).multiplyScalar(0.96);
    if (Math.abs(a - rut) < 0.5) return C(DIRT.rut).lerp(C(DIRT.road), 0.35);
    return C(DIRT.road);
  });
  const cum = measurePolyline(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(total / 1.4) + 1);
  const rowAt = (d) => {
    const p = pointAlong(pts, cum, d);
    const a = pointAlong(pts, cum, Math.max(0, d - 1.5));
    const b = pointAlong(pts, cum, Math.min(total, d + 1.5));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy;
    const ny = dx;
    return {
      d,
      skip: skip(p.x, p.y),
      v: across.map((o) => {
        const x = p.x + nx * o;
        const y = p.y + ny * o;
        return [x, heightAt(x, y) + DIRT_LIFT, y];
      }),
    };
  };
  // Extra rows where the ground bends between two (creek banks).
  const rows = [];
  const refine = (r0, r1, depth) => {
    if (depth >= 3) return;
    const m = rowAt((r0.d + r1.d) / 2);
    if (!m.v.some((q, k) => Math.abs(q[1] - (r0.v[k][1] + r1.v[k][1]) / 2) > 0.05)) return;
    refine(r0, m, depth + 1);
    rows.push(m);
    refine(m, r1, depth + 1);
  };
  let prev = rowAt(0);
  rows.push(prev);
  for (let i = 1; i < n; i++) {
    const cur = rowAt((total * i) / (n - 1));
    refine(prev, cur, 0);
    rows.push(cur);
    prev = cur;
  }
  return { rows, across, cols, lift: DIRT_LIFT };
}

function dirtRoadMesh(rows, across, cols) {
  // Pieces of about 80 m, so each lands in its own map chunk and gets culled.
  const out = [];
  let pos = [];
  let col = [];
  const flush = () => {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    fixWinding(g, true);
    out.push(g);
    pos = [];
    col = [];
  };
  const push = (q, c) => {
    pos.push(q[0], q[1], q[2]);
    col.push(c.r, c.g, c.b);
  };
  let start = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i];
    const r1 = rows[i + 1];
    if (r0.d - start > 80) {
      flush();
      start = r0.d;
    }
    if (r0.skip || r1.skip) continue;
    for (let k = 0; k < across.length - 1; k++) {
      push(r0.v[k], cols[k]);
      push(r0.v[k + 1], cols[k + 1]);
      push(r1.v[k + 1], cols[k + 1]);
      push(r0.v[k], cols[k]);
      push(r1.v[k + 1], cols[k + 1]);
      push(r1.v[k], cols[k]);
    }
  }
  flush();
  return out;
}

// For the world checker: is (x, y) inside some other water body (where one
// water sheet meets another, its edge may hang over the other's bed; past
// the map edge nobody sees it)?
function inOtherWater(world, self) {
  return (x, y) => x < 0 || y < 0 || x > world.size.w || y > world.size.h
    || world.creeks.some((c) => c !== self && distToPolyline(x, y, c.points) < c.width / 2 + 4)
    || world.lakes.some((l) => l !== self && pointInPolygon(x, y, l.polygon));
}

// Make every triangle face up (cheap insurance against winding mistakes).
// withColors: swap the colour attribute along with the positions.
function fixWinding(g, withColors = false) {
  const p = g.attributes.position.array;
  const c = withColors ? g.attributes.color.array : null;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i];
    const az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i];
    const bz = p[i + 8] - p[i + 2];
    // y component of (b - a) x (c - a) is az*bx - ax*bz.
    if (az * bx - ax * bz < 0) {
      for (let k = 0; k < 3; k++) {
        const t = p[i + 3 + k];
        p[i + 3 + k] = p[i + 6 + k];
        p[i + 6 + k] = t;
        if (c) {
          const u = c[i + 3 + k];
          c[i + 3 + k] = c[i + 6 + k];
          c[i + 6 + k] = u;
        }
      }
    }
  }
}

export function buildGround(world, scenery, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  const A = batch.audit;
  const rng = makeRng(world.seed + 7);
  const creek = world.creeks[0];
  const water = new SegIndex(32);
  for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + 2.5, c);
  const nearWater = (x, y) => water.minDist(x, y, (s) => s.data.width / 2 + 2.5) < 0;
  const roadIdx = new SegIndex(32);
  for (const r of world.roads) roadIdx.addPolyline(r.points, r.width / 2 + 3, r);

  const addRibbon = (pts, width, lift, color, skip, offset = 0, id = 'road') => {
    const g = ribbon(pts, width, lift, H, skip, 3, offset);
    if (g) batch.add(g, ID, color, NO_SHADOW);
    if (A) A.surface(id, 'road', g, lift);
  };
  // Round caps at the road ends only (junctions); the dense curve needs none in between.
  const addCaps = (pts, width, lift, color, skip) => {
    for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
      if (skip && skip(x, y)) continue;
      const g = batch.add(disc(width / 2, 14), objMatrix(x, y, H(x, y) + lift, 0), color, NO_SHADOW);
      if (A) A.surface('road_cap', 'road', g, lift);
    }
  };

  // Roads: dirt first and lower, paved on top so junctions look right.
  const dirt = world.roads.filter((r) => r.type !== 'paved');
  const paved = world.roads.filter((r) => r.type === 'paved');
  for (const r of dirt) {
    // One mesh with the bumps and ruts in it (roadbumps.js), shoulder to
    // shoulder. Round ends are painted on the ground.
    for (const g of dirtRoad(r, H, nearWater)) {
      batch.add(g, ID, 0xffffff, { ...NO_SHADOW, keepColors: true });
      if (A) A.surface(r.id, 'dirt_road', g, DIRT_LIFT);
    }
    if (batch.paint) {
      for (const [x, y] of [r.points[0], r.points[r.points.length - 1]]) {
        if (nearWater(x, y)) continue;
        batch.paint.disc(x, y, r.width / 2 + 0.8, dirtColours(r).shoulder);
        batch.paint.disc(x, y, r.width / 2, dirtColours(r).road);
      }
    }
  }
  for (const r of paved) {
    addRibbon(r.points, r.width + 1.8, 0.09, 0x8c8a82, nearWater);
    addCaps(r.points, r.width + 1.8, 0.09, 0x8c8a82, nearWater);
    // Rural road: no white edge lines. The tar runs to the gravel edge.
    addRibbon(r.points, r.width, 0.13, 0x66676a, nearWater);
    addCaps(r.points, r.width, 0.13, 0x66676a, nearWater);
  }
  // Dashed centre lines, faded by years of sun.
  for (const r of paved) {
    const cum = measurePolyline(r.points);
    const total = cum[cum.length - 1];
    for (let d = 3; d < total; d += 9) {
      const a = pointAlong(r.points, cum, d);
      const b = pointAlong(r.points, cum, Math.min(total, d + 3));
      if (nearWater(a.x, a.y)) continue;
      const g = ribbon([[a.x, a.y], [b.x, b.y]], 0.25, 0.15, H, null, 3);
      if (g) batch.add(g, ID, 0xb8ad84, NO_SHADOW);
      if (A) A.surface(r.id, 'road_dash', g, 0.15);
    }
  }

  // Creek water and reeds. The bed is carved into the terrain.
  for (const c of world.creeks) {
    const flatH = () => 0;
    // Wide enough that its edges always run under the banks.
    const g = ribbon(c.points, c.width + 8, WATER_LEVEL, flatH, null, 6);
    batch.add(g, ID, 0x467aa6, { cast: false, material: 'water' });
    if (A) A.surface(c.id, 'creek', g, 0, { water: true, ok: inOtherWater(world, c) });
    const g2 = ribbon(c.points, c.width * 0.4, WATER_LEVEL + 0.02, flatH, null, 6);
    batch.add(g2, ID, 0x5a8dba, { cast: false, material: 'water' });
    const cum = measurePolyline(c.points);
    const total = cum[cum.length - 1];
    const reed = new THREE.ConeGeometry(0.14, 1.3, 3).translate(0, 0.65, 0);
    for (let d = 0; d < total; d += 2 + rng() * 5) {
      const p = pointAlong(c.points, cum, d);
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (c.width / 2 + 0.5 + rng() * 3);
      const x = p.x - p.dy * off;
      const y = p.y + p.dx * off;
      if (roadIdx.minDist(x, y, (s) => s.data.width / 2 + 3) < 0) continue;
      const s = 0.6 + rng() * 0.8;
      const m = objMatrix(x, y, Math.max(H(x, y), WATER_LEVEL), rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s, s));
      batch.add(reed, m, rng() < 0.5 ? 0x3f6a33 : 0x6b8a3f, { cast: false });
      if (A) A.circle(c.id, 'reed', x, y, 0.14 * s, Math.max(H(x, y), WATER_LEVEL), null, WATER_LEVEL);
    }
  }

  // Lakes: flat water with a darker middle, lily pads.
  for (const l of world.lakes) {
    const g = flatPolygon(l.polygon);
    const lw = batch.add(g, new THREE.Matrix4().makeTranslation(0, WATER_LEVEL, 0), 0x467aa6, { cast: false, material: 'water' });
    if (A) A.surface(l.id, 'lake', lw, 0, { water: true, ok: inOtherWater(world, l) });
    const [mx, my] = centroid(l.polygon);
    const inner = l.polygon.map(([x, y]) => [mx + (x - mx) * 0.65, my + (y - my) * 0.65]);
    batch.add(flatPolygon(inner), new THREE.Matrix4().makeTranslation(0, WATER_LEVEL + 0.02, 0), 0x3d6e98, { cast: false, material: 'water' });
    for (let i = 0; i < 40; i++) {
      const v = l.polygon[Math.floor(rng() * l.polygon.length)];
      const t = 0.8 + rng() * 0.15;
      const x = mx + (v[0] - mx) * t + (rng() - 0.5) * 20;
      const y = my + (v[1] - my) * t + (rng() - 0.5) * 20;
      batch.add(disc(0.6 + rng() * 0.6, 7), objMatrix(x, y, WATER_LEVEL + 0.04, 0), 0x4f8a45, NO_SHADOW);
    }
  }

  // Yards, forecourts and tracks, painted onto the terrain (paint.js) so they
  // follow every bend. Field pads are drawn with the fields (fields3d.js).
  const PAD = { concrete: 0xb3b0a8, gravel: 0xa29d92, yard: 0xa48f6a, track: 0xa08a64 };
  for (const p of scenery.pads) {
    if (p.kind === 'field' || !batch.paint) continue;
    const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const c = localToWorld(p.x, p.y, p.angle || 0, (sx * p.w) / 2, (sy * p.h) / 2);
      return [c.x, c.y];
    });
    batch.paint.polygon(poly, PAD[p.kind] ?? PAD.gravel);
  }

  const coveredDrawn = new Set(world.landmarks.filter((l) => l.kind === 'covered_bridge').map((l) => l.bridgeId));
  for (const b of world.bridges) {
    if (A && b.kind !== 'ford') {
      // The road meets the deck (or the stub) at both ends.
      for (const dir of [-1, 1]) {
        const e = localToWorld(b.x, b.y, b.angle, 0, dir * (b.length / 2 + 3));
        A.point({ id: b.id, kind: 'bridge_end', x: e.x, y: e.y, min: DECK_TOP - 0.6, max: DECK_TOP });
      }
    }
    if (coveredDrawn.has(b.id)) continue; // drawn with the landmarks (landmarks3d.js)
    if (b.kind === 'ford') buildFord(world, b, batch, rng);
    else buildBridge(world, b, creek, batch, rng);
  }
}

// Ford: a gravel causeway just under the water, marker posts each side.
function buildFord(world, b, batch, rng) {
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, 0, b.angle, lx, ly, up, color, opts);
  P(box(b.width, 0.2, b.length), 0, 0, WATER_LEVEL - 0.12, 0x9c9480, { cast: false });
  for (let i = 0; i < 26; i++) {
    const lx = (rng() - 0.5) * b.width;
    const ly = (rng() - 0.5) * b.length;
    P(box(0.4 + rng() * 0.5, 0.15, 0.4 + rng() * 0.5), lx, ly, WATER_LEVEL - 0.05, rng() < 0.5 ? 0x7d776a : 0xb0a994, { cast: false });
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      P(cyl(0.08, 1.4, 5), side * (b.width / 2 + 0.3), end * (b.length / 2 - 2), -0.2, 0xf0eee6);
      P(cyl(0.085, 0.25, 5), side * (b.width / 2 + 0.3), end * (b.length / 2 - 2), 0.9, 0xc0392b);
    }
  }
}

function buildBridge(world, b, creek, batch, rng) {
  const road = world.roads.find((r) => r.id === b.roadId);
  const paved = road && road.type === 'paved';
  const W = b.width;
  const L = b.length;
  const a = b.angle;
  const creekW = b.waterWidth || (creek ? creek.width : 14);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, 0, a, lx, ly, up, color, opts);

  if (b.intact) {
    // Concrete deck, asphalt, dashes, railings and two piers in the water.
    const deck = 0x9b9a94;
    P(box(W, 0.9, L), 0, 0, DECK_TOP - 0.9, deck);
    // Short ramps so the deck meets the road.
    for (const dir of [-1, 1]) {
      const ramp = box(W - 0.4, 0.3, 3).rotateX(dir * 0.1);
      P(ramp, 0, dir * (L / 2 + 1.2), -0.15, deck, { cast: false });
    }
    if (paved) {
      P(box(W - 2, 0.02, L), 0, 0, DECK_TOP, 0x66676a, { cast: false });
      for (let y = -L / 2 + 2; y < L / 2 - 3; y += 9) P(box(0.25, 0.02, 3), 0, y + 1.5, DECK_TOP + 0.01, 0xe6d690, { cast: false });
    }
    const rail = paved ? 0xd6d5cc : 0x6a4c2e;
    const postC = paved ? 0x77766f : 0x4a3420;
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 0.3);
      P(box(0.5, 0.35, L), x, 0, DECK_TOP, rail); // kerb
      P(box(0.2, 0.18, L), x, 0, DECK_TOP + 1.0, rail); // top rail
      P(box(0.12, 0.12, L), x, 0, DECK_TOP + 0.6, rail);
      for (let y = -L / 2 + 0.5; y <= L / 2 - 0.5; y += 2.5) P(box(0.22, 1.05, 0.22), x, y, DECK_TOP, postC);
    }
    for (const y of [-5, 5]) {
      P(box(W * 0.7, 3, 1.4), 0, y, -2.5, 0x8a8984);
    }
    return;
  }

  // Washed out: wooden stub on each bank, ragged ends, gap over the water.
  const deck = 0x8a6a45;
  const stub = (L - creekW) / 2 + 1.5;
  const plankW = 0.8;
  for (const dir of [-1, 1]) {
    const outer = dir * (L / 2);
    const inner = dir * (L / 2 - stub);
    // Beams under the deck.
    for (const x of [-W / 2 + 0.6, 0, W / 2 - 0.6]) P(box(0.4, 0.4, stub), x, (outer + inner) / 2, DECK_TOP - 0.6, 0x5a4029);
    // Planks across, the last ones broken off at random lengths.
    for (let y = Math.min(outer, inner); y < Math.max(outer, inner) - 0.01; y += plankW) {
      const nearEdge = Math.abs(y + plankW / 2 - inner) < 2.5;
      if (nearEdge) {
        // Split into short splintered pieces, some missing.
        for (let x = -W / 2; x < W / 2 - 0.01; x += 1.6) {
          if (rng() < 0.35) continue;
          const len = 1.6 * (0.5 + rng() * 0.5);
          P(box(len, 0.12, plankW * 0.9), x + len / 2, y + plankW / 2, DECK_TOP - 0.12, rng() < 0.5 ? 0x3a2c20 : deck);
        }
      } else {
        P(box(W, 0.12, plankW * 0.9), 0, y + plankW / 2, DECK_TOP - 0.12, deck, { cast: false });
      }
    }
    // Pilings down into the creek bed.
    for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) {
      P(cyl(0.25, 3, 6), x, inner + dir * 1, -2.6, 0x4a3420);
      P(cyl(0.25, 3, 6), x, outer - dir * 1, -2.6, 0x4a3420);
    }
    // Broken rails: one longer than the other.
    const railA = stub * 0.9;
    const railB = stub * 0.5;
    P(box(0.15, 0.15, railA), -W / 2 + 0.3, outer - (dir * railA) / 2, DECK_TOP + 0.9, 0x6a4c2e);
    P(box(0.15, 0.15, railB), W / 2 - 0.3, outer - (dir * railB) / 2, DECK_TOP + 0.9, 0x6a4c2e);
    for (let t = 0.4; t < railA; t += 2) P(box(0.18, 0.95, 0.18), -W / 2 + 0.3, outer - dir * t, DECK_TOP, 0x4a3420);
    for (let t = 0.4; t < railB; t += 2) P(box(0.18, 0.95, 0.18), W / 2 - 0.3, outer - dir * t, DECK_TOP, 0x4a3420);
    // Striped barrier across the stub, back from the edge.
    const by = inner + dir * 3;
    for (let i = 0; i < 6; i++) {
      const x0 = -W / 2 + 0.6 + (i + 0.5) * ((W - 1.2) / 6);
      P(box((W - 1.2) / 6, 0.35, 0.12), x0, by, DECK_TOP + 0.8, i % 2 ? 0xffffff : 0xc0392b);
    }
    for (const x of [-W / 2 + 0.8, W / 2 - 0.8]) P(box(0.12, 1.0, 0.12), x, by, DECK_TOP, 0x555555);
  }
  // A slab of deck slumped into the water, and planks drifting downstream.
  const slump = new THREE.Matrix4().makeRotationX(0.35).multiply(new THREE.Matrix4().makeRotationZ(0.12));
  batch.place(box(W * 0.8, 0.15, 4), b.x, b.y, 0, a, 0.5, -(L / 2 - stub) + 2, WATER_LEVEL - 0.3, deck, { extra: slump });
  for (let i = 0; i < 9; i++) {
    const lx = (rng() - 0.5) * W * 1.6 + rng() * 10;
    const ly = (rng() - 0.5) * (L - 2 * stub);
    const p = localToWorld(b.x, b.y, a, lx, ly);
    batch.place(box(0.35, 0.12, 1.5 + rng() * 2.5), p.x, p.y, WATER_LEVEL - 0.03, rng() * 180, 0, 0, 0, rng() < 0.5 ? 0x6e5234 : 0x5a4029, { cast: false });
  }
}
