// Draws a saved sketch ({ strokes, stamps, labels } in map-screen pixels) into
// a container, for thumbnails and big views of snapshots. The caller moves and
// scales the container. Uses only scene.add.graphics / scene.add.text.

import { drawStamp, seedFrom, drawSketchStroke, makeRng, wobbly } from './draw.js';

// The sketch paper on the map screen (sketch coordinates live in this rect).
export const SKETCH_PAPER_RECT = { x: 100, y: 52, w: 840, h: 576 };
export const SKETCH_PAPER_COLOR = 0xf3eee0;
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const STAMP_SCALE = 1.3;

const toCss = (c) => '#' + c.toString(16).padStart(6, '0');

// opts: { lineMul (stroke width multiplier), textMul (label size multiplier),
//         grid (draw the faint paper grid) }
export function drawSketchInto(scene, container, sketch, opts = {}) {
  const P = SKETCH_PAPER_RECT;
  const lineMul = opts.lineMul || 1;
  const textMul = opts.textMul || 1;
  const g = scene.add.graphics();
  container.add(g);
  g.fillStyle(SKETCH_PAPER_COLOR, 1);
  g.fillRect(P.x, P.y, P.w, P.h);
  if (opts.grid !== false) {
    g.lineStyle(Math.max(1, lineMul * 0.8), 0x7fa3c8, 0.16);
    for (let x = P.x + 24; x < P.x + P.w; x += 24) g.lineBetween(x, P.y, x, P.y + P.h);
    for (let y = P.y + 24; y < P.y + P.h; y += 24) g.lineBetween(P.x, y, P.x + P.w, y);
  }
  // North mark, as on the sheet.
  const nx = P.x + P.w - 40;
  const ny = P.y + 50;
  g.lineStyle(2 * lineMul, 0x555555, 0.9);
  const rnd = makeRng(42);
  wobbly(g, [[nx, ny + 18], [nx, ny - 14]], rnd);
  wobbly(g, [[nx - 6, ny - 6], [nx, ny - 14], [nx + 6, ny - 6]], rnd);

  for (const stroke of sketch.strokes || []) drawSketchStroke(g, stroke, lineMul);
  for (const st of sketch.stamps || []) {
    drawStamp(g, st.kind, st.x, st.y, st.color ?? 0x555555, STAMP_SCALE * Math.max(1, lineMul * 0.6), seedFrom(st.kind, st.x, st.y));
  }
  for (const lbl of sketch.labels || []) {
    const t = scene.add.text(lbl.x, lbl.y, lbl.text, {
      fontFamily: HAND, fontSize: `${Math.round(18 * textMul)}px`, color: toCss(lbl.color ?? 0x555555),
    }).setOrigin(0, 0.5);
    container.add(t);
  }
  return g;
}
