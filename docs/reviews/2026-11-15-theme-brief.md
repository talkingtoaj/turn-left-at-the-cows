# Theme brief for critic round 3: does the game land SHIFT? (15 Nov 2026)

## The jam
GitHub Game Off 2026, theme **SHIFT**. Submissions close 1 Dec 2026, 13:37 PST. Judges and players rate on theme among other things, usually after a few minutes of play in the browser and a look at the itch page.

## The owner's framing (the one we are going with)
"The world has shifted, the map is out of date. There was a time before GPS. Experience what it's like to navigate a shifting world when your navigation aids are years out of date."

## What we do now to land the theme
- **Setting:** July 1992. You cover Darlene's rural mail route (her "shift") while her wrist heals. Her county map is from 1987, five years out of date.
- **Intro card** (owner's words, shown after Start): "Darlene asked if you can cover her shift, but she only had a map for you five years out of date. 'This'll help,' she claimed, 'but the county's shifted since then. If you get lost, just ask a local. They'll know the way.'"
- **Splash map:** a printer's stamp "CORRECT AS OF 1987" (or "REVISED 1987") with Darlene's pencilled "ha." Tagline: "Everything's shifted since 1987. Even the cows."
- **Mission 1** hands you Darlene's 1987 map with gaps: roads and lanes built since are missing, a washed-out bridge is drawn as fine, Mill Lane is drawn through. Mission 2 gives Mrs Hartley's own few-years-old map. Mission 3 crosses the county line where Darlene's map stops, so you have no map.
- **Traps** (SPEC 9o table): new driveway, junction missing from the map, side left out, two of a thing, distance as time, wrong scale, T vs Y, gated lane. Every trap has a fair tell.
- **Locals** give spoken directions (gibberish voices, subtitles), sometimes wrong. You can ask "What's that?" about landmarks. You sketch your own map (M). No GPS dot: the map never shows where you are.
- **Tools you do have:** compass, trip meter, clock, road signs, the radio (two AM stations; signal fades with distance).
- **itch page** "Theme: SHIFT" paragraph: see `docs/release/itch-page.md`.

## Decided (challenge knowingly, not by accident)
- Title "Turn Left at the Cows". Year 1992, map 1987. The relief-carrier story. The trap list and "every trap has a fair tell".
- Only 3 missions. About 2 weeks of work left. Every new line of dialogue or story must go through the owner's review before it ships.
- No cow puns, no self-aware hint lines. Tourists speak gibberish.

## Open
- Is the theme clear enough, fast enough? What could make SHIFT unmissable to a judge in the first 2 minutes, and on the itch page?

## Files worth reading
- `SPEC.md` section 9o (lines ~292 onward) and section 5 and 6 (navigation, hand-drawn map).
- `docs/release/itch-page.md`
- `README.md`
- `src/game/missions.js` (mission briefs), `src/ui/introCard.js`, `src/ui/splashMap.js`, `src/map/oldMap.js`
- `src/world/data.js` (search `county1987` for what the old map gets wrong)
- Earlier reviews: `docs/reviews/2026-11-07-critic-round-1.md`, `docs/reviews/2026-11-14-critic-round-2-whimsy.md`
