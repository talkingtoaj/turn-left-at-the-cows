// Topic registry: things the player can ask people about.
//   id: used as the key in NPC `topics` and in state.knownTopics
//   label: how the topic shows in a menu ("Hartley Farm", "the radio mast")
//   kind: 'place' | 'town' | 'road' | 'water' | 'landmark' | 'crossing' | 'farm' | 'business'
//   fame: 0..1, how widely known it is (a future generator can use it to decide
//         who has heard of what; 1 = everyone knows it)
//   ref: what in WORLD it points at: { type, id } where type is one of
//        'place' | 'town' | 'road' | 'creek' | 'lake' | 'landmark' | 'bridge' |
//        'building' | 'outcrop' | 'offmap' (a place beyond the edge of the world)
//   aliases: other ways people say it in their lines ("the mast"). Round 12:
//        names in a local's lines are underlined and can be asked about
//        (src/game/dialogue.js topicMentions); the label without a leading
//        "the" and every alias count.

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
  { id: 'radio_mast', label: 'the radio mast', kind: 'landmark', fame: 0.8, ref: { type: 'landmark', id: 'mast' }, aliases: ['the mast'] },
  { id: 'water_tower', label: 'the water tower', kind: 'landmark', fame: 0.7, ref: { type: 'landmark', id: 'tower' } },
  { id: 'old_mill', label: 'the old mill', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'mill' }, aliases: ['the mill'] },
  { id: 'church', label: "St. Anne's Church", kind: 'landmark', fame: 0.6, ref: { type: 'landmark', id: 'church' }, aliases: ['the church'] },
  { id: 'heron_lake', label: 'Heron Lake', kind: 'water', fame: 0.5, ref: { type: 'lake', id: 'heron' } },

  // Mission 2 country
  { id: 'toms_cabin', label: "Tom's cabin", kind: 'place', fame: 0.2, ref: { type: 'place', id: 'toms_cabin' } },
  { id: 'loon_pond', label: 'Loon Pond', kind: 'water', fame: 0.6, ref: { type: 'lake', id: 'loon_pond' } },
  { id: 'ridge_rd', label: 'Ridge Road', kind: 'road', fame: 0.5, ref: { type: 'road', id: 'ridge_rd' } },
  { id: 'dunmore', label: 'Dunmore Corners', kind: 'town', fame: 0.4, ref: { type: 'town', id: 'dunmore' } },
  { id: 'covered_bridge', label: 'the covered bridge', kind: 'crossing', fame: 0.6, ref: { type: 'landmark', id: 'covered' } },
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
  { id: 'ashford_elevator', label: 'the old grain elevator', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'ashford_elevator' }, aliases: ['co-op elevator', 'the elevator'] },

  // Region 2, Brandt country (mission 3). 'brandt' above is this region's town.
  { id: 'kestrel_field', label: 'Kestrel Field', kind: 'place', fame: 0.4, ref: { type: 'landmark', id: 'kestrel' }, aliases: ['the flying club', 'the airfield', 'the strip'] },
  { id: 'planes', label: 'the planes', kind: 'landmark', fame: 0.8, ref: { type: 'landmark', id: 'kestrel' } },
  { id: 'windsock', label: 'the windsock', kind: 'landmark', fame: 0.3, ref: { type: 'landmark', id: 'kestrel' } },
  { id: 'wind', label: 'the wind', kind: 'landmark', fame: 0.9, ref: { type: 'landmark', id: 'kestrel' } },
  { id: 'ray', label: 'Ray Kessler', kind: 'business', fame: 0.5, ref: { type: 'place', id: 'kestrel_field' }, aliases: ['Ray'] },
  { id: 'station_rd', label: 'Station Road', kind: 'road', fame: 0.7, ref: { type: 'road', id: 'station_rd' } },
  { id: 'north_rd', label: 'North Road', kind: 'road', fame: 0.6, ref: { type: 'road', id: 'north_rd' } },
  { id: 'field_lane', label: 'Field Lane', kind: 'road', fame: 0.3, ref: { type: 'road', id: 'field_lane' } },
  { id: 'pike_lane', label: 'Pike Lane', kind: 'road', fame: 0.3, ref: { type: 'road', id: 'pike_ln' } },
  { id: 'hal_pike', label: 'Hal Pike', kind: 'farm', fame: 0.4, ref: { type: 'building', id: 'pk_house' }, aliases: ['Hal'] },
  { id: 'dagny_farm', label: "Dagny's farm", kind: 'farm', fame: 0.4, ref: { type: 'building', id: 'dg_house' }, aliases: ["Dagny's place"] },
  { id: 'brandt_elevator', label: 'the Brandt elevator', kind: 'landmark', fame: 0.8, ref: { type: 'landmark', id: 'br_elevator' }, aliases: ['co-op elevator', 'the elevator'] },
  { id: 'diner_b', label: 'the diner', kind: 'business', fame: 0.7, ref: { type: 'building', id: 'br_diner' } },
  { id: 'sandy_creek', label: 'Sandy Creek', kind: 'water', fame: 0.6, ref: { type: 'creek', id: 'sandy' } },
  { id: 'oakham', label: 'Oakham', kind: 'town', fame: 0.6, ref: { type: 'town', id: 'oakham' } },
  { id: 'oakham_rd', label: 'Oakham Road', kind: 'road', fame: 0.5, ref: { type: 'road', id: 'oakham_rd' } },
  { id: 'south_rd', label: 'South Road', kind: 'road', fame: 0.4, ref: { type: 'road', id: 'south_rd' } },
  { id: 'oakham_tower', label: 'the Oakham water tower', kind: 'landmark', fame: 0.5, ref: { type: 'landmark', id: 'oak_tower' }, aliases: ['the water tower'] },
  { id: 'mallard_pond', label: 'Mallard Pond', kind: 'water', fame: 0.4, ref: { type: 'lake', id: 'mallard' } },
  { id: 'corley', label: 'Corley', kind: 'town', fame: 0.7, ref: { type: 'offmap', id: 'corley' } },

  // Round 12: things you can see from far off and ask "What's that?" about
  // (src/game/lookables.js). Nobody has lines for them yet: a local who
  // knows the name (by fame) just says it.
  // Windpumps at the farms.
  { id: 'wp_hartley', label: 'the Hartley windpump', kind: 'landmark', fame: 0.45, ref: { type: 'landmark', id: 'wp_hartley' } },
  { id: 'wp_pruitt', label: 'the Pruitt windpump', kind: 'landmark', fame: 0.3, ref: { type: 'landmark', id: 'wp_pruitt' } },
  { id: 'wp_okafor', label: 'the Okafor windpump', kind: 'landmark', fame: 0.3, ref: { type: 'landmark', id: 'wp_okafor' } },
  { id: 'wp_dagny', label: "Dagny's windpump", kind: 'landmark', fame: 0.35, ref: { type: 'landmark', id: 'wp_dagny' } },
  { id: 'wp_pike', label: 'the Pike windpump', kind: 'landmark', fame: 0.35, ref: { type: 'landmark', id: 'wp_pike' } },
  // Named rock outcrops on the hilltops (world data `outcrops`).
  { id: 'oc_grey', label: 'the Grey Stones', kind: 'landmark', fame: 0.6, ref: { type: 'outcrop', id: 'oc_grey' } },
  { id: 'oc_raven', label: 'Raven Crag', kind: 'landmark', fame: 0.55, ref: { type: 'outcrop', id: 'oc_raven' } },
  { id: 'oc_oldmen', label: 'the Old Men', kind: 'landmark', fame: 0.5, ref: { type: 'outcrop', id: 'oc_oldmen' } },
  { id: 'oc_teeth', label: "the Giant's Teeth", kind: 'landmark', fame: 0.5, ref: { type: 'outcrop', id: 'oc_teeth' } },
  { id: 'oc_cairn', label: "Shepherd's Cairn", kind: 'landmark', fame: 0.4, ref: { type: 'outcrop', id: 'oc_cairn' } },
  { id: 'oc_whet', label: 'the Whetstones', kind: 'landmark', fame: 0.4, ref: { type: 'outcrop', id: 'oc_whet' } },
  { id: 'oc_tinker', label: "Tinker's Rocks", kind: 'landmark', fame: 0.45, ref: { type: 'outcrop', id: 'oc_tinker' } },
  { id: 'oc_anvil', label: 'the Anvil', kind: 'landmark', fame: 0.5, ref: { type: 'outcrop', id: 'oc_anvil' } },
  { id: 'oc_gallow', label: 'Gallow Crag', kind: 'landmark', fame: 0.55, ref: { type: 'outcrop', id: 'oc_gallow' } },
  { id: 'oc_sisters', label: 'the Three Sisters', kind: 'landmark', fame: 0.6, ref: { type: 'outcrop', id: 'oc_sisters' } },
  { id: 'oc_hob', label: "Hob's Knob", kind: 'landmark', fame: 0.45, ref: { type: 'outcrop', id: 'oc_hob' } },
  { id: 'oc_cradle', label: 'the Cradle Stones', kind: 'landmark', fame: 0.4, ref: { type: 'outcrop', id: 'oc_cradle' } },
  // The church in Brandt (Ashford's is 'church' above).
  { id: 'b_church', label: "St. Luke's Church", kind: 'landmark', fame: 0.7, ref: { type: 'landmark', id: 'b_church' }, aliases: ['the church'] },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
