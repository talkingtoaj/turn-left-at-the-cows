// Topic registry: things the player can ask people about.
//   id: used as the key in NPC `topics` and in state.knownTopics
//   label: how the topic shows in a menu ("Hartley Farm", "the radio mast")
//   kind: 'place' | 'town' | 'road' | 'water' | 'landmark' | 'crossing' | 'farm' | 'business'
//   fame: 0..1, how widely known it is (a future generator can use it to decide
//         who has heard of what; 1 = everyone knows it)
//   ref: what in WORLD it points at: { type, id } where type is one of
//        'place' | 'town' | 'road' | 'creek' | 'lake' | 'landmark' | 'bridge' |
//        'building' | 'offmap' (a place beyond the edge of the world)

export const TOPICS = [
  // Mission 1 country
  { id: 'hartley_farm', label: 'Hartley Farm', kind: 'farm', fame: 0.7, ref: { type: 'place', id: 'hartley_farm' } },
  { id: 'ashford', label: 'Ashford', kind: 'town', fame: 0.8, ref: { type: 'town', id: 'ashford' } },
  { id: 'millbrook', label: 'Millbrook', kind: 'town', fame: 0.9, ref: { type: 'town', id: 'millbrook' } },
  { id: 'creek_rd', label: 'Creek Road', kind: 'road', fame: 0.6, ref: { type: 'road', id: 'creek_rd' } },
  { id: 'hwy9', label: 'Highway 9', kind: 'road', fame: 0.95, ref: { type: 'road', id: 'hwy9' } },
  { id: 'mill_lane', label: 'Mill Lane', kind: 'road', fame: 0.3, ref: { type: 'road', id: 'mill_lane' } },
  { id: 'willow_creek', label: 'Willow Creek', kind: 'water', fame: 0.8, ref: { type: 'creek', id: 'willow' } },
  { id: 'old_bridge', label: 'the old bridge', kind: 'crossing', fame: 0.5, ref: { type: 'bridge', id: 'b_old' } },
  { id: 'radio_mast', label: 'the radio mast', kind: 'landmark', fame: 0.8, ref: { type: 'landmark', id: 'mast' } },
  { id: 'water_tower', label: 'the water tower', kind: 'landmark', fame: 0.7, ref: { type: 'landmark', id: 'tower' } },
  { id: 'old_mill', label: 'the old mill', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'mill' } },
  { id: 'church', label: "St. Anne's Church", kind: 'landmark', fame: 0.6, ref: { type: 'landmark', id: 'church' } },
  { id: 'heron_lake', label: 'Heron Lake', kind: 'water', fame: 0.5, ref: { type: 'lake', id: 'heron' } },

  // Mission 2 country
  { id: 'toms_cabin', label: "Tom's cabin", kind: 'place', fame: 0.2, ref: { type: 'place', id: 'toms_cabin' } },
  { id: 'loon_pond', label: 'Loon Pond', kind: 'water', fame: 0.6, ref: { type: 'lake', id: 'loon_pond' } },
  { id: 'ridge_rd', label: 'Ridge Road', kind: 'road', fame: 0.5, ref: { type: 'road', id: 'ridge_rd' } },
  { id: 'dunmore', label: 'Dunmore Corners', kind: 'town', fame: 0.4, ref: { type: 'town', id: 'dunmore' } },
  { id: 'covered_bridge', label: 'the covered bridge', kind: 'crossing', fame: 0.6, ref: { type: 'bridge', id: 'b_covered' } },
  { id: 'coldwater', label: 'the Coldwater River', kind: 'water', fame: 0.85, ref: { type: 'creek', id: 'coldwater' } },
  { id: 'quarry_rd', label: 'Quarry Road', kind: 'road', fame: 0.35, ref: { type: 'road', id: 'quarry_rd' } },
  { id: 'quarry', label: 'the quarry', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'quarry' } },
  { id: 'rt40', label: 'Route 40', kind: 'road', fame: 0.9, ref: { type: 'road', id: 'rt40' } },
  { id: 'calder', label: 'Calder', kind: 'town', fame: 0.85, ref: { type: 'town', id: 'calder' } },
  { id: 'diner', label: 'the diner', kind: 'business', fame: 0.6, ref: { type: 'building', id: 'c_diner' } },
  { id: 'schoolhouse', label: 'the schoolhouse', kind: 'landmark', fame: 0.3, ref: { type: 'building', id: 'c_diner' } },
  { id: 'grain_silos', label: 'the grain silos', kind: 'landmark', fame: 0.8, ref: { type: 'landmark', id: 'silos' } },
  { id: 'pond_rd', label: 'Pond Road', kind: 'road', fame: 0.5, ref: { type: 'road', id: 'pond_rd' } },
  { id: 'loon_brook', label: 'Loon Brook', kind: 'water', fame: 0.3, ref: { type: 'creek', id: 'loon_brook' } },
  { id: 'brook_ford', label: 'the ford on Pond Road', kind: 'crossing', fame: 0.3, ref: { type: 'bridge', id: 'f_brook' } },
  { id: 'campground', label: 'the campground', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'campground' } },
  { id: 'lookout', label: 'the fire lookout', kind: 'landmark', fame: 0.6, ref: { type: 'landmark', id: 'lookout' } },
  { id: 'lookout_rd', label: 'Lookout Road', kind: 'road', fame: 0.2, ref: { type: 'road', id: 'lookout_rd' } },
  { id: 'river_rd', label: 'Old River Road', kind: 'road', fame: 0.4, ref: { type: 'road', id: 'river_rd' } },
  { id: 'river_ford', label: 'the river ford', kind: 'crossing', fame: 0.3, ref: { type: 'bridge', id: 'f_river' } },
  { id: 'okafor_farm', label: 'the Okafor dairy', kind: 'farm', fame: 0.3, ref: { type: 'building', id: 'o_house' } },
  { id: 'pruitt_farm', label: 'the Pruitt farm', kind: 'farm', fame: 0.3, ref: { type: 'building', id: 'p_house' } },
  { id: 'brandt', label: 'Brandt', kind: 'town', fame: 0.7, ref: { type: 'offmap', id: 'brandt' } },

  // Places that changed: ruins and old things (landmarks in data.js).
  { id: 'voss_place', label: 'the old Voss place', kind: 'landmark', fame: 0.3, ref: { type: 'landmark', id: 'voss_place' } },
  { id: 'pruitt_truck', label: "Pruitt's old truck", kind: 'landmark', fame: 0.15, ref: { type: 'landmark', id: 'pruitt_truck' } },
  { id: 'railway_halt', label: 'the old railway halt', kind: 'landmark', fame: 0.35, ref: { type: 'landmark', id: 'old_railway' } },
  { id: 'ashford_elevator', label: 'the old grain elevator', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'ashford_elevator' } },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
