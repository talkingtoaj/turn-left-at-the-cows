// Puddles after rain (round 8). They lie only in real hollows: low spots of
// the 3D ground off-road (the rolling layer, bumps and hills, from the
// terrain's own height grid) and dips along the dirt roads (ruts first).
// Never on paved roads, bridges, yards, pads, crop rows, in forests or water.
// Deterministic: the same ground always gives the same puddles.
//
// Each puddle is a flat water-look decal that lies exactly on the ground: off
// road it follows the terrain's own triangles (2 m pieces split like the 4 m
// cells, so every piece is coplanar with the ground under it), on a dirt road
// it copies the road mesh's own triangles (ground.js dirtRoadRows). The water
// itself is a level: the shader shows water where the ground under the decal
// is below it, so a puddle fills from its lowest point outward, in the shape
// of its hollow, as the puddles fill (src/game/wetness.js `puddle`).
//
//   const P = buildPuddles(world, terrain, audit)
//   P.object                      one Mesh (one draw call; hidden when dry)
//   P.list                        [{ id, x, y, onRoad, hmin, level, rs: radius at 1/4..4/4 of the level }]
//   P.update(puddle, rain, time, fogColor)
//   P.pushSurface(x, y, reach, out)   puddles near (x, y) with water in them now, as
//                                 surface events { id, kind: 'puddle', x, y, r }
//
// The world checker (tools/check-world.mjs) audits every decal against the
// ground, and checks where puddles are (tools/puddle-checks.mjs).

import * as THREE from 'three';
import { CELL } from './terrain.js';
import { dirtRoadRows } from './ground.js';
import {
  SegIndex, pointInPolygon, bbox, circleHitsRect, hashString,
} from '../../src/drive/geom.js';
import { makePads } from '../../src/drive/layout.js';
import { mudFor } from '../../src/world/mud.js';

export const PUDDLE = {
  LIFT: 0.03, // decal above the ground off-road (m)
  ROAD_LIFT: 0.02, // decal above the dirt road surface
  WIN: 3, // hollow search window: cells either side (a 28 m square)
  MIN_DEPTH: 0.1, // a hollow this deep (to where it would spill) holds water...
  MUD_DEPTH: 0.06, // ...or this deep on muddy ground
  MAX_DEPTH: 0.16, // water never deeper than this...
  MUD_MAX_DEPTH: 0.24, // ...or this on muddy ground
  SPACING: 42, // m between puddles off-road...
  MUD_SPACING: 20, // ...and on muddy ground (Willow Bottoms, creek low ground)
  MAX_OFFROAD: 4000,
  ROAD_SPACING: 40, // m between puddles along a dirt road
  ROAD_RISE: 0.035, // a dip in the road this deep (to where it spills) holds water
  ROAD_MAX_DEPTH: 0.1,
  ROAD_HALF_LEN: 8, // decal reaches this far along the road either side of the dip
  ROAD_PER_KM: 6, // at most this many per km of dirt road
  PAVED_CLEAR: 3, // m beyond a paved road's edge (shoulder included) at least
  BRIDGE_CLEAR: 20, // m from a bridge
  WATER_CLEAR: 6, // m beyond a creek's bank
  FILL_FROM: 0.1, // puddle state (0..1) where the first water shows
};

const FILL_LEVELS = [0.25, 0.5, 0.75, 1];

// Level fraction (0 empty .. 1 full) for puddle state p and a puddle's delay.
export function puddleFill(p, delay = 0) {
  const f = Math.max(0, Math.min(1, (p - PUDDLE.FILL_FROM - delay) / (0.85 - delay)));
  return f ** 0.7;
}

// Radius (m) of a puddle at level fraction q, from its rs table.
export function puddleRadius(pd, q) {
  if (q <= 0) return 0;
  const x = q * 4;
  const i = Math.min(3, Math.floor(x));
  const a = i === 0 ? 0 : pd.rs[i - 1];
  const b = pd.rs[i];
  return a + (b - a) * (x - i);
}

