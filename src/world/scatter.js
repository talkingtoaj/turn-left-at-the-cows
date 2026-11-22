// Rocks, shrubs and grass tussocks over the open land, by district
// (./districts.js). Plain data and math, no engine code, seeded: the same
// seed always gives the same scatter. The 3D world draws it
// (src3/world3d/scatter3d.js) and the car meets it (src3/damageHazards.js):
//
//   rocks:  r >= SOLID_R are solid (collider circles, you crash into them);
//           smaller ones are a knock you roll over (surface event 'stone',
//           like the scrub boulders in ./roughness.js).
//   shrubs: drive-through: a small slowdown, a little bounce and a swish
//           (surface event 'shrub').
//   grass:  tussocks, looks only.
//   weeds:  tall weeds along road verges and field fences, looks only.
//
// Where things go, per 12 m cell of open land (no road, field, forest, yard,
// town or water, see roughness.at().open and .fd):
//   - the district recipe sets how many of each (RECIPES in ./districts.js),
//   - rocks lie in loose scatters (a seeded clump field) and gather on rises
//     (the big bumps and the rolling layer) and the authored hills, as much
//     as the recipe's `rise` says,
//   - shrubs gather in drifts: a seeded drift field, pulled toward hollows
//     and gullies and toward fence lines and wood edges,
//   - tussocks thicken in hollows.
// Weeds (SPEC 9q roadside) grow in drifts along both verges of every road,
// just past the shoulder, and along the outside of field fences, never in a
// field, forest, town, yard or on a road.
// Solid rocks keep a car's width (CLEAR) from every other solid thing, stay
// well off roads, tracks and yards (fd >= SOLID_FD) and keep away from the
// fixed fallen trees, so they never close a way through (npm run check:fallen).
//
// Named outcrops (world.outcrops): 5 to 15 big rocks seeded around each spot.
//
//   const S = scatterFor(world, scenery)
//   S.rocks   [{ id, model, x, y, r, hs, rot, tint, solid, outcrop? }]
//   S.shrubs  [{ id, model, x, y, r, hs, rot, tint }]
//   S.grass   [{ x, y, r, hs, rot, tint }]
//   S.weeds   [{ x, y, r, hs, rot, tint, model: 'foxtail'|'dock', at: 'verge'|'fence' }]
//   S.outcrops [{ id, name, x, y, r, rocks: n }]
//   S.solids  [{ x, y, r, kind: 'rock' }]           collider circles
//   S.surface [{ id, x, y, r, kind: 'stone'|'shrub' }] surface events
//
// Dev: three.html?scatter=off builds the world without any of it.

import {
  makeRng, hashString, SegIndex, nearestOnPolyline, measurePolyline, pointAlong, pointInPolygon, distToPolygonEdge, bbox, circleHitsRect,
} from '../drive/geom.js';
import { TREE_HIT_R, POLE_R, fenceRuns, makePads } from '../drive/layout.js';
import { makeNoise, smoothstep } from './noise.js';
import { roughnessFor } from './roughness.js';
import { districtsFor, KIND_LIST, RECIPES } from './districts.js';

export const SOLID_R = 0.5; // rocks this big (radius m) or more are solid
export const CLEAR = 3.0; // m between a solid rock and any other solid (a car fits)
export const SOLID_FD = 14; // m beyond any road edge, track, yard or flat feature
const CELL = 12;
const FD = { grass: 2.5, shrub: 3.5, stone: 6 };

let enabled = true;
export function setScatterEnabled(on) {
  enabled = !!on;
}
export const scatterEnabled = () => enabled;

const cache = new WeakMap();

export function scatterFor(world, scenery) {
  let s = cache.get(world);
  if (!s) cache.set(world, (s = enabled ? makeScatter(world, scenery) : empty()));
  return s;
}

function empty() {
  return { rocks: [], shrubs: [], grass: [], weeds: [], outcrops: [], solids: [], surface: [], ms: 0 };
}

