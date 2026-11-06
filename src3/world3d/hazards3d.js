// Draws road hazards and damage in 3D: potholes (one static mesh), fallen
// branches and logs, tractors and farm trucks (instanced), mission fallen
// trees across roads, and smoke from a damaged engine. Hazard animals are
// drawn by ambient3d with the herd meshes (pass hz.animals to its update).
// About seven draw calls in all, most of them empty most of the time.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG, makeRng } from '../../src/drive/geom.js';
import { box } from './shapes.js';
import { colored, instanced, puffs, puffTexture } from './ambient3d.js';

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

// Old farm pickup with a flat bed.
function truckGeo() {
  const P = 0xeeeeee;
  const paint = [
    colored(box(1.9, 0.6, 1.6).translate(0, 0.45, -1.5), P), // bonnet
    colored(box(1.9, 1.1, 1.3).translate(0, 0.45, -0.1), P), // cab body
    colored(box(1.95, 0.5, 2.3).translate(0, 0.45, 1.6), P), // bed sides
  ];
  const trim = [
    colored(box(1.7, 0.5, 1.1).translate(0, 1.4, -0.12), 0x2c3a44), // cab glass
    colored(box(1.8, 0.08, 1.2).translate(0, 1.9, -0.1), 0xdddddd),
    colored(box(1.7, 0.08, 2.1).translate(0, 0.62, 1.6), 0x6a4e34), // wooden bed floor
    colored(box(1.95, 0.2, 0.2).translate(0, 0.35, -2.35), 0x888888), // bumper
    colored(box(0.3, 0.16, 0.05).translate(-0.6, 0.78, -2.31), 0xfff3c4),
    colored(box(0.3, 0.16, 0.05).translate(0.6, 0.78, -2.31), 0xfff3c4),
    colored(box(0.6, 0.5, 0.5).translate(0.3, 0.68, 1.9), 0xc9b26a), // a hay bale in the back
    wheelGeo(0.42, 0.3, -0.92, -1.45), wheelGeo(0.42, 0.3, 0.92, -1.45),
    wheelGeo(0.42, 0.3, -0.92, 1.5), wheelGeo(0.42, 0.3, 0.92, 1.5),
  ];
  return { paint: mergeGeometries(paint), trim: mergeGeometries(trim) };
}

