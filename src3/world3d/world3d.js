// Builds the whole static 3D world: sky, lights, terrain, ground features,
// buildings, landmarks, trees, signs and locals.

import * as THREE from 'three';
import { pointInPolygon, distToPolygonEdge, bbox, SegIndex, distToSegment } from '../../src/drive/geom.js';
import { Terrain, makeNoise, smoothstep, quarryPit } from './terrain.js';
import { buildFields, buildMailboxes, buildProps, buildPowerLines, buildStones } from './fields3d.js';
import { Batcher } from './batch.js';
import { buildGround, DECK_TOP } from './ground.js';
import { buildStructures } from './structures.js';
import { buildSigns, buildLocals } from './props.js';
import { buildTrees } from './trees.js';
import { GroundPaint, paintedMaterials, stripeTint } from './paint.js';

export const FOG_COLOR = 0xcdd9de;
const SKY_TOP = 0x86acd4;

// Morning sun in the east-south-east, fairly low. Unit vector towards the sun.
// three.js: +x east, +z south, +y up.
const SUN_AZ = 112; // degrees from north, clockwise
const SUN_EL = 30;
export const SUN_DIR = new THREE.Vector3(
  Math.sin((SUN_AZ * Math.PI) / 180) * Math.cos((SUN_EL * Math.PI) / 180),
  Math.sin((SUN_EL * Math.PI) / 180),
  -Math.cos((SUN_AZ * Math.PI) / 180) * Math.cos((SUN_EL * Math.PI) / 180),
);

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(232,232,232)';
  g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  // Soft blotches, wrapped so the tile repeats without seams.
  for (let i = 0; i < 500; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 2 + r() * 9;
    const v = Math.round(195 + r() * 60);
    g.fillStyle = `rgba(${v},${v},${Math.round(v * 0.96)},0.55)`;
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        g.beginPath();
        g.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Little grass strokes.
  for (let i = 0; i < 1400; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const v = Math.round(150 + r() * 80);
    g.strokeStyle = `rgba(${v},${v + 10},${v - 20},0.6)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Gradient sky on a small dome that follows the camera and is drawn first,
// behind everything, so it is never clipped by the far plane.
function buildSky() {
  const geo = new THREE.SphereGeometry(10, 24, 12);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(FOG_COLOR);
  const top = new THREE.Color(SKY_TOP);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 10);
    c.lerpColors(horizon, top, Math.pow(t, 0.6));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false,
  }));
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  // Centre the dome on whichever camera draws it, right before it is drawn.
  // A camera more than 10 m from the dome's centre would be outside it and
  // see the flat background with the dome's hard edge across the sky (this
  // is what pinned review cameras hit when the dome only followed the chase camera).
  mesh.onBeforeRender = (r, s, cam) => {
    mesh.position.setFromMatrixPosition(cam.matrixWorld);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

// Everything placed on the terrain: ground features, fields, props, buildings,
// landmarks, signs, trees and locals. Static pieces go into `batch`. The world
// checker (tools/check-world.mjs) calls this too, with batch.audit set.
export function buildObjects(world, scenery, terrain, batch, materials = {}) {
  buildGround(world, scenery, terrain, batch);
  buildFields(world, terrain, batch, scenery);
  buildProps(world, terrain, batch);
  const wires = buildPowerLines(world, terrain, batch);
  buildMailboxes(world, terrain, batch);
  const chimneys = new Map();
  const dynamic = buildStructures(world, terrain, batch, materials, { chimneys });
  buildSigns(world, terrain, batch);
  buildStones(terrain, batch); // last: stones join the buckets already there
  const trees = buildTrees(scenery, terrain, SUN_DIR, batch.audit);
  const locals = buildLocals(world, terrain, batch.audit);
  return { wires, chimneys, dynamic, trees, locals };
}

export function buildWorld3D(scene, world, scenery, collider) {
  const t0 = performance.now();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 150, 420);
  const sky = buildSky();
  scene.add(sky);

  // Lights: soft sky fill plus the morning sun, which casts shadows near the camera.
  const hemi = new THREE.HemisphereLight(0xdde8f5, 0x5d6a48, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 500;
  scene.add(sun, sun.target);

  const terrain = new Terrain(world);
  const t1 = performance.now();

  const materials = {
    lambert: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    ground: new THREE.MeshLambertMaterial({
      vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    water: new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 60, specular: 0x556677, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }),
    glowTex: glowTexture(),
  };

  // Ground colours: grass with patches, forest floor, muddy creek banks, sandy lake shore.
  const noise = makeNoise(world.seed + 55);
  const C = (h) => new THREE.Color(h);
  const GRASS = C(0x5f8f4a);
  const GRASS_DRY = C(0x86965a);
  const SCRUB_DRY = C(0x9a9a5c);
  const SCRUB_DARK = C(0x4d6a36);
  const FOREST = C(0x4b7240);
  const MUD = C(0x6c6444);
  const BED = C(0x4f4a36);
  const SAND = C(0xb3a374);
  const ROCK = C(0xa8a49b);
  const ROCK_FACE = C(0x77736c);
  const RAMP = C(0xc8bea8);
  const forests = world.forests.map((f) => ({ ...f, bb: bbox(f.polygon) }));
  const lakes = world.lakes.map((l) => ({ ...l, bb: bbox(l.polygon) }));
  const banks = new SegIndex(32);
  for (const c of world.creeks) banks.addPolyline(c.points, c.width / 2 + 9, c);
  const colorFn = (x, y, h, out, rough = 0) => {
    const n = noise(x / 70, y / 70) * 0.65 + noise(x / 18 + 9, y / 18) * 0.35;
    out.copy(GRASS).multiplyScalar(0.92 + n * 0.12);
    out.lerp(GRASS_DRY, smoothstep(10, 30, h) * 0.45 + Math.max(0, n) * 0.15);
    // Rough meadow and scrub: patchy, tussocky, olive and straw.
    const sk = smoothstep(0.6, 0.95, rough);
    if (sk > 0) {
      const p = noise(x / 7 + 31, y / 7) * 0.6 + noise(x / 3.1, y / 3.1 + 17) * 0.4;
      out.lerp(p > 0 ? SCRUB_DRY : SCRUB_DARK, sk * (0.25 + 0.5 * Math.min(1, Math.abs(p) * 2.2)));
    }
    for (const f of forests) {
      if (x < f.bb.minX - 16 || x > f.bb.maxX + 16 || y < f.bb.minY - 16 || y > f.bb.maxY + 16) continue;
      const inside = pointInPolygon(x, y, f.polygon);
      const d = distToPolygonEdge(x, y, f.polygon);
      const k = inside ? 1 : 1 - smoothstep(0, 16, d);
      if (k > 0) out.lerp(FOREST, k);
    }
    let bankK = 0;
    for (const s of banks.near(x, y)) {
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      const half = s.data.width / 2;
      if (d < half + 9) bankK = Math.max(bankK, 1 - smoothstep(half + 2, half + 9, d));
    }
    if (bankK > 0) out.lerp(MUD, bankK);
    for (const l of lakes) {
      if (x < l.bb.minX - 8 || x > l.bb.maxX + 8 || y < l.bb.minY - 8 || y > l.bb.maxY + 8) continue;
      const inside = pointInPolygon(x, y, l.polygon);
      if (inside) out.lerp(SAND, 1);
      else {
        const d = distToPolygonEdge(x, y, l.polygon);
        if (d < 8) out.lerp(SAND, 1 - smoothstep(3, 8, d));
      }
    }
    for (const q of terrain.quarries) {
      if (Math.abs(x - q.x) > q.r * 1.2 || Math.abs(y - q.y) > q.r * 1.2) continue;
      const pit = quarryPit(q, x, y);
      if (pit) {
        out.copy(pit.ramp ? RAMP : pit.wall ? ROCK_FACE : ROCK).multiplyScalar(0.94 + n * 0.1 + (pit.level % 2) * 0.04);
        return;
      }
      const d = Math.hypot(x - q.x, y - q.y);
      if (d < q.r * 1.2) out.lerp(ROCK, (1 - smoothstep(q.r * 0.95, q.r * 1.2, d)) * 0.6);
    }
    if (h < -0.4) out.lerp(BED, smoothstep(-0.4, -1.2, h));
  };
  const batch = new Batcher();
  batch.paint = new GroundPaint(world);
  const { wires, chimneys, dynamic, trees, locals } = buildObjects(world, scenery, terrain, batch, materials);
  const t2 = performance.now();
  // Ground mesh, with fields and yards painted on (after the objects, which paint).
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTexture() });
  const hayTint = stripeTint(0xd2c38a, 0xb9a86c);
  const ground = terrain.buildMeshes(paintedMaterials(terrainMat, batch.paint, hayTint), colorFn);
  scene.add(ground);
  if (wires) scene.add(wires);
  const objects = batch.build(materials);
  scene.add(objects);
  for (const d of dynamic) scene.add(d.object);
  scene.add(trees.object);
  scene.add(locals.object);
  const t3 = performance.now();
  console.info(`[3d] terrain ${Math.round(t1 - t0)} ms, objects ${Math.round(t2 - t1)} ms, ground mesh ${Math.round(t3 - t2)} ms, ${batch.paint.chunks.size} painted chunks`);

  // Surface height the car rests on: bridge decks, else the ground.
  const surfaceAt = (x, y) => (collider.onIntactBridge(x, y) ? DECK_TOP : Math.max(terrain.heightAt(x, y), -0.2));

  return {
    terrain,
    chimneys, // building id -> { x, y, top } for models whose chimney is not the house formula
    locals,
    sun,
    sky,
    surfaceAt,
    // For the look test (src3/look): lights and meshes it restyles.
    hemi,
    ground,
    objects,
    trees,
    // Per frame: animated bits and the sun's shadow box following `focus`.
    update(time, dt, car, focus, shadowRadius, camera, amb) {
      for (const d of dynamic) d.update(time);
      locals.update(car, dt, amb);
      sky.position.copy(camera.position);
      trees.update(camera, focus, shadowRadius);
      // Shadow box around the focus, snapped to texels to stop shimmering.
      sc.left = -shadowRadius;
      sc.right = shadowRadius;
      sc.top = shadowRadius;
      sc.bottom = -shadowRadius;
      const texel = (shadowRadius * 2) / sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      sun.target.position.set(fx, focus.y, fz);
      sun.position.set(fx + SUN_DIR.x * 250, focus.y + SUN_DIR.y * 250, fz + SUN_DIR.z * 250);
      if (sc.userData.r !== shadowRadius) {
        sc.userData.r = shadowRadius;
        sc.updateProjectionMatrix();
      }
    },
  };
}