const hash01 = (s) => hashString(s) / 4294967296;

// Where puddles may NOT be: { blocked(x, y, onRoad) }.
function exclusions(world, terrain) {
  const paved = new SegIndex(32);
  for (const r of world.roads) if (r.type === 'paved') paved.addPolyline(r.points, r.width / 2 + 0.9 + PUDDLE.PAVED_CLEAR + 2, r);
  const dirt = new SegIndex(32);
  for (const r of world.roads) if (r.type !== 'paved') dirt.addPolyline(r.points, r.width / 2 + 0.8 + 4, r);
  const water = new SegIndex(32);
  for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + PUDDLE.WATER_CLEAR + 4, c);
  const polys = (list) => list.map((f) => ({ poly: f.polygon, bb: bbox(f.polygon) }));
  const crops = polys((world.fields || []).filter((f) => f.crop === 'wheat' || f.crop === 'corn' || f.kind === 'wheat' || f.kind === 'corn'));
  const forests = polys(world.forests || []);
  const lakes = polys(world.lakes || []);
  const inAny = (list, x, y, pad) => list.some((a) => x > a.bb.minX - pad && x < a.bb.maxX + pad && y > a.bb.minY - pad && y < a.bb.maxY + pad && pointInPolygon(x, y, a.poly));
  const pads = makePads(world);
  const quarries = terrain.quarries || [];
  return {
    pavedDist: (x, y) => paved.minDist(x, y, (s) => s.data.width / 2 + 0.9),
    blocked(x, y, onRoad) {
      if (paved.minDist(x, y, (s) => s.data.width / 2 + 0.9) < PUDDLE.PAVED_CLEAR) return 'paved road';
      if (world.bridges.some((b) => Math.hypot(b.x - x, b.y - y) < b.length / 2 + PUDDLE.BRIDGE_CLEAR)) return 'bridge';
      if (water.minDist(x, y, (s) => s.data.width / 2) < PUDDLE.WATER_CLEAR) return 'creek';
      if (inAny(lakes, x, y, 0)) return 'lake';
      if (quarries.some((q) => Math.hypot(q.x - x, q.y - y) < q.r * 1.3)) return 'quarry';
      if (onRoad) return null;
      if (dirt.minDist(x, y, (s) => s.data.width / 2 + 0.8) < 1.5) return 'dirt road edge';
      const g = terrain.rough.at(x, y);
      if (g.fd < 2) return 'yard or road';
      if (inAny(crops, x, y, 0)) return 'crop field';
      if (inAny(forests, x, y, 0)) return 'forest';
      if (pads.some((p) => circleHitsRect(x, y, 1, p))) return 'pad';
      return null;
    },
  };
}

// ---- Off-road hollows on the terrain grid ----

