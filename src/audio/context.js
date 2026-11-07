// The one AudioContext for the page, and the remembered mute setting.
// Engine-free and tiny, so the start screen can use it before the game loads.
//
// Browsers (Safari above all) only let an AudioContext start inside a real
// user gesture handler. The start screen calls unlockAudio() straight from
// its click handler; the game's audio (./audio.js) then uses the same
// context, already running. No sound plays before that first click.
//
//   unlockAudio()        -> the context (made and resumed now), or null
//   sharedAudioContext() -> the context if one was made, else null
//   isMuted() / setMuted(bool) / onMuteChange(fn)   (kept in localStorage)

export const MUTE_KEY = 'askalocal.muted';

let ctx = null;

export function sharedAudioContext() {
  return ctx;
}

// Call only from inside a click / key handler.
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    // Safari: play one silent sample inside the gesture so output really opens.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  } catch (e) {
    // No Web Audio: the game stays silent.
  }
  return ctx;
}

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

let muted = readMuted();
const listeners = new Set();

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = !!v;
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch (e) {
    // Storage blocked: remember for this visit only.
  }
  for (const fn of listeners) fn(muted);
  return muted;
}

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
