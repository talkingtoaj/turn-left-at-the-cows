#!/usr/bin/env node
// AM sound tool (#20). Turns the owner's masters into small AM-radio files.
//
//   npm run radio:bake -- <masters dir> [--write-durations] [--only id,id] [--out <dir>]
//
// Masters dir can also come from the RADIO_MASTERS env var, or defaults to
// ../radio-masters (next to the repo, never inside it).
// Masters are named like the segment file names (ashford_link_1.wav, .mp3,
// .m4a or .flac all work). Output: public/radio/<station>/<id>.mp3.
// Needs ffmpeg and ffprobe on PATH.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEGMENTS, RADIO_AUDIO_DIR } from '../src/radio/segments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['.wav', '.flac', '.m4a', '.mp3', '.aac', '.ogg', '.aif', '.aiff'];

// The AM chain. Band-pass 300 to 3400 Hz, gentle compression, soft saturation,
// filter again (saturation makes new highs), even loudness, mono, 22.05 kHz,
// 40 kbps mp3. Same chain for music and speech.
const FILTER = [
  'pan=mono|c0=0.5*c0+0.5*c1',
  'highpass=f=300:poles=2',
  'lowpass=f=3400:poles=2',
  'acompressor=threshold=0.06:ratio=3:attack=15:release=250:makeup=3',
  'asoftclip=type=tanh:threshold=0.6',
  'highpass=f=300',
  'lowpass=f=3400',
  'loudnorm=I=-18:TP=-2:LRA=7',
  'aresample=22050',
].join(',');
const BITRATE = '40k';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--only', '--out'].includes(args[i - 1])));
const mastersDir = path.resolve(positional[0] || process.env.RADIO_MASTERS || path.join(ROOT, '..', 'radio-masters'));
const outRoot = path.resolve(opt('--out') || path.join(ROOT, 'public', RADIO_AUDIO_DIR));
const only = opt('--only') ? opt('--only').split(',') : null;

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }
function run(cmd, a) { return spawnSync(cmd, a, { encoding: 'utf8' }); }

for (const c of ['ffmpeg', 'ffprobe']) {
  if (run(c, ['-version']).error) fail(c + ' not found. Install ffmpeg first.');
}
if (!fs.existsSync(mastersDir) || !fs.statSync(mastersDir).isDirectory()) {
  fail('masters folder not found: ' + mastersDir + '\nPass it as the first argument, or set RADIO_MASTERS.');
}
const rel = path.relative(ROOT, mastersDir);
if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
  fail('masters folder is inside the repo (' + mastersDir + '). Keep masters outside the repo, never in public/.');
}

function duration(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = parseFloat(r.stdout);
  return Number.isFinite(d) ? d : null;
}

// Index the masters by base name.
const byId = new Map();
const unknown = [];
const dupes = [];
for (const f of fs.readdirSync(mastersDir).sort()) {
  if (f.startsWith('.')) continue;
  const ext = path.extname(f).toLowerCase();
  if (!EXTS.includes(ext)) { unknown.push(f + '  (not an audio file type)'); continue; }
  const id = path.basename(f, path.extname(f)).toLowerCase();
  if (!SEGMENTS.some((s) => s.id === id)) { unknown.push(f); continue; }
  if (byId.has(id)) { dupes.push(f + ' (using ' + byId.get(id).name + ')'); continue; }
  byId.set(id, { name: f, full: path.join(mastersDir, f) });
}

const missing = SEGMENTS.filter((s) => !byId.has(s.id));
const results = [];
let failed = 0;
for (const seg of SEGMENTS) {
  if (only && !only.includes(seg.id)) continue;
  const m = byId.get(seg.id);
  if (!m) continue;
  const dir = path.join(outRoot, seg.station);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, seg.file);
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', m.full, '-vn', '-af', FILTER,
    '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-map_metadata', '-1', out]);
  if (r.status !== 0) {
    failed++;
    console.error('FAILED ' + m.name + ': ' + (r.stderr || '').trim().split('\n').pop());
    continue;
  }
  const d = duration(out);
  const kb = fs.statSync(out).size / 1024;
  results.push({ seg, d });
  console.log('baked ' + seg.id.padEnd(18) + (d == null ? '?' : d.toFixed(1).padStart(6) + ' s') +
    '  ' + kb.toFixed(0).padStart(5) + ' KB  (guess ' + seg.seconds + ' s)');
}

console.log('\nBaked ' + results.length + ' of ' + SEGMENTS.length + ' segments into ' + outRoot);
if (failed) console.log(failed + ' file(s) failed.');
if (missing.length) {
  console.log('\nMissing masters (' + missing.length + '):');
  for (const s of missing) console.log('  ' + s.file);
}
if (unknown.length) {
  console.log('\nUnknown files, match no segment (' + unknown.length + '):');
  for (const u of unknown) console.log('  ' + u);
}
if (dupes.length) {
  console.log('\nDuplicate masters, ignored (' + dupes.length + '):');
  for (const u of dupes) console.log('  ' + u);
}

if (flag('--write-durations')) {
  const file = path.join(ROOT, 'src', 'radio', 'segments.js');
  let src = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const { seg, d } of results) {
    if (d == null) continue;
    const re = new RegExp("((?:spoken|music)\\('" + seg.id + "', '" + seg.station + "', '" + seg.kind + "', )[0-9.]+");
    const next = src.replace(re, '$1' + Math.round(d * 10) / 10);
    if (next !== src) n++;
    src = next;
  }
  fs.writeFileSync(file, src);
  console.log('\nWrote real durations for ' + n + ' segment(s) into src/radio/segments.js.');
} else if (results.length) {
  console.log('\nTip: add --write-durations to copy these lengths into src/radio/segments.js.');
}
process.exit(failed ? 1 : 0);
