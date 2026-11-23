// Hand-placed props in Harlan County (issue #24). See props_fenwick.js.
// Kestrel Field's windsock already exists (airfield landmark, follows the wind).
export const PROPS_BRANDT = {
  dressing: [
    // OPEN neon on a pole by Route 40, in front of the diner.
    { id: 'hl_diner_open', kind: 'open_sign', x: 1606, y: 1612, heading: 90, r: 0.5 },
    // Orange and white checkered water tank near the Kestrel Field gate, east of Pike Lane.
    { id: 'hl_checker_tank', kind: 'checker_tank', x: 3346, y: 1110, heading: 0, r: 3.2 },
    // St. Luke's letter board by Route 40, facing the road (#59). Only the
    // church's name for now: the notice lines wait for line review.
    { id: 'hl_church_board', kind: 'church_board', x: 1596, y: 1589, heading: 180, r: 1.8, lines: ["ST. LUKE'S", '', ''] },
  ],
};
