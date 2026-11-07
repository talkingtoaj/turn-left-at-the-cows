// Sims-style gibberish voices for the locals.
//
// UI hook: call speak(npcId, text) each time a local's dialogue page shows,
// and speak(null) when the dialogue closes. The audio module picks it up on
// its next update, so the UI needs no reference to the audio object.
//
// Each local gets one of 3 voices for their gender plus a small fixed pitch
// shift from a hash of their id, so no two locals sound quite the same.

// NPC data (src/world/npcs.js) has no gender field, so it lives here.
// Locals not listed get a gender from their id hash.
export const VOICE_GENDER = {
  earl: 'm',
  dot: 'f',
  hartley: 'f',
  gus: 'm',
  marisol: 'f',
  bev: 'f',
  hank: 'm',
  frank: 'm',
  ade: 'm',
  mabel: 'f',
  // Tow truck drivers (src/game/tow.js).
  tow_wade: 'm',
  tow_junie: 'f',
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// { id: 'voices/m2', rate: 0.93, gender: 'm' }. rate is the playback rate
// (pitch shift), between 0.88 and 1.12.
export function voiceFor(npcId) {
  const h = hash(String(npcId));
  const gender = VOICE_GENDER[npcId] || (h & 1 ? 'f' : 'm');
  const n = 1 + ((h >>> 3) % 3);
  const rate = 0.88 + (((h >>> 9) % 25) / 100);
  return { id: `voices/${gender}${n}`, rate, gender };
}

// Pending speech requests, read by the audio module.
let pending = null;
let seq = 0;

export function speak(npcId, text) {
  pending = { npcId: npcId || null, text: text || '', seq: ++seq };
}

export function takeSpeech() {
  const p = pending;
  pending = null;
  return p;
}
