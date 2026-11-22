// Fine bodies for close traffic (#40, SPEC 9q tier 2): the same lofted body
// and atlas trim as the player's car (car3d.js, caratlas.js), fitted to each
// traffic type: shut lines, rub strips, drip rails, door handles, side
// markers, chrome bezels round textured lamps, grille, plates, mirrors,
// wheel liners and real tyres with hubcaps. Everything for a type is one
// geometry on the car atlas, so a type is one instanced draw call.
//
// Attributes: position, normal, uv (atlas), color (white; the paint is
// tinted per car), carPart: x the paint mask (0 trim, 1 paint, 2 paint that
// can carry a lower second tone: pickups, 3 van paint: stripe or lower tone), y the kit bit + 1 (0 not a kit
// piece; trafficKit.js).
//
//   const geo = fineGeometry('sedan')   // 'sedan' | 'wagon' | 'pickup' | 'hatch' | 'farmtruck' | 'van'

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SPECS, loftBody, sectionAt } from './carbody.js';
import { carAtlas } from './caratlas.js';
import { trimBuilder } from './car3d.js';
import { kitInto } from './trafficKit.js';
import { KIT_BIT } from '../../src/ambient/carkit.js';
import { fourByFourFine } from './fourbyfour3d.js';
import { farmTruckInto } from './farmtruck3d.js';
import { sixBySixInto } from './sixbysix3d.js';

// Bumper and trim look per type (the coarse bodies in traffic3d.js read it too).
export const FINE_STYLE = {
  sedan: { bumper: 'alu', grille: true },
  wagon: { bumper: 'chrome', grille: true },
  pickup: { bumper: 'chrome', grille: true },
  hatch: { bumper: 'satin', grille: false },
  van: { bumper: 'chrome', grille: true, tallTail: true },
};

// An indexed loft part: smooth normals, then flat triangles with one uv.
function loftPart(part, uv, mask) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setIndex(part.idx);
  g.computeVertexNormals();
  const n = g.toNonIndexed();
  return finish(n, () => uv, () => mask);
}

