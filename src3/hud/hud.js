import { WORLD } from '../../src/world/world.js';
import { state } from '../../src/state.js';
import { repairCar } from '../../src/game/repair.js';
import { runtime } from '../runtime.js';
import { headingText, clockText, timerText } from '../../src/hud/format.js';
import { mphFromMps, odometerHundredths, milesText } from '../../src/units.js';
import { noteLandmark } from '../../src/game/dialogue.js';
import { createTalk } from './talk.js';
import { currentMission, currentGoal, nextMission, MISSIONS } from '../../src/game/missions.js';
import { finishMission } from '../../src/game/update.js';
import { compassHeading, warningLights, PARTS } from '../../src/game/damage.js';
import { renderSketchCanvas, renderPrintedMapCanvas, trueMapDef, renderShiftMapCanvas, SHIFT_CROP } from '../map/sketchRender.js';
import { printedMapsFor } from '../../src/game/printedMaps.js';
import { mapWithShifts, shiftTally, shiftCountText, realMapDef, PRESENT_YEAR } from '../../src/game/shifts.js';
import { openMissionCard } from '../../src/ui/missionCard.js';
import { openIntroCard, introSeen } from '../../src/ui/introCard.js';
import { openHelp } from '../../src/ui/help.js';
import { towedText } from '../../src/game/tow.js';
import { mountShareStrip } from '../../src/ui/mapShare.js';
import { rememberMyMap } from '../../src/game/myMaps.js';
import { touristTicks } from '../../src/game/tourists.js';
import { createRadioDial } from './radioDial.js';
import { createRadioSubs } from './radioSubs.js';

// The HUD (a DOM/CSS port of the old 2D HUD). Shows the dash (compass, odometer,
// clock, speed, trip timer), the talk prompt, the conversation (./talk.js), the goal line, the mission complete screen, and owns
// the E / M / R / Enter / H / 1-9 keys. The mission card and the help panel
// are shared DOM screens (src/ui) that take every key while open.
// Core rule: never show the player's position, a minimap or coordinates.

