// Far stand-ins (#62): what a traffic car looks like past FAR m (trafficlod.js).
// One geometry holds three shapes: the low car (sedans, wagons, pickups,
// hatches, farm trucks, the 6x6), the tall panel van and the boxy 4x4, each
// with a real side profile (raked or upright glass, wheel arches, rounded
// edges), glass set on the body, lamps, bumpers, mirrors and a roof rack
// for cars that carry one. Every piece is tagged with its far bit
// (FAR_BIT), and the traffic shader folds away the pieces a car's mask
// (farMask) leaves out, so the three shapes share one draw call.
// Sizes follow the coarse bodies (carbody.js SPECS.van, fourbyfour.js), so
// the switch at FAR doesn't change the outline.
//
//   const geo = farStandIns(h)   // h: traffic3d.js helpers { tag, box, quadZ, wheel }

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPECS } from './carbody.js';
import { FOURBYFOUR, FOUR } from './fourbyfour.js';
import { outline, slab, poly } from './roundShapes.js';
import { FAR_BIT } from './trafficlod.js';

// Set the far bit of every piece (carPart.y = bit + 1; 0 would show on all).
function tagBit(parts, piece) {
  for (const g of parts) {
    const cp = g.attributes.carPart.array;
    for (let i = 1; i < cp.length; i += 2) cp[i] = FAR_BIT[piece] + 1;
  }
  return parts;
}

// Side profile in (z, y): body bottom y0 with arches cut over the wheels,
// then the given top points from the back to the front.
function profile(S, top) {
  const arches = [...S.wheels.map(([z]) => z)].sort((a, b) => b - a); // back first
  const items = [];
  const half = S.half;
  items.push([half, S.y0, 0.08]);
  for (const wz of arches) {
    const R = S.archR;
    const a = Math.asin(Math.max(-1, Math.min(1, (S.y0 - S.wheelY) / R)));
    items.push({ arc: [wz, S.wheelY, R, a, Math.PI - a] });
  }
  items.push([-half, S.y0, 0.08]);
  for (const p of top) items.push(p);
  return outline(items);
}

// Glass on a raked face in (z, y) from a to b, x across, pushed out 1 cm.
function rakedGlass(a, b, x) {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dz, dy);
  const nz = -dy / L;
  const ny = dz / L;
  const o = 0.012;
  const p = ([z, y], sx) => [sx * x, y + ny * o, z + nz * o];
  return poly([p(a, -1), p(a, 1), p(b, 1), p(b, -1)], [0, ny, nz]);
}
// A flat panel on both sides at x = +-x, (z, y) points.
function sides(h, pts, x, m) {
  return [-1, 1].map((s) => h.tag(poly(pts.map(([z, y]) => [s * x, y, z]), [s, 0, 0]), m));
}
// A thin bar from a to b (car space), th thick.
function rod(h, a, b, th, m) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const mm = new THREE.Matrix4().lookAt(va, vb, new THREE.Vector3(0, 1, 0));
  mm.setPosition(va.clone().add(vb).multiplyScalar(0.5));
  return h.tag(new THREE.BoxGeometry(th, th, va.distanceTo(vb)).applyMatrix4(mm), m);
}
// Wheels: an eight-sided tire and a six-sided hub.
function wheels(h, S, x, w) {
  const out = [];
  for (const [z] of S.wheels) for (const s of [-1, 1]) {
    out.push(h.tag(new THREE.CylinderGeometry(S.wheelR, S.wheelR, w, 8).rotateZ(Math.PI / 2).translate(s * x, S.wheelR, z), 'rubber'));
    out.push(h.tag(new THREE.CylinderGeometry(S.wheelR * 0.55, S.wheelR * 0.55, w + 0.02, 6).rotateZ(Math.PI / 2).translate(s * x, S.wheelR, z), 'hub'));
  }
  return out;
}
// Dark wheel wells inside the arches, so the arch cuts don't show daylight.
function wells(h, S, x) {
  return S.wheels.map(([z]) => h.box(x * 2, S.archR, S.archR * 2 - 0.04, 0, S.wheelY + S.archR / 2, z, 'liner'));
}
// A low roof rack: two rails on short feet and cross bars.
function rack(h, z0, z1, y, fx) {
  const out = [];
  for (const s of [-1, 1]) out.push(h.box(0.05, 0.05, z1 - z0, s * fx, y + 0.08, (z0 + z1) / 2, 'rack'));
  for (const z of [z0, (z0 + z1) / 2, z1]) {
    out.push(h.box(fx * 2 + 0.05, 0.035, 0.05, 0, y + 0.04, z, 'rack'));
    for (const s of [-1, 1]) out.push(h.box(0.04, 0.1, 0.04, s * fx, y + 0.03, z, 'rack'));
  }
  return out;
}

