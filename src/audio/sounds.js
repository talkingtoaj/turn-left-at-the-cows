// Every sound file the game uses, grouped for the review page (sounds.html).
// Files live in public/sounds/<id>.mp3 (sources in public/sounds/SOURCES.md).
// kind: 'loop' plays forever; 'oneshot' plays once.

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

export const soundUrl = (id) => `${BASE}sounds/${id}.mp3`;

// Engine loops and the RPM each one sounds right at (playback rate 1).
// The files are pitched (tools/sounds/process.py) so all three sit on one
// curve, pitch ~ sqrt(rpm), which keeps the crossfade smooth.
export const ENGINE_LAYERS = [
  { id: 'engine/idle', rpm: 900 },
  { id: 'engine/mid', rpm: 2000 },
  { id: 'engine/high', rpm: 3600 },
];
// Pitch follows sqrt(rpm / layer rpm), capped so the high loop never turns shrill.
const RATE_MIN = 0.8;
const RATE_MAX = 1.3;

// Crossfade between the engine layers for an RPM: [{ gain, rate }] per layer.
// Neighbouring layers blend with an equal-power curve; each layer's pitch is
// nudged toward the RPM (clamped so no layer sounds silly).
export function engineMix(rpm) {
  const L = ENGINE_LAYERS;
  const out = L.map((l) => ({ gain: 0, rate: Math.max(RATE_MIN, Math.min(RATE_MAX, Math.sqrt(rpm / l.rpm))) }));
  if (rpm <= L[0].rpm) out[0].gain = 1;
  else if (rpm >= L[L.length - 1].rpm) out[L.length - 1].gain = 1;
  else {
    for (let i = 0; i < L.length - 1; i++) {
      if (rpm < L[i + 1].rpm) {
        const t = (rpm - L[i].rpm) / (L[i + 1].rpm - L[i].rpm);
        out[i].gain = Math.cos((t * Math.PI) / 2);
        out[i + 1].gain = Math.sin((t * Math.PI) / 2);
        break;
      }
    }
  }
  return out;
}

