// Kestrel Field and any other 'airfield' landmark: a mown grass runway with
// white edge and threshold markers, the windsock (it swings with the
// ambient wind, src/ambient/ambient.js), a fuel pump, parked planes, and the
// hangar and clubhouse buildings. Layout from src/world/airfield.js; solids
// and pads from src/drive/layout.js.

import * as THREE from 'three';
import { AIRFIELD, airfieldFrame } from '../../src/world/airfield.js';
import { box, cyl, gable } from './shapes.js';
import { objMatrix } from './batch.js';
import { planeGeometry } from './planes3d.js';

const DEG = Math.PI / 180;
const FOUND = 1.5;
const WINDOW = 0x2c3a46;

// The landmark: paint, markers, pump, parked planes; returns the windsock
// as a dynamic piece { object, update(time, amb) }.
export function buildAirfield(world, terrain, batch, l) {
  const f = airfieldFrame(l);
  const L = f.length;
  const W = f.width;
  const A = batch.audit;
  const ground = (s, t) => {
    const p = f.at(s, t);
    return { ...p, h: terrain.heightAt(p.x, p.y) };
  };
  const corners = (s0, s1, t0, t1) => [f.at(s0, t0), f.at(s1, t0), f.at(s1, t1), f.at(s0, t1)].map((p) => [p.x, p.y]);

  // Mown strip: light and dark bands along the runway, a little lighter
  // than the rough grass round it.
  if (batch.paint) {
    batch.paint.polygon(corners(-L / 2 - 20, L / 2 + 20, -W / 2 - 6, W / 2 + 6), 0x6f9a4c);
    const bands = 6;
    for (let k = 0; k < bands; k++) {
      const t0 = -W / 2 + (W * k) / bands;
      batch.paint.polygon(corners(-L / 2, L / 2, t0, t0 + W / bands), k % 2 ? 0x7aa656 : 0x86b161);
    }
    // Worn wheel track down the middle and the taxi track to the apron.
    batch.paint.polygon(corners(-L / 2 + 40, L / 2 - 40, -2.5, 2.5), 0x8fae66);
    for (const st of AIRFIELD.stands) batch.paint.polygon(corners(st.s - 3, st.s + 3, 0, st.t - 4), 0x92ad6a);
  }

  // White markers: boards along both edges every 50 m, and a row across each end.
  for (let s = -L / 2; s <= L / 2 + 0.1; s += 50) {
    for (const t of [-W / 2, W / 2]) {
      const p = ground(s, t);
      batch.place(box(2.4, 0.25, 0.5), p.x, p.y, p.h - 0.05, f.angle, 0, 0, 0, 0xf4f4ef, { cast: false });
    }
  }
  for (const end of [-1, 1]) {
    for (let t = -W / 2 + 3; t <= W / 2 - 3 + 0.1; t += 4) {
      const p = ground(end * (L / 2 + 2), t);
      batch.place(box(0.5, 0.25, 2.4), p.x, p.y, p.h - 0.05, f.angle, 0, 0, 0, 0xf4f4ef, { cast: false });
    }
  }

  // Fuel pump on its pad: a red cabinet, hose, and a little sign.
  {
    const p = ground(AIRFIELD.pump.s, AIRFIELD.pump.t);
    const P = (geo, lx, ly, up, color, o) => batch.place(geo, p.x, p.y, p.h, f.angle, lx, ly, up, color, o);
    P(box(AIRFIELD.pump.w, 1.6 + FOUND, AIRFIELD.pump.h), 0, 0, -FOUND, 0xb3261e);
    P(box(AIRFIELD.pump.w + 0.04, 0.35, AIRFIELD.pump.h + 0.04), 0, 0, 1.6, 0xf2f2f2);
    P(box(0.5, 0.4, 0.06), 0, -AIRFIELD.pump.h / 2 - 0.03, 1.0, 0x2c3a46, { cast: false });
    P(cyl(0.05, 1.3, 5), 0.7, 0.2, 0.2, 0x1e1e1e, { cast: false });
    P(box(1.6, 0.9, 0.06), 0, AIRFIELD.pump.h / 2 + 1.2, 1.1, 0xf2efe6);
    P(box(0.08, 1.1, 0.08), -0.6, AIRFIELD.pump.h / 2 + 1.2, 0, 0x6f6c66);
    P(box(0.08, 1.1, 0.08), 0.6, AIRFIELD.pump.h / 2 + 1.2, 0, 0x6f6c66);
    if (A) A.rect(l.id, 'fuel_pump', p.x, p.y, AIRFIELD.pump.w, AIRFIELD.pump.h, f.angle, p.h - FOUND, p.h);
  }

  // Parked planes, nose toward the runway-ish.
  for (const pl of AIRFIELD.parked) {
    const p = ground(pl.s, pl.t);
    const geo = planeGeometry({ kind: pl.kind, color: pl.color, prop: 'blades' });
    batch.add(geo, objMatrix(p.x, p.y, p.h, f.heading(pl.h)), 0xffffff, { keepColors: true });
    if (A) A.circle(l.id, 'parked_plane', p.x, p.y, 0.3, p.h, p.h + 0.05);
  }

  // Windsock: a striped pole (static) and the sock (moves).
  const ws = ground(AIRFIELD.windsock.s, AIRFIELD.windsock.t);
  const POLE = 6.5;
  batch.place(cyl(0.09, POLE + 0.3, 6), ws.x, ws.y, ws.h - 0.3, 0, 0, 0, 0, 0xe9e9e4);
  for (let y = 0.6; y < POLE; y += 1.6) batch.place(cyl(0.1, 0.5, 6), ws.x, ws.y, ws.h, 0, 0, 0, y, 0xc0392b, { cast: false });
  batch.place(box(1.2, 0.2, 1.2), ws.x, ws.y, ws.h - 0.15, 0, 0, 0, 0, 0xb3b0a8, { cast: false });
  if (A) A.circle(l.id, 'windsock_pole', ws.x, ws.y, 0.09, ws.h - 0.3, ws.h);
  return windsock(ws.x, ws.h + POLE, ws.y);
}

