// The car radio: on when you set off (T switches it on and off), two AM
// stations, static between them, signal that fades with distance from each
// mast. It is the only music and talk in the game (SPEC 9o "Radio").
//
//   const radio = createRadio();
//   radio.start();                          game clock zero (when a mission starts)
//   radio.setStation(id)                    put it on a station now (the home station at mission start)
//   radio.update(dt, { region, x, y, paused, inCar });   every frame
//   radio.toggle() / radio.setOn(bool)      power (the volume is kept)
//   radio.setVolume(0..1) / radio.nudgeVolume(delta)   turning it up also switches it on
//   radio.crackle(strike)                   a lightning strike, the moment it happens
//   radio.state                             { on, volume, freq, tuned, target, signals, segment, dead, ... }
//   radio.onSegment(fn) -> unsubscribe      fn(event) when a segment starts on the tuned station
//
// No tuning by the player. The radio tunes itself (autoTuneStep in
// ./radioLogic.js): it stays on its station while that is heard, and once it
// is lost and another station would be heard, the needle sweeps across the
// dial by itself in about a second and lands on that one. The frequency moving
// between stations gives the tuning static on its own. Signal is distance only
// from each mast, so driving to the other county the station fades into
// static, then there is a stretch where neither comes in, then it finds the
// other one.
//
// Volume: 0 to 1, starts at 0.7 and is kept in localStorage. At 0 the lamp is
// dark as if off. Out of the car (inCar false) the radio fades out in a
// quarter second and then counts as not heard; back in it fades in again.
// The global mute (../audio/context.js) silences it, crackles included.
//
// Lightning: a strike crackles on the radio at once (radio waves travel with
// the flash; the thunder sound comes later): loud and about half a second when
// close, a faint tick when far. Only while the radio is on and can be heard.
//
// Segment event (the hook for subtitles and guest spots, ticket #21):
//   { station, segment, offset, signal, quality, dead }
//   station  the STATIONS entry, segment the SEGMENTS entry (it carries subtitle,
//   speaker, kind, seconds), offset seconds already played (more than 0 when you
//   tune in part way through), dead true when its file is missing (dead air).
// The same event is also sent on window as the 'radio-segment' CustomEvent
// (detail = the event above), and 'radio-off' when the tuned segment stops.
//
// Streaming: only a station you can hear loads. The current segment and the next
// one are fetched, one file each. Heard means the radio is on, turned up, you are
// in the car, the dial is on the station and the signal is not buried in static
// (see hearStep in ./radioLogic.js). Each station keeps its own place in its loop
// and that only moves while it is heard. When you lose it nothing streams. When
// you get it back after a gap of 5 seconds or more it picks up a little way into
// the item after the one that was playing, so you never come back to a station
// that moved on without you. A missing file (404) is dead air: quiet static for
// its listed length, then on to the next.

import { sharedAudioContext, unlockAudio, isMuted } from '../audio/context.js';
import { REGIONS } from '../world/regions.js';
import {
  STATIONS, globalPos, signalAt, tuneQuality, mixFor, nextSegment, segmentAt, startPosition, advance,
  resumeAfterGap, hearStep, autoTuneStep, sweepFreq, SWEEP_SECONDS, volumeGain, VOLUME_START, crackleFor,
} from './radioLogic.js';
import { radioAudioUrl } from './segments.js';

