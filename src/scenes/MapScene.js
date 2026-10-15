// Map overlay: a sheet of paper on the dashboard with tabs.
//  - "My sketch": the player draws their own map from what locals said.
//  - One tab per printed map the current mission gives (printedMapsFor),
//    e.g. the 1987 county map or Mrs Hartley's sketch, with their lies.
// Core rule: nothing here ever shows the player's position.

import Phaser from 'phaser';
import { state } from '../state.js';
import { buildOldMap } from '../map/oldMap.js';
import { printedMapsFor } from '../game/printedMaps.js';
import {
  drawStamp, wobbly, makeRng, seedFrom, smoothPoints, distToSegment,
  STAMP_KINDS, STAMP_NAMES, drawSketchStroke, STROKE_WIDTH, STROKE_WIDTH_THICK,
} from '../map/draw.js';
import { notebookGroups } from '../hud/notebook.js';

const W = 960;
const H = 640;
const PAPER = { x: 100, y: 52, w: 840, h: 576 };
const STAMP_SCALE = 1.3; // stamp size on the sketch
const SKETCH_PAPER = 0xf3eee0;
const OLD_PAPER = 0xe6d6ab;
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

const INKS = [
  { id: 'grey', color: 0x555555, name: 'Pencil' },
  { id: 'blue', color: 0x2f62b3, name: 'Blue (water)' },
  { id: 'red', color: 0xc0392b, name: 'Red (notes)' },
];

// Survives between openings (scene objects do not).
let lastTab = 'sketch';
let notebookOpen = false; // notebook panel shown on the sketch tab
const penStyle = { dash: false, thick: false }; // pencil line style toggles
const history = []; // undo stack of sketch actions
let historyEpoch = 0; // state.sketchEpoch the undo stack belongs to
const MAX_HISTORY = 200;

const toCss = (c) => '#' + c.toString(16).padStart(6, '0');

export default class MapScene extends Phaser.Scene {
  constructor() {
    super('Map');
  }

  create() {
    this.scene.bringToTop(); // draw above the HUD
    this.openedAt = this.time.now;
    this.closing = false;
    this.tool = 'pencil';
    this.stampKind = null;
    this.ink = INKS[0];
    this.current = null; // stroke being drawn
    this.typing = null; // { x, y, text } while placing a label
    this.labelTexts = [];
    this.clearArmed = false;

    // Dim the paused game behind, like looking down at the dashboard.
    const backdrop = this.add.rectangle(0, 0, W, H, 0x1d1712, 0.82).setOrigin(0);
    backdrop.setInteractive(); // swallow clicks so nothing below reacts

    // Paper shadow.
    this.add.rectangle(PAPER.x + 6, PAPER.y + 8, PAPER.w, PAPER.h, 0x000000, 0.35).setOrigin(0);

    this.buildSketchLayer();
    // A fresh sketch page (new mission) gets a fresh undo stack.
    if (state.sketchEpoch !== historyEpoch) {
      history.length = 0;
      historyEpoch = state.sketchEpoch;
    }

    // One layer per printed map this mission has.
    this.printed = printedMapsFor(state);
    this.mapLayers = {};
    for (const def of this.printed) {
      const layer = this.add.container(0, 0);
      buildOldMap(this, layer, PAPER, def);
      this.mapLayers['map:' + def.id] = layer;
    }

    this.buildTabs();
    this.buildCloseButton();
    this.buildToolbar();
    this.buildNotebook();

    this.setupInput();
    this.redrawSketch();
    this.showTab(lastTab);

    this.events.once('shutdown', () => {
      this.input.keyboard.off('keydown', this.onKeyDown, this);
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.off('pointerupoutside', this.onPointerUp, this);
      this.input.off('wheel', this.onWheel, this);
    });
  }

  // ---------------------------------------------------------------- layout

