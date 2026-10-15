// Missions, in play order. Plain data plus small lookup helpers.
//
// Mission fields:
//   id, title
//   giverNpcId: who hands out the job (null for the first mission)
//   brief: lines the giver says when the mission starts (shown by the HUD)
//   goalTopic: topic id for "where am I going" (always offered when talking)
//   startTopics: topic ids the player knows when the mission starts
//   goal: { x, y, r, name } arrival circle (resolved from WORLD.places)
//   waypoints: [{ id, x, y, r, label, snapshotLabel }] places that trigger a
//     snapshot of the player's sketch the first time the car enters them
//   arrivalLabel: snapshot label taken when the car reaches the goal
//   finalLabel: snapshot label taken when the player closes the win screen
//   printedMaps: ids into WORLD.printedMaps the player has during this mission

import { WORLD } from '../world/world.js';

const place = (id) => {
  const p = WORLD.places.find((q) => q.id === id);
  return { x: p.x, y: p.y, r: p.r, name: p.name };
};
const bridge = (id) => WORLD.bridges.find((b) => b.id === id);
const town = (id) => WORLD.towns.find((t) => t.id === id);

export const MISSIONS = [
  {
    id: 'm1_parcel',
    title: 'A Parcel for Hartley Farm',
    giverNpcId: null,
    brief: [
      "There's a parcel for Hartley Farm on the seat beside you. No address, just the name.",
      "The old county map is in the glovebox. Earl at the gas station knows everybody. Ask him.",
    ],
    goalTopic: 'hartley_farm',
    startTopics: ['hartley_farm'],
    goal: place('hartley_farm'),
    waypoints: [
      {
        id: 'wp_old_bridge', x: bridge('b_old').x, y: bridge('b_old').y, r: 50,
        label: 'the broken bridge',
        snapshotLabel: "Map drawn from Earl's directions (before the broken bridge)",
      },
    ],
    arrivalLabel: 'Map on arrival at Hartley Farm',
    finalLabel: 'Final map: Hartley Farm',
    printedMaps: ['county1987'],
  },
  {
    id: 'm2_cabin',
    title: "Tom's Pills",
    giverNpcId: 'hartley',
    brief: [
      "Thank you for bringing that parcel, dear. Now, could I trouble you for one more?",
      "My son Tom is up at his cabin on Loon Pond, and there's no phone up there. These are his pills, and a pie. He'll have run out by now.",
      "I've drawn you a little map. I haven't been up that way in a few years, mind. Ask me if you need the directions again.",
    ],
    goalTopic: 'toms_cabin',
    startTopics: ['toms_cabin', 'loon_pond'],
    goal: place('toms_cabin'),
    waypoints: [
      {
        id: 'wp_covered_bridge', x: bridge('b_covered').x, y: bridge('b_covered').y, r: 60,
        label: 'the covered bridge',
        snapshotLabel: "Map drawn from Mrs Hartley's directions (before the covered bridge)",
      },
      {
        id: 'wp_calder', x: town('calder').x, y: town('calder').y, r: 90,
        label: 'Calder',
        snapshotLabel: 'Map on reaching Calder',
      },
      {
        id: 'wp_lookout', x: 5150, y: 330, r: 40,
        label: 'the fire lookout',
        snapshotLabel: 'Map at the fire lookout (a wrong turn?)',
      },
    ],
    arrivalLabel: "Map on arrival at Tom's cabin",
    finalLabel: "Final map: Tom's cabin",
    printedMaps: ['hartley_sketch', 'county1987'],
  },
];


export function currentMission(state) {
  return MISSIONS[state.missionIndex] || null;
}

export function nextMission(state) {
  return MISSIONS[state.missionIndex + 1] || null;
}

// Goal of the current mission ({ x, y, r, name }), or null after the last one.
export function currentGoal(state) {
  const m = currentMission(state);
  return m ? m.goal : null;
}
