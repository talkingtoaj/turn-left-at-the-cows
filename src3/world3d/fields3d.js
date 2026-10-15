// Fields (crop rows, pasture grass, fences), props (bales, haystacks, rocks),
// power lines and roadside mailboxes. All static, baked into the batches.

import * as THREE from 'three';
import { centroid, DEG, hashString } from '../../src/drive/geom.js';
import { fenceRuns } from '../../src/drive/layout.js';
import { box, cyl } from './shapes.js';
import { ribbon } from './ground.js';
import { objMatrix } from './batch.js';

const I = new THREE.Matrix4();
const GROUND = { cast: false, material: 'ground' };

// Crop looks. Colours match the 2D version: wheat gold rows, corn dark green
// (tall, blocks the view), hay pale stubble, plowed brown furrows.
// base: soil colour under the rows. row: the raised row (null = flat stripe).
const CROPS = {
  wheat: { base: 0xa88d48, gap: 1.45, row: { bottom: 1.3, top: 0.7, h: 0.65, side: 0xc9a744, cap: 0xdcbc58, step: 5 } },
  corn: { base: 0x5e4a30, gap: 1.5, row: { bottom: 0.95, top: 0.6, h: 2.2, jitter: 0.25, side: 0x44702c, cap: 0x5f8a3e, step: 4, cast: true } },
  hay: { base: 0xd2c38a, gap: 1.6, stripe: { w: 0.55, color: 0xb9a86c } },
  plowed: { base: 0x6e5034, gap: 1.1, row: { bottom: 0.9, top: 0, h: 0.22, side: 0x84643f, cap: 0x84643f, step: 6 } },
};
const PASTURE = 0x5c9447;
const PASTURE_ALT = 0x649c4c;

const cropOf = (f) => f.crop || (/hay/.test(f.id) ? 'hay' : 'wheat');

// Row direction frame: d along the rows, n across. rowAngle is a heading
// (0 = north, clockwise); without one, the polygon's longest edge.
function frameOf(f) {
  let a = f.rowAngle;
  if (a == null) {
    let best = -1;
    const p = f.polygon;
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[(i + 1) % p.length];
      const l = Math.hypot(bx - ax, by - ay);
      if (l > best) {
        best = l;
        a = Math.atan2(bx - ax, -(by - ay)) / DEG;
      }
    }
  }
  const r = (a || 0) * DEG;
  return { d: [Math.sin(r), -Math.cos(r)], n: [Math.cos(r), Math.sin(r)] };
}

// u ranges where the line v = const crosses the polygon (given in u, v).
function scanline(poly, v) {
  const us = [];
  for (let i = 0; i < poly.length; i++) {
    const [au, av] = poly[i];
    const [bu, bv] = poly[(i + 1) % poly.length];
    if ((av <= v && bv > v) || (bv <= v && av > v)) us.push(au + ((v - av) / (bv - av)) * (bu - au));
  }
  us.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < us.length; i += 2) out.push([us[i], us[i + 1]]);
  return out;
}

// Calls fn([x0, y0], [x1, y1]) for each row segment, rows `gap` apart along
// the frame, clipped to the polygon and pulled in by `inset` metres.
function eachRow(poly, fr, gap, inset, fn) {
  const P = poly.map(([x, y]) => [x * fr.d[0] + y * fr.d[1], x * fr.n[0] + y * fr.n[1]]);
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const [, v] of P) {
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  const W = (u, v) => [u * fr.d[0] + v * fr.n[0], u * fr.d[1] + v * fr.n[1]];
  for (let v = vmin + inset + gap / 2; v < vmax - inset; v += gap) {
    for (const [u0, u1] of scanline(P, v)) {
      if (u1 - u0 < inset * 2 + 1) continue;
      fn(W(u0 + inset, v), W(u1 - inset, v));
    }
  }
}