// Add uv (from uvAt(i) or kept), color (white) and carPart (maskAt(i), no kit bit).
function finish(g, uvAt, maskAt) {
  const n = g.attributes.position.count;
  if (uvAt) {
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) uv.set(uvAt(i), i * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const cp = new Float32Array(n * 2); // paint mask, kit bit (0: not a kit piece)
  for (let i = 0; i < n; i++) cp[i * 2] = maskAt(i);
  g.setAttribute('carPart', new THREE.BufferAttribute(cp, 2));
  return g;
}

// The trim builder's mesh; triangles on the paint swatch count as paint.
function trimPart(T, A, paintMask) {
  const g = T.build();
  const [pu, pv] = A.sw('tpaint');
  const uv = g.attributes.uv.array;
  return finish(g, null, (i) => (Math.abs(uv[i * 2] - pu) < 1e-6 && Math.abs(uv[i * 2 + 1] - pv) < 1e-6 ? paintMask : 0));
}

// Tyre (tread and sidewall) and hubcaps for a wheel of radius r, axis x
// (or z), w wide (the car tyre is 0.204). Also used by the parked semis (parked3d.js).
export function wheelInto(T, A, r, x, y, z, side, w = 0.204, axis = 'x') {
  const k = r / 0.315;
  const s = w / 0.204;
  const prof = [[0.19, -0.098], [0.27, -0.102], [0.3, -0.095], [0.315, -0.07], [0.317, 0], [0.315, 0.07], [0.3, 0.095], [0.27, 0.102], [0.19, 0.098]]
    .map(([rr, yy]) => new THREE.Vector2(rr * k, yy * s));
  const turn = (g) => (axis === 'z' ? g.rotateY(Math.PI / 2) : g).translate(x, y, z);
  T.geo(turn(new THREE.LatheGeometry(prof, 16).rotateZ(Math.PI / 2)), null, A.rect('tread', 1));
  // Hubcap on the outer face, a dark hub on the inner face.
  const cap = new THREE.CircleGeometry(0.2 * k, 14).rotateY(side * Math.PI / 2).translate(side * 0.094 * s, 0, 0);
  T.geo(turn(cap), null, A.rect('hubcap', 2));
  T.geo(turn(new THREE.CircleGeometry(0.2 * k, 8).rotateY(-side * Math.PI / 2).translate(-side * 0.094 * s, 0, 0)), 'rubber');
}

// Strips that follow the body surface (as car3d.js surfaceStrips, for any spec).
function stripsFor(S, T, A) {
  const LIFT = 0.004;
  const segN = (z, j) => {
    const { pts } = sectionAt(S, z);
    const a = pts[j];
    const b = pts[Math.min(10, j + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
  };
  const P = (z, j, t, side, lift = LIFT) => {
    const { pts } = sectionAt(S, z);
    const a = pts[j];
    const b = pts[Math.min(10, j + 1)];
    const [nx, ny] = segN(z, j);
    return [side * (a[0] + (b[0] - a[0]) * t + nx * lift), a[1] + (b[1] - a[1]) * t + ny * lift, z];
  };
  const inside = [0, 0.75, 0];
  const alongZ = (z0, z1, j, t0, t1, sw, side, lift) => {
    const u = A.sw(sw);
    const n = Math.max(1, Math.ceil((z1 - z0) / 0.1));
    for (let k = 0; k < n; k++) {
      const za = z0 + ((z1 - z0) * k) / n;
      const zb = z0 + ((z1 - z0) * (k + 1)) / n;
      inside[2] = (za + zb) / 2;
      const a = P(za, j, t0, side, lift);
      const b = P(zb, j, t0, side, lift);
      const c = P(zb, j, t1, side, lift);
      const d = P(za, j, t1, side, lift);
      T.triOut(a, b, c, u, inside);
      T.triOut(a, c, d, u, inside);
    }
  };
  const across = (z, j0, j1, w, sw, side, lift) => {
    const u = A.sw(sw);
    for (let j = j0; j < j1; j++) {
      inside[2] = z;
      const a = P(z - w, j, 0, side, lift);
      const b = P(z + w, j, 0, side, lift);
      const c = P(z + w, j, 1, side, lift);
      const d = P(z - w, j, 1, side, lift);
      T.triOut(a, b, c, u, inside);
      T.triOut(a, c, d, u, inside);
    }
  };
  const h = S.half;
  const front = S.windows[0][0] - 0.08;
  const mid = (S.bPillar[0] + S.bPillar[1]) / 2 + (S.bPillar[0] === S.bPillar[1] ? 0.03 : 0);
  const rear = S.windows.length > 1 ? S.windows[1][1] + 0.05 : null;
  const a0 = S.wheels[0][0] + (S.archR || 0.43) + 0.05;
  const a1 = S.wheels[1][0] - (S.archR || 0.43) - 0.05;
  for (const side of [1, -1]) {
    across(front, 1, 5, 0.005, 'gap', side);
    across(mid, 1, 5, 0.005, 'gap', side);
    if (rear !== null) across(rear, 2, 5, 0.005, 'gap', side);
    alongZ(-h + 0.06, S.zA - 0.07, 4, 0.55, 0.75, 'gap', side);
    across(S.zA - 0.07, 5, 10, 0.005, 'gap', side);
    if (S.trunk) {
      alongZ(S.zC + 0.07, h - 0.06, 4, 0.55, 0.75, 'gap', side);
      across(S.zC + 0.07, 5, 10, 0.005, 'gap', side);
    }
    if (S.bed) across(S.zC + 0.1, 1, 6, 0.006, 'gap', side); // cab to bed
    alongZ(a0, a1, 2, 0.0, 0.25, 'satin', side, 0.014); // rub strip
    alongZ(S.zA + 0.03, Math.min(S.zC, S.zR1 + 0.3, h) - 0.03, 7, 0.82, 1.0, 'chrome', side, 0.006); // drip rail
    const handles = [mid - 0.24];
    if (rear !== null) handles.push(rear - 0.14);
    for (const z of handles) {
      const p = P(z, 3, 0.75, side, 0.012);
      T.box(p[0], p[1], z, 0.024, 0.032, 0.16, 'satin');
      T.box(p[0] + side * 0.008, p[1] + 0.006, z, 0.012, 0.01, 0.14, 'chrome');
    }
    for (const [z, sw] of [[-h + 0.32, 'amber'], [h - 0.3, 'red']]) {
      const p = P(z, 3, 0.4, side, 0.006);
      T.box(p[0], p[1], z, 0.012, 0.035, 0.09, sw);
    }
  }
}

function endParts(name, S, T, A) {
  const h = S.half;
  const hw = S.hw;
  const st = FINE_STYLE[name];
  const by = S.y0 + 0.15;
  // Bumpers with a rubber band, wrapping round the corners, and plates.
  for (const s of [-1, 1]) {
    const z = s * (h + 0.045);
    T.box(0, by, z, hw * 2 - 0.03, 0.17, 0.15, st.bumper);
    T.box(0, by + 0.005, z + s * 0.004, hw * 2 - 0.01, 0.05, 0.155, 'rubber');
    for (const x of [-1, 1]) T.box(x * (hw - 0.06), by, s * (h - 0.13), 0.13, 0.17, 0.42, st.bumper);
    T.pic([0, by - 0.02, z + s * 0.08], [s, 0, 0], [0, 1, 0], 0.32, 0.16, A.rect('plate', 2));
  }
  // Front: headlights in chrome bezels, grille (or a black slot), indicators.
  const ly = (S.belt(-h) + S.y0 + 0.2) / 2 + 0.02;
  const fz = -h - 0.006;
  const lx = hw - 0.32;
  for (const x of [-1, 1]) {
    T.box(x * lx, ly, fz + 0.004, 0.42, 0.18, 0.02, 'chrome');
    T.pic([x * lx, ly, fz - 0.008], [-1, 0, 0], [0, 1, 0], 0.38, 0.15, A.rect('head', 1));
    T.pic([x * (lx + 0.05), by - 0.065, -h - 0.124], [-1, 0, 0], [0, 1, 0], 0.17, 0.045, A.rect('indicator', 1));
  }
  const gw = lx * 2 - 0.46;
  if (st.grille) T.pic([0, ly, fz - 0.006], [-1, 0, 0], [0, 1, 0], gw, 0.15, A.rect('grille', 1));
  else T.box(0, ly - 0.02, fz, gw, 0.06, 0.02, 'black');
  // Rear: tail lamps (tall at the corners on a pickup), a badge.
  const ty = (S.belt(h) + S.y0 + 0.2) / 2 + 0.06;
  const rz = h + 0.006;
  const r = A.rect('tail', 1);
  for (const x of [-1, 1]) {
    const flip = x > 0 ? r : [r[2], r[1], r[0], r[3]];
    if (S.bed || st.tallTail) {
      T.box(x * (hw - 0.12), ty + 0.04, rz - 0.004, 0.2, 0.36, 0.02, 'black');
      T.pic([x * (hw - 0.12), ty + 0.04, rz + 0.008], [1, 0, 0], [0, 1, 0], 0.18, 0.34, flip);
    } else {
      const w = Math.min(0.5, hw - 0.36);
      T.box(x * (hw - 0.36), ty, rz - 0.004, w + 0.02, 0.2, 0.02, 'black');
      T.pic([x * (hw - 0.36), ty, rz + 0.008], [1, 0, 0], [0, 1, 0], w, 0.18, flip);
    }
  }
  T.pic([0.35, ty + 0.15, rz + 0.004], [1, 0, 0], [0, 1, 0], 0.1, 0.034, A.rect('badge', 1));
  // Mirrors by the windscreen.
  const mz = S.zA + 0.16;
  const my = S.belt(mz) + 0.09;
  const [mu, mv] = A.sw('mirror');
  for (const x of [-1, 1]) {
    T.box(x * (hw + 0.02), my - 0.04, mz, 0.08, 0.035, 0.05, 'satin');
    T.box(x * (hw + 0.09), my, mz, 0.15, 0.1, 0.07, 'satin', 0, 0, x * 0.05);
    T.pic([x * (hw + 0.09), my, mz + 0.037], [1, 0, 0], [0, 1, 0], 0.13, 0.08, [mu, mv, mu, mv]);
  }
  // Wheel liners, wheels, underbody, exhaust.
  for (const [z] of S.wheels) {
    for (const x of [-1, 1]) {
      const n = new THREE.CylinderGeometry(S.archR || 0.43, S.archR || 0.43, 0.32, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).toNonIndexed();
      const p = n.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
      n.translate(x * (hw - 0.17), S.wheelY, z);
      T.geo(n, 'liner');
      wheelInto(T, A, S.wheelR, x * (hw - 0.105), S.wheelR, z, x);
    }
  }
  T.box(0, S.y0 + 0.01, 0, hw * 2 - 0.15, 0.04, h * 2 - 0.7, 'liner');
  T.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 6).rotateX(Math.PI / 2).translate(-0.48, S.y0 - 0.03, h - 0.02), 'exhaust');
  // Pickup: open bed (dark floor, painted top rails; the hay bale is a kit part).
  if (S.bed) {
    const z0 = S.zC + 0.12;
    const z1 = h - 0.05;
    const top = S.belt(h) + 0.03;
    T.geo(new THREE.PlaneGeometry(hw * 2 - 0.2, z1 - z0).rotateX(-Math.PI / 2).translate(0, top + 0.004, (z0 + z1) / 2), 'plankDark');
    for (const x of [-1, 1]) T.box(x * (hw - 0.07), top + 0.02, (z0 + z1) / 2, 0.08, 0.05, z1 - z0, 'tpaint');
    T.box(0, top + 0.02, z1, hw * 2 - 0.1, 0.05, 0.08, 'tpaint');
  }
}

// The fine lofted shell of a spec: paint and glass parts, and a trim
// builder holding the loft's trim (more trim goes on it before trimPart).
function fineShell(S, A, paintMask) {
  const body = loftBody(S, { step: 0.09 });
  const parts = [loftPart(body.paint, A.sw('tpaint'), paintMask), loftPart(body.glass, A.sw('tglass'), 0)];
  const T = trimBuilder(A);
  for (const t of body.trim) {
    const u = A.sw(t.sw);
    const p = t.tri;
    T.tri([p[0], p[1], p[2]], [p[3], p[4], p[5]], [p[6], p[7], p[8]], u, u, u);
  }
  return { parts, T };
}

function loftFine(name) {
  const A = carAtlas();
  const S = { ...SPECS[name], trunk: name === 'sedan', bed: name === 'pickup' };
  const paintMask = name === 'pickup' ? 2 : name === 'van' ? 3 : 1;
  const { parts, T } = fineShell(S, A, paintMask);
  stripsFor(S, T, A);
  endParts(name, S, T, A);
  parts.push(trimPart(T, A, paintMask), ...fineKit(name, A));
  return mergeGeometries(parts);
}

// A body drawn through a builder (farmtruck3d.js, sixbysix3d.js; see
// roundShapes.js) on the atlas: flat parts in one trim builder, rounded
// panels keep their smooth normals.
const FINE_ALIAS = { paint: 'tpaint', glass: 'tglass', wood: 'plank', woodDark: 'plankDark', hub: 'steel', tail: 'red', flap: 'rubber' };
// kitMask: which kit pieces to keep (-1 all, for the traffic shader to fold;
// a parked copy passes the few it shows). fine: false for a far stand-in.
export function fineVehicle(into, type, { fine = true, kitMask = -1 } = {}) {
  const A = carAtlas();
  const T = trimBuilder(A);
  const smooth = [];
  const sw = (m) => FINE_ALIAS[m] || m;
  into({
    fine,
    box: (x, y, z, w, h, d, m, rx = 0, ry = 0, rz = 0) => T.box(x, y, z, w, h, d, sw(m), rx, ry, rz),
    bar: (a, b, w, th, m, up) => T.rod(a, b, w, th, sw(m), up),
    smooth(g, m) {
      const n = g.index ? g.toNonIndexed() : g;
      smooth.push(finish(n, () => A.sw(sw(m)), () => (m === 'paint' ? 1 : 0)));
    },
    geo: (g, m) => T.geo(g, sw(m)),
    pic(c, r, u, w, h, name, flip = false) {
      const q = A.rect(name, 1);
      T.pic(c, r, u, w, h, flip ? [q[2], q[1], q[0], q[3]] : q);
    },
    disc(c, n, rad, name) {
      const g = new THREE.CircleGeometry(rad, 14);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n)));
      T.geo(g.translate(...c), null, A.rect(name, 1));
    },
    wheel: (r, w, x, y, z, side, axis = 'x') => wheelInto(T, A, r, x, y, z, side, w, axis),
  });
  const kit = fineKit(type, A).filter((g) => kitMask === -1 || (kitMask >> (g.attributes.carPart.array[1] - 1)) & 1);
  return mergeGeometries([trimPart(T, A, 1), ...smooth, ...kit]);
}
const fineBody = (into, type) => fineVehicle(into, type);

