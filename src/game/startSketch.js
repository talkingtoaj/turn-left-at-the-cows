// The marks already on the player's own sketch when mission 1 starts (#87):
// Ashford (three house stamps), the gas station (a little pump), Main
// Street where the car starts, and a short piece of Highway 9, the only
// label. Drawn with the player's own tools: pencil strokes with a slight
// wobble, smoothed the way the map screen smooths a stroke, and the house
// stamp, so they look like the player's lines and the eraser takes them off
// one by one. Pure (no DOM), in the sketch format (src3/map/sketchPaper.js).
//
//   ashfordStartSketch(world) -> { strokes, stamps, labels }, each item pre: true
//   playerMarks(sketch) -> how many strokes, stamps and labels the player drew
//     (the pre-drawn ones don't count: "Press M to sketch" still shows)

import { makeRng, smoothPoints, STROKE_WIDTH_THICK } from '../map/draw.js';

// Where the junction of Main Street and Highway 9 goes on the 960x640 map
// paper (PAPER is x 100..940, y 52..628): low on the left, so the rest of the
// county (north and east) has room. Metres to paper pixels.
const AT = { x: 250, y: 506 };
const SCALE = 0.3;
const HIGHWAY_M = 720; // metres of Highway 9 drawn, east from Ashford

// A pencil line through paper points: resampled every few pixels, nudged a
// little to the side by a slow random walk (a hand is never quite straight),
// then smoothed like a stroke drawn on the map screen.
function pencil(pts, rnd) {
  const out = [];
  let drift = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / 5));
    const nx = -(y2 - y1) / (len || 1);
    const ny = (x2 - x1) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      drift = Math.max(-1.1, Math.min(1.1, drift + (rnd() - 0.5) * 0.7));
      out.push([x1 + (x2 - x1) * t + nx * drift, y1 + (y2 - y1) * t + ny * drift]);
    }
  }
  out.push(pts[pts.length - 1]);
  return smoothPoints(out, 2);
}

// The first `metres` of a road's polyline from its start.
function firstPart(points, metres) {
  const out = [points[0]];
  let left = metres;
  for (let i = 1; i < points.length && left > 0; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d >= left) {
      const t = left / d;
      out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      break;
    }
    out.push(points[i]);
    left -= d;
  }
  return out;
}

export function ashfordStartSketch(world) {
  const rnd = makeRng(1992);
  const road = (id) => world.roads.find((r) => r.id === id);
  const hwy = road('hwy9');
  const main = road('ashford_st');
  const [ox, oy] = hwy.points[0]; // the junction in Ashford
  const P = ([x, y]) => [AT.x + (x - ox) * SCALE, AT.y + (y - oy) * SCALE];
  // Fewer points than the built curve: a hand follows the shape, not every metre.
  const thin = (pts, every) => pts.filter((_, i) => i % every === 0 || i === pts.length - 1);

  const strokes = [];
  // Highway 9: thick, like a main road.
  const hw = thin(firstPart(hwy.points, HIGHWAY_M), 6).map(P);
  strokes.push({ points: pencil(hw, rnd), width: STROKE_WIDTH_THICK });
  // Main Street, where the car starts: thin, south from the junction.
  strokes.push({ points: pencil(thin(main.points, 4).map(P), rnd) });

  // The gas station: a pump just south of the highway, east of the junction.
  const gas = world.buildings.find((b) => b.kind === 'gas');
  const [gx, gy] = gas ? P([gas.x + 10, gas.y + 30]) : [AT.x + 37, AT.y + 28];
  const k = 1.6; // about the size of a stamp
  const pump = [
    [[-4, 8], [-4, -7], [4, -7], [4, 8]], // body
    [[-6, 8], [6, 8]], // the ground
    [[-2, -4], [2, -4], [2, -1], [-2, -1], [-2, -4]], // dial
    [[4, -3], [7, -2], [7.5, 3], [6, 5]], // hose
  ];
  for (const pts of pump) {
    strokes.push({ points: smoothPoints(pts.map(([x, y]) => [gx + x * k + (rnd() - 0.5) * 0.8, gy + y * k + (rnd() - 0.5) * 0.8]), 1) });
  }

  // Ashford: a few houses either side of Main Street (house stamps).
  const stamps = [
    { kind: 'house', x: AT.x - 26, y: AT.y + 16 },
    { kind: 'house', x: AT.x - 24, y: AT.y + 48 },
    { kind: 'house', x: AT.x + 24, y: AT.y + 56 },
  ].map((s) => ({ ...s, x: Math.round(s.x), y: Math.round(s.y) }));

  // "Highway 9" above the line, about halfway along.
  const mid = hw[Math.floor(hw.length * 0.45)];
  const labels = [{ text: 'Highway 9', x: Math.round(mid[0] - 30), y: Math.round(mid[1] - 22) }];

  const pre = (list) => list.map((it) => ({ ...it, pre: true }));
  return { strokes: pre(strokes), stamps: pre(stamps), labels: pre(labels) };
}

export function playerMarks(sketch) {
  if (!sketch) return 0;
  const n = (list) => (list || []).filter((it) => !it.pre).length;
  return n(sketch.strokes) + n(sketch.stamps) + n(sketch.labels);
}
