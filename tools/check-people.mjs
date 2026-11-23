// Checks the locals' looks and moves (#56): src3/world3d/peopleLook.js.
//   node tools/check-people.mjs
// - looks are seeded by id (same id, same look; order does not matter)
// - clothes fit the role (overalls and a seed cap for farmers, ...)
// - no two locals of a region look alike (at least 3 visible features differ)
// - waves: once as the car pulls up, again only after it left; never on foot,
//   walking, or for a car that drives on past
// - poses: legs swing opposite when walking, a wave lifts the right arm,
//   every angle finite for every local in every state
// - body geometry: one bone per vertex in range, fine body under 6k
//   triangles, the far body under 1.6k

import { regionWorld, REGION_IDS } from '../src/world/world.js';
import { personLook, outfitOf, newAct, actStep, personPose, BONES, WAVE_S } from '../src3/world3d/peopleLook.js';

let fails = 0;
const fail = (msg) => {
  fails++;
  console.log('FAIL', msg);
};

// What each outfit must show.
const FITS = {
  farmer: (L) => L.torso === 'overalls' && L.hat === 'seed' && L.pat === 1,
  waitress: (L) => L.torso === 'apron',
  foreman: (L) => L.torso === 'vest' && L.hat === 'hard',
  teacher: (L) => L.torso === 'cardigan' && L.glasses !== 'none',
  tourist: (L) => L.hat === 'sun' && (L.pat === 2 || L.carry === 'binoculars'),
  suit: (L) => L.torso === 'suit' && L.carry === 'briefcase',
  fisher: (L) => L.carry === 'rod' && L.idle === 'cast' && L.hat === 'bucket',
  mechanic: (L) => L.torso === 'coveralls',
  attendant: (L) => L.hat === 'seed',
  storekeeper: (L) => L.torso === 'apron',
  elevator: (L) => L.torso === 'jacket',
  lookout: (L) => L.hat === 'campaign',
  pilot: (L) => L.torso === 'jacket' && L.glasses === 'dark',
};
const FEATURES = ['height', 'build', 'skin', 'hair', 'hairStyle', 'beard', 'glasses', 'shirt', 'over', 'lower', 'hat', 'hatColor', 'torso', 'legs'];
const feat = (L, k) => (k === 'height' ? Math.round(L.height / 0.03) : k === 'build' ? Math.round(L.build / 0.06) : L[k]);

let nLocals = 0;
const allLooks = [];
for (const rid of REGION_IDS) {
  const w = regionWorld(rid);
  const looks = [];
  for (const l of w.locals) {
    nLocals++;
    const a = personLook(l);
    const b = personLook({ ...l });
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${l.id}: look not stable`);
    const kind = outfitOf(l);
    if (kind === 'farmer' && !/farm/i.test(l.role || '')) fail(`${l.id} (${l.role}): no outfit for this role, fell back to farmer`);
    if (!FITS[kind] || !FITS[kind](a)) fail(`${l.id} (${l.role}): outfit ${kind} does not fit`);
    if (a.woman && a.beard !== 'none') fail(`${l.id}: beard on a woman's figure`);
    if (!(a.height > 1.48 && a.height < 1.86)) fail(`${l.id}: height ${a.height}`);
    if (!(a.build >= 0.88 && a.build <= 1.22)) fail(`${l.id}: build ${a.build}`);
    looks.push(a);
    allLooks.push([l, a]);
  }
  // No two alike within a region.
  let minDiff = Infinity;
  let pair = '';
  for (let i = 0; i < looks.length; i++) {
    for (let j = i + 1; j < looks.length; j++) {
      const d = FEATURES.filter((k) => feat(looks[i], k) !== feat(looks[j], k)).length;
      if (d < minDiff) {
        minDiff = d;
        pair = `${looks[i].id}/${looks[j].id}`;
      }
    }
  }
  if (minDiff < 3) fail(`${rid}: ${pair} differ in only ${minDiff} features`);
  const kinds = new Set(looks.map((L) => L.skin)).size;
  console.log(`${rid}: ${looks.length} locals, closest pair ${pair} differs in ${minDiff} of ${FEATURES.length} features, ${kinds} skin tones`);
}
// Seeded by id, not by place in the list: the same id elsewhere looks the same.
{
  const [l, a] = allLooks[0];
  if (JSON.stringify(personLook({ ...l, x: 0, y: 0 })) !== JSON.stringify(a)) fail('look depends on position');
}

