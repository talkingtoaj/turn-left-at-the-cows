// Fallen tree checker: every fixed fallen tree (scenery.fallen, from
// src/world/fallenTrees.js) must leave a way past, so none ever changes a
// mission. For each one it checks:
//   - a car-width way past: the car's collision footprint (a circle a bit
//     wider than the car's half width) is routed on a 0.5 m grid from the
//     road APPROACH m before the tree to APPROACH m after it, staying within
//     CORRIDOR m of the road edge (on the road or the verge, not off through
//     the woods). Solids: the tree's trunk and root plate plus everything
//     static in the collider (trees, fences, buildings, water).
//   - the trunk really lies part way across the road,
//   - its base is where a tree could grow: off the road, not on a bridge or
//     in water, not in a field, with trees or a forest near it,
//   - it is clear of the start and the mission goals.
//
//   npm run check:fallen            (npm run check:blockers is the same)
//
// Exits 1 when any check fails.

import { WORLD } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Collider, CAR_R } from '../src/drive/collider.js';
import { createHazards } from '../src/ambient/hazards.js';
import { measurePolyline, pointAlong, distToPolyline, pointInPolygon } from '../src/drive/geom.js';
import { MISSIONS } from '../src/game/missions.js';

const APPROACH = 30; // m along the road before and after the tree
const CORRIDOR = 8; // m past the road edge the way past may use
const CLEAR = CAR_R * 1.15; // footprint radius: the car's half width plus a little
const CELL = 0.5;

const t0 = Date.now();
const scenery = generateScenery(WORLD);
const collider = new Collider(WORLD, scenery);
const hz = createHazards(WORLD, scenery);

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function wayPast(f) {
  const road = WORLD.roads.find((r) => r.id === f.roadId);
  const cum = measurePolyline(road.points);
  const L = cum[cum.length - 1];
  const a = pointAlong(road.points, cum, Math.max(0, f.at - APPROACH));
  const z = pointAlong(road.points, cum, Math.min(L, f.at + APPROACH));
  const mid = pointAlong(road.points, cum, f.at);
  const half = road.width / 2 + CORRIDOR;
  const span = APPROACH + half + 4;
  const ox = mid.x - span;
  const oy = mid.y - span;
  const side = Math.ceil((2 * span) / CELL);
  const state = new Uint8Array(side * side); // 0 unknown, 1 open, 2 shut
  const hitTree = (x, y) => f.solids.some((s) => (s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + CLEAR) ** 2);
  const open = (ix, iy) => {
    if (ix < 0 || iy < 0 || ix >= side || iy >= side) return false;
    const k = iy * side + ix;
    if (!state[k]) {
      const x = ox + (ix + 0.5) * CELL;
      const y = oy + (iy + 0.5) * CELL;
      const ok = distToPolyline(x, y, road.points) <= half && !hitTree(x, y) && collider.circleHit(x, y, CLEAR) === null;
      state[k] = ok ? 1 : 2;
    }
    return state[k] === 1;
  };
  const cellOf = (p) => [Math.floor((p.x - ox) / CELL), Math.floor((p.y - oy) / CELL)];
  const seed = (p) => {
    const [cx, cy] = cellOf(p);
    for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (open(cx + dx, cy + dy)) return [cx + dx, cy + dy];
    return null;
  };
  const s = seed(a);
  const t = seed(z);
  if (!s || !t) return { ok: false, note: 'road blocked at the approach points' };
  const seen = new Uint8Array(side * side);
  const queue = [s];
  seen[s[1] * side + s[0]] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi];
    if (x === t[0] && y === t[1]) return { ok: true };
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= side || ny >= side || seen[ny * side + nx]) continue;
      if (dx && dy && !(open(x + dx, y) && open(x, y + dy))) continue;
      if (!open(nx, ny)) continue;
      seen[ny * side + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  return { ok: false, note: 'no way past' };
}

// How much of the road's width the trunk covers (m), sampled across it.
function covered(f) {
  const road = WORLD.roads.find((r) => r.id === f.roadId);
  let onRoad = 0;
  for (const s of f.solids) if (distToPolyline(s.x, s.y, road.points) < road.width / 2) onRoad++;
  return onRoad;
}

const goals = [];
for (const m of MISSIONS) if (m.goal) goals.push(m.goal);
for (const p of WORLD.places || []) goals.push(p);

let bad = 0;
console.log(`Fallen tree check: ${hz.fallen.length} fixed fallen trees (way past at ${(2 * CLEAR).toFixed(2)} m wide within ${CORRIDOR} m of the road edge)`);
if (hz.fallen.length < 4) {
  console.log(`  FAIL only ${hz.fallen.length} fallen trees placed (want 4 or more)`);
  bad++;
}
for (const f of hz.fallen) {
  const road = WORLD.roads.find((r) => r.id === f.roadId);
  const fails = [];
  const w = wayPast(f);
  if (!w.ok) fails.push(w.note);
  if (!covered(f)) fails.push('trunk does not reach the road');
  const baseD = distToPolyline(f.x, f.y, road.points);
  if (baseD < road.width / 2 + 4) fails.push('base on or by the road');
  if (collider.onIntactBridge && collider.onIntactBridge(f.x, f.y)) fails.push('base on a bridge');
  const wet = collider.circleHit(f.x, f.y, 2);
  if (wet === 'water' || wet === 'lake') fails.push('base in water');
  for (const fl of WORLD.fields || []) if (pointInPolygon(f.x, f.y, fl.polygon)) fails.push('base in a field');
  const treesNear = scenery.trees.filter((t) => Math.hypot(t.x - f.x, t.y - f.y) < 25).length;
  const forest = (WORLD.forests || []).some((fo) => pointInPolygon(f.x, f.y, fo.polygon));
  if (!treesNear && !forest && !f.tree.windbreak) fails.push('no trees or woods near its base');
  if (Math.hypot(f.x - WORLD.start.x, f.y - WORLD.start.y) < 300) fails.push('too close to the start');
  for (const g of goals) if (Math.hypot(f.x - g.x, f.y - g.y) < 200) fails.push(`too close to ${g.name || g.id}`);
  const where = `${f.id}: ${f.roadId} at ${Math.round(f.at)} m, base (${f.x.toFixed(0)}, ${f.y.toFixed(0)}) ${baseD.toFixed(1)} m from the centre, ${f.kind} ${f.h.toFixed(0)} m, gap ${f.gap.toFixed(1)} m of road, ${treesNear} trees within 25 m${forest ? ', in a forest' : ''}${f.tree.windbreak ? ', windbreak' : ''}`;
  if (fails.length) {
    bad++;
    console.log(`  FAIL ${where}: ${fails.join('; ')}`);
  } else console.log(`  ok   ${where}`);
}
console.log(`${bad ? `${bad} FAILED` : 'OK: there is a way past every fallen tree'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad ? 1 : 0);
