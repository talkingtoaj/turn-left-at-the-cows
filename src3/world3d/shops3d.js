// Main street shops (#70, SPEC 9r): Millbrook's brick block on Church
// Street (m_h3), Calder's feed store (c_feed) and Brandt's store (br_store).
// Two kinds: a brick block (one or two stories, a pressed-metal cornice on
// corbels, stone sills and lintels) and a painted-board store behind a tall
// false front with a bracketed cornice and a low pediment. Both get the same
// storefront: pilasters, panelled bulkheads, big display windows with
// transoms, a door set back in a tiled entry, a blank sign band, and a
// striped canvas awning that sags a little between its iron arms. The sign
// band and the glass carry no words (line review first, SPEC 9o).
//
// Everything goes into the shared batch: no draw calls of its own. The
// footprint (and what you hit) is still b.w x b.h; the store front faces
// the nearest road (side, from structures.js).
//
// Frame used here: the building turned so its front faces -y. x runs across
// the front (W wide), y runs back (D deep), the front wall is at y = -D/2.
// In geometry built by hand (the awning, the roof), z is that y.

import * as THREE from 'three';
import { hashString } from '../../src/drive/geom.js';
import { box, cyl, strut } from './shapes.js';
import { outline, slab, poly, uprightSlab } from './roundShapes.js';

const FOUND = 1.5;
const GLASS = 0x2c3a46;
const SHOWGLASS = 0x4d6676; // the big display windows: lighter, they catch the sky
const DOOR = 0x5b3a2a; // boards
const BRASS = 0xc8a24a;
const IRON = 0x2a2a28;
const STONE = 0xb9b2a2; // concrete: sills, lintels, coping
const TILE = 0x8a8984; // concrete: the entry floor
const TIN = 0x6a6f72; // tin
const TAR = 0x6f6d68; // tin: the flat roofs
const NC = { cast: false, share: true };
// A small upright slab: two points a corner and a thin bevel, about 60
// triangles where the full one (big walls) is about 190.
const U = (w, d, h, r = 0.03) => uprightSlab(w, d, h, r, 0.012, 2);

// Colours chosen off the texture table (look/surfaces.js) where a piece should
// stay plain paint: trim, storefronts, canvas.
const LOOK = {
  m_h3: { style: 'brick', stories: 2, wall: 0xb84a3a, store: 0x5e8466, sign: 0x2f4a3a, cornice: 0xe8dcc0, awning: [0xb03c30, 0xf6f0e0] },
  c_feed: { style: 'boards', wall: 0xe6d9a8, store: 0x8c3b2e, sign: 0x5a2620, cornice: 0xf4f2ec, awning: [0x2f6b45, 0xf6f0e0] },
  br_store: { style: 'brick', stories: 1, wall: 0xc9b28f, store: 0x3f6e8c, sign: 0x2a3f5a, cornice: STONE, awning: [0x2f6f8f, 0xf6f0e0] },
};
const LOOKS = Object.values(LOOK);

const SH = 3.1; // top of the storefront (transoms)
const BAND = 0.75; // sign band over it
const ALC = 1.0; // how far the door is set back
const AW = 1.9; // width of the entry

// side: 'n' | 's' | 'e' | 'w', the side of the footprint toward the road.
export function buildShop(b, base, batch, side) {
  const look = LOOK[b.id] || LOOKS[hashString(b.id) % LOOKS.length];
  const turn = { n: 0, e: 90, s: 180, w: 270 }[side] ?? 270;
  const sideways = side === 'e' || side === 'w';
  const W = sideways ? b.h : b.w;
  const D = sideways ? b.w : b.h;
  const a = (b.angle || 0) + turn;
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, base, a, lx, ly, up, color, opts);
  const F = -D / 2;
  const brick = look.style === 'brick';
  const H = brick ? (look.stories === 2 ? 7.2 : 4.5) : 4.0; // eaves / roof line
  const PT = brick ? H + 0.5 : H; // top of the side walls
  const FT = brick ? H + 1.0 : H; // top of the front wall (boards: the false front is separate)
  const S = { P, W, D, F, H, look };

  // ---- Body: the main block behind the entry, and the front either side of
  // the entry and over it, so the doorway is a real recess.
  P(uprightSlab(W, D - ALC, PT + FOUND, 0.05), 0, ALC / 2, -FOUND, look.wall);
  const bw = (W - AW) / 2;
  for (const s of [-1, 1]) P(uprightSlab(bw, ALC + 0.1, FT + FOUND, 0.04), s * (AW / 2 + bw / 2), F + ALC / 2 + 0.05, -FOUND, look.wall);
  P(box(AW, FT - SH, ALC + 0.1), 0, F + ALC / 2 + 0.05, SH, look.wall);
  P(box(W - 0.3, 0.12, D - 0.3), 0, 0, -0.02, TILE, NC); // floor showing in the entry

  storefront(S);
  awning(S);
  if (brick) brickBlock(S);
  else boardStore(S);
  sidesAndBack(S, brick ? PT : H);
}

