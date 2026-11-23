// Roadside fill (#66): tar patches and crack seal on the paved roads, ditches
// painted down the verges, culvert pipe ends where a ditch meets a crossing
// road, and old fence posts leaning by the road. Placement is in
// src/world/verge.js; the verge flowers and ditch plants are the carpet's
// (carpet3d.js).
//
// No draw calls of its own: the tar goes into the road's 'ground' buckets,
// posts and culverts into the lambert ones (batch share), the ditches into
// the ground paint (paint.js). Dev: three.html?verge=off (verge.js).

import * as THREE from 'three';
import { vergeFor } from '../../src/world/verge.js';
import { cyl, strut } from './shapes.js';
import { objMatrix } from './batch.js';
import { PAVED_LIFT } from './ground.js';
import { GALV } from './fences3d.js';

const ID = new THREE.Matrix4();
// Above the tar (PAVED_LIFT), under the centre dashes (0.15).
const PATCH_LIFT = PAVED_LIFT + 0.012;
const SEAL_LIFT = PAVED_LIFT + 0.016;
const ON_ROAD = { cast: false, material: 'ground', share: true };
// Posts, wire and pipes go in with the lambert pieces where the chunk has
// some, else with the road's ground pieces (no shadow then), never a bucket
// of their own: a piece in a chunk with neither is left out.
const SOLID = { share: true };
const SMALL = { cast: false, share: true };
const BY_ROAD = { cast: false, material: 'ground', share: true };
const optsAt = (batch, x, y, opts) => (batch.hasBucket(x, y, 'lambert') ? opts : batch.hasBucket(x, y, 'ground') ? BY_ROAD : null);

const PATCH_NEW = new THREE.Color(0x48494c); // fresh, near black
const PATCH_OLD = new THREE.Color(0x5b5c5f); // a few summers old, a shade off the tar (0x66676a)
const SEAL = 0x343538; // crack seal: shiny black tar snakes
// Ditch paint across it, from the road out: the near bank in shade, the
// damp bottom, the far bank catching the light, so it reads as a dip from
// the road although the ground is flat at this scale (4 m terrain cells).
const DITCH_NEAR = [0x3f5c2e, 0.7];
const DITCH_BED = [0x2c4520, 0.92];
const DITCH_FAR = [0x9db46a, 0.6];
const POST = [0x7f7668, 0x8d8372, 0x6c6459, 0x766a5a];
const WIRE = 0x5e4632; // rusted barbed wire
const PIPE_IN = 0x3a3c3e;

// A flat piece of tar draped on the ground: rows of [left, right] world
// points ({x, y}), each row a cross-section. Returns a geometry facing up.
function drape(rows, lift, H) {
  const v = [];
  const P = (p) => [p.x, H(p.x, p.y) + lift, p.y];
  const tri = (a, b, c) => {
    // Face up: (b - a) x (c - a) has +y.
    const cr = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (cr >= 0) v.push(...a, ...b, ...c);
    else v.push(...a, ...c, ...b);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i].map(P);
    const b = rows[i + 1].map(P);
    for (let k = 0; k < a.length - 1; k++) {
      tri(a[k], a[k + 1], b[k + 1]);
      tri(a[k], b[k + 1], b[k]);
    }
  }
  if (!v.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// One tar patch: a saw-cut oblong with slightly ragged edges, or a rounder
// "throw and roll" blob.
function patchGeo(V, p, H) {
  const rows = [];
  const n = Math.max(3, Math.ceil(p.len / 0.4));
  const seed = p.d * 7.3 + p.off;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = V.frame(p.road, p.d + p.len * t);
    let half = p.w / 2;
    if (p.blob) half *= Math.pow(Math.max(0, 1 - (2 * t - 1) ** 2), 0.45) * (0.82 + 0.3 * hash(seed, i));
    const rag = p.blob ? 0.06 : 0.025;
    const l = p.off - half - rag * hash(seed + 1, i);
    const r = p.off + half + rag * hash(seed + 2, i);
    const m = (l + r) / 2;
    rows.push([V.at(f, l), V.at(f, m), V.at(f, r)]);
  }
  return drape(rows, PATCH_LIFT + p.tone * 0.002, H);
}

