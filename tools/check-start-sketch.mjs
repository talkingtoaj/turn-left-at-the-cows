// Mission 1 starts on the player's own sketch (#87), not on Darlene's map:
//   - no mission draws on a printed map; mission 1 gives Darlene's map as its
//     own tab ("Darlene's map")
//   - mission 1's sketch already has Ashford (house stamps), the gas station
//     (a little pump), Main Street and a piece of Highway 9, all on the
//     paper, all marked pre, and one label: "Highway 9"
//   - the pre-drawn marks don't count as the player's (playerMarks), so the
//     "Press M to sketch" tip and map sharing still see an empty sheet
//   - they come once: replaying mission 1 doesn't double them, and mission 2
//     starts on a blank sheet
//   - the Highway 9 stroke heads east-northeast from Main Street, as the
//     real road does
//
//   npm run check:start-sketch
//
// Exits 1 when any check fails.

import assert from 'node:assert/strict';
import { state } from '../src/state.js';
import { jumpToMission, finishMission } from '../src/game/update.js';
import { MISSIONS } from '../src/game/missions.js';
import { printedMapsFor } from '../src/game/printedMaps.js';
import { playerMarks } from '../src/game/startSketch.js';
import { setRegion } from '../src/world/world.js';
import { sketchIsEmpty } from '../src/net/mapsApi.js';

const PAPER = { x: 100, y: 52, w: 840, h: 576 }; // src3/map/sketchPaper.js (has DOM imports)
const onPaper = ([x, y]) => x >= PAPER.x && x <= PAPER.x + PAPER.w && y >= PAPER.y && y <= PAPER.y + PAPER.h;

for (const m of MISSIONS) assert.ok(!m.sketchOn, `${m.id}: no mission draws on a printed map (#87)`);

const m1 = MISSIONS[0];
setRegion(m1.region);
jumpToMission(state, 0);
const sk = state.sketch;
assert.equal(sk.base, undefined, 'mission 1: own sketch, not drawn on a printed map');
const tabs = printedMapsFor(state).map((d) => d.tabLabel || d.title);
assert.ok(tabs.includes("Darlene's map"), "mission 1: Darlene's map is its own tab");

assert.deepEqual(sk.labels.map((l) => l.text), ['Highway 9'], 'one label, "Highway 9"');
assert.equal(sk.stamps.filter((s) => s.kind === 'house').length, 3, 'Ashford: three house stamps');
assert.ok(sk.strokes.length >= 3, 'strokes: Highway 9, Main Street and the pump');
for (const list of [sk.strokes, sk.stamps, sk.labels]) for (const it of list) assert.equal(it.pre, true, 'every pre-drawn item is marked pre');
for (const s of sk.strokes) for (const p of s.points) assert.ok(onPaper(p), `stroke point ${p} on the paper`);
for (const s of [...sk.stamps, ...sk.labels]) assert.ok(onPaper([s.x, s.y]), `${s.kind || s.text} on the paper`);
// Hand-drawn: the strokes are smoothed many-point lines, not straight segments.
const hwy = sk.strokes.reduce((a, b) => (b.points.length > a.points.length ? b : a));
assert.ok(hwy.points.length > 40, 'Highway 9 is a many-point pencil line');
const [x0, y0] = hwy.points[0];
const [x1, y1] = hwy.points[hwy.points.length - 1];
const bearing = (Math.atan2(x1 - x0, -(y1 - y0)) * 180) / Math.PI;
assert.ok(bearing > 55 && bearing < 95, `Highway 9 heads east-northeast (${bearing.toFixed(0)} deg)`);
assert.ok(x1 - x0 > 150, 'Highway 9 is a short piece, but not a stub');

assert.equal(playerMarks(sk), 0, 'pre-drawn marks are not the player\'s');
assert.ok(sketchIsEmpty(sk), 'nothing of the player\'s to share yet');
sk.strokes.push({ points: [[500, 300], [520, 310]] });
assert.equal(playerMarks(sk), 1, 'a stroke of the player\'s counts');
assert.ok(!sketchIsEmpty(sk), 'then there is something to share');

// Replaying mission 1: the same marks, once.
const n = { strokes: 0, stamps: 0, labels: 0 };
jumpToMission(state, 0);
jumpToMission(state, 0);
n.strokes = state.sketch.strokes.length;
n.stamps = state.sketch.stamps.length;
n.labels = state.sketch.labels.length;
assert.equal(n.labels, 1, 'replay: one label, not doubled');
assert.equal(n.stamps, 3, 'replay: three stamps, not doubled');

// On to mission 2: a blank sheet.
state.won = true;
finishMission(state);
assert.equal(state.missionIndex, 1, 'mission 2 next');
assert.equal(state.sketch.strokes.length + state.sketch.stamps.length + state.sketch.labels.length, 0, 'mission 2: blank sheet');
const arch = state.sketchArchive.find((a) => a.missionId === m1.id);
assert.ok(arch && arch.sketch.labels.some((l) => l.text === 'Highway 9'), 'mission 1\'s map, with its pre-drawn marks, is kept');

console.log(`check:start-sketch: ${n.strokes} strokes, ${n.stamps} stamps, 1 label; Highway 9 at ${bearing.toFixed(0)} deg; ok`);
