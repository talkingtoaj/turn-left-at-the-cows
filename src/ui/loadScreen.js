// Load screen while a region is built (src3/main.js): a hand-drawn map card
// with the mission title, the region's name and a pencil progress bar.
// Plain DOM. It will be restyled with the new splash; keep the API:
//   const ls = showLoadScreen({ title, region, kicker })
//   ls.progress(0..1, 'what is happening')   ls.close()

import { injectUiStyle, el } from './style.js';

const CSS = `
.ls-shade { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, #3b4a3a, #1d241c 75%); }
.ls-card { width: min(560px, calc(100vw - 32px)); padding: 22px 26px 20px; box-sizing: border-box;
  background: #f3ead2; color: #3b2f22; border: 1px solid #b9a77f; box-shadow: 0 14px 40px rgba(0,0,0,0.45);
  transform: rotate(-0.8deg); font-family: Georgia, 'Times New Roman', serif; }
.ls-kicker { font: 12px/1.2 'Courier New', monospace; letter-spacing: 0.22em; text-transform: uppercase; color: #9a3a2a; }
.ls-title { margin: 6px 0 2px; font-size: 26px; font-weight: bold; }
.ls-region { font-style: italic; color: #6b5a42; font-size: 15px; }
.ls-map { display: block; width: 100%; height: auto; margin: 12px 0 10px; }
.ls-bar { height: 12px; border: 2px solid #3b2f22; border-radius: 6px 3px 7px 4px; padding: 2px; }
.ls-fill { height: 100%; width: 0%; background: repeating-linear-gradient(-55deg, #3b2f22 0 3px, transparent 3px 6px);
  border-radius: 3px; transition: width 0.15s; }
.ls-note { margin-top: 7px; font: 13px/1.3 'Courier New', monospace; color: #6b5a42; min-height: 1.3em; }
`;

let styled = false;

// A few wobbly pencil roads, a creek, a dashed route and a compass, drawn
// fresh each time (no two cards quite the same).
function mapSVG() {
  const r = Math.random;
  const wob = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + (r() - 0.5) * 6).toFixed(1)},${(y + (r() - 0.5) * 6).toFixed(1)}`).join(' ');
  const roads = [
    [[10, 120], [90, 105], [170, 112], [250, 90], [330, 96], [410, 70], [490, 78]],
    [[150, 10], [158, 60], [170, 112], [160, 170], [175, 215]],
    [[330, 96], [345, 140], [380, 180], [440, 200]],
  ];
  const creek = [[0, 60], [70, 70], [140, 50], [230, 58], [300, 40], [380, 30], [500, 18]];
  const route = [[60, 112], [170, 112], [250, 90], [330, 96], [345, 140], [392, 186]];
  return `<svg class="ls-map" viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${wob(creek)}" stroke="#4f7fa8" stroke-width="2"/>
    ${roads.map((p) => `<path d="${wob(p)}" stroke="#55493a" stroke-width="2.4"/>`).join('')}
    <path d="${wob(route)}" stroke="#b0452f" stroke-width="1.8" stroke-dasharray="6 6"/>
    <circle cx="392" cy="186" r="9" stroke="#b0452f" stroke-width="2"/>
    <text x="404" y="210" font-family="Georgia, serif" font-size="20" fill="#b0452f">?</text>
    <g transform="translate(456 168)" stroke="#55493a" stroke-width="1.5">
      <path d="M0,-26 L6,0 L0,26 L-6,0 Z"/><path d="M-20,0 L20,0"/>
      <text x="-5" y="-30" font-family="Georgia, serif" font-size="14" fill="#55493a" stroke="none">N</text>
    </g>
    <g fill="#55493a" stroke="none">
      <rect x="160" y="100" width="7" height="7"/><rect x="172" y="117" width="7" height="6"/><rect x="152" y="118" width="6" height="7"/>
    </g>
  </g>
</svg>`;
}

export function showLoadScreen({ title = '', region = '', kicker = 'On the road' } = {}) {
  injectUiStyle();
  if (!styled) {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    styled = true;
  }
  const shade = el('div', 'ls-shade', document.body);
  shade.id = 'load-screen';
  const card = el('div', 'ls-card', shade);
  el('div', 'ls-kicker', card, kicker);
  el('div', 'ls-title', card, title);
  if (region) el('div', 'ls-region', card, region);
  card.insertAdjacentHTML('beforeend', mapSVG());
  const bar = el('div', 'ls-bar', card);
  const fill = el('div', 'ls-fill', bar);
  const note = el('div', 'ls-note', card, '');
  return {
    progress(f, text) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
      if (text !== undefined) note.textContent = text;
    },
    close() {
      shade.remove();
    },
  };
}
