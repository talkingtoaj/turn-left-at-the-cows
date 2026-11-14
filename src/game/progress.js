// Saved progress: which missions the player has finished, with their best
// time and shortest drive. Kept in localStorage under PROGRESS_KEY so a
// player who quits and comes back can continue, or replay any finished one.
//
// Engine-free, no world data: the start screen calls this before the game
// loads. Every storage read and write is wrapped, so the game works the
// same (just forgets) when storage is blocked, full or missing (Node).
//
// API:
//   loadProgress()                      -> { version, missions: { [id]: Record } }
//   recordFinish(id, { elapsedMs, odometer, tows })  -> the updated Record, plus
//                                       saved: false when it could not be written
//   canSaveProgress()                   -> false when storage is blocked or full
//   isFinished(id) / finishedIds()
//   nextUnfinishedIndex(list = MISSION_LIST)   -> index of the first unfinished
//                                               mission (0 when all are done)
//   clearProgress()                     (also the ?reset=progress dev flag)
// Record: { finishedAt (ISO), times (how often finished), bestMs, bestDistance (m),
//           lastMs, lastDistance, tows }
// tows (round 11, optional): how often the car was towed on the finish just
// recorded (0 for a clean run). Older saves have no tows field: read it as
// `rec.tows || 0`. Same storage key and version, so old saves still load.

import { MISSION_LIST } from './missionList.js';

export const PROGRESS_KEY = 'askalocal.progress.v1';
const VERSION = 1;

function storage() {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch (e) {
    return null; // some browsers throw just for touching localStorage when blocked
  }
}

const empty = () => ({ version: VERSION, missions: {} });

export function loadProgress() {
  try {
    const s = storage();
    const raw = s && s.getItem(PROGRESS_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    if (!p || p.version !== VERSION || typeof p.missions !== 'object' || !p.missions) return empty();
    return p;
  } catch (e) {
    return empty();
  }
}

function save(p) {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PROGRESS_KEY, JSON.stringify(p));
    return true;
  } catch (e) {
    return false;
  }
}

// Notes that mission `id` was finished in `elapsedMs` over `odometer` metres.
export function recordFinish(id, { elapsedMs = 0, odometer = 0, tows = 0 } = {}) {
  const p = loadProgress();
  const old = p.missions[id] || null;
  const ms = Math.round(elapsedMs);
  const dist = Math.round(odometer);
  const rec = {
    finishedAt: new Date().toISOString(),
    times: (old ? old.times || 1 : 0) + 1,
    bestMs: old && old.bestMs > 0 ? Math.min(old.bestMs, ms) : ms,
    bestDistance: old && old.bestDistance > 0 ? Math.min(old.bestDistance, dist) : dist,
    lastMs: ms,
    lastDistance: dist,
    tows: Math.max(0, Math.round(tows) || 0),
  };
  p.missions[id] = rec;
  const saved = save(p);
  // The first finished job: ask the browser to keep this site's storage
  // (it may otherwise clear it under storage pressure). Fine if refused.
  if (saved && Object.keys(p.missions).length === 1 && !old) {
    try {
      globalThis.navigator?.storage?.persist?.().catch(() => {});
    } catch (e) {
      // not available
    }
  }
  return { ...rec, saved };
}

// Whether progress can be written in this window (private modes and
// blocked storage cannot).
export function canSaveProgress() {
  try {
    const s = storage();
    if (!s) return false;
    const k = `${PROGRESS_KEY}.probe`;
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

export function isFinished(id) {
  return !!loadProgress().missions[id];
}

export function finishedIds() {
  return Object.keys(loadProgress().missions);
}

export function nextUnfinishedIndex(list = MISSION_LIST) {
  const done = loadProgress().missions;
  const i = list.findIndex((m) => !done[m.id]);
  return i < 0 ? 0 : i;
}

export function clearProgress() {
  try {
    const s = storage();
    if (s) {
      s.removeItem(PROGRESS_KEY);
      s.removeItem(MET_KEY);
    }
  } catch (e) {
    // blocked: nothing saved anyway
  }
}

// Locals the player has ever talked to (any mission). Used to credit load
// screen quotes. Own key, so the finish records above are untouched.
export const MET_KEY = 'askalocal.met.v1';

export function metIds() {
  try {
    const s = storage();
    const raw = s && s.getItem(MET_KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

export function rememberMet(id) {
  try {
    const s = storage();
    if (!s || !id) return;
    const a = metIds();
    if (a.includes(id)) return;
    a.push(id);
    s.setItem(MET_KEY, JSON.stringify(a));
  } catch (e) {
    // forgetting is fine
  }
}