function findOffRoad(world, terrain, ex, mud) {
  const { cols, rows, h } = terrain;
  const W = PUDDLE.WIN;
  const at = (i, j) => h[j * cols + i];
  const cands = [];
  const STEP = 2; // look at every other grid point first (the minimum test refines)
  for (let j = W + 1; j < rows - W - 1; j++) {
    for (let i = W + 1; i < cols - W - 1; i++) {
      const c = at(i, j);
      // A strict local minimum of its 8 neighbours.
      let low = true;
      for (let dj = -1; dj <= 1 && low; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && at(i + di, j + dj) <= c) { low = false; break; }
      if (!low) continue;
      cands.push({ i, j, c });
    }
  }
  void STEP;
  // Spill level of each: the lowest "highest point" on any way out of the
  // window (minimax flood from the centre).
  const N = 2 * W + 1;
  const cost = new Float32Array(N * N);
  const done = new Uint8Array(N * N);
  const spill = (ci, cj) => {
    cost.fill(Infinity);
    done.fill(0);
    const k0 = W * N + W;
    cost[k0] = at(ci, cj);
    let best = Infinity;
    for (let n = 0; n < N * N; n++) {
      let k = -1;
      let kc = Infinity;
      for (let q = 0; q < N * N; q++) if (!done[q] && cost[q] < kc) { kc = cost[q]; k = q; }
      if (k < 0 || kc >= best) break;
      done[k] = 1;
      const u = k % N;
      const v = (k - u) / N;
      if (u === 0 || v === 0 || u === N - 1 || v === N - 1) {
        best = Math.min(best, kc);
        continue;
      }
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          if (!du && !dv) continue;
          const q = (v + dv) * N + u + du;
          if (done[q]) continue;
          const nc = Math.max(kc, at(ci + u + du - W, cj + v + dv - W));
          if (nc < cost[q]) cost[q] = nc;
        }
      }
    }
    return { best, cost: cost.slice() };
  };
  const out = [];
  for (const cd of cands) {
    const x = cd.i * CELL;
    const y = cd.j * CELL;
    const m = mud.at(x, y);
    const minD = PUDDLE.MIN_DEPTH + (PUDDLE.MUD_DEPTH - PUDDLE.MIN_DEPTH) * m;
    // Cheap first test: some neighbour ring must be deep enough at all.
    let ringMin = Infinity;
    for (let d = -W; d <= W; d++) {
      ringMin = Math.min(ringMin, at(cd.i + d, cd.j - W), at(cd.i + d, cd.j + W), at(cd.i - W, cd.j + d), at(cd.i + W, cd.j + d));
    }
    if (ringMin - cd.c < minD) continue;
    if (ex.blocked(x, y, false)) continue;
    const s = spill(cd.i, cd.j);
    const depth = s.best - cd.c;
    if (depth < minD) continue;
    const maxD = PUDDLE.MAX_DEPTH + (PUDDLE.MUD_MAX_DEPTH - PUDDLE.MAX_DEPTH) * m;
    out.push({ ...cd, x, y, depth, maxD, mud: m, cost: s.cost, score: Math.min(depth, maxD) });
  }
  out.sort((a, b) => b.score - a.score);
  // Keep the deepest, spaced out (closer together on muddy ground).
  const kept = [];
  const grid = new Map();
  const G = PUDDLE.SPACING;
  const gap = (q, p) => PUDDLE.SPACING + (PUDDLE.MUD_SPACING - PUDDLE.SPACING) * Math.max(q.mud, p.mud);
  const key = (gx, gy) => gx * 100003 + gy;
  for (const p of out) {
    if (kept.length >= PUDDLE.MAX_OFFROAD) break;
    const gx = Math.floor(p.x / G);
    const gy = Math.floor(p.y / G);
    let clash = false;
    for (let a = -1; a <= 1 && !clash; a++) {
      for (let b = -1; b <= 1; b++) {
        const l = grid.get(key(gx + a, gy + b));
        if (l && l.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < gap(q, p))) { clash = true; break; }
      }
    }
    if (clash) continue;
    // The water at its fullest: the window cells below the level, joined.
    const level = p.c + Math.min(p.depth - 0.02, p.maxD);
    const N2 = 2 * W + 1;
    let i0 = W;
    let i1 = W;
    let j0 = W;
    let j1 = W;
    for (let k = 0; k < N2 * N2; k++) {
      if (p.cost[k] >= level) continue;
      const u = k % N2;
      const v = (k - u) / N2;
      i0 = Math.min(i0, u);
      i1 = Math.max(i1, u);
      j0 = Math.min(j0, v);
      j1 = Math.max(j1, v);
    }
    // Cells around it (one more all round, inside the window).
    const box = {
      i0: p.i - W + Math.max(0, i0 - 1), i1: p.i - W + Math.min(N2 - 1, i1 + 1),
      j0: p.j - W + Math.max(0, j0 - 1), j1: p.j - W + Math.min(N2 - 1, j1 + 1),
    };
    // Every corner of the decal must be allowed ground.
    let ok = true;
    for (let j = box.j0; j <= box.j1 && ok; j++) for (let i = box.i0; i <= box.i1; i++) if (ex.blocked(i * CELL, j * CELL, false)) { ok = false; break; }
    if (!ok) continue;
    // The water must stop short of the decal's edge all round (no straight
    // edges): the level stays under the lowest ground along the border.
    let edge = Infinity;
    for (let t = box.i0 * CELL; t <= box.i1 * CELL; t += 0.5) edge = Math.min(edge, terrain.heightAt(t, box.j0 * CELL), terrain.heightAt(t, box.j1 * CELL));
    for (let t = box.j0 * CELL; t <= box.j1 * CELL; t += 0.5) edge = Math.min(edge, terrain.heightAt(box.i0 * CELL, t), terrain.heightAt(box.i1 * CELL, t));
    const lvl = Math.min(level, edge - 0.02);
    if (lvl - p.c < PUDDLE.MUD_DEPTH * 0.8) continue;
    const pd = { kind: 'off', x: p.x, y: p.y, hmin: p.c, level: lvl, box, mud: p.mud, depth: lvl - p.c };
    kept.push(pd);
    const k = key(gx, gy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(pd);
  }
  return kept;
}

