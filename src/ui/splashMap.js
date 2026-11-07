// The paper map on the passenger seat (start screen): a hand-drawn sketch of
// Ashford County with each delivery pencilled on. Finished ones get a tick
// at the place you found and the best time beside it; the next one is
// circled where it starts; the rest are a faint number and a question mark.
// Unfinished jobs are only ever marked where they START, so the menu never
// gives away where a place is.
//
// Plain SVG text, no world data (positions below were read off the regions'
// data once, in map units, and are only roughly to scale, like a sketch).
//   mapSVG({ missions, done, next }) -> svg markup
// done: { [missionId]: progress Record }, next: index of the circled one.

import { timerText } from '../hud/format.js';

// Fenwick County (6.5 x 3.2 km) fills the left of the sheet; Harlan County
// round Brandt sits on the right, 22 km on along Route 40 (shortened).
const F = (x, y) => [30 + x * (480 / 6500), 70 + y * (360 / 3200)];
const B = (x, y) => [592 + x * (210 / 4800), 216 + (y - 1700) * 0.1];

// Where each job starts and where it ends, on the sheet.
export const MAP_SPOTS = {
  m1_parcel: { start: F(600, 2420), end: F(2670, 445), startName: 'Ashford' },
  m2_cabin: { start: F(2670, 445), end: F(5880, 415), startName: 'Hartley Farm' },
  m3_airfield: { start: B(250, 1690), end: B(3320, 1042), startName: 'Route 40' },
};

const HWY9 = [[600, 2400], [911, 2323], [1207, 2241], [1515, 2249], [1823, 2196], [2142, 2117], [2408, 1987], [2411, 1661], [2392, 1363], [2372, 1065], [2317, 761], [2300, 700]];
const RT40_F = [[2399, 1420], [2801, 1332], [3219, 1291], [3633, 1222], [4049, 1188], [4451, 1170], [4855, 1168], [5251, 1239], [5664, 1298], [6082, 1285], [6495, 1300]];
const RT40_B = [[0, 1700], [480, 1684], [963, 1635], [1443, 1601], [1907, 1606], [2390, 1652], [2870, 1715], [3344, 1710], [3821, 1669], [4297, 1608], [4795, 1565]];
const WILLOW = [[0, 1290], [555, 1356], [1087, 1395], [1630, 1506], [2170, 1507], [2716, 1592], [3248, 1524], [3792, 1659], [4392, 1610]];
const COLDWATER = [[4060, 0], [4184, 392], [4200, 785], [4262, 1189], [4383, 1574], [4406, 1978], [4302, 2373], [4365, 2775], [4450, 3200]];
const SANDY = [[2150, 0], [2194, 374], [2311, 735], [2380, 1100], [2433, 1470], [2495, 1836], [2536, 2211], [2598, 2583], [2650, 3000]];
const TOWNS = [
  ['Ashford', F(600, 2420)], ['Millbrook', F(2280, 690)], ['Dunmore Corners', F(3350, 285), true],
  ['Calder', F(4700, 1160)], ['Brandt', B(1715, 1555)], ['Oakham', B(3915, 2340), true],
];

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
  // Water.
  for (const [pts, w] of [[WILLOW.map((p) => F(...p)), 1.6], [COLDWATER.map((p) => F(...p)), 2.4], [SANDY.map((p) => B(...p)), 1.6]]) {
    out.push(`<path d="${pencil(pts, r)}" class="mp-water" stroke-width="${w}"/>`);
  }
  // Roads: Route 40 (with the long stretch between the counties squeezed),
  // Highway 9 up from Ashford.
  const rtF = RT40_F.map((p) => F(...p));
  const rtB = RT40_B.map((p) => B(...p));
  const gap = [rtF[rtF.length - 1], [548, 222], [570, 214], rtB[0]];
  out.push(`<path d="${pencil(rtF, r)}" class="mp-road"/>`);
  out.push(`<path d="${pencil(gap, r)}" class="mp-road mp-gap"/>`);
  out.push(`<path d="${pencil(rtB, r)}" class="mp-road"/>`);
  out.push(`<path d="${pencil(HWY9.map((p) => F(...p)), r)}" class="mp-road"/>`);
  out.push(`<text class="mp-roadname" x="438" y="212" transform="rotate(-2 438 212)">ROUTE 40</text>`);
  out.push(`<text class="mp-roadname" x="128" y="320" transform="rotate(-13 128 320)">HWY 9</text>`);
  out.push(`<text class="mp-hand mp-faint" x="531" y="246">22 km</text>`);
  // Towns: a few pencil squares and a printed name.
  for (const [name, [x, y], small] of TOWNS) {
    const n = small ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const bx = x - 6 + (k % 2) * 8 + (r() - 0.5) * 2;
      const by = y - 6 + Math.floor(k / 2) * 7 + (r() - 0.5) * 2;
      out.push(`<rect class="mp-house" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="5" height="5"/>`);
    }
    out.push(`<text class="mp-town${small ? ' mp-small' : ''}" x="${x + 10}" y="${y + 18}">${esc(name)}</text>`);
  }
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
      g.push(`<text class="mp-hand mp-best" x="${x + 14}" y="${y + 4}">${i + 1}. ${esc(timerText(rec.bestMs))}</text>`);
    } else if (i === next) {
      const [x, y] = spot.start;
      g.push(`<path class="mp-circle" d="${ring(x, y, 22, 16, r)}"/>`);
      const lx = Math.min(x + 26, 560);
      g.push(`<text class="mp-hand mp-next" x="${lx}" y="${y - 20}">${i + 1}. ${esc(m.title)}?</text>`);
    } else {
      const [x, y] = spot.start;
      g.push(`<circle class="mp-dot" cx="${x}" cy="${y}" r="2.5"/>`);
      g.push(`<text class="mp-hand mp-faint" x="${x + 6}" y="${y - 8}">${i + 1}?</text>`);
    }
    out.push(`<g class="mp-m${rec ? ' mp-done' : ''}${i === next && !rec ? ' mp-isnext' : ''}" data-mission="${m.id}">${g.join('')}</g>`);
  });

  return `<svg class="sp-mapsvg" viewBox="0 0 820 470" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <text class="mp-title" x="30" y="44">ASHFORD COUNTY</text>
  <text class="mp-sub" x="32" y="62">AND ROUND ABOUT · NOT TO SCALE</text>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${out.join('')}</g>
  <g class="mp-north" transform="translate(782 64)"><path d="M0,22 L0,-18 M-6,-9 L0,-18 L6,-9"/><text x="-5" y="38">N</text></g>
</svg>`;
}
