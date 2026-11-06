// Small bumps and shallow ruts on dirt roads (a few cm up to about 13 cm),
// seeded and deterministic. Terrain.heightAt() adds them, so the car, traffic
// and anything placed by the road all see the same surface the road mesh
// shows. The terrain grid itself stays smooth: bumps only raise the road, so
// the grid never pokes through it. Paved roads stay smooth.

import { SegIndex, distToPolyline, measurePolyline, bbox } from '../../src/drive/geom.js';
import { makeNoise, smoothstep } from './terrain.js';

const SHOULDER = 0.8; // bumps fade to nothing over this much at the road edge
const RUT_W = 0.32; // rut half width (metres, gaussian-ish)
const RUT_AT = 0.22; // ruts sit this fraction of the width either side of the centre
const BASE = 0.075; // raised road bed under the bumps
const BUMP = 0.045; // bump amplitude
const RUT = 0.055; // rut depth below the bed

export class RoadBumps {
  constructor(world) {
    this.noise = makeNoise(world.seed + 911);
    this.noise2 = makeNoise(world.seed + 377);
    this.index = new SegIndex(24);
    this.roads = [];
    for (const r of world.roads) {
      if (r.type === 'paved') continue;
      const pts = r.points;
      const cum = measurePolyline(pts);
      const total = cum[cum.length - 1];
      // Fade (0..1) along the road, 1 m steps: none near junctions, road ends,
      // creeks and bridges, so the bumps never step where roads meet.
      const fade = new Float32Array(Math.ceil(total) + 2);
      const near = (list, pad) => list.map((o) => ({ o, bb: bbox(o.points), pad: pad(o) }));
      const others = near(world.roads.filter((o) => o !== r), (o) => o.width / 2 + r.width / 2 + 12);
      const creeks = near(world.creeks, (c) => c.width / 2 + 20);
      const close = (e, p) => p.x > e.bb.minX - e.pad && p.x < e.bb.maxX + e.pad && p.y > e.bb.minY - e.pad && p.y < e.bb.maxY + e.pad;
      for (let i = 0; i < fade.length; i++) {
        const d = Math.min(i, total);
        const p = pointAt(pts, cum, d);
        let f = smoothstep(0, 10, d) * smoothstep(0, 10, total - d);
        for (const { o, ...e } of others) {
          if (f <= 0) break;
          if (!close(e, p)) continue;
          const od = distToPolyline(p.x, p.y, o.points) - o.width / 2;
          f *= smoothstep(r.width / 2 + 2, r.width / 2 + 12, od);
        }
        for (const { o: c, ...e } of creeks) {
          if (f <= 0) break;
          if (!close(e, p)) continue;
          f *= smoothstep(c.width / 2 + 6, c.width / 2 + 20, distToPolyline(p.x, p.y, c.points));
        }
        fade[i] = f;
      }
      const road = { r, half: r.width / 2, cum, fade, seed: this.roads.length * 37.3 };
      this.roads.push(road);
      for (let i = 0; i < pts.length - 1; i++) {
        this.index.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], road.half + 1, { road, i });
      }
    }
  }

  // Nearest dirt road under (x, y): { road, s (along), t (signed offset) } or null.
  locate(x, y) {
    let best = null;
    let bd = Infinity;
    for (const it of this.index.near(x, y)) {
      const ex = it.bx - it.ax;
      const ey = it.by - it.ay;
      const l2 = ex * ex + ey * ey || 1;
      const u = Math.max(0, Math.min(1, ((x - it.ax) * ex + (y - it.ay) * ey) / l2));
      const px = it.ax + ex * u;
      const py = it.ay + ey * u;
      const d = Math.hypot(x - px, y - py);
      if (d < bd && d < it.data.road.half) {
        bd = d;
        const len = Math.sqrt(l2);
        const side = ex * (y - it.ay) - ey * (x - it.ax) > 0 ? 1 : -1;
        best = { road: it.data.road, s: it.data.road.cum[it.data.i] + len * u, t: side * d };
      }
    }
    return best;
  }

  // Extra height (m, >= 0) at a world point. 0 off dirt roads.
  at(x, y) {
    const hit = this.locate(x, y);
    if (!hit) return 0;
    const { road, s, t } = hit;
    const i = Math.max(0, Math.min(road.fade.length - 2, Math.floor(s)));
    const fa = road.fade[i] + (road.fade[i + 1] - road.fade[i]) * (s - i);
    if (fa <= 0) return 0;
    const at = Math.abs(t);
    const edge = 1 - smoothstep(road.half - SHOULDER, road.half, at);
    if (edge <= 0) return 0;
    const rd = (at - road.r.width * RUT_AT) / RUT_W;
    const rut = Math.exp(-rd * rd);
    // Bumps: long waves along the road, a little different across it.
    const bump = 0.65 * this.noise(s / 3.2 + road.seed, t * 0.35) + 0.35 * this.noise2(s / 2.4 + road.seed, t * 0.6 + 4);
    const h = BASE + BUMP * bump - RUT * rut;
    return Math.max(0, h) * edge * fa;
  }

  // 0..1: how much of a bumpy dirt road surface is under (x, y) (for camera rumble).
  roughness(x, y) {
    const hit = this.locate(x, y);
    if (!hit) return 0;
    const i = Math.max(0, Math.min(hit.road.fade.length - 1, Math.round(hit.s)));
    return hit.road.fade[i];
  }
}

function pointAt(pts, cum, d) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t };
}
