// Cloud shadows (#96): big soft shadows slide over every lit material (ground,
// roads, grass, buildings, trees) as scrolling noise in world space, done in
// a small shader patch: no extra draw call, no shadow map. The weather sets
// how dark and how wide they are (cloudShadowMath.js); the wind slides them.
// ?cloudshadows=off turns them off. Plus cloud puffs in the sky.

import * as THREE from 'three';
import { cloudShadowParams, thresholdFor, advanceOffset } from './cloudShadowMath.js';

export const MAX_CLOUDS = 10;

export const cloudUniforms = {
  uCloudOff: { value: new THREE.Vector2(0, 0) }, // metres the pattern has slid
  uCloudAmt: { value: 0 }, // how dark a shadow is; 0 skips the whole thing
  uCloudThr: { value: 0.6 }, // noise level above which the land is shaded
};

let enabled = true;
export function setCloudShadowsEnabled(on) { enabled = !!on; }

// Cloud cover, 0..1 (the weather sets it; 1 = every ambient cloud). The sky
// puffs use it; the shadows use it for how much land is covered.
export const cloudCover = { value: 1 };
const weatherNow = { cover: 1, grey: 0, rain: 0 };

// Called when the weather changes (src3/look/look.js).
export function setCloudWeather(cover, grey, rain) {
  cloudCover.value = cover;
  weatherNow.cover = cover;
  weatherNow.grey = grey;
  weatherNow.rain = rain;
  const p = cloudShadowParams(cover, grey, rain);
  cloudUniforms.uCloudAmt.value = p.amt;
  cloudUniforms.uCloudThr.value = thresholdFor(p.frac);
}

// Every frame: slide the pattern with the wind.
export function tickCloudShadows(wind, dt) {
  advanceOffset(cloudUniforms.uCloudOff.value, wind ? wind.dir : 290, wind ? wind.speed : 3, dt);
}

const VERT_HEAD = 'varying vec2 vCloudXZ;\n';
const VERT_BODY = `
  vec4 cloudW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cloudW = instanceMatrix * cloudW;
  #endif
  cloudW = modelMatrix * cloudW;
  vCloudXZ = cloudW.xz;
`;
const FRAG_HEAD = `
varying vec2 vCloudXZ;
uniform vec2 uCloudOff;
uniform float uCloudAmt;
uniform float uCloudThr;
float cloudHash( vec2 i ) { return fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cloudNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cloudHash( i ), cloudHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( cloudHash( i + vec2( 0.0, 1.0 ) ), cloudHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// 0 in sun, 1 in the middle of a shadow. Shapes about 260, 110 and 45 m across.
float cloudShade( vec2 p ) {
  vec2 q = p - uCloudOff;
  float n = 0.62 * cloudNoise( q / 260.0 ) + 0.28 * cloudNoise( q / 110.0 + 31.7 ) + 0.10 * cloudNoise( q / 45.0 + 9.3 );
  n = ( n - 0.5 ) * 2.2 + 0.5;
  return smoothstep( uCloudThr - 0.1, uCloudThr + 0.1, n );
}
`;
const FRAG_BODY = `
if ( uCloudAmt > 0.0 ) gl_FragColor.rgb *= 1.0 - uCloudAmt * cloudShade( vCloudXZ ) * vec3( 1.0, 0.92, 0.82 );
#include <fog_fragment>`;

// Patch one lit material in place (once).
export function addCloudShadows(mat) {
  if (!enabled || !mat || mat.userData.clouds) return;
  if (!(mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
  if (mat.fog === false) return;
  mat.userData.clouds = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, cloudUniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <fog_fragment>', FRAG_BODY);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|clouds2`;
  mat.needsUpdate = true;
}

export function addCloudShadowsTo(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material.forEach(addCloudShadows);
    else addCloudShadows(o.material);
  });
}

// The ambient clouds still move (the sky puffs use them); their shadows are
// the noise above now.
export function updateCloudUniforms() {}

// Sky clouds: white low-poly puffs. Each sits up in the sky where its shadow
// would fall on the ambient shadow ellipse. Drawn shrunk towards the camera so
// they never hit the far plane, before everything else, without depth.
export function buildSkyClouds(sunDir, count) {
  const parts = [];
  const rng = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.45 + rng() * 0.25;
    const s = 0.35 + rng() * 0.25;
    parts.push(new THREE.IcosahedronGeometry(1, 1)
      .scale(s, s * 0.9, s)
      .translate(Math.cos(a) * r, (rng() - 0.3) * 0.25, Math.sin(a) * r));
  }
  const geo = mergeSimple(parts);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: 0x9aa6b4, flatShading: true, fog: false, depthTest: false, depthWrite: false,
  }); // opaque on purpose: opaque objects draw in renderOrder, so the world covers these
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = -999;
  mesh.count = 0;
  const HEIGHT = 170;
  const K = 0.02;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    update(clouds, camera, visible) {
      mesh.visible = visible;
      if (!visible) return;
      let n = 0;
      const cam = camera.position;
      const along = HEIGHT / sunDir.y; // the sun is a live vector (one per mission)
      for (const c of clouds) {
        if (n >= count) break;
        const cx = c.x + sunDir.x * along;
        const cz = c.y + sunDir.z * along;
        const dx = cx - cam.x;
        const dz = cz - cam.z;
        if (dx * dx + dz * dz > 1500 * 1500) continue;
        p.set(cam.x + dx * K, cam.y + (HEIGHT - cam.y) * K, cam.z + dz * K);
        q.setFromAxisAngle(up, (-(c.angle || 0) * Math.PI) / 180);
        sc.set(c.rx * 0.8 * K, 26 * K, c.ry * 0.8 * K);
        m.compose(p, q, sc);
        mesh.setMatrixAt(n++, m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function mergeSimple(geos) {
  const pos = [];
  for (const g of geos) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