function makeScatter(world, scenery) {
  const t0 = Date.now();
  const seed = world.seed || 1;
  const R = roughnessFor(world);
  const D = districtsFor(world);
  const rng = makeRng(((seed ^ 0x5ca77e) >>> 0));
  const nDrift = makeNoise(seed + 951);
  const nDrift2 = makeNoise(seed + 952);
  const nTint = makeNoise(seed + 953);
  const nClump = makeNoise(seed + 954);
  const W = world.size.w;
  const H = world.size.h;

  // Field and forest edges (shrubs gather along them; solid rocks keep off fences).
  const edges = new SegIndex(32);
  const fieldEdges = new SegIndex(32);
  const addPoly = (idx, poly, pad) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      idx.add(a[0], a[1], b[0], b[1], pad, 0);
    }
  };
  for (const f of world.fields || []) {
    addPoly(edges, f.polygon, 20);
    addPoly(fieldEdges, f.polygon, 20);
  }
  for (const f of world.forests || []) addPoly(edges, f.polygon, 20);
  const hillAt = (x, y) => {
    let h = 0;
    for (const hl of world.hills || []) h += hl.h * Math.exp(-((x - hl.x) ** 2 + (y - hl.y) ** 2) / (2 * (hl.r * 0.6) ** 2));
    return h;
  };

  // Solid things already there, on a 16 m grid: trees, props, poles, locals.
  const G = 16;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const addSolid = (x, y, r, tag) => {
    const k = key(Math.floor(x / G), Math.floor(y / G));
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push({ x, y, r, tag });
  };
  // Nearest edge gap from a circle (x, y, r) to any recorded solid (m).
  const gapTo = (x, y, r, reach) => {
    let best = Infinity;
    const i0 = Math.floor((x - reach) / G);
    const i1 = Math.floor((x + reach) / G);
    const j0 = Math.floor((y - reach) / G);
    const j1 = Math.floor((y + reach) / G);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const l = grid.get(key(i, j));
        if (!l) continue;
        for (const s of l) {
          const d = Math.hypot(s.x - x, s.y - y) - s.r - r;
          if (d < best) best = d;
        }
      }
    }
    return best;
  };
  for (const t of (scenery && scenery.trees) || []) addSolid(t.x, t.y, TREE_HIT_R, 'tree');
  for (const p of world.props || []) addSolid(p.x, p.y, p.r, 'prop');
  for (const p of world.dressing || []) addSolid(p.x, p.y, (p.r || 2) + 1, 'prop');
  for (const l of world.powerLines || []) for (const p of l.poles) addSolid(p.x, p.y, POLE_R, 'pole');
  for (const l of world.locals || []) addSolid(l.x, l.y, 6, 'local');
  for (const b of R.boulders) addSolid(b.x, b.y, b.r, 'stone');
  const fallen = ((scenery && scenery.fallen) || []).map((f) => ({ x: f.x, y: f.y, r: (f.h || 20) + 14 }));
  const nearFallen = (x, y) => fallen.some((f) => Math.hypot(f.x - x, f.y - y) < f.r);

  const out = empty();
  const outcropAt = [];

  // ---- Named outcrops first: they claim their hilltops.
  for (const o of world.outcrops || []) {
    const orng = makeRng(hashString(`${o.id}:${seed}`));
    const n = 5 + Math.floor(orng() * 11);
    // Round 8: outcrops are landmarks you steer by from the road, so they are
    // big, and the few-rock ones bigger still (small 1 at 5 rocks, 0 at 15):
    // a massive main boulder and tall standing stones.
    const small = (15 - n) / 10;
    // The standing stones lean to the side facing the nearest road, so the
    // crest does not hide them from it.
    let toRoad = null;
    let best = Infinity;
    for (const rd of world.roads) {
      const p = nearestOnPolyline(o.x, o.y, rd.points);
      if (p.d < best) {
        best = p.d;
        toRoad = Math.atan2(p.y - o.y, p.x - o.x);
      }
    }
    const spread = (5 + n * 0.85) * (1 + 0.5 * small);
    const placed = [];
    let tries = 0;
    let slabs = 0;
    while (placed.length < n && tries++ < 600) {
      const big = placed.length === 0;
      // A few tall standing stones (at least two in a small outcrop); the
      // rest big rounded boulders.
      const roll = orng();
      const slab = !big && (roll < 0.35 || (small > 0.5 && slabs < 2));
      let a = orng() * Math.PI * 2;
      if (slab && toRoad !== null && tries < 300) a = toRoad + (a / Math.PI - 1) * 1.3; // within about 75 degrees of the road side
      const d = big ? orng() * 2 : spread * Math.sqrt(orng()) * (0.35 + 0.65 * orng());
      const x = o.x + Math.cos(a) * d;
      const y = o.y + Math.sin(a) * d;
      let r;
      let hs;
      if (slab) {
        r = (0.9 + orng() * 0.7) * (1 + 0.6 * small);
        hs = (3.2 + orng() * 2.4 + 5 * small) / r; // 3.2..5.6 m tall, 8.2..10.6 m in a small outcrop
      } else {
        r = ((big ? 2.4 : 1.2) + orng() * (big ? 1.2 : 1.4)) * (1.15 + 0.55 * small);
        hs = 0.75 + orng() * 0.5 + 0.25 * small;
      }
      // Rocks in a cluster either touch or leave a car's width between them.
      let ok = true;
      for (const p of placed) {
        const gap = Math.hypot(p.x - x, p.y - y) - p.r - r;
        if (gap > -0.15 * Math.min(p.r, r) && gap < CLEAR) ok = false;
        if (gap < -0.7 * Math.min(p.r, r)) ok = false; // not inside each other
        // The same between their collision circles (0.85 r): big rocks that
        // touch must still be one lump there, not a slit a car nearly fits.
        const gc = Math.hypot(p.x - x, p.y - y) - 0.85 * (p.r + r);
        if (gc > 0.5 && gc < CLEAR) ok = false;
      }
      const g = R.at(x, y);
      if (!ok || g.open < 0.999 || g.fd < SOLID_FD + r || gapTo(x, y, r, r + CLEAR + 8) < CLEAR) continue;
      placed.push({ x, y, r, slab, hs });
      if (slab) slabs++;
    }
    let maxR = 0;
    placed.forEach((p, i) => {
      out.rocks.push({
        id: `${o.id}_${i}`, model: p.slab ? 'slab' : 'boulder', x: r2(p.x), y: r2(p.y), r: r2(p.r), hs: r2(p.hs),
        rot: r2(orng() * Math.PI * 2), tint: r2(0.25 + orng() * 0.5), solid: true, outcrop: o.id,
      });
      maxR = Math.max(maxR, Math.hypot(p.x - o.x, p.y - o.y) + p.r);
    });
    for (const p of placed) addSolid(p.x, p.y, p.r, 'outcrop');
    out.outcrops.push({ id: o.id, name: o.name, x: o.x, y: o.y, r: r2(maxR), rocks: placed.length });
    outcropAt.push({ x: o.x, y: o.y, r: maxR + 8 });
  }
  const inOutcrop = (x, y) => outcropAt.some((o) => Math.hypot(o.x - x, o.y - y) < o.r);

  // ---- The open land, cell by cell.
  const recipe = { rocks: 0, rockR0: 0, rockR1: 0, big: 0, rise: 0, shrubs: 0, drift: 0, sr0: 0, sr1: 0, grass: 0, gr0: 0, gr1: 0 };
  const shrubOf = new Float32Array(3); // gorse, round, bramble shares
  const SHRUBS = ['gorse', 'round', 'bramble'];
  let nRock = 0;
  let nShrub = 0;
  for (let cy = CELL / 2; cy < H; cy += CELL) {
    for (let cx = CELL / 2; cx < W; cx += CELL) {
      // The cell's own random stream, so one cell's changes never shift the rest.
      const crng = makeRng((Math.imul(Math.floor(cx), 73856093) ^ Math.imul(Math.floor(cy), 19349663) ^ seed) >>> 0);
      if (cx < 30 || cy < 30 || cx > W - 30 || cy > H - 30) continue;
      const g = R.at(cx, cy, true);
      if (g.open < 0.98 || g.fd < 2) continue;
      const fd0 = g.fd;
      const hl = g.h;
      // Blended recipe.
      const w = D.weights(cx, cy);
      for (const k in recipe) recipe[k] = 0;
      shrubOf.fill(0);
      for (let t = 0; t < KIND_LIST.length; t++) {
        const wt = w[t];
        if (wt <= 0) continue;
        const rc = RECIPES[KIND_LIST[t]];
        recipe.rocks += wt * rc.rocks.n;
        recipe.rockR0 += wt * rc.rocks.r[0];
        recipe.rockR1 += wt * rc.rocks.r[1];
        recipe.big += wt * rc.rocks.big;
        recipe.rise += wt * rc.rocks.rise;
        recipe.shrubs += wt * rc.shrubs.n;
        recipe.drift += wt * rc.shrubs.drift;
        recipe.sr0 += wt * rc.shrubs.r[0];
        recipe.sr1 += wt * rc.shrubs.r[1];
        recipe.grass += wt * rc.grass.n;
        recipe.gr0 += wt * rc.grass.r[0];
        recipe.gr1 += wt * rc.grass.r[1];
        shrubOf[SHRUBS.indexOf(rc.shrubs.shrub)] += wt * rc.shrubs.n;
      }
      // Local ground: rises, hollows, edges.
      const rise = smoothstep(-0.2, 0.7, hl) + 0.05 * Math.min(20, hillAt(cx, cy));
      const hollow = smoothstep(0.15, -0.6, hl);
      const edgeD = edges.minDist(cx, cy);
      const edgeK = 1 - smoothstep(3, 18, edgeD);
      const dn = 0.62 * nDrift(cx / 40, cy / 40) + 0.38 * nDrift2(cx / 13, cy / 13);
      const driftK = smoothstep(0.3, 0.6, dn + 0.4 * edgeK + 0.3 * hollow);
      const tintN = 0.5 + 0.5 * nTint(cx / 60, cy / 60);
      const area = (CELL * CELL) / 100;

      // Rocks.
      // Rocks lie in scatters (a few together, then open grass), more on rises.
      const clump = smoothstep(-0.1, 0.45, nClump(cx / 28, cy / 28));
      const rockD = recipe.rocks * ((1 - recipe.rise) + recipe.rise * (0.25 + 1.5 * Math.min(1.5, rise))) * (0.2 + 2 * clump);
      let n = Math.floor(rockD * area + crng());
      for (let k = 0; k < n; k++) {
        const x = cx + (crng() - 0.5) * CELL;
        const y = cy + (crng() - 0.5) * CELL;
        // Sizes skewed small; `big` of them drawn from the upper half.
        const u = crng() < recipe.big ? 0.5 + 0.5 * crng() : 0.55 * crng() * crng();
        const r = recipe.rockR0 + (recipe.rockR1 - recipe.rockR0) * u;
        const solid = r >= SOLID_R;
        const gi = R.at(x, y);
        if (gi.open < 0.999 || gi.fd < (solid ? SOLID_FD : FD.stone) || inOutcrop(x, y)) continue;
        const gap = gapTo(x, y, r, r + CLEAR + 4);
        if (gap < (solid ? CLEAR : 0.8)) continue;
        if (solid && (nearFallen(x, y) || fieldEdges.minDist(x, y) < r + CLEAR + 0.5)) continue;
        const rock = {
          id: `sc_r${nRock++}`, model: crng() < 0.18 ? 'slab' : 'boulder', x: r2(x), y: r2(y), r: r2(r),
          hs: r2(crng() < 0.18 ? 1.2 + crng() * 0.8 : 0.55 + crng() * 0.5), rot: r2(crng() * Math.PI * 2),
          tint: r2(tintN * 0.6 + crng() * 0.4), solid,
        };
        if (rock.model === 'slab' && !solid) rock.hs = r2(0.8 + crng() * 0.5);
        out.rocks.push(rock);
        addSolid(x, y, r, solid ? 'rock' : 'stone');
      }

      // Shrubs, in drifts.
      const shrubD = recipe.shrubs * ((1 - recipe.drift) + recipe.drift * driftK * 7) * smoothstep(FD.shrub, FD.shrub + 6, fd0);
      n = Math.floor(shrubD * area + crng());
      const shrubSum = shrubOf[0] + shrubOf[1] + shrubOf[2] || 1;
      for (let k = 0; k < n; k++) {
        const x = cx + (crng() - 0.5) * CELL;
        const y = cy + (crng() - 0.5) * CELL;
        const r = recipe.sr0 + (recipe.sr1 - recipe.sr0) * crng() * (0.5 + 0.5 * driftK);
        const gi = R.at(x, y);
        if (gi.open < 0.999 || gi.fd < FD.shrub + r) continue;
        if (gapTo(x, y, r * 0.6, r + 4) < 0.2) continue;
        let pick = crng() * shrubSum;
        let model = 'gorse';
        for (let s = 0; s < 3; s++) {
          if ((pick -= shrubOf[s]) <= 0) {
            model = SHRUBS[s];
            break;
          }
        }
        out.shrubs.push({
          id: `sc_s${nShrub++}`, model, x: r2(x), y: r2(y), r: r2(r), hs: r2(0.8 + crng() * 0.45),
          rot: r2(crng() * Math.PI * 2), tint: r2(tintN * 0.5 + crng() * 0.5),
        });
      }

      // Grass tussocks, thicker in hollows.
      const grassD = recipe.grass * (0.55 + 0.9 * hollow) * smoothstep(FD.grass, FD.grass + 5, fd0);
      n = Math.floor(grassD * area + crng());
      for (let k = 0; k < n; k++) {
        const x = cx + (crng() - 0.5) * CELL;
        const y = cy + (crng() - 0.5) * CELL;
        const r = recipe.gr0 + (recipe.gr1 - recipe.gr0) * crng();
        const gi = R.at(x, y);
        if (gi.open < 0.999 || gi.fd < FD.grass + r) continue;
        out.grass.push({ x: r2(x), y: r2(y), r: r2(r), hs: r2(0.8 + crng() * 0.6), rot: r2(crng() * Math.PI * 2), tint: r2(crng()) });
      }
    }
  }

  placeWeeds(world, R, out, gapTo, seed);

  for (const r of out.rocks) {
    if (r.solid) out.solids.push({ x: r.x, y: r.y, r: r2(r.r * 0.85), kind: 'rock', id: r.id });
    else out.surface.push({ id: r.id, kind: 'stone', x: r.x, y: r.y, r: r2(Math.max(0.35, r.r)) });
  }
  for (const s of out.shrubs) out.surface.push({ id: s.id, kind: 'shrub', x: s.x, y: s.y, r: r2(s.r * 0.85) });
  out.ms = Date.now() - t0;
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;

