import { WORLD } from '../../src/world/world.js';
import { state } from '../../src/state.js';
import { runtime } from '../runtime.js';
import { headingText, clockText, timerText } from '../../src/hud/format.js';
import { quickTalk, getNpc } from '../../src/game/dialogue.js';
import { currentMission, currentGoal, nextMission } from '../../src/game/missions.js';
import { finishMission } from '../../src/game/update.js';

// DOM/CSS port of the Phaser HUDScene. Shows the dash (compass, odometer,
// clock, speed, trip timer), road signs, the talk prompt and dialogue, the
// win panel, and owns the E / M / R keys.
// Core rule: never show the player's position, a minimap or coordinates.

// Ignore M this long after the map closes, so the same keypress that
// closed it does not open it again.
const MAP_REOPEN_GUARD_MS = 150;
const DASH_W = 960; // design width of the dash; scaled down on small screens
const ODO_CELL_H = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS = `
.hud-root { --hud-dash-h: 92px; position: absolute; inset: 0; pointer-events: none; font-family: Arial, Helvetica, sans-serif; }
.hud-root * { box-sizing: border-box; }
.hud-mono { font-family: "Courier New", Courier, monospace; }

.hud-dash { position: absolute; left: 0; right: 0; bottom: 0; height: var(--hud-dash-h); background: #1c1d1f;
  border-top: 3px solid #3a3c40; box-shadow: 0 -4px 0 rgba(0,0,0,0.25); overflow: hidden; }
.hud-dash-inner { position: absolute; left: 50%; bottom: 0; width: ${DASH_W}px; height: 89px;
  transform-origin: 50% 100%; transform: translateX(-50%); }
.hud-bezel { position: absolute; top: 7px; height: 60px; background: #2a2c30; border-radius: 8px; }
.hud-label { position: absolute; top: 5px; left: 0; right: 0; text-align: center; font-size: 11px; color: #8a8d92; }
.hud-gauge { position: absolute; left: 0; right: 0; top: 22px; text-align: center; color: #e6b450; font-weight: bold;
  font-family: "Courier New", Courier, monospace; line-height: 32px; white-space: nowrap; }
.hud-compass { position: absolute; left: 22px; top: 1px; width: 80px; height: 80px; }
.hud-compass-card { transform-origin: 40px 40px; }
.hud-odo { position: absolute; left: 50%; top: 19px; transform: translateX(-50%); display: flex; gap: 3px;
  background: #0c0c0d; padding: 4px 5px; border-radius: 4px; }
.hud-odo-cell { position: relative; width: 24px; height: ${ODO_CELL_H}px; overflow: hidden; background: #222326; }
.hud-odo-cell.hud-frac { background: #d9d4c5; }
.hud-odo-cell::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.45)); }
.hud-odo-strip { position: absolute; left: 0; top: 0; width: 100%; will-change: transform; }
.hud-odo-strip div { height: ${ODO_CELL_H}px; line-height: ${ODO_CELL_H}px; text-align: center; font-size: 22px;
  font-weight: bold; color: #e8e3d3; font-family: "Courier New", Courier, monospace; }
.hud-frac .hud-odo-strip div { color: #1c1d1f; }
.hud-odo-dot { width: 5px; position: relative; }
.hud-odo-dot::before { content: ''; position: absolute; left: 0; bottom: 3px; width: 4px; height: 4px;
  border-radius: 50%; background: #d9d4c5; }
.hud-speed { position: absolute; left: 0; right: 58px; top: 22px; text-align: right; color: #e6b450;
  font: bold 28px "Courier New", Courier, monospace; line-height: 32px; }
.hud-unit { position: absolute; left: 86px; top: 32px; font-size: 13px; color: #8a8d92; }
.hud-gear { position: absolute; right: 12px; top: 5px; font-size: 11px; color: #c96a5a; font-weight: bold; }
.hud-hint { position: absolute; left: 0; right: 0; bottom: 2px; text-align: center; font-size: 12px; color: #8a8d92; }

.hud-sign { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); min-width: 160px;
  padding: 16px 24px; border-radius: 10px; text-align: center; font-weight: bold; font-size: 20px; line-height: 1.3;
  white-space: pre; box-shadow: 3px 3px 0 rgba(0,0,0,0.3); display: none; }
.hud-sign.hud-green { background: #2e6a47; color: #f2f2ea; outline: 2px solid #f2f2ea; outline-offset: -6px; }
.hud-sign.hud-warn { background: #f4f1ea; color: #b3261e; outline: 6px solid #b3261e; outline-offset: -8px; }

.hud-prompt { position: absolute; left: 50%; bottom: calc(var(--hud-dash-h) + 22px); transform: translate(-50%, 50%); padding: 6px 12px;
  background: rgba(20,21,23,0.82); color: #f0ead8; font-size: 15px; white-space: nowrap; display: none; }

.hud-dlg { position: absolute; left: 50%; bottom: calc(var(--hud-dash-h) + 14px); transform: translateX(-50%); width: min(760px, calc(100% - 32px));
  min-height: 150px; padding: 14px 20px 32px; background: rgba(35,37,42,0.96); border: 2px solid #6b6e74;
  border-radius: 10px; box-shadow: 4px 4px 0 rgba(0,0,0,0.3); display: none; }
.hud-dlg-name { color: #e6b450; font-weight: bold; font-size: 16px; margin-bottom: 10px; }
.hud-dlg-text { color: #ece7d8; font-size: 17px; line-height: 1.45; }
.hud-dlg-more { position: absolute; right: 16px; bottom: 10px; font-size: 12px; color: #8a8d92; }

.hud-win-shade { position: absolute; left: 0; right: 0; top: 0; bottom: var(--hud-dash-h); background: rgba(0,0,0,0.45); display: none; }
.hud-win { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100% - 32px));
  padding: 26px 0 22px; background: rgba(35,37,42,0.97); border: 2px solid #e6b450; border-radius: 12px;
  box-shadow: 5px 5px 0 rgba(0,0,0,0.3); text-align: center; }
.hud-win h2 { margin: 0 16px 24px; color: #e6b450; font-size: 24px; }
.hud-win-row { display: flex; justify-content: space-between; padding: 0 70px; font-size: 17px; line-height: 30px; }
.hud-win-row span:first-child { color: #8a8d92; }
.hud-win-row span:last-child { color: #d9d4c5; font-weight: bold; }
.hud-win-foot { margin-top: 18px; font-size: 14px; color: #d9d4c5; }
@media (max-width: 480px) { .hud-win-row { padding: 0 24px; } }
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement('style');
  el.dataset.owner = 'hud';
  el.textContent = CSS;
  document.head.appendChild(el);
}

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// A compass card that turns under a fixed red lubber mark, like a real
// dash compass: the direction you face is always at the top.
function buildCompass(parent) {
  const R = 36;
  const s = svg('svg', { class: 'hud-compass', viewBox: '0 0 80 80' }, parent);
  svg('circle', { cx: 40, cy: 40, r: R + 3, fill: '#0f1011', stroke: '#55585e', 'stroke-width': 2 }, s);
  const card = svg('g', { class: 'hud-compass-card' }, s);
  svg('circle', { cx: 40, cy: 40, r: R, fill: '#24262a' }, card);
  for (let a = 0; a < 360; a += 15) {
    const major = a % 45 === 0;
    const rad = ((a - 90) * Math.PI) / 180;
    const r0 = major ? R - 8 : R - 5;
    svg('line', {
      x1: 40 + Math.cos(rad) * r0, y1: 40 + Math.sin(rad) * r0,
      x2: 40 + Math.cos(rad) * R, y2: 40 + Math.sin(rad) * R,
      stroke: major ? '#d9d4c5' : '#7a7d82', 'stroke-width': major ? 2 : 1,
    }, card);
  }
  // Cardinal letters sit on the card and turn with it.
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => {
    const g = svg('g', { transform: `rotate(${a} 40 40)` }, card);
    const txt = svg('text', {
      x: 40, y: 40 - (R - 17), 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': '"Courier New", Courier, monospace', 'font-size': 13, 'font-weight': 'bold',
      fill: t === 'N' ? '#d0614f' : '#d9d4c5',
    }, g);
    txt.textContent = t;
  });
  // Fixed lubber mark (red triangle at 12 o'clock) and a centre pin.
  svg('polygon', { points: `35,${40 - R - 4} 45,${40 - R - 4} 40,${40 - R + 7}`, fill: '#d0614f' }, s);
  svg('circle', { cx: 40, cy: 40, r: 3, fill: '#55585e' }, s);
  return card;
}

// Mechanical odometer: one rolling drum per digit, the last two (tenths and
// hundredths of a km) inverted like a classic trip meter.
function buildOdometer(parent) {
  const box = el('div', 'hud-odo', parent);
  const strips = [];
  for (let i = 0; i < 6; i++) {
    if (i === 4) el('div', 'hud-odo-dot', box);
    const cell = el('div', 'hud-odo-cell' + (i >= 4 ? ' hud-frac' : ''), box);
    const strip = el('div', 'hud-odo-strip', cell);
    for (let d = 0; d <= 10; d++) el('div', null, strip, String(d % 10));
    strips.push(strip);
  }
  return strips;
}

export function createHUD(root, { openMap } = {}) {
  injectStyle();
  const hud = el('div', 'hud-root', root);

  // ---------------------------------------------------------------- dash
  const dash = el('div', 'hud-dash hud-mono', hud);
  const inner = el('div', 'hud-dash-inner', dash);
  const compassCard = buildCompass(inner);

  const bezel = (x, w, label) => {
    const b = el('div', 'hud-bezel', inner);
    b.style.left = `${x}px`;
    b.style.width = `${w}px`;
    el('div', 'hud-label', b, label);
    return b;
  };
  const headingTxt = el('div', 'hud-gauge', bezel(118, 120, 'HEADING'));
  headingTxt.style.fontSize = '22px';
  const odoStrips = buildOdometer(bezel(256, 210, 'TRIP km'));
  const speedBox = bezel(484, 140, 'SPEED');
  const speedTxt = el('div', 'hud-speed', speedBox, '0');
  el('div', 'hud-unit', speedBox, 'km/h');
  const gearTxt = el('div', 'hud-gear', speedBox);
  const clockTxt = el('div', 'hud-gauge', bezel(642, 130, 'CLOCK'));
  clockTxt.style.fontSize = '26px';
  const timerTxt = el('div', 'hud-gauge', bezel(790, 150, 'TRIP TIME'));
  timerTxt.style.fontSize = '18px';
  el('div', 'hud-hint', inner, 'Arrows/WASD drive · Space handbrake · E talk · M map · C camera');

  // ---------------------------------------------------------------- overlays
  const signBox = el('div', 'hud-sign', hud);
  const promptBox = el('div', 'hud-prompt hud-mono', hud);
  const dlgBox = el('div', 'hud-dlg', hud);
  const dlgName = el('div', 'hud-dlg-name', dlgBox);
  const dlgText = el('div', 'hud-dlg-text', dlgBox);
  const dlgMore = el('div', 'hud-dlg-more hud-mono', dlgBox);
  const winShade = el('div', 'hud-win-shade', hud);

  let dialogue = null; // { title, pages, page } while a dialogue is open
  let mapOpen = false;
  let mapClosedAt = -Infinity;
  let currentSignId; // undefined forces the first render
  let winShown = false;
  let promptText = null;
  const last = {}; // last text written per element, to skip DOM writes
  let lastScaleW = -1;

  const setText = (key, node, text) => {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  };

  // ---------------------------------------------------------------- talking
  function showPage() {
    const { pages, page } = dialogue;
    const end = page === pages.length - 1;
    dlgText.textContent = pages[page];
    dlgMore.textContent = `${page + 1}/${pages.length}   E: ${end ? 'close' : 'next'}`;
  }

  function openDialogue(title, pages) {
    if (!pages.length) return;
    dialogue = { title, pages, page: 0 };
    state.inputLocked = true;
    dlgName.textContent = title;
    dlgBox.style.display = 'block';
    showPage();
  }

  // A new mission's brief, from whoever gave it.
  function showBrief() {
    state.briefPending = false;
    const m = currentMission(state);
    if (!m) return;
    const giver = m.giverNpcId && getNpc(m.giverNpcId);
    openDialogue(giver ? `${giver.name}: ${m.title}` : m.title, m.brief);
  }

  function closeDialogue() {
    dialogue = null;
    dlgBox.style.display = 'none';
    state.inputLocked = false;
  }

  function onTalkKey() {
    if (state.won) return;
    if (dialogue) {
      dialogue.page++;
      if (dialogue.page >= dialogue.pages.length) closeDialogue();
      else showPage();
      return;
    }
    const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
    if (!local) return;
    // Greeting, then what they know about the current mission's goal.
    // (A full topic menu comes later; see src/game/dialogue.js.)
    openDialogue(`${local.name}, ${local.role}`, quickTalk(local.id, state));
  }

  // Enter on the win screen: final snapshot, then the next mission.
  function onContinueKey() {
    if (!state.won || !winShown || !nextMission(state)) return;
    finishMission(state);
    winShade.textContent = '';
    winShade.style.display = 'none';
    winShown = false;
    currentSignId = undefined;
    state.inputLocked = false;
  }

  // ---------------------------------------------------------------- map
  function markMapClosed() {
    mapOpen = false;
    mapClosedAt = performance.now();
    hud.style.display = '';
    currentSignId = undefined; // redraw the sign now we are back
  }

  function onMapKey() {
    if (dialogue || state.won || !openMap) return;
    if (performance.now() - mapClosedAt < MAP_REOPEN_GUARD_MS) return;
    mapOpen = true;
    hud.style.display = 'none';
    openMap();
  }

  function onKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (mapOpen) {
      // The key that closed the map can reach us in the same tick; note the
      // close now so the reopen guard covers it.
      if (!runtime.paused) markMapClosed();
      return;
    }
    if (runtime.paused) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e') onTalkKey();
    else if (k === 'm') onMapKey();
    else if (k === 'r' && state.won) window.location.reload();
    else if (e.key === 'Enter') onContinueKey();
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------- per frame
  function updateDash() {
    const { car } = state;
    compassCard.style.transform = `rotate(${-car.heading}deg)`;
    setText('heading', headingTxt, headingText(car.heading));

    // Rolling drums: the last drum turns smoothly, each higher drum rolls
    // only while every drum below it is passing from 9 to 0.
    const v = Math.min(state.odometer / 10, 999999.99); // hundredths of a km
    const frac = v % 1;
    for (let i = 0; i < 6; i++) {
      const place = 10 ** (5 - i);
      const d = Math.floor(v / place) % 10;
      const below = v % place; // value of the drums to the right, in hundredths
      const roll = i === 5 ? frac : Math.max(0, below - (place - 1));
      const y = -(d + roll) * ODO_CELL_H;
      const key = 'odo' + i;
      if (last[key] !== y) {
        last[key] = y;
        odoStrips[i].style.transform = `translateY(${y}px)`;
      }
    }

    setText('speed', speedTxt, String(Math.round(Math.abs(car.speed) * 3.6)));
    setText('gear', gearTxt, car.speed < -0.2 ? 'REV' : '');
    setText('clock', clockTxt, clockText(state.clockMinutes));
    setText('timer', timerTxt, timerText(state.elapsedMs));

    // Fit the fixed-width dash on narrow screens.
    const w = window.innerWidth;
    if (w !== lastScaleW) {
      lastScaleW = w;
      const s = Math.min(1, w / (DASH_W + 16));
      inner.style.transform = `translateX(-50%) scale(${s})`;
      hud.style.setProperty('--hud-dash-h', `${Math.round(92 * s)}px`);
    }
  }

  function updateSign() {
    const id = state.won ? null : state.nearSignId;
    if (id === currentSignId) return;
    currentSignId = id;
    const sign = id && WORLD.signs.find((s) => s.id === id);
    if (!sign) {
      signBox.style.display = 'none';
      return;
    }
    // Warning signs (closures) get the red and white look, the rest are
    // green direction signs.
    const warn = sign.lines.some((l) => /\b(OUT|CLOSED)\b/i.test(l));
    signBox.className = 'hud-sign ' + (warn ? 'hud-warn' : 'hud-green');
    signBox.textContent = sign.lines.join('\n');
    signBox.style.display = 'block';
  }

  function updatePrompt() {
    const local =
      !dialogue && !state.won && state.nearLocalId ? WORLD.locals.find((l) => l.id === state.nearLocalId) : null;
    const text = local ? `E: talk to ${local.name} (${local.role})` : null;
    if (text === promptText) return;
    promptText = text;
    promptBox.textContent = text || '';
    promptBox.style.display = text ? 'block' : 'none';
  }

  function showWin() {
    winShown = true;
    if (dialogue) closeDialogue();
    state.inputLocked = true;
    const panel = el('div', 'hud-win', winShade);
    const goal = currentGoal(state);
    el('h2', null, panel, `You made it to ${goal ? goal.name : 'the end'}`);
    const rows = [
      ['Trip time', timerText(state.elapsedMs)],
      ['Distance', `${(state.odometer / 1000).toFixed(2)} km`],
      ['Clock', clockText(state.clockMinutes)],
      ['Locals asked', String(state.talkedTo.size)],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'hud-win-row hud-mono', panel);
      el('span', null, r, k);
      el('span', null, r, v);
    }
    el('div', 'hud-win-foot hud-mono', panel,
      nextMission(state) ? 'Enter: continue to next mission · R: start over' : 'Press R to drive again');
    winShade.style.display = 'block';
  }

  function update() {
    if (mapOpen) {
      if (runtime.paused) return; // map covers the screen
      markMapClosed();
    }
    updateDash();
    updateSign();
    updatePrompt();
    if (state.won && !winShown) showWin();
    if (state.briefPending && !dialogue && !state.won) showBrief();
  }

  return { update };
}
