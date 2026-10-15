// Snapshots: frozen copies of the player's sketch at key moments.

import { currentMission } from './missions.js';

export function copySketch(sketch) {
  return JSON.parse(JSON.stringify(sketch));
}

// Saves a deep copy of state.sketch with a label. `extra` is merged in
// (e.g. { kind: 'waypoint', waypointId }). Returns the snapshot.
export function takeSnapshot(state, label, extra = {}) {
  const m = currentMission(state);
  const snap = {
    missionId: m ? m.id : null,
    label,
    sketch: copySketch(state.sketch),
    clockMinutes: state.clockMinutes,
    odometer: state.odometer,
    elapsedMs: state.elapsedMs,
    ...extra,
  };
  state.snapshots.push(snap);
  return snap;
}
