// The missions in play order, as light data only: id, title, region and the
// hour the clock starts at (startMinutes, SPEC 9o; src/game/clock.js), and
// optionally a scripted weather opening (opening, src/game/opening.js).
// No world data here, so the start screen can show the list (and progress)
// before the game and its world are loaded. src/game/missions.js adds the
// rest of each mission (brief, goal, waypoints) in the same order.

export const MISSION_LIST = [
  { id: 'm1_parcel', title: 'A Package for Hartley Farm', region: 'fenwick', startMinutes: 9 * 60, opening: 'clearing' }, // opens in rain that clears (src/game/opening.js)
  { id: 'm2_cabin', title: "Tom's Pills", region: 'fenwick', startMinutes: 16 * 60 },
  { id: 'm3_airfield', title: "A Part for Ray's Plane", region: 'brandt', startMinutes: 18 * 60 + 30 },
];

export function missionIndexById(id) {
  return MISSION_LIST.findIndex((m) => m.id === id);
}
