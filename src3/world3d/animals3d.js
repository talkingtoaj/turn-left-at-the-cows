// Horses, sheep and deer (#80), brought up to the cows (SPEC 9r): rounded
// bodies from low-poly ellipsoids, shaped legs with joints and hooves, heads
// with ears, eyes and muzzles, manes and tails, and a coat texture painted by
// the shader (coatMaterial). Every model faces -z with its feet on y = 0 and
// goes into the one instanced mesh per pose that ambient3d.js already keeps,
// so draw calls do not change.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from './shapes.js';
import { colored } from './ambient3d.js';

const W = 0xffffff; // coat: takes the instance colour
const V3 = (a) => new THREE.Vector3(...a);

// Low-poly ellipsoid with radii (rx, ry, rz) centred at `at`, pitched by `pitch`.
function blob(rx, ry, rz, at, w = 8, h = 6, pitch = 0) {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).rotateX(pitch).translate(...at);
}

// Tapered tube from a (radius ra) to b (radius rb). sx squashes it across its
// local x before it is turned: for a tube in the y-z plane that is its width.
function taper(a, b, ra, rb, seg = 6, sx = 1, open = false) {
  const A = V3(a);
  const dir = V3(b).sub(A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, open).scale(sx, 1, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return g.translate(A.x, A.y, A.z);
}

// A leg hanging from the hip at (x, hip, z), `len` to the ground, `r` thick
// at the top, swung by `ang` (rad, + = foot forward). Front legs are
// straight with a knee; back legs have a hock that sits behind the line.
function leg(x, z, hip, len, r, ang, back, coat, hoof) {
  const L = len;
  const joint = back ? [0, -0.5 * L, 0.11 * L] : [0, -0.5 * L, 0];
  const fet = [0, -0.88 * L, back ? 0.02 * L : -0.01 * L];
  const parts = [
    colored(blob(r * 1.25, 0.24 * L, r * (back ? 1.9 : 1.5), [0, -0.12 * L, back ? 0.03 * L : 0], 5, 4), coat), // thigh or forearm
    colored(taper([0, -0.2 * L, joint[2] * 0.5], joint, r * 0.95, r * 0.62, 5, 1, true), coat),
    colored(blob(r * 0.7, r * 0.75, r * 0.75, joint, 5, 3), coat), // knee or hock
    colored(taper(joint, fet, r * 0.55, r * 0.5, 5, 1, true), coat), // cannon
    colored(taper([0, -0.94 * L, fet[2] - 0.01 * L], fet, r * 0.56, r * 0.5, 5, 1, true), coat), // pastern
    colored(taper([0, -L, fet[2] - 0.02 * L], [0, -0.93 * L, fet[2] - 0.01 * L], r * 0.72, r * 0.55, 5, 1, true), hoof),
  ];
  return mergeGeometries(parts).rotateX(ang).translate(x, hip, z);
}

// Crest of a neck from a to b: the side facing up and back.
function crestOff(a, b, d) {
  const dir = V3(b).sub(V3(a)).normalize();
  return new THREE.Vector3(0, -dir.z, dir.y).normalize().multiplyScalar(d);
}
const add = (p, v) => [p[0] + v.x, p[1] + v.y, p[2] + v.z];

// Horse, facing -z. Coat parts are white so the instance colour sets the coat
// (brown, chestnut, grey); mane, tail, muzzle and hooves keep their own colour.
// legs: swing angles [front left, front right, back left, back right].
export function horseGeo(legs) {
  const D = 0x2a221c; // mane and tail
  const HOOF = 0x2a2522;
  const MUZ = 0x4a3c34;
  const neckA = [0, 1.3, -0.6];
  const neckB = [0, 1.93, -1.06];
  const parts = [
    colored(blob(0.3, 0.33, 0.62, [0, 1.12, 0]), W), // barrel
    colored(blob(0.27, 0.32, 0.3, [0, 1.15, -0.5], 7, 5), W), // chest
    colored(blob(0.18, 0.14, 0.28, [0, 1.38, -0.46], 6, 4), W), // withers
    colored(blob(0.3, 0.33, 0.36, [0, 1.2, 0.52], 7, 5), W), // rump
    colored(taper(neckA, neckB, 0.21, 0.13, 6, 0.62, true), W), // neck
    colored(taper(add(neckA, crestOff(neckA, neckB, 0.12)), add(neckB, crestOff(neckA, neckB, 0.1)), 0.05, 0.04, 4, 0.5, true), D), // mane
    colored(taper([0, 1.99, -1.09], [0, 1.53, -1.42], 0.12, 0.085, 6, 0.8), W), // head
    colored(blob(0.1, 0.13, 0.13, [0, 1.86, -1.16], 6, 4), W), // cheeks
    colored(blob(0.085, 0.09, 0.1, [0, 1.52, -1.43], 6, 4), MUZ), // muzzle
    colored(box(0.03, 0.04, 0.055).translate(-0.095, 1.87, -1.2), 0x15120f), // eyes
    colored(box(0.03, 0.04, 0.055).translate(0.095, 1.87, -1.2), 0x15120f),
    colored(taper([-0.055, 1.99, -1.07], [-0.08, 2.16, -1.04], 0.04, 0.006, 4, 0.7, true), W), // ears
    colored(taper([0.055, 1.99, -1.07], [0.08, 2.16, -1.04], 0.04, 0.006, 4, 0.7, true), W),
    colored(taper([0, 2.02, -1.1], [0, 1.9, -1.21], 0.045, 0.02, 4, 1, true), D), // forelock
    colored(blob(0.07, 0.08, 0.07, [0, 1.38, 0.86], 5, 3), D), // tail: dock
    colored(taper([0, 1.36, 0.9], [0, 0.78, 1.06], 0.055, 0.11, 6, 0.8), D), // tail
  ];
  const [fl, fr, bl, br] = legs;
  parts.push(leg(-0.16, -0.58, 1.06, 1.06, 0.1, fl, false, W, HOOF));
  parts.push(leg(0.16, -0.58, 1.06, 1.06, 0.1, fr, false, W, HOOF));
  parts.push(leg(-0.17, 0.6, 1.08, 1.08, 0.11, bl, true, W, HOOF));
  parts.push(leg(0.17, 0.6, 1.08, 1.08, 0.11, br, true, W, HOOF));
  return mergeGeometries(parts);
}

// Wool: an ellipsoid with lumps (the same lumps wherever two faces share a corner).
function wool(rx, ry, rz, at, detail = 1, lump = 0.08) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + lump * Math.sin(7.1 * x + 3.3 * y) * Math.sin(5.7 * y + 8.9 * z) * Math.sin(6.3 * z + 4.1 * x);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g.scale(rx, ry, rz).translate(...at);
}

