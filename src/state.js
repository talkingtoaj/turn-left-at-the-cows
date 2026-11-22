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
  nearLocalId: null, // id of the local you can talk to: on foot, within 3 m and facing them (round 12)
  nearRepair: null, // repair shop in reach while the car needs work (src/game/repair.js)
  nearSignId: null, // id of a sign being read: within 15 m and you face its front (learns the names on it)
  tourists: {}, // tourist local id -> { index, right } once answered (src/game/tourists.js), per mission
  talkedTo: new Set(), // ids of locals talked to this mission (cleared per mission)
  // On foot (round 12, src3/onfoot.js and src/game/onfoot.js).
  leg: null, // 'approach' while driving over from another region (missions.js)
  onFoot: false, // out of the car, walking
  footPos: null, // { x, y } where you stand while on foot (null in the car)
  lookYaw: null, // degrees, where you look on foot (the dash compass follows it)
  talkingTo: null, // id of the local in a conversation with you, or null
  nearLocalAny: null, // id of a local within 3 m on foot, facing them or not
  nearCar: false, // on foot and close enough to the car to get back in (F)
  lookAt: null, // { topicId, d, dir } the named thing in the middle of your view, on foot
  namesShown: false, // a conversation shows underlined names (for the tips)
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
  // sketch.base: printed map id the sketch is drawn on (missions with sketchOn), else none.
  sketchEpoch: 0, // bumped when the sketch is replaced by a fresh page (new mission)
  shiftsSeen: new Set(), // `${mapId}:${shiftId}` seen this mission run (src/game/shifts.js)
  snapshots: [], // [{ missionId, label, sketch, clockMinutes, odometer, elapsedMs, kind }]
  sketchArchive: [], // [{ missionId, sketch }] finished missions' sketches

  view: { northUp: true }, // map screen view options (for the map UI)
};

startMission(state, 0);
