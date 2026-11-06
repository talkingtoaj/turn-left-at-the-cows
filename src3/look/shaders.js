// Look test shader patches (not with ?look=old). They chain onto any patch a
// material already has (ground paint, cloud shadows).
//
// Textures are detail on the piece's own colour (see look.js). Mapping needs
// no UVs: a standing face is mapped flat along itself (u along the face,
// level with the ground, v up the face), so walls, roofs and posts never
// stretch; anything lying down is mapped from above in world metres.

import * as THREE from 'three';

function chain(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    fn(sh);
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|${key}`;
  mat.needsUpdate = true;
}

function uniforms(sh, shared) {
  const { layers } = shared;
  const L = layers.map((l) => (l ? new THREE.Vector4(l.tex, l.scale[0], l.scale[1], l.swap ? 1 : 0) : new THREE.Vector4(0, 1, 1, 0)));
  sh.uniforms.lookAlb = { value: shared.albedo };
  sh.uniforms.lookNrm = { value: shared.normal };
  sh.uniforms.lookLayer = { value: L };
  sh.uniforms.lookNStr = { value: layers.map((l) => (l ? l.normal : 0)) };
  if (shared.ao) {
    sh.uniforms.lookAO = { value: shared.ao.tex };
    sh.uniforms.lookAOSize = { value: shared.ao.size };
  }
}

function defines(shared, extra = '') {
  let d = `#define LOOK_NL ${shared.layers.length}\n${extra}`;
  if (shared.albedo) d += '#define LOOK_TEX\n';
  if (shared.ao) d += '#define LOOK_AO\n';
  return d;
}

const FRAG_COMMON = /* glsl */`
#ifdef LOOK_TEX
uniform highp sampler2DArray lookAlb;
uniform highp sampler2DArray lookNrm;
uniform vec4 lookLayer[LOOK_NL]; // texture layer, metres per tile u, v, swap
uniform float lookNStr[LOOK_NL];
// Detail colour (multiplier) for surface s at world point P with face normal
// N, and the bumped normal in nW.
vec3 lookDetail(int s, vec3 P, vec3 N, bool top, inout vec3 nW) {
  vec4 L = lookLayer[s];
  vec3 T;
  vec3 B;
  if (top || abs(N.y) > 0.97) {
    T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
    B = cross(T, N);
  } else {
    T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    B = cross(N, T);
  }
  if (L.w > 0.5) { vec3 t = T; T = B; B = t; }
  vec3 uvw = vec3(dot(P, T) / L.y, dot(P, B) / L.z, L.x);
  vec3 det = texture(lookAlb, uvw).rgb * 2.0;
  vec3 tn = texture(lookNrm, uvw).xyz * 2.0 - 1.0;
  tn.xy *= lookNStr[s];
  nW = normalize(T * tn.x + B * tn.y + N * tn.z);
  return det;
}
#endif
#ifdef LOOK_AO
uniform sampler2D lookAO;
uniform vec2 lookAOSize;
#endif
varying vec3 vLookP;
varying vec3 vLookN;
`;

// World position and normal, with instancing.
const VERT_BODY = /* glsl */`
{
  vec4 lwp = vec4(transformed, 1.0);
  vec3 lwn = objectNormal;
  #ifdef USE_INSTANCING
    lwp = instanceMatrix * lwp;
    lwn = mat3(instanceMatrix) * lwn;
  #endif
  vLookP = (modelMatrix * lwp).xyz;
  vLookN = mat3(modelMatrix) * lwn;
}
`;

// Replace the shading normal with the bumped one, keeping its facing.
const NORMAL_OUT = /* glsl */`
if (lookHasN) {
  vec3 lvn = normalize((viewMatrix * vec4(lookNW, 0.0)).xyz);
  normal = dot(lvn, normal) < 0.0 ? -lvn : lvn;
}
`;

function patch(sh, shared, { defs, vertHead = '', vertBody = '', fragHead = '', frag }) {
  uniforms(sh, shared);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vLookP;\nvarying vec3 vLookN;\n${vertHead}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}${vertBody}`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${defs}${FRAG_COMMON}${fragHead}`)
    .replace('#include <normal_fragment_begin>', `${frag}\n#include <normal_fragment_begin>`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL_OUT}`);
}

// Terrain chunks: grass detail where the ground is green, soil detail
// elsewhere (fields, yards, mud, sand), plus the contact patches.
export function patchTerrain(mat, shared) {
  const S = shared.surf;
  chain(mat, 'look-terrain', (sh) => patch(sh, shared, {
    defs: defines(shared),
    frag: /* glsl */`
