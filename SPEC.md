# Orienteering Driving Game: Spec

Title: **Turn Left at the Cows** (LOCKED, Nov 2026; see 9l). Splash title: Rural Route 3 · Ashford; the counties are Fenwick and Harlan (see 9o). "Ask a local" stays as the in-game verb.

Status key: **LOCKED** = decided. **TRIAL** = trying, not decided. **OPEN** = still to decide.

---

## 1. Core idea (LOCKED)

A driving game where you never see a "you are here" marker. You find your way using clues, local directions, and a map that is wrong, outdated, or drawn by you. The fun is the moment you work out where you are.

## 2. Tech (LOCKED)

- **Code only, no editor.** Everything is built by vibe coding. (LOCKED)
- **Runs in the browser.** Easy to test and share by link. (LOCKED)
- **Engine: three.js is the main game.** (LOCKED, Nov 2026)
  - **The Phaser 2D version is dropped** (LOCKED, Nov 2026). Its scenes, renderers and the `phaser` package are gone. `/` is the three.js game; `/three.html` stays as an alias so old links work.
  - Shared logic stays engine-free (`src/world`, `src/game`, `src/ambient`, `src/audio`, `src/drive`, `src/ui`). Engine-free modules nothing uses any more are deleted.
- **No Rapier or real physics.** Car stays arcade. Bumps are visual (car tilts and bobs with the ground, camera shakes a little). Try Rapier on a branch only if this feels flat. (LOCKED)
- **Speed target:** 60 FPS on a normal laptop with built-in graphics, in Chrome. Phones are not a target. (LOCKED)

## 3. Camera (LOCKED: close view)

