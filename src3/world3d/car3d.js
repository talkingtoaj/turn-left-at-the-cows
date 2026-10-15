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

export function buildCar() {
  const L = 4.5;
  const W = 1.9;
  const parts = [
    colored(box(W, 0.55, L - 0.2).translate(0, 0.35, 0), BODY), // lower body
    colored(box(W - 0.1, 0.15, L).translate(0, 0.3, 0), 0x9c3a2a), // sill / bumper line
    colored(box(W - 0.2, 0.12, 1.3).translate(0, 0.9, -1.45), 0xe06a4f), // bonnet top
    colored(cabinGeo(W - 0.15, 2.3, W - 0.45, 1.5, 0.62, 0.15).translate(0, 0.9, 0.35), 0x24323d), // glass
    colored(box(W - 0.5, 0.08, 1.45).translate(0, 1.5, 0.5), 0xc44a33), // roof
    colored(box(W + 0.02, 0.18, 0.25).translate(0, 0.32, -L / 2 + 0.05), 0x777777), // front bumper
    colored(box(W + 0.02, 0.18, 0.25).translate(0, 0.32, L / 2 - 0.05), 0x777777), // rear bumper
    colored(box(0.45, 0.16, 0.06).translate(-0.62, 0.62, -L / 2 + 0.08), 0xfff3c4), // headlights
    colored(box(0.45, 0.16, 0.06).translate(0.62, 0.62, -L / 2 + 0.08), 0xfff3c4),
    colored(box(0.4, 0.14, 0.06).translate(-0.65, 0.62, L / 2 - 0.08), 0x9a1010), // tail lights
    colored(box(0.4, 0.14, 0.06).translate(0.65, 0.62, L / 2 - 0.08), 0x9a1010),
  ];
  const bodyGeo = mergeGeometries(parts);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  body.castShadow = true;
  body.receiveShadow = true;

  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const tilt = new THREE.Group();
  group.add(tilt);
  tilt.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 6).rotateZ(Math.PI / 2);
  const tyre = new THREE.MeshLambertMaterial({ color: 0x1e1e1e, flatShading: true });
  const hub = new THREE.MeshLambertMaterial({ color: 0xb0b0b0, flatShading: true });
  const wheels = [];
  for (const [x, z] of [[-0.88, -1.42], [0.88, -1.42], [-0.88, 1.38], [0.88, 1.38]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.34, z);
    const t = new THREE.Mesh(wheelGeo, tyre);
    t.castShadow = true;
    w.add(t, new THREE.Mesh(hubGeo, hub));
    tilt.add(w);
    wheels.push({ obj: w, front: z < 0 });
  }

  let spin = 0;
  let y = null;
  let pitch = 0;
  let roll = 0;
  return {
    object: group,
    // heightAt(x, y) is the surface height under a world point.
    update(car, dt, heightAt, steer) {
      const h = car.heading * DEG;
      const fx = Math.sin(h);
      const fy = -Math.cos(h);
      const hf = heightAt(car.x + fx * 1.4, car.y + fy * 1.4);
      const hb = heightAt(car.x - fx * 1.4, car.y - fy * 1.4);
      const hr = heightAt(car.x - fy * 0.85, car.y + fx * 0.85);
      const hl = heightAt(car.x + fy * 0.85, car.y - fx * 0.85);
      const target = (hf + hb + hr + hl) / 4;
      const k = Math.min(1, dt * 12);
      y = y === null ? target : y + (target - y) * k;
      pitch += (Math.atan2(hf - hb, 2.8) - pitch) * k;
      roll += (Math.atan2(hr - hl, 1.7) - roll) * k;
      group.position.set(car.x, y, car.y);
      group.rotation.set(pitch, -h, roll);
      spin -= (car.speed * dt) / 0.34;
      for (const w of wheels) {
        w.obj.rotation.set(spin, w.front ? -steer * 0.4 : 0, 0, 'YXZ');
      }
    },
  };
}
