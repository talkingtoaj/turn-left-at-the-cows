# Measuring frame rate

Agents here only have software rendering (SwiftShader or llvmpipe, 1 to 3 FPS), so the `?stats` frame numbers they see mean nothing. Draw calls and triangle counts from those runs are still right. For a real frame time, ask the owner to open the game on their machine:

1. Start the dev server so Windows can reach it: `npx vite --host --port <port> --strictPort`.
2. Send links like `http://localhost:<port>/three.html?stats&res=2`, one with the feature on and one with it off (for the grass carpet, add `&carpet=off`). `res=` pins the resolution so the auto scaler can't hide a slowdown. `res=2` draws 4 times the pixels, which stands in for a weaker laptop GPU.
3. Ask for the panel at the top left after about 20 s of driving in the same spot each time: FPS, frame ms and its worst, cpu ms, calls and tris, and the gpu line.

Reading it: a 60 FPS cap (16.7 ms) hides how much room is left, so compare the `res=2` runs. Frame ms well above cpu ms means the GPU is the limit. The `worst` number shows hitches. A built-in laptop GPU (Intel Iris Xe class) is about 6 times slower than an RTX 3060.
