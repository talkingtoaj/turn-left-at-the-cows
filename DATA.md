# World data, missions, dialogue and state

Used by the game (three.js, `index.html` and its alias `three.html`, `src3/*`). The old Phaser 2D version was dropped in Nov 2026.
Read this before touching world data or game rules. No em dashes in code or text.

## Files

| File | What |
|---|---|
| `src/world/data.js` | AUTHORED world (`WORLD_SOURCE`): control points, road-relative signs, everything below. Edit this. |
| `src/world/npcs.js` | People: position, topic-based dialogue, hidden profile. |
| `src/world/topics.js` | Topic registry (`TOPICS`, `TOPIC_BY_ID`). |
| `src/world/spline.js` | Centripetal Catmull-Rom smoothing (`smoothPolyline`). |
| `src/world/build.js` | Build step: `buildWorld(source)` and `defaultSignFacing(world, x, y)`. |
| `src/world/world.js` | `export const WORLD = buildWorld(WORLD_SOURCE)`. Import WORLD from here, never from data.js. |
| `src/game/missions.js` | `MISSIONS`, `currentMission(state)`, `nextMission(state)`, `currentGoal(state)`. |
| `src/game/dialogue.js` | `listTopics`, `greet`, `ask`, `knowsAbout`, `quickTalk`, `getNpc`, `topicLabel`. |
| `src/game/update.js` | `updateGame(state, dt)`, `startMission(state, i)`, `finishMission(state)`. |
| `src/game/snapshots.js` | `takeSnapshot(state, label, extra)`, `copySketch`. |
| `src/game/printedMaps.js` | `printedMapsFor(state)`, `getPrintedMap(id)`, `resolvePrintedMap(def)`, clip helpers. |

All of `src/world` and `src/game` is plain JS (no Phaser, no three). Node can import it, which is handy for checks.

## Units and axes

1 unit = 1 m. x grows east, y grows SOUTH. Headings in degrees, 0 = north, 90 = east, clockwise.
World size is 6500 x 3200. Mission 1 country is x 0..3000 (Fenwick County). Mission 2 country runs east to x 6500.

## Built WORLD (what consumers read)

- `size {w, h}`, `seed`, `start {x, y, heading}`.
- `goal`: LEGACY, mission 1 goal only. Game code uses `currentGoal(state)`.
- `places [{id, name, x, y, r}]`: named spots used as mission goals (`hartley_farm`, `toms_cabin`).
- `towns [{id, name, kind: 'town'|'hamlet', x, y, ambienceR}]`. `ambienceR` = radius of town sounds.
- `roads [{id, name, type: 'paved'|'dirt', width, points, controlPoints, length, curve?}]`.
  `points` is the dense smooth polyline (about 9 m pieces). `controlPoints` are the authored points (after junction snapping).
  Authoring: `snapStart` / `snapEnd: roadId` moves that end onto an earlier road so junctions meet. `curve: false` keeps straight pieces (town streets).
- `creeks [{id, name, kind: 'creek'|'river', width, points, controlPoints}]`: water that blocks the car (also the water sound sources). Includes the Coldwater River and Loon Brook.
- `lakes [{id, name, polygon}]`: Heron Lake, Loon Pond. Block the car.
- `bridges [{id, roadId, creekId, kind: 'bridge'|'covered'|'ford', intact, length, width, x, y, angle, waterWidth}]`.
  x, y, angle are COMPUTED where the built road crosses the built creek; the road is straightened over the deck. Fords are `intact: true` bridges (passable), drawn as a gravel causeway. `b_covered` (covered bridge, Ridge Road) is `intact: false`: its roof fell in.
