// Fields (crop rows, pasture grass, fences), props (bales, haystacks, rocks),
// power lines and roadside mailboxes. All static, baked into the batches.

import * as THREE from 'three';
import { centroid, DEG, hashString, localToWorld, makeRng } from '../../src/drive/geom.js';
import { fenceRuns } from '../../src/drive/layout.js';
import { box, cyl } from './shapes.js';
import { CELL } from './terrain.js';
import { objMatrix } from './batch.js';
import { FaceAtlas, drawPlateFace, PLATE_PX_PER_M } from './signtext.js';

const I = new THREE.Matrix4();

// Crop looks. Colours match the 2D version: wheat gold rows, corn dark green
// (tall, blocks the view), hay pale stubble, plowed brown furrows.
// base: soil colour under the rows. row: the raised row (null = flat stripe).
const CROPS = {
  wheat: { base: 0xa88d48, gap: 1.45, row: { bottom: 1.3, top: 0.7, h: 0.65, side: 0xc9a744, cap: 0xdcbc58 } },
  corn: { base: 0x5e4a30, gap: 1.5, row: { bottom: 0.95, top: 0.6, h: 2.2, jitter: 0.25, side: 0x44702c, cap: 0x5f8a3e, cast: true } },
  hay: { base: 0xd2c38a, gap: 1.6, stripe: { w: 0.55, color: 0xb9a86c } },
  plowed: { base: 0x6e5034, gap: 1.1, row: { bottom: 0.9, top: 0, h: 0.22, side: 0x84643f, cap: 0x84643f } },
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
export class Tris {
  constructor() {
    this.v = [];
  }
  tri(a, b, c, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const v = this.v;
    const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
    const p = flip ? c : b;
    const q = flip ? b : c;
    v.push(a[0], a[1], a[2], p[0], p[1], p[2], q[0], q[1], q[2]);
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

// Where a straight line from a to b crosses the terrain's triangle edges
// (grid lines x = i*CELL, y = j*CELL and the cell diagonals), as fractions
// 0..1. Between two crossings the ground under the line is one flat piece.
function groundBends(a, b, maxStep = 2) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const ts = [0, 1];
  const family = (p0, dp) => {
    // Crossings of p(t) = p0 + dp * t with integer multiples of CELL.
    if (Math.abs(dp) < 1e-9) return;
    const k0 = Math.ceil(Math.min(p0, p0 + dp) / CELL);
    const k1 = Math.floor(Math.max(p0, p0 + dp) / CELL);
    for (let k = k0; k <= k1; k++) ts.push((k * CELL - p0) / dp);
  };
  family(a[0], dx);
  family(a[1], dy);
  family(a[0] - a[1], dx - dy); // diagonals: gx - gy = integer
  const n = Math.ceil(L / maxStep);
  for (let i = 1; i < n; i++) ts.push(i / n);
  const lattice = new Set();
  for (let i = 1; i < n; i++) lattice.add(i / n);
  ts.sort((p, q) => p - q);
  const out = [];
  const minGap = 0.25 / Math.max(L, 1e-6);
  for (const t of ts) {
    if (t < 0 || t > 1) continue;
    if (out.length && t - out[out.length - 1] < minGap) {
      if (t === 1) out[out.length - 1] = 1;
      continue;
    }
    out.push(t);
  }
  // Which samples are the regular steps (kept for rows whose height wobbles).
  return out.map((t) => ({ t, step: lattice.has(t) }));
}

// Smooth height wobble along rows (-1..1), continuous so dense samples do not
// make a jagged top.
const rowWobble = (x, y) => 0.6 * Math.sin(x * 0.9 + y * 1.7) + 0.4 * Math.sin(x * 2.3 - y * 0.8 + 1.3);

const ROW_SINK = 0.3; // row bottoms sink this far into the ground
const ROW_TOL = 0.03; // drop bend samples that change the shape by less than this

// Keeps the samples that matter: where dropping one would move the row's
// ground line or bottom edges by more than ROW_TOL (Douglas-Peucker on
// heights), plus forced ones (regular steps on rows whose height wobbles).
function simplifyRow(S) {
  if (S.length <= 2) return S;
  const keep = new Uint8Array(S.length);
  keep[0] = keep[S.length - 1] = 1;
  const err = (i, j, k) => {
    const u = (S[k].t - S[i].t) / (S[j].t - S[i].t);
    let e = 0;
    if (S[k].force) return Infinity;
    e = Math.abs(S[k].g - (S[i].g + (S[j].g - S[i].g) * u));
    for (const key of ['bl', 'br']) {
      const lin = S[i][key][1] + (S[j][key][1] - S[i][key][1]) * u;
      e = Math.max(e, Math.abs(S[k][key][1] - lin));
    }
    return e;
  };
  const stack = [[0, S.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = -1;
    let wk = -1;
    for (let k = i + 1; k < j; k++) {
      const e = err(i, j, k);
      if (e > worst) {
        worst = e;
        wk = k;
      }
    }
    if (wk >= 0 && worst > ROW_TOL) {
      keep[wk] = 1;
      stack.push([i, wk], [wk, j]);
    }
  }
  return S.filter((_, k) => keep[k]);
}

// A raised row from a to b (world [x, y]): trapezoid cross-section (bottom
// width, top width, height) that follows the ground, bending wherever the
// ground does. Bottom edges sit ROW_SINK under the ground at their own spot.
// top = 0 makes a ridge.
export function rowPrism(sides, caps, a, b, H, r, audit = null, id = 'row') {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const tx = dx / L;
  const ty = dy / L;
  const nx = -ty;
  const ny = tx;
  let S = [];
  for (const { t, step } of groundBends(a, b, r.jitter ? 4 : 2)) {
    const x = a[0] + dx * t;
    const y = a[1] + dy * t;
    const g = H(x, y);
    const h = r.h * (r.jitter ? 1 + rowWobble(x, y) * r.jitter : 1);
    const pt = (w, up) => [x + nx * w, g + up, y + ny * w];
    const bot = (w) => {
      const px = x + nx * w;
      const py = y + ny * w;
      return [px, Math.min(H(px, py), g) - ROW_SINK, py];
    };
    S.push({ t, g, force: step && !!r.jitter, bl: bot(-r.bottom / 2), br: bot(r.bottom / 2), tl: pt(-r.top / 2, h), tr: pt(r.top / 2, h), h });
  }
  S = simplifyRow(S);
  if (audit) {
    audit.row({
      id, kind: 'crop_row',
      left: S.map((s) => [s.bl[0], s.bl[2], s.bl[1], 0]),
      right: S.map((s) => [s.br[0], s.br[2], s.br[1], 0]),
      top: S.map((s) => [(s.tl[0] + s.tr[0]) / 2, (s.tl[2] + s.tr[2]) / 2, s.tl[1], s.h]),
    });
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

// Soil or grass under a field, painted onto the terrain (paint.js).
// Pastures alternate two shades in 5 m bands, like mowing stripes.
function fieldBase(paint, f, fr, color, alt = color, stripe = null) {
  if (!paint) return;
  const W = 5;
  let vmin = Infinity;
  for (const [x, y] of f.polygon) vmin = Math.min(vmin, x * fr.n[0] + y * fr.n[1]);
  const shade = alt === color ? color : (x, y) => (Math.floor((x * fr.n[0] + y * fr.n[1] - vmin - 0.3) / W) % 2 ? alt : color);
  paint.polygon(f.polygon, shade, stripe);
}

function cropField(batch, f, H) {
  const look = CROPS[cropOf(f)] || CROPS.wheat;
  const fr = frameOf(f);
  // Hay windrows run along the rows: the stripe angle is the across direction.
  const stripe = look.stripe ? { angle: ((Math.atan2(fr.n[1], fr.n[0]) % Math.PI) + Math.PI) % Math.PI } : null;
  fieldBase(batch.paint, f, fr, look.base, look.base, stripe);
  if (look.stripe) return;
  rowsIn(batch, f.polygon, fr, look.gap, 1.2, look.row, H, f.id);
}

function rowsIn(batch, polygon, fr, gap, inset, r, H, id) {
  const sides = new Tris();
  const caps = new Tris();
  eachRow(polygon, fr, gap, inset, (a, b) => rowPrism(sides, caps, a, b, H, r, batch.audit, id));
  const opts = { cast: !!r.cast };
  const gs = sides.geometry();
  if (gs) batch.add(gs, I, r.side, opts);
  const gc = caps.geometry();
  if (gc) batch.add(gc, I, r.cap, opts);
}

// A level box (trough, feeder, plinth) on sloping ground: its top stays where
// it would be on the high side, and its body reaches below the low side.
// Returns { base: height of the level floor, low: bottom of the skirt }.
function levelOn(terrain, foot) {
  const { min, max } = terrain.groundRange(foot);
  return { base: max, low: min - 0.1 };
}

function pasture(batch, f, terrain) {
  const H = (x, y) => terrain.heightAt(x, y);
  const fr = frameOf(f);
  fieldBase(batch.paint, f, fr, PASTURE, PASTURE_ALT);
  // A water trough and a hay feeder, placed along the field's own axis.
  const [cx, cy] = centroid(f.polygon);
  let umax = 0;
  for (const [x, y] of f.polygon) umax = Math.max(umax, (x - cx) * fr.d[0] + (y - cy) * fr.d[1]);
  const at = (k) => [cx + fr.d[0] * umax * k, cy + fr.d[1] * umax * k];
  const ang = Math.atan2(fr.d[0], -fr.d[1]) / DEG + 90;
  const [tx, ty] = at(0.4);
  const t = levelOn(terrain, { rect: { x: tx, y: ty, w: 3, h: 0.9, angle: ang } });
  batch.add(box(3, 0.6 + t.base - t.low, 0.9), objMatrix(tx, ty, t.low, ang), 0x8a8f96);
  if (batch.audit) batch.audit.rect(f.id, 'trough', tx, ty, 3, 0.9, ang, t.low, t.base);
  batch.add(box(2.8, 0.05, 0.7), objMatrix(tx, ty, t.base + 0.56, ang), 0x467aa6, { cast: false });
  const [fx, fy] = at(-0.5);
  const fd = levelOn(terrain, { circle: { x: fx, y: fy, r: 1.1 } });
  batch.add(cyl(1.1, 1.0 + fd.base - fd.low, 8), objMatrix(fx, fy, fd.low, 0), 0x6a6f72);
  if (batch.audit) batch.audit.circle(f.id, 'feeder', fx, fy, 1.1, fd.low, fd.base);
  batch.add(cyl(0.95, 0.5, 8), objMatrix(fx, fy, fd.base + 0.9, 0), 0xcdb46a, { cast: false });
  if (!terrain.rough.off) cattlePaths(batch.paint, f, [tx, ty], [fx, fy], cx, cy);
}

// Old cattle paths: narrow trodden tracks that wander from the trough to the
// feeder and out to a corner or two of the field, painted on the grass.
const PATH = 0x7a7a4a;
function cattlePaths(paint, f, trough, feeder, cx, cy) {
  if (!paint || !f.animals || f.animals.kind === 'horses') return;
  const rng = makeRng(hashString(f.id) ^ 0x7a71);
  const inset = (p, k) => [p[0] + (cx - p[0]) * k, p[1] + (cy - p[1]) * k];
  const ends = [[trough, feeder]];
  const corners = f.polygon.slice().sort(() => rng() - 0.5);
  for (const c of corners.slice(0, 2)) ends.push([rng() < 0.5 ? trough : feeder, inset(c, 0.08)]);
  for (const [a, b] of ends) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.round(L / 3));
    const nx = -(b[1] - a[1]) / L;
    const ny = (b[0] - a[0]) / L;
    const ph = rng() * 6;
    const amp = 1.5 + rng() * 2.5;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = Math.sin(t * Math.PI) * amp * Math.sin(t * 7 + ph);
      pts.push([a[0] + (b[0] - a[0]) * t + nx * w, a[1] + (b[1] - a[1]) * t + ny * w]);
    }
    paint.stroke(pts, 0.7 + rng() * 0.4, PATH);
  }
}

// A rail between two posts as straight legs, bending where the ground
// between them rises above the straight line. Returns [[ax, ay, ah, bx, by, bh]].
function railLegs(H, px, py, h0, qx, qy, h1) {
  const knots = [[px, py, h0]];
  for (const t of [0.25, 0.5, 0.75]) {
    const kx = px + (qx - px) * t;
    const ky = py + (qy - py) * t;
    const g = H(kx, ky);
    if (g > h0 + (h1 - h0) * t + 0.03) knots.push([kx, ky, g]);
  }
  knots.push([qx, qy, h1]);
  const legs = [];
  for (let k = 1; k < knots.length; k++) legs.push([...knots[k - 1], ...knots[k]]);
  return legs;
}

// Fence posts exactly where the collider has them (layout.js fenceRuns).
// wire: thin posts and two strands; rail: square wooden posts every other
// point with three rails. Gaps where roads and mailboxes are. Each field's
// fence is one geometry per colour, built from raw triangles. Rails and wires
// bend over a bump between posts so they never dip into the ground.
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
        if (batch.audit) batch.audit.circle(f.field.id, 'fence_post', p.x, p.y, rail ? 0.09 : 0.07, h0 - 0.25);
        const q = pts[i + 1];
        if (!q) continue;
        const h1 = hs[i + 1];
        for (const [ax, ay, ah, bx, by, bh] of railLegs(H, p.x, p.y, h0, q.x, q.y, h1)) {
          if (batch.audit) {
            const low = rail ? 0.45 - 0.07 : 0.55 - 0.035;
            batch.audit.span({ id: f.field.id, kind: 'fence_rail', a: [ax, ay, ah + low], b: [bx, by, bh + low], clear: 0.2 });
          }
          for (const up of rail ? [0.45, 0.85, 1.22] : [0.55, 1.0]) {
            if (rail) rails.beam([ax, ah + up, ay], [bx, bh + up, by], 0.14, 0.05);
            else rails.beam([ax, ah + up, ay], [bx, bh + up, by], 0.07, 0.07);
          }
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

// Hartley Farm's crop field (a scenery pad, layout.js makePads): soil painted
// on the ground, green rows that follow it, and a post-and-rail fence.
const PAD_ROW = { bottom: 0.9, top: 0.45, h: 0.35, side: 0x6f8a3c, cap: 0x7f9a48 };
function padField(batch, p, H) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const poly = corners.map(([sx, sy]) => {
    const c = localToWorld(p.x, p.y, p.angle || 0, (sx * p.w) / 2, (sy * p.h) / 2);
    return [c.x, c.y];
  });
  if (batch.paint) batch.paint.polygon(poly, 0x9a8150);
  // Rows run along local y (north-south at angle 0), 2.6 m apart.
  const r = (p.angle || 0) * DEG;
  const fr = { d: [Math.sin(r), -Math.cos(r)], n: [Math.cos(r), Math.sin(r)] };
  rowsIn(batch, poly, fr, 2.6, 1, PAD_ROW, H, 'farm_field');
  // Fence posts every 4 m, rails following the ground.
  const fw = p.w + 2;
  const fh = p.h + 2;
  const ring = [];
  for (const [sx, sy, ex, ey] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
    const len = Math.abs(ex - sx) * fw / 2 + Math.abs(ey - sy) * fh / 2;
    const n = Math.round(len / 4);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      ring.push(localToWorld(p.x, p.y, p.angle || 0, ((sx + (ex - sx) * t) * fw) / 2, ((sy + (ey - sy) * t) * fh) / 2));
    }
  }
  const posts = new Tris();
  const rails = new Tris();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ha = H(a.x, a.y);
    const hb = H(b.x, b.y);
    posts.beam([a.x, ha - 0.25, a.y], [a.x, ha + 1.2, a.y], 0.16, 0.16);
    if (batch.audit) batch.audit.circle('farm_field', 'fence_post', a.x, a.y, 0.08, ha - 0.25);
    for (const [ax, ay, ah, bx, by, bh] of railLegs(H, a.x, a.y, ha, b.x, b.y, hb)) {
      for (const up of [0.5, 0.9]) rails.beam([ax, ah + up, ay], [bx, bh + up, by], 0.08, 0.08);
      if (batch.audit) batch.audit.span({ id: 'farm_field', kind: 'fence_rail', a: [ax, ay, ah + 0.46], b: [bx, by, bh + 0.46], clear: 0.2 });
    }
  }
  batch.add(posts.geometry(), I, 0x5a4630, { cast: false });
  batch.add(rails.geometry(), I, 0x5a4630, { cast: false });
}

