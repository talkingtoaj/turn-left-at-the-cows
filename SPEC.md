# Orienteering Driving Game: Spec

Title: Ask a Local (other options: "Without a Map", "I Have No Map")

Status key: **LOCKED** = decided. **TRIAL** = trying, not decided. **OPEN** = still to decide.

---

## 1. Core idea (LOCKED)

A driving game where you never see a "you are here" marker. You find your way using clues, local directions, and a map that is wrong, outdated, or drawn by you. The fun is the moment you work out where you are.

## 2. Tech (TRIAL)

- **Code only, no editor.** Everything is built by vibe coding. (LOCKED)
- **Runs in the browser.** Easy to test and share by link. (LOCKED)
- **Engine: trying both, then picking one.** (TRIAL)
  - **Option A: three.js** (3D, low chase or close top-down camera)
  - **Option B: Phaser** (2D top-down)
- Plan: build the same small test slice in both, compare, keep one.
- Status: both built. Both are kept going for now and share data and logic (`src/world`, `src/game`, `src/ambient`, `src/audio`). Only drawing and UI are per engine.

## 3. Camera (LOCKED: close view)

- Phaser: top-down, **zoomed in close**, so you only see a small area around the car.
- three.js: close top-down or low chase cam. (OPEN)
- Seeing too much from above would act like a map and spoil the game.
- **North-up / heading-up toggle** for top-down views. Heading-up is harder and makes the compass matter. Could become a difficulty setting. (LOCKED)
- three.js chase cam is heading-up by nature. Fog limits how far you see. (LOCKED)
- Possible extras: night driving with a headlight cone. (OPEN)

## 4. World as data (LOCKED)

One data file holds the "true" world. Code builds the playable world and every map from it.

The world contains:
- Roads (paved, dirt), junctions
- Towns, houses, buildings
- Landmarks (water tower, church, old mill, radio mast, lake, etc.)
- Trees, forests
- Creeks, rivers, bridges
- Road signs
- Radio towers

Later: generate worlds from a seed so each game is a new place. (OPEN)

## 5. Navigation mechanics (LOCKED, all six)

1. **Wrong or outdated maps.** Road closed, new bypass, town renamed, bridge gone. The player must notice when a map "lies."
2. **Dead reckoning.** Dash shows odometer, compass, and clock. "Drove 12 km northeast, so I should be near the lake."
3. **Ask the locals.** People give directions that are partly wrong or use landmarks that have changed ("turn where the old mill used to be").
4. **Radio signal.** Each station's strength fades with distance from its tower, so you can roughly place yourself.
5. **Sun and time.** Shadows show your heading if your compass breaks.
6. **Road signs.** Distance signs at junctions let you check your spot on the map.

## 6. Hand-drawn map (LOCKED, new)

Sometimes there is no printed map. The player builds their own.

Flow:
1. Talk to locals. They describe the way in words.
2. Open the map screen. It is blank (or partly filled).
3. **Draw the map yourself** from what you think you heard: roads, turns, landmarks, notes.
4. Drive using your own sketch.

Key points:
- Your sketch will have wrong lengths and angles. That is the point. It is a start, not the truth.
- The game never fixes your drawing for you, and never shows your position on it.
- You can edit the sketch as you learn more (add a landmark you just passed, cross out a wrong turn).

Drawing tools (first ideas, OPEN):
- Pencil line for roads
- Stamps for landmarks (church, tower, bridge, house)
- Text labels
- Eraser
- Maybe: a "?" mark for things you're unsure of

## 6b. Map snapshots and sharing (LOCKED idea, sharing later)

- When the player arrives at a key place (a mission waypoint or the goal), the sketch as it was **before** arriving is saved as a snapshot.
- Mission 1 ends with about 3 versions: the map from Earl's directions, the map after Dot, and the final map.
- The mission-complete screen shows the snapshots side by side with the true map.
- **Later (needs a server):** after finishing a mission, players can post their hand-drawn maps to a shared gallery next to the official map. Other players vote on the best. This rewards honest, hand-made maps. Selling point.

## 6c. Map tool (keep it simple)

The current tool is good. Only small additions:
- Map can be opened during a conversation.
- **Notebook:** a log of everything locals have said, readable next to the sketch.
- **Snapshots** view at mission end.
- Maybe: a dashed line style for dirt roads, and a thick line for main roads.
No layers, no zoom, no measuring tools. Drawing should stay rough and personal.

