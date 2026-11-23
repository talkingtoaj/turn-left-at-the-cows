// Gas station (#58, SPEC 9r): Earl's in Ashford (a_gas) and Lou's in Brandt
// (br_gas). Round-top pumps with hoses on bevelled islands, a canopy with a
// recessed soffit and edge lights, a shop with framed windows, a framed door
// and trim, an oil can rack, an ice chest and a price sign by the road
// (numbers only). Everything goes into the shared batch: no draw calls of
// its own. Footprints and solids come from GAS in layout.js.
//
// Local frame (the building's): x right (east), y back (south), up. The
// pumps and the price sign face north (-y), toward the road.

import * as THREE from 'three';
import { GAS } from '../../src/drive/layout.js';
import { box, cyl } from './shapes.js';
import { outline, slab } from './roundShapes.js';
import { objMatrix } from './batch.js';

const FOUND = 1.5;
const WINDOW = 0x2c3a46;
const WALL = 0xeceae3;
const RED = 0xc0392b;
const TRIM = 0x7a2a22; // window and door frames
const WHITE = 0xf4f2ec;
const STEEL = 0x8f9396;
const CHROME = 0xc8ccd0;
const DARK = 0x3a3a38;
const CONCRETE = 0x9a9890;

// Each station's own colours and prices (1992: dollars and tenths of a cent).
const LOOK = {
  a_gas: { pump: 0xb3261e, panel: 0xf0e9d6, top: 0xf0e9d6, prices: ['1.09', '1.19', '1.29'] },
  br_gas: { pump: 0xe6dcc2, panel: 0xf6f1e2, top: 0xb3261e, prices: ['1.11', '1.21', '1.31'] },
};
const GRADES = ['#c0392b', '#2f6fb0', '#2f8a4a']; // colour chips for the three grades, no words

// ---------------------------------------------------------------- shapes

// A rounded rectangle (w across x, d across y) as an outline.
const rrect = (w, d, r) => outline([[-w / 2, -d / 2, r], [w / 2, -d / 2, r], [w / 2, d / 2, r], [-w / 2, d / 2, r]]);

// An upright slab: a rounded rectangle in plan (w x d), h tall, bottom at 0.
// Corners rounded with r, top and bottom edges bevelled by bv.
function vslab(w, d, h, r, bv = 0.02) {
  return slab(rrect(w, d, r), h, bv, 'xy', 0, 3).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
}

// A ring in plan (outer w x d, wall t thick), h tall, bottom at 0.
function vring(w, d, t, h, r) {
  const s = rrect(w, d, r);
  s.holes.push(rrect(w - 2 * t, d - 2 * t, Math.max(0.01, r - t)));
  return slab(s, h, 0.01, 'xy', 0, 3).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
}

// A round-top outline: w wide, from 0 up to h, a half circle on top.
const roundTop = (w, h, y0 = 0) => outline([[-w / 2, y0, 0.03], [w / 2, y0, 0.03], { arc: [0, h - w / 2, w / 2, 0, Math.PI] }]);

// A flat rounded panel facing +-y (local), w x h, t thick, centred at height 0.
// No bevel: these are thin insets, the bevel would cost triangles nobody sees.
const panel = (w, h, t, r) => slab(outline([[-w / 2, -h / 2, r], [w / 2, -h / 2, r], [w / 2, h / 2, r], [-w / 2, h / 2, r]]), t, 0, 'xy', 0, 3);

// ---------------------------------------------------------------- pump