  buildSketchLayer() {
    this.sketchLayer = this.add.container(0, 0);
    const g = this.add.graphics();
    this.sketchLayer.add(g);

    // Plain paper with a faint grid.
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
    this.sketchLayer.add(this.add.text(nx - 22, ny + 4, 'N', {
      fontFamily: HAND, fontSize: '20px', color: '#555555',
    }).setOrigin(0.5));

    this.sketchLayer.add(this.add.text(PAPER.x + PAPER.w / 2, PAPER.y + PAPER.h - 14,
      'Draw what you were told. This sheet never shows where you are.', {
        fontFamily: HAND, fontSize: '12px', color: '#9a9184',
      }).setOrigin(0.5));

    // Player drawings live above the paper.
    this.sketchG = this.add.graphics();
    this.liveG = this.add.graphics();
    this.cursorG = this.add.graphics();
    this.sketchLayer.add([this.sketchG, this.liveG, this.cursorG]);
    this.labelLayer = this.add.container(0, 0);
    this.sketchLayer.add(this.labelLayer);
  }

  buildTabs() {
    this.tabs = {};
    const defs = [
      { id: 'sketch', text: 'My sketch', x: PAPER.x + 20, w: 140, fill: SKETCH_PAPER, font: HAND },
      ...this.printed.map((def, i) => ({
        id: 'map:' + def.id,
        text: def.tabLabel || def.title,
        x: PAPER.x + 168 + i * 214,
        w: 206,
        fill: def.style === 'hand' ? 0xf6f0dc : OLD_PAPER,
        font: def.style === 'hand' ? HAND : 'Georgia, serif',
      })),
    ];
    for (const d of defs) {
      const g = this.add.graphics();
      const hit = this.add.rectangle(d.x, PAPER.y - 32, d.w, 32, 0x000000, 0).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.isMapUI = true;
      hit.on('pointerdown', () => this.showTab(d.id));
      const label = this.add.text(d.x + d.w / 2, PAPER.y - 15, d.text, {
        fontFamily: d.font, fontSize: '16px', color: '#3a3128',
      }).setOrigin(0.5);
      this.tabs[d.id] = { g, label, def: d };
    }
  }

  drawTabs() {
    for (const [id, t] of Object.entries(this.tabs)) {
      const d = t.def;
      const active = id === this.tab;
      t.g.clear();
      t.g.fillStyle(active ? d.fill : 0x8c7f6a, 1);
      // Active tab joins the paper; inactive one sits a little lower and darker.
      const top = PAPER.y - (active ? 32 : 28);
      t.g.fillRoundedRect(d.x, top, d.w, PAPER.y - top + (active ? 2 : 0), { tl: 8, tr: 8, bl: 0, br: 0 });
      t.label.setAlpha(active ? 1 : 0.75);
    }
  }

