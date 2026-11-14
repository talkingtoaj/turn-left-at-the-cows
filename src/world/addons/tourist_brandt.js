// The mission 3 tourist (issue 28): a plane spotter parked on Oakham Road,
// south of Route 40, binoculars round his neck, looking for Brandt's diner.
// He is a local flagged `tourist`, only in mission 3 (`onlyMission`), and so is
// his car. Words, replies and ticks: src/game/tourists.js. See tourist_fenwick.js.

export const TOURIST_BRANDT = {
  locals: [
    {
      id: 'tourist_spotter', name: 'The plane spotter', role: 'with binoculars', x: 3908.6, y: 2063.9,
      tourist: true, stay: true, onlyMission: 'm3_airfield',
      look: { shirt: 0x6b8f5a, hat: 0xd9c25a, legs: 0x7a6a4f }, carry: 'binoculars',
      greeting: [], topics: {},
    },
  ],
  landmarks: [
    { id: 'spotter_car', kind: 'parked_car', name: "The spotter's car", x: 3907, y: 2059.9, angle: 169, color: 0xb84a36, clearR: 4, printed: false, onlyMission: 'm3_airfield' },
  ],
};
