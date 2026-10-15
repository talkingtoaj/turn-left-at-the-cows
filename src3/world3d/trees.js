// Trees and bushes from generateScenery, as InstancedMeshes split into tiles
// so far tiles get culled.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashString } from '../../src/drive/geom.js';
import { cyl, cone } from './shapes.js';

const TILE = 500;

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
  return { trunk, pine, oakA, oakB, willow, bush };
}

const BASE = { pine: 0x2f5a33, oak: 0x41733a, willow: 0x7f9e48 };

export function buildTrees(scenery, terrain) {
  const parts = makeParts();
  const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4030, flatShading: true });
  const group = new THREE.Group();

  // tiles: key -> { kind -> [matrices, colors] }
  const tiles = new Map();
  const push = (x, y, part, matrix, color) => {
    const key = `${Math.floor(x / TILE)}:${Math.floor(y / TILE)}`;
    if (!tiles.has(key)) tiles.set(key, {});
    const t = tiles.get(key);
    if (!t[part]) t[part] = [];
    t[part].push([matrix, color]);
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
    // Canopy sits on top of the trunk.
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, h + trunkH * 0.6, t.y), q, s);
    push(t.x, t.y, part, m, col.clone());
    const tm = new THREE.Matrix4().compose(new THREE.Vector3(t.x, h - 0.3, t.y), q, new THREE.Vector3(r * 1.6, trunkH + 0.3 + r * 0.6, r * 1.6));
    push(t.x, t.y, 'trunk', tm, null);
  }
  for (const b of scenery.bushes) {
    const h = terrain.heightAt(b.x, b.y);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, h + b.r * 0.2, b.y), q.setFromAxisAngle(up, b.tint * 6), new THREE.Vector3(b.r, b.r, b.r));
    push(b.x, b.y, 'bush', m, new THREE.Color(0x3f6b34).multiplyScalar(0.85 + b.tint * 0.3));
  }

  for (const t of tiles.values()) {
    for (const [part, list] of Object.entries(t)) {
      const mesh = new THREE.InstancedMesh(parts[part], part === 'trunk' ? trunkMat : leafMat, list.length);
      list.forEach(([m, c], i) => {
        mesh.setMatrixAt(i, m);
        if (c) mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = part !== 'bush';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  return group;
}
