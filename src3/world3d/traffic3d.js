// Traffic cars in 3D: five late-1980s types (sedan, estate, pickup, small
// hatch, farm truck), each one instanced mesh with its paint, glass, chrome
// and lamps in one geometry. The instance colour only tints the paint (a
// per-vertex paint mask), and a per-vertex roughness / metalness lets the
// glass and chrome shine under the sky reflection (opts.env). Cars far off
// share one plain low-poly stand-in. About six draw calls at most, fewer
// when a type is not near.
//
//   const traffic = createTraffic3D(group, { env })
//   traffic.update(amb.cars, focus, surfaceAt, near)   // near(x, y): within draw range

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';
import { SPECS, loftBody } from './carbody.js';

const MAX = 24; // per type
const FAR = 140; // m: past this, the stand-in
export const TRAFFIC_TYPES = ['sedan', 'wagon', 'pickup', 'hatch', 'farmtruck'];
// Types for the ten traffic cars (car0..car9), mixed so each shows up.
const TYPE_OF = ['sedan', 'wagon', 'pickup', 'hatch', 'sedan', 'farmtruck', 'wagon', 'hatch', 'pickup', 'sedan'];
export function trafficType(id) {
  const n = Number(String(id).replace(/\D/g, '')) || 0;
  return TYPE_OF[n % TYPE_OF.length];
}

// Material per vertex: [hex, paint mask, roughness, metalness].
const MAT = {
  paint: [0xdddddd, 1, 0.42, 0],
  glass: [0x121a20, 0, 0.06, 0.3],
  chrome: [0xd0d2d4, 0, 0.15, 1],
  black: [0x1a1b1c, 0, 0.6, 0],
  rubber: [0x161616, 0, 0.9, 0],
  hub: [0x9a9ea2, 0, 0.3, 0.8],
  head: [0xfff3d0, 0, 0.1, 0],
  tail: [0xa01810, 0, 0.15, 0],
  amber: [0xd88a20, 0, 0.15, 0],
  plate: [0xe4dfcc, 0, 0.5, 0],
  wood: [0x7a5a3a, 0, 0.85, 0],
  woodDark: [0x4a3624, 0, 0.9, 0],
  hay: [0xc9b26a, 0, 0.95, 0],
  liner: [0x0e0e0e, 0, 0.95, 0],
};

// Tag a geometry with colour, paint mask and roughness / metalness.
function tag(geo, m) {
  if (!geo.attributes.normal) geo.computeVertexNormals(); // smooth on an indexed loft
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const [hex, mask, rough, metal] = MAT[m];
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const pm = new Float32Array(n);
  const rm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b], i * 3);
    pm[i] = mask;
    rm.set([rough, metal], i * 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('paintMask', new THREE.BufferAttribute(pm, 1));
  g.setAttribute('carMat', new THREE.BufferAttribute(rm, 2));
  return g;
}
const box = (w, h, d, x, y, z, m) => tag(new THREE.BoxGeometry(w, h, d).translate(x, y, z), m);
const quadZ = (w, h, x, y, z, m) => tag(new THREE.PlaneGeometry(w, h).rotateY(z < 0 ? Math.PI : 0).translate(x, y, z), m);
function wheel(r, w, x, y, z, segs = 10) {
  return [
    tag(new THREE.CylinderGeometry(r, r, w, segs).rotateZ(Math.PI / 2).translate(x, y, z), 'rubber'),
    tag(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8).rotateZ(Math.PI / 2).translate(x, y, z), 'hub'),
  ];
}

