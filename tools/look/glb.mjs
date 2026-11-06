// Minimal GLB reader and writer for the model tools (tools/look/scatter.mjs).
// The input GLBs are read as data only (no code in them); the reader handles
// what the Poly Pizza / Quaternius files use: one buffer, float positions,
// u8/u16/u32 indices, node transforms, materials with a base colour.

import fs from 'fs';

export function readGlb(file) {
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
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    const stride = v.byteStride || 0;
    const el = n * T.BYTES_PER_ELEMENT;
    const out = new T(a.count * n);
    for (let k = 0; k < a.count; k++) {
      const src = bin.subarray(start + k * (stride || el), start + k * (stride || el) + el);
      const copy = Buffer.from(src);
      out.set(new T(copy.buffer, copy.byteOffset, n), k * n);
    }
    return out;
  };
  // Parts: [{ material, color [r, g, b] linear, positions (world), indices }]
  const parts = [];
  const visit = (ni, parent) => {
    const node = json.nodes[ni];
    const world = mul(parent, compose(node));
    if (node.mesh !== undefined) {
      for (const p of json.meshes[node.mesh].primitives) {
        const pos = acc(p.attributes.POSITION);
        const idx = p.indices !== undefined ? Uint32Array.from(acc(p.indices)) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        const m = p.material !== undefined ? json.materials[p.material] : {};
        const bc = (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [1, 1, 1, 1];
        const wp = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
          wp[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
          wp[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
          wp[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
        }
        parts.push({ node: node.name || '', material: m.name || '', color: bc.slice(0, 3), positions: wp, indices: idx });
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

// meshes: [{ name, P: Float32Array xyz, C: Uint8Array rgba (linear), I: Uint16Array }]
export function writeGlb(meshes, file, generator, copyright) {
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
    asset: { version: '2.0', generator, copyright },
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
