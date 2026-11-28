// Map overlay for the three.js version: a DOM layer with one Canvas2D canvas.
// It is a port of the old 2D map screen (removed Nov 2026) and works the same:
//  - "My sketch": the player draws their own map from what locals said. It
//    opens first. Mission 1's comes with a few marks already drawn (#87,
//    src/game/startSketch.js). A mission with sketchOn would draw on that
//    printed map instead (its tab taking the sketch tab's place); none does
//    now, but sketches saved that way still show their map.
//  - A tab per printed map the mission gives ("Darlene's map" in mission 1),
//    built from WORLD with its lies.
// Everything is laid out on a 960x640 logical surface that is scaled to fit
// the window. Sketch data lives in state.sketch in the same format (and the
// same 960x640 paper coordinates) as the Phaser version.
// Core rule: nothing here ever shows the player's position.

import { state } from '../../src/state.js';
import { buildOldMap } from '../../src/map/oldMap.js';
import { printedMapsFor, findPrintedMap } from '../../src/game/printedMaps.js';
import { topicLabel } from '../../src/game/dialogue.js';
import { MISSIONS, currentMission } from '../../src/game/missions.js';
import { myMap } from '../../src/game/myMaps.js';
import {
  drawStamp, seedFrom, smoothPoints, distToSegment,
  STAMP_KINDS, STAMP_NAMES,
} from '../../src/map/draw.js';
import { renderHelp } from '../../src/ui/help.js';
import { CanvasGraphics, drawText, makeFakeScene, rgba } from './canvasGraphics.js';
import {
  MAP_W as W, MAP_H as H, PAPER, STAMP_SCALE, SKETCH_PAPER, HAND, LABEL_SIZE, THIN_W, THICK_W,
  drawSketchPaper as paintSketchPaper, drawSketchItems, drawStroke as paintStroke,
} from './sketchRender.js';
import {
  unfoldMode, FOLD_SECONDS, FADE_SECONDS, nextRoad, roadFlags, roadOf, grainPoints, endDots, isGraphite, strokeSeed,
  spawnCrumbs, stepCrumbs, crumbAlpha, stepDamp,
} from './pencil.js';
import { prefetchMapSounds, playUnfold, scratchStart, scratchMove, scratchStop } from './mapSound.js';

const OLD_PAPER = 0xe6d6ab;
const SERIF = 'Georgia, serif';
const MAX_LABEL = 40;
const MAX_HISTORY = 200;

const INKS = [
  { id: 'grey', color: 0x555555, name: 'Pencil' },
  { id: 'blue', color: 0x2f62b3, name: 'Blue (water)' },
  { id: 'red', color: 0xc0392b, name: 'Red (notes)' },
];

// Your finished maps from earlier missions, to look at (not draw on): this
// run's archive, else the copy kept in the browser when you finished it
// (src/game/myMaps.js), so a mission played on its own still has them.
function earlierSketches() {
  const m = currentMission(state);
  const at = m ? MISSIONS.findIndex((q) => q.id === m.id) : -1;
  const out = [];
  for (let i = 0; i < at; i++) {
    const id = MISSIONS[i].id;
    const run = [...state.sketchArchive].reverse().find((a) => a.missionId === id);
    const sketch = run ? run.sketch : myMap(id)?.sketch;
    const empty = !sketch || !((sketch.strokes || []).length + (sketch.stamps || []).length + (sketch.labels || []).length);
    if (!empty) out.push({ n: i + 1, missionId: id, sketch });
  }
  return out;
}

// Tabs: "My sketch", one per printed map the current mission gives, then your
// maps from earlier missions. Rebuilt on every open (the mission may have
// changed). The tabs share the room left of the Notebook button.
let TABS = [];
// The printed map the sketch is drawn on ({ def, world }), or null (blank sheet).
const sketchBase = (sketch) => (sketch && sketch.base ? findPrintedMap(sketch.base) : null);
function buildTabs() {
  // A sketch drawn on a printed map (sketchOn; none since #87): that map's tab is the sketch tab.
  const base = sketchBase(state.sketch);
  const extra = [
    ...printedMapsFor(state).filter((def) => !base || def !== base.def).map((def) => ({
      id: 'map:' + def.id,
      def,
      text: def.tabLabel || def.title,
      fill: def.style === 'hand' ? 0xf6f0dc : OLD_PAPER,
      font: def.style === 'hand' ? HAND : SERIF,
    })),
    ...earlierSketches().map((e) => ({
      id: 'old:' + e.missionId,
      sketch: e.sketch,
      text: `My map ${e.n}`,
      fill: SKETCH_PAPER,
      font: HAND,
    })),
    // The how-to-play content, last in the row (#88; H used to open it).
    { id: 'help', text: 'Help', fill: OLD_PAPER, font: SERIF },
  ];
  const x0 = PAPER.x + 168;
  const room = NOTE_BTN.x - 8 - x0;
  const w = Math.min(206, Math.floor(room / extra.length) - 8);
  TABS = [
    base
      ? { id: 'sketch', text: base.def.tabLabel || base.def.title, x: PAPER.x + 20, w: 140, fill: OLD_PAPER, font: SERIF }
      : { id: 'sketch', text: 'My sketch', x: PAPER.x + 20, w: 140, fill: SKETCH_PAPER, font: HAND },
    ...extra.map((t, i) => ({ ...t, x: x0 + i * (w + 8), w })),
  ];
}

const CLOSE = { x: W - 26, y: 26, r: 16 };
// Notebook toggle: a small tab at the right end of the tab row (sketch tab only).
const NOTE_BTN = { x: PAPER.x + PAPER.w - 156, w: 124 };
// Notebook panel: over the right part of the paper, so the rest stays drawable.
const NOTE_PANEL = { x: PAPER.x + PAPER.w - 300, y: PAPER.y + 8, w: 292, h: PAPER.h - 16 };