// The panel van: short hood, raked screen, tall box, flat rear doors.
function van(h) {
  const S = SPECS.van;
  const half = S.half;
  const hw = S.hw;
  const roof = S.roofY;
  const scrTop = [S.zR0 - 0.04, roof - 0.07];
  const scrBase = [S.zA, S.belt(S.zA)];
  const body = profile(S, [[-half, S.belt(-half), 0.16], [scrBase[0], scrBase[1], 0.05], [scrTop[0], scrTop[1], 0.12], [half, roof, 0.2]]);
  const parts = [h.tag(slab(body, hw * 2, 0.09, 'zy', 0, 3), 'paint')];
  // Windscreen, the cab door windows (following the screen's rake), rear door glass.
  const at = (t) => [scrBase[0] + (scrTop[0] - scrBase[0]) * t, scrBase[1] + (scrTop[1] - scrBase[1]) * t];
  parts.push(h.tag(rakedGlass(at(0.05), at(0.93), S.ghw - 0.04), 'glass'));
  const wY0 = S.belt(-0.8) + 0.06;
  const wY1 = roof - 0.2;
  const aAt = (y) => scrBase[0] + ((y - scrBase[1]) / (scrTop[1] - scrBase[1])) * (scrTop[0] - scrBase[0]) + 0.1;
  parts.push(...sides(h, [[aAt(wY0), wY0], [S.windows[0][1], wY0], [S.windows[0][1], wY1], [aAt(wY1), wY1]], hw + 0.004, 'glass'));
  for (const x of [-1, 1]) parts.push(h.quadZ(0.72, 0.42, x * 0.43, 1.6, half + 0.012, 'glass'));
  // Door gaps: the rear door split, the cab door and the sliding door (right side).
  parts.push(h.quadZ(0.025, roof - S.y0 - 0.2, 0, (roof + S.y0) / 2, half + 0.014, 'black'));
  for (const z of [S.bPillar[1] + 0.02, S.wheels[1][0] - S.archR - 0.1]) {
    parts.push(h.tag(poly([[hw + 0.005, S.y0 + 0.1, z - 0.012], [hw + 0.005, S.y0 + 0.1, z + 0.012], [hw + 0.005, wY1 + 0.08, z + 0.012], [hw + 0.005, wY1 + 0.08, z - 0.012]], [1, 0, 0]), 'black'));
  }
  // Front: grille, square lamps; back: tall tail lamps. Bumpers, plates.
  const ly = (S.belt(-half) + S.y0 + 0.2) / 2 + 0.02;
  parts.push(h.quadZ(0.9, 0.17, 0, ly, -half - 0.012, 'black'));
  for (const x of [-1, 1]) {
    parts.push(h.quadZ(0.3, 0.17, x * (hw - 0.27), ly, -half - 0.014, 'head'));
    parts.push(h.quadZ(0.14, 0.5, x * (hw - 0.12), 0.95, half + 0.014, 'tail'));
    parts.push(h.box(0.07, 0.2, 0.12, x * (hw + 0.11), S.belt(S.zA) + 0.22, S.zA + 0.18, 'black'));
  }
  for (const s of [-1, 1]) {
    parts.push(h.box(hw * 2 - 0.04, 0.16, 0.14, 0, S.y0 + 0.14, s * (half + 0.04), 'chrome'));
    parts.push(h.quadZ(0.3, 0.15, 0, S.y0 + 0.14, s * (half + 0.112), 'plate'));
  }
  parts.push(...wheels(h, S, hw - 0.1, 0.22), ...wells(h, S, hw - 0.04));
  // Van paint: mask 3, so the stripe and lower tone show (traffic3d.js shader).
  for (const g of parts) {
    const cp = g.attributes.carPart.array;
    if (cp[0] === 1) for (let i = 0; i < cp.length; i += 2) cp[i] = 3;
  }
  tagBit(parts, 'van');
  const racks = tagBit(rack(h, S.zR0 + 0.25, half - 0.2, roof, hw - 0.2), 'vanRack');
  return [...parts, ...racks];
}