// ---------------------------------------------------------------- parts

// A framed window w x h, bottom at up, in a wall whose outside faces n
// ('-y' | '+y' | '-x' | '+x') at (cx, cy) on the wall face. A casing stands
// proud, the sash and glass sit back inside it, a meeting rail splits upper
// and lower sash, then a sill and a head (stone lintel with a keystone on
// brick, a drip cap on boards).
export function framedWindow(P, cx, cy, n, w, h, up, o) {
  const alongX = n === '-y' || n === '+y';
  const out = n[0] === '-' ? -1 : 1;
  const B = (aa, hh, dep) => (alongX ? box(aa, hh, dep) : box(dep, hh, aa));
  const at = (t, off) => (alongX ? [cx + t, cy + out * off] : [cx + out * off, cy + t]);
  const f = 0.12;
  P(B(w, h, 0.04), ...at(0, 0.0), up, GLASS, NC);
  // Sash: thin bars just in front of the glass, set back from the casing.
  P(B(w, 0.06, 0.06), ...at(0, 0.02), up + h / 2 - 0.03, o.sash, NC);
  P(B(0.04, h, 0.05), ...at(0, 0.02), up, o.sash, NC);
  // Casing standing proud.
  P(B(w + 2 * f, f, 0.16), ...at(0, 0.04), up + h, o.frame, NC);
  P(B(w + 2 * f, f, 0.14), ...at(0, 0.04), up - f, o.frame, NC);
  for (const s of [-1, 1]) P(B(f, h, 0.16), ...at(s * (w / 2 + f / 2), 0.04), up, o.frame, NC);
  P(B(w + 0.36, 0.09, 0.26), ...at(0, 0.1), up - f - 0.09, o.sill ?? STONE); // sill
  if (o.lintel) {
    P(B(w + 0.5, 0.26, 0.14), ...at(0, 0.06), up + h + f, o.lintel);
    P(B(0.22, 0.34, 0.18), ...at(0, 0.08), up + h + f - 0.02, o.lintel, NC); // keystone
  } else {
    P(B(w + 0.36, 0.07, 0.24), ...at(0, 0.1), up + h + f, o.frame, NC); // drip cap
  }
}

// A flat raised panel facing -y: w x h, t proud, bottom at 0.
const raised = (w, h, t) => slab(outline([[-w / 2, 0, 0.02], [w / 2, 0, 0.02], [w / 2, h, 0.02], [-w / 2, h, 0.02]]), t, 0, 'xy', 0, 2);

