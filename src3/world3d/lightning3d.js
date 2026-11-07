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
// Reduced motion (prefers-reduced-motion): a single, much dimmer flash.
//
//   const L = createLightning3D(scene, { reducedMotion })
//   L.strike(strike, ear)   strike = { km, bearing, power }, ear = { x, y }
//   L.update(dt, camera)    every frame
//   L.flash                 0..1 now (for checks)

import * as THREE from 'three';

const DEG = Math.PI / 180;
const CLOUD_BASE = 1400; // metres above the ground

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

function ribbon(points, w, out) {
  // Two triangles per segment, as positions (x, y, 0).
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const k = w * (1 - 0.5 * (i / points.length));
    out.push(ax - k, ay, 0, ax + k, ay, 0, bx + k, by, 0, ax - k, ay, 0, bx + k, by, 0, bx - k, by, 0);
  }
}

export function createLightning3D(scene, { reducedMotion = false } = {}) {
  const light = new THREE.AmbientLight(0xdfe8ff, 0);
  scene.add(light);

  // Screen veil: plain DOM above the canvas, below the HUD.
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#e8eeff;opacity:0;mix-blend-mode:screen;z-index:1';
  const app = document.getElementById('app');
  (app || document.body).appendChild(veil);

  // The bolt: a ribbon mesh, rebuilt per strike (a few dozen triangles).
  const maxTris = 2 * 30;
  const pos = new Float32Array(maxTris * 9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf6f8ff, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
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
      const arr = [];
      ribbon(pts, 0.02, arr);
      ribbon(branch, 0.011, arr);
      pos.fill(0);
      pos.set(arr.slice(0, pos.length));
      geo.attributes.position.needsUpdate = true;
      geo.setDrawRange(0, Math.min(arr.length, pos.length) / 3);
      geo.computeBoundingSphere();
      boltOn = !reducedMotion;
    },
    update(dt, camera) {
      t += dt;
      const f = t < 1 ? envelope(t, reducedMotion) * power : 0;
      api.flash = f;
      const dim = reducedMotion ? 0.3 : 1;
      light.intensity = f * 2.2 * dim;
      veil.style.opacity = f > 0.005 ? String(Math.min(0.55, f * 0.45 * dim)) : '0';
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
      mat.opacity = Math.min(1, f * 1.6);
    },
    dispose() {
      veil.remove();
    },
  };
  return api;
}
