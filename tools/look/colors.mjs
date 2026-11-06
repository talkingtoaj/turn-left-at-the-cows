// Dev tool for the look test: lists every colour the static world batches
// use, with material bucket, triangle count and how the faces point, so the
// colour to surface table in src3/look/surfaces.js can be checked.
//
//   node tools/look/colors.mjs

import * as THREE from 'three';
import { WORLD } from '../../src/world/world.js';
import { generateScenery } from '../../src/drive/layout.js';
import { Terrain } from '../../src3/world3d/terrain.js';
import { Batcher } from '../../src3/world3d/batch.js';
import { buildObjects } from '../../src3/world3d/world3d.js';
import { GroundPaint } from '../../src3/world3d/paint.js';
import { surfaceOf, LAYERS } from '../../src3/look/surfaces.js';

const scenery = generateScenery(WORLD);
const terrain = new Terrain(WORLD);
const batch = new Batcher();
batch.paint = new GroundPaint(WORLD);
buildObjects(WORLD, scenery, terrain, batch, { glowTex: null });

const c = new THREE.Color();
const rows = new Map();
for (const b of batch.buckets.values()) {
  const mat = typeof b.mat === 'string' ? b.mat : b.mat.type;
  for (const g of b.geos) {
    const col = g.attributes.color;
    const nor = g.attributes.normal;
    for (let i = 0; i < col.count; i += 3) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      const hex = c.getHex();
      const k = `${mat} ${hex.toString(16).padStart(6, '0')}`;
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { tris: 0, up: 0, side: 0, down: 0, mat, hex }));
      r.tris++;
      const ny = nor.getY(i);
      if (ny > 0.7) r.up++;
      else if (ny < -0.7) r.down++;
      else r.side++;
    }
  }
}
const list = [...rows.entries()].sort((a, b) => b[1].tris - a[1].tris);
for (const [k, r] of list) {
  const s = surfaceOf(r.hex, r.mat === 'ground');
  console.log(`${k.padEnd(18)} ${String(r.tris).padStart(7)} tris  up ${r.up} side ${r.side} down ${r.down}  -> ${LAYERS[s] ? LAYERS[s].name : 'none'}`);
}
