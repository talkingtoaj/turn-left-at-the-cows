// Checks the roadside carpet (src/world/carpet.js): grass clumps and pebbles
// round the camera.
//
//   npm run check:carpet
//
// Placement, per region, on the tiles along every road (every 80 m), round
// every yard and pad, and at every field and forest corner:
//   - no grass clump on a road or its shoulder, a yard or pad, a bridge, in a
//     crop field, forest, lake or creek, or in a town's middle;
//   - every pebble on a dirt road (or its shoulder), out of the ruts and away
//     from the road's ends;
//   - a tile is the same every time it is made.
// Wildflowers and clover (#41) on the same tiles: the same no-go places as
// the grass, a known kind for every flower, the same flowers every time, and
// over a sample of tiles in each region, more of both on damp ground than
// dry (C.dampAt).
// The tile window, over a run of camera positions: it reports a change only
// when the camera crosses into a new tile, lists every tile within reach
// nearest first and nothing far, and the far tiles keep fewer clumps. The
// same for the flowers' wider window.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { roughnessFor } from '../src/world/roughness.js';
import { makePads } from '../src/drive/layout.js';
import {
  distToPolyline, pointInPolygon, distToPolygonEdge, circleHitsRect, bbox,
} from '../src/drive/geom.js';
import {
  makeCarpet, TileWindow, keepShare, flowerKeepShare, CARPET, FLOWER, FLOWER_KINDS, TILE, GRASS_STRIDE, PEBBLE_STRIDE, CLOVER_STRIDE, FLOWER_STRIDE,
} from '../src/world/carpet.js';

let failed = 0;
const kinds = new Map();
const fail = (msg) => {
  failed++;
  const kind = msg.replace(/-?[\d.]+,-?[\d.]+/g, '').replace(/[\d.]+ m/g, 'n m');
  kinds.set(kind, (kinds.get(kind) || 0) + 1);
  if (failed <= 20) console.log(`  FAIL ${msg}`);
};
const f1 = (v) => v.toFixed(1);

