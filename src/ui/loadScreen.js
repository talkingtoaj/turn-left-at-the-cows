// Load screen while a region is built (src3/main.js), in the "paper on the
// dash" look (SPEC 9l): dash black, a pencil doodle (never the region's
// real map) sketched in as it loads (stroke progress follows load
// progress), the trip odometer rolling as the progress number, and one
// line from a local.
// No spinner. Plain DOM and SVG.
//
//   const ls = showLoadScreen({ title, region, kicker, hidden })
//   ls.progress(0..1, 'what is happening')   ls.reveal()   ls.close()
// hidden: build it out of sight (the game loading behind the start screen);
// reveal() shows it if the player is now waiting on it.

import { injectUiStyle, el } from './style.js';
import { milesFromMetres } from '../units.js';
import { metIds } from '../game/progress.js';

const CSS = `
.ls-shade { position: fixed; inset: 0; z-index: 2000; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 16px; box-sizing: border-box; color: #f1ead6;
  background: radial-gradient(ellipse at 50% 35%, #3a3c40, #1c1d1f 70%); font-family: Georgia, "Libre Baskerville", serif; }
.ls-shade[hidden] { display: none; }
.ls-sheet { position: relative; width: min(560px, 100%); padding: 18px 22px 14px; box-sizing: border-box;
  background: #f1ead6; color: #3a3128; border-radius: 3px; transform: rotate(-1.2deg);
  background-image: radial-gradient(ellipse at 80% 90%, rgba(216,204,180,0.9), transparent 60%),
    radial-gradient(ellipse at 20% 10%, rgba(255,252,240,0.8), transparent 55%);
  box-shadow: 0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(58,49,40,0.12); }
.ls-kicker { font: 600 12px/1.2 Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.22em; text-transform: uppercase; color: #b3261e; }
.ls-region { margin: 2px 0 0; font: bold 19px/1.2 "Libre Baskerville", Georgia, serif; letter-spacing: 0.06em; text-transform: uppercase; }
.ls-title { font: 26px/1.1 Caveat, "Segoe Print", cursive; color: #4a4a48; }
.ls-map { display: block; width: 100%; height: auto; margin: 6px 0 2px; }
.ls-map path, .ls-map circle, .ls-map rect { transition: stroke-dashoffset 0.25s linear; }
.ls-odo { display: flex; align-items: center; gap: 10px; font: 600 12px Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.2em; color: #e6b450; }
.ls-digits { display: flex; gap: 2px; padding: 4px; background: #111; border-radius: 4px; box-shadow: inset 0 2px 6px rgba(0,0,0,0.8), 0 0 0 2px #3a3c40; }
.ls-digit { width: 22px; height: 32px; overflow: hidden; background: #f1ead6; border-radius: 2px; }
.ls-digit:not(.ls-tenth) { background: #26272a; }
.ls-strip { display: flex; flex-direction: column; transition: transform 0.35s cubic-bezier(.3,.7,.4,1); }
.ls-strip span { height: 32px; font: 500 24px/32px Oswald, "Arial Narrow", sans-serif; text-align: center; color: #f1ead6; }
.ls-tenth .ls-strip span { color: #1c1d1f; }
.ls-dot { width: 4px; align-self: flex-end; color: #f1ead6; font: 24px/32px Oswald, sans-serif; }
.ls-quote { max-width: min(520px, 100%); margin: 0; text-align: center; font: 26px/1.2 Caveat, "Segoe Print", cursive; color: #f1ead6; }
.ls-quote small { display: block; font: 13px/1.4 Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #9c9a92; margin-top: 4px; }
.ls-note { font: 12px/1.3 Oswald, "Arial Narrow", sans-serif; letter-spacing: 0.1em; color: #9c9a92; min-height: 1.3em; text-transform: uppercase; }
@media (prefers-reduced-motion: reduce) { .ls-strip, .ls-map path, .ls-map circle, .ls-map rect { transition: none; } }
`;

// Things locals say. One shows per load. [line, anonymous credit, speaker id,
// credit once met]. A null id is nobody in particular, so it stays anonymous.
const LINES = [
  ['Oh, you can’t miss it.', 'everyone, eventually', null, null],
  ['Left at the cows. Or was it right? The cows move.', 'a man at the feed store', 'gus', 'Gus, at the store'],
  ['Past where the old mill used to be.', 'a woman walking her dog', 'mabel', 'Mabel, out walking'],
  ['It’s about ten minutes. Maybe twenty.', 'a farmer on a fence', 'ade', 'Ade, on the fence'],
  ['Follow the road till it stops being a road.', 'the man at the pumps', 'earl', 'Earl, at the pumps'],
  ['Big red barn. Well, it was red.', 'a lady with groceries', 'ames', 'Mrs Ames, with the groceries'],
  ['If you hit the river, you went too far.', 'a boy on a bike', null, null],
  ['Everybody knows where that is.', 'somebody who didn’t', null, null],
];

// Credit for a quote: the name once the player has met the speaker.
export function creditFor([, anon, id, named], met = metIds()) {
  return id && named && met.includes(id) ? named : anon;
}

let styled = false;

