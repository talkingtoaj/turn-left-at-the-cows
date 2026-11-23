// Code-made tree parts (#69): the bark and branches the trees near the car
// get, and the dead and broken trees. All vertex coloured and flat shaded like
// the tree models (trees.js), so they share the trees' material and batches.
//
//   closeTree(model, kind) -> the model with its few wood faces swapped for a
//     ridged trunk with root flare, limbs reaching up into the canopy and a
//     broken stub (oaks), or a ridged trunk with dead stubs (pines). Used by
//     the trees in the sun's shadow box, the ones near the car; the rest keep
//     the plain model, so no draw calls are added.
//   deadTree() -> a bare dead tree, canopy radius 1, DEAD_H tall (scale by r).
//   snag() -> a broken trunk: x and z in tree radii, y 0 to 1 (scale y by
//     its height in metres).
//   deadwood() -> both in one shape, so they share one batch: attribute
//     `snag` is 1 on the snag's faces. deadwoodMaterials() hides the shape an
//     instance is not: instance colour blue above 1.5 means a snag (the tint
//     is grey, so blue is put back from red).
//
// Model units: a tree of radius r is the shape scaled by r.

import * as THREE from 'three';
import { makeRng } from '../../src/drive/geom.js';

export const DEAD_H = 3.4;

const lin = (hex) => new THREE.Color(hex); // three converts sRGB hex to linear
const BARK = lin(0x5c4838);
const BARK_DARK = lin(0x33271d);
const MOSS = lin(0x56652f);
const DEAD = lin(0x8d8576);
const DEAD_DARK = lin(0x5a5248);
const SNAG = lin(0x5f5244);
const HEART = lin(0xc2a679); // pale wood where a trunk snapped

// A tube along pts with a radius per point; sides faces round. shade(i, k)
// gives the colour of the faces between ring i and i + 1, side k. ridge
// makes alternate sides stand out (bark). Last radius 0 closes it to a point.
function tube(out, pts, radii, sides, shade, ridge = 0) {
  const rings = [];
  const t = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const ref = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    t.subVectors(b, a).normalize();
    ref.set(0, 0, 1);
    if (Math.abs(t.z) > 0.9) ref.set(1, 0, 0);
    u.crossVectors(t, ref).normalize();
    v.crossVectors(t, u);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      const r = radii[i] * (ridge && radii[i] > 0 ? (k % 2 ? 1 - ridge : 1 + ridge) : 1);
      ring.push(pts[i].clone().addScaledVector(u, Math.cos(th) * r).addScaledVector(v, Math.sin(th) * r));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const c = shade(i, k);
      tri(out, rings[i][k], rings[i][k1], rings[i + 1][k], c);
      if (radii[i + 1] > 0) tri(out, rings[i][k1], rings[i + 1][k1], rings[i + 1][k], c);
    }
  }
  return rings;
}

function tri(out, a, b, c, col) {
  out.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let j = 0; j < 3; j++) out.col.push(col.r, col.g, col.b);
}

function toGeo(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.computeVertexNormals();
  return g;
}

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, k) => a.clone().lerp(b, k);

// Bark colour for side k of a band: grooves dark, ridges lighter, a little
// noise; moss on the low north (-z) side.
function barkShade(rng, base, dark, mossBands = 0) {
  return (i, k, sides = 8) => {
    const groove = k % 2 === 1;
    let c = mix(base, dark, groove ? 0.55 : 0.1 * rng());
    c.multiplyScalar(0.92 + rng() * 0.16);
    const north = Math.sin((k / sides) * Math.PI * 2) > 0.3;
    if (i < mossBands && north) c = mix(c, MOSS, 0.5);
    return c;
  };
}

// Wood faces of a model: colour redder than green (the leaves are green).
function dropWood(model) {
  const p = model.attributes.position;
  const c = model.attributes.color;
  const out = { pos: [], col: [] };
  let canopyY = Infinity;
  for (let i = 0; i < p.count; i += 3) {
    const wood = c.getX(i) > c.getY(i) * 1.3;
    if (wood) continue;
    for (let j = i; j < i + 3; j++) {
      out.pos.push(p.getX(j), p.getY(j), p.getZ(j));
      out.col.push(c.getX(j), c.getY(j), c.getZ(j));
      canopyY = Math.min(canopyY, p.getY(j));
    }
  }
  return { out, canopyY };
}

