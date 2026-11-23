// Mud on the player's car (#73). How muddy it is comes from src/game/mud.js
// (the uniform dirt, 0..1); this is only how it looks. A thin film low down
// at first, then a ragged band rising up the doors, fans thrown up behind each
// wheel, and the back end, bumpers, flaps and tires. Darker and a little
// glossy when the ground is wet (mudWet), matte when dry, never chrome.
// No new draw calls: it is a few lines in the paint and trim shaders.
//
//   paint.onBeforeCompile = (sh) => patchMud(sh, { dirt, mudWet })
//   trim.onBeforeCompile = (sh) => patchMud(sh, { dirt, mudWet }, { trim: true })

import { SPECS } from './carbody.js';

const WHEEL_Z = SPECS.sedan.wheels.map(([z]) => (z + 0.5).toFixed(2)); // fans start just behind each wheel

// vCarP: car-space position for where the mud sits (x right, y up, z back);
// vMudN: position for the ragged pattern (the wheel's own, so the mud turns
// with the tire). uMudOut: 0 where no mud goes. Leaves mudK (0..1, how much
// mud covers this pixel) for the lines after it.
const MUD_GLSL = `
  float mn = 0.6 * mudNoise( vMudN * 5.0 ) + 0.4 * mudNoise( vMudN * 13.0 + 7.1 );
  float ma = uDirt;
  float mTop = 0.33 + 0.3 * ma; // the band's top edge rises as mud builds
  float mBand = smoothstep( mTop + 0.04, mTop - 0.16, vCarP.y + 0.22 * ( mn - 0.5 ) );
  // Fans thrown up behind each wheel, reaching higher with more mud.
  float mFanR = 0.15 + 0.4 * ma;
  float mFan = max(
    smoothstep( mFanR, mFanR * 0.2, length( vec2( ( vCarP.z - ${WHEEL_Z[0]} ) * 0.8, vCarP.y - 0.3 ) ) + 0.18 * ( mn - 0.5 ) ),
    smoothstep( mFanR, mFanR * 0.2, length( vec2( ( vCarP.z - ${WHEEL_Z[1]} ) * 0.8, vCarP.y - 0.3 ) ) + 0.18 * ( mn - 0.5 ) ) );
  // The back end catches the spray from the rear wheels, below the lamps.
  float mBack = smoothstep( 1.95, 2.25, vCarP.z ) * smoothstep( 0.45 + 0.22 * ma, 0.25, vCarP.y + 0.12 * ( mn - 0.5 ) );
  // Splatter: dots flung above the band.
  float mDot = smoothstep( 0.8, 0.86, mudNoise( vMudN * 29.0 ) * 0.7 + mudNoise( vMudN.zxy * 53.0 + 3.7 ) * 0.3 ) * smoothstep( mTop + 0.24, mTop, vCarP.y ) * smoothstep( 0.15, 0.5, ma );
  float mCov = max( max( mBand, mFan ), max( mBack, mDot ) );
  float mudK = clamp( mCov * ( 0.25 + 0.9 * ma ) * ( 0.45 + 0.9 * mn ), 0.0, 0.95 ) * smoothstep( 0.0, 0.08, ma ) * uMudOut;
  vec3 mCol = mix( vec3( 0.37, 0.29, 0.2 ), vec3( 0.23, 0.16, 0.1 ), clamp( mCov * ma * 1.3 * mn, 0.0, 1.0 ) ); // thin dust, thick mud
  mCol *= 1.0 - 0.45 * uMudWet;
  diffuseColor.rgb = mix( diffuseColor.rgb, mCol, mudK );`;

// Value noise 0..1 for the ragged edges and splatter.
const NOISE_GLSL = `
float mudHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 45.164 ) ) ) * 43758.5453 ); }
float mudNoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( mudHash( i ), mudHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( mudHash( i + vec3( 0, 1, 0 ) ), mudHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( mudHash( i + vec3( 0, 0, 1 ) ), mudHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( mudHash( i + vec3( 0, 1, 1 ) ), mudHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`;

export function patchMud(sh, u, { trim = false } = {}) {
  sh.uniforms.uDirt = u.dirt;
  sh.uniforms.uMudWet = u.mudWet;
  // Trim: the wheels (instanced) count as low down all over; the rest of the
  // trim only outside the body (the seats seen through the glass stay clean).
  const vtx = trim
    ? '#ifdef USE_INSTANCING\n  vCarP = vec3( 0.8, 0.3, 0.0 );\n#else\n  vCarP = position;\n#endif\n  vMudN = position;'
    : 'vCarP = position;\n  vMudN = position;';
  const out = trim
    ? 'float uMudOut = max( smoothstep( 0.62, 0.7, abs( vCarP.x ) ), smoothstep( 1.9, 2.05, abs( vCarP.z ) ) );'
    : 'float uMudOut = 1.0;';
  sh.vertexShader = `varying vec3 vCarP;\nvarying vec3 vMudN;\n${sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  ${vtx}`)}`;
  const fs = sh.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>\n  ${out}\n${MUD_GLSL}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, mix( 0.95, 0.5, uMudWet ), mudK );')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix( metalnessFactor, 0.0, mudK );')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat *= 1.0 - mudK;\n#endif');
  sh.fragmentShader = `uniform float uDirt;\nuniform float uMudWet;\nvarying vec3 vCarP;\nvarying vec3 vMudN;\n${NOISE_GLSL}\n${fs}`;
}
