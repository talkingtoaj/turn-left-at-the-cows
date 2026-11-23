// Barns (#79): red board barns built from a seeded plan, so neighbours
// differ. Some have a gambrel roof, some a plain gable; all get a deep roof
// overhang with rafter tails, white trim (corner boards, frieze, fascia and
// rake boards), framed sliding doors on a track, a hay loft door, windows
// with casings and sills, and one or two louvred cupolas. Some have a
// lean-to shed on the back or on the west end. The lean-to stays inside the
// footprint from layout.js, so what you see is what you hit. The stave silo
// beside every barn is elevator3d.js's (#67).
// Everything goes into the shared batch, so a barn adds no draw call.
// Colours pick textures (src3/look/surfaces.js): walls 'upright boards',
// roofs 'tin' (or 'rusty tin'), posts 'boards', footing 'concrete'. Trim,
// glass and the dark inside are plain paint colours.
//
// Local frame: x east (along b.w), z south (along b.h), y up. Wall kits are
// built facing +z and turned to their wall.

import * as THREE from 'three';
import { hashString, makeRng } from '../../src/drive/geom.js';
import { SILO } from '../../src/drive/layout.js';
import { box, cyl, pyramid, gable, strut } from './shapes.js';
import { objMatrix } from './batch.js';
import { buildFarmSilo } from './elevator3d.js';

const FOUND = 1.5;
export const REDS = [0xa8352b, 0x8c2a22, 0xa3392c, 0x7d2a21]; // upright boards
export const ROOFS = [0x5a5f66, 0x6a6f72, 0x5d6066, 0x6a3a26]; // tin, and one rusty tin
const TRIM = 0xf6f2e8; // white paint
const DARK = 0x1e1b18; // inside the barn
const GLASS = 0x2c3a46;
const CONCRETE = 0xa9a69c;
const WOOD = 0x6a5238; // boards: posts, beams, rafter tails
const IRON = 0x23262a;
const HAY = 0xc9b06a;
const GREY = 0x5e5a52; // grey boards, for an old lean-to

export const LEAN_DEPTH = 4.5; // how deep a lean-to is
const OVER = 1.2; // eave overhang, along the slope
const RAKE = 0.6; // overhang past the gable ends
const ROOF_T = 0.16;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const rotX = (t) => new THREE.Matrix4().makeRotationX(t);
const rotY = (t) => new THREE.Matrix4().makeRotationY(t);
const rotZ = (t) => new THREE.Matrix4().makeRotationZ(t);

// The barn's plan, from its id (seeded) and its front ('n' or 's', the long
// side nearer the road). Pure: same barn in, same plan out.
//   gambrel: roof shape; lean: 'back' | 'end' | null; body: the barn's own
//   box (cx, cz centre, len along x, depth along z) inside the footprint.
export function barnPlan(b, front = 's') {
  const rng = makeRng(hashString(b.id) + 79);
  const gambrel = rng() < 0.6;
  const r = rng();
  const lean = r < 0.4 ? 'back' : r < 0.75 ? 'end' : null;
  const wall = REDS[Math.floor(rng() * REDS.length)];
  const roof = ROOFS[Math.floor(rng() * ROOFS.length)];
  const leanWall = rng() < 0.5 ? wall : GREY;
  const cupolas = b.w >= 24 && rng() < 0.5 ? 2 : 1;
  const open = rng() < 0.5 ? 0.85 : 0; // how far one front door leaf is slid open
  const doorAt = (rng() - 0.5) * 0.2 * b.w; // front doors' offset along the wall
  const fs = front === 'n' ? -1 : 1; // which way the front faces (z)
  const L = LEAN_DEPTH;
  let body = { cx: 0, cz: 0, len: b.w, depth: b.h };
  if (lean === 'back') body = { cx: 0, cz: fs * L / 2, len: b.w, depth: b.h - L };
  if (lean === 'end') body = { cx: L / 2, cz: 0, len: b.w - L, depth: b.h };
  const wallH = gambrel ? 5.2 : 5.8;
  return { gambrel, lean, wall, roof, leanWall, cupolas, open, doorAt, front, fs, body, wallH };
}