export function buildFields(world, terrain, batch, scenery = null) {
  const H = (x, y) => terrain.heightAt(x, y);
  fences(world, batch, H);
  for (const f of world.fields || []) {
    if (f.kind === 'crop') cropField(batch, f, H);
    else pasture(batch, f, terrain);
  }
  for (const p of (scenery && scenery.pads) || []) if (p.kind === 'field') padField(batch, p, H);
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
    const A = batch.audit;
    const ang = p.angle || 0;
    if (p.kind === 'bale') {
      // Round bale lying on its side, about 1.2 m wide, resting on the slope:
      // tilted to the ground plane under it, sunk a little.
      const c = Math.cos(ang * DEG);
      const s = Math.sin(ang * DEG);
      const sx = (H(p.x + c, p.y + s) - H(p.x - c, p.y - s)) / 2; // rise per m along local x
      const sz = (H(p.x - s, p.y + c) - H(p.x + s, p.y - c)) / 2; // along local z (ly)
      const tilt = new THREE.Matrix4().makeRotationZ(Math.atan(sx)).multiply(new THREE.Matrix4().makeRotationX(-Math.atan(sz)));
      const m = tilt.multiply(new THREE.Matrix4().makeTranslation(0, r * 0.95, 0)).multiply(new THREE.Matrix4().makeScale(r, r, 1.2));
      batch.add(BALE, objMatrix(p.x, p.y, base, ang, 0, 0, 0, m), 0xd9c27a);
      if (A) {
        const plane = (x, y) => {
          const lx = (x - p.x) * c + (y - p.y) * s;
          const lz = -(x - p.x) * s + (y - p.y) * c;
          return base + sx * lx + sz * lz - 0.05 * r;
        };
        A.rect(p.id, 'bale', p.x, p.y, r * 0.8, 1.2, ang, plane, null);
      }
    } else if (p.kind === 'haystack') {
      // The stack's body reaches below the low side of its footprint.
      const g = levelOn(terrain, { circle: { x: p.x, y: p.y, r } });
      const low = g.low - 0.1;
      const bodyH = g.base + r * 0.8 - 0.1 - low;
      const sb = new THREE.Matrix4().makeScale(r, bodyH, r).premultiply(new THREE.Matrix4().makeTranslation(0, low - g.base + bodyH / 2, 0));
      batch.add(STACK_BASE, objMatrix(p.x, p.y, g.base, ang, 0, 0, 0, sb), 0xcdb46a);
      const st = new THREE.Matrix4().makeScale(r, r * 0.95, r).premultiply(new THREE.Matrix4().makeTranslation(0, r * 0.8 - 0.1 + r * 0.47, 0));
      batch.add(STACK_TOP, objMatrix(p.x, p.y, g.base, ang, 0, 0, 0, st), 0xbfa55a);
      if (A) A.circle(p.id, 'haystack', p.x, p.y, r, low, g.base);
    } else if (p.kind === 'rock') {
      // Rocks half buried: the low side of the footprint sets the depth.
      const { min } = terrain.groundRange({ circle: { x: p.x, y: p.y, r: r * 0.6 } });
      if (A) A.circle(p.id, 'rock', p.x, p.y, r * 0.6, min - 0.82 * r);
      const seed = hashString(String(p.id));
      const sc = new THREE.Matrix4().makeScale(r, r, r);
      batch.add(rockGeo(seed), objMatrix(p.x, p.y, min - r * 0.2, ang, 0, 0, 0, sc), ROCK_COLORS[seed % ROCK_COLORS.length]);
    }
  }
}

