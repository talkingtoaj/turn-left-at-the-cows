// Builds a printed map from WORLD, with its lies applied. The map definition
// (WORLD.printedMaps[id]) says which part of the world it covers, what it
// shows and how it lies. style 'print' is the 1987 county map look, style
// 'hand' is someone's pencil sketch. It never shows the player, the goal
// marker, or any position.

import { WORLD } from '../world/world.js';
import { METRES_PER_MILE } from '../units.js';
import { resolvePrintedMap } from '../game/printedMaps.js';
import { dashedPolyline, makeRng, wobbly, wobblyCircle, drawStamp } from './draw.js';

const SERIF = 'Georgia, "Times New Roman", serif';

const INK = 0x2e241b;
const ROAD_RED = 0xc4553b;
const DIRT = 0x6b4e32;
const WATER = 0x3d77b8;
const WATER_FILL = 0xa9c8e0;
const FOREST = 0x8fae7a;
const TOWN_TINT = 0xd9a58f;

// What the 1987 map calls each landmark (the mill was still standing then).
const LANDMARK_LABELS = {
  church: "St. Anne's Ch.",
  water_tower: 'Water Tower',
  mill_ruin: 'Old Mill',
  radio_mast: 'Radio Mast',
};

// Douglas-Peucker simplify, so names sit on the straightest stretch of a
// dense curve.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let best = -1;
  let bestD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  }
  if (bestD <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify(pts.slice(0, best + 1), tol).slice(0, -1).concat(simplify(pts.slice(best), tol));
}

// Adds a text object to the container.
function label(scene, c, x, y, text, style, origin = [0.5, 0.5], rotation = 0) {
  const t = scene.add
    .text(x, y, text, { fontFamily: SERIF, color: '#2e241b', fontSize: '11px', ...style })
    .setOrigin(origin[0], origin[1])
    .setRotation(rotation);
  c.add(t);
  return t;
}

// Every spot a name could sit on a polyline: along each straight stretch of
// the simplified curve, longest stretch first, the middle before the ends.
function nameSpots(dense) {
  const pts = simplify(dense, 2.5);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    let ang = Math.atan2(y2 - y1, x2 - x1);
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      out.push({ len, t, x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, ang });
    }
  }
  return out.sort((a, b) => b.len - a.len || Math.abs(a.t - 0.5) - Math.abs(b.t - 0.5));
}

// Rough text size for keeping labels apart (serif, so about half the font
// size per letter; bold a little wider).
const textW = (text, px, bold = false) => text.length * px * (bold ? 0.62 : 0.52);

// Finds a good spot on a polyline for its name: middle of the longest
// stretch once the curve is simplified.
function nameSpot(dense) {
  const pts = simplify(dense, 2.5);
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!best || len > best.len) {
      let ang = Math.atan2(y2 - y1, x2 - x1);
      // Keep text upright.
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      best = { len, x: (x1 + x2) / 2, y: (y1 + y2) / 2, ang };
    }
  }
  return best;
}

// Printed map symbols (crisp, not hand-drawn).
export function drawMapSymbol(g, kind, x, y) {
  g.lineStyle(1.4, INK, 1);
  g.fillStyle(INK, 1);
  switch (kind) {
    case 'church':
      g.fillRect(x - 3, y - 2, 6, 6);
      g.lineBetween(x, y - 2, x, y - 9);
      g.lineBetween(x - 2.5, y - 6.5, x + 2.5, y - 6.5);
      break;
    case 'water_tower':
      g.strokeCircle(x, y - 3, 3.5);
      g.lineBetween(x - 2.5, y, x - 4, y + 6);
      g.lineBetween(x + 2.5, y, x + 4, y + 6);
      break;
    case 'mill_ruin':
    case 'mill':
      // Little cog wheel for a water mill.
      g.strokeCircle(x, y, 4);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.lineBetween(x + Math.cos(a) * 4, y + Math.sin(a) * 4, x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5);
      }
      g.fillCircle(x, y, 1.2);
      break;
    case 'radio_mast':
      g.lineBetween(x - 3.5, y + 6, x, y - 6);
      g.lineBetween(x + 3.5, y + 6, x, y - 6);
      g.lineBetween(x - 2, y + 1, x + 2, y + 1);
      g.beginPath();
      g.arc(x, y - 6, 4, -0.7, 0.7, false);
      g.strokePath();
      g.beginPath();
      g.arc(x, y - 6, 4, Math.PI - 0.7, Math.PI + 0.7, false);
      g.strokePath();
      break;
    default:
      break;
  }
}

