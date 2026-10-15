// Draws the shared ambient life (src/ambient) in 3D: birds, traffic, animals,
// dust, chimney and campfire smoke, cloud shadows and sky clouds. Everything is
// pooled (InstancedMesh or Points), so it costs about ten draw calls in total.
// Only things near the camera focus are shown and animated.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';
import { carParts } from './car3d.js';
import { box } from './shapes.js';
import { buildSkyClouds, updateCloudUniforms } from './clouds.js';
import { FOG_COLOR } from './world3d.js';

const BIRD_R = 260; // show birds within this range of the focus
const CAR_R = 650;
const ANIMAL_R = 450;
const MAX_BIRDS = 400;
const MAX_CARS = 80;
const MAX_ANIMALS = 160;
const MAX_DUST = 500;
const MAX_SMOKE = 900;

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function instanced(geo, mat, n, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.count = 0;
  m.frustumCulled = false; // instances move all over; we cull by distance ourselves
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

// ---------- shapes ----------

function birdGeos() {
  const body = colored(new THREE.OctahedronGeometry(1, 0).scale(0.09, 0.08, 0.2), 0xffffff);
  const head = colored(new THREE.OctahedronGeometry(1, 0).scale(0.06, 0.06, 0.06).translate(0, 0.06, -0.17), 0xffffff);
  const beak = colored(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(-Math.PI / 2).translate(0, 0.05, -0.25), 0xd9a420);
  const tail = colored(new THREE.BoxGeometry(0.1, 0.015, 0.12).translate(0, 0.01, 0.22), 0xffffff);
  const wing = (s) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.08, 0, 0, 0.09, s * 0.32, 0, 0.06,
      0, 0, 0.09, 0, 0, -0.08, s * 0.32, 0, 0.06, // both faces
    ], 3));
    return colored(g, 0xffffff);
  };
  return { body: mergeGeometries([body, head, beak, tail]), left: wing(-1), right: wing(1) };
}

function cowGeo() {
  const W = 0xffffff;
  const P = 0x2a2522;
  const parts = [
    colored(box(0.85, 0.8, 1.9).translate(0, 0.65, 0), W),
    colored(box(0.87, 0.5, 0.6).translate(0.02, 0.85, 0.3), P), // patches
    colored(box(0.6, 0.55, 0.5).translate(-0.15, 0.75, -0.5), P),
    colored(box(0.4, 0.42, 0.55).translate(0, 1.05, -1.15), W), // head
    colored(box(0.3, 0.2, 0.12).translate(0, 0.92, -1.45), 0xc89a8a), // muzzle
    colored(box(0.6, 0.06, 0.06).translate(0, 1.32, -1.05), 0xd8d0c0), // horns
    colored(box(0.12, 0.1, 0.25).translate(0, 0.45, 0.6), 0xd8a0a0), // udder
  ];
  for (const [x, z] of [[-0.3, -0.75], [0.3, -0.75], [-0.3, 0.75], [0.3, 0.75]]) parts.push(colored(box(0.16, 0.65, 0.16).translate(x, 0, z), W));
  parts.push(colored(box(0.05, 0.6, 0.05).translate(0, 0.45, 0.97), P)); // tail
  return mergeGeometries(parts);
}

function sheepGeo() {
  const D = 0x2b2826;
  const parts = [
    colored(new THREE.IcosahedronGeometry(1, 1).scale(0.42, 0.38, 0.62).translate(0, 0.72, 0), 0xffffff),
    colored(box(0.24, 0.28, 0.34).translate(0, 0.85, -0.68), D),
    colored(box(0.42, 0.06, 0.1).translate(0, 0.94, -0.6), D), // ears
  ];
  for (const [x, z] of [[-0.18, -0.35], [0.18, -0.35], [-0.18, 0.35], [0.18, 0.35]]) parts.push(colored(box(0.1, 0.45, 0.1).translate(x, 0, z), D));
  return mergeGeometries(parts);
}