// The cross-section, (z, y) points from the bottom left round: walls up to
// wallH, then a gambrel (steep lower slope, shallow upper) or a plain gable.
export function barnProfile(depth, wallH, gambrel) {
  const h = depth / 2;
  const pts = [[-h, -FOUND], [h, -FOUND], [h, wallH]];
  if (gambrel) {
    const knee = wallH + depth * 0.28;
    pts.push([h * 0.66, knee], [0, knee + depth * 0.16], [-h * 0.66, knee]);
  } else {
    pts.push([0, wallH + depth * 0.3]);
  }
  pts.push([-h, wallH]);
  return pts;
}

export function buildBarn(batch, b, base, sides) {
  const front = sides && sides.n < sides.s ? 'n' : 's';
  const p = barnPlan(b, front);
  const { body, wallH, gambrel, fs } = p;
  const M0 = objMatrix(b.x, b.y, base, b.angle || 0);
  const MB = M0.clone().multiply(T(body.cx, 0, body.cz));
  const put = (F) => (geo, x, y, z, color, opts, extra) => {
    const m = F.clone().multiply(T(x, y, z));
    if (extra) m.multiply(extra);
    batch.add(geo, m, color, opts || {});
  };
  const B = put(MB);
  const len = body.len;
  const D = body.depth;
  const prof = barnProfile(D, wallH, gambrel);
  const ridgeY = Math.max(...prof.map((q) => q[1]));

  // Body: the profile pushed along x.
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false })
    .translate(0, 0, -len / 2).rotateY(-Math.PI / 2);
  B(bodyGeo, 0, 0, 0, p.wall);
  // Concrete footing, a little proud of the walls.
  B(box(len + 0.16, 0.45 + FOUND, D + 0.16), 0, -FOUND, 0, CONCRETE);

  // Roof: one panel per slope segment, the eave segment carried out past the
  // wall by OVER, the whole roof RAKE past each gable end.
  const LX = len + 2 * RAKE;
  for (const s of [-1, 1]) {
    // Points from the eave up to the ridge on this side.
    const side = prof.filter(([z, y]) => y >= wallH && (s > 0 ? z >= 0 : z <= 0)).sort((a, c) => a[1] - c[1]);
    for (let i = 0; i < side.length - 1; i++) {
      let [z0, y0] = side[i];
      const [z1, y1] = side[i + 1];
      const segL = Math.hypot(z1 - z0, y1 - y0);
      const dz = (z1 - z0) / segL;
      const dy = (y1 - y0) / segL;
      const ext0 = i === 0 ? OVER : 0.05;
      z0 -= dz * ext0;
      y0 -= dy * ext0;
      const full = segL + ext0 + ROOF_T * 0.5;
      const phi = Math.atan2(-dy, dz);
      let nz = -dy;
      let ny = dz;
      if (ny < 0) { nz = -nz; ny = -ny; }
      const mz = (z0 + z1 + dz * ROOF_T * 0.5) / 2 + nz * ROOF_T / 2;
      const my = (y0 + y1 + dy * ROOF_T * 0.5) / 2 + ny * ROOF_T / 2;
      B(new THREE.BoxGeometry(LX, ROOF_T, full), 0, my, mz, p.roof, null, rotX(phi));
      // Rake boards up both gable ends, under the roof edge.
      for (const e of [-1, 1]) {
        B(new THREE.BoxGeometry(0.07, 0.32, full), e * (LX / 2 - 0.02), my - ny * 0.2, mz - nz * 0.2, TRIM, { cast: false }, rotX(phi));
      }
      if (i === 0) {
        // Fascia across the eave end, and rafter tails under the overhang.
        const fz = z0 + nz * 0.0;
        const fy = y0 - 0.12;
        B(new THREE.BoxGeometry(LX, 0.3, 0.06), 0, fy, fz, TRIM, { cast: false });
        const n = Math.round(len / 0.9);
        for (let k = 0; k <= n; k++) {
          const x = -len / 2 + (k / n) * len;
          B(new THREE.BoxGeometry(0.1, 0.16, OVER), x, y0 + dy * OVER / 2 - ny * 0.08, z0 + dz * OVER / 2 - nz * 0.08, WOOD, { cast: false }, rotX(phi));
        }
      }
    }
  }
  // Ridge cap, and a trim strip on each knee of a gambrel.
  B(new THREE.BoxGeometry(LX, 0.14, 0.5), 0, ridgeY + ROOF_T * 0.6, 0, p.roof);
  if (gambrel) {
    const knee = prof[3];
    for (const s of [-1, 1]) B(new THREE.BoxGeometry(LX, 0.1, 0.32), 0, knee[1] + ROOF_T * 0.7, s * knee[0], p.roof, { cast: false });
  }

  // Trim on the walls: frieze boards under the eaves, corner boards.
  for (const s of [-1, 1]) B(box(len, 0.35, 0.06), 0, wallH - 0.38, s * (D / 2 + 0.03), TRIM, { cast: false });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      B(box(0.3, wallH - 0.45, 0.06), sx * (len / 2 - 0.12), 0.45, sz * (D / 2 + 0.03), TRIM, { cast: false });
      B(box(0.06, wallH - 0.45, 0.3), sx * (len / 2 + 0.03), 0.45, sz * (D / 2 - 0.12), TRIM, { cast: false });
    }
  }

  // Wall frames: kits face +z, origin at the wall's foot, centred.
  const wallF = (k) => {
    if (k === 'front' || k === 'back') {
      const s = k === 'front' ? fs : -fs;
      return MB.clone().multiply(T(0, 0, s * D / 2)).multiply(rotY(s > 0 ? 0 : Math.PI));
    }
    const s = k === 'e' ? 1 : -1;
    return MB.clone().multiply(T(s * len / 2, 0, 0)).multiply(rotY(s * Math.PI / 2));
  };

  // Front: the big sliding doors, windows either side.
  const F = put(wallF('front'));
  const doorX = fs > 0 ? p.doorAt : -p.doorAt; // the front frame is turned on a north front
  const doorW = 5;
  slidingDoors(F, doorX, doorW, 4.3, p.open);
  windowRow(F, len, doorX, doorW + 2.4);
  // Back: smaller doors and windows, unless the lean-to is there.
  if (p.lean !== 'back') {
    const K = put(wallF('back'));
    slidingDoors(K, 0, 4, 3.8, 0);
    windowRow(K, len, 0, 4 + 2.4);
  }
  // Gable ends: the loft door high up; a walk door at the east end (south of
  // the silo), and big doors at the west end when no lean-to is on it.
  const loftY = wallH + 0.35;
  for (const k of ['e', 'w']) {
    const G = put(wallF(k));
    loftDoor(G, 0, loftY, 2.2, Math.min(2.4, ridgeY - loftY - 1.0));
    // East frame: local +x points north (world -z), so the yard side is -x.
    if (k === 'e') {
      walkDoor(G, -D * 0.3, p.wall);
      windowAt(G, D * 0.08, 2.0, 0.9, 0.8);
    } else if (p.lean !== 'end') {
      slidingDoors(G, 0, 4.2, 4.0, 0);
    }
  }
  // Hay hood over the west loft door: the roof's peak carried out, with the
  // hay track beam and its hook under it.
  {
    const hood = gable(2.6, 2.2, 1.0);
    B(hood, -len / 2 - RAKE - 0.7, ridgeY - 0.95, 0, p.roof);
    B(box(2.6, 0.14, 0.16), -len / 2 - RAKE - 0.7, ridgeY - 1.2, 0, WOOD, { cast: false });
    B(cyl(0.03, 0.6, 4), -len / 2 - RAKE - 1.6, ridgeY - 1.8, 0, IRON, { cast: false });
    B(box(0.12, 0.08, 0.08), -len / 2 - RAKE - 1.6, ridgeY - 1.84, 0, IRON, { cast: false });
  }

  // Cupolas on the ridge.
  const cx = p.cupolas === 2 ? [-len * 0.22, len * 0.22] : [len * 0.05];
  for (const x of cx) cupola(B, x, ridgeY);

  if (p.lean) leanTo(batch, p, MB, len, D, put);

  // The stave silo (elevator3d.js, #67), where layout.js puts it.
  buildFarmSilo(batch, b, base, b.w / 2 + SILO.dx, SILO.ly, SILO.r, 14);
  return p;
}

