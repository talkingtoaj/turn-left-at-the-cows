// Draws the static world with Phaser Graphics. Everything is in world units (metres).
// No place-name text is ever drawn here; that would spoil the game.

import {
  makeRng, hashString, localToWorld, worldToLocal, measurePolyline, pointAlong, centroid, DEG, nearestOnPolyline,
} from './geom.js';
import {
  GAS, CHURCH, WATER_TOWER, MILL, RADIO_MAST, SILO, anchorPoints,
  GRAIN, LOOKOUT, CAMP, QUARRY, coveredParts, quarryOpening, quarryBoulders, fenceRuns,
} from './layout.js';

export const GRASS = 0x5f8f4a;

// Morning sun in the east-south-east, so shadows fall west-north-west.
// Shadow offset per metre of object height.
const SUN = { x: -0.75, y: -0.25 };
const SHADOW_ALPHA = 0.22;

// ---------- small drawing helpers ----------

function shade(color, f) {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

function rectCorners(cx, cy, angle, lx, ly, w, h) {
  return [
    localToWorld(cx, cy, angle, lx - w / 2, ly - h / 2),
    localToWorld(cx, cy, angle, lx + w / 2, ly - h / 2),
    localToWorld(cx, cy, angle, lx + w / 2, ly + h / 2),
    localToWorld(cx, cy, angle, lx - w / 2, ly + h / 2),
  ];
}

// Filled rect in a rotated local frame, using the current fill style.
function quad(g, cx, cy, angle, lx, ly, w, h) {
  g.fillPoints(rectCorners(cx, cy, angle, lx, ly, w, h), true);
}

function poly(g, cx, cy, angle, pts) {
  g.fillPoints(pts.map(([lx, ly]) => localToWorld(cx, cy, angle, lx, ly)), true);
}

function line(g, cx, cy, angle, x1, y1, x2, y2) {
  const a = localToWorld(cx, cy, angle, x1, y1);
  const b = localToWorld(cx, cy, angle, x2, y2);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

// Convex hull (monotone chain) of {x, y} points.
function hull(points) {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Shadow of a box: the rect swept along the sun direction by its height.
function boxShadow(g, cx, cy, angle, lx, ly, w, h, height) {
  const base = rectCorners(cx, cy, angle, lx, ly, w, h);
  const moved = base.map((p) => ({ x: p.x + SUN.x * height, y: p.y + SUN.y * height }));
  g.fillStyle(0x000000, SHADOW_ALPHA);
  g.fillPoints(hull(base.concat(moved)), true);
}

function circleShadow(g, x, y, r, height) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    pts.push({ x: x + Math.cos(a) * r + SUN.x * height, y: y + Math.sin(a) * r + SUN.y * height });
  }
  g.fillStyle(0x000000, SHADOW_ALPHA);
  g.fillPoints(hull(pts), true);
}

// Thick polyline. Closed shapes use quads with round joints. Open lines are
// drawn as mitered strips in runs of RUN segments; `at(x, y)` picks the
// Graphics for each run (a scenery chunk), defaulting to `g`. Round caps only
// at the two ends (junctions), since the dense curves need no joints.
const RUN = 12;
function thickPolyline(g, pts, width, color, closed = false, at = null) {
  const hw = width / 2;
  if (closed) {
    g.fillStyle(color, 1);
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (!len) continue;
      const nx = (-(by - ay) / len) * hw;
      const ny = ((bx - ax) / len) * hw;
      g.fillPoints([
        { x: ax + nx, y: ay + ny }, { x: bx + nx, y: by + ny },
        { x: bx - nx, y: by - ny }, { x: ax - nx, y: ay - ny },
      ], true);
    }
    for (const [x, y] of pts) g.fillCircle(x, y, hw);
    return;
  }
  const pick = at || (() => g);
  const off = miterOffsets(pts, hw);
  for (let i0 = 0; i0 < pts.length - 1; i0 += RUN) {
    const i1 = Math.min(pts.length - 1, i0 + RUN);
    const left = [];
    const right = [];
    for (let i = i0; i <= i1; i++) {
      left.push({ x: pts[i][0] + off[i][0], y: pts[i][1] + off[i][1] });
      right.push({ x: pts[i][0] - off[i][0], y: pts[i][1] - off[i][1] });
    }
    const mid = pts[(i0 + i1) >> 1];
    const gg = pick(mid[0], mid[1]);
    gg.fillStyle(color, 1);
    gg.fillPoints(left.concat(right.reverse()), true);
  }
  for (const p of [pts[0], pts[pts.length - 1]]) {
    const gg = pick(p[0], p[1]);
    gg.fillStyle(color, 1);
    gg.fillCircle(p[0], p[1], hw);
  }
}

// Per-point sideways offsets (length hw, mitered at bends, capped at 2 hw).
function miterOffsets(pts, hw) {
  const n = pts.length;
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dy) || 1;
    segN.push([-dy / l, dx / l]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = segN[Math.max(0, i - 1)];
    const b = segN[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cos = Math.max(0.5, mx * b[0] + my * b[1]);
    out.push([(mx * hw) / cos, (my * hw) / cos]);
  }
  return out;
}

// Dashes along a polyline.
function dashedLine(g, pts, dash, gap, width, color, at = null) {
  const pick = at || (() => g);
  const cum = measurePolyline(pts);
  const total = cum[cum.length - 1];
  for (let d = gap / 2; d < total; d += dash + gap) {
    const a = pointAlong(pts, cum, d);
    const b = pointAlong(pts, cum, Math.min(total, d + dash));
    const gg = pick(a.x, a.y);
    gg.lineStyle(width, color, 1);
    gg.lineBetween(a.x, a.y, b.x, b.y);
  }
}

// Line offset sideways from a polyline, as runs of stroked points.
function offsetLines(g, pts, off, width, color, at = null) {
  const pick = at || (() => g);
  const o = miterOffsets(pts, off);
  for (let i0 = 0; i0 < pts.length - 1; i0 += RUN) {
    const i1 = Math.min(pts.length - 1, i0 + RUN);
    const line = [];
    for (let i = i0; i <= i1; i++) line.push({ x: pts[i][0] + o[i][0], y: pts[i][1] + o[i][1] });
    const mid = pts[(i0 + i1) >> 1];
    const gg = pick(mid[0], mid[1]);
    gg.lineStyle(width, color, 1);
    gg.strokePoints(line, false);
  }
}

// ---------- ground (one Graphics, drawn once) ----------

const PAD_COLORS = { concrete: 0xb3b0a8, gravel: 0xa29d92, yard: 0xa48f6a, field: 0x9a8150, track: 0xab9670 };

