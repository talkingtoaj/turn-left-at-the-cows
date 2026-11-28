// The crop duster (SPEC 9s item 1, #90). Engine-free.
//
// A farm sprayer works a field beside Highway 9 early in mission 1: it dives
// in low from the west, sprays three passes along the field, and between the
// passes swings round over the highway (about 22 m up) and back, then climbs
// away. The whole flight is a pure function of the seconds since it appeared,
// so it is the same every time.
//
//   dusterAt(t, out?) -> { visible, spray, x, y, alt, heading, bank, pitch,
//                          vx, vy, vz, throttle }   (alt: metres above the ground)
//   dusterLength()    -> seconds from first sight to gone
//
// Axes as the airfield planes (src/world/airfield.js): x east, y south,
// heading in degrees clockwise from north, bank positive to the right.

const G = 9.8;

export const DUSTER = {
  // WHERE: one place to move it. A point on Highway 9 (it runs along the
  // vector ux,uy there) with the sprayed field on its south side: hay and
  // corn (fields pf_1 and pf_2) about 1.1 km along the road from the mission
  // 1 start in Ashford, a minute or so of driving.
  road: { x: 1790, y: 2192, ux: 500 / Math.hypot(500, 100), uy: -100 / Math.hypot(500, 100) },
  passLen: 300, // metres of each spray pass, centred on the point above
  laneOffset: 75, // metres: the spray pass lies this far south of the road, the return this far north
  turnR: 75, // turn radius (the two lanes are 2 x this apart)
  approach: 260, // metres of dive in from the west
  exitLen: 500, // metres of climb away
  laps: 3, // spray passes
  speed: 32, // m/s
  sprayAlt: 4, // metres above the ground on a pass
  crossAlt: 22, // metres above the ground over the highway
  farAlt: 100, // altitude it climbs to on leaving
  startAlt: 55, // altitude at the start of the dive
};

const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Segments in road coordinates: a along the road (east), l across it (south).
function build() {
  const D = DUSTER;
  const h = D.passLen / 2;
  const R = D.turnR;
  const L = D.laneOffset;
  const segs = [];
  const line = (a0, l0, a1, l1, alt, spray, th) => segs.push({ len: Math.hypot(a1 - a0, l1 - l0), spray, th,
    at: (u) => ({ a: lerp(a0, a1, u), l: lerp(l0, l1, u), alt: alt(u) }) });
  // dir +1: turn1 (east to west by way of the north side), -1: turn2 (back to the south side).
  const turn = (dir, alt) => segs.push({ len: Math.PI * R, spray: false, th: 0.85,
    at: (u) => {
      const p = u * Math.PI;
      return dir > 0
        ? { a: h + R * Math.sin(p), l: (L - R) + R * Math.cos(p), alt: alt(u) }
        : { a: -h - R * Math.sin(p), l: -(L - R) - R * Math.cos(p), alt: alt(u) };
    } });
  const up = (u) => lerp(D.sprayAlt, D.crossAlt, smooth(u * 2));
  const down = (u) => lerp(D.crossAlt, D.sprayAlt, smooth(u * 2 - 1));
  line(-h - D.approach, L, -h, L, (u) => lerp(D.startAlt, D.sprayAlt, smooth(u)), false, 0.55);
  for (let k = 0; k < D.laps; k++) {
    // The spray is on over the field only, not in the last few metres.
    line(-h, L, h, L, () => D.sprayAlt, true, 0.85);
    turn(1, up);
    if (k < D.laps - 1) {
      line(h, -L, -h, -L, () => D.crossAlt, false, 0.7);
      turn(-1, down);
    }
  }
  line(h, -L, h - D.exitLen, -L, (u) => lerp(D.crossAlt, D.farAlt, smooth(u)), false, 1);
  let s = 0;
  for (const g of segs) { g.s0 = s; s += g.len; }
  return { segs, total: s };
}
const PATH = build();

export const dusterLength = () => PATH.total / DUSTER.speed;

function point(s) {
  const D = DUSTER;
  const segs = PATH.segs;
  let g = segs[segs.length - 1];
  for (let i = 0; i < segs.length; i++) if (s < segs[i].s0 + segs[i].len) { g = segs[i]; break; }
  const q = g.at(Math.max(0, Math.min(1, (s - g.s0) / g.len)));
  const r = D.road;
  return {
    x: r.x + q.a * r.ux - q.l * r.uy,
    y: r.y + q.a * r.uy + q.l * r.ux,
    alt: q.alt, g,
  };
}

export function dusterAt(t, out = {}) {
  const D = DUSTER;
  const s = t * D.speed;
  if (!(t >= 0) || s > PATH.total) {
    out.visible = false;
    out.spray = false;
    return out;
  }
  const e = 1;
  const p0 = point(Math.max(0, s - e));
  const p1 = point(Math.min(PATH.total, s + e));
  const p = point(s);
  const dx = p1.x - p0.x, dy = p1.y - p0.y, ds = Math.hypot(dx, dy) || 1;
  const hd = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y));
  const sc = Math.max(3, Math.min(PATH.total - 3, s)); // keep the window inside the path
  const q0 = point(sc - 3), q1 = point(sc + 3), qm = point(sc);
  let dh = hd(qm, q1) - hd(q0, qm);
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const turnRate = (dh / 3) * D.speed; // rad/s, positive clockwise
  out.visible = true;
  out.spray = p.g.spray;
  out.x = p.x;
  out.y = p.y;
  out.alt = p.alt;
  out.heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  out.bank = Math.atan((D.speed * turnRate) / G);
  out.pitch = Math.atan2(p1.alt - p0.alt, ds);
  out.vx = (dx / ds) * D.speed;
  out.vy = (dy / ds) * D.speed;
  out.vz = ((p1.alt - p0.alt) / ds) * D.speed;
  out.throttle = p.g.th;
  return out;
}
