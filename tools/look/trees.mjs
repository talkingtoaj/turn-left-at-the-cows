// Tree models for ?trees=new: CC0 Quaternius trees (via Poly Pizza) cut down
// to a few hundred triangles each and written as one small GLB,
// public/look/trees.glb, with one mesh per kind and level of detail.
//
//   npm i --no-save meshoptimizer        (only this tool needs it)
//   node tools/look/trees.mjs <dir with the downloaded .glb files>
//
// Downloads (all Quaternius, CC0 1.0, see public/look/SOURCES.md):
//   https://static.poly.pizza/<resource>.glb, the ids are in SRC below.
//
// Each output mesh: POSITION (float) and COLOR_0 (unsigned byte, the game's
// own leaf and trunk colours, so the palette stays), indexed, base at y = 0,
// trunk at x = z = 0, canopy radius 1 and the game's height for that kind
// (in tree radii, like the old shapes in src3/world3d/trees.js).
//
// The input GLBs are read as data only (no code in them); this parser handles
// what these files use: one buffer, float positions, u16/u32 indices, a node
// transform per mesh.

import fs from 'fs';
import path from 'path';

const { MeshoptSimplifier: S } = await import(process.env.MESHOPT || 'meshoptimizer');
await S.ready;

const [, , srcDir, out = 'public/look/trees.glb'] = process.argv;
if (!srcDir) throw new Error('usage: node tools/look/trees.mjs <download dir> [out.glb]');

// Game colours (sRGB hex), as in trees.js.
const LEAF = { pine: 0x2f5a33, oak: 0x41733a, willow: 0x7f9e48, bush: 0x3f6b34 };
const WOOD = 0x5a4030;
const LEAF_GAIN = 1.3;

