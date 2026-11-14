// A small cow herd at the corner of Route 40 and Pike Lane, on the left as you
// drive east, so Dagny's "turn left at the cows" (npcs_brandt.js) is true.
// Open ground beside the road, in view from the approach, nothing in front.
export const COWS_BRANDT = {
  fields: [
    { id: 'fd_pike_cows', kind: 'pasture', farm: 'pike', polygon: [[3175, 1606], [3262, 1606], [3262, 1688], [3175, 1688]], animals: { kind: 'cows', count: 7 } },
  ],
};