// The sock: five tapering bands, orange and white, on a swivel at the top
// of the pole. It points where the wind blows to, and droops in light air.
function windsock(x, y, z) {
  const parts = [];
  const LEN = 3.2;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const r0 = 0.42 - (0.22 * i) / n;
    const r1 = 0.42 - (0.22 * (i + 1)) / n;
    const g = new THREE.CylinderGeometry(r1, r0, LEN / n, 10, 1, true);
    g.rotateX(-Math.PI / 2); // cylinder y -> -z... then the sock runs along -z from the pole
    g.translate(0, 0, -(i + 0.5) * (LEN / n));
    const c = new THREE.Color(i % 2 ? 0xf4f2ea : 0xf26a1b);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) col.set([c.r, c.g, c.b], k * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g.toNonIndexed());
  }
  const ring = new THREE.TorusGeometry(0.43, 0.03, 4, 12).toNonIndexed();
  const rc = new Float32Array(ring.attributes.position.count * 3).fill(0.3);
  ring.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  for (const p of parts) p.deleteAttribute('uv');
  ring.deleteAttribute('uv');
  const geo = new THREE.BufferGeometry();
  const merge = [...parts, ring];
  const pos = [];
  const nrm = [];
  const col = [];
  for (const g of merge) {
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    col.push(...g.attributes.color.array);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const sock = new THREE.Mesh(geo, mat);
  sock.castShadow = true;
  const swivel = new THREE.Group();
  swivel.position.set(x, y, z);
  swivel.rotation.order = 'YXZ';
  swivel.add(sock);
  const group = new THREE.Group();
  group.add(swivel);
  let dir = null;
  let droop = 0.6;
  return {
    object: group,
    update(time, amb) {
      const w = amb && amb.wind;
      const to = w ? w.dir : 270;
      const speed = w ? w.speed : 3;
      // Ease toward the wind; flutter a little.
      if (dir === null) dir = to;
      dir += ((((to - dir) % 360) + 540) % 360 - 180) * 0.05;
      const want = Math.max(0.05, 1.0 - speed / 5.5) * 1.2;
      droop += (want - droop) * 0.05;
      // Sock along -z points north at rotation 0: turn it to point downwind.
      swivel.rotation.set(-droop + 0.04 * Math.sin(time * 7.3), -dir * DEG + 0.05 * Math.sin(time * 3.1), 0, 'YXZ');
    },
  };
}

