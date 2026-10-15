# Test slice: module contract

Phaser 3 + Vite, plain JS (ES modules). Run with `npm run dev`. Canvas is 960x640.
Read `SPEC.md` for the game idea. This file says who owns what so parts fit together.

## Shared files (do not edit unless told)
- `src/world/world.js`: the true world data. Read the comments at the top for units and axes.
- `src/state.js`: one shared mutable `state` object. Read and write its fields as documented.
- `src/main.js`: creates the game with scenes `[DriveScene, HUDScene, MapScene]`.

## Scenes and keys
| Scene key | File | Owner | Job |
|---|---|---|---|
| `Drive` | `src/scenes/DriveScene.js` | Drive agent | World rendering, car, collisions, camera. Starts first. In `create()` it calls `this.scene.launch('HUD')`. |
| `HUD` | `src/scenes/HUDScene.js` | HUD agent | Dash (compass, odometer, clock, trip timer), sign text, talk prompt and dialogue, win screen, and the M key to open the map. |
| `Map` | `src/scenes/MapScene.js` | Map agent | Full-screen map overlay: "My sketch" drawing tab and "Old county map" tab. |

Each file default-exports a class extending `Phaser.Scene` with `super('Drive')` / `super('HUD')` / `super('Map')`.
Extra helper modules are fine, put them in `src/<owner>/` (e.g. `src/drive/`, `src/hud/`, `src/map/`).

## Flow rules
- **Drive** each frame: if `state.inputLocked` or `state.won`, the car brakes to a stop and ignores keys. Otherwise arrows/WASD drive. Updates `state.car`, `state.odometer` (metres, abs distance), `state.clockMinutes` (game clock runs 10x real time: +1 game minute per 6 real seconds), `state.elapsedMs`, `state.nearLocalId`, `state.nearSignId` (nearest within 25 m, else null), and sets `state.won = true` inside `WORLD.goal` radius.
- **HUD** owns keys `E` (talk / next page), `M` (map), and reads everything else from `state`.
  - Talk: when `state.nearLocalId` and E pressed, show dialogue box with that local's `lines` one page per E press; set `state.inputLocked = true` while open; add id to `state.talkedTo`; unlock at end.
  - Map: on M (when not in dialogue), set `state.inputLocked = true`, `this.scene.pause('Drive')`, `this.scene.launch('Map')`, and hide/ignore its own input until Map closes.
  - When `state.won`, show a "You made it" panel with trip time and distance.
- **Map** closes on `M` or `Esc` or its close button: `this.scene.resume('Drive')`, `state.inputLocked = false`, `this.scene.stop()`. It must leave HUD working again (HUD can listen for the Map scene's `shutdown` event, or Map can emit `this.game.events.emit('map-closed')`; use **`this.game.events.emit('map-closed')`** and HUD listens for it).
- No scene ever shows the player's position on a map. That is the core rule.

## Style
- Simple vector shapes via `Phaser.GameObjects.Graphics`, no image assets needed.
- Muted, readable colours. Keep it clean, not fancy.
