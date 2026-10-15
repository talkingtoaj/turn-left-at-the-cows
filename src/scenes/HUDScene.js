import Phaser from 'phaser';
import { WORLD } from '../world/world.js';
import { state } from '../state.js';
import { headingText, clockText, timerText, odoDigits } from '../hud/format.js';
import { greet, ask, listTopics, getNpc } from '../game/dialogue.js';
import { MISSIONS, currentMission, currentGoal, nextMission } from '../game/missions.js';
import { finishMission } from '../game/update.js';
import { askedAbout } from '../hud/notebook.js';
import { drawSketchInto, SKETCH_PAPER_RECT } from '../map/sketchView.js';
import { drawTrueMap, missionArea } from '../map/trueMap.js';

// Transparent overlay on top of Drive. Shows the dash (compass, odometer,
// clock, speed, trip timer), road signs, mailbox names, the talk prompt and
// the topic menu dialogue, the mission-complete screen, and owns the
// E / M / R / Enter / 1-9 keys.
// Core rule: never show the player's position, a minimap or coordinates.

const W = 960;
const H = 640;
const DASH_H = 92;
const DASH_Y = H - DASH_H;

const MONO = '"Courier New", Courier, monospace';
const SANS = 'Arial, Helvetica, sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

const C = {
  dash: 0x1c1d1f,
  dashEdge: 0x3a3c40,
  bezel: 0x2a2c30,
  gauge: '#e6b450', // warm amber for gauge readouts
  label: '#8a8d92',
  text: '#d9d4c5',
};

// Ignore M this long after the map closes, so the same keypress that
// closed it does not open it again.
const MAP_REOPEN_GUARD_MS = 150;

// Dialogue box and topic menu layout.
const DLG_W = 760;
const DLG_X = (W - DLG_W) / 2;
const DLG_BOTTOM = DASH_Y - 14;
const PAGE_H = 150;
const MENU_ROWS = 9; // visible topic rows (keys 1-9)
const ROW_H = 25;

const HINT = 'Arrows/WASD drive · E talk · M map · N north/heading-up · K mute';

