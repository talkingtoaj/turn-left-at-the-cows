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

// Rain (round 8): how wet everything is (0..1) and the colour wet surfaces
// reflect (the horizon / fog colour, set by look.js). Shared by every
// patched material, so one write updates them all.
export const WET = {
  lookWet: { value: 0 },
  lookSkyCol: { value: new THREE.Color(0.8, 0.85, 0.9) },
};

function uniforms(sh, shared) {
  sh.uniforms.lookWet = WET.lookWet;
  sh.uniforms.lookSkyCol = WET.lookSkyCol;
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
  // Ground (top): plain x/z projection. Taking dot(P, T) with the tilted
  // tangent would swing the texture by (world position x tilt), hundreds of
  // metres across one sloping triangle, and smear it into streaks on
  // rolling ground.
  vec3 PT = top || abs(N.y) > 0.97 ? vec3(1.0, 0.0, 0.0) : T;
  vec3 PB = top || abs(N.y) > 0.97 ? vec3(0.0, 0.0, 1.0) : B;
  if (L.w > 0.5) { vec3 t = T; T = B; B = t; t = PT; PT = PB; PB = t; }
  vec3 uvw = vec3(dot(P, PT) / L.y, dot(P, PB) / L.z, L.x);
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
uniform float lookWet;
uniform vec3 lookSkyCol;
`;

// Wet shine (round 8): wet surfaces reflect the sky at a glancing view, by
// lookWetShine (set in each patch's fragment code).
const SHINE_OUT = /* glsl */`
if (lookWetShine > 0.0) {
  float lfr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
  outgoingLight = mix(outgoingLight, lookSkyCol * 0.85, clamp(lookWetShine * (0.12 + 0.88 * lfr), 0.0, 1.0));
}
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
    .replace('#include <normal_fragment_begin>', `float lookWetShine = 0.0;\n${frag}\n#include <normal_fragment_begin>`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL_OUT}`)
    .replace('#include <opaque_fragment>', `${SHINE_OUT}\n#include <opaque_fragment>`);
}

// Lighting slope boost for gentle terrain (see patchTerrain).
const ROLL_SHADE = 2.6;