// Half-buried stones in rough scrub (src/world/roughness.js boulders): low
// lumps you can roll over with a knock, sunk well into the ground.
export function buildStones(terrain, batch) {
  for (const b of terrain.rough.boulders) {
    const { min } = terrain.groundRange({ circle: { x: b.x, y: b.y, r: b.r * 0.7 } });
    const seed = hashString(b.id);
    const sc = new THREE.Matrix4().makeScale(b.r * 1.15, b.r * 0.8, b.r);
    if (batch.audit) batch.audit.circle(b.id, 'stone', b.x, b.y, b.r * 0.6, min - 0.6 * b.r);
    batch.add(rockGeo(seed), objMatrix(b.x, b.y, min - b.r * 0.35, b.angle, 0, 0, 0, sc), ROCK_COLORS[seed % ROCK_COLORS.length], { cast: false, share: true });
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
      if (batch.audit) batch.audit.circle(line.id || 'power', 'power_pole', p.x, p.y, 0.15, base - 0.3);
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
    if (batch.audit) {
      const c = localToWorld(m.x, m.y, m.facing || 0, 0, 0.15);
      batch.audit.circle(m.id || `mailbox${i}`, 'mailbox', c.x, c.y, 0.06, base - 0.1);
    }
    P(box(0.12, 1.15, 0.12), 0, 0.15, -0.1, 0x6a4c2e);
    P(box(0.28, 0.06, 0.6), 0, 0, 1.05, 0x6a4c2e, { cast: false });
    const col = MAILBOX[i % MAILBOX.length];
    P(box(0.24, 0.2, 0.5), 0, 0, 1.1, col);
    const top = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    P(top, 0, 0, 1.3, col);
    P(box(0.22, 0.3, 0.03), 0, -0.26, 1.1, 0x2a2a2a, { cast: false });
    // Family name on a little board hung from the post, facing the road.
    if (m.name) {
      const plate = { w: 1.7, h: 0.5 };
      if (!batch.faces) batch.faces = new FaceAtlas();
      P(box(plate.w + 0.06, plate.h + 0.06, 0.04), 0, 0.06, 0.5, 0x4a3622, { cast: false });
      batch.faces.add('plate:' + m.name, plate.w, plate.h, PLATE_PX_PER_M, drawPlateFace(m.name),
        objMatrix(m.x, m.y, base, m.facing || 0, 0, 0.028, 0.5 + plate.h / 2 + 0.03));
    }
    // Little red flag, up on some boxes.
    const up = (i % 3) === 0;
    P(box(0.03, 0.35, 0.05), 0.14, 0.12, up ? 1.25 : 1.1, 0xc0392b, { cast: false });
    P(box(0.03, 0.12, 0.16), 0.14, up ? 0.12 : 0.2, up ? 1.5 : 1.3, 0xc0392b, { cast: false });
  });
}
