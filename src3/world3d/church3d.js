// The church (St. Anne's in Ashford, St. Luke's in Brandt), issue #59.
// Footprint from layout.js (CHURCH: nave and tower), front door on the
// tower's north face. Every piece goes into the shared batch, so the church
// adds no draw calls. Colours pick their textures (src3/look/surfaces.js):
// the walls and trim are 'concrete', Brandt's walls 'brick', the roof and
// spire 'shingles', the doors and louvers 'boards'.
//
// Local frame: x east, y south (back), up. Window and door pieces are built
// facing +z (south) and turned to their wall.

import * as THREE from 'three';
import { CHURCH } from '../../src/drive/layout.js';
import { box, cyl, pyramid, gable, strut } from './shapes.js';
import { outline, slab } from './roundShapes.js';

const FOUND = 1.5;
const GLASS = 0x34466e;
const DARK = 0x2a2a2a;
const WOOD = 0x5b3a2a; // door
const WOOD_DARK = 0x4a3420;
const LOUVER = 0x5a4630;
const WHITE = 0xf0ece2; // painted wood trim
const ROOF = 0x55585e;
const SPIRE = 0x4b4e55;
const GOLD = 0xd9c27a;
const IRON = 0x23262a;
const STEP = 0xb9b2a2;
const STONE_GREY = 0xb9b6ae; // gravestones

// St. Anne's: pale stone with darker stone trim. St. Luke's: red brick with pale stone trim.
const LOOKS = {
  church: { wall: 0xe4ded0, trim: 0xb9b2a2, plinth: 0x9a958a },
  b_church: { wall: 0xb84a3a, trim: 0xe4ded0, plinth: 0x9a958a },
};

// Which way each wall faces, as a turn of the +z pieces.
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

// An arch outline: w wide, h tall to the top of the round head, bottom at y0.
function arch(w, h, y0 = 0) {
  const r = w / 2;
  return outline([[-r, y0], [r, y0], { arc: [0, h - r, r, 0, Math.PI] }]);
}

// Frame round an arched opening: outer arch with the opening cut out.
function archFrame(w, h, f, depth) {
  const s = arch(w + 2 * f, h + f, -0.05);
  s.holes.push(arch(w, h, 0));
  return slab(s, depth, 0, 'xy', 0, 6); // no bevel: a bevelled extrude fills the hole back in
}

// Pieces of one part, built once and shared by every copy: [geo, colour, x, y, z, rotX].
const kitCache = new Map();
function kit(name, make) {
  if (!kitCache.has(name)) kitCache.set(name, make());
  return kitCache.get(name);
}

// Tall arched window: stone frame standing proud of the wall, glass set
// back in it, a white mullion and transom, a deep sill.
function windowKit(w, h) {
  return kit(`win:${w}:${h}`, () => {
    const f = 0.22;
    const fd = 0.34;
    const spring = h - w / 2;
    return [
      [archFrame(w, h, f, fd), 'trim', 0, 0, 0],
      [slab(arch(w, h, 0), 0.04, 0, 'xy', 0.02, 6), GLASS, 0, 0, 0],
      [box(0.07, spring, 0.06), WHITE, 0, 0, 0.06],
      [box(w, 0.07, 0.06), WHITE, 0, spring * 0.55, 0.06],
      [box(w, 0.07, 0.06), WHITE, 0, spring, 0.06],
      [box(0.06, w / 2, 0.06), WHITE, 0, spring, 0.06],
      [box(w + 2 * f + 0.2, 0.14, fd + 0.18), 'trim', 0, -0.17, 0.09],
    ];
  });
}

// Belfry opening: arched frame, dark inside, wooden louvers tipped down and out.
function belfryKit(w, h) {
  return kit(`belfry:${w}:${h}`, () => {
    const f = 0.25;
    const fd = 0.4;
    const parts = [
      [archFrame(w, h, f, fd), 'trim', 0, 0, 0],
      [slab(arch(w, h, 0), 0.04, 0, 'xy', 0.02, 6), DARK, 0, 0, 0],
      [box(w + 2 * f + 0.2, 0.16, fd + 0.2), 'trim', 0, -0.2, 0.1],
    ];
    const spring = h - w / 2;
    for (let y = 0.25; y < spring + 0.2; y += 0.3) {
      parts.push([new THREE.BoxGeometry(w - 0.04, 0.05, 0.34), LOUVER, 0, y, 0.12, 0.65]);
    }
    return parts;
  });
}

