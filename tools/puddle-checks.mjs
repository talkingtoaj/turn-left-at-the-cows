// Checks for the puddles (src3/world3d/puddles3d.js), used by
// tools/check-world.mjs. Returns { problems, counts }.
//
//   - every decal lies exactly on the ground: each vertex, edge midpoint and
//     triangle centre within TIGHT of the ground (or dirt road) plus its lift
//     (stricter than the 10 cm of the general surface check),
//   - no decal point on or near a paved road (edge and shoulder plus
//     PAVED_CLEAR), near a bridge, in a creek or lake,
//   - each puddle sits in a real hollow: its water level is above its lowest
//     point, no deeper than allowed, and the ground all round the edge of its
//     decal is at or above the level (the water never spills over the edge).

import { distToPolyline, pointInPolygon } from '../src/drive/geom.js';
import { PUDDLE } from '../src3/world3d/puddles3d.js';

const TIGHT = 0.02;
// Road decals are the dirt road mesh's own triangles lifted, so they lie
// exactly on the road; the road mesh itself sits within about 2 cm of the
// ground's bumps and ruts between its 1.4 m rows.
const TIGHT_ROAD = 0.03;
const P = (id, kind, type, by, x, y) => ({ id, kind, type, by: +by.toFixed(3), x: Math.round(x), y: Math.round(y) });

export function puddleProblems(world, audit, heightAt, puddles) {
  const out = [];
  const byId = new Map(puddles.list.map((p) => [p.id, p]));
  let worst = 0;
  const worstBy = { puddle: 0, puddle_road: 0 };
  for (const s of audit.surfaces) {
    if (s.kind !== 'puddle' && s.kind !== 'puddle_road') continue;
    const pd = byId.get(s.id);
    const p = s.pos;
    const test = (x, y, z) => {
      const d = y - (heightAt(x, z) + s.lift);
      if (Math.abs(d) > Math.abs(worst)) worst = d;
      if (Math.abs(d) > Math.abs(worstBy[s.kind])) worstBy[s.kind] = d;
      if (Math.abs(d) > (s.kind === 'puddle' ? TIGHT : TIGHT_ROAD)) out.push(P(s.id, s.kind, d > 0 ? 'floating' : 'clipping', Math.abs(d), x, z));
    };
    let edgeLow = Infinity;
    let ex = 0;
    let ey = 0;
    const xs = [];
    const zs = [];
    for (let i = 0; i < p.length; i += 9) {
      const a = [p[i], p[i + 1], p[i + 2]];
      const b = [p[i + 3], p[i + 4], p[i + 5]];
      const c = [p[i + 6], p[i + 7], p[i + 8]];
      for (const q of [a, b, c]) {
        test(q[0], q[1], q[2]);
        xs.push(q[0]);
        zs.push(q[2]);
      }
      for (const [u, v] of [[a, b], [b, c], [c, a]]) test((u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2);
      test((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3);
    }
    // Where it is.
    for (let k = 0; k < xs.length; k += 7) {
      const x = xs[k];
      const y = zs[k];
      for (const r of world.roads) {
        if (r.type !== 'paved') continue;
        const d = distToPolyline(x, y, r.points) - r.width / 2 - 0.9;
        if (d < PUDDLE.PAVED_CLEAR) out.push(P(s.id, s.kind, `near paved road ${r.id}`, PUDDLE.PAVED_CLEAR - d, x, y));
      }
      for (const b of world.bridges) {
        const d = Math.hypot(b.x - x, b.y - y) - b.length / 2;
        if (d < PUDDLE.BRIDGE_CLEAR) out.push(P(s.id, s.kind, `near bridge ${b.id}`, PUDDLE.BRIDGE_CLEAR - d, x, y));
      }
      for (const c of world.creeks) {
        const d = distToPolyline(x, y, c.points) - c.width / 2;
        if (d < PUDDLE.WATER_CLEAR) out.push(P(s.id, s.kind, `in creek ${c.id}`, PUDDLE.WATER_CLEAR - d, x, y));
      }
      for (const l of world.lakes) if (pointInPolygon(x, y, l.polygon)) out.push(P(s.id, s.kind, `in lake ${l.id}`, 0, x, y));
    }
    if (!pd) {
      out.push(P(s.id, s.kind, 'no puddle record', 0, xs[0], zs[0]));
      continue;
    }
    // A real hollow.
    if (!(pd.level > pd.hmin)) out.push(P(pd.id, s.kind, 'level not above its lowest point', pd.hmin - pd.level, pd.x, pd.y));
    const maxD = s.kind === 'puddle' ? PUDDLE.MUD_MAX_DEPTH : PUDDLE.ROAD_MAX_DEPTH;
    if (pd.level - pd.hmin > maxD + 1e-6) out.push(P(pd.id, s.kind, 'too deep', pd.level - pd.hmin - maxD, pd.x, pd.y));
    // Off-road: the ground along the decal's edge stays above the level, so
    // the water shows only inside it.
    if (s.kind === 'puddle') {
      const { i0, i1, j0, j1 } = pd.box;
      const C = 4;
      for (let x = i0 * C; x <= i1 * C; x += 0.5) {
        for (const y of [j0 * C, j1 * C]) {
          const g = heightAt(x, y);
          if (g < edgeLow) { edgeLow = g; ex = x; ey = y; }
        }
      }
      for (let y = j0 * C; y <= j1 * C; y += 0.5) {
        for (const x of [i0 * C, i1 * C]) {
          const g = heightAt(x, y);
          if (g < edgeLow) { edgeLow = g; ex = x; ey = y; }
        }
      }
      if (edgeLow < pd.level) out.push(P(pd.id, s.kind, 'water reaches the decal edge', pd.level - edgeLow, ex, ey));
    }
  }
  const sizes = puddles.list.map((p) => p.rs[3]).sort((a, b) => a - b);
  return {
    problems: out,
    worst,
    worstBy,
    counts: { puddles: puddles.list.length, puddlesOffRoad: puddles.counts.offRoad, puddlesOnRoad: puddles.counts.onRoad },
    sizes: { median: sizes[Math.floor(sizes.length / 2)], max: sizes[sizes.length - 1], tris: puddles.counts.tris },
  };
}
