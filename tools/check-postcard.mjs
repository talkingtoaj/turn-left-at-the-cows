// Checks the share postcard's plain logic (src/ui/postcardFacts.js).
//   npm run check:postcard
import assert from 'node:assert/strict';
import { postcardFacts, postcardFileName } from '../src/ui/postcardFacts.js';

const run = {
  missionTitle: 'A Package for Hartley Farm', goalName: 'Hartley Farm',
  timeMs: 754000, metres: 8046.72, clockMinutes: 9 * 60 + 40, localsAsked: 3, tows: 0,
};

// The same words and formats as the win screen's trip tab.
{
  const f = postcardFacts(run);
  assert.equal(f.heading, 'You made it to Hartley Farm');
  assert.equal(f.title, 'A Package for Hartley Farm');
  assert.deepEqual(f.rows.map((r) => r[0]), ['Trip time', 'Distance', 'Clock', 'Locals asked']);
  assert.equal(f.rows[0][1], '12:34');
  assert.equal(f.rows[1][1], '5.00 mi');
  assert.equal(f.rows[3][1], '3');
  assert.equal(f.postmark, 'Hartley Farm');
}

// Across calls with a changing run: the towed row comes and goes, the
// numbers follow the run, and nothing leaks from the last call.
{
  const seen = [];
  for (const tows of [0, 1, 2, 3, 0]) {
    const f = postcardFacts({ ...run, tows, timeMs: run.timeMs + tows * 60000 });
    const towed = f.rows.find((r) => r[0] === 'Towed');
    if (tows) assert.equal(towed[1], tows === 1 ? 'once' : tows === 2 ? 'twice' : '3 times');
    else assert.equal(towed, undefined, 'no Towed row when never towed');
    seen.push(f.rows[0][1]);
  }
  assert.deepEqual(seen, ['12:34', '13:34', '14:34', '15:34', '12:34']);
}

// No goal or a blank run still makes a card.
{
  const f = postcardFacts({});
  assert.equal(f.heading, 'You made it to the end');
  assert.equal(f.rows.length, 4);
  assert.equal(f.postmark, '');
}

// File names are safe on every system.
assert.equal(postcardFileName('m1_parcel'), 'turn-left-at-the-cows-m1_parcel.png');
assert.equal(postcardFileName('a/b c'), 'turn-left-at-the-cows-a-b-c.png');
assert.equal(postcardFileName(), 'turn-left-at-the-cows-trip.png');

console.log('check:postcard ok');
