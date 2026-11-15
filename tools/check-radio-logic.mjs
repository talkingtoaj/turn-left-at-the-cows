// Checks the radio maths (src/radio/radioLogic.js) and that each station's mast
// exists in its region's world data.
import { STATIONS } from '../src/radio/segments.js';
import {
  signalAt, tuneQuality, mixFor, loopLength, globalPos,
  startPosition, advance, resumeAfterGap, segmentAt, hearStep, GAP_CARRY_ON, HEAR_LOST, HEAR_BACK, HEAR_LOST_AFTER,
} from '../src/radio/radioLogic.js';
import { REGIONS } from '../src/world/regions.js';

let bad = 0;
const fail = (m) => { console.error('FAIL', m); bad++; };

// Signal falls with distance and is barely there across the counties.
if (!(signalAt(0) > 0.99)) fail('signal at the mast');
if (!(signalAt(1000) > signalAt(5500))) fail('signal not falling');
if (!(signalAt(5500) > 0.15 && signalAt(5500) < 0.4)) fail('far end of Fenwick: ' + signalAt(5500));

// Masts exist, and the other county's mast is far off.
const pos = {};
for (const st of STATIONS) {
  let found = 0;
  for (const [rid, r] of Object.entries(REGIONS)) {
    const l = (r.source.landmarks || []).find((m) => m.id === st.mastId);
    if (l) {
      found++;
      if (l.kind !== 'radio_mast') fail(st.mastId + ' is not a radio_mast');
      pos[st.id] = { rid, ...globalPos(rid, l.x, l.y) };
    }
  }
  if (found !== 1) fail(st.mastId + ' found ' + found + ' times');
}
const gap = Math.hypot(pos.ashford.x - pos.brandt.x, pos.ashford.y - pos.brandt.y);
const faint = signalAt(gap);
if (!(faint < 0.06 && faint > 0.005)) fail('other county signal ' + faint);

// Dial: right on a station is clear, a little off is partly, far off is static.
const a = STATIONS[0];
if (tuneQuality(a.freqKhz, a.freqKhz) !== 1) fail('on dial');
if (!(tuneQuality(a.freqKhz + 10, a.freqKhz) < 0.8)) fail('10 off still clear');
if (tuneQuality(a.freqKhz + 40, a.freqKhz) !== 0) fail('40 off');
// Weak signal: less voice, more muffled, more static.
const strong = mixFor(1, 1);
const weak = mixFor(0.05, 1);
if (!(weak.voice < strong.voice && weak.lowpass < strong.lowpass && weak.noise > strong.noise)) fail('weak mix');
const between = mixFor(1, 0);
if (between.voice !== 0 || !(between.noise > strong.noise)) fail('between stations');

// Positions: forward only, rolling over item ends and the loop end.
for (const st of STATIONS) {
  const n = st.rotation.length;
  const seg0 = segmentAt(st, { index: 0, offset: 0 });
  // Rolling past an item end carries the extra seconds into the next one.
  const r = advance(st, { index: 0, offset: seg0.seconds - 2 }, 5);
  if (r.index !== 1 || Math.abs(r.offset - 3) > 1e-6) fail(st.id + ' roll past end ' + JSON.stringify(r));
  // A whole loop lands back where it began.
  const half = segmentAt(st, { index: 2, offset: 0 }).seconds / 2;
  const loop = advance(st, { index: 2, offset: half }, loopLength(st));
  if (loop.index !== 2 || Math.abs(loop.offset - half) > 1e-6) fail(st.id + ' full loop');
  // Start positions: a random item, offset 0, same random gives the same spot.
  for (const rv of [0, 0.5, 0.999999]) {
    const p = startPosition(st, () => rv);
    if (p.offset !== 0 || p.index !== Math.floor(rv * n)) fail(st.id + ' start ' + rv);
  }
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(startPosition(st, () => i / 50).index);
  if (seen.size < 2) fail(st.id + ' starts always the same');
  // Short gap: as if it kept playing.
  const here = { index: 1, offset: 4 };
  const s1 = resumeAfterGap(st, here, GAP_CARRY_ON - 0.5);
  if (s1.index !== 1 || Math.abs(s1.offset - (4 + GAP_CARRY_ON - 0.5)) > 1e-6) fail(st.id + ' short gap');
  // Short gap that runs past the end of the item rolls into the next.
  const seg1 = segmentAt(st, here);
  const s2 = resumeAfterGap(st, { index: 1, offset: seg1.seconds - 1 }, 3);
  if (s2.index !== 2 || Math.abs(s2.offset - 2) > 1e-6) fail(st.id + ' short gap roll ' + JSON.stringify(s2));
  // Long gap: the next item, 3 s in for music and jingles, 1 s for talk.
  for (let i = 0; i < n; i++) {
    const s3 = resumeAfterGap(st, { index: i, offset: 2 }, 60);
    if (s3.index !== (i + 1) % n) fail(st.id + ' long gap item ' + i);
    const next = segmentAt(st, s3);
    if (s3.offset !== (next.spoken ? 1 : 3)) fail(st.id + ' long gap offset ' + next.id + ' ' + s3.offset);
  }
  // From the last item it wraps to the first.
  if (resumeAfterGap(st, { index: n - 1, offset: 10 }, 30).index !== 0) fail(st.id + ' wrap');
  // Exactly at the limit counts as long.
  if (resumeAfterGap(st, { index: 0, offset: 0 }, GAP_CARRY_ON).index !== 1) fail(st.id + ' gap at limit');
}
// Both kinds of item exist, so both resume offsets were checked above.
const kinds = new Set();
for (const st of STATIONS) for (let i = 0; i < st.rotation.length; i++) kinds.add(segmentAt(st, { index: i, offset: 0 }).spoken);
if (kinds.size !== 2) fail('need both talk and music items to test resume offsets');

// Heard: lost only after a full second below the lost level, back at the higher level.
{
  let h = { heard: false, lowFor: 0 };
  h = hearStep(h, HEAR_BACK - 0.01, 0.1);
  if (h.heard) fail('heard below back level');
  h = hearStep(h, HEAR_BACK, 0.1);
  if (!h.heard) fail('not heard at back level');
  h = hearStep(h, HEAR_LOST - 0.01, 0.5);
  if (!h.heard) fail('lost too soon');
  h = hearStep(h, HEAR_LOST + 0.01, 0.1); // a blip above the level resets the count
  h = hearStep(h, HEAR_LOST - 0.01, 0.6);
  if (!h.heard) fail('blip did not reset');
  h = hearStep(h, HEAR_LOST - 0.01, HEAR_LOST_AFTER);
  if (h.heard) fail('not lost after a second');
  // Between the two levels it stays lost (no flicker).
  h = hearStep(h, (HEAR_LOST + HEAR_BACK) / 2, 0.1);
  if (h.heard) fail('came back inside the gap');
}

console.log(bad ? bad + ' problems' : 'radio logic ok (other county signal ' + faint.toFixed(3) + ', ' + Math.round(gap) + ' m)');
process.exit(bad ? 1 : 0);
