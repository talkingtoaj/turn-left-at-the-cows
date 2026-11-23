// Dev tool: screenshots of fixed review views in the 3D version, plus draw
// calls and triangles from ?stats. Needs a running dev server.
//
//   node tools/shots.mjs <url> <outDir> <prefix>
//   e.g. node tools/shots.mjs http://localhost:5199 /tmp/shots after
//
// Views place the car and, for most, pin the camera so before and after
// shots show exactly the same thing.

import fs from 'fs';
import path from 'path';
import { launchChromium } from './browser.mjs';

const [, , base = 'http://localhost:5199', outDir = '.', prefix = 'shot', only = ''] = process.argv; // only: comma list of view names

// cam: [x, up, y] relative to ground at (x, y), look: [x, up, y] likewise.
// car: { x, y, heading } or { road, at } (fraction along a road).
const VIEWS = [
  // Hartley Farm: the crop field north of the yard, close and wide.
  { name: 'hartley', car: { x: 2610, y: 490, heading: 0 }, cam: [2770, 2.5, 395], look: [2700, 0, 350] },
  { name: 'hartley_wide', car: { x: 2610, y: 490, heading: 0 }, cam: [2560, 40, 520], look: [2720, 0, 380] },
  { name: 'hartley_edge', car: { x: 2610, y: 490, heading: 0 }, cam: [2630, 1.8, 410], look: [2680, 3, 365] },
  { name: 'hartley_pasture', car: { x: 2745, y: 540, heading: 90 }, cam: [2752, 2.2, 532], look: [2830, 0, 440] },
  // Hartley cows, standing in the pasture among the herd (#37).
  // `cows: [dist, up]` aims the camera at the cow nearest the car from `dist` m away.
  { name: 'cows_close', car: { x: 2745, y: 540, heading: 90 }, cows: [7, 1.8] },
  { name: 'cows_herd', car: { x: 2745, y: 540, heading: 90 }, cows: [22, 7] },
  // Okafor's herd of 16: the cow nearest the car's west side, from 14 m.
  { name: 'cows_okafor', car: { x: 4935, y: 2125, heading: 0 }, cows: [14, 3] },
  { name: 'cows_okafor_low', car: { x: 4935, y: 2125, heading: 0 }, cows: [5, 1] },
  // Horses, sheep and deer (#80): close 3/4 from the car's side, straight onto
  // the flank, and from the driver's seat. `kind` picks the animal.
  { name: 'horse_close', car: { x: 2716, y: 1354, heading: 75 }, kind: 'horse', cows: [6, 1.8] },
  { name: 'horse_side', car: { x: 2716, y: 1354, heading: 75 }, kind: 'horse', cows: [6, 1.3], side: true },
  { name: 'horse_road', car: { x: 2716, y: 1354, heading: 75 }, kind: 'horse', cows: [0, 1.4], fromCar: true },
  { name: 'sheep_close', car: { x: 2978, y: 1121, heading: 270 }, kind: 'sheep', cows: [4, 1.3] },
  { name: 'sheep_side', car: { x: 2978, y: 1121, heading: 270 }, kind: 'sheep', cows: [4, 0.8], side: true },
  { name: 'sheep_road', car: { x: 2978, y: 1121, heading: 270 }, kind: 'sheep', cows: [0, 1.4], fromCar: true },
  { name: 'deer_close', car: { x: 4305, y: 1060, heading: 0 }, kind: 'deer', cows: [4.5, 1.5] },
  { name: 'deer_side', car: { x: 4305, y: 1060, heading: 0 }, kind: 'deer', cows: [4.5, 1.1], side: true },
  { name: 'deer_road', car: { x: 4305, y: 1060, heading: 0 }, kind: 'deer', cows: [0, 1.4], fromCar: true },
  // Steep pasture west of the farm: trough and feeder on the slope.
  { name: 'slope', car: { x: 2498, y: 564, heading: 0 }, cam: [2506, 1.6, 452], look: [2488, 0.3, 430] },
  { name: 'slope_wide', car: { x: 2498, y: 564, heading: 0 }, cam: [2530, 8, 480], look: [2480, 0, 420] },
  // Dirt roads with the car on them: chase view, and low beside the car.
  { name: 'dirtroad', car: { road: 'ridge_rd', at: 0.5 } },
  { name: 'dirtroad_low', car: { road: 'creek_rd', at: 0.3 }, rel: [-3.2, 0.9, 5] },
  // Paved roads: chase view and low beside the car (edge and centre lines).
  { name: 'paved', car: { road: 'hwy9', at: 0.4 } },
  // The car on the river ford (Old River Road): low from the side, and a chase view.
  { name: 'ford_side', car: { x: 4380, y: 2100, heading: 80 }, rel: [-6, 2.6, 0], relLook: [0, 0.2, 0] },
  { name: 'ford', car: { x: 4380, y: 2100, heading: 80 } },
  { name: 'paved_low', car: { road: 'rt40', at: 0.5 }, rel: [-3.2, 0.9, 5] },
  { name: 'dirtroad_ridge_low', car: { road: 'ridge_rd', at: 0.5 }, rel: [2.8, 0.8, 7.5] },
  // Houses (#76): Millbrook m_h1 (one floor, faces south), Calder c_h1 (two
  // floors, faces north), Dutch Ridge d_h3: close 3/4, straight on, and from
  // the road as the player first sees each. house_street: Calder's houses from above.
  { name: 'house_m1_close', car: { x: 2165, y: 701.5, heading: 90 }, cam: [2213, 2.2, 690], look: [2200, 2.4, 676] },
  { name: 'house_m1_front', car: { x: 2165, y: 701.5, heading: 90 }, cam: [2203.5, 1.7, 697], look: [2200, 2.8, 676] },
  { name: 'house_m1_road', car: { x: 2165, y: 701.5, heading: 90 }, cam: [2165, 1.3, 701.5], look: [2200, 3, 676] },
  { name: 'house_c1_close', car: { x: 4640, y: 1165, heading: 270 }, cam: [4588, 2.4, 1176], look: [4600, 3.2, 1192] },
  { name: 'house_c1_front', car: { x: 4640, y: 1165, heading: 270 }, cam: [4600, 1.8, 1170], look: [4600, 3.6, 1192] },
  { name: 'house_c1_road', car: { x: 4640, y: 1165, heading: 270 }, cam: [4640, 1.3, 1165], look: [4600, 3.5, 1192] },
  { name: 'house_d3_close', car: { x: 3395, y: 290.5, heading: 96 }, cam: [3436, 2.4, 316], look: [3425, 3, 331] },
  { name: 'house_d3_road', car: { x: 3395, y: 290.5, heading: 96 }, cam: [3395, 1.3, 290.5], look: [3425, 3.5, 331] },
  { name: 'house_street', car: { x: 4640, y: 1165, heading: 270 }, cam: [4690, 22, 1150], look: [4680, 0, 1215] },
  // Dutch Ridge d_h2: side gable, one floor, a shed hood over the stoop.
  { name: 'house_d2_close', car: { x: 3395, y: 290.5, heading: 96 }, cam: [3301, 2.2, 307], look: [3290, 2.4, 320] },
  // Calder c_h6: front gable, a porch with its own gable.
  { name: 'house_c6_close', car: { x: 4600, y: 1164, heading: 270 }, cam: [4572, 2.2, 1153], look: [4560, 2.6, 1140] },
  { name: 'house_c6_front', car: { x: 4600, y: 1164, heading: 270 }, cam: [4560, 1.7, 1157], look: [4560, 3.0, 1138] },
  { name: 'house_c6_road', car: { x: 4600, y: 1164, heading: 270 }, cam: [4600, 1.3, 1164], look: [4560, 3, 1140] },
  // The player's car up close (roof rack, parcels, mud flaps, dings): relLook
  // aims at a point on the car (local right, up, back) instead of ahead of it.
  { name: 'car_rear_high', car: { road: 'hwy9', at: 0.4 }, rel: [2.6, 2.7, 5.2], relLook: [0, 0.9, 0.3] },
  { name: 'car_side', car: { road: 'hwy9', at: 0.4 }, rel: [-4.6, 1.3, -0.6], relLook: [0, 0.8, 0.2] },
  { name: 'car_front_right', car: { road: 'hwy9', at: 0.4 }, rel: [3.4, 1.5, -3.6], relLook: [0, 0.8, -0.4] },
  { name: 'car_roof', car: { road: 'hwy9', at: 0.4 }, rel: [1.7, 2.5, 2.4], relLook: [0, 1.55, 0.45] },
  { name: 'car_trunk', car: { road: 'hwy9', at: 0.4 }, rel: [1.4, 1.5, 4.2], relLook: [0.3, 0.9, 1.8] },
  // Pruitt Lane (dirt) meeting Route 40: STOP sign, about 15 m and up high.
  { name: 'junction_stop', car: { x: 2965, y: 1100, heading: 180 }, cam: [2981.5, 1.4, 1276], look: [2978, 1.2, 1296] },
  { name: 'junction_wide', car: { x: 2965, y: 1100, heading: 180 }, cam: [3005, 14, 1265], look: [2978, 0, 1300] },
  // A wire fence by Hartley Farm, low along the posts (weeds at its foot).
  { name: 'fence_low', car: { x: 2610, y: 490, heading: 0 }, cam: [2617, 1.4, 556], look: [2628, 0.4, 578] },
  // Power poles (#61): Highway 9 pole with a transformer can, 3/4 close,
  // straight on to the crossarm (glass insulators), and from the road.
  { name: 'poles_close', car: { x: 1794.5, y: 2200.9, heading: 258 }, cam: [1762, 6.5, 2214], look: [1754.45, 7.2, 2219] },
  { name: 'poles_front', car: { x: 1794.5, y: 2200.9, heading: 258 }, cam: [1742.7, 7, 2221.5], look: [1754.45, 7.4, 2219] },
  { name: 'poles_top', car: { x: 1794.5, y: 2200.9, heading: 258 }, cam: [1757.8, 7.4, 2215.6], look: [1754.45, 7.2, 2219] },
  { name: 'poles_road', car: { x: 1794.5, y: 2200.9, heading: 258 }, rel: [0.6, 2.2, 5.5] },
  // Field gates (#61): the wooden gate in the rail fence south of Route 40,
  // 3/4, straight on and from the road; broken boards along the same fence;
  // the metal gate in Hartley's wire fence.
  { name: 'gate_close', car: { x: 3080, y: 1293.2, heading: 90 }, cam: [3120, 1.6, 1302], look: [3115.3, 0.9, 1307.5] },
  { name: 'gate_front', car: { x: 3080, y: 1293.2, heading: 90 }, cam: [3115.3, 1.4, 1300.5], look: [3115.3, 0.9, 1307.5] },
  { name: 'gate_road', car: { x: 3080, y: 1293.2, heading: 90 }, cam: [3080, 1.3, 1294], look: [3115, 0.8, 1307.5] },
  { name: 'fence_broken', car: { x: 3080, y: 1293.2, heading: 90 }, cam: [3064, 1.6, 1302], look: [3058, 0.7, 1309] },
  { name: 'gate_wire', car: { x: 2610, y: 490, heading: 0 }, cam: [2754, 1.6, 464], look: [2760, 0.9, 459.5] },
  { name: 'gate_wire_front', car: { x: 2610, y: 490, heading: 0 }, cam: [2753.5, 1.4, 459.5], look: [2760, 0.9, 459.5] },
  // Wildflowers and clover (#41): a damp bottom by Pond Road, a dry meadow by Farm Road.
  { name: 'flowers_damp', car: { x: 4912, y: 674, heading: 0 }, cam: [4907, 1.7, 677], look: [4885, 0, 668] },
  { name: 'flowers_dry', car: { x: 2598, y: 493, heading: 0 }, cam: [2603, 1.7, 497], look: [2628, 0, 490] },
  // Traffic (#40, #50): cars pinned on Highway 9 ahead of the player's car.
  // pin: [id, metres along the road from the car, lane side (1 = the car's
  // lane, -1 = the other), facing (1 = same way as the car, -1 = toward it)].
  // tcam: camera on the first pinned car, [right, up, back] in its frame,
  // looking at [right, up, back] on it.
  { name: 'traffic_close', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 20, 1, 1]], tcam: [[-4.6, 1.6, -6.4], [0, 0.7, 0]] },
  { name: 'traffic_close_rear', car: { road: 'hwy9', at: 0.4 }, pin: [['car3', 20, -1, -1]], tcam: [[-3.2, 1.7, 7.3], [0, 0.7, 0]] },
  { name: 'traffic_pickup', car: { road: 'hwy9', at: 0.4 }, pin: [['car8', 20, 1, 1]], tcam: [[5.5, 1.5, -5.8], [0, 0.8, 0.3]] },
  { name: 'traffic_pickup_side', car: { road: 'hwy9', at: 0.4 }, pin: [['car8', 20, 1, 1]], tcam: [[3.6, 1.1, -1.2], [0, 0.7, 0.2]] },
  { name: 'traffic_wagon', car: { road: 'hwy9', at: 0.4 }, pin: [['car1', 20, -1, -1]], tcam: [[5.2, 1.3, 6.0], [0, 0.7, 0]] },
  // Kits and dirt (#42, #43): the farm truck, three sedans side by side,
  // the two wagons and two pickups (no two of a type alike).
  { name: 'traffic_farmtruck', car: { road: 'hwy9', at: 0.4 }, pin: [['car5', 20, 1, 1]], tcam: [[4.8, 2.2, -6.0], [0, 1.0, 0.4]] },
  // Farm truck reshape (#55) and the surplus 6x6 (#45; car5 is the 6x6 with
  // SHOTS_QUERY=opening=off&sixbysix=on): side, rear, low front, and in a row.
  { name: 'traffic_farmtruck_side', car: { road: 'hwy9', at: 0.4 }, pin: [['car5', 20, 1, 1]], tcam: [[5.6, 1.4, -0.2], [0, 1.0, 0.2]] },
  { name: 'traffic_farmtruck_rear', car: { road: 'hwy9', at: 0.4 }, pin: [['car5', 20, 1, 1]], tcam: [[-3.4, 2.4, 7.2], [0, 1.0, 0.6]] },
  { name: 'traffic_farmtruck_front', car: { road: 'hwy9', at: 0.4 }, pin: [['car5', 20, 1, 1]], tcam: [[2.4, 1.0, -5.4], [0, 0.9, -1.4]] },
  { name: 'traffic_6x6_row', car: { road: 'hwy9', at: 0.4 }, pin: [['car2', 22, 1, 1], ['car5', 32, 1, 1], ['car3', 30, -1, -1], ['car1', 44, 1, 1]], tcam: [[6.5, 3.2, -24], [0, 0.9, -8]] },
  // The parked surplus 6x6 (#45) at Hartley's: 3/4 front close, and the yard.
  // Okafor's yard had one too until #71; its views stay to show it empty.
  { name: 'parked6x6_hartley', car: { x: 2610, y: 490, heading: 0 }, cam: [2710, 2.0, 443], look: [2700, 1.3, 434] },
  { name: 'parked6x6_hartley_yard', car: { x: 2610, y: 490, heading: 0 }, cam: [2684, 4.5, 458], look: [2705, 1.5, 428] },
  { name: 'parked6x6_okafor', car: { x: 4935, y: 2125, heading: 0 }, cam: [4940, 2.0, 2012], look: [4950, 1.3, 2003] },
  { name: 'parked6x6_okafor_yard', car: { x: 4935, y: 2125, heading: 0 }, cam: [4972, 4.5, 2026], look: [4955, 1.5, 1996] },
  // Okafor's yard from the car as the player drives up (no 6x6 parked there since #71).
  { name: 'parked6x6_okafor_road', car: { x: 4935, y: 2125, heading: 0 } },
  // Okafor's collie and its fence (#68). `dog: [s, v, toward]` holds the dog
  // s m along its run, galloping at v m/s (0: standing, facing toward [x, y];
  // 'rest': lying down).
  { name: 'dog_aerial', car: { x: 4870, y: 2020, heading: 0 }, cam: [4880, 90, 2080], look: [4905, 0, 2010] },
  { name: 'dog_close', car: { x: 4760, y: 2036, heading: 79 }, dog: [118, 0, [4899.4, 2005.8]], cam: [4900.7, 0.8, 2003.4], look: [4898.6, 0.4, 2003.7] },
  { name: 'dog_lying', car: { x: 4760, y: 2036, heading: 79 }, dog: [118, 'rest'], cam: [4901.0, 0.9, 2002.9], look: [4898.6, 0.3, 2003.7] },
  { name: 'dog_yard', car: { x: 4760, y: 2036, heading: 79 }, dog: [118, 0, [4893, 1999]], cam: [4897.7, 1.5, 1997.4], look: [4899.6, 0.4, 2004.4] },
  { name: 'dog_straight', car: { x: 4760, y: 2036, heading: 79 }, dog: [118, 0, [4889, 1993]], cam: [4888.3, 1.6, 1994.2], look: [4900, 0.7, 2005] },
  { name: 'dog_run', car: { x: 4760, y: 2036, heading: 79 }, dog: [60, 8.5], cam: [4852.8, 1.2, 2028.4], look: [4850.6, 0.4, 2035.9] },
  { name: 'dog_run_side', car: { x: 4760, y: 2036, heading: 79 }, dog: [60, 8.5], cam: [4852.2, 0.7, 2039.8], look: [4850.6, 0.35, 2035.9] },
  { name: 'dog_road', car: { x: 4790, y: 2031, heading: 77 }, dog: [70, -8.5] },
  { name: 'traffic_sedans', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 16, 1, 1], ['car4', 24, 1, 1], ['car9', 32, 1, 1]], tcam: [[6, 2.6, -22], [0, 0.8, -8]] },
  { name: 'traffic_pairs', car: { road: 'hwy9', at: 0.4 }, pin: [['car1', 16, 1, 1], ['car6', 23, 1, 1], ['car2', 30, 1, 1], ['car8', 37, 1, 1]], tcam: [[6, 3.0, -27], [0, 0.8, -10]] },
  { name: 'traffic_kit_close', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], tcam: [[4.6, 2.6, -4.6], [0, 1.0, 0.6]] },
  // The same three sedans, the near one after a long dirt road (#43).
  { name: 'traffic_sedans_dirty', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 16, 1, 1], ['car4', 24, 1, 1], ['car9', 32, 1, 1]], dirt: [['car0', 0.8], ['car4', 0.45]], tcam: [[6, 2.6, -22], [0, 0.8, -8]] },
  // The boxy old 4x4 (#44, car4): front three-quarter, side, rear (spare on
  // the door), and in a row with other traffic seen from the player's car.
  { name: 'traffic_4x4', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 20, 1, 1]], tcam: [[4.4, 1.7, -5.6], [0, 1.0, 0]] },
  { name: 'traffic_4x4_side', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 20, 1, 1]], tcam: [[5.6, 1.3, -0.2], [0, 1.0, 0]] },
  { name: 'traffic_4x4_rear', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 20, 1, 1]], tcam: [[3.4, 1.9, 6.0], [0, 1.0, 0]] },
  { name: 'traffic_4x4_row', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 26, -1, -1], ['car2', 34, 1, 1], ['car1', 44, -1, -1], ['car6', 54, 1, 1]], rel: [0.6, 2.2, 5.5] },
  // Panel van (#46): car6, front 3/4, right side (sliding door), rear doors.
  { name: 'traffic_van', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], tcam: [[4.4, 1.8, -5.4], [0, 1.0, 0.3]] },
  { name: 'traffic_van_side', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], tcam: [[5.8, 1.5, 0.4], [0, 1.0, 0.4]] },
  // The van's other looks: a stripe and a ladder; a lower tone, flaps and nothing on the roof.
  { name: 'traffic_van_stripe', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], kit: [['car6', ['stripe', 'ladder']]], tcam: [[4.4, 1.8, -5.4], [0, 1.0, 0.3]] },
  { name: 'traffic_van_plain', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], kit: [['car6', ['lowerTone', 'flaps']]], tcam: [[5.8, 1.5, 0.4], [0, 1.0, 0.4]] },
  { name: 'traffic_van_rear', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 20, 1, 1]], tcam: [[-3.4, 2.0, 6.4], [0, 1.1, 0.6]] },
  { name: 'traffic_row', car: { road: 'hwy9', at: 0.4 }, pin: [['car1', 30, -1, -1], ['car2', 38, 1, 1], ['car3', 46, -1, -1], ['car5', 54, 1, 1], ['car6', 62, -1, -1], ['car8', 70, 1, 1]], rel: [0.6, 2.2, 5.5] },
  // One car each side of the 40 m switch, same camera: no pop between them.
  { name: 'traffic_switch_in', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 37, -1, -1]], rel: [1.2, 2.4, -3], relLook: [-2.4, 0.6, -40] },
  { name: 'traffic_switch_mid', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 40, -1, -1]], rel: [1.2, 2.4, -3], relLook: [-2.4, 0.6, -40] },
  // Locals (#56). `person: [id, dist, up, side]` puts the car 9 m from that
  // local and the camera `dist` m from them at `up` m, on the car's side
  // (side 0) or turned `side` degrees round them. `lineup` stands those
  // locals in a row 1.3 m apart where the first one stands, facing the car.
  { name: 'people_close', person: ['mabel', 3, 1.6, 0] },
  { name: 'people_side', person: ['mabel', 3.4, 1.3, 90] },
  { name: 'people_farmer', person: ['hartley', 3, 1.6, 0] },
  { name: 'people_foreman', person: ['marisol', 3, 1.6, 0] },
  { name: 'people_waitress', person: ['bev', 3, 1.6, 20] },
  { name: 'people_fisher', person: ['dot', 4.5, 1.7, 40] },
  // Dot fishing off the broken end of the Creek Road bridge (#64): close 3/4
  // from the south stub, straight on from the north stub across the gap, and
  // from Creek Road as the player drives up.
  { name: 'dot_close', car: { x: 644.39, y: 1396.5, heading: 10 }, cam: [652.18, 2.2, 1373.31], look: [646.33, 0.5, 1370.19] },
  { name: 'dot_front', car: { x: 644.39, y: 1396.5, heading: 10 }, cam: [647.9, 2.2, 1363.1], look: [646.33, 1.3, 1370.19] },
  { name: 'dot_road', car: { x: 644.39, y: 1396.5, heading: 10 }, rel: [0.6, 2.4, 6], relLook: [-1.8, 0.6, -26] },
  // Mid-conversation: hands moving (talk: that local's id).
  { name: 'people_talk', person: ['mabel', 2.6, 1.6, 25], talk: 'mabel' },
  { name: 'people_lineup', person: ['mabel', 7, 1.5, 0], lineup: ['mabel', 'hartley', 'marisol', 'bev', 'earl', 'gus'] },
  { name: 'people_wide', person: ['mabel', 16, 3.5, 0], lineup: ['mabel', 'hartley', 'frank'] },
  { name: 'traffic_switch_out', car: { road: 'hwy9', at: 0.4 }, pin: [['car0', 43, -1, -1]], rel: [1.2, 2.4, -3], relLook: [-2.4, 0.6, -40] },
  // Far stand-ins (#62): the van (car6) and the 4x4 (car4) pinned past 140 m,
  // shot up close. The stand-in is picked by distance to the camera focus,
  // 35 m ahead of the player's car, so 190 m along is 155 m from it.
  // _in: the same camera with the car at 170 m (135 m: coarse body) to compare.
  { name: 'far_van', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 190, 1, 1]], tcam: [[4.4, 1.8, -5.4], [0, 1.0, 0.3]] },
  { name: 'far_van_in', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 170, 1, 1]], tcam: [[4.4, 1.8, -5.4], [0, 1.0, 0.3]] },
  { name: 'far_van_side', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 190, 1, 1]], tcam: [[5.8, 1.5, 0.4], [0, 1.0, 0.4]] },
  { name: 'far_4x4', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 190, 1, 1]], tcam: [[4.4, 1.7, -5.6], [0, 1.0, 0]] },
  { name: 'far_4x4_in', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 170, 1, 1]], tcam: [[4.4, 1.7, -5.6], [0, 1.0, 0]] },
  { name: 'far_4x4_rear', car: { road: 'hwy9', at: 0.4 }, pin: [['car4', 190, 1, 1]], tcam: [[3.4, 1.9, 6.0], [0, 1.0, 0]] },
  // From the road: a van, a 4x4 and a sedan up the highway, all past 140 m from the focus.
  { name: 'far_road', car: { road: 'hwy9', at: 0.4 }, pin: [['car6', 185, -1, -1], ['car4', 200, 1, 1], ['car0', 215, -1, -1]], rel: [0.4, 1.6, -1], relLook: [-0.6, 1.2, -160] },
  // Parked semis (#47). Calder grain silos (mission 1 region): close 3/4,
  // side, rear and the site. The Brandt co-op elevator ones (semib_*) need
  // SHOTS_QUERY='opening=off&spot=brandt' (Brandt region).
  { name: 'semi_close', car: { x: 4925, y: 1140, heading: 90 }, cam: [4968, 2.4, 1127.5], look: [4956, 1.8, 1119] },
  { name: 'semi_side', car: { x: 4925, y: 1140, heading: 90 }, cam: [4953, 1.9, 1134], look: [4953, 1.7, 1119] },
  { name: 'semi_rear', car: { x: 4925, y: 1140, heading: 90 }, cam: [4939, 2.2, 1127], look: [4952, 1.6, 1119] },
  { name: 'semi_site', car: { x: 4925, y: 1140, heading: 90 }, cam: [4992, 11, 1152], look: [4958, 5, 1112] },
  { name: 'semib_close', car: { x: 1700, y: 1440, heading: 0 }, cam: [1754, 2.4, 1416.5], look: [1745, 1.8, 1427] },
  { name: 'semib_side', car: { x: 1700, y: 1440, heading: 0 }, cam: [1760, 1.9, 1428], look: [1745, 1.7, 1428] },
  { name: 'semib_site', car: { x: 1700, y: 1440, heading: 0 }, cam: [1778, 13, 1462], look: [1745, 6, 1416] },
  // Semi cab shape (#72): close 3/4 of the cab and sleeper step, straight on
  // the nose, and the Calder semi from the road as the player drives up.
  { name: 'semi_cab', car: { x: 4925, y: 1140, heading: 90 }, cam: [4952.5, 3.3, 1124.5], look: [4956.5, 2.6, 1119] },
  { name: 'semi_front', car: { x: 4925, y: 1140, heading: 90 }, cam: [4969, 2.4, 1119.2], look: [4956, 2.2, 1119.2] },
  { name: 'semi_road', car: { x: 4925, y: 1140, heading: 90 }, cam: [4925, 1.4, 1140], look: [4955, 2.2, 1119] },
  // Gas stations (#58): Ashford (a_gas) and Brandt (br_gas, needs
  // SHOTS_QUERY='opening=off&spot=brandt'). Close 3/4, straight on, the shop
  // door, a pump island, from above, and from the road as you first see it.
  { name: 'gas_a_close', car: { x: 698, y: 2378, heading: 90 }, cam: [731, 2, 2420], look: [714, 1.5, 2433] },
  { name: 'gas_a_front', car: { x: 698, y: 2378, heading: 90 }, cam: [715, 2.2, 2408], look: [715, 2.5, 2435] },
  { name: 'gas_a_shop', car: { x: 698, y: 2378, heading: 90 }, cam: [714, 1.7, 2427], look: [711, 1.6, 2436] },
  { name: 'gas_a_pump', car: { x: 698, y: 2378, heading: 90 }, cam: [712.5, 1.6, 2427.5], look: [710, 1, 2431.5] },
  { name: 'gas_a_wide', car: { x: 698, y: 2378, heading: 90 }, cam: [745, 25, 2395], look: [712, 0, 2435] },
  { name: 'gas_a_road', car: { x: 698, y: 2378, heading: 90 }, cam: [690, 1.4, 2378], look: [715, 2, 2435] },
  { name: 'gas_b_close', car: { x: 1788, y: 1585, heading: 90 }, cam: [1821, 2, 1627], look: [1804, 1.5, 1640] },
  { name: 'gas_b_front', car: { x: 1788, y: 1585, heading: 90 }, cam: [1805, 2.2, 1615], look: [1805, 2.5, 1642] },
  { name: 'gas_b_shop', car: { x: 1788, y: 1585, heading: 90 }, cam: [1804, 1.7, 1634], look: [1801, 1.6, 1643] },
  { name: 'gas_b_pump', car: { x: 1788, y: 1585, heading: 90 }, cam: [1802.5, 1.6, 1634.5], look: [1800, 1, 1638.5] },
  { name: 'gas_b_wide', car: { x: 1788, y: 1585, heading: 90 }, cam: [1835, 25, 1602], look: [1802, 0, 1642] },
  { name: 'gas_b_road', car: { x: 1788, y: 1585, heading: 90 }, cam: [1780, 1.4, 1585], look: [1805, 2, 1642] },
  // Churches (#59). St. Anne's, Ashford: front 3/4 (tower door and steps),
  // straight on the front, the east side and letter board, and from Main
  // Street as the player first sees it. St. Luke's, Brandt (churchb_*) needs
  // SHOTS_QUERY='opening=off&spot=brandt': the same views, and from Route 40.
  { name: 'church_close', car: { x: 500, y: 2385, heading: 0 }, cam: [491, 2.4, 2399], look: [470, 11, 2428] },
  { name: 'church_front', car: { x: 500, y: 2370, heading: 0 }, cam: [470, 2.0, 2390], look: [470, 12.5, 2428] },
  { name: 'church_door', car: { x: 500, y: 2380, heading: 0 }, cam: [474, 1.7, 2419], look: [470, 2.2, 2426] },
  { name: 'church_side', car: { x: 520, y: 2480, heading: 0 }, cam: [494, 2.6, 2466], look: [471, 5, 2440] },
  { name: 'church_road', car: { x: 597, y: 2484, heading: 300 }, cam: [601, 1.5, 2482], look: [470, 12, 2440] },
  { name: 'churchb_close', car: { x: 1640, y: 1460, heading: 0 }, cam: [1623, 2.4, 1474], look: [1602, 11, 1503] },
  { name: 'churchb_front', car: { x: 1640, y: 1450, heading: 0 }, cam: [1602, 2.0, 1465], look: [1602, 12.5, 1503] },
  { name: 'churchb_side', car: { x: 1650, y: 1560, heading: 0 }, cam: [1626, 2.6, 1541], look: [1603, 5, 1515] },
  { name: 'churchb_road', car: { x: 1598, y: 1601, heading: 270 }, cam: [1606, 1.5, 1598], look: [1600, 12, 1515] },
  { name: 'churchb_board', car: { x: 1580, y: 1601, heading: 90 }, cam: [1592, 1.6, 1595], look: [1596, 1.6, 1589] },
  // St. Luke's letter board (#59): front (faces Route 40) and back, straight
  // on, for each mission, and from Route 40 coming in from the west.
  { name: 'board_m1_front', mission: 'm1_parcel', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1595.5], look: [1596, 2.0, 1589] },
  { name: 'board_m1_back', mission: 'm1_parcel', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1582.5], look: [1596, 2.0, 1589] },
  { name: 'board_m2_front', mission: 'm2_cabin', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1595.5], look: [1596, 2.0, 1589] },
  { name: 'board_m2_back', mission: 'm2_cabin', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1582.5], look: [1596, 2.0, 1589] },
  { name: 'board_m3_front', mission: 'm3_airfield', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1595.5], look: [1596, 2.0, 1589] },
  { name: 'board_m3_back', mission: 'm3_airfield', car: { x: 1580, y: 1601, heading: 90 }, cam: [1596, 1.9, 1582.5], look: [1596, 2.0, 1589] },
  { name: 'board_road', mission: 'm3_airfield', car: { x: 1560, y: 1601, heading: 90 }, cam: [1562, 1.4, 1601], look: [1596, 1.8, 1590] },
  // St. Anne's board in Fenwick (default region): missions 1 and 2 carry the Luke 15 series.
  { name: 'fen_board_m1_front', mission: 'm1_parcel', car: { x: 515, y: 2448, heading: 270 }, cam: [498.5, 1.9, 2441], look: [492, 2.0, 2441] },
  { name: 'fen_board_m1_back', mission: 'm1_parcel', car: { x: 515, y: 2448, heading: 270 }, cam: [485.5, 1.9, 2441], look: [492, 2.0, 2441] },
  { name: 'fen_board_m2_front', mission: 'm2_cabin', car: { x: 515, y: 2448, heading: 270 }, cam: [498.5, 1.9, 2441], look: [492, 2.0, 2441] },
  { name: 'fen_board_m2_back', mission: 'm2_cabin', car: { x: 515, y: 2448, heading: 270 }, cam: [485.5, 1.9, 2441], look: [492, 2.0, 2441] },
  // Farmhouse porch (#63): Pruitt (front door east, porch wraps to the south)
  // and Dolan (front door west, porch wraps to the south). 3/4 close,
  // straight on, the swing end up close, and from the lane as you drive up.
  { name: 'porch_p_close', car: { x: 2960, y: 1062, heading: 345 }, cam: [2955, 1.8, 1059], look: [2942, 1.8, 1044] },
  { name: 'porch_p_front', car: { x: 2960, y: 1062, heading: 345 }, cam: [2959, 1.8, 1041], look: [2942, 2.2, 1041] },
  { name: 'porch_p_swing', car: { x: 2960, y: 1062, heading: 345 }, cam: [2948, 1.7, 1053], look: [2941, 1.2, 1046] },
  { name: 'porch_p_road', car: { x: 2960, y: 1062, heading: 345 }, cam: [2960, 1.4, 1062], look: [2937, 3, 1040] },
  { name: 'porch_d_close', car: { x: 2470, y: 853, heading: 77 }, cam: [2492, 1.8, 856], look: [2506, 1.8, 841] },
  { name: 'porch_d_front', car: { x: 2470, y: 853, heading: 77 }, cam: [2488, 1.8, 836], look: [2505, 2.2, 836] },
  { name: 'porch_d_swing', car: { x: 2470, y: 853, heading: 77 }, cam: [2509, 1.7, 852], look: [2507, 1.2, 844] },
  { name: 'porch_d_road', car: { x: 2470, y: 853, heading: 77 }, cam: [2470, 1.4, 853], look: [2510, 3, 838] },
  // Roadside fill (#66): from the driver's seat up three roads (Highway 9 and
  // Route 40 paved, River Road dirt), and low over each verge.
  { name: 'verge_hwy', car: { road: 'hwy9', at: 0.25 }, rel: [-0.4, 1.3, -0.5], relLook: [-0.6, 0.9, -60] },
  { name: 'verge_rt40', car: { road: 'rt40', at: 0.3 }, rel: [-0.4, 1.3, -0.5], relLook: [-0.6, 0.9, -60] },
  { name: 'verge_river', car: { road: 'river_rd', at: 0.6 }, rel: [-0.4, 1.3, -0.5], relLook: [-0.6, 0.9, -60] },
  { name: 'verge_hwy_side', car: { road: 'hwy9', at: 0.25 }, rel: [-6.5, 1.5, 3], relLook: [-7, 0.2, -14] },
  { name: 'verge_river_side', car: { road: 'river_rd', at: 0.6 }, rel: [-5.5, 1.5, 3], relLook: [-6, 0.2, -14] },
  // A ditch along Highway 9 (3/4, straight across, from the road), a run of
  // leaning posts with wire, a tar patch, and a culvert at Pruitt Lane.
  // Before shots of these: SHOTS_QUERY='opening=off&verge=off'.
  { name: 'verge_ditch_close', car: { x: 1369, y: 2241, heading: 98 }, cam: [1430.3, 2, 2245.9], look: [1437.6, 0, 2242] },
  { name: 'verge_ditch_front', car: { x: 1369, y: 2241, heading: 98 }, cam: [1437, 1.5, 2249.4], look: [1437.8, 0, 2238] },
  { name: 'verge_ditch_road', car: { x: 1369, y: 2241, heading: 98 }, cam: [1363.3, 1.3, 2242.6], look: [1418.5, 0.6, 2244.2] },
  { name: 'verge_posts_close', car: { x: 977.4, y: 2302.9, heading: 250 }, cam: [950.8, 1.5, 2320.4], look: [948.1, 0.7, 2324.6] },
  { name: 'verge_posts_front', car: { x: 977.4, y: 2302.9, heading: 250 }, cam: [946, 1.3, 2318.9], look: [948.1, 0.7, 2324.6] },
  { name: 'verge_posts_road', car: { x: 911.8, y: 2327.2, heading: 70 }, cam: [977.4, 1.3, 2302.9], look: [948.1, 0.8, 2324.6] },
  { name: 'verge_posts_road2', car: { x: 977.4, y: 2302.9, heading: 250 }, cam: [911.8, 1.3, 2327.2], look: [948.1, 0.8, 2324.6] },
  { name: 'verge_tar_close', car: { x: 1369, y: 2241, heading: 98 }, cam: [1379.5, 1.6, 2249.2], look: [1375, 0, 2245.1] },
  { name: 'verge_tar_front', car: { x: 1369, y: 2241, heading: 98 }, cam: [1369.4, 2.5, 2242], look: [1375, 0, 2245.1] },
  { name: 'verge_tar_road', car: { x: 1369, y: 2241, heading: 98 }, cam: [1342.8, 1.3, 2240], look: [1402.5, 0.3, 2246.4] },
  { name: 'verge_culvert', car: { x: 2965, y: 1100, heading: 180 }, cam: [2990.5, 1.4, 1286.3], look: [2986.7, 0, 1288.7] },
  // Water towers (#60). Ashford's, south of Highway 9: 3/4 close, straight on
  // from the highway side, up at the catwalk, and from the highway driving
  // east. Oakham's (run with SHOTS_QUERY='opening=off&spot=brandt'): 3/4, straight on
  // from Oakham Road's side, and from Oakham Road driving south.
  { name: 'tower_close', car: { x: 1450, y: 2251.5, heading: 90 }, cam: [1497, 7, 2268], look: [1530, 15, 2300] },
  { name: 'tower_front', car: { x: 1450, y: 2251.5, heading: 90 }, cam: [1530, 14, 2256], look: [1530, 20, 2300] },
  { name: 'tower_catwalk', car: { x: 1450, y: 2251.5, heading: 90 }, cam: [1513, 24, 2283], look: [1530, 21, 2300] },
  { name: 'tower_road', car: { x: 1361, y: 2241.5, heading: 96 }, cam: [1361, 1.4, 2241.5], look: [1530, 18, 2300] },
  { name: 'oak_close', car: { x: 3907, y: 2250, heading: 180 }, cam: [3958, 7, 2228], look: [3990, 15, 2262] },
  { name: 'oak_front', car: { x: 3907, y: 2250, heading: 180 }, cam: [3940, 12, 2262], look: [3990, 20, 2262] },
  { name: 'oak_road', car: { x: 3920, y: 2140, heading: 180 }, cam: [3920, 1.4, 2140], look: [3990, 18, 2262] },
  // Trees (#69). Rows along Pruitt Lane (dirt, off Route 40 to the Pruitt
  // farm): from the car turning in, straight down the lane, 3/4 close on a
  // row tree, its trunk and branches up close, and the dead one in the row.
  // Rows on Ridge Road by Hartley's and on Old River Road from the car.
  // A dead tree and a broken one out in the open.
  { name: 'rows_road', car: { x: 2982.2, y: 1276.7, heading: 7 } },
  { name: 'rows_lane', car: { x: 2982.2, y: 1276.7, heading: 7 }, cam: [2987.6, 1.6, 1237.1], look: [2986.8, 2.5, 1157.5] },
  { name: 'rows_close', car: { x: 2982.2, y: 1276.7, heading: 7 }, cam: [2986, 1.7, 1216], look: [2977.1, 3, 1208.4] },
  { name: 'rows_bark', car: { x: 2982.2, y: 1276.7, heading: 7 }, cam: [2981.5, 1.4, 1211.5], look: [2977.1, 2.6, 1208.4] },
  { name: 'rows_dead', car: { x: 2982.2, y: 1276.7, heading: 7 }, cam: [2987, 2, 1227], look: [2976.3, 5, 1218.9] },
  { name: 'rows_ridge_road', car: { x: 2648.3, y: 290.1, heading: 74 } },
  { name: 'rows_river_road', car: { x: 3306.4, y: 2243.3, heading: 106 } },
  { name: 'dead_open', car: { x: 2700, y: 660, heading: 0 }, cam: [2692, 2, 652], look: [2670, 6, 638] },
  { name: 'snag_open', car: { x: 2190, y: 1440, heading: 0 }, cam: [2178, 1.8, 1428], look: [2167, 2.2, 1418] },
  // Tractors (#65): slow farm tractors on Ridge Road (pin ids 'hz:<paint>'):
  // 3/4 front close, straight side, the big tire, the back, three in a row,
  // and from the car as the player comes up behind one.
  { name: 'tractor_close', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0x3f7a35', 20, 1, 1]], tcam: [[3.2, 1.9, -4.6], [0, 1.1, 0]] },
  { name: 'tractor_side', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0xb8352a', 20, 1, 1]], tcam: [[6.2, 1.4, 0], [0, 1.1, 0]] },
  { name: 'tractor_tire', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0x2f5f9a', 20, 1, 1]], tcam: [[3.6, 1.1, 3.0], [0.9, 0.8, 0.85]] },
  { name: 'tractor_rear', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0x3f7a35', 20, 1, 1]], tcam: [[3.0, 2.2, 6.2], [0, 1.2, 0.4]] },
  { name: 'tractor_row', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0x3f7a35', 18, 1, 1], ['hz:0xb8352a', 28, 1, 1], ['hz:0x2f5f9a', 38, 1, 1]], tcam: [[4.5, 3, 7], [0, 1, -12]] },
  { name: 'tractor_road', car: { road: 'ridge_rd', at: 0.5 }, pin: [['hz:0x3f7a35', 16, 1, 1]] },
  // Grain elevators and silos (#67). Calder silos: 3/4, straight on, the
  // catwalk, and from Route 40. Ashford's old elevator: 3/4, straight on and
  // from Ashford Street. Hartley's farm silo: 3/4, straight on, from the yard.
  // Brandt's co-op elevator (elev_b_*, SHOTS_QUERY='opening=off&spot=brandt'):
  // 3/4, straight on, the sign band, and from Station Road.
  { name: 'silo_close', car: { x: 4925, y: 1140, heading: 90 }, cam: [4985, 3, 1140], look: [4962, 14, 1112] },
  { name: 'silo_front', car: { x: 4925, y: 1140, heading: 90 }, cam: [4960, 6, 1165], look: [4960, 16, 1110] },
  { name: 'silo_top', car: { x: 4925, y: 1140, heading: 90 }, cam: [4978, 30, 1128], look: [4960, 25, 1106] },
  { name: 'silo_road', car: { x: 4900, y: 1178, heading: 90 }, cam: [4900, 1.4, 1178], look: [4960, 15, 1110] },
  { name: 'elev_a_close', car: { x: 600, y: 2540, heading: 180 }, cam: [632, 3, 2622], look: [660, 13, 2592] },
  { name: 'elev_a_front', car: { x: 600, y: 2540, heading: 180 }, cam: [618, 5, 2592], look: [660, 13, 2592] },
  { name: 'elev_a_road', car: { x: 600, y: 2530, heading: 180 }, cam: [600, 1.4, 2530], look: [660, 13, 2592] },
  { name: 'barnsilo_close', car: { x: 2610, y: 490, heading: 0 }, cam: [2742, 3, 442], look: [2722, 8, 417] },
  { name: 'barnsilo_front', car: { x: 2610, y: 490, heading: 0 }, cam: [2722, 4, 448], look: [2722, 8, 417] },
  { name: 'barnsilo_road', car: { x: 2610, y: 490, heading: 0 }, cam: [2610, 1.4, 490], look: [2722, 8, 417] },
  // Barns (#79): Hartley's barn 3/4, straight on, from the back, and from Farm
  // Road; Pruitt's, Okafor's and Dolan's 3/4 and from their lane, so the
  // seeded differences between neighbours show.
  { name: 'barn_close', car: { x: 2610, y: 490, heading: 0 }, cam: [2682, 3, 446], look: [2705, 5, 420] },
  { name: 'barn_front', car: { x: 2610, y: 490, heading: 0 }, cam: [2705, 3.5, 452], look: [2705, 5.5, 420] },
  { name: 'barn_back', car: { x: 2610, y: 490, heading: 0 }, cam: [2728, 4, 392], look: [2702, 5, 420] },
  { name: 'barn_road', car: { x: 2610, y: 490, heading: 0 }, cam: [2650, 1.4, 460], look: [2705, 5, 420] },
  { name: 'barn_p_close', car: { x: 2960, y: 1062, heading: 45 }, cam: [3020, 3, 1058], look: [2995, 5, 1030] },
  { name: 'barn_p_road', car: { x: 2960, y: 1062, heading: 45 }, cam: [2960, 1.4, 1062], look: [2995, 5, 1030] },
  { name: 'barn_o_close', car: { x: 4897, y: 1963, heading: 90 }, cam: [4940, 3, 2016], look: [4965, 5, 1990] },
  { name: 'barn_o_road', car: { x: 4897, y: 1963, heading: 90 }, cam: [4897, 1.4, 1963], look: [4965, 5, 1990] },
  { name: 'barn_dl_close', car: { x: 2495, y: 848, heading: 90 }, cam: [2515, 3, 880], look: [2536, 5, 858] },
  { name: 'barn_dl_road', car: { x: 2495, y: 848, heading: 90 }, cam: [2495, 1.4, 848], look: [2536, 5, 858] },
  { name: 'elev_b_close', car: { x: 1700, y: 1440, heading: 0 }, cam: [1772, 3, 1432], look: [1745, 14, 1405] },
  { name: 'elev_b_front', car: { x: 1700, y: 1440, heading: 0 }, cam: [1745, 4, 1452], look: [1745, 14, 1405] },
  { name: 'elev_b_sign', car: { x: 1700, y: 1440, heading: 0 }, cam: [1752, 19, 1378], look: [1745, 19.5, 1405] },
  { name: 'elev_b_road', car: { x: 1700, y: 1560, heading: 0 }, cam: [1700, 1.4, 1560], look: [1745, 14, 1405] },
  // Mud on the player's car (#73), on Ridge Road (dirt): chase view, side,
  // and 3/4 rear up close. mud: the car's mud amount 0..1. mudRain: then that
  // many seconds of full rain parked (src/game/mud.js); run the washed_* views
  // with SHOTS_QUERY='opening=off&rain=on'.
  { name: 'mud_chase', car: { road: 'ridge_rd', at: 0.5 }, mud: 0 },
  { name: 'mud_side', car: { road: 'ridge_rd', at: 0.5 }, mud: 0, rel: [-4.6, 1.3, -0.6], relLook: [0, 0.7, 0.2] },
  { name: 'mud_rear', car: { road: 'ridge_rd', at: 0.5 }, mud: 0, rel: [2.8, 1.6, 5], relLook: [0, 0.7, 0.4] },
  { name: 'muddy_chase', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9 },
  { name: 'muddy_side', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9, rel: [-4.6, 1.3, -0.6], relLook: [0, 0.7, 0.2] },
  { name: 'muddy_rear', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9, rel: [2.8, 1.6, 5], relLook: [0, 0.7, 0.4] },
  { name: 'washed_chase', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9, mudRain: 60 },
  { name: 'washed_side', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9, mudRain: 60, rel: [-4.6, 1.3, -0.6], relLook: [0, 0.7, 0.2] },
  { name: 'washed_rear', car: { road: 'ridge_rd', at: 0.5 }, mud: 0.9, mudRain: 60, rel: [2.8, 1.6, 5], relLook: [0, 0.7, 0.4] },
  // Main street shops (#70): Millbrook (m_h3, front west onto Church Street)
  // and Calder's feed store (c_feed, front north onto Route 40); Brandt's
  // store (br_store, front south onto the highway) needs
  // SHOTS_QUERY='opening=off&spot=brandt'. Close 3/4, straight on, and from
  // the road driving into town.
  { name: 'shop_m_close', car: { x: 2302, y: 680, heading: 0 }, cam: [2318, 2.0, 586], look: [2333, 3.0, 601] },
  { name: 'shop_m_front', car: { x: 2302, y: 680, heading: 0 }, cam: [2311, 2.2, 600], look: [2332, 3.6, 600] },
  { name: 'shop_m_road', car: { x: 2302, y: 680, heading: 0 }, cam: [2302, 1.4, 680], look: [2336, 3, 600] },
  { name: 'shop_c_close', car: { x: 4740, y: 1166, heading: 90 }, cam: [4819, 2.0, 1182], look: [4835, 3.0, 1197] },
  { name: 'shop_c_front', car: { x: 4740, y: 1166, heading: 90 }, cam: [4835, 2.2, 1176], look: [4835, 3.6, 1196] },
  { name: 'shop_c_road', car: { x: 4740, y: 1166, heading: 90 }, cam: [4740, 1.4, 1166], look: [4835, 3, 1200] },
  { name: 'shop_b_close', car: { x: 1860, y: 1603, heading: 270 }, cam: [1781, 2.0, 1590], look: [1766, 3.0, 1574] },
  { name: 'shop_b_front', car: { x: 1860, y: 1603, heading: 270 }, cam: [1765, 2.2, 1595], look: [1765, 3.6, 1574] },
  { name: 'shop_b_road', car: { x: 1860, y: 1603, heading: 270 }, cam: [1860, 1.4, 1603], look: [1765, 3, 1570] },
  // Road bridges (#78): Highway 9 over Willow Creek (bridge_hwy_*) and Route 40
  // over the Coldwater (bridge_rt40_*): close 3/4 of the end posts, straight
  // down the deck, side on from the bank, and from the road as you drive up.
  // Brandt's (bridgeb_*, SHOTS_QUERY='opening=off&spot=brandt'): Route 40
  // over Sandy Creek and the dirt South Road bridge.
  { name: 'bridge_hwy_close', car: { x: 2404, y: 1615.9, heading: 358.4 }, cam: [2413.3, 2.4, 1579.7], look: [2405.4, 1.4, 1567.9] },
  { name: 'bridge_hwy_front', car: { x: 2404, y: 1615.9, heading: 358.4 }, cam: [2399.5, 1.6, 1587], look: [2400.1, 2, 1555] },
  { name: 'bridge_hwy_side', car: { x: 2404, y: 1615.9, heading: 358.4 }, cam: [2439.6, 2, 1553.9], look: [2400.1, 1, 1555] },
  { name: 'bridge_hwy_road', car: { x: 2404, y: 1615.9, heading: 358.4 } },
  { name: 'bridge_rt40_close', car: { x: 4195.1, y: 1184.9, heading: 87.4 }, cam: [4231.6, 2.4, 1193.6], look: [4243.2, 1.4, 1185.5] },
  { name: 'bridge_rt40_front', car: { x: 4195.1, y: 1184.9, heading: 87.4 }, cam: [4223.9, 1.6, 1179.9], look: [4260, 2, 1179.8] },
  { name: 'bridge_rt40_side', car: { x: 4195.1, y: 1184.9, heading: 87.4 }, cam: [4261.8, 2, 1219.2], look: [4260, 1, 1179.8] },
  { name: 'bridge_rt40_road', car: { x: 4195.1, y: 1184.9, heading: 87.4 } },
  { name: 'bridgeb_sandy_close', car: { x: 2414.9, y: 1658.2, heading: 99.5 }, cam: [2448.7, 2.4, 1674.3], look: [2461.8, 1.4, 1668.9] },
  { name: 'bridgeb_sandy_road', car: { x: 2414.9, y: 1658.2, heading: 99.5 } },
  { name: 'bridgeb_south_close', car: { x: 2535.8, y: 2567.1, heading: 90 }, cam: [2571.8, 2.4, 2575.9], look: [2583.8, 1.4, 2568.4] },
  { name: 'bridgeb_south_front', car: { x: 2535.8, y: 2567.1, heading: 90 }, cam: [2564.8, 1.6, 2563.4], look: [2594.8, 2, 2564.9] },
  { name: 'bridgeb_south_road', car: { x: 2535.8, y: 2567.1, heading: 90 } },
  // Name plates up close: Route 40's end post (Fenwick), South Road's (Brandt).
  { name: 'bridge_rt40_plate', car: { x: 4195.1, y: 1184.9, heading: 87.4 }, cam: [4236.4, 1.3, 1184.8], look: [4239.7, 1.0, 1185.9] },
  { name: 'bridgeb_south_plate', car: { x: 2535.8, y: 2567.1, heading: 90 }, cam: [2577.8, 1.1, 2567.7], look: [2581.1, 0.8, 2568.7] },
  // Other landmarks (#75): the mill ruin, covered bridge, fire lookout, quarry
  // and campground. Close 3/4, straight on, and from the road as the player
  // first sees it; a few extra close views of the parts with the most detail.
  { name: 'lm_mill_close', car: { x: 1500, y: 1525, heading: 20 }, cam: [1546, 3, 1514], look: [1530, 2.5, 1500] },
  { name: 'lm_mill_front', car: { x: 1500, y: 1525, heading: 20 }, cam: [1530, 2.5, 1523], look: [1530, 2.5, 1500] },
  { name: 'lm_mill_wheel', car: { x: 1500, y: 1525, heading: 20 }, cam: [1517, 2, 1484], look: [1524.5, 1.5, 1491.6] },
  { name: 'lm_mill_road', car: { x: 1500, y: 1525, heading: 20 }, cam: [1500, 1.4, 1525], look: [1530, 3, 1500] },
  { name: 'lm_covered_close', car: { x: 4142.6, y: 465.4, heading: 106.1 }, cam: [4171.1, 3, 482], look: [4183, 3, 477] },
  { name: 'lm_covered_front', car: { x: 4142.6, y: 465.4, heading: 106.1 }, cam: [4169.5, 2.5, 473.2], look: [4181, 4, 476.5] },
  { name: 'lm_covered_side', car: { x: 4142.6, y: 465.4, heading: 106.1 }, cam: [4194.1, 3, 503.2], look: [4200.2, 2, 482] },
  { name: 'lm_covered_road', car: { x: 4142.6, y: 465.4, heading: 106.1 } },
  { name: 'lm_lookout_close', car: { x: 5150, y: 330, heading: 45 }, cam: [5263, 3, 238], look: [5250, 7, 225] },
  { name: 'lm_lookout_cab', car: { x: 5150, y: 330, heading: 45 }, cam: [5259, 26, 236], look: [5250, 24.5, 225] },
  { name: 'lm_lookout_front', car: { x: 5150, y: 330, heading: 45 }, cam: [5250, 4, 252], look: [5250, 12, 225] },
  { name: 'lm_lookout_road', car: { x: 5150, y: 330, heading: 45 }, cam: [5150, 1.4, 330], look: [5250, 15, 225] },
  { name: 'lm_quarry_close', car: { x: 3558.6, y: 783.1, heading: 95 }, cam: [3719, 2.5, 742], look: [3711.4, 1.2, 733.5] },
  { name: 'lm_quarry_crane', car: { x: 3558.6, y: 783.1, heading: 95 }, cam: [3757, 5, 776], look: [3777, 9, 761] },
  { name: 'lm_quarry_front', car: { x: 3558.6, y: 783.1, heading: 95 }, cam: [3605, 6, 779], look: [3690, -8, 770] },
  { name: 'lm_quarry_road', car: { x: 3558.6, y: 783.1, heading: 95 } },
  { name: 'lm_camp_close', car: { x: 5476.7, y: 494.4, heading: 281 }, cam: [5481, 2.5, 466], look: [5474, 1, 456] },
  { name: 'lm_camp_hut', car: { x: 5476.7, y: 494.4, heading: 281 }, cam: [5450, 2.2, 443], look: [5442, 1.5, 436] },
  { name: 'lm_camp_front', car: { x: 5476.7, y: 494.4, heading: 281 }, cam: [5472, 4, 482], look: [5472, 1, 450] },
  { name: 'lm_camp_road', car: { x: 5476.7, y: 494.4, heading: 281 }, cam: [5476.7, 1.4, 494.4], look: [5470, 1, 450] },
  // Diner, store and cabin (#77): close 3/4, straight on, and from the road
  // as the player first sees them. Fenwick: Calder diner, Dunmore store, the
  // cabin on Pond Road. Brandt's (kindb_*, SHOTS_QUERY='opening=off&spot=brandt'):
  // the Brandt diner and the Oakham store.
  { name: 'kind_diner_close', car: { x: 4630, y: 1161, heading: 88 }, cam: [4663, 2.6, 1151], look: [4650, 2, 1133] },
  { name: 'kind_diner_front', car: { x: 4630, y: 1161, heading: 88 }, cam: [4650, 1.7, 1159], look: [4650, 2.6, 1132] },
  { name: 'kind_diner_road', car: { x: 4630, y: 1161, heading: 88 }, cam: [4624, 1.5, 1162], look: [4650, 2.2, 1132] },
  { name: 'kind_store_close', car: { x: 3360, y: 286, heading: 96 }, cam: [3393, 2.6, 279], look: [3380, 2, 261] },
  { name: 'kind_store_front', car: { x: 3360, y: 286, heading: 96 }, cam: [3380, 1.7, 286], look: [3380, 2.8, 259] },
  { name: 'kind_store_road', car: { x: 3360, y: 286, heading: 96 }, cam: [3354, 1.5, 287], look: [3380, 2.2, 261] },
  { name: 'kind_cabin_close', car: { x: 5845, y: 416, heading: 80 }, cam: [5885, 2.2, 406], look: [5900, 1.3, 396] },
  { name: 'kind_cabin_front', car: { x: 5845, y: 416, heading: 80 }, cam: [5885, 1.6, 398], look: [5905, 1.8, 398] },
  { name: 'kind_cabin_road', car: { x: 5845, y: 416, heading: 80 }, cam: [5856, 1.5, 419], look: [5902, 1.5, 398] },
  { name: 'kindb_diner_close', car: { x: 1600, y: 1599, heading: 90 }, cam: [1635, 2.6, 1621], look: [1622, 2, 1639] },
  { name: 'kindb_diner_road', car: { x: 1600, y: 1599, heading: 90 }, cam: [1598, 1.5, 1600], look: [1622, 2.2, 1636] },
  { name: 'kindb_store_close', car: { x: 3902, y: 2300, heading: 180 }, cam: [3919, 2.6, 2331], look: [3935, 2, 2318] },
  { name: 'kindb_store_road', car: { x: 3902, y: 2300, heading: 180 }, cam: [3903, 1.5, 2294], look: [3934, 2.2, 2318] },
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
// SHOTS_QUERY adds URL params, e.g. SHOTS_QUERY=rain=on for wet shots.
// Without it, opening=off keeps mission 1's opening rain (#51) out of the shots.
await page.goto(`${base}/three.html?stats&res=1&${process.env.SHOTS_QUERY || 'opening=off'}`);
await page.waitForSelector('button');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__three && window.__state, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// Dismiss the mission card.
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
// Cards (mission, intro) can come up late, after any view: close them
// before every shot, not just once at load.
async function dismissCards() {
  for (let k = 0; k < 3; k++) {
    const btn = page.locator('button:visible', { hasText: /^(Start|Okay)$/ });
    if (!(await btn.count())) break;
    await btn.first().click();
    await page.waitForTimeout(800);
  }
}
await dismissCards();
// SHOTS_MISSION=<mission id> plays that mission first (its region), e.g.
// SHOTS_MISSION=m3_airfield for the Brandt views.
if (process.env.SHOTS_MISSION) {
  await page.evaluate((id) => window.__playMission(id), process.env.SHOTS_MISSION);
  await page.waitForTimeout(3000);
  await dismissCards();
}

// SHOTS_EXTRA_TRIS=<n> adds one mesh of about n triangles that is drawn in
// every view (the budget check's self-test: it must then fail).
if (process.env.SHOTS_EXTRA_TRIS) {
  await page.evaluate((n) => {
    // Added to the live scene before each view (regions swap scenes). No bare
    // 'three' import in the page: borrow the classes from a mesh in the scene.
    let m = null;
    window.__addExtraTris = (scene) => {
      if (m && m.parent === scene) return;
      if (!m) {
        let src = null;
        scene.traverse((o) => { if (!src && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.material && (o.material.isMeshStandardMaterial || o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial)) src = o; });
        const g = new src.geometry.constructor();
        const pos = new Float32Array(n * 9);
        for (let i = 0; i < pos.length; i += 9) { pos[i + 3] = 0.01; pos[i + 7] = 0.01; } // tiny triangles at the origin
        g.setAttribute('position', new src.geometry.attributes.position.constructor(pos, 3));
        m = new src.constructor(g, new src.material.constructor({ color: 0xff00ff }));
        m.frustumCulled = false;
        m.castShadow = false;
      }
      scene.add(m);
    };
  }, Number(process.env.SHOTS_EXTRA_TRIS));
}

fs.mkdirSync(outDir, { recursive: true });
const stats = {};
for (const v of VIEWS.filter((w) => !only || only.split(',').includes(w.name))) {
  await page.evaluate(async (v) => {
    const { WORLD } = await import('/src/world/world.js');
    const st = window.__state;
    let { x, y, heading } = v.car || {};
    if (v.car && v.car.road) {
      const r = WORLD.roads.find((q) => q.id === v.car.road);
      const i = Math.floor(r.points.length * v.car.at);
      const [ax, ay] = r.points[i];
      const [bx, by] = r.points[i + 1];
      x = ax;
      y = ay;
      heading = (Math.atan2(bx - ax, -(by - ay)) * 180) / Math.PI;
      // Keep right like the traffic does.
      const len = Math.hypot(bx - ax, by - ay);
      x += (-(by - ay) / len) * -1.2;
      y += ((bx - ax) / len) * -1.2;
    }
    st.car.x = x;
    st.car.y = y;
    st.car.heading = heading;
    st.car.speed = 0;
    // Pin traffic cars on the car's road (re-applied after every traffic tick).
    const amb = window.__amb;
    if (amb && !amb.__pinWrap) {
      const up = amb.update.bind(amb);
      amb.update = (...a) => {
        const r = up(...a);
        for (const p of window.__pins || []) {
          const c = amb.cars.find((q) => q.id === p.id);
          if (c) Object.assign(c, { x: p.x, y: p.y, heading: p.heading, speed: 0, blink: 0 });
        }
        return r;
      };
      amb.__pinWrap = true;
    }
    window.__pins = [];
    // Locals for this view (#56): the car 9 m from the one named, others lined up.
    window.__lineup = null;
    st.talkingTo = v.talk || null;
    // mission: letter boards show that mission's lines for this view (#59), without changing mission.
    window.__three.scene.traverse((o) => o.userData.showMission && o.userData.showMission(v.mission || null));
    if (v.person) {
      const l = WORLD.locals.find((q) => q.id === v.person[0]);
      const p = (amb && amb.personPos(l.id)) || l;
      x = p.x + 9;
      y = p.y;
      heading = 270;
      if (v.lineup) {
        // A row across the line to the car, centred where that local stands,
        // everyone facing the car (east).
        window.__lineup = v.lineup.map((id, k) => ({ id, x: p.x, y: p.y + (k - (v.lineup.length - 1) / 2) * 1.3, heading: 90 }));
      }
      st.car.x = x;
      st.car.y = y;
      st.car.heading = heading;
    }
    if (amb && !amb.__lineWrap) {
      const up2 = amb.update.bind(amb);
      amb.update = (...a) => {
        const r = up2(...a);
        for (const q of window.__lineup || []) {
          const p = amb.personPos(q.id);
          if (p) Object.assign(p, { x: q.x, y: q.y, heading: q.heading, moving: false });
        }
        return r;
      };
      amb.__lineWrap = true;
    }
    if (v.pin && v.car.road) {
      const r = WORLD.roads.find((q) => q.id === v.car.road);
      const i0 = Math.floor(r.points.length * v.car.at);
      for (const [id, along, lane, facing] of v.pin) {
        // Walk the road polyline `along` metres from point i0.
        let i = i0;
        let left = along;
        let px = r.points[i][0];
        let py = r.points[i][1];
        let dx = 0;
        let dy = -1;
        while (i < r.points.length - 1) {
          const [bx, by] = r.points[i + 1];
          const L = Math.hypot(bx - px, by - py);
          dx = (bx - px) / (L || 1);
          dy = (by - py) / (L || 1);
          if (L >= left) { px += dx * left; py += dy * left; break; }
          left -= L;
          px = bx;
          py = by;
          i++;
        }
        // Lane offset the same way the player's car is placed above.
        const ox = -dy * -1.2 * lane;
        const oy = dx * -1.2 * lane;
        let hd = (Math.atan2(dx, -dy) * 180) / Math.PI;
        if (facing < 0) hd += 180;
        window.__pins.push({ id, x: px + ox, y: py + oy, heading: (hd + 360) % 360 });
      }
    }
    // Hazard tractors (#65): pin ids 'hz:<color>' are slow farm tractors
    // (src/ambient/hazards.js), spawned if missing and held in place after
    // every hazard tick. Hazards are cleared after a view that pinned any.
    const dh = window.__dh;
    if (dh && !dh.__pinWrap) {
      const upd = dh.hz.update.bind(dh.hz);
      dh.hz.update = (...a) => {
        const r = upd(...a);
        const want = (window.__pins || []).filter((p) => p.id.startsWith('hz:'));
        const mine = () => dh.hz.vehicles.filter((q) => q.kind === 'tractor');
        for (let k = mine().length; k < want.length; k++) if (!dh.spawn('tractor', 25)) break;
        const tr = mine();
        want.forEach((p, k) => tr[k] && Object.assign(tr[k], { x: p.x, y: p.y, heading: p.heading, speed: 0, color: Number(p.id.slice(3)) }));
        return r;
      };
      dh.__pinWrap = true;
    }
    if (dh && window.__hzPinned) dh.hz.reset();
    window.__hzPinned = (v.pin || []).some(([id]) => id.startsWith('hz:'));
    // Dirt on traffic cars for this view (#43). Cars an earlier view dirtied
    // go back to their own base dirt (0 is under it, so the next tick lifts it).
    if (window.__trafficDirt) {
      for (const id of window.__dirtied || []) window.__trafficDirt(id, 0);
      window.__dirtied = (v.dirt || []).map(([id, d]) => (window.__trafficDirt(id, d), id));
    }
    // Another kit on a traffic car for this view (#46: the van's variants);
    // cars an earlier view changed get their own kit back.
    if (window.__trafficKit) {
      for (const id of window.__kitted || []) window.__trafficKit(id, null);
      window.__kitted = (v.kit || []).map(([id, parts]) => (window.__trafficKit(id, parts), id));
    }
    // The farm dog held running or standing for this view (#68), else free.
    for (const d of (window.__amb && window.__amb.farmDogs) || []) {
      d.hold = v.dog ? { s: v.dog[0], v: v.dog[1], rest: v.dog[1] === 'rest', toward: v.dog[2] ? { x: v.dog[2][0], y: v.dog[2][1] } : null } : null;
    }
    // Mud on the player's car (#73): set it, then wash it in mudRain s of rain.
    if (window.__car3d && v.mud !== undefined) {
      let m = v.mud;
      if (v.mudRain) {
        const { stepMud } = await import('/src/game/mud.js').catch(() => ({}));
        for (let t = 0; stepMud && t < v.mudRain; t += 0.5) m = stepMud(m, 0.5, { surface: 'dirt', speed: 0, rain: 1, wet: 1 });
      }
      window.__car3d.dirt.value = m;
    }
    const { renderer, camera, world3d } = window.__three;
    if (!renderer.__orig) renderer.__orig = renderer.render.bind(renderer);
    const H = (px, py) => world3d.terrain.heightAt(px, py);
    renderer.render = (s, c) => {
      if (v.person && window.__amb) {
        // Aim at the local (or the middle of the lineup) from the car's side,
        // turned v.person[3] degrees round them.
        const row = window.__lineup;
        const p = row ? { x: (row[0].x + row[row.length - 1].x) / 2, y: (row[0].y + row[row.length - 1].y) / 2 } : window.__amb.personPos(v.person[0]);
        const L = Math.hypot(st.car.x - p.x, st.car.y - p.y) || 1;
        const ux = (st.car.x - p.x) / L;
        const uy = (st.car.y - p.y) / L;
        const t = (v.person[3] * Math.PI) / 180;
        const ax = ux * Math.cos(t) - uy * Math.sin(t);
        const ay = ux * Math.sin(t) + uy * Math.cos(t);
        const cx = p.x + ax * v.person[1];
        const cy = p.y + ay * v.person[1];
        c.position.set(cx, H(cx, cy) + v.person[2], cy);
        c.up.set(0, 1, 0);
        c.lookAt(p.x, H(p.x, p.y) + (v.person[1] > 5 ? 1.0 : 1.3), p.y);
        c.updateMatrixWorld();
      } else if (v.cows && window.__amb) {
        // Aim at the cow nearest the car, from the car's side of it.
        let best = null;
        for (const a of window.__amb.animals) {
          if (a.kind !== (v.kind || 'cow')) continue;
          const d = Math.hypot(a.x - st.car.x, a.y - st.car.y);
          if (!best || d < best.d) best = { a, d };
        }
        if (best) {
          const { a, d } = best;
          // side: straight onto the animal's flank; fromCar: from the driver's seat.
          const hr = (a.heading * Math.PI) / 180;
          const [ux, uy] = v.side ? [Math.cos(hr), Math.sin(hr)] : [(st.car.x - a.x) / d, (st.car.y - a.y) / d];
          const px = v.fromCar ? st.car.x : a.x + ux * v.cows[0];
          const py = v.fromCar ? st.car.y : a.y + uy * v.cows[0];
          c.position.set(px, H(px, py) + v.cows[1], py);
          c.up.set(0, 1, 0);
          c.lookAt(a.x, H(a.x, a.y) + 0.8, a.y);
          c.updateMatrixWorld();
        }
      } else if (v.tcam && window.__pins.length) {
        // Camera beside the first pinned traffic car, looking at it.
        const p = window.__pins[0];
        const h = (p.heading * Math.PI) / 180;
        const fx = Math.sin(h);
        const fy = -Math.cos(h);
        const at = ([rr, uu, bb]) => [p.x + -fy * rr - fx * bb, uu, p.y + fx * rr - fy * bb];
        const [cx, cu, cy] = at(v.tcam[0]);
        const [lx, lu, ly] = at(v.tcam[1]);
        c.position.set(cx, H(cx, cy) + cu, cy);
        c.up.set(0, 1, 0);
        c.lookAt(lx, H(p.x, p.y) + lu, ly);
        c.updateMatrixWorld();
      } else if (v.cam) {
        c.position.set(v.cam[0], H(v.cam[0], v.cam[2]) + v.cam[1], v.cam[2]);
        c.up.set(0, 1, 0);
        c.lookAt(v.look[0], H(v.look[0], v.look[2]) + v.look[1], v.look[2]);
        c.updateMatrixWorld();
      } else if (v.rel) {
        // Low view beside the car, looking at it (local right, up, back).
        const h = (st.car.heading * Math.PI) / 180;
        const fx = Math.sin(h);
        const fy = -Math.cos(h);
        const px = st.car.x + -fy * v.rel[0] - fx * v.rel[2];
        const py = st.car.y + fx * v.rel[0] - fy * v.rel[2];
        c.position.set(px, H(px, py) + v.rel[1], py);
        c.up.set(0, 1, 0);
        if (v.relLook) {
          const [lr, lu, lb] = v.relLook;
          const lx = st.car.x + -fy * lr - fx * lb;
          const ly = st.car.y + fx * lr - fy * lb;
          c.lookAt(lx, H(st.car.x, st.car.y) + lu, ly);
        } else c.lookAt(st.car.x + fx * 6, H(st.car.x, st.car.y) + 0.6, st.car.y + fy * 6);
        c.updateMatrixWorld();
      }
      if (window.__addExtraTris) window.__addExtraTris(s);
      renderer.__orig(s, c);
    };
  }, v);
  await page.waitForTimeout(2500);
  await dismissCards();
  const file = path.join(outDir, `${prefix}_${v.name}.png`);
  if (!process.env.SHOTS_NO_PNG) await page.screenshot({ path: file }); // SHOTS_NO_PNG=1: numbers only
  stats[v.name] = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => /calls \d+/.test(d.textContent) && d.style.position === 'fixed');
    return el ? el.textContent.split('\n').filter((l) => /calls/.test(l)).join(' | ') : null;
  });
  console.log(file, stats[v.name]);
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
