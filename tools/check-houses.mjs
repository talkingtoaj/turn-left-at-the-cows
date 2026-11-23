// Houses (#76): what each house looks like (housePlan in src3/world3d/house3d.js).
// - A plan comes from the house's id: the same id gives the same plan on every
//   call, and the front turns with the road (the side nearest it).
// - Over many made-up ids every roof shape and both ways in turn up, none
//   taking most of them.
// - In every region: every roof shape is used, no two houses within 150 m
//   share roof, way in and wall colour, and each stoop or porch stays off
//   the roads and out of other buildings. houseLooks() is checked twice per
//   region (the cached and a fresh copy of the list) to give the same picks.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { distToPolyline, localToWorld } from '../src/drive/geom.js';
import { housePlan, houseLooks, entryFootprint, ROOF_SHAPES, NEAR } from '../src3/world3d/house3d.js';
import { sideDistances } from '../src3/world3d/structures.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };

// 1. Same id, same plan; the front follows the road side.
const h = { id: 'x_h1', x: 0, y: 0, w: 14, h: 11, angle: 0 };
for (const side of ['n', 's', 'e', 'w']) {
  const a = housePlan(h, side);
  const b = housePlan({ ...h }, side);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`plan for ${h.id} differs between calls`);
  const across = side === 'n' || side === 's' ? h.w : h.h;
  if (a.W !== across || a.W * a.D !== h.w * h.h) fail(`side ${side}: front is ${a.W} wide, want ${across}`);
  const fp = entryFootprint(h, a);
  const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[side];
  if (fp.x * dir[0] + fp.y * dir[1] < (side === 'n' || side === 's' ? h.h : h.w) / 2) fail(`side ${side}: the way in is not on that side`);
}

// 2. Spread over many ids.
const count = {};
for (let i = 0; i < 600; i++) {
  const p = housePlan({ id: `t_h${i}`, w: 12, h: 12 }, 's');
  count[p.roof] = (count[p.roof] || 0) + 1;
  count[p.entry] = (count[p.entry] || 0) + 1;
}
for (const k of [...ROOF_SHAPES]) if (!(count[k] > 120 && count[k] < 300)) fail(`roof ${k}: ${count[k]} of 600`);
for (const k of ['hood', 'porch']) if (!(count[k] > 220 && count[k] < 380)) fail(`entry ${k}: ${count[k]} of 600`);

// 3. Real houses.
const inRect = (x, y, r) => {
  const a = (-(r.angle || 0) * Math.PI) / 180;
  const dx = x - r.x;
  const dy = y - r.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < r.w / 2 && Math.abs(ly) < r.h / 2;
};
let n = 0;
for (const id of REGION_IDS) {
  const W = setRegion(id);
  const houses = W.buildings.filter((q) => q.kind === 'house');
  const plans = new Map();
  for (const b of houses) {
    const d = sideDistances(W, b);
    let side = 'n';
    for (const k of ['n', 's', 'e', 'w']) if (d[k] < d[side]) side = k;
    plans.set(b, housePlan(b, side, houseLooks(W).get(b.id)));
  }
  const again = houseLooks({ buildings: [...W.buildings] });
  for (const b of houses) if (JSON.stringify(again.get(b.id)) !== JSON.stringify(houseLooks(W).get(b.id))) fail(`${id} ${b.id}: picks change between calls`);
  const shapes = new Set([...plans.values()].map((p) => p.roof));
  if (houses.length >= 6 && shapes.size < ROOF_SHAPES.length) fail(`${id}: only roofs ${[...shapes]}`);
  for (const [b, p] of plans) {
    n++;
    for (const [o, q] of plans) {
      if (o === b || Math.hypot(o.x - b.x, o.y - b.y) > NEAR) continue;
      if (p.roof === q.roof && p.entry === q.entry && p.wall === q.wall) fail(`${id} ${b.id} and ${o.id} look alike`);
    }
    for (const key of ['wall', 'roofColor', 'shutterColor']) if (typeof p[key] !== 'number') fail(`${id} ${b.id}: no ${key}`);
    const r = entryFootprint(b, p);
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 6; j++) {
        const pt = localToWorld(r.x, r.y, r.angle, -r.w / 2 + (r.w * i) / 6, -r.h / 2 + (r.h * j) / 6);
        for (const road of W.roads) {
          const dd = distToPolyline(pt.x, pt.y, road.points);
          if (dd < (road.width || 6) / 2 + 1) fail(`${id} ${b.id}: ${p.entry} ${dd.toFixed(1)} m from ${road.id}`);
        }
        for (const o of W.buildings) if (o !== b && inRect(pt.x, pt.y, o)) fail(`${id} ${b.id}: ${p.entry} runs into ${o.id}`);
      }
    }
    if (process.argv.includes('--list')) console.log(id, b.id, p.side, p.roof, p.entry, p.floors, p.shutters ? 'shutters' : '', p.antenna ? 'antenna' : '');
  }
}
if (!n) fail('no houses found');
console.log(fails ? `houses: ${fails} problem(s)` : `houses: OK (${n} houses; roofs ${ROOF_SHAPES.map((k) => `${k} ${count[k]}`).join(', ')} of 600 made-up)`);
process.exit(fails ? 1 : 0);