// ---------- waves, ticked ----------
const DT = 1 / 60;
function drive(a, frames, f) {
  let waves = 0;
  let was = a.wave > 0;
  for (let i = 0; i < frames; i++) {
    actStep(a, f(i), DT);
    if (a.wave > 0 && !was) waves++;
    was = a.wave > 0;
  }
  return waves;
}
{
  // The car comes in from 120 m, slows and stops 8 m away; sits a while.
  const a = newAct();
  let dist = 120;
  let speed = 18;
  const w1 = drive(a, 60 * 20, () => {
    if (dist > 8) {
      speed = Math.max(1.5, Math.min(18, (dist - 8) * 0.6));
      dist -= speed * DT;
    } else speed = 0;
    return { carDist: dist, carSpeed: speed, onFoot: false, moving: false, talking: false };
  });
  if (w1 !== 1) fail(`pull-up: ${w1} waves, want 1`);
  // It drives away to 70 m, comes back: one more wave.
  const w2 = drive(a, 60 * 12, (i) => {
    const t = i / 60;
    const d = t < 6 ? 8 + t * 10.5 : 71 - (t - 6) * 10.5;
    return { carDist: Math.max(8, d), carSpeed: d > 8 ? 4 : 0, onFoot: false, moving: false, talking: false };
  });
  if (w2 !== 1) fail(`leave and return: ${w2} waves, want 1`);
  // Wave lasts WAVE_S.
  const b = newAct();
  b.armed = true;
  let frames = 0;
  actStep(b, { carDist: 10, carSpeed: 0, onFoot: false, moving: false, talking: false }, DT);
  while (b.wave > 0 && frames < 1000) {
    actStep(b, { carDist: 10, carSpeed: 0, onFoot: false, moving: false, talking: false }, DT);
    frames++;
  }
  if (Math.abs(frames * DT - WAVE_S) > 0.05) fail(`wave lasted ${(frames * DT).toFixed(2)} s, want ${WAVE_S}`);
  // A car driving straight past at 25 m/s: no wave.
  const c = newAct();
  const w3 = drive(c, 60 * 10, (i) => ({ carDist: Math.abs(100 - (i / 60) * 25) + 5, carSpeed: 25, onFoot: false, moving: false, talking: false }));
  if (w3) fail(`a car driving past got ${w3} waves`);
  // On foot, or while walking: no wave.
  const d = newAct();
  const w4 = drive(d, 60 * 10, (i) => ({ carDist: Math.max(3, 80 - i / 6), carSpeed: 1, onFoot: true, moving: false, talking: false }));
  const e = newAct();
  const w5 = drive(e, 60 * 10, (i) => ({ carDist: Math.max(5, 80 - i / 6), carSpeed: 2, onFoot: false, moving: true, talking: false }));
  if (w4 || w5) fail(`waves on foot ${w4}, walking ${w5}, want 0`);
  // Never armed at start: the game starting beside someone is no pull-up.
  const f = newAct();
  if (drive(f, 600, () => ({ carDist: 6, carSpeed: 0, onFoot: false, moving: false, talking: false }))) fail('waved at a car that never arrived');
  // Talk eases in and out.
  const g = newAct();
  drive(g, 10, () => ({ carDist: 6, carSpeed: 0, onFoot: true, moving: false, talking: true }));
  const mid = g.talk;
  drive(g, 60, () => ({ carDist: 6, carSpeed: 0, onFoot: true, moving: false, talking: true }));
  const full = g.talk;
  drive(g, 120, () => ({ carDist: 6, carSpeed: 0, onFoot: true, moving: false, talking: false }));
  if (!(mid > 0 && mid < 1 && full === 1 && g.talk === 0)) fail(`talk ease: ${mid}, ${full}, ${g.talk}`);
}

