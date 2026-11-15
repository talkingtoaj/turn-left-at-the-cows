// Draws the player's sketch (state.sketch format) onto a Canvas2D context.
// Shared by the map overlay and the mission complete screen (thumbnails).
// Also draws printed maps and the true map of a mission (needs the world).
// Coordinates are the 960x640 map-screen paper coordinates.

import { WORLD } from '../../src/world/world.js';
import { buildOldMap, printFrame } from '../../src/map/oldMap.js';
import { findPrintedMap } from '../../src/game/printedMaps.js';
import { makeRng } from '../../src/map/draw.js';
import { makeFakeScene, CanvasGraphics, drawText } from './canvasGraphics.js';
import { PAPER, HAND, drawSketchItems, renderSketchCanvas as renderPlainSketch } from './sketchPaper.js';

// The sketch drawing itself lives in ./sketchPaper.js (no world data, so the
// start screen and shared-maps pages can use it); re-exported here.
export {
  MAP_W, MAP_H, PAPER, STAMP_SCALE, SKETCH_PAPER, HAND, LABEL_SIZE, THIN_W, THICK_W,
  drawSketchPaper, drawStroke, drawLabel, drawSketchItems,
} from './sketchPaper.js';

// Draws a printed map definition on map-screen paper at ctx's transform.
// world: the region it belongs to (default the current one).
export function paintPrintedMap(ctx, def, world = WORLD) {
  const fake = makeFakeScene(ctx);
  buildOldMap(fake.scene, fake.container, PAPER, def, world);
  fake.flushTexts();
}

// The printed map a sketch is drawn on ({ def, world }), or null for a blank sheet.
export const sketchBase = (sketch) => (sketch && sketch.base ? findPrintedMap(sketch.base) : null);

// Like sketchPaper's renderSketchCanvas, but a sketch drawn on a printed map
// (mission 1, on Darlene's map) shows that map under the marks.
export function renderSketchCanvas(sketch, cssWidth, opts = {}) {
  const base = sketchBase(sketch);
  if (!base) return renderPlainSketch(sketch, cssWidth, opts);
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / PAPER.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(PAPER.w * s);
  c.height = Math.round(PAPER.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -PAPER.x * s, -PAPER.y * s);
  paintPrintedMap(ctx, base.def, base.world);
  const mul = Math.min(2, Math.max(1, 0.45 * (PAPER.w / cssWidth)));
  drawSketchItems(new CanvasGraphics(ctx), ctx, sketch, mul);
  return c;
}

// ---------------------------------------------------------------- shifts

// The part of a print-style sheet the win screen shows: title and map
// frame, without the legend column.
export const SHIFT_CROP = { x: PAPER.x + 8, y: PAPER.y + 4, w: 552, h: 562 };

const RED_PENCIL = 0xb8322a;
const GREEN = 0x2f7d3a;
const GREY = 0x7d7466;

// A print-style printed map (cropped to SHIFT_CROP), cssWidth px wide, with
// its shifts circled (SPEC 9p).
//   def, world: the sheet to draw (the 1987 one, or realMapDef(def) for now)
//   shifts: the shifts to circle; seen: Set of shift ids seen
//   sketch: the player's marks to draw on top (mission 1), or null
//   labels: true writes each shift's label beside its circle, ticked if seen
export function renderShiftMapCanvas({ def, world = WORLD, shifts, seen, sketch = null, labels = false }, cssWidth) {
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / SHIFT_CROP.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(SHIFT_CROP.w * s);
  c.height = Math.round(SHIFT_CROP.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -SHIFT_CROP.x * s, -SHIFT_CROP.y * s);
  paintPrintedMap(ctx, def, world);
  const g = new CanvasGraphics(ctx);
  if (sketch) drawSketchItems(g, ctx, sketch, Math.min(2, Math.max(1, 0.4 * (SHIFT_CROP.w / cssWidth))));
  drawShiftMarks(g, ctx, def, shifts, seen, labels);
  return c;
}

