// Dev review spots: three.html?spot=<name> starts the car at a named place.
// Each spot is a point; the car goes on the nearest road (or the given road)
// there, keeping right, facing `toward` (or along the road).

import { nearestOnPolyline, headingOf } from '../src/drive/geom.js';

export const SPOTS = {
  ashford: { start: true }, // the mission 1 start, Ashford
  forest: { at: [5727, 445], road: 'pond_rd' }, // Pond Road through the woods by Loon Pond
  hartley: { at: [2610, 500], road: 'farm_rd', toward: [2670, 445] }, // just short of Hartley Farm
  slope: { at: [2460, 520], road: 'farm_rd', toward: [2491, 434] }, // steep pasture west of the farm
  dirtroad: { at: [3651, 285], road: 'ridge_rd' }, // bumpy, rolling Ridge Road
};

// { x, y, heading } for a spot name, or null.
export function spotFor(name, world) {
  const s = SPOTS[name];
  if (!s) return null;
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
