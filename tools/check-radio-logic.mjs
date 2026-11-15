// Checks the radio maths (src/radio/radioLogic.js) and that each station's mast
// exists in its region's world data.
import { STATIONS } from '../src/radio/segments.js';
import {
  signalAt, SIGNAL_LOST_AT, tuneQuality, mixFor, loopLength, globalPos,
  startPosition, advance, resumeAfterGap, segmentAt, nextSegment, hearStep, GAP_CARRY_ON, HEAR_LOST, HEAR_BACK, HEAR_LOST_AFTER,
  autoTuneStep, sweepFreq, SWEEP_SECONDS, volumeGain, VOLUME_START, crackleFor,
} from '../src/radio/radioLogic.js';
import { THUNDER } from '../src/game/thunder.js';
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
// Between the counties the signal is gone: only static.
if (signalAt(gap) !== 0) fail('other county signal ' + signalAt(gap));
if (signalAt(gap / 2) !== 0) fail('halfway between the counties: ' + signalAt(gap / 2));
if (!(signalAt(6500) > 0.15)) fail('still faint at 6.5 km: ' + signalAt(6500));
if (!(signalAt(7800) < signalAt(7000) * 0.6)) fail('no fast drop-off past 7 km');

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

// The item after each place in the loop, the repeated jingle included.
for (const st of STATIONS) {
  const n = st.rotation.length;
  for (let i = 0; i < n; i++) {
    if (nextSegment(st, { index: i, offset: 0 }).id !== st.rotation[(i + 1) % n]) fail(st.id + ' next after ' + i);
  }
}

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

// Auto-tune: stays while heard, moves only when lost and another would be heard.
{
  const sig = (a, b) => ({ ashford: a, brandt: b });
  const run = (tune, list, dt = 0.1) => {
    for (const sg of list) tune = autoTuneStep(tune, sg, dt);
    return tune;
  };
  const rep = (n, sg) => Array.from({ length: n }, () => sg);
  // Mission start on the home station, strong: stays.
  let t = run({ station: 'ashford', hear: {} }, rep(20, sig(0.8, 0.03)));
  if (t.station !== 'ashford') fail('home station left while strong');
  // Home weak, other strong at mission start: moves at once.
  t = run({ station: 'ashford', hear: {} }, [sig(0.03, 0.8)]);
  if (t.station !== 'brandt') fail('did not find the strong station at start');
  // Both heard: stays on its own station even when the other is stronger.
  t = run({ station: 'ashford', hear: {} }, rep(30, sig(0.3, 0.9)));
  if (t.station !== 'ashford') fail('jumped to a stronger station while its own was heard');
  // Lost but nothing else heard: stays (static).
  t = run({ station: 'ashford', hear: {} }, [...rep(10, sig(0.5, 0)), ...rep(40, sig(0.05, 0.05))]);
  if (t.station !== 'ashford' || t.hear.ashford.heard) fail('moved with nothing to move to');
  // Lost, then the other comes in: moves.
  t = run(t, rep(3, sig(0.05, HEAR_BACK + 0.01)));
  if (t.station !== 'brandt') fail('did not move to the station that came in');
  // A dip under the lost level for less than the hold does not move it.
  t = run({ station: 'ashford', hear: {} }, [sig(0.5, 0.5), ...rep(5, sig(HEAR_LOST - 0.01, 0.5))]);
  if (t.station !== 'ashford') fail('moved before the 1 s hold');
  // No station given: picks the strongest heard.
  t = autoTuneStep({ station: null, hear: {} }, sig(0.2, 0.6), 0.1);
  if (t.station !== 'brandt') fail('no station: did not pick the strongest');
  // No flip-flop at the edge. Parked where Brandt sits between the two levels
  // (with short drops under, less than the hold) while Ashford comes and goes
  // over the heard level: it stays on Brandt the whole time.
  let flips = 0;
  let ashfordHeard = 0;
  t = run({ station: 'brandt', hear: {} }, [sig(0, 0.5)]);
  for (let i = 0; i < 3000; i++) {
    const b = i % 20 < 5 ? 0.05 : 0.12 + 0.019 * Math.sin(i * 0.05);
    const was = t.station;
    t = autoTuneStep(t, sig(0.14 + 0.06 * Math.sin(i * 0.031), b), 0.1);
    if (t.station !== was) flips++;
    if (t.hear.ashford.heard) ashfordHeard++;
  }
  if (flips) fail('auto-tune flip-flops at the edge: ' + flips + ' changes');
  if (!ashfordHeard) fail('edge test never had the other station in reach');
}

