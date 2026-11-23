// Yards check (#85): the finer yard ground (src3/world3d/yardGround.js) must
// be exactly what the car rides on, have no holes, stay gentle enough that
// the car never snags, and keep off buildings, roads and pads. Also the
// yard fences: off the roads, and every post solid.
//
//   npm run check:yards
//
// For each region it builds the ground meshes like the game does and casts
// rays straight down at points around every path, bank and hollow, comparing
// the drawn ground with Terrain.heightAt() (what world3d.surfaceAt() gives
// the car off the road). Then it drives a car across each dip, a step per
// call, and checks all four wheels against the mesh at every step.
// Exits 1 on any problem.

import * as THREE from 'three';
import { setRegion, REGION_IDS } from '../src/world/world.js';
import { generateScenery, makePads, buildingSolids } from '../src/drive/layout.js';
import { Collider, WHEELS } from '../src/drive/collider.js';
import { Terrain, CELL, CHUNK } from '../src3/world3d/terrain.js';
import { yardPlan, yardFenceRuns, rectDist } from '../src/world/yards.js';
import { SUB } from '../src3/world3d/yardGround.js';
import { distToSegment } from '../src/drive/geom.js';

const problems = [];
const bad = (region, what, x, y, by) => problems.push({ region, what, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, by: Math.round(by * 1000) / 1000 });

const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const from = new THREE.Vector3();