// One leg hanging from the hip at (x, hip, z), swung by `ang` (rad, + = foot forward).
function leg(x, z, hip, len, w, ang, coat, hoof) {
  const upper = colored(box(w, len - 0.12, w).translate(0, -(len - 0.12), 0), coat);
  const foot = colored(box(w * 1.12, 0.12, w * 1.12).translate(0, -len, 0), hoof);
  return mergeGeometries([upper, foot]).rotateX(ang).translate(x, hip, z);
}

// Horse, facing -z. Coat parts are white so the instance colour sets the coat
// (brown, chestnut, grey); mane, tail and hooves stay dark.
// legs: swing angles [front left, front right, back left, back right].
function horseGeo(legs) {
  const W = 0xffffff;
  const D = 0x3a2e26;
  const neck = (g, c) => colored(g.rotateX(-0.55).translate(0, 1.45, -0.7), c);
  const parts = [
    colored(box(0.56, 0.62, 1.7).translate(0, 0.98, 0), W),
    neck(box(0.3, 0.88, 0.42).translate(0, 0, 0), W),
    neck(box(0.08, 0.82, 0.12).translate(0, 0.06, 0.2), D), // mane
    colored(box(0.26, 0.3, 0.66).translate(0, -0.15, 0).rotateX(-0.6).translate(0, 2.08, -1.33), W), // head
    colored(box(0.06, 0.14, 0.06).translate(-0.08, 0, 0).translate(0, 2.18, -1.08), W), // ears
    colored(box(0.06, 0.14, 0.06).translate(0.08, 0, 0).translate(0, 2.18, -1.08), W),
    colored(box(0.11, 0.8, 0.13).translate(0, -0.8, 0).rotateX(-0.28).translate(0, 1.56, 0.84), D), // tail
  ];
  const [fl, fr, bl, br] = legs;
  parts.push(leg(-0.17, -0.62, 1.06, 1.06, 0.14, fl, W, 0x2a2522));
  parts.push(leg(0.17, -0.62, 1.06, 1.06, 0.14, fr, W, 0x2a2522));
  parts.push(leg(-0.17, 0.64, 1.06, 1.06, 0.15, bl, W, 0x2a2522));
  parts.push(leg(0.17, 0.64, 1.06, 1.06, 0.15, br, W, 0x2a2522));
  return mergeGeometries(parts);
}

// Deer, facing -z: light brown with a pale belly, white rump and tail.
// A raised tail (`flag`) when running.
function deerGeo(legs, flag = false) {
  const C = 0xa87a4e;
  const parts = [
    colored(box(0.34, 0.42, 1.0).translate(0, 0.74, 0), C),
    colored(box(0.28, 0.06, 0.78).translate(0, 0.72, 0), 0xe8dcc4), // belly
    colored(box(0.3, 0.26, 0.04).translate(0, 0.8, 0.5), 0xf4efe6), // rump patch
    colored(box(0.16, 0.52, 0.2).rotateX(-0.35).translate(0, 1.02, -0.42), C),
    colored(box(0.16, 0.18, 0.36).translate(0, -0.09, 0).rotateX(-0.4).translate(0, 1.55, -0.66), C), // head
    colored(box(0.06, 0.06, 0.06).translate(0, 1.42, -0.86), 0x2a2522), // nose
    colored(box(0.06, 0.15, 0.09).rotateZ(0.5).translate(-0.1, 1.62, -0.58), C), // ears
    colored(box(0.06, 0.15, 0.09).rotateZ(-0.5).translate(0.1, 1.62, -0.58), C),
    colored(box(0.11, 0.18, 0.06).translate(0, flag ? 0 : -0.18, 0).rotateX(flag ? 0.5 : 0).translate(0, 1.08, 0.52), 0xfaf8f2), // tail
  ];
  const [fl, fr, bl, br] = legs;
  parts.push(leg(-0.1, -0.38, 0.8, 0.8, 0.08, fl, C, 0x2a2522));
  parts.push(leg(0.1, -0.38, 0.8, 0.8, 0.08, fr, C, 0x2a2522));
  parts.push(leg(-0.1, 0.4, 0.8, 0.8, 0.09, bl, C, 0x2a2522));
  parts.push(leg(0.1, 0.4, 0.8, 0.8, 0.09, br, C, 0x2a2522));
  return mergeGeometries(parts);
}

