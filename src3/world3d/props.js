// Road signs (posts with blank boards, the text lives in the HUD) and locals.

import * as THREE from 'three';
import { distToSegment } from '../../src/drive/geom.js';
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

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

// Each local is its own small group so it can turn to face the car.
export function buildLocals(world, terrain) {
  const group = new THREE.Group();
  const people = [];
  world.locals.forEach((l, i) => {
    const look = PEOPLE[i % PEOPLE.length];
    const p = new THREE.Group();
    const add = (geo, color, x, y, z) => {
      const m = new THREE.Mesh(geo, lam(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      p.add(m);
      return m;
    };
    add(box(0.2, 0.85, 0.22), look.legs, -0.13, 0, 0);
    add(box(0.2, 0.85, 0.22), look.legs, 0.13, 0, 0);
    add(box(0.56, 0.68, 0.3), look.shirt, 0, 0.85, 0);
    add(box(0.14, 0.62, 0.16), look.shirt, -0.36, 0.9, 0);
    add(box(0.14, 0.62, 0.16), look.shirt, 0.36, 0.9, 0);
    add(new THREE.IcosahedronGeometry(0.17, 0), 0xe2b58f, 0, 1.7, 0);
    add(cyl(0.2, 0.12, 8), look.hat, 0, 1.8, 0);
    add(cyl(0.13, 0.14, 8), look.hat, 0, 1.9, 0);
    if (/fish/i.test(l.role || '')) {
      const rod = add(cyl(0.025, 3.2, 4), 0x3a2a1a, 0.4, 1.0, -0.2);
      rod.rotation.x = -0.9;
      add(cyl(0.22, 0.4, 8, 0.26), 0x8a8f96, 0.7, 0, 0.5);
    } else {
      add(box(0.4, 0.06, 0.5), 0x2a2a2a, 0, 1.79, -0.12); // cap peak
    }
    p.position.set(l.x, terrain.heightAt(l.x, l.y), l.y);
    group.add(p);
    people.push({ obj: p, x: l.x, y: l.y, yaw: 0 });
  });
  return {
    object: group,
    // Turn towards the car when it is close.
    update(car, dt) {
      for (const p of people) {
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        if (dx * dx + dy * dy > 60 * 60) continue;
        const target = Math.atan2(-dx, -dy); // model faces -z
        let d = target - p.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.yaw += d * Math.min(1, dt * 3);
        p.obj.rotation.y = p.yaw;
      }
    },
  };
}