// `layer(name, x, y)` (optional) returns the Graphics to draw a piece into:
// the Drive scene passes per-chunk graphics so only nearby pieces render.
// Layer names, bottom to top: dirtEdge, dirtTop, dirtDetail, pavedEdge,
// pavedBand, pavedTop, pavedDash, waterBank, water. Without it, all goes in g.
export const GROUND_LAYERS = ['dirtEdge', 'dirtTop', 'dirtDetail', 'pavedEdge', 'pavedBand', 'pavedTop', 'pavedDash', 'waterBank', 'water'];
export function drawGround(g, world, scenery, layer = null, gTop = g) {
  const rng = makeRng(world.seed + 7);
  const L = (name) => (layer ? (x, y) => layer(name, x, y) : null);

  // Forest floor: a darker, softer green under the trees.
  for (const f of world.forests) {
    thickPolyline(g, f.polygon, 16, 0x557f42, true);
    g.fillStyle(0x557f42, 1);
    g.fillPoints(f.polygon.map(([x, y]) => ({ x, y })), true);
  }

  // Yards, forecourts and fields.
  for (const p of scenery.pads) {
    g.fillStyle(PAD_COLORS[p.kind], 1);
    quad(g, p.x, p.y, p.angle, 0, 0, p.w, p.h);
    if (p.kind === 'field') {
      g.lineStyle(0.8, 0x6f8a3c, 1);
      for (let x = -p.w / 2 + 1.5; x < p.w / 2; x += 2.6) line(g, p.x, p.y, p.angle, x, -p.h / 2 + 1, x, p.h / 2 - 1);
      // A rough fence round the field.
      g.lineStyle(0.15, 0x5a4630, 1);
      const c = rectCorners(p.x, p.y, p.angle, 0, 0, p.w + 2, p.h + 2);
      g.strokePoints(c, true);
    }
  }

  // Farm fields: pasture grass and crop rows (fences are drawn with objects).
  for (const f of world.fields || []) drawFieldGround(g, f, rng);

  // Roads: dirt first, paved on top so junctions look right.
  const dirt = world.roads.filter((r) => r.type !== 'paved');
  const paved = world.roads.filter((r) => r.type === 'paved');
  for (const r of dirt) thickPolyline(g, r.points, r.width + 1.6, 0x9a8157, false, L('dirtEdge'));
  for (const r of dirt) thickPolyline(g, r.points, r.width, 0xbda275, false, L('dirtTop'));
  for (const r of dirt) {
    // Wheel ruts and loose stones, which also help you feel your speed.
    offsetLines(g, r.points, r.width * 0.22, 0.35, 0xa98f63, L('dirtDetail'));
    offsetLines(g, r.points, -r.width * 0.22, 0.35, 0xa98f63, L('dirtDetail'));
    const cum = measurePolyline(r.points);
    const total = cum[cum.length - 1];
    const at = L('dirtDetail') || (() => g);
    for (let d = 0; d < total; d += 1.5 + rng() * 3) {
      const p = pointAlong(r.points, cum, d);
      const off = (rng() - 0.5) * r.width * 0.9;
      const gg = at(p.x, p.y);
      gg.fillStyle(rng() < 0.5 ? 0x8e7650 : 0xcdb68b, 1);
      gg.fillCircle(p.x - p.dy * off, p.y + p.dx * off, 0.12 + rng() * 0.18);
    }
  }
  // Paved: shoulder, then a pale band, then asphalt a bit narrower. The band
  // shows as edge lines, and other roads' asphalt covers it at junctions.
  for (const r of paved) thickPolyline(g, r.points, r.width + 1.8, 0x8c8a82, false, L('pavedEdge'));
  for (const r of paved) thickPolyline(g, r.points, r.width, 0xd8d8d0, false, L('pavedBand'));
  for (const r of paved) thickPolyline(g, r.points, r.width - 0.5, 0x66676a, false, L('pavedTop'));
  for (const r of paved) dashedLine(g, r.points, 3, 6, 0.22, 0xe6d690, L('pavedDash'));

  // Creek: muddy banks, water, a lighter channel, reeds.
  for (const c of world.creeks) {
    thickPolyline(g, c.points, c.width + 7, 0x7d7050, false, L('waterBank'));
    thickPolyline(g, c.points, c.width + 3, 0x6c6444, false, L('waterBank'));
  }
  for (const c of world.creeks) {
    thickPolyline(g, c.points, c.width, 0x467aa6, false, L('water'));
    thickPolyline(g, c.points, c.width * 0.4, 0x5a8dba, false, L('water'));
    const cum = measurePolyline(c.points);
    const total = cum[cum.length - 1];
    const at = L('water') || (() => g);
    for (let d = 0; d < total; d += 2 + rng() * 5) {
      const p = pointAlong(c.points, cum, d);
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (c.width / 2 + 1 + rng() * 3);
      const gg = at(p.x, p.y);
      gg.fillStyle(rng() < 0.5 ? 0x3f6a33 : 0x58803f, 1);
      gg.fillCircle(p.x - p.dy * off, p.y + p.dx * off, 0.3 + rng() * 0.4);
    }
  }
  g = gTop; // lakes and bridges sit above the chunked layers

  // Lakes: sandy shore, water, deeper middle, lily pads.
  for (const l of world.lakes) {
    thickPolyline(g, l.polygon, 7, 0xb3a374, true);
    g.fillStyle(0x467aa6, 1);
    g.fillPoints(l.polygon.map(([x, y]) => ({ x, y })), true);
    const [mx, my] = centroid(l.polygon);
    g.fillStyle(0x3d6e98, 1);
    g.fillPoints(l.polygon.map(([x, y]) => ({ x: mx + (x - mx) * 0.65, y: my + (y - my) * 0.65 })), true);
    for (let i = 0; i < 40; i++) {
      const v = l.polygon[Math.floor(rng() * l.polygon.length)];
      const t = 0.8 + rng() * 0.15;
      g.fillStyle(0x4f8a45, 1);
      g.fillCircle(mx + (v[0] - mx) * t + (rng() - 0.5) * 20, my + (v[1] - my) * t + (rng() - 0.5) * 20, 0.6 + rng() * 0.6);
    }
  }

  for (const b of world.bridges) {
    if (b.kind === 'ford') drawFord(g, b, rng);
    else if (b.kind === 'covered' && world.landmarks.some((l) => l.bridgeId === b.id)) continue; // drawn as a landmark
    else drawBridge(g, world, b, rng);
  }
}

// Ford: a pale gravel causeway through the water, red-topped marker posts.
function drawFord(g, b, rng) {
  const a = b.angle;
  g.fillStyle(0x9c9480, 0.75);
  quad(g, b.x, b.y, a, 0, 0, b.width, b.length);
  for (let i = 0; i < 40; i++) {
    g.fillStyle(rng() < 0.5 ? 0x7d776a : 0xb0a994, 1);
    g.fillCircle(...Object.values(localToWorld(b.x, b.y, a, (rng() - 0.5) * b.width, (rng() - 0.5) * b.length)), 0.2 + rng() * 0.25);
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const p = localToWorld(b.x, b.y, a, side * (b.width / 2 + 0.3), end * (b.length / 2 - 2));
      g.fillStyle(0xf0eee6, 1);
      g.fillCircle(p.x, p.y, 0.18);
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(p.x, p.y, 0.1);
    }
  }
}

function drawBridge(g, world, b, rng) {
  const road = world.roads.find((r) => r.id === b.roadId);
  const paved = road && road.type === 'paved';
  const W = b.width;
  const L = b.length;
  const a = b.angle;
  const creekW = b.waterWidth || (world.creeks.length ? world.creeks[0].width : 14);
  const deck = paved ? 0x9b9a94 : 0x8a6a45;
  const plankLine = paved ? 0x86857f : 0x6e5234;

  if (b.intact) {
    // Shadow on the water, deck, surface, rails.
    g.fillStyle(0x000000, 0.25);
    quad(g, b.x, b.y, a, -1.2, -0.4, W, L - 2);
    g.fillStyle(deck, 1);
    quad(g, b.x, b.y, a, 0, 0, W, L);
    if (paved) {
      g.fillStyle(0x66676a, 1);
      quad(g, b.x, b.y, a, 0, 0, W - 2, L);
      g.lineStyle(0.22, 0xe6d690, 1);
      for (let y = -L / 2 + 2; y < L / 2 - 3; y += 9) line(g, b.x, b.y, a, 0, y, 0, y + 3);
    } else {
      g.lineStyle(0.12, plankLine, 1);
      for (let y = -L / 2 + 0.8; y < L / 2; y += 0.8) line(g, b.x, b.y, a, -W / 2, y, W / 2, y);
    }
    // Rails with posts.
    g.fillStyle(paved ? 0xd6d5cc : 0x6a4c2e, 1);
    quad(g, b.x, b.y, a, -W / 2 + 0.3, 0, 0.5, L);
    quad(g, b.x, b.y, a, W / 2 - 0.3, 0, 0.5, L);
    g.fillStyle(paved ? 0x77766f : 0x4a3420, 1);
    for (let y = -L / 2 + 1; y <= L / 2 - 1; y += 2.5) {
      quad(g, b.x, b.y, a, -W / 2 + 0.3, y, 0.6, 0.6);
      quad(g, b.x, b.y, a, W / 2 - 0.3, y, 0.6, 0.6);
    }
    return;
  }

  // Washed out: a stub on each bank, jagged ends, gap over the water.
  const stub = (L - creekW) / 2 + 1.5;
  for (const dir of [-1, 1]) {
    const outer = dir * (L / 2);
    const inner = dir * (L / 2 - stub);
    // Deck with a ragged broken edge.
    const jag = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const x = -W / 2 + (W * i) / steps;
      jag.push([x, inner + dir * (i % 2 ? 0.9 : -0.6) * (0.5 + rng())]);
    }
    const pts = [[-W / 2, outer], [W / 2, outer], ...jag.reverse()];
    g.fillStyle(0x000000, 0.25);
    poly(g, b.x - 1, b.y - 0.4, a, pts);
    g.fillStyle(deck, 1);
    poly(g, b.x, b.y, a, pts);
    g.lineStyle(0.12, plankLine, 1);
    for (let y = Math.min(outer, inner); y < Math.max(outer, inner); y += 0.8) {
      if (Math.abs(y - inner) < 1) continue;
      line(g, b.x, b.y, a, -W / 2, y, W / 2, y);
    }
    // Charred, splintered end.
    g.fillStyle(0x3a2c20, 1);
    for (const [x, y] of jag) g.fillCircle(localToWorld(b.x, b.y, a, x, y).x, localToWorld(b.x, b.y, a, x, y).y, 0.35);
    // Broken rails: one longer than the other.
    g.fillStyle(0x6a4c2e, 1);
    const railA = stub * 0.9;
    const railB = stub * 0.5;
    quad(g, b.x, b.y, a, -W / 2 + 0.3, outer - (dir * railA) / 2, 0.45, railA);
    quad(g, b.x, b.y, a, W / 2 - 0.3, outer - (dir * railB) / 2, 0.45, railB);
    // Striped barrier across the stub, back from the edge.
    const by = inner + dir * 2.5;
    for (let i = 0; i < 6; i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xc0392b, 1);
      const x0 = -W / 2 + 0.6 + (i * (W - 1.2)) / 6;
      quad(g, b.x, b.y, a, x0 + (W - 1.2) / 12, by, (W - 1.2) / 6, 0.4);
    }
  }
  // Debris in the water, drifting downstream (east).
  for (let i = 0; i < 7; i++) {
    const lx = (rng() - 0.5) * W * 1.6 + rng() * 10;
    const ly = (rng() - 0.5) * (L - 2 * stub);
    const p = localToWorld(b.x, b.y, a, lx, ly);
    g.fillStyle(rng() < 0.5 ? 0x6e5234 : 0x5a4029, 1);
    quad(g, p.x, p.y, rng() * 180, 0, 0, 0.35, 1.5 + rng() * 2.5);
  }
}

// ---------- grass texture (chunked) ----------

export function drawTufts(g, x0, y0, size, rng) {
  const colors = [0x56843f, 0x6a9a54, 0x507d3a, 0x67954f];
  for (let i = 0; i < 160; i++) {
    const x = x0 + rng() * size;
    const y = y0 + rng() * size;
    g.fillStyle(colors[Math.floor(rng() * colors.length)], 1);
    const r = 1 + rng() * 4;
    g.fillEllipse(x, y, r * 2, r * (1.2 + rng() * 0.8));
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle(rng() < 0.5 ? 0xe6dfa0 : 0xcf9ac4, 1);
    g.fillCircle(x0 + rng() * size, y0 + rng() * size, 0.15 + rng() * 0.15);
  }
}