export function closeTree(model, kind) {
  const { out, canopyY } = dropWood(model);
  const rng = makeRng(kind === 'pine' ? 41 : kind === 'oakA' ? 7 : 19);
  const R = (a, b) => a + rng() * (b - a);
  if (kind === 'pine') {
    const rb = 0.075;
    const top = canopyY + 0.4;
    tube(out, [P(0, -0.08, 0), P(0, 0.1, 0), P(0.01, top, 0)], [rb * 1.45, rb * 1.1, rb * 0.65], 8, barkShade(rng, BARK, BARK_DARK, 1), 0.07);
    // Dead stubs low on the trunk, where the lowest boughs died off.
    for (let s = 0; s < 3; s++) {
      const a = s * 2.2 + 0.4;
      const y = 0.18 + s * 0.09;
      const L = R(0.12, 0.2);
      tube(out, [P(0, y, 0), P(Math.cos(a) * L, y + 0.04, Math.sin(a) * L)], [rb * 0.28, 0], 4, () => mix(DEAD_DARK, BARK, 0.5));
    }
    return toGeo(out);
  }
  // Oaks: trunk with root flare and ridged bark, leaning a touch.
  const rb = kind === 'oakA' ? 0.095 : 0.078;
  const lean = kind === 'oakA' ? 0.03 : -0.025;
  const fork = canopyY * 0.78;
  const trunkTop = canopyY + 0.6;
  tube(out, [P(0, -0.08, 0), P(0, 0.12, 0), P(lean * 0.5, canopyY * 0.55, 0), P(lean, trunkTop, 0)],
    [rb * 1.75, rb * 1.12, rb, rb * 0.45], 8, barkShade(rng, BARK, BARK_DARK, 1), 0.08);
  // Root flare: a low skirt of buttresses round the foot.
  for (let s = 0; s < 4; s++) {
    const a = s * (Math.PI / 2) + 0.5;
    tube(out, [P(Math.cos(a) * rb * 0.6, 0.2, Math.sin(a) * rb * 0.6), P(Math.cos(a) * rb * 2.3, -0.06, Math.sin(a) * rb * 2.3)], [rb * 0.45, 0.012], 4, () => mix(BARK, BARK_DARK, 0.35));
  }
  // Limbs from the fork up into the canopy, each with a twig.
  const a0 = kind === 'oakA' ? 0.3 : 1.2;
  for (let s = 0; s < 3; s++) {
    const a = a0 + s * ((Math.PI * 2) / 3) + R(-0.3, 0.3);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const y0 = fork + R(-0.08, 0.08);
    const reach = R(0.42, 0.56);
    const start = P(lean * 0.8 + ca * rb * 0.3, y0, sa * rb * 0.3);
    const mid = P(ca * reach * 0.45, y0 + 0.22, sa * reach * 0.45);
    const end = P(ca * reach, canopyY + R(0.35, 0.55), sa * reach);
    tube(out, [start, mid, end], [rb * 0.55, rb * 0.36, 0], 5, barkShade(rng, BARK, BARK_DARK), 0.06);
    const tw = a + (s % 2 ? 0.7 : -0.7);
    tube(out, [mid, P(Math.cos(tw) * reach * 0.8, canopyY + 0.08, Math.sin(tw) * reach * 0.8)], [rb * 0.2, 0], 4, () => mix(BARK, BARK_DARK, 0.3));
  }
  // A broken stub where a low limb came off long ago.
  const sa = a0 + 2.6;
  const sy = canopyY * 0.42;
  tube(out, [P(Math.cos(sa) * rb * 0.5, sy, Math.sin(sa) * rb * 0.5), P(Math.cos(sa) * 0.17, sy + 0.07, Math.sin(sa) * 0.17), P(Math.cos(sa) * 0.18, sy + 0.08, Math.sin(sa) * 0.18)],
    [rb * 0.4, rb * 0.3, 0], 5, (i) => (i === 1 ? HEART : mix(BARK, BARK_DARK, 0.3)));
  return toGeo(out);
}

// A dead tree: grey weathered trunk forking into bare limbs and twigs, one
// limb snapped short.
export function deadTree() {
  const out = { pos: [], col: [] };
  const rng = makeRng(311);
  const R = (a, b) => a + rng() * (b - a);
  const shade = barkShade(rng, DEAD, DEAD_DARK, 1);
  const rb = 0.11;
  const forkY = 2.05;
  tube(out, [P(0, -0.1, 0), P(0, 0.12, 0), P(0.03, 1.1, 0.02), P(0.06, forkY, 0)], [rb * 1.6, rb * 1.1, rb * 0.85, rb * 0.62], 7, shade, 0.09);
  const twig = (from, a, up, L, r0) => {
    const end = P(from.x + Math.cos(a) * L, from.y + up, from.z + Math.sin(a) * L);
    tube(out, [from, end], [r0, 0], 3, () => mix(DEAD, DEAD_DARK, rng() * 0.4));
    return end;
  };
  // Three limbs up from the fork.
  for (let s = 0; s < 3; s++) {
    const a = s * 2.1 + R(-0.25, 0.25);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const reach = R(0.6, 0.85);
    const start = P(0.06, forkY - 0.05, 0);
    const mid = P(ca * reach * 0.45, forkY + R(0.45, 0.6), sa * reach * 0.45);
    const end = P(ca * reach, DEAD_H - R(0, 0.35), sa * reach);
    tube(out, [start, mid, end], [rb * 0.5, rb * 0.3, 0], 5, shade, 0.08);
    twig(mid, a + 0.9, 0.35, 0.3, rb * 0.13);
    twig(mid, a - 0.8, 0.45, 0.25, rb * 0.11);
    twig(P((mid.x + end.x) / 2, (mid.y + end.y) / 2, (mid.z + end.z) / 2), a + 0.5, 0.3, 0.22, rb * 0.09);
  }
  // Two lower limbs, out more than up; the second snapped off short.
  for (let s = 0; s < 2; s++) {
    const a = 1.0 + s * 2.6;
    const y = 1.25 + s * 0.3;
    const L = s ? 0.32 : 0.75;
    const start = P(Math.cos(a) * rb * 0.5, y, Math.sin(a) * rb * 0.5);
    const end = P(Math.cos(a) * L, y + L * 0.55, Math.sin(a) * L);
    if (s) {
      tube(out, [start, end, P(end.x * 1.02, end.y + 0.01, end.z * 1.02)], [rb * 0.38, rb * 0.3, 0], 5, (i) => (i === 1 ? HEART : shade(i, 0)));
    } else {
      tube(out, [start, end], [rb * 0.38, 0], 5, shade, 0.08);
      twig(P(start.x + (end.x - start.x) * 0.6, start.y + (end.y - start.y) * 0.6, start.z + (end.z - start.z) * 0.6), a - 0.7, 0.3, 0.28, rb * 0.1);
    }
  }
  return toGeo(out);
}

