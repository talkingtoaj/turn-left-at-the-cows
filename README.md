# Turn Left at the Cows

A browser driving game. It is July 1992. You are covering Darlene's rural mail route while her wrist heals, and all you have is her county map from 1987. Everything has shifted since then.

You get lost on purpose, then find your way: ask the locals, read the signs, listen for planes and bells, and draw your own map. The locals are friendly. They are not always right.

Made with three.js. Built for Game Off 2026 (theme: SHIFT).

## How to play

1. Take something to a place you have never been.
2. Stop, get out (F) and walk up to a local. Press E to hear the way. Click an underlined name to ask about it.
3. On foot, look at a tower or hill and press E to ask what it is.
4. Press M and sketch what you heard. Your notebook keeps every word.
5. Printed maps can lie. Roads close, bridges wash out and names change. Trust what you see.
6. Road signs, the compass, the trip meter and the clock tell you where you are.

### Controls

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

Play on a computer with a keyboard. It needs a browser with WebGL.

## Run it locally

You need Node.js.

```
npm ci
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

Other commands: `npm run build` makes a production build, `npm run check:world` checks the world data.

## Game Off 2026

This is our entry for Game Off 2026. The theme is SHIFT: the maps are out of date, and you are covering someone else's shift.

The first version of the game was a prototype made on 15 and 16 Oct 2026, before the jam. The jam work started on 5 Nov 2026. See `docs/release/itch-page.md` for the full note, including how AI was used.

## License

- Source available, all rights reserved. You can read the code here, but you may not copy, change, share or reuse it without permission. See `LICENSE`.
- Art, sound, music, writing and the radio audio: all rights reserved too. See `ASSETS-LICENSE`. Most of these files are not in this repo (the list is in `assets.txt`): the game you clone runs without them, with a silent radio, no voices and plain signs. The full game is on the web. The owner gets them with `npm run assets`.
- Third-party CC0 assets keep their own terms. They are listed in `public/look/SOURCES.md` and `public/sounds/SOURCES.md`.

## Credits

- Design, music and review of every line of dialogue: AJ.
- Code and first drafts of the text: written with Claude (Anthropic). Radio script drafts: Claude, GPT and Grok.
- Radio DJ voices, the locals' mumbling voices and some sound effects: made with ElevenLabs.
- Some textures and signs: made with Google's Gemini image model.
- Skies: Poly Haven (CC0). Textures: ambientCG (CC0). Trees and rocks: Quaternius (CC0). Sound effects: many Freesound artists (CC0), named in `public/sounds/SOURCES.md`.
- Built with three.js and Vite.