for (const id of REGION_IDS) {
  const W = setRegion(id);
  const R = roughnessFor(W);
  const flatH = () => 0;
  const C = makeCarpet(W, R, flatH, []);
  const pads = makePads(W).filter((p) => p.kind !== 'field');
  const crops = (W.fields || []).filter((f) => f.kind === 'crop').map((f) => ({ id: f.id, poly: f.polygon, bb: bbox(f.polygon) }));
  const forests = (W.forests || []).map((f) => ({ id: f.id, poly: f.polygon, bb: bbox(f.polygon) }));
  const lakes = (W.lakes || []).map((f) => ({ id: f.id, poly: f.polygon, bb: bbox(f.polygon) }));
  const inPoly = (list, x, y, pad) => list.find((a) => x > a.bb.minX - pad && x < a.bb.maxX + pad && y > a.bb.minY - pad && y < a.bb.maxY + pad
    && (pointInPolygon(x, y, a.poly) || distToPolygonEdge(x, y, a.poly) < pad));

  // Tiles to look at.
  const keys = new Set();
  const addAt = (x, y, r = 0) => {
    for (let i = Math.floor((x - r) / TILE); i <= Math.floor((x + r) / TILE); i++) {
      for (let j = Math.floor((y - r) / TILE); j <= Math.floor((y + r) / TILE); j++) keys.add(`${i},${j}`);
    }
  };
  for (const rd of W.roads) {
    let acc = 0;
    for (let k = 0; k < rd.points.length; k++) {
      if (k > 0) acc += Math.hypot(rd.points[k][0] - rd.points[k - 1][0], rd.points[k][1] - rd.points[k - 1][1]);
      if (k === 0 || k === rd.points.length - 1 || acc >= 80) {
        addAt(rd.points[k][0], rd.points[k][1], 6);
        acc = 0;
      }
    }
  }
  for (const p of pads) addAt(p.x, p.y, Math.max(p.w, p.h) / 2 + 2);
  for (const f of [...(W.fields || []), ...(W.forests || [])]) for (const [x, y] of f.polygon) addAt(x, y, 4);
  for (const b of W.bridges) addAt(b.x, b.y, b.length / 2 + 2);

  let nGrass = 0;
  let nPeb = 0;
  let nTiles = 0;
  let nClover = 0;
  let nFlower = 0;
  const t0 = Date.now();
  // A plant at (x, y) whose leaves reach `reach` m: none of the no-go places.
  const plantOK = (where, x, y, reach) => {
    for (const rd of W.roads) {
      const d = distToPolyline(x, y, rd.points) - rd.width / 2;
      const shoulder = rd.type === 'paved' ? 0.9 : 0.8;
      if (d < shoulder + reach * 0.5) fail(`${where}: ${f1(d)} m from ${rd.id}'s edge`);
    }
    for (const p of pads) if (circleHitsRect(x, y, reach, p)) fail(`${where}: on a ${p.kind} pad`);
    for (const b of W.bridges) if (Math.hypot(b.x - x, b.y - y) < b.length / 2) fail(`${where}: at bridge ${b.id}`);
    for (const c of W.creeks) if (distToPolyline(x, y, c.points) < c.width / 2 + 1) fail(`${where}: in creek ${c.id}`);
    const crop = inPoly(crops, x, y, 0.3);
    if (crop) fail(`${where}: in crop field ${crop.id}`);
    const fo = inPoly(forests, x, y, 0);
    if (fo) fail(`${where}: in forest ${fo.id}`);
    const lk = inPoly(lakes, x, y, 1);
    if (lk) fail(`${where}: in lake ${lk.id}`);
    for (const tw of W.towns) if (Math.hypot(tw.x - x, tw.y - y) < (tw.ambienceR || 150) * 0.6) fail(`${where}: in town ${tw.id}`);
  };
  for (const key of keys) {
    const [i, j] = key.split(',').map(Number);
    const t = C.tile(i, j);
    nTiles++;
    for (let k = 0; k < t.clover.length; k += CLOVER_STRIDE) {
      nClover++;
      // A clump at scale 1.25 (x 2.1 when drawn) spreads about 0.2 m.
      plantOK(`${id} clover at ${f1(t.clover[k])},${f1(t.clover[k + 2])}`, t.clover[k], t.clover[k + 2], 0.25);
    }
    const fl = C.flowerTile(i, j);
    for (let k = 0; k < fl.length; k += FLOWER_STRIDE) {
      nFlower++;
      const where = `${id} flower at ${f1(fl[k])},${f1(fl[k + 2])}`;
      if (!FLOWER_KINDS[fl[k + 5]]) fail(`${where}: unknown kind ${fl[k + 5]}`);
      plantOK(where, fl[k], fl[k + 2], 0.3);
    }
    for (let k = 0; k < t.grass.length; k += GRASS_STRIDE) {
      const x = t.grass[k];
      const y = t.grass[k + 2];
      const s = t.grass[k + 4];
      nGrass++;
      const where = `${id} grass at ${f1(x)},${f1(y)}`;
      // Blades lean up to about 0.25 m from the clump centre (scale up to 1.5).
      const reach = 0.3 * Math.max(1, s);
      for (const rd of W.roads) {
        const d = distToPolyline(x, y, rd.points) - rd.width / 2;
        const shoulder = rd.type === 'paved' ? 0.9 : 0.8;
        if (d < shoulder + reach * 0.5) fail(`${where}: ${f1(d)} m from ${rd.id}'s edge`);
      }
      for (const p of pads) if (circleHitsRect(x, y, reach, p)) fail(`${where}: on a ${p.kind} pad`);
      for (const b of W.bridges) if (Math.hypot(b.x - x, b.y - y) < b.length / 2) fail(`${where}: at bridge ${b.id}`);
      for (const c of W.creeks) if (distToPolyline(x, y, c.points) < c.width / 2 + 1) fail(`${where}: in creek ${c.id}`);
      const crop = inPoly(crops, x, y, 0.3);
      if (crop) fail(`${where}: in crop field ${crop.id}`);
      const fo = inPoly(forests, x, y, 0);
      if (fo) fail(`${where}: in forest ${fo.id}`);
      const lk = inPoly(lakes, x, y, 1);
      if (lk) fail(`${where}: in lake ${lk.id}`);
      for (const tw of W.towns) if (Math.hypot(tw.x - x, tw.y - y) < (tw.ambienceR || 150) * 0.6) fail(`${where}: in town ${tw.id}`);
    }
    for (let k = 0; k < t.pebbles.length; k += PEBBLE_STRIDE) {
      const x = t.pebbles[k];
      const y = t.pebbles[k + 2];
      nPeb++;
      const where = `${id} pebble at ${f1(x)},${f1(y)}`;
      let best = null;
      let bd = Infinity;
      for (const rd of W.roads) {
        const d = distToPolyline(x, y, rd.points) - rd.width / 2;
        if (d < bd) {
          bd = d;
          best = rd;
        }
      }
      if (!best || best.type === 'paved' || bd > 0.8) fail(`${where}: not on a dirt road (nearest ${best && best.id}, ${f1(bd)} m)`);
      else {
        const rel = (bd + best.width / 2) / (best.width / 2);
        if (Math.abs(rel - 0.44) < 0.2) fail(`${where}: in a rut of ${best.id}`);
      }
      for (const rd of W.roads) {
        for (const [ex, ey] of [rd.points[0], rd.points[rd.points.length - 1]]) {
          if (Math.hypot(ex - x, ey - y) < CARPET.pebbleEndGap - 0.5) fail(`${where}: near the end of ${rd.id}`);
        }
      }
    }
  }
  // Same tile twice: the same content.
  const [ri, rj] = [...keys][Math.floor(keys.size / 2)].split(',').map(Number);
  const a = C.tile(ri, rj);
  const b = makeCarpet(W, R, flatH, []).tile(ri, rj);
  const C2 = makeCarpet(W, R, flatH, []);
  if (a.grass.length !== b.grass.length || a.grass.some((v, k) => v !== b.grass[k])) fail(`${id}: tile ${ri},${rj} differs when made again`);
  // Flowers and clover the same every time too, on a tile that has some.
  let fk = null;
  for (const key of keys) {
    const [i, j] = key.split(',').map(Number);
    if (C.flowerTile(i, j).length && C.tile(i, j).clover.length) {
      fk = [i, j];
      break;
    }
  }
  if (!fk) fail(`${id}: no tile with both flowers and clover`);
  else {
    const f1a = C.flowerTile(...fk);
    const f1b = C2.flowerTile(...fk);
    if (f1a.length !== f1b.length || f1a.some((v, k) => v !== f1b[k])) fail(`${id}: flower tile ${fk} differs when made again`);
    const ca = C.tile(...fk).clover;
    const cb = C2.tile(...fk).clover;
    if (ca.length !== cb.length || ca.some((v, k) => v !== cb[k])) fail(`${id}: clover on tile ${fk} differs when made again`);
  }
  // Thicker in damp bottoms: a seeded sample of grassy tiles across the map.
  const dd = { damp: { t: 0, f: 0, c: 0 }, dry: { t: 0, f: 0, c: 0 } };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let s = 0; s < 3000; s++) {
    const i = Math.floor(rnd() * W.size.w / TILE);
    const j = Math.floor(rnd() * W.size.h / TILE);
    const x = (i + 0.5) * TILE;
    const y = (j + 0.5) * TILE;
    if (C.grassAt(x, y) <= 0) continue;
    const damp = C.dampAt(x, y);
    const g = damp > 0.6 ? dd.damp : damp < 0.2 ? dd.dry : null;
    if (!g) continue;
    g.t++;
    g.f += C.flowerTile(i, j).length / FLOWER_STRIDE;
    g.c += C.tile(i, j).clover.length / CLOVER_STRIDE;
  }
  const per = (g, k) => (g.t ? g[k] / g.t : 0);
  if (dd.damp.t < 50 || dd.dry.t < 50) fail(`${id}: too few sample tiles (damp ${dd.damp.t}, dry ${dd.dry.t})`);
  if (per(dd.damp, 'f') < 1.5 * per(dd.dry, 'f')) fail(`${id}: flowers not thicker in damp ground (${f1(per(dd.damp, 'f'))} vs ${f1(per(dd.dry, 'f'))} a tile)`);
  if (per(dd.damp, 'c') < 1.3 * per(dd.dry, 'c')) fail(`${id}: clover not thicker in damp ground (${f1(per(dd.damp, 'c'))} vs ${f1(per(dd.dry, 'c'))} a tile)`);
  if (per(dd.dry, 'f') <= 0) fail(`${id}: no flowers at all on dry ground`);
  console.log(`${id}: flowers a tile damp ${f1(per(dd.damp, 'f'))}, dry ${f1(per(dd.dry, 'f'))}; clover damp ${f1(per(dd.damp, 'c'))}, dry ${f1(per(dd.dry, 'c'))}`);
  if (nGrass < nTiles * 20) fail(`${id}: only ${nGrass} grass clumps on ${nTiles} tiles (too thin?)`);
  if (nPeb < 100) fail(`${id}: only ${nPeb} pebbles`);
  if (nFlower < 200 || nClover < 200) fail(`${id}: only ${nFlower} flowers and ${nClover} clover clumps checked`);
  console.log(`${id}: ${nTiles} tiles, ${nGrass} grass clumps, ${nPeb} pebbles, ${nClover} clover, ${nFlower} flowers checked in ${Date.now() - t0} ms`);
}

