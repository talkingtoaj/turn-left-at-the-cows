// Trees and bushes from generateScenery. All instances of a shape live in one
// sorted list, grouped by 50 m ground cells. When the camera or the shadow box
// moves, the cells in view are copied into a few dynamic InstancedMeshes:
//   cast: cells inside the sun's shadow box (drawn and cast shadows)
//   near: other cells in view (drawn, no shadow)
//   far:  cells in view past LOD_FAR (simpler shapes, no shadow)
// So the shadow pass only sees trees near the car, and the main pass only
// trees in front of the camera, in about a dozen draw calls.
//
// ?trees=new swaps the code-made shapes for CC0 Quaternius models
// (public/look/trees.glb, made by tools/look/trees.mjs): one mesh per kind
// with its own trunk (so no trunk instances), and a simpler far version.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashString } from '../../src/drive/geom.js';
import { cyl, cone } from './shapes.js';

const CELL = 50; // metres per culling cell
const LOD_FAR = 230; // beyond this (from the camera), simpler shapes
const BUSH_FAR = 300; // bushes past this are a few pixels in the fog: skipped
const VIEW_MARGIN = 22; // metres added around cells for the view test
const SHADOW_MARGIN = 24; // trees just outside the shadow box still cast into it
const MOVE = 3; // rebuild when the camera moves this far (m)
const TURN = Math.cos((1.5 * Math.PI) / 180); // or turns this much
const FOCUS_MOVE = 4; // or the shadow box moves this far (m)

function flatGeo(geos) {
  const prepped = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    n.computeVertexNormals();
    return n;
  });
  return prepped.length > 1 ? mergeGeometries(prepped) : prepped[0];
}

// Unit-sized parts; instances scale them by tree radius.
function makeParts() {
  const trunk = flatGeo([cyl(0.12, 1, 5, 0.08)]);
  // Pine: three stacked cones, height ~4 for r = 1.
  const pine = flatGeo([
    cone(1.0, 2.0, 7).translate(0, 0.7, 0),
    cone(0.8, 1.7, 7).translate(0, 1.6, 0),
    cone(0.55, 1.5, 7).translate(0, 2.5, 0),
  ]);
  // Oak A: one lumpy blob. Oak B: three blobs.
  const oakA = flatGeo([new THREE.IcosahedronGeometry(1, 1).scale(1, 0.85, 1).translate(0, 1.5, 0)]);
  const oakB = flatGeo([
    new THREE.IcosahedronGeometry(0.75, 0).translate(-0.35, 1.3, 0.1),
    new THREE.IcosahedronGeometry(0.7, 0).translate(0.4, 1.4, -0.15),
    new THREE.IcosahedronGeometry(0.65, 0).translate(0, 1.9, 0.1),
  ]);
  // Willow: wide drooping dome.
  const willow = flatGeo([
    new THREE.IcosahedronGeometry(1, 1).scale(1.05, 0.75, 1.05).translate(0, 1.3, 0),
    new THREE.CylinderGeometry(1.05, 1.15, 0.9, 9, 1, true).translate(0, 0.75, 0),
  ]);
  const bush = flatGeo([new THREE.IcosahedronGeometry(1, 0).scale(1, 0.7, 1)]);
  // Far versions (same size, fewer faces), only seen deep in the haze.
  const oakAFar = flatGeo([new THREE.IcosahedronGeometry(1, 0).scale(1.05, 0.9, 1.05).translate(0, 1.5, 0)]);
  const willowFar = flatGeo([
    new THREE.IcosahedronGeometry(1, 0).scale(1.1, 0.8, 1.1).translate(0, 1.3, 0),
    new THREE.CylinderGeometry(1.05, 1.15, 0.9, 6, 1, true).translate(0, 0.75, 0),
  ]);
  return { trunk, pine, oakA, oakB, willow, bush, far: { oakA: oakAFar, willow: willowFar } };
}

const BASE = { pine: 0x2f5a33, oak: 0x41733a, willow: 0x7f9e48 };

// ?trees=new: load the models before the world is built (top-level await, so
// buildTrees stays synchronous). Not in node (tools/check-world.mjs).
const TREES_NEW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('trees') === 'new';
const MODELS = TREES_NEW ? await loadModels() : null;

