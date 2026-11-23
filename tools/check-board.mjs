// Church letter board (#59): boardFaces in src/world/churchBoard.js.
// - Each mission on St. Luke's board gets its own front and back lines, the
//   name always on top, and the two faces differ.
// - An unknown mission, or none, shows the name only on both faces.
// - Asked again with a different mission in between, the answer follows the
//   mission (no state kept between calls).

import { boardFaces } from '../src/world/churchBoard.js';
import { PROPS_BRANDT } from '../src/world/addons/props_brandt.js';
import { MISSION_LIST } from '../src/game/missionList.js';

let fails = 0;
const fail = (msg) => { fails++; console.log('FAIL', msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const board = PROPS_BRANDT.dressing.find((p) => p.id === 'hl_church_board');
if (!board) fail('no hl_church_board in props_brandt.js');
else {
  const seen = new Set();
  for (const m of MISSION_LIST) {
    const { front, back } = boardFaces(board, m.id);
    if (front[0] !== "ST. LUKE'S" || back[0] !== "ST. LUKE'S") fail(`${m.id}: name not on top`);
    if (front.length !== 3 || back.length !== 3) fail(`${m.id}: want 3 lines a face`);
    if (!front[1] || !back[1]) fail(`${m.id}: a face has no lines`);
    if (same(front, back)) fail(`${m.id}: front and back are the same`);
    if (!same(front.slice(1), board.missions[m.id].front) || !same(back.slice(1), board.missions[m.id].back)) fail(`${m.id}: lines differ from the data`);
    const key = JSON.stringify([front, back]);
    if (seen.has(key)) fail(`${m.id}: same lines as another mission`);
    seen.add(key);
  }
  // Exact approved text for mission 3, front.
  if (!same(boardFaces(board, 'm3_airfield').front, ["ST. LUKE'S", 'WHILE HE WAS FAR OFF', 'HIS FATHER RAN'])) fail('m3 front text');
  // Changing mission between calls.
  const a = boardFaces(board, 'm1_parcel');
  const b = boardFaces(board, 'm2_cabin');
  const a2 = boardFaces(board, 'm1_parcel');
  if (same(a, b) || !same(a, a2)) fail('answer does not follow the mission between calls');
  // Fallbacks: unknown mission, no mission.
  const nameOnly = { front: ["ST. LUKE'S", '', ''], back: ["ST. LUKE'S", '', ''] };
  for (const id of ['m9_nowhere', null, undefined]) {
    if (!same(boardFaces(board, id), nameOnly)) fail(`mission ${id}: want name only`);
  }
}
// A board with no missions list shows its name only.
if (!same(boardFaces({ lines: ['X'] }, 'm1_parcel'), { front: ['X', '', ''], back: ['X', '', ''] })) fail('board without missions');

if (fails) { console.log(`check-board: ${fails} failure(s)`); process.exit(1); }
console.log('check-board: ok');
