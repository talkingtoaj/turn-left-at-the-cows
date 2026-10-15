import Phaser from 'phaser';
import { WORLD } from '../world/world.js';
import { state } from '../state.js';
import { headingText, clockText, timerText, odoDigits } from '../hud/format.js';
import { quickTalk, getNpc } from '../game/dialogue.js';
import { currentMission, currentGoal, nextMission } from '../game/missions.js';
import { finishMission } from '../game/update.js';

// Transparent overlay on top of Drive. Shows the dash (compass, odometer,
// clock, speed, trip timer), road signs, the talk prompt and dialogue, the
// win panel, and owns the E / M / R keys.
// Core rule: never show the player's position, a minimap or coordinates.

const W = 960;
const H = 640;
const DASH_H = 92;
const DASH_Y = H - DASH_H;

const MONO = '"Courier New", Courier, monospace';
const SANS = 'Arial, Helvetica, sans-serif';

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

export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUD');
  }

  create() {
    this.scene.bringToTop();

    this.dialogue = null; // { title, pages, page } while a dialogue is open
    this.mapOpen = false;
    this.mapClosedAt = -Infinity;
    this.currentSignId = undefined;
    this.winShown = false;

    this.buildDash();
    this.buildSignPanel();
    this.buildPrompt();
    this.buildDialogue();

    // Keys. HUD is never paused, so it keeps receiving input while Map is open.
    const kb = this.input.keyboard;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyR = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyEnter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.keyEnter.on('down', () => this.onContinueKey());
    this.keyE.on('down', () => this.onTalkKey());
    this.keyM.on('down', () => this.onMapKey());
    this.keyR.on('down', () => {
      if (state.won) window.location.reload();
    });

    // Map tells us when it closes. Also watch its shutdown as a fallback.
    this.onMapClosed = () => {
      if (!this.mapOpen) return;
      this.mapOpen = false;
      this.mapClosedAt = this.time.now;
      this.dash.setVisible(true);
    };
    this.game.events.on('map-closed', this.onMapClosed);
    const mapScene = this.scene.get('Map');
    if (mapScene) mapScene.events.on('shutdown', this.onMapClosed);

    this.events.once('shutdown', () => {
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
      .text(W / 2, H - 9, 'Arrows/WASD drive · E talk · M map', { fontFamily: MONO, fontSize: '12px', color: C.label })
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
    const w = 760;
    const h = 150;
    const x = (W - w) / 2;
    const y = DASH_Y - h - 14;
    this.dlgBox = this.add.container(0, 0).setVisible(false);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 4, y + 4, w, h, 10);
    g.fillStyle(0x23252a, 0.96).fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, 0x6b6e74, 1).strokeRoundedRect(x, y, w, h, 10);

    this.dlgName = this.add.text(x + 20, y + 14, '', {
      fontFamily: SANS,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#e6b450',
    });
    this.dlgText = this.add.text(x + 20, y + 42, '', {
      fontFamily: SANS,
      fontSize: '17px',
      color: '#ece7d8',
      lineSpacing: 5,
      wordWrap: { width: w - 40, useAdvancedWrap: true },
    });
    this.dlgMore = this.add
      .text(x + w - 16, y + h - 12, '', { fontFamily: MONO, fontSize: '12px', color: C.label })
      .setOrigin(1, 1);

    this.dlgBox.add([g, this.dlgName, this.dlgText, this.dlgMore]);
  }

  onTalkKey() {
    if (this.mapOpen || state.won) return;

    if (this.dialogue) {
      // Next page, or close on the last one.
      this.dialogue.page++;
      if (this.dialogue.page >= this.dialogue.pages.length) this.closeDialogue();
      else this.showPage();
      return;
    }

    const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
    if (!local) return;
    // Greeting, then what they know about the current mission's goal.
    // (A full topic menu comes later; see src/game/dialogue.js.)
    this.openDialogue(`${local.name}, ${local.role}`, quickTalk(local.id, state));
  }

  openDialogue(title, pages) {
    if (!pages.length) return;
    this.dialogue = { title, pages, page: 0 };
    state.inputLocked = true;
    this.dlgName.setText(title);
    this.dlgBox.setVisible(true);
    this.showPage();
  }

  showPage() {
    const { pages, page } = this.dialogue;
    const last = page === pages.length - 1;
    this.dlgText.setText(pages[page]);
    this.dlgMore.setText(`${page + 1}/${pages.length}   E: ${last ? 'close' : 'next'}`);
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
    if (this.mapOpen || this.dialogue || state.won) return;
    if (this.time.now - this.mapClosedAt < MAP_REOPEN_GUARD_MS) return;

    this.mapOpen = true;
    state.inputLocked = true;
    this.dash.setVisible(false);
    this.signBox.setVisible(false);
    this.promptTxt.setVisible(false);
    this.currentSignId = undefined; // redraw the sign after the map closes
    this.scene.pause('Drive');
    this.scene.launch('Map');
  }

  // ---------------------------------------------------------------- win

  showWin() {
    this.winShown = true;
    this.winBox = this.add.container(0, 0);
    const add = (o) => {
      this.winBox.add(o);
      return o;
    };
    if (this.dialogue) this.closeDialogue();
    state.inputLocked = true;
    this.promptTxt.setVisible(false);
    this.signBox.setVisible(false);

    const w = 440;
    const h = 260;
    const x = (W - w) / 2;
    const y = (DASH_Y - h) / 2;

    const shade = add(this.add.graphics());
    shade.fillStyle(0x000000, 0.45).fillRect(0, 0, W, DASH_Y);
    shade.fillStyle(0x000000, 0.3).fillRoundedRect(x + 5, y + 5, w, h, 12);
    shade.fillStyle(0x23252a, 0.97).fillRoundedRect(x, y, w, h, 12);
    shade.lineStyle(2, 0xe6b450, 1).strokeRoundedRect(x, y, w, h, 12);

    const goal = currentGoal(state);
    add(this.add
      .text(W / 2, y + 26, `You made it to ${goal ? goal.name : 'the end'}`, {
        fontFamily: SANS,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#e6b450',
      })
      .setOrigin(0.5, 0));

    const talked = state.talkedTo.size;
    const rows = [
      ['Trip time', timerText(state.elapsedMs)],
      ['Distance', `${(state.odometer / 1000).toFixed(2)} km`],
      ['Clock', clockText(state.clockMinutes)],
      ['Locals asked', `${talked}`],
    ];
    rows.forEach(([k, v], i) => {
      const ry = y + 80 + i * 30;
      add(this.add.text(x + 70, ry, k, { fontFamily: MONO, fontSize: '17px', color: C.label }));
      add(this.add.text(x + w - 70, ry, v, { fontFamily: MONO, fontSize: '17px', color: C.text, fontStyle: 'bold' }).setOrigin(1, 0));
    });

    const foot = nextMission(state) ? 'Enter: continue to next mission   R: start over' : 'Press R to drive again';
    add(this.add
      .text(W / 2, y + h - 22, foot, { fontFamily: MONO, fontSize: '14px', color: C.text })
      .setOrigin(0.5, 1));
  }

  // Enter on the win screen: final snapshot, then the next mission.
  onContinueKey() {
    if (!state.won || !this.winShown || this.mapOpen || !nextMission(state)) return;
    finishMission(state);
    this.winBox.destroy();
    this.winBox = null;
    this.winShown = false;
    this.currentSignId = undefined;
    state.inputLocked = false;
  }

  // ---------------------------------------------------------------- loop

  update() {
    if (this.mapOpen) return; // Map covers the screen; nothing to update.
    this.updateDash();
    this.updateSign();
    this.updatePrompt();
    if (state.won && !this.winShown) this.showWin();
    if (state.briefPending && !this.dialogue && !state.won) this.showBrief();
  }
}
