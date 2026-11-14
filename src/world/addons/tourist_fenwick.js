// The mission 1 tourist (issue 27): a visitor from Miami at the top of Mill
// Lane, which has a NO THROUGH ROAD sign, so most drivers never see her.
// The person is a local flagged `tourist` that stands still and only exists
// in the mission named by `onlyMission`. Her words, replies and win-screen
// ticks are in src/game/tourists.js, keyed by the same mission id. Another
// mission's tourist is another entry here plus one in that table.
//
// The parked car is a 'parked_car' landmark (src3/world3d/ruins3d.js). It
// sits on the verge east of the lane, clear of the road (5 m wide).
//
// The mission 2 tourist (issue 28) is a lawyer on Dolan Lane, a farm drive
// just off Highway 9 south of Millbrook. Each car has `onlyMission`, so it is
// built only in its own mission (src/world/world.js worldKey).

export const TOURIST_FENWICK = {
  locals: [
    {
      id: 'tourist_miami', name: 'The tourist', role: 'visiting from Miami', x: 1485.4, y: 1677,
      tourist: true, stay: true, onlyMission: 'm1_parcel',
      look: { shirt: 0xf2605c, hat: 0xf3f0e4, legs: 0xd8cfae },
      greeting: [], topics: {},
    },
    {
      id: 'tourist_lawyer', name: 'The lawyer', role: 'looking for a farm', x: 2436.7, y: 857.8,
      tourist: true, stay: true, onlyMission: 'm2_cabin',
      look: { shirt: 0x262a36, hat: 0x17171c, legs: 0x262a36 }, carry: 'briefcase',
      greeting: [], topics: {},
    },
  ],
  landmarks: [
    { id: 'tourist_car', kind: 'parked_car', name: "The tourist's car", x: 1487.1, y: 1678, angle: 0, color: 0x2fa8a0, clearR: 4, printed: false, onlyMission: 'm1_parcel' },
    { id: 'lawyer_car', kind: 'parked_car', name: "The lawyer's car", x: 2432.4, y: 858, angle: 76, color: 0x30343d, rack: false, clearR: 4, printed: false, onlyMission: 'm2_cabin' },
  ],
};
