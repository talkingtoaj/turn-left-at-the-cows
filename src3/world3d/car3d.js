// Low-poly red car, facing -z at rotation 0 (north), wheels that spin.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEG } from '../../src/drive/geom.js';
import { box } from './shapes.js';

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// Cabin: a box whose top is narrower and shorter, like a sloped glasshouse.
function cabinGeo(wb, lb, wt, lt, h, shiftTop) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wt : wb));
    p.setZ(i, p.getZ(i) * (top ? lt : lb) + (top ? shiftTop : 0));
    p.setY(i, top ? h : 0);
  }
  return g;
}

const BODY = 0xd0553b;

// Car body pieces. `paint` gets the body colour (grey levels so an instance
// colour can tint them), `trim` keeps its own colours. Traffic cars reuse these.
export function carParts(body = null) {
  const L = 4.5;
  const W = 1.9;
  const tone = (hex, grey) => (body === null ? grey : hex);
  const paint = [
    colored(box(W, 0.55, L - 0.2).translate(0, 0.35, 0), tone(BODY, 0xdddddd)), // lower body
    colored(box(W - 0.1, 0.15, L).translate(0, 0.3, 0), tone(0x9c3a2a, 0x9a9a9a)), // sill / bumper line
    colored(box(W - 0.2, 0.12, 1.3).translate(0, 0.9, -1.45), tone(0xe06a4f, 0xf2f2f2)), // bonnet top
    colored(box(W - 0.5, 0.08, 1.45).translate(0, 1.5, 0.5), tone(0xc44a33, 0xcccccc)), // roof
  ];
  const trim = [
    colored(cabinGeo(W - 0.15, 2.3, W - 0.45, 1.5, 0.62, 0.15).translate(0, 0.9, 0.35), 0x24323d), // glass
    colored(box(W + 0.02, 0.18, 0.25).translate(0, 0.32, -L / 2 + 0.05), 0x777777), // front bumper
    colored(box(W + 0.02, 0.18, 0.25).translate(0, 0.32, L / 2 - 0.05), 0x777777), // rear bumper
    colored(box(0.45, 0.16, 0.06).translate(-0.62, 0.62, -L / 2 + 0.08), 0xfff3c4), // headlights
    colored(box(0.45, 0.16, 0.06).translate(0.62, 0.62, -L / 2 + 0.08), 0xfff3c4),
    colored(box(0.4, 0.14, 0.06).translate(-0.65, 0.62, L / 2 - 0.08), 0x9a1010), // tail lights
    colored(box(0.4, 0.14, 0.06).translate(0.65, 0.62, L / 2 - 0.08), 0x9a1010),
  ];
  return { paint, trim };
}

export function buildCar() {
  const { paint, trim } = carParts(BODY);
  const parts = [...paint, ...trim];
  const bodyGeo = mergeGeometries(parts);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(bodyGeo, mat);
  body.castShadow = true;
  body.receiveShadow = true;

  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const tilt = new THREE.Group();
  group.add(tilt);
  tilt.add(body);

  // Tyre and hub in one mesh per wheel (one draw call each).
  const wheelGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2), 0x1e1e1e),
    colored(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 6).rotateZ(Math.PI / 2), 0xb0b0b0),
  ]);
  const wheels = [];
  for (const [x, z] of [[-0.88, -1.42], [0.88, -1.42], [-0.88, 1.38], [0.88, 1.38]]) {
    const w = new THREE.Mesh(wheelGeo, mat);
    w.position.set(x, 0.34, z);
    w.castShadow = true;
    group.add(w); // wheels stay on the ground; the body above them bobs
    wheels.push({ obj: w, front: z < 0, x, z });
  }

  // Ride: the chassis follows the plane under the four tyres (visual only,
  // stepCar is untouched). The body sits on a soft spring above it, so
  // bumps give a small, smooth bob and a little lag in pitch and roll.
  const SPRING = 11; // rad/s
  const DAMP = 0.5; // damping ratio
  const MAX_BOB = 0.07; // m
  const MAX_LEAN = 0.035; // rad, extra body pitch/roll from the spring
  let spin = 0;
  let y = null;
  let pitch = 0;
  let roll = 0;
  let lastX = 0;
  let lastY = 0;
  // Spring states: [offset, velocity] for height, pitch and roll.
  const sp = { y: [0, 0], p: [0, 0], r: [0, 0] };
  const spring = (s, target, dt) => {
    // Semi-implicit Euler in two half steps (stable at 20 fps too).
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      const acc = SPRING * SPRING * (target - s[0]) - 2 * DAMP * SPRING * s[1];
      s[1] += acc * h;
      s[0] += s[1] * h;
    }
    return s[0];
  };
  return {
    object: group,
    // heightAt(x, y) is the surface height under a world point.
    update(car, dt, heightAt, steer) {
      const h = car.heading * DEG;
      const fx = Math.sin(h);
      const fy = -Math.cos(h);
      // Ground under each tyre (local x right, local z back).
      const at = (lx, lz) => heightAt(car.x - fy * lx - fx * lz, car.y + fx * lx - fy * lz);
      const hFL = at(-0.88, -1.42);
      const hFR = at(0.88, -1.42);
      const hRL = at(-0.88, 1.38);
      const hRR = at(0.88, 1.38);
      const target = (hFL + hFR + hRL + hRR) / 4;
      const tPitch = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, 2.8);
      const tRoll = Math.atan2((hFR + hRR) / 2 - (hFL + hRL) / 2, 1.76);
      const jumped = y === null || Math.hypot(car.x - lastX, car.y - lastY) > 5;
      lastX = car.x;
      lastY = car.y;
      if (jumped) {
        y = target;
        pitch = tPitch;
        roll = tRoll;
        sp.y[0] = sp.y[1] = sp.p[0] = sp.p[1] = sp.r[0] = sp.r[1] = 0;
      } else if (dt > 0) {
        // Chassis: quick but smooth (no jitter from single bumps).
        const k = 1 - Math.exp(-dt * 22);
        const prevY = y;
        const prevP = pitch;
        const prevR = roll;
        y += (target - y) * k;
        pitch += (tPitch - pitch) * k;
        roll += (tRoll - roll) * k;
        // Body: kicked opposite to how the chassis just moved, springs back.
        sp.y[0] -= y - prevY;
        sp.p[0] -= (pitch - prevP) * 0.6;
        sp.r[0] -= (roll - prevR) * 0.6;
        spring(sp.y, 0, dt);
        spring(sp.p, 0, dt);
        spring(sp.r, 0, dt);
        sp.y[0] = Math.max(-MAX_BOB, Math.min(MAX_BOB, sp.y[0]));
        sp.p[0] = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, sp.p[0]));
        sp.r[0] = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, sp.r[0]));
      }
      group.position.set(car.x, y, car.y);
      group.rotation.set(pitch, -h, roll);
      tilt.position.y = sp.y[0];
      tilt.rotation.set(sp.p[0], 0, sp.r[0]);
      spin -= (car.speed * dt) / 0.34;
      for (const w of wheels) {
        w.obj.rotation.set(spin, w.front ? -steer * 0.4 : 0, 0, 'YXZ');
      }
    },
  };
}
