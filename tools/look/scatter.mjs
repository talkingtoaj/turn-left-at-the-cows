// Rock and shrub models for the open-land scatter (src3/world3d/scatter3d.js):
// CC0 Quaternius models (via Poly Pizza) cut down to about a hundred
// triangles each and written as one small GLB, public/look/scatter.glb.
//
//   npm i --no-save meshoptimizer        (only this tool needs it)
//   node tools/look/scatter.mjs <dir with the downloaded .glb files>
//
// Downloads (all Quaternius, CC0 1.0, see public/look/SOURCES.md):
//   https://static.poly.pizza/<resource>.glb, the Poly Pizza ids are in SRC.
//
// Each output mesh: POSITION (float) and COLOR_0 (unsigned byte, linear),
// indexed, base at y = 0, centred, footprint radius 1 and height 1 (the game
// scales each instance to its own radius and height). Colours are the game's
// own (rock greys, shrub greens), darker toward the ground so they sit in it.

import fs from 'fs';
import path from 'path';
import { readGlb, writeGlb } from './glb.mjs';

const { MeshoptSimplifier: S } = await import(process.env.MESHOPT || 'meshoptimizer');
await S.ready;

const [, , srcDir, out = 'public/look/scatter.glb'] = process.argv;
if (!srcDir) throw new Error('usage: node tools/look/scatter.mjs <download dir> [out.glb]');

// file: Poly Pizza id. parts: [match on material name, colour (sRGB hex),
// triangle target]; parts not matched are dropped. dark: how much darker the
// bottom is than the top (0..1).
const SRC = [
  { name: 'boulder', file: 'Z6M4GNkgWt', parts: [[/./, 0xa29e94, 110]], dark: 0.35 },
  { name: 'slab', file: '4MUaQTcDdc', parts: [[/./, 0x9c9890, 110]], dark: 0.35 },
  { name: 'gorse', file: 'U1ymDy8tbY', parts: [[/Leaves/, 0x3e5a28, 110], [/Flowers/, 0xe2b81e, 46]], dark: 0.45 },
  { name: 'round', file: 'ooG6CkLyE8', parts: [[/./, 0x4c7a30, 120]], dark: 0.45 },
  { name: 'bramble', file: 'TSbIxkDtxF', parts: [[/Green/, 0x41582a, 110], [/Berry/, 0x3a1a2c, 36]], dark: 0.45 },
];

const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});

// Weld by position, then simplify to about `target` triangles.
function simplify(positions, indices, target) {
  const remap = S.generatePositionRemap(positions, 3);
  const idx = indices.map((i) => remap[i]);
  if (target >= idx.length / 3) return idx;
  for (const err of [0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6]) {
    const [r] = S.simplify(idx, positions, 3, target * 3, err, ['Permissive']);
    if (r.length / 3 <= target * 1.2 && r.length > 0) return r;
  }
  const [r] = S.simplifySloppy(idx, positions, 3, null, target * 3, 0.3);
  return r;
}

function build(cfg) {
  const parts = readGlb(path.join(srcDir, `${cfg.file}.glb`));
  // Frame: base, centre and footprint from all kept parts.
  const kept = [];
  for (const [re, hex, target] of cfg.parts) {
    const sel = parts.filter((p) => re.test(p.material) && !kept.some((k) => k.parts.includes(p)));
    if (sel.length) kept.push({ parts: sel, hex, target });
  }
  let y0 = Infinity;
  let y1 = -Infinity;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const k of kept) {
    for (const p of k.parts) {
      for (let i = 0; i < p.positions.length; i += 3) {
        y0 = Math.min(y0, p.positions[i + 1]);
        y1 = Math.max(y1, p.positions[i + 1]);
        sx += p.positions[i];
        sz += p.positions[i + 2];
        n++;
      }
    }
  }
  const cx = sx / n;
  const cz = sz / n;
  const d = [];
  for (const k of kept) for (const p of k.parts) for (let i = 0; i < p.positions.length; i += 3) d.push(Math.hypot(p.positions[i] - cx, p.positions[i + 2] - cz));
  d.sort((a, b) => a - b);
  const rad = d[Math.floor(d.length * 0.95)] || 1;
  const hgt = y1 - y0;
  const P = [];
  const C = [];
  const I = [];
  for (const k of kept) {
    let m = 0;
    const pos = [];
    const ind = [];
    for (const p of k.parts) {
      for (const v of p.positions) pos.push(v);
      for (const i of p.indices) ind.push(i + m);
      m += p.positions.length / 3;
    }
    const fpos = Float32Array.from(pos);
    const r = simplify(fpos, Uint32Array.from(ind), k.target);
    const used = new Map();
    const base = lin(k.hex);
    for (const i of r) {
      if (!used.has(i)) {
        used.set(i, P.length / 3);
        const y = (fpos[i * 3 + 1] - y0) / hgt;
        P.push((fpos[i * 3] - cx) / rad, y, (fpos[i * 3 + 2] - cz) / rad);
        const shade = 1 - cfg.dark * (1 - Math.min(1, y * 1.4));
        C.push(...base.map((v) => Math.round(Math.min(1, v * shade) * 255)), 255);
      }
      I.push(used.get(i));
    }
  }
  return { name: cfg.name, P: Float32Array.from(P), C: Uint8Array.from(C), I: Uint16Array.from(I), aspect: (hgt / rad).toFixed(2) };
}

const meshes = SRC.map(build);
for (const m of meshes) console.log(`${m.name}: ${m.I.length / 3} tris, native height ${m.aspect} radii`);
writeGlb(meshes, out, 'tools/look/scatter.mjs', 'Quaternius (CC0 1.0), cut down for Ask a Local');
console.log(out, fs.statSync(out).size, 'bytes');
