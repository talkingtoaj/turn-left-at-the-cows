// Checks the map wall's plain logic (src/ui/mapWallPick.js).
//   npm run check:map-wall
import assert from 'node:assert/strict';
import {
  pickPair, wallOrder, pinSize, newestId, noteSeen, markNoteSeen, _forgetNoteForTest, NOTE_KEY, uniqueMaps,
} from '../src/ui/mapWallPick.js';
import { makeRng } from '../src/map/draw.js';
import { makeSeedMaps, SEED_NAMES } from './seed-maps.mjs';
import { MISSION_LIST } from '../src/game/missionList.js';

const map = (id, extra = {}) => ({ id, votes: 0, created: '2026-11-0' + (id.length % 9) + 'T00:00:00Z', ...extra });

// Never the player's own map, never the same map twice, across many calls.
{
  const maps = [map('a'), map('b', { mine: true }), map('c'), map('d'), map('e', { hidden: true }), map('f')];
  const rnd = makeRng(42);
  let last = null;
  const keys = new Set();
  for (let k = 0; k < 200; k++) {
    const p = pickPair(maps, { rnd, last });
    assert.ok(p, 'a pair');
    assert.equal(p.length, 2);
    assert.notEqual(p[0].id, p[1].id, 'same map twice');
    for (const m of p) {
      assert.ok(!m.mine, 'own map in a pair');
      assert.ok(!m.hidden, 'hidden map in a pair');
    }
    const key = p.map((m) => m.id).sort().join('|');
    if (last) assert.notEqual(key, last.map((m) => m.id).sort().join('|'), 'same pair twice in a row');
    keys.add(key);
    last = p;
  }
  assert.ok(keys.size >= 4, 'pairs vary: ' + keys.size);
}

// Rnd at its edges still gives two different maps.
for (const v of [0, 0.999999, 1]) {
  const p = pickPair([map('a'), map('b'), map('c')], { rnd: () => v });
  assert.notEqual(p[0].id, p[1].id);
}

// Fewer than two other maps: no pair.
assert.equal(pickPair([]), null);
assert.equal(pickPair(null), null);
assert.equal(pickPair([map('a')]), null);
assert.equal(pickPair([map('a'), map('me', { mine: true })]), null);
assert.equal(pickPair([map('a'), map('a')]), null, 'one map listed twice is still one map');
assert.equal(pickPair([map('a'), map('h', { hidden: true })]), null);
// Exactly two: that pair, again and again.
{
  const p1 = pickPair([map('a'), map('b')], { rnd: makeRng(1) });
  const p2 = pickPair([map('a'), map('b')], { rnd: makeRng(2), last: p1 });
  assert.deepEqual(p1.map((m) => m.id).sort(), ['a', 'b']);
  assert.deepEqual(p2.map((m) => m.id).sort(), ['a', 'b']);
}
// Unvoted maps come first while there are two of them.
{
  const maps = [map('a', { voted: true }), map('b'), map('c'), map('d', { voted: true })];
  const rnd = makeRng(7);
  for (let k = 0; k < 50; k++) {
    const ids = pickPair(maps, { rnd }).map((m) => m.id).sort();
    assert.deepEqual(ids, ['b', 'c']);
  }
}

// Wall order: votes, then newest; one copy each; hidden left off.
{
  const order = wallOrder([
    map('x', { votes: 1, created: '2026-11-01' }),
    map('y', { votes: 3, created: '2026-11-02' }),
    map('z', { votes: 1, created: '2026-11-05' }),
    map('y', { votes: 3, created: '2026-11-02' }),
    map('h', { votes: 9, hidden: true }),
  ]).map((m) => m.id);
  assert.deepEqual(order, ['y', 'z', 'x']);
  assert.deepEqual([0, 1, 2, 3, 9].map(pinSize), ['big', 'mid', 'mid', 'small', 'small']);
  assert.equal(newestId([map('x', { created: '2026-11-01' }), map('z', { created: '2026-11-05' })]), 'z');
  assert.equal(newestId([]), null);
  assert.equal(uniqueMaps([map('a'), null, map('a')]).length, 1);
}

// The note flag: stored, and it survives storage that throws or is missing.
{
  const bag = new Map();
  const ok = () => ({ getItem: (k) => bag.get(k) ?? null, setItem: (k, v) => bag.set(k, v) });
  _forgetNoteForTest();
  assert.equal(noteSeen(ok), false);
  markNoteSeen(ok);
  assert.equal(bag.get(NOTE_KEY), '1');
  _forgetNoteForTest();
  assert.equal(noteSeen(ok), true, 'read back from storage');

  const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  _forgetNoteForTest();
  assert.equal(noteSeen(throwing), false);
  markNoteSeen(throwing);
  assert.equal(noteSeen(throwing), true, 'kept in memory when storage throws');

  const getterThrows = () => { throw new Error('SecurityError'); };
  _forgetNoteForTest();
  assert.equal(noteSeen(getterThrows), false);
  markNoteSeen(getterThrows);
  assert.equal(noteSeen(getterThrows), true);

  _forgetNoteForTest();
  assert.equal(noteSeen(() => undefined), false);
  markNoteSeen(() => undefined);
  assert.equal(noteSeen(() => undefined), true);
}

// Seed maps: a few for every mission, fixed keys, inside the paper, names
// from the list, and the same sketches each run.
{
  const a = makeSeedMaps({ per: 6, now: 0 });
  const b = makeSeedMaps({ per: 6, now: 0 });
  assert.deepEqual(a, b, 'seed maps are the same each run');
  for (const m of MISSION_LIST) assert.equal(a.filter((s) => s.mission === m.id).length, 6, m.id);
  assert.equal(new Set(a.map((s) => s.key)).size, a.length, 'keys are unique');
  for (const s of a) {
    assert.match(s.key, /^[a-z0-9_]{1,20}-[0-9]{1,3}$/);
    assert.ok(s.key.startsWith(s.mission + '-'));
    assert.ok(SEED_NAMES.includes(s.nickname));
    assert.ok(s.votes >= 0 && s.votes <= 20);
    assert.ok(s.sketch.strokes.length > 0, 'some roads');
    const pts = [...s.sketch.strokes.flatMap((t) => t.points), ...s.sketch.stamps.map((t) => [t.x, t.y]), ...s.sketch.labels.map((t) => [t.x, t.y])];
    for (const [x, y] of pts) assert.ok(x >= 0 && x <= 960 && y >= 0 && y <= 640, `${s.key}: ${x},${y} off the paper`);
    assert.ok(s.sketch.stamps.some((t) => t.kind === 'x'), 'the goal is marked');
  }
}

console.log('check-map-wall: ok');