// A thin wandering line of crack seal along the lane, or across it.
function sealGeo(V, s, H) {
  const pts = [];
  const seed = s.d * 3.1 + s.off;
  if (s.cross) {
    const f = V.frame(s.road, s.d);
    const n = Math.ceil(s.len / 0.25);
    for (let i = 0; i <= n; i++) {
      const o = s.off - s.len / 2 + (s.len * i) / n;
      pts.push({ f, o, a: (hash(seed, i) - 0.5) * 0.16 + Math.sin(i * 0.7 + seed) * 0.05 });
    }
  } else {
    const n = Math.ceil(s.len / 0.5);
    for (let i = 0; i <= n; i++) {
      const d = s.d + (s.len * i) / n;
      pts.push({ f: V.frame(s.road, d), o: s.off + Math.sin(i * 0.45 + seed) * 0.12 + (hash(seed, i) - 0.5) * 0.06, a: 0 });
    }
  }
  const rows = [];
  for (let i = 0; i < pts.length; i++) {
    const { f, o, a } = pts[i];
    // Wider in the middle, thin at the ends.
    const w = 0.035 + 0.03 * Math.sin((Math.PI * i) / (pts.length - 1));
    if (s.cross) rows.push([V.at(f, o, a - w), V.at(f, o, a + w)]);
    else rows.push([V.at(f, o - w), V.at(f, o + w)]);
  }
  return drape(rows, SEAL_LIFT, H);
}

// An old cedar post: six-sided, a little thinner at the top, the top cut on
// a slant and split. Base 0.3 m in the ground. Unit height above ground.
function postGeo() {
  const g = cyl(0.085, 1.3, 6, 0.07).translate(0, -0.3, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.95) p.setY(i, 1.0 + p.getX(i) * 0.35 + (p.getZ(i) > 0.03 ? -0.04 : 0));
  }
  g.computeVertexNormals();
  return g;
}

// Corrugated steel pipe end, lying along z, centre at 0: an outer skin,
// a dark inner skin facing in, and ribs round the mouth.
function culvertParts() {
  const L = 1.4;
  const outer = new THREE.CylinderGeometry(0.32, 0.32, L, 12, 1, true).rotateX(Math.PI / 2);
  const inner = new THREE.CylinderGeometry(0.3, 0.3, L, 12, 1, true).rotateX(Math.PI / 2);
  inner.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)); // mirrored: faces inward
  const ribs = [];
  for (let k = 0; k < 4; k++) {
    ribs.push(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, L / 2 - 0.06 - k * 0.22));
  }
  return { outer, inner, ribs, L };
}

