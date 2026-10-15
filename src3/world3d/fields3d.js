// Fields (pasture fences, crop rows, hay bales) and roadside mailboxes.

import * as THREE from 'three';
import { makeRng, bbox, centroid, pointInPolygon } from '../../src/drive/geom.js';
import { fenceRuns } from '../../src/drive/layout.js';
import { box, cyl, strut } from './shapes.js';
import { ribbon } from './ground.js';
import { objMatrix } from './batch.js';

const I = new THREE.Matrix4();
const GROUND = { cast: false, material: 'ground' };

// x ranges where the horizontal line y crosses the polygon.
function scanline(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

// Fence posts exactly where the collider has them (layout.js fenceRuns), with
// two rails that follow the ground. Gaps where roads and mailboxes are.
function fences(world, batch, H) {
  const post = cyl(0.11, 1.35, 5);
  for (const f of fenceRuns(world)) {
    const color = f.field.kind === 'crop' ? 0x5a4630 : 0x6a5238;
    for (const run of f.runs) {
      for (let i = 0; i < run.length; i++) {
        const p = run[i];
        const h0 = H(p.x, p.y);
        batch.add(post, objMatrix(p.x, p.y, h0 - 0.25, 0), color, { cast: false });
        const q = run[i + 1];
        if (!q) continue;
        const h1 = H(q.x, q.y);
        for (const up of [0.55, 1.0]) {
          batch.add(strut(new THREE.Vector3(p.x, h0 + up, p.y), new THREE.Vector3(q.x, h1 + up, q.y), 0.045, 3), I, color, { cast: false });
        }
      }
    }
  }
}

export function buildFields(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  fences(world, batch, H);
  const rng = makeRng(world.seed + 404);
  for (const f of world.fields || []) {
    const bb = bbox(f.polygon);
    if (f.kind === 'crop') {
      const hay = /hay/.test(f.id);
      const soil = hay ? 0xb59a5a : 0x7a6340;
      const crop = hay ? 0xcdb46a : 0x6f8a3c;
      const gap = 2.4;
      for (let y = bb.minY + gap / 2; y < bb.maxY; y += gap) {
        for (const [x0, x1] of scanline(f.polygon, y)) {
          if (x1 - x0 < 2) continue;
          const g = ribbon([[x0 + 0.5, y], [x1 - 0.5, y]], gap + 0.05, 0.05, H, null, 4);
          if (g) batch.add(g, I, soil, GROUND);
          const g2 = ribbon([[x0 + 1, y], [x1 - 1, y]], 1.0, 0.28, H, null, 4);
          if (g2) batch.add(g2, I, crop, GROUND);
        }
      }
      if (hay) {
        // Round bales scattered on the stubble.
        for (let i = 0; i < 14; i++) {
          const x = bb.minX + 6 + rng() * (bb.maxX - bb.minX - 12);
          const y = bb.minY + 6 + rng() * (bb.maxY - bb.minY - 12);
          if (!pointInPolygon(x, y, f.polygon)) continue;
          const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 10).rotateX(Math.PI / 2).translate(0, 0.75, 0);
          batch.add(bale, objMatrix(x, y, H(x, y) - 0.05, rng() * 180), 0xd9c27a);
        }
      }
    } else {
      // Pasture: greener grass patch, fence, a water trough and a salt lick.
      for (let y = bb.minY + 2; y < bb.maxY; y += 4) {
        for (const [x0, x1] of scanline(f.polygon, y)) {
          const g = ribbon([[x0 + 0.3, y], [x1 - 0.3, y]], 4.05, 0.03, H, null, 5);
          if (g) batch.add(g, I, 0x5c9447, GROUND);
        }
      }
      const [cx, cy] = centroid(f.polygon);
      const tx = cx + (bb.maxX - cx) * 0.4;
      const ty = cy;
      batch.add(box(3, 0.6, 0.9), objMatrix(tx, ty, H(tx, ty), 0), 0x8a8f96);
      batch.add(box(2.8, 0.05, 0.7), objMatrix(tx, ty, H(tx, ty) + 0.56, 0), 0x467aa6, { cast: false });
      // A lone shade tree is already from scenery elsewhere; add a hay feeder.
      const fx = cx - (cx - bb.minX) * 0.5;
      batch.add(cyl(1.1, 1.0, 8), objMatrix(fx, cy, H(fx, cy), 0), 0x6a6f72);
      batch.add(cyl(0.95, 0.5, 8), objMatrix(fx, cy, H(fx, cy) + 0.9, 0), 0xcdb46a, { cast: false });
    }
  }
}

const MAILBOX = [0x3a3d40, 0x2f4f6f, 0x6b2f2a, 0x8a8f96, 0x2f5a3a];

export function buildMailboxes(world, terrain, batch) {
  (world.mailboxes || []).forEach((m, i) => {
    const base = terrain.heightAt(m.x, m.y);
    // Door faces the road: local -z is the box's front, turned to `facing`.
    const P = (geo, lx, ly, up, color, opts) => batch.place(geo, m.x, m.y, base, m.facing || 0, lx, ly, up, color, opts);
    P(box(0.12, 1.15, 0.12), 0, 0.15, -0.1, 0x6a4c2e);
    P(box(0.28, 0.06, 0.6), 0, 0, 1.05, 0x6a4c2e, { cast: false });
    const col = MAILBOX[i % MAILBOX.length];
    P(box(0.24, 0.2, 0.5), 0, 0, 1.1, col);
    const top = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    P(top, 0, 0, 1.3, col);
    P(box(0.22, 0.3, 0.03), 0, -0.26, 1.1, 0x2a2a2a, { cast: false });
    // Little red flag, up on some boxes.
    const up = (i % 3) === 0;
    P(box(0.03, 0.35, 0.05), 0.14, 0.12, up ? 1.25 : 1.1, 0xc0392b, { cast: false });
    P(box(0.03, 0.12, 0.16), 0.14, up ? 0.12 : 0.2, up ? 1.5 : 1.3, 0xc0392b, { cast: false });
  });
}
