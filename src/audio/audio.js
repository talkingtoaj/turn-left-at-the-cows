// All game sound, synthesised with Web Audio (no files). Gentle and quiet.
// API (CONTRACT_P2.md):
//   const audio = createAudio(WORLD);
//   audio.update(dt, state, amb, { paused });   // every frame, even when paused
//   audio.toggleMute(); audio.muted
// The AudioContext is created on the first keydown / pointerdown (browsers
// need a user gesture) and resumed on later gestures if it was suspended.

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

export function createAudio(world) {
  let ctx = null;
  let muted = false;
  let nodes = null;
  let paused = false;

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

  function noiseBuffer(seconds, brown) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }
  function loopNoise(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = 0;
    s.start(0, Math.random() * buf.duration);
    return s;
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
  const ramp = (param, v, tc = 0.08) => param.setTargetAtTime(v, ctx.currentTime, tc);

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

    const white = noiseBuffer(2.3, false);
    const brown = noiseBuffer(3.1, true);

    // Engine: saw + square at firing frequency, sine sub, through a lowpass.
    const engGain = gain(0, bus);
    const engLp = filter('lowpass', 400, 1.2, engGain);
    const oSaw = ctx.createOscillator();
    oSaw.type = 'sawtooth';
    const oSq = ctx.createOscillator();
    oSq.type = 'square';
    const oSub = ctx.createOscillator();
    oSub.type = 'sine';
    const gSaw = gain(0.5, engLp);
    const gSq = gain(0.18, engLp);
    const gSub = gain(0.8, engLp);
    oSaw.connect(gSaw);
    oSq.connect(gSq);
    oSub.connect(gSub);
    // Slight roughness: an LFO wobbles the engine gain.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoG = gain(0.012, engGain.gain);
    lfo.connect(lfoG);
    for (const o of [oSaw, oSq, oSub, lfo]) o.start();

    // Reverse whine.
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    const whineG = gain(0, bus);
    whine.connect(whineG);
    whine.start();

    // Tyre / surface noise: gravel crunch, grass swish, paved hiss.
    const gravelG = gain(0, bus);
    const gravelF = filter('bandpass', 1700, 0.8, gravelG);
    loopNoise(white).connect(gravelF);
    const grassG = gain(0, bus);
    const grassF = filter('lowpass', 650, 0.7, grassG);
    loopNoise(white).connect(grassF);
    const hissG = gain(0, bus);
    const hissF = filter('highpass', 2500, 0.5, hissG);
    loopNoise(white).connect(hissF);

    // Water: brown + white noise through filters, panned.
    const waterPan = panner(bus);
    const waterG = gain(0, waterPan);
    const waterLp = filter('lowpass', 1100, 0.6, waterG);
    loopNoise(brown).connect(waterLp);
    const waterBp = filter('bandpass', 2200, 1.5, gain(0.25, waterG));
    loopNoise(white).connect(waterBp);

    // Town murmur: band-limited noise with a slow random wobble, panned.
    const townPan = panner(bus);
    const townG = gain(0, townPan);
    const townF1 = filter('bandpass', 420, 1.2, townG);
    const townF2 = filter('bandpass', 1100, 2.5, gain(0.5, townG));
    const tn = loopNoise(white);
    tn.connect(townF1);
    tn.connect(townF2);

    nodes = {
      master, bus, engGain, engLp, oSaw, oSq, oSub, whine, whineG, gravelG, gravelF, grassG, hissG,
      waterPan, waterG, townPan, townG, townF1,
    };
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

  // ---------- One-shot sounds ----------
  function chirp(pan, vol) {
    const t0 = ctx.currentTime + Math.random() * 0.05;
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const g = gain(0, out);
    const notes = 1 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    const len = 0.05 + Math.random() * 0.07;
    const gap = 0.03 + Math.random() * 0.05;
    const car = ctx.createOscillator();
    car.type = 'sine';
    const mod = ctx.createOscillator();
    mod.frequency.value = 30 + Math.random() * 60;
    const modG = gain(200 + Math.random() * 400);
    mod.connect(modG);
    modG.connect(car.frequency);
    car.connect(g);
    const up = Math.random() < 0.6;
    for (let k = 0; k < notes; k++) {
      const t = t0 + k * (len + gap);
      const f0 = base * (1 + (Math.random() - 0.5) * 0.15);
      car.frequency.setValueAtTime(up ? f0 * 0.8 : f0 * 1.25, t);
      car.frequency.exponentialRampToValueAtTime(up ? f0 * 1.3 : f0 * 0.75, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    }
    const end = t0 + notes * (len + gap) + 0.05;
    car.start(t0);
    mod.start(t0);
    car.stop(end);
    mod.stop(end);
    car.onended = () => out.disconnect();
  }
  function setPanNow(p, v) {
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, v));
  }

  // Church bell: inharmonic partials with long decays.
  const BELL_PARTIALS = [
    [0.5, 0.5, 7], [1, 0.7, 5], [1.183, 0.45, 4], [1.506, 0.3, 3.2], [2, 0.35, 2.6],
    [2.514, 0.18, 2], [2.662, 0.15, 1.8], [3.011, 0.1, 1.5], [4.166, 0.06, 1.1],
  ];
  function bellStrike(t0, pan, vol, d) {
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const lp = filter('lowpass', Math.max(1200, 9000 - d * 3.5), 0.5, out);
    const f0 = 392;
    for (const [ratio, amp, decay] of BELL_PARTIALS) {
      const o = ctx.createOscillator();
      o.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.004);
      const g = gain(0, lp);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol * amp, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.start(t0);
      o.stop(t0 + decay + 0.05);
    }
    setTimeout(() => out.disconnect(), (t0 - ctx.currentTime + 7.5) * 1000);
  }
  function bark(t0, pan, vol) {
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const bp = filter('bandpass', 900, 1.8, out);
    const g = gain(0, bp);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 330 + Math.random() * 80;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + 0.13);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.start(t0);
    o.stop(t0 + 0.2);
    o.onended = () => out.disconnect();
  }

  // Cow moo: a low buzzy tone through a vowel-like filter, sliding down.
  function moo(t0, pan, vol) {
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const lp = filter('lowpass', 900, 0.7, out);
    const bp = filter('bandpass', 420, 2.5, lp);
    const g = gain(0, bp);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 115 + Math.random() * 30;
    const len = 1.1 + Math.random() * 0.6;
    o.frequency.setValueAtTime(f * 0.9, t0);
    o.frequency.linearRampToValueAtTime(f * 1.08, t0 + 0.25);
    o.frequency.exponentialRampToValueAtTime(f * 0.78, t0 + len);
    bp.frequency.setValueAtTime(320, t0);
    bp.frequency.linearRampToValueAtTime(620, t0 + 0.3);
    bp.frequency.linearRampToValueAtTime(380, t0 + len);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.18);
    g.gain.setValueAtTime(vol, t0 + len - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.start(t0);
    o.stop(t0 + len + 0.05);
    o.onended = () => out.disconnect();
  }
  let snortBuf = null;
  // Horse whinny: a high wavering call that falls away, ending in a snort.
  function whinny(t0, pan, vol) {
    const out = panner(nodes.bus);
    setPanNow(out, pan);
    const bp = filter('bandpass', 1400, 1.2, out);
    const g = gain(0, bp);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const vib = ctx.createOscillator();
    vib.frequency.value = 11 + Math.random() * 5;
    const vibG = gain(0);
    vib.connect(vibG);
    vibG.connect(o.frequency);
    const f = 820 + Math.random() * 160;
    const len = 1.0 + Math.random() * 0.4;
    o.frequency.setValueAtTime(f * 0.8, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.12);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t0 + len);
    vibG.gain.setValueAtTime(f * 0.03, t0);
    vibG.gain.linearRampToValueAtTime(f * 0.09, t0 + len);
    o.connect(g);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.06);
    g.gain.setValueAtTime(vol * 0.8, t0 + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.start(t0);
    vib.start(t0);
    o.stop(t0 + len + 0.05);
    vib.stop(t0 + len + 0.05);
    // Snort: a short burst of filtered noise.
    const n = ctx.createBufferSource();
    n.buffer = snortBuf || (snortBuf = noiseBuffer(0.3, false));
    const ng = gain(0, filter('bandpass', 700, 0.8, out));
    n.connect(ng);
    const ts = t0 + len + 0.12;
    ng.gain.setValueAtTime(0.0001, ts);
    ng.gain.linearRampToValueAtTime(vol * 0.6, ts + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, ts + 0.22);
    n.start(ts);
    n.stop(ts + 0.3);
    n.onended = () => out.disconnect();
  }

  // ---------- Per-frame ----------
  function updateEngine(dt, car) {
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
    rpm += (target - rpm) * Math.min(1, dt * (shiftT > 0 ? 6 : 10));

    const f = (rpm / 60) * 2; // 4-cylinder firing frequency
    const n = nodes;
    ramp(n.oSaw.frequency, f, 0.04);
    ramp(n.oSq.frequency, f * 0.5, 0.04);
    ramp(n.oSub.frequency, f * 0.5, 0.04);
    ramp(n.engLp.frequency, 220 + rpm * 0.12 + load * 400, 0.06);
    const dip = shiftT > 0 ? 0.55 : 1;
    ramp(n.engGain.gain, (0.045 + 0.035 * (rpm / 5500) + 0.03 * load) * dip, 0.05);

    ramp(n.whine.frequency, 500 + s * 140, 0.05);
    ramp(n.whineG.gain, reversing ? 0.012 + Math.min(0.012, s * 0.004) : 0, 0.08);
    return s;
  }

  function updateSurface(dt, s, surface) {
    const k = Math.min(1, s / 12);
    const n = nodes;
    crunchT -= dt;
    if (surface === 'dirt') {
      if (crunchT <= 0) {
        // Grainy gravel: jitter the level and the band a little.
        crunchT = 0.04 + Math.random() * 0.05;
        ramp(n.gravelG.gain, 0.06 * k * (0.55 + Math.random() * 0.8), 0.015);
        ramp(n.gravelF.frequency, 1300 + Math.random() * 900, 0.02);
      }
    } else ramp(n.gravelG.gain, 0, 0.1);
    ramp(n.grassG.gain, surface === 'grass' ? 0.05 * k : 0, 0.1);
    ramp(n.hissG.gain, surface === 'paved' ? 0.006 * k : 0, 0.1);
  }

  function updateBirds(dt, car, amb) {
    if (!amb || !amb.birds) return;
    let nearBirds = 0;
    const trees = new Set();
    let pick = null;
    let pickD = Infinity;
    for (const b of amb.birds) {
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      if (Math.abs(dx) > 70 || Math.abs(dy) > 70) continue;
      const d = Math.hypot(dx, dy);
      if (d > 70) continue;
      nearBirds++;
      if (!b.flying && b.perchTree !== undefined) trees.add(b.perchTree);
      if (Math.random() < 0.3 || !pick) {
        pick = b;
        pickD = d;
      }
    }
    if (!nearBirds) return;
    const rate = Math.min(5, 0.35 * trees.size + 0.06 * nearBirds);
    chirpT -= dt * rate;
    if (chirpT <= 0) {
      chirpT = 0.4 + Math.random() * 1.6;
      const r = rel(car, pick.x, pick.y);
      chirp(r.pan, 0.05 * Math.max(0.15, 1 - pickD / 70));
    }
  }

  function updateWater(dt, car) {
    waterT -= dt;
    if (waterT > 0) return;
    waterT = 0.2;
    let best = 0;
    let bx = car.x;
    let by = car.y;
    for (const c of water) {
      const river = c.kind === 'river';
      const reach = river ? 230 : 140;
      const w = river ? 1 : 0.6;
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
        if (v > best) {
          best = v;
          bx = qx;
          by = qy;
        }
      }
    }
    const r = rel(car, bx, by);
    ramp(nodes.waterG.gain, 0.09 * best, 0.4);
    setPan(nodes.waterPan, r.pan * Math.min(1, r.d / 15));
  }

  function updateTown(dt, car) {
    murmurT -= dt;
    if (murmurT > 0) return;
    murmurT = 0.25 + Math.random() * 0.3;
    let best = 0;
    let bt = null;
    for (const t of world.towns || []) {
      const d = Math.hypot(t.x - car.x, t.y - car.y);
      if (d >= t.ambienceR) continue;
      const v = (1 - d / t.ambienceR) * (t.kind === 'hamlet' ? 0.6 : 1);
      if (v > best) {
        best = v;
        bt = t;
      }
    }
    const wobble = 0.6 + Math.random() * 0.6;
    ramp(nodes.townG.gain, 0.05 * best * wobble, 0.3);
    ramp(nodes.townF1.frequency, 350 + Math.random() * 200, 0.3);
    if (bt) {
      const r = rel(car, bt.x, bt.y);
      setPan(nodes.townPan, r.pan * Math.min(1, r.d / 60) * 0.7);
    }
  }

  function handleEvents(car, amb) {
    if (!amb || !amb.events) return;
    for (const e of amb.events) {
      const r = rel(car, e.x, e.y);
      if (e.type === 'bell') {
        // Audible across a big part of the map; points you to town.
        const vol = 0.5 / (1 + r.d / 400);
        if (vol < 0.01) continue;
        const delay = r.d / 343; // sound travels
        const t0 = ctx.currentTime + 0.05 + delay;
        for (let k = 0; k < (e.count || 1); k++) bellStrike(t0 + k * 2.3, r.pan, vol, r.d);
      } else if (e.type === 'dog_bark') {
        if (r.d > 350) continue;
        const vol = 0.07 * (1 - r.d / 350);
        const t0 = ctx.currentTime + 0.05;
        const n = e.count || 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) bark(t0 + k * (0.28 + Math.random() * 0.15), r.pan, vol);
      } else if (e.type === 'moo' || e.type === 'whinny') {
        // Rare and quiet: only within a couple of hundred metres.
        if (r.d > 260) continue;
        const vol = (e.type === 'moo' ? 0.06 : 0.035) * (1 - r.d / 260);
        const t0 = ctx.currentTime + 0.05 + r.d / 343;
        if (e.type === 'moo') moo(t0, r.pan, vol);
        else whinny(t0, r.pan, vol);
      } else if (e.type === 'birds_scatter') {
        if (r.d > 80) continue;
        for (let k = 0; k < 3; k++) chirp(r.pan, 0.06 * (1 - r.d / 80));
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
      const s = updateEngine(dt, car);
      const surface = (amb && amb.playerSurface) || 'paved';
      updateSurface(dt, s, surface);
      updateWater(dt, car);
      updateTown(dt, car);
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
  };
}
