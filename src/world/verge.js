// Roadside fill (#66, SPEC 9r): tar patches and crack seal on paved roads,
// ditches along stretches of road, old leaning posts, and wildflower verges.
// Plain data and math, no engine code, seeded: the same world always gets the
// same fill. The 3D side draws it (src3/world3d/verge3d.js); the carpet
// (./carpet.js) grows its verge flowers and ditch plants from it;
// tools/check-verge.mjs checks it.
//
//   const V = vergeFor(world)
//   V.patches  [{ road, d, len, off, w, blob, tone }]   on the tar, within one lane
//   V.seals    [{ road, d, len, off, cross }]           crack seal: along a wheel
//                                                       track, or across a lane
//   V.ditches  [{ road, side, d0, d1, off, w, pts }]    a damp swale along a verge
//   V.culverts [{ x, y, x2, y2, angle, road, dir, ditch }]  a pipe under the road
//                                                       that stops a ditch: mouths
//                                                       at (x,y) and (x2,y2) either
//                                                       side, heading angle first
//                                                       to second, `road` crossed
//   V.posts    [{ x, y, rot, lean, leanTo, h, wire }]  old fence posts, leaning
//   V.ditchAt(x, y)  -> 0..1, how deep in a ditch (1 on its line)
//   V.flowerAt(x, y) -> 0..1, extra wildflower patch strength on a verge
//   V.frame(roadId, d) -> { x, y, tx, ty, rx, ry }: point, direction and right
//   V.at(frame, off, along) -> { x, y }
//
// Where (world x, y; d is metres along the road from its first point, off is
// metres right (+) of the centre line, looking along the road):
//   - patches and seals only on paved roads, never near water, bridges or a
//     road end (junction caps), never over the centre line;
//   - ditches past the shoulder and the mown strip, out of towns, yards,
//     fields, forests and water, and stopping short of junctions, signs,
//     mailboxes, landmarks and power poles;
//   - posts further out still (looks only, nothing to hit), in short runs
//     where no field fence stands, well clear of signs, mailboxes and
//     landmarks so they never hide one;
//   - nothing on any road or shoulder except the tar patches and seals.

import {
  makeRng, measurePolyline, pointAlong, SegIndex, distToSegment, pointInPolygon, distToPolygonEdge, bbox, circleHitsRect,
} from '../drive/geom.js';
import { makePads } from '../drive/layout.js';
import { makeNoise, smoothstep } from './noise.js';

export const VERGE = {
  shoulderPaved: 0.9, // m of gravel shoulder each side of the tar (ground.js SHOULDER_W)
  shoulderDirt: 0.8,
  // Tar patches
  patchStep: [18, 55], // m between patches along a road (min, max)
  patchLen: [1.2, 5.5],
  patchW: [0.9, 2.6],
  centreGap: 0.3, // m: a patch or seal keeps this far off the centre line
  edgeGap: 0.12, // m: and this far inside the tar edge
  sealStep: [10, 40],
  endGap: 10, // m from a road end: no patch or seal
  // Ditches
  ditchOut: 2.7, // m past the shoulder to the ditch's centre line
  ditchW: 3.4, // m across, bank to bank
  ditchMin: 30, // m: shorter runs are dropped
  culvertR: 0.4, // m, pipe radius
  culvertSink: -0.1, // m a mouth's centre sits below the ground (negative: above): its lower third is buried
  culvertGap: 0.5, // m past a crossing road's shoulder where a culvert mouth sits
  ditchStep: 2, // m between samples along the road
  ditchClear: 12, // m from signs, mailboxes and poles
  // Posts
  postOut: 5.6, // m past the shoulder
  postGap: [2.6, 3.6], // m between posts in a run
  postRun: [2, 6], // posts per run
  postEvery: [120, 320], // m between runs along a road
  postClear: 14, // m from signs and mailboxes
  // Flowers
  flowerIn: 1.6, // m past the shoulder: flowers start (the mown strip is closer)
  flowerOut: 6.5, // m past the shoulder: verge flowers fade out by here
};