// ---- Storefront: pilasters at the ends, a display window each side of the
// entry on a panelled bulkhead, transoms over them, the set-back door with
// glass sidelights in the entry walls, and the sign band and its moldings.
function storefront({ P, W, F, look }) {
  const st = look.store;
  const pil = 0.44;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - pil / 2);
    P(U(pil, 0.2, SH + BAND, 0.03), x, F - 0.08, 0, st);
    P(U(pil + 0.1, 0.28, 0.5, 0.03), x, F - 0.1, 0, st); // base
    P(U(pil + 0.14, 0.32, 0.16, 0.03), x, F - 0.12, SH - 0.08, st, NC); // capital
  }
  const bayW = W / 2 - pil - AW / 2;
  for (const s of [-1, 1]) {
    const x = s * (AW / 2 + bayW / 2);
    // Bulkhead with two raised panels.
    P(box(bayW, 0.62, 0.12), x, F - 0.04, 0, st);
    for (const k of [-1, 1]) P(raised(bayW / 2 - 0.28, 0.34, 0.04), x + k * (bayW / 4), F - 0.11, 0.14, st, NC);
    P(box(bayW + 0.04, 0.08, 0.24), x, F - 0.1, 0.62, st); // sill
    // Display glass in its frame, a mullion, and the transom band of small panes.
    P(box(bayW - 0.1, 1.84, 0.04), x, F - 0.01, 0.7, SHOWGLASS, NC);
    for (const e of [-1, 1]) P(box(0.1, 2.4, 0.14), x + e * (bayW / 2 - 0.05), F - 0.06, 0.7, st, NC);
    P(box(0.07, 1.84, 0.1), x, F - 0.05, 0.7, st, NC);
    P(box(bayW, 0.12, 0.16), x, F - 0.07, 2.54, st, NC);
    P(box(bayW - 0.1, SH - 2.66 - 0.1, 0.04), x, F - 0.01, 2.66, GLASS, NC);
    const nT = Math.max(2, Math.round(bayW / 0.7));
    for (let i = 1; i < nT; i++) P(box(0.05, SH - 2.76, 0.07), x - bayW / 2 + (bayW * i) / nT, F - 0.04, 2.66, st, NC);
    P(box(bayW, 0.1, 0.16), x, F - 0.07, SH - 0.1, st, NC);
  }
  // The entry: tiled floor with a step, sidelights in its side walls, the
  // door at the back with a glass top, a kick panel, a knob and a transom.
  const back = F + ALC;
  P(box(AW, 0.1, ALC), 0, F + ALC / 2, 0, TILE, NC);
  P(box(AW + 0.1, 0.16, 0.18), 0, F - 0.02, 0, STONE, NC); // threshold step
  for (const s of [-1, 1]) {
    const x = s * (AW / 2);
    P(box(0.1, 0.62, ALC - 0.1), x - s * 0.05, F + ALC / 2, 0, st, NC);
    P(box(0.04, 1.84, ALC - 0.3), x - s * 0.02, F + ALC / 2 + 0.05, 0.7, SHOWGLASS, NC);
    P(box(0.12, 0.1, ALC - 0.1), x - s * 0.06, F + ALC / 2, 2.54, st, NC);
    P(box(0.14, SH, 0.14), x - s * 0.07, F + 0.02, 0, st, NC); // corner post
  }
  P(box(AW + 0.1, 0.18, 0.2), 0, F - 0.02, SH - 0.18, st, NC); // beam over the entry
  P(box(1.0, 2.3, 0.06), 0, back - 0.03, 0.1, DOOR, NC);
  P(raised(0.7, 1.0, 0.03), 0, back - 0.07, 1.2, GLASS, NC);
  P(raised(0.66, 0.5, 0.03), 0, back - 0.07, 0.3, DOOR, NC);
  P(box(0.06, 0.06, 0.06), 0.38, back - 0.1, 1.05, BRASS, NC);
  P(box(0.9, 0.1, 0.06), 0, back - 0.07, 0.98, BRASS, NC); // push plate
  for (const s of [-1, 1]) P(box(0.12, SH - 0.1, 0.16), s * 0.56, back - 0.06, 0.1, st, NC);
  P(box(1.24, 0.12, 0.16), 0, back - 0.06, 2.4, st, NC);
  P(box(1.0, SH - 2.52 - 0.18, 0.04), 0, back - 0.02, 2.52, GLASS, NC);
  // Sign band: a sunk blank board between two moldings, a cornice on top.
  const bandW = W - 2 * pil;
  P(box(bandW, BAND - 0.16, 0.06), 0, F - 0.03, SH + 0.08, look.sign, NC);
  P(box(bandW + 0.04, 0.1, 0.16), 0, F - 0.07, SH, st, NC);
  P(box(bandW + 0.04, 0.08, 0.16), 0, F - 0.07, SH + BAND - 0.08, st, NC);
  P(U(W + 0.1, 0.34, 0.14, 0.03), 0, F - 0.13, SH + BAND, st);
  P(U(W - 0.1, 0.26, 0.08, 0.02), 0, F - 0.1, SH + BAND - 0.07, st, NC);
}

