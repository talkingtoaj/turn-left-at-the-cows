// Checks the map's look and feel logic (#92, src3/map/pencil.js): the road
// button cycle, the opening mode, scratch loudness, graphite grain, eraser
// crumbs and damp spots from rain. Each per-frame piece runs over several
// calls with changing input.
//
//   npm run check:map-fx
//
// Exits 1 when any check fails.

import assert from 'node:assert/strict';
import {
  unfoldMode, FOLD_SECONDS, nextRoad, roadFlags, roadOf, scratchGain, SCRATCH_MAX, grainPoints, endDots,
  isGraphite, spawnCrumbs, stepCrumbs, crumbAlpha, CRUMB_LIFE, stepDamp, DAMP,
} from '../src3/map/pencil.js';

// opening
assert.equal(unfoldMode({ fx: true, reduced: false }), 'fold');
assert.equal(unfoldMode({ fx: true, reduced: true }), 'fade');
assert.equal(unfoldMode({ fx: false, reduced: false }), 'none');
assert.equal(unfoldMode({ fx: false, reduced: true }), 'none');
assert.ok(FOLD_SECONDS < 0.5, 'the unfold takes under half a second');

// road button: three clicks come back round; old two-flag sketches map in
let road = 'thin';
const seen = [];
for (let i = 0; i < 4; i++) { road = nextRoad(road); seen.push(road); }
assert.deepEqual(seen, ['dash', 'thick', 'thin', 'dash']);
assert.deepEqual(roadFlags('dash'), { dashed: true, thick: false });
assert.deepEqual(roadFlags('thick'), { dashed: false, thick: true });
assert.deepEqual(roadFlags('thin'), { dashed: false, thick: false });
assert.equal(roadOf(true, true), 'thick');
assert.equal(roadOf(true, false), 'dash');
assert.equal(roadOf(false, false), 'thin');

// scratch sound: silent when still, louder when faster, never past the cap
assert.equal(scratchGain(0), 0);
assert.equal(scratchGain(0.01), 0);
const slow = scratchGain(0.1);
const fast = scratchGain(1.5);
assert.ok(slow > 0 && fast > slow, 'faster hand, louder scratch');
assert.ok(scratchGain(50) <= SCRATCH_MAX);

// graphite: same seed, same grain; stays within a pixel; blue and red are not graphite
const pts = [[10, 10], [20, 14], [30, 12]];
assert.deepEqual(grainPoints(pts, 5), grainPoints(pts, 5));
assert.notDeepEqual(grainPoints(pts, 5), grainPoints(pts, 6));
for (const [i, p] of grainPoints(pts, 5).entries()) assert.ok(Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) < 1.1);
const stroke = { points: pts, width: 2.4 };
assert.equal(endDots(stroke).length, 2);
assert.deepEqual(endDots(stroke), endDots(stroke));
assert.equal(isGraphite(stroke), true);
assert.equal(isGraphite({ points: pts, color: 0x2f62b3 }), false);

// crumbs: they move, fade and are gone by CRUMB_LIFE
const rng = (() => { let n = 0.17; return () => (n = (n * 7.3 + 0.31) % 1); })();
let crumbs = spawnCrumbs(100, 100, rng, 5);
assert.equal(crumbs.length, 5);
const a0 = crumbAlpha(crumbs[0]);
crumbs = stepCrumbs(crumbs, 0.3);
assert.equal(crumbs.length, 5);
assert.ok(crumbAlpha(crumbs[0]) < a0, 'crumbs fade');
assert.ok(crumbs.some((c) => c.x !== 100), 'crumbs move');
crumbs = stepCrumbs(crumbs, CRUMB_LIFE);
assert.equal(crumbs.length, 0, 'crumbs are gone after their life');

// damp spots: they grow in rain on an open map, never with the map shut, and dry slowly
const paper = { x: 100, y: 52, w: 840, h: 576 };
const r2 = (() => { let n = 0.42; return () => (n = (n * 9.7 + 0.13) % 1); })();
let spots = [];
for (let i = 0; i < 100; i++) spots = stepDamp(spots, 0.25, { rain: 0.9, open: true, rng: r2, paper });
assert.ok(spots.length > 0 && spots.length <= DAMP.MAX_SPOTS, 'rain leaves a few spots');
assert.ok(spots.every((s) => s.x >= paper.x && s.x <= paper.x + paper.w && s.y >= paper.y && s.y <= paper.y + paper.h));
const peak = spots.reduce((t, s) => t + s.a, 0);
assert.ok(peak > 0.5, 'spots darken');
// no new spots and no darkening while shut, even if it rains
const shut = stepDamp(spots, 10, { rain: 1, open: false, rng: () => 0, paper });
assert.equal(shut.length, spots.length);
assert.ok(shut.reduce((t, s) => t + s.a, 0) < peak, 'drying while closed');
// rain stops with the map still open: they dry
const dry = stepDamp(spots, 10, { rain: 0, open: true, rng: () => 0, paper });
assert.ok(dry.reduce((t, s) => t + s.a, 0) < peak);
// and are gone in the end
let d = spots;
for (let i = 0; i < 20; i++) d = stepDamp(d, 10, { rain: 0, open: false, rng: () => 0, paper });
assert.equal(d.length, 0, 'dry again after a few minutes');
// no rain, no spots
let none = [];
for (let i = 0; i < 50; i++) none = stepDamp(none, 0.25, { rain: 0, open: true, rng: r2, paper });
assert.equal(none.length, 0);

console.log('map fx checks passed');
