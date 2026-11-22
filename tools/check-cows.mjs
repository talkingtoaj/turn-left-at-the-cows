// Cow checker (#37, src3/world3d/cowLook.js):
// - no two cows in a herd carry the same patches (every real herd in every
//   region, plus a big made-up herd), and every cow shows some of each colour;
// - grazing: standing cows spend most of the time head-down, look up now and
//   then, always pass through the halfway pose, keep their heads up when
//   walking, and a herd does not move its heads as one.
//
//   npm run check:cows
// Exits 1 when there are problems.

import { setRegion, REGION_IDS, WORLD } from '../src/world/world.js';
import { cowLook, cowPatch, cowPose } from '../src3/world3d/cowLook.js';

const problems = [];

// Sample points over the cow's body and legs (cow space, metres, facing -z).
const PTS = [];
for (let i = 0; i < 600; i++) {
  const f = (k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  PTS.push([(f(1) - 0.5) * 0.9, 0.3 + f(2) * 1.0, (f(3) - 0.5) * 2.0]);
}
const pattern = (look) => PTS.map(([x, y, z]) => cowPatch(look, x, y, z));

function checkHerd(name, ids) {
  const pats = ids.map((id) => pattern(cowLook(id)));
  for (let a = 0; a < ids.length; a++) {
    const share = pats[a].filter(Boolean).length / PTS.length;
    if (share < 0.03 || share > 0.85) problems.push(`${name}: ${ids[a]} is ${Math.round(share * 100)}% patch, too plain`);
    for (let b = a + 1; b < ids.length; b++) {
      // Same patches = the patched areas mostly overlap (shared / combined).
      // Two unrelated half-patched cows overlap about a third; above 70%
      // they would read as the same cow.
      let both = 0;
      let either = 0;
      for (let k = 0; k < PTS.length; k++) {
        if (pats[a][k] && pats[b][k]) both++;
        if (pats[a][k] || pats[b][k]) either++;
      }
      if (both / either > 0.7) problems.push(`${name}: ${ids[a]} and ${ids[b]} have nearly the same patches (${Math.round((both / either) * 100)}% overlap)`);
    }
  }
}

let herds = 0;
let cows = 0;
for (const r of REGION_IDS) {
  setRegion(r);
  for (const fd of WORLD.fields || []) {
    if (!fd.animals || fd.animals.kind !== 'cows' || !fd.animals.count) continue;
    const ids = Array.from({ length: fd.animals.count }, (_, i) => `${fd.id}_${i}`); // as src/ambient/ambient.js names them
    checkHerd(`${r}/${fd.id}`, ids);
    herds++;
    cows += ids.length;
  }
}
checkHerd('made-up herd', Array.from({ length: 40 }, (_, i) => `fd_test_${i}`));
if (!herds) problems.push('no cow herds found in any region');

// Grazing, ticked at 60 fps for ten minutes.
const DT = 1 / 60;
const seeds = Array.from({ length: 30 }, (_, i) => cowLook(`fd_test_${i}`).seed);
const tally = [0, 0, 0];
let ticks = 0;
let apart = 0;
for (const seed of seeds) {
  let prev = cowPose(0, seed, false);
  for (let t = DT; t < 600; t += DT) {
    const p = cowPose(t, seed, false);
    if (Math.abs(p - prev) > 1) {
      problems.push(`seed ${seed.toFixed(3)}: head jumps from pose ${prev} to ${p} at ${t.toFixed(2)} s`);
      break;
    }
    tally[p]++;
    ticks++;
    prev = p;
    if (cowPose(t, seed, true) !== 0) {
      problems.push(`seed ${seed.toFixed(3)}: a walking cow has its head down`);
      break;
    }
  }
}
for (let t = 0; t < 600; t += 0.5) {
  const ps = seeds.map((s) => cowPose(t, s, false));
  if (new Set(ps).size > 1) apart++;
}
const down = tally[2] / ticks;
const up = tally[0] / ticks;
if (down < 0.5 || down > 0.85) problems.push(`cows graze head-down ${Math.round(down * 100)}% of the time (want 50-85%)`);
if (up < 0.1) problems.push(`cows look up only ${Math.round(up * 100)}% of the time`);
if (!tally[1]) problems.push('the halfway pose is never shown');
if (apart < 1100) problems.push(`the herd moves its heads together too often (${1200 - apart} of 1200 samples all alike)`);

console.log(`cows: ${herds} herds, ${cows} cows checked; head down ${Math.round(down * 100)}%, up ${Math.round(up * 100)}%, halfway ${Math.round((tally[1] / ticks) * 100)}%`);
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems.slice(0, 30)) console.log(' -', p);
  process.exit(1);
}
console.log('ok');
