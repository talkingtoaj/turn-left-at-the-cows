// Locals (SPEC 9q, #56): how each local looks and how they move.
// Pure logic, no three.js, so tools/check-people.mjs can test it.
//
//   personLook(local)          -> the look of that local, the same every time
//   actStep(act, input, dt)    -> waves and talk gestures, ticked per frame
//   personPose(look, act, t, input) -> joint angles for people3d.js
//
// Clothes come from the local's role (overalls and a seed cap for farmers, an
// apron for a waitress, ...). Height, build, skin, hair, gray hair, beard and
// glasses come from a hash of the id, so the same person always looks the
// same and no two look alike.

import { makeRng, hashString } from '../../src/drive/geom.js';

// Every local is drawn this much bigger than life (owner's playtest, #87:
// Dot at the bridge was easy to miss). The one place people are scaled:
// people3d.js scales each whole body by it, so heights, builds and poses
// here stay true to life.
export const PERSON_SCALE = 1.5;

// Locals drawn with a woman's figure (narrower waist, longer hair, no beard).
// From how the game's own text names them (Mrs, her). Everyone else gets a
// man's figure.
const WOMEN = new Set(['dot', 'hartley', 'marisol', 'bev', 'mabel', 'peg', 'dagny', 'ames', 'tourist_miami']);

const SKIN = [0xf1d0b5, 0xe8bf9c, 0xd9a77f, 0xc68c62, 0xa86e48, 0x8a5636, 0x6b3f26, 0x4e2d1c];
const HAIR = [0x1c1714, 0x2e2119, 0x4a3324, 0x6b4a30, 0x8f6a42, 0xc9a56a, 0x8a3f22];
const GRAY = [0x7e7c78, 0xa8a59f, 0xcfccc5];

// Seeded choices per role. Colors are muted work clothes unless the role says
// otherwise (the tourist's loud shirt).
const SHIRTS = [0x6f8fb0, 0xc8c2b0, 0x8a9a6a, 0xa8584a, 0x5a6478, 0xd8d2c0, 0x7a5a48];
const PLAID = [[0xa83228, 0x2a2420], [0x2f5a8a, 0x1c2430], [0x3f6a3a, 0x232a20], [0x8a6a2a, 0x3a2a1a], [0x6a2a4a, 0x241c24]];
const DENIM = [0x3d5878, 0x2f4562, 0x4e6888];
const DUCK = [0x8a6a42, 0x6b5434]; // brown canvas overalls
const CAPS = [0xb3261e, 0x2f6a3a, 0xe8e4da, 0x1f2a42, 0xd8b03a, 0x4a4a4a];
const DRESS = [0x4f7fae, 0xb85a6a, 0x5a9a6e, 0xc9a040];
const CARDI = [0x7a3040, 0x9a6a3a, 0x3f6a6a, 0x6a5a8a, 0x5a6a3a];
const KHAKI = 0xb8a47c;
const OLIVE = 0x5c6440;
const BOOTS = [0x3a2a1e, 0x5a3e28, 0x1e1c1a];

// Which outfit a role wears. First match wins.
const OUTFITS = [
  [/fish/i, 'fisher'],
  [/waitress/i, 'waitress'],
  [/quarry|foreman/i, 'foreman'],
  [/teacher/i, 'teacher'],
  [/mechanic|garage/i, 'mechanic'],
  [/gas station/i, 'attendant'],
  [/store/i, 'storekeeper'],
  [/elevator/i, 'elevator'],
  [/lookout/i, 'lookout'],
  [/flying|airfield|pilot/i, 'pilot'],
  [/farm|farmer/i, 'farmer'],
];
export function outfitOf(local) {
  if (local.tourist) return local.carry === 'briefcase' ? 'suit' : 'tourist';
  for (const [re, kind] of OUTFITS) if (re.test(local.role || '')) return kind;
  return 'farmer';
}

