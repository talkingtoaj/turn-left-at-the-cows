// The "true" world. Every scene builds what it shows from this data.
//
// Units: 1 unit = 1 metre. x grows east, y grows SOUTH (Phaser screen axes).
// North is -y. Headings/angles are degrees: 0 = north, 90 = east (clockwise).
// Polylines/polygons are arrays of [x, y].
//
// The authored data lives in ./data.js (control points, road-relative signs)
// and ./npcs.js (people and dialogue). ./build.js turns it into this built
// WORLD: smooth dense road/creek polylines, bridge positions, sign positions.
// See DATA.md at the repo root for the full format.

import { WORLD_SOURCE } from './data.js';
import { buildWorld } from './build.js';

export const WORLD = buildWorld(WORLD_SOURCE);
export { defaultSignFacing } from './build.js';
