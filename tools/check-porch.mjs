// Farmhouse porch (#63): where the wraparound porch goes (porchPlan in
// src3/world3d/farmhouse3d.js).
// - The front is the side nearest the road, picked the same way as the door
//   (ties go n, s, e, w), and the porch turns onto the neighbouring side
//   nearer the road. Checked on made-up houses, with the roads moving between calls.
// - The door sits on the front run of the porch, clear of the corner and the far end.
// - On every farmhouse in every region, the porch and its steps stay off
//   every road and every other building.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { distToPolyline, localToWorld } from '../src/drive/geom.js';
import { porchPlan, porchFootprint } from '../src3/world3d/farmhouse3d.js';
import { sideDistances } from '../src3/world3d/structures.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };
const ADJ = { n: ['e', 'w'], s: ['e', 'w'], e: ['n', 's'], w: ['n', 's'] };

// 1. Picks on a made-up house, as the nearest road moves round it.
const house = { id: 'x', x: 0, y: 0, w: 14, h: 12, angle: 0 };
const cases = [
  [{ n: 30, s: 10, e: 20, w: 40 }, 's', 'e'],
  [{ n: 30, s: 10, e: 40, w: 20 }, 's', 'w'],
  [{ n: 5, s: 10, e: 40, w: 20 }, 'n', 'w'],
  [{ n: 50, s: 40, e: 8, w: 60 }, 'e', 's'],
  [{ n: 12, s: 12, e: 30, w: 30 }, 'n', 'e'], // ties: n before s, then e before w
  [{ n: 40, s: 41, e: 50, w: 3 }, 'w', 'n'],
];
for (const [sides, front, wrap] of cases) {
  const p = porchPlan(house, sides);
  if (p.front !== front || p.wrap !== wrap) fail(`sides ${JSON.stringify(sides)}: got ${p.front}/${p.wrap}, want ${front}/${wrap}`);
  if (!ADJ[p.front].includes(p.wrap)) fail(`wrap ${p.wrap} is not next to ${p.front}`);
  // The door is on the front wall and on the porch, away from its ends.
  const half = p.front === 'n' || p.front === 's' ? house.h / 2 : house.w / 2;
  const out = p.front === 'n' || p.front === 's' ? Math.abs(p.doorL[1]) : Math.abs(p.doorL[0]);
  if (Math.abs(out - half) > 1e-6) fail(`door not on the ${p.front} wall`);
  if (p.aDoor < 1.2 || p.aDoor > p.LA - 1.2) fail(`door at a=${p.aDoor.toFixed(2)} too near the porch's ends (0..${p.LA})`);
  // The deck strips touch the walls and run outward (b < 0 on the front, a < 0 on the side).
  const [f, s] = p.rects;
  if (f[3] !== 0 || s[1] !== 0 || f[2] >= 0 || s[0] >= 0) fail('deck strips do not sit against the walls');
}

// 2. Every farmhouse in every region: porch off the roads and other buildings.
const inRect = (x, y, r) => {
  const a = (-(r.angle || 0) * Math.PI) / 180;
  const dx = x - r.x;
  const dy = y - r.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) < r.w / 2 && Math.abs(ly) < r.h / 2;
};
let houses = 0;
for (const id of REGION_IDS) {
  const W = setRegion(id);
  for (const b of W.buildings.filter((q) => q.kind === 'farmhouse')) {
    houses++;
    const plan = porchPlan(b, sideDistances(W, b));
    for (const r of porchFootprint(b, plan)) {
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 8; j++) {
          const p = localToWorld(r.x, r.y, r.angle, -r.w / 2 + (r.w * i) / 8, -r.h / 2 + (r.h * j) / 8);
          for (const road of W.roads) {
            const d = distToPolyline(p.x, p.y, road.points);
            if (d < (road.width || 6) / 2 + 1) fail(`${id} ${b.id}: porch ${d.toFixed(1)} m from ${road.id}`);
          }
          for (const o of W.buildings) if (o !== b && inRect(p.x, p.y, o)) fail(`${id} ${b.id}: porch runs into ${o.id}`);
        }
      }
    }
    console.log(`${id} ${b.id}: front ${plan.front}, wraps ${plan.wrap}`);
  }
}
if (!houses) fail('no farmhouses found');
console.log(fails ? `porch: ${fails} problem(s)` : `porch: OK (${cases.length} made-up houses, ${houses} farmhouses)`);
process.exit(fails ? 1 : 0);
