// The Dolan farm lane: a farm lane off Highway 9 on the right as you drive north
// into Millbrook, about 190 m before the town. Built after 1987, so Darlene's
// old county map leaves it off (county1987 hides road 'dolan_ln' and building
// 'dl_house'/'dl_barn').
// It is mission 1's counting trap. The map shows Hartley Farm north-east of
// Millbrook with no road to it (Hartley Lane is also missing from the map), so a
// map reader looks for the first turning on the right that heads that way. This
// lane leaves on the same side, at nearly the same angle as the real turn
// (Hartley Lane, on the right at the Millbrook junction), and it is the first
// one met. It dead ends at a farmyard where the player can turn round.
// Its tells: a mailbox with a family name plate at the lane, a farmhouse at the
// end, and no centre line (it is a dirt lane).
export const LANE_FENWICK = {
  roads: [
    { id: 'dolan_ln', name: 'Dolan Lane', type: 'dirt', width: 4.5, snapStart: 'hwy9',
      points: [[2353, 883], [2400, 871], [2450, 858], [2495, 848]] },
  ],
  buildings: [
    { id: 'dl_house', kind: 'farmhouse', x: 2512, y: 836, w: 14, h: 12, angle: 0, farm: 'dolan', chimney: true },
    { id: 'dl_barn', kind: 'barn', x: 2536, y: 858, w: 22, h: 14, angle: 0, farm: 'dolan' },
  ],
  mailboxes: [
    { id: 'mb_dolan', name: 'DOLAN', house: 'dl_house', roadId: 'hwy9' },
  ],
};