// ---------- poses ----------
for (const [, L] of allLooks) {
  const a = newAct();
  for (const st of [{ moving: false }, { moving: true }, { talk: 1 }, { wave: 1.2 }]) {
    a.talk = st.talk || 0;
    a.wave = st.wave || 0;
    for (let t = 0; t < 30; t += 0.7) {
      const p = personPose(L, a, t, { moving: !!st.moving, walk: t * 7, headYaw: st.moving ? null : 0.4 });
      for (const b of BONES) for (const v of p.rot[b]) if (!Number.isFinite(v)) fail(`${L.id}: ${b} not finite`);
      if (!(Math.abs(p.rot.head[1]) <= 1.2)) fail(`${L.id}: head turned ${p.rot.head[1]}`);
    }
  }
}
{
  const L = allLooks[0][1];
  const a = newAct();
  const p1 = personPose(L, a, 1, { moving: true, walk: Math.PI / 2, headYaw: null });
  const p2 = personPose(L, a, 1.4, { moving: true, walk: Math.PI * 1.5, headYaw: null });
  if (!(p1.rot.thL[0] > 0.3 && p1.rot.thR[0] < -0.3 && p2.rot.thL[0] < -0.3 && p2.rot.thR[0] > 0.3)) fail('legs do not swing opposite, or do not swap');
  if (!(p1.rot.uaR[0] * p1.rot.thR[0] < 0)) fail('arms do not swing against the legs');
  a.wave = WAVE_S / 2;
  const pw = personPose(L, a, 2, { moving: false, walk: 0, headYaw: 0 });
  if (!(pw.rot.uaR[2] > 2)) fail(`wave: right arm only at ${pw.rot.uaR[2]}`);
  a.wave = 0;
  const pn = personPose(L, a, 2, { moving: false, walk: 0, headYaw: 0 });
  if (pn.rot.uaR[2] > 1) fail('arm still up after the wave');
}

