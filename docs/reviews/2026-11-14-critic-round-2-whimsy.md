# Critic review, round 2: whimsy and nostalgia (14 Nov 2026)

Question: the game feels "a little bare". How do we make it more whimsical and nostalgic?
Critics: cozy game designer, nostalgic target player (80s road-trip kid), narrative designer, art and audio director, indie producer / scope skeptic.
Inputs: SPEC.md, dialogue (`src/world/npcs*.js`), missions, tow, tips, load screen, splash, ambient, sound list, 13 headless screenshots.
**Update (14 Nov 2026):** the owner rated every idea and settled the open decisions. The result is SPEC.md section 9o; follow that, not the recommendations below.

## Where "bare" comes from (all 5 agree)
The writing is the best part. The start screen is full of charm. The game you actually drive is not:
- The dash looks like a debug panel (Courier and Arial in grey boxes, a black "Goal:" chip, a key-hint line).
- The middle distance is empty, clean green hills. The roadsides are spotless. Nothing in the world tells a joke; all the jokes are in text.
- There is no human sound: no radio, no music, no porch noise.
- Locals have one greeting and two fallback lines each, and don't react to you.
- Recent work has been almost all systems. The gap is polish and content, not systems.

## Consensus
- **Car radio (5 of 5).** It's already locked nav mechanic #4 but hasn't been built. A dial on the dash, 2 or 3 stations per region, static between, and the signal fades with distance from the tower. Content: farm report and hog prices, a swap shop ("lost: one goat, answers to Doris"), birthdays for real locals, church bake sales, a weather and wind report that matches the game (the wind tells mission 3's landing direction), an ad for Earl's read badly by Earl. The gibberish voice gets subtitles. Rule: a station names only its own home town, and never gives a live "here" report.
- **Pay off the title (4 of 5: writer, cozy, player, skeptic).** Nobody in the game ever says "turn left at the cows". Have one local per mission say it, about a hand-placed herd that moves between fields (by mission, or by game clock). Directions go wrong because the cows moved, a mistake that comes from the local's life, not a lie. The existing tow line "Third one this week. Must be the cows." then pays off.
- **The dash should match the start screen (3 of 5: skeptic, player, art).** Oswald labels, a round needle speedometer, keep the rolling odometer, domed warning lamps, a vinyl or woodgrain strip, a radio slot. Put "Goal" on a paper tag clipped to the sun visor, in Caveat. Fade the key hints after the first minute (H brings them back). This is CSS only, about 1 day.
- **Hand-placed props at crafted places (4 of 5; the writer adds hand-painted signs).** These are true details, never random fill:
  - Hartley: a flapping clothesline, a tyre swing, a cow-painted mailbox.
  - Ashford: round-top pumps, a wall ad.
  - Brandt: a diner with an OPEN sign.
  - Kestrel Field: a windsock and a checkered tank.
  - Elsewhere: a corn stand with an honesty box, a church sign with stick-on letters, hand-painted signs ("EGGS. Honest box." "NO PLANES." on Dagny's fence), a junk car in the weeds.
  - Locals can use them as landmarks, including ones that have changed ("left at the corn stand", and it's shut for the season).
- **A world that notices you (4 of 5).**
  - More greetings per local, and reactions to state: back again, the car dented or muddy, you got towed, it's raining.
  - Locals gossip about each other ("Don't listen to Earl about bridges").
  - The horn makes locals wave and dogs bark.
  - A farmer you pass three times reacts more each time.
  - The cargo slides on the seat. Tom: "Mum's pie. Well. Crumble now."
- **The arrival beat and the keepsake (4 of 5).**
  - The person you deliver to says one warm line on the win screen. Mrs Hartley: "Oh, the seed catalogue! I ordered it in March."
  - A keepsake goes in the scrapbook.
  - A shareable postcard: your wrong sketch next to the real route, on a diner placemat or an Earl's receipt, with "Towed twice" and the best line a local said.
- **Farm dogs that chase along their own fence (3 of 5).** Charm and clue together: "If the collie chases you, you're past Okafor's."

## Per-critic highlights
**Cozy designer**
- A disposable camera with 24 shots. You photograph the oddities locals mention (Walt's Ford, the mill wheel, the half-sailed windmill). Each print has the bearing and trip km pencilled on the back. Prints get "developed" at mission end.
- One staged set piece per mission:
  - Mission 1: Dot fishing off the snapped bridge.
  - Mission 2: Frank's 200 steps lookout.
  - Mission 3: Ray swings the prop and takes you round one circuit after delivery.
- Mud as a clue: Lou says "That red clay's off Field Lane."
- Biscuit the lost beagle, named on the radio, is really out there.

**Nostalgic player**
- The best "I remember this": the start screen, almost every local line, Hartley Farm, the tow lines.
- Generic: the dash, the Goal box, the big flat green KESTREL FIELD sign, the sketch tool's Undo and Clear buttons, empty grass between landmarks.
- Wants MPH and a needle speedo, a stick-on ball compass that wobbles, a clock 4 minutes fast, a glovebox (receipts, an ice scraper, a "ROAD MIX 86" tape), a pine air freshener, and the two-finger steering-wheel wave from oncoming trucks.
- Sketch on found paper per mission (the parcel's brown wrapper, a church bulletin).
- Radio: fiddle or polka between talk is fine. A "radical" DJ or fake pop songs would be cheesy.

**Narrative designer**
- Best lines:
  - Gus: "County says a lot of things."
  - Hal: "Shut the gate after you if it's shut. It never is."
  - Ray and Dagny: the 1984 barley feud.
  - Mrs Ames: "Like a big bee in a jar."
- Weakest: Earl. He's the first voice you hear and the flattest, and his profile mistake never shows in his lines. Bev and Peg are the same person. Hank reads like a museum plaque.
- A county story is half-written already: Tom proposed to Dagny, then flew Ray's Cub low over her farm in '84 and put it in her barley (his knee, her fence, her silence toward Ray). Spread it as optional crumbs in side topics, and add a "Tom Hartley" topic.
- Habits that hint at each person's mistake: Earl, "Haven't been up Creek Road since Easter, but roads don't move"; Hank always rounds up.
- The player is the relief rural driver while Darlene has a broken wrist. That makes a running gag: "Darlene'd have known that." "You're not Darlene." One pencilled inner-voice line per mission in the notebook. Ending idea: a lost tourist asks *you* for directions.
- The tow driver remarks on who you talked to (`state.talkedTo`). Load-screen quotes get credited to people once you've met them.

**Art and audio director**
- A colour grade inside the existing tone mapping:
  - Olive and straw greens, warm highlights, slightly teal shadows, lifted blacks.
  - A soft vignette and light grain.
  - A cream fog colour (same distances).
  - About 3 to 6 hours of work.
- A time of day per mission: morning mist, then late afternoon, then dusk.
- Rural paved roads: drop the white edge lines and fade the centre line.
- Wildflower verges, ditches, leaning posts and tar patches as fill (no words, so no clues).
- Sound layers: insects, wind in tall grass, a screen door and wind chimes at farms, a distant tractor, body creaks on dirt roads, a turn-signal tick, the ignition clunk, window wind.
- Radio band-pass (300 Hz to 3.4 kHz). The same stations play from a farm porch radio and a diner jukebox.

**Scope skeptic**
- Order: a one-week whimsy sprint (dash, writing pass, about 12 hand-placed props), then write mission 4 with the charm built in. Stop building systems for a while.
- Don't do:
  - Music that changes by area (it works as a location meter).
  - Scattered collectibles (they work as breadcrumbs).
  - Random chatter that names places.
  - Live radio traffic reports.
  - A full day/night cycle.
  - A ride-along pet, or rigged NPCs.
- Test: watch one friend play mission 1 cold. Tally smiles, lines they quote afterwards, and leaks (did anything let them find the place without asking?). Also do a muted screenshot test: does a random frame look like *this* game?

## Fact check (done against the code)
- **Not a bug:** "Mill burned in '91" (Dot). The printed map is from 1987 and is meant to be outdated, so the present is at least 1991. But the game's present year is never stated. Pick one, so the writing stays consistent.
- **Misread:** "Walt's Ford sat forty years." No line says that; the line says the clutch went in '74.
- **Real mismatch:** the tow line "Only tow truck for forty miles" vs the dash in km and km/h.
- **Misread:** "The clock is always 09:00." The clock runs (1 game minute per 6 s), but every mission starts at 09:00.
- **Naming is confusing:**
  - "Ashford County" is the world and splash name, and Ashford is also a town.
  - The region-1 county is "Fenwick County" in the code and on the printed map.
  - Tidy up before writing county gossip.

## Conflicts and items needing a decision
1. **Music.** The art director wants radio music (ElevenLabs Music or Suno, owned). The skeptic wants no music at all. The player wants only plain fiddle or polka between talk. Middle ground: talk-first radio with a few short owned tunes, only on the radio and only when tuned in; never background music by area.
2. **MPH vs km.** The player wants MPH (the setting reads American). The spec talks in km throughout. Either switch to miles, or fix the "forty miles" line.
3. **Time of day per mission vs no day/night cycle.** The art director wants dusk with headlights for mission 3; the skeptic warns against retuning all the lights. Middle ground: a fixed hour per mission (sun angle plus grade) and no night yet.
4. **The two "views from above"** (the cozy designer's Frank's-steps lookout and the post-mission flight). Both come near the "never show position" rule. The flight is after the mission ends; the lookout is mid-mission but fogged.
5. **The disposable camera vs "no collectibles".** Photos are only of things a local named, so they're not markers. But it is a collect-them system.
6. **Story thread and player identity.** The Tom, Dagny and barley story plus the Darlene relief-driver frame answer SPEC section 8's open question "story or just separate trips?".

## Recommendations (from the review lead, for the next agent)
Status: **proposed, not approved.** The owner has not answered the decisions below yet. Do not change SPEC.md or build anything that depends on an open decision until the owner picks. Items that don't depend on a decision are marked "safe to start".

### Recommended order
1. **Quick pass (about 2 days of agent work):**
   - **Dash reskin to match the splash** (safe to start). `src3/hud/hud.js` only:
     - Oswald labels, a round needle speedo, keep the rolling odometer, domed warning lamps, a vinyl or woodgrain strip, a slot for the future radio.
     - "Goal" on a Caveat paper tag clipped to the sun visor.
     - Key hints fade after about a minute; H brings them back.
     - Units depend on decision 2.
   - **Colour grade** (safe to start; time of day is decision 3):
     - Inside the existing `CustomToneMapping` in `src3/look/look.js`, no extra pass: olive and straw greens, warm highlights, slightly teal shadows, lifted blacks, soft vignette, light grain.
     - Fog colour from white-grey to warm cream (`FOG_COLOR` and `keyLooks` in `src3/world3d/world3d.js`), same distances.
     - Check 60 FPS. Take before and after shots.
   - **Writing pass** (safe to start, owner edits for voice):
     - Earl first. He's the first voice and the flattest. His profile mistake about Creek Road should show in his lines.
     - 3 or 4 greetings per local. Reactions to state: back again, dented or muddy car, towed, rain.
     - Gossip between locals. Give Bev and Peg different voices.
     - An arrival line from each recipient on the win screen.
     - Tow lines per county that react to `state.talkedTo`.
     - Load-screen quotes credited to people once you've met them.
     - Keep the rule: never name a place nobody has named to you, and never say where the player is now.
   - **Pay off the title** (safe to start):
     - One local per mission says "turn left at the cows" about a hand-placed herd that has moved fields.
     - It's a mistake from the local's life, not a lie. The herd is crafted, not fill.
   - **Fix "Only tow truck for forty miles"** in `src/game/tow.js` (depends on decision 2).
2. **Car radio (about 3 days):**
   - Builds locked mechanic #4. A dial on the dash, 2 or 3 stations per region, static between, and the signal fades with distance from each tower.
   - Gibberish voice with subtitles.
   - Content: farm report and hog prices, a swap shop, birthdays for real locals, church bake sales, a weather and wind report that matches the game, an Earl's ad read by Earl.
   - Band-pass about 300 Hz to 3.4 kHz.
   - Rule: a station names only its own home town. No live traffic or "live from" reports.
   - Music depends on decision 1.
3. **Hand-placed props and sounds:**
   - About 12 props at crafted places (clothesline, tyre swing, cow mailbox, round-top pumps, corn stand with honesty box, church letter-board sign, diner OPEN sign, windsock, checkered tank, junk car).
   - Hand-painted signs: "EGGS. Honest box." "SLOW. Children, dogs, Walt." and "NO PLANES." on Dagny's fence.
   - Farm dogs that chase along their own farm's fence.
   - Horn reactions (wave, bark).
   - Cargo that slides on the seat.
   - Small CC0 sound layers: insects, wind in grass, screen door and chimes at farms, body creaks, turn-signal tick, ignition clunk.
   - Wordless roadside fill is fine (wildflower verges, ditches, leaning posts, tar patches). Drop white edge lines on rural paved roads.
   - Add anything with words or names only at crafted places, never as fill.
4. **Mission 4,** written with the charm built in from the start, and the story thread if decision 6 says yes.

### How to check each change
- Watch someone play mission 1 cold. Tally smiles, lines quoted afterwards, and leaks (did any addition let them find the goal without asking?). Cut anything that leaks location.
- Muted screenshot test: does a random frame look like this game?

## Decisions for the owner (open)
1. **Music.** None (skeptic), owned tunes made with ElevenLabs Music or Suno (art director), or a few short fiddle or polka tunes between radio talk (player).
   - Recommended: talk-first radio with a few short owned tunes, only on the radio when tuned in.
   - Never background music that changes by area.
2. **MPH or km.** Switch to miles to fit the American setting, or keep km and fix the "forty miles" tow line. Recommended: owner's call. km is used all through SPEC.md.
3. **Time of day.** A fixed hour per mission (mission 1 morning mist, mission 2 late afternoon, mission 3 dusk) via sun angle and grade, or keep 09:00 for all.
   - A full day/night cycle with headlights was flagged as too costly.
4. **Views from above.** Both brush the "never show position" rule:
   - Frank's 200 steps lookout, mid-mission and fogged.
   - A plane ride with Ray after mission 3 is done.
5. **Disposable camera** (24 shots of things locals named; prints at mission end with bearing and trip km pencilled on). Build it, or treat it as a collectible that breaks the skeptic's rule?
6. **Story and player identity.** The Tom, Dagny and barley thread spread as optional side topics, plus the player as relief driver for Darlene (broken wrist). This answers SPEC section 8's "story or just separate trips?".
7. **County names.** "Ashford County" (world and splash) vs "Fenwick County" (region 1 in code and on the printed map), plus Ashford the town. Pick one scheme before writing county gossip.
8. **The game's present year.** Never stated. The 1987 map is outdated and Dot says the mill burned in '91. Pick a year so dates in the writing stay consistent.

## Notes
- The screenshots were headless software renders (SwiftShader), so lighting may look flatter than on a real GPU. To retake them: run `npx vite`, launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`, click `#splash-start`, then click the mission card's `button.ui-btn` "Start". Use `?spot=<name>` (see `src3/spots.js`) to jump to places.
