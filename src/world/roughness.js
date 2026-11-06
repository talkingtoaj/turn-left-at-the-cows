// Rough ground by patch. Plain data and math, no engine code: the 3D terrain
// uses it for its big bumps, the car for its ride and the damage rules for
// the safe speed off-road. Nothing is stored per point: every bump comes from
// seeded noise, so the same seed always gives the same ground.
//
// Each kind of ground has a roughness (0 smooth .. 1 very rough) and a size
// of big bump (metres, top of a lump to the bottom of a dip at multiplier 1).
// Every field gets its own multiplier from the seed, so some pastures are far
// bumpier than others.
//
// Two scales:
//   big:   lumps 8 to 40 m across, in the terrain mesh and heightAt (seen).
//   small: under the 4 m mesh spacing: only surface detail in the shader,
//          a little ride bounce and camera rumble in the car, and the
//          damage safe speed. Never a height, so nothing ever floats.
//
// Patch edges blend over a few metres, and the big bumps fade to nothing near
// roads, bridges, water, buildings, yards, landmarks and town centres, so
// nothing gets a step or a lip.
//
//   const R = roughnessFor(world)
//   R.at(x, y)         -> { type, rough, big, plow, plowAngle } (per frame use)
//   R.height(x, y)     -> big bump height (m), terrain build only
//   R.boulders         -> half-buried stones in the roughest scrub (surface events)
//
// The safe speed for each roughness is gameplay tuning: src/game/damage.js
// (TUNING.rough.groundSafe).

import {
  SegIndex, pointInPolygon, distToPolygonEdge, bbox, hashString, makeRng,
} from '../drive/geom.js';
import { buildingSolids, makePads } from '../drive/layout.js';
import { makeNoise, smoothstep } from './noise.js';

// rough: small-scale roughness (0..1). big: big bump size in metres.
export const GROUND = {
  paved: { rough: 0, big: 0 },
  dirt: { rough: 0, big: 0 }, // dirt roads keep their own bumps (roadbumps.js)
  lawn: { rough: 0.12, big: 0.12 }, // town lawns and greens, mown
  hay: { rough: 0.15, big: 0.2 }, // mown hay meadow
  crop: { rough: 0.3, big: 0.3 }, // wheat, corn
  plowed: { rough: 0.5, big: 0.35 }, // long swells, furrows across the rows
  pasture: { rough: 0.55, big: 0.75 }, // hummocks, old cattle paths
  forest: { rough: 0.6, big: 0.7 }, // roots and mounds
  meadow: { rough: 0.7, big: 0.95 }, // rough, unclaimed grass
  scrub: { rough: 1.0, big: 1.3 }, // lumps, dips, the odd boulder
};

const VERGE = 0.38; // roughness right at a road, yard or building edge
const EDGE_OUT = 3; // field patches blend from this far outside their fence...
const EDGE_IN = 10; // ...to fully themselves this far inside
const FADE_IN = 4; // big bumps start this far from a flat feature
const FADE_FULL = 36; // and are full size this far away
const SMALL_FULL = 22; // small roughness reaches the patch value this far from a road edge
export const FURROW_GAP = 1.1; // metres between plow furrows (fields3d.js CROPS.plowed)

const cache = new WeakMap();
let enabled = true;

// Dev: three.html?rough=off builds the world without rough ground (flat
// patches, no stones or cattle paths, the old grass safe speed) to compare.
export function setRoughnessEnabled(on) {
  enabled = !!on;
}

export function roughnessFor(world) {
  let r = cache.get(world);
  if (!r) cache.set(world, (r = new Roughness(world, enabled)));
  return r;
}

// 0..1 from a string and the seed.
function hash01(seed, s) {
  const rng = makeRng((hashString(s) ^ (seed * 2654435761)) >>> 0);
  rng();
  return rng();
}

