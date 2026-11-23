// Finer ground near buildings for the yards (#85): the 4 m terrain cells
// that a yard shape (src/world/yards.js) touches are cut into SUB x SUB
// small cells. The small cells are drawn in place of the big one, in the same
// chunk mesh (no extra draw calls), and Terrain.gridHeightAt() reads the same
// small triangles, so the car and everything placed on the ground ride
// exactly on what is drawn.
//
// Why it stays watertight: a cell is kept only if one of its small vertices
// moves. A vertex on the edge of a kept cell that borders an unkept one does
// not move, and along a big cell's edge the big triangle is a straight line,
// so the small vertices there sit exactly on the big neighbour's edge. Inside
// a kept cell each small triangle lies inside one big triangle (both split
// along the same 00-11 diagonal), where the ground is flat, so ground plus
// offset interpolates exactly.

import * as THREE from 'three';

export const SUB = 4; // small cells per big cell side (1 m)
const N = SUB + 1;
const WORN = new THREE.Color(0x8a7756); // trodden earth on a worn path

export class YardGround {
  // plan: yardPlan(world). cell: the terrain's CELL.
  constructor(terrain, plan, cell) {
    this.cols = terrain.cols;
    this.rows = terrain.rows;
    this.cell = cell;
    this.plan = plan;
    this.cells = new Map(); // j * cols + i -> Float32Array(N * N) offsets (m)
    const cand = new Set();
    for (const f of plan.features) {
      const i0 = Math.max(0, Math.floor(f.bb.minX / cell) - 1);
      const i1 = Math.min(this.cols - 2, Math.floor(f.bb.maxX / cell) + 1);
      const j0 = Math.max(0, Math.floor(f.bb.minY / cell) - 1);
      const j1 = Math.min(this.rows - 2, Math.floor(f.bb.maxY / cell) + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cand.add(j * this.cols + i);
    }
    for (const k of cand) {
      const i = k % this.cols;
      const j = (k - i) / this.cols;
      const off = new Float32Array(N * N);
      let any = false;
      for (let b = 0; b < N; b++) {
        for (let a = 0; a < N; a++) {
          let v = plan.offset((i + a / SUB) * cell, (j + b / SUB) * cell);
          if (Math.abs(v) < 1e-3) v = 0;
          off[b * N + a] = v;
          if (v) any = true;
        }
      }
      if (any) this.cells.set(k, off);
    }
  }

  has(i, j) {
    return this.cells.has(j * this.cols + i);
  }

  // Offset inside big cell (i, j) at fractions fx, fy (0..1), on the small
  // triangles (split along their 00-11 diagonal, as the big ones).
  at(i, j, fx, fy) {
    const off = this.cells.get(j * this.cols + i);
    if (!off) return 0;
    const u = fx * SUB;
    const v = fy * SUB;
    const a = Math.min(SUB - 1, Math.floor(u));
    const b = Math.min(SUB - 1, Math.floor(v));
    const tu = u - a;
    const tv = v - b;
    const o00 = off[b * N + a];
    const o10 = off[b * N + a + 1];
    const o01 = off[(b + 1) * N + a];
    const o11 = off[(b + 1) * N + a + 1];
    if (tu >= tv) return o00 + (o10 - o00) * tu + (o11 - o10) * tv;
    return o00 + (o11 - o01) * tu + (o01 - o00) * tv;
  }

  // Kept cells inside a chunk's cell range [i0, i1) x [j0, j1).
  cellsIn(i0, j0, i1, j1) {
    const out = [];
    for (const k of this.cells.keys()) {
      const i = k % this.cols;
      const j = (k - i) / this.cols;
      if (i >= i0 && i < i1 && j >= j0 && j < j1) out.push([i, j]);
    }
    return out;
  }

  // Writes the small cells' vertices into a chunk's arrays from vertex index
  // "start" on, and pushes their triangles onto A.idx. Vertex data as in
  // Terrain.buildMeshes: colour from colorFn, worn paths browner, and the
  // offset added to the bump height so hollows get the hollow shade (and mud
  // in the wet, through mudFn).
  fill(terrain, cells, A, start, colorFn, mudFn, col) {
    const cell = this.cell;
    const c = this.cols;
    const grid = (g, x, y) => {
      const gx = Math.max(0, Math.min(this.cols - 1.001, x / cell));
      const gy = Math.max(0, Math.min(this.rows - 1.001, y / cell));
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      const fx = gx - i;
      const fy = gy - j;
      const a = g[j * c + i] + (g[j * c + i + 1] - g[j * c + i]) * fx;
      const b = g[(j + 1) * c + i] + (g[(j + 1) * c + i + 1] - g[(j + 1) * c + i]) * fx;
      return a + (b - a) * fy;
    };
    const H = terrain.h;
    const big = (i, j, fx, fy) => {
      const h00 = H[j * c + i];
      const h10 = H[j * c + i + 1];
      const h01 = H[(j + 1) * c + i];
      const h11 = H[(j + 1) * c + i + 1];
      return fx >= fy ? h00 + (h10 - h00) * fx + (h11 - h10) * fy : h00 + (h11 - h01) * fx + (h01 - h00) * fy;
    };
    let k = start;
    for (const [i, j] of cells) {
      const off = this.cells.get(j * c + i);
      const base = k;
      for (let b = 0; b < N; b++) {
        for (let a = 0; a < N; a++) {
          const x = (i + a / SUB) * cell;
          const y = (j + b / SUB) * cell;
          // Big triangle under the vertex plus its own offset; built apart from
          // gridHeightAt() so tools/check-yards.mjs can catch the two drifting.
          const o = off[b * N + a];
          const h = big(i, j, a / SUB, b / SUB) + o;
          const rough = grid(terrain.roughGrid, x, y) / 255;
          const bump = grid(terrain.bumpGrid, x, y) + o;
          const open = grid(terrain.openGrid, x, y) / 255;
          const wear = o < 0 ? this.plan.wear(x, y) : 0;
          A.pos[k * 3] = x;
          A.pos[k * 3 + 1] = h;
          A.pos[k * 3 + 2] = y;
          A.uvs[k * 2] = x / 14;
          A.uvs[k * 2 + 1] = y / 14;
          A.rough[k * 2] = rough * (1 - wear * 0.6);
          A.rough[k * 2 + 1] = bump;
          if (A.mud) A.mud[k] = Math.min(1, mudFn(x, y, h, bump) + wear * 0.25);
          colorFn(x, y, h, col, rough, open);
          if (wear > 0) col.lerp(WORN, wear * 0.85);
          A.colors[k * 3] = col.r;
          A.colors[k * 3 + 1] = col.g;
          A.colors[k * 3 + 2] = col.b;
          k++;
        }
      }
      for (let b = 0; b < SUB; b++) {
        for (let a = 0; a < SUB; a++) {
          const p = base + b * N + a;
          A.idx.push(p, p + N + 1, p + 1, p, p + N, p + N + 1);
        }
      }
    }
    return k;
  }

  // Smooth normals across the seam. computeVertexNormals() leaves each small
  // triangle with its big triangle's flat normal, while the big ground is
  // smooth shaded, so a patch would show as a block. Instead: the corners of
  // every kept cell get a central-difference normal of the big grid, small
  // vertices blend their cell's four corner normals, then tilt by the
  // offset's own slope. Along a cell edge the blend is the same straight mix
  // the big neighbour's shading uses, so no seam.
  normals(terrain, cells, geo, i0, j0, w, start) {
    const nrm = geo.attributes.normal;
    const c = this.cols;
    const cell = this.cell;
    const H = terrain.h;
    const hAt = (i, j) => H[Math.max(0, Math.min(this.rows - 1, j)) * c + Math.max(0, Math.min(c - 1, i))];
    // Slopes (dh/dx, dh/dz) at big vertex (i, j).
    const slope = (i, j) => [(hAt(i + 1, j) - hAt(i - 1, j)) / (2 * cell), (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * cell)];
    const put = (k, sx, sz) => {
      const l = Math.hypot(sx, 1, sz);
      nrm.setXYZ(k, -sx / l, 1 / l, -sz / l);
    };
    const off = (x, y) => {
      const gx = Math.max(0, Math.min(this.cols - 1.001, x / cell));
      const gy = Math.max(0, Math.min(this.rows - 1.001, y / cell));
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      return this.at(i, j, gx - i, gy - j);
    };
    let k = start;
    for (const [i, j] of cells) {
      const s00 = slope(i, j);
      const s10 = slope(i + 1, j);
      const s01 = slope(i, j + 1);
      const s11 = slope(i + 1, j + 1);
      for (const [a, b, s] of [[0, 0, s00], [1, 0, s10], [0, 1, s01], [1, 1, s11]]) {
        const li = i + a - i0;
        const lj = j + b - j0;
        if (li >= 0 && li < w && lj >= 0) put(lj * w + li, s[0], s[1]);
      }
      for (let b = 0; b < N; b++) {
        for (let a = 0; a < N; a++) {
          const u = a / SUB;
          const v = b / SUB;
          const mix = (q) => (s00[q] * (1 - u) + s10[q] * u) * (1 - v) + (s01[q] * (1 - u) + s11[q] * u) * v;
          const x = (i + u) * cell;
          const y = (j + v) * cell;
          const e = 0.5;
          const ox = (off(x + e, y) - off(x - e, y)) / (2 * e);
          const oz = (off(x, y + e) - off(x, y - e)) / (2 * e);
          put(k, mix(0) + ox, mix(1) + oz);
          k++;
        }
      }
    }
    nrm.needsUpdate = true;
  }
}