// Big double sliding doors centred at x, w wide, h tall, hanging on a track
// under a little hood. open: how far (in leaf widths) the right leaf is slid.
function slidingDoors(P, x, w, h, open) {
  const lw = w / 2;
  const nc = { cast: false };
  // The opening: dark inside, a white casing round it.
  P(box(w, h, 0.03), x, 0, 0.015, DARK, nc);
  for (const s of [-1, 1]) P(box(0.22, h + 0.1, 0.08), x + s * (w / 2 + 0.11), 0, 0.04, TRIM, nc);
  // Track, and the hood that keeps rain off it.
  P(box(2 * w + 0.4, 0.1, 0.08), x, h + 0.2, 0.18, IRON, nc);
  P(box(2 * w + 0.6, 0.08, 0.5), x, h + 0.42, 0.25, 0x5a5f66, null, rotX(0.25));
  for (const s of [-1, 1]) {
    const shift = s > 0 ? open * lw : 0;
    leaf(P, x + s * lw / 2 + shift, lw - 0.04, h - 0.05, s);
  }
}

// One door leaf: boards, a white frame round it, a mid rail and an X brace.
function leaf(P, x, w, h, s) {
  const nc = { cast: false };
  const z = 0.16;
  P(box(w, h, 0.1), x, 0.03, z, 0x8c2a22);
  const t = 0.2;
  const zt = z + 0.07;
  P(box(w, t, 0.05), x, 0.03, zt, TRIM, nc);
  P(box(w, t, 0.05), x, h - t + 0.03, zt, TRIM, nc);
  P(box(w, t, 0.05), x, h / 2 - t / 2, zt, TRIM, nc);
  for (const e of [-1, 1]) P(box(t, h, 0.05), x + e * (w / 2 - t / 2), 0.03, zt, TRIM, nc);
  // X brace in each half.
  const iw = w - 2 * t;
  const ih = h / 2 - 1.5 * t;
  const diag = Math.hypot(iw, ih);
  const ang = Math.atan2(ih, iw);
  for (const half of [0, 1]) {
    const cy = t + 0.03 + ih / 2 + half * (h / 2 - t / 2);
    for (const e of [-1, 1]) {
      P(new THREE.BoxGeometry(diag, 0.16, 0.04), x, cy, zt, TRIM, nc, rotZ(e * ang));
    }
  }
  // Rollers on the track, and a handle by the meeting edge.
  for (const e of [-1, 1]) P(cyl(0.1, 0.08, 6), x + e * w * 0.3, h + 0.12, 0.2, IRON, nc, rotX(Math.PI / 2));
  P(box(0.06, 0.4, 0.08), x - s * (w / 2 - 0.3), 1.0, zt + 0.04, IRON, nc);
}