// Loudness at 100% volume: about 2 dB over the loudest sound around you.
// Measured (ffmpeg volumedetect, mean level) against the engine at full
// throttle, the loudest layer in ../audio/audio.js: its loops are -18.4 dBFS
// (also through its 2.6 kHz lowpass), engGain at most 0.32 + 0.21 + 0.21 =
// 0.74 (-2.6 dB), and the game's master gain 0.5 (-6 dB), so about -27 dBFS
// at the speakers. (Creek or river right beside you, at 0.9, is the same
// within 0.2 dB; the heaviest rain on the roof is about -34.) The radio files are baked to -18 LUFS (tools/radio-bake.mjs) and
// measure -18.4 dBFS through the radio's 3.6 kHz lowpass, with no master
// gain or compressor after them. -18.4 + 20 log10(0.46) = -25.1 dBFS, 2 dB
// over the engine. The game's compressor can only make the engine quieter.
// The owner tuned it (15 Nov 2026): down to 60% of that 0.46, then up by
// half again, so full volume is 90% of it (about 1 dB quieter). It still
// starts at 70% on the knob.
const LEVEL = 0.46 * 0.6 * 1.5;
const PAUSE_DUCK = 0.15;
const NOISE_LEVEL = 0.2;
const TUNED_AT = 0.04; // dial quality at which a station counts as tuned (and loads)
const KEEP_AFTER_UNTUNE = 30; // seconds a station's loaded files stay after you tune away
const GIVE_UP_AFTER = 2; // a station whose first files are all missing stops asking
const PARAM_EVERY = 0.1; // seconds between sound parameter updates
const FADE_OUT = 0.25; // seconds to fade out when you get out of the car (or turn it down to 0)
const FADE_TC = FADE_OUT / 4; // time constant for that fade (about 2% left after FADE_OUT)
// v2: the knob's scale changed (LEVEL above), so old saved volumes start over at 70%.
const VOLUME_KEY = 'askalocal.radioVolume2';

// The volume knob is remembered between visits. Storage can be blocked: then
// it starts at VOLUME_START every visit.
function readVolume() {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY);
    if (raw == null || raw === '') return VOLUME_START;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : VOLUME_START;
  } catch (e) {
    return VOLUME_START;
  }
}
function saveVolume(v) {
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(v));
  } catch (e) {
    // Storage blocked: remember for this visit only.
  }
}

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

