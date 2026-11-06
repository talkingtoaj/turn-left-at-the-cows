// All game sound, played from recorded files in public/sounds (see
// SOURCES.md there). Gentle and quiet.
// API (CONTRACT_P2.md):
//   const audio = createAudio(WORLD);
//   audio.update(dt, state, amb, { paused });   // every frame, even when paused
//   audio.toggleMute(); audio.muted
// The AudioContext is created on the first keydown / pointerdown (browsers
// need a user gesture) and resumed on later gestures if it was suspended.
// The sound files start loading at that moment too; each sound joins in as
// soon as its file has arrived, and is silent until then.
// Voices: the dialogue UI calls speak(npcId, text) from ./voice.js.

import { ALL_SOUNDS, ENGINE_LAYERS, engineMix, loadSounds, loopBounds } from './sounds.js';
import { takeSpeech, voiceFor } from './voice.js';

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
const HORSES = ['animals/horse1', 'animals/horse2'];

// Background chatter: locals within this range talk to each other when you
// roll slowly past them in a town.
const CHAT_R = 40;
const CHAT_MAX_SPEED = 7;
const CHAT_VOICES = 2;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function createAudio(world) {
  let ctx = null;
  let muted = false;
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

  // Voice state.
  let talk = null; // { npcId, src, g, until }
  const chatter = new Map(); // npcId -> { src, g, pan, on, t }

  const water = (world.creeks || []).filter((c) => !world.ambient || !world.ambient.waterSounds || world.ambient.waterSounds.includes(c.id));

  function gesture() {
    try {
      if (!ctx) init();
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

  function init() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();

    const master = gain(0, ctx.destination);
    // A soft limiter keeps sums (bells + engine) from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(master);
    const bus = gain(1, comp);

    // Engine: three RPM loops crossfaded, through a lowpass that opens with load.
    const engGain = gain(0, bus);
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

    // Damage: flat tyre flapping loop.
    const flatG = gain(0, bus);

    // Voices: dialogue (centre) and chatter (each panned on its own).
    const voiceBus = gain(1, bus);

    nodes = {
      master, bus, engGain, engLp, engLayers, revG, revSrc: null, gravelG, grassG, pavedG, surfSrc: {},
      waterPan, creekG, riverG, townPan, townG, birdPan, birdG, voiceBus, started: new Set(), flatG, flatSrc: null,
    };

    loadSounds(ctx, ALL_SOUNDS.map((s) => s.id), (id, buf) => {
      bufs.set(id, buf);
      startLoop(id);
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

  // Damage sounds: crash thud on hard hits (quieter thuds for potholes and
  // branches), and the flat tyre flapping while a flat tyre rolls.
  let dmgFrame = -1;
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
      } else if (e.type === 'bump' && e.amount > 0.004) {
        oneShot('damage/crash', ctx.currentTime, 0, 0.1 + 0.25 * e.strength, 1.15 + Math.random() * 0.15, 900);
      }
    }
  }

  function handleEvents(car, amb) {
    if (!amb || !amb.events) return;
    for (const e of amb.events) {
      const r = rel(car, e.x, e.y);
      if (e.type === 'horn') {
        oneShot('car/horn', ctx.currentTime, 0, 0.5, 0.98 + Math.random() * 0.04);
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
      const target = muted ? 0 : MASTER * (paused ? PAUSE_DUCK : 1);
      nodes.master.gain.setTargetAtTime(target, ctx.currentTime, paused || muted ? 0.25 : 0.4);
      const car = state && state.car;
      if (!car) return;
      const dmg = state.damage || null;
      const s = updateEngine(dt, car, dmg);
      updateDamage(dmg, s);
      const surface = (amb && amb.playerSurface) || 'paved';
      updateSurface(dt, s, surface);
      updateWater(dt, car);
      updateTown(dt, car);
      updateTalk();
      updateChatter(dt, car, amb, s);
      if (!paused && !muted) {
        updateBirds(dt, car, amb);
        handleEvents(car, amb);
      }
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
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
  };
}