// Arched double door with panels, in a deep stone surround under a little gabled hood.
function doorKit(w, h) {
  return kit(`door:${w}:${h}`, () => {
    const f = 0.38;
    const fd = 0.5;
    const spring = h - w / 2;
    const parts = [
      [archFrame(w, h, f, fd), 'trim', 0, 0, 0],
      [slab(arch(w, h, 0), 0.08, 0, 'xy', 0.04, 6), WOOD, 0, 0, 0],
      [box(0.05, h - 0.05, 0.05), WOOD_DARK, 0, 0, 0.1],
      [new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6).rotateX(Math.PI / 2), GOLD, -0.12, 1.1, 0.12],
      [new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6).rotateX(Math.PI / 2), GOLD, 0.12, 1.1, 0.12],
      [gable(w + 2 * f + 0.3, 0.5, 0.5), 'trim', 0, h + f + 0.02, 0.22],
    ];
    // Two raised panels on each leaf.
    for (const sx of [-1, 1]) {
      for (const [y, ph] of [[0.25, 0.9], [1.35, spring - 1.45]]) {
        parts.push([box(w / 2 - 0.3, ph, 0.04), WOOD_DARK, sx * w / 4, y, 0.1]);
      }
    }
    return parts;
  });
}

// Round window in the east gable: a ring of stone, glass and eight spokes.
function roseKit(r) {
  return kit(`rose:${r}`, () => {
    const ring = new THREE.Shape().absarc(0, 0, r + 0.28, 0, Math.PI * 2, false);
    ring.holes.push(new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2, true));
    const parts = [
      [slab(ring, 0.34, 0, 'xy', 0, 10), 'trim', 0, 0, 0],
      [new THREE.CircleGeometry(r, 16), 0x5a3248, 0, 0, 0.03],
      [new THREE.CircleGeometry(r * 0.35, 12), GLASS, 0, 0, 0.05],
    ];
    for (let i = 0; i < 4; i++) {
      parts.push([new THREE.BoxGeometry(2 * r, 0.07, 0.06).rotateZ((i * Math.PI) / 4), WHITE, 0, 0, 0.07]);
    }
    return parts;
  });
}

// A cross with bevelled edges, foot at y = 0.
function crossGeo(h, arm, t, depth) {
  return kit(`cross:${h}`, () => {
    const a = t / 2;
    const y1 = h * 0.6;
    const y2 = y1 + t;
    const s = outline([[-a, 0], [a, 0], [a, y1], [arm / 2, y1], [arm / 2, y2], [a, y2], [a, h], [-a, h],
      [-a, y2], [-arm / 2, y2], [-arm / 2, y1], [-a, y1]]);
    return slab(s, depth, depth * 0.25, 'xy', 0, 2);
  });
}

// A sloped cap: w out from the wall (+x), h tall at the wall, d along it,
// falling to nothing at its outer edge.
function wedge(w, h, d) {
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(0, h)]);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

// Corner stones (quoins): long and short blocks in turn up a corner, standing a little proud.
// (ix, iy): which way is inward from the corner along x and y.
function quoins(P, x, y, ix, iy, top, color) {
  for (let up = 0.6, k = 0; up < top - 0.4; up += 0.62, k++) {
    const long = k % 2 === 0;
    const a = long ? 0.9 : 0.55;
    const b = long ? 0.55 : 0.9;
    P(box(a, 0.56, 0.12), x + ix * (a / 2 - 0.06), y - iy * 0.03, up, color, { cast: false });
    P(box(0.12, 0.56, b), x - ix * 0.03, y + iy * (b / 2 - 0.06), up, color, { cast: false });
  }
}