for (const id of REGION_IDS) {
  const W = setRegion(id);
  const terrain = new Terrain(W);
  const plan = yardPlan(W);
  const yard = terrain.yard;
  const mat = new THREE.MeshBasicMaterial();
  const ground = terrain.buildMeshes(mat, (x, y, h, c) => c.setRGB(0, 0, 0));
  ground.updateMatrixWorld(true);
  // The chunk mesh under a point (buildMeshes order: row by row).
  const per = Math.round(CHUNK / CELL) * CELL;
  const nc = Math.ceil((terrain.cols - 1) / Math.round(CHUNK / CELL));
  const drawn = (x, y) => {
    from.set(x, 500, y);
    ray.set(from, down);
    const mesh = ground.children[Math.floor(y / per) * nc + Math.floor(x / per)];
    const hit = mesh && ray.intersectObject(mesh, false)[0];
    return hit ? hit.point.y : null;
  };
  let samples = 0;
  let worst = 0;
  const compare = (x, y, what) => {
    samples++;
    const d = drawn(x, y);
    if (d === null) return bad(id, what + ': hole in the ground', x, y, 1);
    const e = Math.abs(terrain.heightAt(x, y) - d);
    worst = Math.max(worst, e);
    if (e > 0.002) bad(id, what + ': car height off the drawn ground', x, y, e);
  };

  if (!plan.features.length) bad(id, 'no yard shapes at all', 0, 0, 1);
  if (!yard.cells.size) bad(id, 'no finer yard cells', 0, 0, 1);

  // 1. Around every shape: a grid of points over its box, off the 1 m lattice.
  for (const f of plan.features) {
    for (let y = f.bb.minY - 2; y <= f.bb.maxY + 2; y += 0.73) for (let x = f.bb.minX - 2; x <= f.bb.maxX + 2; x += 0.61) compare(x, y, f.kind + ' ' + f.id);
  }
  // 2. The border of every finer cell, where it meets the big cells: no cracks.
  for (const k of yard.cells.keys()) {
    const i = k % terrain.cols;
    const j = (k - i) / terrain.cols;
    for (let t = 0.05; t < 1; t += 0.15) {
      compare((i + t) * CELL, j * CELL + 0.001, 'cell edge');
      compare((i + t) * CELL, (j + 1) * CELL - 0.001, 'cell edge');
      compare(i * CELL + 0.001, (j + t) * CELL, 'cell edge');
      compare((i + 1) * CELL - 0.001, (j + t) * CELL, 'cell edge');
    }
  }

  // 3. A car driving across each dip, one step per call: four wheels each step.
  let crossings = 0;
  for (const f of plan.features) {
    // Across the middle of a path; across the middle of a bank or hollow.
    const two = f.pts.length === 2;
    const m = two ? [(f.pts[0][0] + f.pts[1][0]) / 2, (f.pts[0][1] + f.pts[1][1]) / 2] : f.pts[Math.floor(f.pts.length / 2)];
    const n = two ? f.pts[1] : f.pts[Math.floor(f.pts.length / 2) + 1];
    const L = Math.hypot(n[0] - m[0], n[1] - m[1]) || 1;
    // Across the shape (perpendicular to it).
    const ux = -(n[1] - m[1]) / L;
    const uy = (n[0] - m[0]) / L;
    const heading = (Math.atan2(ux, -uy) * 180) / Math.PI;
    const h = (heading * Math.PI) / 180;
    const fx = Math.sin(h);
    const fy = -Math.cos(h);
    const ride = [];
    for (let s = -f.r - 4; s <= f.r + 4; s += 0.35) {
      const cx = m[0] + ux * s;
      const cy = m[1] + uy * s;
      let sum = 0;
      for (const [rx, fwd] of WHEELS) {
        // Same frame as car3d.js update(): local x right, forward along heading.
        const wx = cx - fy * rx + fx * fwd;
        const wy = cy + fx * rx + fy * fwd;
        compare(wx, wy, 'wheel crossing ' + f.kind + ' ' + f.id);
        sum += terrain.heightAt(wx, wy);
      }
      ride.push(sum / 4);
    }
    crossings++;
    // The car must feel the shape (it rides on it), and never at a snagging pitch.
    const span = Math.max(...ride) - Math.min(...ride);
    const mid = plan.mask(m[0], m[1]);
    if (mid > 0.9 && span < Math.abs(f.h) * 0.3) bad(id, 'car does not feel the ' + f.kind + ' ' + f.id, m[0], m[1], span);
    for (let k = 1; k < ride.length; k++) {
      const slope = Math.abs(ride[k] - ride[k - 1]) / 0.35;
      if (slope > 0.45) bad(id, 'too steep for the car at ' + f.kind + ' ' + f.id, m[0] + ux * (k * 0.35 - f.r - 4), m[1] + uy * (k * 0.35 - f.r - 4), slope);
    }
  }

  // 4. Slopes inside the finer cells, against the big grid: gentle everywhere.
  const step = CELL / SUB;
  let steep = 0;
  for (const k of yard.cells.keys()) {
    const i = k % terrain.cols;
    const j = (k - i) / terrain.cols;
    for (let b = 0; b < SUB; b++) {
      for (let a = 0; a < SUB; a++) {
        const x = (i + a / SUB) * CELL + step / 2;
        const y = (j + b / SUB) * CELL + step / 2;
        const o = (p, q) => terrain.gridHeightAt(p, q) - terrain.gridHeightAt(p, q) + yard.at(Math.floor(p / CELL), Math.floor(q / CELL), (p / CELL) % 1, (q / CELL) % 1);
        const gx = Math.abs(o(x + 0.3, y) - o(x - 0.3, y)) / 0.6;
        const gy = Math.abs(o(x, y + 0.3) - o(x, y - 0.3)) / 0.6;
        steep = Math.max(steep, gx, gy);
        if (Math.hypot(gx, gy) > 0.6) bad(id, 'yard ground too steep', x, y, Math.hypot(gx, gy));
      }
    }
  }

  // 5. Nothing moves under a building, a pad, a road or its shoulders.
  const yardAt = (x, y) => yard.at(Math.floor(x / CELL), Math.floor(y / CELL), (x / CELL) % 1, (y / CELL) % 1);
  for (const b of W.buildings) {
    for (const r of buildingSolids(b).rects) {
      for (let u = -0.5; u <= 0.5; u += 0.1) for (let v = -0.5; v <= 0.5; v += 0.1) {
        const a = ((r.angle || 0) * Math.PI) / 180;
        const x = r.x + (u * r.w) * Math.cos(a) - (v * r.h) * Math.sin(a);
        const y = r.y + (u * r.w) * Math.sin(a) + (v * r.h) * Math.cos(a);
        if (Math.abs(yardAt(x, y)) > 0.001) bad(id, 'ground moves under building ' + b.id, x, y, yardAt(x, y));
      }
    }
  }
  for (const p of makePads(W)) {
    for (let u = -0.5; u <= 0.5; u += 0.05) for (let v = -0.5; v <= 0.5; v += 0.05) {
      const a = ((p.angle || 0) * Math.PI) / 180;
      const x = p.x + (u * p.w) * Math.cos(a) - (v * p.h) * Math.sin(a);
      const y = p.y + (u * p.w) * Math.sin(a) + (v * p.h) * Math.cos(a);
      if (Math.abs(yardAt(x, y)) > 0.001) bad(id, 'ground moves under a ' + p.kind + ' pad', x, y, yardAt(x, y));
    }
  }
  for (const r of W.roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i];
      const [bx, by] = r.points[i + 1];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      for (let t = 0; t < L; t += 1) {
        for (const off of [-1, -0.5, 0, 0.5, 1]) {
          const x = ax + ((bx - ax) * t) / L + (-(by - ay) / L) * off * (r.width / 2 + 2);
          const y = ay + ((by - ay) * t) / L + ((bx - ax) / L) * off * (r.width / 2 + 2);
          if (Math.abs(yardAt(x, y)) > 0.001) bad(id, 'ground moves on road ' + r.id, x, y, yardAt(x, y));
        }
      }
    }
  }

  // 6. Yard fences: off the roads, and every post solid for the car.
  const scenery = generateScenery(W);
  const collider = new Collider(W, scenery);
  let posts = 0;
  for (const f of yardFenceRuns(W, scenery.trees)) {
    for (const run of f.runs) {
      for (const p of run) {
        posts++;
        for (const r of W.roads) {
          for (let i = 0; i < r.points.length - 1; i++) {
            const d = distToSegment(p.x, p.y, r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1]) - r.width / 2;
            if (d < 4) bad(id, 'fence post on or by road ' + r.id + ' (' + f.id + ')', p.x, p.y, d);
          }
        }
        for (const b of W.buildings) for (const r of buildingSolids(b).rects) if (rectDist(r, p.x, p.y) < 1) bad(id, 'fence post in building ' + b.id, p.x, p.y, 1);
        if (!collider.circleBlocked(p.x, p.y, 0.3)) bad(id, 'fence post the car drives through (' + f.id + ')', p.x, p.y, 1);
      }
    }
  }
  if (!posts) bad(id, 'no yard fences', 0, 0, 1);
  console.log(id + ': ' + plan.features.length + ' shapes (' + ['path', 'bank', 'hollow'].map((k) => plan.features.filter((f) => f.kind === k).length + ' ' + k).join(', ') + '), ' + yard.cells.size + ' finer cells (' + yard.cells.size * (SUB * SUB * 2 - 2) + ' extra triangles), ' + posts + ' fence posts; ' + samples + ' ground samples, worst ' + (worst * 1000).toFixed(2) + ' mm; ' + crossings + ' car crossings; steepest ' + steep.toFixed(2));
}

if (problems.length) {
  console.log('\n' + problems.length + ' problems:');
  for (const p of problems.slice(0, 40)) console.log('  ' + p.region + ' ' + p.what + ' at ' + p.x + ',' + p.y + ' (' + p.by + ')');
  process.exit(1);
}
console.log('OK: the car rides on the drawn yard ground, no holes, nothing steep, nothing under buildings, pads or roads; every yard fence post is solid.');
