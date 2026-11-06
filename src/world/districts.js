// Districts of the open land. Plain data and math, no engine code, like
// ./roughness.js: seeded, nothing stored per point except a coarse lookup
// grid, the same seed always gives the same map.
//
// The open country (not roads, fields, forests, yards, towns or water) is cut
// into districts a few hundred metres across. Each has a KIND (a recipe: what
// grows and lies there, src/world/scatter.js) and a NAME locals can use
// ("out past Whin Flats"). Borders wander (domain warp) and blend over about
// 40 m, so a stony rise fades into gorse rather than stopping at a line.
//
// How the map is made: seeded centres on a jittered 420 m grid. Each centre
// picks its kind from what is there: low ground by a creek or lake is Willow
// Bottoms, the authored hills and the named outcrops (world.outcrops) are
// Stony Rise, the rest is a seeded mix. Neighbouring centres of the same kind
// join into one district with one name.
//
//   const D = districtsFor(world)
//   D.at(x, y)        -> { kind, name, id, w: { stony, gorse, willow, bare, mixed } }
//                        (shared object, blended weights sum to 1)
//   D.weights(x, y)   -> Float32Array(5) blended weights in KIND_LIST order (shared)
//   D.list            -> [{ id, name, kind, cells: n, x, y }] (centre of mass)
//   RECIPES[kind]     -> what the scatter puts there
//
// ?districts=show tints the ground by district (src3/world3d/world3d.js).

import {
  makeRng, hashString, distToPolyline, pointInPolygon, distToPolygonEdge, bbox,
} from '../drive/geom.js';
import { makeNoise, smoothstep } from './noise.js';

export const SPACING = 420; // metres between district centres
const BLEND = 40; // border blend width (m)
const WARP = 70; // how far borders wander (m)
const GRID = 8; // lookup grid (m)

export const KIND_LIST = ['stony', 'gorse', 'willow', 'bare', 'mixed'];

// Per kind, per 100 m2 (an are) of fully open ground, before the local
// boosts in scatter.js:
//   rocks:  count, and the size range (radius m, skewed small; `big` is the
//           share drawn from the upper half), `rise` how much they prefer
//           rises and hill tops (0 none, 1 strong).
//   shrubs: count, `drift` how tightly they gather in drifts (0 even, 1
//           only in drifts), the model (`shrub`), size range, colour.
//   grass:  tussock clumps per are, size.
//   tint:   ground colour (sRGB hex) and how far the grass leans to it.
export const RECIPES = {
  stony: {
    label: 'Stony Rise',
    rocks: { n: 0.2, r: [0.22, 1.25], big: 0.3, rise: 1 },
    shrubs: { n: 0.03, drift: 0.5, shrub: 'gorse', r: [0.5, 0.9] },
    grass: { n: 0.2, r: [0.25, 0.45] },
    tint: { color: 0x8c8f68, k: 0.38 },
    show: 0xd04a3a, // ?districts=show
  },
  gorse: {
    label: 'Gorse Flats',
    rocks: { n: 0.02, r: [0.2, 0.55], big: 0.1, rise: 0.3 },
    shrubs: { n: 0.42, drift: 0.92, shrub: 'gorse', r: [0.55, 1.15] },
    grass: { n: 0.12, r: [0.25, 0.45] },
    tint: { color: 0x7b8743, k: 0.32 },
    show: 0xe8c430,
  },
  willow: {
    label: 'Willow Bottoms',
    rocks: { n: 0.012, r: [0.2, 0.45], big: 0, rise: 0 },
    shrubs: { n: 0.28, drift: 0.8, shrub: 'round', r: [0.6, 1.3] },
    grass: { n: 0.6, r: [0.3, 0.6] },
    tint: { color: 0x4d8a3a, k: 0.36 },
    show: 0x3a7ad0,
  },
  bare: {
    label: 'Bare Downs',
    rocks: { n: 0.005, r: [0.25, 0.7], big: 0.2, rise: 0.6 },
    shrubs: { n: 0.005, drift: 0.2, shrub: 'gorse', r: [0.5, 0.8] },
    grass: { n: 0.025, r: [0.2, 0.35] },
    tint: { color: 0xa0a66c, k: 0.34 },
    show: 0xf0f0f0,
  },
  mixed: {
    label: 'Bramble Common',
    rocks: { n: 0.055, r: [0.22, 0.9], big: 0.2, rise: 0.6 },
    shrubs: { n: 0.2, drift: 0.85, shrub: 'bramble', r: [0.6, 1.2] },
    grass: { n: 0.25, r: [0.25, 0.5] },
    tint: { color: 0x6a8642, k: 0.22 },
    show: 0xa04ad0,
  },
};