// ---------- trees ----------

export function drawTree(gS, gO, t) {
  const r = t.r;
  const height = t.kind === 'pine' ? r * 4 : r * 2.4;
  circleShadow(gS, t.x, t.y, r * 0.9, height * 0.5);

  if (t.kind === 'pine') {
    const base = shade(0x2f5a33, 0.85 + t.tint * 0.3);
    // Layered, slightly ragged star shapes read as conifer branches.
    const star = (rr, color, ox, oy) => {
      const pts = [];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + t.tint * 3;
        const jag = i % 2 ? 0.72 + ((i * 7 + t.tint * 10) % 3) * 0.04 : 1;
        pts.push({ x: t.x + ox + Math.cos(a) * rr * jag, y: t.y + oy + Math.sin(a) * rr * jag });
      }
      gO.fillStyle(color, 1);
      gO.fillPoints(pts, true);
    };
    star(r, shade(base, 0.85), 0, 0);
    star(r * 0.7, base, r * 0.08, r * 0.04);
    star(r * 0.4, shade(base, 1.25), r * 0.15, r * 0.06);
    gO.fillStyle(shade(base, 0.7), 1);
    gO.fillCircle(t.x, t.y, r * 0.15);
  } else if (t.kind === 'willow') {
    const base = shade(0x7f9e48, 0.9 + t.tint * 0.2);
    gO.fillStyle(shade(base, 0.85), 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + t.tint * 2;
      gO.fillCircle(t.x + Math.cos(a) * r * 0.6, t.y + Math.sin(a) * r * 0.6, r * 0.5);
    }
    gO.fillStyle(base, 1);
    gO.fillCircle(t.x, t.y, r * 0.75);
    gO.fillStyle(shade(base, 1.18), 1);
    gO.fillCircle(t.x + r * 0.2, t.y + r * 0.1, r * 0.4);
  } else {
    const base = shade(0x41733a, 0.85 + t.tint * 0.35);
    gO.fillStyle(shade(base, 0.8), 1);
    gO.fillCircle(t.x, t.y, r);
    gO.fillStyle(base, 1);
    gO.fillCircle(t.x + r * 0.12, t.y + r * 0.05, r * 0.82);
    gO.fillStyle(shade(base, 1.2), 1);
    gO.fillCircle(t.x + r * 0.3, t.y + r * 0.15, r * 0.45);
  }
}

export function drawBush(gO, b) {
  gO.fillStyle(shade(0x3f6b34, 0.85 + b.tint * 0.3), 1);
  gO.fillCircle(b.x, b.y, b.r);
  gO.fillStyle(shade(0x4f7d3e, 0.9 + b.tint * 0.3), 1);
  gO.fillCircle(b.x + b.r * 0.2, b.y + b.r * 0.1, b.r * 0.55);
}

// ---------- buildings ----------

const ROOFS = [0x8e4b3a, 0x5a5f66, 0x6b4a3a, 0x4f6a5a, 0x7a3b3b, 0x6e6a60];

// Pitched roof: ridge on the long axis, sunny half lighter.
function pitchedRoof(g, cx, cy, angle, lx, ly, w, h, color) {
  g.fillStyle(shade(color, 0.7), 1);
  quad(g, cx, cy, angle, lx, ly, w + 0.6, h + 0.6);
  if (w >= h) {
    g.fillStyle(shade(color, 0.85), 1);
    quad(g, cx, cy, angle, lx, ly - h / 4, w, h / 2);
    g.fillStyle(shade(color, 1.1), 1);
    quad(g, cx, cy, angle, lx, ly + h / 4, w, h / 2);
    g.lineStyle(0.25, shade(color, 0.6), 1);
    line(g, cx, cy, angle, lx - w / 2, ly, lx + w / 2, ly);
  } else {
    g.fillStyle(shade(color, 0.85), 1);
    quad(g, cx, cy, angle, lx - w / 4, ly, w / 2, h);
    g.fillStyle(shade(color, 1.1), 1);
    quad(g, cx, cy, angle, lx + w / 4, ly, w / 2, h);
    g.lineStyle(0.25, shade(color, 0.6), 1);
    line(g, cx, cy, angle, lx, ly - h / 2, lx, ly + h / 2);
  }
}

// Which side of a building faces its nearest road, in its local frame:
// [fx, fy] is a unit axis vector (one of +-x, +-y).
function frontSide(b, world) {
  if (!world) return [0, 1];
  let best = null;
  for (const r of world.roads) {
    const p = nearestOnPolyline(b.x, b.y, r.points);
    if (!best || p.d < best.d) best = p;
  }
  const q = worldToLocal(b.x, b.y, b.angle || 0, best.x, best.y);
  if (Math.abs(q.x) > Math.abs(q.y)) return [Math.sign(q.x), 0];
  return [0, Math.sign(q.y) || 1];
}

export function drawBuilding(gS, gO, gU, b, world = null) {
  const a = b.angle || 0;
  const h = hashString(b.id);

  if (b.kind === 'store') return drawStore(gS, gO, b, a, frontSide(b, world));
  if (b.kind === 'diner') return drawDiner(gS, gO, b, a, frontSide(b, world));
  if (b.kind === 'cabin') return drawCabin(gS, gO, b, a, frontSide(b, world), h);
  if (b.kind === 'shed') return drawShed(gS, gO, b, a, h);

  if (b.kind === 'gas') {
    const c = GAS.canopy;
    const s = GAS.shop;
    boxShadow(gS, b.x, b.y, a, s.lx, s.ly, s.w, s.h, 4);
    boxShadow(gS, b.x, b.y, a, c.lx, c.ly, c.w, c.h, 2.5);
    // Shop with flat roof.
    gO.fillStyle(0x6f6c66, 1);
    quad(gO, b.x, b.y, a, s.lx, s.ly, s.w + 0.4, s.h + 0.4);
    gO.fillStyle(0x8d8a84, 1);
    quad(gO, b.x, b.y, a, s.lx, s.ly, s.w - 0.6, s.h - 0.6);
    gO.fillStyle(0xcfcfcf, 1);
    quad(gO, b.x, b.y, a, s.lx + 3, s.ly + 0.5, 1.4, 1.2);
    // Pump islands on the ground.
    for (const isl of GAS.islands) {
      gO.fillStyle(0x9a9890, 1);
      quad(gO, b.x, b.y, a, isl.lx, isl.ly, isl.w, isl.h);
      gO.fillStyle(0xb3261e, 1);
      quad(gO, b.x, b.y, a, isl.lx - 1, isl.ly, 0.8, 0.8);
      quad(gO, b.x, b.y, a, isl.lx + 1, isl.ly, 0.8, 0.8);
    }
    // Canopy sits above the car (you can drive under it), slightly see-through.
    gU.fillStyle(0xc0392b, 0.95);
    quad(gU, b.x, b.y, a, c.lx, c.ly, c.w + 0.5, c.h + 0.5);
    gU.fillStyle(0xeceae3, 0.8);
    quad(gU, b.x, b.y, a, c.lx, c.ly, c.w - 0.5, c.h - 0.5);
    return;
  }

  if (b.kind === 'shop') {
    boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 5);
    gO.fillStyle(0x6f6d68, 1);
    quad(gO, b.x, b.y, a, 0, 0, b.w + 0.4, b.h + 0.4);
    gO.fillStyle(0x9c9a94, 1);
    quad(gO, b.x, b.y, a, 0, 0, b.w - 0.8, b.h - 0.8);
    gO.fillStyle(0xd2d2cc, 1);
    quad(gO, b.x, b.y, a, 3, -2, 2, 1.6);
    quad(gO, b.x, b.y, a, 3, 2.2, 1.4, 1.4);
    // Striped awning on the west (street) side.
    for (let i = 0; i < 8; i++) {
      gO.fillStyle(i % 2 ? 0xf2efe6 : 0x2f6f8f, 1);
      quad(gO, b.x, b.y, a, -b.w / 2 - 0.8, -b.h / 2 + 0.5 + (i + 0.5) * ((b.h - 1) / 8), 1.6, (b.h - 1) / 8);
    }
    return;
  }

  if (b.kind === 'barn') {
    boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 9);
    pitchedRoof(gO, b.x, b.y, a, 0, 0, b.w, b.h, 0xa8352b);
    // White trim along the eaves.
    gO.lineStyle(0.3, 0xf0ece2, 1);
    gO.strokePoints(rectCorners(b.x, b.y, a, 0, 0, b.w + 0.4, b.h + 0.4), true);
    // Cupola on the ridge.
    gO.fillStyle(0xf0ece2, 1);
    quad(gO, b.x, b.y, a, 0, 0, 2.6, 2.6);
    gO.fillStyle(0x6d6f73, 1);
    quad(gO, b.x, b.y, a, 0, 0, 2, 2);
    // Silo.
    const sp = localToWorld(b.x, b.y, a, b.w / 2 + SILO.dx, SILO.ly);
    circleShadow(gS, sp.x, sp.y, SILO.r, 14);
    gO.fillStyle(0x8f918e, 1);
    gO.fillCircle(sp.x, sp.y, SILO.r + 0.2);
    gO.fillStyle(0xbfc1bc, 1);
    gO.fillCircle(sp.x, sp.y, SILO.r - 0.2);
    gO.fillStyle(0xd9dbd5, 1);
    gO.fillCircle(sp.x + 0.6, sp.y + 0.3, SILO.r * 0.5);
    gO.fillStyle(0x7a7c78, 1);
    gO.fillCircle(sp.x, sp.y, 0.4);
    return;
  }

  // Houses and the farmhouse.
  const roof = b.kind === 'farmhouse' ? 0x5d6066 : ROOFS[h % ROOFS.length];
  boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, b.kind === 'farmhouse' ? 7 : 6);
  pitchedRoof(gO, b.x, b.y, a, 0, 0, b.w, b.h, roof);
  // Chimney.
  const cx = ((h >> 4) % 2 ? 1 : -1) * b.w * 0.25;
  const cy = ((h >> 6) % 2 ? 1 : -1) * b.h * 0.2;
  gO.fillStyle(0x7b5a4a, 1);
  quad(gO, b.x, b.y, a, cx, cy, 1, 1);
  gO.fillStyle(0x2a2420, 1);
  quad(gO, b.x, b.y, a, cx, cy, 0.5, 0.5);
  if (b.kind === 'farmhouse') {
    // Porch roof on the south side.
    gO.fillStyle(0x8a8c8f, 1);
    quad(gO, b.x, b.y, a, 0, b.h / 2 + 1.2, b.w * 0.7, 2.2);
  }
}