// One round-top pump standing at (x, y, up) in P's frame, its faces looking
// along -y and +y. o: { body, panel, top, side (1 = hose on the +x side),
// globe (an old glass globe on top, for the roadside pair in dressing.js) }.
// Shared by the stations and the old pumps prop, so it is built once.
export function roundPump(P, x, y, up, o = {}) {
  const body = o.body ?? 0xb3261e;
  const face = o.panel ?? 0xf0e9d6;
  const side = o.side ?? 1;
  const W = 0.72;
  const H = 1.62;
  const D = 0.44;
  const nc = { cast: false };
  P(vslab(0.84, 0.56, 0.12, 0.06), x, y, up, DARK);
  const b0 = up + 0.12;
  P(slab(roundTop(W, H), D, 0.035, 'xy', 0, 5), x, y, b0, body);
  // Panel gap round the lower door, and a cap on the round top.
  P(box(W + 0.012, 0.018, D - 0.04), x, y, b0 + 0.5, 0x1e1e1e, nc);
  P(slab(roundTop(W + 0.03, H + 0.015, H - 0.42), D + 0.02, 0.02, 'xy', 0, 5), x, y, b0, o.top ?? face);
  for (const s of [-1, 1]) {
    const fy = y + s * (D / 2);
    // Cream face panel with a chromed dial window and a small price window.
    P(slab(roundTop(W - 0.16, H - 0.68, 0), 0.03, 0, 'xy', 0, 6), x, fy, b0 + 0.58, face, nc);
    P(panel(0.44, 0.3, 0.03, 0.05), x, fy + s * 0.012, b0 + 0.95, CHROME, nc);
    P(panel(0.36, 0.22, 0.03, 0.04), x, fy + s * 0.02, b0 + 0.95, WINDOW, nc);
    P(box(0.012, 0.16, 0.012), x + 0.05, fy + s * 0.036, b0 + 0.95, WHITE, { ...nc, extra: new THREE.Matrix4().makeRotationZ(-0.7) });
    P(panel(0.3, 0.12, 0.03, 0.02), x, fy + s * 0.012, b0 + 0.68, WINDOW, nc);
    // Emblem disc in the round top.
    P(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 14).rotateX(Math.PI / 2), x, fy + s * 0.01, b0 + H - 0.33, WHITE, nc);
    P(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 14).rotateX(Math.PI / 2), x, fy + s * 0.022, b0 + H - 0.33, 0xb3261e, nc);
  }
  // Nozzle in its holster on the hose side, and the hose hanging in a loop.
  const hx = x + side * (W / 2 + 0.05);
  P(box(0.1, 0.24, 0.16), hx, y, b0 + 0.86, DARK, nc);
  P(box(0.06, 0.18, 0.07), hx + side * 0.03, y - 0.02, b0 + 1.0, 0x1e1e1e, nc);
  P(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 5).rotateZ(side * 0.5), hx + side * 0.08, y - 0.02, b0 + 0.92, CHROME, nc);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x + side * (W / 2 - 0.02), b0 + 1.28, y + 0.08),
    new THREE.Vector3(x + side * (W / 2 + 0.16), b0 + 0.9, y + 0.14),
    new THREE.Vector3(x + side * (W / 2 + 0.3), b0 + 0.28, y + 0.12),
    new THREE.Vector3(x + side * (W / 2 + 0.2), b0 + 0.12, y + 0.02),
    new THREE.Vector3(x + side * (W / 2 + 0.1), b0 + 0.5, y - 0.03),
    new THREE.Vector3(hx + side * 0.03, b0 + 0.92, y - 0.02),
  ]);
  P(new THREE.TubeGeometry(curve, 16, 0.024, 5), 0, 0, 0, 0x1b1b1b, nc);
  if (o.globe) {
    P(cyl(0.3, 0.08, 10), x, y, b0 + H, 0x2a2a2a);
    P(new THREE.SphereGeometry(0.28, 10, 8), x, y, b0 + H + 0.3, 0xf2e6a0);
    P(cyl(0.12, 0.08, 8), x, y, b0 + H + 0.56, body);
  }
}

// ---------------------------------------------------------------- parts

// A window w x h (bottom at up) in a wall facing n ('-y' front, '+y', '+x').
// Glass on the wall face, a frame standing proud, mullions, sill and head.
function windowIn(P, cx, cy, n, w, h, up, panes = 1) {
  const along = n === '+x' ? 'y' : 'x';
  const out = n === '-y' ? -1 : 1;
  const B = (a, hh, depth) => (along === 'x' ? box(a, hh, depth) : box(depth, hh, a));
  const at = (t, o) => (along === 'x' ? [cx + t, cy + out * o] : [cx + out * o, cy + t]);
  const nc = { cast: false };
  P(B(w, h, 0.04), ...at(0, 0.0), up, WINDOW, nc);
  const f = 0.11;
  P(B(w + 2 * f, f, 0.16), ...at(0, 0.04), up + h, TRIM, nc); // head
  P(B(w + 2 * f, f, 0.14), ...at(0, 0.04), up - f, TRIM, nc);
  for (const s of [-1, 1]) P(B(f, h, 0.14), ...at(s * (w / 2 + f / 2), 0.04), up, TRIM, nc);
  for (let i = 1; i < panes; i++) P(B(0.07, h, 0.1), ...at(-w / 2 + (w * i) / panes, 0.03), up, TRIM, nc);
  P(B(w + 0.4, 0.07, 0.3), ...at(0, 0.13), up - f - 0.07, WHITE); // sill
  P(B(w + 0.36, 0.06, 0.24), ...at(0, 0.1), up + h + f, WHITE, nc); // drip cap
}