// Red pencil circles round each shift; with labels, the label beside it and
// a tick when seen (grey, one ring, when missed). Labels dodge each other and
// stay inside the crop.
function drawShiftMarks(g, ctx, def, shifts, seen, labels) {
  const { frame, P } = printFrame(PAPER, def.bounds);
  const R = 17;
  const SIZE = 25;
  const placed = [];
  const right = SHIFT_CROP.x + SHIFT_CROP.w - 6;
  const left = SHIFT_CROP.x + 6;
  shifts.forEach((sh, i) => {
    const rnd = makeRng(1000 + i * 37);
    const [x, y] = P(sh.at);
    const hit = seen.has(sh.id);
    const col = !labels || hit ? RED_PENCIL : GREY;
    g.lineStyle(2.6, col, labels ? 0.95 : 0.8);
    for (let k = 0; k < 2; k++) {
      // Twice round, a little off, like a hand-drawn ring.
      const pts = [];
      const a0 = rnd() * Math.PI * 2;
      for (let j = 0; j <= 20; j++) {
        const a = a0 + (j / 18) * Math.PI * 2;
        const rr = R * (0.92 + rnd() * 0.16) + k * 2;
        pts.push({ x: x + Math.cos(a) * rr * 1.08, y: y + Math.sin(a) * rr });
      }
      if (!labels || hit || k === 0) g.strokePoints(pts, false);
    }
    if (!labels) return;
    ctx.save();
    ctx.font = `${SIZE}px ${HAND}`;
    const tw = ctx.measureText(sh.label).width + (hit ? 26 : 0);
    ctx.restore();
    // Right of the ring, else left of it if that runs off the sheet.
    let lx = x + R + 8;
    let toLeft = false;
    if (lx + tw > right) {
      lx = x - R - 8 - tw;
      toLeft = true;
    }
    lx = Math.max(left, lx);
    const box = (yy) => ({ x0: lx - 3, x1: lx + tw + 3, y0: yy - SIZE * 0.55, y1: yy + SIZE * 0.55 });
    const clash = (b) => placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    let ly = y;
    for (const dy of [0, -28, 28, -56, 56, -84, 84]) {
      const yy = Math.min(frame.y + frame.size - 10, Math.max(frame.y + 12, y + dy));
      if (!clash(box(yy))) { ly = yy; break; }
    }
    placed.push(box(ly));
    // A short pencil lead line when the label had to move off the ring.
    if (Math.abs(ly - y) > 4) {
      g.lineStyle(1.6, hit ? RED_PENCIL : GREY, 0.8);
      g.lineBetween(toLeft ? x - R : x + R, y, toLeft ? lx + tw : lx - 2, ly);
    }
    let tx = lx;
    if (hit) {
      g.lineStyle(3.2, GREEN, 1);
      g.strokePoints([{ x: lx + 2, y: ly + 1 }, { x: lx + 8, y: ly + 7 }, { x: lx + 19, y: ly - 9 }], false);
      tx += 26;
    }
    // Paper-coloured halo so the words read over roads and grid lines.
    ctx.save();
    ctx.font = `${SIZE}px ${HAND}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(238,226,192,0.92)';
    ctx.strokeText(sh.label, tx, ly);
    ctx.restore();
    drawText(ctx, tx, ly, sh.label, { fontFamily: HAND, fontSize: SIZE + 'px', color: hit ? '#9e2a22' : '#6f675a' }, [0, 0.5]);
  });
}

// A canvas with a printed map definition drawn on map-screen paper, cropped
// to the paper area, cssWidth px wide.
export function renderPrintedMapCanvas(def, cssWidth, world = WORLD) {
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / PAPER.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(PAPER.w * s);
  c.height = Math.round(PAPER.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -PAPER.x * s, -PAPER.y * s);
  paintPrintedMap(ctx, def, world);
  return c;
}

// A truthful map definition (no lies) covering a mission's area: where it
// starts (the giver, or the world start), its waypoints and its goal, plus
// a margin. Never marks the player or the goal.
export function trueMapDef(mission) {
  const pts = [];
  const giver = mission.giverNpcId && WORLD.locals.find((l) => l.id === mission.giverNpcId);
  pts.push(giver ? [giver.x, giver.y] : [WORLD.start.x, WORLD.start.y]);
  for (const wp of mission.waypoints) pts.push([wp.x, wp.y]);
  pts.push([mission.goal.x, mission.goal.y]);
  const M = 350;
  const x0 = Math.max(0, Math.min(...pts.map((p) => p[0])) - M);
  const y0 = Math.max(0, Math.min(...pts.map((p) => p[1])) - M);
  const x1 = Math.min(WORLD.size.w, Math.max(...pts.map((p) => p[0])) + M);
  const y1 = Math.min(WORLD.size.h, Math.max(...pts.map((p) => p[1])) + M);
  return {
    id: 'truth_' + mission.id,
    title: 'The real map',
    tabLabel: 'Real map',
    style: 'print',
    bounds: { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) },
    include: 'all',
    lies: [],
  };
}
