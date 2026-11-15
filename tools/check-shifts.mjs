// Checks things that shifted (SPEC 9p, src/game/shifts.js).
//   node tools/check-shifts.mjs
// The pure logic (seen by distance, the count, the 1992 sheet), every printed
// map's shift data in every region (print style, inside the sheet, a road
// passes within reach), and that a mission run tracks them through
// updateGame and starts each mission with none seen.
import assert from 'node:assert/strict';
import { regionWorld, REGION_IDS } from '../src/world/world.js';
import {
  shiftsOf, shiftKey, noteShiftsSeen, shiftTally, shiftCountText, mapWithShifts, realMapDef, PRESENT_YEAR,
} from '../src/game/shifts.js';

// ---------------------------------------------------------------- pure logic
const a = { id: 'a', title: 'Test County Road Map, 1987', lies: [{ type: 'hide_road', roadId: 'x' }], shifts: [
  { id: 's1', label: 'One', at: [100, 100], r: 50 },
  { id: 's2', label: 'Two', at: [400, 100], r: 20 },
] };
const none = { id: 'n', title: 'No shifts', lies: [] };
const seen = new Set();
assert.deepEqual(shiftsOf(none), [], 'a map with no shifts has none');
assert.deepEqual(shiftsOf(null), [], 'no map, no shifts');
assert.deepEqual(noteShiftsSeen(seen, [none, a], 0, 0), [], 'far from both: none seen');
assert.deepEqual(noteShiftsSeen(seen, [none, a], 130, 140), ['a:s1'], 'within r (50 m): seen');
assert.deepEqual(noteShiftsSeen(seen, [a], 100, 100), [], 'seen once only');
assert.deepEqual(noteShiftsSeen(seen, [a], 421, 100), [], 'just outside r: not seen');
assert.deepEqual(noteShiftsSeen(seen, [a], 420, 100), ['a:s2'], 'on the edge of r: seen');
assert.equal(shiftKey(a, a.shifts[0]), 'a:s1');
const t = shiftTally(a, new Set(['a:s2', 'b:s1']));
assert.equal(t.seen, 1);
assert.equal(t.total, 2);
assert.deepEqual(t.rows.map((r) => r.seen), [false, true]);
assert.equal(shiftTally(none, seen).total, 0);
assert.equal(shiftCountText(3, 5), 'Things that shifted: 3 of 5', "the owner's words");
assert.equal(mapWithShifts([none, a]), a);
assert.equal(mapWithShifts([none]), null);
assert.equal(mapWithShifts([]), null);
const now = realMapDef(a);
assert.equal(now.title, `Test County Road Map, ${PRESENT_YEAR}`);
assert.deepEqual(now.lies, [], 'the real sheet has no lies');
assert.notEqual(now.id, a.id, 'its own id (own render cache)');
assert.equal(a.lies.length, 1, 'the printed map is left as it was');
assert.equal(realMapDef({ id: 'b', title: 'Map', lies: [] }).title, `Map, ${PRESENT_YEAR}`);

// ---------------------------------------------------------------- the data
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
let count = 0;
for (const region of REGION_IDS) {
  const w = regionWorld(region);
  for (const def of Object.values(w.printedMaps)) {
    const list = shiftsOf(def);
    if (!list.length) continue;
    assert.equal(def.style, 'print', `${def.id}: shifts only on print-style maps (the win screen circles them on the printed frame)`);
    const ids = new Set();
    for (const s of list) {
      const where = `${def.id}/${s.id}`;
      assert.ok(s.id && !ids.has(s.id), `${where}: unique id`);
      ids.add(s.id);
      assert.ok(typeof s.label === 'string' && s.label.length > 0 && s.label.length <= 48, `${where}: a short label`);
      assert.ok(!/[—–]/.test(s.label), `${where}: no dashes in the label`);
      assert.ok(Array.isArray(s.at) && s.at.length === 2 && s.at.every(Number.isFinite), `${where}: at is [x, y]`);
      assert.ok(s.r > 0 && s.r <= 300, `${where}: r in metres`);
      const b = def.bounds || { x: 0, y: 0, w: w.size.w, h: w.size.h };
      assert.ok(s.at[0] >= b.x && s.at[0] <= b.x + b.w && s.at[1] >= b.y && s.at[1] <= b.y + b.h,
        `${where}: inside the sheet (${def.id} bounds), or it cannot be circled`);
      // You can see it from a road: some road comes within r.
      const near = Math.min(...w.roads.flatMap((r) => r.points.map((p) => dist(p, s.at))));
      assert.ok(near <= s.r, `${where}: a road passes within r (nearest ${near.toFixed(0)} m)`);
      count++;
    }
  }
}

// One shifts array per map: a second `shifts:` key in a def would silently
// replace the first, so name a few from each ticket.
const c87 = shiftsOf(regionWorld('fenwick').printedMaps.county1987).map((s) => s.id);
for (const id of ['old_bridge', 'dolan_ln', 'pruitt_ln', 'ridge_named', 'mill_lane_closed']) {
  assert.ok(c87.includes(id), `county1987 lists shift ${id}`);
}

// ---------------------------------------------------------------- a mission run
const { state } = await import('../src/state.js');
const { updateGame, jumpToMission } = await import('../src/game/update.js');
const { MISSIONS } = await import('../src/game/missions.js');
const { printedMapsFor } = await import('../src/game/printedMaps.js');
const { setRegion } = await import('../src/world/world.js');
for (let i = 0; i < MISSIONS.length; i++) {
  const m = MISSIONS[i];
  setRegion(m.region);
  jumpToMission(state, i);
  state.leg = null;
  assert.equal(state.shiftsSeen.size, 0, `${m.id}: starts with no shifts seen`);
  assert.equal(state.sketch.base, m.sketchOn, `${m.id}: sketch drawn on ${m.sketchOn || 'blank paper'}`);
  if (m.sketchOn) assert.ok(m.printedMaps.includes(m.sketchOn), `${m.id}: draws on a map it gives`);
  const def = mapWithShifts(printedMapsFor(state));
  if (!def) continue;
  const s = def.shifts[0];
  state.footPos = null;
  Object.assign(state.car, { x: s.at[0], y: s.at[1] });
  updateGame(state, 0.016);
  assert.ok(state.shiftsSeen.has(shiftKey(def, s)), `${m.id}: driving to ${s.id} sees it`);
  state.footPos = { x: def.shifts.at(-1).at[0], y: def.shifts.at(-1).at[1] };
  updateGame(state, 0.016);
  assert.ok(state.shiftsSeen.has(shiftKey(def, def.shifts.at(-1))), `${m.id}: walking there counts too`);
  state.footPos = null;
}
// A new mission run forgets them.
jumpToMission(state, 0);
assert.equal(state.shiftsSeen.size, 0, 'a new run starts with none seen');
console.log(`shifts ok: ${count} shifts across printed maps; logic and mission runs checked`);
