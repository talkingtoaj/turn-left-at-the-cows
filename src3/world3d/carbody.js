// Car bodies built in code: a late-1980s family car lofted from cross
// sections along its length, so panels have soft bevelled edges, wheel
// arches are cut into the sides, and there are enough vertices everywhere
// for the dents (car3d.js). Used by the player's car (fine) and the traffic
// (coarse, traffic3d.js).
//
// Car space: x right, y up (0 = ground), z back (front at -z).
//
//   loftBody(spec, { step }) -> {
//     paint: { pos, idx },   // indexed painted body
//     glass: { pos, idx },   // indexed windows
//     trim:  [{ tri: [x,y,z, x,y,z, x,y,z], sw }], // window frames, belt brightwork
//     at(z, j, t, side) -> [x, y, z]   // a point on the surface: segment j, t 0..1 along it
//   }
//
// Section points per side, bottom to top: 0 sill edge, 1-3 the side, 4-5
// the shoulder, 6 the window base (belt), 7 the window top, 8 the roof
// edge, 9 the roof, 10 the middle. Segments j run from point j to j + 1.

export const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Piecewise linear through [[z, v], ...] (sorted by z).
function pl(points) {
  return (z) => {
    if (z <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (z <= points[i][0]) {
        const [z0, v0] = points[i - 1];
        const [z1, v1] = points[i];
        return lerp(v0, v1, (z - z0) / (z1 - z0 || 1));
      }
    }
    return points[points.length - 1][1];
  };
}

// Body types. zA windscreen base, zR0 / zR1 roof front and back, zC rear
// glass base. windows: side glass [z0, z1] ranges; pillars between are
// blacked out (bPillar) or painted.
export function makeSpec(o) {
  const L = o.L;
  const h = L / 2;
  const s = {
    hw: 0.875, y0: 0.3, wheelY: 0.315, wheelR: 0.315, roofY: 1.4, ghw: 0.68, round: 0.32, roundIn: 0.1,
    ...o,
  };
  s.half = h;
  s.belt = pl(o.belt);
  s.top = pl([[-h, 0], [s.zA, 0], [s.zR0, 1], [s.zR1, 1], [s.zC, 0], [h, 0]].map(([z, k]) => [z, k]));
  s.arches = o.wheels.map(([z]) => ({ z, r: o.archR || 0.43 }));
  return s;
}

export const SPECS = {
  // Three-box sedan (the player's car, and traffic).
  sedan: makeSpec({
    L: 4.62, zA: -0.8, zR0: -0.08, zR1: 0.98, zC: 1.42,
    belt: [[-2.31, 0.84], [-0.8, 0.95], [1.42, 0.98], [2.31, 0.97]],
    windows: [[-0.76, 0.37], [0.5, 1.05]], bPillar: [0.37, 0.5],
    wheels: [[-1.38], [1.3]],
  }),
  // Estate: the roof runs to an upright tailgate.
  wagon: makeSpec({
    L: 4.72, zA: -0.82, zR0: -0.1, zR1: 2.08, zC: 2.3,
    belt: [[-2.36, 0.84], [-0.82, 0.95], [2.36, 0.98]],
    windows: [[-0.78, 0.36], [0.49, 1.08], [1.2, 2.0]], bPillar: [0.36, 0.49],
    wheels: [[-1.4], [1.32]], roofY: 1.43,
  }),
  // Small hatchback.
  hatch: makeSpec({
    L: 3.82, zA: -0.55, zR0: 0.08, zR1: 0.98, zC: 1.78, hw: 0.8, ghw: 0.62, roofY: 1.36,
    belt: [[-1.91, 0.8], [-0.55, 0.92], [1.91, 0.96]],
    windows: [[-0.51, 0.52], [0.62, 1.05]], bPillar: [0.52, 0.62],
    wheels: [[-1.2], [1.18]], archR: 0.41,
  }),
  // Pickup: a cab, then a load bed (the bed floor is drawn on top by traffic3d).
  pickup: makeSpec({
    L: 4.9, zA: -0.62, zR0: -0.05, zR1: 0.52, zC: 0.66, roofY: 1.55, ghw: 0.7, hw: 0.9, y0: 0.38, wheelY: 0.36, wheelR: 0.36,
    belt: [[-2.45, 0.98], [-0.62, 1.04], [2.45, 1.02]],
    windows: [[-0.58, 0.48]], bPillar: [0.48, 0.48],
    wheels: [[-1.52], [1.45]], archR: 0.47,
  }),
};

