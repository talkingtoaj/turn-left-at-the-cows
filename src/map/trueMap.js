// The true map of a mission's area: WORLD as it really is (no lies), drawn
// plainly for the mission-complete screen. Never shows the player.
// Uses only scene.add.graphics / scene.add.text (single line) so a canvas
// adapter can draw it too.

import { WORLD } from '../world/world.js';
import { resolvePrintedMap } from '../game/printedMaps.js';
import { drawMapSymbol } from './oldMap.js';

const SERIF = 'Georgia, "Times New Roman", serif';
const INK = 0x2e241b;
const ROAD_RED = 0xc4553b;
const DIRT = 0x6b4e32;
const WATER = 0x3d77b8;
const WATER_FILL = 0xa9c8e0;
const FOREST = 0x8fae7a;
const TOWN_TINT = 0xd9a58f;

// The part of the world each mission is played in.
const AREAS = {
  m1_parcel: { x: 0, y: 0, w: 3000, h: 3000 },
  m2_cabin: { x: 2000, y: 0, w: 4300, h: 2250 },
};

// Area for a mission: from the table, else a box around its goal, waypoints
// and giver, with some margin.
export function missionArea(mission, world = WORLD) {
  if (!mission) return { x: 0, y: 0, w: world.size.w, h: world.size.h };
  if (AREAS[mission.id]) return AREAS[mission.id];
  const pts = [mission.goal, ...(mission.waypoints || [])];
  const giver = mission.giverNpcId && world.locals.find((l) => l.id === mission.giverNpcId);
  if (giver) pts.push(giver);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 400;
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad);
  return {
    x, y,
    w: Math.min(world.size.w, Math.max(...xs) + pad) - x,
    h: Math.min(world.size.h, Math.max(...ys) + pad) - y,
  };
}

// A printed map definition that tells the truth about `bounds`.
export function truthDef(bounds, title = 'The real roads') {
  return { id: 'truth', title, style: 'print', bounds, include: 'all', lies: [] };
}

function text(scene, c, x, y, s, style, origin = [0.5, 0.5], rot = 0) {
  const t = scene.add.text(x, y, s, { fontFamily: SERIF, color: '#2e241b', fontSize: '10px', ...style })
    .setOrigin(origin[0], origin[1]);
  if (rot) t.setRotation(rot);
  c.add(t);
  return t;
}

