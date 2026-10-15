// Smooth curves through authored control points.
// Centripetal Catmull-Rom (alpha 0.5): passes through every control point,
// never loops or overshoots wildly at sharp corners.

const ALPHA = 0.5;

function knot(t, a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return t + Math.max(Math.pow(d, ALPHA), 1e-4);
}

// Point on the centripetal Catmull-Rom segment p1 -> p2 at u in [0, 1].
function crPoint(p0, p1, p2, p3, u) {
  const t0 = 0;
  const t1 = knot(t0, p0, p1);
  const t2 = knot(t1, p1, p2);
  const t3 = knot(t2, p2, p3);
  const t = t1 + (t2 - t1) * u;
  const lerp = (a, b, ta, tb) => {
    const k = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

// Dense polyline through `pts`, with pieces about `step` metres long.
// `curve: false` keeps straight segments (still densified).
export function smoothPolyline(pts, { step = 9, curve = true } = {}) {
  if (pts.length < 2) return pts.map((p) => [p[0], p[1]]);
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / step));
    // Mirror the end points so the curve starts and ends straight.
    const p0 = pts[i - 1] || [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const p3 = pts[i + 2] || [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      if (!curve) out.push([p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u]);
      else if (k === n) out.push([p2[0], p2[1]]);
      else out.push(crPoint(p0, p1, p2, p3, u));
    }
  }
  return out.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

// Total length of a polyline.
export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
