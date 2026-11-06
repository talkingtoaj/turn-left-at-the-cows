// Collects many small static pieces and merges them into a few meshes, one per
// map chunk and kind, with colours baked into vertex colours. Fewer draw calls,
// and chunks still get frustum and far-plane culled.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';

const BATCH_CHUNK = 300;

// Non-indexed, flat normals, no uv: every piece has the same attributes.
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals(); // non-indexed, so normals come out flat
  return g;
}

export class Batcher {
  constructor() {
    this.buckets = new Map(); // key -> { geos: [], cast, material }
    this.m = new THREE.Matrix4();
    this.tmpColor = new THREE.Color();
    this.audit = null; // an Audit (audit.js) records placements for the world checker
  }

  // Add a geometry with a world matrix, a colour, and options. Returns the
  // placed (world space) geometry.
  // opts: { cast: true, receive: true, material: 'lambert' | 'basic' | custom material,
  //         keepColors: true to keep the geometry's own vertex colours,
  //         share: true to join an existing bucket (see below) }
  add(geo, matrix, color, opts = {}) {
    const keep = opts.keepColors && geo.attributes.color;
    const g = prep(geo);
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    if (!keep) {
      const col = new Float32Array(n * 3);
      const c = this.tmpColor.set(color);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    // Bucket by the chunk of the piece's first vertex.
    const p = g.attributes.position;
    const cx = Math.floor(p.getX(0) / BATCH_CHUNK);
    const cz = Math.floor(p.getZ(0) / BATCH_CHUNK);
    const cast = opts.cast !== false;
    const mat = opts.material || 'lambert';
    const mk = typeof mat === 'string' ? mat : mat.uuid;
    let key = `${cx}:${cz}:${cast}:${mk}`;
    // opts.share: small scattered pieces (stones) join a bucket this chunk
    // already has, or else a coarse 1.2 km one, so they never add a draw
    // call of their own to every chunk they are in.
    if (opts.share && !this.buckets.has(key)) {
      const other = `${cx}:${cz}:${!cast}:${mk}`;
      key = this.buckets.has(other) ? other : `big:${Math.floor(p.getX(0) / 1200)}:${Math.floor(p.getZ(0) / 1200)}:${cast}:${mk}`;
    }
    let b = this.buckets.get(key);
    if (!b) {
      b = { geos: [], cast, receive: opts.receive !== false, mat };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
    return g;
  }

  // Place a geometry at world (x, y) with ground height `base`, rotated by a
  // heading-style angle (deg), then offset in the local frame (lx right, ly back, up).
  place(geo, x, y, base, angle, lx, ly, up, color, opts) {
    return this.add(geo, objMatrix(x, y, base, angle, lx, ly, up, opts && opts.extra), color, opts);
  }

  build(materials) {
    const group = new THREE.Group();
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      merged.computeBoundingSphere();
      const mat = typeof b.mat === 'string' ? materials[b.mat] : b.mat;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _o = new THREE.Matrix4();

// World matrix for a part: object at (x, y) on the ground at height `base`,
// rotated by `angle` (deg, clockwise from north like the 2D data), then the
// part offset (lx, ly) in the object's local frame and `up` metres high.
// `extra` is an optional Matrix4 applied to the part first (own rotation etc).
export function objMatrix(x, y, base, angle, lx = 0, ly = 0, up = 0, extra = null) {
  _t.makeTranslation(x, base, y);
  _r.makeRotationY(-(angle || 0) * DEG);
  _o.makeTranslation(lx, up, ly);
  const m = new THREE.Matrix4().multiplyMatrices(_t, _r).multiply(_o);
  if (extra) m.multiply(extra);
  return m;
}
