// The farm dog's yard (#68): its fence, gate and doghouse, all static and
// into the batches, so no new draw calls. The dog itself is collie3d.js.
// Where it all goes, and how the dog runs, is src/world/farmDog.js.

import * as THREE from 'three';
import { farmDogsIn, fenceLine, pointAt, runPoint, doghouseSpot, DOG } from '../../src/world/farmDog.js';
import { Tris, railLegs } from './fields3d.js';
import { addGate, postCap, IRON } from './fences3d.js';
import { box, cyl, gable } from './shapes.js';
import { objMatrix } from './batch.js';

const I = new THREE.Matrix4();
const PAINT = 0xe6e1d4; // white board fence, a season or two since it was painted
const PAINT_POST = 0xd6d0c2;
const BOARDS = [0.36, 0.74, 1.1]; // board centres above the ground
const GATE_W = 4.2;

// ---------- fence, gate and doghouse ----------

// The posts as drawn: the fence's posts with the gate's two posts put in
// and the ones between them left out. Returns { posts, gate } (gate: the
// index of the gate's first post) for the main fence.
function drawnPosts(dog, line) {
  const a = dog.gate - GATE_W / 2;
  const b = dog.gate + GATE_W / 2;
  const posts = [];
  let gate = -1;
  const n = Math.max(1, Math.round(line.len / DOG.postStep));
  for (let k = 0; k <= n; k++) {
    const s = (line.len * k) / n;
    if (s > a - 0.8 && s < b + 0.8) {
      if (gate < 0) {
        gate = posts.length;
        posts.push(pointAt(line, a), pointAt(line, b));
      }
      continue;
    }
    posts.push(pointAt(line, s));
  }
  return { posts, gate };
}

// A run of white board fence through pts ({ x, y }); boards nailed on the
// yard side, so the dog pushes them against the posts (out: +1 when the yard
// is on the run's right, -1 on its left). gate: index of a post whose span to
// the next is a gate (drawn by addGate), or -1. skipFirst: the first post is
// another run's (a corner), so only its boards are drawn.
function boardFence(T, pts, H, out, gate, audit, id, skipFirst = false) {
  const hs = pts.map((p) => H(p.x, p.y));
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const h0 = hs[i];
    if (i === gate) {
      const q = pts[i + 1];
      const bot = addGate(T, p, q, H, true);
      if (audit) {
        for (const g of [p, q]) audit.circle(id, 'fence_post', g.x, g.y, 0.11, H(g.x, g.y) - 0.3);
        audit.span({ id, kind: 'fence_rail', a: [p.x, p.y, bot], b: [q.x, q.y, bot], clear: 0.05 });
      }
      continue;
    }
    if ((i !== gate + 1 || gate < 0) && !(skipFirst && i === 0)) {
      const top = h0 + 1.3;
      T.posts.beam([p.x, h0 - 0.3, p.y], [p.x, top, p.y], 0.13, 0.13);
      postCap(T.posts, p.x, top, p.y, 0.13, 0.05);
      if (audit) audit.circle(id, 'fence_post', p.x, p.y, 0.07, h0 - 0.3);
    }
    const q = pts[i + 1];
    if (!q) continue;
    // Boards on the post faces toward the road: shift them across.
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ox = (-(q.y - p.y) / L) * out * 0.085;
    const oy = ((q.x - p.x) / L) * out * 0.085;
    for (const [ax, ay, ah, bx, by, bh] of railLegs(H, p.x, p.y, h0, q.x, q.y, hs[i + 1])) {
      for (const up of BOARDS) T.boards.beam([ax + ox, ah + up, ay + oy], [bx + ox, bh + up, by + oy], 0.15, 0.03);
      if (audit) audit.span({ id, kind: 'fence_rail', a: [ax, ay, ah + BOARDS[0] - 0.075], b: [bx, by, bh + BOARDS[0] - 0.075], clear: 0.2 });
    }
  }
}