// ---- Dips along the dirt roads ----

function findOnRoads(world, terrain, ex) {
  const H = (x, y) => terrain.heightAt(x, y);
  const out = [];
  for (const r of world.roads) {
    if (r.type === 'paved') continue;
    const { rows, across, lift } = dirtRoadRows(r, H, (x, y) => !!ex.blocked(x, y, true));
    const k0 = 3; // half - 0.8 .. -(half - 0.8): the road bed inside the shoulders
    const k1 = across.length - 4;
    const n = rows.length;
    if (n < 10) continue;
    const m = rows.map((row) => {
      let v = Infinity;
      for (let k = k0; k <= k1; k++) v = Math.min(v, row.v[k][1]);
      return v;
    });
    const cands = [];
    for (let i = 0; i < n; i++) {
      if (rows[i].skip) continue;
      const d = rows[i].d;
      let maxL = -Infinity;
      let maxR = -Infinity;
      let isMin = true;
      for (let q = i - 1; q >= 0 && rows[q].d > d - 14; q--) {
        if (rows[q].d > d - 5 && m[q] < m[i]) isMin = false;
        maxL = Math.max(maxL, m[q]);
      }
      for (let q = i + 1; q < n && rows[q].d < d + 14; q++) {
        if (rows[q].d < d + 5 && m[q] < m[i]) isMin = false;
        maxR = Math.max(maxR, m[q]);
      }
      if (!isMin || !Number.isFinite(maxL) || !Number.isFinite(maxR)) continue;
      const rise = Math.min(maxL, maxR) - m[i];
      if (rise < PUDDLE.ROAD_RISE) continue;
      cands.push({ i, d, rise });
    }
    cands.sort((a, b) => b.rise - a.rise);
    const total = rows[n - 1].d;
    const cap = Math.max(1, Math.floor((total / 1000) * PUDDLE.ROAD_PER_KM));
    const kept = [];
    for (const c of cands) {
      if (kept.length >= cap) break;
      if (kept.some((q) => Math.abs(q.d - c.d) < PUDDLE.ROAD_SPACING)) continue;
      // Rows for the decal: all of them on allowed ground.
      let a = c.i;
      let b = c.i;
      while (a > 0 && rows[a - 1].d > c.d - PUDDLE.ROAD_HALF_LEN) a--;
      while (b < n - 1 && rows[b + 1].d < c.d + PUDDLE.ROAD_HALF_LEN) b++;
      let ok = true;
      for (let q = a; q <= b; q++) {
        if (rows[q].skip) ok = false;
        for (let k = k0; k <= k1 && ok; k++) if (ex.blocked(rows[q].v[k][0], rows[q].v[k][2], true)) ok = false;
      }
      if (!ok || b - a < 3) continue;
      const level = m[c.i] + Math.min(c.rise * 0.8, PUDDLE.ROAD_MAX_DEPTH);
      kept.push(c);
      const mid = rows[c.i].v[(across.length - 1) / 2];
      out.push({
        kind: 'road', road: r.id, x: mid[0], y: mid[2], hmin: m[c.i], level, depth: level - m[c.i],
        rows: rows.slice(a, b + 1), k0, k1, lift,
      });
    }
  }
  return out;
}