  buildCloseButton() {
    const x = W - 26;
    const y = 26;
    const g = this.add.graphics();
    g.fillStyle(0xf3eee0, 1);
    g.fillCircle(x, y, 15);
    g.lineStyle(3, 0x3a3128, 1);
    g.lineBetween(x - 6, y - 6, x + 6, y + 6);
    g.lineBetween(x + 6, y - 6, x - 6, y + 6);
    const hit = this.add.circle(x, y, 16, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.isMapUI = true;
    hit.on('pointerdown', () => this.closeMap());
  }

  buildToolbar() {
    this.toolbar = this.add.container(0, 0);
    const panel = this.add.graphics();
    panel.fillStyle(0x3b3027, 0.95);
    panel.fillRoundedRect(8, PAPER.y, 84, PAPER.h, 8);
    this.toolbar.add(panel);

    this.buttons = [];
    const colX = [31, 69];
    const size = 34;
    let y = PAPER.y + 12;

    const header = (text) => {
      this.toolbar.add(this.add.text(50, y, text, {
        fontFamily: 'Georgia, serif', fontSize: '11px', color: '#d8ccb4',
      }).setOrigin(0.5));
      y += 22;
    };
    // Lays out buttons in a grid of two columns.
    const grid = (items) => {
      items.forEach((item, i) => {
        const bx = colX[i % 2];
        const by = y + Math.floor(i / 2) * (size + 4);
        this.makeButton(bx, by, size, size, item);
      });
      y += Math.ceil(items.length / 2) * (size + 4) + 6;
    };

    header('Tools');
    grid([
      { id: 'pencil', tip: 'Pencil', icon: (g, x, yy) => this.iconPencil(g, x, yy), onClick: () => this.setTool('pencil') },
      { id: 'eraser', tip: 'Eraser', icon: (g, x, yy) => this.iconEraser(g, x, yy), onClick: () => this.setTool('eraser') },
      { id: 'text', tip: 'Text label', text: 'Aa', onClick: () => this.setTool('text') },
    ]);

    header('Ink');
    grid(INKS.map((ink) => ({
      id: 'ink_' + ink.id,
      tip: ink.name,
      icon: (g, x, yy) => { g.fillStyle(ink.color, 1); g.fillCircle(x, yy, 9); },
      onClick: () => this.setInk(ink),
    })));

    header('Line');
    grid([
      { id: 'line_dash', tip: 'Dashed line (dirt road)', icon: (g, x, yy) => this.iconDashed(g, x, yy), onClick: () => this.toggleStyle('dash') },
      { id: 'line_thick', tip: 'Thick line (main road)', icon: (g, x, yy) => this.iconThick(g, x, yy), onClick: () => this.toggleStyle('thick') },
    ]);

    header('Stamps');
    grid(STAMP_KINDS.map((kind) => ({
      id: 'stamp_' + kind,
      tip: STAMP_NAMES[kind],
      icon: (g, x, yy) => drawStamp(g, kind, x, yy + 1, 0x3a3128, 0.7, seedFrom(kind)),
      onClick: () => this.setTool('stamp', kind),
    })));

    y += 2;
    this.makeButton(colX[0], y, 36, 26, { id: 'undo', tip: 'Undo (Ctrl+Z)', text: 'Undo', small: true, onClick: () => this.undo() });
    this.clearBtn = this.makeButton(colX[1], y, 36, 26, { id: 'clear', tip: 'Clear all', text: 'Clear', small: true, onClick: () => this.clickClear() });
    y += 24;

    // Shows the tool name, or the hint for whatever the pointer is over.
    this.statusText = this.add.text(50, Math.min(y + 8, PAPER.y + PAPER.h - 30), '', {
      fontFamily: 'Georgia, serif', fontSize: '10px', color: '#d8ccb4', align: 'center', wordWrap: { width: 76 },
    }).setOrigin(0.5, 0);
    this.toolbar.add(this.statusText);

    this.refreshToolbar();
  }

  // ---------------------------------------------------------------- notebook

  // A notebook page clipped over the right part of the sketch: everything
  // locals have said, grouped by person, newest last. Scroll with the wheel.
  buildNotebook() {
    const nb = { x: PAPER.x + PAPER.w - 300, y: PAPER.y + 6, w: 292, h: PAPER.h - 12 };
    this.nbRect = nb;
    this.nbView = { x: nb.x + 14, y: nb.y + 42, w: nb.w - 30, h: nb.h - 52 };
    this.nbScroll = 0;

    // Flap above the paper that opens and closes the notebook.
    const fx = PAPER.x + PAPER.w - 160;
    const fw = 130;
    this.nbFlapG = this.add.graphics();
    this.nbFlapHit = this.add.rectangle(fx, PAPER.y - 30, fw, 30, 0x000000, 0).setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.nbFlapHit.isMapUI = true;
    this.nbFlapHit.on('pointerdown', () => {
      notebookOpen = !notebookOpen;
      this.refreshNotebook();
    });
    this.nbFlapTxt = this.add.text(fx + fw / 2, PAPER.y - 14, '', {
      fontFamily: 'Georgia, serif', fontSize: '14px', color: '#3a3128',
    }).setOrigin(0.5);
    this.nbFlap = { x: fx, w: fw };

    this.nbLayer = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillRect(nb.x - 5, nb.y + 3, nb.w + 5, nb.h);
    g.fillStyle(0xfbf6e4, 0.97).fillRect(nb.x, nb.y, nb.w, nb.h);
    // Ruled lines and a red margin, like a pocket notebook.
    g.lineStyle(1, 0x7fa3c8, 0.25);
    for (let y = nb.y + 40; y < nb.y + nb.h - 4; y += 18) g.lineBetween(nb.x + 4, y, nb.x + nb.w - 4, y);
    g.lineStyle(1, 0xc0392b, 0.35).lineBetween(nb.x + 10, nb.y, nb.x + 10, nb.y + nb.h);
    g.lineStyle(1, 0x8c7f6a, 0.6).strokeRect(nb.x, nb.y, nb.w, nb.h);
    const hit = this.add.rectangle(nb.x - 5, nb.y, nb.w + 5, nb.h, 0x000000, 0).setOrigin(0).setInteractive();
    hit.isMapUI = true; // clicks on the notebook do not draw
    this.nbHit = hit;
    const title = this.add.text(nb.x + 18, nb.y + 10, 'Notebook', {
      fontFamily: HAND, fontSize: '18px', color: '#3a3128',
    });
    this.nbScrollG = this.add.graphics();
    this.nbContent = this.add.container(0, 0);
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff, 1).fillRect(this.nbView.x - 4, this.nbView.y, this.nbView.w + 8, this.nbView.h);
    this.nbContent.setMask(maskG.createGeometryMask());
    this.nbLayer.add([g, hit, title, this.nbContent, this.nbScrollG]);
    this.fillNotebook();
  }

