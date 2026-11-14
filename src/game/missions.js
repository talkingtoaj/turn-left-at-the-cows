// Missions, in play order. Plain data plus small lookup helpers.
//
// Mission fields:
//   id, title, region: from ./missionList.js (light list, same order)
//   start: { x, y, heading } where the car starts when the mission is played
//     on its own (Continue or Replay on the start screen). Played straight
//     on from the mission before, it starts wherever that one ended.
//   giverNpcId: who hands out the job (null for the first mission)
//   brief: lines the giver says when the mission starts (shown by the HUD)
//   goalTopic: topic id for "where am I going" (always offered when talking)
//   startTopics: topic ids the player knows when the mission starts
//   goal: { x, y, r, name } arrival circle (resolved from WORLD.places)
//   waypoints: [{ id, x, y, r, label, snapshotLabel }] places that trigger a
//     snapshot of the player's sketch the first time the car enters them
//   arrivalLabel: snapshot label taken when the car reaches the goal
//   finalLabel: snapshot label taken when the player closes the win screen
//   arrival: { name, line } who you delivered to and the one line they say on the win screen
//   printedMaps: ids into WORLD.printedMaps the player has during this mission
//   approach: optional first leg in another region, driven before the
//     mission's own region: { region, start: { x, y, heading }, exit(x, y) }.
//     exit says when the car has left that region (the load screen then
//     builds the mission's region and puts the car at `start`). While on
//     the approach (state.leg === 'approach') the goal and waypoints wait.
//   No mission closes a road: the fixed fallen trees (src/world/fallenTrees.js)
//   always leave a way past, so they never change a route.

import { regionWorld } from '../world/world.js';
import { MISSION_LIST } from './missionList.js';

// Lookups into one region's built world. Each mission's details are made on
// first use (see MISSIONS below), so only the regions actually played get built.
const lookups = (W) => ({
  W,
  place(id) {
    const p = W.places.find((q) => q.id === id);
    return { x: p.x, y: p.y, r: p.r, name: p.name };
  },
  bridge: (id) => W.bridges.find((b) => b.id === id),
  town: (id) => W.towns.find((t) => t.id === id),
});

const DETAILS = {
  m1_parcel: ({ W, place, bridge }) => ({
    giverNpcId: null,
    start: { x: W.start.x, y: W.start.y, heading: W.start.heading },
    brief: [
      "There's a parcel for Hartley Farm on the seat beside you. No address, just the name.",
      // Line ids: brief-m1-map, brief-m1-ask
      "Darlene's county map is in the glovebox, with a pencil and a notepad. It's five years old, and plenty has shifted since.",
      "Things have shifted around here, so go by what you see. Earl at the gas station knows everybody. Go ask him.",
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
    // Arrival line (win screen). Line id: arrival-m1
    arrival: { name: 'Mrs Hartley', line: "Oh, you found us. Just leave it by the door, dear. The kettle's on, but I'll bring you a cup out here." },
    // Darlene's 1987 county map, full of gaps (see county1987 in src/world/data.js).
    // You also draw your own sketch. (Mission 2 has only Mrs Hartley's map.)
    printedMaps: ['county1987'],
  }),
  m2_cabin: ({ place, bridge, town }) => ({
    giverNpcId: 'hartley',
    // In Hartley Farm's lane, by Mrs Hartley, facing back towards Millbrook.
    start: { x: 2624, y: 476, heading: 236 },
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
    // Arrival line (win screen). Line id: arrival-m2
    arrival: { name: 'Tom Hartley', line: 'Ma sent the pie too? Good. I ran out of pills on Tuesday and ate the last of the beans on Thursday.' },
    // Only Mrs Hartley's own sketch: a few years out of date.
    printedMaps: ['hartley_sketch'],
  }),
  // Region 2 (Brandt). Tom is not a local you can talk to: his name is on the card.
  m3_airfield: ({ W, place, town }) => ({
    giverNpcId: null,
    giverName: 'Tom Hartley',
    // Route 40 at the county line, driving east from Fenwick County.
    start: { x: W.start.x, y: W.start.y, heading: W.start.heading },
    brief: [
      "Pills and a pie. Mum thinks of everything. Since you've got the car and I've got this knee, could you run one more errand?",
      "This magneto belongs to Ray Kessler. He flies out of a little grass airfield over Brandt way, east along Route 40. His plane won't start without it.",
      "I've only ever flown over the place, years ago, never driven there. Take Route 40 east out of Calder, over the county line, and ask in Brandt. And keep your ears open.",
    ],
    // You set off from Tom's cabin on Loon Pond and drive over the county
    // line on Route 40 (Fenwick's east edge is Harlan's west edge).
    approach: {
      region: 'fenwick',
      start: { x: 5828, y: 427, heading: 260 }, // on Pond Road by the cabin, facing out
      exit: (x, y) => x > 6470 && y > 1240 && y < 1360,
      crossing: 'Over the county line: Harlan County',
    },
    goalTopic: 'kestrel_field',
    startTopics: ['kestrel_field', 'brandt', 'rt40'],
    goal: place('kestrel_field'),
    waypoints: [
      {
        id: 'wp_brandt', x: town('brandt').x, y: town('brandt').y, r: 110,
        label: 'Brandt',
        snapshotLabel: 'Map on reaching Brandt',
      },
      {
        id: 'wp_field_lane_end', x: 2470, y: 935, r: 60,
        label: 'the end of Field Lane',
        snapshotLabel: "Map at the end of Field Lane (Peg's way)",
      },
    ],
    arrivalLabel: 'Map on arrival at Kestrel Field',
    finalLabel: 'Final map: Kestrel Field',
    // Arrival line (win screen). Line id: arrival-m3
    arrival: { name: 'Ray Kessler', line: "That's the magneto. Hold the prop for me, would you? No, I'm kidding." },
    printedMaps: [],
  }),
};

// Lists a mission's detail keys without building its region.
const PROBE = {
  W: { start: {} },
  place: () => ({}),
  bridge: () => ({}),
  town: () => ({}),
};

// MISSIONS[i] has the light fields (id, title, region) now and the rest
// (brief, goal, start, waypoints, ...) from DETAILS on first read, built
// against the mission's own region.
export const MISSIONS = MISSION_LIST.map((m) => {
  const make = DETAILS[m.id];
  if (!make) throw new Error(`mission ${m.id}: no details in missions.js`);
  const out = { ...m };
  let d = null;
  const details = () => (d ||= make(lookups(regionWorld(m.region))));
  for (const key of Object.keys(make(PROBE))) {
    Object.defineProperty(out, key, { enumerable: true, get: () => details()[key] });
  }
  return out;
});


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
