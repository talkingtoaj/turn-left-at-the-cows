// The road crew's sound (#95): the excavator's diesel and its clanks, heard in
// 3D. crewVoice() is pure (level, tone and pan from where you stand), checked
// by tools/check-roadcrew.mjs; createCrewSound() plays it with Web Audio, made
// of plain oscillators and noise so it needs no sound file.
//
// The ear: { x, y, heading } (heading degrees, 0 = north, y south). The source:
// { x, y } (the excavator).

import { sharedAudioContext, isMuted } from './context.js';

const DEG = Math.PI / 180;
export const CREW_HEAR_R = 230; // m: past this it is silent
const REF = 16; // m: full level inside this
const LEVEL = 0.5;

// rev 0..1: the engine works harder lifting a load. Returns { level, lowpass, pan, rate }.
export function crewVoice(ear, src, rev = 0) {
  const dx = src.x - ear.x;
  const dy = src.y - ear.y;
  const d = Math.hypot(dx, dy);
  if (d >= CREW_HEAR_R) return { level: 0, lowpass: 200, pan: 0, rate: 1, d };
  const fade = 1 - d / CREW_HEAR_R;
  const level = LEVEL * Math.min(1, REF / Math.max(d, 1)) * fade * (0.7 + 0.3 * rev);
  // Right of the way you face is positive: heading h faces (sin h, -cos h), right is (cos h, sin h).
  const h = ear.heading * DEG;
  const right = (dx * Math.cos(h) + dy * Math.sin(h)) / Math.max(d, 1);
  return {
    level,
    lowpass: 260 + 1500 * Math.exp(-d / 60), // air soaks up the highs
    pan: Math.max(-1, Math.min(1, right)) * Math.min(1, d / 6),
    rate: 0.92 + 0.22 * rev,
    d,
  };
}

// Web Audio side. Returns null when there is no audio context (yet).
export function createCrewSound() {
  const ctx = sharedAudioContext();
  if (!ctx) return null;
  const out = ctx.createGain();
  out.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  lp.connect(out);
  if (pan) { out.connect(pan); pan.connect(ctx.destination); } else out.connect(ctx.destination);
  // Diesel: two low saws and a chug (a slow tremolo) on top of brown noise.
  const chug = ctx.createGain();
  chug.gain.value = 0.7;
  chug.connect(lp);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 9;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.3;
  lfo.connect(lfoG);
  lfoG.connect(chug.gain);
  const oscs = [lfo];
  for (const [f, g] of [[38, 0.5], [57, 0.25]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og);
    og.connect(chug);
    oscs.push(o);
  }
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  {
    const a = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < a.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = last * 3.5; }
  }
  const nz = ctx.createBufferSource();
  nz.buffer = noiseBuf;
  nz.loop = true;
  const nzG = ctx.createGain();
  nzG.gain.value = 0.5;
  nz.connect(nzG);
  nzG.connect(lp);
  for (const o of oscs) o.start();
  nz.start();
  // A clank: a short burst of ringing metal, level set by distance.
  const clank = (level) => {
    if (level <= 0.001) return;
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.45);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = lp.frequency.value * 2.2 + 400;
    bp.Q.value = 0.8;
    g.connect(bp);
    bp.connect(pan || ctx.destination);
    const stops = [];
    for (const f of [410, 690, 1130]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * (0.97 + Math.random() * 0.06);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + 0.5);
      stops.push(o);
    }
    stops[0].onended = () => { g.disconnect(); bp.disconnect(); };
  };
  return {
    // v: crewVoice() result; doClank: a clank landed this frame; silent: paused.
    update(v, doClank, silent) {
      const t = ctx.currentTime;
      const quiet = silent || isMuted();
      out.gain.setTargetAtTime(quiet ? 0 : v.level, t, 0.12);
      lp.frequency.setTargetAtTime(v.lowpass, t, 0.15);
      if (pan) pan.pan.setTargetAtTime(v.pan, t, 0.1);
      for (const o of oscs.slice(1)) o.detune.setTargetAtTime((v.rate - 1) * 1200, t, 0.3);
      if (doClank && !quiet) clank(Math.min(0.5, v.level * 1.4));
    },
    dispose() {
      for (const o of oscs) { try { o.stop(); } catch (e) { /* already stopped */ } }
      try { nz.stop(); } catch (e) { /* already stopped */ }
      out.disconnect();
    },
  };
}