// A pencil doodle in a notebook margin, sketched in as the load goes on:
// a compass rose, a road sign with a bent arrow, the car, a cow and a
// coffee ring. Never the region's real layout: that is what the player is
// trying to work out. Every mark has pathLength 1 so progress can draw it.
const G = '#4a4a48';
const R = '#b3261e';
const DOODLE = [
  // Compass rose.
  ['circle', 'cx="70" cy="96" r="38"', G, 1.6],
  ['path', 'd="M70,48 L78,96 L70,144 L62,96 Z"', G, 1.6],
  ['path', 'd="M22,96 L70,88 L118,96 L70,104 Z"', G, 1.2],
  ['path', 'd="M66,40 L66,30 L74,40 L74,30"', G, 1.6],
  // Road sign on a post, with a bent turn-left arrow.
  ['path', 'd="M190,200 L190,118"', G, 2.2],
  ['path', 'd="M156,58 L224,54 L226,118 L158,122 Z"', G, 2],
  ['path', 'd="M200,108 L200,88 C200,80 196,76 188,76 L172,76 M180,66 L170,76 L180,86"', G, 2.4],
  // Road.
  ['path', 'd="M250,206 C300,180 330,170 400,168 C440,167 470,160 496,150"', G, 2],
  ['path', 'd="M262,214 C312,196 350,188 410,186 C450,185 476,178 498,170"', G, 1.2],
  // The car.
  ['path', 'd="M300,150 L306,132 L322,124 L356,124 L370,134 L384,138 L386,150 Z"', R, 2],
  ['path', 'd="M318,132 L326,128 L338,128 L338,134 Z M344,128 L356,128 L364,134 L344,134 Z"', R, 1.2],
  ['circle', 'cx="318" cy="152" r="7"', G, 2],
  ['circle', 'cx="370" cy="152" r="7"', G, 2],
  // A cow.
  ['path', 'd="M410,90 C410,76 420,72 440,72 C462,72 470,76 470,90 C470,100 462,102 440,102 C420,102 410,100 410,90 Z"', G, 1.8],
  ['path', 'd="M414,100 L414,118 M426,102 L426,118 M454,102 L454,118 M466,100 L466,118"', G, 1.8],
  ['path', 'd="M410,82 L398,76 C392,76 390,88 396,92 L410,92 M396,76 L392,70 M402,76 L404,70"', G, 1.8],
  ['path', 'd="M432,78 C438,80 438,88 446,86 M452,92 C456,96 462,94 462,90"', G, 1.2],
  ['path', 'd="M470,84 C478,86 480,96 476,104"', G, 1.2],
  // Coffee ring.
  ['circle', 'cx="270" cy="62" r="30"', '#8a6a4a', 3],
  ['circle', 'cx="272" cy="64" r="25"', '#8a6a4a', 1],
];

function doodleSVG() {
  const marks = DOODLE.map(([tag, attrs, stroke, w]) => `<${tag} ${attrs} pathLength="1" stroke="${stroke}" stroke-width="${w}"${stroke === '#8a6a4a' ? ' opacity="0.35"' : ''}/>`);
  return `<svg class="ls-map" viewBox="0 0 500 220" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${marks.join('')}</g>
  <text class="ls-moo" opacity="0" x="404" y="208" font-family="Caveat, cursive" font-size="20" fill="${G}">moo?</text>
</svg>`;
}

function odometer(parent) {
  const box = el('div', 'ls-odo', parent);
  el('span', null, box, 'TRIP');
  const digits = el('div', 'ls-digits', box);
  const strips = [];
  for (let i = 0; i < 4; i++) {
    if (i === 3) el('span', 'ls-dot', digits, '.');
    const d = el('div', i === 3 ? 'ls-digit ls-tenth' : 'ls-digit', digits);
    const strip = el('div', 'ls-strip', d);
    for (let n = 0; n <= 9; n++) el('span', null, strip, String(n));
    strips.push(strip);
  }
  el('span', null, box, 'MI');
  return (value) => {
    // value 0..100.0 shown as three digits and a tenth.
    const v = Math.round(Math.max(0, Math.min(999.9, value)) * 10);
    const ds = String(v).padStart(4, '0').slice(-4);
    ds.split('').forEach((c, i) => {
      strips[i].style.transform = `translateY(${-Number(c) * 32}px)`;
    });
  };
}

export function showLoadScreen({ title = '', region = '', kicker = 'On the road to', hidden = false } = {}) {
  injectUiStyle();
  if (!styled) {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    styled = true;
  }
  const shade = el('div', 'ls-shade', document.body);
  shade.id = 'load-screen';
  shade.setAttribute('role', 'status');
  shade.setAttribute('aria-live', 'polite');
  shade.hidden = hidden;
  const sheet = el('div', 'ls-sheet', shade);
  el('div', 'ls-kicker', sheet, kicker);
  if (region) el('div', 'ls-region', sheet, region);
  if (title) el('div', 'ls-title', sheet, title);
  sheet.insertAdjacentHTML('beforeend', doodleSVG());
  const marks = [...sheet.querySelectorAll('.ls-map path, .ls-map circle, .ls-map rect')];
  for (const m of marks) {
    m.style.strokeDasharray = '1 1';
    m.style.strokeDashoffset = '1';
  }
  const setOdo = odometer(shade);
  const pick = LINES[Math.floor(Math.random() * LINES.length)];
  const q = el('p', 'ls-quote', shade, `“${pick[0]}”`);
  el('small', null, q, creditFor(pick));
  const note = el('div', 'ls-note', shade, '');

  // Marks draw one after another as the load goes on.
  const draw = (f) => {
    const n = marks.length;
    marks.forEach((m, i) => {
      const local = Math.max(0, Math.min(1, f * n - i));
      m.style.strokeDashoffset = String(1 - local);
    });
  };
  setOdo(0);
  return {
    progress(f, text) {
      const p = Math.max(0, Math.min(1, f));
      draw(p);
      const moo = sheet.querySelector('.ls-moo');
      if (moo) moo.setAttribute('opacity', p > 0.9 ? '1' : '0');
      setOdo(milesFromMetres(p * 100000));
      if (text !== undefined) note.textContent = text;
    },
    reveal() {
      shade.hidden = false;
    },
    close() {
      shade.remove();
    },
  };
}
