// Lightning (round 12): the flash and, now and then, a distant bolt. When
// and where it strikes is src/game/thunder.js; the thunder is the audio's.
//
// The flash lights the whole scene for a moment: a cold white ambient light
// (in the scene from the start at intensity 0, so a strike never compiles
// a shader) and a pale veil over the screen that brightens the sky too.
// Two or three flickers over half a second, stronger for close strikes.
// A bolt is drawn for strikes in front of you: a jagged ribbon from the
// cloud base to the ground, far off. Past the camera's far plane it is
// drawn closer along the same line of sight and scaled down by the same
// factor (as the planes are), so it looks the right size in the right place.
// Round 13 (SPEC 9n): the bolt is a white-hot core in a soft blue glow, and
// the cloud base around its top lights up; all one additive mesh, one draw,
// drawn only during a strike. Far bolts are drawn a little wider so they
// still read. `storm` (0..1) eases up in heavy rain and after a strike, and
// the look (src3/look/look.js) darkens the sky and haze by it, so the bolt
// shows against a dark storm sky instead of a pale one.
// Reduced motion (prefers-reduced-motion): a single, much dimmer flash, no bolt.
//
//   const L = createLightning3D(scene, { reducedMotion })
//   L.strike(strike, ear)        strike = { km, bearing, power }, ear = { x, y }
//   L.update(dt, camera, rain)   every frame (rain: src/game/wetness.js)
//   L.flash                      0..1 now (for checks)
//   L.storm                      0..1, how dark the storm sky is now

import * as THREE from 'three';
import { THUNDER } from '../../src/game/thunder.js';

const DEG = Math.PI / 180;
const CLOUD_BASE = 1400; // metres above the ground
const CORE = 0.012; // the bolt's half-width (unit frame: 1 = cloud base)
const GLOW = 0.075; // the glow's half-width
const STORM_AFTER = 40; // s a storm stays dark after a strike
const STORM_EASE = 5; // s to ease the storm darkness in or out

// Flash brightness over time (s) after the strike: a few flickers.
function envelope(t, reduced) {
  if (reduced) return t < 0.25 ? 1 - t / 0.25 : 0;
  const pulse = (t0, w, a) => (t >= t0 && t < t0 + w ? a * (1 - (t - t0) / w) : 0);
  return Math.max(pulse(0, 0.12, 1), pulse(0.16, 0.1, 0.7), pulse(0.32, 0.22, 0.85));
}

// A jagged bolt in a unit-ish frame: x across, y from 1 (cloud) to 0 (ground).
function boltPoints(rng) {
  const pts = [];
  let x = 0;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    pts.push([x, 1 - i / n]);
    x += (rng() - 0.5) * 0.14;
  }
  return pts;
}

// Two triangles per segment. position: the bolt's centre line (x, y, 0);
// shape: [side (-1..1, scaled by the width in the shader), across, 0, kind 0].
// `taper` thins it towards the end (k = 1 at the start).
function ribbon(points, taper, pos, shape) {
  const k = (i) => taper * (1 - 0.5 * (i / points.length));
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const ka = k(i);
    const kb = k(i + 1);
    const v = [[ax, ay, -ka], [ax, ay, ka], [bx, by, kb], [ax, ay, -ka], [bx, by, kb], [bx, by, -kb]];
    for (const [x, y, s] of v) {
      pos.push(x, y, 0);
      shape.push(s, Math.sign(s), 0, 0);
    }
  }
}

// The lit cloud base around the bolt's top: one quad, kind 1.
function cloudGlow(x, y, w, h, pos, shape) {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of c) {
    pos.push(x + a * w, y + b * h, 0);
    shape.push(0, a, b, 1);
  }
}

function boltMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uFlash: { value: 0 }, uWidth: { value: 1 } },
    vertexShader: /* glsl */`
attribute vec4 shape;
uniform float uWidth;
varying vec4 vShape;
void main() {
  vShape = shape;
  vec3 p = position;
  p.x += shape.x * ${GLOW.toFixed(4)} * uWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform float uFlash;
varying vec4 vShape;
void main() {
  vec3 c;
  if (vShape.w < 0.5) {
    // Across the ribbon: a white-hot core, then a soft blue glow.
    float a = abs(vShape.y);
    float core = 1.0 - smoothstep(${(CORE / GLOW * 0.5).toFixed(4)}, ${(CORE / GLOW).toFixed(4)}, a);
    float b = 1.0 - a;
    float glow = 0.3 * b + 0.8 * b * b * b;
    c = vec3(1.0) * core * min(1.0, uFlash * 1.6) + vec3(0.5, 0.6, 1.0) * glow * uFlash;
  } else {
    // The cloud base lit from inside, brightest just above the bolt's top.
    float r2 = dot(vShape.yz, vShape.yz);
    c = vec3(0.55, 0.6, 0.8) * exp(-3.5 * r2) * (1.0 - smoothstep(0.7, 1.0, r2)) * uFlash * 0.7;
  }
  gl_FragColor = vec4(c, 1.0);
}`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
}

