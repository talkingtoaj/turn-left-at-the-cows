// Rain you can see (round 8): falling streaks in a box round the camera, and
// water spray from the wheels (puddle splashes, and a fine spray off a wet
// road at speed). Two draw calls while it rains or sprays, none otherwise.
//
// Streaks: one LineSegments of STREAKS short lines. Each has a fixed spot in
// a BOX m cube; the vertex shader drops it with time and wraps it round the
// camera, so nothing is updated on the CPU. How many draw follows the rain.
// Spray: a small pool of points thrown up and falling back, one Points draw.
//
//   const R = createRain3D(scene)
//   R.update(dt, time, camera, rain, fog)
//   R.splash(x, y, z, speed, heading, big)       a puddle splash at a wheel
//   R.spray(x, y, z, speed, heading, amount, dt) fine spray off the wheels

import * as THREE from 'three';

const STREAKS = 5000;
const BOX = 44; // m: the streaks fill a cube this size round the camera
const FALL = 9.5; // m/s
const LEN = 0.55; // m, streak length (motion blur)
const SPRAY = 600;

function streakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1.1, 0.5) },
      uColor: { value: new THREE.Color(0.75, 0.78, 0.82) },
      uAlpha: { value: 0.35 },
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
  vFade = (1.0 - smoothstep(B * 0.25, B * 0.5, d)) * smoothstep(0.6, 2.5, d) * (0.35 + 0.65 * aEnd);
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

function sprayTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRain3D(scene) {
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
  sgeo.setAttribute('aLife', new THREE.BufferAttribute(sp.life, 1).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aSize', new THREE.BufferAttribute(sp.size, 1).setUsage(THREE.DynamicDrawUsage));
  const smat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: sprayTexture() }, uColor: { value: new THREE.Color(0.72, 0.71, 0.66) }, uScale: { value: 400 } },
    vertexShader: /* glsl */`
attribute float aLife;
attribute float aSize;
uniform float uScale;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aLife > 0.0 ? min(26.0, aSize * uScale / max(0.5, -mv.z)) : 0.0;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */`
uniform sampler2D uTex;
uniform vec3 uColor;
varying float vLife;
void main() {
  if (vLife <= 0.0) discard;
  float a = texture2D(uTex, gl_PointCoord).a * clamp(vLife * 2.5, 0.0, 1.0) * 0.6;
  gl_FragColor = vec4(uColor, a);
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
    update(dt, time, camera, rain, fog) {
      streaks.visible = rain > 0.01;
      if (streaks.visible) {
        mat.uniforms.uTime.value = time % 1000;
        geo.setDrawRange(0, Math.round(STREAKS * Math.min(1, 0.15 + 0.85 * rain)) * 2);
        mat.uniforms.uAlpha.value = 0.28 + 0.24 * rain;
        if (fog) mat.uniforms.uColor.value.setRGB(0.55 + 0.2 * fog.r / (fog.r + 1), 0.58 + 0.2 * fog.g / (fog.g + 1), 0.62 + 0.2 * fog.b / (fog.b + 1));
      }
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
          sp.vel[i * 3 + 1] -= 9.8 * dt;
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
      }
      sp.live = live;
      spray.visible = live > 0;
      smat.uniforms.uScale.value = window.innerHeight * 0.55;
    },
    // A splash: a sheet of water thrown out sideways and forward.
    splash(x, y, z, speed, heading, big = false) {
      const [fx, fy] = fwd(heading);
      const n = Math.round((big ? 90 : 60) * Math.min(1.3, 0.4 + speed / 14));
      const k1 = Math.min(1.5, 0.4 + speed / 12);
      for (let k = 0; k < n; k++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const out = (1.5 + Math.random() * 3) * k1;
        const fwdV = speed * (0.2 + Math.random() * 0.4);
        const vx = fx * fwdV - fy * out * side;
        const vz = fy * fwdV + fx * out * side;
        emit(x + (Math.random() - 0.5) * 0.6, y + 0.1, z + (Math.random() - 0.5) * 0.6, vx, (1.8 + Math.random() * 3) * k1, vz, 0.5 + Math.random() * 0.6, 0.1 + Math.random() * 0.18);
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
        emit(x - fy * sideJ, y + 0.1, z + fx * sideJ, -fx * speed * 0.12 + (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.2, -fy * speed * 0.12 + (Math.random() - 0.5) * 0.8, 0.35 + Math.random() * 0.35, 0.08 + Math.random() * 0.08);
      }
      sp.live = Math.max(sp.live, 1);
    },
  };
}