- `hills [{id, x, y, r, h}]`: 3D terrain bumps placed inside road bends (roads stay flat; terrain blends to 0 within 70 m of roads).
- `outcrops [{id, name, x, y}]`: named rock outcrops on hilltops ("the Grey Stones"), for directions. The rocks are seeded around (x, y) by `src/world/scatter.js`; the district around each is always stony (`src/world/districts.js`). 3D only. Candidate spots: `node tools/pick-outcrops.mjs`.
- `buildings [{id, kind, x, y, w, h, angle, farm?, chimney?}]`. kinds: house, shop, gas, barn, farmhouse, store, diner, cabin, shed (unknown kinds render as houses for now). `farm` groups farm buildings (one yard pad per farm). `chimney: true` = smoke later.
- `landmarks [{id, kind, name, x, y, r?, clearR?, bridgeId?, angle?}]`. Rendered now: church, water_tower, mill_ruin, radio_mast. DATA ONLY (not drawn, no collision solids yet): grain_silos, lookout_tower (on hill `h_lookout`), covered_bridge (sits on `b_covered`, x/y/angle copied from it), quarry (`r` = pit radius), campground. `clearR` = tree-free radius.
- `forests [{id, polygon, density}]`.
- `fields [{id, kind: 'pasture'|'crop', farm, polygon, animals: {kind: 'cows'|'sheep', count} | null}]`: not drawn yet; trees keep off them.
- `signs [{id, roadId, facing, side?, lines, x, y}]`. Authored as `near: [x, y]` + `roadId`; the build puts the sign beside the road on the reader's `side` ('right' default) at half road width + `offset` (default 3 m).
  `facing` = heading of the car meant to read it (its direction of travel). The board faces the opposite way, toward that car. Both renderers rotate boards by it.
  `defaultSignFacing(world, x, y)` (from world.js) gives a default from the nearest road tangent.
- `mailboxes [{id, name, house, roadId, x, y, facing}]`: at the roadside nearest the house; `facing` points from the box to the road. `mb_hartley` says HARTLEY.
- `locals`: NPCs, see below.
- `ambient {bellTower: 'church', birdPerches: 'trees', waterSounds: [creekIds]}`: hooks for sound/animation. Birds perch on scenery trees (`generateScenery(WORLD).trees`).
- `printedMaps {id: def}` and `oldMap` (alias of `printedMaps.county1987`).
- `topics`: the topic registry.

World checks: `/tmp/claude-1000/-home-talkingtoaj-repos-explore/2d1925aa-7969-44f3-b93d-1195f70013f9/scratchpad/p1/check.mjs` (node; may not survive) validated: no solids within road width/2 + 2 m, locals 1.5..20 m from a road edge, signs off roads, every road/water crossing has a bridge, goals reachable on drivable cells.

## Places (current world)

Mission 1: Ashford (start, Earl at the gas station), Creek Road north (old bridge over Willow Creek washed out, Dot fishing there), Highway 9 east and north over the new bridge to Millbrook, Hartley Lane to Hartley Farm.

Mission 2 (east / north-east):
- **Ridge Road** (dirt) north out of Millbrook via Church Street, through **Dunmore Corners** (hamlet, store), to the **covered bridge** over the **Coldwater River** (CLOSED), on to Pond Road.
- **Quarry Road** (dirt) from Dunmore south past the **quarry** to **Route 40**.
- **Route 40** (paved) from Highway 9 east over the river bridge, through **Calder** (town: diner in the old schoolhouse, grain silos, feed store) and on to Brandt (off map).
- **Pond Road** (dirt) north from Calder, through a **ford** on **Loon Brook**, to a fork (Ridge Road west, **Lookout Road** north to the **fire lookout** dead end), then east past the **campground** to **Tom's cabin** on **Loon Pond**.
- **Old River Road** (dirt) from Highway 9 east, **fords** the Coldwater, past the **Okafor dairy**, north into Calder.
- **Pruitt Lane** off Route 40 to the **Pruitt farm** (sheep).

## People (locals)

```
{ id, name, role, x, y,
  greeting: [lines],
  topics: { topicId: { lines: [pages], unlocks: [topicIds] } },
  fallback: [lines],          // "never heard of it" answers
  profile: { home, work, routes: [roadIds], yearsHere, style: 'landmarks'|'roads'|'compass'|'distances', reliability } }
```
`profile` is hidden groundwork for a future procedural direction generator. Code does not use it yet.