// Kit pieces (trafficKit.js) on the atlas, one part per kit bit (carPart.y is
// the bit + 1; the shader folds away the parts a car's kit leaves out).
const KIT_SW = { rack: 'black', glass: 'tglass', tail: 'red' };
function fineKit(type, A) {
  const Ts = new Map();
  let cur = null;
  const flapR = A.rect('flap', 1);
  const tread = A.rect('tread', 1);
  const hub = A.rect('hubcap', 2);
  const B = {
    fine: true,
    part(name) {
      const bit = name ? KIT_BIT[name] + 1 : 0; // null: on every car of the type
      if (!Ts.has(bit)) Ts.set(bit, trimBuilder(A));
      cur = Ts.get(bit);
    },
    box(x, y, z, w, h, d, mat, ry = 0) {
      if (mat === 'flap') {
        const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
        cur.boxM(m, w, h, d, ['rubber', 'rubber', 'rubber', 'rubber', flapR, flapR]);
      } else cur.box(x, y, z, w, h, d, KIT_SW[mat] || mat, 0, ry, 0);
    },
    rod(a, b, th, mat) {
      cur.rod(a, b, th, th, KIT_SW[mat] || mat);
    },
    // Spare wheel: the same tread and hubcap as the road wheels.
    tyre(r, w, x, y, z, axis) {
      const k = r / 0.315;
      const s = w / 0.204;
      const prof = [[0.19, -0.098], [0.27, -0.102], [0.3, -0.095], [0.315, -0.07], [0.317, 0], [0.315, 0.07], [0.3, 0.095], [0.27, 0.102], [0.19, 0.098]]
        .map(([rr, yy]) => new THREE.Vector2(rr * k, yy * s));
      const geos = [
        [new THREE.LatheGeometry(prof, 16), null, tread],
        [new THREE.CircleGeometry(0.2 * k, 14).rotateX(-Math.PI / 2).translate(0, 0.094 * s, 0), null, hub],
        [new THREE.CircleGeometry(0.2 * k, 8).rotateX(Math.PI / 2).translate(0, -0.094 * s, 0), 'rubber', null],
      ];
      for (const [g, sw, rect] of geos) {
        if (axis === 'x') g.rotateZ(-Math.PI / 2);
        else if (axis === 'z') g.rotateX(Math.PI / 2);
        cur.geo(g.translate(x, y, z), sw, rect);
      }
    },
  };
  kitInto(type, B);
  return [...Ts].map(([bit, T]) => {
    const g = trimPart(T, A, 0);
    const cp = g.attributes.carPart.array;
    for (let i = 1; i < cp.length; i += 2) cp[i] = bit;
    return g;
  });
}

export function fineGeometry(name) {
  if (name === 'fourbyfour') return fourByFourFine({ fineShell, trimPart, stripsFor, wheelInto, fineKit });
  if (name === 'farmtruck') return fineBody(farmTruckInto, 'farmtruck');
  if (name === 'sixbysix') return fineBody(sixBySixInto, 'sixbysix');
  return loftFine(name);
}