// Draws the true map of `bounds` fitted into `box` ({x, y, w, h}, screen px).
// opts.labels: draw names (default true). Returns { scale, rect } (rect = the
// drawn map area).
export function drawTrueMap(scene, container, box, bounds, opts = {}) {
  const data = resolvePrintedMap(truthDef(bounds));
  const B = data.bounds;
  const s = Math.min(box.w / B.w, box.h / B.h);
  const rw = B.w * s;
  const rh = B.h * s;
  const ox = box.x + (box.w - rw) / 2;
  const oy = box.y + (box.h - rh) / 2;
  const P = ([wx, wy]) => ({ x: ox + (wx - B.x) * s, y: oy + (wy - B.y) * s });
  const pts = (arr) => arr.map(P);
  const showLabels = opts.labels !== false;
  const fs = (px) => `${Math.max(8, Math.round(px))}px`;
  const big = Math.min(1.4, Math.max(0.8, s * 6));

  const g = scene.add.graphics();
  container.add(g);
  g.fillStyle(0xf1e8cf, 1);
  g.fillRect(ox, oy, rw, rh);

  for (const f of data.forests) {
    g.fillStyle(FOREST, 0.3);
    g.fillPoints(pts(f.polygon), true);
  }
  for (const lake of data.lakes) {
    const poly = pts(lake.polygon);
    g.fillStyle(WATER_FILL, 1);
    g.fillPoints(poly, true);
    g.lineStyle(1, WATER, 1);
    g.strokePoints(poly, true);
  }
  for (const c of data.creeks) {
    g.lineStyle(c.kind === 'river' ? 2.4 : 1.6, WATER, 1);
    g.strokePoints(pts(c.points), false);
  }
  for (const r of data.roads) {
    if (r.type === 'paved') continue;
    g.lineStyle(1.6, DIRT, 1);
    // Plain dashes (crisp, this is the real map).
    const p = pts(r.points);
    let on = true;
    let left = 4;
    for (let i = 0; i < p.length - 1; i++) {
      let { x: x1, y: y1 } = p[i];
      const { x: x2, y: y2 } = p[i + 1];
      let seg = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / (seg || 1);
      const uy = (y2 - y1) / (seg || 1);
      while (seg > 0) {
        const step = Math.min(left, seg);
        if (on) g.lineBetween(x1, y1, x1 + ux * step, y1 + uy * step);
        x1 += ux * step;
        y1 += uy * step;
        seg -= step;
        left -= step;
        if (left <= 0) {
          on = !on;
          left = on ? 4 : 2.5;
        }
      }
    }
  }
  for (const r of data.roads) {
    if (r.type !== 'paved') continue;
    g.lineStyle(3.6, INK, 1);
    g.strokePoints(pts(r.points), false);
    g.lineStyle(2, ROAD_RED, 1);
    g.strokePoints(pts(r.points), false);
  }

  // Bridges: intact ones as a small bar, broken ones as a red X.
  for (const b of data.bridges) {
    const { x, y } = P([b.x, b.y]);
    if (b.intact) {
      g.fillStyle(INK, 1);
      g.fillCircle(x, y, 1.8);
    } else {
      g.lineStyle(2, 0xb3261e, 1);
      g.lineBetween(x - 4, y - 4, x + 4, y + 4);
      g.lineBetween(x + 4, y - 4, x - 4, y + 4);
    }
  }

  g.fillStyle(INK, 0.85);
  for (const b of data.buildings) {
    const { x, y } = P([b.x, b.y]);
    const w = Math.max(1.5, b.w * s);
    const h = Math.max(1.5, b.h * s);
    g.fillRect(x - w / 2, y - h / 2, w, h);
  }
  for (const t of data.towns) {
    const { x, y } = P([t.x, t.y]);
    g.fillStyle(TOWN_TINT, 0.45);
    g.fillCircle(x, y, t.kind === 'hamlet' ? 7 : 11);
    if (showLabels) {
      text(scene, container, x, y - 16, t.name.toUpperCase(), { fontSize: fs(11 * big), fontStyle: 'bold' });
    }
  }
  for (const lm of data.landmarks) {
    const { x, y } = P([lm.x, lm.y]);
    drawMapSymbol(g, lm.kind, x, y);
  }
  // Mission places (farm, cabin): a small star-like ring.
  for (const p of data.places) {
    const { x, y } = P([p.x, p.y]);
    g.lineStyle(1.6, 0xb3261e, 1);
    g.strokeCircle(x, y, 5);
    g.fillStyle(0xb3261e, 1);
    g.fillCircle(x, y, 1.8);
    if (showLabels) {
      // Label on the left when it would run off the right edge.
      const left = x + 8 + p.name.length * 6 * big > ox + rw;
      text(scene, container, left ? x - 8 : x + 8, y, p.name,
        { fontSize: fs(10 * big), fontStyle: 'italic', color: '#8a1f17' }, [left ? 1 : 0, 0.5]);
    }
  }

  if (showLabels) {
    // One label per road name, on its longest piece, if it has room.
    const seen = new Map();
    for (const r of data.roads) {
      const p = pts(r.points);
      let len = 0;
      for (let i = 0; i < p.length - 1; i++) len += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
      if (len < 70) continue;
      const prev = seen.get(r.name);
      if (!prev || len > prev.len) seen.set(r.name, { len, p });
    }
    for (const [name, { p }] of seen) {
      const a = p[Math.floor(p.length * 0.45)];
      const b = p[Math.min(p.length - 1, Math.floor(p.length * 0.45) + 2)];
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      text(scene, container, a.x + Math.sin(ang) * 7, a.y - Math.cos(ang) * 7, name,
        { fontSize: fs(9 * big), color: '#4a3a2a' }, [0.5, 0.5], ang);
    }
  }

  g.lineStyle(1.5, INK, 1);
  g.strokeRect(ox, oy, rw, rh);
  return { scale: s, rect: { x: ox, y: oy, w: rw, h: rh } };
}