Mission 1: Earl (gas station), Dot (fishing at the old bridge). Their original lines are their `hartley_farm` answers.
Mission 2: Mrs Hartley (giver, at the farm; outdated: does not know the covered bridge fell, says "turn left" onto what is really Lookout Road), Gus (Dunmore store; knows the bridge is out, sends you down Quarry Road), Marisol (quarry; compass, distances too long), Bev (diner; accurate: ford, "keep right" at the fork), Hank (grain elevator; distances, about 50% too long), Frank (fire lookout; fixes the left-turn mistake), Ade (dairy on Old River Road; the ford route), Mabel (Pruitt farm; outdated "turn left at the schoolhouse", "up past the fire tower").

## Topics

`{ id, label, kind, fame: 0..1, ref: { type, id } }`. kinds: place, town, road, water, landmark, crossing, farm, business. `ref.type`: place, town, road, creek, lake, landmark, bridge, building, offmap.
Ids include: hartley_farm, ashford, millbrook, creek_rd, hwy9, mill_lane, willow_creek, old_bridge, radio_mast, water_tower, old_mill, church, heron_lake, toms_cabin, loon_pond, ridge_rd, dunmore, covered_bridge, coldwater, quarry_rd, quarry, rt40, calder, diner, schoolhouse (same building as diner), grain_silos, pond_rd, loon_brook, brook_ford, campground, lookout, lookout_rd, river_rd, river_ford, okafor_farm, pruitt_farm, brandt.

## Dialogue API (`src/game/dialogue.js`)

- `listTopics(npcId, state)` -> `[{ id, label, isGoal }]`: every topic in `state.knownTopics`, the current mission's goal topic always first.
- `greet(npcId, state)` -> lines. Adds the NPC to `state.talkedTo`.
- `ask(npcId, topicId, state)` -> lines (the topic answer, or one fallback line, the same one each time for a topic). Adds the topic and its `unlocks` to `state.knownTopics`; appends each line to `state.notebook` (no duplicates).
- `knowsAbout(npcId, topicId)` -> bool (has a real answer). Careful: showing this in UI leaks information.
- `quickTalk(npcId, state)` -> greeting + goal-topic answer. This is what both HUDs use on E for now. **The topic menu UI is still to be built** (use `listTopics` + `ask`).

## Missions (`src/game/missions.js`)

```
{ id, title, giverNpcId, brief: [lines], goalTopic, startTopics, goal: {x, y, r, name},
  waypoints: [{ id, x, y, r, label, snapshotLabel }], arrivalLabel, finalLabel, printedMaps: [ids] }
```
1. `m1_parcel` "A Parcel for Hartley Farm": goal Hartley Farm; waypoint the broken bridge; maps: county1987.
2. `m2_cabin` "Tom's Pills" (giver Mrs Hartley): goal Tom's cabin; waypoints covered bridge, Calder, fire lookout; maps: hartley_sketch, county1987.

## Game rules (`src/game/update.js`)

- `updateGame(state, dt)`: called every frame by both drive loops while not paused (after the car step and near-ids). First time the car enters a waypoint: `takeSnapshot(state, wp.snapshotLabel, {kind: 'waypoint'})`. Entering the goal: snapshot `arrivalLabel` (`kind: 'arrival'`), then `state.won = true`.
- `finishMission(state)`: call when the win screen is closed (both HUDs: Enter). Takes the `finalLabel` snapshot (`kind: 'final'`), pushes the sketch to `state.sketchArchive`, then if there is a next mission: clears the sketch arrays (fresh page, `sketchEpoch++`), resets trip `odometer`/`elapsedMs`, clears `talkedTo`, unlocks input and calls `startMission`. Returns the new mission or null (last mission: sets `allMissionsDone`).
- `startMission(state, i)`: sets `missionIndex`, `won = false`, adds `startTopics`, adds the brief to the notebook, sets `briefPending` (true for missions after the first; the HUDs then show the brief as a dialogue).