function fromArrays(pos, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// A lofted car (carbody.js) with bumpers, lamps, plates, mirrors and wheels.
function loftCar(name) {
  const S = SPECS[name];
  const b = loftBody(S, { step: 0.26 });
  const parts = [tag(fromArrays(b.paint.pos, b.paint.idx), 'paint'), tag(fromArrays(b.glass.pos, b.glass.idx), 'glass')];
  const tri = [];
  const triM = new Map();
  for (const t of b.trim) {
    if (!triM.has(t.sw)) triM.set(t.sw, []);
    triM.get(t.sw).push(...t.tri);
  }
  for (const [sw, arr] of triM) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    tri.push(tag(g, sw === 'chrome' ? 'chrome' : 'black'));
  }
  parts.push(...tri);
  const h = S.half;
  const hw = S.hw;
  const bumper = name === 'pickup' || name === 'hatch' ? 'black' : 'chrome';
  for (const s of [-1, 1]) {
    parts.push(box(hw * 2 - 0.04, 0.16, 0.14, 0, S.y0 + 0.14, s * (h + 0.04), bumper));
    parts.push(quadZ(0.3, 0.15, 0, S.y0 + 0.14, s * (h + 0.112), 'plate'));
  }
  const ly = (S.belt(-h) + S.y0 + 0.2) / 2 + 0.02;
  const ty = (S.belt(h) + S.y0 + 0.2) / 2 + 0.06;
  for (const x of [-1, 1]) {
    parts.push(quadZ(0.34, 0.15, x * (hw - 0.3), ly, -h - 0.012, 'head'));
    parts.push(quadZ(0.4, 0.17, x * (hw - 0.32), ty, h + 0.012, 'tail'));
    parts.push(box(0.12, 0.09, 0.06, x * (hw + 0.07), S.belt(S.zA + 0.15) + 0.08, S.zA + 0.15, 'black'));
  }
  if (name !== 'pickup' && name !== 'hatch') parts.push(quadZ(0.56, 0.13, 0, ly, -h - 0.01, 'chrome'));
  else parts.push(quadZ(0.56, 0.13, 0, ly, -h - 0.01, 'black'));
  if (name === 'pickup') {
    // Open load bed: dark floor and painted top rails, a hay bale or two.
    const z0 = S.zC + 0.12;
    const z1 = h - 0.05;
    const top = S.belt(h) + 0.03;
    parts.push(tag(new THREE.PlaneGeometry(hw * 2 - 0.2, z1 - z0).rotateX(-Math.PI / 2).translate(0, top + 0.004, (z0 + z1) / 2), 'woodDark'));
    for (const x of [-1, 1]) parts.push(box(0.08, 0.05, z1 - z0, x * (hw - 0.07), top + 0.02, (z0 + z1) / 2, 'paint'));
    parts.push(box(hw * 2 - 0.1, 0.05, 0.08, 0, top + 0.02, z1, 'paint'));
    parts.push(box(0.55, 0.38, 0.45, 0.25, top + 0.19, z1 - 0.6, 'hay'));
  }
  const wr = S.wheelR;
  for (const [z] of S.wheels) for (const x of [-1, 1]) parts.push(...wheel(wr, 0.2, x * (hw - 0.1), wr, z));
  return mergeGeometries(parts);
}

// Old flatbed farm truck with stake sides.
function farmTruck() {
  const parts = [
    box(1.9, 0.2, 5.3, 0, 0.62, 0.1, 'black'), // chassis
    box(1.75, 0.62, 1.35, 0, 1.08, -1.95, 'paint'), // bonnet
    box(2.0, 0.2, 0.5, 0, 0.92, -1.6, 'paint'), // front wings
    box(2.0, 1.25, 1.45, 0, 1.38, -0.6, 'paint'), // cab
    box(1.86, 0.5, 0.04, 0, 1.72, -1.34, 'glass'), // windscreen
    box(2.02, 0.42, 0.9, 0, 1.72, -0.58, 'glass'), // side windows
    box(2.04, 0.06, 1.5, 0, 2.02, -0.6, 'paint'), // roof
    box(1.82, 0.1, 0.12, 0, 0.6, -2.68, 'chrome'), // bumper
    quadZ(0.95, 0.42, 0, 1.08, -2.63, 'chrome'), // grille
    box(2.15, 0.12, 3.2, 0, 0.82, 1.2, 'wood'), // flatbed
  ];
  for (const x of [-1, 1]) {
    parts.push(quadZ(0.2, 0.14, x * 0.68, 1.12, -2.635, 'head'));
    parts.push(quadZ(0.16, 0.12, x * 0.85, 0.95, 2.81, 'tail'));
    parts.push(box(0.12, 0.1, 0.06, x * 1.1, 1.75, -1.2, 'black'));
    // Stake sides: posts and three rails.
    for (const z of [-0.3, 0.6, 1.5, 2.4]) parts.push(box(0.08, 0.75, 0.08, x * 1.03, 1.25, z, 'woodDark'));
    for (const y of [1.05, 1.3, 1.55]) parts.push(box(0.04, 0.1, 3.0, x * 1.05, y, 1.05, 'wood'));
  }
  for (const y of [1.05, 1.3, 1.55]) parts.push(box(2.1, 0.1, 0.04, 0, y, 2.6, 'wood'));
  parts.push(box(0.6, 0.45, 0.9, 0.35, 1.12, 1.6, 'hay'), box(0.6, 0.45, 0.9, -0.35, 1.12, 1.1, 'hay'));
  parts.push(...wheel(0.45, 0.26, -0.86, 0.45, -1.95), ...wheel(0.45, 0.26, 0.86, 0.45, -1.95));
  for (const x of [-0.78, -1.02, 0.78, 1.02]) parts.push(...wheel(0.45, 0.22, x, 0.45, 1.55));
  return mergeGeometries(parts);
}