// opts.random: a function giving 0..1 for each station's starting item (tests pass a fixed one).
export function createRadio(opts = {}) {
  const random = opts.random || Math.random;
  const masts = findMasts();
  let ctx = null;
  let nodes = null;
  let on = false;
  let volume = readVolume();
  let inCar = true;
  let quietFor = 0; // seconds since it stopped being audible (out of the car or at 0)
  let freq = 800; // between the two stations
  let tune = { station: null, hear: {} }; // where the auto-tune wants to be (autoTuneStep)
  let sweep = null; // { from, to, t } while the needle moves to a new station
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
  // Each station's place in its loop, and when it was last heard (null = never).
  const pos = {};
  const lostAt = {};
  let hear = { station: null, heard: false, lowFor: 0 }; // the station being heard now
  const clockSeconds = () => (performance.now() - t0) / 1000;
  function resetPositions() {
    for (const st of STATIONS) {
      pos[st.id] = startPosition(st, random);
      lostAt[st.id] = null;
    }
    hear = { station: null, heard: false, lowFor: 0 };
  }
  resetPositions();

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
    // Lightning crackles go through the same AM band as the static.
    const crackHp = ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 300;
    const crackLp = ctx.createBiquadFilter();
    crackLp.type = 'lowpass';
    crackLp.frequency.value = 5000;
    crackHp.connect(crackLp);
    crackLp.connect(out);
    nodes = { out, noiseG, voiceLp, voiceG, crackHp };
    return true;
  }

  // A burst of crackle: short bursts of noise at random strengths and sharp
  // pops, fading out over `seconds`. Made fresh each time so no two sound alike.
  function crackleBuffer(seconds) {
    const sr = ctx.sampleRate;
    const n = Math.max(16, Math.floor(seconds * sr));
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const attack = sr * 0.002;
    let amp = 1;
    let left = 0;
    for (let i = 0; i < n; i++) {
      if (left <= 0) {
        amp = Math.random() < 0.65 ? 0.4 + Math.random() * 0.6 : Math.random() * 0.15;
        left = sr * (0.003 + Math.random() * 0.025);
      }
      left--;
      let v = (Math.random() * 2 - 1) * amp * 0.6;
      if (Math.random() < 0.003) v += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
      d[i] = v * Math.min(1, i / attack) * Math.pow(1 - i / n, 1.5);
    }
    d[Math.min(n - 1, Math.floor(attack))] += 0.9; // it always starts with a tick
    return b;
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
      if (e.state === 'ready' && !(active && active.segment.id === id) && !wanted.has(id)) cache.delete(id);
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

  // Keep the heard station's sound in step with its place in the loop.
  function follow(st) {
    const p = pos[st.id];
    const seg = segmentAt(st, p);
    const next = nextSegment(st, p);
    wanted.clear();
    wanted.add(seg.id);
    wanted.add(next.id);
    if (!active || active.station !== st || active.segment !== seg || active.index !== p.index) {
      stopActive();
      active = { station: st, segment: seg, index: p.index, src: null, dead: false };
      dropOldFiles(); // only this one and the next stay loaded
      const entry = fetchSegment(seg);
      emit({
        station: st, segment: seg, offset: p.offset, signal: signals[st.id], quality: lastQuality,
        dead: entry.state === 'dead',
      });
    }
    const entry = cache.get(seg.id) || fetchSegment(seg);
    if (entry.state === 'ready') startSource(entry, p.offset);
    else if (entry.state === 'dead') active.dead = true;
    // The next one, ready before it is needed.
    fetchSegment(next);
  }

  // The station is not heard any more: stop it and keep only what it resumes on.
  function lose(st) {
    stopActive();
    lostAt[st.id] = clockSeconds();
    wanted.clear();
    wanted.add(nextSegment(st, pos[st.id]).id);
    untunedFor = 0;
  }

  // The station is heard again: work out where it picks up.
  function regain(st) {
    if (lostAt[st.id] != null) pos[st.id] = resumeAfterGap(st, pos[st.id], clockSeconds() - lostAt[st.id]);
    lostAt[st.id] = null;
  }

  // Nothing is heard: after a while the files we kept are let go.
  function idle(dt) {
    untunedFor += dt;
    if (untunedFor > KEEP_AFTER_UNTUNE) {
      wanted.clear();
      dropOldFiles();
    }
  }

  // ----------------------------------------------------------- per frame
  function update(dt, opts) {
    if (opts) {
      place = { region: opts.region || place.region, x: opts.x, y: opts.y };
      paused = !!opts.paused;
      if (opts.inCar !== undefined && !!opts.inCar !== inCar) {
        inCar = !!opts.inCar;
        paramT = 0; // start the fade now
      }
    }
    if (!on || !nodes) {
      idle(dt);
      return;
    }
    if (ctx.state !== 'running') return;
    // Signal from each mast, in the shared frame.
    const me = globalPos(place.region, place.x, place.y);
    for (const st of STATIONS) {
      const m = masts.find((k) => k.station === st);
      signals[st.id] = m ? signalAt(Math.hypot(m.x - me.x, m.y - me.y)) : 0;
    }
    // Audible: in the car and turned up. Getting out (or turning it to 0)
    // fades it out first, then it counts as not heard.
    const want = inCar && volume > 0;
    quietFor = want ? 0 : quietFor + dt;
    const audible = quietFor < FADE_OUT;
    // The radio tunes itself while it can be heard. A radio left quiet starts
    // fresh when it comes back, so it finds a station at once.
    if (audible) {
      const next = autoTuneStep(tune, signals, dt);
      if (next.station && next.station !== tune.station) {
        const st = STATIONS.find((k) => k.id === next.station);
        sweep = { from: freq, to: st.freqKhz, t: 0 };
      }
      tune = next;
    } else if (Object.keys(tune.hear).length) {
      tune = { station: tune.station, hear: {} };
    }
    if (sweep) {
      sweep.t += dt;
      freq = sweepFreq(sweep.from, sweep.to, sweep.t);
      if (sweep.t >= SWEEP_SECONDS) sweep = null;
      paramT = 0; // the static follows the needle closely
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
    // Heard or not. Tuning away (or not being audible) counts as lost at once.
    if (hear.station && (hear.station !== tuned || !audible)) {
      if (hear.heard) lose(hear.station);
      hear = { station: null, heard: false, lowFor: 0 };
    }
    if (tuned && audible) {
      if (hear.station !== tuned) hear = { station: tuned, heard: false, lowFor: 0 };
      const was = hear.heard;
      const h = hearStep(hear, signals[tuned.id] * lastQuality, dt);
      hear = { station: tuned, heard: h.heard, lowFor: h.lowFor };
      if (was && !h.heard) lose(tuned);
      if (!was && h.heard) regain(tuned);
    }
    if (hear.heard) {
      untunedFor = 0;
      pos[tuned.id] = advance(tuned, pos[tuned.id], dt);
      follow(tuned);
    } else {
      stopActive();
      idle(dt);
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
    ramp(nodes.out.gain, isMuted() || !want ? 0 : LEVEL * volumeGain(volume) * (paused ? PAUSE_DUCK : 1), FADE_TC);
  }

  // Volume 0..1, kept to whole percents. Turning it up switches the radio on.
  function setVolume(v) {
    v = Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100;
    if (v === volume) return volume;
    const up = v > volume;
    volume = v;
    saveVolume(volume);
    paramT = 0;
    if (up && !on) setOn(true);
    return volume;
  }

  // Lightning: a crackle now, through the radio's volume (and the mute).
  function crackle(strike) {
    if (!strike || !on || !nodes || !inCar || volume <= 0 || ctx.state !== 'running') return;
    const c = crackleFor(strike.km, strike.power);
    const src = ctx.createBufferSource();
    src.buffer = crackleBuffer(c.seconds);
    const g = ctx.createGain();
    g.gain.value = c.level;
    src.connect(g);
    g.connect(nodes.crackHp);
    src.onended = () => g.disconnect();
    src.start();
  }

  function setOn(v) {
    v = !!v;
    if (v === on) return on;
    if (v) {
      if (!build()) return false;
      if (ctx.state === 'suspended') ctx.resume();
      on = true;
      paramT = 0;
      quietFor = 0;
      tune = { station: tune.station, hear: {} };
    } else {
      on = false;
      if (hear.heard) lose(hear.station);
      hear = { station: null, heard: false, lowFor: 0 };
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
      stopActive();
      wanted.clear();
      dropOldFiles();
      resetPositions();
    },
    update,
    setOn,
    toggle() {
      return setOn(!on);
    },
    // Put the radio on a station now, with no sweep (the home station when a
    // mission starts). The auto-tune carries on from there.
    setStation(id) {
      const st = STATIONS.find((k) => k.id === id);
      if (!st) return null;
      tune = { station: st.id, hear: {} };
      sweep = null;
      freq = st.freqKhz;
      paramT = 0;
      return st;
    },
    setVolume,
    nudgeVolume(delta) {
      return setVolume(volume + delta);
    },
    crackle,
    onSegment(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // For the subtitles: fills `out` (no allocation) with what is on air now.
    //   out.segment  the segment, or null
    //   out.offset   seconds into it, on the station's own position
    //   out.mode     'play' (its file is playing), 'dead' (file missing), 'wait' (still loading), 'off'
    //   out.clear    signal * dial quality, 0..1
    airInfo(out) {
      out.segment = null;
      out.offset = 0;
      out.mode = 'off';
      out.clear = 0;
      if (!on || !inCar || volume <= 0 || !hear.heard || !active) return out;
      out.segment = active.segment;
      out.offset = pos[active.station.id].offset;
      out.mode = active.dead ? 'dead' : active.src ? 'play' : 'wait';
      out.clear = signals[tuned.id] * lastQuality;
      return out;
    },
    stations: STATIONS,
    get on() {
      return on;
    },
    // The lamp: on and turned up.
    get lit() {
      return on && volume > 0;
    },
    get volume() {
      return volume;
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
        on, volume, inCar, freq, tuned: tuned ? tuned.id : null, target: tune.station, sweeping: !!sweep,
        signals: { ...signals },
        segment: active ? active.segment.id : null, dead: !!(active && active.dead),
        loaded: [...cache.entries()].filter(([, e]) => e.state === 'ready').map(([id]) => id),
        loading: [...cache.entries()].filter(([, e]) => e.state === 'loading').map(([id]) => id),
      };
    },
  };
}
