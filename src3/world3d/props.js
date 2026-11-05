// Road signs (posts with blank boards, the text lives in the HUD) and locals.

import * as THREE from 'three';
import { distToSegment } from '../../src/drive/geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl } from './shapes.js';

// Bearing (deg, 0 = north) from a sign to the closest point on any road.
function bearingToRoad(world, x, y) {
  let best = Infinity;
  let bx = x;
  let by = y - 1;
  for (const r of world.roads) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i];
      const [cx, cy] = r.points[i + 1];
      const d = distToSegment(x, y, ax, ay, cx, cy);
      if (d < best) {
        best = d;
        const dx = cx - ax;
        const dy = cy - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        bx = ax + dx * t;
        by = ay + dy * t;
      }
    }
  }
  return (Math.atan2(bx - x, -(by - y)) * 180) / Math.PI;
}

export function buildSigns(world, terrain, batch) {
  for (const s of world.signs) {
    const first = (s.lines[0] || '').toUpperCase();
    let board = 0xf0eee6;
    let ink = 0x2a2a2a;
    if (first.includes('BRIDGE OUT') || first.includes('CLOSED')) {
      board = 0xe07b20;
    } else if (s.lines.length === 1 || /^[A-Z .]+$/.test(s.lines[0] || '')) {
      board = 0x2f6b45;
      ink = 0xf0eee6;
    }
    const longest = Math.max(...s.lines.map((t) => t.length));
    const bw = Math.min(3.4, 1.2 + longest * 0.09);
    const bh = 0.35 + s.lines.length * 0.4;
    // Board front (local -z) faces the oncoming car: the reader drives on
    // heading `facing`, so the front points the opposite way.
    const angle = s.facing != null ? (s.facing + 180) % 360 : bearingToRoad(world, s.x, s.y);
    const base = terrain.heightAt(s.x, s.y);
    const P = (geo, lx, ly, up, color, opts) => batch.place(geo, s.x, s.y, base, angle, lx, ly, up, color, opts);
    const top = 2.3;
    const posts = bw > 2 ? [-bw * 0.32, bw * 0.32] : [0];
    for (const px of posts) P(box(0.12, top + 0.3, 0.12), px, 0.08, -0.3, 0x4a3a28);
    P(box(bw + 0.12, bh + 0.12, 0.08), 0, 0, top - bh - 0.06, 0x222222);
    P(box(bw, bh, 0.1), 0, 0, top - bh, board);
    // Lines of "writing": just bars, never readable text.
    s.lines.forEach((t, i) => {
      const w = Math.min(bw - 0.3, 0.3 + t.length * 0.075);
      P(box(w, 0.14, 0.02), 0, -0.06, top - 0.33 - i * 0.4, ink, { cast: false });
    });
  }
}

const PEOPLE = [
  { shirt: 0x2f5f9f, hat: 0xb3261e, legs: 0x3a3f4a },
  { shirt: 0xb84a3a, hat: 0xe0c050, legs: 0x4a5a6a },
  { shirt: 0x5d8a3a, hat: 0x3b3b3b, legs: 0x3a3f4a },
];

// One shared material; part colours live in vertex colours.
const personMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// Bake parts into one geometry: each part is [geometry, colour, x, y, z, rotX].
function mergeParts(parts) {
  const geos = parts.map(([geo, color, x, y, z, rx = 0]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(_m.makeRotationX(rx).setPosition(x, y, z));
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos);
}

// Each local is its own small group (body plus two swinging legs, three draw
// calls) so it can turn to face the car.
export function buildLocals(world, terrain) {
  const group = new THREE.Group();
  const people = [];
  const legGeos = new Map();
  world.locals.forEach((l, i) => {
    const look = PEOPLE[i % PEOPLE.length];
    const p = new THREE.Group();
    const add = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, personMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      p.add(m);
      return m;
    };
    // Legs hang from the hip so they can swing when walking.
    if (!legGeos.has(look.legs)) legGeos.set(look.legs, mergeParts([[box(0.2, 0.85, 0.22).translate(0, -0.85, 0), look.legs, 0, 0, 0]]));
    add(legGeos.get(look.legs), -0.13, 0.85, 0);
    add(legGeos.get(look.legs), 0.13, 0.85, 0);
    const body = [
      [box(0.56, 0.68, 0.3), look.shirt, 0, 0.85, 0],
      [box(0.14, 0.62, 0.16), look.shirt, -0.36, 0.9, 0],
      [box(0.14, 0.62, 0.16), look.shirt, 0.36, 0.9, 0],
      [new THREE.IcosahedronGeometry(0.17, 0), 0xe2b58f, 0, 1.7, 0],
      [cyl(0.2, 0.12, 8), look.hat, 0, 1.8, 0],
      [cyl(0.13, 0.14, 8), look.hat, 0, 1.9, 0],
    ];
    if (/fish/i.test(l.role || '')) {
      body.push([cyl(0.025, 3.2, 4), 0x3a2a1a, 0.4, 1.0, -0.2, -0.9]);
      body.push([cyl(0.22, 0.4, 8, 0.26), 0x8a8f96, 0.7, 0, 0.5]);
    } else {
      body.push([box(0.4, 0.06, 0.5), 0x2a2a2a, 0, 1.79, -0.12]); // cap peak
    }
    add(mergeParts(body), 0, 0, 0);
    p.position.set(l.x, terrain.heightAt(l.x, l.y), l.y);
    group.add(p);
    people.push({ id: l.id, obj: p, x: l.x, y: l.y, yaw: 0, legs: p.children.slice(0, 2), walk: 0 });
  });
  return {
    object: group,
    // Follow the ambient wander (amb.personPos), walk with swinging legs, and
    // turn towards the car when it is close and they are standing.
    update(car, dt, amb) {
      for (const p of people) {
        const pos = amb && amb.personPos ? amb.personPos(p.id) : null;
        if (pos) {
          p.x = pos.x;
          p.y = pos.y;
        }
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        const far = dx * dx + dy * dy > 250 * 250;
        // Past 350 m a person is a pixel or two in the haze.
        p.obj.visible = dx * dx + dy * dy < 350 * 350;
        if (far) continue;
        p.obj.position.set(p.x, terrain.heightAt(p.x, p.y), p.y);
        const moving = pos && pos.moving;
        let target;
        if (moving) target = -(pos.heading * Math.PI) / 180;
        else if (dx * dx + dy * dy < 60 * 60) target = Math.atan2(-dx, -dy); // model faces -z
        else target = pos ? -(pos.heading * Math.PI) / 180 : p.yaw;
        let d = target - p.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw += d * Math.min(1, dt * (moving ? 6 : 3));
        p.obj.rotation.y = p.yaw;
        p.walk = moving ? p.walk + dt * 7 : p.walk * Math.max(0, 1 - dt * 8);
        const swing = moving ? Math.sin(p.walk) * 0.5 : 0;
        p.legs[0].rotation.x = swing;
        p.legs[1].rotation.x = -swing;
      }
    },
  };
}

