// Which words a church letter board shows on each face (#59). Pure: no three.js.
//
// A board in the dressing list (kind 'church_board') has `lines`: its first
// line is the church's name, always on top. It may also have `missions`:
//   { <mission id>: { front: [line, line], back: [line, line] } }
// The two faces differ. A mission not listed (or no mission at all) shows the
// name only, on both faces.

export function boardFaces(board, missionId) {
  const name = (board.lines && board.lines[0]) || '';
  const m = missionId && board.missions ? board.missions[missionId] : null;
  const face = (two) => [name, ...(two || ['', ''])];
  return { front: face(m && m.front), back: face(m && m.back) };
}