// Dev: three.html?verge=off leaves the fill out (no tar patches, ditches,
// posts or verge flowers), for before and after shots and frame times.
let enabled = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('verge') !== 'off';
export function setVergeEnabled(on) {
  enabled = !!on;
}
const EMPTY = {
  patches: [], seals: [], ditches: [], culverts: [], posts: [], ditchAt: () => 0, flowerAt: () => 0, frame: () => null, at: () => null,
};

// The two visible mouths of a culvert, each { x, y, z, heading }: z is the
// mouth centre, a little below the ground (H(x, y) -> ground height), heading
// turns the mouth to face out of its bank (objMatrix: local +z points out).
export function culvertMouths(cv, H) {
  return [
    { x: cv.x, y: cv.y, z: H(cv.x, cv.y) - VERGE.culvertSink, heading: cv.angle + 180 },
    { x: cv.x2, y: cv.y2, z: H(cv.x2, cv.y2) - VERGE.culvertSink, heading: cv.angle },
  ];
}

const cache = new WeakMap();
export function vergeFor(world) {
  if (!enabled) return EMPTY;
  let v = cache.get(world);
  if (!v) cache.set(world, (v = makeVerge(world)));
  return v;
}

const r2 = (v) => Math.round(v * 100) / 100;
const shoulderOf = (r) => (r.type === 'paved' ? VERGE.shoulderPaved : VERGE.shoulderDirt);

