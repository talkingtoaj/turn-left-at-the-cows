// Road signs (posts and boards; the words are painted by signtext.js). Locals
// are built in people3d.js and re-exported from here.

import * as THREE from 'three';
import { distToSegment, localToWorld } from '../../src/drive/geom.js';
import { box } from './shapes.js';
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

// Locals live in people3d.js (#56).
export { buildLocals } from './people3d.js';
