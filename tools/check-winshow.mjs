// Checks the animated win screen's timeline (#94): the order of the pieces,
// that the count rolls up, and that a time past the end is the finished frame.
//   node tools/check-winshow.mjs
import assert from 'node:assert/strict';
import { winTimeline } from '../src3/hud/winShowTimeline.js';

const tl = winTimeline([true, false, true, true, false]);
const early = tl.at(0.1);
assert.equal(early.trace, 0, 'your map alone first');
assert.ok(early.rings.every((p) => p === 0) && early.count === 0);

// The trace runs before any circle.
const mid = tl.at(1.5);
assert.ok(mid.trace > 0 && mid.trace < 1, 'tracing');
assert.ok(mid.rings.every((p) => p === 0), 'no circles while tracing');

// Circles go one by one, in order, a tick only after its own circle.
let last = -1;
for (let t = 0; t < tl.end; t += 0.05) {
  const s = tl.at(t);
  s.rings.forEach((p, i) => {
    if (i > 0 && p > 0) assert.equal(s.rings[i - 1], 1, 'circle ' + i + ' waits for circle ' + (i - 1));
    if (s.labels[i] > 0) assert.equal(p, 1, 'label after its circle');
    if (s.ticks[i] > 0) assert.equal(s.labels[i], 1, 'tick after its label');
  });
  assert.ok(s.count >= last, 'the count never goes down');
  last = s.count;
  assert.ok(s.trace === 1 || s.rings.every((p) => p === 0), 'trace done before circles');
}
const second = tl.at(0);
assert.equal(second.trace, 0, 'a later call with an earlier time starts over (no hidden state)');

// A shift you missed gets no tick, ever.
assert.equal(tl.at(tl.end + 5).ticks[1], 0);
assert.equal(tl.at(tl.end + 5).ticks[0], 1);
const fin = tl.at(tl.end);
assert.equal(fin.done, true);
assert.equal(fin.count, 3, 'rolls up to the number seen');
assert.ok(fin.trace === 1 && fin.rings.every((p) => p === 1) && fin.labels.every((p) => p === 1));
assert.equal(tl.at(tl.end - 0.01).done, false);

// Nothing seen: still ends, count 0.
const none = winTimeline([false, false]);
assert.equal(none.at(none.end).count, 0);
assert.equal(winTimeline([]).at(0).done === false, true);
// The URL flags.
import { winFxMode } from '../src3/hud/winShowTimeline.js';
assert.deepEqual(winFxMode('', false), { mode: 'play' });
assert.deepEqual(winFxMode('?winfx=off', false), { mode: 'off' });
assert.deepEqual(winFxMode('?winfx=off', true), { mode: 'off' });
assert.deepEqual(winFxMode('', true), { mode: 'still' }, 'reduced motion: the finished screen');
assert.deepEqual(winFxMode('?shifts=now', false), { mode: 'still' }, 'the dev flag gives the finished frame');
assert.deepEqual(winFxMode('?shifts=now&winfx=play', false), { mode: 'play' });
assert.deepEqual(winFxMode('?shifts=now&winfx=play', true), { mode: 'still' }, 'reduced motion beats play');
assert.deepEqual(winFxMode('?winfx=2.5', false), { mode: 'at', at: 2.5 });
console.log('check-winshow: ok');
