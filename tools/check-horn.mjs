// Horn reactions (#74, src/world/hornHeard.js):
// - cows in earshot lift their heads after a short delay each (not all at
//   once), keep them up a few seconds, then go back to grazing; cows out of
//   earshot don't stir; honking again keeps them looking
// - a local in earshot waves once, after a short delay; not when walking,
//   sitting, already waving, or out of earshot
// - the farm dog, lying by its doghouse well out of sight, gets up at the
//   horn, runs its fence toward you barking, then gives up and lies down;
//   out of earshot it sleeps on
//
//   npm run check:horn     exits 1 on any problem

import { setRegion } from '../src/world/world.js';
import { HORN_HEAR, HORN_LOOK, cowHears, cowHornPose, localHears, dogHears } from '../src/world/hornHeard.js';
import { farmDogsIn, fenceLine, project, dogStart, stepDog, dogLook, DOG } from '../src/world/farmDog.js';
import { newAct, actStep, WAVE_S } from '../src3/world3d/peopleLook.js';

const problems = [];
const bad = (m) => problems.push(m);
const DT = 1 / 60;

// ---------- cows ----------
{
  // Three cows, all grazing (base pose 2), hear one honk at t = 10.
  const seeds = [0.05, 0.5, 0.95];
  const looks = seeds.map((s) => cowHears(null, 40, s, 10));
  const firstUp = looks.map(() => -1);
  const lastUp = looks.map(() => -1);
  for (let t = 9; t < 22; t += DT) {
    looks.forEach((L, i) => {
      const p = cowHornPose(L, t, 2);
      if (![0, 1, 2].includes(p)) bad(`cow pose ${p} at ${t.toFixed(2)}`);
      if (t < 10 && p !== 2) bad('cow looked up before the horn');
      if (p === 0) {
        if (firstUp[i] < 0) firstUp[i] = t;
        lastUp[i] = t;
      }
    });
  }
  firstUp.forEach((t, i) => {
    if (t < 0) return bad(`cow ${i} never looked up`);
    if (t - 10 < HORN_LOOK.delay || t - 10 > HORN_LOOK.delay + HORN_LOOK.spread + HORN_LOOK.turn + 0.05) bad(`cow ${i} looked up ${(t - 10).toFixed(2)} s after the horn`);
    const held = lastUp[i] - t + HORN_LOOK.turn; // up from at (halfway first) to end
    if (held < HORN_LOOK.hold - 0.1 || held > HORN_LOOK.hold + HORN_LOOK.holdSpread + 0.1) bad(`cow ${i} kept its head up ${held.toFixed(1)} s`);
  });
  if (Math.max(...firstUp) - Math.min(...firstUp) < 0.5) bad('the cows all looked up at once');
  // Back to grazing afterwards.
  looks.forEach((L, i) => {
    if (cowHornPose(L, 25, 2) !== 2) bad(`cow ${i} still looking at t=25`);
  });
  // A cow passing through halfway on the way up.
  const L = looks[1];
  if (cowHornPose(L, L.at + 0.1, 2) !== 1) bad('a grazing cow should pass halfway on the way up');
  if (cowHornPose(L, L.at + 0.1, 0) !== 0) bad('a cow with its head up should just keep it up');
  // Out of earshot: nothing.
  if (cowHears(null, HORN_HEAR.cow + 1, 0.5, 10) !== null) bad('a cow out of earshot heard the horn');
  // A second honk while looking: keeps looking, no fresh start (no dip).
  const again = cowHears(L, 40, 0.5, L.at + 2);
  if (again.at !== L.at || again.end <= L.end) bad('a second honk should keep the cow looking longer');
  for (let t = L.at + HORN_LOOK.turn; t < again.end; t += DT) if (cowHornPose(again, t, 2) !== 0) { bad('the cow dipped its head between two honks'); break; }
}