// A drive from the Ashford mast to the Brandt mast on real signals: Ashford
// first, then a stretch of static where neither comes in, then Brandt, with one
// change of station. And back again the same way.
{
  const drive = (from, to, start) => {
    let t = { station: start, hear: {} };
    const seen = [];
    const steps = 4000;
    let staticM = 0;
    for (let i = 0; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      const s = {};
      for (const id of Object.keys(pos)) s[id] = signalAt(Math.hypot(pos[id].x - x, pos[id].y - y));
      // 25 m/s, so each step of the path is gap/steps metres.
      t = autoTuneStep(t, s, gap / steps / 25);
      if (!Object.values(t.hear).some((h) => h.heard)) staticM += gap / steps;
      if (seen[seen.length - 1] !== t.station) seen.push(t.station);
    }
    return { seen, staticM };
  };
  const there = drive(pos.ashford, pos.brandt, 'ashford');
  if (there.seen.join() !== 'ashford,brandt') fail('drive over: stations ' + there.seen.join());
  if (!(there.staticM > 1000)) fail('drive over: no stretch of static (' + Math.round(there.staticM) + ' m)');
  const back = drive(pos.brandt, pos.ashford, 'brandt');
  if (back.seen.join() !== 'brandt,ashford') fail('drive back: stations ' + back.seen.join());
  console.log('  static between the counties: ' + (there.staticM / 1000).toFixed(1) + ' km');
}

// The needle sweep: starts and ends on the stations, moves one way, takes SWEEP_SECONDS.
{
  if (sweepFreq(1010, 1340, 0) !== 1010 || sweepFreq(1010, 1340, SWEEP_SECONDS) !== 1340) fail('sweep ends');
  if (sweepFreq(1010, 1340, 5) !== 1340 || sweepFreq(1340, 1010, -1) !== 1340) fail('sweep clamps');
  let last = 1010;
  for (let i = 1; i <= 20; i++) {
    const f = sweepFreq(1010, 1340, (i / 20) * SWEEP_SECONDS);
    if (f < last) fail('sweep goes back');
    last = f;
  }
  if (!(SWEEP_SECONDS >= 0.8 && SWEEP_SECONDS <= 1.2)) fail('sweep not about a second');
}

// Volume curve: 0 is silent, 1 is full, always rising, 70% to start.
{
  if (volumeGain(0) !== 0 || volumeGain(1) !== 1) fail('volume ends');
  if (volumeGain(-1) !== 0 || volumeGain(2) !== 1 || volumeGain('x') !== 0) fail('volume clamps');
  for (let v = 0.05; v <= 1; v += 0.05) if (!(volumeGain(v) > volumeGain(v - 0.05))) fail('volume not rising at ' + v);
  const db = 20 * Math.log10(volumeGain(0.5));
  if (!(db < -9 && db > -15)) fail('volume taper: 50% is ' + db.toFixed(1) + ' dB');
  if (VOLUME_START !== 0.7) fail('volume start');
}

// Lightning crackle: close is loud and about half a second, far a faint tick.
{
  const close = crackleFor(THUNDER.MIN_KM, 1);
  const far = crackleFor(THUNDER.MAX_KM, 1);
  if (!(close.level > 0.9 && Math.abs(close.seconds - 0.5) < 0.05)) fail('close crackle ' + JSON.stringify(close));
  if (!(far.level < 0.1 && far.seconds < 0.06)) fail('far crackle ' + JSON.stringify(far));
  let lv = Infinity;
  for (let km = THUNDER.MIN_KM; km <= THUNDER.MAX_KM; km += 0.5) {
    const c = crackleFor(km, 1);
    if (c.level > lv) fail('crackle louder further off at ' + km);
    lv = c.level;
  }
}

console.log(bad ? bad + ' problems' : 'radio logic ok (counties ' + Math.round(gap) + ' m apart, signal lost past ' + SIGNAL_LOST_AT + ' m)');
process.exit(bad ? 1 : 0);
