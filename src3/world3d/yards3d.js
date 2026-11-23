// Yard fences (#85): a post-and-rail fence along one side of some lots
// (src/world/yards.js picks where; the collider has the same posts). Drawn
// like the field rail fences (fields3d.js, fences3d.js): capped square posts,
// three rails that bend over bumps, the odd broken board. Raw triangles into
// the shared batch, one geometry per colour for all of them: no draw calls
// of their own.

import * as THREE from 'three';
import { yardFenceRuns } from '../../src/world/yards.js';
import { Tris, railLegs } from './fields3d.js';
import { addBrokenRail, postCap } from './fences3d.js';

const I = new THREE.Matrix4();
const POST = 0x5a4630;
const RAIL = 0x8a6c4a;

export function buildYardFences(world, terrain, batch, scenery) {
  const H = (x, y) => terrain.heightAt(x, y);
  const posts = new Tris();
  const rails = new Tris();
  const A = batch.audit;
  for (const f of yardFenceRuns(world, scenery ? scenery.trees : [])) {
    f.runs.forEach((pts, r) => {
      const hs = pts.map((p) => H(p.x, p.y));
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const h0 = hs[i];
        const top = h0 + 1.35;
        posts.beam([p.x, h0 - 0.25, p.y], [p.x, top, p.y], 0.18, 0.18);
        postCap(posts, p.x, top, p.y, 0.18, 0.05);
        if (A) A.circle(f.id, 'fence_post', p.x, p.y, 0.09, h0 - 0.25);
        const q = pts[i + 1];
        if (!q) continue;
        const h1 = hs[i + 1];
        const ups = [0.45, 0.85, 1.22];
        const broken = ups.map((up, k) => addBrokenRail(rails, f.id, r, i, k, p, h0, q, h1, up, H));
        for (const [ax, ay, ah, bx, by, bh] of railLegs(H, p.x, p.y, h0, q.x, q.y, h1)) {
          if (A && !broken[0]) A.span({ id: f.id, kind: 'fence_rail', a: [ax, ay, ah + 0.38], b: [bx, by, bh + 0.38], clear: 0.2 });
          ups.forEach((up, k) => {
            if (!broken[k]) rails.beam([ax, ah + up, ay], [bx, bh + up, by], 0.14, 0.05);
          });
        }
      }
    });
  }
  for (const [t, color] of [[posts, POST], [rails, RAIL]]) {
    const g = t.geometry();
    if (g) batch.add(g, I, color, { cast: true });
  }
}