// District names by kind. Joined districts take the next unused name.
const NAMES = {
  stony: ['Carn Rise', 'Flint Rise', 'Cragside', 'Greystone Rise', 'Ravenstone Rise', 'Hob Rise', 'Scarth Rise', 'Knapp Rise', 'Kettle Rise', 'Brack Rise', 'Rowton Rise', 'Scree Rise'],
  gorse: ['Whin Flats', 'Furze Flats', 'Broom Flats', 'Linnet Flats', 'Gold Flats', 'Stonechat Flats', 'Prickle Flats', 'Yellow Flats', 'Heath Flats', 'Bunting Flats', 'Spiny Flats', 'Gorse Flats'],
  willow: ['Osier Bottoms', 'Sallow Bottoms', 'Withy Bottoms', 'Reed Bottoms', 'Heron Bottoms', 'Alder Bottoms', 'Marsh Bottoms', 'Teal Bottoms', 'Snipe Bottoms', 'Rush Bottoms', 'Mallow Bottoms', 'Willow Bottoms'],
  bare: ['Long Downs', 'High Downs', 'Windy Downs', 'Lark Downs', 'Pale Downs', 'Hare Downs', 'Kite Downs', 'Far Downs', 'Barrow Downs', 'Sheep Downs', 'Open Downs', 'Bare Downs'],
  mixed: ['Thorn Common', 'Briar Common', 'Sloe Common', 'Haw Common', 'Hollin Common', 'Fox Common', 'Elder Common', 'Bryony Common', 'Rough Common', 'Rose Common', 'Bramble Common', 'Nettle Common'],
};

const cache = new WeakMap();

export function districtsFor(world) {
  let d = cache.get(world);
  if (!d) cache.set(world, (d = new Districts(world)));
  return d;
}

class Districts {
  constructor(world) {
    this.world = world;
    const seed = world.seed || 1;
    const rng = makeRng(((seed ^ 0xd157c7) >>> 0));
    this.nx = makeNoise(seed + 901);
    this.ny = makeNoise(seed + 902);
    const kindNoise = makeNoise(seed + 903);
    const W = world.size.w;
    const H = world.size.h;
    this.cw = Math.ceil(W / SPACING);
    this.ch = Math.ceil(H / SPACING);
    const lakes = (world.lakes || []).map((l) => ({ poly: l.polygon, bb: bbox(l.polygon) }));
    const waterDist = (x, y) => {
      let d = Infinity;
      for (const c of world.creeks || []) d = Math.min(d, distToPolyline(x, y, c.points) - c.width / 2);
      for (const l of lakes) d = Math.min(d, pointInPolygon(x, y, l.poly) ? 0 : distToPolygonEdge(x, y, l.poly));
      return d;
    };
    const hillAt = (x, y) => {
      let h = 0;
      for (const hl of world.hills || []) h += hl.h * Math.exp(-((x - hl.x) ** 2 + (y - hl.y) ** 2) / (2 * (hl.r * 0.6) ** 2));
      return h;
    };
    // Centres, one per grid cell, jittered.
    this.centres = [];
    for (let j = 0; j < this.ch; j++) {
      for (let i = 0; i < this.cw; i++) {
        const x = Math.min(W - 20, (i + 0.2 + rng() * 0.6) * SPACING);
        const y = Math.min(H - 20, (j + 0.2 + rng() * 0.6) * SPACING);
        // Kind roll: slow noise (so neighbours tend to agree and join into
        // bigger districts) plus a little of the cell's own.
        const roll = Math.max(0, Math.min(0.999, 0.5 + 0.75 * kindNoise(x / 1300, y / 1300) + (rng() - 0.5) * 0.3));
        this.centres.push({ i, j, x, y, roll, kind: null, comp: -1 });
      }
    }
    // Kinds. The named outcrops and the hills make stony rises; water makes
    // willow bottoms; the rest is a seeded mix (no two neighbours forced apart:
    // runs of the same kind join into bigger districts).
    const outcrops = world.outcrops || [];
    for (const c of this.centres) {
      const wd = waterDist(c.x, c.y);
      const hill = hillAt(c.x, c.y);
      const r = c.roll;
      if (outcrops.some((o) => this.cellOf(o.x, o.y) === c)) c.kind = 'stony';
      else if (wd < 130 && hill < 12) c.kind = r < 0.88 ? 'willow' : 'mixed';
      else if (hill > 10) c.kind = r < 0.75 ? 'stony' : 'gorse';
      else if (r < 0.28) c.kind = 'bare';
      else if (r < 0.52) c.kind = 'gorse';
      else if (r < 0.8) c.kind = 'mixed';
      else c.kind = 'stony';
    }
    // Join neighbours of the same kind; name each district.
    const used = Object.fromEntries(KIND_LIST.map((k) => [k, 0]));
    const nameRng = makeRng(((seed ^ 0x4a3e5) >>> 0));
    const pools = Object.fromEntries(KIND_LIST.map((k) => {
      const a = NAMES[k].slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(nameRng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return [k, a];
    }));
    this.list = [];
    for (const c of this.centres) {
      if (c.comp >= 0) continue;
      const id = this.list.length;
      const stack = [c];
      c.comp = id;
      let sx = 0;
      let sy = 0;
      let n = 0;
      while (stack.length) {
        const a = stack.pop();
        sx += a.x;
        sy += a.y;
        n++;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const b = this.centre(a.i + di, a.j + dj);
          if (b && b.comp < 0 && b.kind === c.kind) {
            b.comp = id;
            stack.push(b);
          }
        }
      }
      const pool = pools[c.kind];
      const k = used[c.kind]++;
      const name = k < pool.length ? pool[k] : `${pool[k % pool.length]} ${['East', 'West', 'North', 'South'][Math.floor(k / pool.length - 1) % 4]}`;
      this.list.push({ id, name, kind: c.kind, cells: n, x: Math.round(sx / n), y: Math.round(sy / n) });
    }

    // Lookup grid: blended weights (bytes) and the district id per point.
    this.gw = Math.ceil(W / GRID) + 1;
    this.gh = Math.ceil(H / GRID) + 1;
    this.wgrid = new Uint8Array(this.gw * this.gh * 5);
    this.idgrid = new Uint16Array(this.gw * this.gh);
    const w = new Float32Array(5);
    for (let j = 0; j < this.gh; j++) {
      for (let i = 0; i < this.gw; i++) {
        const id = this.blend(i * GRID, j * GRID, w);
        const k = j * this.gw + i;
        for (let t = 0; t < 5; t++) this.wgrid[k * 5 + t] = Math.round(w[t] * 255);
        this.idgrid[k] = id;
      }
    }
    this._w = new Float32Array(5);
    this._at = { kind: null, name: null, id: 0, w: Object.fromEntries(KIND_LIST.map((k) => [k, 0])) };
  }

