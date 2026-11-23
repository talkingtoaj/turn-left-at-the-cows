// The phase 2 landmarks: grain silos, fire lookout, covered bridge (fallen in),
// quarry and campground. Each is built in its own file (#75 detail pass);
// all merge into the shared batch.

import { localToWorld } from '../../src/drive/geom.js';
import { CAMP } from '../../src/drive/layout.js';
import { buildCalderSilos } from './elevator3d.js';
import { buildLookout } from './lookout3d.js';
import { buildCoveredBridge } from './covered3d.js';
import { buildQuarry } from './quarry3d.js';
import { buildCampground } from './camp3d.js';

// Footprints (what the car hits) come from src/drive/layout.js: GRAIN, LOOKOUT,
// CAMP, coveredParts, quarryBoulders. Only decoration lies outside them.
// Each landmark seeds its own rng from its id, so a change to one never
// moves the random bits of another.
export function buildNewLandmark(world, terrain, batch, l) {
  switch (l.kind) {
    case 'grain_silos': return buildCalderSilos(terrain, batch, l); // elevator3d.js (#67)
    case 'lookout_tower': return buildLookout(terrain, batch, l); // lookout3d.js (#75)
    case 'covered_bridge': return buildCoveredBridge(world, batch, l); // covered3d.js (#75)
    case 'quarry': return buildQuarry(terrain, batch, l); // quarry3d.js (#75)
    case 'campground': return buildCampground(terrain, batch, l); // camp3d.js (#75)
    default: return false;
  }
}

// Campfire smoke source (world x, y, ground height) for the particle renderer.
export function campfireOf(world, terrain) {
  const c = world.landmarks.find((l) => l.kind === 'campground');
  if (!c) return null;
  const p = localToWorld(c.x, c.y, 0, CAMP.fire.lx, CAMP.fire.ly);
  return { x: p.x, y: p.y, h: terrain.heightAt(p.x, p.y) };
}
