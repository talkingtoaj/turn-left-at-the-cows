// Grain elevators (#67): the name painted on a co-op elevator (coopName in
// src3/world3d/elevator3d.js).
// - It is the nearest town's name and CO-OP, so no new words, and it
//   follows the towns when they move (checked across calls on a made-up
//   elevator).
// - On every grain elevator in every region: the name is an existing town's,
//   and the Brandt elevator reads BRANDT CO-OP, not ASHFORD CO-OP.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { coopName } from '../src3/world3d/elevator3d.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };

// 1. A made-up elevator; the towns move between calls.
const el = { id: 'e', x: 0, y: 0 };
const cases = [
  [[{ name: 'Ashford', x: 300, y: 0 }, { name: 'Brandt', x: 900, y: 0 }], 'ASHFORD CO-OP'],
  [[{ name: 'Ashford', x: 1300, y: 0 }, { name: 'Brandt', x: 0, y: -200 }], 'BRANDT CO-OP'],
  [[{ name: 'Oakham', x: 0, y: 2400 }], 'OAKHAM CO-OP'],
  [[{ name: 'Oakham', x: 0, y: 2600 }], null],
  [[], null],
];
for (const [towns, want] of cases) {
  const got = coopName({ towns }, el);
  if (got !== want) fail(`towns ${JSON.stringify(towns)}: got ${got}, want ${want}`);
}

// 2. Every grain elevator in every region.
let n = 0;
let brandt = false;
for (const id of REGION_IDS) {
  const W = setRegion(id);
  const names = new Set(W.towns.map((t) => t.name.toUpperCase() + ' CO-OP'));
  for (const l of W.landmarks.filter((q) => q.kind === 'grain_elevator')) {
    n++;
    const name = coopName(W, l);
    if (name && !names.has(name)) fail(`${id}/${l.id}: "${name}" does not name a town in the game`);
    if (/brandt/i.test(l.name || l.id)) {
      brandt = true;
      if (name !== 'BRANDT CO-OP') fail(`${id}/${l.id}: reads "${name}", want BRANDT CO-OP`);
    }
    console.log(`${id}/${l.id}: ${name}`);
  }
}
if (!n) fail('no grain elevators found');
if (!brandt) fail('the Brandt elevator was not found');
if (fails) {
  console.log(`${fails} failure(s)`);
  process.exit(1);
}
console.log(`OK: ${n} grain elevator(s), names from the nearest town`);