// A fallen tree across the road: trunk along +x from -len/2 to len/2, root
// plate on the -x end (or +x when canopySide is -1), crown on the other.
function fallenTreeGeo(b, rng) {
  const len = b.len;
  const half = len / 2;
  const c = b.canopySide;
  const BARK = 0x5a4532;
  const parts = [];
  // Trunk, slightly tapering toward the crown.
  const trunk = new THREE.CylinderGeometry(0.32, 0.46, len + 1.2, 8).rotateZ(Math.PI / 2);
  if (c < 0) trunk.rotateY(Math.PI);
  parts.push(colored(trunk.translate(0, 0.42, 0), BARK));
  // Root plate: an upturned disc of earth and roots.
  const plate = new THREE.CylinderGeometry(1.5, 1.6, 0.45, 9).rotateZ(Math.PI / 2).translate(-c * (half + 0.6), 1.2, 0);
  parts.push(colored(plate, 0x5d4a33));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(colored(new THREE.CylinderGeometry(0.05, 0.1, 1.1, 4).rotateX(a).translate(-c * (half + 0.95), 1.2 + Math.cos(a) * 0.6, Math.sin(a) * 0.6), 0x4a3a28));
  }
  // Broken branches along the trunk.
  for (let k = 0; k < 5; k++) {
    const t = (rng() - 0.3) * half;
    const side = rng() < 0.5 ? -1 : 1;
    parts.push(colored(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 4).rotateX(side * (0.6 + rng() * 0.5)).translate(c * t, 0.7, side * 0.5), BARK));
  }
  // Crown: leafy blobs lying on their side past the road edge.
  const LEAF = [0x4f7a3a, 0x5d8a42, 0x47703a];
  for (let k = 0; k < 7; k++) {
    const t = half + 0.8 + rng() * 5.5;
    const r = 1.1 + rng() * 0.9;
    const g = new THREE.IcosahedronGeometry(r, 0).scale(1.1, 0.75, 1).translate(c * t, r * 0.6, (rng() - 0.5) * 3.2);
    parts.push(colored(g, LEAF[k % LEAF.length]));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// Windthrow brush along a blocker's line (b.extra circles): heaps of
// broken limbs and dead leaves, built in world space on the ground.
function brushGeo(extra, groundAt, rng) {
  const LEAF = [0x5f6b3a, 0x6e6a3c, 0x4f6235, 0x7a6a44];
  const parts = [];
  for (const e of extra) {
    const y0 = groundAt(e.x, e.y);
    const n = 2 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const r = e.r * (0.55 + rng() * 0.35);
      const ox = (rng() - 0.5) * e.r;
      const oz = (rng() - 0.5) * e.r;
      const g = new THREE.IcosahedronGeometry(r, 0).scale(1, (e.h || 1) / r * 0.7, 1).rotateY(rng() * 6).translate(e.x + ox, y0 + (e.h || 1) * 0.35, e.y + oz);
      parts.push(colored(g, LEAF[Math.floor(rng() * LEAF.length)]));
    }
    for (let k = 0; k < 3; k++) {
      const len = e.r * (1.2 + rng());
      const g = new THREE.CylinderGeometry(0.05, 0.11, len, 4)
        .rotateZ(Math.PI / 2 - 0.3 + rng() * 0.6).rotateY(rng() * 6)
        .translate(e.x + (rng() - 0.5) * e.r, y0 + 0.25 + rng() * (e.h || 1) * 0.6, e.y + (rng() - 0.5) * e.r);
      parts.push(colored(g, 0x5a4532));
    }
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// ---------- main ----------

export function createHazards3D(scene, opts) {
  const { terrain, surfaceAt, potholes, sunDir } = opts;
  const groundAt = (x, y) => terrain.heightAt(x, y);
  const group = new THREE.Group();
  scene.add(group);

  // Potholes: one static mesh, drawn always (one draw call, a few thousand triangles).
  if (potholes && potholes.length) group.add(potholeMesh(potholes, surfaceAt, sunDir));

  const vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const branches = instanced(branchGeo(), vc, MAX_DEBRIS);
  const logs = instanced(logGeo(), vc, MAX_DEBRIS);
  const tg = tractorGeo();
  const tractorPaint = instanced(tg.paint, vc, MAX_VEHICLES);
  const tractorTrim = instanced(tg.trim, vc, MAX_VEHICLES);
  const kg = truckGeo();
  const truckPaint = instanced(kg.paint, vc, MAX_VEHICLES);
  const truckTrim = instanced(kg.trim, vc, MAX_VEHICLES);
  const meshes = [branches, logs, tractorPaint, tractorTrim, truckPaint, truckTrim];
  group.add(...meshes);

  // Engine smoke: grey, darker as the engine gets worse.
  const smoke = puffs(MAX_SMOKE, 0x8e8c88, 0.6, puffTexture(), 1 / 600);
  group.add(smoke.points);
  const puffsLive = [];
  let smokeAcc = 0;

  // Fallen trees from mission data.
  const blockerGroup = new THREE.Group();
  group.add(blockerGroup);
  let blockerKey = '';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  function setBlockers(list) {
    const key = list.map((b) => `${b.id}:${b.x.toFixed(1)}:${b.y.toFixed(1)}`).join('|');
    if (key === blockerKey) return;
    blockerKey = key;
    for (const ch of blockerGroup.children) ch.geometry.dispose();
    blockerGroup.clear();
    for (const b of list) {
      const rng = makeRng(b.id.length * 977 + Math.round(b.x));
      const mesh = new THREE.Mesh(fallenTreeGeo(b, rng), vc);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Trunk along +x in model space; turn it to the blocker's heading.
      // Rest on the lower of the middle and the ends, tilted to the ground.
      const ux = Math.sin(b.angle * DEG);
      const uy = -Math.cos(b.angle * DEG);
      const half = b.len / 2;
      const h0 = surfaceAt(b.x - ux * half, b.y - uy * half);
      const h1 = surfaceAt(b.x + ux * half, b.y + uy * half);
      const hm = surfaceAt(b.x, b.y);
      mesh.position.set(b.x, Math.min(hm, (h0 + h1) / 2), b.y);
      mesh.rotation.order = 'YZX';
      mesh.rotation.y = -(b.angle - 90) * DEG;
      mesh.rotation.z = Math.atan2(h1 - h0, b.len);
      blockerGroup.add(mesh);
      if (b.extra && b.extra.length) {
        const brush = new THREE.Mesh(brushGeo(b.extra, surfaceAt, rng), vc);
        brush.castShadow = true;
        brush.receiveShadow = true;
        blockerGroup.add(brush);
      }
    }
  }

  return {
    group,
    setBlockers,
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
          truckPaint.setMatrixAt(nk, m);
          truckTrim.setMatrixAt(nk, m);
          truckPaint.setColorAt(nk, col);
          nk++;
        } else {
          tractorPaint.setMatrixAt(nt, m);
          tractorTrim.setMatrixAt(nt, m);
          tractorPaint.setColorAt(nt, col);
          nt++;
        }
      }
      tractorPaint.count = tractorTrim.count = nt;
      truckPaint.count = truckTrim.count = nk;
      for (const mesh of meshes) {
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      setBlockers(hz.blockers);

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