// Survive between openings (and between overlay instances).
let lastTab = 'sketch';
const history = [];
let historyEpoch = 0; // state.sketchEpoch the undo stack belongs to
let notebookOpen = false;
let penDashed = false;
let penThick = false;
// Damp spots from rain (a look only, not in the sketch). Kept here so they
// survive the map closing and dry on their own (#92).
let dampSpots = [];
let dampAt = 0;

const STYLE = `
.map-overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(29, 23, 18, 0.82); z-index: 50; user-select: none; -webkit-user-select: none; }
.map-overlay.map-open { display: flex; }
.map-wrap { position: relative; }
.map-canvas { display: block; touch-action: none; outline: none; }
.map-cursor-pencil { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M2 30 L5 21 L22 4 L28 10 L11 27 Z' fill='%23e0b13a' stroke='%233a3128' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M2 30 L5 21 L11 27 Z' fill='%23d9c9a3' stroke='%233a3128' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M2 30 L3.6 25.4 L6.6 28.4 Z' fill='%23555'/%3E%3Cpath d='M22 4 L28 10 L30 8 Q31 5 28 2 Q25 1 22 4Z' fill='%23e58a9a' stroke='%233a3128' stroke-width='1.5'/%3E%3C/svg%3E") 2 30, crosshair; }
/* The map unfolds (#92): a stack of three folded panels slides up and opens, then
   gives way to the map. Class map-fold, map-fade (reduced motion) or map-nofx (?mapfx=off). */
.map-cover { position: absolute; left: ${PAPER.x}px; top: ${PAPER.y}px; width: ${PAPER.w}px; height: ${PAPER.h}px;
  perspective: 1800px; pointer-events: none; display: none; transform-origin: 0 100%; opacity: 1;
  transform: translate(0, 62%) scale(0.5); transition: transform ${FOLD_SECONDS}s cubic-bezier(.2,.8,.25,1), opacity .12s; }
.map-fold .map-cover { display: block; }
.map-fold.map-in .map-cover { transform: none; opacity: 0; transition: transform ${FOLD_SECONDS}s cubic-bezier(.2,.8,.25,1), opacity .14s ease ${FOLD_SECONDS * 0.6}s; }
.map-p { position: absolute; top: 0; height: 100%; width: ${PAPER.w / 3}px; transform-style: preserve-3d; box-sizing: border-box;
  background: linear-gradient(90deg, #f6f1e1, #e7dec2); box-shadow: inset -1px 0 0 rgba(60,45,25,0.25), 0 0 14px rgba(0,0,0,0.25); }
.map-p1 { left: 0; }
.map-p2 { left: 100%; width: 100%; transform-origin: 0 50%; transform: rotateY(-176deg); transition: transform ${FOLD_SECONDS * 0.85}s ease-in-out 0.03s; }
.map-p3 { left: 100%; width: 100%; transform-origin: 0 50%; transform: rotateY(176deg); transition: transform ${FOLD_SECONDS * 0.85}s ease-in-out 0.03s; }
.map-fold.map-in .map-p2, .map-fold.map-in .map-p3 { transform: none; }
.map-fold .map-canvas { opacity: 0; transition: opacity .1s; }
.map-fold.map-in .map-canvas { opacity: 1; transition: opacity .16s ease ${FOLD_SECONDS * 0.55}s; }
.map-fade .map-canvas { opacity: 0; transition: opacity ${FADE_SECONDS}s; }
.map-fade.map-in .map-canvas { opacity: 1; }
.map-overlay.map-fold, .map-overlay.map-fade { background: rgba(29, 23, 18, 0); transition: background-color ${FOLD_SECONDS}s, backdrop-filter ${FOLD_SECONDS}s; }
.map-overlay.map-fold.map-in, .map-overlay.map-fade.map-in { background: rgba(29, 23, 18, 0.82); }
.map-overlay.map-fold.map-in { backdrop-filter: blur(3px); }
.map-overlay.map-closing { pointer-events: none; }
.map-damp { position: absolute; left: ${PAPER.x}px; top: ${PAPER.y}px; width: ${PAPER.w}px; height: ${PAPER.h}px; overflow: hidden;
  pointer-events: none; mix-blend-mode: multiply; }
.map-damp i { position: absolute; border-radius: 50%; display: block;
  background: radial-gradient(circle, rgba(92,78,50,0.10) 0 38%, rgba(92,78,50,0.30) 60%, rgba(92,78,50,0) 72%); }
.map-layer { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; pointer-events: none; }
.map-notes { position: absolute; display: none; flex-direction: column; pointer-events: auto;
  background: #fbf6e4; border: 1px solid #b9ab8a; border-radius: 4px; box-shadow: 3px 4px 0 rgba(0,0,0,0.18);
  font-family: ${HAND}; color: #3a3128; }
.map-notes.map-notes-open { display: flex; }
.map-help { position: absolute; display: none; margin: 0; box-sizing: border-box; overflow-y: auto; pointer-events: auto; user-select: text; -webkit-user-select: text; }
.map-help.map-help-open { display: block; }
.map-notes-head { padding: 7px 12px 5px; font-size: 17px; border-bottom: 2px solid #d9a0a0; flex: none; }
.map-notes-head small { font-size: 11px; color: #8a7f6c; margin-left: 6px; }
.map-notes-body { overflow-y: auto; padding: 4px 12px 10px; flex: 1; font-size: 13px; line-height: 1.4;
  background-image: repeating-linear-gradient(transparent 0 21px, rgba(127,163,200,0.25) 21px 22px); }
.map-notes-body::-webkit-scrollbar { width: 8px; }
.map-notes-body::-webkit-scrollbar-thumb { background: #c9bb98; border-radius: 4px; }
.map-notes-who { margin: 10px 0 2px; font-size: 15px; font-weight: bold; color: #7a3b2e; }
.map-notes-entry { margin: 0 0 6px; }
.map-notes-topic { font-family: Georgia, serif; font-size: 10px; color: #8a7f6c; text-transform: uppercase; letter-spacing: 0.04em; }
.map-notes-empty { color: #8a7f6c; font-style: italic; margin-top: 12px; }
`;