// Bridge symbol: two brackets either side of the road. angleDeg 0 = north.
function drawBridgeSymbol(g, x, y, angleDeg, halfLen = 6, halfW = 3.5) {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  g.lineStyle(1.3, INK, 1);
  for (const side of [-1, 1]) {
    const ox = px * halfW * side;
    const oy = py * halfW * side;
    const ax = x + ox - ux * halfLen;
    const ay = y + oy - uy * halfLen;
    const bx = x + ox + ux * halfLen;
    const by = y + oy + uy * halfLen;
    g.lineBetween(ax, ay, bx, by);
    // Flared wing walls at each end.
    g.lineBetween(ax, ay, ax - ux * 2.5 + px * 2.5 * side, ay - uy * 2.5 + py * 2.5 * side);
    g.lineBetween(bx, by, bx + ux * 2.5 + px * 2.5 * side, by + uy * 2.5 + py * 2.5 * side);
  }
}

function drawPaved(g, pts) {
  g.lineStyle(4.6, INK, 1);
  g.strokePoints(pts.map(([x, y]) => ({ x, y })));
  g.lineStyle(2.6, ROAD_RED, 1);
  g.strokePoints(pts.map(([x, y]) => ({ x, y })));
}

function drawDirt(g, pts) {
  g.lineStyle(1.7, DIRT, 1);
  dashedPolyline(g, pts, 5, 3);
}

// Builds the whole printed map into `container`, filling `paper` ({x, y, w, h}).
// `def` is a printed map definition; defaults to the 1987 county map.
// Where a print-style map puts its area on the paper: the square frame and
// world metres -> paper. Shared with the win screen's shift circles.
export function printFrame(paper, bounds) {
  const frame = { x: paper.x + 34, y: paper.y + 52, size: 500 };
  const s = frame.size / Math.max(bounds.w, bounds.h);
  const P = ([wx, wy]) => [frame.x + (wx - bounds.x) * s, frame.y + (wy - bounds.y) * s];
  return { frame, s, P };
}