const pickFrom = (list, r) => list[Math.floor(r() * list.length) % list.length];
const mix = (a, b, t) => {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

// The look of local `l` (needs l.id, l.role; uses l.tourist, l.look, l.carry).
export function personLook(l) {
  const r = makeRng(hashString(`person|${l.id}`) || 1);
  const woman = WOMEN.has(l.id);
  const outfit = outfitOf(l);
  const age = outfit === 'teacher' ? 0.75 + r() * 0.25 : r(); // 0 young, 1 old
  const height = (woman ? 1.6 : 1.72) + (r() * 2 - 1) * 0.08;
  const build = 0.88 + r() * 0.34; // 0.88 slim .. 1.22 heavy
  const skin = pickFrom(SKIN, r);
  const gray = age > 0.72 ? Math.min(1, (age - 0.72) / 0.22) : 0;
  const baseHair = pickFrom(HAIR, r);
  let hair = gray > 0 ? mix(baseHair, pickFrom(GRAY, r), gray) : baseHair;
  // Hair close to the skin's shade reads as a bald head: darken it.
  const lum = (c) => (0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255)) / 255;
  if (Math.abs(lum(hair) - lum(skin)) < 0.18) hair = mix(hair, 0x2a1e16, 0.45);
  const styles = woman ? ['long', 'bob', 'bun', 'bob'] : age > 0.65 && r() < 0.5 ? ['bald'] : ['short', 'short', 'crop'];
  let hairStyle = pickFrom(styles, r);
  if (outfit === 'waitress') hairStyle = woman ? 'bun' : 'short';
  const beard = !woman && r() < 0.4 ? (r() < 0.5 ? 'full' : 'mustache') : 'none';
  let glasses = r() < 0.28 ? 'clear' : 'none';
  if (outfit === 'teacher') glasses = 'clear';
  if (outfit === 'pilot') glasses = 'dark';

  // Clothes. torso: what is worn over the shirt; legs: pants, shorts or skirt.
  const c = {
    shirt: pickFrom(SHIRTS, r), shirt2: 0, pat: 0, // pat 0 plain, 1 plaid, 2 loud print
    over: 0, torso: 'shirt', sleeves: r() < 0.5 ? 'long' : 'rolled',
    lower: pickFrom(DENIM, r), legs: 'pants', boots: pickFrom(BOOTS, r), hat: 'none', hatColor: 0, hatColor2: 0,
  };
  const plaid = () => {
    const [a, b] = pickFrom(PLAID, r);
    c.shirt = a;
    c.shirt2 = b;
    c.pat = 1;
  };
  switch (outfit) {
    case 'farmer':
      plaid();
      c.torso = 'overalls';
      c.over = r() < 0.7 ? pickFrom(DENIM, r) : pickFrom(DUCK, r);
      c.lower = c.over;
      c.hat = 'seed';
      c.hatColor = pickFrom(CAPS, r);
      c.hatColor2 = r() < 0.5 ? 0xe8e4da : c.hatColor;
      break;
    case 'waitress':
      c.shirt = pickFrom(DRESS, r);
      c.torso = 'apron';
      c.over = 0xf2efe6;
      c.legs = woman ? 'skirt' : 'pants';
      c.lower = woman ? c.shirt : 0x2a2a2e;
      c.sleeves = 'short';
      c.boots = 0x1e1c1a;
      break;
    case 'foreman':
      c.shirt = pickFrom([0x5a6478, 0x8a9a6a, 0xc8c2b0], r);
      c.torso = 'vest';
      c.over = pickFrom([0xf06a1e, 0xd8e23a], r);
      c.hat = 'hard';
      c.hatColor = pickFrom([0xf2f0e8, 0xf0c020, 0xf06a1e], r);
      c.sleeves = 'rolled';
      break;
    case 'teacher':
      c.shirt = pickFrom([0xece6d6, 0xd8c8d8, 0xc8d8e0], r);
      c.torso = 'cardigan';
      c.over = pickFrom(CARDI, r);
      c.legs = woman ? 'skirt' : 'pants';
      c.lower = pickFrom([0x4a4038, 0x3a4048, 0x6a5a48], r);
      c.sleeves = 'long';
      c.boots = 0x2a1e18;
      break;
    case 'mechanic':
      c.torso = 'coveralls';
      c.over = pickFrom([0x2f3e5a, 0x5a5e60, 0x3e4a38], r);
      c.shirt = c.over;
      c.lower = c.over;
      c.hat = 'seed';
      c.hatColor = pickFrom(CAPS, r);
      c.hatColor2 = c.hatColor;
      break;
    case 'attendant':
      c.shirt = pickFrom([0x9ab4cc, 0xd8d2c0], r);
      c.lower = 0x2a3448;
      c.hat = 'seed';
      c.hatColor = pickFrom([0xb3261e, 0x1f2a42], r);
      c.hatColor2 = 0xe8e4da;
      c.sleeves = 'short';
      break;
    case 'storekeeper':
      c.torso = 'apron';
      c.over = pickFrom([0x2f5a3a, 0x7a3a28, 0x3a4a6a], r);
      if (r() < 0.5) plaid();
      c.lower = woman ? pickFrom([0x4a4038, 0x3a4048], r) : c.lower;
      c.legs = woman && r() < 0.5 ? 'skirt' : 'pants';
      break;
    case 'elevator':
      c.torso = 'jacket';
      c.over = pickFrom([0xb08a52, 0x8a6a3e], r);
      plaid();
      c.hat = 'seed';
      c.hatColor = pickFrom(CAPS, r);
      c.hatColor2 = c.hatColor;
      break;
    case 'lookout':
      c.shirt = KHAKI;
      c.lower = OLIVE;
      c.hat = 'campaign';
      c.hatColor = 0x8a6a42;
      c.hatColor2 = 0x3a2a1a;
      break;
    case 'pilot':
      c.torso = 'jacket';
      c.over = pickFrom([0x5a3a24, 0x3e2a1c], r);
      c.shirt = KHAKI;
      c.lower = pickFrom([KHAKI, 0x4a4a48], r);
      break;
    case 'fisher':
      c.torso = 'fishvest';
      c.over = pickFrom([OLIVE, 0x8a7a58], r);
      c.shirt = pickFrom([0xa8584a, 0x6f8fb0, 0xd8d2c0], r);
      c.hat = 'bucket';
      c.hatColor = pickFrom([0xd8c89a, 0x8a8a6a], r);
      c.hatColor2 = c.hatColor;
      break;
    case 'tourist': {
      const lk = l.look || {};
      c.shirt = lk.shirt != null ? lk.shirt : 0xf2605c;
      c.shirt2 = pickFrom([0xf6e7a8, 0x2a8a8a, 0xf2f0e6, 0x3a5aa8], r);
      c.pat = 2;
      c.sleeves = 'short';
      c.legs = 'shorts';
      c.lower = lk.legs != null ? lk.legs : 0xd8cfae;
      c.boots = 0xe8e4da; // sneakers
      c.hat = 'sun';
      c.hatColor = lk.hat != null ? lk.hat : 0xf3f0e4;
      c.hatColor2 = pickFrom([0x2a2a2a, 0xb3261e, 0x2a8a8a], r);
      if (l.carry === 'binoculars') {
        c.pat = 0;
        c.legs = 'pants';
        c.sleeves = 'rolled';
        c.boots = 0x5a3e28;
      }
      break;
    }
    case 'suit': {
      const lk = l.look || {};
      c.torso = 'suit';
      c.over = lk.shirt != null ? lk.shirt : 0x262a36;
      c.shirt = 0xf2f0ea;
      c.shirt2 = pickFrom([0x7a2028, 0x2a3a6a], r); // tie
      c.lower = lk.legs != null ? lk.legs : c.over;
      c.sleeves = 'suit';
      c.boots = 0x141210;
      break;
    }
  }
  // How they stand when idle. The fisher fishes.
  const idles = ['relaxed', 'hips', 'crossed', 'pockets', 'lean'];
  const idle = outfit === 'fisher' ? 'cast' : pickFrom(idles, r);
  return {
    id: l.id, outfit, woman, age, height, build, skin, hair, gray, hairStyle, beard, glasses,
    ...c, carry: l.carry || (outfit === 'fisher' ? 'rod' : null), idle, seed: r(),
    seated: !!l.sit, // on a bridge's edge, legs over (#64)
  };
}

