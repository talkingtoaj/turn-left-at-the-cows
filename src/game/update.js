// Per-frame game rules, engine-free. The three.js main loop calls
// updateGame(state, dt) every frame while not paused.

import { MISSIONS, currentMission, nextMission } from './missions.js';
import { takeSnapshot, copySketch } from './snapshots.js';
import { getNpc } from './dialogue.js';
import { resetDamage } from './damage.js';
import { recordFinish } from './progress.js';

// Waypoint snapshots and goal arrival. Sets state.won on arrival. Arriving
// counts in the car or on foot (state.footPos, set while you walk).
export function updateGame(state, _dt) {
  const m = currentMission(state);
  if (!m) return;
  const at = state.footPos || state.car;
  const { x, y } = at;
  for (const wp of m.waypoints) {
    const key = `${m.id}:${wp.id}`;
    if (state.waypointsReached.has(key)) continue;
    if (Math.hypot(x - wp.x, y - wp.y) <= wp.r) {
      state.waypointsReached.add(key);
      takeSnapshot(state, wp.snapshotLabel, { kind: 'waypoint', waypointId: wp.id });
    }
  }
  if (!state.won && Math.hypot(x - m.goal.x, y - m.goal.y) <= m.goal.r) {
    takeSnapshot(state, m.arrivalLabel, { kind: 'arrival' });
    state.won = true;
    // Saved progress (src/game/progress.js): ticks it on the start screen.
    // The result (state.lastRecord) also says how often the car was towed.
    state.lastRecord = recordFinish(m.id, { elapsedMs: state.elapsedMs, odometer: state.odometer, tows: state.tows || 0 });
  }
}

// Starts mission `index`: grants its start topics, notes its brief (once,
// here), and asks the HUD to show the mission card (state.briefPending).
export function startMission(state, index) {
  const m = MISSIONS[index];
  if (!m) return null;
  state.missionIndex = index;
  state.won = false;
  // Each mission starts with a fresh car, and no tows yet (src/game/tow.js).
  state.missionStart = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  resetDamage(state);
  state.tows = 0;
  for (const t of m.startTopics) state.knownTopics.add(t);
  const giver = m.giverNpcId ? getNpc(m.giverNpcId) : null;
  for (const text of m.brief) {
    state.notebook.push({
      npcId: m.giverNpcId, name: giver ? giver.name : null, topicId: m.goalTopic, text,
      missionId: m.id, clockMinutes: state.clockMinutes, brief: true,
    });
  }
  state.briefPending = true; // every mission, mission 1 too, opens with its card
  return m;
}

// Call when the mission-complete screen is closed. Takes the final snapshot,
// archives the sketch, and moves on to the next mission (fresh blank sketch,
// trip meter and timer reset). Returns the new mission, or null if that was
// the last one (state.won then stays true).
export function finishMission(state) {
  const m = currentMission(state);
  if (!m || !state.won) return null;
  takeSnapshot(state, m.finalLabel, { kind: 'final' });
  state.sketchArchive.push({ missionId: m.id, sketch: copySketch(state.sketch) });
  const next = nextMission(state);
  if (!next) {
    state.allMissionsDone = true;
    return null;
  }
  // Clear the sketch in place (the map screens hold no copies, but keep the object).
  state.sketch.strokes = [];
  state.sketch.stamps = [];
  state.sketch.labels = [];
  state.sketchEpoch++;
  state.odometer = 0;
  state.elapsedMs = 0;
  state.talkedTo.clear();
  state.inputLocked = false;
  return startMission(state, state.missionIndex + 1);
}

// Plays mission `index` on its own (start screen: Continue or Replay): a
// clean slate (nothing heard, nothing drawn, trip meter and timer at zero),
// the car at the mission's own start, then startMission as usual.
export function jumpToMission(state, index) {
  const m = MISSIONS[index];
  if (!m) return null;
  state.knownTopics.clear();
  state.notebook.length = 0;
  state.talkedTo.clear();
  state.waypointsReached.clear();
  state.snapshots.length = 0;
  state.sketchArchive.length = 0;
  state.sketch.strokes = [];
  state.sketch.stamps = [];
  state.sketch.labels = [];
  state.sketchEpoch++;
  state.odometer = 0;
  state.elapsedMs = 0;
  state.allMissionsDone = false;
  state.inputLocked = false;
  Object.assign(state.car, m.start, { speed: 0 });
  return startMission(state, index);
}

// A breakdown no longer restarts the mission: the car is towed to the
// nearest town's garage and the trip goes on (src/game/tow.js, src3/tow3d.js).
