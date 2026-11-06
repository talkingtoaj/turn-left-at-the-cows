// Draws the open-land scatter (src/world/scatter.js): rocks, shrubs and grass
// tussocks, by district. Same scheme as the trees (trees.js): every instance
// of a shape lives in one list sorted by 50 m ground cell, and when the camera
// moves the cells in view are copied into a few InstancedMeshes, so the whole
// scatter is about eight draw calls (plus two in the shadow pass).
//
// Level of detail by size: inside each cell the instances are sorted big to
// small, and a cell far from the camera only draws its bigger ones (a pebble
// goes at about 190 m, a shrub at about 250 m, a tussock at about 90 m; big
// rocks and the outcrops always show). Rocks in the sun's shadow box cast.
//
// Models: CC0 Quaternius rocks and shrubs, public/look/scatter.glb (made by
// tools/look/scatter.mjs); tussocks are made here. Without the file (node,
// tools/check-world.mjs) simple code shapes stand in, at the same sizes.

import * as THREE from 'three';
import { scatterFor } from '../../src/world/scatter.js';
import { districtsFor } from '../../src/world/districts.js';

const CELL = 50;
const VIEW_MARGIN = 10;
const SHADOW_MARGIN = 20;
const MOVE = 3;
const TURN = Math.cos((1.5 * Math.PI) / 180);
const FOCUS_MOVE = 4;

// Height in radii per shrub model (instance hs multiplies it).
const SHRUB_H = { gorse: 1.05, round: 0.95, bramble: 0.75 };
// Draw distance by size: an item of radius r shows within base + per * r metres.
const REACH = {
  rock: { base: 150, per: 160 }, // r 0.25: 190 m, r 1.25: 350 m, bigger: always
  shrub: { base: 190, per: 55 },
  tuft: { base: 60, per: 70 },
};

const ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scatter') !== 'off';
const MODELS = ON ? await loadModels() : null;