// Sheep, facing -z: lumpy white fleece, dark face and legs, wool caps on the
// head and legs, ears out sideways.
export function sheepGeo() {
  const D = 0x2b2826;
  const parts = [
    colored(wool(0.4, 0.36, 0.56, [0, 0.72, 0.02], 2, 0.07), W), // fleece
    colored(wool(0.26, 0.27, 0.24, [0, 0.84, -0.42], 1, 0.08), W), // neck wool
    colored(wool(0.1, 0.13, 0.08, [0, 0.7, 0.58], 0, 0.05), W), // tail
    colored(blob(0.095, 0.11, 0.15, [0, 0.86, -0.66], 6, 4, -0.5), D), // head
    colored(blob(0.07, 0.07, 0.07, [0, 0.79, -0.78], 5, 3), D), // muzzle
    colored(box(0.05, 0.03, 0.02).translate(0, 0.79, -0.85), 0x5a4a48), // nose
    colored(wool(0.11, 0.07, 0.1, [0, 0.98, -0.6], 0, 0.05), W), // topknot
    colored(taper([-0.07, 0.93, -0.6], [-0.21, 0.89, -0.6], 0.035, 0.022, 4, 0.5, true), D), // ears
    colored(taper([0.07, 0.93, -0.6], [0.21, 0.89, -0.6], 0.035, 0.022, 4, 0.5, true), D),
    colored(box(0.025, 0.025, 0.03).translate(-0.085, 0.9, -0.7), 0xc9b27a), // eyes
    colored(box(0.025, 0.025, 0.03).translate(0.085, 0.9, -0.7), 0xc9b27a),
  ];
  for (const [x, z] of [[-0.17, -0.33], [0.17, -0.33], [-0.17, 0.36], [0.17, 0.36]]) {
    parts.push(colored(taper([x, 0, z], [x, 0.55, z], 0.035, 0.045, 4, 1, true), D));
    parts.push(colored(box(0.08, 0.05, 0.08).translate(x, 0, z), 0x1c1a18)); // hoof
    parts.push(colored(wool(0.09, 0.13, 0.1, [x, 0.48, z], 0, 0.05), W)); // wool on the upper leg
  }
  return mergeGeometries(parts);
}

