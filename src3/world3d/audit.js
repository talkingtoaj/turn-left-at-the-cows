// World audit: builders record what they place (when batch.audit is set),
// and checkAudit() compares it with the ground. Used by tools/check-world.mjs.
// Nothing here runs in the game unless an Audit is attached.
//
// Records:
//   thing:   something standing on the ground. foot is its footprint
//            ({ rect: { x, y, w, h, angle } } | { circle: { x, y, r } }).
//            bottom: lowest height of its base (number or fn(x, y) for tilted
//            things). floor: height that must stay above ground (null = may
//            sink, like a rock). wet: water level; a gap under the water
//            surface is hidden (reeds).
//   surface: a draped sheet (road, pad, decal): a non-indexed geometry in
//            world coordinates whose points should sit `lift` above ground.
//   row:     a crop row: samples along it with the bottom and top heights of
//            its centre line and both bottom edges.
//   span:    a rail or wire between two points that must stay `clear` above ground.
//   point:   one ground height that must fall inside [min, max] (bridge ends).

import { localToWorld } from '../../src/drive/geom.js';

export const TOL = 0.1;

export class Audit {
  constructor() {
    this.things = [];
    this.surfaces = [];
    this.rows = [];
    this.spans = [];
    this.points = [];
  }

  thing(r) { this.things.push(r); }
  rect(id, kind, x, y, w, h, angle, bottom, floor = null) {
    this.things.push({ id, kind, foot: { rect: { x, y, w, h, angle: angle || 0 } }, bottom, floor });
  }
  circle(id, kind, x, y, r, bottom, floor = null, wet = null) {
    this.things.push({ id, kind, foot: { circle: { x, y, r } }, bottom, floor, wet });
  }
  surface(id, kind, geometry, lift, extra = {}) {
    if (geometry) this.surfaces.push({ id, kind, pos: geometry.attributes.position.array.slice(), lift, ...extra });
  }
  row(r) { this.rows.push(r); }
  span(r) { this.spans.push(r); }
  point(r) { this.points.push(r); }
}

// Ground sample points under a footprint: corners, edges and a 0.5 m grid.
function footSamples(foot) {
  const out = [];
  if (foot.circle) {
    const { x, y, r } = foot.circle;
    out.push([x, y]);
    const rings = Math.max(1, Math.ceil(r / 0.5));
    for (let k = 1; k <= rings; k++) {
      const rr = (r * k) / rings;
      const n = Math.max(8, Math.ceil((2 * Math.PI * rr) / 0.5));
      for (let i = 0; i < n; i++) out.push([x + Math.cos((i / n) * 2 * Math.PI) * rr, y + Math.sin((i / n) * 2 * Math.PI) * rr]);
    }
    return out;
  }
  const { x, y, w, h, angle = 0 } = foot.rect;
  const nx = Math.max(1, Math.ceil(w / 0.5));
  const ny = Math.max(1, Math.ceil(h / 0.5));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const p = localToWorld(x, y, angle, -w / 2 + (w * i) / nx, -h / 2 + (h * j) / ny);
      out.push([p.x, p.y]);
    }
  }
  return out;
}