Mission 1 ends with 3 snapshots: before the broken bridge, on arrival, final.

## Printed maps (`WORLD.printedMaps`, `src/game/printedMaps.js`)

```
{ id, title, tabLabel, style: 'print'|'hand', author?, bounds: {x, y, w, h},
  include: 'all' | { roads: [ids], creeks, lakes, towns, landmarks, places, bridges, buildings, forests },
  lies: [...], notes?: [{ x, y, text }] }
```
Lie types: hide_road, extra_road (built like a real road, may snap), bridge_intact, simplify_road, rename_road, extend_road, extra_place (`symbol: 'x'` draws an X), extra_lake, extra_landmark, hide_landmark, move, scale. `resolvePrintedMap(def)` applies them, clips to `bounds`, and returns plain lists for a renderer.
- `county1987`: Fenwick County Road Map, 1987. Covers x/y 0..3000 only (the county line), so the east is not on it. Lies: old bridge intact, fake Mill Lane through to Creek Road, no Hartley Lane.
- `hartley_sketch`: Mrs Hartley's pencil sketch. Only her route; Ridge Road nearly straight, covered bridge fine, Lookout Road labelled "Pond Rd" leading to an X for the cabin, east squashed (scale 0.8).
- `printedMapsFor(state)` -> defs for the current mission. `buildOldMap(scene, container, paper, def)` (src/map/oldMap.js) draws either style; default def is county1987. Both map screens show one tab per printed map of the current mission.

## State (`src/state.js`) fields

Existing: `car {x, y, heading, speed}`, `odometer` (per mission), `clockMinutes`, `elapsedMs` (per mission), `inputLocked`, `nearLocalId`, `nearSignId`, `talkedTo` (per mission), `won`, `sketch {strokes, stamps, labels}` (format unchanged).
New:
- `missionIndex`, `waypointsReached: Set('missionId:wpId')`, `briefPending`, `allMissionsDone`
- `knownTopics: Set`, `notebook: [{ npcId, name, topicId, text, missionId, clockMinutes, brief? }]`
- `snapshots: [{ missionId, label, sketch, clockMinutes, odometer, elapsedMs, kind, waypointId? }]`
- `sketchArchive: [{ missionId, sketch }]`, `sketchEpoch` (map screens clear their undo stack when it changes)
- `view: { northUp: true }` (for the map UI)

Debug handles: Phaser `__game.scene.getScene('Drive').state`; three.js `window.__state`.

## Rendering notes

- Phaser draws roads and water into per-chunk Graphics layers (`GROUND_LAYERS` in src/drive/render.js) so only nearby pieces render; `drawGround(g, world, scenery, layer, gTop)`.
- three.js terrain uses spatial indexes (`SegIndex` in src/drive/geom.js) for flattening and water; the ground mesh is about 1.3 M vertices.
- Collider uses `SegIndex` for road surface and water checks. Fords count as intact bridges.
- Core rule still applies: nothing ever shows the player's position on any map.

## Countryside fill (generated, `src/world/fill.js`)
Made inside `buildWorld` from `WORLD.seed`, so it is the same every run and in both engines. See CONTRACT_P3.md section 1 for the safe-zone rules. Fill never makes buildings, mailboxes, signs or names.
- `world.fields` gains procedural entries: `{ id: 'pf_N', procedural: true, kind: 'pasture'|'crop', crop: 'wheat'|'corn'|'hay'|'plowed', polygon, rowAngle, fence: 'wire'|'rail'|null, windbreak, animals: { kind: 'cows'|'sheep'|'horses', count }|null }`. Authored fields get the same keys filled in (`procedural: false`).
- `world.props`: `{ id, kind: 'bale'|'haystack'|'rock', x, y, r, angle }`, all solid circles.
- `world.powerLines`: `{ id, roadId, poles: [{ x, y }] }`. Poles stay on one side, no span crosses a road. Poles are solid (r 0.3).
- Ambient animals: `cow`, `sheep`, `horse`, `deer` (deer roam near forests and bolt from the car, `running: true`).
