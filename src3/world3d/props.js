// Road signs (posts and boards; the words are painted by signtext.js) and locals.

import * as THREE from 'three';
import { distToSegment, localToWorld } from '../../src/drive/geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl } from './shapes.js';
import { state } from '../../src/state.js';
import { currentMissionId } from '../../src/game/tourists.js';
import { objMatrix } from './batch.js';
import { FaceAtlas, signStyle, signSize, signLineText, drawSignFace, SIGN_PX_PER_M, handStyle, drawHandFace, HAND_PX_PER_M } from './signtext.js';

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

// Hand-painted boards from world.boards (add-on data, not road signs):
// raw wood on a stake, a field gate or a fence, a little crooked and each
// one painted differently. Words share the road signs' atlas.
function buildBoards(world, terrain, batch) {
  for (const b of world.boards || []) {
    const st = handStyle(b.id, b.lines, b.look);
    const angle = (b.faces + st.yaw + 360) % 360;
    const base = terrain.heightAt(b.x, b.y);
    const P = (geo, lx, ly, up, color, extra) => batch.place(geo, b.x, b.y, base, angle, lx, ly, up, color, extra ? { extra } : undefined);
    const wood = 0x6b5638;
    const lean = new THREE.Matrix4().makeRotationZ(st.tilt * 0.6);
    const roll = new THREE.Matrix4().makeRotationZ(st.tilt);
    let bottom = 0.5;
    const posts = [];
    if (b.mount === 'gate') {
      bottom = 0.5;
      for (const px of [-1.8, 1.8]) {
        P(box(0.14, 1.4, 0.14), px, 0.1, -0.2, wood);
        posts.push(px);
      }
      for (const up of [0.3, 0.68, 1.06]) P(box(3.6, 0.07, 0.04), 0, 0.12, up, 0x8a7550, roll);
    } else if (b.mount === 'stake') {
      bottom = 0.55;
      P(box(0.09, 1.5, 0.09), 0, 0.1, -0.25, wood, lean);
      posts.push(0);
    } else {
      bottom = 0.5;
      for (const px of [-st.w / 2 + 0.15, st.w / 2 - 0.15]) {
        P(box(0.12, 1.3, 0.12), px, 0.08, -0.25, wood);
        posts.push(px);
      }
    }
    if (batch.audit) {
      for (const px of posts) {
        const c = localToWorld(b.x, b.y, angle, px, 0.1);
        batch.audit.circle(b.id, 'sign_post', c.x, c.y, 0.06, base - 0.3);
      }
    }
    const mid = bottom + st.h / 2;
    P(box(st.w + 0.06, st.h + 0.06, 0.05).translate(0, -(st.h + 0.06) / 2, 0), 0, 0, mid, 0x3a2c1a, roll);
    if (!batch.faces) batch.faces = new FaceAtlas();
    batch.faces.add('board:' + b.id, st.w, st.h, HAND_PX_PER_M, drawHandFace(b.lines, st),
      objMatrix(b.x, b.y, base, angle, 0, -0.04, mid, roll));
  }
}

export function buildSigns(world, terrain, batch) {
  buildBoards(world, terrain, batch);
  for (const s of world.signs) {
    const { board, ink } = signStyle(s.lines);
    // Boards grow with their words so letters stay readable from about 15 m.
    const { w: bw, h: bh } = signSize(s.lines);
    // Board front (local -z) faces the oncoming car: the reader drives on
    // heading `facing`, so the front points the opposite way.
    const angle = s.facing != null ? (s.facing + 180) % 360 : bearingToRoad(world, s.x, s.y);
    const base = terrain.heightAt(s.x, s.y);
    const P = (geo, lx, ly, up, color, opts) => batch.place(geo, s.x, s.y, base, angle, lx, ly, up, color, opts);
    if (batch.audit) {
      for (const px of bw > 2 ? [-bw * 0.32, bw * 0.32] : [0]) {
        const c = localToWorld(s.x, s.y, angle, px, 0.08);
        batch.audit.circle(s.id, 'sign_post', c.x, c.y, 0.06, base - 0.3);
      }
    }
    const top = 2.3;
    const posts = bw > 2 ? [-bw * 0.32, bw * 0.32] : [0];
    for (const px of posts) P(box(0.12, top + 0.3, 0.12), px, 0.08, -0.3, 0x4a3a28);
    P(box(bw + 0.12, bh + 0.12, 0.08), 0, 0, top - bh - 0.06, 0x222222);
    P(box(bw, bh, 0.1), 0, 0, top - bh, board);
    // The words: a quad just in front of the board, painted in the shared atlas.
    if (!batch.faces) batch.faces = new FaceAtlas();
    batch.faces.add('sign:' + s.lines.map(signLineText).join('|') + ':' + board, bw, bh, SIGN_PX_PER_M,
      drawSignFace(s.lines, { board, ink }), objMatrix(s.x, s.y, base, angle, 0, -0.056, top - bh / 2));
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
export function buildLocals(world, terrain, audit = null) {
  const group = new THREE.Group();
  const people = [];
  const legGeos = new Map();
  world.locals.forEach((l, i) => {
    const look = l.look || PEOPLE[i % PEOPLE.length];
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
    // Something in the hand or round the neck (tourists, issue 28).
    if (l.carry === 'briefcase') body.push([box(0.12, 0.3, 0.42), 0x4a2f1c, 0.5, 0.5, 0.04]);
    if (l.carry === 'binoculars') body.push([box(0.3, 0.1, 0.12), 0x1c1c1c, 0, 1.35, 0.2]);
    add(mergeParts(body), 0, 0, 0);
    p.position.set(l.x, terrain.heightAt(l.x, l.y), l.y);
    if (audit) audit.circle(l.id, 'local', l.x, l.y, 0.12, terrain.heightAt(l.x, l.y), terrain.heightAt(l.x, l.y));
    group.add(p);
    people.push({ id: l.id, only: l.onlyMission || null, obj: p, x: l.x, y: l.y, yaw: 0, legs: p.children.slice(0, 2), walk: 0 });
  });
  return {
    object: group,
    // Follow the ambient wander (amb.personPos), walk with swinging legs, and
    // turn towards the car when it is close and they are standing.
    update(car, dt, amb) {
      const missionId = currentMissionId(state);
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
        p.obj.visible = dx * dx + dy * dy < 350 * 350 && (!p.only || p.only === missionId);
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