function trafficGeos() {
  const { paint, trim } = carParts(null);
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 8).rotateZ(Math.PI / 2);
  const wheels = [[-0.88, -1.42], [0.88, -1.42], [-0.88, 1.38], [0.88, 1.38]]
    .map(([x, z]) => colored(wheel.clone().translate(x, 0.34, z), 0x1e1e1e));
  return { paint: mergeGeometries(paint), trim: mergeGeometries([...trim, ...wheels]) };
}

// ---------- puffs (dust and smoke) ----------

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const PUFF_VERT = `
attribute float size;
attribute float alpha;
attribute float shade;
uniform float scale;
uniform float fogNear;
uniform float fogFar;
uniform float fogAmount;
uniform float farClip;
uniform float grow;
varying float vA;
varying float vShade;
varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  float d = max( 0.5, - mv.z );
  // Far puffs (smoke as a landmark) are pulled inside the far plane, same size on screen.
  if ( d > farClip ) mv.xyz *= farClip / d;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min( 600.0, size * scale / d * ( 1.0 + grow * d ) );
  vA = alpha;
  vShade = shade;
  vFog = smoothstep( fogNear, fogFar, d ) * fogAmount;
}`;
const PUFF_FRAG = `
uniform sampler2D map;
uniform vec3 color;
uniform vec3 fogColor;
varying float vA;
varying float vShade;
varying float vFog;
void main() {
  float a = texture2D( map, gl_PointCoord ).a * vA;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( mix( color * vShade, fogColor, vFog ), a );
}`;

function puffs(max, color, fogAmount, tex, grow = 0) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const shade = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      color: { value: new THREE.Color(color) },
      fogColor: { value: new THREE.Color(FOG_COLOR) },
      fogNear: { value: 150 },
      fogFar: { value: 420 },
      fogAmount: { value: fogAmount },
      scale: { value: 500 },
      farClip: { value: 400 },
      grow: { value: grow },
    },
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  let n = 0;
  return {
    points,
    mat,
    begin() { n = 0; },
    push(x, y, z, s, a, sh = 1) {
      if (n >= max) return;
      pos[n * 3] = x;
      pos[n * 3 + 1] = y;
      pos[n * 3 + 2] = z;
      size[n] = s;
      alpha[n] = a;
      shade[n] = sh;
      n++;
    },
    end() {
      geo.setDrawRange(0, n);
      for (const k of ['position', 'size', 'alpha', 'shade']) geo.attributes[k].needsUpdate = true;
    },
  };
}

// ---------- tree tops (where perched birds sit in the 3D trees) ----------

// Height of the canopy surface above the ground at distance d from the trunk.
// Mirrors the tree shapes in trees.js.
function canopyTop(t, d) {
  const r = t.r;
  const u = Math.min(1, d / r);
  if (t.kind === 'pine') {
    const y = Math.max(0.7 + 2 * (1 - u), 1.6 + 1.7 * Math.max(0, 1 - u / 0.8), 2.5 + 1.5 * Math.max(0, 1 - u / 0.55));
    return r * 0.42 + y * r * 1.05;
  }
  if (t.kind === 'willow') return r * 0.54 + (1.3 + 0.75 * Math.sqrt(Math.max(0, 1 - u * u))) * r * 0.95;
  return r * 0.6 + (1.5 + 0.85 * Math.sqrt(Math.max(0, 1 - u * u))) * r * 0.95;
}
const perchZ = (t) => (t.kind === 'pine' ? 1.25 : t.kind === 'willow' ? 1.2 : 1.4) * t.r;

