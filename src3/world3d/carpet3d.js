// Draws the roadside carpet (src/world/carpet.js) round the camera: grass
// blades that sway and shrink away with distance, pebbles on dirt roads, and
// dark tire ruts worn into the dirt roads, and clover and wildflower
// patches. Five draw calls in all, no shadows cast.
//
//   grass:   one InstancedMesh of blade clumps (9 thin blades each). Tiles
//            come and go as the camera moves; a few new tiles are made per
//            frame. In the shader each clump bends with the wind and shrinks
//            into the ground between CARPET.fade and CARPET.radius, so there
//            is no edge. Clumps take the ground colour under them.
//   pebbles: one InstancedMesh of small stones from the same tiles.
//   clover:  one InstancedMesh of low clover clumps (trefoil leaves, a white
//            or red head) from the same tiles, fading like the grass.
//   flowers: one InstancedMesh of wildflower clumps from a wider window of
//            tiles (FLOWER.radius), fading out between FLOWER.fade and
//            FLOWER.radius. Stems stay green; the petals take the instance
//            colour (its kind's colour in FLOWER_KINDS).
//   ruts:    one mesh of soft dark strips along the two wheel tracks of every
//            dirt road within RUT_R, on the same rows and heights as the road
//            mesh (ground.js), remade when the camera has moved RUT_MOVE m.
//
// Also exports the wind sway (swayMaterial, WIND) that the verge weeds use
// (scatter3d.js).
//
// Dev: three.html?carpet=off leaves it out.

import * as THREE from 'three';
import {
  makeCarpet, TileWindow, keepShare, flowerKeepShare, CARPET, FLOWER, FLOWER_KINDS, TILE, GRASS_STRIDE, PEBBLE_STRIDE, CLOVER_STRIDE, FLOWER_STRIDE,
} from '../../src/world/carpet.js';
import { roughnessFor } from '../../src/world/roughness.js';
import { measurePolyline, pointAlong, SegIndex, bbox } from '../../src/drive/geom.js';
import { DIRT_LIFT } from './ground.js';

export const CARPET_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('carpet') !== 'off';

// Shared wind clock and direction (world x, z).
export const WIND = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.8, 0.6).normalize() } };

const BLADE_H = 0.62; // m, a clump at scale 1 (before per-clump height variety)
const MAX_GRASS = 16000;
const MAX_PEBBLES = 3000;
const MAX_CLOVER = 6000;
const MAX_FLOWERS = 4000;
// While driving, new tiles are built nearest first until a frame has spent
// this long on the carpet (a grass tile takes about 0.2 to 3 ms, made a few
// rows a frame; a flower tile about 0.1 ms). After a jump every tile is
// built at once.
const BUILD_MS = 1.5;
// Reach (share of CARPET.radius and FLOWER.radius) at the resolution
// scaler's lowest step: grass 32 -> 20 m, flowers 64 -> 40 m.
const REACH_MIN = 0.625;
const REACH_RATE = 0.2; // reach change per second, so the fade glides in
const REACH_STEP = 0.03; // the tile windows and buffers follow in these steps
const FILL_WAIT = 20; // frames a refill may wait for missing tiles
const RUT_R = 110; // m
const RUT_FADE = 80; // m: ruts fade out from here to RUT_R
const RUT_MOVE = 12; // m