// Returns { problems: [...], counts: { checked kinds } }.
// problem: { id, kind, x, y, type: 'floating' | 'buried', by (m) }
export function checkAudit(audit, heightAt, tol = TOL) {
  const problems = [];
  const counts = { things: audit.things.length, surfaces: audit.surfaces.length, rows: audit.rows.length, spans: audit.spans.length, points: audit.points.length };
  const add = (rec, type, by, x, y) => problems.push({ id: rec.id, kind: rec.kind, type, by: +by.toFixed(2), x: Math.round(x), y: Math.round(y) });

  for (const t of audit.things) {
    let worstGap = -Infinity;
    let gx = 0;
    let gy = 0;
    let gmax = -Infinity;
    let mx = 0;
    let my = 0;
    for (const [x, y] of footSamples(t.foot)) {
      const g = t.wet != null ? Math.max(heightAt(x, y), t.wet) : heightAt(x, y);
      const b = typeof t.bottom === 'function' ? t.bottom(x, y) : t.bottom;
      if (b - g > worstGap) {
        worstGap = b - g;
        gx = x;
        gy = y;
      }
      if (g > gmax) {
        gmax = g;
        mx = x;
        my = y;
      }
    }
    if (worstGap > tol) add(t, 'floating', worstGap, gx, gy);
    if (t.floor != null && gmax - t.floor > tol) add(t, 'buried', gmax - t.floor, mx, my);
  }

  // Surfaces: every vertex, edge midpoint and centre of every triangle.
  for (const s of audit.surfaces) {
    const p = s.pos;
    let worst = 0;
    let wx = 0;
    let wy = 0;
    const test = (x, y, z) => {
      const d = y - (heightAt(x, z) + s.lift);
      if (Math.abs(d) > Math.abs(worst)) {
        worst = d;
        wx = x;
        wy = z;
      }
    };
    if (s.water) {
      // Water sheets: their edges must run into the bank, never hang over lower ground.
      for (let i = 0; i + 2 < p.length; i += 3) {
        const d = p[i + 1] - heightAt(p[i], p[i + 2]);
        if (d > worst) {
          worst = d;
          wx = p[i];
          wy = p[i + 2];
        }
      }
      if (worst > tol) add(s, 'floating', worst, wx, wy);
      continue;
    }
    for (let i = 0; i + 8 < p.length; i += 9) {
      const a = [p[i], p[i + 1], p[i + 2]];
      const b = [p[i + 3], p[i + 4], p[i + 5]];
      const c = [p[i + 6], p[i + 7], p[i + 8]];
      for (const [u, v, w] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]) {
        test(a[0] * u + b[0] * v + c[0] * w, a[1] * u + b[1] * v + c[1] * w, a[2] * u + b[2] * v + c[2] * w);
      }
    }
    if (worst > tol) add(s, 'floating', worst, wx, wy);
    else if (worst < -tol) add(s, 'buried', -worst, wx, wy);
  }

  // Crop rows: walk each line in 0.25 m steps between samples.
  for (const r of audit.rows) {
    let gap = -Infinity;
    let gx = 0;
    let gy = 0;
    let sunk = -Infinity;
    let sx = 0;
    let sy = 0;
    const walk = (line, isTop) => {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay, ah, aw] = line[i];
        const [bx, by, bh, bw] = line[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          const h = ah + (bh - ah) * t;
          const g = heightAt(x, y);
          if (isTop) {
            // Top should stand its full height (aw = wanted height) above ground.
            const want = aw + (bw - aw) * t;
            if (g + want - h > sunk) {
              sunk = g + want - h;
              sx = x;
              sy = y;
            }
          } else if (h - g > gap) {
            gap = h - g;
            gx = x;
            gy = y;
          }
        }
      }
    };
    walk(r.left, false);
    walk(r.right, false);
    walk(r.top, true);
    if (gap > tol) add(r, 'floating', gap, gx, gy);
    if (sunk > tol) add(r, 'buried', sunk, sx, sy);
  }

  for (const s of audit.spans) {
    const [ax, ay, ah] = s.a;
    const [bx, by, bh] = s.b;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    let worst = Infinity;
    let wx = 0;
    let wy = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const c = ah + (bh - ah) * t - heightAt(x, y);
      if (c < worst) {
        worst = c;
        wx = x;
        wy = y;
      }
    }
    if (worst < s.clear - tol) add(s, 'buried', s.clear - worst, wx, wy);
  }

  for (const q of audit.points) {
    const g = heightAt(q.x, q.y);
    if (g > q.max + tol) add(q, 'buried', g - q.max, q.x, q.y);
    if (g < q.min - tol) add(q, 'floating', q.min - g, q.x, q.y);
  }
  return { problems, counts };
}