// Hangars and the clubhouse (buildings). Their open side faces the runway.
export function buildAirfieldBuilding(world, terrain, batch, b, base) {
  const l = world.landmarks.find((q) => q.kind === 'airfield');
  // Which local side faces the runway: n (-ly) or s (+ly) for an unrotated building.
  const front = l && l.y < b.y ? -1 : 1;
  const P = (geo, lx, ly, up, color, o) => batch.place(geo, b.x, b.y, base, b.angle || 0, lx, ly * 1, up, color, o);
  if (b.kind === 'hangar') {
    const H = 5.2;
    // Corrugated steel walls (pale grey-green) under a low curved roof: half
    // a cylinder along the depth, squashed flat, ends closed.
    P(box(b.w, H + FOUND, b.h), 0, 0, -FOUND, 0xa9b3a6);
    const R = b.w / 2 + 0.3;
    const RISE = 0.3;
    const roof = new THREE.CylinderGeometry(R, R, b.h + 0.6, 12, 1, true, -Math.PI / 2, Math.PI)
      .rotateX(-Math.PI / 2).scale(1, RISE, 1);
    P(roof, 0, 0, H, 0x7d868a);
    const end = new THREE.CircleGeometry(R - 0.3, 12, 0, Math.PI).scale(1, RISE, 1);
    for (const side of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationY(side > 0 ? 0 : Math.PI);
      batch.place(end, b.x, b.y, base, b.angle || 0, 0, side * (b.h / 2), H, 0xa9b3a6, { extra: m });
    }
    // Big sliding doors on the runway side, half open, a dark inside.
    const ly = front * (b.h / 2 + 0.06);
    P(box(b.w - 2, H - 0.4, 0.1), 0, ly - front * 0.02, 0, 0x22262a, { cast: false });
    P(box(b.w * 0.36, H - 0.3, 0.16), -b.w * 0.3, ly, 0, 0xc9cfc8);
    P(box(b.w * 0.36, H - 0.3, 0.16), b.w * 0.33, ly + front * 0.18, 0, 0xc9cfc8);
    P(box(b.w, 0.25, 0.3), 0, ly, H - 0.3, 0x5d666a);
    // The club's letters board on the roof edge.
    P(box(b.w * 0.6, 0.8, 0.12), 0, ly, H + 0.4, 0xf2efe6);
    P(box(b.w * 0.5, 0.35, 0.14), 0, ly, H + 0.62, 0x2d5aa8, { cast: false });
    return true;
  }
  if (b.kind === 'clubhouse') {
    // A white weatherboard hut with a veranda toward the runway and a flag.
    P(box(b.w, 3.1 + FOUND, b.h), 0, 0, -FOUND, 0xf1ede4);
    P(gable(b.w + 0.8, b.h + 0.8, 1.6), 0, 0, 3.1, 0x4f6a5a);
    const ly = front * (b.h / 2);
    for (const lx of [-b.w * 0.3, 0, b.w * 0.3]) P(box(1.6, 1.2, 0.12), lx, ly, 1.0, WINDOW, { cast: false });
    P(box(1.0, 2.1, 0.14), b.w * 0.42, ly, 0, 0x5b3a2a, { cast: false });
    P(box(b.w, 0.2, 2.2), 0, ly + front * 1.1, 2.8, 0x6e6a60);
    P(box(b.w, 0.2, 2.2), 0, ly + front * 1.1, 0, 0xb8b0a0, { cast: false });
    for (const lx of [-b.w / 2 + 0.2, 0, b.w / 2 - 0.2]) P(box(0.15, 2.8, 0.15), lx, ly + front * 2.1, 0, 0xf1ede4);
    // Back windows, the flag pole by the corner.
    P(box(1.6, 1.1, 0.12), 0, -ly, 1.1, WINDOW, { cast: false });
    P(cyl(0.06, 8, 5), -b.w / 2 - 1.5, ly + front * 1.5, 0, 0xdedbd2);
    P(box(0.02, 0.9, 1.4), -b.w / 2 - 1.5, ly + front * 1.5 - front * 0.75, 7, 0x2d5aa8, { cast: false });
    return true;
  }
  return false;
}
