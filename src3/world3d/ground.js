// Things lying on the ground: roads, creek, lake, yards and fields, bridges.

import * as THREE from 'three';
import {
  makeRng, measurePolyline, pointAlong, centroid, localToWorld, SegIndex,
} from '../../src/drive/geom.js';
import { box, cyl, flat, disc, flatPolygon } from './shapes.js';
import { objMatrix } from './batch.js';
import { WATER_LEVEL } from './terrain.js';

const ID = new THREE.Matrix4();
const NO_SHADOW = { cast: false, material: 'ground' };

// Deck top height of bridges above the road (0).
export const DECK_TOP = 0.3;

// Ribbon along a polyline, draped on the ground. Pieces where skip(x, y) is
// true are left out. Returns a non-indexed BufferGeometry or null.
export function ribbon(pts, width, lift, heightAt, skip = null, step = 3, offset = 0) {
  const cum = measurePolyline(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.ceil(total / step) + 1);
  const samples = [];
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
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
    samples.push({
      l: [lx, heightAt(lx, ly) + lift, ly],
      r: [rx, heightAt(rx, ry) + lift, ry],
      skip: skip ? skip(cx, cy) : false,
    });
  }
  const v = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    if (s0.skip || s1.skip) continue;
    // Counter-clockwise from above. Left side is +normal = (-dy, dx).
    v.push(...s0.r, ...s0.l, ...s1.l, ...s0.r, ...s1.l, ...s1.r);
  }
  if (!v.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  fixWinding(g);
  return g;
}

// Make every triangle face up (cheap insurance against winding mistakes).
function fixWinding(g) {
  const p = g.attributes.position.array;
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
      }
    }
  }
}

