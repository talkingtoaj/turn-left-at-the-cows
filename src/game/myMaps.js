// The player's own finished maps, one per mission (the latest finish), kept
// in localStorage so the start screen's "Maps" page can put yours beside
// other drivers'. Also remembers which shared map is yours for a mission.
// Engine-free; every storage call is wrapped (blocked storage just forgets).
//
//   rememberMyMap(missionId, sketch)      saves a copy (called on the win screen)
//   myMap(missionId)                      -> { sketch, savedAt, sharedId? } | null
//   markShared(missionId, sharedId)

const KEY = 'askalocal.mymaps.v1';

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function save(all) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

export function rememberMyMap(missionId, sketch) {
  if (!missionId || !sketch) return;
  const all = load();
  const old = all[missionId] || {};
  all[missionId] = { ...old, sketch: JSON.parse(JSON.stringify(sketch)), savedAt: new Date().toISOString() };
  if (!save(all)) {
    // Probably full: keep only this mission's map.
    save({ [missionId]: all[missionId] });
  }
}

export function myMap(missionId) {
  return load()[missionId] || null;
}

export function markShared(missionId, sharedId) {
  const all = load();
  if (!all[missionId]) return;
  all[missionId].sharedId = sharedId;
  save(all);
}
