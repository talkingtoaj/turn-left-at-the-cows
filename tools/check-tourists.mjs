// Checks each mission's tourist (in the mission's own region) against the world data (src/game/tourists.js).
//   node tools/check-tourists.mjs
// For each tourist: she exists as a flagged local on a drivable spot, her car
// is off the road, the wanted place is not the mission goal, exactly one reply
// is right, the right reply's roads join up and reach the place, and every
// wrong reply's roads stop short of it.
import assert from 'node:assert/strict';
import { regionWorld } from '../src/world/world.js';
import { MISSIONS } from '../src/game/missions.js';
import { TOURISTS } from '../src/game/tourists.js';
import { Collider } from '../src/drive/collider.js';
import { TOPIC_BY_ID } from '../src/world/topics.js';
import { topicMentions } from '../src/game/dialogue.js';

let WORLD = null; // the mission's region, set per tourist
const road = (id) => {
  const r = WORLD.roads.find((q) => q.id === id);
  assert.ok(r, `road ${id} exists`);
  return r;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (r, p) => Math.min(...r.points.map((q) => dist(q, p)));
const gap = (a, b) => Math.min(...a.points.map((p) => nearest(b, p)));

for (const [missionId, t] of Object.entries(TOURISTS)) {
  const m = MISSIONS.find((q) => q.id === missionId);
  assert.ok(m, `mission ${missionId} exists`);
  WORLD = regionWorld(m.region);
  const local = WORLD.locals.find((l) => l.id === t.localId);
  assert.ok(local && local.tourist && local.onlyMission === missionId, `${t.localId} is a tourist local for ${missionId}`);
  assert.ok(TOPIC_BY_ID[t.placeTopic], 'place topic exists');
  assert.notEqual(t.placeTopic, m.goalTopic, 'the place is never the mission goal');
  const town = t.placeAt ? { name: t.placeName, x: t.placeAt[0], y: t.placeAt[1] } : WORLD.towns.find((q) => q.id === t.placeTown);
  assert.ok(town, 'place exists');

  // On a road you can drive, with her car clear of it.
  const first = road(t.choices[0].route[0]);
  const d = nearest(first, [local.x, local.y]);
  assert.ok(d < 8, `tourist is ${d.toFixed(1)} m from ${first.id}`);
  const car = WORLD.landmarks.find((l) => l.kind === 'parked_car' && dist([l.x, l.y], [local.x, local.y]) < 6);
  if (car) {
    const cd = nearest(first, [car.x, car.y]);
    assert.ok(cd > first.width / 2 + 0.95, `car edge clears the road (${cd.toFixed(2)} m from the middle)`);
  }

  assert.equal(t.choices.length, 3, 'three replies');
  assert.equal(t.choices.filter((c) => c.right).length, 1, 'exactly one right reply');
  for (const c of t.choices) {
    // `names` must match the places the words name (so a reply is only offered once you know them all).
    const said = [...new Set(topicMentions(c.text, WORLD).map((q) => q.id))].sort();
    assert.ok(Array.isArray(c.names), `${c.id} has names`);
    assert.deepEqual([...c.names].sort(), said, `${c.id}: names tag matches the words`);
    for (const id of c.names) assert.ok(TOPIC_BY_ID[id], `${c.id}: topic ${id} exists`);
    assert.ok(!/might want to check/i.test(c.notebook), `${c.id}: notebook line stays short`);
    assert.ok(typeof t.sorry === 'string' && t.sorry.length > 0, 'sorry line');
    const roads = c.route.map(road);
    assert.ok(nearest(roads[0], [local.x, local.y]) < 8, `${c.id} starts at her road`);
    for (let i = 1; i < roads.length; i++) assert.ok(gap(roads[i - 1], roads[i]) < 15, `${c.id}: ${roads[i - 1].id} meets ${roads[i].id}`);
    const reach = nearest(roads[roads.length - 1], [town.x, town.y]);
    if (c.right) assert.ok(reach < 60, `${c.id} reaches ${town.name} (${reach.toFixed(0)} m)`);
    else assert.ok(reach > 200, `${c.id} stops ${reach.toFixed(0)} m short of ${town.name}`);
  }
  // Her car and she belong to her mission only: solid in it, not in any other.
  if (car) assert.equal(car.onlyMission, missionId, 'the car is only in her mission');
  const col = new Collider(WORLD, { trees: [] });
  const spots = [[local.x, local.y, 0.2]];
  if (car) spots.push([car.x, car.y, 0.5]);
  for (const [x, y, r] of spots) {
    col.mission = missionId;
    assert.ok(col.circleHit(x, y, r), `solid in ${missionId} at ${x.toFixed(0)},${y.toFixed(0)}`);
    for (const other of MISSIONS) {
      if (other.id === missionId) continue;
      col.mission = other.id;
      assert.ok(!col.circleHit(x, y, r), `not solid in ${other.id} at ${x.toFixed(0)},${y.toFixed(0)}`);
    }
  }
  console.log(`check-tourists: ${missionId} ok`);
}
