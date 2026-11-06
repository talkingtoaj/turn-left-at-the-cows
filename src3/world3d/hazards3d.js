// Draws road hazards and damage in 3D: potholes (one static mesh), fallen
// branches and logs, tractors and farm trucks (instanced), fixed fallen
// trees part way across roads, and smoke from a damaged engine. Hazard animals are
// drawn by ambient3d with the herd meshes (pass hz.animals to its update).
// About seven draw calls in all, most of them empty most of the time.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, makeRng } from '../../src/drive/geom.js';
import { box } from './shapes.js';
import { colored, instanced, puffs, puffTexture } from './ambient3d.js';
import { treeModelFor } from './trees.js';
import { vehicleMesh } from './traffic3d.js';

const MAX_DEBRIS = 12;
const MAX_VEHICLES = 6;
const MAX_SMOKE = 260;
const SHOW_R = 500;

// How far above the ground the pothole patch sits: just over the road ribbons
// (ground.js draws paved at +0.09 and dirt at +0.05..0.07).
const LIFT = { paved: 0.125, dirt: 0.105 };

// ---------- potholes ----------

// One merged mesh of every pothole: a dark oval with a broken rim, shaded
// like a dip (the wall facing the sun lit, the other side in shadow). Each
// vertex sits on the ground under it, so the patch follows the road.
function potholeMesh(list, groundAt, sunDir) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const sx = sunDir.x;
  const sz = sunDir.z;
  const sl = Math.hypot(sx, sz) || 1;
  const SEG = 12;
  const rng = makeRng(4242);
  for (const p of list) {
    const paved = p.roadType === 'paved';
    const lift = LIFT[paved ? 'paved' : 'dirt'];
    const a = (p.angle || 0) * DEG;
    const ax = Math.sin(a);
    const ay = -Math.cos(a);
    const stretch = 1.25;
    const ring = (rr, j, wob) => {
      const t = (j / SEG) * Math.PI * 2;
      const k = rr * (1 + wob);
      const lx = Math.cos(t) * k;
      const ly = Math.sin(t) * k * stretch;
      // ly along the long axis (ax, ay), lx across it.
      return [p.x + ax * ly + -ay * lx, p.y + ay * ly + ax * lx];
    };
    const wobs = [];
    for (let j = 0; j < SEG; j++) wobs.push((rng() - 0.5) * 0.35);
    const rim = [];
    const inner = [];
    for (let j = 0; j < SEG; j++) {
      rim.push(ring(p.r * 1.18, j, wobs[j]));
      inner.push(ring(p.r * 0.78, j, wobs[j] * 0.8));
    }
    const centre = [p.x, p.y];
    const h = (x, y, extra) => groundAt(x, y) + lift + extra;
    const shadeAt = (x, y) => {
      // Light on the far wall from the sun, dark on the near wall.
      const dx = x - p.x;
      const dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      return 0.78 + 0.28 * ((dx * sx + dy * sz) / (d * sl));
    };
    const rimCol = paved ? 0x6e6d68 : 0x9c8259;
    const wallCol = paved ? 0x55534f : 0x7c6442;
    const floorCol = paved ? 0x474542 : 0x6a5536;
    const push = (pt, extra, hex, shade) => {
      pos.push(pt[0], h(pt[0], pt[1], extra), pt[1]);
      c.setHex(hex).multiplyScalar(shade);
      col.push(c.r, c.g, c.b);
    };
    for (let j = 0; j < SEG; j++) {
      const k = (j + 1) % SEG;
      // Rim ring (outer band): lighter broken edge.
      const r0 = rim[j];
      const r1 = rim[k];
      const i0 = inner[j];
      const i1 = inner[k];
      const s0 = shadeAt(i0[0], i0[1]);
      const s1 = shadeAt(i1[0], i1[1]);
      push(r0, 0.004, rimCol, 1);
      push(i0, 0.006, wallCol, s0);
      push(r1, 0.004, rimCol, 1);
      push(r1, 0.004, rimCol, 1);
      push(i0, 0.006, wallCol, s0);
      push(i1, 0.006, wallCol, s1);
      // Floor.
      push(i0, 0.006, floorCol, 0.9 + (s0 - 0.78) * 0.5);
      push(centre, 0.008, floorCol, 0.82);
      push(i1, 0.006, floorCol, 0.9 + (s1 - 0.78) * 0.5);
    }
  }
  // Make every triangle face up (counter-clockwise seen from above).
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i];
    const az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i];
    const bz = pos[i + 8] - pos[i + 2];
    if (az * bx - ax * bz < 0) {
      for (let k = 0; k < 3; k++) {
        [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
        [col[i + 3 + k], col[i + 6 + k]] = [col[i + 6 + k], col[i + 3 + k]];
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Flat patches: normals straight up so the dip shading above is what shows.
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// ---------- shapes (all face -z, base on y = 0) ----------

// Branch, long axis along z, 1 m long (scaled by instance), lying on the ground.
function branchGeo() {
  const BARK = 0x5b4632;
  const LEAF = 0x5d7a3a;
  const parts = [
    colored(new THREE.CylinderGeometry(0.1, 0.16, 1, 6).rotateX(Math.PI / 2).translate(0, 0.15, 0), BARK),
    colored(new THREE.CylinderGeometry(0.025, 0.045, 0.45, 4).rotateX(Math.PI / 2).rotateY(0.7).translate(0.15, 0.1, -0.15), BARK),
    colored(new THREE.CylinderGeometry(0.02, 0.04, 0.4, 4).rotateX(Math.PI / 2).rotateY(-0.8).translate(-0.13, 0.12, 0.12), BARK),
    colored(new THREE.CylinderGeometry(0.02, 0.035, 0.35, 4).rotateX(Math.PI / 2).rotateY(0.5).translate(0.12, 0.1, 0.3), BARK),
  ];
  const leaves = [[0.3, 0.18, -0.32, 0.22], [-0.25, 0.16, 0.26, 0.2], [0.05, 0.2, -0.48, 0.18], [0.22, 0.15, 0.42, 0.16], [-0.1, 0.17, -0.1, 0.15]];
  for (const [x, y, z, r] of leaves) parts.push(colored(new THREE.IcosahedronGeometry(r, 0).scale(1.2, 0.6, 1.2).translate(x, y, z), LEAF));
  return mergeGeometries(parts);
}

// Log, 1 m long along z (scaled by instance), radius 0.24.
function logGeo() {
  const parts = [
    colored(new THREE.CylinderGeometry(0.24, 0.26, 1, 7, 1, true).rotateX(Math.PI / 2).translate(0, 0.24, 0), 0x5a4330),
    colored(new THREE.CircleGeometry(0.24, 7).translate(0, 0, 0.5).translate(0, 0.24, 0), 0xc8a878),
    colored(new THREE.CircleGeometry(0.25, 7).rotateY(Math.PI).translate(0, 0.24, -0.5), 0xc8a878),
    colored(box(0.08, 0.06, 0.3).rotateY(0.6).translate(0.25, 0.3, 0.1), 0x4a3828), // a broken stub
  ];
  return mergeGeometries(parts);
}

function wheelGeo(r, w, x, z, hex = 0x1e1e1e) {
  return colored(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, r, z), hex);
}

// Farm tractor: paint parts are light grey so the instance colour tints them.
function tractorGeo() {
  const P = 0xeeeeee;
  const paint = [
    colored(box(1.0, 0.75, 1.9).translate(0, 0.65, -0.65), P), // bonnet
    colored(box(1.5, 0.25, 1.2).translate(0, 1.0, 0.75), P), // rear deck under the cab
    colored(box(1.55, 0.15, 0.9).translate(0, 1.0, 1.35), P), // mudguards
    colored(box(1.3, 0.08, 1.25).translate(0, 2.55, 0.75), P), // cab roof
  ];
  const trim = [
    colored(box(1.2, 1.3, 1.1).translate(0, 1.25, 0.75), 0x2c3a44), // cab glass
    colored(box(1.25, 0.08, 1.15).translate(0, 1.22, 0.75), 0x2a2a2a),
    colored(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5).translate(0.32, 1.65, -1.1), 0x2a2a2a), // exhaust
    colored(box(0.85, 0.35, 0.08).translate(0, 0.55, -1.62), 0x333333), // grille
    colored(box(0.2, 0.12, 0.05).translate(-0.3, 0.95, -1.62), 0xfff3c4),
    colored(box(0.2, 0.12, 0.05).translate(0.3, 0.95, -1.62), 0xfff3c4),
    colored(box(0.07, 0.07, 0.07).translate(0.6, 2.55, 1.35), 0xf0a020), // beacon
    wheelGeo(0.78, 0.45, -0.95, 0.85), wheelGeo(0.78, 0.45, 0.95, 0.85),
    wheelGeo(0.42, 0.28, -0.68, -1.15), wheelGeo(0.42, 0.28, 0.68, -1.15),
    wheelGeo(0.4, 0.47, -0.95, 0.85, 0xc8a23a), wheelGeo(0.4, 0.47, 0.95, 0.85, 0xc8a23a), // hubs
  ];
  return { paint: mergeGeometries(paint), trim: mergeGeometries(trim) };
}

// A fixed fallen tree (src/world/fallenTrees.js), built in world space:
// the same CC0 model the standing tree used, laid on its side along the
// line it fell, a bark trunk the size of its collision circles, the root
// plate standing up at the base with roots and torn-up soil, and the pit it
// came out of. Model space first: base at the origin, trunk along +x, up +y.
function fallenGeo(f, surfaceAt, rng) {
  const BARK = 0x5a4532;
  const SOIL = 0x5d4a33;
  const parts = [];
  const model = treeModelFor(f.tree);
  if (model) {
    const g = model.clone();
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const k = f.h / Math.max(0.1, bb.max.y - bb.min.y);
    // Lay it down (+y to +x) and flatten the crown a little where it hit the ground.
    const flat = f.kind === 'pine' ? [0.72, 0.85] : [0.5, 0.62];
    g.translate(0, -bb.min.y, 0).scale(k, k, k).rotateZ(-Math.PI / 2).scale(1, flat[0], flat[1]);
    g.rotateX((rng() - 0.5) * 0.6);
    g.translate(0, 0.35, 0);
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g);
  } else {
    // ?trees=old: leafy blobs along the top half.
    const LEAF = [0x4f7a3a, 0x5d8a42, 0x47703a];
    const n = f.kind === 'pine' ? 6 : 7;
    for (let i = 0; i < n; i++) {
      const s = f.h * (0.45 + (0.55 * i) / (n - 1));
      const r = (f.kind === 'pine' ? 1.4 : 2.0) * (1 - 0.5 * Math.abs(i / (n - 1) - 0.4)) * (0.8 + rng() * 0.4);
      parts.push(colored(new THREE.IcosahedronGeometry(r, 0).scale(1.1, 0.7, 1).translate(s, r * 0.55, (rng() - 0.5) * 1.6), LEAF[i % 3]));
    }
  }
  // Trunk: solid part tapering 0.5 -> 0.3 m, then a thin top.
  parts.push(colored(new THREE.CylinderGeometry(0.28, 0.46, f.solidLen, 9, 3).rotateZ(Math.PI / 2).translate(f.solidLen / 2, 0.42, 0), BARK));
  parts.push(colored(new THREE.CylinderGeometry(0.06, 0.28, f.h * 0.92 - f.solidLen, 6).rotateZ(Math.PI / 2).translate((f.solidLen + f.h * 0.92) / 2, 0.42, 0), BARK));
  // Broken limbs sticking up and out along the trunk.
  for (let i = 0; i < 9; i++) {
    const s = f.solidLen * (0.3 + rng() * 0.75);
    const side = rng() < 0.5 ? -1 : 1;
    const L = 1 + rng() * 1.8;
    parts.push(colored(new THREE.CylinderGeometry(0.04, 0.09, L, 4).translate(0, L / 2, 0)
      .rotateX(side * (0.5 + rng() * 0.9)).rotateZ(-0.4 - rng() * 0.5).translate(s, 0.5, 0), BARK));
  }
  // Root plate: an upturned disc of earth and roots, standing across the base.
  const R = f.kind === 'pine' ? 1.6 : 1.9;
  parts.push(colored(new THREE.CylinderGeometry(R, R * 1.08, 0.55, 11, 1).rotateZ(Math.PI / 2).translate(-0.15, R * 0.75, 0), SOIL));
  parts.push(colored(new THREE.CylinderGeometry(R * 0.7, R * 0.9, 0.3, 9, 1).rotateZ(Math.PI / 2).translate(-0.5, R * 0.75, 0), 0x4a3a28));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
    const L = 0.8 + rng() * 0.9;
    parts.push(colored(new THREE.CylinderGeometry(0.03, 0.08, L, 4).translate(0, L / 2, 0)
      .rotateX(Math.PI / 2 + (rng() - 0.5) * 0.6).rotateY(Math.PI / 2 + (rng() - 0.5) * 0.8)
      .translate(-0.4, R * 0.75 + Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95), 0x3e3022));
  }
  // The pit it tore out of (behind the base) and clods of soil about.
  parts.push(colored(new THREE.CircleGeometry(R * 1.05, 10).rotateX(-Math.PI / 2).scale(0.75, 1, 1).translate(-R * 0.85, 0.03, 0), 0x3a2c1e));
  for (let i = 0; i < 7; i++) {
    const r = 0.18 + rng() * 0.3;
    parts.push(colored(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.6, 1).translate(-R * 0.6 + (rng() - 0.3) * 2.6, r * 0.3, (rng() - 0.5) * R * 2.4), rng() < 0.5 ? SOIL : 0x6b5637));
  }
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  // Into world space: turn to the fall heading, pitch to the ground along
  // the trunk, sit on the higher of the points under it.
  const ux = Math.sin(f.heading * DEG);
  const uy = -Math.cos(f.heading * DEG);
  const y0 = surfaceAt(f.x, f.y);
  const y1 = surfaceAt(f.x + ux * f.solidLen, f.y + uy * f.solidLen);
  let lift = 0;
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    const yt = surfaceAt(f.x + ux * f.solidLen * t, f.y + uy * f.solidLen * t);
    lift = Math.max(lift, yt - (y0 + (y1 - y0) * t));
  }
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(f.x, y0 + lift - 0.05, f.y),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(f.heading - 90) * DEG, Math.atan2(y1 - y0, f.solidLen), 'YZX')),
    new THREE.Vector3(1, 1, 1),
  );
  geo.applyMatrix4(m);
  return geo;
}