## 6d. Talking to people (LOCKED direction)

- **You choose the topic.** Topics are names you have heard. Hearing "Creek Road" from Earl lets you ask Dot about Creek Road. Talking opens new questions.
- **Who knows what** depends on each NPC's hidden profile: home, work, usual routes, years living here, when they last went somewhere, and talking style (landmarks, road names, compass, distances).
- **Fame:** big places (towns) are known by many, small ones (a farm) by few. If someone doesn't know the farm, you can ask about the town near it.
- **Long features** (a creek, a road) resolve to the nearest point or crossing to the NPC.
- **Mistakes come from the profile:** Earl hasn't driven Creek Road since the flood, so he describes the old bridge.
- **Crafted plus procedural:** missions and key characters are hand-written. Later, a deterministic generator (seeded per game) gives everyone else directions in their own voice, built from a route on the road graph plus their style and mistakes. Hand-written characters fall back to the generator for topics they have no script for.
- Status: topic menu with hand-written answers first. Generator later.

## 6e. Ambient life and sound (LOCKED)

Best ambient things also give clues.
- Mailboxes with family names (HARTLEY)
- Church bell rings the hour (sound points to town)
- Chimney smoke (see farms from far off in 3D)
- Other cars on the roads (busier near towns)
- Birds fly over, land in trees, scatter when the car comes close
- People wander a little near their spot
- Cows and sheep in fields
- Dust trail behind cars on dirt roads
- Cloud shadows
- Sound: gentle engine (speed and gear), birds near trees, running water near creeks, town murmur near towns, church bell

## 6f. World (LOCKED)

- Roads are smooth curves, not straight lines. They bend around hills and follow valleys.
- Road signs face the traffic meant to read them.
- World data supports bigger maps: road graph, place registry, missions.

## 6g. Missions (LOCKED)

- Hand-made missions on one shared world.
- Mission 1: Ashford to Hartley Farm.
- Mission 2: starts at Hartley Farm, overlaps the first map a little, then goes into new land with more people to ask.
- Each mission can give a printed map with its own lies (1987 county map, or a rough map an NPC sketches for you).

## 6h. Onboarding (LOCKED)

- **Splash page** before the game: title, one line pitch, how it works in a few points, controls, Start.
- **Mission card** at the start of every mission: title, who gave it, the brief, and the goal's name. Never a distance or a direction.
- Small "Goal: <name>" line on the HUD. **H** reopens the help.

## 6i. Countryside fill (LOCKED)

- Rural roads should never feel empty. Fill is made from the world seed when the world is built, so it is the same every run and in both engines.
- What fill makes: fields (wheat, corn, hay, plowed), pastures with cows, sheep or horses, wire and rail fences, windbreak tree rows, hay bales, haystacks, rocks, power poles along paved roads, and deer near forests that run from the car.
- Fill only goes in safe zones: away from roads, water, towns, buildings, landmarks, NPC spots, and mission places.
- **Fill never makes clues.** No buildings, mailboxes, signs or names, since "the second farm on the left" or a "HARTLEY" mailbox must stay true. No new herds of the same animal near a crafted farm's herd.
- Tall corn blocks the view in 3D, which helps the game.

## 7. MVP scope (LOCKED)

1. Drivable car, simple controls
2. Small world from the data file: a few roads, houses, trees, one creek with a bridge, 3 to 5 landmarks
3. Close zoomed camera
4. Dash: compass, odometer, clock
5. One local to talk to, giving directions to a goal
6. Map screen where the player draws their own map
7. One printed map with one lie in it (for comparison)
8. Goal point with a "you made it" trigger and a timer

Not in MVP: good car physics, nice art, big worlds, multiplayer, radio, sun shadows.

## 8. Open questions

- three.js or Phaser? (decide after test slice)
- Is there a story or just separate trips/deliveries?
- Do locals ever lie on purpose, or only get things wrong?
- Can the player find printed maps, and how old are they?
- Fuel or time limits to make getting lost matter?
- Co-op later (one player holds the map, one drives)?
- Gallery and voting for shared maps: what server, and how to stop cheating (tracing the real map)?
