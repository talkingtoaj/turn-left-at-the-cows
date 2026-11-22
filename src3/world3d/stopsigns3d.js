// STOP signs at every junction where a dirt road meets a paved one (SPEC 9q).
// Placement comes from the traffic logic (amb.stopSigns, src/ambient/ambient.js)
// so a sign always stands where traffic stops. A red octagon with a white rim
// and the painted word, about 0.76 m across (a 30 inch sign) on a 2.4 m steel
// post, so the word reads from about 15 m. Rural signs lean a little.
// Not a map trap tell.
//
// Two draw calls: the faces (one instanced quad, one small canvas texture)
// and the posts with the grey board backs (one instanced mesh).
//
//   createStopSigns3D(parent, amb.stopSigns, terrain)

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';

const ACROSS = 0.76; // m across the flats
const R = ACROSS / 2 / Math.cos(Math.PI / 8); // octagon corner radius
const MID = 2.15; // m from the ground to the board's middle
const POST_W = 0.06;

function faceTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const oct = (r) => {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      g[i ? 'lineTo' : 'moveTo'](N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r);
    }
    g.closePath();
  };
  const r = N / 2;
  g.fillStyle = '#eeeae2';
  oct(r);
  g.fill();
  g.fillStyle = '#b0161c';
  oct(r * 0.9);
  g.fill();
  g.fillStyle = '#f4f1ea';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(N * 0.3)}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
  // Narrow the letters a touch, like the highway sign font.
  g.save();
  g.translate(N / 2, N / 2 + N * 0.01);
  g.scale(0.86, 1);
  g.fillText('STOP', 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Road signs are reflective: a share of the face shows even in its own
// shadow, so the red and the word read against the sun.
function faceMaterial() {
  const map = faceTexture();
  return new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.4 });
}

// Octagon in the XY plane facing +z, flats top and bottom, UVs over its box.
function octagon(z, back) {
  const g = new THREE.CircleGeometry(R, 8, Math.PI / 8);
  if (back) g.rotateY(Math.PI);
  g.translate(0, MID, z);
  return g;
}

function postGeometry() {
  const parts = [
    new THREE.BoxGeometry(POST_W, MID + 0.3 + 0.1, POST_W).translate(0, (MID + 0.1 - 0.3) / 2, -0.04),
    octagon(-0.012, true),
    // The board's thin edge, so it does not vanish side-on.
    new THREE.CylinderGeometry(R, R, 0.01, 8, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).translate(0, MID, -0.006),
  ].map((g) => {
    const n = g.toNonIndexed();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(parts);
}

export function createStopSigns3D(parent, signs, terrain) {
  const list = signs || [];
  const group = new THREE.Group();
  group.name = 'stopSigns';
  parent.add(group);
  if (!list.length || typeof document === 'undefined') return group;
  const faces = new THREE.InstancedMesh(octagon(0, false), faceMaterial(), list.length);
  const posts = new THREE.InstancedMesh(postGeometry(), new THREE.MeshLambertMaterial({ color: 0x8d9296 }), list.length);
  posts.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  list.forEach((s, i) => {
    // Local -z is the way the stopping traffic drives, so the face (+z)
    // looks back at it. Lean: forward / back (x), out to its right (z).
    e.set((s.leanY || 0) * DEG, -s.heading * DEG, -(s.leanX || 0) * DEG);
    q.setFromEuler(e);
    p.set(s.x, terrain.heightAt(s.x, s.y), s.y);
    m.compose(p, q, one);
    faces.setMatrixAt(i, m);
    posts.setMatrixAt(i, m);
  });
  faces.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  // The faces are quads near the post: let three cull the whole set by its bounds.
  faces.computeBoundingSphere();
  posts.computeBoundingSphere();
  group.add(faces, posts);
  return group;
}
