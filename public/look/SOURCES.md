# Look assets

Loaded by the default look (not with `?look=old`). All CC0 (public domain) or made by us with AI.
Fetched and converted by `tools/look/fetch.mjs` (textures, 512 px webp) and
`tools/look/bake_sky.py` (sky). AI calls are logged in `tools/look/ai_log.jsonl`.

## Sky

| File | Source | License |
|---|---|---|
| `sky.webp`, `sky.json` (cloudy) | Poly Haven, Kloofendal 38d Partly Cloudy (Pure Sky), 2k HDR: https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky | CC0 |
| `sky_sunny.webp`, `sky_sunny.json` (clear) | Poly Haven, Qwantani Mid Morning (Pure Sky), 2k HDR: https://polyhaven.com/a/qwantani_mid_morning_puresky | CC0 |

Each sky `.webp` is the upper half of the HDRI, turned so its sun sits at the game's sun.
Each `.json` holds the sky light as spherical harmonics, the sun's strength and the horizon colour.
The weather (`src3/look/weather.js`) blends the two; overcast is the cloudy sky greyed in the shader.

## Textures (`tex/<name>.webp`, normal map `tex/<name>_n.webp`)

| Name | Used on | Source | License |
|---|---|---|---|
| grass | grassy ground | ambientCG Grass004: https://ambientcg.com/view?id=Grass004 | CC0 |
| soil | fields, yards, mud, sand | ambientCG Ground048: https://ambientcg.com/view?id=Ground048 | CC0 |
| dirt | dirt roads, tracks | ambientCG Ground103: https://ambientcg.com/view?id=Ground103 | CC0 |
| gravel | road shoulders, gravel pads | ambientCG Gravel040: https://ambientcg.com/view?id=Gravel040 | CC0 |
| asphalt | paved roads | ambientCG Asphalt031: https://ambientcg.com/view?id=Asphalt031 | CC0 |
| bark | tree trunks, cabin logs | ambientCG Bark014: https://ambientcg.com/view?id=Bark014 | CC0 |
| planks | fences, porches, barn walls, doors | ambientCG Planks023A: https://ambientcg.com/view?id=Planks023A | CC0 |
| siding | house and store walls | ambientCG WoodSiding008: https://ambientcg.com/view?id=WoodSiding008 | CC0 |
| tin | metal roofs, shed walls | ambientCG CorrugatedSteel005: https://ambientcg.com/view?id=CorrugatedSteel005 | CC0 |
| shingles | coloured house roofs | ambientCG RoofingTiles013A: https://ambientcg.com/view?id=RoofingTiles013A | CC0 |
| brick | chimneys, brick fronts | ambientCG Bricks105: https://ambientcg.com/view?id=Bricks105 | CC0 |
| concrete | plinths, stone, rocks, pads | ambientCG Concrete034: https://ambientcg.com/view?id=Concrete034 | CC0 |
| rust | water tower, silos, steel | AI (Gemini gemini-3.1-flash-image, 1K), our own. Prompt: "Seamless tileable texture, flat orthographic photo scan of an old painted steel water tank panel seen straight on, faded off-white paint, scattered orange-brown rust spots and vertical rust streaks running down from faint horizontal rivet seams, even flat lighting, no shadows, no perspective, fills the whole frame edge to edge" | ours |

## Tree models (`trees.glb`, only with `?trees=new`)

All by Quaternius, CC0 1.0 (licence shown on each Poly Pizza page; Quaternius
releases all packs as CC0: https://quaternius.com). Cut down to about 200
triangles (near) and 50 (far) each with meshoptimizer, recoloured with the
game's leaf and trunk colours, by `tools/look/trees.mjs`. 23 KB in all.

| Mesh | Model | Source | License |
|---|---|---|---|
| pine, pineFar | Pine Tree (1681 tris) | https://poly.pizza/m/gX8WmgkeEm | CC0 |
| oakA, oakAFar | Tree (1810 tris) | https://poly.pizza/m/9nvGuZlbpE | CC0 |
| oakB, oakBFar | Tree (1366 tris) | https://poly.pizza/m/8qABc2Nslz | CC0 |
| willow, willowFar | Willow (2752 tris) | https://poly.pizza/m/mBrUbIp9Zd | CC0 |
| bush | Bush (364 tris) | https://poly.pizza/m/92EytlU1El | CC0 |
