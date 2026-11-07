// Context tips (round 12): short prompts that turn up when they are
// useful ("Stop and press F to get out and talk"), each a few times at most,
// then never again. Engine-free; the HUD (src3/hud/tips.js) draws them and
// main.js fills the context each frame.
//
// A tip: { id, text, max (times ever shown), when(c) -> bool }. `c` is the
// context (see TIP_CONTEXT below). To add one, add a line to TIPS.
//
// Remembered in localStorage (`tlatc.tips.v1`: { off, n: { id: times } }),
// every access in try/catch: without storage tips still work, they just
// start afresh each visit. Turn them off in How to play (H), or with
// ?tips=off; ?tips=reset forgets what was shown and turns them back on.

export const TIPS_KEY = 'tlatc.tips.v1';

// What the tips can look at (main.js fills it every frame):
export const TIP_CONTEXT = {
  onFoot: false, // out of the car
  speed: 0, // the car's speed, m/s
  driveLocalD: Infinity, // metres from the car to the nearest local (driving)
  footLocalD: Infinity, // metres from you to the nearest local (on foot)
  canTalk: false, // a local is in talk range and you face them
  carD: Infinity, // metres from you to the car (on foot)
  footTime: 0, // seconds since you got out
  locked: false, // the mouse is captured (pointer lock) on foot
  planeD: Infinity, // metres to the nearest plane you can hear
  planeClue: false, // the planes are a clue in this mission
  rain: 0, // 0..1 how hard it rains
  damaged: false, // a warning light is on
  namesShown: false, // a conversation has underlined names on screen
  talkedTo: 0, // locals talked to this mission
  sketchEmpty: true, // nothing drawn on the map yet
  driveTime: 0, // seconds driven this mission
  busy: false, // a dialogue, the map or a card is up (most tips wait)
};

export const TIPS = [
  { id: 'get_out', max: 3, text: 'Stop and press F to get out and talk.',
    when: (c) => !c.onFoot && !c.busy && c.driveLocalD < 30 },
  { id: 'walk_up', max: 3, text: 'Walk up to them, face them and press E to talk.',
    when: (c) => c.onFoot && !c.busy && c.footLocalD < 12 && !c.canTalk },
  { id: 'get_in', max: 3, text: 'F to get back in the car.',
    when: (c) => c.onFoot && !c.busy && c.carD < 3 && c.footTime > 6 && c.footLocalD > 12 },
  { id: 'look_mouse', max: 2, text: 'Click to look around with the mouse. Esc lets it go.',
    when: (c) => c.onFoot && !c.busy && !c.locked && c.footTime > 1.5 },
  { id: 'plane_out', max: 2, text: 'Hear that? Stop and press F to get out and look up.',
    when: (c) => !c.onFoot && !c.busy && c.planeClue && c.planeD < 1300 },
  { id: 'plane_look', max: 2, text: 'Hold the right mouse button and move the mouse to turn your head.',
    when: (c) => !c.onFoot && !c.busy && c.planeClue && c.planeD < 900 && c.speed < 3 },
  { id: 'rain', max: 2, text: 'Rain: the road gets slippery. Brake early and take bends slowly.',
    when: (c) => !c.onFoot && !c.busy && c.rain > 0.3 && c.speed > 5 },
  { id: 'damage', max: 2, text: 'A warning light: amber means worn, red and blinking means bad. Go gently.',
    when: (c) => !c.busy && c.damaged },
  { id: 'names', max: 3, text: 'Click a name or press 1-4 to ask about it.',
    when: (c) => c.namesShown },
  { id: 'sketch', max: 2, text: 'Press M to sketch what you heard.',
    when: (c) => !c.busy && c.talkedTo > 0 && c.sketchEmpty && !c.onFoot && c.speed > 2 },
];

const SHOW_S = 6; // a tip stays up this long...
const HOLD_S = 0.8; // ...once its condition has held this long
const GAP_S = 10; // quiet between two tips
const AGAIN_S = 90; // the same tip comes back no sooner than this

function readStore(storage) {
  try {
    const raw = storage && storage.getItem(TIPS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') return { off: !!v.off, n: v.n && typeof v.n === 'object' ? v.n : {} };
  } catch (e) {
    // Blocked or broken storage: start afresh.
  }
  return { off: false, n: {} };
}

function writeStore(storage, data) {
  try {
    if (storage) storage.setItem(TIPS_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage full or blocked: keep going in memory.
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

// Turns tips on or off for good (How to play, ?tips=off).
export function setTipsEnabled(on, storage = defaultStorage()) {
  const d = readStore(storage);
  d.off = !on;
  writeStore(storage, d);
}

export function tipsEnabled(storage = defaultStorage()) {
  return !readStore(storage).off;
}

// Forgets which tips were shown and turns them back on (?tips=reset).
export function resetTips(storage = defaultStorage()) {
  writeStore(storage, { off: false, n: {} });
}

// The tip engine. update(c, t) every frame (t in seconds) returns the tip to
// show now ({ id, text }) or null.
export function createTips({ storage = defaultStorage(), tips = TIPS } = {}) {
  const data = readStore(storage);
  const since = new Map(); // id -> time its condition started holding
  const lastShown = new Map();
  let current = null; // { tip, until }
  let quietUntil = 0;
  return {
    get enabled() {
      return !data.off && !readStore(storage).off;
    },
    count(id) {
      return data.n[id] || 0;
    },
    update(c, t) {
      if (!this.enabled) {
        current = null;
        return null;
      }
      if (current) {
        // Gone when its time is up or it no longer fits.
        if (t >= current.until || !current.tip.when(c)) {
          current = null;
          quietUntil = t + GAP_S;
        } else return current.tip;
      }
      for (const tip of tips) {
        if (!tip.when(c)) {
          since.delete(tip.id);
          continue;
        }
        if (!since.has(tip.id)) since.set(tip.id, t);
      }
      if (t < quietUntil) return null;
      for (const tip of tips) {
        if (!since.has(tip.id) || t - since.get(tip.id) < HOLD_S) continue;
        if ((data.n[tip.id] || 0) >= tip.max) continue;
        if (lastShown.has(tip.id) && t - lastShown.get(tip.id) < AGAIN_S) continue;
        data.n[tip.id] = (data.n[tip.id] || 0) + 1;
        writeStore(storage, data);
        lastShown.set(tip.id, t);
        current = { tip, until: t + SHOW_S };
        return tip;
      }
      return null;
    },
    // The player closed it: never mind the rest of its time.
    dismiss(t) {
      if (!current) return;
      current = null;
      quietUntil = t + GAP_S;
    },
  };
}