// Windows along a long wall, skipping the door (centred at doorX, gap wide).
function windowRow(P, len, doorX, gap) {
  const n = Math.max(2, Math.round(len / 5));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + ((i + 0.5) / n) * len;
    if (Math.abs(x - doorX) < gap / 2 + 0.6) continue;
    if (Math.abs(x) > len / 2 - 1.2) continue;
    windowAt(P, x, 2.1, 0.9, 0.8);
  }
}

// A small four-pane window: glass, a white casing, a sill and a drip cap.
function windowAt(P, x, y, w, h) {
  const nc = { cast: false };
  P(box(w, h, 0.03), x, y, 0.015, GLASS, nc);
  P(box(0.04, h, 0.04), x, y, 0.05, TRIM, nc);
  P(box(w, 0.04, 0.04), x, y + h / 2 - 0.02, 0.05, TRIM, nc);
  const c = 0.12;
  for (const s of [-1, 1]) P(box(c, h + 2 * c, 0.09), x + s * (w / 2 + c / 2), y - c, 0.045, TRIM, nc);
  P(box(w + 2 * c, c, 0.09), x, y + h, 0.045, TRIM, nc);
  P(box(w + 2 * c + 0.12, 0.07, 0.2), x, y - c - 0.02, 0.1, TRIM, nc);
  P(box(w + 2 * c + 0.1, 0.06, 0.16), x, y + h + c, 0.08, TRIM, nc);
}

