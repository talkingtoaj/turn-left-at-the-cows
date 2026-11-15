// AUTHORED world data. Do not import this directly in game code; import WORLD
// from ./world.js, which runs it through the build step (./build.js).
//
// Units: 1 unit = 1 metre. x grows east, y grows SOUTH (Phaser screen axes).
// North is -y. Headings/angles are degrees: 0 = north, 90 = east (clockwise).
// Polylines/polygons are arrays of [x, y].
//
// Roads and creeks list CONTROL POINTS. The build step turns them into smooth
// curves (centripetal Catmull-Rom, ~9 m pieces) that pass through every
// control point. Built roads keep these as `controlPoints`.
// `snapStart` / `snapEnd`: road id whose BUILT curve this end is moved onto
// (so junctions meet exactly). Roads are built in list order, so a road can
// only snap to roads listed above it.

import { NPCS } from './npcs.js';

export const WORLD_SOURCE = {
  size: { w: 6500, h: 3200 },
  seed: 1987,

  start: { x: 600, y: 2420, heading: 0 },

  // Named spots: mission goals and other places people talk about.
  // `r` is the arrival radius when used as a goal.
  places: [
    { id: 'hartley_farm', name: 'Hartley Farm', x: 2670, y: 445, r: 25 },
    { id: 'toms_cabin', name: "Tom Hartley's cabin", x: 5880, y: 415, r: 25 },
  ],

  // kind: 'town' | 'hamlet'. ambienceR: radius (m) of town sounds (later).
  towns: [
    { id: 'ashford', name: 'Ashford', kind: 'town', x: 600, y: 2420, ambienceR: 200 },
    { id: 'millbrook', name: 'Millbrook', kind: 'town', x: 2280, y: 690, ambienceR: 220 },
    { id: 'dunmore', name: 'Dunmore Corners', kind: 'hamlet', x: 3350, y: 285, ambienceR: 120 },
    { id: 'calder', name: 'Calder', kind: 'town', x: 4700, y: 1160, ambienceR: 230 },
  ],

  // type: 'paved' | 'dirt'. width in metres. curve: false keeps straight pieces.
  // fresh: true on a dirt lane built since 1987: new pale crushed-stone gravel.
  roads: [
    {
      id: 'hwy9', name: 'Highway 9', type: 'paved', width: 9,
      points: [[600, 2400], [1000, 2300], [1250, 2235], [1500, 2250], [2000, 2150], [2400, 2000], [2400, 1552],
        [2395, 1380], [2350, 1220], [2375, 1000], [2300, 700]],
    },
    {
      id: 'creek_rd', name: 'Creek Road', type: 'dirt', width: 6,
      points: [[600, 2400], [592, 2150], [620, 1900], [605, 1680], [640, 1450], [650, 1365], [680, 1250],
        [800, 1000], [1100, 850], [1350, 780], [1550, 830], [1800, 760], [2050, 715], [2300, 700]],
    },
    {
      id: 'mill_lane', name: 'Mill Lane', type: 'dirt', width: 5, snapStart: 'hwy9',
      points: [[1500, 2250], [1462, 2080], [1510, 1880], [1482, 1700], [1500, 1525]],
    },
    {
      id: 'ashford_st', name: 'Main Street', type: 'paved', width: 8, curve: false,
      points: [[600, 2400], [600, 2560]],
    },
    {
      id: 'millbrook_st', name: 'Church Street', type: 'paved', width: 8, curve: false,
      points: [[2150, 700], [2300, 700], [2300, 550]],
    },
    {
      id: 'farm_rd', name: 'Hartley Lane', type: 'dirt', width: 5,
      points: [[2300, 700], [2420, 640], [2500, 560], [2650, 460]],
    },
    // ----- Mission 2 country, east and north-east -----
    {
      id: 'rt40', name: 'Route 40', type: 'paved', width: 8, snapStart: 'hwy9',
      points: [[2392, 1420], [2650, 1370], [2950, 1300], [3300, 1285], [3650, 1220], [3950, 1195], [4100, 1185],
        [4255, 1180], [4400, 1172], [4520, 1168], [4700, 1160], [4880, 1170], [5050, 1190], [5350, 1260],
        [5700, 1300], [6100, 1285], [6495, 1300]],
    },
    {
      id: 'calder_st', name: 'Main Street', type: 'paved', width: 8, curve: false, snapStart: 'rt40',
      points: [[4683, 1162], [4686, 1250], [4688, 1330]],
    },
    {
      id: 'pond_rd', name: 'Pond Road', type: 'dirt', width: 5, snapStart: 'rt40',
      points: [[4720, 1161], [4700, 1020], [4730, 900], [4790, 800], [4880, 700], [5000, 620], [5200, 555],
        [5450, 500], [5700, 450], [5870, 420]],
    },
    {
      id: 'ridge_rd', name: 'Ridge Road', type: 'dirt', width: 6, snapEnd: 'pond_rd',
      points: [[2300, 550], [2400, 450], [2580, 315], [2800, 262], [3050, 250], [3350, 285], [3580, 300],
        [3790, 255], [3980, 320], [4100, 440], [4200, 482], [4290, 500], [4450, 525], [4650, 560], [4850, 600],
        [5000, 620]],
    },
    {
      id: 'lookout_rd', name: 'Lookout Road', type: 'dirt', width: 4.5, snapStart: 'pond_rd',
      points: [[5000, 620], [4990, 500], [5060, 400], [5150, 330]],
    },
    {
      id: 'quarry_rd', name: 'Quarry Road', type: 'dirt', width: 6, snapStart: 'ridge_rd', snapEnd: 'rt40',
      points: [[3350, 285], [3400, 450], [3520, 640], [3560, 800], [3540, 960], [3600, 1100], [3640, 1221]],
    },
    {
      id: 'pruitt_ln', name: 'Pruitt Lane', type: 'dirt', width: 4.5, snapStart: 'rt40', fresh: true,
      points: [[2980, 1297], [2990, 1180], [2960, 1062]],
    },
    {
      id: 'river_rd', name: 'Old River Road', type: 'dirt', width: 5, snapStart: 'hwy9', snapEnd: 'calder_st',
      points: [[2230, 2064], [2500, 2150], [2800, 2230], [3150, 2210], [3500, 2280], [3850, 2200], [4150, 2140],
        [4382, 2100], [4600, 2060], [4880, 1990], [4905, 1820], [4800, 1580], [4700, 1430], [4688, 1330]],
    },
  ],

  // Creeks and rivers block the car except on intact bridges and fords.
  // kind: 'creek' | 'river'. Also the water sound sources.
  creeks: [
    {
      id: 'willow', name: 'Willow Creek', kind: 'creek', width: 14,
      points: [[0, 1290], [300, 1345], [650, 1365], [900, 1430], [1150, 1390], [1500, 1470], [1800, 1540],
        [2100, 1500], [2400, 1555], [2750, 1590], [3050, 1500], [3400, 1560], [3800, 1660], [4150, 1640],
        [4392, 1610]],
    },
    {
      id: 'coldwater', name: 'Coldwater River', kind: 'river', width: 22,
      points: [[4060, 0], [4120, 250], [4200, 450], [4170, 650], [4230, 900], [4260, 1180], [4330, 1420],
        [4390, 1600], [4420, 1850], [4380, 2100], [4300, 2400], [4360, 2750], [4450, 3200]],
    },
    {
      id: 'loon_brook', name: 'Loon Brook', kind: 'creek', width: 9,
      points: [[5995, 515], [5900, 600], [5700, 640], [5500, 690], [5250, 760], [4950, 800], [4650, 770],
        [4400, 720], [4172, 668]],
    },
  ],

  // Lakes block the car.
  lakes: [
    {
      id: 'heron', name: 'Heron Lake',
      polygon: [[980, 1900], [1010, 1840], [1080, 1810], [1170, 1820], [1230, 1870], [1220, 1950], [1150, 1990], [1050, 1985], [995, 1950]],
    },
    {
      id: 'loon_pond', name: 'Loon Pond',
      polygon: [[5935, 400], [5960, 340], [6030, 315], [6110, 330], [6160, 380], [6165, 450], [6130, 510], [6060, 540], [5990, 525], [5945, 470]],
    },
  ],

  // Bridges and fords. Position and angle are COMPUTED by the build step
  // from where the built road crosses the built creek (`near` picks the
  // crossing if there are several). Bridge rect is centred on (x, y), long
  // axis along `angle`. kind: 'bridge' | 'covered' | 'ford'.
  // intact: false means unusable: car cannot cross.
  bridges: [
    { id: 'b_old', roadId: 'creek_rd', creekId: 'willow', kind: 'bridge', length: 32, width: 8, intact: false },
    { id: 'b_new', roadId: 'hwy9', creekId: 'willow', kind: 'bridge', length: 32, width: 11, intact: true },
    { id: 'b_rt40', roadId: 'rt40', creekId: 'coldwater', kind: 'bridge', length: 40, width: 11, intact: true },
    // Roof caved in under snow last February. Fenced off.
    { id: 'b_covered', roadId: 'ridge_rd', creekId: 'coldwater', kind: 'covered', length: 40, width: 8, intact: false },
    { id: 'f_brook', roadId: 'pond_rd', creekId: 'loon_brook', kind: 'ford', length: 22, width: 8, intact: true },
    { id: 'f_river', roadId: 'river_rd', creekId: 'coldwater', kind: 'ford', length: 34, width: 8, intact: true },
  ],

  // Gentle hills for the 3D terrain (roads stay flat). Placed inside road
  // bends so the roads look like they go around them. h in metres.
  hills: [
    { id: 'h_creek_bend', x: 900, y: 1170, r: 120, h: 22 },
    { id: 'h_creek_east', x: 1360, y: 950, r: 110, h: 24 },
    { id: 'h_hwy_west', x: 1250, y: 2420, r: 130, h: 20 },
    { id: 'h_hwy_corner', x: 2180, y: 1830, r: 150, h: 26 },
    { id: 'h_rt40_west', x: 2560, y: 1170, r: 120, h: 24 },
    { id: 'h_middle', x: 2050, y: 1000, r: 120, h: 20 },
    { id: 'h_ridge_west', x: 3070, y: 420, r: 110, h: 20 },
    { id: 'h_ridge_east', x: 3800, y: 420, r: 110, h: 24 },
    { id: 'h_pruitt', x: 3330, y: 1100, r: 130, h: 28 },
    { id: 'h_pond_rd', x: 4850, y: 980, r: 100, h: 20 },
    { id: 'h_calder_east', x: 5400, y: 1060, r: 140, h: 30 },
    { id: 'h_lookout', x: 5250, y: 225, r: 170, h: 45 },
    { id: 'h_river_rd_a', x: 2800, y: 2080, r: 110, h: 20 },
    { id: 'h_river_rd_b', x: 3500, y: 2120, r: 120, h: 22 },
  ],

  // Named rock outcrops: clusters of big rocks on hilltops, seen from the
  // roads, for directions ("turn off at the Grey Stones"). Spots picked from
  // tools/pick-outcrops.mjs (local tops of the 3D ground on open land, 70 to
  // 400 m off a road); the rocks themselves are seeded (src/world/scatter.js).
  // Their districts are always stony (src/world/districts.js).
  outcrops: [
    { id: 'oc_grey', name: 'the Gray Stones', x: 2540, y: 1160 },
    // Raven Crag sits on the road-facing brow of its hill, not the top: from
    // the road below (?spot=5366,1263,12) the top hid all but its stone tips.
    { id: 'oc_raven', name: 'Raven Rock', x: 5400, y: 1100 },
    { id: 'oc_oldmen', name: 'the Old Men', x: 3300, y: 1100 },
    { id: 'oc_teeth', name: "the Giant's Teeth", x: 3060, y: 420 },
    { id: 'oc_cairn', name: "Shepherd's Cairn", x: 3500, y: 2120 },
    { id: 'oc_whet', name: 'the Whetstones', x: 2780, y: 2080 },
    { id: 'oc_tinker', name: "Tinker's Rocks", x: 1420, y: 1360 },
    { id: 'oc_anvil', name: 'the Anvil', x: 560, y: 1460 },
    { id: 'oc_gallow', name: 'Gallow Rock', x: 1260, y: 2420 },
  ],

  // Rectangles centred on (x, y), rotated by angle. Solid.
  // kind: 'house' | 'shop' | 'gas' | 'barn' | 'farmhouse' | 'store' | 'diner' | 'cabin' | 'shed'
  // (unknown kinds render as houses for now). farm: groups farm buildings
  // (yard pad). chimney: true for houses with a chimney (smoke later).
  buildings: [
    // Ashford
    { id: 'a_h1', kind: 'house', x: 530, y: 2360, w: 14, h: 12, angle: 0, chimney: true },
    { id: 'a_h2', kind: 'house', x: 530, y: 2445, w: 12, h: 12, angle: 0 },
    { id: 'a_h3', kind: 'house', x: 560, y: 2500, w: 12, h: 14, angle: 0, chimney: true },
    { id: 'a_h4', kind: 'house', x: 650, y: 2470, w: 14, h: 12, angle: 0 },
    { id: 'a_h5', kind: 'house', x: 650, y: 2530, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'a_gas', kind: 'gas', x: 715, y: 2435, w: 22, h: 14, angle: 0 },
    // Millbrook
    { id: 'm_h1', kind: 'house', x: 2200, y: 672, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'm_h2', kind: 'house', x: 2250, y: 738, w: 14, h: 12, angle: 0 },
    { id: 'm_h3', kind: 'shop', x: 2340, y: 600, w: 16, h: 12, angle: 0 },
    { id: 'm_h4', kind: 'house', x: 2340, y: 750, w: 12, h: 12, angle: 0, chimney: true },
    // Hartley Farm
    { id: 'f_barn', kind: 'barn', x: 2705, y: 420, w: 26, h: 16, angle: 0, farm: 'hartley' },
    { id: 'f_house', kind: 'farmhouse', x: 2655, y: 405, w: 14, h: 12, angle: 0, farm: 'hartley', chimney: true },
    // Dunmore Corners
    { id: 'd_store', kind: 'store', x: 3380, y: 260, w: 16, h: 11, angle: 0 },
    { id: 'd_h1', kind: 'house', x: 3300, y: 252, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'd_h2', kind: 'house', x: 3290, y: 325, w: 12, h: 11, angle: 0 },
    { id: 'd_h3', kind: 'house', x: 3425, y: 335, w: 11, h: 12, angle: 0, chimney: true },
    // Quarry office
    { id: 'q_office', kind: 'shed', x: 3600, y: 740, w: 12, h: 8, angle: 0 },
    // Pruitt farm (off Route 40)
    { id: 'p_house', kind: 'farmhouse', x: 2935, y: 1040, w: 14, h: 12, angle: 0, farm: 'pruitt', chimney: true },
    { id: 'p_barn', kind: 'barn', x: 2995, y: 1030, w: 24, h: 16, angle: 0, farm: 'pruitt' },
    // Calder
    { id: 'c_diner', kind: 'diner', x: 4650, y: 1132, w: 18, h: 11, angle: 0 },
    { id: 'c_h1', kind: 'house', x: 4600, y: 1196, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'c_h2', kind: 'house', x: 4762, y: 1202, w: 12, h: 11, angle: 0 },
    { id: 'c_h3', kind: 'house', x: 4792, y: 1125, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'c_h4', kind: 'house', x: 4640, y: 1262, w: 12, h: 12, angle: 0 },
    { id: 'c_h5', kind: 'house', x: 4732, y: 1292, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'c_h6', kind: 'house', x: 4560, y: 1135, w: 12, h: 11, angle: 0 },
    { id: 'c_feed', kind: 'shop', x: 4835, y: 1202, w: 16, h: 12, angle: 0 },
    // Okafor dairy (Old River Road)
    { id: 'o_house', kind: 'farmhouse', x: 4915, y: 2032, w: 14, h: 12, angle: 0, farm: 'okafor', chimney: true },
    { id: 'o_barn', kind: 'barn', x: 4965, y: 1990, w: 26, h: 16, angle: 0, farm: 'okafor' },
    // Tom's cabin at Loon Pond
    { id: 't_cabin', kind: 'cabin', x: 5905, y: 398, w: 10, h: 8, angle: 0, chimney: true },
  ],

  // Distinct shapes the player can recognise. Solid unless noted.
  // kind: 'church' | 'water_tower' | 'mill_ruin' | 'radio_mast' (drawn now)
  //     | 'grain_silos' | 'lookout_tower' | 'covered_bridge' | 'quarry' | 'campground'
  //       (data only for now: no solids, not drawn yet).
  // clearR: radius kept free of trees.
  landmarks: [
    { id: 'church', kind: 'church', name: "St. Anne's Church", x: 470, y: 2440 },
    { id: 'tower', kind: 'water_tower', name: 'Water tower', x: 1530, y: 2300 },
    { id: 'mill', kind: 'mill_ruin', name: 'Old mill (burned down)', x: 1530, y: 1500 },
    { id: 'mast', kind: 'radio_mast', name: 'Radio mast', x: 1100, y: 560 },
    { id: 'silos', kind: 'grain_silos', name: 'Calder grain silos', x: 4960, y: 1110, clearR: 30 },
    { id: 'lookout', kind: 'lookout_tower', name: 'Fire lookout tower', x: 5250, y: 225, clearR: 25 },
    // Sits on bridge b_covered; x, y, angle are copied from the bridge by the build.
    { id: 'covered', kind: 'covered_bridge', name: 'Covered bridge', bridgeId: 'b_covered', x: 0, y: 0, clearR: 30 },
    { id: 'quarry', kind: 'quarry', name: 'Calder Stone Co. quarry', x: 3690, y: 770, r: 90, clearR: 100 },
    { id: 'campground', kind: 'campground', name: 'Loon Pond campground', x: 5470, y: 462, clearR: 45 },
    // Places that changed: ruins and old things locals can point you by
    // ("past the old Voss place"). printed: false keeps them off printed maps.
    // The Voss farm, empty since 1979; the quarry bought the land.
    { id: 'voss_place', kind: 'farm_ruin', name: 'the old Voss place', x: 3630, y: 1005, angle: 75, clearR: 32, printed: false },
    // Walt Pruitt's 1952 truck, left in the corner of the sheep field when the clutch went.
    { id: 'pruitt_truck', kind: 'rusty_truck', name: "Pruitt's old truck", x: 2923, y: 1177, angle: 32, clearR: 8, printed: false },
    // The branch line, closed 1959: a stretch of bank east of Highway 9 and
    // Gilmore Halt's platform (x, y is the platform). Rails lifted at the highway.
    {
      id: 'old_railway', kind: 'railway', name: 'Gilmore Siding', x: 2530, y: 1787.4, clearR: 12, printed: false,
      points: [[2445, 1790], [2600, 1795], [2800, 1805], [3000, 1822], [3160, 1846]],
    },
    // The old co-op elevator at the bottom of Ashford, empty since the railway closed.
    { id: 'ashford_elevator', kind: 'grain_elevator', name: 'Ashford grain elevator', x: 660, y: 2592, angle: 90, clearR: 18, printed: false },
    // Windpumps at the farms: tall, easy to take a bearing on.
    { id: 'wp_hartley', kind: 'windpump', name: 'Hartley windmill', x: 2747, y: 452, clearR: 6, printed: false },
    { id: 'wp_pruitt', kind: 'windpump', name: 'Pruitt windmill', x: 2900, y: 1064, clearR: 6, printed: false },
    { id: 'wp_okafor', kind: 'windpump', name: 'Okafor windmill', x: 5012, y: 2004, clearR: 6, printed: false },
  ],

  // Areas to scatter trees in. Keep trees at least 12 m from any road.
  forests: [
    { id: 'f_west', polygon: [[100, 1100], [500, 1050], [560, 800], [400, 500], [100, 600]], density: 0.0025 },
    { id: 'f_east', polygon: [[1700, 1650], [2250, 1650], [2300, 1950], [1800, 2050], [1650, 1900]], density: 0.0025 },
    { id: 'f_north', polygon: [[1300, 300], [1900, 250], [2000, 550], [1500, 650], [1250, 500]], density: 0.002 },
    { id: 'f_ridge', polygon: [[2900, 40], [3700, 60], [3750, 190], [3300, 200], [2950, 190]], density: 0.002 },
    { id: 'f_pond', polygon: [[5500, 150], [6400, 120], [6450, 700], [6150, 720], [5950, 640], [5700, 580], [5520, 400]], density: 0.0022 },
    { id: 'f_river_s', polygon: [[4000, 2300], [4250, 2250], [4300, 2700], [4150, 3100], [3950, 3000]], density: 0.002 },
    { id: 'f_calder_n', polygon: [[4300, 850], [4600, 820], [4620, 1050], [4320, 1080]], density: 0.002 },
    { id: 'f_far_east', polygon: [[5600, 720], [6300, 760], [6400, 1100], [5800, 1150], [5550, 950]], density: 0.0018 },
    { id: 'f_lookout', polygon: [[5130, 70], [5450, 60], [5480, 330], [5300, 380], [5200, 300]], density: 0.0016 },
  ],

  // Fenced fields and pastures. animals: what grazes there. The build fills in
  // missing fence ('wire'), rowAngle (long axis), windbreak and crop, and adds
  // procedural fields (src/world/fill.js) after these.
  fields: [
    { id: 'fd_hartley', kind: 'pasture', farm: 'hartley', polygon: [[2760, 390], [2900, 390], [2900, 520], [2760, 520]], animals: { kind: 'cows', count: 9 } },
    { id: 'fd_pruitt', kind: 'pasture', farm: 'pruitt', polygon: [[2860, 1080], [2935, 1080], [2935, 1190], [2860, 1190]], animals: { kind: 'sheep', count: 14 } },
    { id: 'fd_okafor', kind: 'pasture', farm: 'okafor', polygon: [[4950, 2050], [5150, 2050], [5150, 2200], [4950, 2200]], animals: { kind: 'cows', count: 16 } },
    { id: 'fd_okafor_hay', kind: 'crop', crop: 'hay', farm: 'okafor', polygon: [[5000, 1820], [5160, 1820], [5160, 1950], [5000, 1950]], animals: null },
  ],

  // Road signs, placed beside a road. Readable when the car is within ~25 m.
  // facing: heading (deg) of the car meant to read it, i.e. its direction of
  // travel. The board faces the opposite way, toward that oncoming car.
  // Position is computed by the build: nearest point on `roadId` to `near`,
  // then pushed out to the reader's `side` ('right' default, or 'left')
  // by half the road width plus `offset` (default 3 m).
  signs: [
    { id: 's_ashford', roadId: 'creek_rd', near: [600, 2370], facing: 180, lines: ['ASHFORD'] },
    { id: 's_junction', roadId: 'creek_rd', near: [600, 2385], facing: 0, offset: 16, lines: ['↑ Creek Road (unpaved)', '→ Hwy 9: Millbrook 3 km'] },
    { id: 's_mill_lane', roadId: 'mill_lane', near: [1495, 2232], facing: 0, lines: ['↑ Mill Lane', 'NO THROUGH ROAD'] },
    { id: 's_bridge_out', roadId: 'creek_rd', near: [632, 1480], facing: 0, lines: ['BRIDGE OUT', 'ROAD CLOSED'] },
    { id: 's_creek', roadId: 'hwy9', near: [2400, 1605], facing: 0, lines: ['Willow Creek'] },
    { id: 's_millbrook_hwy', roadId: 'hwy9', near: [2370, 1150], facing: 0, lines: ['MILLBROOK', 'pop. 412'] },
    { id: 's_millbrook_creek', roadId: 'creek_rd', near: [2140, 705], facing: 90, lines: ['MILLBROOK'] },
    { id: 's_farm', roadId: 'millbrook_st', near: [2300, 680], facing: 0, lines: ['→ Hartley Lane'] },
    // Mission 2 country
    { id: 's_ridge', roadId: 'millbrook_st', near: [2300, 575], facing: 0, lines: ['↑ Ridge Road', 'Dunmore 1 km'] },
    { id: 's_rt40', roadId: 'hwy9', near: [2396, 1460], facing: 0, lines: ['→ Route 40', 'Calder 2.5 km'] },
    { id: 's_rt40_south', roadId: 'hwy9', near: [2380, 1370], facing: 180, lines: ['← Route 40 East'] },
    { id: 's_dunmore_w', roadId: 'ridge_rd', near: [3230, 268], facing: 90, lines: ['DUNMORE CORNERS'] },
    { id: 's_dunmore_jct', roadId: 'ridge_rd', near: [3325, 283], facing: 90, lines: ['→ Quarry Road, Route 40', '↑ Ridge Road'] },
    { id: 's_dunmore_e', roadId: 'ridge_rd', near: [3470, 296], facing: 270, lines: ['DUNMORE CORNERS'] },
    { id: 's_covered_w', roadId: 'ridge_rd', near: [4080, 418], facing: 120, lines: ['BRIDGE CLOSED', 'NO VEHICLES'] },
    { id: 's_covered_e', roadId: 'ridge_rd', near: [4330, 506], facing: 280, lines: ['BRIDGE CLOSED'] },
    { id: 's_quarry', roadId: 'quarry_rd', near: [3530, 690], facing: 160, lines: ['Calder Stone Co.', 'TRUCKS TURNING'] },
    { id: 's_quarry_jct', roadId: 'quarry_rd', near: [3625, 1180], facing: 160, lines: ['← Calder', '→ Highway 9'] },
    { id: 's_calder_w', roadId: 'rt40', near: [4440, 1171], facing: 90, lines: ['CALDER', 'pop. 260'] },
    { id: 's_calder_e', roadId: 'rt40', near: [5000, 1184], facing: 270, lines: ['CALDER'] },
    { id: 's_pond_rd', roadId: 'rt40', near: [4690, 1161], facing: 90, offset: 12, lines: ['← Pond Road', 'Loon Pond 1.5 km'] },
    { id: 's_river_rd', roadId: 'calder_st', near: [4686, 1300], facing: 180, lines: ['↑ Old River Road', 'FORD'] },
    { id: 's_ford_brook', roadId: 'pond_rd', near: [4745, 870], facing: 20, lines: ['FORD', 'Water may be deep'] },
    { id: 's_pond_fork', roadId: 'pond_rd', near: [4940, 655], facing: 55, lines: ['← Ridge Road', '↖ Lookout Road', '→ Loon Pond'] },
    { id: 's_campground', roadId: 'pond_rd', near: [5400, 510], facing: 75, lines: ['LOON POND', 'Campground'] },
    { id: 's_lookout', roadId: 'lookout_rd', near: [4992, 560], facing: 0, lines: ['Fire Lookout', 'No Through Road'] },
    { id: 's_brandt', roadId: 'rt40', near: [5700, 1300], facing: 90, lines: ['Brandt 22 km'] },
    { id: 's_ford_river_w', roadId: 'river_rd', near: [4310, 2112], facing: 90, lines: ['FORD', 'Impassable in flood'] },
    { id: 's_ford_river_e', roadId: 'river_rd', near: [4460, 2086], facing: 270, lines: ['FORD'] },
    { id: 's_river_rd_w', roadId: 'hwy9', near: [2190, 2080], facing: 70, lines: ['→ Old River Road', 'unpaved'] },
  ],

  // Mailboxes beside the road at farms and houses. Placed by the build at the
  // roadside nearest `house`; `facing` (computed) points from the box to the road.
  // newer: true draws a bright new galvanized box on a metal post (built since 1987).
  mailboxes: [
    { id: 'mb_hartley', name: 'HARTLEY', house: 'f_house', roadId: 'farm_rd' },
    { id: 'mb_pruitt', name: 'PRUITT', house: 'p_house', roadId: 'pruitt_ln' },
    { id: 'mb_okafor', name: 'OKAFOR', house: 'o_house', roadId: 'river_rd' },
    { id: 'mb_tom', name: 'T. HARTLEY', house: 't_cabin', roadId: 'pond_rd' },
    { id: 'mb_a4', name: 'MILLER', house: 'a_h4', roadId: 'ashford_st' },
    { id: 'mb_m1', name: 'BAKER', house: 'm_h1', roadId: 'millbrook_st' },
    { id: 'mb_d1', name: 'LINDQVIST', house: 'd_h1', roadId: 'ridge_rd' },
    { id: 'mb_c5', name: 'ELLISON', house: 'c_h5', roadId: 'calder_st' },
  ],

  // People the player can talk to (within ~25 m, press E). See npcs.js.
  locals: NPCS,

  // Ambient sound/animation hooks (used later by other agents).
  ambient: {
    bellTower: 'church', // landmark id whose bell rings on the hour
    birdPerches: 'trees', // birds perch on scenery trees
    waterSounds: ['willow', 'coldwater', 'loon_brook'], // creek ids
  },

  // Printed maps the player can be handed. Missions list which ones they give.
  // style: 'print' (county map) | 'hand' (someone's sketch).
  // bounds: the part of the world the map covers.
  // include: which features are drawn ('all' or a list of ids per kind).
  // lies: distortions applied on top of the true world (see src/game/printedMaps.js).
  printedMaps: {
    county1987: {
      id: 'county1987',
      title: 'Fenwick County Road Map, 1987',
      tabLabel: "Darlene's map",
      style: 'print',
      bounds: { x: 0, y: 0, w: 3000, h: 3000 },
      include: 'all',
      lies: [
        // Shows the washed-out bridge as fine.
        { type: 'bridge_intact', bridgeId: 'b_old' },
        // Shows Mill Lane going on over Willow Creek to Creek Road, as it did
        // in 1987. It used to go through until the quarry bought the land past
        // the creek and closed it. The dead end has a gate (bd_mill_closed).
        {
          type: 'extra_road',
          road: { id: 'mill_lane_fake', name: 'Mill Lane', type: 'dirt', width: 5, snapEnd: 'creek_rd', points: [[1500, 1525], [1510, 1300], [1600, 1000], [1700, 800]] },
        },
        // Hartley Lane is the Hartleys' private farm lane. County maps never
        // showed it, so it is not a shift.
        { type: 'hide_road', roadId: 'farm_rd' },
        // Leaves out the roads and lanes built since 1987 (fresh gravel on the
        // lanes, a new mailbox at Dolan's).
        { type: 'hide_road', roadId: 'dolan_ln' },
        { type: 'hide_road', roadId: 'pruitt_ln' },
        // The quarry dates from 1962, but this haul road was built in 1989.
        { type: 'hide_road', roadId: 'quarry_rd' },
        { type: 'hide_building', id: 'dl_house' },
        { type: 'hide_building', id: 'dl_barn' },
        // Ridge Road was always there. In 1987 it had only a number; the
        // county named it later (the sign says Ridge Road, old-timers still
        // say County 12).
        { type: 'rename_road', roadId: 'ridge_rd', name: 'County Rd 12' }, // line id: T33-map-cr12
      ],
      // Things that shifted since 1987 (shape owned by issue #32): seen within
      // r metres of `at`. Labels show on the win screen.
      shifts: [
        { id: 'ridge_named', label: 'County Rd 12 is now Ridge Road', at: [2300, 570], r: 50 }, // line id: T33-shift-ridge
        { id: 'mill_lane_closed', label: 'Mill Lane closed at the creek', at: [1500, 1525], r: 50 }, // line id: T33-shift-mill
      ],
    },
    hartley_sketch: {
      id: 'hartley_sketch',
      title: 'Drawn by June Hartley',
      tabLabel: "Mrs Hartley's map",
      style: 'hand',
      author: 'hartley',
      bounds: { x: 2100, y: 60, w: 3600, h: 1000 },
      include: {
        roads: ['millbrook_st', 'farm_rd', 'ridge_rd', 'lookout_rd'],
        creeks: ['coldwater'],
        lakes: [],
        towns: ['millbrook', 'dunmore'],
        landmarks: ['covered'],
        places: ['hartley_farm'],
        bridges: ['b_covered'],
        buildings: [],
        forests: [],
      },
      lies: [
        // She draws Ridge Road as one long nearly straight line.
        { type: 'simplify_road', roadId: 'ridge_rd', keep: 5 },
        // She has not heard the covered bridge fell in.
        { type: 'bridge_intact', bridgeId: 'b_covered' },
        // She thinks Pond Road turns north (left) at the end of Ridge Road.
        // That is really Lookout Road, a dead end at the fire tower.
        { type: 'rename_road', roadId: 'lookout_rd', name: 'Pond Rd' },
        { type: 'extend_road', roadId: 'lookout_rd', points: [[5190, 230], [5210, 150]] },
        { type: 'extra_place', place: { id: 'cabin_guess', name: "Tom's cabin", symbol: 'x', x: 5215, y: 140 } },
        { type: 'extra_lake', lake: { id: 'pond_guess', name: 'Loon Pond', polygon: [[5250, 110], [5330, 90], [5400, 120], [5380, 180], [5290, 190]] } },
        { type: 'extra_landmark', landmark: { id: 'camp_guess', kind: 'campground', name: 'campground', x: 5110, y: 300 } },
        // Everything east of Millbrook is squashed: she thinks it is closer than it is.
        { type: 'scale', about: [2300, 600], sx: 0.8, sy: 0.9 },
      ],
      // Her handwriting on the sheet (world coords, before `scale`).
      notes: [
        { x: 2700, y: 160, text: 'Ridge Rd, all the way' },
        { x: 3350, y: 170, text: 'Gus (store)' },
        { x: 4200, y: 360, text: 'red bridge!' },
        { x: 4700, y: 330, text: 'turn LEFT' },
        { x: 2480, y: 520, text: 'us' },
      ],
    },
  },
};