// Strip along one side of a building: [fx, fy] picks the side, `depth` is
// how far it sticks out, `inset` shrinks it along the side.
function sideStrip(g, b, a, f, depth, inset = 0, gap = 0) {
  const [fx, fy] = f;
  if (fx) quad(g, b.x, b.y, a, fx * (b.w / 2 + gap + depth / 2), 0, depth, b.h - inset);
  else quad(g, b.x, b.y, a, 0, fy * (b.h / 2 + gap + depth / 2), b.w - inset, depth);
}

// General store: flat tar roof, tall false front on the street side, porch.
function drawStore(gS, gO, b, a, f) {
  boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 6);
  gO.fillStyle(0x5d564c, 1);
  quad(gO, b.x, b.y, a, 0, 0, b.w + 0.4, b.h + 0.4);
  gO.fillStyle(0x7f776a, 1);
  quad(gO, b.x, b.y, a, 0, 0, b.w - 0.8, b.h - 0.8);
  gO.lineStyle(0.1, 0x6b6458, 1);
  for (let x = -b.w / 2 + 2; x < b.w / 2; x += 2) line(gO, b.x, b.y, a, x, -b.h / 2 + 0.5, x, b.h / 2 - 0.5);
  // Vent and skylight.
  gO.fillStyle(0x9a948a, 1);
  quad(gO, b.x, b.y, a, -b.w * 0.25, -b.h * 0.15, 1.2, 1.2);
  gO.fillStyle(0xbcd0d8, 1);
  quad(gO, b.x, b.y, a, b.w * 0.2, 0, 2, 1.4);
  // False front: a thick pale board wall standing up on the street side.
  gO.fillStyle(0xe2d6b4, 1);
  sideStrip(gO, b, a, f, 0.7, -0.6, -0.7);
  // Porch roof with posts, then barrels and a bench on the boardwalk.
  gO.fillStyle(0x8f6f4a, 1);
  sideStrip(gO, b, a, f, 2.6, 0.4, 0);
  gO.fillStyle(0xa98559, 1);
  sideStrip(gO, b, a, f, 2.2, 1.2, 0.2);
  const [fx, fy] = f;
  const along = fx ? b.h : b.w;
  gO.fillStyle(0x5a4029, 1);
  for (let t = -along / 2 + 1; t <= along / 2 - 1; t += (along - 2) / 3) {
    const lx = fx ? fx * (b.w / 2 + 2.4) : t;
    const ly = fx ? t : fy * (b.h / 2 + 2.4);
    quad(gO, b.x, b.y, a, lx, ly, 0.35, 0.35);
  }
  for (const k of [-1, 1]) {
    const lx = fx ? fx * (b.w / 2 + 3.4) : k * (along / 2 - 1.2);
    const ly = fx ? k * (along / 2 - 1.2) : fy * (b.h / 2 + 3.4);
    const p = localToWorld(b.x, b.y, a, lx, ly);
    gO.fillStyle(0x6b4a2a, 1);
    gO.fillCircle(p.x, p.y, 0.45);
    gO.fillStyle(0x8a6238, 1);
    gO.fillCircle(p.x, p.y, 0.3);
  }
}

// Diner in the old schoolhouse: pitched red roof, white bell cupola, a flat
// kitchen add-on at the back and a striped awning over the door.
function drawDiner(gS, gO, b, a, f) {
  const [fx, fy] = f;
  boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 7);
  // Kitchen add-on at the back.
  gO.fillStyle(0x6c6a66, 1);
  sideStrip(gO, b, a, [-fx, -fy], 4, b.w > b.h ? b.w * 0.45 : 2, -0.2);
  gO.fillStyle(0x8c8a84, 1);
  sideStrip(gO, b, a, [-fx, -fy], 3.4, b.w > b.h ? b.w * 0.5 : 2.6, 0);
  pitchedRoof(gO, b.x, b.y, a, 0, 0, b.w, b.h, 0x9a4434);
  // Cupola with a little four-sided roof.
  const c = 1.6;
  gO.fillStyle(0xf0ece2, 1);
  quad(gO, b.x, b.y, a, 0, 0, c * 2 + 0.4, c * 2 + 0.4);
  const faces = [
    [[-c, -c], [c, -c], 0.8], [[c, -c], [c, c], 1.15], [[c, c], [-c, c], 1.05], [[-c, c], [-c, -c], 0.75],
  ];
  for (const [p, q, k] of faces) {
    gO.fillStyle(shade(0x5a5f66, k), 1);
    poly(gO, b.x, b.y, a, [p, q, [0, 0]]);
  }
  // Exhaust hood on the kitchen roof.
  gO.fillStyle(0xb9bcbf, 1);
  quad(gO, b.x, b.y, a, -fx * (b.w / 2 + 1.8), -fy * (b.h / 2 + 1.8), 1.1, 1.1);
  // Red and white awning on the front.
  const n = 8;
  const along = fx ? b.h : b.w;
  for (let i = 0; i < n; i++) {
    gO.fillStyle(i % 2 ? 0xf2efe6 : 0xc0392b, 1);
    const t = -along * 0.35 + (i + 0.5) * ((along * 0.7) / n);
    const lx = fx ? fx * (b.w / 2 + 0.9) : t;
    const ly = fx ? t : fy * (b.h / 2 + 0.9);
    quad(gO, b.x, b.y, a, lx, ly, fx ? 1.8 : (along * 0.7) / n, fx ? (along * 0.7) / n : 1.8);
  }
  // Two picnic tables out front.
  for (const k of [-1, 1]) {
    const lx = fx ? fx * (b.w / 2 + 4) : k * along * 0.32;
    const ly = fx ? k * along * 0.32 : fy * (b.h / 2 + 4);
    gO.fillStyle(0x7a5a3a, 1);
    quad(gO, b.x, b.y, a, lx, ly, 1.8, 0.9);
    gO.fillStyle(0x5a4029, 1);
    quad(gO, b.x, b.y, a, lx, ly - 0.75, 1.8, 0.25);
    quad(gO, b.x, b.y, a, lx, ly + 0.75, 1.8, 0.25);
  }
}

// Log cabin: green tin roof with ribs, stone chimney at one gable, a porch
// and a woodpile.
function drawCabin(gS, gO, b, a, f, h) {
  const [fx, fy] = f;
  boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 5);
  // Log ends poking out at the corners.
  gO.fillStyle(0x8a6238, 1);
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = localToWorld(b.x, b.y, a, sx * (b.w / 2 + 0.25), sy * (b.h / 2 + 0.25));
    gO.fillCircle(p.x, p.y, 0.35);
  }
  // Porch boards on the front.
  gO.fillStyle(0x9a7a50, 1);
  sideStrip(gO, b, a, f, 2.2, 1.5, 0);
  pitchedRoof(gO, b.x, b.y, a, 0, 0, b.w, b.h, 0x4f6f4a);
  // Ribs across the roof, square to the ridge.
  gO.lineStyle(0.08, 0x3b5538, 1);
  if (b.w >= b.h) for (let x = -b.w / 2 + 0.7; x < b.w / 2; x += 0.7) line(gO, b.x, b.y, a, x, -b.h / 2, x, b.h / 2);
  else for (let y = -b.h / 2 + 0.7; y < b.h / 2; y += 0.7) line(gO, b.x, b.y, a, -b.w / 2, y, b.w / 2, y);
  // Stone chimney on the gable end away from the porch side.
  const gx = b.w >= b.h ? (fx ? -fx : (h % 2 ? 1 : -1)) * (b.w / 2 + 0.3) : 0;
  const gy = b.w >= b.h ? 0 : (fy ? -fy : 1) * (b.h / 2 + 0.3);
  const cp = localToWorld(b.x, b.y, a, gx, gy);
  circleShadow(gS, cp.x, cp.y, 0.8, 7);
  gO.fillStyle(0x7d7a72, 1);
  gO.fillCircle(cp.x, cp.y, 0.95);
  gO.fillStyle(0x9a978e, 1);
  gO.fillCircle(cp.x + 0.2, cp.y + 0.1, 0.6);
  gO.fillStyle(0x2a2420, 1);
  gO.fillCircle(cp.x, cp.y, 0.35);
  // Woodpile beside the cabin.
  const wp = localToWorld(b.x, b.y, a, (b.w / 2 + 1.2) * (fy ? 1 : 0) + (fx ? 0 : 0), (b.h / 2 + 1.2) * (fx ? 1 : 0));
  for (let i = 0; i < 6; i++) {
    gO.fillStyle(i % 2 ? 0x8a6238 : 0xa9784a, 1);
    gO.fillCircle(wp.x + (i % 3) * 0.45, wp.y + Math.floor(i / 3) * 0.45, 0.24);
  }
}

