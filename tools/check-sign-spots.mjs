// No sign stands on a road (#87): every STOP sign (src/ambient/ambient.js)
// and every road sign (WORLD.signs) keeps its post at least SIGN_CLEAR m
// from the edge of every road, in every region. The STOP sign where Old
// River Road meets Highway 9 once stood in the middle of the highway.
//
//   npm run check:sign-spots
//
// Exits 1 when any check fails.

import { setRegion, REGION_IDS } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { createAmbient } from '../src/ambient/ambient.js';
import { roadGap, SIGN_CLEAR } from '../src/world/roadside.js';

let fails = 0;
const check = (ok, what) => {
  if (!ok) {
    fails++;
    console.log('FAIL ' + what);
  }
};

// The helper itself: on a 9 m road's centre line it is -4.5, 6 m off it 1.5.
{
  const roads = [{ points: [[0, 0], [100, 0]], width: 9 }];
  check(Math.abs(roadGap(50, 0, roads) + 4.5) < 1e-9, 'roadGap on the centre line');
  check(Math.abs(roadGap(50, 6, roads) - 1.5) < 1e-9, 'roadGap beside the road');
}

let n = 0;
for (const id of REGION_IDS) {
  const world = setRegion(id);
  const amb = createAmbient(world, generateScenery(world));
  check(amb.stopSigns.length > 0, id + ': no STOP signs');
  const all = [
    ...amb.stopSigns.map((s) => ({ ...s, kind: 'STOP sign' })),
    ...world.signs.map((s) => ({ ...s, kind: 'sign' })),
  ];
  for (const s of all) {
    n++;
    const gap = roadGap(s.x, s.y, world.roads);
    check(gap >= SIGN_CLEAR - 1e-6, `${id}: ${s.kind} ${s.id} at (${s.x.toFixed(1)}, ${s.y.toFixed(1)}) is ${gap.toFixed(2)} m from a road edge (needs ${SIGN_CLEAR})`);
  }
}
console.log(`signs checked: ${n}`);
if (fails) {
  console.log(`${fails} sign check(s) failed`);
  process.exit(1);
}
console.log('sign spots OK');