// file: Poly Pizza id. height: total height in canopy radii. wood/leaf:
// triangle targets (near, far). Materials named Wood/Brown are trunk.
const SRC = [
  { name: 'pine', file: 'gX8WmgkeEm', leaf: LEAF.pine, height: 3.9, near: [10, 220], far: [0, 50] },
  { name: 'oakA', file: '9nvGuZlbpE', leaf: LEAF.oak, height: 2.9, near: [16, 190], far: [4, 44] },
  { name: 'oakB', file: '8qABc2Nslz', leaf: LEAF.oak, height: 2.9, near: [16, 190], far: [4, 44] },
  { name: 'willow', file: 'mBrUbIp9Zd', leaf: LEAF.willow, height: 2.0, near: [24, 190], far: [4, 44] },
  { name: 'bush', file: '92EytlU1El', leaf: LEAF.bush, height: 1.1, near: [0, 40], far: null },
];

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off);
    const type = b.readUInt32LE(off + 4);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  const acc = (i) => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const start = (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || 0;
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    if (stride && stride !== n * T.BYTES_PER_ELEMENT) throw new Error('strided data not handled');
    const copy = Buffer.from(bin.subarray(start, start + a.count * n * T.BYTES_PER_ELEMENT));
    return new T(copy.buffer, copy.byteOffset, a.count * n);
  };
  // Parts: [{ wood, positions (world), indices }]
  const parts = [];
  const visit = (ni, parent) => {
    const node = json.nodes[ni];
    const m = compose(node);
    const world = mul(parent, m);
    if (node.mesh !== undefined) {
      for (const p of json.meshes[node.mesh].primitives) {
        const pos = acc(p.attributes.POSITION);
        const idx = p.indices !== undefined ? Uint32Array.from(acc(p.indices)) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        const mat = p.material !== undefined ? json.materials[p.material].name || '' : '';
        const wp = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
          wp[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
          wp[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
          wp[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
        }
        parts.push({ wood: /wood|brown|trunk|bark/i.test(mat), positions: wp, indices: idx });
      }
    }
    for (const c of node.children || []) visit(c, world);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of json.scenes[json.scene || 0].nodes) visit(r, I);
  return parts;
}

function compose(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

// Weld by position, then simplify to about `target` triangles: the smallest
// error bound that gets there, sloppy (topology-free) only as a last resort.
function simplify(positions, indices, target) {
  const remap = S.generatePositionRemap(positions, 3);
  const idx = indices.map((i) => remap[i]);
  if (target >= idx.length / 3) return idx;
  for (const err of [0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6]) {
    const [r] = S.simplify(idx, positions, 3, target * 3, err, ['Permissive']);
    if (r.length / 3 <= target * 1.2 && r.length > 0) {
      if (process.env.VERBOSE) console.log(`  ${idx.length / 3} -> ${r.length / 3} tris at error ${err}`);
      return r;
    }
  }
  const [r] = S.simplifySloppy(idx, positions, 3, null, target * 3, 0.3);
  if (process.env.VERBOSE) console.log(`  ${idx.length / 3} -> ${r.length / 3} tris, sloppy`);
  return r;
}

function buildMesh(parts, cfg, targets, frame) {
  const P = [];
  const C = [];
  const I = [];
  for (const wantWood of [true, false]) {
    const sel = parts.filter((p) => p.wood === wantWood);
    if (!sel.length) continue;
    const target = wantWood ? targets[0] : targets[1];
    if (target <= 0) continue;
    // Merge this group's parts, then simplify together.
    let n = 0;
    const pos = [];
    const ind = [];
    for (const p of sel) {
      for (const v of p.positions) pos.push(v);
      for (const i of p.indices) ind.push(i + n);
      n += p.positions.length / 3;
    }
    const fpos = Float32Array.from(pos);
    const r = simplify(fpos, Uint32Array.from(ind), target);
    // Compact: keep used vertices only.
    const used = new Map();
    for (const i of r) {
      if (!used.has(i)) {
        used.set(i, P.length / 3);
        const x = (fpos[i * 3] - frame.cx) * frame.s;
        const y = (fpos[i * 3 + 1] - frame.y0) * frame.sy;
        const z = (fpos[i * 3 + 2] - frame.cz) * frame.s;
        P.push(x, y, z);
        // glTF COLOR_0 as normalised bytes is linear; store linear.
        // Leaves a little lighter than the old shapes: these have more faces
        // turned from the sun, so they read darker at the same colour.
        const c = wantWood ? lin(WOOD) : lin(cfg.leaf).map((v) => Math.min(1, v * LEAF_GAIN));
        C.push(...c.map((v) => Math.round(v * 255)), 255);
      }
      I.push(used.get(i));
    }
  }
  return { P: Float32Array.from(P), C: Uint8Array.from(C), I: Uint16Array.from(I) };
}

function frameOf(parts, cfg) {
  let y0 = Infinity; let y1 = -Infinity;
  for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) { y0 = Math.min(y0, p.positions[i]); y1 = Math.max(y1, p.positions[i]); }
  // Trunk base centre: wood vertices in the lowest 5% of the height.
  let sx = 0; let sz = 0; let k = 0;
  for (const p of parts) {
    if (!p.wood && parts.some((q) => q.wood)) continue;
    for (let i = 0; i < p.positions.length; i += 3) {
      if (p.positions[i + 1] < y0 + (y1 - y0) * 0.05) { sx += p.positions[i]; sz += p.positions[i + 2]; k++; }
    }
  }
  const cx = k ? sx / k : 0;
  const cz = k ? sz / k : 0;
  // Canopy radius: 95th percentile of leaf distance from the trunk axis.
  const d = [];
  for (const p of parts) if (!p.wood) for (let i = 0; i < p.positions.length; i += 3) d.push(Math.hypot(p.positions[i] - cx, p.positions[i + 2] - cz));
  d.sort((a, b) => a - b);
  const rad = d[Math.floor(d.length * 0.95)] || 1;
  const s = 1 / rad;
  return { cx, cz, y0, s, sy: cfg.height / (y1 - y0), aspect: ((y1 - y0) * s).toFixed(2) };
}

// ---------- GLB writer ----------
function writeGlb(meshes, file) {
  const chunks = [];
  let len = 0;
  const views = [];
  const accessors = [];
  const add = (arr, target) => {
    const pad = (4 - (len % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; }
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    views.push({ buffer: 0, byteOffset: len, byteLength: buf.length, target });
    chunks.push(buf);
    len += buf.length;
    return views.length - 1;
  };
  const gm = [];
  const nodes = [];
  for (const m of meshes) {
    const n = m.P.length / 3;
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.P.length; i++) { mn[i % 3] = Math.min(mn[i % 3], m.P[i]); mx[i % 3] = Math.max(mx[i % 3], m.P[i]); }
    accessors.push({ bufferView: add(m.P, 34962), componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx });
    const pa = accessors.length - 1;
    accessors.push({ bufferView: add(m.C, 34962), componentType: 5121, normalized: true, count: n, type: 'VEC4' });
    const ca = accessors.length - 1;
    accessors.push({ bufferView: add(m.I, 34963), componentType: 5123, count: m.I.length, type: 'SCALAR' });
    const ia = accessors.length - 1;
    gm.push({ name: m.name, primitives: [{ attributes: { POSITION: pa, COLOR_0: ca }, indices: ia }] });
    nodes.push({ name: m.name, mesh: gm.length - 1 });
  }
  const pad = (4 - (len % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; }
  const json = {
    asset: { version: '2.0', generator: 'tools/look/trees.mjs', copyright: 'Quaternius (CC0 1.0), cut down for Ask a Local' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gm, accessors, bufferViews: views, buffers: [{ byteLength: len }],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, bin]));
}

const meshes = [];
for (const cfg of SRC) {
  const parts = readGlb(path.join(srcDir, `${cfg.file}.glb`));
  const frame = frameOf(parts, cfg);
  const near = buildMesh(parts, cfg, cfg.near, frame);
  meshes.push({ name: cfg.name, ...near });
  let line = `${cfg.name}: native height ${frame.aspect} radii, near ${near.I.length / 3} tris`;
  if (cfg.far) {
    const far = buildMesh(parts, cfg, cfg.far, frame);
    meshes.push({ name: `${cfg.name}Far`, ...far });
    line += `, far ${far.I.length / 3} tris`;
  }
  console.log(line);
}
writeGlb(meshes, out);
console.log(out, fs.statSync(out).size, 'bytes');