export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  create() {
    this.scene.bringToTop();

    // While talking: { npcId, title, mode: 'pages'|'menu', pages, page,
    // after: 'menu'|'close', items, sel, scroll }
    this.dialogue = null;
    this.menuSel = new Map(); // npcId -> last selected topic id
    this.mapOpen = false;
    this.mapClosedAt = -Infinity;
    this.currentSignId = undefined;
    this.currentMailboxId = undefined;
    this.winShown = false;
    this.winBox = null;
    this.bigView = null;

    this.buildDash();
    this.buildSignPanel();
    this.buildMailboxPanel();
    this.buildPrompt();
    this.buildDialogue();

    // Keys. HUD is never paused, so it keeps receiving input while Map is open.
    const kb = this.input.keyboard;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false);
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M, false);
    this.keyR = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R, false);
    this.keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER, false);
    this.keyEnter.on('down', () => this.onEnterKey());
    this.keyE.on('down', () => this.onTalkKey());
    this.keyM.on('down', () => this.onMapKey());
    this.keyR.on('down', () => {
      if (state.won && !this.mapOpen) window.location.reload();
    });
    // Menu keys: 1-9, Up/Down (and W/S), Esc.
    this.onAnyKey = (ev) => this.onDialogueKey(ev);
    kb.on('keydown', this.onAnyKey);

    // Map tells us when it closes. Also watch its shutdown as a fallback.
    this.onMapClosed = () => {
      if (!this.mapOpen) return;
      this.mapOpen = false;
      this.mapClosedAt = this.time.now;
      // Back on the mission-complete screen: redraw it with the edited sketch.
      if (this.winShown && !state.allMissionsDone) {
        this.winBox?.setVisible(true);
        this.showWin();
        return;
      }
      this.dash.setVisible(true);
      // Back to the same dialogue page or menu.
      if (this.dialogue) {
        this.dlgBox.setVisible(true);
        state.inputLocked = true;
      }
    };
    this.game.events.on('map-closed', this.onMapClosed);
    const mapScene = this.scene.get('Map');
    if (mapScene) mapScene.events.on('shutdown', this.onMapClosed);

    this.events.once('shutdown', () => {
      kb.off('keydown', this.onAnyKey);
      this.game.events.off('map-closed', this.onMapClosed);
      if (mapScene) mapScene.events.off('shutdown', this.onMapClosed);
    });
  }

  // ---------------------------------------------------------------- dash

  buildDash() {
    this.dash = this.add.container(0, 0);
    const g = this.add.graphics();
    this.dash.add(g);

    // Dash body with a soft top edge.
    g.fillStyle(C.dash, 1).fillRect(0, DASH_Y, W, DASH_H);
    g.fillStyle(C.dashEdge, 1).fillRect(0, DASH_Y, W, 3);
    g.fillStyle(0x000000, 0.25).fillRect(0, DASH_Y - 4, W, 4);

    // Recessed bezels behind each gauge group.
    const bezel = (x, w) => g.fillStyle(C.bezel, 1).fillRoundedRect(x, DASH_Y + 10, w, 60, 8);
    bezel(118, 120); // heading text
    bezel(256, 210); // odometer
    bezel(484, 140); // speed
    bezel(642, 130); // clock
    bezel(790, 150); // trip timer

    const label = (x, text) =>
      this.dash.add(
        this.add.text(x, DASH_Y + 15, text, { fontFamily: MONO, fontSize: '11px', color: C.label }).setOrigin(0.5, 0),
      );
    label(178, 'HEADING');
    label(361, 'TRIP km');
    label(554, 'SPEED');
    label(707, 'CLOCK');
    label(865, 'TRIP TIME');

    this.buildCompass(62, DASH_Y + 44);

    const gaugeStyle = (size) => ({ fontFamily: MONO, fontSize: size, color: C.gauge, fontStyle: 'bold' });

    this.headingTxt = this.add.text(178, DASH_Y + 46, '', gaugeStyle('22px')).setOrigin(0.5);
    this.buildOdometer(361, DASH_Y + 47);

    this.speedTxt = this.add.text(548, DASH_Y + 46, '0', gaugeStyle('28px')).setOrigin(1, 0.5);
    const unit = this.add.text(554, DASH_Y + 52, 'km/h', { fontFamily: MONO, fontSize: '13px', color: C.label }).setOrigin(0, 0.5);
    this.gearTxt = this.add.text(612, DASH_Y + 30, '', { fontFamily: MONO, fontSize: '11px', color: '#c96a5a' }).setOrigin(1, 0.5);

    this.clockTxt = this.add.text(707, DASH_Y + 46, '', gaugeStyle('26px')).setOrigin(0.5);
    this.timerTxt = this.add.text(865, DASH_Y + 47, '', gaugeStyle('18px')).setOrigin(0.5);

    this.hintTxt = this.add
      .text(W / 2, H - 9, HINT, { fontFamily: MONO, fontSize: '12px', color: C.label })
      .setOrigin(0.5);

    this.dash.add([this.headingTxt, this.speedTxt, unit, this.gearTxt, this.clockTxt, this.timerTxt, this.hintTxt]);
  }

  // A compass card that turns under a fixed red lubber mark, like a real
  // dash compass: the direction you face is always at the top.
  buildCompass(cx, cy) {
    const R = 36;
    const frame = this.add.graphics();
    frame.fillStyle(0x0f1011, 1).fillCircle(cx, cy, R + 4);
    frame.lineStyle(2, 0x55585e, 1).strokeCircle(cx, cy, R + 4);

    this.compassCard = this.add.container(cx, cy);
    const card = this.add.graphics();
    card.fillStyle(0x24262a, 1).fillCircle(0, 0, R);
    for (let a = 0; a < 360; a += 15) {
      const major = a % 45 === 0;
      const rad = Phaser.Math.DegToRad(a - 90);
      const r0 = major ? R - 8 : R - 5;
      card.lineStyle(major ? 2 : 1, major ? 0xd9d4c5 : 0x7a7d82, 1);
      card.lineBetween(Math.cos(rad) * r0, Math.sin(rad) * r0, Math.cos(rad) * R, Math.sin(rad) * R);
    }
    this.compassCard.add(card);

    // Cardinal letters sit on the card and turn with it.
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => {
      const rad = Phaser.Math.DegToRad(a - 90);
      const r = R - 17;
      const txt = this.add
        .text(Math.cos(rad) * r, Math.sin(rad) * r, t, {
          fontFamily: MONO,
          fontSize: '13px',
          fontStyle: 'bold',
          color: t === 'N' ? '#d0614f' : C.text,
        })
        .setOrigin(0.5)
        .setRotation(Phaser.Math.DegToRad(a));
      this.compassCard.add(txt);
    });

    // Fixed lubber line (red triangle at 12 o'clock) and a centre pin.
    const lubber = this.add.graphics();
    lubber.fillStyle(0xd0614f, 1).fillTriangle(cx - 5, cy - R - 6, cx + 5, cy - R - 6, cx, cy - R + 5);
    lubber.fillStyle(0x55585e, 1).fillCircle(cx, cy, 3);

    this.dash.add([frame, this.compassCard, lubber]);
  }

  // Mechanical odometer: one drum cell per digit, the last two (tenths and
  // hundredths of a km) inverted like a classic trip meter.
  buildOdometer(cx, cy) {
    const cells = 6;
    const cw = 24;
    const ch = 30;
    const gap = 3;
    const dot = 8;
    const total = cells * cw + (cells - 1) * gap + dot;
    let x = cx - total / 2;

    const g = this.add.graphics();
    g.fillStyle(0x0c0c0d, 1).fillRoundedRect(x - 5, cy - ch / 2 - 4, total + 10, ch + 8, 4);
    this.dash.add(g);

    this.odoCells = [];
    for (let i = 0; i < cells; i++) {
      const frac = i >= 4;
      if (i === 4) {
        // Decimal point between whole km and the fraction.
        g.fillStyle(0xd9d4c5, 1).fillCircle(x + dot / 2 - gap / 2, cy + ch / 2 - 5, 2);
        x += dot;
      }
      g.fillStyle(frac ? 0xd9d4c5 : 0x222326, 1).fillRect(x, cy - ch / 2, cw, ch);
      // Faint shading so each cell reads as a curved drum.
      g.fillStyle(0x000000, 0.25).fillRect(x, cy - ch / 2, cw, 4).fillRect(x, cy + ch / 2 - 4, cw, 4);
      const t = this.add
        .text(x + cw / 2, cy, '0', {
          fontFamily: MONO,
          fontSize: '22px',
          fontStyle: 'bold',
          color: frac ? '#1c1d1f' : '#e8e3d3',
        })
        .setOrigin(0.5);
      this.odoCells.push(t);
      this.dash.add(t);
      x += cw + gap;
    }
  }

  updateDash() {
    const { car } = state;
    this.compassCard.setRotation(Phaser.Math.DegToRad(-car.heading));
    this.headingTxt.setText(headingText(car.heading));

    const digits = odoDigits(state.odometer).replace('.', '').slice(-6);
    for (let i = 0; i < this.odoCells.length; i++) this.odoCells[i].setText(digits[i]);

    this.speedTxt.setText(String(Math.round(Math.abs(car.speed) * 3.6)));
    this.gearTxt.setText(car.speed < -0.2 ? 'REV' : '');
    this.clockTxt.setText(clockText(state.clockMinutes));
    this.timerTxt.setText(timerText(state.elapsedMs));
  }


  // ---------------------------------------------------------------- signs

  buildSignPanel() {
    this.signBox = this.add.container(W / 2, 18).setVisible(false);
    this.signGfx = this.add.graphics();
    this.signTxt = this.add
      .text(0, 0, '', { fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    this.signBox.add([this.signGfx, this.signTxt]);
  }

  updateSign() {
    const id = state.won ? null : state.nearSignId;
    if (id === this.currentSignId) return;
    this.currentSignId = id;

    const sign = id && WORLD.signs.find((s) => s.id === id);
    if (!sign) {
      this.signBox.setVisible(false);
      return;
    }

    // Warning signs (closures) get the red and white look, the rest are
    // green direction signs.
    const warn = sign.lines.some((l) => /\b(OUT|CLOSED)\b/i.test(l));
    this.signTxt.setText(sign.lines.join('\n'));
    this.signTxt.setColor(warn ? '#b3261e' : '#f2f2ea');
    this.signTxt.setY(16);

    const w = Math.max(160, this.signTxt.width + 48);
    const h = this.signTxt.height + 32;
    const g = this.signGfx.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 3, 3, w, h, 10);
    if (warn) {
      g.fillStyle(0xf4f1ea, 1).fillRoundedRect(-w / 2, 0, w, h, 10);
      g.lineStyle(6, 0xb3261e, 1).strokeRoundedRect(-w / 2 + 5, 5, w - 10, h - 10, 7);
    } else {
      g.fillStyle(0x2e6a47, 1).fillRoundedRect(-w / 2, 0, w, h, 10);
      g.lineStyle(2, 0xf2f2ea, 1).strokeRoundedRect(-w / 2 + 5, 5, w - 10, h - 10, 7);
    }
    this.signBox.setVisible(true);
  }


  // ---------------------------------------------------------------- mailboxes

  // Name on a roadside mailbox (state.nearMailboxId, set by Drive if present).
  buildMailboxPanel() {
    this.mbBox = this.add.container(W / 2, 18).setVisible(false);
    this.mbGfx = this.add.graphics();
    this.mbTxt = this.add
      .text(12, 0, '', { fontFamily: SANS, fontSize: '17px', fontStyle: 'bold', color: '#f4f1ea' })
      .setOrigin(0, 0.5);
    this.mbBox.add([this.mbGfx, this.mbTxt]);
  }

  updateMailbox() {
    const id = state.won || this.dialogue ? null : state.nearMailboxId || null;
    if (id !== this.currentMailboxId) {
      this.currentMailboxId = id;
      const mb = id && (WORLD.mailboxes || []).find((m) => m.id === id);
      if (!mb) {
        this.mbBox.setVisible(false);
      } else {
        this.mbTxt.setText(mb.name);
        const tw = this.mbTxt.width;
        const w = tw + 58;
        const h = 36;
        const x0 = -w / 2;
        this.mbTxt.setPosition(x0 + 44, h / 2);
        const g = this.mbGfx.clear();
        g.fillStyle(0x000000, 0.3).fillRoundedRect(x0 + 3, 3, w, h, 6);
        g.fillStyle(0x3d4146, 1).fillRoundedRect(x0, 0, w, h, 6);
        g.lineStyle(1.5, 0x9aa0a6, 1).strokeRoundedRect(x0 + 3, 3, w - 6, h - 6, 4);
        // Little mailbox: rounded box on a post, red flag up.
        const bx = x0 + 12;
        g.fillStyle(0xc9ccd0, 1).fillRoundedRect(bx, 10, 20, 12, { tl: 6, tr: 6, bl: 1, br: 1 });
        g.fillStyle(0x7a5a3a, 1).fillRect(bx + 8, 22, 4, 8);
        g.fillStyle(0xc0392b, 1).fillRect(bx + 17, 6, 2.5, 10).fillRect(bx + 17, 6, 7, 4);
        this.mbBox.setVisible(true);
      }
    }
    if (this.mbBox.visible) {
      // Sit under the road sign when both are showing.
      const below = this.signBox.visible ? 18 + this.signTxt.height + 32 + 10 : 18;
      this.mbBox.setY(below);
    }
  }

  // ---------------------------------------------------------------- talking

  buildPrompt() {
    this.promptTxt = this.add
      .text(W / 2, DASH_Y - 22, '', {
        fontFamily: MONO,
        fontSize: '15px',
        color: '#f0ead8',
        backgroundColor: 'rgba(20,21,23,0.82)',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setVisible(false);
  }

  buildDialogue() {
    this.dlgBox = this.add.container(0, 0).setVisible(false);
    this.dlgGfx = this.add.graphics();
    this.dlgName = this.add.text(DLG_X + 20, 0, '', {
      fontFamily: SANS,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#e6b450',
    });
    this.dlgText = this.add.text(DLG_X + 20, 0, '', {
      fontFamily: SANS,
      fontSize: '17px',
      color: '#ece7d8',
      lineSpacing: 5,
      wordWrap: { width: DLG_W - 40, useAdvancedWrap: true },
    });
    this.dlgMore = this.add
      .text(DLG_X + DLG_W - 16, 0, '', { fontFamily: MONO, fontSize: '12px', color: C.label })
      .setOrigin(1, 1);
    this.dlgBox.add([this.dlgGfx, this.dlgName, this.dlgText, this.dlgMore]);

    // Topic menu rows (reused; only MENU_ROWS are ever visible).
    this.menuHi = this.add.graphics();
    this.dlgBox.add(this.menuHi);
    this.menuRows = [];
    for (let i = 0; i < MENU_ROWS; i++) {
      const hit = this.add.rectangle(DLG_X + 12, 0, DLG_W - 24, ROW_H, 0x000000, 0).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.hoverRow(i));
      hit.on('pointerdown', () => this.pickRow(i));
      const num = this.add.text(DLG_X + 26, 0, '', { fontFamily: MONO, fontSize: '15px', color: C.label }).setOrigin(0, 0.5);
      const dot = this.add.graphics();
      const txt = this.add.text(DLG_X + 70, 0, '', { fontFamily: SANS, fontSize: '17px', color: '#ece7d8' }).setOrigin(0, 0.5);
      this.dlgBox.add([hit, num, dot, txt]);
      this.menuRows.push({ hit, num, dot, txt });
    }
    // Wheel scrolls a long topic list.
    this.input.on('wheel', (pointer, over, dx, dy) => {
      const d = this.dialogue;
      if (!d || d.mode !== 'menu' || this.mapOpen) return;
      this.moveSel(dy > 0 ? 1 : -1);
    });
  }

  // Lays out the box for the current mode and contents.
  layoutDialogue(h) {
    const y = DLG_BOTTOM - h;
    const g = this.dlgGfx.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(DLG_X + 4, y + 4, DLG_W, h, 10);
    g.fillStyle(0x23252a, 0.96).fillRoundedRect(DLG_X, y, DLG_W, h, 10);
    g.lineStyle(2, 0x6b6e74, 1).strokeRoundedRect(DLG_X, y, DLG_W, h, 10);
    this.dlgName.setY(y + 14);
    this.dlgText.setY(y + 42);
    this.dlgMore.setY(y + h - 10);
    return y;
  }

  onTalkKey() {
    if (this.mapOpen || state.won) return;
    if (this.dialogue) {
      this.advance();
      return;
    }
    const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
    if (!local) return;
    this.talkTo(local);
  }

  onEnterKey() {
    if (this.mapOpen) return;
    if (state.won) {
      this.onContinueKey();
      return;
    }
    if (this.dialogue) this.advance();
  }

  // 1-9, Up/Down (W/S) and Esc while a dialogue is open.
  onDialogueKey(ev) {
    const d = this.dialogue;
    // The Esc that just closed the map must not also close the dialogue.
    if (this.time.now - this.mapClosedAt < MAP_REOPEN_GUARD_MS) return;
    if (this.bigView && ev.key === 'Escape') {
      this.closeBigView();
      return;
    }
    if (!d || this.mapOpen || state.won) return;
    const k = ev.key;
    if (k === 'Escape') {
      if (d.mode === 'pages' && d.after === 'menu') this.showMenu();
      else this.closeDialogue();
      return;
    }
    if (d.mode !== 'menu') return;
    if (k >= '1' && k <= '9') {
      this.pickRow(Number(k) - 1);
    } else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      this.moveSel(-1);
      ev.preventDefault?.();
    } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
      this.moveSel(1);
      ev.preventDefault?.();
    }
  }

  // Walk up to someone: greeting first, then the topic menu.
  talkTo(local) {
    const pages = greet(local.id, state);
    this.dialogue = {
      npcId: local.id, title: `${local.name}, ${local.role}`, mode: 'pages', pages, page: 0, after: 'menu',
    };
    state.inputLocked = true;
    this.dlgName.setText(this.dialogue.title);
    this.dlgBox.setVisible(true);
    if (pages.length) this.showPage();
    else this.showMenu();
  }

  // Plain pages with no menu after (mission brief).
  openDialogue(title, pages) {
    if (!pages.length) return;
    this.dialogue = { npcId: null, title, mode: 'pages', pages, page: 0, after: 'close' };
    state.inputLocked = true;
    this.dlgName.setText(title);
    this.dlgBox.setVisible(true);
    this.showPage();
  }

  advance() {
    const d = this.dialogue;
    if (d.mode === 'menu') {
      this.pickItem(d.sel);
      return;
    }
    d.page++;
    if (d.page < d.pages.length) this.showPage();
    else if (d.after === 'menu') this.showMenu();
    else this.closeDialogue();
  }

  showPage() {
    const d = this.dialogue;
    d.mode = 'pages';
    this.setMenuVisible(false);
    this.dlgText.setVisible(true);
    this.dlgText.setText(d.pages[d.page]);
    const h = Math.max(PAGE_H, 42 + this.dlgText.height + 36);
    this.layoutDialogue(h);
    const last = d.page === d.pages.length - 1;
    const next = last ? (d.after === 'menu' ? 'back' : 'close') : 'next';
    const map = '   M: map';
    this.dlgMore.setText(`${d.page + 1}/${d.pages.length}   E: ${next}${map}`);
  }

  showMenu() {
    const d = this.dialogue;
    d.mode = 'menu';
    const topics = listTopics(d.npcId, state).map((t) => ({
      ...t, fresh: !askedAbout(state.notebook, d.npcId, t.id),
    }));
    d.items = [...topics, { id: '_bye', label: 'Goodbye', bye: true }];
    const lastId = this.menuSel.get(d.npcId);
    const at = d.items.findIndex((it) => it.id === lastId);
    d.sel = at >= 0 ? at : 0;
    d.scroll = 0;
    this.dlgText.setVisible(false);
    this.setMenuVisible(true);
    this.renderMenu();
  }

  setMenuVisible(on) {
    this.menuHi.setVisible(on);
    for (const r of this.menuRows) {
      r.hit.setVisible(on);
      r.hit.input.enabled = on;
      r.num.setVisible(on);
      r.dot.setVisible(on);
      r.txt.setVisible(on);
    }
  }

  renderMenu() {
    const d = this.dialogue;
    const n = d.items.length;
    const rows = Math.min(MENU_ROWS, n);
    // Keep the selection in view.
    if (d.sel < d.scroll) d.scroll = d.sel;
    if (d.sel >= d.scroll + rows) d.scroll = d.sel - rows + 1;
    const h = 46 + rows * ROW_H + 34;
    const y = this.layoutDialogue(h);
    const top = y + 44;
    for (let i = 0; i < MENU_ROWS; i++) {
      const r = this.menuRows[i];
      const item = d.items[d.scroll + i];
      const show = i < rows && !!item;
      r.hit.setVisible(show);
      r.hit.input.enabled = show;
      r.num.setVisible(show);
      r.dot.setVisible(show);
      r.txt.setVisible(show);
      if (!show) continue;
      const cy = top + i * ROW_H + ROW_H / 2;
      r.hit.setY(top + i * ROW_H);
      r.num.setPosition(DLG_X + 26, cy).setText(`${i + 1}.`);
      r.txt.setPosition(DLG_X + 70, cy).setText(item.label);
      // Topics not yet asked about to this person: brighter, with a small green dot.
      // The errand's own topic in gold.
      r.txt.setColor(item.bye ? '#b9b4a6' : item.isGoal ? '#e6b450' : item.fresh ? '#f4efe0' : '#a7a396');
      r.txt.setFontStyle(item.bye ? 'italic' : '');
      r.dot.clear();
      if (item.fresh && !item.bye) r.dot.fillStyle(0x7cc47f, 0.95).fillCircle(DLG_X + 58, cy, 3);
    }
    const sel = d.sel - d.scroll;
    this.menuHi.clear();
    this.menuHi.fillStyle(0xe6b450, 0.14).fillRoundedRect(DLG_X + 12, top + sel * ROW_H, DLG_W - 24, ROW_H, 5);
    this.menuHi.lineStyle(1, 0xe6b450, 0.5).strokeRoundedRect(DLG_X + 12, top + sel * ROW_H, DLG_W - 24, ROW_H, 5);
    const more = [d.scroll > 0 ? 'more above' : '', d.scroll + rows < n ? 'more below' : ''].filter(Boolean).join(', ');
    this.dlgMore.setText(`${more ? '(' + more + ')   ' : ''}1-9 / Up Down + E: ask   Esc: goodbye   M: map`);
    this.dlgName.setText(`${d.title}: ask about...`);
  }

  hoverRow(i) {
    const d = this.dialogue;
    if (!d || d.mode !== 'menu' || this.mapOpen) return;
    const idx = d.scroll + i;
    if (idx < d.items.length && idx !== d.sel) {
      d.sel = idx;
      this.renderMenu();
    }
  }

  pickRow(i) {
    const d = this.dialogue;
    if (!d || d.mode !== 'menu' || this.mapOpen) return;
    const idx = d.scroll + i;
    if (idx < d.items.length && i < MENU_ROWS) this.pickItem(idx);
  }

  moveSel(step) {
    const d = this.dialogue;
    const n = d.items.length;
    d.sel = (d.sel + step + n) % n;
    this.renderMenu();
  }

  pickItem(idx) {
    const d = this.dialogue;
    const item = d.items[idx];
    if (!item) return;
    if (item.bye) {
      this.closeDialogue();
      return;
    }
    this.menuSel.set(d.npcId, item.id);
    const lines = ask(d.npcId, item.id, state);
    this.dlgName.setText(`${d.title}: ${item.label}`);
    d.pages = lines.length ? lines : ['...'];
    d.page = 0;
    d.after = 'menu';
    this.showPage();
  }

  // A new mission's brief, from whoever gave it.
  showBrief() {
    state.briefPending = false;
    const m = currentMission(state);
    if (!m) return;
    const giver = m.giverNpcId && getNpc(m.giverNpcId);
    this.openDialogue(giver ? `${giver.name}: ${m.title}` : m.title, m.brief);
  }

  closeDialogue() {
    this.dialogue = null;
    this.dlgBox.setVisible(false);
    this.setMenuVisible(false);
    state.inputLocked = false;
  }

  updatePrompt() {
    const local =
      !this.dialogue && !this.mapOpen && !state.won && state.nearLocalId
        ? WORLD.locals.find((l) => l.id === state.nearLocalId)
        : null;
    if (local) this.promptTxt.setText(`E: talk to ${local.name} (${local.role})`);
    this.promptTxt.setVisible(!!local);
  }

  // ---------------------------------------------------------------- map

  onMapKey() {
    if (this.mapOpen || this.bigView) return;
    // On the mission-complete screen M lets you finish your final map.
    if (state.won && (!this.winShown || state.allMissionsDone)) return;
    if (this.time.now - this.mapClosedAt < MAP_REOPEN_GUARD_MS) return;

    this.mapOpen = true;
    state.inputLocked = true;
    this.dash.setVisible(false);
    this.signBox.setVisible(false);
    this.mbBox.setVisible(false);
    this.promptTxt.setVisible(false);
    this.dlgBox.setVisible(false); // comes back when the map closes
    this.winBox?.setVisible(false);
    this.currentSignId = undefined; // redraw the sign after the map closes
    this.currentMailboxId = undefined;
    this.scene.pause('Drive');
    this.scene.launch('Map');
  }

  // ---------------------------------------------------------------- mission complete

  // Full screen: title, stats, a row of the mission's sketch snapshots (plus
  // the sketch as it is now, which becomes the final snapshot), and the true
  // map of the mission's area. Click a map to see it big.
  showWin() {
    this.winShown = true;
    this.dash.setVisible(false);
    if (this.dialogue) this.closeDialogue();
    state.inputLocked = true;
    this.promptTxt.setVisible(false);
    this.signBox.setVisible(false);
    this.mbBox.setVisible(false);

    const m = currentMission(state);
    const goal = currentGoal(state);
    const box = this.startScreen();
    const add = box.add;

    add(this.add.text(W / 2, 26, m ? `Mission complete: ${m.title}` : 'Mission complete', {
      fontFamily: SANS, fontSize: '24px', fontStyle: 'bold', color: '#e6b450',
    }).setOrigin(0.5, 0));

    const stats = [
      `You made it to ${goal ? goal.name : 'the end'}`,
      `Trip ${timerText(state.elapsedMs)}`,
      `${(state.odometer / 1000).toFixed(2)} km`,
      `Clock ${clockText(state.clockMinutes)}`,
      `Locals asked ${state.talkedTo.size}`,
    ];
    add(this.add.text(W / 2, 62, stats.join('   ·   '), {
      fontFamily: MONO, fontSize: '14px', color: C.text,
    }).setOrigin(0.5, 0));

    // Thumbnails: this mission's snapshots, then the sketch as it is now.
    const snaps = state.snapshots.filter((s) => m && s.missionId === m.id);
    const items = snaps.map((s) => ({ label: s.label, sketch: s.sketch }));
    items.push({ label: `${m ? m.finalLabel : 'Your map'} now (M to finish it)`, sketch: state.sketch });

    add(this.add.text(40, 92, 'Your maps, as you drew them', {
      fontFamily: SANS, fontSize: '14px', fontStyle: 'bold', color: '#c9c3b2',
    }));
    const gap = 14;
    const availW = W - 80;
    const tw = Math.min(200, (availW - gap * (items.length - 1)) / items.length);
    const th = (tw * SKETCH_PAPER_RECT.h) / SKETCH_PAPER_RECT.w;
    const rowW = items.length * tw + (items.length - 1) * gap;
    let tx = (W - rowW) / 2;
    const ty = 116;
    this.winThumbs = [];
    let labelBottom = ty + th;
    items.forEach((it) => {
      labelBottom = Math.max(labelBottom, this.addSketchThumb(box, it, tx, ty, tw, th));
      tx += tw + gap;
    });

    // The truth.
    const mapTop = labelBottom + 34;
    add(this.add.text(40, mapTop - 22, 'The real roads', {
      fontFamily: SANS, fontSize: '14px', fontStyle: 'bold', color: '#c9c3b2',
    }));
    const area = missionArea(m);
    const mapBox = { x: 40, y: mapTop, w: W - 80, h: H - 40 - mapTop };
    const trueC = this.add.container(0, 0);
    box.add(trueC);
    const drawn = drawTrueMap(this, trueC, mapBox, area);
    const hit = this.add.rectangle(drawn.rect.x, drawn.rect.y, drawn.rect.w, drawn.rect.h, 0, 0).setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.showBigTrueMap(area, m));
    add(hit);
    this.winTrueRect = drawn.rect;

    const foot = nextMission(state)
      ? 'Click a map to see it big  ·  M: finish your map  ·  Enter: next mission  ·  R: start over'
      : 'Click a map to see it big  ·  M: finish your map  ·  Enter: finish  ·  R: start over';
    add(this.add.text(W / 2, H - 14, foot, { fontFamily: MONO, fontSize: '13px', color: C.text }).setOrigin(0.5, 1));
  }

  // Dark full-screen panel for the end screens. Returns { container, add }.
  startScreen() {
    this.winBox?.destroy();
    this.winBox = this.add.container(0, 0);
    const add = (o) => {
      this.winBox.add(o);
      return o;
    };
    const shade = add(this.add.graphics());
    shade.fillStyle(0x000000, 0.6).fillRect(0, 0, W, H);
    shade.fillStyle(0x23252a, 0.98).fillRoundedRect(14, 12, W - 28, H - 24, 12);
    shade.lineStyle(2, 0xe6b450, 1).strokeRoundedRect(14, 12, W - 28, H - 24, 12);
    // Swallow clicks behind.
    add(this.add.rectangle(0, 0, W, H, 0, 0).setOrigin(0).setInteractive());
    return { container: this.winBox, add };
  }

  // One sketch thumbnail with its label underneath; click to enlarge.
  addSketchThumb(box, item, x, y, w, h) {
    const k = w / SKETCH_PAPER_RECT.w;
    const c = this.add.container(x - SKETCH_PAPER_RECT.x * k, y - SKETCH_PAPER_RECT.y * k);
    drawSketchInto(this, c, item.sketch, { lineMul: Math.min(3, 0.5 / k), textMul: 1.6, grid: false });
    c.setScale(k);
    box.add(c);
    const frame = this.add.graphics();
    frame.lineStyle(1.5, 0x8c7f6a, 1).strokeRect(x, y, w, h);
    box.add(frame);
    const hit = this.add.rectangle(x, y, w, h, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => frame.clear().lineStyle(2.5, 0xe6b450, 1).strokeRect(x, y, w, h));
    hit.on('pointerout', () => frame.clear().lineStyle(1.5, 0x8c7f6a, 1).strokeRect(x, y, w, h));
    hit.on('pointerdown', () => this.showBigSketch(item));
    box.add(hit);
    const label = this.add.text(x + w / 2, y + h + 5, item.label, {
      fontFamily: SANS, fontSize: '11px', color: '#c9c3b2', align: 'center',
      wordWrap: { width: w, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    box.add(label);
    this.winThumbs?.push({ x, y, w, h, label: item.label });
    return y + h + 5 + label.height; // bottom of the label
  }

  // Big view on top of the end screen; click or Esc closes it.
  openBigView(title) {
    this.closeBigView();
    const c = this.add.container(0, 0);
    const shade = this.add.rectangle(0, 0, W, H, 0x111214, 0.92).setOrigin(0).setInteractive({ useHandCursor: true });
    shade.on('pointerdown', () => this.closeBigView());
    c.add(shade);
    c.add(this.add.text(W / 2, 14, title, { fontFamily: SANS, fontSize: '16px', fontStyle: 'bold', color: '#e6b450' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, H - 8, 'Click or Esc to close', { fontFamily: MONO, fontSize: '12px', color: C.label }).setOrigin(0.5, 1));
    this.bigView = c;
    return c;
  }

  showBigSketch(item) {
    const c = this.openBigView(item.label);
    const k = Math.min((W - 60) / SKETCH_PAPER_RECT.w, (H - 80) / SKETCH_PAPER_RECT.h);
    const w = SKETCH_PAPER_RECT.w * k;
    const x = (W - w) / 2;
    const y = 40;
    const s = this.add.container(x - SKETCH_PAPER_RECT.x * k, y - SKETCH_PAPER_RECT.y * k);
    drawSketchInto(this, s, item.sketch);
    s.setScale(k);
    c.add(s);
  }

  showBigTrueMap(area, m) {
    const c = this.openBigView(m ? `The real roads: ${m.title}` : 'The real roads');
    const inner = this.add.container(0, 0);
    c.add(inner);
    drawTrueMap(this, inner, { x: 30, y: 40, w: W - 60, h: H - 80 }, area);
  }

  closeBigView() {
    if (!this.bigView) return;
    this.bigView.destroy();
    this.bigView = null;
  }

  // After the last mission: every mission's final map side by side.
  showAllDone() {
    const box = this.startScreen();
    const add = box.add;
    add(this.add.text(W / 2, 30, 'All missions complete', {
      fontFamily: SANS, fontSize: '28px', fontStyle: 'bold', color: '#e6b450',
    }).setOrigin(0.5, 0));
    add(this.add.text(W / 2, 72, 'Every parcel delivered, with nothing but your own maps.', {
      fontFamily: SANS, fontSize: '15px', color: C.text,
    }).setOrigin(0.5, 0));
    const done = MISSIONS.map((m) => ({ m, arch: state.sketchArchive.find((a) => a.missionId === m.id) }))
      .filter((d) => d.arch);
    const gap = 30;
    const tw = Math.min(400, (W - 80 - gap * (done.length - 1)) / Math.max(1, done.length));
    const th = (tw * SKETCH_PAPER_RECT.h) / SKETCH_PAPER_RECT.w;
    let x = (W - (done.length * tw + (done.length - 1) * gap)) / 2;
    this.winThumbs = [];
    for (const d of done) {
      add(this.add.text(x + tw / 2, 120, d.m.title, {
        fontFamily: HAND, fontSize: '18px', color: '#e8e3d3',
      }).setOrigin(0.5, 0));
      this.addSketchThumb(box, { label: d.m.finalLabel, sketch: d.arch.sketch }, x, 156, tw, th);
      x += tw + gap;
    }
    add(this.add.text(W / 2, H - 14, 'R: start over', { fontFamily: MONO, fontSize: '14px', color: C.text }).setOrigin(0.5, 1));
  }

  // Enter on the win screen: final snapshot, then the next mission (or the
  // all-done screen after the last one).
  onContinueKey() {
    if (!state.won || !this.winShown || this.mapOpen || this.bigView || state.allMissionsDone) return;
    const next = finishMission(state);
    if (!next) {
      this.showAllDone();
      return;
    }
    this.winBox.destroy();
    this.winBox = null;
    this.winShown = false;
    this.dash.setVisible(true);
    this.currentSignId = undefined;
    this.currentMailboxId = undefined;
    state.inputLocked = false;
  }

  // ---------------------------------------------------------------- loop

  update() {
    if (this.mapOpen) return; // Map covers the screen; nothing to update.
    this.updateDash();
    this.updateSign();
    this.updateMailbox();
    this.updatePrompt();
    if (state.won && !this.winShown) this.showWin();
    if (state.briefPending && !this.dialogue && !state.won) this.showBrief();
  }
}
