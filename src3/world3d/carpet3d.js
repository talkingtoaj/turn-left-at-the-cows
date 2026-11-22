// Draws the roadside carpet (src/world/carpet.js) round the camera: grass
// blades that sway and shrink away with distance, pebbles on dirt roads, and
// dark tire ruts worn into the dirt roads. Three draw calls in all, no
// shadows cast.
//
//   grass:   one InstancedMesh of blade clumps (9 thin blades each). Tiles
//            come and go as the camera moves; a few new tiles are made per
//            frame. In the shader each clump bends with the wind and shrinks
//            into the ground between CARPET.fade and CARPET.radius, so there
//            is no edge. Clumps take the ground colour under them.
//   pebbles: one InstancedMesh of small stones from the same tiles.
//   ruts:    one mesh of soft dark strips along the two wheel tracks of every
//            dirt road within RUT_R, on the same rows and heights as the road
//            mesh (ground.js), remade when the camera has moved RUT_MOVE m.
//
// Also exports the wind sway (swayMaterial, WIND) that the verge weeds use
// (scatter3d.js).
//
// Dev: three.html?carpet=off leaves it out.

import * as THREE from 'three';
import { makeCarpet, TileWindow, keepShare, CARPET, TILE, GRASS_STRIDE, PEBBLE_STRIDE } from '../../src/world/carpet.js';
import { roughnessFor } from '../../src/world/roughness.js';
import { measurePolyline, pointAlong, SegIndex, bbox } from '../../src/drive/geom.js';
import { DIRT_LIFT } from './ground.js';

export const CARPET_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('carpet') !== 'off';

// Shared wind clock and direction (world x, z).
export const WIND = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.8, 0.6).normalize() } };

const BLADE_H = 0.4; // m, a clump at scale 1
const MAX_GRASS = 16000;
const MAX_PEBBLES = 3000;
const BUILD_PER_FRAME = 2; // about 1 ms each; a tile row is 9 tiles, crossed every 0.3 s at 60 mph
const RUT_R = 110; // m
const RUT_FADE = 80; // m: ruts fade out from here to RUT_R
const RUT_MOVE = 12; // m

