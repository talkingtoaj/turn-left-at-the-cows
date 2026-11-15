// Things that shifted (SPEC 9p): real changes in the world since a printed
// map was printed. A printed map def lists them after its lies:
//
//   shifts: [{ id, label, at: [x, y], r }]
//
// label is the win-screen line, at is where it is (world metres, in the
// region the map belongs to), r how close (metres) the player must come, in
// the car or on foot, for it to count as seen. Only true changes count, not
// printing mistakes or bad directions, and pencil marks are not graded.
//
// Pure logic, no world or DOM imports, so tools/check-shifts.mjs can run it in
// node. Seen shifts are keys `${mapId}:${shiftId}` in a Set (state.shiftsSeen,
// emptied when a mission starts).

// The game's present day (SPEC 9o: July 1992).
export const PRESENT_YEAR = 1992;

export const shiftsOf = (def) => (def && Array.isArray(def.shifts) ? def.shifts : []);

export const shiftKey = (def, shift) => `${def.id}:${shift.id}`;

// Marks every shift of `defs` within its r of (x, y) as seen. Returns the
// keys newly seen this call.
export function noteShiftsSeen(seen, defs, x, y) {
  const added = [];
  for (const def of defs) {
    for (const s of shiftsOf(def)) {
      const key = shiftKey(def, s);
      if (seen.has(key)) continue;
      if (Math.hypot(x - s.at[0], y - s.at[1]) <= s.r) {
        seen.add(key);
        added.push(key);
      }
    }
  }
  return added;
}

// One map's shifts with whether each was seen, and the count.
export function shiftTally(def, seen) {
  const rows = shiftsOf(def).map((shift) => ({ shift, seen: seen.has(shiftKey(def, shift)) }));
  return { rows, seen: rows.filter((r) => r.seen).length, total: rows.length };
}

// The first of `defs` with shifts (the one the win screen compares), or null.
export const mapWithShifts = (defs) => defs.find((d) => shiftsOf(d).length > 0) || null;

// The owner's words. line id: T32-shift-count
export const shiftCountText = (seen, total) => `Things that shifted: ${seen} of ${total}`;

// The same sheet as it really is now: same area, print style and contents,
// no lies, titled for the present year.
export function realMapDef(def) {
  const title = /\b1[89]\d\d\b/.test(def.title)
    ? def.title.replace(/\b1[89]\d\d\b/, String(PRESENT_YEAR))
    : `${def.title}, ${PRESENT_YEAR}`;
  return { ...def, id: `${def.id}_now`, title, lies: [], notes: [] };
}
