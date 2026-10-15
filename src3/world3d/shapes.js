// Small low-poly geometry helpers. All shapes sit on y = 0 unless noted.

import * as THREE from 'three';

// Box with its base on y = 0. w along x, h up, d along z.
export function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
}

export function cyl(r, h, seg = 8, rTop = r) {
  return new THREE.CylinderGeometry(rTop, r, h, seg).translate(0, h / 2, 0);
}

export function cone(r, h, seg = 8) {
  return new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);
}

// Four-sided pyramid with a square base of side w.
export function pyramid(w, h) {
  return new THREE.ConeGeometry(w / Math.SQRT2, h, 4).rotateY(Math.PI / 4).translate(0, h / 2, 0);
}

// Gable roof prism: base w x d on y = 0, ridge at height h along the longer side.
export function gable(w, d, h) {
  const alongX = w >= d;
  const L = (alongX ? w : d) / 2;
  const S = (alongX ? d : w) / 2;
  // Build with the ridge along x, then rotate if needed.
  const p = [
    [-L, 0, -S], [L, 0, -S], [L, h, 0], [-L, h, 0], // north slope
    [-L, 0, S], [L, 0, S], [L, h, 0], [-L, h, 0], // south slope
  ];
  const v = [];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  // North slope (faces -z and up).
  tri(p[0], p[3], p[1]);
  tri(p[1], p[3], p[2]);
  // South slope.
  tri(p[4], p[5], p[7]);
  tri(p[5], p[6], p[7]);
  // Gable ends.
  tri([-L, 0, -S], [-L, 0, S], [-L, h, 0]);
  tri([L, 0, S], [L, 0, -S], [L, h, 0]);
  // Underside.
  tri([-L, 0, -S], [L, 0, -S], [L, 0, S]);
  tri([-L, 0, -S], [L, 0, S], [-L, 0, S]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  if (!alongX) g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// Thin cylinder from point a to point b (THREE.Vector3s).
export function strut(a, b, r, seg = 4) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// Flat quad on y = 0, w along x, d along z, facing up.
export function flat(w, d) {
  return new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
}

export function disc(r, seg = 16) {
  return new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
}

// Flat polygon from world [x, y] points, lying on y = 0 in three.js space.
export function flatPolygon(pts) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
