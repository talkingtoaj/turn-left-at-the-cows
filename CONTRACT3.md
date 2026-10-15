# three.js version: module contract

Second attempt at the same test slice, in 3D with three.js. Page: `three.html` → `src3/main.js`.
Open at `http://localhost:5199/three.html` (Phaser version stays at `/`).
Read `SPEC.md` and `CONTRACT.md` (Phaser version) for the game idea and rules. Gameplay should match the Phaser version.

## Do not edit
Anything in `src/`, `index.html`, `CONTRACT.md`, `SPEC.md`, `package.json`, `vite.config.js`, `three.html`, `src3/runtime.js`.
The Phaser version must keep working untouched.

## Reuse from src/ (import, don't copy)
- `src/world/world.js`: true world data (1 unit = 1 m, x east, y SOUTH, headings 0 = north clockwise).
- `src/state.js`: shared state object, same fields and meaning as in CONTRACT.md.
- `src/drive/geom.js`, `src/drive/layout.js` (`generateScenery`, solids, part layouts for buildings/landmarks), `src/drive/collider.js` (`Collider`), `src/drive/car.js` (`stepCar`, `MAX_SPEED`). These are plain JS, no Phaser. Read them before writing your own versions.
- `src/hud/format.js`: text formatting for heading, clock, timer, odometer.
- `src/map/draw.js`, `src/map/oldMap.js`: written against Phaser's Graphics API. Reuse ideas, or wrap a Canvas2D context in a tiny adapter with the same method names, your call.

## Axis mapping for 3D
World (x, y) → three.js (x, 0, y). So three.js +Z is south, -Z is north. Y is up.
Heading h (deg) → car rotation.y = -h * PI/180 if the car model faces -Z at rotation 0.

## Modules and owners
| File | Owner | Exports |
|---|---|---|
| `src3/main.js` + `src3/world3d/*` | 3D agent | Entry point. Renderer, scene, world meshes, car, camera, main loop. |
| `src3/hud/*` | HUD agent | `createHUD(root, { openMap })` returns `{ update(dt) }` |
| `src3/map/*` | Map agent | `createMapOverlay(root, { onClose })` returns `{ open(), close(), isOpen() }` |

`root` is the `#ui` div (fixed, full screen, sits above the canvas).

## Wiring (main.js does this)
```js
const ui = document.getElementById('ui');
const map = createMapOverlay(ui, { onClose: () => { runtime.paused = false; state.inputLocked = false; } });
const hud = createHUD(ui, { openMap: () => { runtime.paused = true; state.inputLocked = true; map.open(); } });
// each frame: if (!runtime.paused) { step car + update state }; render; hud.update(dt)
```

## Rules
- **3D / main loop:** each frame when not paused, update `state` exactly as Phaser's DriveScene does (car via `stepCar`, odometer, clockMinutes 10x real time, elapsedMs (stops when won), nearLocalId, nearSignId (25 m), won). Respect `state.inputLocked` / `state.won` (brake, ignore input). Arrows/WASD + Space handbrake. **C** toggles `runtime.cameraMode`. Do not use E, M, R, Esc.
- **HUD:** DOM/CSS overlay. Owns E (talk/next), M (calls `openMap`, ignored while dialogue open, map open, or won), R (reload on win screen). Ignores its keys while `map.isOpen()`-equivalent (HUD can track that itself: map is open from `openMap()` until the next frame where `runtime.paused` is false). Hint line includes "C camera".
- **Map:** DOM overlay with canvas. Owns M/Esc to close (not while typing a label). Closing calls `onClose`. Sketch persists in `state.sketch`. Must stop key events reaching the game while open (stopPropagation is fine; the HUD and 3D input should also check `runtime.paused`).
- Nobody ever shows the player's position on any map. Core rule.
- No em dashes in code or comments.