// Section at z: 11 points (right side, x >= 0) and the window factor g.
export function sectionAt(S, z) {
  const endT = Math.max(0, Math.abs(z) - (S.half - S.round)) / S.round;
  const e2 = endT * endT;
  const hw = S.hw - S.roundIn * e2;
  const belt = S.belt(z) - 0.03 * e2 * (z < 0 ? 1 : 0.5);
  const g = clamp(S.top(z), 0, 1);
  const top = lerp(belt, S.roofY, g);
  const y0 = S.y0 + 0.07 * e2;
  const gT = S.ghw;
  const pts = [
    [hw - 0.05, y0],
    [hw, y0 + 0.06],
    [hw + 0.006, y0 + 0.26],
    [hw, belt - 0.13],
    [hw - 0.018, belt - 0.035],
    [hw - 0.055, belt],
    [hw - 0.09, belt + 0.012],
    [lerp(hw - 0.11, gT, g), Math.max(belt + 0.014, top - 0.05)],
    [lerp(hw - 0.13, gT - 0.05, g), top + 0.012 * (1 - g)],
    [lerp(hw * 0.5, gT * 0.55, g), top + 0.02],
    [0, top + 0.026],
  ];
  for (const a of S.arches) {
    const dz = z - a.z;
    if (Math.abs(dz) >= a.r) continue;
    const ay = S.wheelY + Math.sqrt(a.r * a.r - dz * dz);
    pts[0][1] = Math.max(pts[0][1], ay);
    pts[0][0] = hw + 0.014;
    pts[1][1] = Math.max(pts[1][1], ay + 0.025);
    pts[1][0] = hw + 0.012;
    pts[2][1] = Math.max(pts[2][1], ay + 0.055);
    pts[3][1] = Math.max(pts[3][1], pts[2][1] + 0.03);
  }
  return { pts, g, belt, top, hw };
}

// Which material a quad of segment j between stations gets.
// 'paint' | 'glass' | trim swatch name.
function classify(S, j, zm) {
  const inGreen = zm > S.zA && zm < S.zC;
  if (j <= 4) return 'paint';
  if (j === 5) return inGreen ? 'chrome' : 'paint';
  const inWin = S.windows.some(([a, b]) => zm > a + 0.035 && zm < b - 0.035);
  const nearWin = S.windows.some(([a, b]) => zm > a && zm < b);
  if (j === 6) {
    if (!inGreen) return 'paint';
    if (inWin) return 'glass';
    if (nearWin || (zm > S.bPillar[0] && zm < S.bPillar[1])) return 'black';
    return 'paint';
  }
  if (j === 7) return inGreen && nearWin ? 'black' : 'paint';
  // Top: windscreen and rear glass, with a rubber surround.
  if (zm > S.zA && zm < S.zR0) return zm > S.zA + 0.045 && zm < S.zR0 - 0.04 && j >= 8 ? 'glass' : (j >= 8 ? 'black' : 'paint');
  if (zm > S.zR1 && zm < S.zC) return zm > S.zR1 + 0.04 && zm < S.zC - 0.045 && j >= 8 ? 'glass' : (j >= 8 ? 'black' : 'paint');
  return 'paint';
}

