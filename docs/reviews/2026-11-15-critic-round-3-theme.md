# Critic review, round 3: does the game land SHIFT? (15 Nov 2026)

Target: `docs/reviews/2026-11-15-theme-brief.md` (the owner's framing: the world has shifted, the map is out of date, navigate before GPS).
Critics: Game Off judge, navigation game designer, pre-GPS Midwest driver, young player who never used a paper map, itch.io marketer.
Nothing here is decided until the owner picks. SPEC.md is unchanged.

## Consensus
- **The shift is told, not played (5 of 5).** The player reads "shifted" on cards; the first thing they experience is the washed-out bridge, minutes in. Missing roads are close to invisible.
- **Let the player mark Darlene's map (4 of 5: judge, designer, young player, pre-GPS driver as Darlene's own pencil notes).** Cross out the bridge, add the missing lane. Today the printed tab is read-only (`src3/map/map.js`).
- **Win screen: Darlene's 1987 map next to the 1992 truth, changes circled, "X of Y found" (4 of 5: judge, designer, young player; marketer wants it as the cover).**
- **Every map lie needs something you can see (4 of 5: young player, designer, pre-GPS driver, judge).** A silent missing road feels like your own mistake or a bug, not a changed world.
- **The itch tagline never says the map is wrong (3 of 5: judge, marketer, young player).** "There was a time before GPS..." sells nostalgia, not SHIFT. Lead with the map vs world gap.
- **Too many "shifted" lines up front (3 of 5).** Intro card twice plus both mission 1 brief lines reads as keyword stuffing.
- **Shrink the "covering a shift" pun (2 of 5: judge, marketer).** Fine once in the intro card; weak on the itch page.
- **Splash stamp:** code says "REVISED 1987" and "Ha ha.", SPEC 9o says "CORRECT AS OF 1987" and "ha." (judge, marketer, young player). It's 8px, reads as a print credit.
- **A shift within the first 60 to 90 seconds of mission 1 (judge, designer).**

## Per-critic highlights
**Judge:** looks bolted on to a sceptic who reads the prototype note. Make the theme a verb. Give mission 3 `harlan1979` (exists, unused) so the theme climbs (5 years, few years, 13 years) instead of "no map". Cut both "shifted" lines from the mission 1 brief.

**Navigation designer:** half the traps (side left out, distance as time, wrong scale, T vs Y) are "people give bad directions", not "the world moved". Fix cheaply by dating them (St. Luke's built 1990, the T rebuilt as a Y). Mill Lane lie says "It never did" go through: that's a map error, not a shift; make it "it used to, the quarry closed it". Make one road sign out of date (board nailed over, old name painted over). End screen stamped "REVISED 1992" in your pencil, echoing "REVISED 1987".

**Pre-GPS driver:** the 911 rural addressing change (about 1990 to 1995) is real and is SHIFT in one picture: new green road-name signs that locals don't use yet ("Quarry Road" vs "County 12" or "the Voss road"). Directions by things that are gone ("where the Miller barn burned", "turn at Kemper's", boarded up), each with a physical tell and a second local to cross-check. Contradictions: Mrs Hartley's grandfather drove cattle on Ridge Road and the quarry has dug "since 1962", yet the 1987 map hides `ridge_rd` and `quarry_rd` as new. Britishisms: Mum, kettle's on, tyre, railway, Gilmore Halt, "mind the". A relief carrier would get a box list card.

**Young player:** gets the theme only because it is spelled out. Hook for their age: "Google Maps sent me down a road that isn't there anymore." Bridge works (sign plus Dot). Missing roads and Mill Lane dead end feel like "I misread it". Wants to stamp changes on Darlene's map themself (spot the difference, like GeoGuessr). Put "CORRECT AS OF 1987" on the M map screen too.

**Marketer:** cover = split image, 1987 map showing the bridge vs 1992 windshield view of it gone; plus a 3 to 5 s GIF of that beat. Tagline options: "Your map is from 1987. It's 1992." / "The map is five years old. The county isn't." Put 1992 on the splash. Screenshots: map vs world, a local giving directions, your sketch beside the old map. Placeholder `itch_1_splash.png` still shows the cow tagline: don't ship.

## Checked against the code
- Confirmed: printed map tab is view-only; Mill Lane "It never did"; Ridge Road and quarry lines contradict the hidden roads; the Britishisms are in shipped lines (`src/game/tow.js`, `src/game/missions.js`, `src/world/npcs.js`, `data.js` "Gilmore Halt"); splash says "REVISED 1987" and "Ha ha."; `harlan1979` exists unused.
- Not a problem: road signs are authored in km but drawn in miles (`src3/world3d/signtext.js`).

## Needs an owner decision
See the chat summary of 15 Nov 2026.
