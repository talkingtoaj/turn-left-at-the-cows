# itch.io page draft

Status: draft for the owner. The pitch, theme paragraph, AI note and prototype note are in `lines/issue29.json` for review (ids `itch-pitch`, `itch-theme`, `itch-ai-note`, `itch-prototype-note`). The screenshots are placeholders. Other tickets are still changing the look, so retake them before submitting.

## Form fields (itch "Create new project")

- Kind of project: HTML. Upload a zip of `docs/release/itch-embed/index.html` and tick "This file will be played in the browser". It frames the live game, so the itch page always plays the latest deploy and shared maps keep working.
- On the uploaded file: tick "This file will be played in the browser"; leave the Executable dropdown and the platform boxes alone.
- Embed options: Embed in page, manually set size 960 x 540 (fits itch's default page column), fullscreen button on; auto start, mobile friendly, scrollbars and SharedArrayBuffer off.
- Pricing: $0 or donate (nothing is downloaded, so no one sees a donate prompt before playing).
- Cover: 630 x 500, no spoilers: the title over the start of the road, with Darlene's unmarked 1987 map.
- Genre: Adventure.
- Tags (10): driving, exploration, maps, navigation, low-poly, 3d, atmospheric, cozy, singleplayer, retro.
- AI disclosure: Yes. Kinds: Graphics (Gemini textures and signs), Sounds (ElevenLabs voices and effects), Text & Dialog (Claude, GPT, Grok drafts), Code (Claude). Statement: the "How AI was used" text below, once approved.
- Community: Comments.
- Custom noun, app store links, trailer: blank.

## Title

Turn Left at the Cows

## Short description (the itch "tagline" field)

It's 1992, you have no GPS and a map five years out of date. Things have shifted in that time. You just might need to ask directions from the locals.

## Jam submission (Game Off 2026)

Final, written by the owner. Use these as-is on the jam submission form.

### Game description

Orienteering in a shifting world.

It's July 1992. You're covering Darlene's shift delivering packages while her wrist heals. All you have is her county map from 1987. There's no GPS, and the county has shifted since the map was printed: a bridge washed out, new farm lanes went in, and roads got new names. Stop and ask the locals the way, sketch what they tell you onto the map, and trust what you see over what's printed.

### Theme interpretation

The world is constantly shifting. How do you navigate in a world when your paper map no longer matches what you encounter around you?

## Pitch

July 1992. You're covering Darlene's shift delivering packages while her wrist heals, and all you have is her county map from 1987. There's no GPS, and the roads have changed since then. Pencil your notes onto her map and ask the locals the way.

## How to play

1. Take something to a place you have never been.
2. Stop, get out (F) and walk up to a local. Press E to hear the way. Click an underlined name to ask about it.
3. On foot, look at a tower or a hill and press E to ask what it is.
4. Press M and sketch what you heard. Your notebook keeps every word.
5. Printed maps can lie. Roads close, bridges wash out and names change. Trust what you see.
6. Road signs, the compass, the trip meter and the clock tell you where you are.

Play on a computer with a keyboard. It runs in your browser and needs WebGL.

## Controls

| Keys | What it does |
|---|---|
| Arrows or WASD | Drive or walk |
| F | Get out of the car or back in |
| Right mouse | Click and hold right mouse: turn your head |
| E | Talk |
| M | Map |
| T | Radio on or off |
| K | Mute |
| C | Camera |
| H | Horn |

## What's new in the jam

(Check this list against what actually shipped before you submit.)

- A fixed hour and sun for each mission, a warmer color look and cream fog.
- Words painted on every road sign and mailbox.
- Darlene's out-of-date map in the first mission, with gaps you can catch if you pay attention.
- A new dash, with miles instead of meters.
- A radio.
- A third mission that crosses the county line into Harlan County.
- Tourists, and other small odd things on the road.

## Theme: SHIFT

Your map is from 1987. It's 1992. Since then the Creek Road bridge washed out, new farm lanes aren't on the map, and some locals haven't driven those roads in years. You find each shift by driving into it. When you deliver, the game sets the old map beside the real county and circles every change.

## A note on the prototype

I was toying with the idea of a driving game back in October, but didn't know what to do with it. When I learnt of the jam, I found a real theme - a game where you need to navigate by map, but the world's shifted since the map was printed.

## How AI was used

I used AI for this game. Claude wrote the code and the first drafts of the text. I read every line of dialogue myself, and only lines I approved are in the game. The radio scripts were drafted with Claude, GPT and Grok, and the radio DJ voices were made with ElevenLabs. So were the locals' mumbling voices and some sound effects (engine, tires, town). A few textures and signs were made with Google's Gemini image model. I made the music. The rest of the sounds, the skies and the 3D models are free CC0 assets, listed in the credits.

## Credits and license

Code is public domain (CC0). Art, sound, music, writing and the radio audio are all rights reserved. Skies are from Poly Haven, textures from ambientCG, trees and rocks from Quaternius, and sound effects from many Freesound artists, all CC0. Full list in the repo: `public/look/SOURCES.md` and `public/sounds/SOURCES.md`.

## Screenshots (placeholders)

Paths are in the scratchpad, not the repo. Retake them late.
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_1_splash.png (STALE: shows the old cow tagline, retake with the new tagline)
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_2_intro_card.png
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_3_hwy9.png
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_4_rt40.png
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_5_ashford.png
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_6_farm.png
- /tmp/claude-1000/-home-talkingtoaj-orca-workspaces-orienteering-game-talkingtoaj-whimsical-nostalgic-polish/fdf1024e-3a4e-4e61-9f07-f781fad63f89/scratchpad/shots/itch_7_map.png