// The hay loft door in a gable end: dark opening, casing, two leaves with X.
function loftDoor(P, x, y, w, h) {
  if (h < 1.2) return;
  const nc = { cast: false };
  P(box(w, h, 0.03), x, y, 0.015, DARK, nc);
  const c = 0.16;
  for (const s of [-1, 1]) P(box(c, h + 2 * c, 0.09), x + s * (w / 2 + c / 2), y - c, 0.045, TRIM, nc);
  P(box(w + 2 * c, c, 0.09), x, y + h, 0.045, TRIM, nc);
  P(box(w + 2 * c + 0.2, 0.1, 0.3), x, y - c, 0.12, TRIM, nc); // threshold
  for (const s of [-1, 1]) {
    const lx = x + s * w / 4;
    const lw = w / 2 - 0.03;
    P(box(lw, h - 0.04, 0.08), lx, y + 0.02, 0.1, 0x8c2a22);
    const diag = Math.hypot(lw - 0.2, h - 0.2);
    const ang = Math.atan2(h - 0.2, lw - 0.2);
    for (const e of [-1, 1]) P(new THREE.BoxGeometry(diag, 0.13, 0.04), lx, y + h / 2, 0.16, TRIM, nc, rotZ(e * ang));
    P(box(lw, 0.13, 0.04), lx, y + 0.04, 0.16, TRIM, nc);
    P(box(lw, 0.13, 0.04), lx, y + h - 0.17, 0.16, TRIM, nc);
  }
}

// A walk-in door with a casing, a little tin hood and a concrete step.
function walkDoor(P, x, wall) {
  const nc = { cast: false };
  const w = 1.0;
  const h = 2.15;
  P(box(w, h, 0.08), x, 0.1, 0.06, 0x5b3a2a);
  for (const [px, py, pw, ph] of [[0.25, 0.3, 0.5, 0.7], [0.25, 1.2, 0.5, 0.7]]) {
    P(box(pw, ph, 0.03), x - w / 2 + px + pw / 2 - 0.0, 0.1 + py, 0.11, 0x4a3420, nc);
  }
  const c = 0.12;
  for (const s of [-1, 1]) P(box(c, h + c, 0.1), x + s * (w / 2 + c / 2), 0.1, 0.05, TRIM, nc);
  P(box(w + 2 * c, c, 0.1), x, h + 0.1, 0.05, TRIM, nc);
  P(box(w + 0.7, 0.06, 0.7), x, h + 0.42, 0.3, 0x5a5f66, null, rotX(0.3));
  P(box(w + 0.5, 0.18, 0.6), x, -0.05, 0.3, CONCRETE);
  P(cyl(0.04, 0.05, 6), x + w / 2 - 0.15, 1.05, 0.13, IRON, nc, rotX(Math.PI / 2));
}

// A louvred cupola on the ridge with a pyramid roof and a weathervane.
function cupola(B, x, ridgeY) {
  const nc = { cast: false };
  const s = 1.9;
  B(box(s + 0.2, 1.3, s + 0.2), x, ridgeY - 0.7, 0, TRIM); // base, sits down into the roof
  B(box(s, 1.25, s), x, ridgeY + 0.6, 0, TRIM);
  for (let k = 0; k < 4; k++) {
    const R = rotY((k * Math.PI) / 2);
    const o = new THREE.Vector3(0, 0, s / 2).applyMatrix4(R);
    const F = (geo, lx, ly, lz, color, opts, extra) => {
      const m = R.clone().multiply(T(lx, ly, lz));
      if (extra) m.multiply(extra);
      B(geo, x, 0, 0, color, opts, m);
    };
    F(box(s - 0.5, 0.95, 0.03), 0, ridgeY + 0.75, s / 2 + 0.01, DARK, nc);
    for (let i = 0; i < 5; i++) F(box(s - 0.5, 0.05, 0.14), 0, ridgeY + 0.82 + i * 0.18, s / 2 + 0.03, TRIM, nc, rotX(0.5));
    void o;
  }
  B(box(s + 0.4, 0.14, s + 0.4), x, ridgeY + 1.85, 0, TRIM);
  B(pyramid(s + 0.7, 1.2), x, ridgeY + 1.99, 0, 0x5a5f66);
  B(cyl(0.1, 0.14, 6), x, ridgeY + 3.15, 0, IRON, nc);
  B(cyl(0.025, 1.0, 4), x, ridgeY + 3.2, 0, IRON, nc);
  B(box(0.9, 0.05, 0.04), x, ridgeY + 3.85, 0, IRON, nc);
  B(box(0.04, 0.22, 0.22), x - 0.45, ridgeY + 3.77, 0, IRON, nc, rotX(Math.PI / 4));
  B(box(0.5, 0.03, 0.03), x, ridgeY + 3.55, 0, IRON, nc);
  B(box(0.03, 0.03, 0.5), x, ridgeY + 3.55, 0, IRON, nc);
}

