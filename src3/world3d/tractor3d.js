// The farm tractor (#65, SPEC 9r): the slow tractors on dirt roads near
// farms (src/ambient/hazards.js), drawn at the farm truck's level of detail
// (farmtruck3d.js). Our own design: a row-crop tractor with a four-post cab
// and a light roof, a rounded hood that drops a little to the front, a grille
// with paint bars and round lamps, suitcase weights on the nose, an exhaust
// stack and an air cleaner bowl, rear fenders arched over big lugged tires
// on dished rims, a step ladder to the door, a three-point hitch and drawbar,
// and the orange slow-moving-vehicle triangle on the back.
//
//   tractorInto(B)   // B: see roundShapes.js (traffic3d.js builds the coarse body)
//
// Only hazards3d.js draws it, at most a handful at once and only within
// 500 m, so it draws all its pieces whatever B.fine says. The paint tints
// the hood, fenders, cab panels and posts; roof and rims stay cream.
// Car space: x right, y up, z back (the front is at -z), base on y = 0.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { outline, slab, warp, poly } from './roundShapes.js';

export const TRACTOR = {
  front: -1.25, // front axle z
  rear: 0.85, // rear axle z
  frontR: 0.44,
  rearR: 0.8,
  frontX: 0.7, // wheel centres across
  rearX: 0.93,
};

// A tire as a lathe (round shoulders, the sidewall bulging past the rim),
// axis along x, centred on the origin. lugs: chevron bars across the tread
// (a big rear tire); ribs: raised rings round it (a steering front tire).
function tire(R, W, rimR, { lugs = 0, ribs = 0 } = {}) {
  const h = W / 2;
  const prof = [
    [rimR, -h + 0.02], [rimR + 0.06, -h - 0.01], [R - 0.16, -h - 0.025], [R - 0.07, -h + 0.005],
    [R - 0.045, -h + 0.05], [R - 0.045, h - 0.05], [R - 0.07, h - 0.005], [R - 0.16, h + 0.025],
    [rimR + 0.06, h + 0.01], [rimR, h - 0.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const parts = [new THREE.LatheGeometry(prof, 22).rotateZ(Math.PI / 2)];
  const lugParts = [];
  if (lugs) {
    // Two rows of bars, each from a shoulder in toward the middle, slanted
    // the same way so they make a chevron, the rows half a step apart.
    const L = h * 1.05;
    for (let i = 0; i < lugs; i++) {
      for (const side of [-1, 1]) {
        const a = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
        lugParts.push(new THREE.BoxGeometry(L, 0.06, 0.08)
          .rotateY(side * 0.6)
          .translate(side * (h - L / 2 - 0.01), R - 0.05, 0)
          .rotateX(a));
      }
    }
  }
  for (let k = 0; k < ribs; k++) {
    const x = -h + ((k + 1) * W) / (ribs + 1);
    parts.push(new THREE.TorusGeometry(R - 0.045, 0.018, 4, 22).rotateY(Math.PI / 2).translate(x, 0, 0));
  }
  return { body: parts, lugs: lugParts.length ? mergeGeometries(lugParts) : null };
}

// A wheel at (x, y, z) on side s (-1 left, 1 right): tire, then a dished
// rim with a hub and bolts on the outer face, a plain disc on the inner.
function wheelInto(B, R, W, rimR, x, y, z, s, kind) {
  const t = tire(R, W, rimR, kind);
  for (const g of t.body) B.smooth(g.translate(x, y, z), 'rubber');
  if (t.lugs) B.geo(t.lugs.translate(x, y, z), 'rubber');
  const h = W / 2;
  // Rim band inside the bead, the dished centre set in from the outer face.
  B.geo(new THREE.CylinderGeometry(rimR, rimR, W - 0.03, 18, 1, true).rotateZ(Math.PI / 2).translate(x, y, z), 'rim');
  const dish = rimR * 0.72;
  B.geo(new THREE.CylinderGeometry(dish, rimR, 0.07, 18, 1, true).rotateZ(-s * Math.PI / 2).translate(x + s * (h - 0.06), y, z), 'rim');
  B.geo(new THREE.CircleGeometry(dish, 18).rotateY(s * Math.PI / 2).translate(x + s * (h - 0.095), y, z), 'rim');
  B.geo(new THREE.CircleGeometry(rimR, 14).rotateY(-s * Math.PI / 2).translate(x - s * (h - 0.02), y, z), 'rim');
  // Hub: a steel cap and a ring of bolts.
  B.geo(new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.26, 0.09, 12).rotateZ(-s * Math.PI / 2).translate(x + s * (h - 0.05), y, z), 'steel');
  const nb = 8;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    B.box(x + s * (h - 0.085), y + Math.cos(a) * rimR * 0.4, z + Math.sin(a) * rimR * 0.4, 0.03, 0.035, 0.035, 'steel');
  }
}