export function makeVerge(world) {
  const seed = world.seed || 1;
  const rng = makeRng(((seed ^ 0x7e26e) >>> 0));
  const nDitch = makeNoise(seed + 6601);
  const nFlower = makeNoise(seed + 6602);
  const nFlower2 = makeNoise(seed + 6603);

  const roads = world.roads.map((r) => ({ r, cum: measurePolyline(r.points) }));
  const roadIdx = new SegIndex(48);
  for (const r of world.roads) roadIdx.addPolyline(r.points, r.width / 2 + shoulderOf(r) + 12, r);
  // Metres beyond the nearest road edge (shoulder not counted), and that road.
  const roadEdge = (x, y, skip = null) => {
    let best = Infinity;
    let road = null;
    for (const s of roadIdx.near(x, y)) {
      if (s.data === skip) continue;
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by) - s.data.width / 2;
      if (d < best) {
        best = d;
        road = s.data;
      }
    }
    return { d: best, road };
  };
  const water = new SegIndex(48);
  for (const c of world.creeks || []) water.addPolyline(c.points, c.width / 2 + 8, c);
  const nearWater = (x, y, pad) => water.minDist(x, y, (s) => s.data.width / 2 + pad) < 0;
  const lakes = (world.lakes || []).map((l) => ({ poly: l.polygon, bb: bbox(l.polygon) }));
  const areas = [...(world.fields || []), ...(world.forests || [])].map((f) => ({ poly: f.polygon, bb: bbox(f.polygon), field: !!f.kind }));
  const inPoly = (list, x, y, pad) => list.some((a) => x > a.bb.minX - pad && x < a.bb.maxX + pad && y > a.bb.minY - pad && y < a.bb.maxY + pad
    && (pointInPolygon(x, y, a.poly) || distToPolygonEdge(x, y, a.poly) < pad));
  const towns = (world.towns || []).map((t) => ({ x: t.x, y: t.y, r: (t.ambienceR || 150) * 0.8 }));
  const inTown = (x, y) => towns.some((t) => Math.hypot(t.x - x, t.y - y) < t.r);
  const pads = makePads(world).filter((p) => p.kind !== 'field');
  const onPad = (x, y, r) => pads.some((p) => Math.abs(p.x - x) < p.w + p.h + r && Math.abs(p.y - y) < p.w + p.h + r && circleHitsRect(x, y, r, p));
  const buildings = (world.buildings || []).map((b) => ({ x: b.x, y: b.y, r: Math.hypot(b.w || 10, b.h || 10) / 2 + 6 }));
  const clear = new SegIndex(48);
  const addClear = (x, y, r, kind) => clear.add(x, y, x, y, r, { r, kind });
  for (const s of world.signs || []) addClear(s.x, s.y, VERGE.postClear, 'sign');
  for (const m of world.mailboxes || []) addClear(m.x, m.y, VERGE.postClear, 'mailbox');
  for (const l of world.landmarks || []) addClear(l.x, l.y, (l.clearR || 25) + 6, 'landmark');
  for (const l of world.locals || []) addClear(l.x, l.y, 10, 'local');
  for (const p of world.props || []) addClear(p.x, p.y, (p.r || 1) + 4, 'prop');
  for (const p of world.dressing || []) addClear(p.x, p.y, (p.r || 2) + 5, 'dressing');
  for (const b of buildings) addClear(b.x, b.y, b.r, 'building');
  for (const l of world.powerLines || []) for (const p of l.poles) addClear(p.x, p.y, 3, 'pole');
  for (const b of world.bridges || []) addClear(b.x, b.y, (b.length || 20) / 2 + 12, 'bridge');
  if (world.start) addClear(world.start.x, world.start.y, 15, 'start');
  // Clear of everything listed (each with its own radius, times k).
  const isClear = (x, y, k = 1) => clear.near(x, y).every((s) => Math.hypot(x - s.ax, y - s.ay) >= s.data.r * k);
  // Road ends: junctions and dead ends.
  const ends = [];
  for (const r of world.roads) ends.push(r.points[0], r.points[r.points.length - 1]);
  const nearEnd = (x, y, d) => ends.some(([ex, ey]) => Math.abs(ex - x) < d && Math.abs(ey - y) < d && Math.hypot(ex - x, ey - y) < d);
  const inLake = (x, y, pad) => inPoly(lakes, x, y, pad);
  const W = world.size.w;
  const H = world.size.h;
  const inMap = (x, y, m) => x > m && y > m && x < W - m && y < H - m;
  const frame = (rd, d) => {
    const { r, cum } = rd;
    const total = cum[cum.length - 1];
    const p = pointAlong(r.points, cum, d);
    const a = pointAlong(r.points, cum, Math.max(0, d - 1.5));
    const b = pointAlong(r.points, cum, Math.min(total, d + 1.5));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    // Right of the direction of travel, in world x, y (y down the map).
    return { x: p.x, y: p.y, tx, ty, rx: -ty, ry: tx };
  };
  const at = (f, off, along = 0) => ({ x: f.x + f.rx * off + f.tx * along, y: f.y + f.ry * off + f.ty * along });
  const range = ([a, b]) => a + rng() * (b - a);

  // ---------- tar patches and crack seal ----------
  const patches = [];
  const seals = [];
  for (const rd of roads) {
    const { r, cum } = rd;
    if (r.type !== 'paved') continue;
    const total = cum[cum.length - 1];
    const half = r.width / 2;
    // Can the tar at d, from off0 to off1 across, carry fill?
    const tarOk = (d, len, off0, off1) => {
      for (const t of [0, 0.5, 1]) {
        const f = frame(rd, d + len * t);
        for (const o of [off0, off1]) {
          const p = at(f, o);
          if (nearWater(p.x, p.y, 4) || inLake(p.x, p.y, 4) || nearEnd(p.x, p.y, VERGE.endGap)) return false;
          // On another road's tar too (a junction mouth): leave it.
          const other = roadEdge(p.x, p.y, r);
          if (other.d < 1.5) return false;
        }
        if (!isClear(f.x, f.y, 0) || clear.near(f.x, f.y).some((s) => s.data.kind === 'bridge' && Math.hypot(f.x - s.ax, f.y - s.ay) < s.data.r)) return false;
      }
      return true;
    };
    for (let d = VERGE.endGap + rng() * 20; d < total - VERGE.endGap; d += range(VERGE.patchStep)) {
      const len = range(VERGE.patchLen);
      const w = Math.min(range(VERGE.patchW), half - VERGE.centreGap - VERGE.edgeGap);
      const side = rng() < 0.5 ? -1 : 1;
      // Mostly in the wheel tracks: lean toward the middle of the lane.
      const room = half - VERGE.centreGap - VERGE.edgeGap - w;
      const mid = VERGE.centreGap + w / 2 + room * (0.25 + 0.5 * rng());
      const off = side * mid;
      if (d + len > total - VERGE.endGap) break;
      if (!tarOk(d, len, off - w / 2, off + w / 2)) continue;
      patches.push({ road: r.id, d: r2(d), len: r2(len), off: r2(off), w: r2(w), blob: rng() < 0.4, tone: r2(rng()) });
      // Sometimes a second, older patch overlapping the first.
      if (rng() < 0.2) {
        const len2 = len * (0.5 + 0.4 * rng());
        const w2 = Math.min(w * (0.6 + 0.3 * rng()), half - VERGE.centreGap - VERGE.edgeGap);
        const off2 = side * Math.min(half - VERGE.edgeGap - w2 / 2, Math.max(VERGE.centreGap + w2 / 2, mid + (rng() - 0.5) * w * 0.6));
        const d2 = d + len * (0.5 + 0.4 * rng());
        if (d2 + len2 < total - VERGE.endGap && tarOk(d2, len2, off2 - w2 / 2, off2 + w2 / 2)) {
          patches.push({ road: r.id, d: r2(d2), len: r2(len2), off: r2(off2), w: r2(w2), blob: rng() < 0.5, tone: r2(rng()) });
        }
      }
    }
    for (let d = VERGE.endGap + rng() * 15; d < total - VERGE.endGap; d += range(VERGE.sealStep)) {
      const side = rng() < 0.5 ? -1 : 1;
      if (rng() < 0.45) {
        // Across one lane, from near the centre line to near the edge.
        const off = side * (VERGE.centreGap + (half - VERGE.centreGap - VERGE.edgeGap) / 2);
        const len = half - VERGE.centreGap - VERGE.edgeGap;
        if (!tarOk(d, 0.2, off - len / 2, off + len / 2)) continue;
        seals.push({ road: r.id, d: r2(d), len: r2(len), off: r2(off), cross: true });
      } else {
        // Along a wheel track, wandering a little.
        const len = 4 + rng() * 14;
        const off = side * (VERGE.centreGap + 0.4 + rng() * (half - VERGE.centreGap - VERGE.edgeGap - 0.8));
        if (d + len > total - VERGE.endGap) break;
        if (!tarOk(d, len, off - 0.3, off + 0.3)) continue;
        seals.push({ road: r.id, d: r2(d), len: r2(len), off: r2(off), cross: false });
      }
    }
  }

  // ---------- ditches ----------
  // A culvert carries a ditch under the road that stops it. From the ditch's
  // end p0, walk on along (ux, uy) (the ditch's line) to the crossing road's
  // two shoulders: the pipe is buried between them and only its two mouths
  // show, one each side. Returns { x, y, x2, y2 } (the mouths), the road it
  // crosses, and angle, the heading of the pipe from the first mouth to the
  // second (local +z points that way, same convention as objMatrix). null
  // when the line never gets across a road within 30 m.
  const culvertAt = (p0, ux, uy, main) => {
    let near = -1;
    let far = -1;
    let road = null;
    for (let s = 0; s <= 30; s += 0.25) {
      const e = roadEdge(p0.x + ux * s, p0.y + uy * s, main);
      const thr = shoulderOf(e.road || main) + VERGE.culvertGap;
      if (e.d <= thr) {
        if (near < 0) near = s;
        far = s;
        road = e.road;
      } else if (near >= 0 && e.d > thr + 0.25) break;
    }
    if (near < 0 || !road || far - near < road.width * 0.6 || near > 6) return null;
    // Still on a road at the far end of the walk: not across it.
    if (roadEdge(p0.x + ux * far, p0.y + uy * far, main).d > shoulderOf(road) + VERGE.culvertGap + 0.01) return null;
    return {
      x: r2(p0.x + ux * near), y: r2(p0.y + uy * near),
      x2: r2(p0.x + ux * far), y2: r2(p0.y + uy * far),
      angle: r2((Math.atan2(-ux, uy) * 180) / Math.PI),
      road: road.id,
    };
  };
  const ditches = [];
  const culverts = [];
  for (const rd of roads) {
    const { r, cum } = rd;
    const total = cum[cum.length - 1];
    const off = r.width / 2 + shoulderOf(r) + VERGE.ditchOut;
    const hw = VERGE.ditchW / 2;
    for (const side of [-1, 1]) {
      let run = null;
      // Why a spot can't hold a ditch: 'road' (another road crosses or comes
      // close: a culvert carries the ditch under it) or anything else.
      const why = (d) => {
        const f = frame(rd, d);
        const p = at(f, side * off);
        if (!inMap(p.x, p.y, 20)) return 'edge';
        if (inTown(p.x, p.y)) return 'town';
        const e = roadEdge(p.x, p.y, null);
        if (e.d < off - r.width / 2 - 0.5) return 'road';
        const other = roadEdge(p.x, p.y, r);
        if (other.d < hw + shoulderOf(other.road || r) + 1.5) return 'road';
        if (nearWater(p.x, p.y, 6) || inLake(p.x, p.y, 6)) return 'water';
        if (onPad(p.x, p.y, hw + 1)) return 'pad';
        if (inPoly(areas, p.x, p.y, hw + 0.8)) return 'field';
        if (!isClear(p.x, p.y, VERGE.ditchClear / VERGE.postClear)) return 'clear';
        // Ditches come and go along a road.
        if (nDitch(p.x / 90, p.y / 90) * 0.75 + nDitch(p.x / 30 + 7, p.y / 30) * 0.25 < -0.02) return 'noise';
        return null;
      };
      const close = (d, reason) => {
        if (run && d - run.d0 >= VERGE.ditchMin) {
          const pts = [];
          for (let q = run.d0; q <= d + 0.01; q += VERGE.ditchStep) {
            const p = at(frame(rd, q), side * off);
            pts.push([r2(p.x), r2(p.y)]);
          }
          const di = ditches.length;
          ditches.push({ road: r.id, side, d0: r2(run.d0), d1: r2(d), off: r2(side * off), w: VERGE.ditchW, pts });
          // A culvert at each end that stops at a crossing road.
          for (const [q, rs, dir] of [[run.d0, run.why, -1], [d, reason, 1]]) {
            if (rs !== 'road') continue;
            const f = frame(rd, q);
            const cv = culvertAt(at(f, side * off), dir * f.tx, dir * f.ty, rd.r);
            if (cv) culverts.push({ ...cv, dir, ditch: di });
          }
        }
        run = null;
      };
      let lastWhy = 'start';
      for (let d = 8; d < total - 8; d += VERGE.ditchStep) {
        const w = why(d);
        if (w) {
          close(d - VERGE.ditchStep, w);
          lastWhy = w;
        } else if (!run) run = { d0: d, why: lastWhy };
      }
      close(total - 8 - VERGE.ditchStep, 'end');
    }
  }
  const ditchIdx = new SegIndex(32);
  for (const dt of ditches) {
    for (let i = 0; i < dt.pts.length - 1; i++) {
      const [ax, ay] = dt.pts[i];
      const [bx, by] = dt.pts[i + 1];
      ditchIdx.add(ax, ay, bx, by, dt.w, { dt, i, n: dt.pts.length });
    }
  }
  // 0..1: 1 on a ditch's line, 0 at its banks; tapers in over its first and last 6 m.
  function ditchAt(x, y) {
    let best = 0;
    for (const s of ditchIdx.near(x, y)) {
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      const hw2 = s.data.dt.w / 2;
      if (d >= hw2) continue;
      const fromEnd = Math.min(s.data.i, s.data.n - 2 - s.data.i) * VERGE.ditchStep;
      const k = (1 - smoothstep(0, hw2, d)) * smoothstep(-1, 6, fromEnd);
      if (k > best) best = k;
    }
    return best;
  }

  // ---------- leaning posts ----------
  const posts = [];
  const fenceNear = (x, y) => inPoly(areas.filter((a) => a.field), x, y, 6);
  for (const rd of roads) {
    const { r, cum } = rd;
    const total = cum[cum.length - 1];
    const off = r.width / 2 + shoulderOf(r) + VERGE.postOut;
    for (let d = 20 + rng() * 100; d < total - 20; d += range(VERGE.postEvery)) {
      const side = rng() < 0.5 ? -1 : 1;
      const n = Math.floor(range(VERGE.postRun) + 0.5);
      const run = [];
      let q = d;
      const wire = rng() < 0.55;
      // The old fence leans all one way, give or take.
      const leanTo = rng() < 0.5 ? 0 : 1; // 0: toward the road, 1: away
      for (let k = 0; k < n && q < total - 20; k++) {
        const f = frame(rd, q);
        const o = side * (off + (rng() - 0.5) * 0.5);
        const p = at(f, o);
        const e = roadEdge(p.x, p.y, null);
        if (!inMap(p.x, p.y, 25) || inTown(p.x, p.y) || e.d < off - r.width / 2 - 0.6 || nearWater(p.x, p.y, 6) || inLake(p.x, p.y, 6)
          || onPad(p.x, p.y, 2) || inPoly(areas, p.x, p.y, 2) || fenceNear(p.x, p.y) || !isClear(p.x, p.y) || ditchAt(p.x, p.y) > 0
          || nearEnd(p.x, p.y, 25)) {
          break;
        }
        // Lean across the old fence line, a few lean along it.
        const base = (Math.atan2(f.rx * side, -f.ry * side) * 180) / Math.PI; // heading away from the road
        const along = rng() < 0.25;
        const dir = along ? base + 90 * (rng() < 0.5 ? -1 : 1) : base + (leanTo ? 0 : 180);
        run.push({
          x: r2(p.x), y: r2(p.y), rot: r2(rng() * 360), lean: r2(4 + rng() * (k === n - 1 ? 30 : 18)), leanTo: r2(dir + (rng() - 0.5) * 20),
          h: r2(1.0 + rng() * 0.35), wire: wire && k < n - 1 && rng() < 0.8,
        });
        q += range(VERGE.postGap);
      }
      // A run cut short by something in the way keeps the posts before it.
      if (run.length >= 2) {
        run[run.length - 1].wire = false;
        posts.push(...run);
      }
    }
  }

  // ---------- wildflower verges ----------
  // Drifts of flowers along the verges: strongest a couple of metres past
  // the mown strip, fading out into the open grass.
  function flowerAt(x, y) {
    const e = roadEdge(x, y, null);
    if (!e.road || !(e.d < shoulderOf(e.road) + VERGE.flowerOut)) return 0;
    const out = e.d - shoulderOf(e.road);
    if (out < VERGE.flowerIn - 0.4) return 0;
    if (inTown(x, y)) return 0;
    const band = smoothstep(VERGE.flowerIn - 0.4, VERGE.flowerIn + 0.6, out) * (1 - smoothstep(VERGE.flowerOut - 2.5, VERGE.flowerOut, out));
    const drift = smoothstep(-0.1, 0.35, 0.75 * nFlower(x / 45, y / 45) + 0.25 * nFlower2(x / 9, y / 9));
    return band * drift;
  }

  const byId = new Map(roads.map((rd) => [rd.r.id, rd]));
  // The road's frame d metres along it (for drawing patches and seals), and
  // a point off metres right of it and along metres further on.
  const frameOf = (roadId, d) => frame(byId.get(roadId), d);
  return { patches, seals, ditches, culverts, posts, ditchAt, flowerAt, frame: frameOf, at };
}