// Deer, facing -z: tan coat, pale belly and throat, white rump, big ears.
// The tail hangs down, or is raised to show white (`flag`) when running.
export function deerGeo(legs, flag = false) {
  const C = 0xa87a4e;
  const PALE = 0xe8dcc4;
  const WH = 0xf4efe6;
  const HOOF = 0x2a2522;
  const neckA = [0, 0.96, -0.36];
  const neckB = [0, 1.33, -0.56];
  const parts = [
    colored(blob(0.17, 0.2, 0.4, [0, 0.88, 0]), C), // barrel
    colored(blob(0.16, 0.2, 0.19, [0, 0.9, -0.32], 7, 5), C), // chest
    colored(blob(0.17, 0.21, 0.21, [0, 0.94, 0.3], 7, 5), C), // rump
    colored(blob(0.13, 0.08, 0.3, [0, 0.74, 0], 8, 4), PALE), // belly
    colored(blob(0.12, 0.14, 0.07, [0, 0.95, 0.47], 6, 4), WH), // rump patch
    colored(taper(neckA, neckB, 0.1, 0.065, 6, 0.75, true), C), // neck
    colored(blob(0.05, 0.05, 0.035, [0, 1.15, -0.55], 5, 3), WH), // throat patch
    colored(taper([0, 1.39, -0.55], [0, 1.25, -0.82], 0.075, 0.034, 6, 0.85), C), // head
    colored(blob(0.068, 0.07, 0.08, [0, 1.34, -0.6], 6, 4), C), // cheeks
    colored(blob(0.032, 0.03, 0.03, [0, 1.245, -0.83], 4, 3), 0x15120f), // nose
    colored(blob(0.04, 0.025, 0.06, [0, 1.22, -0.76], 5, 3), WH), // chin
    colored(box(0.025, 0.035, 0.045).translate(-0.06, 1.35, -0.66), 0x15120f), // eyes
    colored(box(0.025, 0.035, 0.045).translate(0.06, 1.35, -0.66), 0x15120f),
    colored(blob(0.025, 0.1, 0.055, [0, 0, 0], 5, 3).rotateZ(0.75).translate(-0.12, 1.46, -0.54), C), // ears
    colored(blob(0.025, 0.1, 0.055, [0, 0, 0], 5, 3).rotateZ(-0.75).translate(0.12, 1.46, -0.54), C),
    colored(blob(0.012, 0.07, 0.04, [0, 0, 0], 5, 3).rotateZ(0.75).translate(-0.118, 1.46, -0.575), PALE), // inner ears
    colored(blob(0.012, 0.07, 0.04, [0, 0, 0], 5, 3).rotateZ(-0.75).translate(0.118, 1.46, -0.575), PALE),
  ];
  if (flag) parts.push(colored(blob(0.06, 0.11, 0.035, [0, 0.08, 0], 5, 3).rotateX(0.6).translate(0, 1.02, 0.5), WH));
  else {
    parts.push(colored(blob(0.05, 0.1, 0.03, [0, -0.08, 0], 5, 3).rotateX(0.15).translate(0, 1.04, 0.5), C));
  }
  const [fl, fr, bl, br] = legs;
  parts.push(leg(-0.09, -0.34, 0.82, 0.82, 0.055, fl, false, C, HOOF));
  parts.push(leg(0.09, -0.34, 0.82, 0.82, 0.055, fr, false, C, HOOF));
  parts.push(leg(-0.095, 0.36, 0.84, 0.84, 0.062, bl, true, C, HOOF));
  parts.push(leg(0.095, 0.36, 0.84, 0.84, 0.062, br, true, C, HOOF));
  return mergeGeometries(parts);
}

// Coat material: flat-shaded vertex colours plus a coat texture from noise on
// the model's own position (so it sticks to the animal as it moves). freq:
// grain per metre; amp: how strong; coatOnly: the instance colour tints only
// pure white (coat) parts, so manes, muzzles and hooves keep their colour.
// Coat parts also darken a little toward the hooves.
export function coatMaterial({ freq, amp, coatOnly = false }) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vFurP;
varying float vFurCoat;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
vFurCoat = color.r + color.g + color.b > 2.99 ? 1.0 : 0.0;
${coatOnly ? '#ifdef USE_INSTANCING_COLOR\nif (vFurCoat < 0.5) vColor.xyz = color.xyz;\n#endif' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFurP = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFurP;
varying float vFurCoat;
float furH(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float furN(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(furH(i), furH(i + vec3(1, 0, 0)), f.x), mix(furH(i + vec3(0, 1, 0)), furH(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(furH(i + vec3(0, 0, 1)), furH(i + vec3(1, 0, 1)), f.x), mix(furH(i + vec3(0, 1, 1)), furH(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float furK = 0.65 * furN(vFurP * ${freq.toFixed(2)}) + 0.35 * furN(vFurP * ${(freq * 2.9).toFixed(2)});
diffuseColor.rgb *= 1.0 + ${amp.toFixed(3)} * (2.0 * furK - 1.0);
diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * smoothstep(0.15, 0.75, vFurP.y), vFurCoat);`);
  };
  mat.customProgramCacheKey = () => `coat-${freq}-${amp}-${coatOnly}`;
  return mat;
}
