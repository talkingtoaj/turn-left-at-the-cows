// Checks the radio maths (src/radio/radioLogic.js) and that each station's mast
// exists in its region's world data.
import { STATIONS } from '../src/radio/segments.js';
import {
  signalAt, tuneQuality, mixFor, stationClock, loopLength, nextSegment, globalPos,
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

// Clocks: each station has its own, they differ, and they move on with time.
for (const st of STATIONS) {
  const len = loopLength(st);
  const c0 = stationClock(st, 100);
  const c1 = stationClock(st, 100 + len);
  if (c0.segment.id !== c1.segment.id || Math.abs(c0.offset - c1.offset) > 1e-6) fail(st.id + ' loop');
  const c2 = stationClock(st, 100 + c0.remaining + 0.01);
  if (c2.segment !== nextSegment(st, c0.segment)) fail(st.id + ' next segment');
  const c3 = stationClock(st, 100 + 600);
  if (c3.segment.id === c0.segment.id && Math.abs(c3.offset - c0.offset) < 1) fail(st.id + ' did not move on');
}
if (stationClock(STATIONS[0], 0).segment.id === stationClock(STATIONS[1], 0).segment.id.replace('brandt', 'ashford')
  && stationClock(STATIONS[0], 0).offset === stationClock(STATIONS[1], 0).offset) fail('same clock');

console.log(bad ? bad + ' problems' : 'radio logic ok (other county signal ' + faint.toFixed(3) + ', ' + Math.round(gap) + ' m)');
process.exit(bad ? 1 : 0);
