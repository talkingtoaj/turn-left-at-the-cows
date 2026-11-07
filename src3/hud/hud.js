import { WORLD } from '../../src/world/world.js';
import { state } from '../../src/state.js';
import { runtime } from '../runtime.js';
import { headingText, clockText, timerText } from '../../src/hud/format.js';
import { greet, ask, listTopics } from '../../src/game/dialogue.js';
import { currentMission, currentGoal, nextMission, MISSIONS } from '../../src/game/missions.js';
import { finishMission } from '../../src/game/update.js';
import { compassHeading, warningLights, PARTS } from '../../src/game/damage.js';
import { renderSketchCanvas, renderPrintedMapCanvas, trueMapDef } from '../map/sketchRender.js';
import { openMissionCard } from '../../src/ui/missionCard.js';
import { openHelp } from '../../src/ui/help.js';
import { speak } from '../../src/audio/voice.js';
import { towedText } from '../../src/game/tow.js';
import { mountShareStrip } from '../../src/ui/mapShare.js';
import { rememberMyMap } from '../../src/game/myMaps.js';

// The HUD (a DOM/CSS port of the old 2D HUD). Shows the dash (compass, odometer,
// clock, speed, trip timer), road signs, mailboxes, the talk prompt, the
// topic menu dialogue, the goal line, the mission complete screen, and owns
// the E / M / R / Enter / H / 1-9 keys. The mission card and the help panel
// are shared DOM screens (src/ui) that take every key while open.
// Core rule: never show the player's position, a minimap or coordinates.

