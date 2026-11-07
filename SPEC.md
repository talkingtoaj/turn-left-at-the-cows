# Orienteering Driving Game: Spec

Title: **Turn Left at the Cows** (LOCKED, Nov 2026; see 9k). World: Ashford County. "Ask a local" stays as the in-game verb.

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

- **Start screen** before the game: the map on the passenger seat (see 9k). How it works and the controls sit in a "How to play" fold-out, not up front.
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

(Since MVP: sun shadows exist in 3D. Section 9 adds nicer art, damage and hazards.)

## 8. Open questions

- Is there a story or just separate trips/deliveries?
- Do locals ever lie on purpose, or only get things wrong?
- Can the player find printed maps, and how old are they?
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
- **Breakdown:** the mission fails and restarts. Each mission starts with a fresh car.
- LATER: repairs (spare tyre, town garages, helpful locals). Tow truck to the nearest garage as an easy mode.

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

### 9k. Name, look and start screen (LOCKED, 7 Nov 2026, after critic round 1)
- **Name: Turn Left at the Cows.** Chosen knowing there is a children's book called "Turn Left at the Cow". World name: **Ashford County.** "Ask a local" stays as the in-game verb and wording. Code names and the save key `askalocal.progress.v1` stay as they are.
- **Taglines.** Main: "There was a time before GPS, when finding your way required you to ask a local." Pitch (meta description, landing copy): "GeoGuessr, but you drive, and the locals might be unreliable." Short, used sparingly: "Get directions. Get lost. Find it anyway."
- **Look: "paper on the dash".** Dash #1c1d1f / #3a3c40, amber #e6b450, paper #f1ead6 / #d8ccb4, graphite #4a4a48, ink #3a3128, barn red #b3261e, sky #6f9fb8, straw #d9b45a. Fonts (Google Fonts): Caveat for pencil writing (also the in-game map's handwriting, which fell back to Comic Sans on Linux and Android), Oswald for dash labels and the title, Georgia or Libre Baskerville for printed map labels. Logo: the title on a cream road sign with a pencilled arrow; icon: a turn-left arrow on the sign with a red map pin (`public/favicon.svg`, PNGs beside it).
- **Start screen: the map on the passenger seat** (`src/ui/splash.js`). The top is a windshield; below it the dash, a notepad with the jobs and the big button, and a hand-drawn paper map with a coffee ring, a pencil and a compass. Finished jobs are ticked on the map with the best time pencilled beside them; the next job is circled where it starts; unfinished jobs are only ever marked where they start, so the menu never gives a place away. Continue (Play for a new player) is the biggest thing and is focused. The ignition key beside it only plays an engine sound. New players get one short, skippable moment of a local at a fence saying "Oh, you can't miss it" (silent, never blocks Play, once). Returning players go straight to the map with Continue.
- **Live world behind the windshield.** The menu shows at once as plain DOM. Right after its first paint the game code, textures and the first job's region start loading (the old screen only loaded after Start); sounds are fetched after that. When the region is built, the world fades in behind the glass: the camera stands above the job's start and turns about 1 degree a second, about 30 frames a second, drawn only into the windshield. No car, no sound, no game clock (so no weather change); ambient life, the mast light and planes go on. Reduced motion: a still frame. A weak device (2 cores or less, 2 GB or less, Save-Data) or no WebGL keeps the painted scene; a device that draws the menu too slowly drops to a still frame. Continue then only places the car; if the region is still building, its load screen shows.
- **Load screen** between regions: dash black, the next region's map sheet drawn in pencil as it loads (strokes follow progress), the trip odometer rolling as the progress number, one line from a local in Caveat. No spinner.
- **Must-haves.** Real buttons with focus rings and a sensible Tab order; the title is the page's h1; text over the moving world sits on paper. Sound starts only inside a real click (one shared AudioContext, `src/audio/context.js`); mute (K or the dash button) is remembered. Touch-only devices (no mouse or trackpad) get the map and "Made for keyboard on a laptop or desktop" with a share / copy link button instead of Play, and load no game code. Page title, meta description, Open Graph and Twitter tags with a 1200x630 image (`public/og.jpg`), favicon, apple-touch-icon, canonical (set `SITE_URL` at build time for absolute links). If progress cannot be written, the menu and the mission-complete screen say so; after the first finished job the game asks the browser to keep its storage (`navigator.storage.persist()`).
