// Per-frame game rules shared by both versions (Phaser DriveScene and the
// three.js main loop). Call updateGame(state, dt) every frame while not paused.

import { MISSIONS, currentMission, nextMission } from './missions.js';
import { takeSnapshot, copySketch } from './snapshots.js';
import { getNpc } from './dialogue.js';

// Waypoint snapshots and goal arrival. Sets state.won on arrival.
export function updateGame(state, _dt) {
  const m = currentMission(state);
  if (!m) return;
  const { x, y } = state.car;
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
  }
}

// Starts mission `index`: grants its start topics, notes its brief, and
// asks the HUD to show the brief (state.briefPending).
export function startMission(state, index) {
  const m = MISSIONS[index];
  if (!m) return null;
  state.missionIndex = index;
  state.won = false;
  for (const t of m.startTopics) state.knownTopics.add(t);
  const giver = m.giverNpcId ? getNpc(m.giverNpcId) : null;
  for (const text of m.brief) {
    state.notebook.push({
      npcId: m.giverNpcId, name: giver ? giver.name : null, topicId: m.goalTopic, text,
      missionId: m.id, clockMinutes: state.clockMinutes, brief: true,
    });
  }
  state.briefPending = index > 0; // mission 1 starts without a pop-up brief
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