  fillNotebook() {
    const v = this.nbView;
    this.nbContent.removeAll(true);
    let y = 0;
    const add = (text, style, indent = 0, gapAfter = 2) => {
      const t = this.add.text(v.x + indent, v.y + y, text, {
        fontFamily: 'Georgia, serif', fontSize: '13px', color: '#2e241b', lineSpacing: 2,
        wordWrap: { width: v.w - indent, useAdvancedWrap: true }, ...style,
      });
      this.nbContent.add(t);
      y += t.height + gapAfter;
    };
    const groups = notebookGroups(state.notebook);
    if (!groups.length) add('Nothing yet. Talk to people (E) and what they say is written down here.', { color: '#8a7f6e', fontStyle: 'italic' });
    for (const gr of groups) {
      add(gr.title, { fontStyle: 'bold', fontSize: '14px', color: '#7a3b12' }, 0, 3);
      let lastTopic = null;
      for (const e of gr.entries) {
        if (e.topicId !== lastTopic) {
          add(e.brief ? 'the job' : `about ${e.topic}`, { fontStyle: 'italic', fontSize: '11px', color: '#7a6d5a' }, 4, 1);
          lastTopic = e.topicId;
        }
        add(e.text, {}, 8, 5);
      }
      y += 8;
    }
    this.nbContentH = y;
    // Newest entries are at the bottom: start scrolled there.
    this.nbScroll = Math.max(0, y - v.h);
    this.applyNotebookScroll();
  }

  applyNotebookScroll() {
    const v = this.nbView;
    const max = Math.max(0, this.nbContentH - v.h);
    this.nbScroll = Phaser.Math.Clamp(this.nbScroll, 0, max);
    this.nbContent.y = -this.nbScroll;
    const g = this.nbScrollG.clear();
    if (max > 0) {
      const barH = Math.max(24, (v.h * v.h) / this.nbContentH);
      const barY = v.y + (v.h - barH) * (this.nbScroll / max);
      g.fillStyle(0x8c7f6a, 0.5).fillRoundedRect(v.x + v.w + 6, barY, 4, barH, 2);
    }
  }

