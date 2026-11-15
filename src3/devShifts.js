// Dev: ?shifts=now opens the current mission's win screen straight after
// Start, with some sample pencil marks and some of its shifts seen, for the
// "things that shifted" screenshot (SPEC 9p). Add &mission=<id> for another
// mission. Never part of normal play: it does not record a finish.

import { WORLD } from '../src/world/world.js';
import { printFrame } from '../src/map/oldMap.js';
import { printedMapsFor } from '../src/game/printedMaps.js';
import { mapWithShifts, shiftsOf, shiftKey } from '../src/game/shifts.js';
import { PAPER } from './map/sketchPaper.js';

export function fakeShiftRun(state) {
  const def = mapWithShifts(printedMapsFor(state));
  if (def) {
    // All but every third shift seen (3 shifts: 2 seen).
    shiftsOf(def).forEach((s, i) => { if (i % 3 !== 2) state.shiftsSeen.add(shiftKey(def, s)); });
    if (state.sketch.base === def.id) sampleMarks(state.sketch, def);
  }
  state.won = true;
}

// A plausible first-time player's marks on the printed map: the route traced
// in pencil, the dead end at the bridge, a turn back, a cross at the farm.
function sampleMarks(sketch, def) {
  const { P } = printFrame(PAPER, def.bounds);
  const road = (id) => WORLD.roads.find((r) => r.id === id);
  const along = (id, a, b) => {
    const pts = road(id).points;
    const i0 = Math.floor(pts.length * a);
    const i1 = Math.floor(pts.length * b);
    const out = [];
    for (let i = i0; i < i1; i += 3) {
      const [x, y] = P(pts[i]);
      out.push([Math.round(x + Math.sin(i * 0.7) * 1.5), Math.round(y + Math.cos(i * 0.9) * 1.5)]);
    }
    return out;
  };
  const at = (wx, wy) => P([wx, wy]).map(Math.round);
  const bridge = WORLD.bridges.find((b) => b.id === 'b_old');
  const farm = WORLD.buildings.find((b) => b.id === 'f_house');
  const PENCIL = 0x555555;
  const RED = 0xc0392b;
  if (road('creek_rd')) sketch.strokes.push({ points: along('creek_rd', 0, 0.42), color: PENCIL, width: 3 });
  if (road('hwy9')) sketch.strokes.push({ points: along('hwy9', 0, 1), color: PENCIL, width: 3, dash: true });
  if (bridge) {
    const [bx, by] = at(bridge.x, bridge.y);
    sketch.stamps.push({ kind: 'x', x: bx, y: by, color: RED });
    sketch.labels.push({ text: 'bridge out', x: bx + 14, y: by + 16, color: RED });
  }
  if (farm) {
    const [fx, fy] = at(farm.x, farm.y);
    sketch.stamps.push({ kind: 'house', x: fx + 2, y: fy + 12, color: PENCIL });
    sketch.labels.push({ text: 'package!', x: fx + 14, y: fy + 26, color: PENCIL });
  }
}
