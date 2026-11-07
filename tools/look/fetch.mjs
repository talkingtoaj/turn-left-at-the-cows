// Look test: downloads the CC0 textures from ambientCG and the sky HDRI from
// Poly Haven into a cache folder, then writes small tileable copies into
// public/look/tex (512 px webp: colour, plus a normal map where listed).
// The skies are baked by tools/look/bake_sky.py from the cached HDRIs: the
// small one from the 2k file, the sharp one (`sharp`) from the 4k file.
//
//   node tools/look/fetch.mjs <cacheDir> [ph [name]]
//   node tools/look/fetch.mjs <cacheDir> sky   (only the sky HDRIs)
//
// With `ph` only the Poly Haven textures (the ruins and grain elevator set,
// the rocks) are fetched; `ph <name>` only that one.
//
// Needs unzip and ffmpeg on the PATH. Sources are listed in public/look/SOURCES.md.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.resolve(process.argv[2] || '/tmp/look-cache');
const out = path.join(root, 'public/look/tex');
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(out, { recursive: true });

// name in the game -> ambientCG asset id. normal: also keep the normal map.
// turn: rotate 90 degrees (unused now: the shader can swap a layer's axes).
export const TEXTURES = [
  { name: 'grass', id: 'Grass004', normal: true },
  { name: 'soil', id: 'Ground048', normal: true },
  { name: 'dirt', id: 'Ground103', normal: true },
  { name: 'gravel', id: 'Gravel040', normal: true },
  { name: 'asphalt', id: 'Asphalt031', normal: true },
  { name: 'bark', id: 'Bark014', normal: true },
  { name: 'planks', id: 'Planks023A', normal: true },
  { name: 'siding', id: 'WoodSiding008', normal: true },
  { name: 'tin', id: 'CorrugatedSteel005', normal: true },
  { name: 'shingles', id: 'RoofingTiles013A', normal: true },
  { name: 'brick', id: 'Bricks105', normal: true },
  { name: 'concrete', id: 'Concrete034', normal: true },
];

// name in the game -> Poly Haven texture id (1k jpg diffuse and GL normal).
// The ruins and the grain elevator (round 5).
export const POLYHAVEN = [
  { name: 'stonewall', id: 'old_stone_wall' },
  { name: 'peeling', id: 'weathered_plank_siding' }, // round 6: was weathered_peeling_timber (blotchy up close)
  { name: 'greyplanks', id: 'wood_planks_grey' },
  { name: 'charred', id: 'wood_peeling_paint_weathered' },
  { name: 'rustheavy', id: 'rust_coarse_01' },
  { name: 'rustpaint', id: 'green_metal_rust' },
  { name: 'rustytin', id: 'rusty_corrugated_iron' },
  { name: 'galvtin', id: 'worn_corrugated_iron' },
  { name: 'rock', id: 'lichen_rock' }, // round 8: the scatter rocks and outcrops
];
const onlyPH = process.argv[3] === 'ph';
const onlyName = process.argv[4]; // with ph: just this one (e.g. rock)

// name in the game -> Poly Haven HDRI id. Each at 2k (sky.webp, sky.json) and
// 4k (sky_4k.webp, the sharp sky swapped in once the game runs).
const HDRIS = [
  { name: 'sky', id: 'kloofendal_38d_partly_cloudy_puresky' },
  { name: 'sky_sunny', id: 'qwantani_mid_morning_puresky' },
];
const HDRI_RES = ['2k', '4k'];
const onlySky = process.argv[3] === 'sky';

async function download(url, file) {
  if (fs.existsSync(file)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function ffmpeg(src, dst, turn) {
  const vf = ['scale=512:512:flags=lanczos'];
  if (turn) vf.unshift('transpose=1');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', vf.join(','), '-quality', '82', dst]);
}

for (const t of POLYHAVEN.filter((p) => !onlySky && (!onlyName || p.name === onlyName))) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${t.id}`)).json();
  for (const [key, suffix] of [['Diffuse', ''], ['nor_gl', '_n']]) {
    const url = files[key]['1k'].jpg.url;
    const file = path.join(cache, `${t.id}_${key}_1k.jpg`);
    await download(url, file);
    ffmpeg(file, path.join(out, `${t.name}${suffix}.webp`));
  }
  console.log(t.name, t.id);
}
if (onlyPH) process.exit(0);

for (const t of onlySky ? [] : TEXTURES) {
  const zip = path.join(cache, `${t.id}_1K-JPG.zip`);
  await download(`https://ambientcg.com/get?file=${t.id}_1K-JPG.zip`, zip);
  const dir = path.join(cache, t.id);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  const files = fs.readdirSync(dir);
  const color = files.find((f) => /_Color\.jpg$/i.test(f));
  const normal = files.find((f) => /_NormalGL\.jpg$/i.test(f));
  ffmpeg(path.join(dir, color), path.join(out, `${t.name}.webp`), t.turn);
  if (t.normal && normal) ffmpeg(path.join(dir, normal), path.join(out, `${t.name}_n.webp`), t.turn);
  console.log(t.name, t.id, color, normal || '-');
}

for (const h of HDRIS) {
  for (const res of HDRI_RES) {
    const hdr = path.join(cache, `${h.id}_${res}.hdr`);
    await download(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${res}/${h.id}_${res}.hdr`, hdr);
    console.log('hdri', h.name, res, hdr);
  }
}