// Far stand-in: body, glass band and dark wheels in a few boxes.
function farGeo() {
  return mergeGeometries([
    box(1.75, 0.6, 4.5, 0, 0.62, 0, 'paint'),
    box(1.45, 0.42, 2.0, 0, 1.12, 0.25, 'glass'),
    box(1.35, 0.05, 1.6, 0, 1.35, 0.3, 'paint'),
    box(1.8, 0.5, 0.6, 0, 0.32, -1.38, 'rubber'),
    box(1.8, 0.5, 0.6, 0, 0.32, 1.3, 'rubber'),
  ]);
}

function makeMaterial(env) {
  const m = env
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 1.1 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = `attribute float paintMask;\nattribute vec2 carMat;\nvarying vec2 vCarMat;\n${sh.vertexShader
      .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, paintMask );')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCarMat = carMat;')}`;
    sh.fragmentShader = `varying vec2 vCarMat;\n${sh.fragmentShader
      .replace('float roughnessFactor = roughness;', 'float roughnessFactor = roughness * vCarMat.x;')
      .replace('float metalnessFactor = metalness;', 'float metalnessFactor = metalness * vCarMat.y;')}`;
  };
  m.customProgramCacheKey = () => `traffic${env ? 1 : 0}`;
  return m;
}

export function createTraffic3D(parent, opts = {}) {
  const mat = makeMaterial(opts.env || null);
  const make = (geo) => {
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    parent.add(mesh);
    return mesh;
  };
  const meshes = {
    sedan: make(loftCar('sedan')),
    wagon: make(loftCar('wagon')),
    pickup: make(loftCar('pickup')),
    hatch: make(loftCar('hatch')),
    farmtruck: make(farmTruck()),
  };
  const far = make(farGeo());
  far.castShadow = false;
  const all = [...Object.values(meshes), far];
  const counts = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  return {
    meshes,
    far,
    update(cars, focus, surfaceAt, near) {
      for (const mesh of all) counts.set(mesh, 0);
      for (const c of cars) {
        if (!near(c.x, c.y)) continue;
        const d = Math.hypot(c.x - focus.x, c.y - focus.z);
        const type = trafficType(c.id);
        const mesh = d > FAR ? far : meshes[type];
        const n = counts.get(mesh);
        if (n >= MAX) continue;
        const h = c.heading * DEG;
        const sx = Math.sin(h);
        const sy = -Math.cos(h);
        const hf = surfaceAt(c.x + sx * 1.4, c.y + sy * 1.4);
        const hb = surfaceAt(c.x - sx * 1.4, c.y - sy * 1.4);
        e.set(Math.atan2(hf - hb, 2.8), -h, 0);
        q.setFromEuler(e);
        p.set(c.x, (hf + hb) / 2, c.y);
        m.compose(p, q, one);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, col.setHex(c.color));
        counts.set(mesh, n + 1);
      }
      for (const mesh of all) {
        mesh.count = counts.get(mesh);
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