// The painted face of the price sign: three rows, a colour chip and a price
// with the tenth of a cent small and high. Numbers only (SPEC 9r).
function priceFace(prices) {
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = '#f3ecd8';
    ctx.fillRect(x - 10, y - 10, pw + 20, ph + 20);
    const pitch = ph / prices.length;
    prices.forEach((p, i) => {
      const cy = y + pitch * (i + 0.5);
      ctx.fillStyle = GRADES[i % GRADES.length];
      ctx.fillRect(x + pw * 0.06, cy - pitch * 0.3, pw * 0.12, pitch * 0.6);
      if (i) {
        ctx.fillStyle = 'rgba(40,30,20,0.35)';
        ctx.fillRect(x + pw * 0.04, y + pitch * i - 2, pw * 0.92, 4);
      }
      ctx.fillStyle = '#1d1d1d';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.font = `bold ${Math.round(pitch * 0.72)}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
      ctx.fillText(p, x + pw * 0.8, cy + pitch * 0.04);
      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.round(pitch * 0.38)}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
      ctx.fillText('9', x + pw * 0.82, cy - pitch * 0.14);
    });
  };
}

// ---------------------------------------------------------------- station

// b: the building; base: its floor height; P: places a part in b's frame.
export function buildGasStation(b, base, batch, P) {
  const look = LOOK[b.id] || LOOK.a_gas;
  const s = GAS.shop;
  const c = GAS.canopy;
  const nc = { cast: false };
  const front = s.ly - s.h / 2;
  const back = s.ly + s.h / 2;
  const east = s.lx + s.w / 2;

  // ---- Shop: bevelled walls on a darker base course, corner pilasters, a red
  // band between white pinstripes, and a coping on the parapet.
  P(vslab(s.w, s.h, 4 + FOUND, 0.12), s.lx, s.ly, -FOUND, WALL);
  P(vslab(s.w + 0.16, s.h + 0.16, 0.45 + FOUND, 0.16), s.lx, s.ly, -FOUND, 0xb5afa3);
  for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    P(vslab(0.36, 0.36, 3.0, 0.05), s.lx + lx * (s.w / 2 - 0.1), s.ly + ly * (s.h / 2 - 0.1), 0.4, 0xdcd8cc);
  }
  P(vslab(s.w + 0.4, s.h + 0.4, 0.62, 0.2, 0.04), s.lx, s.ly, 3.4, RED);
  for (const up of [3.36, 3.98]) P(vring(s.w + 0.46, s.h + 0.46, 0.06, 0.06, 0.22), s.lx, s.ly, up, WHITE, nc);
  P(vslab(s.w + 0.5, s.h + 0.5, 0.1, 0.24, 0.03), s.lx, s.ly, 4.04, 0x6f6c66);
  // Roof: a vent stack and a cooling unit, seen over the parapet.
  P(cyl(0.12, 0.7, 8), s.lx - 3, s.ly + 1.5, 4.1, STEEL);
  P(cyl(0.18, 0.08, 8), s.lx - 3, s.ly + 1.5, 4.8, DARK);
  P(vslab(1.1, 0.8, 0.6, 0.06), s.lx + 3.2, s.ly + 1.2, 4.1, 0xa9adab);
  for (let i = 0; i < 4; i++) P(box(0.9, 0.03, 0.02), s.lx + 3.2, s.ly + 0.79, 4.22 + i * 0.1, DARK, nc);

  // Big front window in three panes, toward the pumps.
  windowIn(P, s.lx - 1, front, '-y', 7.2, 1.6, 0.9, 3);
  // Side and back windows (the west wall is left bare: Earl's painted ad).
  windowIn(P, east, s.ly, '+x', 1.4, 1.0, 1.3, 2);
  windowIn(P, s.lx - 5, back, '+y', 1.2, 0.9, 1.4, 1);

  // Framed door with a glass top, a push bar, a step and a little roof.
  const dx = s.lx + 3.5;
  P(box(1.1, 2.1, 0.06), dx, front - 0.01, 0, 0x7f8c8d, nc);
  P(panel(0.7, 0.95, 0.03, 0.03), dx, front - 0.04, 1.4, WINDOW, nc);
  P(box(0.7, 0.06, 0.05), dx, front - 0.06, 1.0, CHROME, nc);
  P(box(0.04, 0.3, 0.06), dx + 0.42, front - 0.06, 0.85, CHROME, nc);
  const f = 0.12;
  P(box(1.1 + 2 * f, f, 0.18), dx, front - 0.05, 2.1, TRIM);
  for (const sx of [-1, 1]) P(box(f, 2.1, 0.18), dx + sx * (0.55 + f / 2), front - 0.05, 0, TRIM, nc);
  P(vslab(1.7, 0.8, 0.12, 0.05), dx, front - 0.4, 0, CONCRETE, nc);
  P(box(1.8, 0.07, 0.8), dx, front - 0.4, 2.55, RED, { extra: new THREE.Matrix4().makeRotationX(-0.18) });
  for (const sx of [-1, 1]) {
    P(box(0.05, 0.05, 0.75), dx + sx * 0.8, front - 0.38, 2.42, STEEL, { ...nc, extra: new THREE.Matrix4().makeRotationX(0.55) });
  }

  // Ice chest east of the door: white, a blue band, chrome handle, feet.
  const ix = east - 0.95;
  const iy = front - 0.42;
  for (const [fx, fy] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) P(box(0.06, 0.08, 0.06), ix + fx, iy + fy, 0, DARK, nc);
  P(vslab(1.1, 0.66, 0.82, 0.06, 0.03), ix, iy, 0.08, 0xf2f2ee);
  P(vslab(1.12, 0.68, 0.14, 0.06, 0.02), ix, iy, 0.56, 0x2f6fb0, nc);
  P(vslab(1.16, 0.72, 0.1, 0.07, 0.03), ix, iy, 0.9, 0xf2f2ee);
  P(box(0.4, 0.04, 0.05), ix, iy - 0.38, 0.82, CHROME, nc);

  // ---- Canopy: a red deck with white pinstripes, a lip hanging below a
  // recessed white soffit, a grey coping, and edge lights round the soffit.
  const cw = c.w + 0.5;
  const ch = c.h + 0.5;
  P(vslab(cw, ch, 0.55, 0.45, 0.04), c.lx, c.ly, 4.85, RED);
  P(vring(cw, ch, 0.12, 0.26, 0.45), c.lx, c.ly, 4.6, RED);
  P(box(cw - 0.3, 0.03, ch - 0.3), c.lx, c.ly, 4.82, WHITE, nc);
  for (const [up, hh] of [[4.98, 0.08], [5.34, 0.05]]) P(vring(cw + 0.04, ch + 0.04, 0.03, hh, 0.47), c.lx, c.ly, up, WHITE, nc);
  P(vslab(cw - 0.1, ch - 0.1, 0.06, 0.4, 0.02), c.lx, c.ly, 5.4, 0x8a8780, nc);
  const lamp = (lx, ly) => {
    P(box(0.4, 0.05, 0.4), lx, ly, 4.77, 0xd6d3ca, nc);
    P(box(0.32, 0.03, 0.32), lx, ly, 4.745, 0xfffbe6, nc);
  };
  const nx = 12;
  for (let i = 0; i < nx; i++) {
    const lx = c.lx - c.w / 2 + 0.9 + ((c.w - 1.8) * i) / (nx - 1);
    lamp(lx, c.ly - c.h / 2 + 0.55);
    lamp(lx, c.ly + c.h / 2 - 0.55);
  }
  for (const sx of [-1, 1]) lamp(c.lx + sx * (c.w / 2 - 0.55), c.ly);

  // ---- Islands: bevelled kerbs, a column, two round-top pumps each, yellow
  // bollards at the ends, a squeegee bucket; the east one has the oil rack.
  GAS.islands.forEach((isl, k) => {
    P(vslab(isl.w, isl.h, 0.2, 0.45, 0.03), isl.lx, isl.ly, 0, CONCRETE);
    P(vring(isl.w, isl.h, 0.08, 0.205, 0.45), isl.lx, isl.ly, 0, 0xd9b43a, nc);
    P(vslab(0.5, 0.5, 0.2, 0.06), isl.lx, isl.ly, 0.2, 0xb8b6ae);
    P(vslab(0.42, 0.42, 4.4, 0.07), isl.lx, isl.ly, 0.2, 0xd8d8d0);
    for (const dx2 of [-1.1, 1.1]) {
      roundPump(P, isl.lx + dx2, isl.ly, 0.2, { body: look.pump, panel: look.panel, top: look.top, side: dx2 < 0 ? -1 : 1 });
    }
    P(cyl(0.14, 0.3, 8, 0.16), isl.lx + 0.4, isl.ly + 0.45, 0.2, 0x2f6b45, nc);
    P(box(0.02, 0.5, 0.02), isl.lx + 0.45, isl.ly + 0.45, 0.4, 0x6a4c2e, nc);
    const ends = k === GAS.islands.length - 1 ? [-1] : [-1, 1];
    for (const e of ends) {
      P(cyl(0.09, 0.85, 8), isl.lx + e * (isl.w / 2 - 0.2), isl.ly, 0.2, 0xe2b524);
      P(cyl(0.1, 0.05, 8), isl.lx + e * (isl.w / 2 - 0.2), isl.ly, 1.05, 0x2a2a2a, nc);
    }
    if (k === GAS.islands.length - 1) oilRack(P, isl.lx + isl.w / 2 - 0.24, isl.ly, 0.2);
  });

  // ---- Price sign by the road: two posts, a round-topped cabinet, the
  // painted prices on both faces.
  const sg = GAS.sign;
  for (const sx of [-1, 1]) {
    P(vslab(0.3, 0.3, 0.25, 0.08), sg.lx + sx * 0.85, sg.ly, -0.1, CONCRETE);
    P(cyl(0.07, 3.0, 8), sg.lx + sx * 0.85, sg.ly, 0.1, STEEL);
  }
  const SW = 2.1;
  const SH = 1.7;
  const up0 = 2.6;
  P(slab(outline([[-SW / 2, 0, 0.08], [SW / 2, 0, 0.08], [SW / 2, SH, 0.3], [-SW / 2, SH, 0.3]]), 0.26, 0.04, 'xy', 0, 4), sg.lx, sg.ly, up0, RED);
  P(slab(roundTop(SW * 0.6, 0.5), 0.2, 0.03, 'xy', 0, 6), sg.lx, sg.ly, up0 + SH - 0.08, RED);
  P(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 14).rotateX(Math.PI / 2), sg.lx, sg.ly, up0 + SH + 0.16, WHITE, nc);
  if (batch.faces) {
    const fw = SW - 0.3;
    const fh = SH - 0.3;
    const key = `gasprice:${look.prices.join('|')}`;
    const draw = priceFace(look.prices);
    const mid = up0 + SH / 2;
    batch.faces.add(key, fw, fh, 140, draw, objMatrix(b.x, b.y, base, b.angle || 0, sg.lx, sg.ly - 0.135, mid));
    batch.faces.add(key, fw, fh, 140, draw, objMatrix(b.x, b.y, base, b.angle || 0, sg.lx, sg.ly + 0.135, mid, new THREE.Matrix4().makeRotationY(Math.PI)));
  }
  if (batch.audit) {
    const p = objMatrix(b.x, b.y, base, b.angle || 0, sg.lx, sg.ly, 0);
    const v = new THREE.Vector3().setFromMatrixPosition(p);
    batch.audit.rect(`${b.id}_sign`, 'gas_sign', v.x, v.z, sg.w, sg.h, b.angle || 0, base - 0.1, base);
  }
}

// A wire rack of quart oil cans: two posts, three shelves, cans in three colours.
function oilRack(P, x, y, up) {
  const nc = { cast: false };
  for (const sy of [-1, 1]) P(box(0.03, 1.0, 0.03), x, y + sy * 0.32, up, DARK, nc);
  const cans = [0x1f4f9a, 0xd8b021, 0xb3261e, 0x2b7a3d];
  for (let k = 0; k < 3; k++) {
    const h = up + 0.18 + k * 0.32;
    P(box(0.26, 0.025, 0.7), x, y, h, DARK, nc);
    if (k === 2) continue;
    for (let i = 0; i < 4; i++) P(cyl(0.05, 0.16, 6), x, y - 0.24 + i * 0.16, h + 0.025, cans[(i + k) % cans.length], nc);
  }
}
