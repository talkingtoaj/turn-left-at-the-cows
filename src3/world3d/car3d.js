// The player's car: a red late-1980s family sedan, built in code (no model
// file). The body is lofted from cross sections (carbody.js) so it has soft
// panel edges, wheel arches and enough vertices to dent; the trim (chrome
// bumpers, grille, lamps, plates, mirrors, door lines and handles, window
// frames, mud flaps, the seats and steering wheel seen through the glass)
// is one mesh on a texture atlas drawn in code (caratlas.js).
// Four draw calls: paint, glass, trim, and the four wheels (instanced).
//
// Faces -z at rotation 0 (north). Shows damage: dents pushed into the body
// where it was hit (rebuilt only when the dents change, paint scuffed
// round them), a squashed tyre and dropped corner when a tyre is flat.
// With the new look: clearcoat paint, tinted glass and chrome reflecting
// the sky (opts.env), lamps that glow (brighter tail lights when braking),
// and dust that builds up on the lower body on dirt and grass.
//
//   const car = buildCar({ env })   // env: a PMREM texture, or null (?look=old: plain colours)
//   car.update(car, dt, surfaceAt, steer, damage)

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';
import { SPECS, loftBody, sectionAt } from './carbody.js';
import { carAtlas } from './caratlas.js';

const S = SPECS.sedan;
const HALF_L = S.half;
const PAINT = 0x9e1c16; // deep 80s red
const WR = S.wheelR;
// Wheel centres (x, z), in collider WHEELS order: FL, FR, RL, RR.
const WHEELS = [[-0.77, S.wheels[0][0]], [0.77, S.wheels[0][0]], [-0.77, S.wheels[1][0]], [0.77, S.wheels[1][0]]];

// ---------- trim builder (non-indexed, uv into the atlas) ----------

function trimBuilder(A) {
  const pos = [];
  const uv = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const T = {
    pos, uv,
    tri(a, b, c, ua, ub, uc) {
      pos.push(...a, ...b, ...c);
      uv.push(...ua, ...ub, ...uc);
    },
    // Triangle facing away from the point `inside`.
    triOut(a, b, c, u, inside) {
      const n = cross(sub(b, a), sub(c, a));
      const m = [(a[0] + b[0] + c[0]) / 3 - inside[0], (a[1] + b[1] + c[1]) / 3 - inside[1], (a[2] + b[2] + c[2]) / 3 - inside[2]];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) T.tri(a, b, c, u, u, u);
      else T.tri(a, c, b, u, u, u);
    },
    // A picture quad: centre c, r = the viewer's right, u = up, size w x h.
    pic(c, r, u, w, h, rect) {
      const p = (sx, sy) => [c[0] + r[0] * sx * w / 2 + u[0] * sy * h / 2, c[1] + r[1] * sx * w / 2 + u[1] * sy * h / 2, c[2] + r[2] * sx * w / 2 + u[2] * sy * h / 2];
      const [u0, v0, u1, v1] = rect;
      const a = p(-1, -1);
      const b = p(1, -1);
      const cc = p(1, 1);
      const d = p(-1, 1);
      T.tri(a, b, cc, [u0, v1], [u1, v1], [u1, v0]);
      T.tri(a, cc, d, [u0, v1], [u1, v0], [u0, v0]);
    },
    // Any three.js geometry, uv into a swatch (sw) or remapped into a rect.
    geo(g, sw, rect = null) {
      const n = g.index ? g.toNonIndexed() : g;
      const p = n.attributes.position;
      const t = n.attributes.uv;
      const s = sw ? A.sw(sw) : null;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        if (s) uv.push(s[0], s[1]);
        else uv.push(rect[0] + (rect[2] - rect[0]) * t.getX(i), rect[1] + (rect[3] - rect[1]) * (1 - t.getY(i)));
      }
    },
    box(x, y, z, w, h, d, sw, rx = 0, ry = 0, rz = 0) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      T.geo(g.translate(x, y, z), sw);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    },
  };
  return T;
}

