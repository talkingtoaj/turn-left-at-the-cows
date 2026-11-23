// The farm dog (#68): Okafor's collie, for the herd meshes in ambient3d.js
// (one instanced mesh per pose, like the cows). Its yard is dog3d.js, its
// logic src/world/farmDog.js.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colored } from './ambient3d.js';

const BLACK = 0x1c1917;
const WHITE = 0xf0ebe2;
const TAN = 0xa06a38;
const NOSE = 0x0e0c0b;
const COLLAR = 0x6e3f22;

// Rounded piece along the segment a..b (three.js coords), radius r0 at a, r1 at b.
function limb(a, b, r0, r1, color, seg = 7) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return colored(g, color);
}
function ball(x, y, z, r, sx, sy, sz, color, w = 8, h = 6) {
  return colored(new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz).translate(x, y, z), color);
}

// One leg from the hip/shoulder at (x, hip, z): thigh in the coat colour,
// white sock and paw. swing: radians, + throws the foot forward (-z).
// bend: radians the lower leg folds back.
function dogLeg(x, hip, z, len, swing, bend, front) {
  const up = len * 0.52;
  const lo = len * 0.48;
  const kx = x;
  const ky = hip - Math.cos(swing) * up;
  const kz = z - Math.sin(swing) * up;
  const a2 = swing + (front ? -bend : bend);
  const fy = ky - Math.cos(a2) * lo;
  const fz = kz - Math.sin(a2) * lo;
  return [
    limb([x, hip, z], [kx, ky, kz], front ? 0.045 : 0.055, 0.032, BLACK),
    limb([kx, ky, kz], [kx, fy, fz], 0.03, 0.026, WHITE, 6),
    ball(kx, fy + 0.018, fz - 0.02, 0.034, 1, 0.6, 1.4, WHITE, 6, 4),
  ];
}

