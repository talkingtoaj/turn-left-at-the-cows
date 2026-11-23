// Hand-placed props in Fenwick County (issue #23). Drawn by
// src3/world3d/dressing.js. `dressing` is not `props`: world.props is the
// countryside fill (bales, rocks). heading = way the front faces (deg).
// r = solid radius for the car (optional). Words are in lines/issue23.json.
export const PROPS_FENWICK = {
  dressing: [
    // Sheets on the line behind Miller's house, seen side-on from Main Street.
    { id: 'fen_clothesline', kind: 'clothesline', x: 632, y: 2497, heading: 90, length: 7 },
    // Big oak on Mill Lane (east side, 9 m off the road), tyre over the road side.
    { id: 'fen_tyre_swing', kind: 'tyre_swing', x: 1518, y: 1892, heading: 180, r: 1.0 },
    // The Hartley box (mb_hartley, from data.js) is painted as a cow.
    { id: 'fen_cow_mailbox', kind: 'cow_mailbox', mailbox: 'mb_hartley', x: 2650.36, y: 456.02, heading: 185 },
    // Two old round-top pumps in front of Earl's station, facing Main Street.
    { id: 'fen_round_pumps', kind: 'round_pumps', x: 696, y: 2433, heading: 270, r: 2.2 },
    // Painted ad on the west wall of Earl's shop.
    { id: 'fen_wall_ad', kind: 'wall_ad', building: 'a_gas', x: 715, y: 2435, lines: ["EARL'S", 'GAS  BAIT  COLD POP'] },
    // Corn stand on the west side of Pruitt Lane, 11 m south of the EGGS board (bd_eggs) at the gate.
    { id: 'fen_corn_stand', kind: 'corn_stand', x: 2959, y: 1121, heading: 90, r: 2.4, lines: ['FRESH CORN', '6 FOR $1  PAY IN THE BOX'] },
    // St. Anne's letter board, facing east towards town. Missions 1 and 2 play
    // here, so its front carries the start of the Luke 15 series that St.
    // Luke's finishes in mission 3 (#59, owner approved 2026-11-23).
    {
      id: 'fen_church_board', kind: 'church_board', x: 492, y: 2441, heading: 90, r: 1.8, lines: ["ST. ANNE'S", '', ''],
      missions: {
        m1_parcel: {
          front: ['HE LEAVES THE 99', 'TO FIND THE ONE'], // line id: T59-board-m1-front
          back: ['BEAN SUPPER SAT 6 PM', 'BRING A PIE'],
        },
        m2_cabin: {
          front: ['HE CAME TO FIND', 'THE LOST - LUKE 19'], // line id: T59-board-m2-front
          back: ['BEAN SUPPER SAT 6 PM', 'ALL WELCOME'],
        },
        m3_airfield: {
          front: ['BEAN SUPPER SAT 6 PM', 'ALL WELCOME'],
          back: ['BEAN SUPPER SAT 6 PM', 'BRING A PIE'],
        },
      },
    },
    // Rusted car in the weeds on the west side of Creek Road.
    { id: 'fen_junk_car', kind: 'junk_car', x: 606.6, y: 1949, heading: 20, r: 2.2 },
  ],
};
