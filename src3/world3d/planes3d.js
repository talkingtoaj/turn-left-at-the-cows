// Light planes: a low-poly single-engine model built in code (no model
// files), the parked ones (static, batched with the airfield), and the two
// that fly circuits (src/world/airfield.js), each one mesh plus a propeller
// disc: 2 draw calls a plane, no shadow once off the ground.
//
// The flying planes are seen from far off (a kilometre or two), well past
// the camera's far plane. Past 85% of it a plane is drawn closer along the
// same line of sight and scaled down by the same factor, so it looks the
// same size in the same place, and tinted toward the sky colour by its true
// distance (aerial haze) instead of the scene fog, which would hide it.
// Far off it is also drawn a little bigger than life (up to 2.5x at 1.75 km):
// a real light plane a kilometre away is as wide as the moon and easy to
// see, but on a screen that is a handful of pixels.
//
// Model axes: x right (starboard), y up, -z forward; origin on the ground
// under the main wheels.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { planesFor } from '../../src/world/airfield.js';

const DEG = Math.PI / 180;

function part(geo, color, m = null) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const RX = (a) => new THREE.Matrix4().makeRotationX(a);
const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
// A box centred at (x, y, z).
const bx = (w, h, d, x, y, z, color) => part(new THREE.BoxGeometry(w, h, d), color, T(x, y, z));
// A tapered tube along z from z0 to z1 (radii r0 at z0, r1 at z1), centre height y.
function tube(r0, r1, z0, z1, y, color, seg = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg);
  // Cylinder runs along y; turn it so +y goes to +z (top = r1 end).
  return part(g, color, T(0, y, (z0 + z1) / 2).multiply(RX(Math.PI / 2)));
}

// One plane as a single geometry with vertex colours.
// kind: 'high' (Cessna-like high wing) | 'low' (Piper-like low wing).
// prop: 'blades' (parked: two still blades) | 'none' (flying: a disc is separate).
export function planeGeometry({ kind = 'high', color = 0xc0392b, prop = 'blades' } = {}) {
  const WHITE = 0xf2f1ec;
  const GREY = 0x8a8f94;
  const DARK = 0x262c33;
  const TYRE = 0x1e1e1e;
  const parts = [];
  const high = kind === 'high';
  const yF = 1.15; // fuselage centre height
  // Fuselage: engine cowl, cabin, tail cone.
  parts.push(tube(0.42, 0.55, -2.55, -1.35, yF, WHITE));
  parts.push(bx(1.12, 1.25, 2.3, 0, yF + 0.08, -0.25, WHITE));
  parts.push(tube(0.6, 0.14, 0.9, 4.6, yF + 0.12, WHITE));
  // Stripe along the side, windows, windscreen.
  parts.push(bx(1.15, 0.16, 3.6, 0, yF - 0.18, 0.4, color));
  parts.push(bx(1.14, 0.42, 1.5, 0, yF + 0.42, -0.25, DARK));
  parts.push(part(new THREE.BoxGeometry(1.0, 0.5, 0.08), DARK, T(0, yF + 0.5, -1.38).multiply(RX(-0.6))));
  // Wing, its underside a little darker (it is in shade seen from below).
  const wy = high ? yF + 0.75 : yF - 0.5;
  parts.push(bx(10.2, 0.14, 1.5, 0, wy, -0.35, WHITE));
  parts.push(bx(10.0, 0.02, 1.4, 0, wy - 0.075, -0.35, 0xa7abb0));
  parts.push(bx(0.9, 0.06, 4.4, 0, yF - 0.62, 0.6, 0xa7abb0)); // belly
  for (const sx of [-1, 1]) parts.push(bx(0.9, 0.15, 1.52, sx * 4.7, wy, -0.35, color)); // coloured tips
  if (high) {
    // Struts from the lower fuselage to under the wing.
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 0.5, yF - 0.35, -0.3);
      const b = new THREE.Vector3(sx * 2.6, wy - 0.07, -0.35);
      const d = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(0.05, 0.05, d.length(), 4);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      parts.push(part(g, GREY, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
    }
  }
  // Tail: horizontal stabiliser and fin with the plane's colour.
  parts.push(bx(3.4, 0.1, 0.85, 0, yF + 0.2, 4.25, WHITE));
  parts.push(part(new THREE.BoxGeometry(0.1, 1.4, 1.1), color, T(0, yF + 0.85, 4.3).multiply(RX(-0.35))));
  // Landing gear: two mains and a nose wheel.
  for (const sx of [-1, 1]) {
    parts.push(bx(0.08, 0.7, 0.12, sx * 0.85, 0.55, 0.25, GREY));
    parts.push(part(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 8), TYRE, T(sx * 0.95, 0.28, 0.25).multiply(RZ(Math.PI / 2))));
  }
  parts.push(bx(0.08, 0.7, 0.1, 0, 0.55, -1.75, GREY));
  parts.push(part(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 8), TYRE, T(0, 0.24, -1.75).multiply(RZ(Math.PI / 2))));
  // Spinner, and two still blades when parked.
  parts.push(part(new THREE.ConeGeometry(0.2, 0.42, 8), GREY, T(0, yF - 0.05, -2.75).multiply(RX(-Math.PI / 2))));
  if (prop === 'blades') parts.push(bx(0.12, 1.85, 0.05, 0, yF - 0.05, -2.62, DARK));
  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  return geo;
}