// ---- Tile windows (grass, then the flowers' wider one) over a drive.
for (const [r, label] of [[CARPET.radius, 'grass'], [FLOWER.radius, 'flowers']]) {
  const win = new TileWindow(r);
  const at = (x, y, expectChange, label) => {
    const w = win.update(x, y);
    if (w.changed !== expectChange) fail(`window (${r} m) ${label}: changed ${w.changed}, expected ${expectChange}`);
    const cx = (Math.floor(x / TILE) + 0.5) * TILE;
    const cy = (Math.floor(y / TILE) + 0.5) * TILE;
    const keys = new Set(w.tiles.map((t) => t.key));
    for (let k = 1; k < w.tiles.length; k++) if (w.tiles[k].d < w.tiles[k - 1].d) fail(`window ${label}: tiles not nearest first`);
    // Every tile with a point within the radius of the camera tile's centre is in.
    for (let i = Math.floor((cx - r) / TILE) - 1; i <= Math.floor((cx + r) / TILE) + 1; i++) {
      for (let j = Math.floor((cy - r) / TILE) - 1; j <= Math.floor((cy + r) / TILE) + 1; j++) {
        const nx = Math.max(i * TILE, Math.min((i + 1) * TILE, cx));
        const ny = Math.max(j * TILE, Math.min((j + 1) * TILE, cy));
        const d = Math.hypot(nx - cx, ny - cy);
        if (d <= r && !keys.has(`${i},${j}`)) fail(`window ${label}: tile ${i},${j} at ${f1(d)} m missing`);
        if (d > r + TILE && keys.has(`${i},${j}`)) fail(`window ${label}: tile ${i},${j} at ${f1(d)} m should not be up`);
      }
    }
    return w;
  };
  const w0 = at(1000.5, 500.5, true, 'start');
  at(1003, 503, false, 'same tile');
  const w2 = at(1000.5 + TILE, 500.5, true, 'next tile east');
  if (w2.tiles === w0.tiles) fail('window: tile list not remade after a move');
  at(1000.5 + TILE + 2, 500.5, false, 'same tile again');
  at(3000, 1500, true, 'jump');
}

