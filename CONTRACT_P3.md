# Phase 3 contract: splash, mission card, countryside fill

Read first: SPEC.md, DATA.md, CONTRACT.md, CONTRACT3.md, CONTRACT_P2.md (keys, testing, scratchpad rules still apply).
Two versions share data and logic: Phaser 2D (`/`) and three.js 3D (`/three.html`). Both must keep working.
No em dashes in code or text. Keep the existing look and feel. Never show the player's position on any map.

## Owners (edit only your files)
| Agent | Owns |
|---|---|
| Fill (shared) | `src/world/fill.js` (new), `src/world/build.js`, `src/world/data.js`, `src/drive/layout.js`, `src/drive/collider.js`, `src/ambient/*`, `src/audio/*` |
| Phaser world | `src/drive/render.js`, `src/drive/ambientDraw.js`, other `src/drive/*` except layout.js and collider.js, `src/scenes/DriveScene.js` |
| three world | `src3/main.js`, `src3/world3d/*` |
| UI | `index.html`, `three.html`, `src/boot.js` (new), `src3/boot.js` (new), `src/ui/*` (new), `src/scenes/HUDScene.js`, `src3/hud/*`, `src/game/update.js`, `src/game/missions.js` |

Anything else is read-only. If you truly need a change outside your files, make the smallest additive change and say so in your report.

## 1. Countryside fill (Fill agent)

Deterministic from `WORLD.seed`, generated inside `buildWorld` so `WORLD` already contains it. Same world every run, same in both engines.

### Procedural fields: appended to `world.fields`
```js
{
  id: 'pf_12', procedural: true,
  kind: 'pasture' | 'crop',
  crop: 'wheat' | 'corn' | 'hay' | 'plowed',   // crop fields only
  polygon: [[x,y] x4],                          // rotated rectangle, aligned to the nearby road
  rowAngle: deg,                                // crop row direction (heading convention: 0 = north, clockwise)
  fence: 'wire' | 'rail' | null,                // null = unfenced (most crops). rail = wooden horse fence
  windbreak: bool,                              // a row of trees along the edge furthest from the road (added to scenery.trees by layout.js)
  animals: { kind: 'cows' | 'sheep' | 'horses', count } | null,
}
```
Authored fields get the same new fields filled in by the build if missing: pastures `fence: 'wire'`, `fd_okafor_hay` gets `crop: 'hay'`, `rowAngle` from the long axis. `fenceRuns(world)` skips `fence: null` and returns `style` per field.

### Props: `world.props`
```js
{ id, kind: 'bale' | 'rock' | 'haystack', x, y, r, angle }   // all solid (circle r) in the collider
```
Hay bales live in hay fields (replaces the random bales both renderers draw today, so 2D and 3D match). Rocks: small clusters in open ground.

### Power lines: `world.powerLines`
```js
{ id, roadId, poles: [{ x, y }] }   // poles about 45 m apart on one side of paved roads, outside towns too. Pole is solid, r 0.3. Wires run between consecutive poles.
```

### Safe zones (where fill may go)
Rural stretches only. Keep clear of: roads (edge + 6 m), creeks/rivers (+12 m), lakes, forests, buildings (+25 m), towns (`ambienceR` + 40), places (`r` + 60), landmarks (+60), NPC home spots (+40), signs, mailboxes, bridges (+40), authored fields (+30), other fill (+8), mission goals and waypoints (+80), world edge (30). No pasture with the same animal kind within 400 m of an authored field with animals (Pruitt's sheep and Hartley's cows stay unique clues).
**Never generate buildings, mailboxes, signs or anything with a name.** Those are clues.
Aim: no stretch of rural road longer than about 300 m with nothing beside it. Budget about 40 to 60 fields total, so frame rate holds.

### Ambient (`src/ambient/ambient.js`)
- `animals` kinds become `'cow' | 'sheep' | 'horse' | 'deer'`. Horses graze in their field, now and then trot.
- Deer: a few small groups (2 to 3) near forest edges, free roaming (not fenced). When the player car comes within ~40 m they bolt away from it, and may cross a road. Same object shape as other animals plus `running: bool`.
- Optional: soft cow moo / horse whinny events (`{ type: 'moo' | 'whinny', x, y }`) the audio module plays, rare and quiet.

## 2. Rendering (Phaser world and three world agents)
Both must draw, matching each other in colour and placement:
- Crop kinds: wheat (gold rows), corn (dark green rows; in 3D tall, about 2.2 m, so it blocks the view), hay (pale stubble), plowed (brown furrows). Rows follow `rowAngle`, clipped to the polygon.
- Fence styles: `wire` (as today), `rail` (wooden posts with 2 to 3 rails), none.
- `world.props`: bales (round), haystack, rocks. Remove your own random bale placement.
- `world.powerLines`: poles plus sagging wires (3D); in 2D a pole dot with a thin shadowed wire line between poles, drawn above the ground but below the car.
- Windbreak trees come through `scenery.trees`, nothing to do.
- Animals: horse (brown/chestnut/grey, longer than a cow) and deer (light brown, white tail, running pose or faster leg motion when `running`).
Watch frame rate: bake static fill into the existing static ground/batches. Check fps before and after in your test and report both.

## 3. Splash, mission card, help (UI agent)
- **Splash page** shown first in both versions. `index.html` loads `src/boot.js`, `three.html` loads `src3/boot.js`; each shows the shared splash (`src/ui/splash.js`, plain DOM + CSS, paper-map style) and only `import()`s the real `main.js` after Start (click, Enter or Space). The click also unlocks audio.
  Content: working title "Backroads", one line pitch ("No GPS. No 'you are here' dot. Just you, the locals, and the map you draw."), how it works in 4 or 5 short points (ask locals by topic, draw your own map, printed maps can lie, use signs, compass, odometer, clock), the controls table, a Start button, and a small link to the other version (2D / 3D).
- **Mission card** at the start of every mission (mission 1 included: make `startMission` set `briefPending` for index 0 too). Styled differently from dialogue: mission title, who gave it, the brief text, a "Goal: <place name>" line, and "Press E or Enter to start". Closing it unlocks driving. Brief lines still go to the notebook as before.
- **Goal line** on the HUD: small, top area, "Goal: Hartley Farm". Never a distance or direction.
- **H key**: reopens the how-to-play panel (same content as the splash, shared module) as a pause overlay; H or Esc closes. Add "H help" to the hint line.
Same behaviour in both versions.

## Testing
See CONTRACT_P2.md. Use a private static server or `npx vite --port <your own port>` so other agents' edits don't reload your page mid-test. Splash note for testers: after the UI agent lands, pages wait for Start; click the button (`#splash-start`) or press Enter before the game exists. Debug handles stay the same (`__game`, `window.__state`).