// The lean-to shed: a single-slope roof off the barn wall, open on its long
// side with posts and knee braces, boarded ends, a few bales inside.
function leanTo(batch, p, MB, len, D, put) {
  const L = LEAN_DEPTH;
  let F;
  let LL;
  let H1;
  if (p.lean === 'back') {
    const s = -p.fs;
    F = MB.clone().multiply(T(0, 0, s * D / 2)).multiply(rotY(s > 0 ? 0 : Math.PI));
    LL = len;
    H1 = p.wallH - 1.55;
  } else {
    F = MB.clone().multiply(T(-len / 2, 0, 0)).multiply(rotY(-Math.PI / 2));
    LL = D;
    H1 = p.wallH - 0.4;
  }
  const H2 = 2.7;
  const P = put(F);
  const nc = { cast: false };
  // Roof.
  const z0 = -0.1;
  const z1 = L + 0.6;
  const slope = (H1 - H2) / L;
  const y0 = H1 + 0.08 - slope * z0;
  const y1 = H1 + 0.08 - slope * z1;
  const rl = Math.hypot(z1 - z0, y0 - y1);
  P(new THREE.BoxGeometry(LL + 0.5, 0.12, rl), 0, (y0 + y1) / 2, (z0 + z1) / 2, p.roof, null, rotX(Math.atan2(y0 - y1, z1 - z0)));
  P(new THREE.BoxGeometry(LL + 0.5, 0.22, 0.05), 0, y1 - 0.12, z1, TRIM, nc);
  // Ends: boarded, cut to the roof's slope.
  const end = new THREE.Shape([V(0, -FOUND), V(L, -FOUND), V(L, H2), V(0, H1)].map((v) => new THREE.Vector2(v.x, v.y)));
  const endGeo = new THREE.ExtrudeGeometry(end, { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07).rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) {
    P(endGeo, s * (LL / 2 - 0.07), 0, 0, p.leanWall);
    P(box(0.06, H2, 0.24), s * (LL / 2 + 0.01), 0, L - 0.12, TRIM, nc);
  }
  // Header beam, posts and knee braces along the open side.
  const zb = L - 0.15;
  P(box(LL - 0.2, 0.3, 0.24), 0, H2 - 0.3, zb, WOOD);
  const bays = Math.max(2, Math.round(LL / 4));
  for (let i = 1; i < bays; i++) {
    const x = -LL / 2 + (i / bays) * LL;
    P(box(0.22, H2 - 0.3, 0.22), x, 0, zb, WOOD);
    P(box(0.4, 0.15, 0.4), x, -0.05, zb, CONCRETE, nc);
    for (const e of [-1, 1]) {
      const g = strut(V(x, H2 - 1.1, zb), V(x + e * 0.8, H2 - 0.3, zb), 0.06, 4);
      P(g, 0, 0, 0, WOOD, nc);
    }
  }
  // Hay bales stacked at one end, a dark back so it reads as a shed.
  P(box(LL - 0.4, H1 - 0.3, 0.03), 0, 0.2, 0.03, DARK, nc);
  const bx = -LL / 2 + 1.4;
  for (const [dx, dy, dz] of [[0, 0, 1.0], [1.05, 0, 1.0], [0, 0, 2.2], [1.05, 0, 2.2], [0.5, 0.55, 1.6]]) {
    P(box(1.0, 0.5, 1.15), bx + dx, dy, dz, HAY, nc);
  }
}