  overNotebook(pointer) {
    const nb = this.nbRect;
    return !!this.nbLayer && this.nbLayer.visible
      && pointer.x >= nb.x - 5 && pointer.x <= nb.x + nb.w && pointer.y >= nb.y && pointer.y <= nb.y + nb.h;
  }

  onWheel(pointer, over, dx, dy) {
    if (!this.overNotebook(pointer)) return;
    this.nbScroll += dy * 0.6;
    this.applyNotebookScroll();
  }

  refreshNotebook() {
    if (!this.nbLayer) return;
    const onSketch = this.tab === 'sketch';
    const show = onSketch && notebookOpen;
    this.nbLayer.setVisible(show);
    this.nbHit.input.enabled = show;
    this.nbFlapG.setVisible(onSketch);
    this.nbFlapTxt.setVisible(onSketch);
    this.nbFlapHit.input.enabled = onSketch;
    const f = this.nbFlap;
    const g = this.nbFlapG.clear();
    const top = PAPER.y - (show ? 30 : 26);
    g.fillStyle(show ? 0xfbf6e4 : 0x8c7f6a, 1);
    g.fillRoundedRect(f.x, top, f.w, PAPER.y - top + (show ? 2 : 0), { tl: 8, tr: 8, bl: 0, br: 0 });
    const n = state.notebook.length;
    this.nbFlapTxt.setText(show ? 'Notebook  x' : `Notebook (${n})`);
    this.nbFlapTxt.setAlpha(show ? 1 : 0.85);
  }

  makeButton(x, y, w, h, def) {
    const bg = this.add.rectangle(x, y, w, h, 0xf3eee0, 1).setInteractive({ useHandCursor: true });
    bg.isMapUI = true;
    this.toolbar.add(bg);
    const g = this.add.graphics();
    this.toolbar.add(g);
    let txt = null;
    if (def.icon) def.icon(g, x, y);
    if (def.text) {
      txt = this.add.text(x, y, def.text, {
        fontFamily: def.id === 'text' ? HAND : 'Georgia, serif', fontSize: def.id === 'text' ? '16px' : def.small ? '11px' : '13px', color: '#3a3128',
      }).setOrigin(0.5);
      this.toolbar.add(txt);
    }
    bg.on('pointerdown', () => def.onClick());
    bg.on('pointerover', () => this.statusText.setText(def.tip));
    bg.on('pointerout', () => this.updateStatus());
    const btn = { id: def.id, bg, txt };
    this.buttons.push(btn);
    return btn;
  }

  iconPencil(g, x, y) {
    g.fillStyle(0xe0b13a, 1);
    g.fillPoints([{ x: x - 9, y: y + 5 }, { x: x + 5, y: y - 9 }, { x: x + 9, y: y - 5 }, { x: x - 5, y: y + 9 }], true);
    g.fillStyle(0x555555, 1);
    g.fillTriangle(x - 9, y + 5, x - 5, y + 9, x - 11, y + 11);
  }

  iconEraser(g, x, y) {
    g.fillStyle(0xe58a9a, 1);
    g.fillPoints([{ x: x - 10, y: y + 3 }, { x: x + 1, y: y - 8 }, { x: x + 10, y: y + 1 }, { x: x - 1, y: y + 12 }], true);
    g.lineStyle(1.5, 0x3a3128, 1);
    g.strokePoints([{ x: x - 10, y: y + 3 }, { x: x + 1, y: y - 8 }, { x: x + 10, y: y + 1 }, { x: x - 1, y: y + 12 }], true);
  }

  iconDashed(g, x, y) {
    g.lineStyle(2.4, 0x555555, 1);
    for (let i = 0; i < 3; i++) g.lineBetween(x - 11 + i * 8, y + 5 - i * 5, x - 6 + i * 8, y + 2 - i * 5);
  }