// Wind sway and distance fade for an instanced, unit-height plant material.
// sway: tip travel in metres per metre of height. fade: [near, far] metres
// (the plant shrinks into the ground between them), or null.
export function swayMaterial(mat, sway, fade = null) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = WIND.uTime;
    sh.uniforms.uWind = WIND.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec2 uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 io = instanceMatrix[3].xyz;
  float hW = length(instanceMatrix[1].xyz);
  float bend = max(position.y, 0.0);
  bend *= bend;
  float ph = dot(io.xz, vec2(0.37, 0.29));
  float gust = 0.6 + 0.4 * sin(uTime * 0.45 + io.x * 0.021 + io.z * 0.017);
  float w = (sin(uTime * 1.7 + ph) * 0.55 + sin(uTime * 2.9 + ph * 1.9) * 0.2 + 0.45) * gust;
  vec3 off = vec3(uWind.x, 0.0, uWind.y) * (w * bend * hW * ${sway.toFixed(3)});
  transformed += inverse(mat3(instanceMatrix)) * off;
  ${fade ? `float fd = distance(io.xz, cameraPosition.xz);
  transformed *= 1.0 - smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, fd);` : ''}
}
#endif`);
    // Blades are double sided but lit by their (upward) normal on both
    // faces, like the ground under them: no dark back faces.
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize( vNormal );`);
  };
  mat.customProgramCacheKey = () => `sway${sway}${fade}`;
  return mat;
}

// A clump of nine thin blades: unit height, radius about 0.3, base at 0.
// Vertex colours: dark at the root, light and a little straw at the tip
// (multiplied by the clump's ground colour).
function clumpGeo() {
  const pos = [];
  const col = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.sin(i * 2.3) * 0.5;
    const r0 = 0.03 + 0.12 * ((i * 5) % 3) / 2;
    const lean = 0.08 + 0.12 * ((i * 3) % 4) / 3;
    const h = 0.55 + 0.45 * ((i * 7) % 5) / 4;
    const w = 0.02;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // The blade faces across its lean a little, so it reads from most sides.
    const fa = a + 1.1;
    const px = Math.cos(fa) * w;
    const pz = Math.sin(fa) * w;
    const bx = cx * r0;
    const bz = cz * r0;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + cx * lean, h, bz + cz * lean);
    const tip = 0.96 + 0.1 * ((i * 3) % 2);
    col.push(0.62, 0.68, 0.58, 0.62, 0.68, 0.58, tip, tip * 1.05, tip * 0.84);
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

  const grassMat = swayMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.16, [CARPET.fade, CARPET.radius]);
  const grass = new THREE.InstancedMesh(clumpGeo(), grassMat, MAX_GRASS);
  grass.name = 'carpet_grass';
  const pebbleMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const pebbles = new THREE.InstancedMesh(pebbleGeo(), pebbleMat, MAX_PEBBLES);
  pebbles.name = 'carpet_pebbles';
  for (const m of [grass, pebbles]) {
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
  const PEB = [new THREE.Color(0x9a9488), new THREE.Color(0xb09f80), new THREE.Color(0x7c766c), new THREE.Color(0xc4baa6)];

  // Tile -> ready-to-copy instance data (matrices and colours).
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const gn = new THREE.Vector3();
  const qr = new THREE.Quaternion();
  const makeTile = (i, j) => {
    const t = C.tile(i, j);
    const ng = t.grass.length / GRASS_STRIDE;
    const gm = new Float32Array(ng * 16);
    const gcol = new Float32Array(ng * 3);
    const rank = new Float32Array(ng);
    for (let k = 0; k < ng; k++) {
      const o = k * GRASS_STRIDE;
      const sc = t.grass[o + 4];
      // Stand square to the slope, so the clump's up normal is the ground's
      // and it lights like the ground round it.
      const x = t.grass[o];
      const z = t.grass[o + 2];
      gn.set(H(x - 1, z) - H(x + 1, z), 2, H(x, z - 1) - H(x, z + 1)).normalize();
      q.setFromUnitVectors(up, gn).multiply(qr.setFromAxisAngle(up, t.grass[o + 3]));
      m4.compose(v.set(x, t.grass[o + 1], z), q, s.set(sc, sc * BLADE_H, sc));
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
    return { gm, gcol, rank, ng, pm, pcol, np };
  };

  // Copy the tiles in view into the two meshes.
  const fill = (tiles, cx, cz) => {
    let n = 0;
    let p = 0;
    const gA = grass.instanceMatrix.array;
    const gC = grass.instanceColor.array;
    const pA = pebbles.instanceMatrix.array;
    const pC = pebbles.instanceColor.array;
    for (const t of tiles) {
      const d = cache.get(t.key);
      if (!d) continue;
      const tx = Math.max(t.i * TILE, Math.min((t.i + 1) * TILE, cx));
      const tz = Math.max(t.j * TILE, Math.min((t.j + 1) * TILE, cz));
      const keep = keepShare(Math.hypot(tx - cx, tz - cz));
      if (keep <= 0) continue;
      for (let k = 0; k < d.ng && n < MAX_GRASS; k++) {
        if (d.rank[k] >= keep) continue;
        gA.set(d.gm.subarray(k * 16, k * 16 + 16), n * 16);
        gC.set(d.gcol.subarray(k * 3, k * 3 + 3), n * 3);
        n++;
      }
      if (d.np && t.d < 34) {
        const take = Math.min(d.np, MAX_PEBBLES - p);
        pA.set(d.pm.subarray(0, take * 16), p * 16);
        pC.set(d.pcol.subarray(0, take * 3), p * 3);
        p += take;
      }
    }
    for (const [m, c] of [[grass, n], [pebbles, p]]) {
      m.count = c;
      m.visible = c > 0;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, c * 16);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges();
      m.instanceColor.addUpdateRange(0, c * 3);
      m.instanceColor.needsUpdate = true;
    }
  };

  // ---- Ruts: the dirt roads' wheel tracks.
  const ruts = buildRuts(world, terrain, R);
  if (ruts) group.add(ruts.mesh);
  // Where the camera was when the scene was last drawn: the same as the
  // update's camera in the game, but review tools (tools/shots.mjs) move the
  // camera just before drawing, and the carpet should be round that one.
  const drawn = new THREE.Vector3(NaN, 0, 0);
  if (ruts) ruts.mesh.onBeforeRender = (r, sc, cam) => drawn.copy(cam.position);

  let tiles = [];
  let dirty = false;
  let first = true;
  let lastX = 0;
  let lastZ = 0;
  const t0 = performance.now();
  return {
    object: group,
    counts: () => ({ grass: grass.count, pebbles: pebbles.count, tiles: cache.size }),
    materials: { grass: grassMat, pebble: pebbleMat },
    update(camera) {
      WIND.uTime.value = (performance.now() - t0) / 1000;
      const at = Number.isNaN(drawn.x) ? camera.position : drawn;
      const cx = at.x;
      const cz = at.z;
      const w = win.update(cx, cz);
      if (w.changed) {
        tiles = w.tiles;
        dirty = true;
        // Drop tiles well out of reach.
        const keep = new Set(tiles.map((t) => t.key));
        for (const k of cache.keys()) {
          if (keep.has(k)) continue;
          const [i, j] = k.split(',').map(Number);
          if (Math.abs((i + 0.5) * TILE - cx) > CARPET.radius + 3 * TILE || Math.abs((j + 0.5) * TILE - cz) > CARPET.radius + 3 * TILE) cache.delete(k);
        }
      }
      // After a jump (start, tow, a dev teleport) build every tile now;
      // while driving a few per frame, nearest first.
      const jump = first || Math.hypot(cx - lastX, cz - lastZ) > 3 * TILE;
      lastX = cx;
      lastZ = cz;
      first = false;
      let budget = jump ? Infinity : BUILD_PER_FRAME;
      for (const t of tiles) {
        if (budget <= 0) break;
        if (cache.has(t.key)) continue;
        cache.set(t.key, makeTile(t.i, t.j));
        budget--;
        dirty = true;
      }
      // Refill the buffers when the window moved, and once more when its
      // last missing tile is in (the missing ones are at the faded rim).
      if (dirty && (w.changed || !tiles.some((t) => !cache.has(t.key)))) {
        fill(tiles, cx, cz);
        dirty = false;
      }
      if (ruts) ruts.update(cx, cz);
    },
  };
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
  function update(cx, cz) {
    if (Math.hypot(cx - lastAt.x, cz - lastAt.z) < RUT_MOVE) return;
    lastAt.x = cx;
    lastAt.z = cz;
    let k = 0; // vertex count
    let rows = 0;
    for (const rd of roads) {
      const { bb, total, n } = rd;
      if (cx < bb.minX - RUT_R || cx > bb.maxX + RUT_R || cz < bb.minY - RUT_R || cz > bb.maxY + RUT_R) continue;
      const step = total / (n - 1);
      let prev = null;
      for (let i = 0; i < n && rows < MAX_ROWS; i++) {
        const d = step * i;
        // Not near the road's ends: the road dips under the one it meets there.
        if (d < 12 || d > total - 12) {
          prev = null;
          continue;
        }
        const p = pointAlong(rd.r.points, rd.cum, d);
        const dist = Math.hypot(p.x - cx, p.y - cz);
        if (dist > RUT_R + 2 || nearWater(p.x, p.y) || R.flatDist(p.x, p.y) < -2) {
          prev = null;
          continue;
        }
        const fade = (1 - smooth(RUT_FADE, RUT_R, dist)) * smooth(12, 20, Math.min(d, total - d));
        const cur = { d, f: fade, s: [row(rd, d, -1), row(rd, d, 1)] };
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