// ---- Awning: striped canvas from a rail under the sign band, out over the
// walk on iron arms, sagging between the arms and in the middle, with a
// scalloped valance. Seen from below as much as from above, so both sides.
function awning({ P, W, F, look }) {
  const span = W - 1.1;
  const proj = 1.9;
  const drop = 0.55;
  const top = SH - 0.04;
  const arms = [-span / 2 + 0.06, 0, span / 2 - 0.06];
  const sagAt = (x) => {
    for (let i = 0; i < arms.length - 1; i++) {
      if (x >= arms[i] && x <= arms[i + 1]) return Math.sin((Math.PI * (x - arms[i])) / (arms[i + 1] - arms[i]));
    }
    return 0;
  };
  // Canvas point: x across, t 0 at the wall to 1 at the front edge.
  const pt = (x, t) => {
    const s = sagAt(x);
    return [x, -drop * t - Math.sin(Math.PI * t) * (0.035 + 0.09 * s) - t * 0.05 * s, -proj * t];
  };
  const nS = Math.max(6, Math.round(span / 0.48));
  const geos = [[], []];
  const quad = (list, p0, p1, p2, p3) => {
    // Both windings, so the underside shows.
    list.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3, ...p0, ...p2, ...p1, ...p0, ...p3, ...p2);
  };
  for (let i = 0; i < nS; i++) {
    const list = geos[i % 2];
    const x0 = -span / 2 + (span * i) / nS;
    const x1 = -span / 2 + (span * (i + 1)) / nS;
    const rows = 4;
    for (let r = 0; r < rows; r++) quad(list, pt(x0, r / rows), pt(x1, r / rows), pt(x1, (r + 1) / rows), pt(x0, (r + 1) / rows));
    // Valance: hangs from the front edge, one rounded scallop per stripe.
    const lobe = (k) => {
      const x = x0 + ((x1 - x0) * k) / 3;
      const e = pt(x, 1);
      return [[x, e[1], e[2] - 0.005], [x, e[1] - 0.16 - 0.06 * Math.sin((Math.PI * k) / 3), e[2] - 0.005]];
    };
    for (let k = 0; k < 3; k++) {
      const [a0, a1] = lobe(k);
      const [b0, b1] = lobe(k + 1);
      quad(list, a0, b0, b1, a1);
    }
  }
  geos.forEach((list, k) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    P(g, 0, F - 0.1, top, look.awning[k]);
  });
  // Rail on the wall, and a tie rod from high on the wall to each arm's end.
  P(box(span + 0.1, 0.08, 0.08), 0, F - 0.1, top - 0.06, IRON, NC);
  for (const x of arms) {
    const e = pt(x, 1);
    P(strut(new THREE.Vector3(x, 0.95, 0), new THREE.Vector3(x, e[1] + 0.02, e[2]), 0.018, 4), 0, F - 0.1, top, IRON, NC);
    P(strut(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, e[1] - 0.01, e[2]), 0.02, 4), 0, F - 0.1, top, IRON, NC);
    P(box(0.12, 0.16, 0.06), x, F - 0.05, top + 0.88, IRON, NC);
  }
}

// ---- Brick block: corner piers, a belt course over the sign band, upper
// windows on two stories, a metal cornice on corbels and a dentil row, and a
// raised centre over it with a sunk panel and a stone cap.
function brickBlock({ P, W, D, F, H, look }) {
  const FT = H + 1.0;
  const PT = H + 0.5;
  for (const s of [-1, 1]) {
    P(U(0.5, 0.5, FT - SH - BAND, 0.03), s * (W / 2 - 0.2), F + 0.15, SH + BAND, look.wall);
    P(U(0.5, 0.5, PT + 1.5, 0.03), s * (W / 2 - 0.15), D / 2 - 0.2, -1.5, look.wall); // back piers
  }
  P(box(W + 0.08, 0.16, 0.12), 0, F - 0.03, SH + BAND + 0.3, STONE); // belt course
  if (H > 6) {
    const n = Math.max(2, Math.round(W / 4));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / n;
      framedWindow(P, x, F, '-y', 1.0, 1.8, 4.75, { frame: look.cornice, sash: look.store, lintel: STONE });
    }
  } else {
    // One story: a sunk brick panel breaks up the wall over the band.
    P(box(W - 1.6, 0.5, 0.04), 0, F - 0.01, SH + BAND + 0.55, 0x7b5a4a, NC);
    P(box(W - 1.5, 0.06, 0.08), 0, F - 0.03, SH + BAND + 0.5, STONE, NC);
    P(box(W - 1.5, 0.06, 0.08), 0, F - 0.03, SH + BAND + 1.05, STONE, NC);
  }
  // Cornice: dentils, a frieze, brackets at the ends and between, a crown.
  const cU = FT - 0.62;
  const nd = Math.round(W / 0.45);
  for (let i = 0; i < nd; i++) P(box(0.14, 0.12, 0.12), -W / 2 + 0.17 + (W - 0.34) * (i / (nd - 1)), F - 0.06, cU - 0.14, look.wall, NC);
  P(box(W + 0.14, 0.36, 0.14), 0, F - 0.07, cU, look.cornice);
  const nb = Math.max(3, Math.round(W / 2.2));
  for (let i = 0; i < nb; i++) P(bracket(0.42), -W / 2 + 0.3 + ((W - 0.6) * i) / (nb - 1), F, cU + 0.36, look.cornice, NC);
  P(uprightSlab(W + 0.5, 0.6, 0.2, 0.04, 0.03), 0, F - 0.18, cU + 0.36, look.cornice);
  P(box(W + 0.6, 0.06, 0.66), 0, F - 0.16, cU + 0.56, look.cornice, NC);
  // Raised centre with a sunk panel (blank) and a stone cap.
  const cw = Math.min(4.2, W * 0.36);
  P(U(cw, 0.4, 0.75, 0.03), 0, F + 0.2, FT - 0.06, look.wall);
  P(box(cw - 0.7, 0.36, 0.04), 0, F - 0.01, FT + 0.12, 0x7b5a4a, NC);
  P(U(cw + 0.2, 0.56, 0.14, 0.03), 0, F + 0.2, FT + 0.69, STONE);
  // Stone coping round the low parapet, and the flat roof inside it.
  const cope = (w, d, lx, ly) => P(box(w, 0.1, d), lx, ly, PT, STONE, NC);
  cope(W + 0.06, 0.4, 0, D / 2 - 0.2);
  for (const s of [-1, 1]) cope(0.4, D - ALC, s * (W / 2 - 0.2), ALC / 2);
  P(box(W - 0.8, 0.08, D - ALC - 0.8), 0, ALC / 2, PT - 0.02, TAR, NC);
}

