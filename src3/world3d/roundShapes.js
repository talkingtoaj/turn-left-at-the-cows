// Rounded shapes for the code-built trucks (farmtruck3d.js, sixbysix3d.js):
// outlines with rounded corners, extruded into slabs whose edges are
// bevelled and smooth-shaded, so a cab or a fender reads as pressed steel
// and not as a box.
//
//   const s = outline([[z, y, r], ..., { arc: [cz, cy, R, a0, a1] }, ...])
//   slab(s, depth, bevel, 'zy', x)   // side profile, extruded across x, centred on x
//   slab(s, depth, bevel, 'xy', z)   // front profile, extruded along z, centred on z
//   poly([[x, y, z], ...], [nx, ny, nz])   // a flat convex panel facing n
//
// Bodies are drawn through a builder B, which the coarse body (traffic3d.js)
// and the fine body (trafficfine.js) each supply:
//   B.fine                                   more small pieces when true
//   B.box(x, y, z, w, h, d, mat, rx, ry, rz) a box (centre, size, turn)
//   B.bar(a, b, w, th, mat, up)              a w x th bar from point a to b
//   B.smooth(g, mat)                         a geometry with its own (smooth) normals
//   B.geo(g, mat)                            any geometry, flat shaded on the fine body
//   B.pic(c, r, u, w, h, name, flip)         an atlas picture (grille, head, tail, plate, indicator)
//   B.disc(c, n, rad, name)                  a round atlas picture facing n (a headlamp)
//   B.wheel(r, w, x, y, z, side)             a tyre and hub, axis x; side: which way is out
// mat: paint, glass, chrome, black, rubber, wood, woodDark, steel, satin,
// alu, amber, gap, exhaust, mirror, liner (traffic3d.js MAT, plus aliases).

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A closed outline. Items: [a, b, r] a corner rounded with radius r (kept
// under half of each side), or { arc: [ca, cb, R, a0, a1, cw] } a circle arc.
export function outline(items) {
  const ends = items.map((it) => {
    if (!it.arc) return [[it[0], it[1]], [it[0], it[1]]];
    const [ca, cb, R, a0, a1] = it.arc;
    return [[ca + R * Math.cos(a0), cb + R * Math.sin(a0)], [ca + R * Math.cos(a1), cb + R * Math.sin(a1)]];
  });
  const s = new THREE.Shape();
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const it = items[i];
    const go = (p) => (i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1]));
    if (it.arc) {
      const [ca, cb, R, a0, a1, cw = false] = it.arc;
      go(ends[i][0]);
      s.absarc(ca, cb, R, a0, a1, cw);
      continue;
    }
    const [x, y, r = 0] = it;
    const [px, py] = ends[(i - 1 + n) % n][1];
    const [nx, ny] = ends[(i + 1) % n][0];
    const d1 = Math.hypot(px - x, py - y) || 1;
    const d2 = Math.hypot(nx - x, ny - y) || 1;
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (rr <= 0) {
      go([x, y]);
      continue;
    }
    go([x + ((px - x) / d1) * rr, y + ((py - y) / d1) * rr]);
    s.quadraticCurveTo(x, y, x + ((nx - x) / d2) * rr, y + ((ny - y) / d2) * rr);
  }
  s.closePath();
  return s;
}

// An upright slab: a rounded rectangle in plan (w across x, d across z), h
// tall, bottom at y = 0. Corners rounded with r, top and bottom edges
// bevelled by bv. (gas3d.js has its own copy, vslab, from before this one.)
export function uprightSlab(w, d, h, r, bv = 0.02, seg = 3) {
  const s = outline([[-w / 2, -d / 2, r], [w / 2, -d / 2, r], [w / 2, d / 2, r], [-w / 2, d / 2, r]]);
  return slab(s, h, bv, 'xy', 0, seg).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
}

// Merge shared corners and recompute normals: rounded edges shade smoothly.
export function smoothed(g) {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

// Extrude an outline `depth` thick with bevelled edges (outer size kept).
// plane 'zy': outline in (z, y), extruded across x, centred on x = at.
// plane 'xy': outline in (x, y), extruded along z, centred on z = at.
// seg: points per rounded corner (fewer on the coarse body).
export function slab(shape, depth, bevel, plane, at = 0, seg = 4) {
  const bv = Math.max(0, Math.min(bevel, depth / 2 - 0.002));
  const core = Math.max(0.002, depth - 2 * bv);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: core, bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv,
    bevelSegments: seg > 2 ? 2 : 1, curveSegments: seg,
  });
  g.translate(0, 0, -core / 2);
  if (plane === 'zy') g.rotateY(-Math.PI / 2).translate(at, 0, 0);
  else g.translate(0, 0, at);
  return smoothed(g);
}

// Move vertices: f(p) changes the Vector3 p in place (a hood that drops to the front).
export function warp(g, f) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    f(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A flat convex panel (fan of triangles) facing n.
export function poly(pts, n) {
  const [a, b, c] = pts;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const P = fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] < 0 ? [...pts].reverse() : pts;
  const pos = [];
  for (let i = 1; i < P.length - 1; i++) pos.push(...P[0], ...P[i], ...P[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// A side panel on both sides: pts in (z, y) at x = +-x, each facing out.
export function sidePanels(B, pts, x, mat) {
  for (const s of [-1, 1]) B.geo(poly(pts.map(([z, y]) => [s * x, y, z]), [s, 0, 0]), mat);
}
