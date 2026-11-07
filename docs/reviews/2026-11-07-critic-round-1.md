# Critic review, round 1: name, theme, splash page (7 Nov 2026)

Target: scratchpad brainstorm of names, theme and splash concepts (copied in summary below).
Critics: indie game marketer, cozy gamer (target player), UI/brand designer, front-end engineer.
Nothing here is decided until the owner picks. SPEC.md is unchanged.

## Consensus
- **Name: You Can't Miss It** (4 of 4). Funny, tells the joke, searchable. The marketer found no game with that title. "Ask a Local" sounds like a travel site and can't rank; keep it as the in-game verb and button wording. "Turn Left at the Cows" clashes with a kids' book ("Turn Left at the Cow") but works as a mission name or trailer line. Use "Ashford County" as the world name.
- **No sound before a click** (3 of 4). The farmer tagline shows as a subtitle, voice only after the first click, once per visit, skippable.
- **Play is the biggest thing; no sign-up; no wall of text** (3 of 4).
- **Share postcard after each mission** (3 of 4: marketer, gamer, designer as "later"): squiggly route against a straight line, km driven vs direct, locals asked, wrong locals, cows hit. Marketer and gamer say build it soon, plus a daily seeded mission.
- **Motion sells it** (4 of 4 agree motion matters; they split on how, see conflicts).

## Per-critic highlights
**Marketer**
- Tagline: "No GPS. Just ask a local. They're usually right." Short: "Get directions. Get lost. Find it anyway."
- Pitch angle: "GeoGuessr, but you drive, and the locals might be lying." / "a cozy driving puzzle about bad directions". Nostalgia is the look, not the pitch.
- Build GIF moments on purpose: funny wrong-direction lines, cow in the road with horn, breakdown in rain at dusk, the "found it" moment, odometer rolling. Add a photo mode.
- Check domains and handles (youcantmiss.it, youcantmissit.game) before committing.

**Cozy gamer**
- Worried about stress: lost for 20 minutes, then a breakdown ends the run. Wants one calming line ("Get lost. It's half the fun.") and a hint or tow when really stuck. Make breakdowns funny, not punishing.
- Returning visit: skip the farmer, go straight to the map with ticks and times, big Continue, next mission circled, a margin note teasing the next place.
- A link that drops a friend into the same mission to compare routes.

**UI/brand designer**
- One look: "paper on the dash". Palette: dash #1c1d1f / #3a3c40, amber #e6b450, paper #f1ead6 / #d8ccb4, graphite #4a4a48, ink #3a3128, barn red #b3261e, sky #6f9fb8, straw #d9b45a.
- Fonts: Caveat (pencil writing; replaces the HAND stack that falls back to Comic Sans on Linux/Android), Oswald or Barlow Condensed (dash labels, title), Georgia or Libre Baskerville (printed map labels).
- Logo: condensed caps on a cream road sign, a pencilled arrow pointing the wrong way, apostrophe as a red map pin. Icon: the bent arrow on the sign.
- Menu: desktop = map on the right 60%, torn notepad list on the left (name, tick, best time), linked hover; Continue big amber at bottom left. Phone = notepad list is the menu, map strip on top.
- 3D only in the top 40% like a windshield, paper on the dash below; never paper over moving terrain; slow camera; no weather change in the menu.
- Load screen: next region's map drawn in pencil as it loads, odometer as the progress number, one local's line. No spinner.

**Front-end engineer**
- Today the game JS (~1.6 MB) and assets only start loading after Start is clicked. Start loading while the menu shows; most players never see a wait.
- Don't boot the full 3D world behind the menu: use a 6-10 s looping video (under 1.5 MB) with a WebP poster; poster only for reduced motion or data saver. Optional: crossfade to the live camera once the world is built.
- Separate static landing page (fast, crawlable, phone-friendly, never loads three.js) plus the in-game start screen.
- Phones: driving is keys only. Say so on phones and offer "send yourself the link".
- Audio unlock must happen in the real gesture handler; the current fake pointerdown doesn't count on Safari.
- Save data: try/catch, versioned with migrations, back up corrupt data, navigator.storage.persist() after first finished mission, note when saving fails, export code later.
- SEO/sharing: page title, meta description, Open Graph 1200x630 image, favicon, apple-touch-icon, canonical.

## Conflicts needing a decision
1. Live 3D world behind the menu (designer, gamer, marketer) vs looping video plus poster (engineer). Middle ground: video first, crossfade to live once the world has loaded in the background.
2. Map menu for new players (gamer, designer) vs Play-first for new players and map for returning ones (marketer).
3. Share postcard and daily mission now (marketer, gamer) vs later (designer).
4. Breakdown ending a run (current design) vs "no harsh fail state" (gamer).