// Shed: single-slope corrugated tin roof, a few rust streaks.
function drawShed(gS, gO, b, a, h) {
  boxShadow(gS, b.x, b.y, a, 0, 0, b.w, b.h, 3.5);
  gO.fillStyle(0x6f7476, 1);
  quad(gO, b.x, b.y, a, 0, 0, b.w + 0.5, b.h + 0.5);
  gO.fillStyle(0xa3a9ab, 1);
  quad(gO, b.x, b.y, a, 0, 0, b.w, b.h);
  gO.fillStyle(0xb8bec0, 1);
  quad(gO, b.x, b.y, a, 0, b.h / 4, b.w, b.h / 2);
  gO.lineStyle(0.07, 0x7f8587, 1);
  for (let x = -b.w / 2 + 0.4; x < b.w / 2; x += 0.4) line(gO, b.x, b.y, a, x, -b.h / 2, x, b.h / 2);
  const rng = makeRng(h);
  for (let i = 0; i < 4; i++) {
    gO.fillStyle(0x9a5a33, 0.55);
    quad(gO, b.x, b.y, a, (rng() - 0.5) * b.w * 0.8, (rng() - 0.5) * b.h * 0.5, 0.5 + rng(), 1.5 + rng() * 2);
  }
  // A stack of pallets and a drum by the door.
  const p = localToWorld(b.x, b.y, a, b.w / 2 + 1.4, b.h / 2 - 1.5);
  gO.fillStyle(0xb08b5a, 1);
  gO.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
  gO.fillStyle(0x3a6a8a, 1);
  gO.fillCircle(p.x + 0.1, p.y + 1.6, 0.4);
}

// ---------- landmarks ----------

export function drawLandmark(gS, gO, gU, l, rng, world = null) {
  if (l.kind === 'grain_silos') drawGrainSilos(gS, gO, gU, l);
  else if (l.kind === 'lookout_tower') drawLookout(gS, gO, gU, l);
  else if (l.kind === 'covered_bridge') drawCoveredBridge(gS, gO, gU, l, world, rng);
  else if (l.kind === 'quarry') drawQuarry(gS, gO, l, world, rng);
  else if (l.kind === 'campground') drawCampground(gS, gO, l, rng);
  else if (l.kind === 'church') drawChurch(gS, gO, l, rng);
  else if (l.kind === 'water_tower') drawWaterTower(gS, gO, gU, l);
  else if (l.kind === 'mill_ruin') drawMill(gS, gO, l, rng);
  else if (l.kind === 'radio_mast') drawMast(gS, gO, l);
}

function drawChurch(gS, gO, l, rng) {
  const n = CHURCH.nave;
  const t = CHURCH.tower;
  // Churchyard: low stone wall and gravestones.
  gO.lineStyle(0.4, 0x9a958a, 1);
  gO.strokePoints(rectCorners(l.x, l.y, 0, 0, 2, 34, 40), true);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? -1 : 1;
    const gx = side * (9 + rng() * 6);
    const gy = -12 + rng() * 30;
    gO.fillStyle(0xb9b6ae, 1);
    quad(gO, l.x, l.y, 0, gx, gy, 0.6, 1.1);
  }
  boxShadow(gS, l.x, l.y, 0, n.lx, n.ly, n.w, n.h, 10);
  boxShadow(gS, l.x, l.y, 0, t.lx, t.ly, t.w, t.h, 24);
  pitchedRoof(gO, l.x, l.y, 0, n.lx, n.ly, n.w, n.h, 0x55585e);
  // Cross laid along the ridge at the far end.
  gO.fillStyle(0xd9c27a, 1);
  quad(gO, l.x, l.y, 0, 0, n.ly + 6, 0.6, 4);
  quad(gO, l.x, l.y, 0, 0, n.ly + 5, 2.6, 0.6);
  // Steeple: square tower with a four-sided spire.
  const hw = t.w / 2;
  const tx = t.lx;
  const ty = t.ly;
  gO.fillStyle(0x8a8478, 1);
  quad(gO, l.x, l.y, 0, tx, ty, t.w + 0.6, t.h + 0.6);
  const faces = [
    [[-hw, -hw], [hw, -hw], 0.75], [[hw, -hw], [hw, hw], 1.15],
    [[hw, hw], [-hw, hw], 1.05], [[-hw, hw], [-hw, -hw], 0.7],
  ];
  for (const [p, q, f] of faces) {
    gO.fillStyle(shade(0x4b4e55, f), 1);
    poly(gO, l.x, l.y, 0, [[tx + p[0], ty + p[1]], [tx + q[0], ty + q[1]], [tx, ty]]);
  }
  gO.fillStyle(0xe2cc80, 1);
  quad(gO, l.x, l.y, 0, tx, ty, 0.35, 1.8);
  quad(gO, l.x, l.y, 0, tx, ty - 0.3, 1.2, 0.35);
}

function drawWaterTower(gS, gO, gU, l) {
  const H = 22;
  const R = WATER_TOWER.tankR;
  // Shadow: thin legs plus the tank floating off to the side. This is what
  // makes it read as a tower and not a silo.
  const sx = SUN.x * H;
  const sy = SUN.y * H;
  gS.lineStyle(0.6, 0x000000, SHADOW_ALPHA);
  for (const [lx, ly] of WATER_TOWER.legs) gS.lineBetween(l.x + lx, l.y + ly, l.x + lx * 0.8 + sx, l.y + ly * 0.8 + sy);
  gS.fillStyle(0x000000, SHADOW_ALPHA);
  gS.fillCircle(l.x + sx * 1.1, l.y + sy * 1.1, R);
  // Legs and bracing (visible past the tank edge).
  gO.lineStyle(0.3, 0x4b4f52, 1);
  const L = WATER_TOWER.legs;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = L[i];
    const [bx, by] = L[(i + 1) % 4];
    gO.lineBetween(l.x + ax, l.y + ay, l.x + bx, l.y + by);
    gO.lineBetween(l.x + ax, l.y + ay, l.x + bx * 0.2, l.y + by * 0.2);
  }
  gO.fillStyle(0x3d4144, 1);
  for (const [lx, ly] of L) gO.fillCircle(l.x + lx, l.y + ly, WATER_TOWER.legR);
  // Tank up high, drawn above the car since you can drive between the legs.
  const tx = l.x + sx * 0.08;
  const ty = l.y + sy * 0.08;
  gU.fillStyle(0x5f7783, 1);
  gU.fillCircle(tx, ty, R + 0.35);
  gU.fillStyle(0x93aebb, 1);
  gU.fillCircle(tx, ty, R);
  gU.fillStyle(0xb7cdd6, 1);
  gU.fillCircle(tx + 1.2, ty + 0.5, R * 0.55);
  gU.lineStyle(0.12, 0x6c8693, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    gU.lineBetween(tx, ty, tx + Math.cos(a) * R, ty + Math.sin(a) * R);
  }
  gU.fillStyle(0x5f7783, 1);
  gU.fillCircle(tx, ty, 0.6);
}

function drawMill(gS, gO, l, rng) {
  // Scorched ground and ash.
  gO.fillStyle(0x4a4436, 1);
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 11 + rng() * 4;
    pts.push({ x: l.x + Math.cos(a) * r * 1.1, y: l.y + Math.sin(a) * r * 0.85 });
  }
  gO.fillPoints(pts, true);
  gO.fillStyle(0x34302a, 1);
  gO.fillEllipse(l.x - 1, l.y, 15, 11);
  // Rubble.
  for (let i = 0; i < 40; i++) {
    gO.fillStyle(rng() < 0.5 ? 0x7d756a : 0x5e574e, 1);
    gO.fillCircle(l.x + (rng() - 0.5) * 22, l.y + (rng() - 0.5) * 17, 0.2 + rng() * 0.45);
  }
  // Fallen charred beams.
  gO.fillStyle(0x1d1a17, 1);
  for (let i = 0; i < 6; i++) {
    const p = localToWorld(l.x, l.y, 0, (rng() - 0.5) * 12, (rng() - 0.5) * 9);
    quad(gO, p.x, p.y, rng() * 180, 0, 0, 0.45, 3 + rng() * 4);
  }
  // Standing walls: stone with blackened tops.
  for (const w of MILL.walls) {
    boxShadow(gS, l.x, l.y, 0, w.lx, w.ly, w.w, w.h, 3);
    gO.fillStyle(0x7a7166, 1);
    quad(gO, l.x, l.y, 0, w.lx, w.ly, w.w, w.h);
    gO.fillStyle(0x2c2824, 1);
    quad(gO, l.x, l.y, 0, w.lx, w.ly, Math.max(0.3, w.w - 0.7), Math.max(0.3, w.h - 0.7));
  }
  const c = MILL.chimney;
  boxShadow(gS, l.x, l.y, 0, c.lx, c.ly, c.w, c.h, 8);
  gO.fillStyle(0x6b5a4c, 1);
  quad(gO, l.x, l.y, 0, c.lx, c.ly, c.w, c.h);
  gO.fillStyle(0x111111, 1);
  quad(gO, l.x, l.y, 0, c.lx, c.ly, c.w * 0.5, c.h * 0.5);
  // An old millstone lying outside.
  const m = localToWorld(l.x, l.y, 0, 11, 5);
  gO.fillStyle(0x8f8a80, 1);
  gO.fillCircle(m.x, m.y, 1.4);
  gO.fillStyle(0x4a4436, 1);
  gO.fillCircle(m.x, m.y, 0.35);
}

