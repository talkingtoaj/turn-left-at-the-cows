// Low-poly red car, facing -z at rotation 0 (north), wheels that spin.
// The player's car shows damage: dents pushed into the body where it was hit
// (vertex offsets on the one body mesh, rebuilt only when the dents change)
// and a squashed tyre when a tyre is flat.

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

// Box with the base on y = 0, split into segments so it can dent.
function sbox(w, h, d, sx, sy, sz) {
  return new THREE.BoxGeometry(w, h, d, sx, sy, sz).translate(0, h / 2, 0);
}

// Cabin: a box whose top is narrower and shorter, like a sloped glasshouse.
function cabinGeo(wb, lb, wt, lt, h, shiftTop, sx = 1, sz = 1) {
  const g = new THREE.BoxGeometry(1, 1, 1, sx, 1, sz);
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
// split: cut the big panels into segments so they can dent (player car).
export function carParts(body = null, split = false) {
  const L = 4.5;
  const W = 1.9;
  const tone = (hex, grey) => (body === null ? grey : hex);
  const bx = (w, h, d, sx, sy, sz) => (split ? sbox(w, h, d, sx, sy, sz) : box(w, h, d));
  const paint = [
    colored(bx(W, 0.55, L - 0.2, 4, 2, 9).translate(0, 0.35, 0), tone(BODY, 0xdddddd)), // lower body
    colored(bx(W - 0.1, 0.15, L, 4, 1, 9).translate(0, 0.3, 0), tone(0x9c3a2a, 0x9a9a9a)), // sill / bumper line
    colored(bx(W - 0.2, 0.12, 1.3, 4, 1, 3).translate(0, 0.9, -1.45), tone(0xe06a4f, 0xf2f2f2)), // bonnet top
    colored(bx(W - 0.5, 0.08, 1.45, 3, 1, 3).translate(0, 1.5, 0.5), tone(0xc44a33, 0xcccccc)), // roof
  ];
  const trim = [
    colored(cabinGeo(W - 0.15, 2.3, W - 0.45, 1.5, 0.62, 0.15, split ? 2 : 1, split ? 4 : 1).translate(0, 0.9, 0.35), 0x24323d), // glass
    colored(bx(W + 0.02, 0.18, 0.25, 4, 1, 1).translate(0, 0.32, -L / 2 + 0.05), 0x777777), // front bumper
    colored(bx(W + 0.02, 0.18, 0.25, 4, 1, 1).translate(0, 0.32, L / 2 - 0.05), 0x777777), // rear bumper
    colored(box(0.45, 0.16, 0.06).translate(-0.62, 0.62, -L / 2 + 0.08), 0xfff3c4), // headlights
    colored(box(0.45, 0.16, 0.06).translate(0.62, 0.62, -L / 2 + 0.08), 0xfff3c4),
    colored(box(0.4, 0.14, 0.06).translate(-0.65, 0.62, L / 2 - 0.08), 0x9a1010), // tail lights
    colored(box(0.4, 0.14, 0.06).translate(0.65, 0.62, L / 2 - 0.08), 0x9a1010),
  ];
  return { paint, trim };
}

export function buildCar() {
  const { paint, trim } = carParts(BODY, true);
  const parts = [...paint, ...trim];
  const bodyGeo = mergeGeometries(parts);
  const dents = createDents(bodyGeo);
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
  // Each wheel hangs in a holder at ground level, so a flat tyre can be
  // squashed (holder scaled) while the wheel itself spins.
  const wheels = [];
  for (const [x, z] of [[-0.88, -1.42], [0.88, -1.42], [-0.88, 1.38], [0.88, 1.38]]) {
    const w = new THREE.Mesh(wheelGeo, mat);
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    w.position.set(0, 0.34, 0);
    w.castShadow = true;
    holder.add(w);
    group.add(holder); // wheels stay on the ground; the body above them bobs
    wheels.push({ obj: w, holder, front: z < 0, x, z });
  }
  let flatKey = -2;
  let dentKey = -1;
  let dentOf = null;
  // Damage look from state.damage (src/game/damage.js), or null for a fresh car.
  function showDamage(d) {
    // A fresh car (mission restart) is a new damage object.
    const v = d ? d.dentsV || 0 : 0;
    if (d !== dentOf || v !== dentKey) {
      dentOf = d;
      dentKey = v;
      dents.apply(d && d.dents ? d.dents : []);
    }
    // Which wheel is flat (-1 none). Wheel order matches WHEELS in collider.js.
    let flat = -1;
    if (d && d.tyres < 0.45) flat = d.flatWheel >= 0 ? d.flatWheel : d.flatSide < 0 ? 0 : 1;
    if (flat !== flatKey) {
      flatKey = flat;
      wheels.forEach((w, i) => {
        const sq = i === flat;
        w.holder.scale.set(sq ? 1.12 : 1, sq ? 0.72 : 1, sq ? 1.06 : 1);
      });
    }
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
  // A flat tyre drops that corner a little.
  const flatDrop = () => (flatKey < 0 ? null : wheels[flatKey]);
  return {
    object: group,
    showDamage,
    // heightAt(x, y) is the surface height under a world point.
    // damage (optional): state.damage, for dents and a flat tyre.
    update(car, dt, heightAt, steer, damage) {
      if (damage !== undefined) showDamage(damage);
      const h = car.heading * DEG;
      const fx = Math.sin(h);
      const fy = -Math.cos(h);
      // Ground under each tyre (local x right, local z back).
      const at = (lx, lz) => heightAt(car.x - fy * lx - fx * lz, car.y + fx * lx - fy * lz);
      const hFL = at(-0.88, -1.42);
      const hFR = at(0.88, -1.42);
      const hRL = at(-0.88, 1.38);
      const hRR = at(0.88, 1.38);
      const fw = flatDrop();
      const drop = (lx, lz) => (fw && fw.x === lx && fw.z === lz ? 0.09 : 0);
      const dFL = drop(-0.88, -1.42);
      const dFR = drop(0.88, -1.42);
      const dRL = drop(-0.88, 1.38);
      const dRR = drop(0.88, 1.38);
      const target = (hFL + hFR + hRL + hRR) / 4;
      const tPitch = Math.atan2((hFL - dFL + hFR - dFR) / 2 - (hRL - dRL + hRR - dRR) / 2, 2.8);
      const tRoll = Math.atan2((hFR - dFR + hRR - dRR) / 2 - (hFL - dFL + hRL - dRL) / 2, 1.76);
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

// Dents: pushes body vertices in where the car was hit. Every vertex moves
// by a smooth function of its own rest position, so the copies of a corner
// that the merged (non-indexed) mesh keeps all move together and nothing
// tears. Paint near a dent darkens a little (scuffed).
const HALF_W = 0.95;
const HALF_L = 2.25;
function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function createDents(geo) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const rest = pos.array.slice();
  const restCol = col.array.slice();
  const n = pos.count;
  return {
    // list: [{ f, r, amount }] (car space: f forward, r right).
    apply(list) {
      const p = pos.array;
      const c = col.array;
      p.set(rest);
      c.set(restCol);
      for (const dent of list) {
        // Where the hit direction leaves the body outline (local x right, z back).
        const t = Math.min(HALF_W / Math.max(1e-3, Math.abs(dent.r)), HALF_L / Math.max(1e-3, Math.abs(dent.f)));
        const cx = dent.r * t;
        const cz = -dent.f * t;
        const cy = 0.62;
        const a = dent.amount;
        const depth = Math.min(0.42, 0.05 + a * 1.1);
        const R = Math.min(1.15, 0.55 + a * 1.6);
        // Push straight in along the hit, plus a little down (crumple).
        const ix = -dent.r;
        const iz = dent.f;
        for (let i = 0; i < n; i++) {
          const k = i * 3;
          const x = rest[k];
          const y = rest[k + 1];
          const z = rest[k + 2];
          const dx = x - cx;
          const dy = (y - cy) * 1.3;
          const dz = z - cz;
          const q = (dx * dx + dy * dy + dz * dz) / (R * R);
          if (q >= 1) continue;
          const fall = (1 - q) * (1 - q);
          const jag = 0.65 + 0.7 * hash3(x, y, z);
          const m = depth * fall * jag;
          p[k] += ix * m;
          p[k + 2] += iz * m;
          p[k + 1] -= m * 0.35 * (y > 0.5 ? 1 : 0.3);
          const dark = 1 - 0.42 * fall;
          c[k] *= dark;
          c[k + 1] *= dark;
          c[k + 2] *= dark;
        }
      }
      // Never push a vertex through to the other side of the car.
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        if (Math.sign(p[k]) !== Math.sign(rest[k]) && Math.abs(rest[k]) > 0.05) p[k] = rest[k] * 0.15;
        if (Math.sign(p[k + 2]) !== Math.sign(rest[k + 2]) && Math.abs(rest[k + 2]) > 0.05) p[k + 2] = rest[k + 2] * 0.15;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      geo.computeBoundingSphere();
    },
  };
}