// ---------- locals ----------
{
  const still = { carDist: 40, carSpeed: 15, onFoot: false, moving: false, talking: false };
  // Two locals, one horn: they wave after their own delays, once each.
  const acts = [newAct(), newAct()];
  const seeds = [0.1, 0.9];
  const waits = acts.map((a, i) => localHears(a, 35, seeds[i]));
  if (waits.some((w) => w == null)) bad('a local in earshot did not hear the horn');
  else {
    acts.forEach((a, i) => (a.waveIn = waits[i]));
    const start = acts.map(() => -1);
    const frames = acts.map(() => 0);
    for (let k = 0; k < 60 * 6; k++) {
      acts.forEach((a, i) => {
        actStep(a, still, DT);
        if (a.wave > 0) {
          frames[i]++;
          if (start[i] < 0) start[i] = k * DT;
        }
      });
    }
    start.forEach((t, i) => {
      if (t < 0) return bad(`local ${i} never waved`);
      if (Math.abs(t - waits[i]) > 0.05) bad(`local ${i} waved at ${t.toFixed(2)} s, want ${waits[i].toFixed(2)}`);
      if (Math.abs(frames[i] * DT - WAVE_S) > 0.05) bad(`local ${i} waved ${(frames[i] * DT).toFixed(2)} s, want ${WAVE_S}`);
    });
    if (Math.abs(start[0] - start[1]) < 0.3) bad('two locals waved in step');
  }
  const a = newAct();
  if (localHears(a, HORN_HEAR.local + 1, 0.5) != null) bad('a local out of earshot waved');
  if (localHears(a, 20, 0.5, { moving: true }) != null) bad('a walking local waved at the horn');
  if (localHears(a, 20, 0.5, { seated: true }) != null) bad('a seated local waved at the horn');
  a.wave = 1;
  if (localHears(a, 20, 0.5) != null) bad('a local already waving started another');
  // Owed a wave but starts walking: no wave.
  const w = newAct();
  w.waveIn = 0.3;
  for (let k = 0; k < 60; k++) actStep(w, { ...still, moving: true }, DT);
  if (w.wave > 0) bad('a local waved while walking');
}

// ---------- the farm dog ----------
{
  const W = setRegion('fenwick');
  const dog = farmDogsIn(W)[0];
  if (!dog) bad('no farm dog in fenwick');
  else {
    const line = fenceLine(dog);
    // On river_rd west of the farm, out of the dog's sight but in earshot.
    const car = { x: 4700, y: 2042 };
    const me = project(line, car.x, car.y);
    if (!(me.d > DOG.notice && me.d < HORN_HEAR.dog)) bad(`test spot is ${me.d.toFixed(0)} m off the fence, want ${DOG.notice}..${HORN_HEAR.dog}`);
    // Without the horn it sleeps on.
    let st = dogStart(dog);
    for (let k = 0; k < 60 * 5; k++) st = stepDog(dog, st, car, DT);
    if (st.mode !== 'rest' || st.v !== 0) bad('the dog stirred with no horn');
    // Honk: it gets up, runs toward you, barks, then goes home and lies down.
    st = dogHears(dog, st, car.x, car.y);
    let barks = 0;
    let firstBark = -1;
    let ran = 0;
    let rest = -1;
    const s0 = st.s;
    let nearest = st.s;
    for (let k = 0; k < 60 * 90; k++) {
      st = stepDog(dog, st, car, DT);
      if (st.barks && firstBark < 0) firstBark = k * DT;
      barks += st.barks;
      if (Math.abs(st.v) > 3) ran++;
      nearest = Math.min(nearest, st.s);
      if (st.mode === 'rest' && rest < 0) rest = k * DT;
      if (!Number.isFinite(dogLook(dog, st).heading)) bad('dog heading not a number');
    }
    if (firstBark < 0 || firstBark > 0.5) bad(`dog's first bark at ${firstBark.toFixed(2)} s after the horn`);
    if (barks < 5) bad(`only ${barks} barks after the horn`);
    if (ran < 60) bad('the dog hardly ran after the horn');
    if (s0 - nearest < 50) bad(`the dog ran only ${(s0 - nearest).toFixed(0)} m toward the horn`);
    if (rest < 0) bad('the dog never lay back down after the horn');
    else if (Math.abs(st.s - dog.home) > 0.1) bad('the dog lay down away from its spot');
    // Out of earshot: nothing.
    const far = dogStart(dog);
    if (dogHears(dog, far, 4300, 2100) !== far) bad('the dog heard a horn out of earshot');
    // dogHears leaves the state alone.
    const copy = JSON.stringify(far);
    dogHears(dog, far, car.x, car.y);
    if (JSON.stringify(far) !== copy) bad('dogHears changed the state it was given');
  }
}

if (problems.length) {
  console.log(`check-horn: ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 30)) console.log(' -', p);
  process.exit(1);
}
console.log('check-horn: ok (cows look up, locals wave, the dog runs its fence)');