// Collects triangles (three.js coords) with outward-facing winding.
class Tris {
  constructor() {
    this.v = [];
  }
  tri(a, b, c, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) this.v.push(...a, ...c, ...b);
    else this.v.push(...a, ...b, ...c);
  }
  quad(a, b, c, d, out) {
    this.tri(a, b, c, out);
    this.tri(a, c, d, out);
  }
  // Square beam from a to b (three.js coords): w across in the vertical
  // plane, t across sideways.
  beam(a, b, w, t) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz) || 1;
    const d = [dx / L, dy / L, dz / L];
    let sx = -d[2], sz = d[0];
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-6) {
      sx = 1;
      sz = 0;
    } else {
      sx /= sl;
      sz /= sl;
    }
    const s = [sx, 0, sz];
    const u = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]];
    const P = (e, ks, ku) => [e[0] + s[0] * ks * t / 2 + u[0] * ku * w / 2, e[1] + s[1] * ks * t / 2 + u[1] * ku * w / 2, e[2] + s[2] * ks * t / 2 + u[2] * ku * w / 2];
    const neg = (v) => [-v[0], -v[1], -v[2]];
    const c = (ks, ku) => [P(a, ks, ku), P(b, ks, ku)];
    const [a00, b00] = c(-1, -1);
    const [a10, b10] = c(1, -1);
    const [a11, b11] = c(1, 1);
    const [a01, b01] = c(-1, 1);
    this.quad(a10, b10, b11, a11, s);
    this.quad(a00, a01, b01, b00, neg(s));
    this.quad(a01, a11, b11, b01, u);
    this.quad(a00, b00, b10, a10, neg(u));
    this.quad(a00, a10, a11, a01, neg(d));
    this.quad(b00, b01, b11, b10, d);
  }
  geometry() {
    if (!this.v.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.v, 3));
    return g;
  }
}

// Small deterministic noise in -0.5..0.5 for row height jitter.
const hash2 = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

// A raised row from a to b (world [x, y]): trapezoid cross-section (bottom
// width, top width, height) that follows the ground. top = 0 makes a ridge.
function rowPrism(sides, caps, a, b, H, r) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const tx = dx / L;
  const ty = dy / L;
  const nx = -ty;
  const ny = tx;
  const n = Math.max(1, Math.ceil(L / r.step));
  const S = [];
  for (let i = 0; i <= n; i++) {
    const x = a[0] + dx * (i / n);
    const y = a[1] + dy * (i / n);
    const g = H(x, y);
    const h = r.h * (r.jitter ? 1 + hash2(x, y) * r.jitter * 2 : 1);
    const pt = (w, up) => [x + nx * w, g + up, y + ny * w];
    S.push({ bl: pt(-r.bottom / 2, -0.05), br: pt(r.bottom / 2, -0.05), tl: pt(-r.top / 2, h), tr: pt(r.top / 2, h) });
  }
  const left = [-nx, 0.3, -ny];
  const right = [nx, 0.3, ny];
  for (let i = 1; i < S.length; i++) {
    const p = S[i - 1];
    const q = S[i];
    sides.quad(p.bl, q.bl, q.tl, p.tl, left);
    sides.quad(p.br, p.tr, q.tr, q.br, right);
    if (r.top > 0) caps.quad(p.tl, q.tl, q.tr, p.tr, [0, 1, 0]);
  }
  const s0 = S[0];
  const s1 = S[S.length - 1];
  if (r.top > 0) {
    sides.quad(s0.bl, s0.tl, s0.tr, s0.br, [-tx, 0, -ty]);
    sides.quad(s1.bl, s1.tl, s1.tr, s1.br, [tx, 0, ty]);
  } else {
    sides.tri(s0.bl, s0.tl, s0.br, [-tx, 0, -ty]);
    sides.tri(s1.bl, s1.tl, s1.br, [tx, 0, ty]);
  }
}

// Soil or grass under a field: draped stripes across the whole polygon.
// Pastures alternate two shades, like mowing stripes.
function fieldBase(batch, f, fr, color, H, alt = color) {
  const W = 5;
  let k = 0;
  eachRow(f.polygon, fr, W, 0.3, (a, b) => {
    const g = ribbon([a, b], W + 0.06, 0.04, H, null, 5);
    if (g) batch.add(g, I, k++ % 2 ? alt : color, GROUND);
  });
}

function cropField(batch, f, H) {
  const look = CROPS[cropOf(f)] || CROPS.wheat;
  const fr = frameOf(f);
  fieldBase(batch, f, fr, look.base, H);
  if (look.stripe) {
    eachRow(f.polygon, fr, look.gap, 1, (a, b) => {
      const g = ribbon([a, b], look.stripe.w, 0.08, H, null, 6);
      if (g) batch.add(g, I, look.stripe.color, GROUND);
    });
    return;
  }
  const r = look.row;
  const sides = new Tris();
  const caps = new Tris();
  eachRow(f.polygon, fr, look.gap, 1.2, (a, b) => rowPrism(sides, caps, a, b, H, r));
  const opts = { cast: !!r.cast };
  const gs = sides.geometry();
  if (gs) batch.add(gs, I, r.side, opts);
  const gc = caps.geometry();
  if (gc) batch.add(gc, I, r.cap, opts);
}