function drawMast(gS, gO, l) {
  const H = 70;
  // Long thin shadow: the giveaway from a distance.
  gS.lineStyle(0.9, 0x000000, SHADOW_ALPHA + 0.05);
  gS.lineBetween(l.x, l.y, l.x + SUN.x * H, l.y + SUN.y * H);
  gS.fillStyle(0x000000, SHADOW_ALPHA + 0.05);
  gS.fillCircle(l.x + SUN.x * H, l.y + SUN.y * H, 0.8);
  // Fenced compound with a small equipment hut.
  gO.fillStyle(0x9a978e, 1);
  quad(gO, l.x, l.y, 0, 0, 0, 9, 9);
  gO.lineStyle(0.15, 0x56544e, 1);
  gO.strokePoints(rectCorners(l.x, l.y, 0, 0, 0, 9, 9), true);
  gO.fillStyle(0x6d6f73, 1);
  quad(gO, l.x, l.y, 0, 2.6, 2.6, 2.4, 2);
  // Guy wires to three anchor blocks.
  const anchors = anchorPoints(l);
  gO.lineStyle(0.08, 0xd8d8d8, 1);
  for (const p of anchors) gO.lineBetween(l.x, l.y, p.x, p.y);
  gO.fillStyle(0xa9a69c, 1);
  for (const p of anchors) gO.fillRect(p.x - RADIO_MAST.anchorR, p.y - RADIO_MAST.anchorR, RADIO_MAST.anchorR * 2, RADIO_MAST.anchorR * 2);
  // Lattice base: red and white triangle with a red light.
  const tri = (r) => [0, 120, 240].map((d) => ({ x: l.x + Math.sin(d * DEG) * r, y: l.y - Math.cos(d * DEG) * r }));
  gO.fillStyle(0xc0392b, 1);
  gO.fillPoints(tri(RADIO_MAST.baseR), true);
  gO.fillStyle(0xf2f2f2, 1);
  gO.fillPoints(tri(RADIO_MAST.baseR * 0.55), true);
  gO.fillStyle(0xff3b2f, 1);
  gO.fillCircle(l.x, l.y, 0.3);
}

// Calder grain silos: three corrugated bins and a tall elevator leg. The
// long shadows make them easy to spot.
function drawGrainSilos(gS, gO, gU, l) {
  const a = l.angle || 0;
  const leg = GRAIN.leg;
  const bins = GRAIN.bins.map((b) => ({ ...b, ...localToWorld(l.x, l.y, a, b.lx, b.ly) }));
  // Truck scale and a concrete apron.
  gO.fillStyle(0xa9a69e, 1);
  quad(gO, l.x, l.y, a, 2, 4, 38, 18);
  gO.fillStyle(0x7d7b75, 1);
  quad(gO, l.x, l.y, a, 2, 12.5, 16, 3.4);
  for (const b of bins) circleShadow(gS, b.x, b.y, b.r, GRAIN.binH);
  boxShadow(gS, l.x, l.y, a, leg.lx, leg.ly, leg.w, leg.h, GRAIN.legH);
  boxShadow(gS, l.x, l.y, a, GRAIN.office.lx, GRAIN.office.ly, GRAIN.office.w, GRAIN.office.h, 3.5);
  // Scale house.
  gO.fillStyle(0x6a6c6e, 1);
  quad(gO, l.x, l.y, a, GRAIN.office.lx, GRAIN.office.ly, GRAIN.office.w + 0.4, GRAIN.office.h + 0.4);
  gO.fillStyle(0x9b9fa2, 1);
  quad(gO, l.x, l.y, a, GRAIN.office.lx, GRAIN.office.ly, GRAIN.office.w - 0.4, GRAIN.office.h - 0.4);
  // Bins: ribbed steel cones, sunny side lighter.
  for (const b of bins) {
    gO.fillStyle(0x7f8381, 1);
    gO.fillCircle(b.x, b.y, b.r + 0.25);
    gO.fillStyle(0xb5b9b6, 1);
    gO.fillCircle(b.x, b.y, b.r);
    gO.fillStyle(0xd3d6d2, 1);
    gO.fillCircle(b.x + b.r * 0.22, b.y + b.r * 0.08, b.r * 0.62);
    gO.lineStyle(0.08, 0x8e928f, 1);
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      gO.lineBetween(b.x + Math.cos(t) * 0.7, b.y + Math.sin(t) * 0.7, b.x + Math.cos(t) * b.r, b.y + Math.sin(t) * b.r);
    }
    gO.fillStyle(0x6d716f, 1);
    gO.fillCircle(b.x, b.y, 0.7);
  }
  // Elevator leg up top, with spouts running down to each bin.
  const top = localToWorld(l.x, l.y, a, leg.lx, leg.ly);
  gU.lineStyle(0.3, 0x55585a, 1);
  for (const b of bins) gU.lineBetween(top.x, top.y, b.x, b.y);
  gU.fillStyle(0x7d776c, 1);
  quad(gU, l.x, l.y, a, leg.lx, leg.ly, leg.w + 0.5, leg.h + 0.5);
  gU.fillStyle(0xbfb6a2, 1);
  quad(gU, l.x, l.y, a, leg.lx, leg.ly, leg.w - 0.3, leg.h - 0.3);
  gU.fillStyle(0x8e3b2f, 1);
  quad(gU, l.x, l.y, a, leg.lx, leg.ly, leg.w * 0.5, leg.h * 0.5);
}

// Fire lookout on its hill: splayed legs, a zigzag stair and a glassed cab.
function drawLookout(gS, gO, gU, l) {
  const H = LOOKOUT.H;
  const sx = SUN.x * H;
  const sy = SUN.y * H;
  const c = LOOKOUT.cab / 2;
  // Shadow: legs narrowing to the cab, then the cab itself.
  gS.lineStyle(0.45, 0x000000, SHADOW_ALPHA);
  for (const [lx, ly] of LOOKOUT.legs) gS.lineBetween(l.x + lx, l.y + ly, l.x + lx * 0.5 + sx, l.y + ly * 0.5 + sy);
  gS.fillStyle(0x000000, SHADOW_ALPHA + 0.04);
  gS.fillRect(l.x + sx - c - 0.3, l.y + sy - c - 0.3, c * 2 + 0.6, c * 2 + 0.6);
  // Feet and bracing.
  gO.lineStyle(0.18, 0x4a4d50, 1);
  const L = LOOKOUT.legs;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = L[i];
    const [bx, by] = L[(i + 1) % 4];
    gO.lineBetween(l.x + ax, l.y + ay, l.x + bx, l.y + by);
    gO.lineBetween(l.x + ax, l.y + ay, l.x + bx * 0.55, l.y + by * 0.55);
    gO.lineBetween(l.x + ax, l.y + ay, l.x + ax * 0.55, l.y + ay * 0.55);
  }
  gO.fillStyle(0x35383b, 1);
  for (const [lx, ly] of L) gO.fillCircle(l.x + lx, l.y + ly, LOOKOUT.legR + 0.1);
  // Stairs zigzag up the middle.
  gO.lineStyle(0.3, 0x8a6a45, 1);
  for (let i = 0; i < 5; i++) {
    const y0 = l.y + 3 - i * 1.4;
    gO.lineBetween(l.x - 2.2 + (i % 2) * 4.4, y0, l.x + 2.2 - (i % 2) * 4.4, y0 - 1.4);
  }
  // Cab up high (above the car): windows round a hipped roof.
  const tx = l.x + sx * 0.06;
  const ty = l.y + sy * 0.06;
  gU.fillStyle(0x3d3a36, 1);
  gU.fillRect(tx - c - 0.5, ty - c - 0.5, c * 2 + 1, c * 2 + 1);
  gU.fillStyle(0x9cc3d3, 1);
  gU.fillRect(tx - c - 0.2, ty - c - 0.2, c * 2 + 0.4, c * 2 + 0.4);
  const faces = [
    [[-c, -c], [c, -c], 0.78], [[c, -c], [c, c], 1.15], [[c, c], [-c, c], 1.05], [[-c, c], [-c, -c], 0.72],
  ];
  for (const [p, q, k] of faces) {
    gU.fillStyle(shade(0x5d4a3a, k), 1);
    gU.fillPoints([{ x: tx + p[0] * 0.85, y: ty + p[1] * 0.85 }, { x: tx + q[0] * 0.85, y: ty + q[1] * 0.85 }, { x: tx, y: ty }], true);
  }
  gU.fillStyle(0xc0392b, 1);
  gU.fillCircle(tx, ty, 0.25);
}

