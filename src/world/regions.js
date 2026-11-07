// Regions: the world is a set of maps joined in fiction by road. Each region
// has its own authored data (same format as ./data.js) and seed, and is built
// and shown on its own: starting a mission builds only that mission's region.
// Mission regions are named in src/game/missionList.js.
//
//   id: { name, source }   source: the region's WORLD_SOURCE

import { WORLD_SOURCE } from './data.js';
import { BRANDT_SOURCE } from './data_brandt.js';

export const REGIONS = {
  // Fenwick County: Ashford, Millbrook, Calder (missions 1 and 2). 6.5 x 3.2 km.
  fenwick: { name: 'Fenwick County', source: WORLD_SOURCE },
  // Harlan County round Brandt, 22 km east along Route 40 (mission 3, the
  // airfield). 4.8 x 3 km.
  brandt: { name: 'Harlan County, near Brandt', source: BRANDT_SOURCE },
};

export const DEFAULT_REGION = 'fenwick';
export const REGION_IDS = Object.keys(REGIONS);
