// AUTHORED data for region 2: Harlan County round Brandt, 22 km east of
// Calder along Route 40 (the road comes in at the west edge). Same format as
// ./data.js (see that file and DATA.md); built by ./build.js.
//
// Mission 3 (the airfield) is here. Kestrel Field, an old wartime grass
// strip, sits on flat land north of Route 40, east of Sandy Creek. No sign
// on the highway points to it. Its planes fly circuits whose downwind leg
// runs along Route 40 (src/world/airfield.js), so the planes and their drone
// are the clue: near, but never right over the field.
//
// Units, axes and headings as in ./data.js: metres, x east, y SOUTH,
// headings clockwise from north.

import { NPCS_BRANDT } from './npcs_brandt.js';

export const BRANDT_SOURCE = {
  size: { w: 4800, h: 3000 },
  seed: 2201,

  // Route 40 at the county line, driving east (keeping right).
  start: { x: 60, y: 1701.5, heading: 92 },

  places: [
    // The club's car park at the end of Pike Lane, by the clubhouse.
    { id: 'kestrel_field', name: 'Kestrel Field', x: 3320, y: 1042, r: 30 },
  ],

  towns: [
    { id: 'brandt', name: 'Brandt', kind: 'town', x: 1715, y: 1555, ambienceR: 230 },
    { id: 'oakham', name: 'Oakham', kind: 'hamlet', x: 3915, y: 2340, ambienceR: 120 },
  ],

  roads: [
    {
      id: 'rt40', name: 'Route 40', type: 'paved', width: 8,
      points: [[0, 1700], [400, 1690], [800, 1652], [1200, 1612], [1500, 1600], [1700, 1600], [1900, 1606],
        [2300, 1640], [2700, 1700], [3000, 1720], [3300, 1712], [3600, 1690], [3900, 1660], [4200, 1620],
        [4500, 1585], [4795, 1565]],
    },
    {
      id: 'station_rd', name: 'Station Road', type: 'paved', width: 8, curve: false, snapStart: 'rt40',
      points: [[1700, 1600], [1700, 1430]],
    },
    {
      id: 'north_rd', name: 'North Road', type: 'dirt', width: 6, snapStart: 'station_rd',
      points: [[1700, 1430], [1690, 1260], [1715, 1080], [1760, 950], [1830, 800], [1880, 640], [1868, 470], [1836, 405]],
    },
    // Peg's way to the airfield. A dead end at Dagny's since 1984.
    {
      id: 'field_lane', name: 'Field Lane', type: 'dirt', width: 5, snapStart: 'north_rd',
      points: [[1746, 990], [1950, 975], [2150, 952], [2350, 936], [2478, 930]],
    },
    // Hal Pike's lane: past his farm to the flying club's car park.
    {
      id: 'pike_ln', name: 'Pike Lane', type: 'dirt', width: 4.5, snapStart: 'rt40',
      points: [[3300, 1712], [3292, 1560], [3245, 1420], [3256, 1260], [3302, 1120], [3326, 1052]],
    },
    {
      id: 'oakham_rd', name: 'Oakham Road', type: 'dirt', width: 6, snapStart: 'rt40',
      points: [[3900, 1660], [3880, 1900], [3920, 2120], [3902, 2330], [3950, 2600], [4000, 2995]],
    },
    {
      id: 'south_rd', name: 'South Road', type: 'dirt', width: 5, snapStart: 'rt40', snapEnd: 'oakham_rd',
      points: [[1762, 1602], [1760, 1850], [1800, 2150], [2050, 2420], [2500, 2560], [3000, 2520], [3500, 2420], [3902, 2330]],
    },
  ],

  creeks: [
    {
      id: 'sandy', name: 'Sandy Creek', kind: 'creek', width: 12,
      points: [[2150, 0], [2200, 400], [2330, 800], [2380, 1100], [2420, 1400], [2480, 1700], [2520, 2100],
        [2600, 2600], [2650, 3000]],
    },
  ],

  lakes: [
    {
      id: 'mallard', name: 'Mallard Pond',
      polygon: [[3590, 2690], [3620, 2645], [3690, 2635], [3735, 2670], [3725, 2730], [3665, 2762], [3606, 2740]],
    },
  ],

  bridges: [
    { id: 'b_sandy', roadId: 'rt40', creekId: 'sandy', kind: 'bridge', length: 30, width: 11, intact: true },
    { id: 'b_south', roadId: 'south_rd', creekId: 'sandy', kind: 'bridge', length: 28, width: 8, intact: true },
    { id: 'f_sandy', roadId: 'field_lane', creekId: 'sandy', kind: 'ford', length: 22, width: 8, intact: true },
  ],

  // No hills near the airfield: the old army strip sits on the flat.
  hills: [
    { id: 'h_west', x: 700, y: 1330, r: 130, h: 22 },
    { id: 'h_brandt_n', x: 1450, y: 1150, r: 130, h: 24 },
    { id: 'h_sisters', x: 2060, y: 600, r: 140, h: 28 },
    { id: 'h_sw', x: 950, y: 2300, r: 150, h: 26 },
    { id: 'h_south', x: 2250, y: 2200, r: 150, h: 28 },
    { id: 'h_hob', x: 4350, y: 1330, r: 150, h: 32 },
    { id: 'h_oak', x: 4350, y: 2250, r: 140, h: 30 },
    { id: 'h_ne', x: 4200, y: 500, r: 160, h: 34 },
  ],

  outcrops: [
    { id: 'oc_sisters', name: 'the Three Sisters', x: 2060, y: 600 },
    { id: 'oc_hob', name: "Hob's Knob", x: 4350, y: 1330 },
    { id: 'oc_cradle', name: 'the Cradle Stones', x: 2250, y: 2200 },
  ],

  buildings: [
    // Brandt
    { id: 'br_gas', kind: 'gas', x: 1805, y: 1642, w: 22, h: 14, angle: 0 },
    { id: 'br_diner', kind: 'diner', x: 1622, y: 1640, w: 18, h: 11, angle: 0 },
    { id: 'br_store', kind: 'shop', x: 1765, y: 1568, w: 16, h: 12, angle: 0 },
    { id: 'br_h1', kind: 'house', x: 1672, y: 1532, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'br_h2', kind: 'house', x: 1730, y: 1522, w: 12, h: 11, angle: 0 },
    { id: 'br_h3', kind: 'house', x: 1670, y: 1472, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'br_h4', kind: 'house', x: 1733, y: 1466, w: 11, h: 12, angle: 0 },
    { id: 'br_h5', kind: 'house', x: 1575, y: 1572, w: 12, h: 12, angle: 0 },
    { id: 'br_h6', kind: 'house', x: 1862, y: 1575, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'br_h7', kind: 'house', x: 1545, y: 1636, w: 12, h: 11, angle: 0, chimney: true },
    // Dagny's farm at the end of Field Lane
    { id: 'dg_house', kind: 'farmhouse', x: 2502, y: 905, w: 14, h: 12, angle: 0, farm: 'dagny', chimney: true },
    { id: 'dg_barn', kind: 'barn', x: 2552, y: 892, w: 26, h: 16, angle: 0, farm: 'dagny' },
    // Hal Pike's farm on Pike Lane
    { id: 'pk_house', kind: 'farmhouse', x: 3205, y: 1408, w: 14, h: 12, angle: 0, farm: 'pike', chimney: true },
    { id: 'pk_barn', kind: 'barn', x: 3185, y: 1368, w: 24, h: 16, angle: 0, farm: 'pike' },
    // The Lindgren place at the top of North Road
    { id: 'lg_house', kind: 'farmhouse', x: 1818, y: 425, w: 14, h: 12, angle: 0, farm: 'lindgren', chimney: true },
    { id: 'lg_barn', kind: 'barn', x: 1790, y: 392, w: 24, h: 16, angle: 0, farm: 'lindgren' },
    // Oakham
    { id: 'oak_store', kind: 'store', x: 3940, y: 2318, w: 16, h: 11, angle: 0 },
    { id: 'oak_h1', kind: 'house', x: 3864, y: 2290, w: 12, h: 12, angle: 0, chimney: true },
    { id: 'oak_h2', kind: 'house', x: 3948, y: 2392, w: 12, h: 11, angle: 0 },
    { id: 'oak_h3', kind: 'house', x: 3866, y: 2402, w: 12, h: 12, angle: 0, chimney: true },
    // Kestrel Field (see the airfield landmark): two hangars facing the
    // runway and the clubhouse by the car park.
    { id: 'kf_hangar1', kind: 'hangar', x: 3370, y: 1006, w: 24, h: 18, angle: 0 },
    { id: 'kf_hangar2', kind: 'hangar', x: 3406, y: 1006, w: 24, h: 18, angle: 0 },
    { id: 'kf_club', kind: 'clubhouse', x: 3290, y: 1012, w: 14, h: 9, angle: 0 },
  ],

  landmarks: [
    { id: 'b_church', kind: 'church', name: "St. Luke's Church", x: 1602, y: 1515 },
    { id: 'br_elevator', kind: 'grain_elevator', name: 'Brandt co-op elevator', x: 1745, y: 1405, angle: 0, clearR: 18 },
    { id: 'oak_tower', kind: 'water_tower', name: 'Oakham water tower', x: 3990, y: 2262 },
    // The airfield: the runway centre, its axis (heading) and length. All
    // its parts are laid out by src/world/airfield.js from these. r: the
    // flat, open ground round it (no trees, fields or rough ground).
    {
      id: 'kestrel', kind: 'airfield', name: 'Kestrel Field', x: 3300, y: 930, angle: 90, r: 440, clearR: 450,
      printed: false,
      runway: { length: 800, width: 30 },
      // Circuits keep the noise off Brandt: downwind always south of the runway.
      circuit: { 90: 'right', 270: 'left', offset: 800 },
    },
    { id: 'wp_dagny', kind: 'windpump', name: 'Dagny windmill', x: 2596, y: 940, clearR: 6, printed: false },
    { id: 'wp_pike', kind: 'windpump', name: 'Pike windmill', x: 3150, y: 1440, clearR: 6, printed: false },
  ],

  forests: [
    { id: 'f_nw', polygon: [[100, 150], [900, 120], [1050, 500], [800, 900], [200, 850]], density: 0.0022 },
    { id: 'f_sw', polygon: [[300, 2200], [1200, 2150], [1400, 2700], [700, 2900], [250, 2800]], density: 0.0022 },
    { id: 'f_east', polygon: [[4250, 200], [4750, 250], [4750, 1100], [4450, 1150], [4220, 700]], density: 0.0018 },
    { id: 'f_creek', polygon: [[2150, 1900], [2450, 1850], [2560, 2300], [2300, 2390], [2150, 2200]], density: 0.002 },
    { id: 'f_north', polygon: [[2500, 80], [3300, 60], [3350, 300], [2900, 380], [2500, 300]], density: 0.0018 },
    // Roadside woods: North Road, Oakham Road, South Road and Route 40 run through these.
    { id: 'f_north_rd', polygon: [[1730, 470], [1915, 480], [1915, 820], [1740, 840]], density: 0.002 },
    { id: 'f_oakham_rd', polygon: [[3770, 1800], [4050, 1790], [4060, 2080], [3790, 2100]], density: 0.002 },
    { id: 'f_south_rd', polygon: [[1640, 1800], [1900, 1790], [1930, 2090], [1660, 2110]], density: 0.002 },
    { id: 'f_rt40_e', polygon: [[4250, 1470], [4640, 1445], [4650, 1680], [4260, 1710]], density: 0.002 },
    { id: 'f_rt40_w', polygon: [[880, 1540], [1150, 1515], [1160, 1730], [890, 1745]], density: 0.002 },
  ],

  fields: [
    { id: 'fd_dagny_cows', kind: 'pasture', farm: 'dagny', polygon: [[2380, 815], [2470, 815], [2470, 895], [2380, 895]], animals: { kind: 'cows', count: 8 } },
    // The barley a plane once put down in.
    { id: 'fd_dagny_barley', kind: 'crop', crop: 'wheat', farm: 'dagny', polygon: [[2615, 862], [2790, 862], [2790, 1000], [2615, 1000]], animals: null },
    { id: 'fd_pike', kind: 'pasture', farm: 'pike', polygon: [[3050, 1480], [3200, 1480], [3200, 1600], [3050, 1600]], animals: { kind: 'sheep', count: 18 } },
  ],

  signs: [
    { id: 's_county', roadId: 'rt40', near: [140, 1697], facing: 90, lines: ['HARLAN COUNTY'] },
    { id: 's_brandt_dist', roadId: 'rt40', near: [600, 1672], facing: 90, lines: ['Brandt 1 km', 'Corley 33 km'] },
    { id: 's_calder', roadId: 'rt40', near: [700, 1662], facing: 270, lines: ['Calder 24 km'] },
    { id: 's_brandt_w', roadId: 'rt40', near: [1400, 1603], facing: 90, lines: ['BRANDT', 'pop. 540'] },
    { id: 's_brandt_e', roadId: 'rt40', near: [2060, 1617], facing: 270, lines: ['BRANDT'] },
    { id: 's_south_rd', roadId: 'rt40', near: [1810, 1604], facing: 270, lines: ['← South Road', 'Oakham 4 km'] },
    { id: 's_station', roadId: 'station_rd', near: [1700, 1584], facing: 0, lines: ['↑ Station Road', 'North Road'] },
    { id: 's_field_lane', roadId: 'north_rd', near: [1736, 1012], facing: 0, lines: ['→ Field Lane', 'NO THROUGH ROAD'] },
    { id: 's_field_end', roadId: 'field_lane', near: [2440, 931], facing: 90, lines: ['PRIVATE', 'ROAD ENDS'] },
    { id: 's_ford', roadId: 'field_lane', near: [2300, 940], facing: 90, lines: ['FORD'] },
    { id: 's_sandy', roadId: 'rt40', near: [2420, 1659], facing: 90, lines: ['Sandy Creek'] },
    { id: 's_pike_w', roadId: 'rt40', near: [3262, 1713], facing: 90, lines: ['← Pike Lane'] },
    { id: 's_pike_e', roadId: 'rt40', near: [3342, 1710], facing: 270, lines: ['→ Pike Lane'] },
    { id: 's_oakham_w', roadId: 'rt40', near: [3862, 1665], facing: 90, lines: ['→ Oakham 1 km'] },
    { id: 's_oakham_e', roadId: 'rt40', near: [3945, 1655], facing: 270, lines: ['← Oakham 1 km'] },
    { id: 's_corley', roadId: 'rt40', near: [4400, 1597], facing: 90, lines: ['Corley 31 km'] },
    { id: 's_oakham', roadId: 'oakham_rd', near: [3905, 2200], facing: 180, lines: ['OAKHAM'] },
    // At the airfield gate: only readable once you are there.
    { id: 's_club', roadId: 'pike_ln', near: [3318, 1082], facing: 340, lines: ['KESTREL FIELD', 'Brandt Flying Club', 'BEWARE OF AIRCRAFT'] },
  ],

  mailboxes: [
    { id: 'mb_dagny', name: 'DAGNY', house: 'dg_house', roadId: 'field_lane' },
    { id: 'mb_pike', name: 'PIKE', house: 'pk_house', roadId: 'pike_ln' },
    { id: 'mb_lindgren', name: 'LINDGREN', house: 'lg_house', roadId: 'north_rd' },
    { id: 'mb_br1', name: 'OLSEN', house: 'br_h1', roadId: 'station_rd' },
    { id: 'mb_oak', name: 'AMES', house: 'oak_h1', roadId: 'oakham_rd' },
  ],

  locals: NPCS_BRANDT,

  ambient: {
    bellTower: 'b_church',
    birdPerches: 'trees',
    waterSounds: ['sandy'],
  },

  printedMaps: {
    harlan1979: {
      id: 'harlan1979',
      title: 'Harlan County Road Map, 1979',
      tabLabel: 'Old county map',
      style: 'print',
      bounds: { x: 0, y: 0, w: 4800, h: 3000 },
      include: 'all',
      lies: [
        // Field Lane still runs through to the old army strip (fenced off in 1984).
        { type: 'extend_road', roadId: 'field_lane', points: [[2700, 935], [2900, 960]] },
        // Pike Lane is left off. In 1979 it was only Hal Pike's private track
        // to his farm, which county maps never showed; Hal let the club have
        // the top of it after Field Lane was fenced off in 1984.
        { type: 'hide_road', roadId: 'pike_ln' },
      ],
      // Things that shifted since 1979 (shape owned by issue #32): seen within
      // r metres of `at`. Labels show on the win screen.
      shifts: [
        { id: 'field_lane_closed', label: "Field Lane fenced off at Dagny's", at: [2478, 930], r: 60 }, // line id: T33-shift-field
        { id: 'pike_lane_club', label: 'Pike Lane now runs on to the flying club', at: [3300, 1150], r: 70 }, // line id: T33-shift-pike
      ],
    },
  },
};
