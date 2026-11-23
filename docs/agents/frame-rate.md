# Measuring frame rate

Agents here only have software rendering (SwiftShader or llvmpipe, 1 to 3 FPS), so the `?stats` frame numbers they see mean nothing. Draw calls and triangle counts from those runs are still right. For a real frame time, ask the owner to open the game on their machine:

1. Start the dev server so Windows can reach it: `npx vite --host --port <port> --strictPort`.
2. Send links like `http://localhost:<port>/three.html?stats&res=2`, one with the feature on and one with it off (for the grass carpet, add `&carpet=off`). `res=` pins the resolution so the auto scaler can't hide a slowdown. `res=2` draws 4 times the pixels, which stands in for a weaker laptop GPU.
3. Ask for the panel at the top left after about 20 s of driving in the same spot each time: FPS, frame ms and its worst, cpu ms, calls and tris, and the gpu line.

Reading it: a 60 FPS cap (16.7 ms) hides how much room is left, so compare the `res=2` runs. Frame ms well above cpu ms means the GPU is the limit. The `worst` number shows hitches. A built-in laptop GPU (Intel Iris Xe class) is about 6 times slower than an RTX 3060.

## Frame budget check

`npm run check:budget` (`tools/check-budget.mjs`, #86) drives 28 fixed views from `tools/shots.mjs` (towns, farms, open road and the busiest landmark views, in both regions) and fails if any view goes over the limits for draw calls, triangles, shadow calls or shadow triangles. It counts, it does not time, so it works with software rendering. It takes about six minutes, so it is not in `check:all`. Run it before each merge into `jam/detail` and paste the table it prints into the PR.

Every detail ticket must stay inside the budget. If one can't, say why in the PR and move the limit in `LIMITS` at the top of the script in the same PR, with a new note on what the worst view was.

How the limits were picked (2026-11-23, `jam/detail` at 831437d): the worst view was `traffic_row` at 102 calls, 476k triangles, 26 shadow calls and 95k shadow triangles. The limits are 120 calls, 600k triangles, 32 shadow calls and 130k shadow triangles. That leaves room for the detail tickets that were still being built (trees, parked semis, mud, the dog) and for the few percent the counts move between runs as traffic and cows wander. Most views sit at 60 to 90 calls and 300k to 450k triangles. After trees, mud, the dog and the parked semis landed (jam/detail at 7f4e168) the worst was 99 calls, 491k triangles (verge_culvert), 25 shadow calls and 99k shadow triangles (traffic_row): still inside, with about 20 calls, 110k triangles (22%), 7 shadow calls and 31k shadow triangles of room.

Self-test: `node tools/check-budget.mjs --extra-tris 200000` adds one 200k-triangle mesh drawn in every view and must fail. `--url http://localhost:<port>` uses a dev server you already run instead of starting one.

### Links for a real laptop

To check the views that matter on a real laptop, start the server with `--host` as above and open these with `?stats&res=2`, then drive a bit in each place:

- `http://localhost:<port>/three.html?stats&res=2&opening=off&spot=ashford`: Ashford, then east on Highway 9 past the water tower (town, open road, traffic).
- `http://localhost:<port>/three.html?stats&res=2&opening=off&spot=hartley`: Hartley Farm, its barn silo and the herd.
- `http://localhost:<port>/three.html?stats&res=2&opening=off&spot=brandt`: Route 40 into Brandt: the gas station, the store and the co-op elevator.
- `http://localhost:<port>/three.html?stats&res=2&opening=off&spot=plowed`: Highway 9, where traffic is thickest. Several cars in sight at once is the heaviest view the check found.