// ---- Geometry ----

function decalOffRoad(pd, terrain, pos, base, pud, delay) {
  const L = PUDDLE.LIFT;
  const S = 1; // pieces per 4 m cell side: the terrain's own triangles (the water shape is per pixel)
  const st = CELL / S;
  const vert = (x, z) => {
    const g = terrain.heightAt(x, z);
    pos.push(x, g + L, z);
    base.push(g);
    pud.push(pd.hmin, pd.level, delay);
  };
  const { i0, i1, j0, j1 } = pd.box;
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      for (let v = 0; v < S; v++) {
        for (let u = 0; u < S; u++) {
          const x0 = i * CELL + u * st;
          const z0 = j * CELL + v * st;
          const x1 = x0 + st;
          const z1 = z0 + st;
          // Split along the (x0, z0)-(x1, z1) diagonal, like the terrain cell,
          // wound to face up: a, d, b and a, c, d.
          vert(x0, z0); vert(x1, z1); vert(x1, z0);
          vert(x0, z0); vert(x0, z1); vert(x1, z1);
        }
      }
    }
  }
}

function decalOnRoad(pd, pos, base, pud, delay) {
  const L = PUDDLE.ROAD_LIFT;
  const vert = (q) => {
    pos.push(q[0], q[1] + L, q[2]);
    base.push(q[1]);
    pud.push(pd.hmin, pd.level, delay);
  };
  const tri = (a, b, c) => {
    // Face up: y of (b - a) x (c - a) must be > 0.
    const cy = (c[0] - a[0]) * (b[2] - a[2]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (cy >= 0) { vert(a); vert(b); vert(c); } else { vert(a); vert(c); vert(b); }
  };
  // The road mesh's own triangles (ground.js dirtRoadMesh), road bed only.
  for (let q = 0; q < pd.rows.length - 1; q++) {
    const r0 = pd.rows[q].v;
    const r1 = pd.rows[q + 1].v;
    for (let k = pd.k0; k < pd.k1; k++) {
      tri(r0[k], r0[k + 1], r1[k + 1]);
      tri(r0[k], r1[k + 1], r1[k]);
    }
  }
}

// Radius at each fill level and the centre of the full puddle, from 0.5 m
// samples of the ground under its decal.
function measure(pd, sampleGround) {
  const counts = [0, 0, 0, 0];
  let sx = 0;
  let sy = 0;
  let n = 0;
  sampleGround((x, y, g, area) => {
    for (let f = 0; f < 4; f++) {
      if (g < pd.hmin + (pd.level - pd.hmin) * FILL_LEVELS[f]) counts[f] += area;
    }
    if (g < pd.level) {
      sx += x * area;
      sy += y * area;
      n += area;
    }
  });
  pd.rs = counts.map((a) => Math.round(Math.sqrt(a / Math.PI) * 100) / 100);
  if (n > 0) {
    pd.x = sx / n;
    pd.y = sy / n;
  }
}

function material() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uFill: { value: 0 },
      uRain: { value: 0 },
      uTime: { value: 0 },
      uSky: { value: new THREE.Color(0.8, 0.85, 0.9) },
      uDeep: { value: new THREE.Color(0.08, 0.075, 0.06) },
    }]),
    vertexShader: /* glsl */`
attribute vec3 aPud;
attribute float aBase;
varying vec3 vPud;
varying float vBase;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vPud = aPud;
  vBase = aBase;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */`