// A cornice bracket: a scroll profile under the crown, standing out from the
// wall (at y = 0 in its frame) toward -y; hangs down from its top at 0.
function bracket(size) {
  const s = size;
  const g = slab(outline([[0, -s * 1.15, 0], [0, 0, 0], [-s, 0, 0.02], [-s, -s * 0.22, 0.05], [-s * 0.35, -s * 0.5, s * 0.3], [-s * 0.16, -s * 1.15, 0.04]]), 0.12, 0, 'zy', 0, 2);
  return g;
}

// ---- Painted-board store: a false front standing proud of the side walls
// and above the roof, its corner boards, two upper windows, a bracketed
// cornice and a low pediment; the gable roof behind it runs front to back.
function boardStore({ P, W, D, F, H, look }) {
  const Wf = W + 0.3;
  const FH = 6.3; // top of the false front's cornice
  const pw = Wf * 0.42;
  const ped = 0.75;
  // The front itself, proud of the walls, from the sign band up.
  const front = outline([[-Wf / 2, SH], [Wf / 2, SH], [Wf / 2, FH], [-Wf / 2, FH]]);
  P(slab(front, 0.16, 0.02, 'xy', 0, 2), 0, F - 0.04, 0, look.wall);
  for (const s of [-1, 1]) P(box(0.22, FH - SH - BAND, 0.2), s * (Wf / 2 - 0.11), F - 0.08, SH + BAND, look.cornice);
  for (const s of [-1, 1]) framedWindow(P, s * W * 0.22, F - 0.12, '-y', 1.0, 1.25, SH + BAND + 0.55, { frame: look.cornice, sash: look.store });
  // Frieze board, brackets, and a crown that overhangs the walk.
  P(box(Wf - 0.4, 0.42, 0.06), 0, F - 0.14, FH - 0.72, look.cornice, NC);
  const nb = Math.max(4, Math.round(Wf / 2));
  for (let i = 0; i < nb; i++) P(bracket(0.38), -Wf / 2 + 0.3 + ((Wf - 0.6) * i) / (nb - 1), F - 0.12, FH - 0.2, look.cornice, NC);
  P(uprightSlab(Wf + 0.3, 0.56, 0.2, 0.04, 0.03), 0, F - 0.3, FH - 0.2, look.cornice);
  // Pediment over the middle: a low triangle with raking trim and a cap.
  const tri = outline([[-pw / 2, 0], [pw / 2, 0], [0, ped]]);
  P(slab(tri, 0.16, 0.02, 'xy', 0, 2), 0, F - 0.04, FH, look.wall);
  const rake = Math.atan2(ped, pw / 2);
  const rl = Math.hypot(pw / 2, ped) + 0.2;
  for (const s of [-1, 1]) {
    P(box(rl, 0.14, 0.26), s * pw / 4, F - 0.14, FH + ped / 2 - 0.1, look.cornice, { extra: new THREE.Matrix4().makeRotationZ(-s * rake) });
  }
  P(box(0.3, 0.2, 0.3), 0, F - 0.14, FH + ped - 0.05, look.cornice, NC);
  // Two braces on the back of the false front, down to the roof.
  for (const s of [-1, 1]) {
    P(strut(new THREE.Vector3(s * W * 0.25, FH - 0.6, F + 0.06), new THREE.Vector3(s * W * 0.25, H + 0.9, F + 2.4), 0.06, 4), 0, 0, 0, DOOR, NC);
  }
  // Gable roof behind, ridge front to back, with fascia boards.
  const half = W / 2 + 0.35;
  const rise = 1.4;
  const len = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const depth = D + 0.4;
  for (const s of [-1, 1]) {
    P(box(len, 0.08, depth), s * half / 2, 0.16, H + rise / 2 - 0.08, TIN, { extra: new THREE.Matrix4().makeRotationZ(-s * ang) });
    P(box(0.06, 0.2, depth), s * (half - 0.03), 0.16, H - 0.18, look.cornice, NC);
  }
  // Back gable end, with a louvred vent.
  P(poly([[-W / 2, H, D / 2], [W / 2, H, D / 2], [0, H + rise - 0.06, D / 2]], [0, 0, 1]), 0, 0, 0, look.wall);
  P(box(0.7, 0.5, 0.08), 0, D / 2 + 0.03, H + 0.35, look.cornice, NC);
  for (let i = 0; i < 4; i++) P(box(0.56, 0.04, 0.1), 0, D / 2 + 0.05, H + 0.42 + i * 0.1, look.store, NC);
}

