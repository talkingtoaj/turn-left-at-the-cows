// The missions in play order, as light data only: id, title and region.
// No world data here, so the start screen can show the list (and progress)
// before the game and its world are loaded. src/game/missions.js adds the
// rest of each mission (brief, goal, waypoints) in the same order.

export const MISSION_LIST = [
  { id: 'm1_parcel', title: 'A Parcel for Hartley Farm', region: 'fenwick' },
  { id: 'm2_cabin', title: "Tom's Pills", region: 'fenwick' },
];

export function missionIndexById(id) {
  return MISSION_LIST.findIndex((m) => m.id === id);
}