// ---------- acting: waves and talking ----------

export const WAVE_S = 2.4; // how long a wave lasts
export const WAVE_NEAR = 22; // m: the car pulling up this close gets a wave
export const WAVE_REARM = 45; // m: and must have been this far away first
export const PULL_UP = 6; // m/s: slower than this counts as pulling up

export function newAct() {
  return { armed: false, wave: 0, talk: 0, time: 0, waveIn: 0 };
}

// input: { carDist (m, the player's car), carSpeed (m/s), onFoot, moving, talking }
export function actStep(a, inp, dt) {
  a.time += dt;
  if (inp.carDist > WAVE_REARM) a.armed = true;
  // A wave owed to the horn (#74, hornHeard.js localHears): after its delay,
  // unless already waving. It counts as the pull-up wave too.
  if (a.waveIn > 0) {
    a.waveIn -= dt;
    if (a.waveIn <= 0 && a.wave <= 0 && !inp.moving && !inp.onFoot) {
      a.wave = WAVE_S + dt;
      a.armed = false;
    }
  }
  if (a.wave > 0) a.wave = Math.max(0, a.wave - dt);
  else if (a.armed && !inp.onFoot && !inp.moving && inp.carDist < WAVE_NEAR && Math.abs(inp.carSpeed) < PULL_UP) {
    a.wave = WAVE_S;
    a.armed = false;
  }
  a.talk = inp.talking ? Math.min(1, a.talk + dt * 3) : Math.max(0, a.talk - dt * 2);
  return a;
}