// Terrain chunks: grass detail where the ground is green, soil detail
// elsewhere (fields, yards, mud, sand), plus the contact patches.
export function patchTerrain(mat, shared) {
  const S = shared.surf;
  chain(mat, 'look-terrain', (sh) => patch(sh, shared, {
    defs: defines(shared),
    vertHead: 'attribute vec2 lookRough;\nvarying vec2 vLookR;\nattribute float lookMud;\nvarying float vLookMud;',
    vertBody: 'vLookR = lookRough;\nvLookMud = lookMud;',
    fragHead: 'varying vec2 vLookR;\nvarying float vLookMud;\n',
    frag: /* glsl */`
vec3 lookNW = normalize(vLookN);
bool lookHasN = false;
#ifdef LOOK_TEX
{
  // Gentle slopes (the rolling ground, a few degrees) barely change the
  // light, so the land read flat between its silhouettes. Light them as if
  // tilted ROLL_SHADE times as much, fading back to the true slope by about
  // 20 degrees so hillsides and banks keep their shading.
  float sl = length(lookNW.xz);
  float kx = mix(${ROLL_SHADE.toFixed(2)}, 1.0, smoothstep(0.08, 0.35, sl));
  lookNW = normalize(vec3(lookNW.x * kx, lookNW.y, lookNW.z * kx));
}
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
  // Small bumps (under the 4 m mesh spacing) on rough ground: the soil
  // normal map again, coarser and turned, as tussocks and stones, plus a
  // little shade in the hollows. src/world/roughness.js sets lookRough.
  // Hollows of the big bumps a little darker, tops a little paler, so the
  // relief reads even in flat light (paint included).
  diffuseColor.rgb *= 1.0 + clamp(vLookR.y * 0.3, -0.22, 0.12);
  if (vLookR.x > 0.02) {
    vec2 q = mat2(0.80, -0.60, 0.60, 0.80) * vLookP.xz;
    vec4 L = lookLayer[${S.soil}];
    vec3 tn = texture(lookNrm, vec3(q / 2.7, L.x)).xyz * 2.0 - 1.0;
    vec3 tn2 = texture(lookNrm, vec3(q.yx / 6.3 + 0.37, L.x)).xyz * 2.0 - 1.0;
    vec2 b = (tn.xy * 0.6 + tn2.xy * 0.8) * vLookR.x * 1.1;
    lookNW = normalize(lookNW + vec3(b.x, 0.0, b.y));
    float hol = texture(lookAlb, vec3(q.yx / 6.3 + 0.37, L.x)).g * 2.0;
    diffuseColor.rgb *= mix(1.0, clamp(0.78 + 0.25 * hol, 0.7, 1.08), vLookR.x * 0.6);
  }
}
#endif
#ifdef LOOK_AO
diffuseColor.rgb *= texture2D(lookAO, vLookP.xz / lookAOSize).r;
#endif
// Wet ground (round 8): darker, bare soil more than grass; mud (willow
// bottoms, creek low ground, hollows) browner and a little shiny.
if (lookWet > 0.001) {
  float lgw = smoothstep(0.0, 0.04, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
  float lmk = clamp(vLookMud, 0.0, 1.0) * lookWet;
  diffuseColor.rgb *= 1.0 - lookWet * mix(0.36, 0.2, lgw);
  vec3 lmud = vec3(dot(diffuseColor.rgb, vec3(0.3333))) * vec3(1.2, 0.88, 0.52);
  diffuseColor.rgb = mix(diffuseColor.rgb, lmud * 0.78, lmk * 0.72);
  lookWetShine = lookWet * (0.04 + 0.22 * lmk);
}
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
  // Wet roads and pads (round 8): darker; the dirt road browner (mud), the
  // asphalt shiny.
  if (lookWet > 0.001) {
    int ls = int(vLookSG.x + 0.5);
    float ldk = ls == ${shared.surf['dirt road']} ? 0.42 : ls == ${shared.surf.asphalt} ? 0.34 : 0.28;
    diffuseColor.rgb *= 1.0 - lookWet * ldk;
    if (ls == ${shared.surf['dirt road']}) {
      vec3 lmud = vec3(dot(diffuseColor.rgb, vec3(0.3333))) * vec3(1.06, 0.84, 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, lmud * 0.85, lookWet * 0.5);
      lookWetShine = lookWet * 0.16;
    } else if (ls == ${shared.surf.asphalt}) {
      lookWetShine = lookWet * 0.42;
    } else {
      lookWetShine = lookWet * 0.12;
    }
  }
#else
  diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 1.6, vLookP.y - vLookSG.y));
  diffuseColor.rgb *= 1.0 - 0.12 * lookWet; // rain-darkened walls and roofs
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

// Scatter rocks and outcrops (instanced, src3/world3d/scatter3d.js): the
// stone texture mapped flat along each face, pale lichen on the faces that
// look up, darker toward the foot.
export function patchRocks(mat, shared) {
  const S = shared.surf;
  chain(mat, 'look-rocks', (sh) => patch(sh, shared, {
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
  vec3 n0 = lookNW;
  vec3 det = lookDetail(${S.rock}, vLookP, n0, false, lookNW);
  diffuseColor.rgb *= det;
  lookHasN = true;
  // Lichen: a coarse sample of the same texture as a mask, on upward faces.
  vec4 L = lookLayer[${S.rock}];
  float m = texture(lookAlb, vec3(vLookP.xz / 5.3 + vLookP.y * 0.11, L.x)).g * 2.0;
  float lk = smoothstep(1.02, 1.25, m) * smoothstep(0.2, 0.75, n0.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.2, 0.92) + vec3(0.012, 0.014, 0.0), lk * 0.75);
}
#endif
diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.9, vLookP.y - vLookC.y));
// Wet stone: darker and a little shiny.
diffuseColor.rgb *= 1.0 - 0.38 * lookWet;
lookWetShine = lookWet * 0.2;
`,
    fragHead: 'varying vec3 vLookC;\n',
  }));
}

// Shrubs and tussocks (instanced): only the wet look, a little darker in the rain.
export function patchWetPlants(mat) {
  chain(mat, 'look-wet-plants', (sh) => {
    sh.uniforms.lookWet = WET.lookWet;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lookWet;')
      .replace('#include <normal_fragment_begin>', 'diffuseColor.rgb *= 1.0 - 0.26 * lookWet;\n#include <normal_fragment_begin>');
  });
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
  // Mip level from derivatives that ignore the jump where u wraps (else the
  // sharp sky's mipmaps would draw a seam there).
  float u2 = fract(u + 0.5);
  float ux = dFdx(u), uy = dFdy(u), ux2 = dFdx(u2), uy2 = dFdy(u2);
  vec2 gx = vec2(abs(ux) < abs(ux2) ? ux : ux2, dFdx(v));
  vec2 gy = vec2(abs(uy) < abs(uy2) ? uy : uy2, dFdy(v));
  vec3 cs = skyMix < 0.999 ? textureGrad(skyS, uv, gx, gy).rgb * bgS : vec3(0.0);
  vec3 cc = skyMix > 0.001 ? textureGrad(skyC, uv, gx, gy).rgb * bgC : vec3(0.0);
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
  // A little dither so the smooth blues do not band into steps.
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}