// Aerial haze for the flying planes: a mix toward the sky colour, set per plane.
function hazeMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  mat.userData.haze = { value: 0 };
  mat.userData.hazeCol = { value: new THREE.Color() };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = mat.userData.haze;
    sh.uniforms.uHazeCol = mat.userData.hazeCol;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHaze;\nuniform vec3 uHazeCol;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, uHaze);\n#include <fog_fragment>');
  };
  mat.customProgramCacheKey = () => 'plane-haze';
  return mat;
}

const COLORS = [0xc0392b, 0x2d5aa8];

// Flying planes for a world with an airfield, or null.
// update(T, camera, fogColor, rain, groundAt, listener) every frame; T in
// seconds (game clock). Afterwards `sound` holds what the audio should play
// for each plane (src/audio/audio.js updatePlanes).
export function createPlanes3D(scene, world, terrain) {
  const P = planesFor(world);
  if (!P) return null;
  const l = P.landmark;
  const ref = terrain.heightAt(l.x, l.y); // runway ground height: altitudes are above this
  const group = new THREE.Group();
  group.name = 'planes';
  const discGeo = new THREE.CircleGeometry(0.95, 20);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a2a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });
  const planes = [];
  for (let i = 0; i < P.count; i++) {
    const mat = hazeMaterial();
    const body = new THREE.Mesh(planeGeometry({ kind: 'high', color: COLORS[i % COLORS.length], prop: 'none' }), mat);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(0, 1.1, -2.6);
    const obj = new THREE.Group();
    obj.add(body, disc);
    obj.rotation.order = 'YXZ';
    obj.frustumCulled = false;
    body.frustumCulled = false;
    disc.frustumCulled = false;
    group.add(obj);
    planes.push({ obj, body, disc, mat, st: {}, heard: {} });
  }
  scene.add(group);

  const cam = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const sound = planes.map(() => ({ engine: false, x: 0, y: 0, dz: 0, vx: 0, vy: 0, vz: 0, throttle: 0 }));

  return {
    group,
    info: P,
    sound,
    states: planes.map((p) => p.st),
    update(Tsec, camera, fogColor, rain = 0, listener = null) {
      cam.setFromMatrixPosition(camera.matrixWorld);
      const lim = (camera.far || 450) * 0.85;
      const D = 3800 * (1 - 0.55 * rain); // haze distance (m)
      for (let i = 0; i < planes.length; i++) {
        const p = planes[i];
        const s = P.at(i, Tsec, p.st);
        p.obj.visible = !!s.visible;
        if (s.visible) {
          const gy = s.ground ? terrain.heightAt(s.x, s.y) : ref;
          pos.set(s.x, gy + s.alt, s.y);
          const d = pos.distanceTo(cam);
          const boost = 1 + Math.min(1.5, Math.max(0, d - 250) / 1000);
          if (d > lim) {
            const k = lim / d;
            p.obj.position.copy(pos).sub(cam).multiplyScalar(k).add(cam);
            p.obj.scale.setScalar(k * boost);
          } else {
            p.obj.position.copy(pos);
            p.obj.scale.setScalar(boost);
          }
          p.obj.rotation.set(s.pitch, -s.heading * DEG, -s.bank, 'YXZ');
          p.mat.userData.haze.value = Math.min(0.88, 1 - Math.exp(-d / D));
          // Seen against the sky a plane reads a little darker than the haze.
          p.mat.userData.hazeCol.value.copy(fogColor).multiplyScalar(0.78);
          p.disc.visible = !!s.engine;
          p.disc.rotation.z += 0.9;
          const low = s.ground || s.alt < 40;
          p.body.castShadow = low && d < 300;
        }
        // Sound: from where the plane was when the sound we hear now left it.
        const o = sound[i];
        if (!listener) {
          o.engine = false;
          continue;
        }
        let tE = Tsec;
        let h = s;
        for (let k = 0; k < 2; k++) {
          const dist = Math.hypot(h.x - listener.x, h.y - listener.y, (ref + h.alt) - listener.z);
          tE = Tsec - dist / 343;
          h = P.at(i, tE, p.heard);
        }
        o.engine = !!(h.engine && h.visible !== false);
        o.x = h.x;
        o.y = h.y;
        // Height of the engine above the listener's ears.
        o.dz = (h.ground ? terrain.heightAt(h.x, h.y) + 1 : ref + h.alt) - listener.z;
        o.vx = h.vx || 0;
        o.vy = h.vy || 0;
        o.vz = h.vz || 0;
        o.throttle = h.throttle || 0;
        o.ground = !!h.ground;
      }
    },
  };
}