class Roughness {
  constructor(world, on = true) {
    this.world = world;
    this.off = !on;
    const seed = world.seed || 1;
    this.nA = makeNoise(seed + 701);
    this.nB = makeNoise(seed + 702);
    this.nC = makeNoise(seed + 703);
    this.nD = makeNoise(seed + 704);
    this.nS = makeNoise(seed + 705);

    // Patches: fields (and the farm crop pad), forests, in a 64 m bucket grid.
    this.patches = new SegIndex(64);
    const addPatch = (poly, type, mul, angle, out, inn) => {
      const bb = bbox(poly);
      const p = { poly, type, mul, bb, out, inn, ca: Math.cos(angle), sa: Math.sin(angle) };
      // One item covering the box (a segment corner to corner, padded).
      const cx = (bb.minX + bb.maxX) / 2;
      const cy = (bb.minY + bb.maxY) / 2;
      this.patches.add(cx, cy, cx, cy, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2 + out + 2, p);
    };
    this.fieldMul = new Map();
    for (const f of world.fields || []) {
      const type = f.kind === 'pasture' ? 'pasture' : f.crop === 'hay' ? 'hay' : f.crop === 'plowed' ? 'plowed' : 'crop';
      // Some fields are much bumpier than others: 0.55 .. 1.55, most below 1.
      const mul = 0.55 + 1.0 * hash01(seed, f.id) ** 1.5;
      this.fieldMul.set(f.id, mul);
      // rowAngle is a heading (0 north, 90 east); rows run along it.
      const ang = ((f.rowAngle || 0) * Math.PI) / 180;
      addPatch(f.polygon, type, mul, ang, EDGE_OUT, EDGE_IN);
    }
    const pads = makePads(world);
    for (const p of pads) {
      if (p.kind !== 'field') continue;
      const c = Math.cos(((p.angle || 0) * Math.PI) / 180);
      const s = Math.sin(((p.angle || 0) * Math.PI) / 180);
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p.x + (u * p.w) / 2 * c - (v * p.h) / 2 * s, p.y + (u * p.w) / 2 * s + (v * p.h) / 2 * c]);
      addPatch(poly, 'crop', 0.6, 0, EDGE_OUT, EDGE_IN);
    }
    for (const f of world.forests || []) addPatch(f.polygon, 'forest', 0.8 + 0.5 * hash01(seed, f.id), 0, 8, 12);
    this.towns = (world.towns || []).map((t) => ({ x: t.x, y: t.y, r: t.ambienceR || 150 }));

    // Flat features: roads (separately, they set the type), and everything
    // the big bumps keep away from. data = radius beyond the line.
    const REACH = FADE_FULL + 4;
    this.roads = new SegIndex(48);
    for (const r of world.roads) this.roads.addPolyline(r.points, r.width / 2 + REACH, { half: r.width / 2, type: r.type === 'paved' ? 'paved' : 'dirt' });
    this.flat = new SegIndex(48);
    for (const c of world.creeks) this.flat.addPolyline(c.points, c.width / 2 + 6 + REACH, c.width / 2 + 6);
    const disc = (x, y, r) => this.flat.add(x, y, x, y, r + REACH, r);
    for (const b of world.buildings) {
      const s = buildingSolids(b);
      for (const q of s.rects) disc(q.x, q.y, Math.hypot(q.w, q.h) / 2 + 6);
      for (const q of s.circles) disc(q.x, q.y, q.r + 6);
    }
    for (const l of world.landmarks) disc(l.x, l.y, l.r ? l.r + 10 : l.kind === 'radio_mast' ? 40 : (l.clearR || 20) + 4);
    for (const b of world.bridges) disc(b.x, b.y, b.length / 2 + 6);
    for (const l of world.landmarks) if (l.points) this.flat.addPolyline(l.points, 8 + REACH, 8); // the old railway
    for (const p of world.places || []) disc(p.x, p.y, (p.r || 25) + 20);
    if (world.start) disc(world.start.x, world.start.y, 20);
    for (const p of pads) {
      if (p.kind === 'field') continue;
      // A rect as a segment along its long side, padded by half the short side.
      const c = Math.cos(((p.angle || 0) * Math.PI) / 180);
      const s = Math.sin(((p.angle || 0) * Math.PI) / 180);
      const long = p.h >= p.w;
      const half = (long ? p.h - p.w : p.w - p.h) / 2;
      const ux = long ? -s : c;
      const uy = long ? c : s;
      const pad = (long ? p.w : p.h) / 2 + 4;
      this.flat.add(p.x - ux * half, p.y - uy * half, p.x + ux * half, p.y + uy * half, pad + REACH, pad);
    }
    for (const m of world.mailboxes || []) if (Number.isFinite(m.x)) disc(m.x, m.y, 3);
    for (const s of world.signs || []) if (Number.isFinite(s.x)) disc(s.x, s.y, 3);
    this.lakes = (world.lakes || []).map((l) => ({ poly: l.polygon, bb: bbox(l.polygon) }));
    this.out = { type: 'meadow', rough: 0, big: 0, plow: 0, plowAngle: 0, h: 0 };
    this.boulders = this.off ? [] : this.makeBoulders();
  }

  // Distance beyond the nearest flat feature (negative inside one), capped.
  flatDist(x, y) {
    let d = this.flat.minDist(x, y, (s) => s.data);
    for (const l of this.lakes) {
      if (x < l.bb.minX - 50 || x > l.bb.maxX + 50 || y < l.bb.minY - 50 || y > l.bb.maxY + 50) continue;
      const e = pointInPolygon(x, y, l.poly) ? -1 : distToPolygonEdge(x, y, l.poly) - 6;
      if (e < d) d = e;
    }
    return d;
  }

  // Distance beyond the nearest road edge (negative on it); this._road is that road.
  roadDist(x, y) {
    let roadD = Infinity;
    this._road = null;
    for (const s of this.roads.near(x, y)) {
      const ex = s.bx - s.ax;
      const ey = s.by - s.ay;
      const l2 = ex * ex + ey * ey || 1;
      const u = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / l2));
      const d = Math.hypot(x - s.ax - ex * u, y - s.ay - ey * u) - s.data.half;
      if (d < roadD) {
        roadD = d;
        this._road = s.data;
      }
    }
    return roadD;
  }

  // Ground at (x, y). Fills and returns a shared object (copy what you keep).
  // withHeight: also the big bump height in out.h.
  at(x, y, withHeight = false) {
    const o = this.out;
    o.h = 0;
    o.plow = 0;
    o.plowAngle = 0;
    // On a road?
    const roadD = this.roadDist(x, y);
    const road = this._road;
    if (road && roadD < 0) {
      o.type = road.type;
      o.rough = 0;
      o.big = 0;
      return o;
    }
    // Near roads, yards and buildings: a trodden, mown verge, no big bumps.
    const fd = Math.min(this.flatDist(x, y), roadD);
    if (withHeight === 'only' && fd <= FADE_IN) return o;

    if (this.off) {
      // Rough ground switched off: one roughness everywhere off-road, giving
      // the old grass safe speed (32 km/h), no bumps.
      o.type = 'grass';
      o.rough = 0.5;
      o.big = 0;
      return o;
    }
    // Patch weights.
    let wSum = 0;
    let rough = 0;
    let big = 0;
    let best = null;
    let bestW = 0;
    let hum = 0; // pasture hummocks
    let forest = 0; // roots and mounds
    let lump = 0; // crop, hay, lawn lumps
    let plowSwell = 0;
    let swellAt = null;
    for (const it of this.patches.near(x, y)) {
      const p = it.data;
      if (x < p.bb.minX - p.out || x > p.bb.maxX + p.out || y < p.bb.minY - p.out || y > p.bb.maxY + p.out) continue;
      const inside = pointInPolygon(x, y, p.poly);
      const e = distToPolygonEdge(x, y, p.poly);
      const w = smoothstep(-p.out, p.inn, inside ? e : -e);
      if (w <= 0) continue;
      const g = GROUND[p.type];
      wSum += w;
      rough += w * Math.min(1, g.rough * p.mul);
      const a = w * g.big * p.mul;
      big += a;
      if (p.type === 'pasture') hum += a;
      else if (p.type === 'forest') forest += a;
      else if (p.type === 'plowed') {
        plowSwell += a;
        if (!swellAt || w > swellAt.w) swellAt = { w, p };
        o.plow = Math.max(o.plow, w);
      } else lump += a;
      if (w > bestW) {
        bestW = w;
        best = p;
      }
    }
    if (swellAt) o.plowAngle = Math.atan2(swellAt.p.sa, swellAt.p.ca);
    // Town lawns.
    for (const t of this.towns) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d > t.r + 40) continue;
      const w = (1 - smoothstep(t.r * 0.7, t.r + 40, d)) * Math.max(0, 1 - wSum);
      if (w <= 0) continue;
      wSum += w;
      rough += w * GROUND.lawn.rough;
      lump += w * GROUND.lawn.big;
      big += w * GROUND.lawn.big;
      if (w > bestW) {
        bestW = w;
        best = { type: 'lawn' };
      }
    }
    if (wSum > 1) {
      rough /= wSum;
      big /= wSum;
      hum /= wSum;
      forest /= wSum;
      lump /= wSum;
      plowSwell /= wSum;
      wSum = 1;
    }
    // The rest is open countryside: rough meadow, with patches of scrub.
    const wBg = 1 - wSum;
    let scrubA = 0;
    let meadowA = 0;
    if (wBg > 0) {
      const sk = smoothstep(0.12, 0.42, this.nS(x / 260 + 3.1, y / 260 - 1.7) * 0.7 + this.nS(x / 90, y / 90 + 11) * 0.3);
      const gr = GROUND.meadow.rough + (GROUND.scrub.rough - GROUND.meadow.rough) * sk;
      // Countryside varies too, slowly.
      const vary = 0.8 + 0.4 * (0.5 + 0.5 * this.nD(x / 400 + 20, y / 400));
      rough += wBg * Math.min(1, gr * vary);
      meadowA = wBg * GROUND.meadow.big * (1 - sk) * vary;
      scrubA = wBg * GROUND.scrub.big * sk * vary;
      big += meadowA + scrubA;
      if (wBg > bestW) best = { type: sk > 0.5 ? 'scrub' : 'meadow' };
    }
    o.type = best ? best.type : 'meadow';

    const fadeBig = smoothstep(FADE_IN, FADE_FULL, fd);
    const fadeSmall = smoothstep(0, SMALL_FULL, fd);
    o.rough = VERGE + (rough - VERGE) * fadeSmall;
    o.big = big * fadeBig;
    if (!withHeight || fadeBig <= 0 || big <= 0) return o;

    // Big bump shapes (each about -0.5..0.5 times its size).
    const { nA, nB, nC, nD } = this;
    let h = 0;
    if (lump + meadowA + scrubA > 0) {
      const l = (0.5 * nA(x / 30, y / 30) + 0.32 * nB(x / 15 + 3, y / 15) + 0.18 * nC(x / 9, y / 9 + 7)) * 0.9;
      h += (lump + meadowA + scrubA) * l;
      // Scrub: sharper hollows and knolls.
      if (scrubA > 0) h += scrubA * (0.5 * smoothstep(0.1, 0.55, nD(x / 19, y / 19)) - 0.5 * smoothstep(0.15, 0.55, nC(x / 15 + 40, y / 15)));
    }
    if (hum > 0) {
      // Hummocks: rounded tussock mounds about 10 m apart on a gentle roll.
      const m = Math.max(0, nB(x / 10 + 50, y / 10)) * 1.4 - 0.25;
      h += hum * (0.6 * m + 0.4 * nA(x / 24 + 5, y / 24) * 0.9);
    }
    if (forest > 0) h += forest * (0.5 * nC(x / 9 + 13, y / 9) + 0.5 * nA(x / 26, y / 26 + 9)) * 0.9;
    if (plowSwell > 0 && swellAt) {
      // Long low swells (old lands) running with the rows.
      const { ca, sa } = swellAt.p;
      const along = x * sa - y * ca; // heading (sin, -cos) in world x, y
      const across = x * ca + y * sa;
      h += plowSwell * (0.7 * nB(along / 45, across / 15 + 7) + 0.3 * nA(x / 30, y / 30)) * 0.9;
    }
    o.h = h * fadeBig;
    return o;
  }

  height(x, y) {
    return this.at(x, y, 'only').h;
  }

  // Half-buried stones in the roughest scrub, away from everything. Not solid:
  // low enough to roll over, with a knock (surface events, kind 'stone').
  makeBoulders() {
    const rng = makeRng(((this.world.seed || 1) ^ 0x5ab1e) >>> 0);
    const out = [];
    const W = this.world.size.w;
    const H = this.world.size.h;
    const STEP = 60;
    const props = this.world.props || [];
    for (let y = STEP / 2; y < H; y += STEP) {
      for (let x = STEP / 2; x < W; x += STEP) {
        const px = x + (rng() - 0.5) * STEP * 0.8;
        const py = y + (rng() - 0.5) * STEP * 0.8;
        const roll = rng();
        const g = this.at(px, py);
        if (g.type !== 'scrub' || g.rough < 0.85 || g.big < 0.9 || roll > 0.35) continue;
        if (this.flatDist(px, py) < 40) continue;
        let clash = false;
        for (const p of props) if (Math.abs(p.x - px) < 12 && Math.abs(p.y - py) < 12) clash = true;
        if (clash) continue;
        const r = 0.45 + rng() * 0.5;
        out.push({ id: `bo_${out.length}`, kind: 'stone', x: Math.round(px * 100) / 100, y: Math.round(py * 100) / 100, r, angle: rng() * 360 });
      }
    }
    return out;
  }
}