// Ignore M this long after the map closes, so the same keypress that
// closed it does not open it again.
const MAP_REOPEN_GUARD_MS = 150;
const DASH_W = 1080; // design width of the dash; scaled down on small screens
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
.hud-goal-line { position: absolute; top: 10px; right: 12px; padding: 4px 8px; background: rgba(20,21,23,0.7);
  color: #efe6cf; font-size: 13px; white-space: nowrap; display: none; }
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
.hud-dlg { pointer-events: auto; }
.hud-dlg.hud-paging { cursor: pointer; }
.hud-menu { list-style: none; margin: 8px 0 0; padding: 0; max-height: min(260px, 40vh); overflow-y: auto; }
.hud-menu::-webkit-scrollbar { width: 8px; }
.hud-menu::-webkit-scrollbar-thumb { background: #55585e; border-radius: 4px; }
.hud-menu li { display: flex; align-items: center; gap: 10px; padding: 4px 8px; border-radius: 5px; cursor: pointer;
  color: #ece7d8; font-size: 16px; line-height: 1.35; border: 1px solid transparent; }
.hud-menu li.hud-sel { background: rgba(230,180,80,0.14); border-color: rgba(230,180,80,0.55); }
.hud-menu .hud-key { flex: none; width: 22px; height: 22px; border-radius: 4px; background: #3a3c40; color: #e6b450;
  font: bold 13px "Courier New", Courier, monospace; text-align: center; line-height: 22px; }
.hud-menu .hud-key.hud-nokey { background: transparent; }
.hud-menu .hud-goal { color: #e6b450; }
.hud-menu .hud-bye { color: #a9acb2; font-style: italic; }
.hud-menu .hud-new { width: 6px; height: 6px; border-radius: 50%; background: #7fc29b; flex: none; margin-left: -4px; }

.hud-mailbox { position: absolute; top: 18px; left: 18px; display: none; text-align: center; }
.hud-mailbox-box { padding: 7px 14px 6px; background: #ece4cf; color: #2c2620; border: 2px solid #5b4630; border-radius: 10px 10px 3px 3px;
  font: bold 17px Georgia, serif; letter-spacing: 0.12em; box-shadow: 3px 3px 0 rgba(0,0,0,0.3); }
.hud-mailbox-box small { display: block; font: 10px Arial, sans-serif; letter-spacing: 0.05em; color: #7a6a55; margin-bottom: 1px; }
.hud-mailbox-post { width: 8px; height: 22px; margin: 0 auto; background: #5b4630; }

.hud-win-shade { position: absolute; left: 0; right: 0; top: 0; bottom: var(--hud-dash-h); background: rgba(0,0,0,0.45); display: none; }
.hud-win { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1040px, calc(100% - 32px));
  max-height: calc(100% - 24px); overflow-y: auto; pointer-events: auto;
  padding: 20px 22px 18px; background: rgba(35,37,42,0.97); border: 2px solid #e6b450; border-radius: 12px;
  box-shadow: 5px 5px 0 rgba(0,0,0,0.3); text-align: center; }
.hud-win.hud-win-small { width: min(460px, calc(100% - 32px)); padding: 26px 22px 22px; }
.hud-win h2 { margin: 0 16px 4px; color: #e6b450; font-size: 24px; }
.hud-win-sub { color: #a9acb2; font-size: 14px; margin-bottom: 14px; }
.hud-win-nosave { color: #e6b450; font-style: italic; }
.hud-win-stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 28px; margin-bottom: 16px; font-size: 16px; }
.hud-win-stats span span:first-child { color: #8a8d92; margin-right: 8px; }
.hud-win-stats span span:last-child { color: #d9d4c5; font-weight: bold; }
.hud-win-maps { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; align-items: flex-start; }
.hud-win-col h3 { margin: 0 0 8px; font-size: 13px; color: #8a8d92; font-weight: normal; letter-spacing: 0.08em; text-transform: uppercase; }
.hud-thumbs { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-width: 560px; }
.hud-thumb { width: 172px; cursor: zoom-in; text-align: left; }
.hud-thumb canvas, .hud-truth canvas { display: block; width: 100%; height: auto; border-radius: 3px;
  box-shadow: 2px 3px 0 rgba(0,0,0,0.35); outline: 1px solid rgba(255,255,255,0.08); }
.hud-thumb:hover canvas, .hud-truth:hover canvas { outline: 2px solid #e6b450; }
.hud-thumb-label { margin-top: 6px; font-size: 12px; line-height: 1.3; color: #d9d4c5; }
.hud-thumb-label small { display: block; color: #8a8d92; font-size: 11px; }
.hud-truth { width: 380px; max-width: 100%; cursor: zoom-in; }
.hud-win-foot { margin-top: 16px; font-size: 14px; color: #d9d4c5; }
.hud-win-row { display: flex; justify-content: space-between; padding: 0 50px; font-size: 17px; line-height: 30px; }
.hud-win-row span:first-child { color: #8a8d92; }
.hud-win-row span:last-child { color: #d9d4c5; font-weight: bold; }
.hud-zoom { position: absolute; inset: 0; background: rgba(0,0,0,0.78); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; pointer-events: auto; cursor: zoom-out; }
.hud-zoom canvas { display: block; box-shadow: 5px 5px 0 rgba(0,0,0,0.4); }
.hud-zoom div { color: #ece7d8; font-size: 15px; }
.hud-lights { position: absolute; left: 0; right: 0; top: 21px; display: grid; grid-template-columns: repeat(2, 30px);
  gap: 3px 8px; justify-content: center; }
.hud-light { width: 30px; height: 17px; display: block; }
.hud-light path, .hud-light circle, .hud-light rect, .hud-light line { stroke: #3c3e43; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.hud-light .hud-fill { fill: #3c3e43; stroke: none; }
.hud-light.hud-on path, .hud-light.hud-on circle, .hud-light.hud-on rect, .hud-light.hud-on line { stroke: #e6a23a; filter: drop-shadow(0 0 3px rgba(230,162,58,0.8)); }
.hud-light.hud-on .hud-fill { fill: #e6a23a; }
.hud-light.hud-bad path, .hud-light.hud-bad circle, .hud-light.hud-bad rect, .hud-light.hud-bad line { stroke: #e0503c; filter: drop-shadow(0 0 4px rgba(224,80,60,0.9)); }
.hud-light.hud-bad .hud-fill { fill: #e0503c; }
.hud-light.hud-blink { animation: hud-blink 0.9s steps(2, start) infinite; }
@keyframes hud-blink { to { visibility: hidden; } }
.hud-dev-dmg { position: absolute; top: 44px; right: 12px; padding: 6px 9px; background: rgba(0,0,0,0.65); color: #d8f0d8;
  font: 12px/1.4 "Courier New", Courier, monospace; white-space: pre; pointer-events: none; }
@media (max-width: 480px) { .hud-win-row { padding: 0 16px; } .hud-thumb { width: 140px; } }
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

// Dash warning lights, like a real car's: tyre, engine, steering, compass.
// Dark until a part is hurt, amber when worn, red and blinking when bad.
const LIGHT_ICONS = {
  // Tyre pressure: a tyre section with an exclamation mark.
  tyres: '<path d="M8 3 C4 6 4 12 8 15 M22 3 C26 6 26 12 22 15 M9 15 H21"/><line x1="15" y1="5" x2="15" y2="10"/><circle class="hud-fill" cx="15" cy="12.6" r="1.1"/>',
  // Engine block outline.
  engine: '<path d="M6 6 H18 L21 9 H24 V13 H21 V15 H9 L6 12 Z M3 8 V13 M3 10.5 H6 M10 6 V4 H15 V6"/>',
  // Steering wheel with a mark.
  steering: '<circle cx="15" cy="9" r="6.5"/><circle cx="15" cy="9" r="1.6"/><path d="M8.6 8 H13.4 M16.6 8 H21.4 M15 10.6 V15.4"/><path d="M4 3 L4 9 M26 3 L26 9"/>',
  // Compass: ring with a needle.
  compass: '<circle cx="15" cy="9" r="7"/><path d="M15 3.5 L17.2 9 L15 14.5 L12.8 9 Z"/><circle class="hud-fill" cx="15" cy="9" r="1"/>',
};
const LIGHT_TITLES = { tyres: 'Tyre', engine: 'Engine', steering: 'Steering', compass: 'Compass' };

function buildLights(parent) {
  const box = el('div', 'hud-lights', parent);
  const out = {};
  for (const k of PARTS) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 30 18');
    s.setAttribute('class', 'hud-light');
    s.innerHTML = `<title>${LIGHT_TITLES[k]}</title>${LIGHT_ICONS[k]}`;
    box.appendChild(s);
    out[k] = s;
  }
  return out;
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
  const lights = buildLights(bezel(958, 104, 'WARNING'));
  const devDmg = new URLSearchParams(window.location.search).has('damage') ? el('div', 'hud-dev-dmg', hud) : null;
  el('div', 'hud-hint', inner,
    'Arrows/WASD drive · Space handbrake · E talk · M map · C camera · B horn · N north/heading-up · K mute · H help');

  // ---------------------------------------------------------------- overlays
  const goalLine = el('div', 'hud-goal-line hud-mono', hud);
  const signBox = el('div', 'hud-sign', hud);
  const promptBox = el('div', 'hud-prompt hud-mono', hud);
  const dlgBox = el('div', 'hud-dlg', hud);
  const dlgName = el('div', 'hud-dlg-name', dlgBox);
  const dlgText = el('div', 'hud-dlg-text', dlgBox);
  const dlgMore = el('div', 'hud-dlg-more hud-mono', dlgBox);
  const dlgMenu = el('ul', 'hud-menu', dlgBox);
  const winShade = el('div', 'hud-win-shade', hud);
  const mailbox = el('div', 'hud-mailbox', hud);
  const mailboxBox = el('div', 'hud-mailbox-box', mailbox);
  el('div', 'hud-mailbox-post', mailbox);
  let zoomBox = null; // enlarged map on the complete screen

  // While a dialogue is open:
  // { npcId, title, mode: 'pages'|'menu', pages, page, after: 'menu'|'close', items, sel, newIds }
  let dialogue = null;
  // Topics already offered in a menu; the others are marked as new.
  const seenTopics = new Set(state.knownTopics);
  let currentMailboxId; // undefined forces the first render
  let mapOpen = false;
  let mapClosedAt = -Infinity;
  let currentSignId; // undefined forces the first render
  let winShown = false;
  let promptText = null;
  let card = null; // mission card while it shows
  let help = null; // how-to-play panel while it shows
  const last = {}; // last text written per element, to skip DOM writes
  let lastScaleW = -1;

  const setText = (key, node, text) => {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  };

  // ---------------------------------------------------------------- talking
  function showPage() {
    const { pages, page, after } = dialogue;
    const end = page === pages.length - 1;
    dlgBox.classList.add('hud-paging');
    dlgMenu.style.display = 'none';
    dlgText.textContent = pages[page];
    speak(dialogue.npcId, pages[page]);
    const next = end ? (after === 'menu' ? 'back' : 'close') : 'next';
    dlgMore.textContent = `${page + 1}/${pages.length}   E: ${next}   M: map`;
  }

  // Shows lines one page at a time. after: 'menu' returns to the topic menu.
  function openPages(npcId, title, pages, after) {
    if (!pages.length) {
      if (after === 'menu' && npcId) {
        dialogue = { npcId, title, mode: 'menu', pages: [], page: 0, after, sel: 0 };
        openBox();
        showMenu();
      } else closeDialogue();
      return;
    }
    dialogue = { npcId, title, mode: 'pages', pages, page: 0, after, sel: dialogue ? dialogue.sel : 0 };
    openBox();
    showPage();
  }

  function openBox() {
    state.inputLocked = true;
    dlgName.textContent = dialogue.title;
    dlgBox.style.display = 'block';
  }

  function menuItems() {
    const items = listTopics(dialogue.npcId, state).map((t) => ({ ...t }));
    items.push({ id: null, label: 'Goodbye', bye: true });
    return items;
  }

  function showMenu() {
    const d = dialogue;
    d.mode = 'menu';
    d.items = menuItems();
    d.newIds = new Set(d.items.filter((t) => t.id && !seenTopics.has(t.id)).map((t) => t.id));
    for (const t of d.items) if (t.id) seenTopics.add(t.id);
    d.sel = Math.min(d.sel || 0, d.items.length - 1);
    dlgBox.classList.remove('hud-paging');
    dlgText.textContent = 'Ask about...';
    dlgMenu.innerHTML = '';
    d.items.forEach((t, i) => {
      const li = el('li', null, dlgMenu);
      const key = i < 9 ? String(i + 1) : t.bye ? 'Esc' : '';
      const k = el('span', 'hud-key' + (key ? '' : ' hud-nokey'), li, key);
      if (key === 'Esc') k.style.width = '34px';
      const label = el('span', t.bye ? 'hud-bye' : t.isGoal ? 'hud-goal' : null, li, t.label);
      if (d.newIds.has(t.id)) {
        el('span', 'hud-new', li).title = 'new';
        label.title = 'New topic';
      }
      li.addEventListener('click', (e) => { e.stopPropagation(); pick(i); });
      li.addEventListener('mousemove', () => { if (d.sel !== i) { d.sel = i; markSel(false); } });
    });
    dlgMenu.style.display = 'block';
    dlgMore.textContent = '1-9 or Up/Down + E: ask   M: map';
    markSel(true);
  }

  function markSel(scroll) {
    const lis = dlgMenu.children;
    for (let i = 0; i < lis.length; i++) lis[i].classList.toggle('hud-sel', i === dialogue.sel);
    const li = lis[dialogue.sel];
    if (scroll && li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  function pick(i) {
    const d = dialogue;
    if (!d || d.mode !== 'menu') return;
    const t = d.items[i];
    if (!t) return;
    d.sel = i;
    if (t.bye) {
      closeDialogue();
      return;
    }
    openPages(d.npcId, d.title, ask(d.npcId, t.id, state), 'menu');
  }

  function advance() {
    const d = dialogue;
    if (!d) return;
    if (d.mode === 'menu') {
      pick(d.sel);
      return;
    }
    d.page++;
    if (d.page < d.pages.length) showPage();
    else if (d.after === 'menu') showMenu();
    else closeDialogue();
  }

  dlgBox.addEventListener('click', () => {
    if (dialogue && dialogue.mode === 'pages') advance();
  });

  // A new mission's card (title, giver, brief, goal name). The brief is
  // already in the notebook (startMission). The game is paused until it
  // closes, so the car stays put and the trip timer waits.
  function showCard() {
    state.briefPending = false;
    if (!currentMission(state)) return;
    state.inputLocked = true;
    runtime.paused = true;
    card = openMissionCard(state.missionIndex, {
      onClose: () => {
        card = null;
        runtime.paused = false;
        state.inputLocked = false;
      },
    });
  }

  // H: how-to-play as a pause overlay. Not over the map, a dialogue, the
  // mission card or the end screens.
  function onHelpKey() {
    if (help || card || mapOpen || dialogue || zoomBox || state.won) return;
    if (performance.now() - mapClosedAt < MAP_REOPEN_GUARD_MS) return;
    state.inputLocked = true;
    runtime.paused = true;
    help = openHelp({
      version: '3d',
      onClose: () => {
        help = null;
        runtime.paused = false;
        state.inputLocked = false;
      },
    });
  }

  function closeDialogue() {
    dialogue = null;
    speak(null);
    dlgBox.style.display = 'none';
    dlgMenu.innerHTML = '';
    state.inputLocked = false;
  }

  function onTalkKey() {
    if (state.won) return;
    if (dialogue) {
      advance();
      return;
    }
    const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
    if (!local) return;
    // Greeting, then the topic menu.
    dialogue = null;
    openPages(local.id, `${local.name}, ${local.role}`, greet(local.id, state), 'menu');
  }

  // Keys while a dialogue is open. Returns true if the key was used.
  function onDialogueKey(e) {
    const d = dialogue;
    const k = e.key;
    if (k === 'Escape') {
      closeDialogue();
      return true;
    }
    if (d.mode !== 'menu') return false;
    if (/^[1-9]$/.test(k)) {
      const i = Number(k) - 1;
      if (i < d.items.length) pick(i);
      return true;
    }
    const up = k === 'ArrowUp' || k === 'w' || k === 'W';
    const down = k === 'ArrowDown' || k === 's' || k === 'S';
    if (up || down) {
      const n = d.items.length;
      d.sel = (d.sel + (up ? n - 1 : 1)) % n;
      markSel(true);
      e.preventDefault();
      return true;
    }
    return false;
  }

  // Enter on the complete screen: final snapshot, then the next mission (or
  // the all done screen after the last one).
  function onContinueKey() {
    if (!state.won || !winShown || state.allMissionsDone) return;
    closeZoom();
    const next = finishMission(state);
    winShade.textContent = '';
    if (!next) {
      showAllDone();
      return;
    }
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
    currentMailboxId = undefined;
    // The map screen unlocks input on close; a dialogue or the complete
    // screen underneath still needs it locked.
    if (dialogue || winShown) state.inputLocked = true;
    // The player may have finished their map from the complete screen.
    if (winShown && !state.allMissionsDone) buildWin();
  }

  // M works while driving, during a dialogue (it comes back as it was) and
  // on the complete screen (to finish the map).
  function onMapKey() {
    if (!openMap || zoomBox || card || help || state.allMissionsDone) return;
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
    // A breakdown's tow scene (src3/tow3d.js) has the keys while it plays.
    if (state.towing) return;
    if (runtime.paused || card || help) return;
    if (zoomBox) {
      if (!e.repeat && (e.key === 'Escape' || e.key === 'Enter' || e.key.toLowerCase() === 'e')) closeZoom();
      return;
    }
    if (dialogue && onDialogueKey(e)) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e') onTalkKey();
    else if (k === 'm') onMapKey();
    else if (k === 'h') onHelpKey();
    else if (k === 'r' && state.won) window.location.reload();
    else if (e.key === 'Enter') onContinueKey();
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------- per frame
  function updateDash() {
    // The compass shows what the (maybe damaged) needle reads, not the truth.
    const shown = compassHeading(state);
    const ck = Math.round(shown * 4);
    if (last.compass !== ck) {
      last.compass = ck;
      compassCard.style.transform = `rotate(${-shown}deg)`;
    }
    setText('heading', headingTxt, headingText(shown));

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

    const { car } = state;
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

  function updateLights() {
    const w = warningLights(state.damage);
    for (const k of PARTS) {
      const cls = 'hud-light' + (w[k] === 1 ? ' hud-on' : w[k] === 2 ? ' hud-bad hud-blink' : '');
      if (last['light' + k] === cls) continue;
      last['light' + k] = cls;
      lights[k].setAttribute('class', cls);
    }
    if (devDmg && state.damage) {
      const d = state.damage;
      const txt = PARTS.map((k) => `${k.padEnd(9)}${d[k].toFixed(3)}`).join('\n')
        + `\nhits     ${d.hits}${d.stall > 0 ? '\nSTALLED' : ''}${d.brokenDown ? `\nBROKEN (${d.cause})` : ''}`
        + (d.rough ? `\nsurface  ${d.rough.surface}${d.rough.ground ? `\nground   ${d.rough.ground}\nrough    ${d.rough.r.toFixed(2)}` : ''}\nsafe     ${Number.isFinite(d.rough.safe) ? `${Math.round(d.rough.safe * 3.6)} km/h` : 'any'}`
          + `\nknock/s  ${d.rough.chance.toFixed(3)}` : '');
      setText('devDmg', devDmg, txt);
    }
  }

  // Breakdowns: the tow scene (src3/tow3d.js) takes over from here; the
  // HUD just stands aside while state.towing.

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

  function updateGoalLine() {
    const goal = state.won ? null : currentGoal(state);
    const text = goal ? `Goal: ${goal.name}` : null;
    if (text === last.goalLine) return;
    last.goalLine = text;
    goalLine.textContent = text || '';
    goalLine.style.display = text ? 'block' : 'none';
  }

  function updatePrompt() {
    const local =
      !dialogue && !card && !help && !state.won && state.nearLocalId ? WORLD.locals.find((l) => l.id === state.nearLocalId) : null;
    const text = local ? `E: talk to ${local.name} (${local.role})` : null;
    if (text === promptText) return;
    promptText = text;
    promptBox.textContent = text || '';
    promptBox.style.display = text ? 'block' : 'none';
  }

  function updateMailbox() {
    const id = state.won ? null : state.nearMailboxId || null;
    if (id === currentMailboxId) return;
    currentMailboxId = id;
    const mb = id && (WORLD.mailboxes || []).find((m) => m.id === id);
    if (!mb) {
      mailbox.style.display = 'none';
      return;
    }
    mailboxBox.textContent = '';
    el('small', null, mailboxBox, 'MAILBOX');
    mailboxBox.append(String(mb.name).toUpperCase());
    mailbox.style.display = 'block';
  }

  // ---------------------------------------------------------------- complete screen
  const truthCache = new Map(); // mission id -> canvas

  function zoomCanvas(make, caption) {
    closeZoom();
    const maxW = Math.min(window.innerWidth * 0.92, ((window.innerHeight - 80) * 840) / 576);
    zoomBox = el('div', 'hud-zoom', hud);
    const c = make(Math.max(200, Math.floor(maxW)));
    c.style.width = Math.floor(maxW) + 'px';
    zoomBox.appendChild(c);
    el('div', null, zoomBox, `${caption}   (click or Esc to close)`);
    zoomBox.addEventListener('click', closeZoom);
  }

  function closeZoom() {
    if (!zoomBox) return;
    zoomBox.remove();
    zoomBox = null;
  }

  function thumb(parent, sketch, label, sub) {
    const box = el('div', 'hud-thumb', parent);
    box.appendChild(renderSketchCanvas(sketch, 172));
    const l = el('div', 'hud-thumb-label', box, label);
    if (sub) el('small', null, l, sub);
    box.addEventListener('click', () => zoomCanvas((w) => renderSketchCanvas(sketch, w), label));
    return box;
  }

  function buildWin() {
    winShade.textContent = '';
    const m = currentMission(state);
    const panel = el('div', 'hud-win', winShade);
    const goal = currentGoal(state);
    el('h2', null, panel, `You made it to ${goal ? goal.name : 'the end'}`);
    if (m) el('div', 'hud-win-sub', panel, m.title);
    if (state.lastRecord && state.lastRecord.saved === false) {
      el('div', 'hud-win-sub hud-win-nosave', panel, 'Progress can\u2019t be saved in this window (storage is blocked).');
    }
    const stats = el('div', 'hud-win-stats hud-mono', panel);
    const rows = [
      ['Trip time', timerText(state.elapsedMs)],
      ['Distance', `${(state.odometer / 1000).toFixed(2)} km`],
      ['Clock', clockText(state.clockMinutes)],
      ['Locals asked', String(state.talkedTo.size)],
    ];
    if (state.tows) rows.push(['Towed', towedText(state.tows)]);
    for (const [k, v] of rows) {
      const r = el('span', null, stats);
      el('span', null, r, k);
      el('span', null, r, v);
    }
    if (m) {
      const maps = el('div', 'hud-win-maps', panel);
      const left = el('div', 'hud-win-col', maps);
      el('h3', null, left, 'Your maps');
      const thumbs = el('div', 'hud-thumbs', left);
      for (const snap of state.snapshots.filter((q) => q.missionId === m.id)) {
        thumb(thumbs, snap.sketch, snap.label, `${clockText(snap.clockMinutes)} · ${(snap.odometer / 1000).toFixed(1)} km`);
      }
      // The final map is saved when you continue; show it as it is now.
      thumb(thumbs, state.sketch, m.finalLabel, 'now (M to finish it)');

      const right = el('div', 'hud-win-col', maps);
      el('h3', null, right, 'The real map');
      const def = trueMapDef(m);
      let c = truthCache.get(m.id);
      if (!c) {
        c = renderPrintedMapCanvas(def, 380);
        truthCache.set(m.id, c);
      }
      const t = el('div', 'hud-truth', right);
      t.appendChild(c);
      t.addEventListener('click', () => zoomCanvas((w) => renderPrintedMapCanvas(def, w), 'The real map'));

      // Shared maps (src/ui/mapShare.js): share yours, see other drivers'.
      // Your map is also kept in the browser for the start screen's Maps page.
      rememberMyMap(m.id, state.sketch);
      mountShareStrip(panel, {
        missionId: m.id,
        missionTitle: m.title,
        region: m.region,
        seed: WORLD.seed,
        shareKey: `${m.id}:${state.sketchEpoch}`,
        getSketch: () => state.sketch,
        stats: { timeMs: state.elapsedMs, km: state.odometer / 1000, tows: state.tows || 0 },
      });
    }
    el('div', 'hud-win-foot hud-mono', panel,
      nextMission(state)
        ? 'Enter: continue to next mission · M: finish your map · R: start over'
        : 'Enter: finish · M: finish your map · R: start over');
    winShade.style.display = 'block';
  }

  function showWin() {
    winShown = true;
    if (dialogue) closeDialogue();
    state.inputLocked = true;
    buildWin();
  }

  function showAllDone() {
    winShade.textContent = '';
    const panel = el('div', 'hud-win hud-win-small', winShade);
    el('h2', null, panel, 'All deliveries done');
    el('div', 'hud-win-sub', panel, 'Every job is finished. Thanks for driving.');
    const rows = [
      ['Missions', String(MISSIONS.length)],
      ['Maps drawn', String(state.snapshots.length)],
      ['Notes taken', String(state.notebook.length)],
      ['Clock', clockText(state.clockMinutes)],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'hud-win-row hud-mono', panel);
      el('span', null, r, k);
      el('span', null, r, v);
    }
    el('div', 'hud-win-foot hud-mono', panel, 'R: start over');
    winShade.style.display = 'block';
    state.inputLocked = true;
  }

  function update() {
    if (mapOpen) {
      if (runtime.paused) return; // map covers the screen
      markMapClosed();
    }
    updateDash();
    updateLights();
    if (state.towing) {
      if (dialogue) closeDialogue();
      if (promptText) {
        promptText = null;
        promptBox.style.display = 'none';
      }
      return;
    }
    updateSign();
    updateMailbox();
    updatePrompt();
    updateGoalLine();
    if (dialogue || winShown || card || help) state.inputLocked = true;
    if (state.won && !winShown) showWin();
    if (state.briefPending && !dialogue && !state.won && !card && !help) showCard();
  }

  return { update };
}