  iconThick(g, x, y) {
    g.lineStyle(5, 0x555555, 1);
    g.lineBetween(x - 10, y + 5, x + 10, y - 6);
  }

  toggleStyle(which) {
    penStyle[which] = !penStyle[which];
    // Picking a line style from another tool switches back to the pencil.
    if (this.tool !== 'pencil') this.setTool('pencil');
    else this.refreshToolbar();
  }

  refreshToolbar() {
    const activeId = this.tool === 'stamp' ? 'stamp_' + this.stampKind : this.tool;
    for (const b of this.buttons) {
      const on = b.id === activeId || b.id === 'ink_' + this.ink.id
        || (b.id === 'line_dash' && penStyle.dash) || (b.id === 'line_thick' && penStyle.thick);
      b.bg.setStrokeStyle(on ? 3 : 1, on ? 0xe0a030 : 0x8c7f6a, 1);
    }
    if (this.clearBtn.txt) {
      this.clearBtn.txt.setText(this.clearArmed ? 'Sure?' : 'Clear');
      this.clearBtn.txt.setColor(this.clearArmed ? '#c0392b' : '#3a3128');
    }
    this.updateStatus();
  }

  updateStatus() {
    if (!this.statusText) return;
    let s;
    if (this.tool === 'pencil') {
      const kinds = [penStyle.dash && 'dashed', penStyle.thick && 'thick'].filter(Boolean);
      s = 'Drag to draw' + (kinds.length ? ` (${kinds.join(', ')})` : '');
    }
    else if (this.tool === 'eraser') s = 'Click a mark to erase it';
    else if (this.tool === 'text') s = 'Click, type, Enter';
    else s = 'Click to place: ' + STAMP_NAMES[this.stampKind];
    this.statusText.setText(s);
  }

  // ---------------------------------------------------------------- state

  showTab(id) {
    if (this.typing) this.commitTyping();
    if (!this.tabs[id]) id = 'sketch'; // that map is not in this mission
    this.tab = id;
    lastTab = id;
    this.sketchLayer.setVisible(id === 'sketch');
    this.toolbar.setVisible(id === 'sketch');
    for (const [k, layer] of Object.entries(this.mapLayers)) layer.setVisible(k === id);
    // Hidden toolbar buttons must not catch clicks.
    for (const b of this.buttons) if (b.bg.input) b.bg.input.enabled = id === 'sketch';
    this.drawTabs();
    this.refreshNotebook();
  }

  setTool(tool, stampKind = null) {
    if (this.typing) this.commitTyping();
    this.tool = tool;
    this.stampKind = stampKind;
    this.cursorG.clear();
    this.refreshToolbar();
  }

  setInk(ink) {
    this.ink = ink;
    // Picking an ink from the eraser switches back to the pencil.
    if (this.tool === 'eraser') this.tool = 'pencil';
    this.refreshToolbar();
  }

  clickClear() {
    if (!this.clearArmed) {
      this.clearArmed = true;
      this.refreshToolbar();
      this.clearTimer?.remove();
      this.clearTimer = this.time.delayedCall(2500, () => {
        this.clearArmed = false;
        this.refreshToolbar();
      });
      return;
    }
    this.clearTimer?.remove();
    this.clearArmed = false;
    const sk = state.sketch;
    if (sk.strokes.length + sk.stamps.length + sk.labels.length > 0) {
      this.pushHistory({ type: 'clear', snapshot: { strokes: sk.strokes, stamps: sk.stamps, labels: sk.labels } });
      sk.strokes = [];
      sk.stamps = [];
      sk.labels = [];
      this.redrawSketch();
    }
    this.refreshToolbar();
  }

  // ---------------------------------------------------------------- input

  setupInput() {
    this.input.keyboard.on('keydown', this.onKeyDown, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
  }

  onKeyDown(event) {
    if (this.typing) {
      this.onTypingKey(event);
      return;
    }
    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      this.undo();
      return;
    }
    // Ignore the same key press that opened the map.
    if (this.time.now - this.openedAt < 200) return;
    if (key === 'Escape' || key === 'm' || key === 'M') this.closeMap();
  }

