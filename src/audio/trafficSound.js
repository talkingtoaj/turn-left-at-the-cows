// Traffic engine sounds (SPEC 9q, #39): which engine each vehicle has, which
// vehicles you can hear, and how one sounds from where you stand: louder and
// brighter close up, panned toward it, pitched up with its speed and, as it
// goes by, the Doppler drop (higher coming, lower going). Pure logic, no
// Web Audio: src/audio/audio.js plays it, tools/check-traffic-sound.mjs
// checks it.
//
// Vehicles: { id, x, y, heading, speed } (heading degrees, 0 = north, y south).
// The ear: { x, y, heading } plus its own speed (the player's car), or 0 on foot.

const DEG = Math.PI / 180;
const SOUND_C = 343; // m/s

// Diesel on trucks and pickups, a quiet petrol hum on the cars.
const ENGINE_OF = {
  sedan: 'petrol', wagon: 'petrol', hatch: 'petrol', van: 'petrol',
  pickup: 'diesel', farmtruck: 'diesel', truck: 'diesel', tractor: 'diesel',
  fourbyfour: 'diesel', // an old farm 4x4: the clattery diesel, not the cars' quiet hum
};
export const engineOf = (type) => ENGINE_OF[type] || 'petrol';
export const ENGINE_SOUND = { diesel: 'traffic/diesel', petrol: 'traffic/petrol' };

// Per engine: level at the reference distance, the playback rate stood
// still and at full speed, and the speed (m/s) that counts as full.
const ENGINE = {
  diesel: { level: 0.42, rest: 0.85, top: 1.32, full: 20 },
  petrol: { level: 0.2, rest: 0.92, top: 1.5, full: 24 },
};
// Tractors: the diesel, slower and lower.
const TRACTOR = { level: 0.4, rest: 0.7, top: 0.95, full: 6 };

export const HEAR_R = 160; // m: past this a vehicle is silent
export const MAX_VOICES = 4; // the nearest few only
const REF = 12; // m: level halves about every REF metres close in

// The vehicles you can hear now: the nearest `max` within HEAR_R, nearest
// first. list: vehicles; returns the same objects.
export function pickHeard(ear, list, max = MAX_VOICES) {
  const out = [];
  for (const v of list || []) {
    const d = Math.hypot(v.x - ear.x, v.y - ear.y);
    if (d < HEAR_R) out.push({ v, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map((o) => o.v);
}

// A little pitch difference per vehicle, from its id (0.94 to 1.06).
export function idPitch(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 0.94 + ((h % 1000) / 1000) * 0.12;
}

// Doppler factor: (C + ear speed toward the source) / (C - source speed
// toward the ear). Over 1 coming closer, under 1 going away.
export function doppler(ear, earSpeed, v) {
  const dx = ear.x - v.x;
  const dy = ear.y - v.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return 1;
  const ux = dx / d;
  const uy = dy / d;
  const vs = (v.speed || 0);
  const srcToward = (Math.sin(v.heading * DEG) * ux - Math.cos(v.heading * DEG) * uy) * vs;
  const es = earSpeed || 0;
  const earToward = -(Math.sin(ear.heading * DEG) * ux - Math.cos(ear.heading * DEG) * uy) * es;
  const clamp = (x) => Math.max(-60, Math.min(60, x));
  return (SOUND_C + clamp(earToward)) / (SOUND_C - clamp(srcToward));
}

// How one vehicle sounds now: { gain, rate, pan, lowpass, d }.
// kind: 'diesel' | 'petrol' | 'tractor'.
export function passBy(ear, earSpeed, v, kind) {
  const e = kind === 'tractor' ? TRACTOR : ENGINE[kind] || ENGINE.petrol;
  const dx = v.x - ear.x;
  const dy = v.y - ear.y;
  const d = Math.hypot(dx, dy);
  const s = Math.min(1, Math.abs(v.speed || 0) / e.full);
  // Fade out over the last 30% of the range so a vehicle dropping out of
  // the nearest few, or out of earshot, never clicks off.
  const edge = Math.max(0, Math.min(1, (HEAR_R - d) / (HEAR_R * 0.3)));
  const gain = e.level * (0.55 + 0.45 * s) / (1 + Math.max(0, d - 3) / REF) * edge * edge;
  const rate = (e.rest + (e.top - e.rest) * s) * idPitch(v.id) * doppler(ear, earSpeed, v);
  const bearing = Math.atan2(dx, -dy) / DEG;
  const pan = d < 1 ? 0 : Math.sin((bearing - ear.heading) * DEG) * 0.85 * Math.min(1, d / 4);
  // Air and hedges soak up the highs with distance.
  const lowpass = 500 + 5500 * Math.exp(-d / 45);
  return { gain, rate, pan, lowpass, d };
}

// Gravel crunch under traffic tires (SPEC 9q, #49): a car on a dirt road
// crunches, louder the faster it goes and silent when it stops. It is a bed
// under the engines, not a roar: quieter than the engine, heard only close
// in, and fading out well before the engines do. Vehicles carry onDirt.
export const CRUNCH_SOUND = 'tyres/gravel'; // the player's own gravel loop
export const CRUNCH_R = 70; // m: past this a car's tires are silent
export const MAX_CRUNCH = 3; // the nearest few cars on dirt only
const CRUNCH = { level: 0.24, full: 18, min: 0.8, ref: 7 };

// The cars you can hear crunching now: on dirt, rolling, within CRUNCH_R,
// nearest first.
export function pickCrunch(ear, list, max = MAX_CRUNCH) {
  const out = [];
  for (const v of list || []) {
    if (!v.onDirt || Math.abs(v.speed || 0) < CRUNCH.min) continue;
    const d = Math.hypot(v.x - ear.x, v.y - ear.y);
    if (d < CRUNCH_R) out.push({ v, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, max).map((o) => o.v);
}

// How one car's tires sound now: { gain, rate, pan, lowpass, d }. Gain is 0
// off dirt, stopped, or out of range.
export function crunchBy(ear, earSpeed, v) {
  const dx = v.x - ear.x;
  const dy = v.y - ear.y;
  const d = Math.hypot(dx, dy);
  const sp = Math.abs(v.speed || 0);
  const s = Math.min(1, sp / CRUNCH.full);
  const rolling = v.onDirt && sp >= CRUNCH.min ? 1 : 0;
  const edge = Math.max(0, Math.min(1, (CRUNCH_R - d) / (CRUNCH_R * 0.4)));
  const gain = rolling * CRUNCH.level * Math.pow(s, 0.8) / (1 + Math.max(0, d - 2) / CRUNCH.ref) * edge * edge;
  const rate = (0.75 + 0.45 * s) * idPitch(v.id) * doppler(ear, earSpeed, v);
  const bearing = Math.atan2(dx, -dy) / DEG;
  const pan = d < 1 ? 0 : Math.sin((bearing - ear.heading) * DEG) * 0.85 * Math.min(1, d / 4);
  // Tire hiss loses its highs sooner than an engine does.
  const lowpass = 600 + 7000 * Math.exp(-d / 25);
  return { gain, rate, pan, lowpass, d };
}