async function loadModels() {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}look/trees.glb`);
  const geo = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.toNonIndexed();
    // Colours as plain rgb floats (the file has rgba bytes).
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
  const { pine, oakA, oakB, willow, bush } = geo;
  console.info(`[trees] models loaded: ${Object.keys(geo).join(', ')}`);
  return { pine, oakA, oakB, willow, bush, far: { pine: geo.pineFar, oakA: geo.oakAFar, oakB: geo.oakBFar, willow: geo.willowFar } };
}

// One shape's instances, sorted by cell, plus its output meshes.
function makeSet(geo, farGeo, mat, list, cellOf, nCells, casts) {
  const n = list.length;
  const order = list.map((_, i) => i).sort((a, b) => cellOf[a] - cellOf[b]);
  const mats = new Float32Array(n * 16);
  const hasColor = list.some((e) => e[1]);
  const cols = hasColor ? new Float32Array(n * 3) : null;
  const start = new Int32Array(nCells + 1);
  order.forEach((src, k) => {
    const [m, c] = list[src];
    m.toArray(mats, k * 16);
    if (cols && c) c.toArray(cols, k * 3);
    start[cellOf[src] + 1]++;
  });
  for (let c = 0; c < nCells; c++) start[c + 1] += start[c];

  const out = (g, cast) => {
    const mesh = new THREE.InstancedMesh(g, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (cols) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false; // culled per cell below
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  };
  const set = {
    mats,
    cols,
    start,
    cast: casts ? out(geo, true) : null,
    near: out(geo, false),
    far: farGeo ? out(farGeo, false) : null,
  };
  if (!set.far) set.far = set.near;
  set.meshes = [...new Set([set.cast, set.near, set.far].filter(Boolean))];
  return set;
}

// Append one cell's instances to a mesh (counts are reset per rebuild).
function appendCell(set, mesh, cell) {
  const a = set.start[cell];
  const b = set.start[cell + 1];
  if (a === b) return;
  const k = mesh.count;
  mesh.instanceMatrix.array.set(set.mats.subarray(a * 16, b * 16), k * 16);
  if (set.cols) mesh.instanceColor.array.set(set.cols.subarray(a * 3, b * 3), k * 3);
  mesh.count = k + (b - a);
}

function finish(mesh) {
  mesh.visible = mesh.count > 0;
  if (!mesh.visible) return;
  const im = mesh.instanceMatrix;
  im.clearUpdateRanges();
  im.addUpdateRange(0, mesh.count * 16);
  im.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}

export function buildTrees(scenery, terrain, sunDir, audit = null) {
  const parts = MODELS || makeParts();
  const leafMat = MODELS
    ? new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true })
    : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4030, flatShading: true });
  const group = new THREE.Group();

  const size = terrain.world.size;
  const ncx = Math.ceil(size.w / CELL) + 1;
  const ncz = Math.ceil(size.h / CELL) + 1;
  const nCells = ncx * ncz;
  const cellAt = (x, y) => {
    const cx = Math.max(0, Math.min(ncx - 1, Math.floor(x / CELL)));
    const cz = Math.max(0, Math.min(ncz - 1, Math.floor(y / CELL)));
    return cz * ncx + cx;
  };
  // Height range of what stands in each cell, for the view test.
  const lo = new Float32Array(nCells).fill(Infinity);
  const hi = new Float32Array(nCells).fill(-Infinity);

  // part -> { list: [[matrix, color]], cells: [cell index] }
  const byPart = {};
  const push = (x, y, part, matrix, color, top) => {
    const c = cellAt(x, y);
    if (!byPart[part]) byPart[part] = { list: [], cells: [] };
    byPart[part].list.push([matrix, color]);
    byPart[part].cells.push(c);
    const base = matrix.elements[13] - 1;
    if (base < lo[c]) lo[c] = base;
    if (base + top > hi[c]) hi[c] = base + top;
  };

  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (const t of scenery.trees) {
    const h = terrain.heightAt(t.x, t.y);
    const r = t.r;
    q.setFromAxisAngle(up, t.tint * Math.PI * 2);
    const f = 0.82 + t.tint * 0.36;
    col.setHex(BASE[t.kind] || BASE.oak).multiplyScalar(f);
    let trunkH;
    let part;
    let s;
    if (t.kind === 'pine') {
      trunkH = r * 0.7;
      part = 'pine';
      s = new THREE.Vector3(r, r * 1.05, r);
    } else if (t.kind === 'willow') {
      trunkH = r * 0.9;
      part = 'willow';
      s = new THREE.Vector3(r, r * 0.95, r);
    } else {
      trunkH = r * 1.0;
      part = hashString(`${t.x | 0},${t.y | 0}`) % 2 ? 'oakA' : 'oakB';
      s = new THREE.Vector3(r, r * 0.95, r);
    }
    if (MODELS) {
      // Whole tree from the ground, a little sunk for slopes; the model has
      // the kind's colours, the instance only brightens or darkens it.
      const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, h - 0.15 * r, t.y), q, new THREE.Vector3(r, r, r));
      push(t.x, t.y, part, m, new THREE.Color(f, f, f), r * 4.5);
      if (audit) audit.circle(`tree@${Math.round(t.x)},${Math.round(t.y)}`, 'tree', t.x, t.y, 0.1 * r * 1.6, h - 0.3);
      continue;
    }
    // Canopy sits on top of the trunk.
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, h + trunkH * 0.6, t.y), q, s);
    push(t.x, t.y, part, m, col.clone(), r * 4.5);
    const tm = new THREE.Matrix4().compose(new THREE.Vector3(t.x, h - 0.3, t.y), q, new THREE.Vector3(r * 1.6, trunkH + 0.3 + r * 0.6, r * 1.6));
    push(t.x, t.y, 'trunk', tm, null, trunkH + r);
    if (audit) audit.circle(`tree@${Math.round(t.x)},${Math.round(t.y)}`, 'tree', t.x, t.y, 0.1 * r * 1.6, h - 0.3);
  }
  for (const b of scenery.bushes) {
    const h = terrain.heightAt(b.x, b.y);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, h + b.r * (MODELS ? -0.1 : 0.2), b.y), q.setFromAxisAngle(up, b.tint * 6), new THREE.Vector3(b.r, b.r, b.r));
    const bc = MODELS ? new THREE.Color(1, 1, 1) : new THREE.Color(0x3f6b34);
    push(b.x, b.y, 'bush', m, bc.multiplyScalar(0.85 + b.tint * 0.3), b.r * 1.5);
    if (audit) audit.circle(`bush@${Math.round(b.x)},${Math.round(b.y)}`, 'bush', b.x, b.y, b.r * 0.6, h + b.r * 0.2 - b.r * 0.7 * 0.9);
  }

  const setList = [];
  for (const [part, { list, cells }] of Object.entries(byPart)) {
    const mat = part === 'trunk' ? trunkMat : leafMat;
    // Bushes never cast shadows (as before).
    const set = makeSet(parts[part], parts.far[part], mat, list, cells, nCells, part !== 'bush');
    for (const m of set.meshes) group.add(m);
    setList.push({ part, set });
  }

  // Sun direction on the ground, for the shadow box footprint.
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
  let lastFar = 0;
  let lastFov = 0;
  let lastAspect = 0;
  let lastRadius = 0;
  const halfDiag = CELL * Math.SQRT1_2;

  function rebuild(camera, focus, shadowRadius) {
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    for (const { set } of setList) for (const m of set.meshes) m.count = 0;

    const px = camera.position.x;
    const pz = camera.position.z;
    const far = camera.far;
    // The shadow box seen from the sun covers +-r across the sun's bearing and
    // +-r / sin(elevation) along it on flat ground.
    const across = shadowRadius + SHADOW_MARGIN + halfDiag;
    const along = shadowRadius * stretch + SHADOW_MARGIN + halfDiag;
    const sreach = Math.hypot(across, along);
    const xMin = Math.min(px - far, focus.x - sreach);
    const xMax = Math.max(px + far, focus.x + sreach);
    const zMin = Math.min(pz - far, focus.z - sreach);
    const zMax = Math.max(pz + far, focus.z + sreach);
    const c0 = Math.max(0, Math.floor(xMin / CELL) - 1);
    const c1 = Math.min(ncx - 1, Math.floor(xMax / CELL) + 1);
    const r0 = Math.max(0, Math.floor(zMin / CELL) - 1);
    const r1 = Math.min(ncz - 1, Math.floor(zMax / CELL) + 1);
    for (let cz = r0; cz <= r1; cz++) {
      const z = (cz + 0.5) * CELL;
      for (let cx = c0; cx <= c1; cx++) {
        const cell = cz * ncx + cx;
        if (lo[cell] === Infinity) continue;
        const x = (cx + 0.5) * CELL;
        const fdx = x - focus.x;
        const fdz = z - focus.z;
        const inShadow = Math.abs(fdx * sx + fdz * sz) < along && Math.abs(-fdx * sz + fdz * sx) < across;
        const d = Math.hypot(x - px, z - pz);
        let inView = d - halfDiag < far;
        if (inView) {
          sphere.center.set(x, (lo[cell] + hi[cell]) / 2, z);
          sphere.radius = Math.hypot(halfDiag, (hi[cell] - lo[cell]) / 2) + VIEW_MARGIN;
          inView = frustum.intersectsSphere(sphere);
        }
        if (!inShadow && !inView) continue;
        const isFar = d > LOD_FAR;
        for (const { part, set } of setList) {
          if (part === 'bush') {
            if (inView && d < BUSH_FAR) appendCell(set, set.near, cell);
          } else if (inShadow) appendCell(set, set.cast, cell);
          else appendCell(set, isFar ? set.far : set.near, cell);
        }
      }
    }
    for (const { set } of setList) for (const m of set.meshes) finish(m);
  }

  return {
    object: group,
    // Per frame, after the camera is placed. Rebuilds the drawn sets only when
    // the camera or the shadow box has moved or turned enough.
    update(camera, focus, shadowRadius) {
      camera.getWorldDirection(camDir);
      const changed = camPos.distanceToSquared(camera.position) > MOVE * MOVE
        || camDir.dot(lastDir) < TURN
        || lastFocus.distanceToSquared(focus) > FOCUS_MOVE * FOCUS_MOVE
        || camera.far !== lastFar || camera.fov !== lastFov || camera.aspect !== lastAspect
        || shadowRadius !== lastRadius;
      if (!changed) return;
      camPos.copy(camera.position);
      lastDir.copy(camDir);
      lastFocus.copy(focus);
      lastFar = camera.far;
      lastFov = camera.fov;
      lastAspect = camera.aspect;
      lastRadius = shadowRadius;
      rebuild(camera, focus, shadowRadius);
    },
  };
}