// Strips that follow the body surface, lifted a few mm off it.
function surfaceStrips(T, body, A) {
  const LIFT = 0.004;
  // Outward normal of section segment j at z (right side).
  const segN = (z, j) => {
    const { pts } = sectionAt(S, z);
    const a = pts[j];
    const b = pts[Math.min(10, j + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  const P = (z, j, t, side, lift = LIFT) => {
    const p = body.at(z, j, t, 1);
    const [nx, ny] = segN(z, j);
    return [side * (p[0] + nx * lift), p[1] + ny * lift, z];
  };
  const inside = [0, 0.75, 0];
  // Along z on segment j between t0 and t1.
  const alongZ = (z0, z1, j, t0, t1, sw, side, lift) => {
    const u = A.sw(sw);
    const n = Math.max(1, Math.ceil((z1 - z0) / 0.06));
    for (let k = 0; k < n; k++) {
      const za = z0 + ((z1 - z0) * k) / n;
      const zb = z0 + ((z1 - z0) * (k + 1)) / n;
      const a = P(za, j, t0, side, lift);
      const b = P(zb, j, t0, side, lift);
      const c = P(zb, j, t1, side, lift);
      const d = P(za, j, t1, side, lift);
      inside[2] = (za + zb) / 2;
      T.triOut(a, b, c, u, inside);
      T.triOut(a, c, d, u, inside);
    }
  };
  // Across the section at z, from point j0 to j1 (a shut line), width w.
  const across = (z, j0, j1, w, sw, side, lift) => {
    const u = A.sw(sw);
    for (let j = j0; j < j1; j++) {
      for (let k = 0; k < 2; k++) {
        const t0 = k / 2;
        const t1 = (k + 1) / 2;
        const a = P(z - w, j, t0, side, lift);
        const b = P(z + w, j, t0, side, lift);
        const c = P(z + w, j, t1, side, lift);
        const d = P(z - w, j, t1, side, lift);
        inside[2] = z;
        T.triOut(a, b, c, u, inside);
        T.triOut(a, c, d, u, inside);
      }
    }
  };
  for (const side of [1, -1]) {
    // Door shut lines: front door, between the doors, rear door.
    across(-0.84, 1, 5, 0.005, 'gap', side);
    across(0.435, 1, 5, 0.005, 'gap', side);
    across(1.1, 2, 5, 0.005, 'gap', side);
    // Bonnet and boot lid shut lines along the shoulders, and across.
    alongZ(-HALF_L + 0.06, S.zA - 0.07, 4, 0.55, 0.75, 'gap', side);
    across(S.zA - 0.07, 5, 10, 0.005, 'gap', side);
    alongZ(S.zC + 0.07, HALF_L - 0.06, 4, 0.55, 0.75, 'gap', side);
    across(S.zC + 0.07, 5, 10, 0.005, 'gap', side);
    // Rub strip between the arches.
    alongZ(-0.93, 0.86, 2, 0.0, 0.25, 'satin', side, 0.014);
    // Chrome drip rail along the roof edge.
    alongZ(S.zA + 0.03, S.zC - 0.03, 7, 0.82, 1.0, 'chrome', side, 0.006);
    // Door handles and the key lock.
    for (const z of [0.2, 0.96]) {
      const p = P(z, 3, 0.75, side, 0.012);
      T.box(p[0], p[1], z, 0.024, 0.032, 0.16, 'satin');
      T.box(p[0] + side * 0.008, p[1] + 0.006, z, 0.012, 0.01, 0.14, 'chrome');
    }
    const lock = P(0.08, 3, 0.75, side, 0.012);
    T.box(lock[0], lock[1], 0.08, 0.016, 0.022, 0.022, 'chrome');
    // Side marker lamps (amber front, red rear).
    for (const [z, sw] of [[-HALF_L + 0.32, 'amber'], [HALF_L - 0.3, 'red']]) {
      const p = P(z, 3, 0.4, side, 0.006);
      T.box(p[0], p[1], z, 0.012, 0.035, 0.09, sw);
    }
  }
}

function trimParts(T, A) {
  const h = HALF_L;
  const endBelt = (z) => sectionAt(S, z).belt;
  // Bumpers: brushed alloy with a black rubber band, wrapping round the corners.
  for (const s of [-1, 1]) {
    const z = s * (h + 0.045);
    T.box(0, 0.45, z, 1.72, 0.17, 0.15, 'alu');
    T.box(0, 0.455, z + s * 0.004, 1.74, 0.05, 0.155, 'rubber');
    for (const x of [-1, 1]) {
      T.box(x * 0.815, 0.45, s * (h - 0.13), 0.13, 0.17, 0.42, 'alu');
      T.box(x * 0.82, 0.455, s * (h - 0.13), 0.135, 0.05, 0.425, 'rubber');
    }
    // Number plate.
    T.pic([0, 0.43, z + s * 0.08], [s, 0, 0], [0, 1, 0], 0.32, 0.16, A.rect('plate', 2));
  }
  // Front: headlights in chrome bezels, the grille, indicators in the bumper.
  const fz = -h - 0.006;
  for (const x of [-1, 1]) {
    T.box(x * 0.55, 0.665, fz + 0.004, 0.42, 0.205, 0.02, 'chrome');
    T.pic([x * 0.55, 0.665, fz - 0.008], [-1, 0, 0], [0, 1, 0], 0.38, 0.17, A.rect('head', 1));
    T.pic([x * 0.6, 0.385, -h - 0.124], [-1, 0, 0], [0, 1, 0], 0.17, 0.045, A.rect('indicator', 1));
  }
  T.pic([0, 0.665, fz - 0.006], [-1, 0, 0], [0, 1, 0], 0.64, 0.16, A.rect('grille', 1));
  // Rear: tail light clusters and the badge.
  const rz = h + 0.006;
  for (const x of [-1, 1]) {
    T.box(x * 0.515, 0.7, rz - 0.004, 0.52, 0.215, 0.02, 'black');
    // The texture has the indicator on its right: outboard on the right lamp, mirrored on the left.
    const r = A.rect('tail', 1);
    T.pic([x * 0.515, 0.7, rz + 0.008], [1, 0, 0], [0, 1, 0], 0.5, 0.2, x > 0 ? r : [r[2], r[1], r[0], r[3]]);
  }
  T.pic([0.42, 0.86, rz + 0.004], [1, 0, 0], [0, 1, 0], 0.1, 0.034, A.rect('badge', 1));
  T.box(0, 0.83, rz + 0.004, 0.06, 0.03, 0.012, 'chrome');
  // Mirrors on the doors by the windscreen.
  for (const x of [-1, 1]) {
    const z = S.zA + 0.16;
    const y = endBelt(z) + 0.09;
    T.box(x * (S.hw + 0.02), y - 0.04, z, 0.08, 0.035, 0.05, 'satin');
    T.box(x * (S.hw + 0.09), y, z, 0.15, 0.1, 0.07, 'satin', 0, 0, x * 0.05);
    T.pic([x * (S.hw + 0.09), y, z + 0.037], [1, 0, 0], [0, 1, 0], 0.13, 0.08, (() => { const [u, v] = A.sw('mirror'); return [u, v, u, v]; })());
  }
  // Wheel well liners (seen inside the arches) and the underbody.
  for (const [x, z] of WHEELS) {
    // The top half of an open tube along x, turned inside out (seen from within).
    const n = new THREE.CylinderGeometry(0.43, 0.43, 0.32, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).toNonIndexed();
    const p = n.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
    n.translate(Math.sign(x) * (S.hw - 0.17), S.wheelY, z);
    T.geo(n, 'liner');
    // Mud flap behind the wheel.
    T.box(x, 0.24, z + 0.44, 0.2, 0.26, 0.012, 'rubber');
  }
  T.box(0, 0.31, 0, 1.6, 0.04, 3.9, 'liner');
  // Exhaust and the aerial.
  T.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8).rotateX(Math.PI / 2).translate(-0.48, 0.27, h - 0.02), 'exhaust');
  T.geo(new THREE.CylinderGeometry(0.003, 0.005, 0.8, 4).translate(0, 0.4, 0).rotateX(-0.12).translate(0.66, endBelt(-1.05) - 0.02, -1.05), 'chrome');

  // Inside: seats (velour), dashboard, steering wheel, parcel shelf.
  const fab = A.rect('fabric');
  const seat = (x, z, w) => {
    T.geo(new THREE.BoxGeometry(w, 0.14, 0.5).translate(x, 0.5, z), null, fab);
    T.geo(new THREE.BoxGeometry(w, 0.58, 0.12).rotateX(-0.22).translate(x, 0.84, z + 0.3), null, fab);
  };
  seat(-0.4, 0.0, 0.52);
  seat(0.4, 0.0, 0.52);
  for (const x of [-0.4, 0.4]) T.geo(new THREE.BoxGeometry(0.26, 0.2, 0.1).translate(x, 1.22, 0.38), null, fab);
  seat(0, 0.86, 1.08);
  T.box(0, 0.86, -0.64, 1.6, 0.2, 0.42, 'dash');
  T.box(0, 0.97, -0.72, 1.5, 0.05, 0.3, 'dash', -0.15);
  const wheel = new THREE.TorusGeometry(0.19, 0.018, 6, 18).rotateX(-0.95).translate(-0.4, 0.98, -0.36);
  T.geo(wheel, 'black');
  T.geo(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6).rotateX(-0.95 + Math.PI / 2).translate(-0.4, 0.92, -0.47), 'black');
  T.box(0, 0.99, 1.38, 1.5, 0.03, 0.3, 'dash');
}

