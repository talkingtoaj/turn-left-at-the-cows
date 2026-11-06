// Look test: downloads the CC0 textures from ambientCG and the sky HDRI from
// Poly Haven into a cache folder, then writes small tileable copies into
// public/look/tex (512 px webp: colour, plus a normal map where listed).
// The sky is baked by tools/look/bake_sky.py from the cached HDRI.
//
//   node tools/look/fetch.mjs <cacheDir>
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

const HDRI = { id: 'kloofendal_38d_partly_cloudy_puresky', res: '2k' };

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

for (const t of TEXTURES) {
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

const hdr = path.join(cache, `${HDRI.id}_${HDRI.res}.hdr`);
await download(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${HDRI.res}/${HDRI.id}_${HDRI.res}.hdr`, hdr);
console.log('hdri', hdr);
