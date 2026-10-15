// Drawing helpers shared by the map screen: seeded randomness, hand-drawn
// (wobbly) lines, sketch stamp icons, dashed lines and stroke smoothing.

// Small seeded random generator (mulberry32). Same seed, same numbers, so a
// hand-drawn stamp looks the same every time the map is redrawn.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a seed from numbers and strings.
export function seedFrom(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(typeof p === 'number' ? Math.round(p * 10) : p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

// Draws a polyline with a slight hand tremble. pts is [[x, y], ...].
export function wobbly(g, pts, rnd, amp = 0.8, closed = false) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const [x1, y1] = src[i];
    const [x2, y2] = src[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const n = Math.max(1, Math.round(len / 6));
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const j = k === 0 ? 0 : (rnd() - 0.5) * 2 * amp;
      out.push({ x: x1 + (x2 - x1) * t + nx * j, y: y1 + (y2 - y1) * t + ny * j });
    }
  }
  const [lx, ly] = src[src.length - 1];
  out.push({ x: lx + (rnd() - 0.5) * amp, y: ly + (rnd() - 0.5) * amp });
  g.strokePoints(out, false);
}

// A hand-drawn circle that does not quite close, like a real pen loop.
export function wobblyCircle(g, cx, cy, r, rnd) {
  const pts = [];
  const start = rnd() * Math.PI * 2;
  const steps = 16;
  for (let i = 0; i <= steps + 1; i++) {
    const a = start + (i / steps) * Math.PI * 2;
    const rr = r * (0.9 + rnd() * 0.2);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.strokePoints(pts, false);
}

// Stamp kinds offered in the sketch toolbar, in toolbar order.
export const STAMP_KINDS = ['church', 'water_tower', 'bridge', 'house', 'tree', 'radio_mast', 'mill', 'question', 'x'];

export const STAMP_NAMES = {
  church: 'Church',
  water_tower: 'Water tower',
  bridge: 'Bridge',
  house: 'House',
  tree: 'Tree',
  radio_mast: 'Radio mast',
  mill: 'Mill',
  question: 'Not sure (?)',
  x: 'X marks the spot',
};

// Draws a hand-drawn looking stamp icon centred on (x, y).
// s scales the icon (1 = about 24 px tall).
export function drawStamp(g, kind, x, y, color, s = 1, seed = 1) {
  const rnd = makeRng(seed);
  const P = (px, py) => [x + px * s, y + py * s];
  const line = (pts, closed = false) => wobbly(g, pts.map(([a, b]) => P(a, b)), rnd, 0.7 * s, closed);
  g.lineStyle(Math.max(1.4, 2 * s), color, 0.95);

  switch (kind) {
    case 'house':
      line([[-7, -1], [-7, 9], [7, 9], [7, -1]]);
      line([[-9, 0], [0, -9], [9, 0]]);
      line([[-1.5, 9], [-1.5, 4], [1.5, 4], [1.5, 9]]);
      break;
    case 'church':
      line([[-6, 0], [-6, 10], [6, 10], [6, 0]]);
      line([[-8, 1], [0, -7], [8, 1]]);
      line([[0, -7], [0, -14]]);
      line([[-3, -11], [3, -11]]);
      break;
    case 'water_tower':
      line([[-7, -11], [7, -11], [7, -3], [-7, -3]], true);
      line([[-5, -3], [-7, 10]]);
      line([[5, -3], [7, 10]]);
      line([[-6, 4], [6, 4]]);
      break;
    case 'bridge':
      line([[-10, -3], [10, -3]]);
      line([[-10, 3], [10, 3]]);
      line([[-10, -3], [-13, -7]]);
      line([[-10, 3], [-13, 7]]);
      line([[10, -3], [13, -7]]);
      line([[10, 3], [13, 7]]);
      break;
    case 'tree': {
      const [cx, cy] = P(0, -3);
      wobblyCircle(g, cx, cy, 7 * s, rnd);
      line([[0, 4], [0, 11]]);
      break;
    }
    case 'radio_mast': {
      line([[-5, 11], [0, -9], [5, 11]]);
      line([[-3, 4], [3, 4]]);
      line([[-2, -2], [2, -2]]);
      const [mx, my] = P(0, -9);
      for (const r of [5, 9]) {
        g.beginPath();
        g.arc(mx, my, r * s, -0.6, 0.6, false);
        g.strokePath();
        g.beginPath();
        g.arc(mx, my, r * s, Math.PI - 0.6, Math.PI + 0.6, false);
        g.strokePath();
      }
      break;
    }
    case 'mill':
      line([[-6, 1], [-6, 11], [6, 11], [6, 1]]);
      line([[-7, 2], [0, -3], [7, 2]]);
      line([[-9, -13], [9, 5]]);
      line([[9, -13], [-9, 5]]);
      break;
    case 'question': {
      line([[-5, -6], [-3, -10], [1, -11], [5, -9], [5, -5], [0, -1], [0, 4]]);
      g.fillStyle(color, 0.95);
      const [dx, dy] = P(0, 9);
      g.fillCircle(dx, dy, 1.8 * s);
      break;
    }
    case 'x':
      g.lineStyle(Math.max(2, 3 * s), color, 0.95);
      line([[-8, -8], [8, 8]]);
      line([[8, -8], [-8, 8]]);
      break;
    default:
      break;
  }
}

// Draws a dashed polyline. pts is [[x, y], ...].
export function dashedPolyline(g, pts, dash, gap) {
  let on = true;
  let left = dash;
  for (let i = 0; i < pts.length - 1; i++) {
    let [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    let segLen = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / (segLen || 1);
    const uy = (y2 - y1) / (segLen || 1);
    while (segLen > 0) {
      const step = Math.min(left, segLen);
      const nx = x1 + ux * step;
      const ny = y1 + uy * step;
      if (on) g.lineBetween(x1, y1, nx, ny);
      x1 = nx;
      y1 = ny;
      segLen -= step;
      left -= step;
      if (left <= 0) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
}

// Chaikin corner cutting: softens a freehand stroke a little.
// Keeps the first and last points so the line still ends where drawn.
export function smoothPoints(pts, iterations = 2) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const [x1, y1] = cur[i];
      const [x2, y2] = cur[i + 1];
      next.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25]);
      next.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

// Distance from point (px, py) to segment (x1, y1)-(x2, y2).
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