vec3 lookNW = normalize(vLookN);
bool lookHasN = false;
#ifdef LOOK_TEX
{
  float gw = smoothstep(0.0, 0.04, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
  vec3 nA = lookNW;
  vec3 nB = lookNW;
  vec3 dA = vec3(1.0);
  vec3 dB = vec3(1.0);
  if (gw > 0.01) dA = lookDetail(${S.grass}, vLookP, lookNW, true, nA);
  if (gw < 0.99) dB = lookDetail(${S.soil}, vLookP, lookNW, true, nB);
  diffuseColor.rgb *= mix(dB, dA, gw);
  lookNW = normalize(mix(nB, nA, gw));
  lookHasN = true;
}
#endif
#ifdef LOOK_AO
diffuseColor.rgb *= texture2D(lookAO, vLookP.xz / lookAOSize).r;
#endif
`,
  }));
}

// Static batches. Per vertex lookSurf = [surface id, ground height there].
// Standing things darken towards the ground; ground pieces get the contact
// patches like the terrain.
export function patchObjects(mat, shared, onGround) {
  chain(mat, onGround ? 'look-ground' : 'look-objects', (sh) => patch(sh, shared, {
    defs: defines(shared, onGround ? '#define LOOK_ON_GROUND\n' : ''),
    vertHead: 'attribute vec2 lookSurf;\nvarying vec2 vLookSG;',
    vertBody: 'vLookSG = lookSurf;',
    frag: /* glsl */`
vec3 lookNW = normalize(vLookN);
bool lookHasN = false;
#ifdef LOOK_TEX
{
  int s = int(vLookSG.x + 0.5);
  if (s > 0) {
    #ifdef LOOK_ON_GROUND
      diffuseColor.rgb *= lookDetail(s, vLookP, lookNW, true, lookNW);
    #else
      diffuseColor.rgb *= lookDetail(s, vLookP, lookNW, false, lookNW);
    #endif
    lookHasN = true;
  }
}
#endif
#ifdef LOOK_ON_GROUND
  #ifdef LOOK_AO
    diffuseColor.rgb *= texture2D(lookAO, vLookP.xz / lookAOSize).r;
  #endif
#else
  diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 1.6, vLookP.y - vLookSG.y));
#endif
`,
    fragHead: 'varying vec2 vLookSG;\n',
  }));
}

// Tree trunks (instanced): bark wrapped round the trunk, darker at the foot.
export function patchTrunks(mat, shared) {
  const S = shared.surf;
  chain(mat, 'look-trunks', (sh) => patch(sh, shared, {
    defs: defines(shared),
    vertHead: 'varying vec3 vLookC;',
    vertBody: /* glsl */`
{
  vec4 lc = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    lc = instanceMatrix * lc;
  #endif
  vLookC = (modelMatrix * lc).xyz;
}`,
    frag: /* glsl */`
vec3 lookNW = normalize(vLookN);
bool lookHasN = false;
#ifdef LOOK_TEX
{
  vec3 d = vLookP - vLookC;
  vec4 L = lookLayer[${S.bark}];
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), lookNW + vec3(1e-4, 0.0, 0.0)));
  vec3 B = cross(lookNW, T);
  vec3 uvw = vec3(atan(d.z, d.x) * 0.35 / L.y, vLookP.y / L.z, L.x);
  diffuseColor.rgb *= texture(lookAlb, uvw).rgb * 2.0;
  vec3 tn = texture(lookNrm, uvw).xyz * 2.0 - 1.0;
  lookNW = normalize(T * tn.x + B * tn.y + lookNW * tn.z);
  lookHasN = true;
}
#endif
diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 1.2, vLookP.y - vLookC.y));
`,
    fragHead: 'varying vec3 vLookC;\n',
  }));
}

// Sky dome: the baked sky image, fading into the fog colour at the horizon.
// Sky dome: the clear and the cloudy photo, mixed by the weather (skyMix),
// greyed and flattened for overcast (grey), faded into the fog at the
// horizon. bgS / bgC turn each photo back into its own radiance.
export function skyMaterial(sunnyTex, cloudyTex, bgS, bgC, fogColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      skyS: { value: sunnyTex }, skyC: { value: cloudyTex },
      bgS: { value: bgS }, bgC: { value: bgC },
      gain: { value: 1 }, skyMix: { value: 1 }, grey: { value: 0 },
      fogCol: { value: fogColor },
    },
    vertexShader: /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform sampler2D skyS;
uniform sampler2D skyC;
uniform float bgS;
uniform float bgC;
uniform float gain;
uniform float skyMix;
uniform float grey;
uniform vec3 fogCol;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float u = atan(d.z, d.x) * 0.15915494 + 0.5;
  float v = clamp(asin(clamp(d.y, -1.0, 1.0)) / 1.5707963, 0.0, 1.0);
  vec2 uv = vec2(u, v);
  vec3 cs = skyMix < 0.999 ? texture2D(skyS, uv).rgb * bgS : vec3(0.0);
  vec3 cc = skyMix > 0.001 ? texture2D(skyC, uv).rgb * bgC : vec3(0.0);
  // The clear photo is a dull steel blue after the look's desaturation: give
  // it back some blue.
  cs = max(mix(vec3(dot(cs, vec3(0.2126, 0.7152, 0.0722))), cs, 1.45), 0.0);
  vec3 c = mix(cs, cc, skyMix);
  // Overcast: grey, low contrast, a little brighter overhead.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 g = vec3(mix(1.45, l, 0.3) * (0.85 + 0.3 * v)) * vec3(0.97, 1.0, 1.04);
  c = mix(c, g, grey) * gain;
  c = mix(fogCol, c, smoothstep(-0.01, 0.12, d.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}
