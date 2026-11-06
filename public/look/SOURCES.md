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

## Cars and fallen trees (no files)

The player's car, the traffic cars and the farm trucks are built in code
(`src3/world3d/carbody.js`, `car3d.js`, `traffic3d.js`). Their trim textures
(number plates with a made-up "ASHFORD COUNTY" plate, grille, lamp lenses,
hubcap, tyre tread, seat fabric, badge) are drawn in code on a canvas at load
time (`src3/world3d/caratlas.js`): ours, no image files and no AI. The paint,
glass and chrome reflect the CC0 Poly Haven sunny sky listed above
(`look.carEnv()` in `src3/look/look.js`).

The fixed fallen trees lie down the same Quaternius CC0 tree models listed
above (code-made shapes with `?trees=old`); the root plate and soil are code.

## Ruins and the grain elevator (round 5)

The old mill, the Voss place, Pruitt's truck, Gilmore Halt and Ashford's
grain elevator are built in code (`src3/world3d/ruins3d.js`, `structures.js`)
and take these weathered textures by colour (`src3/look/surfaces.js`), mapped
flat along each face like the rest. Fetched by `tools/look/fetch.mjs <cache> ph`
(Poly Haven 1k jpg, cut to 512 px webp, colour and GL normal map).

| Name | Used on | Source | License |
|---|---|---|---|
| stonewall | mill walls, chimney and rubble, scorched tops, the halt's platform | Poly Haven, Old Stone Wall: https://polyhaven.com/a/old_stone_wall | CC0 |
| peeling | Voss farmhouse weatherboard, peeling white paint | Poly Haven, Weathered Peeling Timber: https://polyhaven.com/a/weathered_peeling_timber | CC0 |
| greyplanks | boarded windows, Voss shed and door, halt shelter, sign posts, sleepers, mill wheel paddles and spokes, elevator door | Poly Haven, Wood Planks Grey: https://polyhaven.com/a/wood_planks_grey | CC0 |
| charred | the mill's fallen beams and burned paddles | Poly Haven, Wood Peeling Paint Weathered: https://polyhaven.com/a/wood_peeling_paint_weathered | CC0 |
| rustheavy | hand pump, rails, wheel rims and axle, truck fenders, frame and bumper, broken windpump, elevator spout | Poly Haven, Rust Coarse 01: https://polyhaven.com/a/rust_coarse_01 | CC0 |
| rustpaint | Pruitt's truck (faded green paint, rust streaks), the buffer stop | Poly Haven, Green Metal Rust: https://polyhaven.com/a/green_metal_rust | CC0 |
| rustytin | Voss roof and porch, shed roof, halt shelter roof, elevator roofs | Poly Haven, Rusty Corrugated Iron: https://polyhaven.com/a/rusty_corrugated_iron | CC0 |
| galvtin | grain elevator cladding and head house | Poly Haven, Worn Corrugated Iron: https://polyhaven.com/a/worn_corrugated_iron | CC0 |

Painted signs (`signs/<name>.webp`, 1024 px wide, cropped to the lettered band):

| File | Used on | Source | License |
|---|---|---|---|
| `signs/gilmore.webp` | Gilmore Halt name board, both faces | AI (Gemini gemini-3.1-flash-image, 1K, 21:9), our own. Prompt in `tools/look/ai_log.jsonl` | ours |
| `signs/coop.webp` | "ASHFORD CO-OP" band on all four sides of the elevator top | AI (Gemini gemini-3.1-flash-image, 1K, 21:9), our own. Prompt in `tools/look/ai_log.jsonl` | ours |

Windpumps are plain code shapes (steel and the rust colours above). Broken
window glass is a few plain triangles. Rough ground (`src/world/roughness.js`)
is seeded noise; its small bumps reuse the CC0 soil normal map above.
