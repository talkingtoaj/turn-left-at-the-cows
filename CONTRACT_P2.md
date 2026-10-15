# Phase 2 contract: ambient life, sound, UI upgrades

Read first: SPEC.md (sections 6b to 6g), DATA.md, CONTRACT.md, CONTRACT3.md.
Two versions share data and logic: Phaser 2D (`/`) and three.js 3D (`/three.html`). Both must keep working.
No em dashes in code or text. Keep the existing look and feel.

## Owners (edit only your files)
| Agent | Owns |
|---|---|
| Shared ambient + audio | `src/ambient/*`, `src/audio/*` |
| Phaser world | `src/scenes/DriveScene.js`, `src/drive/*` |
| three world | `src3/main.js`, `src3/world3d/*` |
| Phaser UI | `src/scenes/HUDScene.js`, `src/scenes/MapScene.js`, `src/map/*`, `src/hud/*` |
| three UI | `src3/hud/*`, `src3/map/*` |

Shared and read-only for everyone: `src/world/*`, `src/game/*`, `src/state.js`. If you truly need a change there, make the smallest additive change (new export or field), never rename or remove, and say so in your report.

## Ambient API (`src/ambient/ambient.js`)
A placeholder with this exact API exists now so you can code against it. The ambient agent replaces it.
```js
const amb = createAmbient(WORLD, scenery);   // scenery = generateScenery(WORLD) from src/drive/layout.js
amb.update(dt, state);                        // call each frame when not paused (dt seconds)
amb.birds    // [{ id, x, y, z, heading, flying: bool, flap: 0..1 }]   z = metres above ground
amb.cars     // [{ id, x, y, heading, speed, color: 0xRRGGBB, onDirt: bool }]  traffic on roads
amb.animals  // [{ id, kind: 'cow'|'sheep', x, y, heading, moving: bool }]
amb.people   // Map npcId -> { x, y, heading, moving: bool }   wander <= 6 m from home spot
amb.personPos(npcId) // same object or null
amb.dust     // [{ x, y, age, life, size }]  particles behind cars (incl. player) on dirt
amb.smoke    // [{ x, y, z, age, life, size }] from buildings with chimney: true
amb.clouds   // [{ x, y, rx, ry, angle }] drifting cloud shadows
amb.wind     // { dir (deg, blowing toward), speed (m/s) }
amb.events   // this frame's events, e.g. { type: 'bell', count, x, y }, { type: 'birds_scatter', x, y }, { type: 'dog_bark', x, y }
```
Rules: deterministic from WORLD.seed. Birds land in scenery trees and scatter when the player car comes within ~25 m. Traffic follows road polylines, keeps right, slows on dirt, stops when the player car is close ahead (no collision needed). Busier near towns. People idle/turn/walk a few metres. Animals graze inside their field polygon. Talk range should use `amb.personPos(id)` when available.

## Audio API (`src/audio/audio.js`)
```js
const audio = createAudio(WORLD);   // creates its AudioContext lazily on the first keydown/pointerdown (it listens itself)
audio.update(dt, state, amb, { paused });  // every frame, even when paused (it ducks/fades while paused)
audio.toggleMute();  audio.muted
```
All sound is synthesised with Web Audio (no files). Gentle and quiet by default. Engine: rpm from speed with simulated gears (shift points, small dip on shift), idle hum, reverse whine, quiet tyre/gravel noise on dirt/grass. Birds: chirps when perched/flying birds are near. Water: filtered noise by distance to creeks (rivers louder). Town: soft murmur by distance to town centres within `ambienceR`. Church bell on the game hour (amb 'bell' events), panned/attenuated by distance. Optional dog barks near farms.

## Keys (whole game)
Arrows/WASD drive, Space handbrake, E talk/next, M map, Esc close, R restart (win screen), Enter next mission, C camera (3D), **N north-up / heading-up toggle** (world agents; flips `state.view.northUp`; applies to top-down views only), **K mute** (world agents call `audio.toggleMute()`), 1-9 pick a dialogue topic (UI agents).

## UI rules (both UI agents, same behaviour)
- **Topic menu:** E near a person greets (`greet`), then shows a list from `listTopics(npcId, state)` plus "Goodbye". Pick with 1-9, click, or Up/Down + E (input is locked so the car ignores arrows). Answer pages with `ask`. After an answer, back to the menu. New topics heard appear next time.
- **Map during conversation:** M works while a dialogue is open. Closing the map returns to the same dialogue page.
- **Notebook:** a panel on the sketch tab (toggle button) listing `state.notebook` grouped by person, newest last, scrollable. Readable while drawing.
- **Line styles:** two small toggles for the pencil: dashed (for dirt roads) and thick (for main roads). Stroke gains optional fields `dash: true` and uses `width`. Old strokes without them render as before.
- **Mission complete screen:** shows `state.snapshots` for the mission (thumbnails of each sketch with its label) side by side with the true map (`resolvePrintedMap` of a no-lies definition, or render WORLD directly), clipped to the mission's area. Enter continues, R restarts.
- Hint line includes the new keys.
- Never show the player's position on any map.

## Testing
Vite dev server: http://localhost:5199 (if down, start `npx vite --port 5199` in the repo). Playwright: `import pw from '/home/talkingtoaj/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.js'`, chromium executablePath = newest `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`, args `['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']`. Debug handles: Phaser `__game.scene.getScene('Drive').state`; three `window.__state`. Build check: `npx vite build --outDir <scratchpad>/build_<you>`. Scratchpad: `/tmp/claude-1000/-home-talkingtoaj-repos-explore/2d1925aa-7969-44f3-b93d-1195f70013f9/scratchpad/<your-folder>/`. Other agents edit files at the same time: if the build breaks in a file you don't own, wait a minute and retry rather than fixing it.