function injectStyle() {
  if (document.getElementById('map-overlay-style')) return;
  const s = document.createElement('style');
  s.id = 'map-overlay-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

// Splits text into lines no wider than maxW (for the toolbar status line).
function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function inPaper(x, y) {
  return x >= PAPER.x && x <= PAPER.x + PAPER.w && y >= PAPER.y && y <= PAPER.y + PAPER.h;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function iconPencil(g, x, y) {
  g.fillStyle(0xe0b13a, 1);
  g.fillPoints([{ x: x - 9, y: y + 5 }, { x: x + 5, y: y - 9 }, { x: x + 9, y: y - 5 }, { x: x - 5, y: y + 9 }], true);
  g.fillStyle(0x555555, 1);
  g.fillTriangle(x - 9, y + 5, x - 5, y + 9, x - 11, y + 11);
}

function iconEraser(g, x, y) {
  const pts = [{ x: x - 10, y: y + 3 }, { x: x + 1, y: y - 8 }, { x: x + 10, y: y + 1 }, { x: x - 1, y: y + 12 }];
  g.fillStyle(0xe58a9a, 1);
  g.fillPoints(pts, true);
  g.lineStyle(1.5, 0x3a3128, 1);
  g.strokePoints(pts, true);
}

function iconDashed(g, x, y) {
  g.lineStyle(2.4, 0x555555, 1);
  for (let i = 0; i < 3; i++) g.lineBetween(x - 11 + i * 8, y + 5 - i * 5, x - 7 + i * 8, y + 2.5 - i * 5);
}

function iconThin(g, x, y) {
  g.lineStyle(1.8, 0x555555, 1);
  g.lineBetween(x - 10, y + 6, x + 10, y - 6);
}

function iconThick(g, x, y) {
  g.lineStyle(5, 0x555555, 1);
  g.lineBetween(x - 10, y + 6, x + 10, y - 6);
}

export function createMapOverlay(root, { onClose, rain = () => 0 } = {}) {
  injectStyle();
  // ?mapfx=off turns off the unfold, the pencil feel and the rain spots (#92).
  const FX = new URLSearchParams(window.location.search).get('mapfx') !== 'off';
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (FX) prefetchMapSounds();
  const el = document.createElement('div');
  el.className = 'map-overlay';
  const wrap = document.createElement('div');
  wrap.className = 'map-wrap';
  el.appendChild(wrap);
  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  wrap.appendChild(canvas);
  // DOM layer on the same 960x640 logical surface (scaled with the canvas).
  const layer = document.createElement('div');
  layer.className = 'map-layer';
  wrap.appendChild(layer);
  const damp = document.createElement('div');
  damp.className = 'map-damp';
  layer.appendChild(damp);
  // The folded panels of the unfold (CSS does the moving).
  const cover = document.createElement('div');
  cover.className = 'map-cover';
  const p1 = document.createElement('div');
  p1.className = 'map-p map-p1';
  const p2 = document.createElement('div');
  p2.className = 'map-p map-p2';
  const p3 = document.createElement('div');
  p3.className = 'map-p map-p3';
  p2.appendChild(p3);
  p1.appendChild(p2);
  cover.appendChild(p1);
  layer.appendChild(cover);
  const notes = document.createElement('div');
  notes.className = 'map-notes';
  Object.assign(notes.style, {
    left: NOTE_PANEL.x + 'px', top: NOTE_PANEL.y + 'px', width: NOTE_PANEL.w + 'px', height: NOTE_PANEL.h + 'px',
  });
  const notesHead = document.createElement('div');
  notesHead.className = 'map-notes-head';
  const notesBody = document.createElement('div');
  notesBody.className = 'map-notes-body';
  notes.append(notesHead, notesBody);
  layer.appendChild(notes);
  // Scrolling and clicking in the notebook must not draw on the sketch.
  notes.addEventListener('pointerdown', (e) => e.stopPropagation());
  notes.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  // The Help tab's panel: the how-to-play sheet over the paper.
  const helpPanel = document.createElement('div');
  helpPanel.className = 'map-help ui-paper';
  Object.assign(helpPanel.style, { left: PAPER.x + 'px', top: PAPER.y + 'px', width: PAPER.w + 'px', height: PAPER.h + 'px' });
  layer.appendChild(helpPanel);
  helpPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
  helpPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  root.appendChild(el);
  const ctx = canvas.getContext('2d');
  const g = new CanvasGraphics(ctx);

  let open = false;
  let openedAt = 0;
  let k = 1; // logical px -> backing px
  const mapCache = new Map(); // tab id -> pre-rendered printed map (backing resolution)
  let rafId = 0;

  // UI state, reset on every open (like the Phaser scene's create()).
  let tab = lastTab;
  let tool = 'pencil';
  let stampKind = null;
  let ink = INKS[0];
  let current = null; // stroke being drawn
  let typing = null; // { x, y, text, caret, color }
  let caretTimer = null;
  let clearArmed = false;
  let clearTimer = null;
  let hover = null; // { x, y } logical pointer position
  let hoverTip = null;
  let pointerDown = false;
  let drawerOpen = false; // the stamps drawer
  let crumbs = []; // eraser crumbs { x, y, vx, vy, age, size }
  let crumbRaf = 0;
  let crumbAt = 0;
  let lastMove = null; // { x, y, t } for the pencil speed
  let dampTimer = 0;
  let closeTimer = 0;

  // ------------------------------------------------------------ toolbar layout

  const buttons = []; // always on the toolbar
  const drawerButtons = []; // inside the stamps drawer, only while it is open
  let drawerBox = null;
  let statusY = 0;
  let stampsBtn = null;
  const road = () => roadOf(penDashed, penThick);
  const ROAD_TIP = {
    thin: 'Road: thin line (click for a dirt road)',
    dash: 'Road: dashed, dirt (click for a main road)',
    thick: 'Road: thick, main (click for thin)',
  };
  (function layoutToolbar() {
    const colX = [31, 69];
    const size = 34;
    let y = PAPER.y + 30;
    const pair = (l, r) => {
      buttons.push({ ...l, x: colX[0], y, w: size, h: size });
      buttons.push({ ...r, x: colX[1], y, w: size, h: size });
      y += size + 8;
    };
    pair(
      { id: 'pencil', tip: 'Pencil', icon: iconPencil, active: () => tool === 'pencil', onClick: () => setTool('pencil') },
      { id: 'eraser', tip: 'Eraser', icon: iconEraser, active: () => tool === 'eraser', onClick: () => setTool('eraser') },
    );
    pair(
      { id: 'text', tip: 'Text label', text: 'Aa', active: () => tool === 'text', onClick: () => setTool('text') },
      {
        id: 'road',
        tip: () => ROAD_TIP[road()],
        icon: (gg, x, yy) => (road() === 'dash' ? iconDashed : road() === 'thick' ? iconThick : iconThin)(gg, x, yy),
        active: () => tool === 'pencil' && road() !== 'thin',
        onClick: () => cycleRoad(),
      },
    );
    // Three small ink dots.
    INKS.forEach((c, i) => {
      buttons.push({
        id: 'ink_' + c.id, tip: c.name, x: [24, 50, 76][i], y: y + 4, w: 24, h: 24,
        icon: (gg, x, yy) => { gg.fillStyle(c.color, 1); gg.fillCircle(x, yy, 7); },
        active: () => ink === c, onClick: () => setInk(c),
      });
    });
    y += 38;
    stampsBtn = {
      id: 'stamps', tip: 'Stamps: church, tree, bridge and more', text: 'Stamps', x: 50, y: y + 8, w: 72, h: 32,
      active: () => tool === 'stamp' || drawerOpen, onClick: () => toggleDrawer(),
    };
    buttons.push(stampsBtn);
    y += 42;
    buttons.push({ id: 'undo', tip: 'Undo (Ctrl+Z)', text: 'Undo', x: 50, y: y + 6, w: 72, h: 28, onClick: () => undo() });
    y += 36;
    statusY = Math.min(y, PAPER.y + PAPER.h - 30);

    // The drawer: the 9 stamps, then Clear tucked at the bottom behind a confirm.
    const cell = 48;
    const pad = 8;
    const boxW = cell * 3 + pad * 2;
    const boxH = cell * 3 + pad * 3 + 28;
    const bx = PAPER.x + 4;
    const by = Math.max(PAPER.y + 4, Math.min(stampsBtn.y - 16, PAPER.y + PAPER.h - boxH - 4));
    drawerBox = { x: bx, y: by, w: boxW, h: boxH };
    STAMP_KINDS.forEach((kind, i) => {
      drawerButtons.push({
        id: 'stamp_' + kind, tip: STAMP_NAMES[kind], w: cell - 4, h: cell - 4,
        x: bx + pad + (i % 3) * cell + cell / 2, y: by + pad + Math.floor(i / 3) * cell + cell / 2,
        icon: (gg, x, yy) => drawStamp(gg, kind, x, yy + 1, 0x3a3128, 0.7, seedFrom(kind)),
        active: () => tool === 'stamp' && stampKind === kind,
        onClick: () => { setTool('stamp', kind); closeDrawer(); },
      });
    });
    drawerButtons.push({
      id: 'clear', tip: 'Clear all: wipes every mark on your sketch', text: 'Clear sketch', w: cell * 3, h: 28,
      x: bx + boxW / 2, y: by + pad * 2 + cell * 3 + 14, onClick: () => clickClear(),
    });
  })();

  const tipOf = (b) => (typeof b.tip === 'function' ? b.tip() : b.tip);
  const inBox = (x, y, b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2;
  const hitButton = (x, y) => (drawerOpen && drawerButtons.find((b) => inBox(x, y, b))) || buttons.find((b) => inBox(x, y, b));
  const inDrawer = (x, y) => drawerOpen && x >= drawerBox.x && x <= drawerBox.x + drawerBox.w && y >= drawerBox.y && y <= drawerBox.y + drawerBox.h;
  const hitTab = (x, y) => TABS.find((t) => x >= t.x && x <= t.x + t.w && y >= PAPER.y - 32 && y <= PAPER.y);
  const hitClose = (x, y) => Math.hypot(x - CLOSE.x, y - CLOSE.y) <= CLOSE.r;
  const hitNoteBtn = (x, y) =>
    tab === 'sketch' && x >= NOTE_BTN.x && x <= NOTE_BTN.x + NOTE_BTN.w && y >= PAPER.y - 28 && y <= PAPER.y;

  // ------------------------------------------------------------ sizing

  function fit() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    wrap.style.width = cssW + 'px';
    wrap.style.height = cssH + 'px';
    layer.style.transform = `scale(${cssW / W})`;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      mapCache.clear();
    }
    k = bw / W;
  }

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * W) / (r.width || 1),
      y: ((e.clientY - r.top) * H) / (r.height || 1),
    };
  }

  // ------------------------------------------------------------ drawing

  function requestRender() {
    if (rafId || !open) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  function buildMapCache(tabDef, world) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const cc = c.getContext('2d');
    cc.setTransform(k, 0, 0, k, 0, 0);
    const fake = makeFakeScene(cc);
    buildOldMap(fake.scene, fake.container, PAPER, tabDef.def, world);
    fake.flushTexts();
    mapCache.set(tabDef.id, c);
    return c;
  }

  // Paints a pre-rendered printed map over the whole canvas.
  function blitMap(id, def, world) {
    const cache = mapCache.get(id) || buildMapCache({ id, def }, world);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
    ctx.restore();
  }

  // The sheet under a sketch: the printed map it is drawn on, else blank paper.
  function paintSheet(sketch) {
    const base = sketchBase(sketch);
    if (base) blitMap('base:' + base.def.id, base.def, base.world);
    else paintSketchPaper(g, ctx);
  }

  function drawStroke(stroke) {
    paintStroke(g, ctx, stroke);
  }

  const labelFont = () => `${LABEL_SIZE}px ${HAND}`;

  function labelBounds(lbl) {
    ctx.save();
    ctx.font = labelFont();
    const w = ctx.measureText(lbl.text).width;
    ctx.restore();
    const h = LABEL_SIZE * 1.35;
    return { x: lbl.x, y: lbl.y - h / 2, right: lbl.x + w, bottom: lbl.y + h / 2 };
  }

  // Graphite look on top of a pencil stroke: a thin grainy line (the paper
  // showing through) and rough dots where the pencil touched and lifted.
  // Rendering only; the stroke data is untouched. Blue, red and dashed roads keep their plain look.
  function graphite(s) {
    if (!isGraphite(s) || s.dash || !s.points || s.points.length < 2) return;
    const w = s.width || THIN_W;
    const seed = strokeSeed(s);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([1.4, 2.4]);
    ctx.lineWidth = Math.max(0.8, w * 0.5);
    ctx.strokeStyle = 'rgba(243,238,224,0.4)';
    ctx.beginPath();
    grainPoints(s.points, seed).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(50,50,50,0.28)';
    ctx.beginPath();
    grainPoints(s.points, seed + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,70,70,0.5)';
    for (const d of endDots(s)) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function addCrumbs(x, y) {
    if (!FX) return;
    crumbs = crumbs.concat(spawnCrumbs(x, y, Math.random, 4));
    if (!crumbRaf) {
      crumbAt = performance.now();
      crumbRaf = requestAnimationFrame(crumbLoop);
    }
  }

  function crumbLoop(now) {
    crumbRaf = 0;
    if (!open) { crumbs = []; return; }
    const dt = Math.min(0.05, (now - crumbAt) / 1000);
    crumbAt = now;
    crumbs = stepCrumbs(crumbs, dt);
    requestRender();
    if (crumbs.length) crumbRaf = requestAnimationFrame(crumbLoop);
  }

  function drawSketch() {
    paintSheet(state.sketch);
    drawSketchItems(g, ctx, state.sketch);
    if (FX) for (const s of state.sketch.strokes) graphite(s);
    if (current) {
      drawStroke(current);
      if (FX) graphite(current);
    }
    if (typing) {
      drawText(ctx, typing.x, typing.y, typing.text + (typing.caret ? '|' : ' '),
        { fontFamily: HAND, fontSize: LABEL_SIZE + 'px', color: rgba(typing.color) }, [0, 0.5]);
    }
    for (const c of crumbs) {
      g.fillStyle(0x7a6f60, crumbAlpha(c));
      g.fillRect(c.x - c.size / 2, c.y - c.size / 2, c.size, c.size);
    }
    // Eraser shows a small ring under the pointer.
    if (tool === 'eraser' && hover && inPaper(hover.x, hover.y)) {
      g.lineStyle(1.5, 0xc0392b, 0.7);
      g.strokeCircle(hover.x, hover.y, 8);
    }
  }

  function drawTabs() {
    for (const d of TABS) {
      const active = d.id === tab;
      g.fillStyle(active ? d.fill : 0x8c7f6a, 1);
      const top = PAPER.y - (active ? 32 : 28);
      g.fillRoundedRect(d.x, top, d.w, PAPER.y - top + (active ? 2 : 0), { tl: 8, tr: 8, bl: 0, br: 0 });
      drawText(ctx, d.x + d.w / 2, PAPER.y - 15, d.text,
        { fontFamily: d.font, fontSize: '16px', color: '#3a3128' }, [0.5, 0.5], 0, active ? 1 : 0.75);
    }
  }

  function drawNoteButton() {
    if (tab !== 'sketch') return;
    const on = notebookOpen;
    g.fillStyle(on ? 0xfbf6e4 : 0x8c7f6a, 1);
    const top = PAPER.y - 28;
    g.fillRoundedRect(NOTE_BTN.x, top, NOTE_BTN.w, 28 + (on ? 2 : 0), { tl: 8, tr: 8, bl: 0, br: 0 });
    drawText(ctx, NOTE_BTN.x + NOTE_BTN.w / 2, PAPER.y - 13, on ? 'Notebook  \u2715' : 'Notebook',
      { fontFamily: HAND, fontSize: '15px', color: '#3a3128' }, [0.5, 0.5], 0, on ? 1 : 0.8);
  }

  function drawCloseButton() {
    const { x, y } = CLOSE;
    g.fillStyle(0xf3eee0, 1);
    g.fillCircle(x, y, 15);
    g.lineStyle(3, 0x3a3128, 1);
    g.lineBetween(x - 6, y - 6, x + 6, y + 6);
    g.lineBetween(x + 6, y - 6, x - 6, y + 6);
  }

  function statusText() {
    if (hoverTip) return hoverTip;
    if (tool === 'pencil') {
      const kind = [penThick && 'thick', penDashed && 'dashed'].filter(Boolean).join(' ');
      return kind ? `Drag to draw (${kind})` : 'Drag to draw';
    }
    if (tool === 'eraser') return 'Click a mark to erase it';
    if (tool === 'text') return 'Click, type, Enter';
    return 'Click to place: ' + STAMP_NAMES[stampKind];
  }

  function drawButton(b) {
    const on = b.active ? b.active() : false;
    const x0 = b.x - b.w / 2;
    const y0 = b.y - b.h / 2;
    g.fillStyle(0xf3eee0, 1);
    g.fillRect(x0, y0, b.w, b.h);
    g.lineStyle(on ? 3 : 1, on ? 0xe0a030 : 0x8c7f6a, 1);
    g.strokeRect(x0, y0, b.w, b.h);
    if (b.icon) b.icon(g, b.x, b.y);
    if (b.text) {
      let text = b.text;
      let color = '#3a3128';
      if (b.id === 'clear' && clearArmed) { text = 'Sure? Click again'; color = '#c0392b'; }
      drawText(ctx, b.x, b.y, text, {
        fontFamily: b.id === 'text' ? HAND : SERIF, fontSize: b.id === 'text' ? '16px' : b.id === 'stamps' || b.id === 'clear' ? '13px' : '11px', color,
      }, [0.5, 0.5]);
    }
  }

  function drawToolbar() {
    g.fillStyle(0x3b3027, 0.95);
    g.fillRoundedRect(8, PAPER.y, 84, PAPER.h, 8);
    for (const b of buttons) drawButton(b);
    ctx.save();
    ctx.font = `10px ${SERIF}`;
    const lines = wrapText(ctx, statusText(), 76);
    ctx.restore();
    lines.forEach((line, i) => {
      drawText(ctx, 50, statusY + i * 12, line, { fontFamily: SERIF, fontSize: '10px', color: '#d8ccb4' }, [0.5, 0]);
    });
    if (drawerOpen) {
      g.fillStyle(0x3b3027, 0.97);
      g.fillRoundedRect(drawerBox.x, drawerBox.y, drawerBox.w, drawerBox.h, 8);
      for (const b of drawerButtons) drawButton(b);
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);

    // Paper shadow.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(PAPER.x + 6, PAPER.y + 8, PAPER.w, PAPER.h);

    if (tab === 'sketch') {
      drawSketch();
    } else if (tab === 'help') {
      // Plain paper under the DOM help panel.
      paintSketchPaper(g, ctx);
    } else if (tab.startsWith('old:')) {
      // An earlier mission's map: look only.
      const sk = TABS.find((t) => t.id === tab).sketch;
      paintSheet(sk);
      drawSketchItems(g, ctx, sk);
    } else {
      const tabDef = TABS.find((t) => t.id === tab);
      blitMap(tab, tabDef.def);
    }
    drawTabs();
    drawNoteButton();
    drawCloseButton();
    if (tab === 'sketch') drawToolbar();
  }

  // ------------------------------------------------------------ actions

  function showTab(id) {
    if (typing) commitTyping();
    drawerOpen = false;
    tab = id;
    lastTab = id;
    hoverTip = null;
    renderNotes(true);
    renderHelpPanel();
    requestRender();
  }

  // Fills the help panel each time the tab shows (the tips box reads its saved state).
  function renderHelpPanel() {
    const show = tab === 'help';
    helpPanel.classList.toggle('map-help-open', show);
    if (!show) return;
    helpPanel.textContent = '';
    renderHelp(helpPanel, '3d');
    helpPanel.scrollTop = 0;
  }

  function setTool(t, kind = null) {
    if (typing) commitTyping();
    tool = t;
    stampKind = kind;
    requestRender();
  }

  // The road button: thin, dashed (dirt), thick (main), round and round.
  function cycleRoad() {
    const f = roadFlags(nextRoad(roadOf(penDashed, penThick)));
    penDashed = f.dashed;
    penThick = f.thick;
    // Line styles belong to the pencil.
    if (tool !== 'pencil') setTool('pencil');
    requestRender();
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else { drawerOpen = true; requestRender(); }
  }

  function closeDrawer() {
    drawerOpen = false;
    clearArmed = false;
    clearTimeout(clearTimer);
    requestRender();
  }

  function newStroke(x, y) {
    const s = { points: [[x, y]], color: ink.color, width: penThick ? THICK_W : THIN_W };
    if (penDashed) s.dash = true;
    return s;
  }

  // ------------------------------------------------------------ notebook

  function noteGroups() {
    // Group by person, people ordered by when we last heard from them, so
    // the newest notes end up at the bottom.
    const groups = new Map();
    state.notebook.forEach((n, i) => {
      let who = n.name;
      if (!who) {
        const m = MISSIONS.find((q) => q.id === n.missionId);
        who = m ? `Brief: ${m.title}` : 'Notes';
      }
      if (!groups.has(who)) groups.set(who, { who, entries: [], last: i });
      const gr = groups.get(who);
      gr.entries.push(n);
      gr.last = i;
    });
    return [...groups.values()].sort((a, b) => a.last - b.last);
  }

  let notesCount = -1;
  function renderNotes(force = false) {
    const show = notebookOpen && tab === 'sketch';
    notes.classList.toggle('map-notes-open', show);
    if (!show) return;
    if (!force && notesCount === state.notebook.length) return;
    notesCount = state.notebook.length;
    notesHead.innerHTML = '';
    notesHead.append('Notebook');
    const small = document.createElement('small');
    small.textContent = 'what people told you';
    notesHead.appendChild(small);
    notesBody.innerHTML = '';
    const groups = noteGroups();
    if (!groups.length) {
      const e = document.createElement('div');
      e.className = 'map-notes-empty';
      e.textContent = 'Nothing yet. Talk to people (E).';
      notesBody.appendChild(e);
    }
    for (const gr of groups) {
      const h = document.createElement('div');
      h.className = 'map-notes-who';
      h.textContent = gr.who;
      notesBody.appendChild(h);
      let lastTopic = null;
      for (const n of gr.entries) {
        const e = document.createElement('div');
        e.className = 'map-notes-entry';
        if (n.topicId && n.topicId !== lastTopic && !n.brief) {
          const t = document.createElement('div');
          t.className = 'map-notes-topic';
          t.textContent = 'about ' + topicLabel(n.topicId);
          e.appendChild(t);
        }
        lastTopic = n.brief ? null : n.topicId;
        e.appendChild(document.createTextNode(n.text));
        notesBody.appendChild(e);
      }
    }
    notesBody.scrollTop = notesBody.scrollHeight;
  }

  function toggleNotebook() {
    notebookOpen = !notebookOpen;
    renderNotes(true);
    requestRender();
  }

  function setInk(c) {
    ink = c;
    // Picking an ink from the eraser switches back to the pencil.
    if (tool === 'eraser') tool = 'pencil';
    requestRender();
  }

  function clickClear() {
    clearTimeout(clearTimer);
    if (!clearArmed) {
      clearArmed = true;
      clearTimer = setTimeout(() => { clearArmed = false; requestRender(); }, 2500);
      requestRender();
      return;
    }
    clearArmed = false;
    const sk = state.sketch;
    if (sk.strokes.length + sk.stamps.length + sk.labels.length > 0) {
      pushHistory({ type: 'clear', snapshot: { strokes: sk.strokes, stamps: sk.stamps, labels: sk.labels } });
      sk.strokes = [];
      sk.stamps = [];
      sk.labels = [];
    }
    closeDrawer();
  }

  function pushHistory(action) {
    history.push(action);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function undo() {
    if (typing) return;
    const a = history.pop();
    if (!a) return;
    const sk = state.sketch;
    if (a.type === 'add') {
      const i = sk[a.list].indexOf(a.item);
      if (i >= 0) sk[a.list].splice(i, 1);
    } else if (a.type === 'remove') {
      sk[a.list].splice(Math.min(a.index, sk[a.list].length), 0, a.item);
    } else if (a.type === 'clear') {
      sk.strokes = a.snapshot.strokes;
      sk.stamps = a.snapshot.stamps;
      sk.labels = a.snapshot.labels;
    }
    requestRender();
  }

  // Removes the nearest stroke, stamp or label under the pointer.
  function eraseAt(x, y) {
    const sk = state.sketch;
    let best = null;
    const consider = (list, index, d) => {
      if (!best || d < best.d) best = { list, index, d };
    };
    sk.labels.forEach((lbl, i) => {
      const b = labelBounds(lbl);
      if (x >= b.x - 4 && x <= b.right + 4 && y >= b.y - 4 && y <= b.bottom + 4) consider('labels', i, 0);
    });
    sk.stamps.forEach((st, i) => {
      const d = Math.hypot(st.x - x, st.y - y);
      if (d < 14 * STAMP_SCALE) consider('stamps', i, d);
    });
    sk.strokes.forEach((st, i) => {
      const p = st.points;
      for (let j = 0; j < p.length - 1; j++) {
        const d = distToSegment(x, y, p[j][0], p[j][1], p[j + 1][0], p[j + 1][1]);
        if (d < 7) consider('strokes', i, d);
      }
    });
    if (!best) return;
    const [item] = sk[best.list].splice(best.index, 1);
    pushHistory({ type: 'remove', list: best.list, item, index: best.index });
    addCrumbs(x, y);
    requestRender();
  }

  // ------------------------------------------------------------ text labels

  function startTyping(x, y) {
    typing = { x, y, text: '', caret: true, color: ink.color };
    clearInterval(caretTimer);
    caretTimer = setInterval(() => {
      if (!typing) return;
      typing.caret = !typing.caret;
      requestRender();
    }, 450);
    requestRender();
  }

  function endTyping() {
    typing = null;
    clearInterval(caretTimer);
    caretTimer = null;
    requestRender();
  }

  function commitTyping() {
    const t = typing;
    endTyping();
    const text = t ? t.text.trim() : '';
    if (!text) return;
    const lbl = { text, x: t.x, y: t.y, color: t.color };
    state.sketch.labels.push(lbl);
    pushHistory({ type: 'add', list: 'labels', item: lbl });
  }

  function onTypingKey(e) {
    const key = e.key;
    if (key === 'Enter') {
      e.preventDefault();
      commitTyping();
    } else if (key === 'Escape') {
      e.preventDefault();
      endTyping();
    } else if (key === 'Backspace') {
      e.preventDefault();
      typing.text = typing.text.slice(0, -1);
    } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (typing.text.length < MAX_LABEL) typing.text += key;
    }
    requestRender();
  }

  // ------------------------------------------------------------ input

  // Capture phase on window: runs before anything else and keeps every key
  // press away from the game while the map is open. keyup is let through so
  // the game never ends up with a key stuck down.
  function onKey(e) {
    if (!open) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (typing) {
      onTypingKey(e);
      return;
    }
    const key = e.key;
    if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      undo();
      return;
    }
    // Ignore the same key press (or its auto repeat) that opened the map.
    if (e.repeat || performance.now() - openedAt < 200) return;
    if (key === 'Escape' && drawerOpen) {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (key === 'Escape' || key === 'm' || key === 'M') {
      e.preventDefault();
      close();
    }
  }

  function onPointerDown(e) {
    if (!open || e.button > 0) return;
    e.preventDefault();
    const { x, y } = toLogical(e);
    hover = { x, y };

    const t = hitTab(x, y);
    if (t) { showTab(t.id); return; }
    if (hitClose(x, y)) { close(); return; }
    if (hitNoteBtn(x, y)) { toggleNotebook(); return; }
    if (tab !== 'sketch') return;
    const b = hitButton(x, y);
    if (b) { b.onClick(); return; }
    if (inDrawer(x, y)) return;
    if (drawerOpen) closeDrawer();

    // Clicking anywhere while typing places the label first.
    if (typing) { commitTyping(); return; }
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!inPaper(rx, ry)) return;

    pointerDown = true;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (tool === 'pencil') {
      current = newStroke(rx, ry);
      if (FX) { scratchStart(); lastMove = { x, y, t: performance.now() }; }
    } else if (tool === 'eraser') {
      eraseAt(rx, ry);
    } else if (tool === 'text') {
      startTyping(rx, ry);
    } else if (tool === 'stamp') {
      const stamp = { kind: stampKind, x: rx, y: ry, color: ink.color };
      state.sketch.stamps.push(stamp);
      pushHistory({ type: 'add', list: 'stamps', item: stamp });
    }
    requestRender();
  }

  function onPointerMove(e) {
    if (!open) return;
    const { x, y } = toLogical(e);
    hover = { x, y };

    // Toolbar hint and cursor.
    const b = tab === 'sketch' ? hitButton(x, y) : null;
    const tip = b ? tipOf(b) : hitNoteBtn(x, y) ? 'Notebook: what people told you' : null;
    if (tip !== hoverTip) hoverTip = tip;
    let cursor = 'default';
    if (b || hitTab(x, y) || hitClose(x, y) || hitNoteBtn(x, y)) cursor = 'pointer';
    else if (tab === 'sketch' && inPaper(x, y)) cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'none' : FX && tool === 'pencil' ? 'pencil' : 'crosshair';
    // 'pencil' is the pencil-tip cursor from the style sheet.
    canvas.classList.toggle('map-cursor-pencil', cursor === 'pencil');
    canvas.style.cursor = cursor === 'pencil' ? '' : cursor;

    if (tab === 'sketch') {
      const cx = clamp(Math.round(x), PAPER.x, PAPER.x + PAPER.w);
      const cy = clamp(Math.round(y), PAPER.y, PAPER.y + PAPER.h);
      if (current && pointerDown) {
        const pts = current.points;
        const [lx, ly] = pts[pts.length - 1];
        if (Math.hypot(cx - lx, cy - ly) >= 2.5) pts.push([cx, cy]);
        if (FX && lastMove) {
          const now = performance.now();
          scratchMove(Math.hypot(x - lastMove.x, y - lastMove.y) / Math.max(1, now - lastMove.t));
          lastMove = { x, y, t: now };
        }
      }
      if (tool === 'eraser' && pointerDown && inPaper(x, y)) eraseAt(x, y);
    }
    requestRender();
  }

  function onPointerUp(e) {
    pointerDown = false;
    lastMove = null;
    scratchStop();
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!current) return;
    const stroke = current;
    current = null;
    if (stroke.points.length === 1) {
      // A single click leaves a dot.
      const [x, y] = stroke.points[0];
      stroke.points.push([x + 0.5, y + 0.5]);
    } else {
      stroke.points = smoothPoints(stroke.points, 2);
    }
    state.sketch.strokes.push(stroke);
    pushHistory({ type: 'add', list: 'strokes', item: stroke });
    requestRender();
  }

  function onPointerLeave() {
    if (!pointerDown) hover = null;
    hoverTip = null;
    requestRender();
  }

  function onResize() {
    fit();
    requestRender();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Clicks on the dim backdrop must not reach anything below.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ------------------------------------------------------------ public API

  function openMap() {
    if (open) return;
    open = true;
    openedAt = performance.now();
    buildTabs();
    // A fresh sketch page (new mission) gets a fresh undo stack and opens on
    // the player's own sketch, so drawing is clearly expected (#87).
    if (state.sketchEpoch !== historyEpoch) {
      history.length = 0;
      historyEpoch = state.sketchEpoch;
      lastTab = 'sketch';
    }
    tab = TABS.some((t) => t.id === lastTab) ? lastTab : 'sketch';
    tool = 'pencil';
    stampKind = null;
    ink = INKS[0];
    current = null;
    typing = null;
    clearArmed = false;
    hover = null;
    hoverTip = null;
    pointerDown = false;
    drawerOpen = false;
    crumbs = [];
    clearTimeout(closeTimer);
    el.classList.remove('map-closing', 'map-fold', 'map-fade', 'map-nofx');
    const mode = unfoldMode({ fx: FX, reduced: reducedMotion() });
    el.classList.add(mode === 'none' ? 'map-nofx' : 'map-' + mode);
    el.classList.add('map-open');
    fit();
    renderNotes(true);
    renderHelpPanel();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keypress', onKey, true);
    window.addEventListener('resize', onResize);
    render();
    if (mode === 'none') {
      el.classList.add('map-in');
    } else {
      void el.offsetWidth; // let the folded look paint once, then unfold
      el.classList.add('map-in');
      playUnfold(1);
    }
    if (FX) startDamp();
  }

  // ------------------------------------------------------------ rain spots

  // Spots keep drying while the map is shut (they catch up here), and grow
  // while it is open in rain.
  function startDamp() {
    const now = performance.now();
    if (dampAt) dampSpots = stepDamp(dampSpots, (now - dampAt) / 1000, { rain: 0, open: false, rng: Math.random, paper: PAPER });
    dampAt = now;
    renderDamp();
    clearInterval(dampTimer);
    dampTimer = setInterval(tickDamp, 250);
  }

  function tickDamp() {
    const now = performance.now();
    dampSpots = stepDamp(dampSpots, Math.min(1, (now - dampAt) / 1000), { rain: rain(), open: true, rng: Math.random, paper: PAPER });
    dampAt = now;
    renderDamp();
  }

  function renderDamp() {
    while (damp.children.length < dampSpots.length) damp.appendChild(document.createElement('i'));
    while (damp.children.length > dampSpots.length) damp.lastChild.remove();
    dampSpots.forEach((s, i) => {
      const d = damp.children[i];
      d.style.left = s.x - PAPER.x - s.r + 'px';
      d.style.top = s.y - PAPER.y - s.r + 'px';
      d.style.width = d.style.height = s.r * 2 + 'px';
      d.style.opacity = s.a.toFixed(2);
    });
  }

  function close() {
    if (!open) return;
    if (typing) commitTyping();
    if (current) onPointerUp({ pointerId: -1 });
    clearInterval(caretTimer);
    caretTimer = null;
    clearTimeout(clearTimer);
    clearArmed = false;
    open = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    scratchStop();
    drawerOpen = false;
    clearInterval(dampTimer);
    dampAt = performance.now();
    el.classList.remove('map-in');
    if (el.classList.contains('map-nofx')) {
      el.classList.remove('map-open');
    } else {
      // Folds away, then hides. Clicks go nowhere meanwhile.
      el.classList.add('map-closing');
      playUnfold(1.5);
      const secs = el.classList.contains('map-fold') ? FOLD_SECONDS : FADE_SECONDS;
      closeTimer = setTimeout(() => el.classList.remove('map-open', 'map-closing'), secs * 1000 + 60);
    }
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keypress', onKey, true);
    window.removeEventListener('resize', onResize);
    if (onClose) onClose();
  }

  return {
    open: openMap,
    close,
    isOpen: () => open,
    tabs: () => TABS.map((t) => ({ id: t.id, x: t.x, w: t.w, y: PAPER.y - 15 })), // for tools/shots-controls.mjs
  };
}
