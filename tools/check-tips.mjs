// The context tips (src/game/tips.js) that #87 added or leans on:
//   - bridge_out: the owner's line, shown once, the first time you go by a
//     BRIDGE OUT sign (in the car or on foot). It stays up after you pass,
//     waits while a card or the map is up, and goes before map_wrong (the
//     washed-out bridge just past the sign is a shift).
// Drives the tip engine frame by frame up Creek Road past the real sign.
//
//   npm run check:tips
//
// Exits 1 when any check fails.

import { createTips, TIP_CONTEXT, TIPS, BRIDGE_OUT_NEAR, bridgeOutStep } from '../src/game/tips.js';
import { setRegion } from '../src/world/world.js';

let fails = 0;
const check = (ok, what) => {
  if (!ok) {
    fails++;
    console.log('FAIL ' + what);
  }
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

const LINE = "Uh oh, looks like Darlene's map is out of date. Better check if there's anyone nearby you can ask for directions.";
const tip = TIPS.find((t) => t.id === 'bridge_out');
check(!!tip, 'bridge_out tip exists');
check(tip && tip.text === LINE, "bridge_out says the owner's line word for word");
check(tip && tip.max === 1, 'bridge_out shows once');

// bridgeOutStep across calls: Infinity until you come near, then the time since.
{
  const mem = {};
  check(bridgeOutStep(mem, 200, 0) === Infinity, 'bridgeOutStep: far, never near');
  check(bridgeOutStep(mem, 10, 5) === 0, 'bridgeOutStep: near now');
  check(bridgeOutStep(mem, 80, 9) === 4, 'bridgeOutStep: 4 s after');
  check(bridgeOutStep(mem, 20, 12) === 0, 'bridgeOutStep: near again');
}

const W = setRegion('fenwick');
const signs = W.signs.filter((s) => s.lines && /BRIDGE OUT/.test(s.lines[0]));
check(signs.length >= 1, 'Fenwick has a BRIDGE OUT sign');
const sign = signs[0];
const shift = W.printedMaps.county1987.shifts.find((s) => s.id === 'old_bridge');
check(!!shift, 'the washed-out bridge is a shift on Darlene\'s map');

// A drive along a straight line from a to b at v m/s, 10 frames a second,
// then a stop there for `wait` s. Returns the tip shown each frame.
function drive(tips, a, b, { v = 12, wait = 40, t0 = 0, busy = () => false } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const frames = Math.ceil(len / v / 0.1) + wait * 10;
  const mem = {};
  let seenAt = -Infinity;
  const out = [];
  for (let i = 0; i <= frames; i++) {
    const t = t0 + i * 0.1;
    const k = Math.min(1, (i * 0.1 * v) / len);
    const x = a[0] + (b[0] - a[0]) * k;
    const y = a[1] + (b[1] - a[1]) * k;
    if (Math.hypot(x - shift.at[0], y - shift.at[1]) < shift.r && seenAt < 0) seenAt = t;
    const c = {
      ...TIP_CONTEXT, speed: k < 1 ? v : 0, busy: busy(t),
      bridgeOutAge: bridgeOutStep(mem, Math.hypot(x - sign.x, y - sign.y), t),
      shiftAge: t - seenAt,
    };
    const got = tips.update(c, t);
    out.push({ t, id: got ? got.id : null, d: Math.hypot(x - sign.x, y - sign.y) });
  }
  return out;
}
const south = [sign.x - 20, sign.y + 330]; // up Creek Road from Ashford's side
const atBridge = [shift.at[0], shift.at[1] + 20];

// Up the road, past the sign, to the washed-out bridge.
{
  const s = drive(createTips({ storage: memStorage() }), south, atBridge);
  const first = s.findIndex((f) => f.id === 'bridge_out');
  check(first >= 0, 'bridge_out shows when you pass the sign');
  if (first >= 0) check(s[first].d < BRIDGE_OUT_NEAR + 15, `bridge_out shows at the sign (showed ${s[first].d.toFixed(0)} m off)`);
  const up = s.filter((f) => f.id === 'bridge_out').length / 10;
  check(up >= 8, `bridge_out stays up after you pass (${up.toFixed(1)} s)`);
  const mw = s.findIndex((f) => f.id === 'map_wrong');
  check(mw < 0 || mw > first, 'bridge_out comes before map_wrong');
  check(mw > 0, 'map_wrong still follows once bridge_out is done');
}
// Fast, at 25 m/s: still shows and stays up.
{
  const s = drive(createTips({ storage: memStorage() }), south, atBridge, { v: 25 });
  check(s.filter((f) => f.id === 'bridge_out').length >= 80, 'bridge_out at speed: up for 8 s or more');
}
// Nowhere near the sign: never.
{
  const s = drive(createTips({ storage: memStorage() }), [100, 2400], [500, 2400]);
  check(!s.some((f) => f.id === 'bridge_out'), 'no bridge_out away from the sign');
}
// Busy (the map open) while passing: waits, then shows once it closes.
{
  const s = drive(createTips({ storage: memStorage() }), south, atBridge, { busy: (t) => t < 26 });
  const shown = s.filter((f) => f.id === 'bridge_out');
  check(shown.length > 0 && shown.every((f) => f.t >= 26), 'bridge_out waits while busy, shows after');
}
// Once only: two passes, minutes apart, and a later visit.
{
  const storage = memStorage();
  const tips = createTips({ storage });
  const a = drive(tips, south, atBridge);
  const b = drive(tips, south, atBridge, { t0: 600 });
  check(a.some((f) => f.id === 'bridge_out'), 'first pass shows it');
  check(!b.some((f) => f.id === 'bridge_out'), 'second pass does not');
  const c = drive(createTips({ storage }), south, atBridge);
  check(!c.some((f) => f.id === 'bridge_out'), 'a later visit does not');
}

if (fails) {
  console.log(`${fails} tip check(s) failed`);
  process.exit(1);
}
console.log('tips OK');
