// Draws the player's sketch (state.sketch format) onto a Canvas2D context:
// the paper, the strokes, stamps and labels. No world data, so the start
// screen and the shared-maps pages can draw sketches without loading the
// game. src3/map/sketchRender.js re-exports all of this.
// Coordinates are the 960x640 map-screen paper coordinates.
//
// Sketch format: { strokes: [{ points: [[x, y], ...], width?, color?, dash? }],
//                  stamps: [{ kind, x, y, color? }], labels: [{ text, x, y, color? }] }
// (colors are 0xRRGGBB numbers). This is also what a shared map stores.

import {
  drawStamp, wobbly, makeRng, seedFrom, drawSketchStroke, STROKE_WIDTH, STROKE_WIDTH_THICK,
} from '../../src/map/draw.js';
import { CanvasGraphics, drawText, rgba } from './canvasGraphics.js';

export const MAP_W = 960;
export const MAP_H = 640;
export const PAPER = { x: 100, y: 52, w: 840, h: 576 };
export const STAMP_SCALE = 1.3;
export const SKETCH_PAPER = 0xf3eee0;
// Pencil handwriting: Caveat (Google Fonts, loaded by the page); the old
// stack fell back to Comic Sans on Linux and Android.
export const HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive';
export const LABEL_SIZE = 22;

// Pencil widths: shared with the Phaser map screen.
export const THIN_W = STROKE_WIDTH;
export const THICK_W = STROKE_WIDTH_THICK;

export function drawSketchPaper(g, ctx, { hint = true } = {}) {
  g.fillStyle(SKETCH_PAPER, 1);
  g.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
  g.lineStyle(1, 0x7fa3c8, 0.16);
  for (let x = PAPER.x + 24; x < PAPER.x + PAPER.w; x += 24) g.lineBetween(x, PAPER.y, x, PAPER.y + PAPER.h);
  for (let y = PAPER.y + 24; y < PAPER.y + PAPER.h; y += 24) g.lineBetween(PAPER.x, y, PAPER.x + PAPER.w, y);
  g.lineStyle(2, 0x000000, 0.08);
  g.strokeRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);

  // Hand-written north mark in the top right corner.
  const nx = PAPER.x + PAPER.w - 40;
  const ny = PAPER.y + 50;
  g.lineStyle(2, 0x555555, 0.9);
  const rnd = makeRng(42);
  wobbly(g, [[nx, ny + 18], [nx, ny - 14]], rnd);
  wobbly(g, [[nx - 6, ny - 6], [nx, ny - 14], [nx + 6, ny - 6]], rnd);
  drawText(ctx, nx - 22, ny + 4, 'N', { fontFamily: HAND, fontSize: '24px', color: '#555555' }, [0.5, 0.5]);
  if (hint) drawText(ctx, PAPER.x + PAPER.w / 2, PAPER.y + PAPER.h - 14,
    'Draw what you were told. This sheet never shows where you are.',
    { fontFamily: HAND, fontSize: '16px', color: '#9a9184' }, [0.5, 0.5]);
}

// One pencil stroke. Optional fields: width (default thin) and dash: true.
// Uses the shared renderer so both versions draw strokes the same way.
export function drawStroke(g, _ctx, stroke, mul = 1) {
  drawSketchStroke(g, stroke, mul);
}

export function drawLabel(ctx, lbl) {
  drawText(ctx, lbl.x, lbl.y, lbl.text,
    { fontFamily: HAND, fontSize: LABEL_SIZE + 'px', color: rgba(lbl.color ?? 0x555555) }, [0, 0.5]);
}

// Strokes, stamps and labels of a sketch (no paper).
// `mul` makes lines bolder for small thumbnails.
export function drawSketchItems(g, ctx, sketch, mul = 1) {
  for (const stroke of sketch.strokes || []) drawStroke(g, ctx, stroke, mul);
  for (const st of sketch.stamps || []) {
    drawStamp(g, st.kind, st.x, st.y, st.color ?? 0x555555, STAMP_SCALE, seedFrom(st.kind, st.x, st.y));
  }
  for (const lbl of sketch.labels || []) drawLabel(ctx, lbl);
}

// A canvas holding just the paper area of a sketch, cssWidth px wide.
// hint: false leaves out the "Draw what you were told" line (shared maps).
export function renderSketchCanvas(sketch, cssWidth, { hint = true } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / PAPER.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(PAPER.w * s);
  c.height = Math.round(PAPER.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -PAPER.x * s, -PAPER.y * s);
  const g = new CanvasGraphics(ctx);
  drawSketchPaper(g, ctx, { hint });
  // Small thumbnails get bolder pencil so lines stay visible.
  const mul = Math.min(2, Math.max(1, 0.45 * (PAPER.w / cssWidth)));
  drawSketchItems(g, ctx, sketch, mul);
  return c;
}
