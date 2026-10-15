import { WORLD } from './world/world.js';
import { startMission } from './game/update.js';

// Shared, mutable game state. All scenes import this one object.
export const state = {
  car: {
    x: WORLD.start.x,
    y: WORLD.start.y,
    heading: WORLD.start.heading, // degrees, 0 = north, 90 = east (clockwise)
    speed: 0, // metres per second, negative when reversing
  },
  odometer: 0, // metres driven this mission (absolute, includes reversing); reset per mission
  clockMinutes: 9 * 60, // in-game time of day, starts 09:00
  elapsedMs: 0, // real time since this mission started (for the timer); reset per mission

  inputLocked: false, // true while dialogue or map is open; Drive ignores input
  nearLocalId: null, // id of a local within talk range (25 m), set by Drive each frame
  nearSignId: null, // id of a sign within reading range (25 m), set by Drive each frame
  talkedTo: new Set(), // ids of locals talked to this mission (cleared per mission)
  won: false, // set by updateGame when the car reaches the current mission's goal

  // Missions (src/game/missions.js).
  missionIndex: 0, // index into MISSIONS
  waypointsReached: new Set(), // `${missionId}:${waypointId}` already snapshotted
  briefPending: false, // true when the HUD should show the new mission's brief
  allMissionsDone: false, // set by finishMission after the last mission

  // Dialogue (src/game/dialogue.js).
  knownTopics: new Set(), // topic ids the player can ask about
  notebook: [], // [{ npcId, name, topicId, text, missionId, clockMinutes, brief? }] everything heard

  // Player's own hand-drawn map. Owned by the map screens, persists between openings.
  sketch: {
    strokes: [], // [{ points: [[x,y],...], color, width }] in map-screen pixels
    stamps: [], // [{ kind, x, y }]
    labels: [], // [{ text, x, y }]
  },
  sketchEpoch: 0, // bumped when the sketch is replaced by a fresh page (new mission)
  snapshots: [], // [{ missionId, label, sketch, clockMinutes, odometer, elapsedMs, kind }]
  sketchArchive: [], // [{ missionId, sketch }] finished missions' sketches

  view: { northUp: true }, // map screen view options (for the map UI)
};

startMission(state, 0);