// Covered bridge with its middle fallen into the river. Each bank end still
// stands (deck, red board walls, shingled roof), the roof sags and breaks at
// the gap, and roof panels and timbers lie in the water.
function drawCoveredBridge(gS, gO, gU, l, world, rng) {
  const bridge = world && world.bridges.find((b) => b.id === l.bridgeId);
  const P = coveredParts(l, bridge);
  const { cx, cy, a, W } = P;
  const deck = 0x7a5a3a;
  // Wreckage in the river first, under the standing ends.
  const span = P.L - 2 * P.stub;
  for (const k of [-1, 1]) {
    // Two roof panels half sunk, skewed and drifting downstream.
    const drift = 3 + rng() * 4;
    const ly = k * span * 0.22;
    const pts = [[-W / 2 - 0.5 + drift * 0.3, ly - k * span * 0.24], [W / 2 + 0.6 + drift, ly - k * span * 0.2], [W / 2 + drift * 1.2, ly + k * span * 0.18], [-W / 2 + drift * 0.6, ly + k * span * 0.24]];
    gO.fillStyle(0x4a3e34, 0.55);
    poly(gO, cx, cy, a, pts);
    gO.lineStyle(0.1, 0x2e2620, 0.6);
    for (let t = 0.2; t < 1; t += 0.2) {
      const p0 = [pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t];
      const p1 = [pts[3][0] + (pts[2][0] - pts[3][0]) * t, pts[3][1] + (pts[2][1] - pts[3][1]) * t];
      line(gO, cx, cy, a, p0[0], p0[1], p1[0], p1[1]);
    }
  }
  for (let i = 0; i < 12; i++) {
    const p = localToWorld(cx, cy, a, (rng() - 0.3) * W * 2, (rng() - 0.5) * span);
    gO.fillStyle(i % 3 ? 0x6e5234 : 0x8a3a2a, 0.85);
    quad(gO, p.x, p.y, rng() * 180, 0, 0, 0.4, 2 + rng() * 4);
  }
  for (const e of P.ends) {
    const { dir, outer, inner } = e;
    const lo = Math.min(outer, inner);
    const len = Math.abs(outer - inner);
    const mid = (outer + inner) / 2;
    boxShadow(gS, cx, cy, a, 0, mid, W + 0.6, len, 6);
    // Deck with a ragged broken end.
    const jag = [];
    for (let i = 0; i <= 6; i++) jag.push([-W / 2 + (W * i) / 6, inner + dir * (i % 2 ? 0.9 : -0.5) * (0.5 + rng())]);
    const pts = [[-W / 2, outer], [W / 2, outer], ...jag.reverse()];
    gO.fillStyle(deck, 1);
    poly(gO, cx, cy, a, pts);
    gO.lineStyle(0.1, 0x5e4329, 1);
    for (let y = lo + 0.8; y < lo + len; y += 0.8) {
      if (Math.abs(y - inner) < 1) continue;
      line(gO, cx, cy, a, -W / 2, y, W / 2, y);
    }
    // Board walls.
    gO.fillStyle(0x8a3a2a, 1);
    for (const w of e.walls) quad(gO, w.x, w.y, w.angle, 0, 0, w.w, w.h);
    // Barrier of red and white boards back from the edge.
    const br = e.barrier;
    const n = 6;
    for (let i = 0; i < n; i++) {
      gO.fillStyle(i % 2 ? 0xffffff : 0xc0392b, 1);
      quad(gO, br.x, br.y, br.angle, -br.w / 2 + (i + 0.5) * (br.w / n), 0, br.w / n, br.h);
    }
    // Roof up top: whole near the bank, torn and sagging toward the gap.
    const roofLen = len * 0.62;
    const roofMid = outer - dir * (roofLen / 2);
    gU.fillStyle(0x3f342c, 0.96);
    quad(gU, cx, cy, a, 0, roofMid, W + 1.2, roofLen);
    gU.fillStyle(0x56483c, 0.96);
    quad(gU, cx, cy, a, -W / 4 - 0.15, roofMid, W / 2 + 0.3, roofLen);
    gU.fillStyle(0x6b5a4a, 0.96);
    quad(gU, cx, cy, a, W / 4 + 0.15, roofMid, W / 2 + 0.3, roofLen);
    gU.lineStyle(0.2, 0x2a221c, 1);
    line(gU, cx, cy, a, 0, outer, 0, outer - dir * roofLen);
    // Gable trim at the portal.
    gU.lineStyle(0.3, 0xe8e2d4, 1);
    line(gU, cx, cy, a, -W / 2 - 0.6, outer, W / 2 + 0.6, outer);
    // Bare rafters sticking out past the torn edge.
    const edge = outer - dir * roofLen;
    gU.lineStyle(0.22, 0x5a4029, 1);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 5) {
      const reach = 1.5 + rng() * 3.5;
      line(gU, cx, cy, a, x, edge, x + (rng() - 0.5) * 1.2, edge - dir * reach);
    }
  }
}

// Quarry pit: stepped benches going down to a pool, a haul ramp opening
// toward the road, a boulder ring along the rim, gravel piles and a loader.
function drawQuarry(gS, gO, l, world, rng) {
  const R = l.r || 90;
  const open = world ? quarryOpening(world, l) : 180;
  const wob = (t) => 1 + 0.05 * Math.sin(3 * t + 1) + 0.035 * Math.sin(5 * t + 2.3) + 0.02 * Math.sin(9 * t);
  const ring = (k, ox = 0, oy = 0, n = 48) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push({ x: l.x + ox + Math.cos(t) * R * k * wob(t), y: l.y + oy + Math.sin(t) * R * k * wob(t) });
    }
    return pts;
  };
  const sunLen = Math.hypot(SUN.x, SUN.y);
  const ux = SUN.x / sunLen;
  const uy = SUN.y / sunLen;
  // Dusty rim, then each bench: shadow colour, then the sunlit floor nudged
  // away from the sun, leaving a dark wall on the sun side.
  gO.fillStyle(0xb9b09e, 1);
  gO.fillPoints(ring(QUARRY.terraces[0] + 0.07), true);
  QUARRY.terraces.forEach((k, i) => {
    const base = shade(0xb3a994, 1 - i * 0.07);
    gO.fillStyle(shade(base, 0.62), 1);
    gO.fillPoints(ring(k), true);
    gO.fillStyle(base, 1);
    gO.fillPoints(ring(k * 0.97, ux * 2.4, uy * 2.4), true);
    gO.lineStyle(0.25, shade(base, 1.18), 1);
    gO.strokePoints(ring(k * 0.97, ux * 2.4, uy * 2.4), true);
  });
  // Green pool at the bottom.
  gO.fillStyle(0x4f7f7a, 1);
  gO.fillPoints(ring(0.13, ux * 2, uy * 2, 24), true);
  gO.fillStyle(0x6a9a92, 1);
  gO.fillPoints(ring(0.08, ux * 2.6, uy * 2.6, 24), true);
  // Haul ramp from the rim opening down toward the floor.
  const oa = open * DEG;
  const rampPts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const ang = oa + t * 1.4; // curves round as it goes down
    const rr = R * (0.96 - t * 0.7);
    rampPts.push([l.x + Math.cos(ang) * rr, l.y + Math.sin(ang) * rr]);
  }
  thickPolyline(gO, rampPts, 7, 0xc8bea8);
  gO.lineStyle(0.3, 0xa79d88, 1);
  gO.strokePoints(rampPts.map(([x, y]) => ({ x, y })), false);
  // Loose rock.
  for (let i = 0; i < 90; i++) {
    const t = rng() * Math.PI * 2;
    const rr = R * (0.15 + rng() * 0.8);
    gO.fillStyle(rng() < 0.5 ? 0x8a8170 : 0xd0c7b2, 1);
    gO.fillCircle(l.x + Math.cos(t) * rr, l.y + Math.sin(t) * rr, 0.2 + rng() * 0.5);
  }
  // Gravel piles on the apron side of the rim.
  for (let i = 0; i < 3; i++) {
    const ang = oa + (i - 1) * 0.5;
    const rr = R * 1.05 + 6 + i * 3;
    const px = l.x + Math.cos(ang) * rr;
    const py = l.y + Math.sin(ang) * rr;
    const pr = 3.5 + i;
    circleShadow(gS, px, py, pr, 3);
    gO.fillStyle(0x8f8776, 1);
    gO.fillCircle(px, py, pr);
    gO.fillStyle(0xbdb4a0, 1);
    gO.fillCircle(px + pr * 0.25, py + pr * 0.1, pr * 0.65);
    gO.fillStyle(0xd6cdb8, 1);
    gO.fillCircle(px + pr * 0.35, py + pr * 0.12, pr * 0.25);
  }
  // A yellow loader parked on a lower bench.
  const la = oa + 2.2;
  const lp = { x: l.x + Math.cos(la) * R * 0.47, y: l.y + Math.sin(la) * R * 0.47 };
  const lh = (la * 180) / Math.PI;
  boxShadow(gS, lp.x, lp.y, lh, 0, 0, 2.6, 5, 3);
  gO.fillStyle(0x222222, 1);
  for (const [x, y] of [[-1.3, -1.4], [1.3, -1.4], [-1.3, 1.4], [1.3, 1.4]]) quad(gO, lp.x, lp.y, lh, x, y, 0.6, 1.2);
  gO.fillStyle(0xe0a91a, 1);
  quad(gO, lp.x, lp.y, lh, 0, 0.4, 2.4, 4);
  gO.fillStyle(0x2b3238, 1);
  quad(gO, lp.x, lp.y, lh, 0, 0.6, 1.5, 1.4);
  gO.fillStyle(0x7d7f80, 1);
  quad(gO, lp.x, lp.y, lh, 0, -2.6, 3.2, 0.9);
  // Boulder ring along the rim (these are solid).
  for (const b of quarryBoulders(l, open, world)) {
    circleShadow(gS, b.x, b.y, b.r, 1.5);
    gO.fillStyle(0x86807a, 1);
    gO.fillCircle(b.x, b.y, b.r);
    gO.fillStyle(0xaba59c, 1);
    gO.fillCircle(b.x + b.r * 0.25, b.y + b.r * 0.1, b.r * 0.55);
  }
}

