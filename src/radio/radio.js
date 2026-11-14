// The car radio: off until you switch it on, two AM stations, static between
// them, signal that fades with distance from each mast. It is the only music
// and talk in the game (SPEC 9o "Radio").
//
//   const radio = createRadio();
//   radio.start();                          game clock zero (when a mission starts)
//   radio.update(dt, { region, x, y, paused });   every frame
//   radio.toggle() / radio.setOn(bool)      power
//   radio.tune(deltaKhz) / radio.setFreq(khz)
//   radio.state                             { on, freq, tuned, signals, segment, dead, ... }
//   radio.onSegment(fn) -> unsubscribe      fn(event) when a segment starts on the tuned station
//
// Segment event (the hook for subtitles and guest spots, ticket #21):
//   { station, segment, offset, signal, quality, dead }
//   station  the STATIONS entry, segment the SEGMENTS entry (it carries subtitle,
//   speaker, kind, seconds), offset seconds already played (more than 0 when you
//   tune in part way through), dead true when its file is missing (dead air).
// The same event is also sent on window as the 'radio-segment' CustomEvent
// (detail = the event above), and 'radio-off' when the tuned segment stops.
//
// Streaming: only the tuned station loads. The current segment and the next one
// are fetched, one file each. Every station has its own clock (see
// ./radioLogic.js), so tuning away and back finds it moved on. A missing file
// (404) is dead air: quiet static for its listed length, then on to the next.

import { sharedAudioContext, unlockAudio, isMuted } from '../audio/context.js';
import { REGIONS } from '../world/regions.js';
import {
  STATIONS, DIAL_MIN, DIAL_MAX, DIAL_STEP, globalPos, signalAt, tuneQuality, mixFor,
  stationClock, nextSegment,
} from './radioLogic.js';
import { radioAudioUrl } from './segments.js';

const LEVEL = 0.9; // radio loudness against the game's other sounds
const PAUSE_DUCK = 0.15;
const NOISE_LEVEL = 0.2;
const TUNED_AT = 0.04; // dial quality at which a station counts as tuned (and loads)
const KEEP_AFTER_UNTUNE = 30; // seconds a station's loaded files stay after you tune away
const GIVE_UP_AFTER = 2; // a station whose first files are all missing stops asking
const PARAM_EVERY = 0.1; // seconds between sound parameter updates

// Mast spots in the shared frame, from the regions' own world data.
function findMasts() {
  const out = [];
  for (const st of STATIONS) {
    for (const [region, r] of Object.entries(REGIONS)) {
      const l = ((r.source && r.source.landmarks) || []).find((m) => m.id === st.mastId);
      if (l) out.push({ station: st, ...globalPos(region, l.x, l.y) });
    }
  }
  return out;
}