// Wind sway and distance fade for an instanced, unit-height plant material.
// sway: tip travel in metres per metre of height. fade: [near, far] metres
// (the plant shrinks into the ground between them), or null.
export function swayMaterial(mat, sway, fade = null) {
  const prev = mat.onBeforeCompile;
  // fade as a uniform ({ value: Vector2(near, far) }) can move at run time.
  const fadeU = fade && fade.value ? fade : null;
  const fadeGlsl = fadeU ? 'uFade.x, uFade.y' : fade ? `${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}` : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uWind = WIND.uWind;
    if (fadeU) sh.uniforms.uFade = fadeU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec2 uWind;${fadeU ? '\nuniform vec2 uFade;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 io = instanceMatrix[3].xyz;
  vec3 c0 = instanceMatrix[0].xyz;
  vec3 c1 = instanceMatrix[1].xyz;
  vec3 c2 = instanceMatrix[2].xyz;
  float hW = length(c1);
  float bend = max(position.y, 0.0);
  bend *= bend;
  float ph = dot(io.xz, vec2(0.37, 0.29));
  float gust = 0.6 + 0.4 * sin(uTime * 0.45 + io.x * 0.021 + io.z * 0.017);
  float w = (sin(uTime * 1.7 + ph) * 0.55 + sin(uTime * 2.9 + ph * 1.9) * 0.2 + 0.45) * gust;
  vec3 off = vec3(uWind.x, 0.0, uWind.y) * (w * bend * hW * ${sway.toFixed(3)});
  // The world offset in the clump's own space. Instance matrices are a
  // rotation times a scale (orthogonal columns), so this is the inverse
  // without a per-vertex inverse().
  transformed += vec3(dot(c0, off) / dot(c0, c0), dot(c1, off) / dot(c1, c1), dot(c2, off) / dot(c2, c2));
  ${fade ? `float fd = distance(io.xz, cameraPosition.xz);
  transformed *= 1.0 - smoothstep(${fadeGlsl}, fd);` : ''}
}
#endif`);
    // Blades are double sided but lit by their (upward) normal on both
    // faces, like the ground under them: no dark back faces.
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize( vNormal );`);
  };
  mat.customProgramCacheKey = () => `sway${sway}${fadeU ? 'U' : fade}`;
  return mat;
}

// A clump of nine thin blades: unit height, base at 0, a tight tuft whose
// blades fan out to a radius of about 0.3. Heights run from a third to full
// so the clump has a ragged top. Vertex colours: dark at the root, light
// yellow-green at the tip (multiplied by the clump's ground colour), so the
// blades stand out from the ground texture behind them. A share of blades
// turn dry tan in the shader (grassColor).
function clumpGeo() {
  const pos = [];
  const col = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.sin(i * 2.3) * 0.5;
    const r0 = 0.012 + 0.05 * ((i * 5) % 3) / 2;
    const lean = 0.1 + 0.2 * ((i * 3) % 4) / 3;
    const h = 0.34 + 0.66 * ((i * 7) % 9) / 8;
    const w = 0.026 + 0.008 * (i % 2);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // The blade faces across its lean a little, so it reads from most sides.
    const fa = a + 1.1;
    const px = Math.cos(fa) * w;
    const pz = Math.sin(fa) * w;
    const bx = cx * r0;
    const bz = cz * r0;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + cx * lean, h, bz + cz * lean);
    // Short blades a little darker at the tip too: they sit in the tuft.
    const tip = 1.12 + 0.22 * h + 0.08 * ((i * 3) % 2);
    col.push(0.4, 0.46, 0.36, 0.4, 0.46, 0.36, tip * 0.98, tip * 1.04, tip * 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Normals straight up: blades light like the ground they grow from.
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// Some blades in each clump are dry and tan instead of the ground's green:
// which ones comes from the clump's position and the blade's index
// (gl_VertexID / 3, the geometry is not indexed), so clumps differ.
const DRY_SHARE = 0.12;
function grassColor(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
{
  float lh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  float lb = fract(lh * 7.31 + float(gl_VertexID / 3) * 0.618);
  float ldry = step(lb, ${DRY_SHARE.toFixed(2)});
  float ltip = step(0.001, position.y);
  // Dry tan, a little lighter or darker with the clump's own colour.
  vec3 ltan = mix(vec3(0.17, 0.16, 0.07), vec3(0.56, 0.5, 0.25), ltip) * (0.8 + 0.4 * lh);
  vColor.rgb = mix(vColor.rgb, ltan, ldry);
}
#endif`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}grass`;
  return mat;
}

// Wet plants (rain, src/game/wetness.js `wet`, set from main.js): darker, and
// a little sheen at a glancing view, like the wet ground.
const WET_U = { value: 0 };
function wetLook(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = WET_U;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <normal_fragment_begin>', 'diffuseColor.rgb *= 1.0 - 0.4 * uWet;\n#include <normal_fragment_begin>')
      .replace('#include <opaque_fragment>', `if (uWet > 0.001) {
  // Light falling here (what the Lambert term was lit by), sent back as a
  // grey-blue sheen, strongest at a glancing view.
  vec3 lirr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / max(diffuseColor.rgb, vec3(0.03));
  float lfr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  outgoingLight += lirr * vec3(0.8, 0.86, 0.95) * (uWet * (0.008 + 0.035 * lfr * lfr));
}
#include <opaque_fragment>`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}wet`;
  return mat;
}

// Petals take the instance colour, stems and leaves keep their own: aHead
// (0 stem, 1 petal, between for the flower's middle) picks per vertex.
function headColor(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHead;')
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.rgb = color * mix(vec3(1.0), instanceColor.rgb, aHead);
#endif`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${prevKey.call(mat)}head${key}`;
  return mat;
}

// An sRGB hex colour as linear [r, g, b] for vertex colours.
const rgb = (hex) => new THREE.Color(hex).toArray();

// Builds a plant geometry from triangles: pos (3 per vertex), col, head.
// Normals straight up, like the grass blades.
function plantGeo(pos, col, head) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// A flower head: a four-petal fan round (x, y, z), tipped toward angle ta by
// tilt, rim radius r. Four triangles; the middle vertex is half head colour.
function flowerHead(pos, col, head, x, y, z, r, ta, tilt, mid) {
  const tx = Math.cos(ta) * Math.sin(tilt);
  const tz = Math.sin(ta) * Math.sin(tilt);
  const rim = [];
  for (let k = 0; k < 4; k++) {
    const a = ta + (k / 4) * Math.PI * 2 + 0.4;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    // Tip the disc: lift the side away from the tilt, drop the side toward it.
    const lift = -(cx * tx + cz * tz) * 1.2;
    rim.push([x + cx, y + lift, z + cz]);
  }
  for (let k = 0; k < 4; k++) {
    const p = rim[k];
    const q = rim[(k + 1) % 4];
    pos.push(x, y + 0.01, z, p[0], p[1], p[2], q[0], q[1], q[2]);
    col.push(mid[0], mid[1], mid[2], 1, 1, 1, 1, 1, 1);
    head.push(0.55, 1, 1);
  }
}