// ---- Fewer clumps far off.
{
  if (keepShare(0) !== 1) fail(`keepShare(0) = ${keepShare(0)}, expected 1`);
  if (Math.abs(keepShare(CARPET.radius) - CARPET.farKeep) > 1e-6) fail(`keepShare(radius) = ${keepShare(CARPET.radius)}`);
  if (keepShare(CARPET.radius + TILE + 1) !== 0) fail('keepShare beyond reach not 0');
  for (let d = 0; d < CARPET.radius; d += 1) if (keepShare(d + 1) > keepShare(d)) fail(`keepShare rises at ${d} m`);
  if (flowerKeepShare(0) !== 1) fail('flowerKeepShare(0) not 1');
  if (Math.abs(flowerKeepShare(FLOWER.radius) - FLOWER.farKeep) > 1e-6) fail(`flowerKeepShare(radius) = ${flowerKeepShare(FLOWER.radius)}`);
  if (flowerKeepShare(FLOWER.radius + TILE + 1) !== 0) fail('flowerKeepShare beyond reach not 0');
  for (let d = 0; d < FLOWER.radius; d += 1) if (flowerKeepShare(d + 1) > flowerKeepShare(d)) fail(`flowerKeepShare rises at ${d} m`);
}

// ---- A tile made in steps (C.tileSteps, spread over frames by carpet3d.js)
// is the same as one made at once, even with other tiles made between its
// steps. And a window shrunk with the reach (low resolution) still covers it.
{
  const W = setRegion(REGION_IDS[0]);
  const C = makeCarpet(W, roughnessFor(W), (x, y) => Math.sin(x * 0.01) + y * 0.001, [{ x: W.size.w / 2, y: W.size.h / 2, r: 30 }]);
  const road = W.roads[0];
  const list = road.points.filter((_, k) => k % 4 === 0).map(([x, y]) => [Math.floor(x / TILE), Math.floor(y / TILE) + 1]);
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
  let checked = 0;
  for (let n = 0; n + 1 < list.length; n += 2) {
    const [i, j] = list[n];
    const steps = C.tileSteps(i, j);
    let r = steps.next();
    let pauses = 0;
    while (!r.done) {
      pauses++;
      C.tile(...list[n + 1]); // another tile between steps
      C.flowerTile(...list[n + 1]);
      r = steps.next();
    }
    const whole = C.tile(i, j);
    if (pauses < 2) fail(`tileSteps ${i},${j}: only ${pauses} pauses`);
    if (!same(r.value.grass, whole.grass) || !same(r.value.clover, whole.clover) || !same(r.value.pebbles, whole.pebbles)) fail(`tileSteps ${i},${j}: differs from tile()`);
    checked++;
  }
  if (!checked) fail('tileSteps: no tiles checked');
  const w = new TileWindow(CARPET.radius * 0.625);
  const t = w.update(1000.5, 500.5).tiles;
  const full = new TileWindow().update(1000.5, 500.5).tiles;
  if (!(t.length < full.length)) fail('a shrunk window should hold fewer tiles');
  if (t.some((x) => x.d > CARPET.radius * 0.625 + TILE * 0.5)) fail('shrunk window holds tiles out of its reach');
}

if (failed) {
  for (const [k, n] of [...kinds].sort((p, q) => q[1] - p[1]).slice(0, 20)) console.log(`  ${n} x ${k}`);
  console.log(`check:carpet FAILED (${failed} problems)`);
  process.exit(1);
}
console.log('check:carpet OK');