- (Old 2D version: top-down, **zoomed in close**, so you only saw a small area around the car.)
- three.js: close top-down or low chase cam. (OPEN)
- Seeing too much from above would act like a map and spoil the game.
- **North-up / heading-up toggle** for top-down views. Heading-up is harder and makes the compass matter. Could become a difficulty setting. (LOCKED) The N key was cut on 2026-11-23 (#88); the top view stays north-up.
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
2. **Dead reckoning.** Dash shows odometer, compass, and clock. "Drove 8 miles northeast, so I should be near the lake." (The player sees miles; see 9o and ADR 0001.)
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
- Each mission can give a map with its own lies (1987 county map, or a rough map a local draws for you). Mission 1 gives Darlene's 1987 map (9o).

## 6h. Onboarding (LOCKED)

- **Start screen** before the game: the map on the passenger seat (see 9l). How it works and the controls sit in a "How to play" fold-out, not up front.
- **Mission card** at the start of every mission: title, who gave it, the brief, and the goal's name. Never a distance or a direction.
- Small "Goal: <name>" line on the HUD. Help is a tab on the map screen (H is the horn since #88).

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

(Since MVP: sun shadows exist in 3D. Section 9 adds nicer art, damage and hazards.)

## 8. Open questions

- ~~Is there a story or just separate trips/deliveries?~~ Answered in 9o: you're the relief carrier on Darlene's route; a light story thread comes after the jam.
- Do locals ever lie on purpose, or only get things wrong?
- ~~Can the player find printed maps, and how old are they?~~ Answered in 9o: Darlene's 1987 map in mission 1; it's July 1992.
- Fuel or time limits to make getting lost matter?
- Co-op later (one player holds the map, one drives)?
- Gallery and voting for shared maps: what server, and how to stop cheating (tracing the real map)?

## 9. Next round: sound, look, damage, hazards (decided Nov 2026)

### 9a. Order of work (LOCKED)
1. **Speed fix** first, so there is room to add more.
2. **Sound** runs alongside step 1 (it does not touch 3D code).
3. **Ground fix and world look.**
4. **Damage and hazards.**
Each stream gets its own git branch, one commit per step.

### 9b. Speed fix (LOCKED)
Known causes in 3D (from a code check):
- Pixel ratio up to 2, plus antialias, plus soft shadows. Too many pixels on sharp screens.
- Trees and bushes in 500 m tiles, bigger than the view, drawn whole in both the main and shadow pass. Use smaller tiles or cull per tree.
- Shadow map redrawn every frame.
- Each local is about 10 separate meshes with their own material (about 100 draw calls for 10 people). Merge them.
- Dense terrain (4 m cells) drawn out to 450 to 630 m.

### 9c. Sound (LOCKED)
- **All made-up sounds become real files,** engine included. The engine uses recorded loops at about 3 RPM levels that blend with speed and gear.
- **Sources:** Freesound (CC0 only) for real-world sounds: cows, dogs, horses, birds, water, bells, gravel, town noise. ElevenLabs for hard-to-find loops: engine RPM loops, gibberish voices, damage sounds.
- **License rule:** CC0 or sounds we own outright. Nothing that needs credit.
- **Voices:** Sims-style mumbling. 3 adult voices per gender, 5 to 10 second loops. Each local gets a small fixed pitch shift so no two sound the same. Plays during dialogue, and more quietly as background chatter when you drive slowly past people in town. No old or kid voices for now.
- **Review:** a local dev page (`sounds.html`) plays every sound with keep and redo buttons.
- **AI spend cap:** $5 total for this round. Make a few samples first, ask before going over.
- Keys live in `~/.env`: `ELEVENLABS_API_KEY`, `FREESOUND_API_KEY`.

### 9d. Ground fix (LOCKED)
- Bug: field surfaces and crop rows are strips that sample ground height every 4 to 6 m, while the ground bends every 4 m. On slopes they float or sink.
- **Field soil and grass get painted onto the ground itself.** Nothing to float.
- **Crop rows still stand up out of the ground,** but follow every ground bend and sink a little at the bottom.
- **Standing things** (buildings, troughs, fences) sit at their lowest ground point with a base that sinks into the slope.
- **World checker:** a test that samples every placed thing against ground height and lists anything floating or buried more than about 10 cm.

### 9e. World look (LOCKED, test first)
Middle path between low-poly and realistic, no 3D artist needed:
1. Better light: a real sky image for lighting (Poly Haven, CC0), proper tone mapping, soft shading where things meet the ground.
2. Real CC0 textures (ambientCG, Poly Haven) on simple shapes: dirt, gravel, grass, tarmac, bark, brick, wood, roof tin.
3. AI textures only for gaps (faded signs, painted barn walls, rusty water tower).
4. Real-looking models (Poly Haven) only if the test says it is needed.
- Test on the mission 1 farm area first, with before and after screenshots, then decide before rolling out.
- Models: free CC0 packs (Kenney, Quaternius) for most props and animals; code for things tied to world data (roads, buildings, landmarks); AI models only for a few hero landmarks.
- Dirt roads get bumpy: flatten the ground under them less than under paved roads. More scattered roadside detail (grass, stones, tyre tracks).

### 9f. Damage (LOCKED)
- Parts that break, each changes how the car drives:
  - **Tyres** (potholes, curbs, rocks): flat pulls to one side, lower top speed.
  - **Engine** (head-on hits): less power, smoke, stalls now and then when bad.
  - **Steering** (side hits, big potholes): car drifts off straight.
  - **Compass** (any big jolt): needle wobbles or sticks.
- Hit direction and speed come from the existing collider.
- **Shown through** dash warning lights, the car's look (dents, smoke), feel and sound. No health bar or numbers.
- **Forgiving:** careful drivers never break down. About 3 or 4 hard crashes or lots of fast pothole hits breaks the car. Small low-speed bumps do nothing. Tune by playing.
- **Breakdown:** ~~the mission fails and restarts~~ replaced by a tow (9k): the mission is never lost. Each mission starts with a fresh car.
- LATER: repairs (spare tyre, helpful locals).

### 9g. Hazards (LOCKED)
- Livestock crossing near farms, slow tractors or farm trucks on dirt roads, deer on forest roads (rare), random fallen branches and small logs.
- Each type has its own kind of place. A moving hazard shows up about once every 2 to 4 minutes of driving, picked from what fits where you are.
- **Potholes** are fixed in the world, always visible if you watch the road, more common on dirt roads. Slower means less damage. LATER: hidden potholes in puddles or at night.
- **Fallen trees that close a road** are placed only by mission design, never at random, so a mission can always be finished. This is a "the map lies" moment.
- Hitting things causes damage (9f).


### 9h. Review decisions (LOCKED, 6 Nov 2026)
- **New look becomes the default.** `?look=old` keeps the old look for comparison.
- **Weather:** both cloudy and sunny days, with a gentle change between them over time (not a clearer sky in place of the cloudy one).
- **Trees:** try free CC0 low-poly tree models (Quaternius) behind a switch and compare.
- **Damage and hazard tuning:** keep as is until a full mission has been played.
- **Controls (owner asked for this list on 2026-11-23, #88).** Listed on the start screen's How to play and in the Help tab on the map screen: Arrows or WASD, F, right mouse ("Click and hold right mouse: turn your head"), E ("Talk"), M, T, K, C, H (horn). Working but not listed: Shift (jog), mouse look on foot, Enter (next mission). Cut, so the key does nothing: Space (handbrake), 1-4 (ask about a name), N (north-up / heading-up), comma and period (radio volume), B. The old H help overlay is gone; its content is the map screen's Help tab (`src/ui/help.js`, `src3/map/map.js`). The key hint bar at the bottom of the driving view lists the same keys.
- **Dents and horn:** add visible dents. The horn does not always work: each animal type has a courage chance of ignoring it, high for cows.
- **Road blockers:** a planned fallen tree in mission 2. Cars can usually drive around a tree, so blockers must really block (a spot hemmed in by trees, fences, water or a cutting, or a wider debris spread).
- **Off-road driving** has a tiny damage risk, much smaller than potholes.
- Helper worktrees cleaned up. Push `main` to GitHub after a quick play.

### 9i. Round 2 decisions (LOCKED, 6 Nov 2026)
- **Fallen trees are obstacles, not walls.** No mission-changing road blocks. A fallen tree lies where a tree could really have grown (its root plate in a forest edge, tree row or roadside tree line, never on a bridge or in water) and leaves room to steer around it, slowly, or over the verge. A few are fixed in the world from the seed; they never change a mission's route. The blocker check now makes sure there is always a way past.
- **CC0 tree models are the default.** `?trees=old` keeps the code-made ones.
- **Surface feel tuning stays** (dirt safe speed 58 km/h, grass 32 km/h) until a mission has been played.
- **Cars get more detail and textures,** the player's car first: an era-fitting late-80s car, more shape detail and real materials, keeping dents, tilt, wheels and the flat tyre. Traffic cars get variety too.

### 9j. Round 10 decisions (Nov 2026)
- **2D dropped.** See section 2.
- **Saved progress** in the browser (`localStorage`, key `askalocal.progress.v1`): finished missions with best time and distance. The start screen lists them with ticks, Continue plays the first unfinished one, any finished one can be replayed. `?reset=progress` clears it. Logic in `src/game/progress.js` (engine-free) for the coming splash redesign.
- **Regions.** The world is a set of regions joined in fiction by road (`src/world/regions.js`), each with its own data and seed. Every mission names its region; starting it builds only that region behind a short load screen, and leaving a region frees everything it put on the GPU, so memory stays flat. Region 1 is the old 6.5 x 3.2 km map, unchanged.
- **Region 2 and mission 3: the airfield.** Harlan County round Brandt (4.8 x 3 km), 22 km east along Route 40. Mission 3 (from Tom Hartley): take a magneto to Kestrel Field, a grass strip north of Route 40 that no highway sign points to. The town only knows the planes; Peg sends you down Field Lane, fenced off since 1984; Dagny at its end says go round, or watch the planes.
- **Planes as a clue.** Light singles fly circuits (take-off into the wind, crosswind, downwind 800 m to the side along Route 40, base, final, landing, touch-and-goes), sometimes depart and curve away, and come back later. One is up most of the time, sometimes two. Wind (and so the landing direction, shown by the windsock) comes from the seed. Deterministic from the seed and the game clock. The drone is positional with distance, Doppler and throttle: near the field, never exactly on it.

### 9k. Breakdowns end in a tow (round 11, Nov 2026)
A critic worried that getting lost and then breaking down feels stressful. Breakdowns are now gentle and a bit funny, but still cost something.
- **Before the breakdown nothing changes:** handling, warning lights, smoke and stalls build up as in 9f.
- **The tow scene** (`src3/tow3d.js`, rules and words in `src/game/tow.js`): once the broken car has rolled to a stop, a banner says what went ("Broken down. The engine coughs, rattles and dies. Someone's bound to come along."). After about 2 s a low-poly tow truck (red cab, yellow boom, amber light bar flashing) drives in from behind along the nearest road, passes on the left, swings in ahead and backs up to the car. The driver, a local with a gibberish voice, says one line with a subtitle (Enter goes on). A chain rattle, the winch lifts the car's front, fade to black, a card ("Towed to Ashford. Earl at the garage patched her up..."), fade back in. About 22 s in all; Enter skips each part.
- **Drivers:** Wade (Fenwick County), Junie (round Brandt). Ten short country lines, picked from the region seed, the mission and how many tows so far (so a second tow says something new).
- **Where you end up:** the nearest town (not a hamlet) in the current region. A town with a gas station (Ashford, Brandt) parks you by the pumps; the others (Millbrook, Calder) at the roadside in town. Mechanics: Earl (Ashford), Lou (Brandt), Nell (Millbrook), Sid (Calder).
- **The car:** fixed (all parts 1, dust washed off), but the worst dent stays as a small scuff.
- **What it costs:** the game clock and the trip timer move on 30 minutes plus 6 per km towed, in 5 minute steps, at most 60. The odometer stays (you did not drive it). The mission, notes, map and talk all carry on.
- **Counted:** `state.tows` per mission (reset when a mission starts). Saved with each finish as `tows` in the progress record (`src/game/progress.js`, same key, old saves read as 0) and on the result object `state.lastRecord`, for the share postcard ("towed twice": `towedText(n)` in `src/game/tow.js`). The win screen shows a "Towed" row when it is not 0.
- **Sound:** the truck's diesel idle (positional, louder as it comes, pitched up while it drives), a chain rattle as it hooks up and a winch ratchet. All CC0 from Freesound (see `public/sounds/SOURCES.md`).
- **Dev:** `?breakdown=1` breaks the car down at once (skips the mission card). `window.__tow`: `phase`, `hold = true` freezes the scene, `skip()`, `breakdown()`.

### 9l. Name, look and start screen (LOCKED, 7 Nov 2026, after critic round 1)
- **Name: Turn Left at the Cows.** Chosen knowing there is a children's book called "Turn Left at the Cow". World name: **Ashford County.** "Ask a local" stays as the in-game verb and wording. Code names and the save key `askalocal.progress.v1` stay as they are.
- **Taglines.** Main: "There was a time before GPS, when finding your way required you to ask a local." Pitch (meta description, landing copy): "GeoGuessr, but you drive, and the locals might be unreliable." Short, used sparingly: "Get directions. Get lost. Find it anyway."
- **Look: "paper on the dash".** Dash #1c1d1f / #3a3c40, amber #e6b450, paper #f1ead6 / #d8ccb4, graphite #4a4a48, ink #3a3128, barn red #b3261e, sky #6f9fb8, straw #d9b45a. Fonts (Google Fonts): Caveat for pencil writing (also the in-game map's handwriting, which fell back to Comic Sans on Linux and Android), Oswald for dash labels and the title, Georgia or Libre Baskerville for printed map labels. Logo: the title on a cream road sign with a pencilled arrow; icon: a turn-left arrow on the sign with a red map pin (`public/favicon.svg`, PNGs beside it).
- **Start screen: the map on the passenger seat** (`src/ui/splash.js`). The top is a windshield; below it the dash, a notepad with the jobs and the big button, and a hand-drawn paper map with a coffee ring, a pencil and a compass. Finished jobs are ticked on the map with the best time pencilled beside them; the next job is circled where it starts; unfinished jobs are only ever marked where they start, so the menu never gives a place away. The map is a loose sketch: it names only Ashford (where you start), the two counties and places already found; no real roads, rivers or other towns. Continue (Play for a new player) is the biggest thing and is focused. The ignition key beside it only plays an engine sound. New players get one short, skippable moment of a local at a fence saying "Oh, you can't miss it" (silent, never blocks Play, once). Returning players go straight to the map with Continue.
- **Live world behind the windshield.** The menu shows at once as plain DOM. Right after its first paint the game code, textures and the first job's region start loading (the old screen only loaded after Start); sounds are fetched after that. When the region is built, the world fades in behind the glass: the camera stands above the job's start and turns about 1 degree a second, about 30 frames a second, drawn only into the windshield. No car, no sound, no game clock (so no weather change); ambient life, the mast light and planes go on. Reduced motion: a still frame. A weak device (2 cores or less, 2 GB or less, Save-Data) or no WebGL keeps the painted scene; a device that draws the menu too slowly drops to a still frame. Continue then only places the car; if the region is still building, its load screen shows.
- **Load screen** between regions: dash black, a generic pencil doodle (compass rose, road sign, the car, a cow, a coffee ring) sketched in as it loads (strokes follow progress), the trip odometer rolling as the progress number, one line from a local in Caveat. No spinner. Never the region's real map: that would give away what the player is working out.
- **Must-haves.** Real buttons with focus rings and a sensible Tab order; the title is the page's h1; text over the moving world sits on paper. Sound starts only inside a real click (one shared AudioContext, `src/audio/context.js`); mute (K or the dash button) is remembered. Touch-only devices (no mouse or trackpad) get the map and "Made for keyboard on a laptop or desktop" with a share / copy link button instead of Play, and load no game code. Page title, meta description, Open Graph and Twitter tags with a 1200x630 image (`public/og.jpg`), favicon, apple-touch-icon, canonical (set `SITE_URL` at build time for absolute links). If progress cannot be written, the menu and the mission-complete screen say so; after the first finished job the game asks the browser to keep its storage (`navigator.storage.persist()`).


### 9m. On foot, talking, tips and thunder (round 12, Nov 2026)
- **Getting out.** F gets you out when the car is stopped or nearly (under 1 m/s), at the driver's door (left side; else the other side, behind or in front). F within about 2 m of the car gets you back in. On foot: first person at eye height (1.65 m), WASD walk (1.4 m/s), Shift jog (3 m/s), mouse look with pointer lock (click to capture, Esc lets go; left-drag also looks if the browser will not capture), full turn and up and down to 85 degrees, so you can look up at a plane. Hold the right mouse button to squint (the view narrows from 70 to 30 degrees) at a far plane or tower. Arrow keys turn when the mouse is free. You follow the ground (and bridge decks), bump into buildings, fences, trees, rocks, poles, people, traffic and the parked car (the car's own collider), and cannot walk into creeks or lakes. Footsteps on grass, gravel (dirt roads) and paved roads (CC0). The parked car keeps idling where it stands (its engine is positional and quieter with distance); traffic waits behind it; the world (birds, deer, traffic, the locals turning to you, sounds, signs) follows you instead of the car. The map never shows where you are. Getting in and out eases the camera over 0.35 s. Rules in `src/game/onfoot.js`, mouse and camera in `src3/onfoot.js`.
- **Turning your head in the car.** Hold the right mouse button and move the mouse: up to 100 degrees left or right, 35 up, 15 down; it eases back to the front when you let go. Chase view only; C still switches cameras (not on foot).
- **Dash on foot.** It sinks a little and dims to a third; the compass stays bright and turns with where you look (keeping the car compass's fault, if any), so bearings still work on foot. A short prompt line says what E or F would do now.
- **Talking (replaces the numbered topic menu).** Only on foot, within 3 m and facing the local (40 degrees either side). E: they greet you and at once answer about the current job's goal (or say they don't know). Names in their lines that are topics here (`src/world/topics.js`, the label without "the" plus `aliases`, only topics in this region) are underlined; click one to ask (the 1-4 keys were cut, #88). At most 4 per page, the first ones mentioned; the topic being answered is not offered again. "Ask about..." (or A) opens the notebook's list of every name heard, goal first, with type-to-search (Up/Down, Enter, Esc). E goes to the next page, and on the last page says goodbye. Every line still goes in the notebook, with the gibberish voice and subtitles. Logic in `src/game/dialogue.js` (`openTalk`, `topicMentions`, `topicChoices`), the box in `src3/hud/talk.js`.
- **"What's that?"** On foot, the thing in the middle of your view with a topic (towers, the mast, elevators, windpumps, named outcrops, churches, the mill, the quarry, the airfield, named farmhouses, and the planes in the sky) within 600 m (planes 4 km), found by an angle test with a line-of-sight check over the ground (`src/game/lookables.js`). With a local within 3 m (and not facing them, unless you are looking at a plane), E asks them "What's that?": someone with lines about it says them; otherwise, if they know it (by the topic's fame, the same every time), they name it, and you can now ask others about it; else "Couldn't tell you". With no one near, E writes a note to yourself: the name if someone has told it to you ("St. Anne's Church, to the west. Something to ask about."), else "Hm, what's that? Something to the west, a few hundred metres off." The game never names a thing nobody has named to you. New topics: the five windpumps, the twelve named outcrops and St. Luke's Church in Brandt (nobody has written lines for them yet; locals name them by fame).
- **Tips** (`src/game/tips.js`, data-driven; drawn by `src3/hud/tips.js` as a pencilled paper tag at the top left). Each tip has a condition on a small context main.js fills every frame, and a most-times count; one at a time, up for 6 s, 10 s quiet between tips, the same one not again within 90 s. Tips now: get out to talk (driving near a local), walk up and face them, F to get back in, click to look around, plane heard (get out and look up; in the car, hold the right mouse button; on foot, squint), rain grip, warning lights, click a name, M to sketch. Remembered in `localStorage` key `tlatc.tips.v1` (every access in try/catch). "Show tips while I play" in How to play turns them off; `?tips=off`, `?tips=reset`.
- **Thunder and lightning** (`src/game/thunder.js`, `src3/world3d/lightning3d.js`). Only in heavy rain (rain 0.7 or more). Game time is cut into 12 s slots; each slot may have one strike (25 % at 0.7 rain up to 70 % at full), 0.5 to 8 km off (far ones more common) in a seeded direction, all from the world seed and the wetness clock, so a mission's storm is the same each time. The flash: a cold ambient light (always in the scene at 0, so no shader compiles mid-game) and a pale screen veil, two or three flickers in half a second, stronger when close; a jagged bolt drawn in the strike's direction (moved inside the far plane and scaled, like the planes). Reduced motion: one short flash at a third of the strength, no bolt. Thunder arrives 3 s per km later: close strikes (under 1.8 km) crack, far ones rumble low (lowpass from about 8 kHz close to 300 Hz at 8 km, quieter, slower). `?thunder=now` forces a strike 1.2 km off as soon as the game runs; `window.__lightning.strike(...)`, `window.__thunder.force()`.
- **Sounds** (all Freesound CC0, checked through the API, see `public/sounds/SOURCES.md`): 9 footsteps, 4 thunder. No ElevenLabs this round ($0.00).
- **Fix:** `#ui > *` gave the full-screen HUD and tow layers `pointer-events: auto`, so they swallowed clicks meant for the 3D view and the old dialogue; both are now click-through again.

### 9n. Sharper sky and storms you can see (round 13, Nov 2026)
- **Sharper sky.** The two Poly Haven skies (cloudy, clear) are also baked from their 4k HDRIs to 4096 x 1024 webp (`public/look/sky_4k.webp`, `sky_sunny_4k.webp`, 340 KB for both; `tools/look/bake_sky.py ... sharp` keeps the small sky's turn and brightness). The small 2048 x 512 skies still paint the first frames; once the game starts (`startGame`) `look.sharpenSky()` downloads both, decodes them off the main thread, uploads them with mipmaps and swaps both in together, so the weather keeps blending a matching pair, then frees the small ones. The sky shader picks the mip level from derivatives that skip the jump where u wraps (no seam), and dithers its output a little against banding. Texture memory for the skies: 8 MB before, about 43 MB after (two 4096 x 1024 RGBA8 with mips). Phones and low-memory devices (deviceMemory under 4, touch-only) keep the small sky; `?sharpsky=0|1` forces it.
- **Storms you can see.** The bolt read only as a faint outline on the pale rain sky. Now, in heavy rain (from rain 0.6, full at 0.8) and for 40 s after any strike, a storm darkness (`lightning.storm`, eased in and out over about 5 s) darkens the sky dome (to 45 % less), the haze and background (to 50 % less) and the sky light (to 30 % less), on top of the rain's own darkening; never black. The bolt is a white-hot core inside a soft blue glow, and the cloud base around its top lights up: one additive mesh, one draw, only while a flash is on (`src3/world3d/lightning3d.js`). Far bolts are drawn a little wider (up to 2.2 times at 5.5 km) so they still read. The screen veil is a little softer (at most 0.35) so it does not wash the bolt out. Reduced motion: unchanged (one soft flash, no bolt).

### 9o. Whimsy polish and Game Off 2026 (LOCKED, 14 Nov 2026, after critic round 2)
Source: `docs/reviews/2026-11-14-critic-round-2-whimsy.md`, the owner's 1 to 5 ratings of every idea, then a grilling session. Terms are in `GLOSSARY.md`; decisions that are hard to undo are in `docs/adr/`.

**Review rule for words (LOCKED).** Every new line of dialogue or story (locals, radio scripts, tow lines, win-screen lines, notebook lines, intro, taglines) first gets a pass with the remove-ai-style skill, then the owner reviews it in an artifact. Only approved lines ship. Lines the owner wrote need only a punctuation tidy.

**Setting and story**
- **Present day: July 1992.** Darlene's 1987 map is five years out of date. Real 1992 news (Olympics, Perot, line dancing) is fair game for the radio.
- **The player is the relief carrier,** covering Darlene's rural mail route in their own car while her wrist heals. Missions are favours for people on the route.
- **Intro card,** shown once after Start and before mission 1's card, on a note in Darlene's style, readable again from Help. The owner's text: "Darlene asked if you can cover her shift, but she only had a map for you five years out of date. 'This'll help,' she claimed, 'but the county's shifted since then. If you get lost, just ask a local. They'll know the way.'"
- **Names.** Region 1 is Fenwick County, region 2 is Harlan County, Ashford is a town. The splash map title "ASHFORD COUNTY" becomes **"RURAL ROUTE 3 · ASHFORD"** (supersedes the world name in 9l).
- **Theme (Game Off, SHIFT).** Main angle: the maps are out of date. Second: you're covering a shift. Splash map: a printer's stamp "CORRECT AS OF 1987" with Darlene's pencilled "ha." beside it. Tagline: see 9p (the cow tagline and subline are dropped).

**Maps**
- **Mission 1 gives Darlene's map** (`county1987`) with lots of gaps: roads and lanes built since 1987 left off, the washed-out bridge shown as fine, Mill Lane drawn through. This reverses the 7 Nov choice that mission 1 starts with no map. The mission 1 brief is rewritten to match.
- Mission 2 keeps Mrs Hartley's map; mission 3 has none (Darlene's map stops at the county line). `harlan1979` stays unused for now.
- **Words:** a *map* is anything handed to the player; a *sketch* is only what the player draws. Mrs Hartley's tab label becomes "Mrs Hartley's map".

**Traps: how maps and locals mislead (LOCKED).** Mission authors pick one or two traps per mission from this list; the difficulty ladder uses more as it goes. **Every trap has a fair tell** that an observant player can catch. Mission 1 uses a counting trap: Darlene's map leaves off the farm lane, so if that lane comes before the real turn it gets a mailbox as its tell.

| Trap | How it misleads | Its tell |
|---|---|---|
| New driveway | The map says "5 miles, then first left", and a farm driveway built since shows up at 3 miles. | A mailbox at the driveway; no centre line; a farmhouse at the end. |
| Junction missing from the map | A crossroads built after 1987 throws off "the third turning". | A road sign at the real junction. |
| Side left out | "Second left at the silos." The silos are on the right, and there is also a right turn there. | The silos can be seen from the approach; a second local or the road sign at the junction. |
| Two of a thing | "Turn at the church" means the local's church, but another church comes first. | Names painted on signs (St. Anne's, St. Luke's); the local said "our church"; "What's that?" names each. |
| Distance as time | "Ten minutes on", from someone who drives a tractor at 15 mph. | The tractor stands beside them. Their line mentions it, so "the tractor" is an underlined topic you can ask about ("Does fifteen, downhill."). Most players won't ask. |
| Wrong scale | A map drawn by a local is stretched or squashed (the `scale` lie). Only on maps locals draw, never on the player's sketch. | The odometer against the map; distances on road signs. |
| T vs Y | The map draws a T junction; the real road is a Y fork with both ways bending. | Both roads can be seen as you come up to the fork; a road sign at the fork. |
| Gated lane | A through road on the map is now a farm track behind a gate. It looks private, but it's fine to use. | The gate stands open; a "PLEASE SHUT THE GATE" board; tyre tracks through it. |
| Name changes partway | A road changes name at the county line or a junction, and the map or the local uses only one name. | A road sign with the new name at the change. |

**Look, time and dash**
- **Colour grade** inside the existing `CustomToneMapping` (olive and straw greens, warm highlights, slightly teal shadows, lifted blacks, soft vignette, light grain), **cream fog** at the same distances. Rural paved roads lose the white edge lines; the centre line fades. Keep 60 FPS; before and after shots.
- **A fixed hour and a fixed sun per mission:** mission 1 at 09:00 with morning mist, mission 2 at 16:00, mission 3 at 18:30 golden hour. No day/night cycle, no headlights.
- **The clock runs at real speed** and shows 4 minutes fast. Missions have no time limit; the sun stays fixed however long one takes. A tow still moves the clock on (9k), and the trip timer with it.
- **No in-car view.** The dash is the bottom panel over the chase view. Restyle it to match the splash (Oswald labels, round needle speedo, rolling odometer, domed warning lamps) and make it smaller. The goal sits on a Caveat paper tag at the top left. Key hints fade after about a minute; H brings them back. Leave a slot for the radio dial. Optional: the compass restyled as a stick-on ball compass that wobbles.
- **Miles everywhere the player looks** (dash, road signs, local lines, tow card, load screen); world data stays in metres (ADR 0001). Road signs show whole or half miles ("ASHFORD 2½").
- **Signs: words painted on every board** (road signs, mailboxes, hand-painted signs) as textures. No sign pop-up on the HUD and no "back of a sign" note: slowing down to read is part of the fun. If a road sign can't be read from about 15 m on a laptop, the board gets bigger. Hand-painted signs only at crafted places: "EGGS. Honest box.", "SLOW. Children, dogs, Walt.", "NO PLANES." on Dagny's fence.

**Writing** (all under the review rule)
- Earl rewritten: he is the first voice and the flattest; a habit hints at his mistake ("Haven't been up Creek Road since Easter, but roads don't move"). Hank always rounds up.
- The person you deliver to says one warm line on the win screen.
- Tow drivers react to who you've talked to (`state.talkedTo`).
- Every distance in local lines moves to miles and feet.
- **"Turn left at the cows"** is said wherever a herd really is: the cows are there when the line is used. Any mission, later is fine.
- Load-screen quotes are credited to their speaker once you've met them.

**Radio** (builds navigation mechanic 4)
- **2 stations for the jam:** one from the existing mast near Ashford, one from a new mast near Brandt. Static between stations; strength fades with distance from each mast.
- **Per station:** 11 spoken pieces (3 DJ links plus a traffic report on Ashford or a Thought for the Road from the pastor on Brandt, farm report, swap shop, weather and wind report, 2 ads, local notices and birthdays, 1 local guest spot) and 5 music files (a jingle and 4 tracks).
- **Who makes what.** The owner makes the music and the ElevenLabs speech. Agents write the segment list and scripts; scripts reach the owner for review by 19 Nov; the owner's first batch of audio arrives by 24 Nov, one MP3 per segment, named from the segment list.
- **Voices.** Real English on air, with subtitles. Locals you can meet come on air only rarely (about one guest spot per station), talking their usual gibberish with no subtitle while the DJ answers as if it all made sense; the DJ's reply can carry a small clue.
- **Rules.** A station names only its own home town and never gives a live "here" report. No music anywhere except the radio; never background music by area.
- **AM sound baked in.** A tool turns the owner's files into AM-radio quality before they ship (band-pass about 300 to 3400 Hz, mono, low sample rate, low bit rate), which also makes them small. The game adds static and weak-signal muffling live. The full-quality masters stay outside `public/`.
- **It tunes itself; the player only sets the volume.** No player tuning. The radio always plays the station you can hear; signal is distance only from each mast (no line of sight). Driving to the other county the station fades into static, then there is a stretch where neither comes in, just static. Once the station is lost and another would be heard (the same heard levels and 1 second hold, so no flip-flop at the edge), the needle sweeps across the dial by itself in about a second, with tuning static on the way, and lands on it. A mission starts on the home station of the county you start in. The dash dial only shows the needle and number.
- **Volume and power.** A small knob on the dash radio (drag it, or the mouse wheel over the radio). The comma and period keys were cut (#88). 0 to 100%, starts at 70%, remembered between visits. 0% darkens the lamp like off. T is a quick on / off that keeps the volume. The global mute silences everything. 100% is about 2 dB over the loudest sound around you (the engine at full throttle).
- **Out of the car.** Getting out fades the radio out in a quarter second and it counts as not heard (its loop waits, as below); the subtitle card hides. Getting back in fades it in. On / off and volume are kept.
- **Lightning.** A strike crackles on the radio the moment it happens (the thunder comes later): loud and about half a second when close, a faint tick when far. Only while the radio is on and can be heard. Made from noise; no audio file.
- **Streamed, not preloaded.** Only a station you can hear loads, one segment at a time with the next fetched in the background. Losing it (signal buried in static for 1 second, the dial moving off it, radio off or at 0%, or getting out of the car) stops it. Getting it back after 5 seconds or more picks up 3 seconds into the next item (1 second for talk); a shorter gap carries on as if it kept playing. Each mission starts every station at the start of a random item.

**Tourist**
- One per mission at a fixed spot, easy to miss and sometimes off the main way: an easter egg. They ask the way to a place that is never the mission's goal. Three replies written the way locals talk, at least two of them sounding right.
- Either way the win screen gets a green tick with a funny line written per mission: "Helped a tourist from Miami. Spreading good vibes." or "Misdirected a pesky tourist. Keeping Ashford safe from rubber-necks." Mission 2's tourist is a lawyer looking for a married local's farm ("Saved [local] from being served divorce papers."). A notebook line too. No score.

**World**
- About 12 hand-placed props at crafted places: a flapping clothesline, a tyre swing, a cow-painted mailbox (Hartley); round-top pumps and a wall ad (Ashford); a diner OPEN sign (Brandt); a windsock and a checkered tank (Kestrel Field); a corn stand with an honesty box, a church letter board, a junk car in the weeds. Locals can give directions by them.
- Small CC0 sound layers: insects, wind in tall grass, a screen door and chimes at farms, a distant tractor, body creaks on dirt roads, turn-signal tick, ignition clunk, window wind, a dog barking at some farms.

**After the jam (decided, not scheduled)**
- **Ray's joy flight.** After you deliver the magneto, Ray offers a ride. No goes straight to the win screen. Yes: take-off, Ray flies, you look around, and the win screen comes 1 to 2 minutes after the wheels leave the ground.
- **The lookout.** Frank's fire lookout: walk up, climb, and get a clear look round from the top with no fog, labels or markers. The sketch can be opened up there. Always open; Frank mentions it in mission 2.
- **One farm dog** that trots along its own fence as you pass (built on the existing animal poses, no chasing), usable as a clue.
- **Story:** the Tom, Dagny and barley thread as optional side topics, plus Darlene's running gag ("Darlene'd have known that.") and one pencilled inner-voice line per mission.
- **Difficulty ladder for missions 4 and up:** each mission takes one aid away and teaches the skill that replaces it. Mission 4: odometer broken (time it against your speed). Mission 5: the map torn in half. Mission 6: compass cracked (read the sun). Mission 7: no map (use the radio masts). Tricky locals and spun signposts as seasoning.
- Also later: wordless roadside fill (wildflower verges, ditches, leaning posts, tar patches), cargo sliding on the dash, Dot fishing off the snapped bridge, mission 4.
- **Parked:** gossip, sketching on found paper, more greetings per local, the share postcard, glovebox, scrapbook keepsakes, disposable camera, mud as a clue, truck drivers waving, horn reactions, the farmer who reacts more each time, porch radio and jukebox.

**Game Off 2026** (theme SHIFT; submissions close 1 Dec 13:37 PST)
- We enter. The entry says plainly that 15 and 16 Oct were a prototype and November is the jam work, and says how AI was used.
- ~~Public domain (CC0) for the code~~ Replaced 28 Nov 2026: the whole repo, code included, is source available, all rights reserved (owner's call, to keep a commercial version possible; Game Off allows source available). Art, sound, music and writing stay all rights reserved.
- 28 Nov: a full secret scan (gitleaks), LICENSE and README, then the repo goes public only on the owner's go-ahead. Submit on itch.io on 29 Nov.

**Work lanes.** One branch per lane; each item becomes a ticket. Lanes that add world data each use their own data file so branches don't collide in `data.js`.

| Lane | Week 1 (15 to 21 Nov) | Week 2 (22 to 28 Nov) |
|---|---|---|
| A. Look | colour grade, cream fog, rural road lines, fixed sun per mission | buffer |
| B. Dash | slim restyle, goal tag, hint fade, miles on the dash, real-time clock 4 min fast | radio dial slot |
| C. Writing | Earl, arrival lines, tow lines, intro card text, miles in lines, year and names tidy, radio scripts (by 19 Nov) | cows line, tourist lines, load-screen credits |
| D. Signs and maps | painted words on every sign and mailbox, pop-ups gone, splash title and stamp, Darlene's gappy map in mission 1 | buffer |
| E. Radio | core: 2 stations, static, fade, AM tool, streaming, placeholder audio (from 20 Nov) | the owner's audio (24 Nov), subtitles, guest spots |
| F. World | the cows where the line is used | about 12 props, sound layers |
| G. Tourist | | tourists in missions 1 to 3, win-screen ticks |
| H. Release | | secret scan, license, README, itch page, AI note, public on 28 Nov, submit on 29 Nov |

Critical path: radio scripts (C, 19 Nov), then recording (owner, 24 Nov), then wiring in (E, 25 to 26 Nov). If we fall behind, drop in this order: props, sound layers, the mission 3 tourist, radio guest spots.

### 9p. Fix the map: playing the shift (LOCKED, 15 Nov 2026, after critic round 3)
Source: `docs/reviews/2026-11-15-critic-round-3-theme.md`. All five critics said the shift was told on cards, not played. The owner's framing: "the world has shifted, the map is out of date; there was a time before GPS."

- **Your own map first, Darlene's in its own tab** (changed 23 Nov 2026 at the owner's request after a playtest, #87; this replaced "mission 1: you draw on Darlene's map"). Every mission draws on your own sketch, and the map screen opens on it so drawing is clearly expected. Mission 1's sketch starts with a few marks already drawn in the same pencil and stamps as your own: Ashford (house stamps), the gas station, the street you start on, and a short piece of Highway 9 labelled "Highway 9" (the only label). Darlene's 1987 map is its own tab ("Darlene's map"), to look at only, like the printed maps of missions 2 and 3.
- **Things that shifted.** Each printed map that is out of date lists its *shifts*: real changes in the world since it was printed, each with a short label, where it is, and how close you must come to count it as seen (simple distance, in the car or on foot). The player sees a shift by coming near it; their pencil marks are not graded. Only true changes count, not map-printing mistakes or bad directions.
- **Win screen (and the marketing screenshot).** For a mission whose printed map has shifts, the win screen shows the printed map beside the same county as it really is in 1992, with each shift circled and its label, ticked if you saw it. A count reads "Things that shifted: 3 of 5". Missions without shifts keep today's win screen. A dev URL flag opens this screen straight away for screenshots.
- **Road names (real early 1990s history).** Counties gave names to roads that went by numbers. Darlene's 1987 map shows Ridge Road as a county road number; the 1992 sign says Ridge Road; some locals still use the old number. This replaces hiding Ridge Road (Mrs Hartley's grandfather drove cattle on it, so it was always there).
- **Each shift is believable and visible.** Quarry Road is a haul road built in 1989 (the quarry is older). Mill Lane used to go through to Creek Road until the quarry closed it ("It never did" is wrong). New lanes since 1987 get a tell you can see (fresh gravel, a newer mailbox). Private farm lanes that county maps never showed (Hartley Lane) are not shifts.
- **Mission 3 gets the 1979 Harlan County map** (`harlan1979`, tab "Old county map") instead of no map, with its own shifts.
- **Tagline** (the owner's words, splash, itch short description and page meta): "It's 1992, you have no GPS and a map five years out of date. Things have shifted in that time. You just might need to ask directions from the locals." The cow tagline and the "Even the cows" README line are gone.
- **American English is the standard** for every word the player sees or hears (Mom, railroad, tire, "watch for"). Identifiers and docs may stay as they are. Changed lines go through the review rule as edits.
- Not chosen: dating the bad-direction traps, an extra shift placed near the start of mission 1, rewriting the mission 1 brief and theme paragraph, the splash stamp wording.

### 9q. Busier world, better traffic (LOCKED, 22 Nov 2026, grilling round)
The owner compared the game with shots from other indie games: a hillside thick with grass tufts, rocks and cows, and boxy trucks with roof racks, jerry cans and spare wheels. The game looks bare next to them, traffic makes no engine sound, the traffic cars are plainer than the player's, and traffic drives through junctions in a way no one would.

- **Keep the 9e look** (real textures on simple shapes) and make it busier. No switch to flat low-poly.
- **Models are built in code** like the current cars, so dents and the one-mesh-per-type traffic keep working. CC0 packs only for small props such as jerry cans.
- **Sound:** Freesound CC0 first, ElevenLabs for the gaps, $5 cap for this round, the owner keeps or redoes each sound on `sounds.html`.
- **Every ticket** brings before and after shots and holds 60 FPS on a laptop with built-in graphics (see 2).
- **Tier 1 is picked by what a player notices in the first minute** of mission 1: their own car, the ground beside the road, their engine, the cows, a car or two going by. Tier 1 lands before the public build on 28 Nov; tier 2 comes after the jam.

**Tier 1, in order**
1. **Roadside.** A carpet of grass blades near the camera that sways in the wind and fades out with distance (the tussocks stay for the far view); pebbles and tire ruts along dirt roads; tall weeds along verges and fence lines.
2. **The player's car.** A roof rack with a couple of parcels strapped on (Darlene delivers packages), mud flaps, a dent or two.
3. **Cows.** Crisper facets, patches that differ cow to cow, an udder, a head-down grazing pose.
4. **Junctions.** Traffic slows before a turn and follows a curved path in its own lane; blinks the amber lamp a few seconds first; stops fully at a STOP sign where a dirt or minor road meets a paved one (paved roads never stop) and goes when clear; waits for cars already in the junction and for the player; at dead ends and broken bridges makes a three-point turn (the one it uses after honking), never a flip on the spot. STOP signs stand at every minor-to-paved junction: red octagon, painted word, a slight lean on rural roads. They are not a map trap tell. Where a paved road simply ends and a dirt road carries straight on (only the surface changes), there is no STOP sign: that is not a junction. A car held up (by the player or by other cars, at a junction or in a plain queue) rolls once a second: a chance to honk and a honk length that both grow with how long it has waited, and from about 10 s a growing chance to give up and turn round. Cars honk at each other too. Only one car in a jam turns round at a time. Seeded, so runs repeat (owner, 22 Nov 2026).
5. **Engine sounds.** Diesel on trucks and pickups, a quiet petrol hum on sedans, wagons and hatches, heard in 3D with a pitch drop as they pass. One review pass on the player's 3 engine loops; replace only the ones the owner marks redo.
6. **Wildflowers and clover** patches.
7. **Rain that reads, and a first mission that clears up** (#51). Fewer, longer (1.5 m), brighter rain streaks with a wind slant, one draw. Drops on the lens in rain (one screen-space draw; they land, hold, run down a little and fade; fewer as the rain eases; kept small and off the middle of the screen; reduced motion: a few still drops). Mission 1 always opens (replays too) in steady rain (0.62, under lightning strength) under dark cloud on soaked ground with puddles; the rain eases from 14 s and stops by 46 s, the cloud breaks from 16 s and the sun is out by 55 s, a faint rainbow opposite the sun shows from 34 to 58 s; after 60 s the mission's normal weather runs on from sunny and the ground dries in a few minutes (`src/game/opening.js`, `?opening=off` skips it).

**Tier 2**
- Traffic within about 40 m uses the player car's fine body; the coarse body past that, the stand-in past 140 m as now. This comes first; the rest of the vehicle work waits on it.
- A random add-on kit per traffic car, fitted to its type (rack, spare wheel, bull bar, mud flaps, jerry cans, ladder, rust, a mismatched door; hay and rust on farm trucks, toolboxes and ladders on pickups).
- Dirt on traffic's lower body, more on dirt roads.
- New types: a boxy old 4x4 (our own design, not a copy of a real model), a panel van, a farmer's ex-army 6x6 bought as surplus (faded paint, rare, mostly parked), a semi with a flatbed or grain trailer (parked only at first: a 15 m truck needs new traffic rules), air-brake hiss for the semi.
- Gravel crunch under traffic tires on dirt roads.

- Not chosen: the flat low-poly look, AI-made 3D models, military traffic, semis driving (a later ticket), new tractors (they already exist).

### 9r. Detail pass before the jam ends (LOCKED, 23 Nov 2026, owner's ratings)

The owner rated every open idea 1 to 5 (ratings in the artifact https://claude.ai/artifact/QkBtbwLs8MkR5eMBxG63Nb, collection `ranks`). Build everything rated 3 to 5 before 1 Dec, highest rating first. Most buildings are plain boxes with a gable roof; the goal is the detail of the cars, in our own designs.

- **Rule for every model:** round or bevel corners, give windows, doors and trim real depth, use the existing texture and batch code, keep draw calls flat and triangles modest (60 FPS on built-in graphics). Before and after shots of the same views; the owner marks keep or redo.
- **Words:** any new painted words (a letter board, a shop name) go through line review (CLAUDE.md). Price numbers and plain signs like OPEN need none.
- **Rated 5:** gas station, church.
- **Rated 4:** water tower, power poles and fences, far stand-ins for the van and 4x4, farmhouse porch, Dot fishing off the snapped bridge, tractors, roadside fill, grain elevators (fix the Brandt sign reading "ASHFORD CO-OP"), the farm dog, trees (more of them, and rows lining some roads), Ashford main street. The shared map gallery (rated 4) is already built and live (`server/`, `src/ui/mapShare.js`); it has no shared maps yet.
- **Rated 3:** semi cab shape, mud as a clue, horn reactions, other landmarks (mill ruin, covered bridge, lookout, quarry, campground), houses, diner, store and cabins, road bridges, barns, horses, sheep and deer, the share postcard.
- **Farm dog:** runs along its own fence barking as you pass and stops at the end of its yard. It never goes on the road. Also a clue.
- **Tree rows:** rows on both sides of some stretches, like old farm lanes, mostly dirt roads near farms, none in town.
- **The 6x6:** only the Hartley one stays parked; Okafor's goes. The 25% driving roll stays.
- Main street is the biggest job and runs in its own worktree so it holds up nothing else.