// ---- Side and back walls: corner boards on board stores, windows down each
// side, a back door with a stoop and a light, a downspout and a roof vent.
function sidesAndBack({ P, W, D, F, look }, wallTop) {
  const brick = look.style === 'brick';
  const o = brick ? { frame: look.store, sash: look.store, lintel: STONE } : { frame: look.cornice, sash: look.store };
  if (!brick) {
    for (const s of [-1, 1]) P(box(0.2, wallTop, 0.2), s * (W / 2 + 0.02), D / 2 + 0.02, 0, look.cornice, NC);
  }
  const L = D - ALC - 1.4;
  const n = Math.max(1, Math.floor(L / 3.6));
  const stories = wallTop > 6 ? 2 : 1;
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const y = F + ALC + 1.1 + (L * (i + 0.5)) / n;
      for (let f = 0; f < stories; f++) framedWindow(P, s * W / 2, y, s < 0 ? '-x' : '+x', 0.9, 1.4, 1.2 + f * 3.6, o);
    }
  }
  // Back door, a concrete stoop and a light over it; a window beside.
  const by = D / 2;
  const dx = -W / 4;
  P(box(1.0, 2.2, 0.08), dx, by + 0.02, 0.15, DOOR, NC);
  P(raised(0.66, 0.8, 0.03), dx, by + 0.08, 1.1, DOOR, NC);
  P(box(0.06, 0.06, 0.06), dx + 0.38, by + 0.1, 1.0, BRASS, NC);
  P(box(1.3, 0.12, 0.18), dx, by + 0.06, 2.35, brick ? STONE : look.cornice, NC);
  P(U(1.6, 0.9, 0.16, 0.04), dx, by + 0.45, 0, STONE);
  P(cyl(0.09, 0.14, 8), dx, by + 0.12, 2.55, IRON, NC);
  framedWindow(P, W / 4, by, '+y', 1.0, 1.2, 1.2, o);
  // Downspout from the eaves down a back corner, with a kick at the foot.
  const sx = W / 2 - 0.35;
  P(cyl(0.055, wallTop - 0.3, 6), sx, by + 0.09, 0.3, TIN, NC);
  P(box(0.14, 0.08, 0.36), sx, by + 0.22, 0.02, TIN, NC);
  // Vent pipe on the roof.
  P(cyl(0.12, 0.8, 8), W * 0.2, D * 0.25, wallTop - 0.2, TIN);
  P(cyl(0.18, 0.08, 8), W * 0.2, D * 0.25, wallTop + 0.6, IRON, NC);
}
