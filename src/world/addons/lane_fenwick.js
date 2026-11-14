// The Dolan farm lane: a farm lane off Highway 9 on the left as you drive north
// to Millbrook, built after 1987 so Darlene's old county map leaves it off
// (county1987 hides road 'dolan_ln' and building 'dl_house'/'dl_barn').
// It is mission 1's counting trap: the map's "first left" is really the second.
// Its tells: a mailbox with a family name plate at the lane, a farmhouse at the
// end, and no centre line (it is a dirt lane).
export const LANE_FENWICK = {
  roads: [
    { id: 'dolan_ln', name: 'Dolan Lane', type: 'dirt', width: 4.5, snapStart: 'hwy9',
      points: [[2364, 1100], [2330, 1095], [2285, 1086], [2240, 1082]] },
  ],
  buildings: [
    { id: 'dl_house', kind: 'farmhouse', x: 2226, y: 1070, w: 14, h: 12, angle: 0, farm: 'dolan', chimney: true },
    { id: 'dl_barn', kind: 'barn', x: 2186, y: 1085, w: 22, h: 14, angle: 0, farm: 'dolan' },
  ],
  mailboxes: [
    { id: 'mb_dolan', name: 'DOLAN', house: 'dl_house', roadId: 'hwy9' },
  ],
};
