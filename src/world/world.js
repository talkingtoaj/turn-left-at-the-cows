// The "true" world, one region at a time. Every scene builds what it shows
// from this data.
//
// Units: 1 unit = 1 metre. x grows east, y grows SOUTH (screen axes).
// North is -y. Headings/angles are degrees: 0 = north, 90 = east (clockwise).
// Polylines/polygons are arrays of [x, y].
//
// The world is made of regions (./regions.js), each its own map with its own
// seed, joined in fiction by road. Each region's authored data (control
// points, road-relative signs, people) is built by ./build.js into a WORLD:
// smooth dense road/creek polylines, bridge positions, sign positions.
// See DATA.md at the repo root for the full format.
//
// `WORLD` is a live binding: setRegion(id) swaps it, and every module that
// imports WORLD sees the new region from then on. Built regions are kept
// (plain data, built once), so going back is instant and identical.

import { REGIONS, DEFAULT_REGION, REGION_IDS } from './regions.js';
import { buildWorld } from './build.js';

const built = new Map();

// The built WORLD of region `id` (built on first use).
export function regionWorld(id) {
  let w = built.get(id);
  if (!w) {
    const r = REGIONS[id];
    if (!r) throw new Error(`unknown region ${id}`);
    w = buildWorld(r.source);
    w.regionId = id;
    w.regionName = r.name;
    built.set(id, w);
  }
  return w;
}

export let WORLD = regionWorld(DEFAULT_REGION);
export let REGION = DEFAULT_REGION;

// Landmarks that belong to one mission only (`onlyMission`, issue 28: each
// tourist's parked car). A region is built once with all of them; the world
// the game plays on drops the ones from other missions. worldKey() names that
// variant: the region id, plus the mission id when the region has landmarks
// of that mission. Compare keys, not region ids, to know if a mission needs a
// rebuild.
export function worldKey(id, missionId = null) {
  const r = REGIONS[id];
  const mine = missionId && r && (r.source.landmarks || []).some((l) => l.onlyMission === missionId);
  return mine ? `${id}:${missionId}` : id;
}

const variants = new Map();
function variantWorld(id, missionId) {
  const key = worldKey(id, missionId);
  const full = regionWorld(id);
  if (!full.landmarks.some((l) => l.onlyMission)) return full;
  let w = variants.get(key);
  if (!w) {
    const mine = key === id ? null : missionId;
    w = { ...full, landmarks: full.landmarks.filter((l) => !l.onlyMission || l.onlyMission === mine) };
    variants.set(key, w);
  }
  return w;
}

// Makes region `id` the current WORLD. Returns it. With a missionId, the
// landmarks of other missions are left out (see worldKey). Without one, all
// of them are in (dev tools and checks).
export function setRegion(id, missionId = undefined) {
  WORLD = missionId === undefined ? regionWorld(id) : variantWorld(id, missionId);
  REGION = id;
  return WORLD;
}

export { REGIONS, DEFAULT_REGION, REGION_IDS };
export { defaultSignFacing } from './build.js';
