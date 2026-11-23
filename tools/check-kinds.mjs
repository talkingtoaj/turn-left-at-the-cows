// Checks the store, diner and cabin models (kinds.js, #77): every piece
// stays inside the solid footprint (roof eaves may hang over the sides and
// back a little, nothing sticks out toward the road), the roof vent helper
// gives the right height on both kinds of gable, and each building stays
// under a triangle budget.
//
//   node tools/check-kinds.mjs

import * as THREE from 'three';
import { WORLD, setRegion, REGION_IDS } from '../src/world/world.js';
import { DEG } from '../src/drive/geom.js';
import { objMatrix } from '../src3/world3d/batch.js';
import { buildKind } from '../src3/world3d/kinds.js';
import { gableUp } from '../src3/world3d/kindParts.js';
import { sideDistances } from '../src3/world3d/structures.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };
const near = (a, b, msg) => { if (Math.abs(a - b) > 1e-6) fail(`${msg}: ${a} != ${b}`); };

// gableUp: ridge along x when w >= d (height falls off with dy), along y otherwise.
near(gableUp(10, 6, 2, 3, 0), 2, 'ridge along x, on the ridge');
near(gableUp(10, 6, 2, 0, 1.5), 1, 'ridge along x, half way down');
near(gableUp(10, 6, 2, 0, 3), 0, 'ridge along x, at the eave');
near(gableUp(6, 10, 2, 1.5, 4), 1, 'ridge along y, half way down');
near(gableUp(6, 10, 2, 0, -4), 2, 'ridge along y, on the ridge');
near(gableUp(6, 10, 2, 5, 0), 0, 'ridge along y, past the eave');

const KINDS = ['store', 'diner', 'cabin'];
const TRI_CAP = { store: 9000, diner: 9000, cabin: 7000 };
const OVER_SIDE = 0.9; // eaves and trim past the side and back walls
const OVER_FRONT = 0.15; // fascia and nosing past the road side
const seen = new Set();
const v = new THREE.Vector3();
for (const region of REGION_IDS) {
  setRegion(region);
  for (const b of WORLD.buildings.filter((q) => KINDS.includes(q.kind))) {
    seen.add(b.kind);
    const d = sideDistances(WORLD, b);
    let side = 'n';
    for (const k of ['n', 's', 'e', 'w']) if (d[k] < d[side]) side = k;
    let tris = 0;
    // Worst overshoot past each side of the footprint, in the building's own frame.
    const over = { n: -Infinity, s: -Infinity, e: -Infinity, w: -Infinity };
    const ca = Math.cos((b.angle || 0) * DEG);
    const sa = Math.sin((b.angle || 0) * DEG);
    const batch = {
      place(geo, x, y, base, angle, lx, ly, up, color, opts) {
        const m = objMatrix(x, y, base, angle, lx, ly, up, opts && opts.extra);
        const p = geo.attributes.position;
        tris += (geo.index ? geo.index.count : p.count) / 3;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m);
          const dx = v.x - b.x;
          const dy = v.z - b.y;
          // Undo the building's own turn (heading-style, clockwise).
          const rx = dx * ca + dy * sa;
          const ry = -dx * sa + dy * ca;
          over.e = Math.max(over.e, rx - b.w / 2);
          over.w = Math.max(over.w, -rx - b.w / 2);
          over.s = Math.max(over.s, ry - b.h / 2);
          over.n = Math.max(over.n, -ry - b.h / 2);
        }
      },
    };
    buildKind(batch, b, 0, side);
    const tag = `${region} ${b.id} (${b.kind}, front ${side})`;
    for (const k of ['n', 's', 'e', 'w']) {
      const lim = k === side ? OVER_FRONT : OVER_SIDE;
      if (over[k] > lim) fail(`${tag}: sticks out ${over[k].toFixed(2)} m past the ${k} side (limit ${lim})`);
    }
    if (tris > TRI_CAP[b.kind]) fail(`${tag}: ${tris} triangles (cap ${TRI_CAP[b.kind]})`);
    console.log(`${tag}: ${tris} triangles, overshoot ${Object.entries(over).map(([k, o]) => k + ' ' + o.toFixed(2)).join(', ')}`);
  }
}
for (const k of KINDS) if (!seen.has(k)) fail(`no ${k} found in any region`);
if (fails) {
  console.log(`check-kinds: ${fails} failed`);
  process.exit(1);
}
console.log('check-kinds: ok');