// world: the region the map belongs to (default the current one), so a map
// from another region (your mission 1 map, seen in mission 3) still draws.
export function buildOldMap(scene, container, paper, def = WORLD.printedMaps.county1987, world = WORLD) {
  const data = resolvePrintedMap(def, world);
  if (def.style === 'hand') {
    buildHandMap(scene, container, paper, data);
    return;
  }
  const B = data.bounds;
  const rnd = makeRng(world.seed);
  const g = scene.add.graphics();
  container.add(g);

  // Aged paper: base colour, darker edges, stains and fold creases.
  g.fillStyle(0xe6d6ab, 1);
  g.fillRect(paper.x, paper.y, paper.w, paper.h);
  for (let i = 0; i < 6; i++) {
    g.lineStyle(6, 0x9c7a45, 0.05);
    g.strokeRect(paper.x + i * 4, paper.y + i * 4, paper.w - i * 8, paper.h - i * 8);
  }
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0xa07a40, 0.025 + rnd() * 0.025);
    g.fillCircle(paper.x + rnd() * paper.w, paper.y + rnd() * paper.h, 8 + rnd() * 26);
  }
  const midX = paper.x + paper.w / 2;
  const midY = paper.y + paper.h / 2;
  g.lineStyle(1, 0x5a4630, 0.12);
  g.lineBetween(midX, paper.y, midX, paper.y + paper.h);
  g.lineBetween(paper.x, midY, paper.x + paper.w, midY);
  g.lineStyle(1, 0xffffff, 0.25);
  g.lineBetween(midX + 1, paper.y, midX + 1, paper.y + paper.h);
  g.lineBetween(paper.x, midY + 1, paper.x + paper.w, midY + 1);

  // Title.
  label(scene, container, paper.x + 30, paper.y + 22, def.title.toUpperCase(), {
    fontSize: '20px', fontStyle: 'bold', color: '#3b2a1c',
  }, [0, 0.5]);

  // Map frame: a square holding the map's area (def.bounds).
  const { frame, s, P } = printFrame(paper, B);
  const pts = (arr) => arr.map(P);

  // Where names already sit, so later names can dodge them. Straight names
  // are boxes; a road name along a slanted road is a row of small circles.
  const taken = [];
  // Town names and blocks, returned so later marks (the shift labels on the
  // win screen) can keep off them.
  const townBoxes = [];
  const toBox = (x, y, w, h, o) => ({ x0: x - o[0] * w, x1: x - o[0] * w + w, y0: y - o[1] * h * 1.2, y1: y - o[1] * h * 1.2 + h * 1.2 });
  const takeBox = (x, y, w, h, o) => taken.push(toBox(x, y, w, h, o));
  const inFrame = (b) => b.x0 >= frame.x + 3 && b.x1 <= frame.x + frame.size - 3 && b.y0 >= frame.y + 3 && b.y1 <= frame.y + frame.size - 3;
  const boxHits = (x, y, w, h, o) => {
    const b = toBox(x, y, w, h, o);
    return !inFrame(b) || taken.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
  };
  const dots = (x, y, w, ang) => {
    const n = Math.max(2, Math.ceil(w / 7));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const d = -w / 2 + (w * i) / n;
      out.push([x + Math.cos(ang) * d, y + Math.sin(ang) * d]);
    }
    return out;
  };
  const R = 5;
  // How many of a road name's circles land on another name or off the map.
  const lineHitCount = (x, y, w, ang) => dots(x, y, w, ang).filter(([px, py]) =>
    !inFrame({ x0: px - R, x1: px + R, y0: py - R, y1: py + R })
    || taken.some((q) => px > q.x0 - R && px < q.x1 + R && py > q.y0 - R && py < q.y1 + R)).length;
  const takeLine = (x, y, w, ang) => {
    for (const [px, py] of dots(x, y, w, ang)) taken.push({ x0: px - R, x1: px + R, y0: py - R, y1: py + R });
  };

  g.fillStyle(0xeee2c0, 1);
  g.fillRect(frame.x, frame.y, frame.size, frame.size);

  // Reference grid every 500 m, lettered like a real road map.
  const cell = 500 * s;
  const cols = Math.round(Math.max(B.w, B.h) / 500);
  g.lineStyle(1, 0x7a6448, 0.18);
  for (let i = 1; i < cols; i++) {
    g.lineBetween(frame.x + i * cell, frame.y, frame.x + i * cell, frame.y + frame.size);
    g.lineBetween(frame.x, frame.y + i * cell, frame.x + frame.size, frame.y + i * cell);
  }
  for (let i = 0; i < cols; i++) {
    label(scene, container, frame.x + (i + 0.5) * cell, frame.y - 13, String.fromCharCode(65 + i), { fontSize: '10px', color: '#6a5640' });
    label(scene, container, frame.x - 14, frame.y + (i + 0.5) * cell, String(i + 1), { fontSize: '10px', color: '#6a5640' });
  }

  // Woodland.
  for (const f of data.forests) {
    g.fillStyle(FOREST, 0.35);
    g.fillPoints(pts(f.polygon).map(([x, y]) => ({ x, y })), true);
  }

  // Lakes.
  for (const lake of data.lakes) {
    const poly = pts(lake.polygon).map(([x, y]) => ({ x, y }));
    g.fillStyle(WATER_FILL, 1);
    g.fillPoints(poly, true);
    g.lineStyle(1.2, WATER, 1);
    g.strokePoints(poly, true);
    const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
    const maxY = Math.max(...poly.map((p) => p.y));
    // Kept inside the map frame (Loon Pond sits on its east edge).
    const lw = textW(lake.name, 11);
    const lx = Math.max(frame.x + 4 + lw / 2, Math.min(frame.x + frame.size - 4 - lw / 2, cx));
    label(scene, container, lx, maxY + 9, lake.name, { fontStyle: 'italic', color: '#2d5f96', fontSize: '11px' });
    takeBox(lx, maxY + 9, lw, 11, [0.5, 0.5]);
  }

  // Creeks.
  for (const creek of data.creeks) {
    const cp = pts(creek.points);
    g.lineStyle(2, WATER, 1);
    g.strokePoints(cp.map(([x, y]) => ({ x, y })));
    // Name near the middle of the creek, nudged below the water line.
    const spot = nameSpot(cp.length > 4 ? cp.slice(1, -1) : cp);
    label(scene, container, spot.x - Math.sin(spot.ang) * 10, spot.y + Math.cos(spot.ang) * 10, creek.name,
      { fontStyle: 'italic', color: '#2d5f96', fontSize: '12px' }, [0.5, 0.5], spot.ang);
    takeLine(spot.x - Math.sin(spot.ang) * 10, spot.y + Math.cos(spot.ang) * 10, textW(creek.name, 12), spot.ang);
  }

  // Roads (lies applied). Dirt first so paved roads sit on top at junctions.
  const { roads, bridges } = data;
  for (const r of roads) if (r.type !== 'paved') drawDirt(g, pts(r.points));
  for (const r of roads) if (r.type === 'paved') drawPaved(g, pts(r.points));

  // Bridges. Every bridge this map shows is drawn as a normal bridge.
  for (const b of bridges) {
    const [bx, by] = P([b.x, b.y]);
    if (b.intact) {
      drawBridgeSymbol(g, bx, by, b.angle);
    } else {
      // Not used by the 1987 map, but kept honest if the lies change.
      g.lineStyle(1.3, 0xa03020, 1);
      g.lineBetween(bx - 4, by - 4, bx + 4, by + 4);
      g.lineBetween(bx + 4, by - 4, bx - 4, by + 4);
    }
  }

  // Towns: a tinted block, little building squares, and a name.
  const townLabelOffset = { ashford: [-34, 24], millbrook: [-44, -28] };
  for (const t of data.towns) {
    const [tx, ty] = P([t.x, t.y]);
    g.fillStyle(TOWN_TINT, 0.55);
    g.fillRoundedRect(tx - 16, ty - 13, 32, 26, 4);
    const [dx, dy] = townLabelOffset[t.id] || [0, 22];
    label(scene, container, tx + dx, ty + dy, t.name.toUpperCase(), {
      fontSize: '13px', fontStyle: 'bold', color: '#2e241b',
    });
    takeBox(tx + dx, ty + dy, textW(t.name, 13, true), 13, [0.5, 0.5]);
    townBoxes.push(taken[taken.length - 1], { x0: tx - 16, x1: tx + 16, y0: ty - 13, y1: ty + 13 });
  }
  g.fillStyle(INK, 0.9);
  for (const b of data.buildings) {
    const [bx, by] = P([b.x, b.y]);
    const w = Math.max(2, b.w * s);
    const h = Math.max(2, b.h * s);
    g.fillRect(bx - w / 2, by - h / 2, w, h);
  }

  // The farm was there in 1987, even if the lane is not on this map.
  const farm = data.buildings.find((b) => b.id === 'f_house');
  if (farm) {
    const [fx, fy] = P([farm.x, farm.y]);
    label(scene, container, fx - 4, fy - 10, 'Hartley', { fontStyle: 'italic', fontSize: '11px' });
    takeBox(fx - 4, fy - 10, textW('Hartley', 11), 11, [0.5, 0.5]);
  }

  // Landmarks: the name to the right (the church to the left, it sits on
  // the west edge of Ashford), else whichever side is clear.
  const marks = data.landmarks.map((lm) => {
    const [lx, ly] = P([lm.x, lm.y]);
    takeBox(lx, ly - 2, 12, 14, [0.5, 0.5]); // the symbol
    return { lm, lx, ly };
  });
  for (const { lm, lx, ly } of marks) {
    drawMapSymbol(g, lm.kind, lx, ly);
    const text = LANDMARK_LABELS[lm.kind] || lm.name;
    const w = textW(text, 10);
    const right = { x: lx + 9, y: ly, o: [0, 0.5] };
    const left = { x: lx - 8, y: ly, o: [1, 0.5] };
    const tries = [
      ...(lm.kind === 'church' ? [left, right] : [right, left]),
      { x: lx, y: ly - 15, o: [0.5, 0.5] },
      { x: lx, y: ly + 13, o: [0.5, 0.5] },
      { x: lx + 9, y: ly - 11, o: [0, 0.5] },
      { x: lx + 9, y: ly + 11, o: [0, 0.5] },
      { x: lx - 8, y: ly - 11, o: [1, 0.5] },
      { x: lx - 8, y: ly + 11, o: [1, 0.5] },
    ];
    const pick = tries.find((q) => !boxHits(q.x, q.y, w, 10, q.o)) || tries[0];
    label(scene, container, pick.x, pick.y, text, { fontSize: '10px' }, pick.o);
    takeBox(pick.x, pick.y, w, 10, pick.o);
  }

  // Road names: one label per name, on the longest stretch where it clears
  // the other names on the sheet, either side of the road.
  const spotsByName = new Map();
  for (const r of roads) {
    const list = spotsByName.get(r.name) || [];
    list.push(...nameSpots(pts(r.points)));
    spotsByName.set(r.name, list);
  }
  const roadLabels = [...spotsByName].map(([name, spots]) => ({ name, spots: spots.sort((a, b) => b.len - a.len) }))
    .sort((a, b) => (b.spots[0] ? b.spots[0].len : 0) - (a.spots[0] ? a.spots[0].len : 0));
  for (const { name, spots } of roadLabels) {
    const w = textW(name, 10);
    const fits = spots.filter((sp) => sp.len >= Math.max(55, w * 0.85));
    if (!fits.length) continue;
    // The first clear spot; if none is clear, the one that touches the
    // fewest other names (a road name matters more than a tidy sheet).
    let pick = null;
    for (const sp of fits) {
      for (const off of [8, -8]) {
        const x = sp.x + Math.sin(sp.ang) * off;
        const y = sp.y - Math.cos(sp.ang) * off;
        const hits = lineHitCount(x, y, w, sp.ang);
        if (!pick || hits < pick.hits) pick = { x, y, ang: sp.ang, hits };
        if (!hits) break;
      }
      if (!pick.hits) break;
    }
    label(scene, container, pick.x, pick.y, name, { fontSize: '10px', color: '#4a3a2a' }, [0.5, 0.5], pick.ang);
    takeLine(pick.x, pick.y, w, pick.ang);
  }

  // Frame border (double line, printed style).
  g.lineStyle(2, INK, 1);
  g.strokeRect(frame.x, frame.y, frame.size, frame.size);
  g.lineStyle(1, INK, 1);
  g.strokeRect(frame.x - 4, frame.y - 4, frame.size + 8, frame.size + 8);

  buildLegend(scene, container, g, {
    x: frame.x + frame.size + 30,
    y: frame.y,
    w: paper.x + paper.w - (frame.x + frame.size + 30) - 24,
    h: frame.size,
  }, s);
  return { townBoxes };
}