// Ignore M this long after the map closes, so the same keypress that
// closed it does not open it again.
const MAP_REOPEN_GUARD_MS = 150;
const DASH_W = 810; // design width of the dash; scaled down on small screens
const DASH_H = 61; // inner height; the dash is 3px more with its edge
const ODO_CELL_H = 26;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CSS = `
#ui > .hud-root, .hud-root { --hud-dash-h: ${DASH_H + 3}px; position: absolute; inset: 0; pointer-events: none; font-family: Arial, Helvetica, sans-serif; }
.hud-root * { box-sizing: border-box; }
.hud-mono { font-family: "Courier New", Courier, monospace; }

/* The dash (issue 7): slim, in the splash style. Dash #1c1d1f / #3a3c40, paper #f1ead6,
   ink #3a3128, amber #e6b450, barn red #b3261e. Labels are Oswald, like the splash. */
.hud-dash { position: absolute; left: 0; right: 0; bottom: 0; height: var(--hud-dash-h);
  background: linear-gradient(#3a3c40, #1c1d1f 14px), #1c1d1f; border-top: 1px solid #4a4c51;
  box-shadow: 0 -3px 0 rgba(0,0,0,0.25); overflow: hidden; }
.hud-dash-inner { position: absolute; left: 50%; bottom: 0; width: ${DASH_W}px; height: ${DASH_H}px;
  transform-origin: 50% 100%; transform: translateX(-50%); }
.hud-oswald { font-family: Oswald, "Arial Narrow", Impact, sans-serif; }
.hud-bezel { position: absolute; top: 6px; height: 52px; background: #26282b; border-radius: 6px;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.55); }
.hud-label { position: absolute; top: 3px; left: 0; right: 0; text-align: center; font: 500 9px Oswald, "Arial Narrow", sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase; color: #a89f88; }
.hud-gauge { position: absolute; left: 0; right: 0; top: 17px; text-align: center; color: #e6b450; font-weight: 500;
  font-family: Oswald, "Arial Narrow", Impact, sans-serif; letter-spacing: 0.04em; line-height: 30px; white-space: nowrap; }
.hud-gauge.hud-cream { color: #f1ead6; }
.hud-compass { position: absolute; left: 14px; top: 3px; width: 56px; height: 56px; }
.hud-compass-card { transform-origin: 40px 40px; }
.hud-odo { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); display: flex; gap: 2px;
  background: #0c0c0d; padding: 3px 4px; border-radius: 3px; }
.hud-odo-cell { position: relative; width: 17px; height: ${ODO_CELL_H}px; overflow: hidden; background: #222326; border-radius: 1px; }
.hud-odo-cell.hud-frac { background: #f1ead6; }
.hud-odo-cell::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0) 24%, rgba(0,0,0,0) 76%, rgba(0,0,0,0.5)); }
.hud-odo-strip { position: absolute; left: 0; top: 0; width: 100%; will-change: transform; }
.hud-odo-strip div { height: ${ODO_CELL_H}px; line-height: ${ODO_CELL_H}px; text-align: center; font-size: 18px;
  font-weight: 500; color: #f1ead6; font-family: Oswald, "Arial Narrow", Impact, sans-serif; }
.hud-frac .hud-odo-strip div { color: #3a3128; }
.hud-odo-dot { width: 4px; position: relative; }
.hud-odo-dot::before { content: ''; position: absolute; left: 0; bottom: 2px; width: 3px; height: 3px;
  border-radius: 50%; background: #f1ead6; }
.hud-speedo { position: absolute; left: 350px; top: 1px; width: 60px; height: 60px; }
.hud-needle { transform-origin: 50px 50px; transition: transform 0.12s linear; }
.hud-gear { position: absolute; left: 350px; width: 60px; top: 44px; text-align: center; font: 500 9px Oswald, sans-serif;
  letter-spacing: 0.1em; color: #d0614f; }
.hud-goal-tag { position: absolute; top: 14px; left: 14px; max-width: min(320px, calc(100% - 40px)); padding: 3px 16px 5px 12px;
  background: #f1ead6; color: #3a3128; border: 1px solid #c9bd9f; border-radius: 3px 8px 8px 3px;
  box-shadow: 2px 3px 6px rgba(0,0,0,0.35); transform: rotate(-1.5deg); display: none;
  font: 500 24px/1.05 Caveat, "Segoe Print", cursive; }
.hud-goal-tag small { display: block; font: 500 9px/1 Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.16em;
  text-transform: uppercase; color: #8a7a5c; margin-bottom: 1px; }
.hud-goal-tag::after { content: ''; position: absolute; right: 4px; top: 50%; width: 6px; height: 6px; margin-top: -3px;
  border-radius: 50%; background: radial-gradient(circle at 35% 35%, #e0574a, #b3261e 60%, #7c1812); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
.hud-hint { position: absolute; left: 0; right: 0; bottom: calc(var(--hud-dash-h) + 6px); text-align: center; font: 12px Oswald, "Arial Narrow", sans-serif;
  letter-spacing: 0.06em; color: #f1ead6; text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.6);
  opacity: 1; transition: opacity 1.6s ease; }
.hud-hint.hud-faded { opacity: 0; }
/* Radio slot: an empty, labelled box at the right end of the dash. Issue 19 (radio)
   puts its tuning dial inside #hud-radio-slot. Built for a dial up to 52px across. */
.hud-radio-slot { position: absolute; left: 746px; top: 6px; width: 58px; height: 52px; border-radius: 6px;
  background: #26282b; box-shadow: inset 0 1px 3px rgba(0,0,0,0.55); overflow: hidden; }
.hud-radio-slot::after { content: attr(data-label); position: absolute; left: 0; right: 0; bottom: 2px; text-align: center;
  font: 500 9px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.14em; color: #a89f88; pointer-events: none; }
.hud-dash { transition: transform 0.4s ease; }
.hud-dash.hud-foot { transform: translateY(14px); background: rgba(28,29,31,0.55); border-top-color: rgba(58,60,64,0.5); }
.hud-dash.hud-foot .hud-bezel, .hud-dash.hud-foot .hud-radio-slot { opacity: 0.35; }
.hud-dash.hud-foot .hud-compass { filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)); }


.hud-prompt { position: absolute; left: 50%; bottom: calc(var(--hud-dash-h) + 22px); transform: translate(-50%, 50%); padding: 6px 12px;
  background: rgba(20,21,23,0.82); color: #f0ead8; font-size: 15px; white-space: nowrap; display: none; }


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
.hud-win-arrival { margin: 0 16px 14px; color: #d9d4c5; font-size: 16px; font-style: italic; }
.hud-win-arrival b { color: #e6b450; font-style: normal; margin-right: 6px; }
.hud-win-extras { list-style: none; margin: 0 0 14px; padding: 0; font-size: 14px; color: #d9d4c5; }
.hud-win-extras li::before { content: '\\2713'; color: #5fbf6a; margin-right: 8px; font-weight: bold; }
.hud-win.hud-win-wide { width: min(1240px, calc(100% - 32px)); background: #23252a; }
.hud-shift { margin: 0 0 18px; }
.hud-shift-pair { display: flex; flex-wrap: wrap; gap: 14px 22px; justify-content: center; align-items: flex-start; }
.hud-shift-map h3 { margin: 0 0 6px; font: 600 15px Oswald, "Arial Narrow", sans-serif; color: #d9d4c5; letter-spacing: 0.06em; text-transform: uppercase; }
.hud-shift-map h3 small { color: #e6b450; font-size: 15px; margin-left: 6px; }
.hud-shift-map canvas { display: block; cursor: zoom-in; border-radius: 3px; box-shadow: 4px 5px 0 rgba(0,0,0,0.4); outline: 1px solid rgba(255,255,255,0.08); }
.hud-shift-map canvas:hover { outline: 2px solid #e6b450; }
.hud-shift-count { margin-top: 12px; font: 600 22px Oswald, "Arial Narrow", sans-serif; color: #e6b450; letter-spacing: 0.03em; }
.hud-win-foot { margin-top: 16px; font-size: 14px; color: #d9d4c5; }
.hud-win-row { display: flex; justify-content: space-between; padding: 0 50px; font-size: 17px; line-height: 30px; }
.hud-win-row span:first-child { color: #8a8d92; }
.hud-win-row span:last-child { color: #d9d4c5; font-weight: bold; }
.hud-zoom { position: absolute; inset: 0; background: rgba(0,0,0,0.78); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; pointer-events: auto; cursor: zoom-out; }
.hud-zoom canvas { display: block; box-shadow: 5px 5px 0 rgba(0,0,0,0.4); }
.hud-zoom div { color: #ece7d8; font-size: 15px; }
.hud-lights { position: absolute; left: 0; right: 0; top: 21px; display: flex; gap: 4px; justify-content: center; }
.hud-light { width: 22px; height: 22px; display: block; border-radius: 50%; overflow: visible;
  background: radial-gradient(circle at 36% 30%, #4a4c52 0, #2b2d31 45%, #1a1b1d 100%);
  box-shadow: inset 0 -2px 3px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.12), 0 0 0 2px #121314; }
.hud-light path, .hud-light circle, .hud-light rect, .hud-light line { stroke: #55585e; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.hud-light .hud-fill { fill: #55585e; stroke: none; }
.hud-light.hud-on { background: radial-gradient(circle at 36% 30%, #ffe3a0 0, #e6a23a 45%, #8a5414 100%);
  box-shadow: inset 0 -2px 3px rgba(0,0,0,0.35), 0 0 0 2px #121314, 0 0 8px rgba(230,162,58,0.8); }
.hud-light.hud-bad { background: radial-gradient(circle at 36% 30%, #ffb3a6 0, #e0503c 45%, #7c1812 100%);
  box-shadow: inset 0 -2px 3px rgba(0,0,0,0.35), 0 0 0 2px #121314, 0 0 9px rgba(224,80,60,0.9); }
.hud-light.hud-on path, .hud-light.hud-on circle, .hud-light.hud-on rect, .hud-light.hud-on line,
.hud-light.hud-bad path, .hud-light.hud-bad circle, .hud-light.hud-bad rect, .hud-light.hud-bad line { stroke: #2a1a08; }
.hud-light.hud-on .hud-fill, .hud-light.hud-bad .hud-fill { fill: #2a1a08; }
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
      stroke: major ? '#f1ead6' : '#7a7d82', 'stroke-width': major ? 2 : 1,
    }, card);
  }
  // Cardinal letters sit on the card and turn with it.
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, a]) => {
    const g = svg('g', { transform: `rotate(${a} 40 40)` }, card);
    const txt = svg('text', {
      x: 40, y: 40 - (R - 17), 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'Oswald, "Arial Narrow", sans-serif', 'font-size': 14, 'font-weight': 'bold',
      fill: t === 'N' ? '#d0614f' : '#f1ead6',
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
const LIGHT_TITLES = { tyres: 'Tire', engine: 'Engine', steering: 'Steering', compass: 'Compass' };

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
// hundredths of a mile) inverted like a classic trip meter.
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

// Round speedo with a needle. 0 to SPEEDO_MAX mph sweeps 270 degrees, from
// the lower left round to the lower right. The tick marks are fixed; only the
// needle (returned) turns. The paved top speed is about 56 mph.
const SPEEDO_MAX = 80;
function speedoAngle(mph) {
  return -135 + (Math.min(Math.max(mph, 0), SPEEDO_MAX) / SPEEDO_MAX) * 270;
}
function buildSpeedo(parent) {
  const s = svg('svg', { class: 'hud-speedo', viewBox: '0 0 100 100' }, parent);
  svg('circle', { cx: 50, cy: 50, r: 47, fill: '#0f1011', stroke: '#55585e', 'stroke-width': 3 }, s);
  svg('circle', { cx: 50, cy: 50, r: 42, fill: '#2a2c30' }, s);
  for (let v = 0; v <= SPEEDO_MAX; v += 5) {
    const major = v % 20 === 0;
    const rad = ((speedoAngle(v) - 90) * Math.PI) / 180;
    const r0 = major ? 30 : 35;
    svg('line', {
      x1: 50 + Math.cos(rad) * r0, y1: 50 + Math.sin(rad) * r0,
      x2: 50 + Math.cos(rad) * 40, y2: 50 + Math.sin(rad) * 40,
      stroke: major ? '#f1ead6' : '#7a7d82', 'stroke-width': major ? 3 : 1.5,
    }, s);
    if (major) {
      const t = svg('text', {
        x: 50 + Math.cos(rad) * 22, y: 50 + Math.sin(rad) * 22, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'Oswald, "Arial Narrow", sans-serif', 'font-size': 14, fill: '#d9d4c5',
      }, s);
      t.textContent = String(v);
    }
  }
  const mph = svg('text', {
    x: 50, y: 76, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-family': 'Oswald, "Arial Narrow", sans-serif', 'font-size': 12, 'letter-spacing': 2, fill: '#a89f88',
  }, s);
  mph.textContent = 'MPH';
  const needle = svg('g', { class: 'hud-needle' }, s);
  svg('polygon', { points: '47.5,50 52.5,50 50,12', fill: '#d0614f' }, needle);
  svg('circle', { cx: 50, cy: 50, r: 5, fill: '#f1ead6', stroke: '#55585e', 'stroke-width': 1.5 }, s);
  return needle;
}

// Key hints sit above the dash and fade after about a minute. H (which also
// opens the help panel) brings them back for another minute.
const HINT_FADE_MS = 60000;

export function createHUD(root, { openMap, radio } = {}) {
  injectStyle();
  const hud = el('div', 'hud-root', root);

  // ---------------------------------------------------------------- dash
  const dash = el('div', 'hud-dash hud-oswald', hud);
  const inner = el('div', 'hud-dash-inner', dash);
  const compassCard = buildCompass(inner);

  const bezel = (x, w, label) => {
    const b = el('div', 'hud-bezel', inner);
    b.style.left = `${x}px`;
    b.style.width = `${w}px`;
    el('div', 'hud-label', b, label);
    return b;
  };
  const headingTxt = el('div', 'hud-gauge', bezel(80, 92, 'HEADING'));
  headingTxt.style.fontSize = '20px';
  const odoStrips = buildOdometer(bezel(182, 140, 'TRIP mi'));
  const speedNeedle = buildSpeedo(inner);
  const gearTxt = el('div', 'hud-gear', inner);
  const clockTxt = el('div', 'hud-gauge hud-cream', bezel(424, 96, 'CLOCK'));
  clockTxt.style.fontSize = '22px';
  const timerTxt = el('div', 'hud-gauge hud-cream', bezel(528, 96, 'TRIP TIME'));
  timerTxt.style.fontSize = '18px';
  const lights = buildLights(bezel(632, 108, 'CHECK'));
  // The radio's tuning dial lives in this slot (src3/hud/radioDial.js).
  const radioSlot = el('div', 'hud-radio-slot', inner);
  radioSlot.id = 'hud-radio-slot';
  radioSlot.dataset.label = 'RADIO';
  const radioDial = radio ? createRadioDial(radioSlot, radio) : null;
  const devDmg = new URLSearchParams(window.location.search).has('damage') ? el('div', 'hud-dev-dmg', hud) : null;
  const hintBar = el('div', 'hud-hint', hud,
    'Arrows/WASD drive · F get out / in · E talk · M map · C camera · B horn · N north/heading-up · T radio (, . volume) · K mute · H help and hints');
  let hintShownAt = performance.now();
  const showHints = () => {
    hintShownAt = performance.now();
    hintBar.classList.remove('hud-faded');
  };

  // ---------------------------------------------------------------- overlays
  const goalLine = el('div', 'hud-goal-tag', hud); // paper tag, top left
  const promptBox = el('div', 'hud-prompt hud-mono', hud);
  // Talking to locals (round 12): ./talk.js.
  const talk = createTalk(hud);
  const radioSubs = createRadioSubs(hud, radio); // top centre, ./radioSubs.js
  const winShade = el('div', 'hud-win-shade', hud);
  let zoomBox = null; // enlarged map on the complete screen

  let mapOpen = false;
  let mapClosedAt = -Infinity;
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
  // A conversation is open (./talk.js has the keys while it is).
  const inDialogue = () => talk.active;

  // A new mission's card (title, giver, brief, goal name). The brief is
  // already in the notebook (startMission). The game is paused until it
  // closes, so the car stays put and the trip timer waits.
  function showCard() {
    state.briefPending = false;
    if (!currentMission(state)) return;
    state.inputLocked = true;
    runtime.paused = true;
    const openMission = () => {
      card = openMissionCard(state.missionIndex, {
        onClose: () => {
          card = null;
          runtime.paused = false;
          state.inputLocked = false;
        },
      });
    };
    // Darlene's note comes once, before mission 1's card.
    if (state.missionIndex === 0 && !introSeen()) {
      card = openIntroCard({ onClose: openMission });
    } else {
      openMission();
    }
  }

  // H: how-to-play as a pause overlay. Not over the map, a dialogue, the
  // mission card or the end screens.
  function onHelpKey() {
    if (help || card || mapOpen || inDialogue() || zoomBox || state.won) return;
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
    talk.close();
  }

  // E on foot (round 12): facing a local, talk. Looking at a landmark with
  // a local beside you, ask them "What's that?". Looking at one alone, note
  // it in the notebook (its name if someone told you, else "Hm, what's that?").
  // On foot facing a local, E talks to them even beside a garage.
  function talkFirst() {
    return !!(state.onFoot && state.nearLocalId);
  }

  function onRepairKey() {
    const shop = state.nearRepair;
    if (!shop || state.won || talkFirst()) return false;
    const { minutes, line } = repairCar(state, shop);
    state.nearRepair = null;
    const who = shop.mechanic.charAt(0).toUpperCase() + shop.mechanic.slice(1);
    talk.note(`${who}: "${line}"`, `${minutes} minutes later`);
    return true;
  }

  function onTalkKey() {
    if (onRepairKey()) return;
    if (state.won || !state.onFoot) return;
    const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
    const look = state.lookAt;
    const beside = state.nearLocalAny && WORLD.locals.find((l) => l.id === state.nearLocalAny);
    if (local && !(look && look.topicId === 'planes' && beside)) {
      talk.open(local.id);
      return;
    }
    if (!look) return;
    if (beside) {
      talk.whatsThat(beside.id, look.topicId, look.dir);
      return;
    }
    const n = noteLandmark(look.topicId, look, state);
    talk.note(n.text, n.fresh ? 'noted in your notebook' : 'already in your notebook');
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
    state.inputLocked = false;
  }

  // ---------------------------------------------------------------- map
  function markMapClosed() {
    mapOpen = false;
    mapClosedAt = performance.now();
    hud.style.display = '';
    // The map screen unlocks input on close; a dialogue or the complete
    // screen underneath still needs it locked.
    if (inDialogue() || winShown) state.inputLocked = true;
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
    if (talk.onKey(e)) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e') onTalkKey();
    else if (k === 'm') onMapKey();
    else if (k === 'h') { showHints(); onHelpKey(); }
    else if (k === 'r' && state.won) window.location.reload();
    else if (e.key === 'Enter') onContinueKey();
  }
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------- per frame
  function updateDash() {
    // On foot (round 12) the dash dims and sinks a little; the compass stays
    // bright and turns with where you look (keeping the car compass's
    // fault, if it has one), so you can still take a bearing.
    const foot = !!state.onFoot;
    if (last.foot !== foot) {
      last.foot = foot;
      dash.classList.toggle('hud-foot', foot);
    }
    // The compass shows what the (maybe damaged) needle reads, not the truth.
    const err = compassHeading(state) - state.car.heading;
    const shown = foot && state.lookYaw != null ? (((state.lookYaw + err) % 360) + 360) % 360 : compassHeading(state);
    const ck = Math.round(shown * 4);
    if (last.compass !== ck) {
      last.compass = ck;
      compassCard.style.transform = `rotate(${-shown}deg)`;
    }
    setText('heading', headingTxt, headingText(shown));

    // Rolling drums: the last drum turns smoothly, each higher drum rolls
    // only while every drum below it is passing from 9 to 0.
    const v = Math.min(odometerHundredths(state.odometer), 999999.99); // hundredths of a mile
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
    const mph = Math.round(mphFromMps(Math.abs(car.speed)));
    if (last.mph !== mph) {
      last.mph = mph;
      speedNeedle.style.transform = `rotate(${speedoAngle(mph)}deg)`;
    }
    setText('gear', gearTxt, car.speed < -0.2 ? 'REV' : '');
    if (!last.hintsFaded && performance.now() - hintShownAt > HINT_FADE_MS) {
      last.hintsFaded = true;
      hintBar.classList.add('hud-faded');
    } else if (last.hintsFaded && performance.now() - hintShownAt <= HINT_FADE_MS) {
      last.hintsFaded = false;
    }
    setText('clock', clockTxt, clockText(state.clockMinutes));
    setText('timer', timerTxt, timerText(state.elapsedMs));

    // Fit the fixed-width dash on narrow screens.
    const w = window.innerWidth;
    if (w !== lastScaleW) {
      lastScaleW = w;
      const s = Math.min(1, w / (DASH_W + 16));
      inner.style.transform = `translateX(-50%) scale(${s})`;
      hud.style.setProperty('--hud-dash-h', `${Math.round((DASH_H + 3) * s)}px`);
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

  function updateGoalLine() {
    const goal = state.won ? null : currentGoal(state);
    const text = goal ? goal.name : null;
    if (text === last.goalLine) return;
    last.goalLine = text;
    goalLine.textContent = '';
    if (text) {
      el('small', null, goalLine, 'Your goal');
      goalLine.append(text);
    }
    goalLine.style.display = text ? 'block' : 'none';
  }

  function updatePrompt() {
    let text = null;
    const shop = !inDialogue() && !card && !help && !state.won && !talkFirst() ? state.nearRepair : null;
    if (shop) text = `E: get the car fixed at ${shop.name} (${shop.kind === 'farm' ? 20 : 30} min)`;
    else if (!inDialogue() && !card && !help && !state.won && state.onFoot) {
      const local = state.nearLocalId && WORLD.locals.find((l) => l.id === state.nearLocalId);
      const beside = state.nearLocalAny && WORLD.locals.find((l) => l.id === state.nearLocalAny);
      const look = state.lookAt;
      if (local && !(look && look.topicId === 'planes' && beside)) text = `E: talk to ${local.name} (${local.role})`;
      else if (look && beside) text = `E: ask ${beside.name} "What's that?"`;
      else if (look) text = "E: what's that?";
      else if (state.nearCar) text = 'F: get back in';
    }
    if (text === promptText) return;
    promptText = text;
    promptBox.textContent = text || '';
    promptBox.style.display = text ? 'block' : 'none';
  }

  // ---------------------------------------------------------------- complete screen
  const truthCache = new Map(); // mission id -> canvas

  // aspect: the canvas's width over height (default the map paper's).
  function zoomCanvas(make, caption, aspect = 840 / 576) {
    closeZoom();
    const maxW = Math.min(window.innerWidth * 0.92, (window.innerHeight - 80) * aspect);
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

  // Lines for the win panel's tick list. Add a row by pushing a string here.
  function winExtras(m) {
    const rows = [];
    if (m) rows.push(...touristTicks(state, m.id));
    return rows;
  }

  // Things that shifted (SPEC 9p): the printed map (with your marks when you
  // drew on it) beside the same sheet as it really is now, each shift
  // circled, labelled and ticked if you saw it, and the count.
  function buildShiftCompare(panel, def) {
    const tally = shiftTally(def, state.shiftsSeen);
    const seen = new Set(tally.rows.filter((r) => r.seen).map((r) => r.shift.id));
    const shifts = tally.rows.map((r) => r.shift);
    const marks = state.sketch.base === def.id ? state.sketch : null;
    const now = realMapDef(def);
    const year = (def.title.match(/\b1[89]\d\d\b/) || [''])[0];
    // As big as fits: two side by side, with the heading and count above the dash.
    const dash = parseFloat(getComputedStyle(hud).getPropertyValue('--hud-dash-h')) || 0;
    const panelW = Math.min(1240, window.innerWidth - 32) - 48;
    const byH = (window.innerHeight - dash - 24 - 250) * (SHIFT_CROP.w / SHIFT_CROP.h);
    const w = Math.round(Math.max(260, Math.min(600, (panelW - 22) / 2, byH)));
    const wrap = el('div', 'hud-shift', panel);
    const pair = el('div', 'hud-shift-pair', wrap);
    const side = (title, sub, make) => {
      const col = el('div', 'hud-shift-map', pair);
      const h = el('h3', null, col, title);
      if (sub) el('small', null, h, sub);
      const c = make(w);
      c.style.width = w + 'px';
      col.appendChild(c);
      c.addEventListener('click', () => zoomCanvas(make, `${title}${sub ? ' ' + sub : ''}`, SHIFT_CROP.w / SHIFT_CROP.h));
    };
    // line id: T32-shift-head-old (the map's tab name and its year)
    side(def.tabLabel || 'The old map', year,
      (cw) => renderShiftMapCanvas({ def, shifts, seen, sketch: marks }, cw));
    // line id: T32-shift-head-now
    side('As it really is,', String(PRESENT_YEAR),
      (cw) => renderShiftMapCanvas({ def: now, shifts, seen, labels: true }, cw));
    el('div', 'hud-shift-count', wrap, shiftCountText(tally.seen, tally.total));
  }

  function buildWin() {
    winShade.textContent = '';
    const m = currentMission(state);
    const shiftDef = m ? mapWithShifts(printedMapsFor(state)) : null;
    const panel = el('div', shiftDef ? 'hud-win hud-win-wide' : 'hud-win', winShade);
    const goal = currentGoal(state);
    el('h2', null, panel, `You made it to ${goal ? goal.name : 'the end'}`);
    if (m) el('div', 'hud-win-sub', panel, m.title);
    if (state.lastRecord && state.lastRecord.saved === false) {
      el('div', 'hud-win-sub hud-win-nosave', panel, 'Progress can\u2019t be saved in this window (storage is blocked).');
    }
    if (m && m.arrival) {
      const a = el('div', 'hud-win-arrival', panel);
      el('b', null, a, `${m.arrival.name}:`);
      a.appendChild(document.createTextNode(`\u201c${m.arrival.line}\u201d`));
    }
    // Extras: green-tick rows under the arrival line, empty by default. To add
    // one, push a line of text into winExtras(m) (the tourist's tick is here).
    const extras = winExtras(m);
    if (extras.length) {
      const ul = el('ul', 'hud-win-extras', panel);
      for (const text of extras) el('li', null, ul, text);
    }
    if (shiftDef) buildShiftCompare(panel, shiftDef);
    const stats = el('div', 'hud-win-stats hud-mono', panel);
    const rows = [
      ['Trip time', timerText(state.elapsedMs)],
      ['Distance', milesText(state.odometer, 2)],
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
        thumb(thumbs, snap.sketch, snap.label, `${clockText(snap.clockMinutes)} · ${milesText(snap.odometer)}`);
      }
      // The final map is saved when you continue; show it as it is now.
      thumb(thumbs, state.sketch, m.finalLabel, 'now (M to finish it)');

      // With shifts, the real map is already shown above, beside the old one.
      if (!shiftDef) {
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
      }

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
    if (inDialogue()) closeDialogue();
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
    if (radioDial) radioDial.update();
    radioSubs.update();
    updateLights();
    if (state.towing) {
      if (inDialogue()) closeDialogue();
      if (promptText) {
        promptText = null;
        promptBox.style.display = 'none';
      }
      return;
    }
    updatePrompt();
    updateGoalLine();
    if (inDialogue() || winShown || card || help) state.inputLocked = true;
    if (state.won && !winShown) showWin();
    if (state.briefPending && !inDialogue() && !state.won && !card && !help) showCard();
  }

  return { update };
}
