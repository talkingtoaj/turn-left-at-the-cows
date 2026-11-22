// A faint rainbow opposite the sun as mission 1's rain clears (#51,
// src/game/opening.js). One see-through quad, one draw, only while it shows.
// The quad hangs DIST m from the camera on the line away from the sun and
// faces the camera; the fragment shader colours the ring 40 to 42 degrees
// from that line (red outside, violet inside), so the bow sits where a real
// one would: low when the sun is high, and hills in front of it hide it.
//
//   const B = createRainbow3D(scene)
//   B.update(camera, sunDir, strength)   strength 0..1 (0 hides it)

import * as THREE from 'three';

const DIST = 260; // m: inside the far plane even in rain
const HALF = 46; // degrees the quad covers from its centre

export function createRainbow3D(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAnti: { value: new THREE.Vector3(0, -1, 0) },
      uStrength: { value: 0 },
    },
    vertexShader: /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */`
uniform vec3 uAnti;
uniform float uStrength;
varying vec3 vWorld;
vec3 spectrum(float x) { // 0 violet .. 1 red: a hue wheel from 0.75 to 0
  float h = (1.0 - x) * 0.75;
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float ang = degrees(acos(clamp(dot(d, uAnti), -1.0, 1.0)));
  float x = (ang - 40.0) / 2.4; // 0 violet edge .. 1 red edge
  float band = smoothstep(-0.25, 0.1, x) * (1.0 - smoothstep(0.9, 1.25, x));
  // A little brighter sky inside the bow, as in a real one.
  float inside = (1.0 - smoothstep(30.0, 40.0, ang)) * 0.025;
  // Fade where it meets the land, and towards the top a touch.
  float base = smoothstep(-0.01, 0.07, d.y);
  float a = (band * 0.13 + inside * (1.0 - band)) * base * uStrength;
  if (a < 0.003) discard;
  vec3 col = mix(vec3(1.0), spectrum(clamp(x, 0.0, 1.0)), band);
  // Added straight onto the screen colour (no colour space step, which
  // would lift these small values and make the bow loud, not faint).
  gl_FragColor = vec4(col * a, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const size = 2 * DIST * Math.tan((HALF * Math.PI) / 180);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.name = 'rainbow';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  scene.add(mesh);
  const anti = new THREE.Vector3();
  return {
    mesh,
    update(camera, sunDir, strength = 0) {
      mesh.visible = strength > 0.002;
      if (!mesh.visible) return;
      anti.copy(sunDir).negate().normalize();
      mat.uniforms.uAnti.value.copy(anti);
      mat.uniforms.uStrength.value = strength;
      mesh.position.copy(camera.position).addScaledVector(anti, DIST);
      mesh.lookAt(camera.position);
    },
  };
}
