// No local's head goes through a roof, porch, awning or canopy (#87: people
// are drawn PERSON_SCALE times life size). Builds each region's objects like
// the game (no DOM), lets the locals wander for a minute with the car close
// by, and casts a ray straight up from each spot they stand on, from the
// knees to the top of the head (hat included). Anything built that the ray
// hits is over their head.
//
//   npm run check:people-heads
//
// Exits 1 when any check fails.

import * as THREE from 'three';
import { setRegion, REGION_IDS } from '../src/world/world.js';
import { generateScenery } from '../src/drive/layout.js';
import { Terrain } from '../src3/world3d/terrain.js';
import { Batcher } from '../src3/world3d/batch.js';
import { buildObjects } from '../src3/world3d/world3d.js';
import { GroundPaint } from '../src3/world3d/paint.js';
import { createAmbient } from '../src/ambient/ambient.js';
import { personLook, PERSON_SCALE } from '../src3/world3d/peopleLook.js';

const HAT = 0.12; // m (life size) a hat adds over the head
const WANDER_S = 60; // seconds of wander to sample
let fails = 0;
let spotsChecked = 0;
const check = (ok, what) => {
  if (!ok) {
    fails++;
    console.log('FAIL ' + what);
  }
};

const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); // hit roofs from below
const ray = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);

for (const id of REGION_IDS) {
  const world = setRegion(id);
  const scenery = generateScenery(world);
  const terrain = new Terrain(world);
  const batch = new Batcher();
  batch.paint = new GroundPaint(world);
  const built = buildObjects(world, scenery, terrain, batch, { glowTex: null });
  const root = new THREE.Group();
  root.add(batch.build(new Proxy({}, { get: () => mat })));
  for (const d of built.dynamic) if (d && d.object) root.add(d.object);
  const drop = [];
  root.traverse((o) => {
    if (o.isSprite || o.isPoints || o.isLine) drop.push(o); // need a camera to hit; not roofs anyway
    else if (o.isMesh) o.material = mat;
  });
  for (const o of drop) o.parent.remove(o);
  root.updateMatrixWorld(true);

  // The ray test itself must work: from high above, a house's roof is hit.
  const house = world.buildings.find((b) => b.kind === 'house');
  if (house) {
    ray.set(new THREE.Vector3(house.x, 200, house.y), new THREE.Vector3(0, -1, 0));
    ray.far = Infinity;
    check(ray.intersectObject(root, true).length > 0, `${id}: the ray test misses house ${house.id} from above`);
  }

  const amb = createAmbient(world, scenery);
  for (const l of world.locals) {
    if (l.sit) continue; // sits on a bridge deck, open sky above
    const top = (personLook(l).height + HAT) * PERSON_SCALE;
    const spots = [[l.x, l.y]];
    const car = { x: l.x + 12, y: l.y + 12, heading: 0, speed: 0 };
    for (let i = 0; i < WANDER_S * 10; i++) {
      amb.update(0.1, { car });
      const p = amb.personPos(l.id);
      if (p && i % 10 === 0) spots.push([p.x, p.y]);
    }
    for (const [x, y] of spots) {
      spotsChecked++;
      const g = terrain.heightAt(x, y);
      ray.set(new THREE.Vector3(x, g + 0.5, y), UP);
      ray.far = top - 0.5;
      const hit = ray.intersectObject(root, true)[0];
      if (hit) {
        check(false, `${id}: ${l.id} at (${x.toFixed(1)}, ${y.toFixed(1)}) has something ${(hit.distance + 0.5).toFixed(2)} m up, under the ${top.toFixed(2)} m top of the head`);
        break; // one report per local
      }
    }
  }
}
console.log(`head room: ${spotsChecked} spots checked at ${PERSON_SCALE}x`);
if (fails) {
  console.log(`${fails} head check(s) failed`);
  process.exit(1);
}
console.log('people heads OK');