// Campground: a dirt loop with tent pads, tents, picnic tables, a fire ring
// and a toilet hut. All of it sits north of the road.
function drawCampground(gS, gO, l, rng) {
  const lp = CAMP.loop;
  const loop = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    loop.push([l.x + lp.lx + Math.cos(t) * lp.rx, l.y + lp.ly + Math.sin(t) * lp.ry]);
  }
  thickPolyline(gO, loop, 4.2, 0xa48f68, true);
  thickPolyline(gO, loop, 3.2, 0xbca57c, true);
  // Spur down toward the road.
  thickPolyline(gO, [[l.x + 6, l.y + lp.ly + lp.ry - 1], [l.x + 6, l.y + 34]], 3.4, 0xbca57c);
  for (const p of CAMP.pads) {
    gO.fillStyle(0xb39a72, 1);
    quad(gO, l.x, l.y, 0, p.lx, p.ly, 6, 6);
    if (!p.tent) continue;
    const t = CAMP.tent;
    const at = localToWorld(l.x, l.y, 0, p.lx, p.ly);
    boxShadow(gS, at.x, at.y, 0, 0, 0, t.w, t.h, 1.4);
    gO.fillStyle(shade(p.tent, 0.8), 1);
    quad(gO, at.x, at.y, 0, -t.w / 4, 0, t.w / 2, t.h);
    gO.fillStyle(shade(p.tent, 1.12), 1);
    quad(gO, at.x, at.y, 0, t.w / 4, 0, t.w / 2, t.h);
    gO.lineStyle(0.1, shade(p.tent, 0.55), 1);
    gO.lineBetween(at.x, at.y - t.h / 2, at.x, at.y + t.h / 2);
  }
  for (const [lx, ly] of CAMP.tables) {
    const t = CAMP.table;
    boxShadow(gS, l.x, l.y, 0, lx, ly, t.w, t.h, 0.8);
    gO.fillStyle(0x6e5234, 1);
    quad(gO, l.x, l.y, 0, lx, ly - 0.75, t.w, 0.3);
    quad(gO, l.x, l.y, 0, lx, ly + 0.75, t.w, 0.3);
    gO.fillStyle(0x8f6c44, 1);
    quad(gO, l.x, l.y, 0, lx, ly, t.w, t.h);
  }
  // Fire ring: stones, ash and a half-burnt log.
  const f = localToWorld(l.x, l.y, 0, CAMP.fire.lx, CAMP.fire.ly);
  gO.fillStyle(0x3a332c, 1);
  gO.fillCircle(f.x, f.y, CAMP.fire.r);
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    gO.fillStyle(i % 2 ? 0x8a857c : 0x9f9a90, 1);
    gO.fillCircle(f.x + Math.cos(t) * CAMP.fire.r, f.y + Math.sin(t) * CAMP.fire.r, 0.3);
  }
  gO.fillStyle(0x1c1712, 1);
  quad(gO, f.x, f.y, 30, 0, 0, 0.3, 1.2);
  // Toilet hut.
  const h = CAMP.hut;
  boxShadow(gS, l.x, l.y, 0, h.lx, h.ly, h.w, h.h, 3);
  pitchedRoof(gO, l.x, l.y, 0, h.lx, h.ly, h.w, h.h, 0x5a6b4a);
  // Firewood and a water tap.
  gO.fillStyle(0x8a6238, 1);
  for (let i = 0; i < 5; i++) gO.fillCircle(l.x - 20 + i * 0.45, l.y - 28, 0.22);
  gO.fillStyle(0x6d7a85, 1);
  gO.fillCircle(l.x + 10, l.y - 2, 0.3);
}

// ---------- fields, fences, mailboxes, hills ----------

// Pasture: smoother, lighter grass with grazed patches. Crop: golden rows
// along the long side, with a few round bales.
function drawFieldGround(g, f, rng) {
  const pts = f.polygon.map(([x, y]) => ({ x, y }));
  const [mx, my] = centroid(f.polygon);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of f.polygon) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (f.kind === 'crop') {
    g.fillStyle(0xbfa75e, 1);
    g.fillPoints(pts, true);
    const alongX = maxX - minX >= maxY - minY;
    g.lineStyle(1, 0xa58e4a, 1);
    if (alongX) for (let y = minY + 1.5; y < maxY - 1; y += 3) g.lineBetween(minX + 1.5, y, maxX - 1.5, y);
    else for (let x = minX + 1.5; x < maxX - 1; x += 3) g.lineBetween(x, minY + 1.5, x, maxY - 1.5);
    for (let i = 0; i < 14; i++) {
      const x = minX + 8 + rng() * (maxX - minX - 16);
      const y = minY + 8 + rng() * (maxY - minY - 16);
      g.fillStyle(0x000000, SHADOW_ALPHA);
      g.fillCircle(x - 0.9, y - 0.3, 0.9);
      g.fillStyle(0xd8c27a, 1);
      g.fillCircle(x, y, 0.9);
      g.fillStyle(0xb79f58, 1);
      g.fillCircle(x, y, 0.35);
    }
    return;
  }
  g.fillStyle(0x6c9c4f, 1);
  g.fillPoints(pts, true);
  for (let i = 0; i < 70; i++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    g.fillStyle(rng() < 0.6 ? 0x76a657 : 0x5f8f45, 1);
    g.fillEllipse(x, y, 3 + rng() * 6, 2 + rng() * 4);
  }
  // A worn path to a water trough near the middle.
  g.fillStyle(0x8a8a5a, 1);
  g.fillEllipse(mx, my, 6, 4);
  g.fillStyle(0x7a7f80, 1);
  g.fillRect(mx - 1.4, my - 0.4, 2.8, 0.8);
  g.fillStyle(0x5a8db0, 1);
  g.fillRect(mx - 1.2, my - 0.25, 2.4, 0.5);
}

// Fence posts and two rails along each run, drawn into the objects layer of
// whichever chunk each piece falls in.
export function drawFences(world, at) {
  for (const f of fenceRuns(world)) {
    for (const run of f.runs) {
      for (let i = 0; i < run.length - 1; i++) {
        const p = run[i];
        const q = run[i + 1];
        const [gS, gO] = at(p.x, p.y);
        gS.lineStyle(0.12, 0x000000, SHADOW_ALPHA * 0.8);
        gS.lineBetween(p.x - 0.7, p.y - 0.23, q.x - 0.7, q.y - 0.23);
        gO.lineStyle(0.2, 0xc2a77e, 1);
        gO.lineBetween(p.x, p.y, q.x, q.y);
        if (i % 3 === 0) {
          gO.fillStyle(0x5a4630, 1);
          gO.fillRect(p.x - 0.16, p.y - 0.16, 0.32, 0.32);
        }
      }
      const e = run[run.length - 1];
      const [, gO] = at(e.x, e.y);
      gO.fillStyle(0x5a4630, 1);
      gO.fillRect(e.x - 0.16, e.y - 0.16, 0.32, 0.32);
    }
  }
}

// Mailbox: a post and a box whose door faces the road. No name is drawn.
export function drawMailbox(gS, gO, m) {
  const a = (m.facing || 0) + 180; // local -y points along facing after this turn
  gS.fillStyle(0x000000, SHADOW_ALPHA);
  quad(gS, m.x - 0.9, m.y - 0.3, a, 0, 0, 0.6, 1.1);
  gO.fillStyle(0x2f3236, 1);
  quad(gO, m.x, m.y, a, 0, 0, 0.6, 1.1);
  gO.fillStyle(0x9a9ea2, 1);
  quad(gO, m.x, m.y, a, -0.08, 0, 0.3, 1.0);
  // Red flag on one side.
  gO.fillStyle(0xc0392b, 1);
  quad(gO, m.x, m.y, a, 0.36, 0.15, 0.14, 0.5);
}

// ---------- signs and people ----------

export function drawSign(gS, gO, s) {
  const first = (s.lines[0] || '').toUpperCase();
  let board = 0xf0eee6;
  if (first.includes('BRIDGE OUT') || first.includes('CLOSED')) board = 0xe07b20;
  else if (s.lines.length === 1 || /^[A-Z .]+$/.test(s.lines[0] || '')) board = 0x2f6b45;
  const bw = 1.4 + Math.min(1.2, s.lines.length * 0.4);
  // Board runs across the reader's lane: at angle = facing its long side is
  // perpendicular to the reader's direction of travel, face toward them.
  const a = s.facing || 0;
  gS.fillStyle(0x000000, SHADOW_ALPHA);
  quad(gS, s.x - 1.2, s.y - 0.5, a, 0, -0.15, bw, 0.5);
  gO.fillStyle(0x4a3a28, 1);
  gO.fillCircle(s.x, s.y, 0.18);
  gO.fillStyle(0x222222, 1);
  quad(gO, s.x, s.y, a, 0, -0.15, bw + 0.16, 0.46);
  gO.fillStyle(board, 1);
  quad(gO, s.x, s.y, a, 0, -0.07, bw, 0.3);
}

const PEOPLE = [
  { shirt: 0x2f5f9f, hat: 0xb3261e },
  { shirt: 0xb84a3a, hat: 0xe0c050 },
  { shirt: 0x5d8a3a, hat: 0x3b3b3b },
];

export function drawLocal(gS, gO, l, i) {
  const look = PEOPLE[i % PEOPLE.length];
  gS.fillStyle(0x000000, SHADOW_ALPHA);
  gS.fillEllipse(l.x - 0.9, l.y - 0.3, 1.6, 0.8);
  if (/fish/i.test(l.role || '')) {
    // Fishing rod and a bucket.
    gO.lineStyle(0.06, 0x3a2a1a, 1);
    gO.lineBetween(l.x, l.y, l.x + 1.5, l.y - 3);
    gO.fillStyle(0x8a8f96, 1);
    gO.fillCircle(l.x + 0.9, l.y + 0.6, 0.3);
  }
  gO.fillStyle(look.shirt, 1);
  gO.fillEllipse(l.x, l.y, 1.0, 0.6);
  gO.fillStyle(0xe2b58f, 1);
  gO.fillCircle(l.x, l.y, 0.24);
  gO.fillStyle(look.hat, 1);
  gO.fillCircle(l.x, l.y - 0.05, 0.17);
}