uniform float uFill;
uniform float uRain;
uniform float uTime;
uniform vec3 uSky;
uniform vec3 uDeep;
varying vec3 vPud;
varying float vBase;
varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  float f = clamp((uFill - ${PUDDLE.FILL_FROM.toFixed(2)} - vPud.z) / (0.85 - vPud.z), 0.0, 1.0);
  if (f <= 0.0) discard;
  float level = vPud.x + (vPud.y - vPud.x) * pow(f, 0.7);
  // A little wobble on the water line, so it never runs along a straight
  // edge of the ground's triangles.
  vec2 q = vW.xz;
  float wob = sin(q.x * 1.7 + sin(q.y * 1.3)) * sin(q.y * 1.9 + sin(q.x * 0.9)) + 0.5 * sin(q.x * 4.1 - q.y * 3.3);
  float d = level - vBase + wob * 0.012 * (vPud.y - vPud.x) / 0.15;
  float water = smoothstep(0.0, 0.015, d);
  float margin = smoothstep(-0.06, 0.0, d);
  if (margin <= 0.002) discard;
  vec3 V = normalize(cameraPosition - vW);
  // Rain: drops ring the surface. Two offset grids of cells, each with one
  // ring growing and fading from a seeded spot; the ring tilts the normal.
  vec3 N = vec3(0.0, 1.0, 0.0);
  if (uRain > 0.01) {
    vec2 tilt = vec2(0.0);
    for (int k = 0; k < 2; k++) {
      vec2 g = vW.xz * 1.6 + float(k) * vec2(0.5, 0.37);
      vec2 cell = floor(g);
      float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5);
      vec2 o = g - cell - (0.25 + 0.5 * vec2(h, fract(h * 13.7)));
      float age = fract(uTime * (0.9 + 0.5 * h) + h * 7.0);
      float r = length(o);
      float x = (r - age * 0.45) * 28.0;
      float ring = x * exp(-x * x) * (1.0 - age) * step(0.001, r);
      tilt += o / max(r, 0.001) * ring;
    }
    N = normalize(vec3(tilt.x * 0.35 * uRain, 1.0, tilt.y * 0.35 * uRain));
  }
  // Reflection: the overcast sky is brighter than the haze it fades into
  // (brightest overhead), so water shows a bright sky, not the grey haze.
  vec3 R = reflect(-V, N);
  float fr = 0.16 + 0.8 * pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.0);
  // Soft moving speckle from the drops, dimming the reflection a little.
  vec2 p = vW.xz * 3.0;
  float rip = sin(p.x + sin(p.y * 1.7 + uTime * 3.1) * 2.0) * sin(p.y * 1.3 + sin(p.x * 1.1 - uTime * 2.7) * 2.0);
  fr = clamp(fr * (1.0 - 0.12 * uRain + 0.1 * rip * uRain), 0.0, 1.0);
  vec3 refl = uSky * vec3(0.95, 1.0, 1.06) * mix(0.98, 1.45, smoothstep(0.05, 0.6, R.y));
  vec3 col = mix(uDeep, refl, fr);
  // Shallow edge: you see the mud through it.
  float shallow = smoothstep(0.0, 0.05, d);
  vec3 mud = uDeep * vec3(0.9, 0.82, 0.7);
  col = mix(mud, col, 0.55 + 0.45 * shallow);
  // The wet edge around the water, soaked darker.
  float a = max(water * (0.8 + 0.18 * shallow), margin * (1.0 - water) * 0.6);
  vec3 c = mix(mud * 0.8, col, water);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