export const SOUND_GROUPS = [
  {
    group: 'Engine',
    items: [
      { id: 'engine/idle', kind: 'loop', label: 'Idle / low RPM' },
      { id: 'engine/mid', kind: 'loop', label: 'Mid RPM' },
      { id: 'engine/high', kind: 'loop', label: 'High RPM' },
      { id: 'engine/reverse', kind: 'loop', label: 'Reversing' },
    ],
  },
  {
    group: 'Tyres',
    items: [
      { id: 'tyres/paved', kind: 'loop', label: 'Paved road' },
      { id: 'tyres/gravel', kind: 'loop', label: 'Gravel / dirt road' },
      { id: 'tyres/grass', kind: 'loop', label: 'Grass / field' },
      { id: 'tyres/shrub', kind: 'oneshot', label: 'Shrub swish (driving through a shrub)' },
    ],
  },
  {
    group: 'Nature',
    items: [
      { id: 'nature/creek', kind: 'loop', label: 'Creek' },
      { id: 'nature/river', kind: 'loop', label: 'River' },
      { id: 'nature/birdsong', kind: 'loop', label: 'Birdsong bed (near trees with birds)' },
      { id: 'nature/bird1', kind: 'oneshot', label: 'Bird chirp 1' },
      { id: 'nature/bird2', kind: 'oneshot', label: 'Bird chirp 2' },
      { id: 'nature/bird3', kind: 'oneshot', label: 'Bird chirp 3 (sparrow)' },
      { id: 'nature/bird4', kind: 'oneshot', label: 'Bird chirp 4 (tweets)' },
    ],
  },
  {
    group: 'Town',
    items: [
      { id: 'town/murmur', kind: 'loop', label: 'Quiet main street' },
      { id: 'bell/bell', kind: 'oneshot', label: 'Church bell (one strike)' },
    ],
  },
  {
    group: 'Animals',
    items: [
      { id: 'animals/cow1', kind: 'oneshot', label: 'Cow 1' },
      { id: 'animals/cow2', kind: 'oneshot', label: 'Cow 2' },
      { id: 'animals/cow3', kind: 'oneshot', label: 'Cow 3' },
      { id: 'animals/dog1', kind: 'oneshot', label: 'Dog bark 1' },
      { id: 'animals/dog2', kind: 'oneshot', label: 'Dog bark 2' },
      { id: 'animals/dog3', kind: 'oneshot', label: 'Dog barks 3 (several)' },
      { id: 'animals/horse1', kind: 'oneshot', label: 'Horse whinny 1' },
      { id: 'animals/horse2', kind: 'oneshot', label: 'Horse neigh 2' },
    ],
  },
  {
    group: 'Voices',
    items: [
      { id: 'voices/m1', kind: 'loop', label: 'Man 1 (cheerful)' },
      { id: 'voices/m2', kind: 'loop', label: 'Man 2 (calm, deep)' },
      { id: 'voices/m3', kind: 'loop', label: 'Man 3 (lively)' },
      { id: 'voices/f1', kind: 'loop', label: 'Woman 1 (cheerful)' },
      { id: 'voices/f2', kind: 'loop', label: 'Woman 2 (warm, soft)' },
      { id: 'voices/f3', kind: 'loop', label: 'Woman 3 (quick, chatty)' },
    ],
  },
  {
    group: 'Damage',
    items: [
      { id: 'damage/flat_tyre', kind: 'loop', label: 'Flat tyre flapping' },
      { id: 'damage/crash', kind: 'oneshot', label: 'Crash thud' },
      { id: 'damage/chip1', kind: 'oneshot', label: 'Stone chip 1 (too fast on rough ground)' },
      { id: 'damage/chip2', kind: 'oneshot', label: 'Stone chip 2 (ping)' },
      { id: 'damage/chip3', kind: 'oneshot', label: 'Stone chip 3 (tick)' },
      { id: 'damage/thump1', kind: 'oneshot', label: 'Underbody thump 1 (bigger knock)' },
      { id: 'damage/thump2', kind: 'oneshot', label: 'Underbody thump 2' },
    ],
  },
  {
    group: 'Car',
    items: [
      { id: 'car/horn', kind: 'oneshot', label: 'Horn (B key), one friendly honk' },
    ],
  },
  // Round 10: light planes at the airfield (src3/world3d/planes3d.js).
  {
    group: 'Aircraft',
    items: [
      { id: 'aircraft/prop', kind: 'loop', label: 'Light plane propeller drone (pitched with throttle and Doppler in the game)' },
    ],
  },
  // Round 11: the tow truck after a breakdown (src3/tow3d.js).
  {
    group: 'Tow truck',
    items: [
      { id: 'tow/engine', kind: 'loop', label: 'Tow truck diesel idle (pitched up as it drives in)' },
      { id: 'tow/chain', kind: 'oneshot', label: 'Tow chain rattle (hooking the car up)' },
      { id: 'tow/winch', kind: 'oneshot', label: 'Tow winch ratchet (pulling the car up)' },
    ],
  },
  // Round 8, 3D only (createAudio(world, { weather: true }) loads them).
  {
    group: 'Rain',
    items: [
      { id: 'weather/rain_roof', kind: 'loop', label: 'Rain on the car roof', weather: true },
      { id: 'weather/rain', kind: 'loop', label: 'Rain all round (outside)', weather: true },
      { id: 'tyres/wet', kind: 'loop', label: 'Tyres on a wet road (hiss)', weather: true },
      { id: 'weather/splash1', kind: 'oneshot', label: 'Puddle splash 1 (wheel through a puddle)', weather: true },
      { id: 'weather/splash2', kind: 'oneshot', label: 'Puddle splash 2 (smaller)', weather: true },
    ],
  },
];

export const ALL_SOUNDS = SOUND_GROUPS.flatMap((g) => g.items);

// Loop points that skip any silent padding the mp3 decoder adds at either end.
export function loopBounds(buf) {
  const d = buf.getChannelData(0);
  const lim = Math.min(d.length >> 2, 4096);
  let s = 0;
  while (s < lim && Math.abs(d[s]) < 1e-4) s++;
  let e = d.length;
  while (e > d.length - lim && Math.abs(d[e - 1]) < 1e-4) e--;
  return { start: s / buf.sampleRate, end: e / buf.sampleRate };
}

// Sound files fetched early (no AudioContext needed): id -> Promise<ArrayBuffer>.
// The start screen calls prefetchSounds() while the player reads the menu;
// loadSounds() then only has to decode.
const prefetched = new Map();
const fetchBytes = (id) => fetch(soundUrl(id)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));

export function prefetchSounds(ids = ALL_SOUNDS.map((s) => s.id)) {
  for (const id of ids) {
    if (prefetched.has(id)) continue;
    const p = fetchBytes(id);
    p.catch(() => prefetched.delete(id)); // try again at load time
    prefetched.set(id, p);
  }
}

// The raw bytes of one sound (fetched once, shared with loadSounds).
export function soundBytes(id) {
  prefetchSounds([id]);
  return prefetched.get(id);
}

// Fetch and decode a set of sound ids into ctx. Resolves to Map id -> AudioBuffer
// (ids that fail to load are left out). onEach(id, buf) fires as each arrives.
export function loadSounds(ctx, ids, onEach) {
  const out = new Map();
  return Promise.all(
    ids.map((id) =>
      (prefetched.get(id) || fetchBytes(id))
        // decodeAudioData takes the bytes over, so decode a copy.
        .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej)))
        .then((buf) => {
          out.set(id, buf);
          if (onEach) onEach(id, buf);
        })
        .catch((e) => console.warn('sound failed to load', id, e && e.message)),
    ),
  ).then(() => out);
}
