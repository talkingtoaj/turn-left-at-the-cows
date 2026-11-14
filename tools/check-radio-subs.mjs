// Checks the radio subtitle timing (src/radio/subtitles.js) against every spoken segment.
import { SEGMENTS } from '../src/radio/segments.js';
import { subtitleCues, cueIndexAt, patchyText, subtitleReach, gibberishTag } from '../src/radio/subtitles.js';

let bad = 0;
const fail = (m) => { bad++; console.error('FAIL', m); };

for (const seg of SEGMENTS) {
  const cues = subtitleCues(seg);
  if (!seg.spoken) { if (cues.length) fail(seg.id + ' music has cues'); continue; }
  if (!cues.length) { fail(seg.id + ' no cues'); continue; }
  if (Math.abs(cues[cues.length - 1].end - seg.seconds) > 1e-6) fail(seg.id + ' cues do not fill the segment');
  for (let i = 1; i < cues.length; i++) if (Math.abs(cues[i].start - cues[i - 1].end) > 1e-6) fail(seg.id + ' gap at ' + i);
  if (cueIndexAt(cues, 0) !== 0) fail(seg.id + ' first cue not at 0');
  if (cueIndexAt(cues, seg.seconds + 1) !== -1) fail(seg.id + ' cue after end');
  const g = cues.filter((c) => c.gibberish).length;
  if ((seg.kind === 'guest') !== (g > 0)) fail(seg.id + ' gibberish cues only in guest spots');
  if (cues.some((c) => !c.gibberish && c.text.startsWith('~'))) fail(seg.id + ' tilde leaked');
  if (seg.kind === 'guest' && !/^\[\w+, in his own words\]$/.test(gibberishTag(seg))) fail(seg.id + ' tag ' + gibberishTag(seg));
}
// Longer seconds stretch the cues (real durations).
const s = SEGMENTS.find((x) => x.id === 'ashford_link_1');
const a = subtitleCues(s)[0].end;
const b = subtitleCues({ ...s, seconds: s.seconds * 2 })[0].end;
if (Math.abs(b - a * 2) > 1e-6) fail('durations do not scale');
// Patchy text: full when strong, fewer words as it weakens, nothing below the floor.
const t = 'Corn is a little over two dollars a bushel and soybeans a little under six';
if (patchyText(t, 3, 0.8) !== t) fail('strong signal changed text');
const n = (c) => patchyText(t, 3, c).split(' ').filter((w) => w !== '...').length;
if (!(n(0.5) >= n(0.3) && n(0.3) >= n(0.15))) fail('words do not drop as signal falls');
if (patchyText(t, 3, 0.3) === t) fail('weak signal not patchy');
if (subtitleReach(0.05) !== 'none' || subtitleReach(0.3) !== 'patchy' || subtitleReach(0.9) !== 'full') fail('reach');
// Music lives on the radio only: no music-like sound in the game's own sound list or files.
import { readFileSync, readdirSync } from 'node:fs';
const sounds = readFileSync(new URL('../src/audio/sounds.js', import.meta.url), 'utf8');
for (const m of sounds.matchAll(/id: '([^']+)'[^\n]*label: '([^']*)'/g)) {
  if (/music|jingle|melody|tune\b|\bsongs?\b/i.test(m[1] + ' ' + m[2])) fail('game sound looks like music: ' + m[1]);
}
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));
for (const f of walk(new URL('../public/sounds', import.meta.url).pathname)) if (/music|jingle|melody/i.test(f)) fail('music file outside the radio: ' + f);
console.log(bad ? bad + ' problems' : 'radio subtitle checks ok (' + SEGMENTS.filter((x) => x.spoken).length + ' spoken segments)');
process.exit(bad ? 1 : 0);
