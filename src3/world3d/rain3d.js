// Rain you can see (round 8, #51): falling streaks in a box round the camera,
// drops on the lens, water spray from the wheels (puddle splashes, and a fine
// spray off a wet road at speed), and the opening's rainbow (rainbow3d.js).
// One draw each while it rains or sprays, none otherwise.
//
// Streaks (#51: fewer, longer, brighter, slanted by the wind, so each reads
// as a line, like the owner's reference): one LineSegments of STREAKS lines. Each has a fixed spot in
// a BOX m cube; the vertex shader drops it with time and wraps it round the
// camera, so nothing is updated on the CPU. How many draw follows the rain.
// Lens drops: LENS quads drawn straight in clip space over the picture (one
// draw). Each slot lands a drop at a seeded spot, holds, runs down a little
// and fades, then lands again elsewhere; all worked out in the shader from
// time. How many show follows the rain, so they thin out as it eases and are
// gone when it stops. They stay small, see-through and mostly off the middle
// of the screen, so the road ahead stays readable; the HUD is HTML on top.
// Reduced motion: a few drops that hold still.
// Spray: a small pool of drops thrown up and falling back, one Points draw;
// each drop is drawn as a short smear along its motion, dark and see-through.
//
//   const R = createRain3D(scene, { reducedMotion })
//   R.update(dt, time, camera, rain, fog, { rainbow, sunDir })
//   R.splash(x, y, z, speed, heading, big)       a puddle splash at a wheel
//   R.spray(x, y, z, speed, heading, amount, dt) fine spray off the wheels

import * as THREE from 'three';
import { createRainbow3D } from './rainbow3d.js';

const STREAKS = 1700;
const BOX = 44; // m: the streaks fill a cube this size round the camera
const FALL = 10.5; // m/s
const LEN = 1.5; // m, streak length (motion blur)
const LENS = 40; // lens drop slots
const SPRAY = 600;
const GRAV = 15; // m/s2 on spray: water sheets break up and drop fast

function streakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1.7, 0.7) },
      uColor: { value: new THREE.Color(0.9, 0.92, 0.95) },
      uAlpha: { value: 0.6 },
    },
    vertexShader: /* glsl */`
attribute vec4 aDrop; // x, y, z in the box (0..1), speed jitter
attribute float aEnd; // 0 bottom of the streak, 1 top
uniform float uTime;
uniform vec2 uWind;
varying float vFade;
void main() {
  float B = ${BOX.toFixed(1)};
  float v = ${FALL.toFixed(1)} * (0.85 + 0.3 * aDrop.w);
  vec3 drift = vec3(uWind.x, -v, uWind.y);
  vec3 p = aDrop.xyz * B + drift * uTime;
  // Wrap into the box centred on the camera drawing it.
  vec3 c = cameraPosition - vec3(B * 0.5);
  p = c + mod(p - c, B);
  p -= normalize(drift) * ${LEN.toFixed(2)} * aEnd;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = length(mv.xyz);
  vFade = (1.0 - smoothstep(B * 0.25, B * 0.5, d)) * smoothstep(0.6, 2.5, d) * (0.55 + 0.45 * aEnd);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
varying float vFade;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * vFade);
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

// Lens drops. aCorner: the quad corner (-1..1); aSlot: x slot number, y..w
// seeds. Times in seconds; uDensity 0..1 how many slots are in use.
function lensMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDensity: { value: 0 },
      uAspect: { value: 16 / 9 },
      uStill: { value: 0 },
      uSky: { value: new THREE.Color(0.7, 0.72, 0.75) },
    },
    vertexShader: /* glsl */`
