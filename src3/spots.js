// Dev review spots: ?spot=<name> starts the car at a named place.
// Each spot is a point; the car goes on the nearest road (or the given road)
// there, keeping right, facing `toward` (or along the road).
// `region` (default 'fenwick'): the region the spot is in. A spot in another
// region than the mission picked starts that region's first mission instead.

import { nearestOnPolyline, headingOf } from '../src/drive/geom.js';

export const SPOTS = {
  ashford: { start: true }, // the mission 1 start, Ashford
  forest: { at: [5727, 445], road: 'pond_rd' }, // Pond Road through the woods by Loon Pond
  hartley: { at: [2610, 500], road: 'farm_rd', toward: [2670, 445] }, // just short of Hartley Farm
  slope: { at: [2460, 520], road: 'farm_rd', toward: [2491, 434] }, // steep pasture west of the farm
  dirtroad: { at: [3651, 285], road: 'ridge_rd' }, // bumpy, rolling Ridge Road
  // Rough ground (src/world/roughness.js): drive off the road into them.
  pasture: { at: [1452, 2230], road: 'mill_lane', toward: [1452, 2400] }, // bumpy sheep pasture by Mill Lane (pf_18)
  hay: { at: [610, 1975], road: 'creek_rd', toward: [600, 2200] }, // smooth mown hay west of Creek Road (pf_11)
  scrub: { at: [610, 1920], road: 'creek_rd', toward: [600, 2200] }, // rough scrub east of Creek Road
  roadcrew: { at: [2060, 2134], road: 'hwy9', toward: [2124, 2121] }, // Highway 9, 60 m before the road crew (#95)
  plowed: { at: [2400, 1255], road: 'hwy9', toward: [2400, 1100] }, // plowed field by Highway 9 (pf_5)
  // Region 2, Brandt country (mission 3, the airfield).
  airfield: { region: 'brandt', at: [3318, 1100], road: 'pike_ln', toward: [3326, 1052] }, // top of Pike Lane at the club's gate
  airfield_far: { region: 'brandt', at: [2700, 1700], road: 'rt40', toward: [3300, 1712] }, // Route 40 east of Sandy Creek, the downwind leg overhead, field ~1 km north
  pike_lane: { region: 'brandt', at: [3292, 1600], road: 'pike_ln', toward: [3245, 1420] }, // Pike Lane by the sheep, heading up to the field
  brandt: { region: 'brandt', at: [1500, 1600], road: 'rt40', toward: [1700, 1600] }, // Route 40 into Brandt from the west
  field_lane: { region: 'brandt', at: [2200, 948], road: 'field_lane', toward: [2478, 930] }, // Field Lane near the ford, Peg's dead end ahead
  oakham: { region: 'brandt', at: [3900, 2150], road: 'oakham_rd', toward: [3902, 2330] }, // Oakham Road into the hamlet
};

// Region id of a named spot, or null (unknown name, or x,y,heading).
export function spotRegion(name) {
  const s = SPOTS[name];
  return s ? s.region || 'fenwick' : null;
}

// { x, y, heading } for a spot name, or null.
export function spotFor(name, world) {
  const s = SPOTS[name];
  if (!s) return null;
  if ((s.region || 'fenwick') !== (world.regionId || 'fenwick')) return null;
  if (s.start) return { x: world.start.x, y: world.start.y, heading: world.start.heading };
  const roads = s.road ? world.roads.filter((r) => r.id === s.road) : world.roads;
  let best = null;
  for (const r of roads) {
    const p = nearestOnPolyline(s.at[0], s.at[1], r.points);
    if (!best || p.d < best.p.d) best = { r, p };
  }
  if (!best) return null;
  const { p, r } = best;
  let dx = p.dx;
  let dy = p.dy;
  if (s.toward && (s.toward[0] - p.x) * dx + (s.toward[1] - p.y) * dy < 0) {
    dx = -dx;
    dy = -dy;
  }
  // Keep right: right of heading (dx, dy) is (-dy, dx) in world axes (y south).
  const off = Math.min(1.6, r.width / 4);
  return { x: p.x - dy * off, y: p.y + dx * off, heading: headingOf(dx, dy) };
}