// ---------- pose ----------

// Bones, in the order people3d.js builds them.
export const BONES = ['root', 'pelvis', 'spine', 'head', 'uaL', 'faL', 'uaR', 'faR', 'thL', 'shL', 'thR', 'shR'];

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Joint angles at time t (s). Returns { rot: {bone: [x, y, z]}, drop (m),
// breathe (chest scale) }. x swings a limb forward, z out to the side
// (+z lifts the right arm out). input: { moving, walk (phase), headYaw }.
export function personPose(look, a, t, inp) {
  const rot = {};
  for (const b of BONES) rot[b] = [0, 0, 0];
  const s = look.seed * 100;
  // Arms hang a little out from the body, elbows soft.
  rot.uaL[2] = -0.07;
  rot.uaR[2] = 0.07;
  rot.faL[0] = 0.12;
  rot.faR[0] = 0.12;
  let drop = 0;
  const breathe = 1 + 0.012 * Math.sin(t * 1.7 + s);
  if (inp.moving) {
    const p = inp.walk;
    const sw = Math.sin(p);
    rot.thL[0] = 0.42 * sw;
    rot.thR[0] = -0.42 * sw;
    rot.shL[0] = -0.55 * Math.max(0, -Math.cos(p));
    rot.shR[0] = -0.55 * Math.max(0, Math.cos(p));
    rot.uaL[0] = -0.32 * sw;
    rot.uaR[0] = 0.32 * sw;
    rot.faL[0] = 0.25 + 0.15 * Math.max(0, -sw);
    rot.faR[0] = 0.25 + 0.15 * Math.max(0, sw);
    rot.spine[1] = 0.06 * sw;
    rot.spine[0] = 0.04;
    drop = 0.025 * Math.abs(Math.cos(p));
  } else {
    switch (look.idle) {
      case 'hips':
        rot.uaL[2] = -0.62; rot.uaR[2] = 0.62;
        rot.uaL[0] = -0.2; rot.uaR[0] = -0.2;
        rot.faL[2] = 1.55; rot.faR[2] = -1.55;
        rot.faL[0] = 0.3; rot.faR[0] = 0.3;
        break;
      case 'crossed':
        rot.uaL[0] = 0.3; rot.uaR[0] = 0.3;
        rot.uaL[2] = -0.18; rot.uaR[2] = 0.18;
        rot.faL[0] = 1.45; rot.faR[0] = 1.35;
        rot.faL[2] = 0.95; rot.faR[2] = -0.95; // forearms across the chest
        break;
      case 'pockets':
        rot.uaL[0] = -0.12; rot.uaR[0] = -0.12;
        rot.uaL[2] = -0.16; rot.uaR[2] = 0.16;
        rot.faL[0] = 0.28; rot.faR[0] = 0.28;
        break;
      case 'lean':
        rot.pelvis[2] = 0.05;
        rot.spine[2] = -0.07;
        rot.thL[2] = -0.06;
        rot.shL[0] = -0.25; rot.thL[0] = 0.12;
        rot.uaR[2] = 0.5; rot.faR[2] = -1.4; rot.uaR[0] = -0.2; // hand on hip
        break;
      case 'cast': {
        // Rod held out front; every 11 s or so a cast: back, then a flick.
        rot.uaR[0] = 0.55;
        rot.faR[0] = 0.85;
        rot.uaL[0] = 0.45; rot.faL[0] = 0.9; rot.uaL[2] = 0.12; // left hand near the reel
        const cyc = (t + look.seed * 11) % 11;
        if (cyc < 1.6 && !look.seated) { // sitting, she waits on the bobber
          const back = smooth(cyc / 0.7) * (1 - smooth((cyc - 0.8) / 0.35));
          rot.uaR[0] += 1.5 * back - 0.25 * smooth((cyc - 1.0) / 0.3) * (1 - smooth((cyc - 1.3) / 0.3));
          rot.faR[0] += 0.4 * back;
          rot.spine[0] = -0.06 * back;
        }
        break;
      }
    }
    if (look.seated) {
      // Sitting on an edge: thighs out level, shins hanging over and swinging
      // slowly, one after the other; a little hunched toward the water.
      rot.thL[0] = 1.5; rot.thR[0] = 1.5;
      rot.thL[2] = -0.07; rot.thR[2] = 0.07;
      rot.shL[0] = -1.4 + 0.2 * Math.sin(t * 0.8 + s);
      rot.shR[0] = -1.4 + 0.2 * Math.sin(t * 0.8 + s + 2.4);
      rot.spine[0] += 0.14;
    } else {
      // Shift of weight now and then.
      rot.pelvis[2] += 0.015 * Math.sin(t * 0.37 + s);
    }
  }
  // Talking: hands move a little, the head nods.
  if (a.talk > 0 && !inp.moving && look.idle !== 'cast') {
    const k = a.talk;
    rot.uaL[0] = rot.uaL[0] * (1 - k) + k * (0.25 + 0.1 * Math.sin(t * 1.9 + s));
    rot.uaR[0] = rot.uaR[0] * (1 - k) + k * (0.3 + 0.12 * Math.sin(t * 2.3 + s + 1));
    rot.uaL[2] = rot.uaL[2] * (1 - k) + k * -0.12;
    rot.uaR[2] = rot.uaR[2] * (1 - k) + k * 0.12;
    rot.faL[2] = rot.faL[2] * (1 - k) + k * 0.3;
    rot.faR[2] = rot.faR[2] * (1 - k) - k * 0.3;
    rot.faL[0] = rot.faL[0] * (1 - k) + k * (1.05 + 0.3 * Math.sin(t * 2.7 + s));
    rot.faR[0] = rot.faR[0] * (1 - k) + k * (1.1 + 0.35 * Math.sin(t * 3.1 + s + 2));
    rot.head[0] += k * 0.05 * Math.sin(t * 2.2 + s);
  }
  // A wave: the right arm up and out, the hand swinging side to side. Not
  // sitting fishing: that hand holds the rod out over the water.
  if (a.wave > 0 && !look.seated) {
    const e = smooth((WAVE_S - a.wave) / 0.35) * smooth(a.wave / 0.4);
    rot.uaR[0] = rot.uaR[0] * (1 - e) + e * 0.25;
    rot.uaR[1] = rot.uaR[1] * (1 - e);
    rot.uaR[2] = rot.uaR[2] * (1 - e) + e * 2.55;
    rot.faR[0] = rot.faR[0] * (1 - e);
    rot.faR[1] = rot.faR[1] * (1 - e);
    rot.faR[2] = rot.faR[2] * (1 - e) + e * (0.35 * Math.sin(a.time * 10));
  }
  // The head turns to what they watch before the body does; a slow look
  // around when nothing is near.
  rot.head[1] = inp.headYaw != null ? inp.headYaw : 0.35 * Math.sin(t * 0.21 + s) * Math.sin(t * 0.13 + s * 2);
  rot.head[0] += 0.04 * Math.sin(t * 0.3 + s);
  return { rot, drop, breathe };
}