// ---------- main ----------

export function createHazards3D(scene, opts) {
  const { terrain, surfaceAt, potholes, sunDir, fallen, env = null } = opts;
  const groundAt = (x, y) => terrain.heightAt(x, y);
  const group = new THREE.Group();
  scene.add(group);

  // Potholes: one static mesh, drawn always (one draw call, a few thousand triangles).
  if (potholes && potholes.length) group.add(potholeMesh(potholes, surfaceAt, sunDir));

  const vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const branches = instanced(branchGeo(), vc, MAX_DEBRIS);
  const logs = instanced(logGeo(), vc, MAX_DEBRIS);
  // Tractors keep their shapes, with the cars' sky reflections when there is
  // one; slow farm trucks are the traffic's stake-side farm truck (one mesh).
  const vm = env ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.1, envMap: env, envMapIntensity: 0.8 }) : vc;
  const tg = tractorGeo();
  const tractorPaint = instanced(tg.paint, vm, MAX_VEHICLES);
  const tractorTrim = instanced(tg.trim, vm, MAX_VEHICLES);
  const truckMesh = vehicleMesh('farmtruck', MAX_VEHICLES, env);
  const meshes = [branches, logs, tractorPaint, tractorTrim, truckMesh];
  group.add(...meshes);

  // Engine smoke: grey, darker as the engine gets worse.
  const smoke = puffs(MAX_SMOKE, 0x8e8c88, 0.6, puffTexture(), 1 / 600);
  group.add(smoke.points);
  const puffsLive = [];
  let smokeAcc = 0;

  // Fixed fallen trees: one static mesh.
  if (fallen && fallen.length) {
    const geos = fallen.map((f) => fallenGeo(f, surfaceAt, makeRng(f.id.length * 977 + Math.round(f.x))));
    const mesh = new THREE.Mesh(mergeGeometries(geos), vc);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'fallenTrees';
    group.add(mesh);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  return {
    group,
    // hz: createHazards state; car: state.car; carObj: the car's Object3D;
    // smokeLevel 0..1; wind: amb.wind.
    update(hz, dt, focus, car, carObj, smokeLevel, wind, camera, fog, renderer) {
      const fx = focus.x;
      const fz = focus.z;
      const near = (x, y) => (x - fx) * (x - fx) + (y - fz) * (y - fz) < SHOW_R * SHOW_R;

      // Debris.
      let nb = 0;
      let nl = 0;
      for (const d of hz.debris) {
        if (!near(d.x, d.y)) continue;
        const log = d.kind === 'log';
        e.set(0, -d.angle * DEG, (d.seed % 7) * 0.02);
        q.setFromEuler(e);
        p.set(d.x, surfaceAt(d.x, d.y) + 0.05, d.y);
        s.set(log ? 1 : d.len * 0.5, 1, d.len);
        m.compose(p, q, s);
        if (log && nl < MAX_DEBRIS) logs.setMatrixAt(nl++, m);
        else if (!log && nb < MAX_DEBRIS) branches.setMatrixAt(nb++, m);
      }
      branches.count = nb;
      logs.count = nl;

      // Vehicles: pitch to the ground under the front and back.
      let nt = 0;
      let nk = 0;
      s.set(1, 1, 1);
      for (const v of hz.vehicles) {
        if (!near(v.x, v.y)) continue;
        const h = v.heading * DEG;
        const sx = Math.sin(h);
        const sy = -Math.cos(h);
        const hf = surfaceAt(v.x + sx * 1.3, v.y + sy * 1.3);
        const hb = surfaceAt(v.x - sx * 1.3, v.y - sy * 1.3);
        e.set(Math.atan2(hf - hb, 2.6), -h, 0);
        q.setFromEuler(e);
        p.set(v.x, (hf + hb) / 2, v.y);
        m.compose(p, q, s);
        col.setHex(v.color);
        if (v.kind === 'truck') {
          truckMesh.setMatrixAt(nk, m);
          truckMesh.setColorAt(nk, col);
          nk++;
        } else {
          tractorPaint.setMatrixAt(nt, m);
          tractorTrim.setMatrixAt(nt, m);
          tractorPaint.setColorAt(nt, col);
          nt++;
        }
      }
      tractorPaint.count = tractorTrim.count = nt;
      truckMesh.count = nk;
      for (const mesh of meshes) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      // Engine smoke from under the bonnet: more and darker as it gets worse.
      if (dt > 0 && smokeLevel > 0) {
        smokeAcc += dt * (1.5 + 10 * smokeLevel);
        const h = car.heading * DEG;
        while (smokeAcc >= 1) {
          smokeAcc -= 1;
          if (puffsLive.length >= MAX_SMOKE) break;
          puffsLive.push({
            x: car.x + Math.sin(h) * 1.7 + (Math.random() - 0.5) * 0.6,
            y: car.y - Math.cos(h) * 1.7 + (Math.random() - 0.5) * 0.6,
            z: carObj.position.y + 0.95,
            age: 0, life: 1.4 + Math.random() * 1.2 + smokeLevel * 1.2, size: 0.25 + smokeLevel * 0.2,
            dark: 0.7 + (1 - smokeLevel) * 0.3,
          });
        }
      }
      const wdir = wind ? wind.dir : 290;
      const wsp = wind ? wind.speed : 3;
      const wx = Math.sin(wdir * DEG) * wsp;
      const wy = -Math.cos(wdir * DEG) * wsp;
      smoke.begin();
      for (let i = puffsLive.length - 1; i >= 0; i--) {
        const f = puffsLive[i];
        f.age += dt;
        if (f.age >= f.life) {
          puffsLive.splice(i, 1);
          continue;
        }
        f.z += (1.4 / (1 + f.age)) * dt;
        f.x += wx * 0.4 * dt;
        f.y += wy * 0.4 * dt;
        f.size += dt * 0.7;
        const k = f.age / f.life;
        smoke.push(f.x, f.z, f.y, f.size * 1.6, 0.55 * (1 - k) * Math.min(1, f.age * 8), f.dark + k * 0.25);
      }
      smoke.end();
      const hgt = renderer.getDrawingBufferSize(_v2).y;
      const u = smoke.mat.uniforms;
      u.scale.value = hgt / 2 / Math.tan((camera.fov * DEG) / 2);
      u.fogNear.value = fog.near;
      u.fogFar.value = fog.far;
      u.farClip.value = camera.far * 0.92;
    },
  };
}

const _v2 = new THREE.Vector2();
