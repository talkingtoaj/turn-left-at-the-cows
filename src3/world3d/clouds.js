// Cloud shadows: soft dark ellipses darken every lit material (ground, roads,
// buildings, trees) via a small shader patch, plus cloud puffs in the sky.

import * as THREE from 'three';

export const MAX_CLOUDS = 10;
const DARK = 0.3;

export const cloudUniforms = {
  uClouds: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uCloudRot: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector2(1, 0)) },
  uCloudDark: { value: DARK },
};

// Cloud cover, 0..1 (the weather sets it; 1 = every ambient cloud). Each
// cloud has its own threshold, so as cover falls clouds shrink away one by
// one instead of all at once.
export const cloudCover = { value: 1 };
const coverOf = (i) => {
  const h = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return h - Math.floor(h);
};

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
uniform vec4 uClouds[${MAX_CLOUDS}];
uniform vec2 uCloudRot[${MAX_CLOUDS}];
uniform float uCloudDark;
float cloudShade( vec2 p ) {
  float s = 0.0;
  for ( int i = 0; i < ${MAX_CLOUDS}; i ++ ) {
    vec2 d = p - uClouds[ i ].xy;
    vec2 c = uCloudRot[ i ];
    vec2 r = vec2( d.x * c.x + d.y * c.y, - d.x * c.y + d.y * c.x ) * uClouds[ i ].zw;
    float q = dot( r, r );
    s = max( s, 1.0 - smoothstep( 0.45, 1.0, q ) );
  }
  return 1.0 - uCloudDark * s;
}
`;

// Patch one Lambert/Phong material in place (once).
export function addCloudShadows(mat) {
  if (!mat || mat.userData.clouds) return;
  if (!(mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return;
  if (mat.fog === false) return;
  mat.userData.clouds = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    Object.assign(shader.uniforms, cloudUniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb *= cloudShade( vCloudXZ );\n#include <fog_fragment>');
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|clouds`;
  mat.needsUpdate = true;
}

export function addCloudShadowsTo(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material.forEach(addCloudShadows);
    else addCloudShadows(o.material);
  });
}

// Upload the nearest clouds to (x, y) into the shader uniforms.
const _pick = [];
export function updateCloudUniforms(clouds, x, y) {
  _pick.length = 0;
  const cover = cloudCover.value;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    const f = cover >= 1 ? 1 : Math.min(1, Math.max(0, (cover * 1.2 - coverOf(i) * 0.9) / 0.3));
    if (f <= 0.02) continue;
    const R = Math.max(c.rx, c.ry) * f;
    const d = Math.hypot(c.x - x, c.y - y) - R;
    if (d < 700) _pick.push([d, c, f]);
  }
  _pick.sort((a, b) => a[0] - b[0]);
  const U = cloudUniforms.uClouds.value;
  const RT = cloudUniforms.uCloudRot.value;
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const c = _pick[i] && _pick[i][1];
    const f = c ? _pick[i][2] : 1;
    if (!c) {
      U[i].set(1e7, 1e7, 1e-6, 1e-6);
      continue;
    }
    const a = ((c.angle || 0) * Math.PI) / 180;
    U[i].set(c.x, c.y, 1 / (c.rx * f), 1 / (c.ry * f));
    RT[i].set(Math.cos(a), Math.sin(a));
  }
}

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