// A broken trunk: ragged top with pale wood showing, splinters, a stub limb.
export function snag() {
  const out = { pos: [], col: [] };
  const rng = makeRng(733);
  const R = (a, b) => a + rng() * (b - a);
  const sides = 9;
  const shade = barkShade(rng, SNAG, BARK_DARK, 1);
  const rings = tube(out, [P(0, -0.04, 0), P(0, 0.08, 0), P(0.01, 0.5, 0), P(0.015, 0.86, 0)], [0.2, 0.145, 0.125, 0.11], sides, shade, 0.08);
  // Ragged rim: each side snapped at its own height.
  const low = rings[rings.length - 1];
  const rim = low.map((p, k) => P(p.x * 0.95, 0.86 + (k % 3 === 0 ? R(0.1, 0.16) : R(0.0, 0.07)), p.z * 0.95));
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    const c = shade(3, k);
    tri(out, low[k], low[k1], rim[k], c);
    tri(out, low[k1], rim[k1], rim[k], c);
  }
  // Pale broken wood across the top, dipping in the middle.
  const mid = P(0.015, 0.88, 0);
  for (let k = 0; k < sides; k++) tri(out, mid, rim[(k + 1) % sides], rim[k], mix(HEART, SNAG, k % 2 ? 0.25 : 0));
  // Splinters standing up from the rim.
  for (const k of [0, 3, 6]) {
    const a = rim[k];
    const b = rim[(k + 1) % sides];
    const tip = P((a.x + b.x) / 2 * 0.8, a.y + R(0.12, 0.2), (a.z + b.z) / 2 * 0.8);
    tri(out, a, b, tip, HEART);
    tri(out, b, a, tip, mix(HEART, SNAG, 0.5));
  }
  // A stub of a limb on one side.
  tube(out, [P(0.08, 0.55, 0.02), P(0.24, 0.66, 0.05), P(0.25, 0.665, 0.05)], [0.045, 0.035, 0], 5, (i) => (i === 1 ? HEART : shade(0, 0)));
  return toGeo(out);
}

export function deadwood() {
  const a = deadTree();
  const b = snag();
  const n = a.attributes.position.count;
  const m = b.attributes.position.count;
  const g = new THREE.BufferGeometry();
  const cat = (k) => {
    const x = new Float32Array((n + m) * 3);
    x.set(a.attributes[k].array, 0);
    x.set(b.attributes[k].array, n * 3);
    return new THREE.BufferAttribute(x, 3);
  };
  g.setAttribute('position', cat('position'));
  g.setAttribute('color', cat('color'));
  g.setAttribute('normal', cat('normal'));
  const flag = new Float32Array(n + m);
  flag.fill(1, n);
  g.setAttribute('snag', new THREE.BufferAttribute(flag, 1));
  return g;
}

// Collapse the faces of the shape this instance is not (to one point, so
// they draw nothing); same in the shadow pass.
const PICK = `#include <begin_vertex>
#ifdef USE_INSTANCING_COLOR
  if (abs(snag - step(1.5, instanceColor.b)) > 0.5) transformed = vec3(0.0);
#endif`;
function pick(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float snag;')
    .replace('#include <begin_vertex>', PICK)
    .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vColor.b *= instanceColor.r / instanceColor.b;\n#endif');
}
export function deadwoodMaterials() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
  mat.onBeforeCompile = pick;
  mat.customProgramCacheKey = () => 'deadwood';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = pick;
  depth.customProgramCacheKey = () => 'deadwood-depth';
  return { mat, depth };
}
