// All game sound, played from recorded files in public/sounds (see
// SOURCES.md there). Gentle and quiet.
// API (CONTRACT_P2.md):
//   const audio = createAudio(WORLD);
//   audio.update(dt, state, amb, { paused, rain, planes });   // every frame, even when paused
//   planes: [{ engine, x, y, dz, vx, vy, vz, throttle, ground }] as heard
//   now (src3/world3d/planes3d.js works out where each one was when the
//   sound left it), or null where there is no airfield.
//   tow: { x, y, throttle } where the tow truck is (src3/tow3d.js), or null.
//   vehicles: slow farm vehicles on the road (hazards: [{ id, kind:
//   'tractor'|'truck', x, y, heading, speed }]), heard like traffic.
//   Traffic (amb.cars) has engine sounds (./trafficSound.js); createAudio's
//   opts.trafficType(id) names each car's type ('pickup', 'sedan', ...) so
//   it gets a diesel or a petrol engine. Cars rolling on a dirt road
//   (car.onDirt) also crunch gravel under their tires (#49).
//   listener: { x, y, heading } where you hear from (round 12: your ears
//   when on foot); default the car. onFoot: you are out of the car (the
//   engine idles where the car is parked, no rain on the roof).
//   audio.step(surface, jog)   one footstep ('paved' | 'dirt' | 'grass')
//   audio.thunder(strike, ear) thunder for a lightning strike, arriving
//   3 s per km later (src/game/thunder.js)
//   audio.ignition()    the key-turn clunk when a mission starts
//   audio.cue(id, vol)   one-shot now, centre (the tow chain and winch)
//   audio.toggleMute(); audio.muted
// The AudioContext is the page's shared one (./context.js): the start
// screen makes it inside the Continue click; otherwise it is made on the
// first keydown / pointerdown here. audio.wake() builds the sound graph
// once that context exists (called when the game starts). Mute is
// remembered between visits (./context.js).
// The sound files start loading at that moment too; each sound joins in as
// soon as its file has arrived, and is silent until then.
// Voices: the dialogue UI calls speak(npcId, text) from ./voice.js.

import { ALL_SOUNDS, ENGINE_LAYERS, engineMix, loadSounds, loopBounds } from './sounds.js';
import { takeSpeech, voiceFor } from './voice.js';
import { sharedAudioContext, unlockAudio, isMuted, setMuted } from './context.js';
import { thunderDelay } from '../game/thunder.js';
import { CRUNCH_SOUND, ENGINE_SOUND, crunchBy, engineOf, passBy, pickCrunch, pickHeard } from './trafficSound.js';

const DEG = Math.PI / 180;
const MASTER = 0.5;
const PAUSE_DUCK = 0.15;

// Gear bands (m/s). Top speed on paved roads is 25 m/s.
const GEARS = [
  { lo: 0, hi: 6.5 },
  { lo: 5, hi: 11.5 },
  { lo: 9.5, hi: 16.5 },
  { lo: 14.5, hi: 21.5 },
  { lo: 19.5, hi: 30 },
];
const IDLE_RPM = 850;

const BIRDS = ['nature/bird1', 'nature/bird2', 'nature/bird3', 'nature/bird4'];
const COWS = ['animals/cow1', 'animals/cow2', 'animals/cow3'];
const DOGS = ['animals/dog1', 'animals/dog2'];
const CHIPS = ['damage/chip1', 'damage/chip2', 'damage/chip3'];
const THUMPS = ['damage/thump1', 'damage/thump2'];
const HORSES = ['animals/horse1', 'animals/horse2'];
const STEPS = {
  grass: ['steps/grass1', 'steps/grass2', 'steps/grass3'],
  gravel: ['steps/gravel1', 'steps/gravel2', 'steps/gravel3'],
  road: ['steps/road1', 'steps/road2', 'steps/road3'],
};

// Background chatter: locals within this range talk to each other when you
// roll slowly past them in a town.
const CREAKS = ['car/creak1', 'car/creak2', 'car/creak3'];
// Farms get small sound layers: chimes and a screen door close up, a tractor
// working a field a way off (every other farm).
const FARM_CHIME_R = 90;
const FARM_DOOR_R = 55;
const FARM_TRACTOR_R = 380;

