// Draws the player's sketch (state.sketch format) onto a Canvas2D context.
// Shared by the map overlay and the mission complete screen (thumbnails).
// Also draws printed maps and the true map of a mission (needs the world).
// Coordinates are the 960x640 map-screen paper coordinates.

import { WORLD } from '../../src/world/world.js';
import { buildOldMap } from '../../src/map/oldMap.js';
import { makeFakeScene } from './canvasGraphics.js';
import { PAPER } from './sketchPaper.js';

// The sketch drawing itself lives in ./sketchPaper.js (no world data, so the
// start screen and shared-maps pages can use it); re-exported here.
export {
  MAP_W, MAP_H, PAPER, STAMP_SCALE, SKETCH_PAPER, HAND, LABEL_SIZE, THIN_W, THICK_W,
  drawSketchPaper, drawStroke, drawLabel, drawSketchItems, renderSketchCanvas,
} from './sketchPaper.js';

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