// The boxy 4x4: square hood, upright screen, flat roof to a square back,
// three side windows, black arch flares, the spare on the back door.
function fourByFour(h) {
  const S = FOURBYFOUR;
  const half = S.half;
  const hw = S.hw;
  const roof = S.roofY;
  const scrBase = [S.zA, S.belt(S.zA)];
  const scrTop = [S.zR0, roof - 0.04];
  const body = profile(S, [[-half, S.belt(-half), 0.1], [scrBase[0], scrBase[1], 0.03], [scrTop[0], scrTop[1], 0.08], [half, roof, 0.12]]);
  const parts = [h.tag(slab(body, hw * 2, 0.07, 'zy', 0, 3), 'paint')];
  const at = (t) => [scrBase[0] + (scrTop[0] - scrBase[0]) * t, scrBase[1] + (scrTop[1] - scrBase[1]) * t];
  parts.push(h.tag(rakedGlass(at(0.06), at(0.92), S.ghw - 0.06), 'glass'));
  const wY0 = S.belt(0) + 0.05;
  const wY1 = roof - 0.13;
  for (const [z0, z1] of S.windows) parts.push(...sides(h, [[z0 + 0.03, wY0], [z1 - 0.03, wY0], [z1 - 0.03, wY1], [z0 + 0.03 + (z0 < -0.5 ? 0.06 : 0), wY1]], hw + 0.004, 'glass'));
  parts.push(h.quadZ(1.22, 0.48, 0, 1.57, half + 0.012, 'glass'));
  // Front: grille panel, square lamps; back: tail lamps; satin bumpers, plates.
  parts.push(h.quadZ(hw * 2 - 0.22, 0.26, 0, FOUR.headY, -half - 0.012, 'black'));
  for (const x of [-1, 1]) {
    parts.push(h.quadZ(0.2, 0.2, x * FOUR.headX, FOUR.headY, -half - 0.016, 'head'));
    parts.push(h.quadZ(0.15, 0.3, x * (hw - 0.13), FOUR.tailY, half + 0.012, 'tail'));
    parts.push(h.box(0.05, 0.2, 0.14, x * (hw + 0.12), S.belt(S.zA + 0.2) + 0.16, S.zA + 0.2, 'black'));
    parts.push(h.box(0.12, 0.05, 1.2, x * (hw - 0.01), 0.47, (S.wheels[0][0] + S.wheels[1][0]) / 2, 'black'));
  }
  for (const s of [-1, 1]) {
    parts.push(h.box(hw * 2 + 0.04, 0.2, 0.16, 0, FOUR.bumperY, s * (half + FOUR.bumperZ), 'satin'));
    parts.push(h.quadZ(0.3, 0.15, 0, FOUR.bumperY, s * (half + FOUR.bumperZ + 0.082), 'plate'));
  }
  // Arch flares: three straight pieces over each wheel.
  const R = S.archR + 0.035;
  for (const [wz] of S.wheels) for (const x of [-1, 1]) {
    const pt = (a) => [x * (hw + 0.02), S.wheelY + R * Math.sin(a), wz + R * Math.cos(a)];
    const A = [0.28, 1.2, 1.94, Math.PI - 0.28];
    for (let k = 0; k < 3; k++) parts.push(rod(h, pt(A[k]), pt(A[k + 1]), 0.09, 'black'));
  }
  // The spare on the back door.
  const sp = FOUR.spare;
  parts.push(h.tag(new THREE.CylinderGeometry(S.wheelR, S.wheelR, FOUR.tyreW, 8).rotateX(Math.PI / 2).translate(sp.x, sp.y, sp.z), 'rubber'));
  parts.push(h.tag(new THREE.CylinderGeometry(S.wheelR * 0.5, S.wheelR * 0.5, FOUR.tyreW + 0.02, 6).rotateX(Math.PI / 2).translate(sp.x, sp.y, sp.z), 'hub'));
  parts.push(...wheels(h, S, hw - 0.09, FOUR.tyreW), ...wells(h, S, hw - 0.04));
  tagBit(parts, 'fourbyfour');
  const racks = tagBit(rack(h, S.zR0 + 0.2, half - 0.15, roof, hw - 0.12), 'fourbyfourRack');
  return [...parts, ...racks];
}

// The low car, as before: body, glass band, dark wheels.
function low(h) {
  return tagBit([
    h.box(1.75, 0.6, 4.5, 0, 0.62, 0, 'paint'),
    h.box(1.45, 0.42, 2.0, 0, 1.12, 0.25, 'glass'),
    h.box(1.35, 0.05, 1.6, 0, 1.35, 0.3, 'paint'),
    h.box(1.8, 0.5, 0.6, 0, 0.32, -1.38, 'rubber'),
    h.box(1.8, 0.5, 0.6, 0, 0.32, 1.3, 'rubber'),
  ], 'low');
}

export function farStandIns(h) {
  return mergeGeometries([...low(h), ...van(h), ...fourByFour(h)]);
}