export function buildPuddles(world, terrain, audit = null) {
  const t0 = Date.now();
  const ex = exclusions(world, terrain);
  const mud = mudFor(world);
  const off = findOffRoad(world, terrain, ex, mud);
  const road = findOnRoads(world, terrain, ex);
  const list = [...off, ...road];
  const pos = [];
  const base = [];
  const pud = [];
  list.forEach((pd, n) => {
    pd.id = `pud_${n}`;
    // Some hollows fill a little later than others.
    const delay = Math.round(hash01(`${pd.id}:${world.seed}`) * 0.25 * 100) / 100;
    pd.delay = delay;
    const p0 = pos.length;
    if (pd.kind === 'off') {
      decalOffRoad(pd, terrain, pos, base, pud, delay);
      const { i0, i1, j0, j1 } = pd.box;
      measure(pd, (fn) => {
        for (let y = j0 * CELL + 0.25; y < j1 * CELL; y += 0.5) for (let x = i0 * CELL + 0.25; x < i1 * CELL; x += 0.5) fn(x, y, terrain.heightAt(x, y), 0.25);
      });
    } else {
      decalOnRoad(pd, pos, base, pud, delay);
      measure(pd, (fn) => {
        // Triangle centres, area weighted, of the decal just built.
        for (let k = p0; k < pos.length; k += 9) {
          const ax = pos[k + 3] - pos[k];
          const az = pos[k + 5] - pos[k + 2];
          const bx = pos[k + 6] - pos[k];
          const bz = pos[k + 8] - pos[k + 2];
          const area = Math.abs(ax * bz - az * bx) / 2;
          const kb = k / 3;
          fn((pos[k] + pos[k + 3] + pos[k + 6]) / 3, (pos[k + 2] + pos[k + 5] + pos[k + 8]) / 3, (base[kb] + base[kb + 1] + base[kb + 2]) / 3, area);
        }
      });
    }
    if (audit) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(p0), 3));
      audit.surface(pd.id, pd.kind === 'off' ? 'puddle' : 'puddle_road', g, pd.kind === 'off' ? PUDDLE.LIFT : pd.lift + PUDDLE.ROAD_LIFT);
    }
    delete pd.rows;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 1));
  geo.setAttribute('aPud', new THREE.Float32BufferAttribute(pud, 3));
  geo.computeBoundingSphere();
  const mat = material();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'puddles';
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.frustumCulled = false;

  // Lookup grid for the car.
  const G = 32;
  const grid = new Map();
  for (const pd of list) {
    const k = Math.floor(pd.x / G) * 100003 + Math.floor(pd.y / G);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(pd);
  }
  let fill = 0;
  const tris = pos.length / 9;
  const ms = Date.now() - t0;
  if (typeof window !== 'undefined') console.info(`[puddles] ${off.length} in hollows, ${road.length} on dirt roads, ${tris} triangles, in ${ms} ms`);
  return {
    object: mesh,
    list,
    counts: { offRoad: off.length, onRoad: road.length, tris, ms },
    update(puddle, rain, time, fogColor) {
      fill = puddle;
      mesh.visible = puddle > PUDDLE.FILL_FROM;
      const u = mat.uniforms;
      u.uFill.value = puddle;
      u.uRain.value = rain;
      u.uTime.value = time;
      if (fogColor) {
        u.uSky.value.copy(fogColor);
        u.uDeep.value.setRGB(fogColor.r * 0.11, fogColor.g * 0.105, fogColor.b * 0.085);
      }
    },
    // Surface events for the car: puddles near (x, y) with water in them now.
    pushSurface(x, y, reach, out) {
      if (fill <= PUDDLE.FILL_FROM) return;
      const g0 = Math.floor((x - reach) / G);
      const g1 = Math.floor((x + reach) / G);
      const h0 = Math.floor((y - reach) / G);
      const h1 = Math.floor((y + reach) / G);
      for (let gx = g0; gx <= g1; gx++) {
        for (let gy = h0; gy <= h1; gy++) {
          for (const pd of grid.get(gx * 100003 + gy) || []) {
            const r = puddleRadius(pd, puddleFill(fill, pd.delay));
            if (r < 0.5) continue;
            if (Math.abs(pd.x - x) > reach + r || Math.abs(pd.y - y) > reach + r) continue;
            // The same object every frame: damage.js remembers what the wheels rolled over by it.
            const ev = pd.ev || (pd.ev = { id: pd.id, kind: 'puddle', x: pd.x, y: pd.y, r });
            ev.r = r;
            out.push(ev);
          }
        }
      }
    },
  };
}