async function loadModels() {
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}look/scatter.glb`);
    const geo = {};
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.toNonIndexed();
      const c = g.attributes.color;
      const rgb = new Float32Array(c.count * 3);
      for (let i = 0; i < c.count; i++) {
        rgb[i * 3] = c.getX(i);
        rgb[i * 3 + 1] = c.getY(i);
        rgb[i * 3 + 2] = c.getZ(i);
      }
      g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
      g.computeVertexNormals();
      geo[o.name] = g;
    });
    console.info(`[scatter] models loaded: ${Object.keys(geo).join(', ')}`);
    return geo;
  } catch (e) {
    console.warn('[scatter] models failed to load, using simple shapes', e && e.message);
    return null;
  }
}

// Stand-in shapes (unit footprint radius, height 1, base at 0), vertex coloured.
function colored(g, hex, dark = 0.35) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const p = n.attributes.position;
  const base = new THREE.Color(hex);
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const s = 1 - dark * (1 - Math.min(1, p.getY(i) * 1.4));
    cols[i * 3] = base.r * s;
    cols[i * 3 + 1] = base.g * s;
    cols[i * 3 + 2] = base.b * s;
  }
  n.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  n.computeVertexNormals();
  return n;
}

function fallbackGeo() {
  const blob = (detail) => new THREE.IcosahedronGeometry(1, detail).scale(1, 0.5, 1).translate(0, 0.5, 0);
  return {
    boulder: colored(blob(0), 0xb4afa3),
    slab: colored(new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0), 0xaca89e),
    gorse: colored(blob(1), 0x4f6e2c, 0.4),
    round: colored(blob(1), 0x5a8c36, 0.4),
    bramble: colored(blob(1), 0x4f6a30, 0.4),
  };
}

const hash01 = (v) => {
  const x = Math.sin(v * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// A grass tussock: thin tapered blades leaning out from a tight base. Unit
// radius, height 1, vertex coloured (darker at the root).
function tuftGeo() {
  const pos = [];
  const col = [];
  const root = new THREE.Color(0x4e6a2c);
  const tip = new THREE.Color(0xb3b06a);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 3) * 0.4;
    const lean = 0.55 + (i % 4) * 0.15;
    const h = 0.75 + ((i * 7) % 5) * 0.06;
    const w = 0.09;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const px = -cz * w;
    const pz = cx * w;
    const bx = cx * 0.12;
    const bz = cz * 0.12;
    // Two triangles: a narrow quad at the root tapering to a tip.
    const tx = cx * lean;
    const tz = cz * lean;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    pos.push(bx + px, 0, bz + pz, bx - px, 0, bz - pz, tx * 0.6, h * 0.7, tz * 0.6);
    col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r * 0.9, tip.g * 0.9, tip.b * 0.9);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Normals mostly up, so blades light like the grass under them.
  const nr = g.attributes.normal;
  for (let i = 0; i < nr.count; i++) {
    const v = new THREE.Vector3(nr.getX(i) * 0.35, 1, nr.getZ(i) * 0.35).normalize();
    nr.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function buildScatter(world, scenery, terrain, sunDir, audit = null) {
  const S = scatterFor(world, scenery);
  const group = new THREE.Group();
  group.name = 'scatter';
  if (!S.rocks.length && !S.shrubs.length && !S.grass.length) return { object: group, update() {}, counts: {} };
  const D = districtsFor(world);
  const geo = { ...(MODELS || fallbackGeo()), tuft: tuftGeo() };
  // Rocks and shrubs have their own materials so the look (src3/look) can
  // give rocks a stone texture and both a wet look in the rain.
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const tuftMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

  const size = world.size;
  const ncx = Math.ceil(size.w / CELL) + 1;
  const ncz = Math.ceil(size.h / CELL) + 1;
  const nCells = ncx * ncz;
  const cellAt = (x, y) => Math.max(0, Math.min(ncz - 1, Math.floor(y / CELL))) * ncx + Math.max(0, Math.min(ncx - 1, Math.floor(x / CELL)));
  const lo = new Float32Array(nCells).fill(Infinity);
  const hi = new Float32Array(nCells).fill(-Infinity);

  // part -> [{ cell, size, m (Matrix4), c (Color) }]
  const parts = {};
  const push = (part, x, y, sz, m, c, top) => {
    const cell = cellAt(x, y);
    (parts[part] || (parts[part] = [])).push({ cell, size: sz, m, c });
    const base = m.elements[13];
    if (base < lo[cell]) lo[cell] = base;
    if (base + top > hi[cell]) hi[cell] = base + top;
  };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  for (const r of S.rocks) {
    const { min, max } = terrain.groundRange({ circle: { x: r.x, y: r.y, r: r.r * 0.6 } });
    // On a steep bit a rock stands a little taller, so it never looks buried uphill.
    const hgt = Math.max(r.r * r.hs, (max - min + 0.08) / 0.75);
    // Sunk a little, never so far that the top quarter is under the high side.
    const sink = Math.max(0.03, Math.min(0.2 * hgt, min + 0.75 * hgt - max - 0.02));
    const base = min - sink;
    const m = new THREE.Matrix4().compose(v.set(r.x, base, r.y), q.setFromAxisAngle(up, r.rot), sc.set(r.r, hgt, r.r));
    // Weathered grey (round 8: they read nearly white in bright sun), each
    // rock a little different: some warmer and tan, some greener with lichen.
    const hv = hash01(r.x * 7.13 + r.y * 3.71);
    const f = (r.outcrop ? 0.34 : 0.32) + 0.13 * r.tint;
    const tan = hv < 0.3 ? (0.3 - hv) / 0.3 : 0;
    const lichen = hv > 0.72 ? (hv - 0.72) / 0.28 : 0;
    const c = new THREE.Color(f * (1 + 0.1 * tan - 0.04 * lichen), f * (1 + 0.03 * tan + 0.04 * lichen), f * (1 - 0.1 * tan - 0.06 * lichen));
    push(r.model, r.x, r.y, r.outcrop ? 99 : r.r, m, c, hgt);
    if (audit) audit.circle(r.id, r.solid ? 'scatter_rock' : 'scatter_stone', r.x, r.y, r.r * 0.6, base, base + 0.75 * hgt);
  }
  for (const s of S.shrubs) {
    const { min, max } = terrain.groundRange({ circle: { x: s.x, y: s.y, r: s.r * 0.5 } });
    // On a steep bit the shrub grows a little taller, so the slope never swallows it.
    const hgt = Math.max(s.r * s.hs * SHRUB_H[s.model], (max - min + 0.06) / 0.6);
    const base = min - 0.1 * hgt;
    const m = new THREE.Matrix4().compose(v.set(s.x, base, s.y), q.setFromAxisAngle(up, s.rot), sc.set(s.r, hgt, s.r));
    const f = 0.84 + 0.3 * s.tint;
    push(s.model, s.x, s.y, s.r, m, new THREE.Color(f, f, f), hgt);
    if (audit) audit.circle(s.id, 'scatter_shrub', s.x, s.y, s.r * 0.5, base, base + 0.7 * hgt);
  }
  let gi = 0;
  for (const t of S.grass) {
    const hgt = t.r * t.hs * 1.3;
    const { min } = terrain.groundRange({ circle: { x: t.x, y: t.y, r: t.r * 0.3 } });
    const base = min - 0.05;
    const m = new THREE.Matrix4().compose(v.set(t.x, base, t.y), q.setFromAxisAngle(up, t.rot), sc.set(t.r, hgt, t.r));
    // Tussocks take a little of their district's grass: lusher in the bottoms, paler on the downs.
    const w = D.at(t.x, t.y).w;
    const f = 0.85 + 0.3 * t.tint;
    const c = new THREE.Color(f * (1 + 0.12 * w.bare - 0.1 * w.willow), f * (1 + 0.05 * w.willow), f * (1 - 0.1 * w.bare - 0.08 * w.willow));
    push('tuft', t.x, t.y, t.r, m, c, hgt);
    if (audit) audit.circle(`tuft${gi++}`, 'scatter_tuft', t.x, t.y, t.r * 0.3, base, base + 0.6 * hgt);
  }

  // Sets: instances sorted by cell, then big to small.
  const sets = [];
  for (const [part, list] of Object.entries(parts)) {
    list.sort((a, b) => a.cell - b.cell || b.size - a.size);
    const n = list.length;
    const mats = new Float32Array(n * 16);
    const cols = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const start = new Int32Array(nCells + 1);
    list.forEach((e, k) => {
      e.m.toArray(mats, k * 16);
      e.c.toArray(cols, k * 3);
      sizes[k] = e.size;
      start[e.cell + 1]++;
    });
    for (let c = 0; c < nCells; c++) start[c + 1] += start[c];
    const isRock = part === 'boulder' || part === 'slab';
    const kind = isRock ? 'rock' : part === 'tuft' ? 'tuft' : 'shrub';
    const mk = (cast) => {
      const mesh = new THREE.InstancedMesh(geo[part], part === 'tuft' ? tuftMat : isRock ? rockMat : solidMat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `scatter_${part}${cast ? '_cast' : ''}`;
      group.add(mesh);
      return mesh;
    };
    sets.push({ part, kind, mats, cols, sizes, start, near: mk(false), cast: isRock ? mk(true) : null });
  }

  // Append one cell's instances of size >= minSize (a prefix: sorted big first).
  const append = (set, mesh, cell, minSize) => {
    const a = set.start[cell];
    let b = set.start[cell + 1];
    if (a === b) return;
    if (minSize > 0) {
      let e = a;
      while (e < b && set.sizes[e] >= minSize) e++;
      b = e;
      if (a === b) return;
    }
    const k = mesh.count;
    mesh.instanceMatrix.array.set(set.mats.subarray(a * 16, b * 16), k * 16);
    mesh.instanceColor.array.set(set.cols.subarray(a * 3, b * 3), k * 3);
    mesh.count = k + (b - a);
  };
  const finish = (mesh) => {
    mesh.visible = mesh.count > 0;
    if (!mesh.visible) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
    mesh.instanceColor.needsUpdate = true;
  };

  const sl = Math.hypot(sunDir.x, sunDir.z) || 1;
  const sx = sunDir.x / sl;
  const sz = sunDir.z / sl;
  const stretch = 1 / Math.max(0.2, sunDir.y / sunDir.length());
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const camPos = new THREE.Vector3(Infinity, 0, 0);
  const camDir = new THREE.Vector3();
  const lastDir = new THREE.Vector3();
  const lastFocus = new THREE.Vector3(Infinity, 0, 0);
  let lastKey = '';
  const halfDiag = CELL * Math.SQRT1_2;

  function rebuild(camera, focus, shadowRadius) {
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    for (const s of sets) {
      s.near.count = 0;
      if (s.cast) s.cast.count = 0;
    }
    const px = camera.position.x;
    const pz = camera.position.z;
    const far = camera.far;
    const across = shadowRadius + SHADOW_MARGIN + halfDiag;
    const along = shadowRadius * stretch + SHADOW_MARGIN + halfDiag;
    const sreach = Math.hypot(across, along);
    const c0 = Math.max(0, Math.floor(Math.min(px - far, focus.x - sreach) / CELL) - 1);
    const c1 = Math.min(ncx - 1, Math.floor(Math.max(px + far, focus.x + sreach) / CELL) + 1);
    const r0 = Math.max(0, Math.floor(Math.min(pz - far, focus.z - sreach) / CELL) - 1);
    const r1 = Math.min(ncz - 1, Math.floor(Math.max(pz + far, focus.z + sreach) / CELL) + 1);
    for (let cz = r0; cz <= r1; cz++) {
      const z = (cz + 0.5) * CELL;
      for (let cx = c0; cx <= c1; cx++) {
        const cell = cz * ncx + cx;
        if (lo[cell] === Infinity) continue;
        const x = (cx + 0.5) * CELL;
        const fdx = x - focus.x;
        const fdz = z - focus.z;
        const inShadow = Math.abs(fdx * sx + fdz * sz) < along && Math.abs(-fdx * sz + fdz * sx) < across;
        const d = Math.max(0, Math.hypot(x - px, z - pz) - halfDiag);
        let inView = d < far;
        if (inView) {
          sphere.center.set(x, (lo[cell] + hi[cell]) / 2, z);
          sphere.radius = Math.hypot(halfDiag, (hi[cell] - lo[cell]) / 2) + VIEW_MARGIN;
          inView = frustum.intersectsSphere(sphere);
        }
        if (!inView && !inShadow) continue;
        for (const s of sets) {
          const R = REACH[s.kind];
          const minSize = (d - R.base) / R.per;
          if (s.cast && inShadow) append(s, s.cast, cell, minSize);
          else if (inView && minSize < 99) append(s, s.near, cell, minSize);
        }
      }
    }
    for (const s of sets) {
      finish(s.near);
      if (s.cast) finish(s.cast);
    }
  }

  const counts = { rocks: S.rocks.length, shrubs: S.shrubs.length, tufts: S.grass.length, outcrops: S.outcrops.length, ms: S.ms };
  console.info(`[scatter] ${counts.rocks} rocks (${S.solids.length} solid, ${counts.outcrops} outcrops), ${counts.shrubs} shrubs, ${counts.tufts} tussocks; placed in ${S.ms} ms`);
  return {
    object: group,
    counts,
    materials: { rock: rockMat, shrub: solidMat, tuft: tuftMat },
    update(camera, focus, shadowRadius) {
      camera.getWorldDirection(camDir);
      const key = `${camera.far},${camera.fov},${camera.aspect},${shadowRadius}`;
      const changed = camPos.distanceToSquared(camera.position) > MOVE * MOVE || camDir.dot(lastDir) < TURN
        || lastFocus.distanceToSquared(focus) > FOCUS_MOVE * FOCUS_MOVE || key !== lastKey;
      if (!changed) return;
      camPos.copy(camera.position);
      lastDir.copy(camDir);
      lastFocus.copy(focus);
      lastKey = key;
      rebuild(camera, focus, shadowRadius);
    },
  };
}