export function createLightning3D(scene, { reducedMotion = false } = {}) {
  const light = new THREE.AmbientLight(0xdfe8ff, 0);
  scene.add(light);

  // Screen veil: plain DOM above the canvas, below the HUD.
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#e8eeff;opacity:0;mix-blend-mode:screen;z-index:1';
  const app = document.getElementById('app');
  (app || document.body).appendChild(veil);

  // The bolt and its lit cloud: one mesh, rebuilt per strike (a few dozen triangles).
  const maxTris = 2 * 32;
  const pos = new Float32Array(maxTris * 9);
  const shp = new Float32Array(maxTris * 12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('shape', new THREE.BufferAttribute(shp, 4));
  const mat = boltMaterial();
  const bolt = new THREE.Mesh(geo, mat);
  bolt.frustumCulled = false;
  // Visible (one empty triangle) until the first frame, so the region's warm-up
  // render compiles its shader; update() hides it until a strike.
  geo.setDrawRange(0, 3);
  bolt.renderOrder = 5;
  scene.add(bolt);

  let t = Infinity; // seconds since the last strike
  let power = 0;
  let boltOn = false;
  const where = new THREE.Vector3(); // the strike's ground point (three.js axes)
  const cam = new THREE.Vector3();
  let seed = 1;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const api = {
    flash: 0,
    storm: 0,
    strike(s, ear) {
      t = 0;
      // Close strikes light everything; far ones only glow.
      power = (s.power || 1) * Math.min(1, 1.25 / (0.6 + s.km * 0.55));
      const b = s.bearing * DEG;
      const m = s.km * 1000;
      where.set(ear.x + Math.sin(b) * m, 0, ear.y - Math.cos(b) * m);
      seed = Math.floor((s.t || 1) * 1000 + s.km * 7919) % 2147483646 + 1;
      const pts = boltPoints(rng);
      // A short branch off the upper half.
      const j = 3 + Math.floor(rng() * 4);
      const branch = [pts[j]];
      let bx = pts[j][0];
      for (let i = 1; i <= 4; i++) {
        bx += (rng() < 0.5 ? -1 : 1) * 0.05 + (rng() - 0.5) * 0.03;
        branch.push([bx, pts[j][1] - i * 0.06]);
      }
      const p = [];
      const q = [];
      cloudGlow(0, 1.03, 0.55, 0.2, p, q);
      ribbon(pts, 1, p, q);
      ribbon(branch, 0.55, p, q);
      const n = Math.min(p.length / 3, maxTris * 3);
      pos.fill(0);
      shp.fill(0);
      pos.set(p.slice(0, n * 3));
      shp.set(q.slice(0, n * 4));
      geo.attributes.position.needsUpdate = true;
      geo.attributes.shape.needsUpdate = true;
      geo.setDrawRange(0, n);
      // Far bolts a little wider, so they still read (about 1 at 2.5 km).
      mat.uniforms.uWidth.value = Math.max(1, Math.min(2.2, s.km / 2.5));
      boltOn = !reducedMotion;
    },
    update(dt, camera, rain = 0) {
      t += dt;
      const f = t < 1 ? envelope(t, reducedMotion) * power : 0;
      api.flash = f;
      // The storm sky: dark in heavy rain and for a while after a strike.
      const heavy = THREE.MathUtils.smoothstep(rain, THUNDER.HEAVY - 0.1, THUNDER.HEAVY + 0.1);
      const target = Math.max(heavy, t < STORM_AFTER ? 1 : 0);
      api.storm += (target - api.storm) * (1 - Math.exp(-dt / STORM_EASE));
      const dim = reducedMotion ? 0.3 : 1;
      light.intensity = f * 2.2 * dim;
      veil.style.opacity = f > 0.005 ? String(Math.min(0.35, f * 0.3 * dim)) : '0';
      bolt.visible = boltOn && f > 0.02;
      if (!bolt.visible) return;
      // Place the bolt along the line of sight, inside the far plane.
      cam.setFromMatrixPosition(camera.matrixWorld);
      const dx = where.x - cam.x;
      const dz = where.z - cam.z;
      const d = Math.hypot(dx, dz);
      const lim = (camera.far || 450) * 0.8;
      const k = Math.min(1, lim / d);
      const h = CLOUD_BASE * k;
      bolt.position.set(cam.x + dx * k, cam.y - 30 * k, cam.z + dz * k);
      // Unit frame -> metres: y up to the cloud base, x the same scale.
      bolt.scale.set(h * 0.9, h, 1);
      bolt.rotation.set(0, Math.atan2(dx, dz), 0);
      mat.uniforms.uFlash.value = f;
    },
    dispose() {
      veil.remove();
    },
  };
  return api;
}
