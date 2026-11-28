// Sounds for the map (#92): the unfold rustle and the pencil scratch.
// Files: public/sounds/map/unfold.mp3 and scratch.mp3 (Freesound CC0, see
// public/sounds/SOURCES.md). Quiet no-ops when there is no audio context yet,
// the sound is muted, or a file is missing. The scratch loudness comes from
// scratchGain in ./pencil.js.

import { sharedAudioContext, isMuted } from '../../src/audio/context.js';
import { loadSounds, prefetchSounds } from '../../src/audio/sounds.js';
import { scratchGain } from './pencil.js';

const IDS = ['map/unfold', 'map/scratch'];
let buffers = null; // Map id -> AudioBuffer once decoded
let loading = false;

// Start fetching the files (no audio context needed) so the first open has them.
export function prefetchMapSounds() { prefetchSounds(IDS); }

function ready() {
  const ctx = sharedAudioContext();
  if (!ctx || isMuted()) return null;
  if (!buffers && !loading) {
    loading = true;
    loadSounds(ctx, IDS).then((m) => { buffers = m; loading = false; });
  }
  return buffers ? ctx : null;
}

export function playUnfold(rate = 1) {
  const ctx = ready();
  const buf = ctx && buffers.get('map/unfold');
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate;
  gain.gain.value = 0.55;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

let scratching = null; // { src, gain, lastMove, timer }

export function scratchStart() {
  scratchStop();
  const ctx = ready();
  const buf = ctx && buffers.get('map/scratch');
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  src.loop = true;
  gain.gain.value = 0;
  src.connect(gain).connect(ctx.destination);
  src.start(0, Math.random() * buf.duration);
  scratching = { ctx, src, gain, lastMove: performance.now(), timer: 0 };
  // A hand held still makes no sound.
  scratching.timer = setInterval(() => {
    if (scratching && performance.now() - scratching.lastMove > 90) {
      scratching.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    }
  }, 60);
}

// speed: map px per ms
export function scratchMove(speed) {
  if (!scratching) return;
  scratching.lastMove = performance.now();
  scratching.gain.gain.setTargetAtTime(scratchGain(speed), scratching.ctx.currentTime, 0.03);
}

export function scratchStop() {
  if (!scratching) return;
  const s = scratching;
  scratching = null;
  clearInterval(s.timer);
  s.gain.gain.setTargetAtTime(0, s.ctx.currentTime, 0.02);
  try { s.src.stop(s.ctx.currentTime + 0.12); } catch { /* already stopped */ }
}