// A wildflower clump: unit height, three stems with a head each and two low
// leaves. Base at 0, radius about 0.2.
function flowerGeo() {
  const pos = [];
  const col = [];
  const head = [];
  const stem0 = rgb(0x3a5524);
  const stem1 = rgb(0x587434);
  const mid = rgb(0xd9a43a);
  const N = 3;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.sin(i * 1.7) * 0.6;
    const r0 = 0.03;
    const lean = 0.07 + 0.06 * (i % 3);
    const h = 0.7 + 0.3 * ((i * 3) % 4) / 3;
    const bx = Math.cos(a) * r0;
    const bz = Math.sin(a) * r0;
    const tx = Math.cos(a) * lean;
    const tz = Math.sin(a) * lean;
    const w = 0.012;
    const fa = a + 1.4;
    pos.push(bx - Math.cos(fa) * w, 0, bz - Math.sin(fa) * w, bx + Math.cos(fa) * w, 0, bz + Math.sin(fa) * w, tx, h, tz);
    col.push(...stem0, ...stem0, ...stem1);
    head.push(0, 0, 0);
    flowerHead(pos, col, head, tx, h, tz, 0.05 + 0.012 * (i % 2), a, 0.5, mid);
  }
  // Two leaves low down.
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + 0.8;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    pos.push(-cz * 0.03, 0, cx * 0.03, cz * 0.03, 0, -cx * 0.03, cx * 0.2, 0.22, cz * 0.2);
    col.push(...stem0, ...stem0, ...stem1);
    head.push(0, 0, 0);
  }
  return plantGeo(pos, col, head);
}

// A clover clump, in metres at scale 1: four trefoil leaves (three leaflets
// each, one triangle a leaflet) a few cm up, and one head on a short stalk.
function cloverGeo() {
  const pos = [];
  const col = [];
  const head = [];
  const dark = rgb(0x2c4a20);
  const leaf = rgb(0x4d7a33);
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4;
    const d = 0.03 + 0.05 * ((i * 3) % 5) / 4;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = 0.035 + 0.012 * (i % 3);
    for (let k = 0; k < 3; k++) {
      const la = a + (k / 3) * Math.PI * 2;
      const L = 0.032;
      const w = 0.017;
      const ex = x + Math.cos(la) * L;
      const ez = z + Math.sin(la) * L;
      const px = -Math.sin(la) * w;
      const pz = Math.cos(la) * w;
      const mx = x + Math.cos(la) * L * 0.6;
      const mz = z + Math.sin(la) * L * 0.6;
      // A leaflet: a triangle widest near its tip, like a heart.
      pos.push(x, y, z, mx + px + (ex - mx) * 0.5, y + 0.005, mz + pz + (ez - mz) * 0.5, mx - px + (ex - mx) * 0.5, y + 0.005, mz - pz + (ez - mz) * 0.5);
      col.push(...dark, ...leaf, ...leaf);
      head.push(0, 0, 0);
    }
  }
  // Head: a stalk and a small round ball (crossed diamonds).
  const hx = 0.02;
  const hz = -0.015;
  const hy = 0.1;
  pos.push(-0.004, 0, 0, 0.004, 0, 0, hx, hy - 0.01, hz);
  col.push(...dark, ...dark, ...leaf);
  head.push(0, 0, 0);
  const hr = 0.017;
  for (const [ax, az] of [[hr, 0], [0, hr]]) {
    pos.push(hx, hy - hr, hz, hx + ax, hy, hz + az, hx, hy + hr, hz);
    pos.push(hx, hy - hr, hz, hx, hy + hr, hz, hx - ax, hy, hz - az);
    col.push(0.8, 0.8, 0.8, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0.8, 1, 1, 1, 1, 1, 1);
    head.push(1, 1, 1, 1, 1, 1);
  }
  return plantGeo(pos, col, head);
}

function pebbleGeo() {
  const g = new THREE.OctahedronGeometry(1, 0).toNonIndexed();
  g.scale(1, 0.55, 0.8);
  g.computeVertexNormals();
  return g;
}

