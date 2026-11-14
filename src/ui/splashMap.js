// The paper map on the passenger seat (start screen): a hand-drawn sketch of
// Ashford and the roads out of it, with each delivery pencilled on. Finished ones get a tick
// at the place you found and the best time beside it; the next one is
// circled where it starts; the rest are a faint number and a question mark.
// Unfinished jobs are only ever marked where they START, so the menu never
// gives away where a place is.
//
// Plain SVG text, no world data (positions below were read off the regions'
// data once, in map units, and are only roughly to scale, like a sketch).
// It names nothing the player hasn't been told: Ashford, the two counties,
// and places they have already found (the ticks).
//   mapSVG({ missions, done, next }) -> svg markup
// done: { [missionId]: progress Record }, next: index of the circled one.

import { timerText } from '../hud/format.js';

// Fenwick County (6.5 x 3.2 km) fills the left of the sheet; Harlan County
// round Brandt sits on the right, 22 km on along Route 40 (shortened).
const F = (x, y) => [30 + x * (480 / 6500), 70 + y * (360 / 3200)];
const B = (x, y) => [592 + x * (210 / 4800), 216 + (y - 1700) * 0.1];

// Where each job starts and where it ends, on the sheet, and where its
// pencilled label goes (next: beside the circle; best: beside the tick)
// so labels keep clear of the printed names: [dx, dy, text-anchor].
export const MAP_SPOTS = {
  m1_parcel: { start: F(600, 2420), end: F(2670, 445), next: [26, -10, 'start'], best: [-14, 4, 'end'] },
  m2_cabin: { start: F(2670, 445), end: F(5880, 415), next: [0, -28, 'middle'], best: [14, 4, 'start'] },
  m3_airfield: { start: B(250, 1690), end: B(3320, 1042), next: [40, 42, 'middle'], best: [-14, 4, 'end'] },
};

// Only Ashford, where you start, is named. No real roads, rivers or other
// towns: finding those is the game (the printed 1987 map in the glovebox
// covers only the country round Ashford, and it lies). The pencilled line
// east is a hint of direction, not a road.
const ASHFORD = F(600, 2420);
const EAST = [ASHFORD, [190, 318], [320, 280], [450, 250], [560, 232], [680, 222], [800, 214]];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A smooth pencil line through points, with a little hand wobble.
function pencil(pts, r, wob = 1.6) {
  const p = pts.map(([x, y]) => [x + (r() - 0.5) * wob, y + (r() - 0.5) * wob]);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    d += ` Q${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
  }
  const last = p[p.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

// A pencil circle that overshoots where it started, as people draw them.
function ring(cx, cy, rx, ry, r) {
  const pts = [];
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i <= 26; i++) {
    const a = a0 + (i / 24) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 0.08 + i * 0.004;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pencil(pts, r, 0.6);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function mapSVG({ missions, done, next }) {
  const r = rng(7);
  const out = [];
  // A loose pencil line east from Ashford toward the next county.
  out.push(`<path d="${pencil(EAST, r, 3)}" class="mp-road mp-gap"/>`);
  out.push('<text class="mp-hand mp-faint" x="712" y="196" transform="rotate(-3 712 196)">east \u2192</text>');
  // Ashford: a few pencil squares and a printed name.
  const [ax, ay] = ASHFORD;
  for (let k = 0; k < 4; k++) {
    const bx = ax - 6 + (k % 2) * 8 + (r() - 0.5) * 2;
    const by = ay - 6 + Math.floor(k / 2) * 7 + (r() - 0.5) * 2;
    out.push(`<rect class="mp-house" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="5" height="5"/>`);
  }
  out.push(`<text class="mp-town" x="${ax + 10}" y="${ay + 18}">Ashford</text>`);
  // County names, printed.
  out.push('<text class="mp-county" x="150" y="440">FENWICK COUNTY</text>');
  out.push('<text class="mp-county" x="612" y="440">HARLAN COUNTY</text>');

  // The deliveries.
  missions.forEach((m, i) => {
    const spot = MAP_SPOTS[m.id];
    if (!spot) return;
    const rec = done[m.id];
    const g = [];
    if (rec) {
      const [x, y] = spot.end;
      g.push(`<path class="mp-tick" d="${pencil([[x - 9, y - 1], [x - 3, y + 7], [x + 11, y - 12]], r, 0.8)}"/>`);
      const [dx, dy, anchor] = spot.best;
      g.push(`<text class="mp-hand mp-best" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${i + 1}. ${esc(timerText(rec.bestMs))}</text>`);
    } else if (i === next) {
      const [x, y] = spot.start;
      g.push(`<path class="mp-circle" d="${ring(x, y, 22, 16, r)}"/>`);
      const [dx, dy, anchor] = spot.next;
      g.push(`<text class="mp-hand mp-next" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${i + 1}. ${esc(m.title)}?</text>`);
    } else {
      const [x, y] = spot.start;
      g.push(`<circle class="mp-dot" cx="${x}" cy="${y}" r="2.5"/>`);
      g.push(`<text class="mp-hand mp-faint" x="${x + 6}" y="${y - 8}">${i + 1}?</text>`);
    }
    out.push(`<g class="mp-m${rec ? ' mp-done' : ''}${i === next && !rec ? ' mp-isnext' : ''}" data-mission="${m.id}">${g.join('')}</g>`);
  });

  return `<svg class="sp-mapsvg" viewBox="0 0 820 470" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="mp-ink" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.1" result="holes"/>
    <feComposite in="SourceGraphic" in2="holes" operator="in"/>
  </filter></defs>
  <text class="mp-title" x="30" y="44">RURAL ROUTE 3 \u00b7 ASHFORD</text>
  <text class="mp-sub" x="32" y="62">AND ROUND ABOUT · NOT TO SCALE</text>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${out.join('')}</g>
  <g class="mp-stamp" transform="translate(636 62) rotate(-6) scale(1.2)" filter="url(#mp-ink)">
    <rect x="-84" y="-17" width="168" height="34" rx="3" fill="none" stroke-width="3"/>
    <rect x="-79" y="-12" width="158" height="24" rx="2" fill="none" stroke-width="1"/>
    <text x="0" y="6" text-anchor="middle">CORRECT AS OF 1987</text>
  </g>
  <text class="mp-ha" x="676" y="106" transform="rotate(-6 676 106)">ha.</text>
  <g class="mp-north" transform="translate(782 64)"><path d="M0,22 L0,-18 M-6,-9 L0,-18 L6,-9"/><text x="-5" y="38">N</text></g>
</svg>`;
}