export function buildVerge(world, terrain, batch) {
  const V = vergeFor(world);
  const H = (x, y) => terrain.heightAt(x, y);
  const col = new THREE.Color();

  // Tar patches and crack seal.
  for (const p of V.patches) {
    const g = patchGeo(V, p, H);
    if (g) batch.add(g, ID, col.copy(PATCH_NEW).lerp(PATCH_OLD, p.tone).getHex(), ON_ROAD);
  }
  for (const s of V.seals) {
    const g = sealGeo(V, s, H);
    if (g) batch.add(g, ID, SEAL, ON_ROAD);
  }

  // Ditches: painted on the ground, shade, bed and lit bank across it.
  if (batch.paint) {
    const P = batch.paint;
    const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const bands = [DITCH_NEAR, DITCH_BED, DITCH_FAR].map(([hex, a]) => ({ c: rgbOf(hex), a }));
    const mix = [0, 0, 0];
    for (const dt of V.ditches) {
      const hw = dt.w / 2;
      const n = dt.pts.length;
      // Texel -> nearest point on this ditch: distance out from the road
      // (signed, + away from it) and the end taper there.
      const best = new Map();
      for (let i = 0; i < n - 1; i++) {
        const [ax, ay] = dt.pts[i];
        const [bx, by] = dt.pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay) || 1;
        const tx = (bx - ax) / L;
        const ty = (by - ay) / L;
        const seg = L; // samples are VERGE.ditchStep (2 m) apart
        P.each(Math.min(ax, bx) - hw - 1, Math.min(ay, by) - hw - 1, Math.max(ax, bx) + hw + 1, Math.max(ay, by) + hw + 1, (x, y, ti, tj) => {
          const t = Math.max(0, Math.min(L, (x - ax) * tx + (y - ay) * ty));
          const dx = x - (ax + tx * t);
          const dy = y - (ay + ty * t);
          const d = Math.hypot(dx, dy);
          if (d >= hw + 0.5) return;
          const k = ti * 100003 + tj;
          const o = best.get(k);
          if (o && o.d <= d) return;
          // + right of the road's direction, times the side: + away from the road.
          const u = (-ty * dx + tx * dy) * dt.side;
          // Metres from the ditch's nearer end.
          const end = Math.min(i * seg + t, (n - 2 - i) * seg + (seg - t));
          best.set(k, { d, u, ti, tj, end });
        });
      }
      for (const { u, ti, tj, end } of best.values()) {
        const fade = Math.min(1, Math.max(0, (end + 1) / 7));
        if (fade <= 0) continue;
        // Weights of the three bands across, soft edges.
        const s = u / hw; // -1 near edge .. 1 far edge
        const wNear = Math.max(0, 1 - Math.abs(s + 0.6) / 0.45);
        const wBed = Math.max(0, 1 - Math.abs(s) / 0.38);
        const wFar = Math.max(0, 1 - Math.abs(s - 0.6) / 0.45);
        const wsum = wNear + wBed + wFar;
        if (wsum <= 0) continue;
        let a = 0;
        for (let q = 0; q < 3; q++) mix[q] = 0;
        for (const [w, b] of [[wNear, bands[0]], [wBed, bands[1]], [wFar, bands[2]]]) {
          if (w <= 0) continue;
          for (let q = 0; q < 3; q++) mix[q] += (b.c[q] * w) / wsum;
          a += b.a * w;
        }
        P.blend(ti, tj, mix.map(Math.round), Math.min(1, a) * fade, null);
      }
    }
  }

  // Culverts: half sunk in the ditch end, mouth toward the ditch.
  const C = culvertParts();
  for (const cv of V.culverts) {
    const base = H(cv.x, cv.y) - 0.16;
    // dir 1: the ditch ends ahead (the pipe runs on past its end); -1: behind.
    const turn = cv.dir > 0 ? 180 : 0;
    const m = objMatrix(cv.x, cv.y, base, cv.angle + turn, 0, C.L / 2 - 0.3, 0.3);
    const o = optsAt(batch, cv.x, cv.y, SMALL);
    if (!o) continue;
    batch.add(C.outer, m, GALV, o);
    batch.add(C.inner, m, PIPE_IN, o);
    for (const r of C.ribs) batch.add(r, m, GALV, o);
  }

  // Leaning posts, and old wire sagging between some of them.
  const post = postGeo();
  const top = new THREE.Vector3();
  const tops = [];
  for (let i = 0; i < V.posts.length; i++) {
    const p = V.posts[i];
    const o = optsAt(batch, p.x, p.y, SOLID);
    if (!o) {
      tops.push(null);
      continue;
    }
    const extra = new THREE.Matrix4()
      .makeRotationX((-p.lean * Math.PI) / 180)
      .multiply(new THREE.Matrix4().makeRotationY((p.rot * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeScale(1, p.h, 1));
    const m = objMatrix(p.x, p.y, H(p.x, p.y), p.leanTo, 0, 0, 0, extra);
    batch.add(post, m, POST[i % POST.length], o);
    tops.push([0.82, 0.5].map((k) => top.set(0, k, 0).applyMatrix4(m).clone()));
  }
  for (let i = 0; i < V.posts.length - 1; i++) {
    const p = V.posts[i];
    const q = V.posts[i + 1];
    if (!p.wire || !tops[i] || !tops[i + 1] || Math.hypot(q.x - p.x, q.y - p.y) > 5) continue;
    for (let s = 0; s < 2; s++) {
      // The lower strand is gone on some stretches.
      if (s === 1 && hash(p.x, p.y) < 0.4) continue;
      const a = tops[i][s];
      const b = tops[i + 1][s];
      const sag = 0.12 + 0.1 * hash(p.y, p.x);
      const N = 4;
      let prev = a;
      for (let k = 1; k <= N; k++) {
        const t = k / N;
        const cur = new THREE.Vector3().lerpVectors(a, b, t);
        cur.y -= sag * 4 * t * (1 - t);
        const o = optsAt(batch, prev.x, prev.z, SMALL);
        if (o) batch.add(strut(prev, cur, 0.008, 3), ID, WIRE, o);
        prev = cur;
      }
    }
  }
}
