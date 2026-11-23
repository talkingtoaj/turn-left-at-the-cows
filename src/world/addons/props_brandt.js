// Hand-placed props in Harlan County (issue #24). See props_fenwick.js.
// Kestrel Field's windsock already exists (airfield landmark, follows the wind).
export const PROPS_BRANDT = {
  dressing: [
    // OPEN neon on a pole by Route 40, in front of the diner.
    { id: 'hl_diner_open', kind: 'open_sign', x: 1606, y: 1612, heading: 90, r: 0.5 },
    // Orange and white checkered water tank near the Kestrel Field gate, east of Pike Lane.
    { id: 'hl_checker_tank', kind: 'checker_tank', x: 3346, y: 1110, heading: 0, r: 3.2 },
    // St. Luke's letter board by Route 40, facing the road (#59). The name on
    // top; under it each mission's own lines, front and back (owner approved
    // 2026-11-23; src/world/churchBoard.js picks them).
    {
      id: 'hl_church_board', kind: 'church_board', x: 1596, y: 1589, heading: 180, r: 1.8, lines: ["ST. LUKE'S", '', ''],
      missions: {
        m1_parcel: {
          front: ['HE LEAVES THE 99', 'TO FIND THE ONE'], // line id: T59-board-m1-front
          back: ['SUPPER SUN 5 PM', 'ALL WELCOME'], // line id: T59-board-m1-back
        },
        m2_cabin: {
          front: ['HE CAME TO FIND', 'THE LOST - LUKE 19'], // line id: T59-board-m2-front
          back: ['PRAYER MTG WED 7 PM', 'ALL WELCOME'], // line id: T59-board-m2-back
        },
        m3_airfield: {
          front: ['WHILE HE WAS FAR OFF', 'HIS FATHER RAN'], // line id: T59-board-m3-front
          back: ['HARVEST SUPPER SAT', 'BRING A DISH'], // line id: T59-board-m3-back
        },
      },
    },
  ],
};
