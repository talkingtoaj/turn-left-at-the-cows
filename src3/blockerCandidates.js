// Candidate road blockers for mission 2 (not in the mission yet: the user
// picks one). Preview each with three.html?blocker=cand1 (cand2, cand3):
// the blocker is placed and the car starts on the road 100 m before it.
// npm run check:blockers proves none of them can be driven round, and
// `-- --detour` measures the detour each one forces.
//
// def: a mission blocker def (src/game/missions.js); start: where the car
// starts for the preview ({ roadId, at, dir } along the road).

export const CANDIDATES = {
  // Route 40 bridge over the Coldwater, west of Calder. The river is the
  // wall; the only other way over is the Old River Road ford far south.
  cand1: {
    label: 'Route 40 bridge over the Coldwater',
    def: { id: 'cand1', roadId: 'rt40', at: 1880, tilt: 0 },
    start: { roadId: 'rt40', at: 1780, dir: 1 },
  },
  // Pond Road ford over Loon Brook, north of Calder. The brook is the wall;
  // the way round is cross-country east of Loon Pond.
  cand2: {
    label: 'Pond Road ford at Loon Brook',
    def: { id: 'cand2', roadId: 'pond_rd', at: 400, tilt: 0 },
    start: { roadId: 'pond_rd', at: 300, dir: 1 },
  },
  // Route 40 by Pruitt Lane, between fenced fields; a windthrow of brush
  // 20 m into the verges each side closes the gaps. The way round is up
  // Pruitt Lane and through the Pruitt farm fields.
  cand3: {
    label: 'Route 40 at Pruitt Lane',
    def: { id: 'cand3', roadId: 'rt40', at: 680, tilt: 0, reach: [20, 20] },
    start: { roadId: 'rt40', at: 580, dir: 1 },
  },
};
