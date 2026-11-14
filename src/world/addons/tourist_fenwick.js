// The mission 1 tourist (issue 27): a visitor from Miami at the top of Mill
// Lane, which has a NO THROUGH ROAD sign, so most drivers never see her.
// The person is a local flagged `tourist` that stands still and only exists
// in the mission named by `onlyMission`. Her words, replies and win-screen
// ticks are in src/game/tourists.js, keyed by the same mission id. Another
// mission's tourist is another entry here plus one in that table.
//
// The parked car is a 'parked_car' landmark (src3/world3d/ruins3d.js). It
// sits on the verge east of the lane, clear of the road (5 m wide).

export const TOURIST_FENWICK = {
  locals: [
    {
      id: 'tourist_miami', name: 'The tourist', role: 'visiting from Miami', x: 1485.4, y: 1677,
      tourist: true, stay: true, onlyMission: 'm1_parcel',
      look: { shirt: 0xf2605c, hat: 0xf3f0e4, legs: 0xd8cfae },
      greeting: [], topics: {},
    },
  ],
  landmarks: [
    { id: 'tourist_car', kind: 'parked_car', name: "The tourist's car", x: 1487.1, y: 1678, angle: 0, color: 0x2fa8a0, clearR: 4, printed: false },
  ],
};