// The collie, facing -z, feet on y = 0. pose: 0 standing, 1 gallop stretched
// out, 2 gallop gathered, 3 lying down. Black with a white ruff, blaze, socks
// and tail tip, tan eyebrows, a leather collar.
export function collieGeo(pose) {
  const P = [
    { hip: 0.5, chest: 0.52, legs: [0.05, -0.04, -0.06, 0.08], bend: [0.05, 0.08], tail: [0.3, 0.42, 0.2, 0.47], head: [0.8, -0.44] },
    { hip: 0.47, chest: 0.47, legs: [0.9, 0.75, -0.95, -0.8], bend: [0.25, 0.3], tail: [0.48, 0.42, 0.5, 0.62], head: [0.7, -0.5] },
    { hip: 0.44, chest: 0.48, legs: [-0.55, -0.4, 0.75, 0.6], bend: [0.9, 0.9], tail: [0.44, 0.44, 0.42, 0.6], head: [0.72, -0.48] },
  ][Math.min(pose, 2)];
  const parts = [];
  if (pose === 3) {
    // Lying down, head up, front legs out in front, hind legs tucked.
    parts.push(ball(0, 0.2, 0.02, 0.16, 0.95, 0.85, 2.15, BLACK));
    parts.push(ball(0, 0.25, -0.26, 0.15, 1.05, 1.1, 0.8, WHITE)); // ruff
    parts.push(limb([0, 0.28, -0.3], [0, 0.44, -0.4], 0.08, 0.07, BLACK));
    for (const s of [-1, 1]) {
      parts.push(limb([s * 0.08, 0.08, -0.25], [s * 0.08, 0.04, -0.55], 0.035, 0.03, WHITE, 6));
      parts.push(ball(s * 0.08, 0.035, -0.58, 0.034, 1, 0.6, 1.4, WHITE, 6, 4));
      parts.push(ball(s * 0.12, 0.15, 0.22, 0.09, 0.75, 0.85, 1.35, BLACK)); // haunches
      // Hind feet tucked beside the haunches, toes forward.
      parts.push(limb([s * 0.15, 0.08, 0.3], [s * 0.16, 0.04, 0.15], 0.035, 0.03, BLACK, 6));
      parts.push(ball(s * 0.16, 0.03, 0.11, 0.034, 1, 0.6, 1.5, WHITE, 6, 4));
    }
    // The tail curled round along its side, white tip forward.
    parts.push(limb([0, 0.15, 0.33], [0.13, 0.05, 0.44], 0.045, 0.04, BLACK));
    parts.push(limb([0.13, 0.05, 0.44], [0.2, 0.04, 0.3], 0.04, 0.03, BLACK, 6));
    parts.push(ball(0.21, 0.04, 0.26, 0.035, 0.9, 0.8, 1.4, WHITE, 6, 4));
    addHead(parts, 0, 0.5, -0.46);
    return mergeGeometries(parts);
  }
  const { hip, chest } = P;
  // Body: a deep chest tapering to a tuck-up at the loin.
  parts.push(ball(0, chest, -0.12, 0.155, 0.95, 1.05, 1.5, BLACK));
  parts.push(ball(0, hip + 0.01, 0.17, 0.125, 1, 0.95, 1.4, BLACK));
  parts.push(ball(0, chest - 0.02, -0.26, 0.13, 1.05, 1.15, 0.85, WHITE)); // ruff and chest
  parts.push(ball(0, chest - 0.1, -0.1, 0.08, 0.9, 0.6, 1.6, WHITE)); // white under the chest
  // Neck up to the head, with its collar.
  const [hy, hz] = P.head;
  parts.push(limb([0, chest + 0.05, -0.28], [0, hy - 0.04, hz + 0.06], 0.085, 0.07, BLACK));
  parts.push(colored(new THREE.TorusGeometry(0.075, 0.014, 4, 12).rotateX(Math.PI / 2 - 0.7).translate(0, (chest + hy) / 2 + 0.02, (-0.28 + hz) / 2 + 0.02), COLLAR));
  addHead(parts, 0, hy, hz);
  // Legs: front pair from the shoulder, hind pair from the hip.
  const [fl, fr, bl, br] = P.legs;
  const [bf, bb] = P.bend;
  parts.push(...dogLeg(-0.075, chest - 0.04, -0.2, chest - 0.06, fl, bf, true));
  parts.push(...dogLeg(0.075, chest - 0.04, -0.2, chest - 0.06, fr, bf, true));
  parts.push(...dogLeg(-0.08, hip - 0.02, 0.24, hip - 0.04, bl, bb, false));
  parts.push(...dogLeg(0.08, hip - 0.02, 0.24, hip - 0.04, br, bb, false));
  parts.push(ball(-0.085, hip - 0.04, 0.24, 0.07, 0.7, 1, 1.1, BLACK)); // thighs
  parts.push(ball(0.085, hip - 0.04, 0.24, 0.07, 0.7, 1, 1.1, BLACK));
  // A feathered tail: down from the rump, white tip.
  const [t1y, t1z, t2y, t2z] = P.tail;
  parts.push(limb([0, hip + 0.04, 0.33], [0, t1y, t1z], 0.045, 0.05, BLACK));
  parts.push(limb([0, t1y, t1z], [0, t2y, t2z], 0.05, 0.03, BLACK));
  parts.push(ball(0, t2y, t2z + 0.03, 0.04, 0.9, 0.9, 1.4, WHITE, 6, 4));
  return mergeGeometries(parts);
}

// Head at (x, y, z): skull, white blaze and muzzle, black nose, tan brows,
// ears up with folded tips.
function addHead(parts, x, y, z) {
  parts.push(ball(x, y, z, 0.085, 1, 0.95, 1.1, BLACK));
  parts.push(ball(x, y + 0.035, z - 0.06, 0.03, 0.7, 0.5, 1.4, WHITE, 6, 4)); // blaze
  parts.push(limb([x, y - 0.02, z - 0.06], [x, y - 0.035, z - 0.19], 0.048, 0.028, WHITE));
  parts.push(ball(x, y - 0.025, z - 0.195, 0.02, 1.1, 0.9, 1, NOSE, 6, 4));
  for (const s of [-1, 1]) {
    parts.push(ball(x + s * 0.04, y + 0.035, z - 0.07, 0.014, 1, 0.7, 0.7, TAN, 5, 4)); // brows
    parts.push(ball(x + s * 0.06, y - 0.03, z - 0.09, 0.022, 0.8, 1, 1.2, TAN, 5, 4)); // cheeks
    parts.push(limb([x + s * 0.05, y + 0.06, z + 0.01], [x + s * 0.065, y + 0.13, z - 0.005], 0.03, 0.012, BLACK, 4));
    parts.push(limb([x + s * 0.065, y + 0.13, z - 0.005], [x + s * 0.068, y + 0.12, z - 0.04], 0.014, 0.006, BLACK, 4)); // folded tip
  }
}