// Legend, scale bar and north arrow in the right-hand column.
function buildLegend(scene, c, g, box, s) {
  g.lineStyle(1.2, INK, 1);
  g.strokeRect(box.x, box.y, box.w, box.h);
  label(scene, c, box.x + box.w / 2, box.y + 16, 'LEGEND', { fontSize: '13px', fontStyle: 'bold' });

  const rowH = 24;
  let y = box.y + 42;
  const sx = box.x + 30; // symbol centre
  const tx = box.x + 58; // text start
  const row = (draw, text) => {
    draw(sx, y);
    label(scene, c, tx, y, text, { fontSize: '11px' }, [0, 0.5]);
    y += rowH;
  };

  row((x, yy) => drawPaved(g, [[x - 16, yy], [x + 16, yy]]), 'Paved road');
  row((x, yy) => drawDirt(g, [[x - 16, yy], [x + 16, yy]]), 'Dirt road');
  row((x, yy) => {
    g.lineStyle(2, WATER, 1);
    g.lineBetween(x - 16, yy + 2, x - 5, yy - 2);
    g.lineBetween(x - 5, yy - 2, x + 6, yy + 2);
    g.lineBetween(x + 6, yy + 2, x + 16, yy - 1);
  }, 'Creek / river');
  row((x, yy) => {
    g.fillStyle(WATER_FILL, 1);
    g.fillEllipse(x, yy, 26, 13);
    g.lineStyle(1.2, WATER, 1);
    g.strokeEllipse(x, yy, 26, 13);
  }, 'Lake');
  row((x, yy) => {
    drawDirt(g, [[x - 16, yy], [x + 16, yy]]);
    drawBridgeSymbol(g, x, yy, 90);
  }, 'Bridge');
  row((x, yy) => {
    g.fillStyle(TOWN_TINT, 0.55);
    g.fillRoundedRect(x - 13, yy - 8, 26, 16, 3);
    g.fillStyle(INK, 0.9);
    g.fillRect(x - 6, yy - 3, 3, 3);
    g.fillRect(x + 2, yy + 1, 3, 3);
  }, 'Town');
  row((x, yy) => {
    g.fillStyle(INK, 0.9);
    g.fillRect(x - 2, yy - 2, 4, 4);
  }, 'Building');
  row((x, yy) => {
    g.fillStyle(FOREST, 0.45);
    g.fillRect(x - 13, yy - 8, 26, 16);
  }, 'Woodland');
  row((x, yy) => drawMapSymbol(g, 'church', x, yy + 2), 'Church');
  row((x, yy) => drawMapSymbol(g, 'water_tower', x, yy), 'Water tower');
  row((x, yy) => drawMapSymbol(g, 'mill', x, yy), 'Mill');
  row((x, yy) => drawMapSymbol(g, 'radio_mast', x, yy), 'Radio mast');

  // Scale bar: honest. One mile in map pixels (half a mile if the mile is too wide for the column).
  y += 14;
  const oneMile = METRES_PER_MILE * s;
  const useMile = oneMile <= box.w - 16;
  const bar = useMile ? oneMile : oneMile / 2; // bar length in map pixels
  const bx = box.x + (box.w - bar) / 2;
  label(scene, c, box.x + box.w / 2, y, 'SCALE', { fontSize: '10px', fontStyle: 'bold' });
  y += 14;
  for (let i = 0; i < 4; i++) {
    g.fillStyle(i % 2 === 0 ? INK : 0xf4ecd4, 1);
    g.fillRect(bx + (i * bar) / 4, y, bar / 4, 6);
  }
  g.lineStyle(1, INK, 1);
  g.strokeRect(bx, y, bar, 6);
  label(scene, c, bx, y + 15, '0', { fontSize: '10px' });
  label(scene, c, bx + bar / 2, y + 15, useMile ? '½' : '¼', { fontSize: '10px' });
  label(scene, c, bx + bar, y + 15, useMile ? '1 mi' : '½ mi', { fontSize: '10px' });

  // North arrow.
  const nx = box.x + box.w / 2;
  const ny = box.y + box.h - 34;
  g.fillStyle(INK, 1);
  g.fillTriangle(nx, ny - 20, nx - 7, ny + 8, nx, ny + 2);
  g.lineStyle(1.2, INK, 1);
  g.strokeTriangle(nx, ny - 20, nx + 7, ny + 8, nx, ny + 2);
  label(scene, c, nx, ny - 30, 'N', { fontSize: '13px', fontStyle: 'bold' });

  label(scene, c, box.x + box.w / 2, box.y + box.h + 14, 'Fenwick County Highway Dept.', {
    fontSize: '9px', fontStyle: 'italic', color: '#5a4630',
  });
}

