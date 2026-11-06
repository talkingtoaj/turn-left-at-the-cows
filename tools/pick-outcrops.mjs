// Finds hilltop spots for named rock outcrops (world.outcrops in
// src/world/data.js). Prints candidates; the authored list was picked from
// this output, so missions and locals can name them and they never move.
//
//   node tools/pick-outcrops.mjs [count]
//
// A spot: a local top of the 3D ground (src3/world3d/terrain.js), standing at
// least 3 m above the ground 120 m around it, on open land (no field, forest,
// town or yard within 30 m), 70 to 400 m from the nearest road so it shows
// from the road, and at least 550 m from any other spot.

import { WORLD } from '../src/world/world.js';
import { Terrain } from '../src3/world3d/terrain.js';
import { roughnessFor } from '../src/world/roughness.js';
import { distToPolyline } from '../src/drive/geom.js';

const want = Number(process.argv[2] || 10);
const terrain = new Terrain(WORLD);
const R = roughnessFor(WORLD);
const H = (x, y) => terrain.heightAt(x, y);
const STEP = 20;
const cands = [];
for (let y = 60; y < WORLD.size.h - 60; y += STEP) {
  for (let x = 60; x < WORLD.size.w - 60; x += STEP) {
    const h = H(x, y);
    let top = true;
    for (let a = 0; a < 8 && top; a++) {
      for (const d of [20, 40, 80]) if (H(x + Math.cos(a * Math.PI / 4) * d, y + Math.sin(a * Math.PI / 4) * d) > h) top = false;
    }
    if (!top) continue;
    let ring = 0;
    for (let a = 0; a < 12; a++) ring += H(x + Math.cos(a * Math.PI / 6) * 120, y + Math.sin(a * Math.PI / 6) * 120);
    const prom = h - ring / 12;
    if (prom < 3) continue;
    let open = true;
    for (let a = 0; a < 12 && open; a++) {
      for (const d of [0, 15, 30]) {
        const g = R.at(x + Math.cos(a * Math.PI / 6) * d, y + Math.sin(a * Math.PI / 6) * d);
        if (g.open < 0.999 || g.fd < 25) open = false;
      }
    }
    if (!open) continue;
    let road = Infinity;
    for (const r of WORLD.roads) road = Math.min(road, distToPolyline(x, y, r.points) - r.width / 2);
    if (road < 70 || road > 400) continue;
    if ((WORLD.locals || []).some((l) => Math.hypot(l.x - x, l.y - y) < 80)) continue;
    cands.push({ x, y, h: +h.toFixed(1), prom: +prom.toFixed(1), road: Math.round(road) });
  }
}
cands.sort((a, b) => b.prom - a.prom);
const out = [];
for (const c of cands) {
  if (out.length >= want) break;
  if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 550)) continue;
  out.push(c);
}
console.log(`${cands.length} candidate tops; best ${out.length}:`);
for (const o of out) console.log(`  { x: ${o.x}, y: ${o.y} }  // ${o.h} m high, ${o.prom} m above the ground around, ${o.road} m from a road`);