// Weeds along road verges and the outside of field fences. A drift noise
// along each line gives clumps of weeds and long bare stretches.
export const WEED = {
  step: 1.3, // m between tries along a line
  vergePaved: 1.35, // m beyond the tar edge (past the 0.9 m shoulder) to the nearest weed edge
  vergeDirt: 1.0, // m beyond a dirt road edge (past its 0.8 m shoulder)
  vergeDepth: 2.2, // m: how far out from there the verge weeds spread
  fenceOut: 0.15, // m outside the fence line, beyond the weed's own radius
  roadGap: 0.9, // m: no weed within this of any road edge (plus its radius)
};
function placeWeeds(world, R, out, gapTo, seed) {
  const rng = makeRng(((seed ^ 0x3eed5) >>> 0));
  const nDrift = makeNoise(seed + 961);
  const nKind = makeNoise(seed + 962);
  const W = world.size.w;
  const H = world.size.h;
  const areas = [...(world.fields || []), ...(world.forests || [])].map((f) => ({ poly: f.polygon, bb: bbox(f.polygon) }));
  const inArea = (x, y, r) => areas.some((a) => x > a.bb.minX - r - 1 && x < a.bb.maxX + r + 1 && y > a.bb.minY - r - 1 && y < a.bb.maxY + r + 1
    && (pointInPolygon(x, y, a.poly) || distToPolygonEdge(x, y, a.poly) < r + 0.05));
  const towns = (world.towns || []).map((t) => ({ x: t.x, y: t.y, r: (t.ambienceR || 150) * 0.75 }));
  const inTown = (x, y) => towns.some((t) => Math.hypot(t.x - x, t.y - y) < t.r);
  // Yards and pads exactly (fd rounds a big pad's corners off).
  const pads = makePads(world).filter((p) => p.kind !== 'field');
  const onPad = (x, y, r) => pads.some((p) => Math.abs(p.x - x) < p.w + p.h + r && Math.abs(p.y - y) < p.w + p.h + r && circleHitsRect(x, y, r + 0.6, p));
  const ok = (x, y, r) => {
    if (x < 30 || y < 30 || x > W - 30 || y > H - 30) return false;
    if (inTown(x, y) || onPad(x, y, r)) return false;
    // Roads, yards, creeks, bridges, buildings (fd is the nearer of the road edge and those).
    if (!(Math.min(R.roadDist(x, y), R.flatDist(x, y)) >= WEED.roadGap + r)) return false;
    if (inArea(x, y, r)) return false;
    return gapTo(x, y, r, r + 3) > 0.15;
  };
  const add = (x, y, at, drift) => {
    const big = at === 'fence' ? 1.1 : 1;
    const r = (0.22 + rng() * 0.2) * big;
    if (!ok(x, y, r)) return;
    const kindN = nKind(x / 35, y / 35);
    out.weeds.push({
      x: r2(x), y: r2(y), r: r2(r), hs: r2((0.75 + rng() * 0.55) * (0.8 + 0.3 * drift) * big),
      rot: r2(rng() * Math.PI * 2), tint: r2(rng()), model: rng() < 0.3 + 0.3 * kindN ? 'dock' : 'foxtail', at,
    });
  };
  const drift = (x, y) => smoothstep(-0.05, 0.45, 0.7 * nDrift(x / 22, y / 22) + 0.3 * nDrift(x / 6 + 13, y / 6));

  // Verges.
  for (const rd of world.roads) {
    const pts = rd.points;
    const cum = measurePolyline(pts);
    const total = cum[cum.length - 1];
    const edge = rd.width / 2 + (rd.type === 'paved' ? WEED.vergePaved : WEED.vergeDirt);
    for (let d = 2; d < total - 2; d += WEED.step) {
      const p = pointAlong(pts, cum, d);
      const a = pointAlong(pts, cum, Math.max(0, d - 1));
      const b = pointAlong(pts, cum, Math.min(total, d + 1));
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const side of [-1, 1]) {
        const k = drift(p.x + side * 5, p.y - side * 5);
        if (rng() > k * 0.9) continue;
        const n = 1 + (rng() < k ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const o = edge + 0.35 + rng() * WEED.vergeDepth * (0.5 + 0.5 * k);
          const t = (rng() - 0.5) * WEED.step;
          add(p.x + side * nx * o + (b.x - a.x) / len * t, p.y + side * ny * o + (b.y - a.y) / len * t, 'verge', k);
        }
      }
    }
  }

  // Fence lines: the outside of each run, at the posts.
  for (const f of fenceRuns(world)) {
    const poly = f.field.polygon;
    for (const run of f.runs) {
      for (let i = 0; i < run.length - 1; i++) {
        const p = run[i];
        const q = run[i + 1];
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        let nx = -(q.y - p.y) / len;
        let ny = (q.x - p.x) / len;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        if (pointInPolygon(mx + nx * 0.5, my + ny * 0.5, poly)) {
          nx = -nx;
          ny = -ny;
        }
        const k = drift(mx, my);
        if (rng() > 0.15 + k * 0.85) continue;
        const o = 0.5 + WEED.fenceOut + rng() * 0.6; // 0.5: the biggest fence weed's radius
        const t = rng();
        add(p.x + (q.x - p.x) * t + nx * o, p.y + (q.y - p.y) * t + ny * o, 'fence', k);
      }
    }
  }
}
