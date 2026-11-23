// Power poles along the paved roads (#61): a tapered wooden pole with a
// weathered top, a bevelled crossarm on two steel braces, glass insulators
// on pins, and a transformer can on about one pole in six (fencePlan.js).
// The poles go into the shared batches; the sagging wires (and each can's
// drop wire) are one LineSegments, a single draw call.

import * as THREE from 'three';
import { DEG, hashString } from '../../src/drive/geom.js';
import { box, cyl, cone, strut } from './shapes.js';
import { outline, slab } from './roundShapes.js';
import { objMatrix } from './batch.js';
import { hasTransformer } from './fencePlan.js';

const POLE_H = 8.6;
const ARM_UP = 7.9;
const ARM_HALF = 1.1;
const MAX_SPAN = 95;
// Wires sit in the insulator's groove, this far above its pin's foot.
const SEAT = 0.17;

const WOOD = 0x5b4632;
const ARM_WOOD = 0x4d3b2a;
const STEEL = 0x55595e;
// Old glass comes in a few tints: aqua, bottle green, clear.
const GLASS = [0x7cc0b2, 0x5e9e7a, 0xa9c9c4];
const CAN = 0x8b9197;
const CAN_LID = 0x767c82;
const PORCELAIN = 0x6b3a2a;

// A pin-type glass insulator on its steel pin, foot at y = 0: a wide skirt,
// a groove for the wire and a round dome. One lathe, 8 sides.
function insulatorGeo() {
  const prof = [[0.026, 0.06], [0.058, 0.06], [0.054, 0.09], [0.04, 0.125], [0.042, 0.16], [0.032, SEAT], [0.036, 0.19], [0.026, 0.215], [0.001, 0.225]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(prof, 8);
}

function parts() {
  // Arm: 2.4 m of 0.1 x 0.12 timber with softened edges, along local x.
  const armShape = outline([[-0.05, 0, 0.015], [0.05, 0, 0.015], [0.05, 0.12, 0.015], [-0.05, 0.12, 0.015]]);
  return {
    pole: cyl(0.16, POLE_H, 8, 0.12),
    cap: cone(0.125, 0.07, 8),
    arm: slab(armShape, ARM_HALF * 2 + 0.2, 0.015, 'zy', 0, 2),
    // Two flat straps from the arm down to the pole, and the bolt plate.
    braces: [-1, 1].map((s) => strut(new THREE.Vector3(s * 0.62, ARM_UP - 0.1, 0), new THREE.Vector3(s * 0.12, ARM_UP - 0.78, 0), 0.018, 4)),
    plate: box(0.16, 0.14, 0.03),
    pin: cyl(0.015, 0.07, 5),
    glass: insulatorGeo(),
    // The can: body, rim, lid with a low dome, two bushings, a bracket.
    can: cyl(0.26, 0.8, 10),
    rim: cyl(0.275, 0.035, 10),
    dome: cone(0.27, 0.06, 10),
    bushing: cyl(0.03, 0.14, 6),
    skirt: cyl(0.05, 0.018, 6),
    bracket: box(0.06, 0.07, 0.24),
    ground: box(0.02, 6.6, 0.02),
  };
}

export function buildPowerLines(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  const G = parts();
  const verts = [];
  const seg = (a, b) => verts.push(...a, ...b);
  for (const line of world.powerLines || []) {
    const ps = line.poles || [];
    const attach = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const a = ps[i - 1] || p;
      const b = ps[i + 1] || p;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (!dx && !dy) dy = 1;
      // Heading of the line here; the crossarm runs along local x, square to it.
      const ang = Math.atan2(dx, -dy) / DEG;
      const base = H(p.x, p.y);
      const P = (geo, lx, ly, up, color, opts) => batch.place(geo, p.x, p.y, base, ang, lx, ly, up, color, opts);
      const glass = GLASS[hashString(`${line.id}:${i}`) % GLASS.length];
      // A shared pole (a branch line's end, src/world/fill.js) is already
      // drawn by the line it belongs to; only its wires are added here.
      if (!p.shared) {
        batch.add(G.pole, objMatrix(p.x, p.y, base - 0.3, ang), WOOD);
        if (batch.audit) batch.audit.circle(line.id || 'power', 'power_pole', p.x, p.y, 0.15, base - 0.3);
        P(G.cap, 0, 0, POLE_H - 0.3, ARM_WOOD, { cast: false });
        P(G.arm, 0, 0, ARM_UP - 0.12, ARM_WOOD);
        for (const br of G.braces) P(br, 0, 0.07, 0, STEEL, { cast: false });
        P(G.plate, 0, -0.075, ARM_UP - 0.13, STEEL, { cast: false });
      }
      const pts = [];
      for (const lx of [-ARM_HALF, 0, ARM_HALF]) {
        // The pole stands 0.3 m into the ground, so its top is POLE_H - 0.3
        // up; the middle wire sits on an insulator there, not in the air.
        const up = lx === 0 ? POLE_H - 0.3 : ARM_UP;
        if (!p.shared) {
          P(G.pin, lx, 0, up, STEEL, { cast: false });
          P(G.glass, lx, 0, up, glass, { cast: false });
        }
        const r = ang * DEG;
        pts.push([p.x + Math.cos(r) * lx, base + up + SEAT, p.y + Math.sin(r) * lx]);
      }
      attach.push(pts);
      if (!p.shared && hasTransformer(line.id, ps, i)) {
        // The can hangs on the pole's back (along the line), below the arm.
        const ly = 0.42;
        const bot = 6.1;
        P(G.can, 0, ly, bot, CAN);
        P(G.rim, 0, ly, bot - 0.01, CAN_LID, { cast: false });
        P(G.rim, 0, ly, bot + 0.8, CAN_LID, { cast: false });
        P(G.dome, 0, ly, bot + 0.835, CAN_LID, { cast: false });
        for (const up of [bot + 0.15, bot + 0.6]) P(G.bracket, 0, 0.2, up, STEEL, { cast: false });
        // Ground wire down the far side of the pole.
        P(G.ground, 0, -0.15, -0.1, STEEL, { cast: false });
        const r = ang * DEG;
        for (const bx of [-0.12, 0.12]) {
          const top = bot + 0.89;
          P(G.bushing, bx, ly, top, PORCELAIN, { cast: false });
          for (const k of [0.04, 0.09]) P(G.skirt, bx, ly, top + k, PORCELAIN, { cast: false });
          // Drop wire from the high-side bushing up to the nearest outer wire.
          if (bx > 0) {
            const wx = (ox, oy) => [p.x + Math.cos(r) * ox - Math.sin(r) * oy, p.y + Math.sin(r) * ox + Math.cos(r) * oy];
            const [sx, sy] = wx(bx, ly);
            const [ex, ey] = wx(ARM_HALF - 0.15, 0);
            const s0 = [sx, base + top + 0.14, sy];
            const mid = [(sx + ex) / 2, base + (top + ARM_UP) / 2 + 0.2, (sy + ey) / 2];
            const e = [ex, base + ARM_UP + SEAT - 0.02, ey];
            seg(s0, mid);
            seg(mid, e);
          }
        }
      }
    }
    for (let i = 1; i < ps.length; i++) {
      const span = Math.hypot(ps[i].x - ps[i - 1].x, ps[i].y - ps[i - 1].y);
      if (span > MAX_SPAN) continue;
      const sag = 0.025 * span;
      const N = 10;
      for (let k = 0; k < 3; k++) {
        // Wires keep their side across a span even if the arm turns.
        const a = attach[i - 1][k];
        const b = attach[i][k];
        let prev = a;
        for (let j = 1; j <= N; j++) {
          const t = j / N;
          const cur = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t];
          seg(prev, cur);
          prev = cur;
        }
      }
    }
  }
  if (!verts.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
  lines.matrixAutoUpdate = false;
  return lines;
}
