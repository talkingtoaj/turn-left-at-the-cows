// Load screen while a region is built (src3/main.js), in the "paper on the
// dash" look (SPEC 6h): dash black, the next region's map sheet being drawn
// in pencil as it loads (stroke progress follows load progress), the trip
// odometer rolling as the progress number, and one line from a local.
// No spinner. Plain DOM and SVG.
//
//   const ls = showLoadScreen({ title, region, kicker, hidden })
//   ls.progress(0..1, 'what is happening')   ls.reveal()   ls.close()
// hidden: build it out of sight (the game loading behind the start screen);
// reveal() shows it if the player is now waiting on it.

import { injectUiStyle, el } from './style.js';

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

// Things locals say. One shows per load.
const LINES = [
  ['Oh, you can’t miss it.', 'everyone, eventually'],
  ['Left at the cows. Or was it right? The cows move.', 'a man at the feed store'],
  ['Past where the old mill used to be.', 'a woman walking her dog'],
  ['It’s about ten minutes. Maybe twenty.', 'a farmer on a fence'],
  ['Follow the road till it stops being a road.', 'the man at the pumps'],
  ['Big red barn. Well, it was red.', 'a lady with groceries'],
  ['If you hit the river, you went too far.', 'a boy on a bike'],
  ['Everybody knows where that is.', 'somebody who didn’t'],
];

let styled = false;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hash = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// A pencil map of the region: the same sheet each time for a region (seeded
// by its name). Every mark has pathLength 1 so progress can draw it in.
function mapSVG(region) {
  const r = rng(hash(region || 'map'));
  const wob = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + (r() - 0.5) * 7).toFixed(1)},${(y + (r() - 0.5) * 7).toFixed(1)}`).join(' ');
  const line = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n + (r() - 0.5) * 30 * (i && i < n), y0 + ((y1 - y0) * i) / n + (r() - 0.5) * 30 * (i && i < n)]);
  const marks = [];
  // Main road across, a creek, two or three side roads, a couple of towns.
  const yMain = 100 + r() * 40;
  marks.push({ d: wob(line(0, yMain, 500, yMain - 30 + r() * 60, 7)), k: 'road', w: 3 });
  marks.push({ d: wob(line(0, 30 + r() * 30, 500, 10 + r() * 50, 8)), k: 'water', w: 2 });
  const sides = 2 + Math.floor(r() * 2);
  for (let i = 0; i < sides; i++) {
    const x = 80 + (i + r() * 0.6) * (340 / sides);
    marks.push({ d: wob(line(x, yMain, x + (r() - 0.5) * 140, r() < 0.5 ? 210 : 15, 4)), k: 'road', w: 2, dash: r() < 0.5 });
  }
  const towns = [];
  for (let i = 0; i < 2; i++) {
    const tx = 90 + i * 260 + r() * 60;
    const ty = yMain - 8 + (r() - 0.5) * 30;
    towns.push([tx, ty]);
  }
  const out = [];
  for (const m of marks) {
    const stroke = m.k === 'water' ? '#6f9fb8' : '#4a4a48';
    out.push(`<path d="${m.d}" pathLength="1" stroke="${stroke}" stroke-width="${m.w}"${m.dash ? ' data-dash="1"' : ''}/>`);
  }
  for (const [tx, ty] of towns) {
    for (let k = 0; k < 4; k++) {
      const x = tx + (k % 2) * 11 + (r() - 0.5) * 4;
      const y = ty + Math.floor(k / 2) * 10 + (r() - 0.5) * 4;
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="7" height="7" pathLength="1" stroke="#4a4a48" stroke-width="1.6"/>`);
    }
  }
  // A pencil circle with a question mark where the job is, somewhere.
  const gx = 330 + r() * 120;
  const gy = 150 + r() * 40;
  out.push(`<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="13" pathLength="1" stroke="#b3261e" stroke-width="2"/>`);
  out.push(`<path d="M${gx + 6},${gy + 20} q4,6 10,0" pathLength="1" stroke="#b3261e" stroke-width="2"/>`);
  // North arrow.
  out.push('<path d="M470,200 L470,160 M462,172 L470,160 L478,172" pathLength="1" stroke="#4a4a48" stroke-width="1.8"/>');
  return `<svg class="ls-map" viewBox="0 0 500 220" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${out.join('')}</g>
  <text x="463" y="152" font-family="Caveat, cursive" font-size="18" fill="#4a4a48">N</text>
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
  el('span', null, box, 'KM');
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
  sheet.insertAdjacentHTML('beforeend', mapSVG(region || title));
  const marks = [...sheet.querySelectorAll('.ls-map path, .ls-map circle, .ls-map rect')];
  for (const m of marks) {
    m.style.strokeDasharray = '1 1';
    m.style.strokeDashoffset = '1';
  }
  const setOdo = odometer(shade);
  const [line, who] = LINES[Math.floor(Math.random() * LINES.length)];
  const q = el('p', 'ls-quote', shade, `“${line}”`);
  el('small', null, q, who);
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
      setOdo(p * 100);
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
