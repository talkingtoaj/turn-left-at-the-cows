// Regions: the world is a set of maps joined in fiction by road. Each region
// has its own authored data (same format as ./data.js) and seed, and is built
// and shown on its own: starting a mission builds only that mission's region.
// Mission regions are named in src/game/missionList.js.
//
//   id: { name, source, addons? }   source: the region's WORLD_SOURCE
//   addons: optional list of add-on data modules merged into source (./addons.js)

import { WORLD_SOURCE } from './data.js';
import { BRANDT_SOURCE } from './data_brandt.js';
import { mergeAddons } from './addons.js';
import { COWS_BRANDT } from './addons/cows_brandt.js';
import { BOARDS_FENWICK } from './addons/boards_fenwick.js';
import { BOARDS_BRANDT } from './addons/boards_brandt.js';
import { LANE_FENWICK } from './addons/lane_fenwick.js';

// Add-on data files per region. Add yours here, e.g.
//   import { MASTS_FENWICK } from './addons/masts_fenwick.js';
//   const FENWICK_ADDONS = [MASTS_FENWICK];
const FENWICK_ADDONS = [LANE_FENWICK, BOARDS_FENWICK];
const BRANDT_ADDONS = [COWS_BRANDT, BOARDS_BRANDT];

export const REGIONS = {
  // Fenwick County: Ashford, Millbrook, Calder (missions 1 and 2). 6.5 x 3.2 km.
  fenwick: { name: 'Fenwick County', source: mergeAddons(WORLD_SOURCE, FENWICK_ADDONS) },
  // Harlan County round Brandt, 22 km east along Route 40 (mission 3, the
  // airfield). 4.8 x 3 km.
  brandt: { name: 'Harlan County, near Brandt', source: mergeAddons(BRANDT_SOURCE, BRANDT_ADDONS) },
};

export const DEFAULT_REGION = 'fenwick';
export const REGION_IDS = Object.keys(REGIONS);