export function buildGround(world, scenery, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  const rng = makeRng(world.seed + 7);
  const creek = world.creeks[0];
  const water = new SegIndex(32);
  for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + 2.5, c);
  const nearWater = (x, y) => water.minDist(x, y, (s) => s.data.width / 2 + 2.5) < 0;
  const roadIdx = new SegIndex(32);
  for (const r of world.roads) roadIdx.addPolyline(r.points, r.width / 2 + 3, r);

  const addRibbon = (pts, width, lift, color, skip, offset = 0) => {
    const g = ribbon(pts, width, lift, H, skip, 3, offset);
    if (g) batch.add(g, ID, color, NO_SHADOW);
  };
  // Round caps at the road ends only (junctions); the dense curve needs none in between.
  const addCaps = (pts, width, lift, color, skip) => {
    for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
      if (skip && skip(x, y)) continue;
      batch.add(disc(width / 2, 14), objMatrix(x, y, H(x, y) + lift, 0), color, NO_SHADOW);
    }
  };

  // Roads: dirt first and lower, paved on top so junctions look right.
  const dirt = world.roads.filter((r) => r.type !== 'paved');
  const paved = world.roads.filter((r) => r.type === 'paved');
  for (const r of dirt) {
    addRibbon(r.points, r.width + 1.6, 0.03, 0x9a8157, nearWater);
    addCaps(r.points, r.width + 1.6, 0.03, 0x9a8157, nearWater);
    addRibbon(r.points, r.width, 0.05, 0xbda275, nearWater);
    addCaps(r.points, r.width, 0.05, 0xbda275, nearWater);
    addRibbon(r.points, 0.6, 0.07, 0xa98f63, nearWater, r.width * 0.22);
    addRibbon(r.points, 0.6, 0.07, 0xa98f63, nearWater, -r.width * 0.22);
  }
  for (const r of paved) {
    addRibbon(r.points, r.width + 1.8, 0.09, 0x8c8a82, nearWater);
    addCaps(r.points, r.width + 1.8, 0.09, 0x8c8a82, nearWater);
    addRibbon(r.points, r.width, 0.11, 0xd8d8d0, nearWater);
    addCaps(r.points, r.width, 0.11, 0xd8d8d0, nearWater);
    addRibbon(r.points, r.width - 0.5, 0.13, 0x66676a, nearWater);
    addCaps(r.points, r.width - 0.5, 0.13, 0x66676a, nearWater);
  }
  // Dashed centre lines.
  for (const r of paved) {
    const cum = measurePolyline(r.points);
    const total = cum[cum.length - 1];
    for (let d = 3; d < total; d += 9) {
      const a = pointAlong(r.points, cum, d);
      const b = pointAlong(r.points, cum, Math.min(total, d + 3));
      if (nearWater(a.x, a.y)) continue;
      const g = ribbon([[a.x, a.y], [b.x, b.y]], 0.25, 0.15, H, null, 3);
      if (g) batch.add(g, ID, 0xe6d690, NO_SHADOW);
    }
  }

  // Creek water and reeds. The bed is carved into the terrain.
  for (const c of world.creeks) {
    const flatH = () => 0;
    const g = ribbon(c.points, c.width + 3, WATER_LEVEL, flatH, null, 6);
    batch.add(g, ID, 0x467aa6, { cast: false, material: 'water' });
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
    }
  }

  // Lakes: flat water with a darker middle, lily pads.
  for (const l of world.lakes) {
    const g = flatPolygon(l.polygon);
    batch.add(g, new THREE.Matrix4().makeTranslation(0, WATER_LEVEL, 0), 0x467aa6, { cast: false, material: 'water' });
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

  // Yards, forecourts and fields.
  const PAD = { concrete: 0xb3b0a8, gravel: 0xa29d92, yard: 0xa48f6a, field: 0x9a8150, track: 0xa08a64 };
  for (const p of scenery.pads) {
    const base = H(p.x, p.y);
    if (p.kind !== 'field') {
      // Draped on the ground along its long axis (tracks run up hills).
      const a = localToWorld(p.x, p.y, p.angle || 0, 0, -p.h / 2);
      const b = localToWorld(p.x, p.y, p.angle || 0, 0, p.h / 2);
      const g = ribbon([[a.x, a.y], [b.x, b.y]], p.w, 0.04, H, null, 3);
      if (g) batch.add(g, ID, PAD[p.kind] ?? PAD.gravel, NO_SHADOW);
      continue;
    }
    batch.place(flat(p.w, p.h), p.x, p.y, base, p.angle, 0, 0, 0.04, PAD[p.kind], NO_SHADOW);
    if (p.kind === 'field') {
      // Crop rows, then a post-and-rail fence round it.
      for (let x = -p.w / 2 + 1.5; x < p.w / 2; x += 2.6) {
        batch.place(box(0.9, 0.35, p.h - 2), p.x, p.y, base, p.angle, x, 0, 0, 0x6f8a3c, { cast: false });
      }
      const fw = p.w + 2;
      const fh = p.h + 2;
      const post = cyl(0.08, 1.2, 4);
      const wood = 0x5a4630;
      for (const [lx, ly, len, along] of [[0, -fh / 2, fw, 'x'], [0, fh / 2, fw, 'x'], [-fw / 2, 0, fh, 'z'], [fw / 2, 0, fh, 'z']]) {
        const rail = along === 'x' ? box(len, 0.08, 0.08) : box(0.08, 0.08, len);
        batch.place(rail, p.x, p.y, base, p.angle, lx, ly, 0.9, wood, { cast: false });
        batch.place(rail, p.x, p.y, base, p.angle, lx, ly, 0.5, wood, { cast: false });
        for (let t = -len / 2; t <= len / 2 + 0.01; t += 4) {
          const px = along === 'x' ? lx + t : lx;
          const py = along === 'x' ? ly : ly + t;
          batch.place(post, p.x, p.y, base, p.angle, px, py, 0, wood, { cast: false });
        }
      }
    }
  }

  const coveredDrawn = new Set(world.landmarks.filter((l) => l.kind === 'covered_bridge').map((l) => l.bridgeId));
  for (const b of world.bridges) {
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
