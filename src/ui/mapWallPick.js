// The map wall's plain logic (src/ui/mapShare.js draws it): which two maps
// to show in a pick, the order and size of pins on the wall, and the
// "seen the note" flag. No DOM, so tools/check-map-wall.mjs runs it in node.

// One copy of each map (lists fetched by votes and by newest overlap).
export function uniqueMaps(maps) {
  const seen = new Set();
  const out = [];
  for (const m of maps || []) {
    if (!m || m.id == null || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export const pairKey = (pair) => pair.map((m) => m.id).sort().join('|');

// Two different maps, neither the player's own (mine) nor hidden, or null
// when there are fewer than two. Maps the player hasn't voted for come first.
// `last` (the pair just shown) isn't shown again when there is another pair.
export function pickPair(maps, { rnd = Math.random, last = null } = {}) {
  const pool = uniqueMaps(maps).filter((m) => !m.mine && !m.hidden);
  if (pool.length < 2) return null;
  const fresh = pool.filter((m) => !m.voted);
  const from = fresh.length >= 2 ? fresh : pool;
  const n = from.length;
  const i = Math.min(n - 1, Math.floor(rnd() * n));
  let j = Math.min(n - 2, Math.floor(rnd() * (n - 1)));
  if (j >= i) j++;
  let pair = [from[i], from[j]];
  if (last && pairKey(pair) === pairKey(last)) {
    const lastIds = new Set(last.map((m) => m.id));
    const other = from.find((m) => !lastIds.has(m.id)) || pool.find((m) => !lastIds.has(m.id));
    if (other) pair = [from[i], other];
  }
  return pair;
}

// The wall's order: most votes first, then newest.
export function wallOrder(maps) {
  return uniqueMaps(maps).filter((m) => !m.hidden).sort((a, b) =>
    (b.votes || 0) - (a.votes || 0) || String(b.created || '').localeCompare(String(a.created || '')));
}

// The top map is pinned biggest, the next two medium, the rest small.
export const pinSize = (rank) => (rank === 0 ? 'big' : rank < 3 ? 'mid' : 'small');
export const PIN_PX = { real: 300, big: 300, mid: 240, small: 170 };
// A small tilt that looks random but stays put between redraws.
export const pinTilt = (rank) => Math.round((((rank * 53) % 9) - 4) * 0.7 * 10) / 10;

// The id of the newest map, or null.
export function newestId(maps) {
  let best = null;
  for (const m of uniqueMaps(maps)) if (!best || String(m.created || '') > String(best.created || '')) best = m;
  return best ? best.id : null;
}

// "Seen the first-time note": one flag per browser. Storage can be missing
// or throw (private mode, blocked cookies); then it lasts for this page.
export const NOTE_KEY = 'askalocal.mapwall.note.v1';
let noteInMemory = false;
const defaultStore = () => globalThis.localStorage;

export function noteSeen(getStore = defaultStore) {
  if (noteInMemory) return true;
  try {
    return getStore()?.getItem(NOTE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function markNoteSeen(getStore = defaultStore) {
  noteInMemory = true;
  try {
    getStore()?.setItem(NOTE_KEY, '1');
  } catch (e) {
    // fine: remembered for this page
  }
}

// For the check only.
export function _forgetNoteForTest() {
  noteInMemory = false;
}