  centre(i, j) {
    if (i < 0 || j < 0 || i >= this.cw || j >= this.ch) return null;
    return this.centres[j * this.cw + i];
  }

  // The centre whose cell (by nearest centre, unwarped) holds (x, y).
  cellOf(x, y) {
    const i = Math.floor(x / SPACING);
    const j = Math.floor(y / SPACING);
    let best = null;
    let bd = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = this.centre(i + di, j + dj);
        if (!c) continue;
        const d = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    }
    return best;
  }

  // Weights by kind at (x, y), from the warped distances to nearby centres.
  // Returns the nearest centre's district id.
  blend(x, y, out) {
    const wx = x + WARP * (0.7 * this.nx(x / 230, y / 230) + 0.3 * this.nx(x / 80 + 7, y / 80));
    const wy = y + WARP * (0.7 * this.ny(x / 230, y / 230) + 0.3 * this.ny(x / 80, y / 80 + 7));
    const i = Math.floor(wx / SPACING);
    const j = Math.floor(wy / SPACING);
    let d1 = Infinity;
    let near = null;
    const ds = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = this.centre(i + di, j + dj);
        if (!c) continue;
        const d = Math.hypot(c.x - wx, c.y - wy);
        ds.push([c, d]);
        if (d < d1) {
          d1 = d;
          near = c;
        }
      }
    }
    out.fill(0);
    for (const [c, d] of ds) {
      const k = KIND_LIST.indexOf(c.kind);
      const v = 1 - smoothstep(0, BLEND, d - d1);
      if (v > out[k]) out[k] = v;
    }
    let s = 0;
    for (let t = 0; t < 5; t++) s += out[t];
    for (let t = 0; t < 5; t++) out[t] /= s;
    return near ? near.comp : 0;
  }

  // Blended weights at (x, y) (bilinear from the grid), KIND_LIST order.
  weights(x, y) {
    const gx = Math.max(0, Math.min(this.gw - 1.001, x / GRID));
    const gy = Math.max(0, Math.min(this.gh - 1.001, y / GRID));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const k00 = (j * this.gw + i) * 5;
    const k10 = k00 + 5;
    const k01 = k00 + this.gw * 5;
    const k11 = k01 + 5;
    const g = this.wgrid;
    const w = this._w;
    for (let t = 0; t < 5; t++) {
      const a = g[k00 + t] + (g[k10 + t] - g[k00 + t]) * fx;
      const b = g[k01 + t] + (g[k11 + t] - g[k01 + t]) * fx;
      w[t] = (a + (b - a) * fy) / 255;
    }
    return w;
  }

  // Which district (x, y) is in, and the blended weights.
  at(x, y) {
    const w = this.weights(x, y);
    const o = this._at;
    let best = 0;
    for (let t = 0; t < 5; t++) {
      o.w[KIND_LIST[t]] = w[t];
      if (w[t] > w[best]) best = t;
    }
    const gi = Math.max(0, Math.min(this.gw - 1, Math.round(x / GRID)));
    const gj = Math.max(0, Math.min(this.gh - 1, Math.round(y / GRID)));
    const d = this.list[this.idgrid[gj * this.gw + gi]];
    o.kind = KIND_LIST[best];
    o.id = d.id;
    o.name = d.kind === o.kind ? d.name : RECIPES[o.kind].label;
    return o;
  }
}

// 0..1 from a string and the seed (for per-district variety).
export function districtHash(seed, s) {
  const rng = makeRng((hashString(s) ^ (seed * 2654435761)) >>> 0);
  rng();
  return rng();
}