export function createRadio() {
  const masts = findMasts();
  let ctx = null;
  let nodes = null;
  let on = false;
  let freq = 800; // between the two stations
  let t0 = performance.now();
  let place = { region: 'fenwick', x: 0, y: 0 };
  let paused = false;
  let paramT = 0;
  let flutterT = 0;
  const listeners = new Set();
  const signals = {};
  for (const st of STATIONS) signals[st.id] = 0;

  const cache = new Map(); // segment id -> { state: 'loading' | 'ready' | 'dead', buf }
  const tried = {}; // station id -> { ok, missing }
  for (const st of STATIONS) tried[st.id] = { ok: 0, missing: 0 };
  let active = null; // { station, segment, src, g, dead }
  let tuned = null; // station on the dial, or null
  let untunedFor = 0;
  let lastQuality = 0;

  const clockSeconds = () => (performance.now() - t0) / 1000;

  // ------------------------------------------------------------ sound graph
  function noiseBuffer() {
    const n = Math.floor(ctx.sampleRate * 2.5);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * 0.35; // takes the harshest highs off
      d[i] = lp * 1.6 + (Math.random() < 0.0007 ? (Math.random() - 0.5) * 2.2 : 0); // now and then a crackle
    }
    return b;
  }

  function build() {
    if (nodes) return true;
    ctx = sharedAudioContext() || unlockAudio();
    if (!ctx) return false;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer();
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = 4800;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0;
    noise.connect(hp);
    hp.connect(nlp);
    nlp.connect(noiseG);
    noiseG.connect(out);
    noise.start();
    const voiceLp = ctx.createBiquadFilter();
    voiceLp.type = 'lowpass';
    voiceLp.frequency.value = 3600;
    voiceLp.Q.value = 0.7;
    const voiceG = ctx.createGain();
    voiceG.gain.value = 0;
    voiceLp.connect(voiceG);
    voiceG.connect(out);
    nodes = { out, noiseG, voiceLp, voiceG };
    return true;
  }

  const ramp = (param, v, tc = 0.08) => param.setTargetAtTime(v, ctx.currentTime, tc);

  // ------------------------------------------------------------- streaming
  function fetchSegment(seg) {
    if (cache.has(seg.id)) return cache.get(seg.id);
    const st = tried[seg.station];
    const entry = { state: 'loading', buf: null };
    cache.set(seg.id, entry);
    // A station whose first files are all missing has no audio yet: stop asking.
    if (st.ok === 0 && st.missing >= GIVE_UP_AFTER) {
      entry.state = 'dead';
      return entry;
    }
    const dead = () => {
      entry.state = 'dead';
      st.missing++;
    };
    fetch(radioAudioUrl(seg))
      .then((r) => {
        const type = r.headers.get('content-type') || '';
        // Some servers answer a missing file with their home page and a 200.
        if (!r.ok || /text\/html/i.test(type)) throw new Error('missing');
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        entry.buf = buf;
        entry.state = 'ready';
        st.ok++;
      })
      .catch(dead);
    return entry;
  }

  function dropOldFiles() {
    for (const [id, e] of cache) {
      if (e.state === 'ready' && !(active && active.segment.id === id) && !(tuned && wanted.has(id))) cache.delete(id);
    }
  }
  const wanted = new Set();

  function stopActive() {
    if (!active) return;
    if (active.src) {
      try {
        active.src.onended = null;
        active.src.stop();
      } catch (e) {
        // Already stopped.
      }
      active.src.disconnect();
    }
    active = null;
    window.dispatchEvent(new CustomEvent('radio-off'));
  }

  function startSource(entry, offset) {
    if (!active || active.src || offset >= entry.buf.duration - 0.05) return;
    const src = ctx.createBufferSource();
    src.buffer = entry.buf;
    src.connect(nodes.voiceLp);
    src.start(0, offset);
    active.src = src;
  }

  function emit(ev) {
    for (const fn of listeners) {
      try {
        fn(ev);
      } catch (e) {
        console.error(e);
      }
    }
    window.dispatchEvent(new CustomEvent('radio-segment', { detail: ev }));
  }

  // Keep the tuned station's sound in step with its clock.
  function follow(st) {
    const c = stationClock(st, clockSeconds());
    wanted.clear();
    wanted.add(c.segment.id);
    const next = nextSegment(st, c.segment);
    wanted.add(next.id);
    if (!active || active.station !== st || active.segment !== c.segment) {
      stopActive();
      active = { station: st, segment: c.segment, src: null, dead: false };
      dropOldFiles(); // only this one and the next stay loaded
      const entry = fetchSegment(c.segment);
      emit({
        station: st, segment: c.segment, offset: c.offset, signal: signals[st.id], quality: lastQuality,
        dead: entry.state === 'dead',
      });
    }
    const entry = cache.get(c.segment.id) || fetchSegment(c.segment);
    if (entry.state === 'ready') startSource(entry, c.offset);
    else if (entry.state === 'dead') active.dead = true;
    // The next one, ready before it is needed.
    fetchSegment(next);
  }

  // ----------------------------------------------------------- per frame
  function update(dt, opts) {
    if (opts) {
      place = { region: opts.region || place.region, x: opts.x, y: opts.y };
      paused = !!opts.paused;
    }
    if (!on || !nodes) return;
    if (ctx.state !== 'running') return;
    // Signal from each mast, in the shared frame.
    const me = globalPos(place.region, place.x, place.y);
    for (const st of STATIONS) {
      const m = masts.find((k) => k.station === st);
      signals[st.id] = m ? signalAt(Math.hypot(m.x - me.x, m.y - me.y)) : 0;
    }
    // The station the dial sits on.
    let best = null;
    let bq = 0;
    for (const st of STATIONS) {
      const q = tuneQuality(freq, st.freqKhz);
      if (q > bq) {
        bq = q;
        best = st;
      }
    }
    tuned = bq >= TUNED_AT ? best : null;
    lastQuality = tuned ? bq : 0;
    if (tuned) {
      untunedFor = 0;
      follow(tuned);
    } else {
      stopActive();
      untunedFor += dt;
      if (untunedFor > KEEP_AFTER_UNTUNE) {
        wanted.clear();
        dropOldFiles();
      }
    }
    // Sound parameters, a few times a second.
    paramT -= dt;
    if (paramT > 0) return;
    paramT = PARAM_EVERY;
    flutterT += PARAM_EVERY;
    const sig = tuned ? signals[tuned.id] : 0;
    const mix = mixFor(sig, lastQuality);
    const clear = sig * lastQuality;
    // A weak voice drifts in and out.
    const flutter = 1 - 0.4 * (1 - clear) * (0.5 + 0.5 * Math.sin(flutterT * 1.7) * Math.sin(flutterT * 0.63 + 1));
    const deadAir = active && active.dead;
    ramp(nodes.noiseG.gain, mix.noise * NOISE_LEVEL * (deadAir ? 0.7 : 1));
    ramp(nodes.voiceG.gain, deadAir ? 0 : mix.voice * flutter);
    ramp(nodes.voiceLp.frequency, mix.lowpass);
    ramp(nodes.out.gain, isMuted() ? 0 : LEVEL * (paused ? PAUSE_DUCK : 1), 0.2);
  }

  function setOn(v) {
    v = !!v;
    if (v === on) return on;
    if (v) {
      if (!build()) return false;
      if (ctx.state === 'suspended') ctx.resume();
      on = true;
      paramT = 0;
    } else {
      on = false;
      stopActive();
      tuned = null;
      if (nodes) {
        ramp(nodes.out.gain, 0, 0.05);
        ramp(nodes.noiseG.gain, 0, 0.05);
      }
    }
    return on;
  }

  return {
    start() {
      t0 = performance.now();
    },
    update,
    setOn,
    toggle() {
      return setOn(!on);
    },
    // Move the dial. Steps land on multiples of DIAL_STEP.
    tune(delta) {
      const f = freq + delta;
      freq = Math.min(DIAL_MAX, Math.max(DIAL_MIN, delta % DIAL_STEP === 0 ? Math.round(f / DIAL_STEP) * DIAL_STEP : f));
      paramT = 0;
      return freq;
    },
    setFreq(f) {
      freq = Math.min(DIAL_MAX, Math.max(DIAL_MIN, f));
      paramT = 0;
      return freq;
    },
    onSegment(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stations: STATIONS,
    get on() {
      return on;
    },
    get freq() {
      return freq;
    },
    get tuned() {
      return tuned;
    },
    get signals() {
      return signals;
    },
    // For checks: what is on air for the tuned station.
    get state() {
      return {
        on, freq, tuned: tuned ? tuned.id : null, signals: { ...signals },
        segment: active ? active.segment.id : null, dead: !!(active && active.dead),
        loaded: [...cache.entries()].filter(([, e]) => e.state === 'ready').map(([id]) => id),
        loading: [...cache.entries()].filter(([, e]) => e.state === 'loading').map(([id]) => id),
      };
    },
  };
}
