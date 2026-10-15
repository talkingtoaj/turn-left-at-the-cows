// Draws the player's sketch (state.sketch format) onto a Canvas2D context.
// Shared by the map overlay and the mission complete screen (thumbnails).
// Coordinates are the 960x640 map-screen paper coordinates.

import { WORLD } from '../../src/world/world.js';
import { buildOldMap } from '../../src/map/oldMap.js';
import {
  drawStamp, wobbly, makeRng, seedFrom, drawSketchStroke, STROKE_WIDTH, STROKE_WIDTH_THICK,
} from '../../src/map/draw.js';
import { CanvasGraphics, drawText, makeFakeScene, rgba } from './canvasGraphics.js';

export const MAP_W = 960;
export const MAP_H = 640;
export const PAPER = { x: 100, y: 52, w: 840, h: 576 };
export const STAMP_SCALE = 1.3;
export const SKETCH_PAPER = 0xf3eee0;
export const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
export const LABEL_SIZE = 18;

// Pencil widths: shared with the Phaser map screen.
export const THIN_W = STROKE_WIDTH;
export const THICK_W = STROKE_WIDTH_THICK;

export function drawSketchPaper(g, ctx) {
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
  drawText(ctx, nx - 22, ny + 4, 'N', { fontFamily: HAND, fontSize: '20px', color: '#555555' }, [0.5, 0.5]);
  drawText(ctx, PAPER.x + PAPER.w / 2, PAPER.y + PAPER.h - 14,
    'Draw what you were told. This sheet never shows where you are.',
    { fontFamily: HAND, fontSize: '12px', color: '#9a9184' }, [0.5, 0.5]);
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
export function renderSketchCanvas(sketch, cssWidth) {
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / PAPER.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(PAPER.w * s);
  c.height = Math.round(PAPER.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -PAPER.x * s, -PAPER.y * s);
  const g = new CanvasGraphics(ctx);
  drawSketchPaper(g, ctx);
  // Small thumbnails get bolder pencil so lines stay visible.
  const mul = Math.min(2, Math.max(1, 0.45 * (PAPER.w / cssWidth)));
  drawSketchItems(g, ctx, sketch, mul);
  return c;
}

// A canvas with a printed map definition drawn on map-screen paper, cropped
// to the paper area, cssWidth px wide.
export function renderPrintedMapCanvas(def, cssWidth) {
  const dpr = window.devicePixelRatio || 1;
  const s = (cssWidth / PAPER.w) * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(PAPER.w * s);
  c.height = Math.round(PAPER.h * s);
  const ctx = c.getContext('2d');
  ctx.setTransform(s, 0, 0, s, -PAPER.x * s, -PAPER.y * s);
  const fake = makeFakeScene(ctx);
  buildOldMap(fake.scene, fake.container, PAPER, def);
  fake.flushTexts();
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
