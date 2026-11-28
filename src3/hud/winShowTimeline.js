// When each piece of the animated win screen happens (#94, SPEC 9s item 8).
// Pure: no DOM, so the order and the skip can be checked.
//
//   const tl = winTimeline(seenFlags)   // one true/false per shift, in order
//   tl.at(tSeconds)  -> { trace, rings[], labels[], ticks[], count, done }
//   tl.end           -> seconds until the finished frame
// Each progress value runs 0 to 1. At or past tl.end everything is 1 and the
// count is the full number seen.

export const TIMES = {
  hold: 0.7, // your map alone first
  trace: 2.0, // the pencil draws the 1992 roads
  ring: 0.55, // one pencil circle
  label: 0.3, // its words fade in
  tick: 0.22, // the tick pops in
  gap: 0.25, // between shifts
  settle: 0.3, // the rest of the 1992 sheet fades in after the trace
  roll: 0.9, // the count rolls up
};

// How the win screen shows its shifts, from the URL and the reduced-motion
// setting. 'play' animates; 'still' is the finished screen at once; 'off'
// (?winfx=off) is today's plain screen; 'at' freezes on one moment
// (?winfx=2.5 is 2.5 s in) for the strip of screenshots. ?shifts=now (the
// dev flag that opens the win screen) gives the finished frame unless
// ?winfx=play is added.
export function winFxMode(search, reduced) {
  const q = new URLSearchParams(search);
  const v = q.get('winfx');
  if (v === 'off') return { mode: 'off' };
  if (v !== null && v !== '' && !Number.isNaN(Number(v))) return { mode: 'at', at: Number(v) };
  if (reduced) return { mode: 'still' };
  if (v === 'play') return { mode: 'play' };
  if (q.get('shifts') === 'now') return { mode: 'still' };
  return { mode: 'play' };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const span = (t, from, len) => clamp01((t - from) / len);

export function winTimeline(seenFlags, T = TIMES) {
  const rings = [];
  const labels = [];
  const ticks = [];
  let t = T.hold + T.trace + 0.3;
  seenFlags.forEach((seen) => {
    rings.push(t);
    labels.push(t + T.ring);
    t += T.ring + T.label;
    ticks.push(seen ? t : -1);
    if (seen) t += T.tick;
    t += T.gap;
  });
  const rollFrom = t;
  const total = seenFlags.filter(Boolean).length;
  const end = rollFrom + (total ? T.roll : 0.2);
  return {
    end,
    at(sec) {
      if (sec >= end) {
        return { trace: 1, rings: seenFlags.map(() => 1), labels: seenFlags.map(() => 1), ticks: seenFlags.map((s) => (s ? 1 : 0)), count: total, done: true };
      }
      return {
        trace: span(sec, T.hold, T.trace),
        rings: rings.map((from) => span(sec, from, T.ring)),
        labels: labels.map((from) => span(sec, from, T.label)),
        ticks: ticks.map((from) => (from < 0 ? 0 : span(sec, from, T.tick))),
        count: Math.round(total * span(sec, rollFrom, T.roll)),
        done: false,
      };
    },
  };
}