  onTypingKey(event) {
    const key = event.key;
    if (key === 'Enter') this.commitTyping();
    else if (key === 'Escape') this.cancelTyping();
    else if (key === 'Backspace') {
      this.typing.text = this.typing.text.slice(0, -1);
      event.preventDefault();
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.typing.text.length < 40) this.typing.text += key;
      event.preventDefault();
    }
    this.updateTypingText();
  }

  isOverUI(over) {
    return over.some((o) => o.isMapUI);
  }

  inPaper(x, y) {
    return x >= PAPER.x && x <= PAPER.x + PAPER.w && y >= PAPER.y && y <= PAPER.y + PAPER.h;
  }

  onPointerDown(pointer, over) {
    if (this.tab !== 'sketch' || this.isOverUI(over)) return;
    // Clicking anywhere while typing places the label first.
    if (this.typing) {
      this.commitTyping();
      return;
    }
    const x = Math.round(pointer.x);
    const y = Math.round(pointer.y);
    if (!this.inPaper(x, y)) return;

    if (this.tool === 'pencil') {
      this.current = { points: [[x, y]], color: this.ink.color, width: penStyle.thick ? STROKE_WIDTH_THICK : STROKE_WIDTH };
      if (penStyle.dash) this.current.dash = true;
      this.drawLive();
    } else if (this.tool === 'eraser') {
      this.eraseAt(x, y);
    } else if (this.tool === 'text') {
      this.startTyping(x, y);
    } else if (this.tool === 'stamp') {
      const stamp = { kind: this.stampKind, x, y, color: this.ink.color };
      state.sketch.stamps.push(stamp);
      this.pushHistory({ type: 'add', list: 'stamps', item: stamp });
      this.redrawSketch();
    }
  }

  onPointerMove(pointer) {
    if (this.tab !== 'sketch') return;
    const x = Phaser.Math.Clamp(Math.round(pointer.x), PAPER.x, PAPER.x + PAPER.w);
    const y = Phaser.Math.Clamp(Math.round(pointer.y), PAPER.y, PAPER.y + PAPER.h);

    if (this.current && pointer.isDown) {
      const pts = this.current.points;
      const [lx, ly] = pts[pts.length - 1];
      if (Math.hypot(x - lx, y - ly) >= 2.5) {
        pts.push([x, y]);
        this.drawLive();
      }
    }

    // Eraser shows a small ring, and erases while dragging.
    this.cursorG.clear();
    if (this.tool === 'eraser' && this.inPaper(pointer.x, pointer.y) && !this.overNotebook(pointer)) {
      this.cursorG.lineStyle(1.5, 0xc0392b, 0.7);
      this.cursorG.strokeCircle(pointer.x, pointer.y, 8);
      if (pointer.isDown) this.eraseAt(pointer.x, pointer.y);
    }
  }

  onPointerUp() {
    if (!this.current) return;
    const stroke = this.current;
    this.current = null;
    this.liveG.clear();
    if (stroke.points.length === 1) {
      // A single click leaves a dot.
      const [x, y] = stroke.points[0];
      stroke.points.push([x + 0.5, y + 0.5]);
    } else {
      stroke.points = smoothPoints(stroke.points, 2);
    }
    state.sketch.strokes.push(stroke);
    this.pushHistory({ type: 'add', list: 'strokes', item: stroke });
    this.redrawSketch();
  }

  // ---------------------------------------------------------------- text labels

  startTyping(x, y) {
    this.typing = { x, y, text: '', caret: true };
    this.typingText = this.add.text(x, y, '', {
      fontFamily: HAND, fontSize: '18px', color: toCss(this.ink.color),
    }).setOrigin(0, 0.5);
    this.sketchLayer.add(this.typingText);
    this.caretTimer = this.time.addEvent({
      delay: 450, loop: true,
      callback: () => {
        if (!this.typing) return;
        this.typing.caret = !this.typing.caret;
        this.updateTypingText();
      },
    });
    this.updateTypingText();
  }

  updateTypingText() {
    if (!this.typing || !this.typingText) return;
    this.typingText.setText(this.typing.text + (this.typing.caret ? '|' : ' '));
  }

  commitTyping() {
    const t = this.typing;
    this.endTyping();
    const text = t ? t.text.trim() : '';
    if (!text) return;
    const lbl = { text, x: t.x, y: t.y, color: this.ink.color };
    state.sketch.labels.push(lbl);
    this.pushHistory({ type: 'add', list: 'labels', item: lbl });
    this.redrawSketch();
  }

  cancelTyping() {
    this.endTyping();
  }

  endTyping() {
    this.typing = null;
    this.caretTimer?.remove();
    this.caretTimer = null;
    this.typingText?.destroy();
    this.typingText = null;
  }

  // ---------------------------------------------------------------- eraser

  // Removes the nearest stroke, stamp or label under the pointer.
  eraseAt(x, y) {
    const sk = state.sketch;
    let best = null;
    const consider = (list, index, d) => {
      if (!best || d < best.d) best = { list, index, d };
    };

    sk.labels.forEach((lbl, i) => {
      const t = this.labelTexts[i];
      if (!t) return;
      const b = t.getBounds();
      if (x >= b.x - 4 && x <= b.right + 4 && y >= b.y - 4 && y <= b.bottom + 4) consider('labels', i, 0);
    });
    sk.stamps.forEach((st, i) => {
      const d = Math.hypot(st.x - x, st.y - y);
      if (d < 14 * STAMP_SCALE) consider('stamps', i, d);
    });
    sk.strokes.forEach((st, i) => {
      const p = st.points;
      for (let k = 0; k < p.length - 1; k++) {
        const d = distToSegment(x, y, p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]);
        if (d < 7) consider('strokes', i, d);
      }
    });

    if (!best) return;
    const [item] = sk[best.list].splice(best.index, 1);
    this.pushHistory({ type: 'remove', list: best.list, item, index: best.index });
    this.redrawSketch();
  }

  // ---------------------------------------------------------------- undo

  pushHistory(action) {
    history.push(action);
    if (history.length > MAX_HISTORY) history.shift();
  }

  undo() {
    if (this.typing) return;
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
    this.redrawSketch();
  }

  // ---------------------------------------------------------------- drawing

  drawStroke(g, stroke) {
    drawSketchStroke(g, stroke);
  }

  drawLive() {
    this.liveG.clear();
    if (this.current) this.drawStroke(this.liveG, this.current);
  }

  // Rebuilds every mark from state.sketch.
  redrawSketch() {
    const sk = state.sketch;
    this.sketchG.clear();
    for (const stroke of sk.strokes) this.drawStroke(this.sketchG, stroke);
    for (const st of sk.stamps) {
      drawStamp(this.sketchG, st.kind, st.x, st.y, st.color ?? 0x555555, STAMP_SCALE, seedFrom(st.kind, st.x, st.y));
    }

    this.labelLayer.removeAll(true);
    this.labelTexts = sk.labels.map((lbl) => {
      const t = this.add.text(lbl.x, lbl.y, lbl.text, {
        fontFamily: HAND, fontSize: '18px', color: toCss(lbl.color ?? 0x555555),
      }).setOrigin(0, 0.5);
      this.labelLayer.add(t);
      return t;
    });
  }

  // ---------------------------------------------------------------- close

  closeMap() {
    if (this.closing) return;
    this.closing = true;
    if (this.typing) this.commitTyping();
    this.scene.resume('Drive');
    state.inputLocked = false;
    this.game.events.emit('map-closed');
    this.scene.stop();
  }
}