// Soft rut strip texture: u across (dark in the middle, clear at the sides),
// v along (faint tread marks, patchy).
function rutTexture() {
  const W = 32;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  for (let v = 0; v < H; v++) {
    const patch = 0.75 + 0.25 * Math.sin(v * 0.11) * Math.sin(v * 0.037 + 1);
    for (let u = 0; u < W; u++) {
      const t = (u + 0.5) / W - 0.5;
      let a = Math.exp(-(t * t) / (2 * 0.17 * 0.17));
      // Tread: short bars across the track.
      const tread = Math.abs(t) < 0.28 && (v % 8) < 2 ? 0.25 : 0;
      a = Math.min(1, a * patch * (0.85 + 0.15 * Math.random()) + tread * a);
      const k = (v * W + u) * 4;
      img.data[k] = 74;
      img.data[k + 1] = 58;
      img.data[k + 2] = 40;
      img.data[k + 3] = Math.round(a * 0.5 * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// groundColor(x, y, h, out, rough, open): the terrain's own colour function
// (world3d.js), or null for a plain grass green.
export function buildCarpet(world, terrain, groundColor = null) {
  const group = new THREE.Group();
  group.name = 'carpet';
  if (!CARPET_ON || typeof document === 'undefined') return { object: group, update() {}, counts: {} };
  const R = roughnessFor(world);
  const H = (x, y) => terrain.heightAt(x, y);
  const C = makeCarpet(world, R, H, terrain.quarries || []);
  const win = new TileWindow();
  const cache = new Map();

  // Fades as uniforms: they move in when the reach shrinks (setDetail).
  const grassFade = { value: new THREE.Vector2(CARPET.fade, CARPET.radius) };
  const flowerFade = { value: new THREE.Vector2(FLOWER.fade, FLOWER.radius) };
  const grassMat = wetLook(grassColor(swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.16, grassFade)));
  const grass = new THREE.InstancedMesh(clumpGeo(), grassMat, MAX_GRASS);
  grass.name = 'carpet_grass';
  const pebbleMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const pebbles = new THREE.InstancedMesh(pebbleGeo(), pebbleMat, MAX_PEBBLES);
  pebbles.name = 'carpet_pebbles';
  const cloverMat = wetLook(headColor(swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.08, grassFade), 'clover'));
  const clover = new THREE.InstancedMesh(cloverGeo(), cloverMat, MAX_CLOVER);
  clover.name = 'carpet_clover';
  const flowerMat = wetLook(headColor(swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.2, flowerFade), 'flower'));
  const flowers = new THREE.InstancedMesh(flowerGeo(), flowerMat, MAX_FLOWERS);
  flowers.name = 'carpet_flowers';
  for (const m of [grass, pebbles, clover, flowers]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // Ground colour of a clump, with its own dry or lush lean.
  const GREEN = new THREE.Color(0x5f8f4a);
  const STRAW = new THREE.Color(0xb7ab68);
  const LUSH = new THREE.Color(0x4f8a3a);
  const gc = new THREE.Color();
  const clumpColor = (x, y, h, tint, out) => {
    if (groundColor) {
      const g = R.at(x, y);
      groundColor(x, y, h, gc, g.rough, g.open);
    } else gc.copy(GREEN);
    out.copy(gc).multiplyScalar(0.84 + 0.2 * tint);
    if (tint > 0.62) out.lerp(STRAW, (tint - 0.62) * 0.7);
    else if (tint < 0.4) out.lerp(LUSH, (0.4 - tint) * 1.2);
  };
  // Clover heads white to red; flower petals by kind, each clump a little
  // lighter or darker.
  const CLOVER_WHITE = new THREE.Color(0xf0eee4);
  const CLOVER_RED = new THREE.Color(0xc0587a);
  const KIND_COLORS = FLOWER_KINDS.map((k) => new THREE.Color(k.color));
  const CLOVER_SCALE = 2.1; // the clumps read from the chase camera
  const PEB = [new THREE.Color(0x9a9488), new THREE.Color(0xb09f80), new THREE.Color(0x7c766c), new THREE.Color(0xc4baa6)];

  // Tile -> ready-to-copy instance data (matrices and colours), each kind
  // sorted by rank, so the clumps a far tile keeps are one run at the front.
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const gn = new THREE.Vector3();
  const qr = new THREE.Quaternion();
  const makeTile = (i, j) => tileData(i, j, C.tile(i, j));
  const tileData = (i, j, t) => {
    const ng = t.grass.length / GRASS_STRIDE;
    const gm = new Float32Array(ng * 16);
    const gcol = new Float32Array(ng * 3);
    const rank = new Float32Array(ng);
    const go = byRank(t.grass, GRASS_STRIDE);
    for (let k = 0; k < ng; k++) {
      const o = go[k] * GRASS_STRIDE;
      const sc = t.grass[o + 4];
      // Stand square to the slope, so the clump's up normal is the ground's
      // and it lights like the ground round it.
      const x = t.grass[o];
      const z = t.grass[o + 2];
      gn.set(H(x - 1, z) - H(x + 1, z), 2, H(x, z - 1) - H(x, z + 1)).normalize();
      q.setFromUnitVectors(up, gn).multiply(qr.setFromAxisAngle(up, t.grass[o + 3]));
      // Each clump its own height (0.75 to 1.35), from its rank's low digits.
      const hv = 0.75 + 0.6 * ((t.grass[o + 6] * 97.3) % 1);
      m4.compose(v.set(x, t.grass[o + 1], z), q, s.set(sc, sc * BLADE_H * hv, sc));
      m4.toArray(gm, k * 16);
      clumpColor(t.grass[o], t.grass[o + 2], t.grass[o + 1], t.grass[o + 5], col);
      col.toArray(gcol, k * 3);
      rank[k] = t.grass[o + 6];
    }
    const np = t.pebbles.length / PEBBLE_STRIDE;
    const pm = new Float32Array(np * 16);
    const pcol = new Float32Array(np * 3);
    for (let k = 0; k < np; k++) {
      const o = k * PEBBLE_STRIDE;
      const sz = t.pebbles[o + 4];
      m4.compose(v.set(t.pebbles[o], t.pebbles[o + 1], t.pebbles[o + 2]), q.setFromAxisAngle(up, t.pebbles[o + 3]), s.set(sz, sz, sz));
      m4.toArray(pm, k * 16);
      const tn = t.pebbles[o + 5];
      col.copy(PEB[Math.floor(tn * PEB.length) % PEB.length]).multiplyScalar(0.85 + 0.3 * ((tn * 7.3) % 1));
      col.toArray(pcol, k * 3);
    }
    const nc = t.clover.length / CLOVER_STRIDE;
    const cm = new Float32Array(nc * 16);
    const ccol = new Float32Array(nc * 3);
    const crank = new Float32Array(nc);
    const co = byRank(t.clover, CLOVER_STRIDE);
    for (let k = 0; k < nc; k++) {
      const o = co[k] * CLOVER_STRIDE;
      const x = t.clover[o];
      const z = t.clover[o + 2];
      const sc = t.clover[o + 4] * CLOVER_SCALE;
      gn.set(H(x - 1, z) - H(x + 1, z), 2, H(x, z - 1) - H(x, z + 1)).normalize();
      q.setFromUnitVectors(up, gn).multiply(qr.setFromAxisAngle(up, t.clover[o + 3]));
      m4.compose(v.set(x, t.clover[o + 1], z), q, s.set(sc, sc, sc));
      m4.toArray(cm, k * 16);
      col.copy(CLOVER_WHITE).lerp(CLOVER_RED, t.clover[o + 5]);
      col.toArray(ccol, k * 3);
      crank[k] = t.clover[o + 6];
    }
    return { i, j, gm, gcol, rank, ng, pm, pcol, np, cm, ccol, crank, nc };
  };

  // Flower tile -> instance data.
  const makeFlowerTile = (i, j) => {
    const f = C.flowerTile(i, j);
    const n = f.length / FLOWER_STRIDE;
    const fm = new Float32Array(n * 16);
    const fcol = new Float32Array(n * 3);
    const rank = new Float32Array(n);
    const fo = byRank(f, FLOWER_STRIDE);
    for (let k = 0; k < n; k++) {
      const o = fo[k] * FLOWER_STRIDE;
      const kind = FLOWER_KINDS[f[o + 5]];
      const sc = f[o + 4];
      // Upright (flowers grow toward the light, not square to the slope).
      m4.compose(v.set(f[o], f[o + 1], f[o + 2]), q.setFromAxisAngle(up, f[o + 3]), s.set(sc * 1.1, sc * kind.h, sc * 1.1));
      m4.toArray(fm, k * 16);
      col.copy(KIND_COLORS[f[o + 5]]).multiplyScalar(0.88 + 0.24 * ((f[o + 6] * 13.7) % 1));
      col.toArray(fcol, k * 3);
      rank[k] = f[o + 6];
    }
    return { i, j, fm, fcol, rank, n };
  };

  // Reach: 1 is the full CARPET.radius and FLOWER.radius; it shrinks to
  // REACH_MIN when the resolution scaler drops a step (setDetail), and the
  // fade moves in with it. reach eases toward its target; the tile windows
  // and the buffers follow it in small steps.
  let reach = 1;
  let reachTarget = 1;
  let reachFilled = 1;

  // Copy the tiles in view into the meshes. Each tile's kept clumps are a
  // run at the front of its arrays, so this is one copy per tile and kind.
  const fill = (tiles, cx, cz) => {
    let n = 0;
    let p = 0;
    let c = 0;
    const cA = clover.instanceMatrix.array;
    const cC = clover.instanceColor.array;
    const gA = grass.instanceMatrix.array;
    const gC = grass.instanceColor.array;
    const pA = pebbles.instanceMatrix.array;
    const pC = pebbles.instanceColor.array;
    for (const t of tiles) {
      const d = cache.get(t.key);
      if (!d) continue;
      const tx = Math.max(t.i * TILE, Math.min((t.i + 1) * TILE, cx));
      const tz = Math.max(t.j * TILE, Math.min((t.j + 1) * TILE, cz));
      const keep = keepShare(Math.hypot(tx - cx, tz - cz) / reachFilled);
      if (keep <= 0) continue;
      const kg = Math.min(below(d.rank, d.ng, keep), MAX_GRASS - n);
      gA.set(d.gm.subarray(0, kg * 16), n * 16);
      gC.set(d.gcol.subarray(0, kg * 3), n * 3);
      n += kg;
      const kc = Math.min(below(d.crank, d.nc, keep), MAX_CLOVER - c);
      cA.set(d.cm.subarray(0, kc * 16), c * 16);
      cC.set(d.ccol.subarray(0, kc * 3), c * 3);
      c += kc;
      if (d.np && t.d < 34) {
        const take = Math.min(d.np, MAX_PEBBLES - p);
        pA.set(d.pm.subarray(0, take * 16), p * 16);
        pC.set(d.pcol.subarray(0, take * 3), p * 3);
        p += take;
      }
    }
    upload(grass, n);
    upload(pebbles, p);
    upload(clover, c);
  };
  // Meshes stay visible with no instances (a draw of none is skipped), so
  // their shaders compile with the rest at load, not mid-drive.
  const upload = (m, c) => {
    m.count = c;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, c * 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.clearUpdateRanges();
    m.instanceColor.addUpdateRange(0, c * 3);
    m.instanceColor.needsUpdate = true;
  };

  // Flowers: their own, wider window of tiles.
  const fwin = new TileWindow(FLOWER.radius);
  const fcache = new Map();
  const fillFlowers = (tiles, cx, cz) => {
    let n = 0;
    const A = flowers.instanceMatrix.array;
    const Cc = flowers.instanceColor.array;
    for (const t of tiles) {
      const d = fcache.get(t.key);
      if (!d || !d.n) continue;
      const tx = Math.max(t.i * TILE, Math.min((t.i + 1) * TILE, cx));
      const tz = Math.max(t.j * TILE, Math.min((t.j + 1) * TILE, cz));
      const keep = flowerKeepShare(Math.hypot(tx - cx, tz - cz) / reachFilled);
      if (keep <= 0) continue;
      const k = Math.min(below(d.rank, d.n, keep), MAX_FLOWERS - n);
      A.set(d.fm.subarray(0, k * 16), n * 16);
      Cc.set(d.fcol.subarray(0, k * 3), n * 3);
      n += k;
    }
    upload(flowers, n);
  };

  // ---- Ruts: the dirt roads' wheel tracks.
  const ruts = buildRuts(world, terrain, R);
  if (ruts) group.add(ruts.mesh);
  // Where the camera was when the scene was last drawn: the same as the
  // update's camera in the game, but review tools (tools/shots.mjs) move the
  // camera just before drawing, and the carpet should be round that one.
  const drawn = new THREE.Vector3(NaN, 0, 0);
  if (ruts) ruts.mesh.onBeforeRender = (r, sc, cam) => drawn.copy(cam.position);

  // Drop cached tiles well outside a window.
  const prune = (map, radius, cx, cz) => {
    const reachM = radius + 3 * TILE;
    for (const [k, d] of map) {
      if (Math.abs((d.i + 0.5) * TILE - cx) > reachM || Math.abs((d.j + 0.5) * TILE - cz) > reachM) map.delete(k);
    }
  };

  let tiles = [];
  let ftiles = [];
  let gmiss = []; // window tiles not built yet, nearest first
  let fmiss = [];
  let fdirty = false;
  let dirty = false;
  let gwait = 0; // frames since the window moved with the buffers not refilled
  let fwait = 0;
  let job = null; // the grass tile being made: { key, steps, done }
  let costG = 0.3; // ms, running guess of a grass tile's last step
  let costF = 0.2; // ms, a flower tile's
  let first = true;
  let lastX = 0;
  let lastZ = 0;
  let lastT = performance.now();
  const t0 = lastT;
  return {
    object: group,
    counts: () => ({ grass: grass.count, pebbles: pebbles.count, clover: clover.count, flowers: flowers.count, tiles: cache.size, flowerTiles: fcache.size, reach }),
    materials: { grass: grassMat, pebble: pebbleMat, clover: cloverMat, flower: flowerMat },
    // detail: 1 at full resolution .. 0 at the scaler's lowest step.
    // now: jump straight there (dev tools) instead of easing.
    // wet: 0 dry .. 1 soaked (src/game/wetness.js), the same value the ground uses.
    setWet(wet) {
      WET_U.value = wet;
    },
    setDetail(detail, now = false) {
      reachTarget = REACH_MIN + (1 - REACH_MIN) * Math.max(0, Math.min(1, detail));
      if (now) reach = reachTarget;
    },
    update(camera) {
      const start = performance.now();
      const dt = Math.min(0.25, (start - lastT) / 1000);
      lastT = start;
      WIND.uTime.value = (start - t0) / 1000;
      const at = Number.isNaN(drawn.x) ? camera.position : drawn;
      const cx = at.x;
      const cz = at.z;
      // Reach eases toward its target; the fade follows every frame, the
      // windows and buffers in steps of REACH_STEP.
      if (reach !== reachTarget) {
        const stepR = REACH_RATE * dt;
        reach = Math.abs(reachTarget - reach) <= stepR ? reachTarget : reach + Math.sign(reachTarget - reach) * stepR;
        if (first) reach = reachTarget;
      }
      grassFade.value.set(CARPET.fade * reach, CARPET.radius * reach);
      flowerFade.value.set(FLOWER.fade * reach, FLOWER.radius * reach);
      if (Math.abs(reach - reachFilled) >= REACH_STEP || (reach === reachTarget && reach !== reachFilled)) {
        reachFilled = reach;
        win.radius = CARPET.radius * reach;
        fwin.radius = FLOWER.radius * reach;
        win.ci = NaN; // the window is remade on this update
        fwin.ci = NaN;
      }
      const w = win.update(cx, cz);
      if (w.changed) {
        tiles = w.tiles;
        gmiss = tiles.filter((t) => !cache.has(t.key));
        dirty = true;
        prune(cache, win.radius, cx, cz);
      }
      const fw = fwin.update(cx, cz);
      if (fw.changed) {
        ftiles = fw.tiles;
        fmiss = ftiles.filter((t) => !fcache.has(t.key));
        fdirty = true;
        prune(fcache, fwin.radius, cx, cz);
      }
      // After a jump (start, tow, a dev teleport) build every tile now.
      // While driving, the nearest missing tiles (grass or flower) until this
      // frame has spent BUILD_MS.
      const jump = first || Math.hypot(cx - lastX, cz - lastZ) > 3 * TILE;
      lastX = cx;
      lastZ = cz;
      first = false;
      // A grass tile is made a few rows at a time (C.tileSteps), so one
      // tile can run over several frames; its last step (matrices and
      // colours) and a flower tile are only started if they should end
      // inside the budget, from a running guess of their cost. Each frame
      // does at least one step.
      let built = 0;
      for (;;) {
        while (gmiss.length && cache.has(gmiss[0].key)) gmiss.shift();
        while (fmiss.length && fcache.has(fmiss[0].key)) fmiss.shift();
        if (!gmiss.length && !fmiss.length) break;
        // A grass tile half made is finished first.
        if (job && !gmiss.some((g) => g.key === job.key)) job = null;
        const grassNext = gmiss.length && (job || !fmiss.length || gmiss[0].d <= fmiss[0].d);
        const tb = performance.now();
        const over = (cost) => !jump && built > 0 && tb - start + cost > BUILD_MS;
        if (grassNext) {
          if (!job) job = { t: gmiss[0], key: gmiss[0].key, steps: C.tileSteps(gmiss[0].i, gmiss[0].j), done: null };
          const t = job.t;
          if (!job.done) {
            if (over(0.15)) break;
            const r = job.steps.next();
            if (r.done) job.done = r.value;
          } else {
            if (over(costG)) break;
            cache.set(t.key, tileData(t.i, t.j, job.done));
            costG += (performance.now() - tb - costG) * 0.1;
            job = null;
            gmiss.splice(gmiss.indexOf(t), 1);
            dirty = true;
          }
        } else {
          if (over(costF)) break;
          const t = fmiss.shift();
          fcache.set(t.key, makeFlowerTile(t.i, t.j));
          costF += (performance.now() - tb - costF) * 0.1;
          fdirty = true;
        }
        built++;
      }
      // Refill the buffers (about 1 MB to upload) once the window's missing
      // tiles are in: they and the ones just left behind are at the faded
      // rim, so waiting a few frames shows nothing. A slow machine still
      // refills every FILL_WAIT frames.
      gwait = w.changed ? gwait + 1 : gwait && gwait + 1;
      fwait = fw.changed ? fwait + 1 : fwait && fwait + 1;
      if (dirty && (!gmiss.length || gwait > FILL_WAIT)) {
        fill(tiles, cx, cz);
        dirty = false;
        gwait = 0;
      }
      if (fdirty && (!fmiss.length || fwait > FILL_WAIT)) {
        fillFlowers(ftiles, cx, cz);
        fdirty = false;
        fwait = 0;
      }
      if (ruts) ruts.update(cx, cz);
    },
  };
}

// How many of the first n ranks (sorted, rising) are below keep.
function below(rank, n, keep) {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rank[mid] < keep) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Record indices of a strided array (rank at offset 6), lowest rank first.
function byRank(arr, stride) {
  const n = arr.length / stride;
  const order = new Uint32Array(n);
  for (let k = 0; k < n; k++) order[k] = k;
  return order.sort((a, b) => arr[a * stride + 6] - arr[b * stride + 6]);
}

// Rut strips along the dirt roads near the camera. Rows match the road
// mesh's rows (ground.js dirtRoadRows: every total/(n-1) m) and its points
// across (rut - 0.45, rut, rut + 0.45), so the strips lie on its vertices.
function buildRuts(world, terrain, R) {
  const water = new SegIndex(32);
  for (const c of world.creeks) water.addPolyline(c.points, c.width / 2 + 2.5, c);
  const nearWater = (x, y) => water.minDist(x, y, (sg) => sg.data.width / 2 + 2.5) < 0;
  const roads = world.roads.filter((r) => r.type !== 'paved').map((r) => {
    const cum = measurePolyline(r.points);
    const total = cum[cum.length - 1];
    return { r, cum, total, n: Math.max(2, Math.ceil(total / 1.4) + 1), bb: bbox(r.points) };
  });
  if (!roads.length) return null;
  const MAX_ROWS = 2400;
  const pos = new Float32Array(MAX_ROWS * 2 * 12 * 3);
  const uv = new Float32Array(MAX_ROWS * 2 * 12 * 2);
  const alpha = new Float32Array(MAX_ROWS * 2 * 12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aFade', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshLambertMaterial({
    map: rutTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'ruts';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'carpet_ruts';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;

  const LIFT = DIRT_LIFT + 0.012;
  const ACROSS = [-0.45, 0, 0.45];
  const lastAt = { x: Infinity, z: Infinity };
  const row = (rd, d, side) => {
    const { r, cum, total } = rd;
    const p = pointAlong(r.points, cum, d);
    const a = pointAlong(r.points, cum, Math.max(0, d - 1.5));
    const b = pointAlong(r.points, cum, Math.min(total, d + 1.5));
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rut = r.width * 0.22 * side;
    return ACROSS.map((o) => {
      const x = p.x - dy * (rut + o);
      const y = p.y + dx * (rut + o);
      return [x, terrain.heightAt(x, y) + LIFT, y];
    });
  };
  // A road's row centres, and whether a row can carry ruts at all (not near
  // its ends, where the road dips under the one it meets, nor by water or a
  // flat feature). Worked out once per road, the first time it is near.
  const rowsOf = (rd) => {
    if (rd.px) return;
    const { total, n } = rd;
    const step = total / (n - 1);
    rd.px = new Float32Array(n);
    rd.py = new Float32Array(n);
    rd.ok = new Uint8Array(n);
    rd.s = new Array(n); // rut points per row, made when first needed
    const pts = rd.r.points;
    const cum = rd.cum;
    let sg = 1; // walks along the segments (pointAlong, without its search)
    for (let i = 0; i < n; i++) {
      const d = step * i;
      while (sg < cum.length - 1 && cum[sg] < d) sg++;
      const t = Math.max(0, Math.min(1, (d - cum[sg - 1]) / (cum[sg] - cum[sg - 1] || 1)));
      const p = { x: pts[sg - 1][0] + (pts[sg][0] - pts[sg - 1][0]) * t, y: pts[sg - 1][1] + (pts[sg][1] - pts[sg - 1][1]) * t };
      rd.px[i] = p.x;
      rd.py[i] = p.y;
      rd.ok[i] = d >= 12 && d <= total - 12 && !nearWater(p.x, p.y) && !(R.flatDist(p.x, p.y) < -2) ? 1 : 0;
    }
  };
  function update(cx, cz) {
    if (Math.hypot(cx - lastAt.x, cz - lastAt.z) < RUT_MOVE) return;
    lastAt.x = cx;
    lastAt.z = cz;
    let k = 0; // vertex count
    let rows = 0;
    for (const rd of roads) {
      const { bb, total, n } = rd;
      if (cx < bb.minX - RUT_R || cx > bb.maxX + RUT_R || cz < bb.minY - RUT_R || cz > bb.maxY + RUT_R) continue;
      rowsOf(rd);
      const step = total / (n - 1);
      let prev = null;
      for (let i = 0; i < n && rows < MAX_ROWS; i++) {
        const d = step * i;
        const dist = Math.hypot(rd.px[i] - cx, rd.py[i] - cz);
        if (!rd.ok[i] || dist > RUT_R + 2) {
          prev = null;
          continue;
        }
        const fade = (1 - smooth(RUT_FADE, RUT_R, dist)) * smooth(12, 20, Math.min(d, total - d));
        if (!rd.s[i]) rd.s[i] = [row(rd, d, -1), row(rd, d, 1)];
        const cur = { d, f: fade, s: rd.s[i] };
        rows++;
        if (prev) {
          for (let sd = 0; sd < 2; sd++) {
            const A = prev.s[sd];
            const B = cur.s[sd];
            for (let c = 0; c < 2; c++) {
              const quad = [[A[c], c / 2, prev], [A[c + 1], (c + 1) / 2, prev], [B[c + 1], (c + 1) / 2, cur], [A[c], c / 2, prev], [B[c + 1], (c + 1) / 2, cur], [B[c], c / 2, cur]];
              for (const [pt, u, rw] of quad) {
                pos[k * 3] = pt[0];
                pos[k * 3 + 1] = pt[1];
                pos[k * 3 + 2] = pt[2];
                uv[k * 2] = u;
                uv[k * 2 + 1] = rw.d / 4;
                alpha[k] = rw.f;
                k++;
              }
            }
          }
        }
        prev = cur;
      }
    }
    geo.setDrawRange(0, k);
    for (const name of ['position', 'uv', 'aFade']) {
      const at = geo.attributes[name];
      at.clearUpdateRanges();
      at.addUpdateRange(0, k * at.itemSize);
      at.needsUpdate = true;
    }
  }
  return { mesh, update };
}

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