function pasture(batch, f, H) {
  const fr = frameOf(f);
  fieldBase(batch, f, fr, PASTURE, H, PASTURE_ALT);
  // A water trough and a hay feeder, placed along the field's own axis.
  const [cx, cy] = centroid(f.polygon);
  let umax = 0;
  for (const [x, y] of f.polygon) umax = Math.max(umax, (x - cx) * fr.d[0] + (y - cy) * fr.d[1]);
  const at = (k) => [cx + fr.d[0] * umax * k, cy + fr.d[1] * umax * k];
  const ang = Math.atan2(fr.d[0], -fr.d[1]) / DEG + 90;
  const [tx, ty] = at(0.4);
  batch.add(box(3, 0.6, 0.9), objMatrix(tx, ty, H(tx, ty), ang), 0x8a8f96);
  batch.add(box(2.8, 0.05, 0.7), objMatrix(tx, ty, H(tx, ty) + 0.56, ang), 0x467aa6, { cast: false });
  const [fx, fy] = at(-0.5);
  batch.add(cyl(1.1, 1.0, 8), objMatrix(fx, fy, H(fx, fy), 0), 0x6a6f72);
  batch.add(cyl(0.95, 0.5, 8), objMatrix(fx, fy, H(fx, fy) + 0.9, 0), 0xcdb46a, { cast: false });
}

// Fence posts exactly where the collider has them (layout.js fenceRuns).
// wire: thin posts and two strands; rail: square wooden posts every other
// point with three rails. Gaps where roads and mailboxes are. Each field's
// fence is one geometry per colour, built from raw triangles.
function fences(world, batch, H) {
  for (const f of fenceRuns(world)) {
    const style = f.style !== undefined ? f.style : f.field.fence !== undefined ? f.field.fence : 'wire';
    if (!style || style === 'none') continue;
    const posts = new Tris();
    const rails = new Tris();
    const rail = style === 'rail';
    for (const run of f.runs) {
      const pts = rail ? run.filter((_, i) => i % 2 === 0 || i === run.length - 1) : run;
      const hs = pts.map((p) => H(p.x, p.y));
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const h0 = hs[i];
        posts.beam([p.x, h0 - 0.25, p.y], [p.x, h0 + (rail ? 1.35 : 1.15), p.y], rail ? 0.18 : 0.14, rail ? 0.18 : 0.14);
        const q = pts[i + 1];
        if (!q) continue;
        const h1 = hs[i + 1];
        for (const up of rail ? [0.45, 0.85, 1.22] : [0.55, 1.0]) {
          if (rail) rails.beam([p.x, h0 + up, p.y], [q.x, h1 + up, q.y], 0.14, 0.05);
          else rails.beam([p.x, h0 + up, p.y], [q.x, h1 + up, q.y], 0.07, 0.07);
        }
      }
    }
    const wood = f.field.kind === 'crop' ? 0x5a4630 : 0x6a5238;
    const gp = posts.geometry();
    if (gp) batch.add(gp, I, rail ? 0x5a4630 : wood, { cast: rail });
    const gr = rails.geometry();
    if (gr) batch.add(gr, I, rail ? 0x8a6c4a : wood, { cast: rail });
  }
}

export function buildFields(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  fences(world, batch, H);
  for (const f of world.fields || []) {
    if (f.kind === 'crop') cropField(batch, f, H);
    else pasture(batch, f, H);
  }
}

// ---------- props: round bales, haystacks, rocks ----------

const BALE = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2);
const STACK_BASE = new THREE.CylinderGeometry(1, 1.04, 1, 10);
const STACK_TOP = new THREE.ConeGeometry(1.08, 1, 10);
const ROCK_COLORS = [0x8e8a82, 0x9a968c, 0x7f7b74, 0xa39e93];

function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  let s = (seed % 2147483646) + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Same corner, same nudge (the geometry repeats corners per face).
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, 0.75 + r() * 0.45);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.62, p.getZ(i) * k);
  }
  return g;
}

