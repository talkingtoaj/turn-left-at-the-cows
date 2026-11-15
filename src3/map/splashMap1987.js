// The start screen's map (src/ui/splash.js): Darlene's 1987 county map, the
// one in the glovebox on mission 1, with the deliveries pencilled on in the
// same way as the plain sketch in src/ui/splashMap.js (that sketch is the
// fallback while this loads, or if it fails). Loaded with import() so the
// start screen shows before the world data arrives.
//
// Only the next job is marked, where it starts; finished ones get a tick. Places off this sheet
// (east of Millbrook, and Harlan County) get a pencilled arrow at the east edge.
//   mapCanvas(cssWidth) -> canvas of the whole printed sheet (PAPER)
//   marksSVG({ missions, done, next }) -> svg markup laid over it
//   PAPER: the sheet rect the two share, in map-screen units

import { PAPER, renderPrintedMapCanvas } from './sketchRender.js';
import { findPrintedMap } from '../../src/game/printedMaps.js';
import { printFrame } from '../../src/map/oldMap.js';
import { rng, pencil, ring, esc } from '../../src/ui/splashMap.js';
import { timerText } from '../../src/hud/format.js';

export { PAPER };

const MAP_ID = 'county1987';

// Fenwick world metres; label offsets in sheet units [dx, dy, anchor].
// `east: true` puts the point at the frame's east edge with an arrow.
const SPOTS = {
  m1_parcel: { start: [600, 2420], end: [2670, 445], next: [38, 74, 'start'], best: [-22, 30, 'end'] },
  m2_cabin: { start: [2670, 445], end: [3000, 330], endEast: true, next: [-30, -24, 'end'], best: [-26, 4, 'end'] },
  m3_airfield: { start: [3000, 1300], startEast: true, end: [3000, 1700], endEast: true, next: [-26, -24, 'end'], best: [-26, 4, 'end'] },
};

export function mapCanvas(cssWidth) {
  const { def, world } = findPrintedMap(MAP_ID);
  return renderPrintedMapCanvas(def, cssWidth, world);
}

export function marksSVG({ missions, done, next }) {
  const { def } = findPrintedMap(MAP_ID);
  const { P } = printFrame(PAPER, def.bounds);
  const r = rng(7);
  const out = [];
  const arrow = (x, y) => `<path class="mp-road" d="${pencil([[x - 26, y], [x - 4, y]], r, 0.6)} M${x - 11},${y - 6} L${x - 3},${y} L${x - 11},${y + 6}"/>`;
  missions.forEach((m, i) => {
    const spot = SPOTS[m.id];
    if (!spot) return;
    const rec = done[m.id];
    const g = [];
    if (rec) {
      const [x, y] = P(spot.end);
      if (spot.endEast) g.push(arrow(x - 4, y));
      else g.push(`<path class="mp-tick" d="${pencil([[x - 9, y - 1], [x - 3, y + 7], [x + 11, y - 12]], r, 0.8)}"/>`);
      const [dx, dy, anchor] = spot.best;
      g.push(`<text class="mp-hand mp-best" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">✓ ${i + 1}. ${esc(timerText(rec.bestMs))}</text>`);
    } else if (i === next) {
      const [x, y] = P(spot.start);
      if (spot.startEast) g.push(arrow(x - 4, y));
      else g.push(`<path class="mp-circle" d="${ring(x, y, 24, 18, r)}"/>`);
      const [dx, dy, anchor] = spot.next;
      g.push(`<text class="mp-hand mp-next" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${i + 1}. ${esc(m.title)}?</text>`);
    } else {
      return; // later jobs stay off the map until they're next
    }
    out.push(`<g class="mp-m${rec ? ' mp-done' : ''}${i === next && !rec ? ' mp-isnext' : ''}" data-mission="${m.id}">${g.join('')}</g>`);
  });
  return `<svg class="sp-mapsvg" viewBox="${PAPER.x} ${PAPER.y} ${PAPER.w} ${PAPER.h}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${out.join('')}</g>
</svg>`;
}