attribute vec2 aCorner;
attribute vec4 aSlot;
uniform float uTime;
uniform float uDensity;
uniform float uAspect;
uniform float uStill;
varying vec2 vQ;
varying float vA;
varying float vTrail;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float period = 3.0 + 4.0 * aSlot.y;
  float k = uStill > 0.5 ? 0.0 : floor((uTime + aSlot.z * period) / period); // which landing
  float u = uStill > 0.5 ? 0.3 : fract((uTime + aSlot.z * period) / period); // 0 lands .. 1 gone
  float n = aSlot.x * 17.0 + k * 131.0;
  // In use this landing? A soft gate, so drops fade rather than pop as the rain changes.
  float gate = hash(n + 0.5);
  float use = smoothstep(gate - 0.08, gate, uDensity * (uStill > 0.5 ? 0.3 : 1.0));
  // Where it lands: anywhere, but pushed off the middle of the screen.
  vec2 c = vec2(hash(n + 1.1), hash(n + 2.3)) * 2.0 - 1.0;
  float mid = 1.0 - smoothstep(0.0, 0.55, length(c * vec2(1.0, 1.4)));
  c.x += sign(c.x + 0.001) * mid * 0.45;
  float r = (0.008 + 0.012 * hash(n + 3.7)) * (1.0 - 0.3 * mid); // radius, screen heights
  // Holds, then may run down a little, fading.
  float runs = step(0.45, hash(n + 4.9));
  float run = runs * smoothstep(0.45, 0.8, u) * (0.04 + 0.08 * hash(n + 5.3));
  vTrail = run / r;
  vA = use * smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.55, 1.0, u));
  // Quad: a circle of radius r at the head, the trail above it.
  vec2 q = vec2(aCorner.x, aCorner.y < 0.0 ? -1.0 : 1.0 + 2.0 * vTrail);
  vQ = q;
  vec2 p = vec2(c.x, c.y - run * 2.0) + vec2(q.x * r / uAspect, q.y * r) * 2.0;
  gl_Position = vA > 0.002 ? vec4(p, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform vec3 uSky;
varying vec2 vQ;
varying float vA;
varying float vTrail;
void main() {
  float r = length(vQ);
  float a = 0.0;
  vec3 col = uSky;
  if (r < 1.0) {
    // The drop is a tiny upside-down lens: the dark land in its top half, the
    // pale sky in its bottom half, a soft edge and a small glint.
    float land = smoothstep(-0.35, 0.6, vQ.y);
    float glint = 1.0 - smoothstep(0.0, 0.2, length(vQ - vec2(-0.3, 0.45)));
    col = mix(mix(uSky * 1.1, uSky * 0.45, land), vec3(1.0), glint * 0.7);
    a = (0.22 + 0.2 * land) * (1.0 - smoothstep(0.75, 1.0, r)) + 0.35 * glint;
  } else if (vQ.y > 0.0 && vTrail > 0.05) {
    // The wet trail it left: a faint thin streak narrowing upwards.
    float f = vQ.y / (1.0 + 2.0 * vTrail);
    float w = 0.4 * (1.0 - f);
    if (abs(vQ.x) > w) discard;
    a = 0.14 * (1.0 - f);
    col = uSky * 1.2;
  } else discard;
  gl_FragColor = vec4(col, a * vA);
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
}

export function createRain3D(scene, { reducedMotion = false } = {}) {
  // Streaks.
  const pos = new Float32Array(STREAKS * 2 * 3); // unused by the shader, but three needs a position
  const drop = new Float32Array(STREAKS * 2 * 4);
  const end = new Float32Array(STREAKS * 2);
  let s = 12345;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < STREAKS; i++) {
    const d = [rnd(), rnd(), rnd(), rnd()];
    for (let e = 0; e < 2; e++) {
      drop.set(d, (i * 2 + e) * 4);
      end[i * 2 + e] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = streakMaterial();
  const streaks = new THREE.LineSegments(geo, mat);
  streaks.name = 'rain';
  streaks.frustumCulled = false;
  streaks.renderOrder = 10;
  streaks.visible = false;
  scene.add(streaks);

  // Lens drops.
  const lgeo = new THREE.BufferGeometry();
  const corner = new Float32Array(LENS * 4 * 2);
  const slot = new Float32Array(LENS * 4 * 4);
  const idx = [];
  for (let i = 0; i < LENS; i++) {
    const sd = [i, rnd(), rnd(), rnd()];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((cr, k) => {
      corner.set(cr, (i * 4 + k) * 2);
      slot.set(sd, (i * 4 + k) * 4);
    });
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LENS * 4 * 3), 3));
  lgeo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  lgeo.setAttribute('aSlot', new THREE.BufferAttribute(slot, 4));
  lgeo.setIndex(idx);
  const lmat = lensMaterial();
  lmat.uniforms.uStill.value = reducedMotion ? 1 : 0;
  const lens = new THREE.Mesh(lgeo, lmat);
  lens.name = 'lensDrops';
  lens.frustumCulled = false;
  lens.renderOrder = 50;
  lens.visible = false;
  scene.add(lens);
  let lensT = 0;
  let lensD = 0; // drops follow the rain a little behind

  const rainbow = createRainbow3D(scene);

  // Spray.
  const sp = {
    pos: new Float32Array(SPRAY * 3),
    vel: new Float32Array(SPRAY * 3),
    life: new Float32Array(SPRAY),
    size: new Float32Array(SPRAY),
    next: 0,
    live: 0,
  };
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aVel', new THREE.BufferAttribute(sp.vel, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aLife', new THREE.BufferAttribute(sp.life, 1).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aSize', new THREE.BufferAttribute(sp.size, 1).setUsage(THREE.DynamicDrawUsage));
  // Each point is a drop smeared along its motion on screen (motion blur):
  // the sprite square is as long as the smear, and the fragment shader cuts
  // a thin capsule out of it along the screen velocity. Water, so dark and
  // see-through (it takes the colour of what is behind) with a pale rim.
  const smat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0.42, 0.44, 0.45) },
      uScale: { value: 400 },
      uAspect: { value: 16 / 9 },
      uBlur: { value: 1 / 30 },
    },
    vertexShader: /* glsl */`
attribute vec3 aVel;
attribute float aLife;
attribute float aSize;
uniform float uScale;
uniform float uAspect;
uniform float uBlur;
varying float vLife;
varying vec2 vDir;
varying float vThin;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * (modelViewMatrix * vec4(position + aVel * uBlur, 1.0));
  // Smear on screen in pixels (NDC half-units x scale), y up.
  vec2 d = (c1.xy / max(0.05, c1.w) - c0.xy / max(0.05, c0.w)) * vec2(uAspect, 1.0) * uScale * 0.9;
  float w = aSize * uScale / max(0.5, -mv.z); // drop width in px
  float len = clamp(max(length(d), w * 2.5), 2.0, 22.0); // always a little streak, never a round flake
  vDir = length(d) > 0.001 ? normalize(d) * vec2(1.0, -1.0) : vec2(0.0, 1.0); // point coords run y down
  vThin = clamp(w / len, 0.12, 1.0);
  gl_PointSize = aLife > 0.0 ? max(1.5, len) : 0.0;
  gl_Position = c0;
}`,
    fragmentShader: /* glsl */`
uniform vec3 uColor;
varying float vLife;
varying vec2 vDir;
varying float vThin;
void main() {
  if (vLife <= 0.0) discard;
  vec2 p = gl_PointCoord - 0.5;
  float along = dot(p, vDir) * 2.0;
  float across = dot(p, vec2(-vDir.y, vDir.x)) * 2.0 / vThin;
  float r = along * along + across * across;
  if (r > 1.0) discard;
  float edge = 1.0 - r;
  float a = smoothstep(0.0, 0.5, edge) * clamp(vLife * 5.0, 0.0, 1.0) * (0.6 + 0.2 * vThin);
  // A pale highlight along one side, the rest darker water.
  vec3 col = mix(uColor, uColor * 1.7 + 0.05, smoothstep(0.1, 0.9, -across) * 0.7);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
  });
  const spray = new THREE.Points(sgeo, smat);
  spray.name = 'spray';
  spray.frustumCulled = false;
  spray.renderOrder = 9;
  spray.visible = false;
  scene.add(spray);

  const emit = (x, y, z, vx, vy, vz, life, size) => {
    const i = sp.next;
    sp.next = (sp.next + 1) % SPRAY;
    sp.pos[i * 3] = x;
    sp.pos[i * 3 + 1] = y;
    sp.pos[i * 3 + 2] = z;
    sp.vel[i * 3] = vx;
    sp.vel[i * 3 + 1] = vy;
    sp.vel[i * 3 + 2] = vz;
    sp.life[i] = life;
    sp.size[i] = size;
  };
  // Car frame: heading degrees, forward (sin h, -cos h) in world x / y (three z).
  const fwd = (h) => [Math.sin((h * Math.PI) / 180), -Math.cos((h * Math.PI) / 180)];

  return {
    streaks,
    sprayPoints: spray,
    lens,
    rainbow,
    update(dt, time, camera, rain, fog, { rainbow: bow = 0, sunDir = null } = {}) {
      streaks.visible = rain > 0.01;
      if (streaks.visible) {
        mat.uniforms.uTime.value = time % 1000;
        geo.setDrawRange(0, Math.round(STREAKS * Math.min(1, 0.25 + 0.75 * rain)) * 2);
        mat.uniforms.uAlpha.value = 0.45 + 0.3 * rain;
        if (fog) mat.uniforms.uColor.value.setRGB(0.8 + 0.15 * fog.r / (fog.r + 1), 0.82 + 0.15 * fog.g / (fog.g + 1), 0.85 + 0.15 * fog.b / (fog.b + 1));
      }
      // Lens drops: in use follows the rain (lagging a few seconds behind).
      lensD += (Math.min(1, rain * 1.3) - lensD) * Math.min(1, dt / 3);
      lens.visible = lensD > 0.01;
      if (lens.visible) {
        lensT = (lensT + dt) % 10000;
        lmat.uniforms.uTime.value = lensT;
        lmat.uniforms.uDensity.value = lensD;
        lmat.uniforms.uAspect.value = camera.aspect || 16 / 9;
        if (fog) lmat.uniforms.uSky.value.setRGB(Math.min(1, fog.r * 1.1), Math.min(1, fog.g * 1.1), Math.min(1, fog.b * 1.1));
      }
      if (sunDir) rainbow.update(camera, sunDir, bow);
      else rainbow.mesh.visible = false;
      // Spray particles: fall, slow, fade.
      let live = 0;
      if (sp.live > 0) {
        for (let i = 0; i < SPRAY; i++) {
          if (sp.life[i] <= 0) continue;
          sp.life[i] -= dt;
          if (sp.life[i] <= 0) {
            sp.life[i] = 0;
            continue;
          }
          live++;
          sp.vel[i * 3 + 1] -= GRAV * dt;
          const drag = Math.exp(-1.8 * dt);
          sp.vel[i * 3] *= drag;
          sp.vel[i * 3 + 2] *= drag;
          sp.pos[i * 3] += sp.vel[i * 3] * dt;
          sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt;
          sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
        }
        sgeo.attributes.position.needsUpdate = true;
        sgeo.attributes.aLife.needsUpdate = true;
        sgeo.attributes.aSize.needsUpdate = true;
        sgeo.attributes.aVel.needsUpdate = true;
      }
      sp.live = live;
      spray.visible = live > 0;
      smat.uniforms.uScale.value = window.innerHeight * 0.55;
      smat.uniforms.uAspect.value = camera.aspect || window.innerWidth / Math.max(1, window.innerHeight);
      // Water darker than the grey day it shows, never brighter.
      if (fog) smat.uniforms.uColor.value.setRGB(fog.r * 0.5, fog.g * 0.52, fog.b * 0.55);
    },
    // A splash: a sheet of water thrown out sideways and forward.
    splash(x, y, z, speed, heading, big = false) {
      const [fx, fy] = fwd(heading);
      const n = Math.round((big ? 160 : 110) * Math.min(1.3, 0.4 + speed / 14));
      const k1 = Math.min(1.5, 0.4 + speed / 12);
      for (let k = 0; k < n; k++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const out = (1.2 + Math.random() * 2.6) * k1;
        const fwdV = speed * (0.2 + Math.random() * 0.4);
        const vx = fx * fwdV - fy * out * side;
        const vz = fy * fwdV + fx * out * side;
        emit(x + (Math.random() - 0.5) * 0.6, y + 0.1, z + (Math.random() - 0.5) * 0.6, vx, (1.0 + Math.random() * 2.2) * k1, vz, 0.4 + Math.random() * 0.35, 0.045 + Math.random() * 0.05);
      }
      sp.live = Math.max(sp.live, 1);
    },
    // Fine spray off the tyres on a wet surface (call each frame).
    spray(x, y, z, speed, heading, amount, dt) {
      if (amount <= 0.01 || speed < 6) return;
      const [fx, fy] = fwd(heading);
      const rate = amount * (speed - 6) * 3.5; // particles per second per wheel
      let n = rate * dt;
      while (n > 0) {
        if (n < 1 && Math.random() > n) break;
        n -= 1;
        const sideJ = (Math.random() - 0.5) * 0.8;
        emit(x - fy * sideJ, y + 0.1, z + fx * sideJ, -fx * speed * 0.12 + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 1.0, -fy * speed * 0.12 + (Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.25, 0.03 + Math.random() * 0.03);
      }
      sp.live = Math.max(sp.live, 1);
    },
  };
}