const CHAT_R = 40;
const CHAT_MAX_SPEED = 7;
const CHAT_VOICES = 2;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// opts.weather (3D): also load and play the rain sounds; update() then
// takes opts.rain = { rain, wet } each frame (src/game/wetness.js).
export function createAudio(world, opts = {}) {
  // world is swapped by setWorld() when the game moves to another region.
  const withWeather = !!opts.weather;
  const trafficType = opts.trafficType || (() => 'sedan');
  let ctx = null;
  let nodes = null;
  let paused = false;
  let bufs = new Map();

  // Engine model state.
  let gear = 0;
  let rpm = IDLE_RPM;
  let shiftT = 0;
  let lastSpeed = 0;
  let load = 0;
  let chirpT = 0;
  let waterT = 0;
  let murmurT = 0;
  let crunchT = 0;
  let chatT = 0;
  let layerT = 0;
  let chimeT = 6;
  let doorT = 15;
  let creakT = 2;
  let ignitionPending = false;
  let farmNear = { d: Infinity, x: 0, y: 0, tractor: false };

  // Voice state.
  let talk = null; // { npcId, src, g, until }
  const chatter = new Map(); // npcId -> { src, g, pan, on, t }

  const waterOf = (w) => (w.creeks || []).filter((c) => !w.ambient || !w.ambient.waterSounds || w.ambient.waterSounds.includes(c.id));
  let water = waterOf(world);

  // One point per farm (its house, or any building), from the world data.
  const farmsOf = (w) => {
    const m = new Map();
    for (const b of w.buildings || []) {
      if (!b.farm) continue;
      if (!m.has(b.farm) || b.kind === 'farmhouse') m.set(b.farm, b);
    }
    return [...m.entries()].map(([id, b], i) => ({ id, x: b.x, y: b.y, tractor: i % 2 === 0 }));
  };
  let farms = farmsOf(world);

  function gesture() {
    try {
      if (!ctx) init(unlockAudio());
      else if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      // No Web Audio: stay silent.
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('pointerdown', gesture, true);
  }

  function gain(v, to) {
    const g = ctx.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  }
  function filter(type, freq, q, to) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    if (to) f.connect(to);
    return f;
  }
  function panner(to) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (!p) return gain(1, to);
    p.connect(to);
    return p;
  }
  const setPan = (p, v) => p.pan && p.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), ctx.currentTime, 0.15);
  const setPanNow = (p, v) => {
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, v));
  };
  const ramp = (param, v, tc = 0.08) => param.setTargetAtTime(v, ctx.currentTime, tc);

  // A looping source for a sound id, started at a random point. Null until loaded.
  function loopSource(id, to, rate = 1) {
    const buf = bufs.get(id);
    if (!buf) return null;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const b = loopBounds(buf);
    s.loopStart = b.start;
    s.loopEnd = b.end;
    s.playbackRate.value = rate;
    s.connect(to);
    s.start(0, b.start + Math.random() * (b.end - b.start));
    return s;
  }

  // Play a one-shot at time t0 through a fresh panner. Returns the source.
  function oneShot(id, t0, pan, vol, rate = 1, lowpass = 0) {
    const buf = bufs.get(id);
    if (!buf) return null;
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const g = gain(vol, lowpass ? filter('lowpass', lowpass, 0.5, out) : out);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.connect(g);
    s.start(Math.max(ctx.currentTime, t0));
    s.onended = () => out.disconnect();
    return s;
  }

  function init(shared) {
    if (!shared) return;
    ctx = shared;
    if (ctx.state === 'suspended') ctx.resume();

    const master = gain(0, ctx.destination);
    // A soft limiter keeps sums (bells + engine) from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(master);
    const bus = gain(1, comp);

    // Engine: three RPM loops crossfaded, through a lowpass that opens with
    // load. On foot it is panned toward the parked car and quieter with
    // distance (engPos).
    const engPan = panner(bus);
    const engPos = gain(1, engPan);
    const engGain = gain(0, engPos);
    const engLp = filter('lowpass', 1200, 0.7, engGain);
    const engLayers = ENGINE_LAYERS.map(() => ({ g: gain(0, engLp), src: null }));
    const revG = gain(0, bus);

    // Tyre / surface loops.
    const gravelG = gain(0, bus);
    const grassG = gain(0, bus);
    const pavedG = gain(0, bus);

    // Water: creek and river loops, panned toward the nearest water.
    const waterPan = panner(bus);
    const creekG = gain(0, waterPan);
    const riverG = gain(0, waterPan);

    // Town murmur, panned toward the town centre.
    const townPan = panner(bus);
    const townG = gain(0, townPan);

    // Birdsong bed near trees with birds in them.
    const birdPan = panner(bus);
    const birdG = gain(0, birdPan);

    // Small layers (ticket 26): insects and wind in grass beds, a distant
    // tractor panned toward the nearest farm, wind at the window.
    const insectG = gain(0, bus);
    const windGrassG = gain(0, bus);
    const tractorPan = panner(bus);
    const tractorG = gain(0, tractorPan);
    const windowG = gain(0, bus);

    // Damage: flat tyre flapping loop.
    const flatG = gain(0, bus);

    // Rain (3D): on the roof (muffled, close) and all round (wider, a
    // little brighter), and the hiss of wet tyres.
    const roofG = gain(0, filter('lowpass', 3200, 0.6, bus));
    const rainG = gain(0, bus);
    const wetG = gain(0, bus);

    // Voices: dialogue (centre) and chatter (each panned on its own).
    const voiceBus = gain(1, bus);

    // Light planes: one voice each, made when the prop loop arrives.
    const planeBus = gain(1, bus);

    // Tow truck (round 11): its diesel idle, panned toward the truck.
    const towPan = panner(bus);
    const towG = gain(0, towPan);

    // Traffic engines (SPEC 9q): one voice per heard vehicle, made as it
    // comes into earshot.
    const trafficBus = gain(1, bus);

    nodes = {
      master, bus, engPan, engPos, engGain, engLp, engLayers, revG, revSrc: null, gravelG, grassG, pavedG, surfSrc: {},
      waterPan, creekG, riverG, townPan, townG, birdPan, birdG, voiceBus, started: new Set(), flatG, flatSrc: null,
      insectG, windGrassG, tractorPan, tractorG, windowG, windowSrc: null,
      roofG, rainG, wetG, wetSrc: null, planeBus, planeVoices: [], towPan, towG, towSrc: null,
      trafficBus,
    };

    loadSounds(ctx, ALL_SOUNDS.filter((s) => withWeather || !s.weather).map((s) => s.id), (id, buf) => {
      bufs.set(id, buf);
      startLoop(id);
      if (id === 'car/ignition' && ignitionPending) {
        ignitionPending = false;
        oneShot(id, ctx.currentTime, 0, 0.5, 1);
      }
    });
  }

  // Start the always-on loop that belongs to this id (if it is one).
  function startLoop(id) {
    const n = nodes;
    if (n.started.has(id)) return;
    const li = ENGINE_LAYERS.findIndex((l) => l.id === id);
    let src = null;
    if (li >= 0) src = n.engLayers[li].src = loopSource(id, n.engLayers[li].g);
    else if (id === 'engine/reverse') src = n.revSrc = loopSource(id, n.revG);
    else if (id === 'tyres/gravel') src = n.surfSrc.gravel = loopSource(id, n.gravelG);
    else if (id === 'tyres/grass') src = n.surfSrc.grass = loopSource(id, n.grassG);
    else if (id === 'tyres/paved') src = n.surfSrc.paved = loopSource(id, n.pavedG);
    else if (id === 'nature/creek') src = loopSource(id, n.creekG);
    else if (id === 'nature/river') src = loopSource(id, n.riverG);
    else if (id === 'town/murmur') src = loopSource(id, n.townG);
    else if (id === 'nature/birdsong') src = loopSource(id, n.birdG);
    else if (id === 'damage/flat_tyre') src = n.flatSrc = loopSource(id, n.flatG);
    else if (id === 'weather/rain_roof') src = loopSource(id, n.roofG);
    else if (id === 'weather/rain') src = loopSource(id, n.rainG);
    else if (id === 'tyres/wet') src = n.wetSrc = loopSource(id, n.wetG);
    else if (id === 'ambient/insects') src = loopSource(id, n.insectG);
    else if (id === 'ambient/grass_wind') src = loopSource(id, n.windGrassG);
    else if (id === 'ambient/tractor') src = loopSource(id, n.tractorG);
    else if (id === 'car/window_wind') src = n.windowSrc = loopSource(id, n.windowG);
    else if (id === 'tow/engine') src = n.towSrc = loopSource(id, n.towG);
    if (src) n.started.add(id);
  }

  // Pan (-1..1) and distance of a world point relative to the car.
  function rel(car, x, y) {
    const dx = x - car.x;
    const dy = y - car.y;
    const d = Math.hypot(dx, dy);
    const bearing = Math.atan2(dx, -dy) / DEG;
    const r = (bearing - car.heading) * DEG;
    return { d, pan: d < 1 ? 0 : Math.sin(r) * 0.85 };
  }

  // ---------- Per-frame ----------
  function updateEngine(dt, car, dmg) {
    // Damage: a stalling engine drops to a cough; a dead one is silent.
    const dead = !!(dmg && dmg.brokenDown && dmg.cause === 'engine');
    const stalled = !!(dmg && (dmg.stall > 0 || dmg.brokenDown));
    const v = car.speed || 0;
    const s = Math.abs(v);
    const accel = dt > 0 ? (s - Math.abs(lastSpeed)) / dt : 0;
    lastSpeed = v;
    load += ((Math.max(0, Math.min(1, accel / 3)) + (s > 0.5 ? 0.15 : 0)) - load) * Math.min(1, dt * 4);

    let target;
    const reversing = v < -0.3;
    if (reversing) {
      gear = 0;
      target = IDLE_RPM + (s / 5) * 2600;
    } else {
      // Shift with hysteresis; a short dip on each shift.
      if (gear < GEARS.length - 1 && s > GEARS[gear].hi) {
        gear++;
        shiftT = 0.22;
      } else if (gear > 0 && s < GEARS[gear].lo) {
        gear--;
        shiftT = 0.15;
      }
      const g = GEARS[gear];
      const u = Math.max(0, Math.min(1.1, (s - (gear === 0 ? 0 : g.lo)) / (g.hi - (gear === 0 ? 0 : g.lo))));
      target = gear === 0 ? IDLE_RPM + u * 4300 : 2100 + u * 3200;
      if (s < 0.3) target = IDLE_RPM;
    }
    if (shiftT > 0) {
      shiftT -= dt;
      target *= 0.82;
    }
    if (stalled) target = IDLE_RPM * 0.6;
    rpm += (target - rpm) * Math.min(1, dt * (shiftT > 0 ? 6 : 10));

    const n = nodes;
    const mix = engineMix(rpm);
    for (let i = 0; i < mix.length; i++) {
      const L = n.engLayers[i];
      ramp(L.g.gain, mix[i].gain, 0.05);
      if (L.src) ramp(L.src.playbackRate, mix[i].rate, 0.04);
    }
    // Kept low and warm: opens a little with RPM and load, never past 2.6 kHz.
    ramp(n.engLp.frequency, Math.min(2600, 900 + rpm * 0.25 + load * 700), 0.06);
    const dip = shiftT > 0 ? 0.6 : 1;
    const dmgMul = dead ? 0 : stalled ? 0.3 : 1;
    ramp(n.engGain.gain, (0.32 + 0.22 * (rpm / 5500) + 0.18 * load) * dip * dmgMul, stalled ? 0.12 : 0.05);

    // Reversing: the recorded reverse gear on top, pitched by speed.
    ramp(n.revG.gain, reversing ? 0.35 + Math.min(0.25, s * 0.08) : 0, 0.08);
    if (n.revSrc) ramp(n.revSrc.playbackRate, 0.9 + Math.min(0.5, s * 0.1), 0.05);
    return s;
  }

  function updateSurface(dt, s, surface) {
    const k = Math.min(1, s / 12);
    const n = nodes;
    const rate = 0.75 + 0.45 * k;
    for (const key of ['gravel', 'grass', 'paved']) {
      const src = n.surfSrc[key];
      if (src) ramp(src.playbackRate, rate, 0.1);
    }
    crunchT -= dt;
    if (surface === 'dirt') {
      if (crunchT <= 0) {
        // Grainy gravel: wobble the level a little.
        crunchT = 0.08 + Math.random() * 0.1;
        ramp(n.gravelG.gain, 0.55 * k * (0.75 + Math.random() * 0.4), 0.03);
      }
    } else ramp(n.gravelG.gain, 0, 0.1);
    ramp(n.grassG.gain, surface === 'grass' ? 0.5 * k : 0, 0.1);
    ramp(n.pavedG.gain, surface === 'paved' ? 0.22 * k : 0, 0.1);
  }

  // Small layers (ticket 26). s = car speed (m/s), surface = what is under the car.
  function updateLayers(dt, car, ear, state, rain, surface, s, onFoot) {
    const n = nodes;
    const k = Math.min(1, s / 25);
    const hour = state && typeof state.clockMinutes === 'number' ? state.clockMinutes / 60 : 12;
    const day = hour > 7 && hour < 19.5 ? 1 : hour > 5.5 && hour < 21 ? 0.5 : 0.2;
    const dry = 1 - Math.min(1, (rain && rain.rain) || 0);
    // Wind at the open window rises with speed; none on foot.
    ramp(n.windowG.gain, onFoot ? 0 : 0.5 * k * k, 0.2);
    if (n.windowSrc) ramp(n.windowSrc.playbackRate, 0.85 + 0.35 * k, 0.3);

    layerT -= dt;
    if (layerT <= 0) {
      layerT = 0.25;
      let near = { d: Infinity, x: 0, y: 0, tractor: false };
      for (const f of farms) {
        const d = Math.hypot(f.x - ear.x, f.y - ear.y);
        if (d < near.d) near = { d, x: f.x, y: f.y, tractor: f.tractor };
      }
      farmNear = near;
      const tw = townLevel(ear.x, ear.y).best;
      // Insects: warm daytime, away from towns and rain, hushed by a fast engine.
      ramp(n.insectG.gain, 0.5 * day * dry * (1 - 0.8 * tw) * (1 - 0.6 * k), 0.8);
      // Wind in grass: strongest when driving on grass, a little in open country.
      ramp(n.windGrassG.gain, (surface === 'grass' ? 0.45 : 0.12) * (0.4 + 0.6 * k) * (1 - 0.7 * tw), 0.6);
      // A tractor working a field some way off.
      let tr = 0;
      if (near.tractor && near.d < FARM_TRACTOR_R) tr = 0.35 * day * dry * (1 - near.d / FARM_TRACTOR_R);
      ramp(n.tractorG.gain, tr, 0.8);
      if (tr > 0) {
        const r = rel(ear, near.x, near.y);
        setPan(n.tractorPan, r.pan * Math.min(1, r.d / 60) * 0.8);
      }
    }

    // Chimes and a screen door at a farm you are close to.
    const fn = farmNear;
    chimeT -= dt;
    if (chimeT <= 0) {
      chimeT = 7 + Math.random() * 14;
      if (fn.d < FARM_CHIME_R && dry > 0.5) {
        const r = rel(ear, fn.x, fn.y);
        oneShot('ambient/chimes', ctx.currentTime, r.pan, 0.22 * (1 - fn.d / FARM_CHIME_R), 0.95 + Math.random() * 0.1, 7000);
      }
    }
    doorT -= dt;
    if (doorT <= 0) {
      doorT = 25 + Math.random() * 35;
      if (fn.d < FARM_DOOR_R) {
        const r = rel(ear, fn.x, fn.y);
        oneShot('ambient/screen_door', ctx.currentTime + 0.3, r.pan, 0.3 * (1 - fn.d / FARM_DOOR_R), 0.97 + Math.random() * 0.06, 6000);
      }
    }

    // Body creaks on a dirt road, more often the faster you go.
    creakT -= dt;
    if (creakT <= 0) {
      creakT = 1.8 + Math.random() * 3.5 - 1.2 * k;
      if (!onFoot && surface === 'dirt' && s > 2.5) {
        oneShot(pick(CREAKS), ctx.currentTime, (Math.random() - 0.5) * 0.4, 0.1 + 0.12 * k, 0.9 + Math.random() * 0.2, 4500);
      }
    }
  }

  function updateBirds(dt, car, amb) {
    if (!amb || !amb.birds) return;
    let nearBirds = 0;
    const trees = new Set();
    let pickB = null;
    let pickD = Infinity;
    let sx = 0;
    let sy = 0;
    for (const b of amb.birds) {
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      if (Math.abs(dx) > 70 || Math.abs(dy) > 70) continue;
      const d = Math.hypot(dx, dy);
      if (d > 70) continue;
      nearBirds++;
      sx += b.x;
      sy += b.y;
      if (!b.flying && b.perchTree !== undefined) trees.add(b.perchTree);
      if (Math.random() < 0.3 || !pickB) {
        pickB = b;
        pickD = d;
      }
    }
    // The birdsong bed swells with perched birds close by.
    const bed = Math.min(1, 0.25 * trees.size + 0.04 * nearBirds);
    ramp(nodes.birdG.gain, 0.45 * bed, 0.6);
    if (!nearBirds) return;
    setPan(nodes.birdPan, rel(car, sx / nearBirds, sy / nearBirds).pan * 0.6);
    const rate = Math.min(3, 0.2 * trees.size + 0.04 * nearBirds);
    chirpT -= dt * rate;
    if (chirpT <= 0) {
      chirpT = 0.6 + Math.random() * 2;
      const r = rel(car, pickB.x, pickB.y);
      oneShot(pick(BIRDS), ctx.currentTime + Math.random() * 0.05, r.pan, 0.1 * Math.max(0.15, 1 - pickD / 70), 0.85 + Math.random() * 0.35);
    }
  }

  function updateWater(dt, car) {
    waterT -= dt;
    if (waterT > 0) return;
    waterT = 0.2;
    let best = 0;
    let creek = 0;
    let river = 0;
    let bx = car.x;
    let by = car.y;
    for (const c of water) {
      const isRiver = c.kind === 'river';
      const reach = isRiver ? 230 : 140;
      const w = isRiver ? 1 : 0.6;
      const pts = c.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], ay = pts[i][1];
        const ex = pts[i + 1][0] - ax, ey = pts[i + 1][1] - ay;
        // Quick reject.
        if (Math.abs(ax - car.x) > reach + 20 || Math.abs(ay - car.y) > reach + 20) continue;
        const l2 = ex * ex + ey * ey || 1;
        let t = ((car.x - ax) * ex + (car.y - ay) * ey) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + ex * t;
        const qy = ay + ey * t;
        const d = Math.max(0, Math.hypot(qx - car.x, qy - car.y) - c.width / 2);
        if (d >= reach) continue;
        const v = w * (1 - d / reach) ** 2;
        if (isRiver) river = Math.max(river, v);
        else creek = Math.max(creek, v);
        if (v > best) {
          best = v;
          bx = qx;
          by = qy;
        }
      }
    }
    const r = rel(car, bx, by);
    ramp(nodes.creekG.gain, 0.9 * creek, 0.4);
    ramp(nodes.riverG.gain, 0.9 * river, 0.4);
    setPan(nodes.waterPan, r.pan * Math.min(1, r.d / 15));
  }

  function townLevel(x, y) {
    let best = 0;
    let bt = null;
    for (const t of world.towns || []) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d >= t.ambienceR) continue;
      const v = (1 - d / t.ambienceR) * (t.kind === 'hamlet' ? 0.6 : 1);
      if (v > best) {
        best = v;
        bt = t;
      }
    }
    return { best, bt };
  }

  function updateTown(dt, car) {
    murmurT -= dt;
    if (murmurT > 0) return;
    murmurT = 0.3;
    const { best, bt } = townLevel(car.x, car.y);
    ramp(nodes.townG.gain, 0.32 * best, 0.5);
    if (bt) {
      const r = rel(car, bt.x, bt.y);
      setPan(nodes.townPan, r.pan * Math.min(1, r.d / 60) * 0.7);
    }
  }

  // ---------- Voices ----------
  function voiceSource(npcId, to) {
    const v = voiceFor(npcId);
    return loopSource(v.id, to, v.rate);
  }

  function stopVoice(o, tc = 0.12) {
    if (!o) return;
    const t = ctx.currentTime;
    o.g.gain.cancelScheduledValues(t);
    o.g.gain.setTargetAtTime(0, t, tc);
    const src = o.src;
    const out = o.pan || o.g;
    setTimeout(() => {
      try {
        src.stop();
      } catch (e) {
        // already stopped
      }
      out.disconnect();
    }, tc * 8000);
  }

  // Dialogue: the local mumbles for about as long as the page would take to say.
  function updateTalk() {
    const req = takeSpeech();
    if (req) {
      if (!req.npcId) {
        stopVoice(talk, 0.15);
        talk = null;
      } else {
        const len = Math.max(1.2, Math.min(7, req.text.length * 0.055));
        if (!talk || talk.npcId !== req.npcId) {
          stopVoice(talk, 0.08);
          talk = null;
          const g = gain(0, nodes.voiceBus);
          const src = voiceSource(req.npcId, g);
          if (src) talk = { npcId: req.npcId, src, g };
          else g.disconnect();
        }
        if (talk) {
          const t = ctx.currentTime;
          const p = talk.g.gain;
          p.cancelScheduledValues(t);
          p.setTargetAtTime(0.85, t, 0.04);
          p.setTargetAtTime(0, t + len, 0.18);
        }
      }
    }
  }

  // Chatter: when you roll slowly through town, nearby locals mumble,
  // each panned and quieter with distance, in short bursts.
  function updateChatter(dt, car, amb, speed) {
    chatT -= dt;
    if (chatT > 0) return;
    chatT = 0.25;
    const want = new Map();
    if (amb && amb.people && speed < CHAT_MAX_SPEED) {
      const near = [];
      for (const [id, p] of amb.people) {
        if (talk && talk.npcId === id) continue;
        if (Math.abs(p.x - car.x) > CHAT_R || Math.abs(p.y - car.y) > CHAT_R) continue;
        const d = Math.hypot(p.x - car.x, p.y - car.y);
        if (d > CHAT_R || townLevel(p.x, p.y).best <= 0) continue;
        near.push({ id, p, d });
      }
      near.sort((a, b) => a.d - b.d);
      const slow = 1 - speed / CHAT_MAX_SPEED;
      for (const o of near.slice(0, CHAT_VOICES)) want.set(o.id, { ...o, vol: 0.32 * (1 - o.d / CHAT_R) * (0.4 + 0.6 * slow) });
    }
    for (const [id, c] of chatter) {
      if (!want.has(id)) {
        stopVoice(c, 0.4);
        chatter.delete(id);
      }
    }
    for (const [id, w] of want) {
      let c = chatter.get(id);
      if (!c) {
        const pan = panner(nodes.voiceBus);
        const g = gain(0, pan);
        const src = voiceSource(id, g);
        if (!src) {
          pan.disconnect();
          continue;
        }
        c = { src, g, pan, on: false, t: Math.random() * 1.5 };
        chatter.set(id, c);
      }
      // Talk a few seconds, pause a little, talk again.
      c.t -= 0.25;
      if (c.t <= 0) {
        c.on = !c.on;
        c.t = c.on ? 2 + Math.random() * 3.5 : 1 + Math.random() * 3;
      }
      const r = rel(car, w.p.x, w.p.y);
      setPan(c.pan, r.pan);
      ramp(c.g.gain, c.on ? w.vol : 0, 0.25);
    }
  }

  // Light planes (round 10). Each one: the prop loop at a rate set by its
  // throttle (RPM) and Doppler shift, through a lowpass that closes with
  // distance (air soaks up the highs), a rough, driven copy mixed in at
  // climb power, an inverse-distance level and a pan toward it. A plane on
  // the ground with the engine off is silent.
  const SOUND_C = 343;
  const PLANE_REF = 90; // metres at which a plane at full power is at full level
  function planeVoice(i) {
    const n = nodes;
    if (n.planeVoices[i]) return n.planeVoices[i];
    if (!bufs.get('aircraft/prop')) return null;
    const pan = panner(n.planeBus);
    const g = gain(0, pan);
    const lp = filter('lowpass', 2000, 0.6, g);
    const clean = gain(1, lp);
    const roughG = gain(0, lp);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) {
      const x = (k / 1023) * 2 - 1;
      curve[k] = Math.tanh(3.2 * x);
    }
    shaper.curve = curve;
    shaper.connect(roughG);
    const src = loopSource('aircraft/prop', clean);
    if (!src) return null;
    src.connect(shaper);
    const v = { src, g, lp, roughG, pan, on: false };
    n.planeVoices[i] = v;
    return v;
  }
  function updatePlanes(car, planes) {
    const n = nodes;
    const list = planes || [];
    for (let i = 0; i < Math.max(list.length, n.planeVoices.length); i++) {
      const p = list[i];
      const v = p && p.engine ? planeVoice(i) : n.planeVoices[i];
      if (!v) continue;
      if (!p || !p.engine) {
        ramp(v.g.gain, 0, 0.4);
        continue;
      }
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const d = Math.max(3, Math.hypot(dx, dy, p.dz));
      const th = Math.max(0, Math.min(1, p.throttle));
      // Level: louder with power; inverse distance; a little extra quiet on
      // the ground behind hangars and hedges.
      const level = 0.75 * Math.min(1, PLANE_REF / d) * (0.35 + 0.65 * th) * (p.ground ? 0.7 : 1);
      ramp(v.g.gain, level, 0.15);
      ramp(v.lp.frequency, 650 + 7500 * Math.exp(-d / 650) + 900 * th, 0.2);
      ramp(v.roughG.gain, 0.22 * Math.max(0, (th - 0.6) / 0.4), 0.3);
      // Doppler from the speed toward the listener (gentle).
      const ux = -dx / d;
      const uy = -dy / d;
      const uz = -p.dz / d;
      const toward = p.vx * ux + p.vy * uy + p.vz * uz;
      const dop = 1 + (SOUND_C / (SOUND_C - Math.max(-120, Math.min(120, toward))) - 1) * 0.75;
      ramp(v.src.playbackRate, (0.78 + 0.32 * th) * dop, 0.12);
      const r = rel(car, p.x, p.y);
      const flat = Math.hypot(dx, dy);
      // Straight overhead it is everywhere at once.
      setPan(v.pan, r.pan * Math.min(1, flat / Math.max(30, Math.abs(p.dz))));
    }
  }

  // Damage sounds: crash thud on hard hits (quieter thuds for potholes and
  // branches), and the flat tyre flapping while a flat tyre rolls.
  let dmgFrame = -1;
  let lastSwish = -1;
  let lastSplash = -1;

  // Rain (3D only): loops follow how hard it rains; wet tyres hiss on a wet
  // road with speed (most on asphalt).
  function updateRain(r, s, surface, onFoot) {
    const n = nodes;
    const rain = r ? r.rain : 0;
    const wet = r ? r.wet : 0;
    // Out of the car: no roof over you, and the rain all round is louder.
    ramp(n.roofG.gain, onFoot ? 0 : 0.5 * Math.min(1, rain * 1.2), 0.6);
    ramp(n.rainG.gain, (onFoot ? 0.5 : 0.32) * Math.sqrt(rain), 0.6);
    const k = Math.min(1, s / 18) * wet * (surface === 'paved' ? 1 : surface === 'dirt' ? 0.55 : 0.3);
    ramp(n.wetG.gain, 0.42 * k, 0.15);
    if (n.wetSrc) ramp(n.wetSrc.playbackRate, 0.8 + 0.35 * Math.min(1, s / 22), 0.1);
  }
  function updateDamage(dmg, s) {
    const n = nodes;
    const flat = dmg && dmg.tyres < 0.45 && s > 1;
    ramp(n.flatG.gain, flat ? 0.55 * Math.min(1, s / 8) : 0, 0.15);
    if (n.flatSrc) ramp(n.flatSrc.playbackRate, 0.6 + 0.7 * Math.min(1, s / 15), 0.1);
    if (!dmg || dmg.frame === dmgFrame) return;
    dmgFrame = dmg.frame;
    for (const e of dmg.events) {
      if (e.type === 'crash' && e.amount > 0.005) {
        oneShot('damage/crash', ctx.currentTime, 0, 0.25 + 0.6 * e.strength, 0.95 + Math.random() * 0.1);
      } else if (e.type === 'rough') {
        // Too fast on rough ground: a stone chip on the body, or a heavier
        // knock underneath for bigger ones, panned around the car.
        const pan = e.pan ?? 0;
        if (e.heavy) oneShot(pick(THUMPS), ctx.currentTime, pan * 0.5, 0.35 + 0.3 * e.strength, 0.85 + Math.random() * 0.3, 2500);
        oneShot(pick(CHIPS), ctx.currentTime + (e.heavy ? 0.03 : 0), pan, 0.18 + 0.2 * e.strength, 0.8 + Math.random() * 0.5);
      } else if (e.type === 'bump' && e.kind === 'shrub') {
        // Through a shrub: one swish, a little different each time, and not
        // piled up when the car ploughs through a whole drift.
        if (ctx.currentTime - lastSwish < 0.14) continue;
        lastSwish = ctx.currentTime;
        oneShot('tyres/shrub', ctx.currentTime, (Math.random() - 0.5) * 0.6, (0.22 + 0.3 * e.strength) * (0.85 + Math.random() * 0.25), 0.9 + Math.random() * 0.22);
      } else if (e.type === 'bump' && e.kind === 'puddle') {
        // Through a puddle: one splash per puddle (the first wheel in), bigger
        // and lower for a big puddle at speed.
        if (ctx.currentTime - lastSplash < 0.25) continue;
        lastSplash = ctx.currentTime;
        const big = e.r >= 2.5 && e.strength > 0.4;
        oneShot(big || Math.random() < 0.5 ? 'weather/splash1' : 'weather/splash2', ctx.currentTime, (Math.random() - 0.5) * 0.5,
          (0.3 + 0.55 * e.strength) * (0.85 + Math.random() * 0.25), (big ? 0.85 : 1) + Math.random() * 0.2);
      } else if (e.type === 'bump' && e.amount > 0.004) {
        oneShot('damage/crash', ctx.currentTime, 0, 0.1 + 0.25 * e.strength, 1.15 + Math.random() * 0.15, 900);
      }
    }
  }

  // Tow truck: louder as it comes close, pitched up while it drives.
  function updateTow(car, tow) {
    const n = nodes;
    if (!tow) {
      ramp(n.towG.gain, 0, 0.3);
      return;
    }
    const r = rel(car, tow.x, tow.y);
    ramp(n.towG.gain, 0.55 / (1 + r.d / 18), 0.15);
    setPan(n.towPan, r.pan);
    if (n.towSrc) ramp(n.towSrc.playbackRate, 0.92 + 0.3 * (tow.throttle || 0), 0.25);
  }

  // Traffic engines (SPEC 9q, #39): the nearest few vehicles each get a
  // voice, a diesel or petrol idle loop pitched up with speed, with the
  // Doppler drop as it passes, panned toward it, quieter and duller with
  // distance (./trafficSound.js has the rules). A voice fades out and stops
  // when its vehicle drops out of the nearest few or out of earshot.
  const engines = new Map(); // id -> { src, g, lp, out }
  const heardList = [];
  function startEngine(id, kind) {
    const buf = bufs.get(ENGINE_SOUND[kind === 'tractor' ? 'diesel' : kind]);
    if (!buf) return null;
    const out = panner(nodes.trafficBus);
    const lp = filter('lowpass', 1500, 0.6, out);
    const g = gain(0, lp);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const b = loopBounds(buf);
    src.loopStart = b.start;
    src.loopEnd = b.end;
    src.connect(g);
    // A random place in the loop, so two of a kind never sound in step.
    src.start(ctx.currentTime, b.start + Math.random() * (b.end - b.start));
    src.onended = () => out.disconnect();
    return { src, g, lp, out };
  }
  function stopEngine(v) {
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, 0.12);
    v.src.stop(t + 0.8);
  }
  function updateTraffic(ear, earSpeed, amb, vehicles) {
    heardList.length = 0;
    if (amb && amb.cars) for (const c of amb.cars) heardList.push(c);
    if (vehicles) for (const h of vehicles) heardList.push(h);
    const on = new Set();
    for (const v of pickHeard(ear, heardList)) {
      const kind = v.kind === 'tractor' ? 'tractor' : v.kind === 'truck' ? 'diesel' : engineOf(trafficType(v.id));
      let e = engines.get(v.id);
      if (!e) {
        e = startEngine(v.id, kind);
        if (!e) continue;
        engines.set(v.id, e);
      }
      on.add(v.id);
      const p = passBy(ear, earSpeed, v, kind);
      ramp(e.g.gain, p.gain, 0.08);
      ramp(e.src.playbackRate, p.rate, 0.1);
      ramp(e.lp.frequency, p.lowpass, 0.1);
      setPan(e.out, p.pan);
    }
    for (const [id, e] of engines) {
      if (on.has(id)) continue;
      stopEngine(e);
      engines.delete(id);
    }
    updateCrunch(ear, earSpeed);
  }

  // Gravel crunch under traffic tires (SPEC 9q, #49): the nearest few cars
  // rolling on a dirt road each get the player's gravel loop, cut below
  // 300 Hz (heard from outside, no cabin rumble), panned toward the car,
  // quieter and duller with distance, wobbled a little so it sounds grainy.
  // Reuses heardList from updateTraffic. A voice fades and stops when its car
  // leaves the dirt, stops, or drops out of range.
  const crunches = new Map(); // id -> { src, g, lp, out, wobT, wob }
  function startCrunch() {
    const buf = bufs.get(CRUNCH_SOUND);
    if (!buf) return null;
    const out = panner(nodes.trafficBus);
    const lp = filter('lowpass', 3000, 0.6, out);
    const hp = filter('highpass', 300, 0.7, lp);
    const g = gain(0, hp);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const b = loopBounds(buf);
    src.loopStart = b.start;
    src.loopEnd = b.end;
    src.connect(g);
    src.start(ctx.currentTime, b.start + Math.random() * (b.end - b.start));
    src.onended = () => out.disconnect();
    return { src, g, lp, out, wobT: 0, wob: 1 };
  }
  function updateCrunch(ear, earSpeed) {
    const on = new Set();
    const t = ctx.currentTime;
    for (const v of pickCrunch(ear, heardList)) {
      let c = crunches.get(v.id);
      if (!c) {
        c = startCrunch();
        if (!c) break;
        crunches.set(v.id, c);
      }
      on.add(v.id);
      if (t >= c.wobT) {
        c.wobT = t + 0.06 + Math.random() * 0.1;
        c.wob = 0.8 + Math.random() * 0.35;
      }
      const p = crunchBy(ear, earSpeed, v);
      ramp(c.g.gain, p.gain * c.wob, 0.05);
      ramp(c.src.playbackRate, p.rate, 0.1);
      ramp(c.lp.frequency, p.lowpass, 0.1);
      setPan(c.out, p.pan);
    }
    for (const [id, c] of crunches) {
      if (on.has(id)) continue;
      stopEngine(c);
      crunches.delete(id);
    }
  }

  // Other vehicles' horns (amb.horns, see HONK in src/ambient/trafficRules.js):
  // one voice per vehicle, held down for as long as it sounds. The 0.73 s
  // honk plays from its start, then loops its steady middle (cut at rising
  // zero crossings so the seam does not click), so a short beep and a 10 s
  // lean are the same sound held for longer. Panned and quieter with
  // distance like the other world sounds; each vehicle a slightly different
  // pitch.
  const horns = new Map(); // id -> { src, g, lp, out }
  let hornLoop = null;
  function hornBounds(buf) {
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const up = (t) => {
      for (let i = Math.floor(t * sr); i < d.length - 1; i++) if (d[i] <= 0 && d[i + 1] > 0) return i / sr;
      return t;
    };
    return { start: up(0.22), end: up(0.5) };
  }
  function hornPitch(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return 0.86 + (h % 1000) / 1000 * 0.22;
  }
  function releaseHorn(v) {
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, 0.04);
    v.src.stop(t + 0.3);
  }
  function updateHorns(ear, amb) {
    const list = (amb && amb.horns) || [];
    const buf = bufs.get('car/horn');
    const on = new Set();
    for (const h of list) {
      const r = rel(ear, h.x, h.y);
      if (r.d > 400 || !buf) continue;
      on.add(h.id);
      const vol = 0.9 / (1 + r.d / 25);
      const lp = Math.max(1500, 12000 - r.d * 30);
      let v = horns.get(h.id);
      if (!v) {
        if (!hornLoop) hornLoop = hornBounds(buf);
        const out = panner(nodes.bus);
        setPanNow(out, r.pan);
        const f = filter('lowpass', lp, 0.5, out);
        const g = gain(vol, f);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = hornLoop.start;
        src.loopEnd = hornLoop.end;
        src.playbackRate.value = hornPitch(h.id);
        src.connect(g);
        src.start(ctx.currentTime);
        src.onended = () => out.disconnect();
        horns.set(h.id, (v = { src, g, lp: f, out }));
      }
      ramp(v.g.gain, vol, 0.05);
      ramp(v.lp.frequency, lp, 0.1);
      setPan(v.out, r.pan);
    }
    for (const [id, v] of horns) {
      if (on.has(id)) continue;
      releaseHorn(v);
      horns.delete(id);
    }
  }
  function silenceHorns() {
    for (const v of horns.values()) releaseHorn(v);
    horns.clear();
  }

  function handleEvents(car, amb) {
    if (!amb || !amb.events) return;
    for (const e of amb.events) {
      const r = rel(car, e.x, e.y);
      if (e.type === 'horn') {
        oneShot('car/horn', ctx.currentTime, 0, 1.1, 0.98 + Math.random() * 0.04);
      } else if (e.type === 'bell') {
        // Audible across a big part of the map; points you to town.
        const vol = 0.8 / (1 + r.d / 400);
        if (vol < 0.015) continue;
        const delay = r.d / 343; // sound travels
        const t0 = ctx.currentTime + 0.05 + delay;
        const lp = Math.max(1200, 12000 - r.d * 4);
        for (let k = 0; k < (e.count || 1); k++) oneShot('bell/bell', t0 + k * 2.3, r.pan, vol, 0.98 + Math.random() * 0.03, lp);
      } else if (e.type === 'dog_bark') {
        if (r.d > 350) continue;
        const vol = 0.28 * (1 - r.d / 350);
        const t0 = ctx.currentTime + 0.05 + r.d / 343;
        const n = e.count || 1 + Math.floor(Math.random() * 3);
        const lp = Math.max(1500, 9000 - r.d * 20);
        if (n >= 3 && Math.random() < 0.5) oneShot('animals/dog3', t0, r.pan, vol, 0.92 + Math.random() * 0.16, lp);
        else {
          const dog = pick(DOGS);
          const rate = 0.9 + Math.random() * 0.2;
          for (let k = 0; k < n; k++) oneShot(dog, t0 + k * (0.32 + Math.random() * 0.18), r.pan, vol, rate, lp);
        }
      } else if (e.type === 'moo' || e.type === 'whinny') {
        // Rare and quiet: only within a couple of hundred metres.
        if (r.d > 260) continue;
        const vol = (e.type === 'moo' ? 0.3 : 0.2) * (1 - r.d / 260);
        const t0 = ctx.currentTime + 0.05 + r.d / 343;
        const lp = Math.max(1500, 9000 - r.d * 25);
        oneShot(pick(e.type === 'moo' ? COWS : HORSES), t0, r.pan, vol, 0.92 + Math.random() * 0.16, lp);
      } else if (e.type === 'birds_scatter') {
        if (r.d > 80) continue;
        for (let k = 0; k < 3; k++) {
          oneShot(pick(BIRDS), ctx.currentTime + k * 0.12 + Math.random() * 0.08, r.pan, 0.12 * (1 - r.d / 80), 0.9 + Math.random() * 0.3);
        }
      }
    }
  }

  return {
    update(dt, state, amb, opts) {
      paused = !!(opts && opts.paused);
      if (!ctx || !nodes) return;
      if (ctx.state !== 'running') return;
      const muted = isMuted();
      const target = muted ? 0 : MASTER * (paused ? PAUSE_DUCK : 1);
      nodes.master.gain.setTargetAtTime(target, ctx.currentTime, paused || muted ? 0.25 : 0.4);
      const car = state && state.car;
      if (!car) return;
      // Where you hear from: the car, or your ears when you are out of it.
      const ear = (opts && opts.listener) || car;
      const onFoot = !!(opts && opts.onFoot);
      const dmg = state.damage || null;
      const s = updateEngine(dt, car, dmg);
      // The parked car's engine, idling where it stands.
      const er = rel(ear, car.x, car.y);
      ramp(nodes.engPos.gain, onFoot ? 0.9 / (1 + er.d / 5) : 1, 0.1);
      setPan(nodes.engPan, onFoot ? er.pan * Math.min(1, er.d / 3) : 0);
      updateDamage(dmg, s);
      const surface = (amb && amb.playerSurface) || 'paved';
      updateSurface(dt, s, surface);
      if (withWeather) updateRain(opts && opts.rain, s, surface, onFoot);
      updateWater(dt, ear);
      updateTown(dt, ear);
      updateTalk();
      updateChatter(dt, ear, amb, s);
      updatePlanes(ear, opts && opts.planes);
      updateTow(ear, opts && opts.tow);
      updateTraffic(ear, onFoot ? 0 : car.speed || 0, amb, opts && opts.vehicles);
      if (!paused && !muted) {
        updateBirds(dt, ear, amb);
        updateLayers(dt, ear, ear, state, opts && opts.rain, surface, s, onFoot);
        handleEvents(ear, amb);
        updateHorns(ear, amb);
      } else silenceHorns();
    },
    // One footstep on foot: the ground's own sound, a little different each time.
    step(surface, jog = false) {
      if (!ctx || !nodes || ctx.state !== 'running' || paused) return;
      const set = surface === 'paved' ? STEPS.road : surface === 'dirt' ? STEPS.gravel : STEPS.grass;
      const vol = (jog ? 0.3 : 0.22) * (0.85 + Math.random() * 0.3) * (surface === 'paved' ? 0.8 : 1);
      oneShot(pick(set), ctx.currentTime, (Math.random() - 0.5) * 0.2, vol, 0.92 + Math.random() * 0.16, surface === 'grass' ? 5000 : 0);
    },
    // Thunder for a lightning strike (src/game/thunder.js): it arrives 3 s
    // per km after the flash; close ones crack, far ones only rumble
    // (quieter, the highs soaked up by the air, played a little slower).
    thunder(strike, ear) {
      if (!ctx || !nodes || ctx.state !== 'running') return;
      const km = strike.km;
      const close = km < 1.8;
      const id = close ? (km < 1 || Math.random() < 0.5 ? 'thunder/close1' : 'thunder/close2') : pick(['thunder/far1', 'thunder/far2']);
      const vol = (strike.power || 1) * Math.min(1, 1.1 / (1 + (km - 0.5) * 0.45));
      const lp = 300 + 11000 * Math.exp(-km / 1.4);
      const rate = close ? 0.95 + Math.random() * 0.08 : 0.82 + Math.random() * 0.1;
      const pan = Math.sin(((strike.bearing - (ear ? ear.heading : 0)) * Math.PI) / 180) * 0.7;
      oneShot(id, ctx.currentTime + thunderDelay(km), pan, vol, rate, lp);
    },
    // A one-shot now, centred (the tow chain and winch).
    cue(id, vol = 0.5) {
      if (!ctx || !nodes || ctx.state !== 'running') return;
      oneShot(id, ctx.currentTime, 0, vol, 0.97 + Math.random() * 0.06);
    },
    // The key turns when a mission starts (src3/main.js). If the sound is
    // still loading, it plays as soon as it arrives.
    ignition() {
      if (!ctx || !nodes) {
        ignitionPending = true;
        return;
      }
      if (bufs.has('car/ignition')) oneShot('car/ignition', ctx.currentTime + 0.1, 0, 0.5, 1);
      else ignitionPending = true;
    },
    toggleMute() {
      return setMuted(!isMuted());
    },
    // The start screen already made and resumed the shared context inside
    // its click: build the sound graph now, without waiting for a gesture.
    wake() {
      try {
        if (!ctx && sharedAudioContext()) init(sharedAudioContext());
        else if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch (e) {
        // No Web Audio: stay silent.
      }
    },
    // The game moved to another region (src/world/regions.js): its creeks
    // and towns are the water and town sounds from now on.
    setWorld(w) {
      world = w;
      water = waterOf(w);
      farms = farmsOf(w);
      farmNear = { d: Infinity, x: 0, y: 0, tractor: false };
      if (nodes) for (const v of nodes.planeVoices) if (v) v.g.gain.value = 0;
      for (const c of chatter.values()) stopVoice(c, 0.1);
      chatter.clear();
      if (ctx) for (const e of engines.values()) stopEngine(e);
      engines.clear();
    },
    get muted() {
      return isMuted();
    },
    get context() {
      return ctx;
    },
    // For checks: which sound files have loaded, and how many loops run.
    get loaded() {
      return bufs.size;
    },
    get playing() {
      return nodes ? [...nodes.started] : [];
    },
    get talking() {
      return talk ? talk.npcId : null;
    },
    get chatter() {
      return [...chatter.keys()];
    },
    // For checks: each heard traffic engine's level, playback rate and lowpass now.
    get traffic() {
      return [...engines].map(([id, e]) => ({ id, gain: +e.g.gain.value.toFixed(4), rate: +e.src.playbackRate.value.toFixed(3), lowpass: Math.round(e.lp.frequency.value) }));
    },
    // For checks: each traffic car's gravel crunch level and rate now.
    get crunch() {
      return [...crunches].map(([id, c]) => ({ id, gain: +c.g.gain.value.toFixed(4), rate: +c.src.playbackRate.value.toFixed(3), lowpass: Math.round(c.lp.frequency.value) }));
    },
    // For checks: each plane voice's level, playback rate and lowpass now.
    get planes() {
      return nodes ? nodes.planeVoices.map((v) => v && { gain: +v.g.gain.value.toFixed(4), rate: +v.src.playbackRate.value.toFixed(3), lowpass: Math.round(v.lp.frequency.value) }) : [];
    },
  };
}