// ---------- main ----------

export function createAmbient3D(scene, opts) {
  const { terrain, surfaceAt, scenery, sunDir, campfire, chimneyFix } = opts;
  const groundAt = (x, y) => terrain.heightAt(x, y);
  const trees = scenery.trees;

  const vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const vcDouble = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

  const bg = birdGeos();
  const birdBody = instanced(bg.body, vc, MAX_BIRDS, false);
  const birdL = instanced(bg.left, vcDouble, MAX_BIRDS, false);
  const birdR = instanced(bg.right, vcDouble, MAX_BIRDS, false);

  const tg = trafficGeos();
  const carPaint = instanced(tg.paint, vc, MAX_CARS);
  const carTrim = instanced(tg.trim, vc, MAX_CARS);

  // Animals: one instanced mesh per kind and pose. Horses trot by stepping
  // through stand, diagonal pair A, stand, pair B; deer gallop between a
  // gathered and an extended pose. Instance colour tints the coat.
  const STAND = [0, 0, 0, 0];
  const herd = {
    cow: { colors: [0xffffff, 0x8a5a3a, 0x3a3030, 0xc8a070, 0xffffff], poses: [instanced(cowGeo(), vc, MAX_ANIMALS)] },
    sheep: { colors: [0xf2efe6, 0xe6dfcf, 0xfaf8f2], poses: [instanced(sheepGeo(), vc, MAX_ANIMALS)] },
    horse: {
      colors: [0x6b4226, 0x8a4b23, 0x9a9590, 0x4a3020, 0xb07a4a, 0xd8d2c8],
      poses: [STAND, [0.4, -0.3, -0.3, 0.4], [-0.3, 0.4, 0.4, -0.3]].map((l) => instanced(horseGeo(l), vc, MAX_ANIMALS)),
    },
    deer: {
      colors: [0xffffff, 0xf2e8de, 0xe8dccf],
      poses: [deerGeo(STAND), deerGeo([-0.55, -0.45, 0.6, 0.7], true), deerGeo([0.75, 0.65, -0.7, -0.6], true)]
        .map((g) => instanced(g, vc, MAX_ANIMALS)),
    },
  };
  const animalMeshes = Object.values(herd).flatMap((h) => h.poses);
  const animalCount = new Map();

  const tex = puffTexture();
  const dust = puffs(MAX_DUST, 0xd9c9a2, 1, tex);
  const smoke = puffs(MAX_SMOKE, 0xd4d4d2, 0.3, tex, 1 / 450);
  const sky = buildSkyClouds(sunDir, 40);

  const group = new THREE.Group();
  group.add(birdBody, birdL, birdR, carPaint, carTrim, ...animalMeshes, dust.points, smoke.points, sky.mesh);
  scene.add(group);

  const m = new THREE.Matrix4();
  const mw = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const p = new THREE.Vector3();
  const s1 = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  const BIRD_S = new THREE.Vector3(1.4, 1.4, 1.4);

  // Campfire smoke: ambient only does chimneys, so the campfire has its own few puffs.
  const fire = [];
  let fireT = 0;
  let time = 0;
  const fireRng = (() => {
    let s = 99;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();

  return {
    group,
    // amb: the ambient state; focus: THREE.Vector3 (camera focus); topE: 0 chase .. 1 top.
    update(amb, dt, camera, focus, fog, topE, renderer) {
      time += dt;
      const fx = focus.x;
      const fz = focus.z;
      const near = (x, y, r) => (x - fx) * (x - fx) + (y - fz) * (y - fz) < r * r;

      // Birds.
      let n = 0;
      for (const b of amb.birds) {
        if (n >= MAX_BIRDS) break;
        if (!near(b.x, b.y, BIRD_R)) continue;
        const t = trees[b.perchTree];
        let y;
        if (!b.flying && t) y = groundAt(t.x, t.y) + canopyTop(t, Math.hypot(b.x - t.x, b.y - t.y)) + 0.02;
        else {
          const k = t ? canopyTop(t, t.r * 0.4) / (perchZ(t) * 0.93) : 1;
          y = groundAt(b.x, b.y) + b.z * Math.max(1, k);
        }
        e.set(0, -b.heading * DEG, 0);
        q.setFromEuler(e);
        p.set(b.x, y, b.y);
        m.compose(p, q, BIRD_S);
        birdBody.setMatrixAt(n, m);
        const flap = b.flying ? Math.sin((b.flap || 0) * Math.PI * 2) * 0.9 + 0.1 : -1.25;
        mw.makeRotationZ(flap);
        birdL.setMatrixAt(n, mw.clone().premultiply(m));
        mw.makeRotationZ(-flap);
        birdR.setMatrixAt(n, mw.premultiply(m));
        n++;
      }
      for (const mesh of [birdBody, birdL, birdR]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (n) {
        // Dark birds with a hint of colour.
        if (!birdBody.instanceColor) {
          for (let i = 0; i < MAX_BIRDS; i++) {
            col.setHex([0x3a3430, 0x4a3a2c, 0x2e3238, 0x6a4a34][i % 4]);
            birdBody.setColorAt(i, col);
            birdL.setColorAt(i, col);
            birdR.setColorAt(i, col);
          }
        }
      }

      // Traffic.
      n = 0;
      for (const c of amb.cars) {
        if (n >= MAX_CARS) break;
        if (!near(c.x, c.y, CAR_R)) continue;
        const h = c.heading * DEG;
        const sx = Math.sin(h);
        const sy = -Math.cos(h);
        const hf = surfaceAt(c.x + sx * 1.4, c.y + sy * 1.4);
        const hb = surfaceAt(c.x - sx * 1.4, c.y - sy * 1.4);
        e.set(Math.atan2(hf - hb, 2.8), -h, 0);
        q.setFromEuler(e);
        p.set(c.x, (hf + hb) / 2, c.y);
        m.compose(p, q, s1);
        carPaint.setMatrixAt(n, m);
        carTrim.setMatrixAt(n, m);
        carPaint.setColorAt(n, col.setHex(c.color));
        n++;
      }
      carPaint.count = carTrim.count = n;
      carPaint.instanceMatrix.needsUpdate = carTrim.instanceMatrix.needsUpdate = true;
      if (carPaint.instanceColor) carPaint.instanceColor.needsUpdate = true;

      // Animals: graze with a slow nod; walk with a little bob. Horses trot
      // through their poses; running deer gallop with a bounding body.
      for (const mesh of animalMeshes) animalCount.set(mesh, 0);
      for (let i = 0; i < amb.animals.length; i++) {
        const a = amb.animals[i];
        if (!near(a.x, a.y, ANIMAL_R)) continue;
        const h = herd[a.kind] || herd.sheep;
        let pose = 0;
        let bob = a.moving ? Math.abs(Math.sin(time * 7 + i)) * 0.05 : 0;
        let pitch = a.moving ? 0 : 0.04 + Math.sin(time * 0.8 + i * 1.7) * 0.03;
        if (h.poses.length > 1 && a.moving) {
          if (a.kind === 'deer' && a.running) {
            const ph = (time * 3.4 + i * 0.37) % 1;
            pose = ph < 0.5 ? 1 : 2;
            bob = 0.08 + Math.sin(ph * Math.PI * 2) * 0.12;
            pitch = Math.sin(ph * Math.PI * 2) * 0.12;
          } else {
            const step = Math.floor((time * (a.running ? 7 : 3.5) + i * 0.61) % 4);
            pose = [1, 0, 2, 0][step];
            bob = step % 2 ? 0 : 0.05;
            pitch = 0;
          }
        }
        const mesh = h.poses[pose];
        const k = animalCount.get(mesh);
        if (k >= MAX_ANIMALS) continue;
        e.set(-pitch, -a.heading * DEG, 0);
        q.setFromEuler(e);
        p.set(a.x, groundAt(a.x, a.y) + bob, a.y);
        m.compose(p, q, s1);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, col.setHex(h.colors[i % h.colors.length]));
        animalCount.set(mesh, k + 1);
      }
      for (const mesh of animalMeshes) {
        mesh.count = animalCount.get(mesh);
        mesh.visible = mesh.count > 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }

      // Puffs: pixel scale for point sizes, fog from the scene.
      const hgt = renderer.getDrawingBufferSize(_v2).y;
      const scale = hgt / 2 / Math.tan((camera.fov * DEG) / 2);
      for (const pf of [dust, smoke]) {
        pf.mat.uniforms.scale.value = scale;
        pf.mat.uniforms.fogNear.value = fog.near;
        pf.mat.uniforms.fogFar.value = fog.far;
        pf.mat.uniforms.farClip.value = camera.far * 0.92;
      }
      dust.begin();
      for (const d of amb.dust) {
        if (!near(d.x, d.y, 400)) continue;
        const f = d.age / d.life;
        dust.push(d.x, groundAt(d.x, d.y) + (d.z || 0.3) + d.size * 0.35, d.y, d.size * 1.5, 0.8 * (1 - f) * Math.min(1, d.age * 6), 0.92);
      }
      dust.end();

      smoke.begin();
      const pushSmoke = (sx, sy, z, size, f, base) => {
        smoke.push(sx, base + z, sy, size * 1.8, 0.7 * (1 - f) * Math.min(1, f * 12 + 0.2), 0.95 - f * 0.15);
      };
      for (const s of amb.smoke) {
        if (!near(s.x, s.y, 1600)) continue;
        let sx = s.x;
        let sy = s.y;
        let base = groundAt(sx, sy);
        // Buildings whose chimney is not where the shared formula puts it.
        for (const fx2 of chimneyFix) {
          const dx = s.x - fx2.from.x;
          const dy = s.y - fx2.from.y;
          if (dx * dx + dy * dy < 45 * 45 && Math.abs(s.z - fx2.from.z) < 14) {
            sx += fx2.dx;
            sy += fx2.dy;
            base = fx2.top - fx2.from.z;
            break;
          }
        }
        pushSmoke(sx, sy, s.z, s.size, s.age / s.life, base);
      }
      // Campfire.
      if (campfire && near(campfire.x, campfire.y, 1600)) {
        fireT -= dt;
        if (fireT <= 0) {
          fireT = 0.5 + fireRng() * 0.4;
          fire.push({ x: campfire.x + (fireRng() - 0.5) * 0.4, y: campfire.y + (fireRng() - 0.5) * 0.4, z: 0.6, age: 0, life: 6 + fireRng() * 3, size: 0.5 });
        }
      }
      const wx = Math.sin((amb.wind ? amb.wind.dir : 290) * DEG) * (amb.wind ? amb.wind.speed : 3);
      const wy = -Math.cos((amb.wind ? amb.wind.dir : 290) * DEG) * (amb.wind ? amb.wind.speed : 3);
      for (let i = fire.length - 1; i >= 0; i--) {
        const s = fire[i];
        s.age += dt;
        if (s.age >= s.life) {
          fire.splice(i, 1);
          continue;
        }
        s.z += (1.2 / (1 + s.age * 0.4)) * dt;
        const drift = Math.min(1, s.age / 2) * 0.6;
        s.x += wx * drift * dt;
        s.y += wy * drift * dt;
        s.size += dt * 0.5;
        pushSmoke(s.x, s.y, s.z, s.size, s.age / s.life, campfire.h);
      }
      smoke.end();

      // Clouds: shadows near the focus; sky puffs fade out in top view.
      updateCloudUniforms(amb.clouds, fx, fz);
      sky.update(amb.clouds, camera, topE < 0.6);
    },
  };
}

const _v2 = new THREE.Vector2();