export function loftBody(S, { step = 0.08 } = {}) {
  const h = S.half;
  // Stations: even steps plus every edge a material changes at.
  const keys = [S.zA, S.zR0, S.zR1, S.zC];
  for (const [a, b] of S.windows) keys.push(a, a + 0.035, b - 0.035, b);
  keys.push(S.zA + 0.045, S.zR0 - 0.04, S.zR1 + 0.04, S.zC - 0.045, ...S.bPillar);
  for (const a of S.arches) keys.push(a.z - a.r, a.z + a.r);
  const zs = [];
  for (let z = -h; z < h - 1e-6; z += step) zs.push(z);
  zs.push(h);
  for (const k of keys) if (k > -h && k < h) zs.push(k);
  zs.sort((a, b) => a - b);
  const st = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 0.008);
  // Grid: station i, ring k (0..20): right p0..p10, then left p9..p0.
  const NP = 11;
  const NR = NP * 2 - 1;
  const ring = (pts, z) => {
    const out = [];
    for (let k = 0; k < NP; k++) out.push([pts[k][0], pts[k][1], z]);
    for (let k = NP - 2; k >= 0; k--) out.push([-pts[k][0], pts[k][1], z]);
    return out;
  };
  const segOf = (k) => (k < NP - 1 ? k : NR - 2 - k); // ring edge k -> k+1
  const grid = st.map((z) => ring(sectionAt(S, z).pts, z));

  const sets = { paint: { pos: [], idx: [], map: new Map() }, glass: { pos: [], idx: [], map: new Map() } };
  const trim = [];
  const vid = (set, i, k) => {
    const key = i * 64 + k;
    let v = set.map.get(key);
    if (v === undefined) {
      v = set.pos.length / 3;
      set.pos.push(...grid[i][k]);
      set.map.set(key, v);
    }
    return v;
  };
  // Outward test: from the body's middle line.
  const outward = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const mx = (a[0] + b[0] + c[0]) / 3;
    const my = (a[1] + b[1] + c[1]) / 3 - 0.75;
    return nx * mx + ny * my >= 0;
  };
  for (let i = 0; i < st.length - 1; i++) {
    const zm = (st[i] + st[i + 1]) / 2;
    for (let k = 0; k < NR - 1; k++) {
      const m = classify(S, segOf(k), zm);
      const A = [i, k];
      const B = [i + 1, k];
      const C = [i + 1, k + 1];
      const D = [i, k + 1];
      const P = (q) => grid[q[0]][q[1]];
      let tris = [[A, B, C], [A, C, D]];
      if (!outward(P(A), P(B), P(C))) tris = [[A, C, B], [A, D, C]];
      for (const t of tris) {
        if (m === 'paint' || m === 'glass') {
          const set = sets[m];
          for (const q of t) set.idx.push(vid(set, q[0], q[1]));
        } else trim.push({ tri: t.flatMap((q) => P(q)), sw: m });
      }
    }
  }
  // End caps: rings shrinking to the middle, on their own vertices (crisp edge).
  const cap = (i, sign) => {
    const set = sets.paint;
    const base = grid[i];
    let cy = 0;
    for (const p of base) cy += p[1];
    cy /= base.length;
    const z = base[0][2] + sign * 0.004;
    const rings = [1, 0.8, 0.58, 0.36, 0.14].map((s) => base.map((p) => [p[0] * s, cy + (p[1] - cy) * s, z + sign * (1 - s) * 0.008]));
    const ids = rings.map((r) => r.map((p) => {
      set.pos.push(...p);
      return set.pos.length / 3 - 1;
    }));
    set.pos.push(0, cy, z + sign * 0.008);
    const mid = set.pos.length / 3 - 1;
    const pushTri = (a, b, c) => {
      const pa = set.pos.slice(a * 3, a * 3 + 3);
      const pb = set.pos.slice(b * 3, b * 3 + 3);
      const pc = set.pos.slice(c * 3, c * 3 + 3);
      const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
      const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
      const nz = ux * vy - uy * vx;
      if (nz * sign >= 0) set.idx.push(a, b, c);
      else set.idx.push(a, c, b);
    };
    // The ring is closed along the bottom (last point back to the first).
    for (let r = 0; r < rings.length - 1; r++) {
      for (let k = 0; k < NR; k++) {
        const k1 = (k + 1) % NR;
        pushTri(ids[r][k], ids[r + 1][k], ids[r + 1][k1]);
        pushTri(ids[r][k], ids[r + 1][k1], ids[r][k1]);
      }
    }
    const last = ids[ids.length - 1];
    for (let k = 0; k < NR; k++) pushTri(last[k], last[(k + 1) % NR], mid);
  };
  cap(0, -1);
  cap(st.length - 1, 1);

  // A point on the surface (right side, or left with side -1).
  const at = (z, j, t = 0, side = 1) => {
    const { pts } = sectionAt(S, z);
    const a = pts[j];
    const b = pts[Math.min(10, j + 1)];
    return [side * lerp(a[0], b[0], t), lerp(a[1], b[1], t), z];
  };
  return { paint: sets.paint, glass: sets.glass, trim, at, stations: st.length };
}

// Old dings: small dents the car came with (it's a well-used delivery car).
// Baked into the rest shape of the paint and the trim (so strips and lamps
// near a ding sink with it), so the damage dents (car3d.js) push in on top
// of them. Each one is an ellipsoid (rx, ry, rz) round c, pushed in along n
// by up to depth. scratches: bare-metal lines through it, [start, end] as
// offsets from c in the surface: (dz, dy) on a side ding, (dx, dz) on a top
// one (car3d.js draws them). They keep near the loft's vertex rows, where
// the coarse paint follows the ding closely.
export const SEDAN_DINGS = [
  // Front right fender, ahead of the arch (seen in the near-side views).
  {
    c: [0.875, 0.75, -1.62], n: [-1, 0, 0], rx: 0.2, ry: 0.15, rz: 0.24, depth: 0.045,
    scratches: [[[-0.13, 0.0], [0.1, 0.012]], [[-0.09, -0.025], [0.12, -0.04]], [[-0.04, 0.01], [0.06, 0.004]]],
  },
  // Trunk lid, right of the middle (seen from the chase camera).
  {
    c: [0.438, 0.99, 1.93], n: [0, -1, 0], rx: 0.2, ry: 0.2, rz: 0.22, depth: 0.04,
    scratches: [[[0.0, -0.13], [0.025, 0.11]], [[0.04, -0.07], [0.05, 0.08]]],
  },
];

// pos: flat xyz array (changed in place). col: flat rgb array or null (the
// paint round a ding is a little darker). Returns how many vertices moved.
export function wearDings(pos, col, dings = SEDAN_DINGS) {
  let moved = 0;
  for (let i = 0; i < pos.length; i += 3) {
    let any = false;
    for (const d of dings) {
      const dx = (pos[i] - d.c[0]) / d.rx;
      const dy = (pos[i + 1] - d.c[1]) / d.ry;
      const dz = (pos[i + 2] - d.c[2]) / d.rz;
      const q = dx * dx + dy * dy + dz * dz;
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q);
      const m = d.depth * f;
      pos[i] += d.n[0] * m;
      pos[i + 1] += d.n[1] * m;
      pos[i + 2] += d.n[2] * m;
      if (col) {
        const k = 1 - 0.3 * f;
        col[i] *= k;
        col[i + 1] *= k;
        col[i + 2] *= k;
      }
      any = true;
    }
    if (any) moved++;
  }
  return moved;
}