export function buildChurch(terrain, batch, l, rng) {
  const base = terrain.heightAt(l.x, l.y);
  const look = LOOKS[l.id] || LOOKS.church;
  const col = (c) => (c === 'trim' ? look.trim : c);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, 0, lx, ly, up, col(color), opts);
  const turn = new THREE.Matrix4();
  const off = new THREE.Matrix4();
  const tip = new THREE.Matrix4();
  // Place a kit on a wall: (lx, ly) on the wall face, sill at up, facing side.
  const K = (parts, lx, ly, up, side) => {
    turn.makeRotationY(FACE[side]);
    for (const [geo, color, x, y, z, rx = 0] of parts) {
      const m = turn.clone().multiply(off.makeTranslation(x, y, z)).multiply(tip.makeRotationX(rx));
      P(geo, lx, ly, up, color, { extra: m, cast: false });
    }
  };
  const A = batch.audit;
  const n = CHURCH.nave;
  const t = CHURCH.tower;
  if (A) {
    A.rect(l.id, 'church', l.x + n.lx, l.y + n.ly, n.w, n.h, 0, base - FOUND, base);
    A.rect(l.id, 'church', l.x + t.lx, l.y + t.ly, t.w, t.h, 0, base - FOUND, base);
  }
  const N = { x0: n.lx - n.w / 2, x1: n.lx + n.w / 2, y0: n.ly - n.h / 2, y1: n.ly + n.h / 2 };
  const T = { x0: t.lx - t.w / 2, x1: t.lx + t.w / 2, y0: t.ly - t.h / 2, y1: t.ly + t.h / 2 };
  const WALL = 7;
  const TOWER = 17;

  // ---- Nave: walls on a stone plinth, a cornice under the eaves.
  P(box(n.w, WALL + FOUND, n.h), n.lx, n.ly, -FOUND, look.wall);
  P(box(n.w + 0.24, 0.8 + FOUND, n.h + 0.24), n.lx, n.ly, -FOUND, look.plinth);
  P(box(n.w + 0.3, 0.1, n.h + 0.3), n.lx, n.ly, 0.8, 'trim', { cast: false });
  P(box(n.w + 0.36, 0.28, n.h + 0.2), n.lx, n.ly, WALL - 0.3, 'trim');
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    if (sy < 0) continue; // the tower hides the west corners
    quoins(P, sx * n.w / 2, sy < 0 ? N.y0 : N.y1, -sx, -sy, WALL, 'trim');
  }
  // Roof: overhanging gable, white fascia and verge boards, a ridge cap.
  const rw = n.w + 1.0;
  const rl = n.h + 0.9;
  const rh = 6;
  P(gable(rw, rl, rh), n.lx, n.ly + 0.2, WALL, ROOF);
  for (const sx of [-1, 1]) P(box(0.12, 0.36, rl), sx * (rw / 2 - 0.02), n.ly + 0.2, WALL - 0.3, WHITE, { cast: false });
  const slope = Math.atan2(rh, rw / 2);
  const run = Math.hypot(rh, rw / 2);
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationZ(-sx * slope);
    P(new THREE.BoxGeometry(run + 0.15, 0.4, 0.16), sx * rw / 4, n.ly + 0.2 + rl / 2 + 0.02, WALL + rh / 2 - 0.1, WHITE, { extra: m, cast: false });
  }
  P(new THREE.BoxGeometry(0.3, 0.22, rl).rotateZ(Math.PI / 4), n.lx, n.ly + 0.2, WALL + rh - 0.02, SPIRE, { cast: false });

  // Buttresses between the windows, stepped caps; arched windows between them.
  const win = windowKit(1.2, 3.4);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'w' : 'e';
    for (let y = N.y0 + 3; y < N.y1 - 1; y += 4) K(win, sx * n.w / 2, y, 2.1, side);
    for (let y = N.y0 + 5; y < N.y1 - 1; y += 4) {
      // Two stages, each with a sloped stone cap. Wedges face +x; the west ones turn round.
      const flip = sx < 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null;
      const wx = sx * n.w / 2;
      P(box(0.7, 3.0 + FOUND, 0.8), wx + sx * 0.35, y, -FOUND, look.wall);
      P(box(0.82, 0.8 + FOUND, 0.92), wx + sx * 0.35, y, -FOUND, look.plinth);
      P(box(0.88, 0.1, 0.98), wx + sx * 0.35, y, 0.8, 'trim', { cast: false });
      P(wedge(0.72, 0.5, 0.84), wx, y, 3.0, 'trim', { extra: flip });
      P(box(0.4, 1.9, 0.7), wx + sx * 0.2, y, 3.0, look.wall);
      P(wedge(0.42, 0.45, 0.74), wx, y, 4.9, 'trim', { extra: flip });
    }
  }
  // East end: a tall window under a round window in the gable, a cross on the peak.
  K(win, n.lx, N.y1, 2.1, 's');
  K(roseKit(1.05), n.lx, N.y1, 9.4, 's');
  P(crossGeo(1.5, 0.9, 0.18, 0.16), n.lx, N.y1 + 0.3, WALL + rh - 0.1, GOLD);

  // ---- Tower: plinth, string courses, corner stones, door, small windows, belfry.
  P(box(t.w, TOWER + FOUND, t.h), t.lx, t.ly, -FOUND, look.wall);
  P(box(t.w + 0.24, 0.8 + FOUND, t.h + 0.24), t.lx, t.ly, -FOUND, look.plinth);
  for (const [up, th, out] of [[0.8, 0.1, 0.3], [7.6, 0.26, 0.3], [12.6, 0.3, 0.36]]) {
    P(box(t.w + out, th, t.h + out), t.lx, t.ly, up, 'trim', { cast: false });
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) quoins(P, t.lx + sx * t.w / 2, t.ly + sy * t.h / 2, -sx, -sy, TOWER, 'trim');
  // Cornice in two steps under the spire.
  P(box(t.w + 0.4, 0.45, t.h + 0.4), t.lx, t.ly, TOWER - 0.05, 'trim');
  P(box(t.w + 0.75, 0.22, t.h + 0.75), t.lx, t.ly, TOWER + 0.35, 'trim');
  const DOOR_UP = 0.5;
  K(doorKit(1.9, 3.2), t.lx, T.y0, DOOR_UP, 'n');
  const small = windowKit(0.8, 2.0);
  K(small, t.lx, T.y0, 8.6, 'n');
  K(small, T.x0, t.ly, 8.6, 'w');
  K(small, T.x1, t.ly, 8.6, 'e');
  const bel = belfryKit(1.6, 3.0);
  K(bel, t.lx, T.y0, 13.3, 'n');
  K(bel, t.lx, T.y1, 13.3, 's');
  K(bel, T.x0, t.ly, 13.3, 'w');
  K(bel, T.x1, t.ly, 13.3, 'e');

  // ---- Spire: eight sided, corner pinnacles, a louvered dormer on each face, ball and cross.
  const S0 = TOWER + 0.55;
  const SH = 14;
  const SR = 3.05;
  P(cyl(SR / Math.cos(Math.PI / 8), SH, 8, 0.05).rotateY(Math.PI / 8), t.lx, t.ly, S0, SPIRE);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = t.lx + sx * (t.w / 2 - 0.15);
    const py = t.ly + sy * (t.h / 2 - 0.15);
    P(box(0.6, 1.1, 0.6), px, py, S0, 'trim');
    P(pyramid(0.75, 1.8), px, py, S0 + 1.1, SPIRE);
    P(new THREE.SphereGeometry(0.1, 6, 4), px, py, S0 + 2.95, GOLD, { cast: false });
  }
  const dh = 1.6; // dormer sits this high up the spire
  const dr = SR * (1 - (dh + 0.6) / SH);
  for (const side of ['n', 'e', 's', 'w']) {
    const a = FACE[side];
    const ox = Math.sin(a) * dr;
    const oy = Math.cos(a) * dr;
    const r = new THREE.Matrix4().makeRotationY(a);
    P(box(1.0, 1.3, 1.2), t.lx + ox, t.ly + oy, S0 + dh, SPIRE, { extra: r });
    P(box(0.7, 0.9, 0.06), t.lx + ox + Math.sin(a) * 0.6, t.ly + oy + Math.cos(a) * 0.6, S0 + dh + 0.15, DARK, { extra: r, cast: false });
    for (let k = 0; k < 3; k++) {
      const lr = r.clone().multiply(new THREE.Matrix4().makeRotationX(0.6));
      P(new THREE.BoxGeometry(0.66, 0.04, 0.2), t.lx + ox + Math.sin(a) * 0.66, t.ly + oy + Math.cos(a) * 0.66, S0 + dh + 0.35 + k * 0.27, LOUVER, { extra: lr, cast: false });
    }
    P(gable(1.25, 1.35, 0.7), t.lx + ox, t.ly + oy, S0 + dh + 1.3, SPIRE, { extra: r });
  }
  const top = S0 + SH;
  P(new THREE.SphereGeometry(0.28, 10, 6), t.lx, t.ly, top + 0.15, GOLD);
  P(crossGeo(2.6, 1.4, 0.24, 0.22), t.lx, t.ly, top + 0.35, GOLD);

  // ---- Front steps up to the door with an iron rail each side.
  const sw = 3.4;
  const fy = T.y0; // door face
  const g = terrain.groundRange({ rect: { x: l.x + t.lx, y: l.y + fy - 1.1, w: sw + 0.4, h: 2.2, angle: 0 } });
  const below = Math.min(-1, g.min - base - 0.3);
  const land = 1.3;
  P(box(sw, DOOR_UP - below, land), t.lx, fy - land / 2, below, STEP);
  const steps = [[DOOR_UP * 2 / 3, land + 0.18], [DOOR_UP / 3, land + 0.53]];
  for (const [h, d] of steps) P(box(sw, h - below, 0.36), t.lx, fy - d, below, STEP);
  if (A) A.rect(l.id, 'church_steps', l.x + t.lx, l.y + fy - 1.05, sw, 2.1, 0, base + below, base);
  const RAIL = 0.92;
  const v = (x, y, up) => new THREE.Vector3(x, up, y);
  const yA = fy - 0.25;
  const yB = fy - land + 0.1;
  const yC = fy - land - 0.68;
  for (const sx of [-1, 1]) {
    const x = t.lx + sx * (sw / 2 - 0.12);
    const pts = [[yA, DOOR_UP], [yB, DOOR_UP], [yC, DOOR_UP / 3]];
    for (const [y, up] of pts) P(cyl(0.035, RAIL, 6), x, y, up, IRON, { cast: false });
    const rail = [v(x, yA, DOOR_UP + RAIL), v(x, yB, DOOR_UP + RAIL), v(x, yC, DOOR_UP / 3 + RAIL)];
    const mat = new THREE.Matrix4().makeTranslation(l.x, base, l.y);
    for (let i = 0; i < rail.length - 1; i++) batch.add(strut(rail[i], rail[i + 1], 0.03, 6), mat, IRON, { cast: false });
    // Knob at the foot of the rail.
    P(new THREE.SphereGeometry(0.05, 6, 4), x, yC, DOOR_UP / 3 + RAIL, IRON, { cast: false });
  }

  // ---- Gravestones either side of the nave. Same rng draws as before (the
  // shared rng feeds the landmarks after this one); the shape comes from i.
  const round = kit('stone:round', () => slab(arch(0.7, 0.95, 0), 0.2, 0.04, 'xy', 0, 4));
  const cross = kit('stone:cross', () => slab(outline([[-0.09, 0], [0.09, 0], [0.09, 0.62], [0.3, 0.62], [0.3, 0.8],
    [0.09, 0.8], [0.09, 1.05], [-0.09, 1.05], [-0.09, 0.8], [-0.3, 0.8], [-0.3, 0.62], [-0.09, 0.62]]), 0.16, 0.03, 'xy', 0, 2));
  const plain = box(0.7, 0.9, 0.2);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? -1 : 1;
    const gx = side * (9 + rng() * 6);
    const gy = -12 + rng() * 30;
    const tilt = new THREE.Matrix4().makeRotationZ((rng() - 0.5) * 0.2);
    const k = (i * 7) % 5;
    const geo = k < 3 ? round : k === 3 ? cross : plain;
    batch.place(geo, l.x, l.y, base, 0, gx, gy, k === 3 ? -0.1 : 0, k === 4 ? 0x9a9890 : STONE_GREY, { cast: false, extra: tilt });
    if (k !== 3) batch.place(box(0.8, 0.12, 0.3), l.x, l.y, base, 0, gx, gy, -0.08, 0x9a9890, { cast: false });
    if (A) A.rect(l.id, 'gravestone', l.x + gx, l.y + gy, 0.7, 0.2, 0, base, base + 0.4);
  }
}