// ---------------------------------------------------------------- hand sketch

const HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive'; // Caveat: loaded by the page
const PENCIL = 0x4a4540;
const BLUE = 0x2f62b3;

// Someone's pencil sketch on a notepad page. Fits the drawn content to the
// paper, so a squashed (lying) sketch still fills the sheet.
function buildHandMap(scene, container, paper, data) {
  const def = data.def;
  const rnd = makeRng(def.id.length * 977 + 13);
  const g = scene.add.graphics();
  container.add(g);
  const hand = (x, y, text, size = 15, color = '#4a4540', origin = [0.5, 0.5], rot = 0) =>
    label(scene, container, x, y, text, { fontFamily: HAND, fontSize: Math.round(size * 1.25) + 'px', color }, origin, rot); // Caveat runs small

  // Notepad page: cream, faint ruled lines, red margin.
  g.fillStyle(0xf6f0dc, 1);
  g.fillRect(paper.x, paper.y, paper.w, paper.h);
  g.lineStyle(1, 0x8fb0d0, 0.28);
  for (let y = paper.y + 40; y < paper.y + paper.h; y += 26) g.lineBetween(paper.x, y, paper.x + paper.w, y);
  g.lineStyle(1.2, 0xd07a7a, 0.4);
  g.lineBetween(paper.x + 46, paper.y, paper.x + 46, paper.y + paper.h);
  hand(paper.x + 70, paper.y + 22, def.title, 17, '#4a4540', [0, 0.5]);

  // Fit everything she drew into the page.
  const xs = [];
  const ys = [];
  const addPts = (pts) => pts.forEach(([x, y]) => { xs.push(x); ys.push(y); });
  data.roads.forEach((r) => addPts(r.points));
  data.creeks.forEach((c) => addPts(c.points));
  data.lakes.forEach((l) => addPts(l.polygon));
  for (const k of ['towns', 'landmarks', 'places', 'notes', 'bridges']) data[k].forEach((p) => { xs.push(p.x); ys.push(p.y); });
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const box = { x: paper.x + 80, y: paper.y + 70, w: paper.w - 150, h: paper.h - 120 };
  const s = Math.min(box.w / (maxX - minX || 1), box.h / (maxY - minY || 1));
  const ox = box.x + (box.w - (maxX - minX) * s) / 2;
  const oy = box.y + (box.h - (maxY - minY) * s) / 2;
  const P = ([x, y]) => [ox + (x - minX) * s, oy + (y - minY) * s];

  // Water: wavy blue.
  g.lineStyle(2.2, BLUE, 0.8);
  for (const c of data.creeks) {
    const pts = simplify(c.points.map(P), 3);
    wobbly(g, pts, rnd, 1.6);
    wobbly(g, pts.map(([x, y]) => [x + 5, y + 2]), rnd, 1.6);
    const spot = nameSpot(c.points.map(P));
    if (spot) hand(spot.x + 30, spot.y, c.name.replace(/^the /i, ''), 13, '#2f62b3', [0, 0.5]);
  }
  for (const l of data.lakes) {
    const pts = l.polygon.map(P);
    g.lineStyle(2, BLUE, 0.8);
    wobbly(g, pts, rnd, 1.2, true);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = Math.max(...pts.map((p) => p[1]));
    hand(cx, cy + 14, l.name, 13, '#2f62b3');
  }

  // Roads: pencil, double line for paved.
  for (const r of data.roads) {
    const pts = simplify(r.points.map(P), 2);
    g.lineStyle(2, PENCIL, 0.9);
    wobbly(g, pts, rnd, 1.1);
    if (r.type === 'paved') wobbly(g, pts.map(([x, y]) => [x + 3, y + 3]), rnd, 1.1);
    const spot = nameSpot(r.points.map(P));
    if (spot && spot.len > 40) {
      hand(spot.x + Math.sin(spot.ang) * 14, spot.y - Math.cos(spot.ang) * 14, r.name, 14, '#4a4540', [0.5, 0.5], spot.ang);
    }
  }

  // Bridges: a pair of brackets, drawn with a little roof if it is covered.
  for (const b of data.bridges) {
    const [x, y] = P([b.x, b.y]);
    g.lineStyle(2, PENCIL, 0.95);
    drawStamp(g, 'bridge', x, y, PENCIL, 1.1, 7);
    if (b.kind === 'covered') {
      wobbly(g, [[x - 10, y - 9], [x, y - 17], [x + 10, y - 9]], rnd, 0.6);
    }
  }

  // Towns and places: little houses with a name.
  for (const t of data.towns) {
    const [x, y] = P([t.x, t.y]);
    drawStamp(g, 'house', x - 6, y, PENCIL, 0.9, 3);
    drawStamp(g, 'house', x + 7, y + 3, PENCIL, 0.8, 4);
    hand(x, y + 22, t.name, 15);
  }
  for (const p of data.places) {
    const [x, y] = P([p.x, p.y]);
    if (p.symbol === 'x') {
      drawStamp(g, 'x', x, y, 0xb03a2e, 1.3, 9);
      hand(x + 16, y - 6, p.name, 16, '#b03a2e', [0, 0.5]);
    } else {
      drawStamp(g, 'house', x, y, PENCIL, 1, 5);
      hand(x + 14, y + 12, p.name, 14, '#4a4540', [0, 0.5]);
    }
  }
  for (const l of data.landmarks) {
    const [x, y] = P([l.x, l.y]);
    if (l.kind === 'campground') {
      g.lineStyle(1.8, PENCIL, 0.9);
      wobbly(g, [[x - 7, y + 5], [x, y - 6], [x + 7, y + 5], [x - 7, y + 5]], rnd, 0.5);
      hand(x + 12, y, l.name, 13, '#4a4540', [0, 0.5]);
    } else if (l.kind !== 'covered_bridge') {
      g.lineStyle(1.8, PENCIL, 0.9);
      wobblyCircle(g, x, y, 4, rnd);
      hand(x + 10, y, l.name, 13, '#4a4540', [0, 0.5]);
    }
  }
  for (const n of data.notes) {
    const [x, y] = P([n.x, n.y]);
    hand(x, y, n.text, 14, '#6a5f55');
  }

  // Scribbled north arrow.
  const nx = paper.x + paper.w - 46;
  const ny = paper.y + 64;
  g.lineStyle(2, PENCIL, 0.9);
  wobbly(g, [[nx, ny + 20], [nx, ny - 14]], rnd, 0.6);
  wobbly(g, [[nx - 6, ny - 6], [nx, ny - 14], [nx + 6, ny - 6]], rnd, 0.6);
  hand(nx - 16, ny + 4, 'N', 18);
}