// ---------- sitting on the broken bridge (Dot, #64) ----------
{
  const { WALK } = await import('../src/game/onfoot.js');
  const { Collider } = await import('../src/drive/collider.js');
  const w = regionWorld(REGION_IDS[0]);
  const sitters = REGION_IDS.flatMap((rid) => regionWorld(rid).locals.filter((l) => l.perch));
  const dot = w.locals.find((l) => l.id === 'dot');
  if (!dot || !dot.sit) fail('dot: not sitting');
  for (const l of sitters) {
    const rw = REGION_IDS.map((rid) => regionWorld(rid)).find((q) => q.locals.includes(l)) || w;
    const b = rw.bridges.find((q) => q.id === l.perch.bridgeId);
    if (!b || !l.sit) { fail(`${l.id}: perched on a missing bridge ${l.perch.bridgeId}`); continue; }
    if (!l.stay) fail(`${l.id}: sits but would wander off (stay)`);
    if (b.intact) fail(`${l.id}: sits on the end of a bridge that is whole`);
    // On the stub, hips just back from the broken edge, so the legs hang over.
    const stub = (b.length - b.waterWidth) / 2 + 1.5;
    const edge = b.length / 2 - stub;
    const back = Math.abs(l.sit.along) - edge;
    if (!(back > 0.1 && back < 0.6)) fail(`${l.id}: hips ${back.toFixed(2)} m back from the edge, want 0.1 to 0.6`);
    if (!(Math.abs(l.sit.across) < b.width / 2 - 1)) fail(`${l.id}: off the side of the deck (across ${l.sit.across})`);
    // You can still talk to her: somewhere you can stand on foot (the
    // world's collider: water, rails, people) well inside talk range.
    const col = new Collider(rw, { trees: [] });
    let bank = Infinity;
    for (let dx = -WALK.talkR; dx <= WALK.talkR; dx += 0.1) {
      for (let dy = -WALK.talkR; dy <= WALK.talkR; dy += 0.1) {
        if (col.circleHit(l.x + dx, l.y + dy, WALK.r) === null) bank = Math.min(bank, Math.hypot(dx, dy));
      }
    }
    if (!(bank < WALK.talkR - 0.5)) fail(`${l.id}: nearest place to stand ${bank.toFixed(1)} m away, talk range ${WALK.talkR} m`);
    // Faces the middle of the bridge (the gap).
    const toMid = l.sit.along > 0 ? b.angle : (b.angle + 180) % 360;
    if (Math.abs(((l.sit.heading - toMid + 540) % 360) - 180) > 1) fail(`${l.id}: faces ${l.sit.heading}, not the gap`);
  }
  // Pose ticked over 8 s: thighs out level, shins hanging and swinging, the
  // rod held still (no cast), no wave with the rod hand.
  const L = personLook(dot);
  if (!L.seated) fail('dot: look not seated');
  const a = newAct();
  let shMin = Infinity, shMax = -Infinity, rodMin = Infinity, rodMax = -Infinity, apart = 0;
  for (let i = 0; i <= 480; i++) {
    const t = i / 60;
    a.wave = i > 240 && i < 300 ? WAVE_S / 2 : 0;
    const p = personPose(L, a, t, { moving: false, walk: 0, headYaw: 0.3 });
    for (const b of BONES) if (!p.rot[b].every(Number.isFinite)) fail(`seated: ${b} not finite at ${t}`);
    if (!(p.rot.thL[0] > 1.3 && p.rot.thR[0] > 1.3)) fail(`seated: thighs at ${p.rot.thL[0]} at ${t}`);
    if (!(p.rot.shL[0] < -1.1 && p.rot.shL[0] > -1.7)) fail(`seated: shin at ${p.rot.shL[0]} at ${t}`);
    shMin = Math.min(shMin, p.rot.shL[0]);
    shMax = Math.max(shMax, p.rot.shL[0]);
    rodMin = Math.min(rodMin, p.rot.uaR[0] + p.rot.faR[0]);
    rodMax = Math.max(rodMax, p.rot.uaR[0] + p.rot.faR[0]);
    apart = Math.max(apart, Math.abs(p.rot.shL[0] - p.rot.shR[0]));
    if (p.rot.uaR[2] > 1) fail(`seated: rod arm waved at ${t}`);
  }
  if (shMax - shMin < 0.2) fail(`seated: legs do not swing (${(shMax - shMin).toFixed(2)})`);
  if (apart < 0.15) fail('seated: both legs swing together');
  if (rodMax - rodMin > 0.01) fail(`seated: the rod moves ${(rodMax - rodMin).toFixed(2)} (her line is fixed to it)`);
  // A standing fisher still casts.
  const S = { ...L, seated: false };
  let castMax = 0;
  for (let i = 0; i <= 660; i++) castMax = Math.max(castMax, personPose(S, newAct(), i / 60, { moving: false, walk: 0, headYaw: 0 }).rot.uaR[0]);
  if (castMax < 1.2) fail('standing fisher no longer casts');
}

// ---------- geometry ----------
let geoNote = 'skipped';
try {
  const { buildPersonGeometry } = await import('../src3/world3d/people3d.js');
  let maxNear = 0;
  let maxFar = 0;
  for (const [, L] of allLooks) {
    for (const q of [1, 0]) {
      const g = buildPersonGeometry(L, q);
      const tris = g.index.count / 3;
      if (q) maxNear = Math.max(maxNear, tris);
      else maxFar = Math.max(maxFar, tris);
      const si = g.attributes.skinIndex.array;
      for (let i = 0; i < si.length; i += 4) if (si[i] >= BONES.length) { fail(`${L.id}: bone ${si[i]}`); break; }
      g.dispose();
    }
  }
  if (maxNear > 6000) fail(`fine body ${maxNear} triangles`);
  if (maxFar > 1600) fail(`far body ${maxFar} triangles`);
  geoNote = `fine body up to ${maxNear} triangles, far up to ${maxFar}`;
} catch (e) {
  fail(`could not build the body geometry: ${e.message}`);
}

console.log(`check:people: ${nLocals} locals, waves and poses ticked, ${geoNote}`);
if (fails) {
  console.log(`check:people: ${fails} failures`);
  process.exit(1);
}
console.log('check:people: ok');