// Tyre and hubcap, axis along x, centre at the origin (atlas UVs).
function wheelGeo(A) {
  const prof = [[0.19, -0.098], [0.27, -0.102], [0.3, -0.095], [WR, -0.07], [WR + 0.002, 0], [WR, 0.07], [0.3, 0.095], [0.27, 0.102], [0.19, 0.098]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.LatheGeometry(prof, 22).rotateZ(Math.PI / 2);
  const T = trimBuilder(A);
  T.geo(tyre, null, A.rect('tread', 1));
  for (const s of [-1, 1]) {
    const cap = new THREE.CircleGeometry(0.2, 18).rotateY(s * Math.PI / 2).translate(s * 0.094, 0, 0);
    T.geo(cap, null, A.rect('hubcap', 2));
  }
  return T.build();
}

// ---------- materials ----------

function makeMaterials(env, A) {
  const dirt = { value: 0 };
  const brake = { value: 0 };
  const brakeChunk = `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
  float tailK = step( 0.12, emissiveColor.r - emissiveColor.g * 1.6 );
  totalEmissiveRadiance *= emissiveColor.rgb * ( 1.0 + uBrake * 5.0 * tailK );
#endif`;
  const patchBrake = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBrake = brake;
      sh.fragmentShader = `uniform float uBrake;\n${sh.fragmentShader.replace('#include <emissivemap_fragment>', brakeChunk)}`;
    };
  };
  if (!env) {
    // ?look=old: plain colours, as before.
    const paint = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glass = new THREE.MeshLambertMaterial({ color: 0x24323d });
    const trim = new THREE.MeshLambertMaterial({ map: A.map, emissiveMap: A.emissive, emissive: 0xffffff, emissiveIntensity: 0.4 });
    patchBrake(trim);
    return { paint, glass, trim, dirt, brake };
  }
  const paint = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.18, envMap: env, envMapIntensity: 0.55,
  });
  paint.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = dirt;
    sh.vertexShader = `varying vec3 vCarP;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCarP = position;')}`;
    sh.fragmentShader = `uniform float uDirt;\nvarying vec3 vCarP;\n${sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float dn = 0.8 + 0.1 * sin( vCarP.x * 9.0 + vCarP.z * 3.1 ) * sin( vCarP.z * 6.3 + vCarP.y * 11.0 ) + 0.1 * sin( vCarP.z * 21.0 + vCarP.x * 5.0 );
  float dk = clamp( uDirt * smoothstep( 0.8, 0.28, vCarP.y ) * dn, 0.0, 0.8 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.36, 0.29, 0.2 ), dk );`)}`;
  };
  paint.customProgramCacheKey = () => 'carPaintDirt';
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a1014, roughness: 0.03, metalness: 0.35, envMap: env, envMapIntensity: 1.8, transparent: true, opacity: 0.8,
  });
  const trim = new THREE.MeshStandardMaterial({
    map: A.map, roughnessMap: A.mr, metalnessMap: A.mr, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 1.2,
    emissiveMap: A.emissive, emissive: 0xffffff, emissiveIntensity: 0.9,
  });
  patchBrake(trim);
  trim.customProgramCacheKey = () => 'carTrimBrake';
  return { paint, glass, trim, dirt, brake };
}

// ---------- the car ----------

export function buildCar(opts = {}) {
  const A = carAtlas();
  const body = loftBody(S, { step: 0.07 });
  // Paint: indexed so it shades smoothly; colour per vertex (scuffs).
  const paintGeo = new THREE.BufferGeometry();
  paintGeo.setAttribute('position', new THREE.Float32BufferAttribute(body.paint.pos, 3));
  paintGeo.setIndex(body.paint.idx);
  const pc = new THREE.Color(PAINT);
  const cols = new Float32Array(body.paint.pos.length);
  for (let i = 0; i < cols.length; i += 3) cols.set([pc.r, pc.g, pc.b], i);
  paintGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  paintGeo.computeVertexNormals();
  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(body.glass.pos, 3));
  glassGeo.setIndex(body.glass.idx);
  glassGeo.computeVertexNormals();
  // Trim: the loft's frames and brightwork, then the parts.
  const T = trimBuilder(A);
  for (const t of body.trim) {
    const u = A.sw(t.sw);
    const p = t.tri;
    T.tri([p[0], p[1], p[2]], [p[3], p[4], p[5]], [p[6], p[7], p[8]], u, u, u);
  }
  surfaceStrips(T, body, A);
  trimParts(T, A);
  const trimGeo = T.build();

  const M = makeMaterials(opts.env || null, A);
  const paint = new THREE.Mesh(paintGeo, M.paint);
  const glass = new THREE.Mesh(glassGeo, M.glass);
  const trim = new THREE.Mesh(trimGeo, M.trim);
  for (const m of [paint, trim]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  glass.castShadow = true;
  glass.renderOrder = 1;
  const dents = [createDents(paintGeo, true), createDents(glassGeo, false), createDents(trimGeo, false)];

  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const tilt = new THREE.Group();
  group.add(tilt);
  tilt.add(paint, trim, glass);

  // Wheels: one instanced mesh; each instance is holder (squash) x steer x spin.
  const wheelMesh = new THREE.InstancedMesh(wheelGeo(A), M.trim, 4);
  wheelMesh.castShadow = true;
  wheelMesh.receiveShadow = true;
  wheelMesh.frustumCulled = false;
  group.add(wheelMesh); // wheels stay on the ground; the body above them bobs
  const wheels = WHEELS.map(([x, z]) => ({ x, z, front: z < 0, squash: new THREE.Vector3(1, 1, 1) }));
  const mHold = new THREE.Matrix4();
  const mSpin = new THREE.Matrix4();
  const mSteer = new THREE.Matrix4();
  const mUp = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vP = new THREE.Vector3();

  let flatKey = -2;
  let dentKey = -1;
  let dentOf = null;
  // Damage look from state.damage (src/game/damage.js), or null for a fresh car.
  function showDamage(d) {
    // A fresh car (mission restart) is a new damage object.
    const v = d ? d.dentsV || 0 : 0;
    if (d !== dentOf || v !== dentKey) {
      if (d !== dentOf) M.dirt.value = 0;
      dentOf = d;
      dentKey = v;
      for (const dn of dents) dn.apply(d && d.dents ? d.dents : []);
    }
    // Which wheel is flat (-1 none). Wheel order matches WHEELS in collider.js.
    let flat = -1;
    if (d && d.tyres < 0.45) flat = d.flatWheel >= 0 ? d.flatWheel : d.flatSide < 0 ? 0 : 1;
    if (flat !== flatKey) {
      flatKey = flat;
      wheels.forEach((w, i) => {
        const sq = i === flat;
        w.squash.set(sq ? 1.12 : 1, sq ? 0.72 : 1, sq ? 1.06 : 1);
      });
    }
  }

  // Ride: the chassis follows the plane under the four tyres (visual only,
  // stepCar is untouched). The body sits on a soft spring above it, so
  // bumps give a small, smooth bob and a little lag in pitch and roll.
  const SPRING = 11; // rad/s
  const DAMP = 0.5; // damping ratio
  const MAX_BOB = 0.07; // m
  const MAX_LEAN = 0.035; // rad, extra body pitch/roll from the spring
  let spin = 0;
  let y = null;
  let pitch = 0;
  let roll = 0;
  let lastX = 0;
  let lastY = 0;
  let lastSpeed = 0;
  let brakeT = 0;
  const sp = { y: [0, 0], p: [0, 0], r: [0, 0] };
  const spring = (s, target, dt) => {
    // Semi-implicit Euler in two half steps (stable at 20 fps too).
    for (let i = 0; i < 2; i++) {
      const hh = dt / 2;
      const acc = SPRING * SPRING * (target - s[0]) - 2 * DAMP * SPRING * s[1];
      s[1] += acc * hh;
      s[0] += s[1] * hh;
    }
    return s[0];
  };
  // Small bumps (m) under the four tyres: tussocks and stones (value noise
  // at 0.7 and 1.6 m) and, on plowed ground, furrows across the rows.
  // Returns { y: mean, p: front minus rear, r: right minus left } or null.
  let lastSB = null;
  const SMALL_AMP = 0.035; // m at roughness 1
  const FURROW_AMP = 0.05; // m
  const smallBumps = (ride, car, fx, fy) => {
    if (!ride || !(ride.rough > 0.02)) return null;
    const ca = Math.cos(ride.plowAngle || 0);
    const sa = Math.sin(ride.plowAngle || 0);
    const at = (lx, lz) => {
      const x = car.x - fy * lx - fx * lz;
      const y = car.y + fx * lx - fy * lz;
      let v = (vnoise(x / 0.7, y / 0.7) * 0.6 + vnoise(x / 1.6 + 7.3, y / 1.6) * 0.4) * SMALL_AMP * ride.rough;
      if (ride.plow > 0) v += ride.plow * FURROW_AMP * 0.5 * Math.cos((2 * Math.PI * (x * ca + y * sa)) / 1.1);
      return v;
    };
    const a = at(-wfx, wfz);
    const b = at(wfx, wfz);
    const c = at(-wfx, wrz);
    const d = at(wfx, wrz);
    return { y: (a + b + c + d) / 4, p: (a + b - c - d) / 2, r: (b + d - a - c) / 2 };
  };
  const flatDrop = () => (flatKey < 0 ? null : wheels[flatKey]);
  const [wfx, wfz] = [WHEELS[1][0], WHEELS[0][1]];
  const wrz = WHEELS[2][1];
  const wheelbase = wrz - wfz;
  return {
    object: group,
    meshes: { paint, glass, trim, wheels: wheelMesh },
    dirt: M.dirt, // uniform { value 0..0.75 } (dev: set it for a dusty car)
    showDamage,
    // heightAt(x, y) is the surface height under a world point.
    // damage (optional): state.damage, for dents, a flat tyre and dust.
    // ride (optional): the ground under the car off-road, from
    // src/world/roughness.js ({ rough, plow, plowAngle }): small bumps under
    // the 4 m mesh spacing that only the body feels (wheels stay on the ground).
    update(car, dt, heightAt, steer, damage, ride = null) {
      if (damage !== undefined) showDamage(damage);
      const h = car.heading * DEG;
      const fx = Math.sin(h);
      const fy = -Math.cos(h);
      // Ground under each tyre (local x right, local z back).
      const at = (lx, lz) => heightAt(car.x - fy * lx - fx * lz, car.y + fx * lx - fy * lz);
      const hFL = at(-wfx, wfz);
      const hFR = at(wfx, wfz);
      const hRL = at(-wfx, wrz);
      const hRR = at(wfx, wrz);
      const fw = flatDrop();
      const drop = (lx, lz) => (fw && fw.x === lx && fw.z === lz ? 0.09 : 0);
      const dFL = drop(-wfx, wfz);
      const dFR = drop(wfx, wfz);
      const dRL = drop(-wfx, wrz);
      const dRR = drop(wfx, wrz);
      const target = (hFL + hFR + hRL + hRR) / 4;
      const tPitch = Math.atan2((hFL - dFL + hFR - dFR) / 2 - (hRL - dRL + hRR - dRR) / 2, wheelbase);
      const tRoll = Math.atan2((hFR - dFR + hRR - dRR) / 2 - (hFL - dFL + hRL - dRL) / 2, wfx * 2);
      const jumped = y === null || Math.hypot(car.x - lastX, car.y - lastY) > 5;
      lastX = car.x;
      lastY = car.y;
      if (jumped) {
        y = target;
        pitch = tPitch;
        roll = tRoll;
        sp.y[0] = sp.y[1] = sp.p[0] = sp.p[1] = sp.r[0] = sp.r[1] = 0;
      } else if (dt > 0) {
        // Chassis: quick but smooth (no jitter from single bumps).
        const k = 1 - Math.exp(-dt * 22);
        const prevY = y;
        const prevP = pitch;
        const prevR = roll;
        y += (target - y) * k;
        pitch += (tPitch - pitch) * k;
        roll += (tRoll - roll) * k;
        // Body: kicked opposite to how the chassis just moved, springs back.
        sp.y[0] -= y - prevY;
        sp.p[0] -= (pitch - prevP) * 0.6;
        sp.r[0] -= (roll - prevR) * 0.6;
        // Small bumps under the tyres kick the body the same way.
        const sb = smallBumps(ride, car, fx, fy);
        if (sb && lastSB) {
          sp.y[0] += (sb.y - lastSB.y) * 0.8;
          sp.p[0] += Math.atan2(sb.p - lastSB.p, wheelbase) * 0.8;
          sp.r[0] += Math.atan2(sb.r - lastSB.r, wfx * 2) * 0.8;
        }
        lastSB = sb ? { ...sb } : null;
        spring(sp.y, 0, dt);
        spring(sp.p, 0, dt);
        spring(sp.r, 0, dt);
        sp.y[0] = Math.max(-MAX_BOB, Math.min(MAX_BOB, sp.y[0]));
        sp.p[0] = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, sp.p[0]));
        sp.r[0] = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, sp.r[0]));
      }
      group.position.set(car.x, y, car.y);
      group.rotation.set(pitch, -h, roll);
      tilt.position.y = sp.y[0];
      tilt.rotation.set(sp.p[0], 0, sp.r[0]);
      spin -= (car.speed * dt) / WR;
      wheels.forEach((w, i) => {
        mHold.compose(vP.set(w.x, 0, w.z), qI, w.squash);
        mUp.makeTranslation(0, WR, 0);
        mSteer.makeRotationY(w.front ? -steer * 0.4 : 0);
        mSpin.makeRotationX(spin);
        mHold.multiply(mUp).multiply(mSteer).multiply(mSpin);
        wheelMesh.setMatrixAt(i, mHold);
      });
      wheelMesh.instanceMatrix.needsUpdate = true;

      if (dt > 0) {
        // Brake lights: when slowing hard while moving forward.
        const decel = (Math.abs(lastSpeed) - Math.abs(car.speed)) / dt;
        lastSpeed = car.speed;
        brakeT = decel > 2.5 && Math.abs(car.speed) > 0.5 ? 0.35 : Math.max(0, brakeT - dt);
        M.brake.value += ((brakeT > 0 ? 1 : 0) - M.brake.value) * Math.min(1, dt * 12);
        // Dust builds up slowly on dirt and grass (a fresh car is clean).
        const surf = damage && damage.lastSurface;
        if ((surf === 'dirt' || surf === 'grass') && Math.abs(car.speed) > 4) M.dirt.value = Math.min(0.75, M.dirt.value + dt * 0.0045);
      }
    },
  };
}

// Dents: pushes body vertices in where the car was hit. Every vertex moves
// by a smooth function of its own rest position, so the copies of a corner
// all move together and the paint, glass and trim meshes stay joined. Paint
// near a dent darkens a little (scuffed); smooth normals are rebuilt.
const HALF_W = S.hw;
// Smooth value noise in 2D, about -1..1 (for the small ride bumps).
function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash3(i, j, 0.5) * 2 - 1;
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function createDents(geo, scuff) {
  const pos = geo.attributes.position;
  const col = scuff ? geo.attributes.color : null;
  const rest = pos.array.slice();
  const restCol = col ? col.array.slice() : null;
  const n = pos.count;
  return {
    // list: [{ f, r, amount }] (car space: f forward, r right).
    apply(list) {
      const p = pos.array;
      p.set(rest);
      if (col) col.array.set(restCol);
      const c = col ? col.array : null;
      for (const dent of list) {
        // Where the hit direction leaves the body outline (local x right, z back).
        const t = Math.min(HALF_W / Math.max(1e-3, Math.abs(dent.r)), HALF_L / Math.max(1e-3, Math.abs(dent.f)));
        const cx = dent.r * t;
        const cz = -dent.f * t;
        const cy = 0.66;
        const a = dent.amount;
        const depth = Math.min(0.4, 0.05 + a * 1.1);
        const R = Math.min(1.15, 0.55 + a * 1.6);
        // Push straight in along the hit, plus a little down (crumple).
        const ix = -dent.r;
        const iz = dent.f;
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          const x = rest[k];
          const y = rest[k + 1];
          const z = rest[k + 2];
          const dx = x - cx;
          const dy = (y - cy) * 1.3;
          const dz = z - cz;
          const q = (dx * dx + dy * dy + dz * dz) / (R * R);
          if (q >= 1) continue;
          const fall = (1 - q) * (1 - q);
          const jag = 0.65 + 0.7 * hash3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50));
          const m = depth * fall * jag;
          p[k] += ix * m;
          p[k + 2] += iz * m;
          p[k + 1] -= m * 0.35 * (y > 0.5 ? 1 : 0.3);
          if (c) {
            const dark = 1 - 0.45 * fall;
            c[k] *= dark;
            c[k + 1] *= dark * 0.97;
            c[k + 2] *= dark * 0.95;
          }
        }
      }
      // Never push a vertex through to the other side of the car.
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        if (Math.sign(p[k]) !== Math.sign(rest[k]) && Math.abs(rest[k]) > 0.05) p[k] = rest[k] * 0.15;
        if (Math.sign(p[k + 2]) !== Math.sign(rest[k + 2]) && Math.abs(rest[k + 2]) > 0.05) p[k + 2] = rest[k + 2] * 0.15;
      }
      pos.needsUpdate = true;
      if (col) col.needsUpdate = true;
      if (geo.index) geo.computeVertexNormals();
      else if (list.length || geo.userData.dented) geo.computeVertexNormals();
      geo.userData.dented = list.length > 0;
      geo.computeBoundingSphere();
    },
  };
}
