// Checks the radio segment list: 16 segments per station (11 spoken, 5 music),
// rotation covers each once, files unique, no dashes, no other town named,
// no time-of-day words.
import { STATIONS, SEGMENTS } from '../src/radio/segments.js';

let bad = 0;
const fail = (m) => { console.error('FAIL', m); bad++; };
const files = new Set();
const others = ['Millbrook', 'Calder', 'Dunmore', 'Oakham', 'Corley'];
const otherTowns = { ashford: ['Brandt', ...others], brandt: ['Ashford', ...others] };

for (const st of STATIONS) {
  const segs = SEGMENTS.filter((s) => s.station === st.id);
  if (segs.length !== 16) fail(st.id + ' has ' + segs.length + ' segments');
  if (segs.filter((s) => s.spoken).length !== 11) fail(st.id + ' spoken count');
  if (segs.filter((s) => !s.spoken).length !== 5) fail(st.id + ' music count');
  if ([...st.rotation].sort().join() !== segs.map((s) => s.id).sort().join()) fail(st.id + ' rotation mismatch');
  for (const s of segs) {
    if (files.has(s.file)) fail('dup file ' + s.file);
    files.add(s.file);
    if (/[—–]/.test(s.subtitle + s.voiceNotes)) fail(s.id + ' dash');
    for (const t of otherTowns[st.id]) if (s.subtitle.includes(t)) fail(s.id + ' names ' + t);
    if (/\b(today|tonight|this morning|this afternoon|right now)\b/i.test(s.subtitle)) fail(s.id + ' timed word');
  }
}
console.log(bad ? bad + ' problems' : 'radio list ok: ' + SEGMENTS.length + ' segments');
process.exit(bad ? 1 : 0);