export function buildProps(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  for (const p of world.props || []) {
    const r = p.r || 1;
    const base = H(p.x, p.y);
    if (p.kind === 'bale') {
      // Round bale lying on its side, about 1.2 m wide.
      batch.add(BALE, objMatrix(p.x, p.y, base + r * 0.95, p.angle || 0, 0, 0, 0, new THREE.Matrix4().makeScale(r, r, 1.2)), 0xd9c27a);
    } else if (p.kind === 'haystack') {
      const sb = new THREE.Matrix4().makeScale(r, r * 0.8, r).premultiply(new THREE.Matrix4().makeTranslation(0, r * 0.4 - 0.1, 0));
      batch.add(STACK_BASE, objMatrix(p.x, p.y, base, p.angle || 0, 0, 0, 0, sb), 0xcdb46a);
      const st = new THREE.Matrix4().makeScale(r, r * 0.95, r).premultiply(new THREE.Matrix4().makeTranslation(0, r * 0.8 - 0.1 + r * 0.47, 0));
      batch.add(STACK_TOP, objMatrix(p.x, p.y, base, p.angle || 0, 0, 0, 0, st), 0xbfa55a);
    } else if (p.kind === 'rock') {
      const seed = hashString(String(p.id));
      const sc = new THREE.Matrix4().makeScale(r, r, r);
      batch.add(rockGeo(seed), objMatrix(p.x, p.y, base - r * 0.2, p.angle || 0, 0, 0, 0, sc), ROCK_COLORS[seed % ROCK_COLORS.length]);
    }
  }
}

// ---------- power lines ----------

const POLE_H = 8.6;
const ARM_UP = 7.9;
const ARM_HALF = 1.1;
const MAX_SPAN = 95;

// Wooden poles with a crossarm (batched), and sagging wires between
// consecutive poles as one LineSegments (a single draw call).
export function buildPowerLines(world, terrain, batch) {
  const H = (x, y) => terrain.heightAt(x, y);
  const pole = cyl(0.15, POLE_H, 6, 0.12);
  const arm = box(ARM_HALF * 2 + 0.2, 0.12, 0.12);
  const ins = cyl(0.06, 0.22, 5);
  const verts = [];
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
      batch.add(pole, objMatrix(p.x, p.y, base - 0.3, ang), 0x5b4632);
      batch.place(arm, p.x, p.y, base, ang, 0, 0, ARM_UP - 0.12, 0x4d3b2a);
      const pts = [];
      for (const lx of [-ARM_HALF, 0, ARM_HALF]) {
        const up = lx === 0 ? POLE_H : ARM_UP;
        if (lx !== 0) batch.place(ins, p.x, p.y, base, ang, lx, 0, up, 0x9aa3ab, { cast: false });
        const r = ang * DEG;
        pts.push([p.x + Math.cos(r) * lx, base + up + 0.2, p.y + Math.sin(r) * lx]);
      }
      attach.push(pts);
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
          verts.push(...prev, ...cur);
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

// ---------- mailboxes ----------

const MAILBOX = [0x3a3d40, 0x2f4f6f, 0x6b2f2a, 0x8a8f96, 0x2f5a3a];

export function buildMailboxes(world, terrain, batch) {
  (world.mailboxes || []).forEach((m, i) => {
    const base = terrain.heightAt(m.x, m.y);
    // Door faces the road: local -z is the box's front, turned to `facing`.
    const P = (geo, lx, ly, up, color, opts) => batch.place(geo, m.x, m.y, base, m.facing || 0, lx, ly, up, color, opts);
    P(box(0.12, 1.15, 0.12), 0, 0.15, -0.1, 0x6a4c2e);
    P(box(0.28, 0.06, 0.6), 0, 0, 1.05, 0x6a4c2e, { cast: false });
    const col = MAILBOX[i % MAILBOX.length];
    P(box(0.24, 0.2, 0.5), 0, 0, 1.1, col);
    const top = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    P(top, 0, 0, 1.3, col);
    P(box(0.22, 0.3, 0.03), 0, -0.26, 1.1, 0x2a2a2a, { cast: false });
    // Little red flag, up on some boxes.
    const up = (i % 3) === 0;
    P(box(0.03, 0.35, 0.05), 0.14, 0.12, up ? 1.25 : 1.1, 0xc0392b, { cast: false });
    P(box(0.03, 0.12, 0.16), 0.14, up ? 0.12 : 0.2, up ? 1.5 : 1.3, 0xc0392b, { cast: false });
  });
}
