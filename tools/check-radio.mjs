// Checks the radio segment list: 20 segments per station (15 spoken, 5 music),
// each song has a title and artist and its intro plays right before it and names it,
// rotation covers each once, files unique, no dashes, no other town named,
// no time-of-day words, known kinds only, one new kind (traffic or thought) per station,
// no banned words (honest, second only to the elevator).
import { STATIONS, SEGMENTS } from '../src/radio/segments.js';
import { ACTING } from '../src/radio/acting.js';

let bad = 0;
const fail = (m) => { console.error('FAIL', m); bad++; };
const files = new Set();
const KINDS = ['link', 'farm', 'swap', 'weather', 'ad', 'notices', 'guest', 'traffic', 'thought', 'intro', 'jingle', 'music'];
const others = ['Millbrook', 'Calder', 'Dunmore', 'Oakham', 'Corley'];
const otherTowns = { ashford: ['Brandt', ...others], brandt: ['Ashford', ...others] };

// Acting cues may add [tags] and change punctuation, never the words.
const words = (t) => t.replace(/\[[^\]]*\]/g, ' ').toLowerCase().replace(/[^a-z0-9'~]+/g, ' ').trim();
for (const [id, text] of Object.entries(ACTING)) {
  const seg = SEGMENTS.find((s) => s.id === id);
  if (!seg || !seg.spoken) { fail('acting cue for unknown spoken piece ' + id); continue; }
  if (words(text) !== words(seg.subtitle)) fail(id + ' acting text has different words from the subtitle');
  if (text.split('\n\n').length !== seg.subtitle.split('\n\n').length) fail(id + ' acting text paragraphs differ');
}

for (const st of STATIONS) {
  const segs = SEGMENTS.filter((s) => s.station === st.id);
  if (segs.length !== 20) fail(st.id + ' has ' + segs.length + ' segments');
  if (segs.filter((s) => s.spoken).length !== 15) fail(st.id + ' spoken count');
  if (segs.filter((s) => !s.spoken).length !== 5) fail(st.id + ' music count');
  if ([...new Set(st.rotation)].sort().join() !== segs.map((s) => s.id).sort().join()) fail(st.id + ' rotation mismatch');
  for (const id of st.rotation) if (!id.endsWith('_jingle') && st.rotation.filter((x) => x === id).length !== 1) fail(id + ' plays more than once');
  // A jingle between every two songs, counting the loop around.
  const songAt = st.rotation.map((id, i) => (id.includes('_music_') ? i : -1)).filter((i) => i >= 0);
  songAt.forEach((a, k) => {
    const b = songAt[(k + 1) % songAt.length];
    const span = b > a ? st.rotation.slice(a + 1, b) : [...st.rotation.slice(a + 1), ...st.rotation.slice(0, b)];
    if (!span.includes(st.id + '_jingle')) fail(st.id + ' no jingle after ' + st.rotation[a]);
  });
  for (let n = 1; n <= 4; n++) {
    const song = segs.find((s) => s.id === st.id + '_music_' + n);
    const intro = segs.find((s) => s.id === st.id + '_intro_' + n);
    if (!song || !intro) { fail(st.id + ' song or intro ' + n + ' missing'); continue; }
    if (!song.title || !song.artist) fail(song.id + ' needs a title and artist');
    if (st.rotation.indexOf(intro.id) !== st.rotation.indexOf(song.id) - 1) fail(intro.id + ' must play right before ' + song.id);
    const said = intro.subtitle.toLowerCase();
    if (!said.includes(song.title.toLowerCase())) fail(intro.id + ' does not say the title');
  }
  const extra = segs.filter((s) => s.kind === 'traffic' || s.kind === 'thought').length;
  if (extra !== 1) fail(st.id + ' needs exactly one traffic or thought piece, has ' + extra);
  for (const s of segs) {
    if (!KINDS.includes(s.kind)) fail(s.id + ' unknown kind ' + s.kind);
    if (/\bhonest|second only to the elevator/i.test(s.subtitle)) fail(s.id + ' banned phrase');
    if (files.has(s.file)) fail('dup file ' + s.file);
    files.add(s.file);
    if (/[—–]/.test(s.subtitle + s.voiceNotes)) fail(s.id + ' dash');
    for (const t of otherTowns[st.id]) if (s.subtitle.includes(t)) fail(s.id + ' names ' + t);
    if (/\b(today|tonight|this morning|this afternoon|right now)\b/i.test(s.subtitle)) fail(s.id + ' timed word');
  }
}
console.log(bad ? bad + ' problems' : 'radio list ok: ' + SEGMENTS.length + ' segments');
process.exit(bad ? 1 : 0);