export function tractorInto(B) {
  const { front: FZ, rear: RZ, frontR: FR, rearR: RR, frontX: FX, rearX: RX } = TRACTOR;

  // ---- running gear: engine block, transmission, axles ----
  B.box(0, 0.62, -1.0, 0.56, 0.36, 1.5, 'black'); // engine block and oil pan
  B.box(0, 0.88, 0.25, 0.6, 0.6, 1.1, 'black'); // transmission housing
  B.box(0, 0.9, 0.9, 0.66, 0.66, 0.5, 'black'); // differential
  B.geo(new THREE.CylinderGeometry(0.11, 0.13, RX * 2 - 0.4, 10).rotateZ(Math.PI / 2).translate(0, RR, RZ), 'black'); // rear axle housings
  B.box(0, FR + 0.04, FZ, FX * 2 - 0.3, 0.12, 0.14, 'black'); // front axle beam
  for (const s of [-1, 1]) B.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8).translate(s * (FX - 0.16), FR + 0.04, FZ), 'steel'); // king pins
  // Oil filter and a few castings on the block sides.
  for (const s of [-1, 1]) {
    B.box(s * 0.29, 0.66, -1.35, 0.04, 0.16, 0.3, 'black');
    B.box(s * 0.29, 0.6, -0.75, 0.05, 0.12, 0.2, 'steel');
  }

  // ---- hood: rounded top corners, dropping toward the grille ----
  const hood = outline([[-0.4, 0.8, 0.03], [0.4, 0.8, 0.03], [0.4, 1.44, 0.15], [-0.4, 1.44, 0.15]]);
  const hg = slab(hood, 1.6, 0.04, 'xy', -1.05, 5);
  B.smooth(warp(hg, (v) => {
    const t = Math.min(1, Math.max(0, (-v.z - 0.45) / 1.4));
    if (v.y > 1.1) v.y -= 0.08 * t * t;
  }), 'paint');
  // Side vents: a recessed black panel with paint louvers.
  for (const s of [-1, 1]) {
    B.geo(poly([[s * 0.402, 1.0, -1.62], [s * 0.402, 1.0, -0.95], [s * 0.402, 1.27, -0.95], [s * 0.402, 1.27, -1.62]], [s, 0, 0]), 'black');
    for (let k = 0; k < 4; k++) B.box(s * 0.41, 1.04 + k * 0.065, -1.285, 0.02, 0.022, 0.66, 'paint');
    // A stripe along the hood side under the top edge.
    B.box(s * 0.405, 1.33 - 0.02, -1.05, 0.012, 0.03, 1.5, 'cream');
  }
  // Grille: a dark mesh in a paint surround, paint bars across, round lamps.
  const gz = -1.855;
  B.pic([0, 1.06, gz - 0.003], [-1, 0, 0], [0, 1, 0], 0.62, 0.44, 'grille');
  for (const y of [0.86, 1.27]) B.box(0, y, gz - 0.015, 0.74, 0.05, 0.04, 'paint');
  for (const x of [-0.345, 0.345]) B.box(x, 1.065, gz - 0.015, 0.05, 0.46, 0.04, 'paint');
  for (let k = 0; k < 3; k++) B.box(0, 0.94 + k * 0.075, gz - 0.02, 0.64, 0.02, 0.025, 'paint');
  B.box(0, 1.17, gz - 0.02, 0.025, 0.16, 0.025, 'paint'); // centre bar between the lamps
  for (const s of [-1, 1]) {
    B.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14).rotateX(Math.PI / 2).translate(s * 0.2, 1.17, gz - 0.01), 'chrome');
    B.disc([s * 0.2, 1.17, gz - 0.037], [0, 0, -1], 0.058, 'head');
  }

  // ---- nose: weight bracket with suitcase weights ----
  B.box(0, 0.6, -1.95, 0.6, 0.2, 0.22, 'steel');
  for (let k = 0; k < 6; k++) {
    const x = -0.3 + (k + 0.5) * 0.1;
    B.box(x, 0.72, -2.1, 0.085, 0.34, 0.26, 'black');
    B.bar([x, 0.92, -2.18], [x, 0.92, -2.02], 0.02, 0.03, 'steel');
  }

  // ---- stack, air cleaner, cowl ----
  B.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.7, 12).translate(0.24, 1.75, -0.7), 'black'); // muffler
  B.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 10).translate(0.24, 2.38, -0.7), 'exhaust');
  B.box(0.24, 2.7, -0.69, 0.11, 0.015, 0.11, 'black', 0.4); // rain cap, tipped open
  B.geo(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 8).translate(-0.24, 1.58, -0.72), 'black');
  B.geo(new THREE.CylinderGeometry(0.095, 0.08, 0.15, 14).translate(-0.24, 1.82, -0.72), 'glass'); // pre-cleaner bowl
  B.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14).translate(-0.24, 1.91, -0.72), 'black');
  B.box(0, 1.45, -0.35, 0.86, 0.18, 0.2, 'paint'); // cowl under the windshield

  // ---- rear fenders: an arched band over each tire ----
  const a0 = 0.15;
  const a1 = Math.PI - 0.08;
  const band = outline([
    { arc: [RZ, RR, RR + 0.12, a0, a1] },
    { arc: [RZ, RR, RR + 0.07, a1, a0, true] },
  ]);
  for (const s of [-1, 1]) {
    B.smooth(slab(band, 0.52, 0.015, 'zy', s * RX, 5), 'paint');
    // Outer lip, and the inner wall down to the cab floor.
    B.smooth(slab(outline([{ arc: [RZ, RR, RR + 0.13, a0, a1] }, { arc: [RZ, RR, RR + 0.1, a1, a0, true] }]), 0.03, 0.008, 'zy', s * (RX + 0.27), 4), 'paint');
    // Fender lamps standing on the band at the back: amber facing ahead,
    // red behind.
    const lz = 0.62;
    const ly = RR + Math.sqrt((RR + 0.12) ** 2 - lz * lz) + 0.06;
    B.box(s * (RX + 0.12), ly, RZ + lz, 0.14, 0.09, 0.14, 'black');
    B.box(s * (RX + 0.12), ly - 0.06, RZ + lz, 0.03, 0.06, 0.03, 'black');
    B.pic([s * (RX + 0.12), ly, RZ + lz + 0.072], [1, 0, 0], [0, 1, 0], 0.11, 0.06, 'tail');
    B.disc([s * (RX + 0.12), ly, RZ + lz - 0.072], [0, 0, -1], 0.04, 'indicator');
  }

  // ---- cab: floor, lower panels, four posts, glass, roof ----
  const cz0 = -0.45;
  const cz1 = 1.1;
  const cx = 0.7;
  const y0 = 1.25; // floor
  const yg = 1.5; // bottom of the front and rear glass
  const yr = 2.42; // roof line
  B.box(0, y0 - 0.03, (cz0 + cz1) / 2, cx * 2, 0.08, cz1 - cz0, 'black');
  // Lower panels: the rear one carries the SMV triangle; sides a thin sill.
  B.box(0, (y0 + yg) / 2, cz1 - 0.02, cx * 2 - 0.06, yg - y0, 0.04, 'paint');
  B.box(0, (y0 + yg) / 2 + 0.05, cz0 + 0.02, cx * 2 - 0.06, yg - y0 - 0.1, 0.04, 'paint');
  for (const s of [-1, 1]) B.box(s * (cx - 0.02), y0 + 0.05, (cz0 + cz1) / 2, 0.04, 0.12, cz1 - cz0, 'paint');
  // Posts, rounded: a short outline extruded up.
  const post = outline([[-0.04, -0.04, 0.02], [0.04, -0.04, 0.02], [0.04, 0.04, 0.02], [-0.04, 0.04, 0.02]]);
  for (const x of [-cx, cx]) {
    for (const z of [cz0, cz1]) {
      const g = slab(post, yr - y0, 0.01, 'xy', 0, 3).rotateX(-Math.PI / 2).translate(x, 0, z);
      // (after rotateX the slab runs from y = -(h/2) to h/2 about 0)
      B.smooth(g.translate(0, (y0 + yr) / 2, 0), 'paint');
    }
  }
  // Glass in black rubber frames, set just inside the posts.
  const pane = (pts, n, inset) => {
    const c = [0, 1, 2].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
    const shrink = (p, d) => p.map((v, k) => v + (c[k] - v) * d);
    B.geo(poly(pts, n), 'black');
    B.geo(poly(pts.map((p) => shrink(p, inset).map((v, k) => v + n[k] * 0.004)), n), 'glass');
  };
  const fz = cz0 - 0.005;
  pane([[-cx + 0.04, yg, fz], [cx - 0.04, yg, fz], [cx - 0.04, yr - 0.03, fz], [-cx + 0.04, yr - 0.03, fz]], [0, 0, -1], 0.05);
  const bz = cz1 + 0.005;
  pane([[-cx + 0.04, yg, bz], [cx - 0.04, yg, bz], [cx - 0.04, yr - 0.03, bz], [-cx + 0.04, yr - 0.03, bz]], [0, 0, 1], 0.05);
  for (const s of [-1, 1]) {
    const x = s * (cx + 0.005);
    // Door (front part) and a fixed rear side window, split by a frame bar.
    pane([[x, y0 + 0.12, cz0 + 0.05], [x, y0 + 0.12, 0.38], [x, yr - 0.03, 0.38], [x, yr - 0.03, cz0 + 0.05]], [s, 0, 0], 0.04);
    pane([[x, y0 + 0.3, 0.44], [x, y0 + 0.3, cz1 - 0.05], [x, yr - 0.03, cz1 - 0.05], [x, yr - 0.03, 0.44]], [s, 0, 0], 0.05);
    B.box(s * (cx + 0.01), (y0 + yr) / 2 + 0.06, 0.41, 0.03, yr - y0 - 0.12, 0.06, 'paint');
    B.box(s * (cx + 0.03), 1.9, 0.3, 0.04, 0.03, 0.12, 'chrome'); // handle
    for (const y of [1.55, 2.2]) B.box(s * (cx + 0.02), y, cz0 + 0.03, 0.03, 0.12, 0.04, 'black'); // hinges
  }
  // Roof: cream, rounded at every corner, a little domed, with a visor lip.
  const roof = outline([[-0.8, 0, 0.06], [0.8, 0, 0.03], [0.8, 0.14, 0.08], [-0.8, 0.14, 0.08]]);
  const rg = slab(roof, cz1 - cz0 + 0.26, 0.05, 'xy', (cz0 + cz1) / 2 + 0.02, 4);
  B.smooth(warp(rg.translate(0, yr, 0), (v) => {
    if (v.y > yr + 0.07) v.y += 0.06 * (1 - (v.x / 0.8) ** 2);
  }), 'cream');
  B.box(0, yr + 0.02, cz0 - 0.13, 1.5, 0.03, 0.08, 'black'); // visor lip
  B.box(0, yr + 0.25, 0.55, 0.62, 0.12, 0.6, 'cream'); // air conditioner hump
  for (const x of [-0.2, 0, 0.2]) B.box(x, yr + 0.31, 0.55, 0.12, 0.005, 0.5, 'black'); // its grille slots
  // Work lights: two at the front of the roof, two at the back.
  for (const s of [-1, 1]) {
    for (const [z, dz] of [[cz0 - 0.1, -1], [cz1 + 0.1, 1]]) {
      B.box(s * 0.55, yr + 0.08, z, 0.16, 0.12, 0.08, 'black');
      B.disc([s * 0.55, yr + 0.08, z + dz * 0.041], [0, 0, dz], 0.05, 'head');
    }
  }
  // Beacon on the left rear corner.
  B.geo(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 10).translate(-0.58, yr + 0.2, 1.05), 'black');
  B.geo(new THREE.CylinderGeometry(0.05, 0.055, 0.11, 10).translate(-0.58, yr + 0.29, 1.05), 'amber');
  // Mirrors on arms off the front posts.
  for (const s of [-1, 1]) {
    B.bar([s * cx, 2.15, cz0], [s * (cx + 0.32), 2.2, cz0 - 0.05], 0.025, 0.025, 'black');
    B.box(s * (cx + 0.34), 2.12, cz0 - 0.05, 0.05, 0.26, 0.16, 'black');
    B.box(s * (cx + 0.34), 2.12, cz0 - 0.132, 0.04, 0.22, 0.004, 'mirror');
  }

  // ---- step ladder to the door (left), fuel tank (right) ----
  for (const [k, y] of [0.42, 0.78, 1.1].entries()) {
    B.box(-0.68 + k * 0.02, y, -0.2, 0.3, 0.025, 0.28, 'steel');
  }
  for (const z of [-0.34, -0.06]) B.bar([-0.82, 0.38, z], [-0.62, 1.2, z], 0.03, 0.03, 'black');
  B.bar([-0.78, 1.3, cz0 + 0.03], [-0.78, 2.1, cz0 + 0.03], 0.03, 0.03, 'black'); // grab rail
  const tank = outline([[0, 0, 0.08], [0.3, 0, 0.08], [0.3, 0.36, 0.08], [0, 0.36, 0.08]]);
  B.smooth(slab(tank, 0.34, 0.03, 'xy', -0.2, 3).translate(0.36, 0.72, 0), 'paint');
  B.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10).translate(0.5, 1.1, -0.2), 'black'); // filler cap

  // ---- rear: hitch, PTO, drawbar, SMV triangle ----
  for (const s of [-1, 1]) {
    B.bar([s * 0.3, 0.6, 1.05], [s * 0.36, 0.42, 1.75], 0.06, 0.06, 'black'); // lower links
    B.bar([s * 0.22, 1.18, 1.1], [s * 0.34, 0.6, 1.4], 0.04, 0.04, 'black'); // lift rods
    B.geo(new THREE.SphereGeometry(0.045, 8, 6).translate(s * 0.36, 0.42, 1.77), 'steel'); // ball ends
  }
  B.bar([0, 1.15, 1.12], [0, 1.05, 1.62], 0.06, 0.06, 'steel'); // top link
  B.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10).rotateX(Math.PI / 2).translate(0, 0.78, 1.22), 'steel'); // PTO stub
  B.geo(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0.78, 1.2), 'black'); // its guard
  B.box(0, 0.46, 1.35, 0.14, 0.05, 0.6, 'steel'); // drawbar
  B.geo(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8).translate(0, 0.52, 1.6), 'black'); // hitch pin
  // Slow-moving-vehicle emblem: red border, orange middle, on the cab back.
  const tri = (r, dz) => {
    const pts = [0, 1, 2].map((k) => {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      return [-0.42 + Math.cos(a) * r, 1.36 + Math.sin(a) * r, cz1 + dz];
    });
    return poly(pts, [0, 0, 1]);
  };
  B.geo(tri(0.19, 0.03), 'tail');
  B.geo(tri(0.13, 0.034), 'amber');
  B.box(-0.42, 1.36, cz1 + 0.012, 0.06, 0.08, 0.02, 'black'); // bracket

  // ---- wheels ----
  for (const s of [-1, 1]) {
    wheelInto(B, RR, 0.44, 0.52, s * RX, RR, RZ, s, { lugs: 20 });
    wheelInto(B, FR, 0.22, 0.24, s * FX, FR, FZ, s, { ribs: 3 });
    // Front wheel hubs stand out on stub spindles.
    B.geo(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8).rotateZ(Math.PI / 2).translate(s * (FX - 0.1), FR, FZ), 'black');
  }
}