// A doghouse: plank walls, a doorway with a trimmed frame and a dark inside,
// a shingled gable roof with an overhang, and a water bowl. Faces -z.
function doghouse(batch, x, y, base, angle) {
  const M = (lx, up, ly, extra) => objMatrix(x, y, base, angle, lx, ly, up, extra);
  // Every piece joins a bucket the farm already has (no draw calls of its own).
  const add = (g, m, color) => batch.add(g, m, color, { share: true });
  const RED = 0x8a3328;
  const TRIM = 0xe9e4d8;
  const W = 0.92; // wide (x)
  const D = 1.1; // deep (z)
  const WH = 0.74; // wall height
  add(box(W + 0.1, 0.1, D + 0.1), M(0, 0, 0), 0x5e4a36); // skids and floor
  // Side and back walls, each a row of planks with a little gap between.
  const plank = 0.115;
  for (const side of [-1, 1]) {
    for (let z = -D / 2 + plank / 2; z < D / 2; z += plank) {
      add(box(0.03, WH, plank - 0.012), M(side * (W / 2 - 0.015), 0.1, z), RED);
    }
    add(box(0.025, WH, D), M(side * (W / 2 - 0.04), 0.1, 0), 0x4a1c16); // backing behind the gaps
  }
  add(box(W, WH, 0.03), M(0, 0.1, D / 2 - 0.015), RED);
  // Front wall round a 0.4 x 0.5 doorway, an arch of short planks on top.
  const dw = 0.42;
  const dh = 0.5;
  const sideW = (W - dw) / 2;
  for (const s of [-1, 1]) add(box(sideW, WH, 0.03), M(s * (dw / 2 + sideW / 2), 0.1, -D / 2 + 0.015), RED);
  add(box(dw, WH - dh, 0.03), M(0, 0.1 + dh, -D / 2 + 0.015), RED);
  add(box(W - 0.06, WH - 0.04, D - 0.08), M(0, 0.12, 0.02), 0x1a1614); // the dark inside
  // Door frame trim standing proud of the wall, and corner boards.
  for (const s of [-1, 1]) add(box(0.05, dh + 0.04, 0.05), M(s * (dw / 2 + 0.025), 0.1, -D / 2 - 0.01), TRIM);
  add(box(dw + 0.15, 0.05, 0.05), M(0, 0.1 + dh, -D / 2 - 0.01), TRIM);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.05, WH, 0.05), M(sx * (W / 2 - 0.01), 0.1, sz * (D / 2 - 0.01)), TRIM);
  // Gable ends.
  const rise = 0.36;
  add(gable(W, D - 0.02, rise), M(0, 0.1 + WH, 0), RED);
  // Roof: two shingle slabs with an overhang, rows of shingles, a ridge cap.
  const slope = Math.atan2(rise, W / 2);
  const run = Math.hypot(W / 2, rise) + 0.12;
  const RL = D + 0.22;
  for (const s of [-1, 1]) {
    const tilt = new THREE.Matrix4().makeRotationZ(-s * slope);
    const slab = box(run, 0.035, RL).translate(s * (run / 2 - 0.02), 0, 0);
    add(slab.clone().applyMatrix4(tilt), M(0, 0.1 + WH + rise + 0.01, 0), 0x4c4945);
    // Shingle courses: thin steps down the slope.
    for (let k = 1; k < 4; k++) {
      const c = box(0.02, 0.018, RL).translate(s * (run * k) / 4, 0.03, 0);
      add(c.applyMatrix4(tilt), M(0, 0.1 + WH + rise + 0.01, 0), 0x3d3a37);
    }
  }
  add(box(0.1, 0.05, RL + 0.02), M(0, 0.1 + WH + rise + 0.02, 0), 0x3a3734);
  // Water bowl by the door.
  add(cyl(0.13, 0.07, 10, 0.15), M(0.62, 0, -0.55), 0x9aa0a4);
  add(cyl(0.12, 0.072, 10), M(0.62, 0, -0.55), 0x3d5560);
}

// Every farm dog's fence, gate and doghouse in this world.
export function buildDogYards(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  for (const dog of farmDogsIn(world)) {
    const line = fenceLine(dog);
    const T = { posts: new Tris(), boards: new Tris(), gate: new Tris(), iron: new Tris(), metal: new Tris() };
    const { posts, gate } = drawnPosts(dog, line);
    // The yard is on the right of the fence as it's drawn (farmDog.js).
    boardFence(T, posts, H, 1, gate, batch.audit, dog.id);
    // The return legs: which side the yard is on, from the doghouse spot.
    const home = runPoint(dog, dog.home);
    const yard = { x: home.x - home.dy * 8, y: home.y + home.dx * 8 };
    for (const r of dog.returns || []) {
      const [[ax, ay], [bx, by]] = r;
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / DOG.postStep));
      const pts = Array.from({ length: n + 1 }, (_, k) => ({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n }));
      const right = -(by - ay) * (yard.x - (ax + bx) / 2) + (bx - ax) * (yard.y - (ay + by) / 2);
      boardFence(T, pts, H, right > 0 ? 1 : -1, -1, batch.audit, dog.id, true);
    }
    const add = (t, color) => {
      const g = t.geometry();
      if (g) batch.add(g, I, color, { share: true });
    };
    add(T.posts, PAINT_POST);
    add(T.boards, PAINT);
    add(T.gate, PAINT);
    add(T.iron, IRON);
    // The doghouse, back from its spot, door (-z) to the road.
    const { x: hx, y: hy, angle } = doghouseSpot(dog);
    const base = Math.min(H(hx - 0.5, hy - 0.6), H(hx + 0.5, hy - 0.6), H(hx - 0.5, hy + 0.6), H(hx + 0.5, hy + 0.6)) - 0.04;
    doghouse(batch, hx, hy, base, angle);
    if (batch.audit) batch.audit.rect(dog.id, 'doghouse', hx, hy, 1.02, 1.2, angle, base);
  }
}
