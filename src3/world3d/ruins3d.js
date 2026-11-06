// Ruins, old things and tall farm landmarks, all from world data
// (src/world/data.js landmarks), low-poly and merged by the Batcher:
//   farm_ruin       the old Voss place: sagging roof, broken windows, a
//                   collapsed shed, a rusty hand pump, a broken windpump
//   rusty_truck     an early-50s pickup rusting in a field corner
//   railway         the old branch line's bank, sleepers, a stretch of rails,
//                   and Gilmore Halt's platform, shelter and faded sign
//   grain_elevator  Ashford's old wooden co-op elevator
//   windpump        a farm windpump; the wheels turn (one instanced mesh)
// Footprints (what the car hits) come from src/drive/layout.js.

import * as THREE from 'three';
import { localToWorld, makeRng, hashString, DEG, nearestOnPolyline } from '../../src/drive/geom.js';
import { FARM_RUIN, TRUCK, RAILWAY, ELEVATOR, WINDPUMP, railFrame } from '../../src/drive/layout.js';
import { box, cyl, gable, strut } from './shapes.js';
import { objMatrix } from './batch.js';
import { rowPrism, Tris } from './fields3d.js';

const FOUND = 1.5;
const I = new THREE.Matrix4();
const RUST = [0x8a4a2a, 0x7a4026, 0x6b3a22, 0x94562e];
const WEED = [0x6f7d3e, 0x7f8a47, 0x5d6e36, 0x8c8a4e];
const DARK = 0x1c1f22; // empty window
const WIND_FROM = 250; // heading the wheels face (into the usual west wind)

export function buildRuin(world, terrain, batch, l) {
  switch (l.kind) {
    case 'farm_ruin': return farmRuin(terrain, batch, { ...l, trackTo: nearestRoad(world, l.x, l.y) });
    case 'rusty_truck': return rustyTruck(terrain, batch, l);
    case 'railway': return railway(terrain, batch, l);
    case 'grain_elevator': return elevator(terrain, batch, l);
    case 'windpump': return windpumpTower(terrain, batch, l.x, l.y, l.id, false);
    default: return false;
  }
}

function nearestRoad(world, x, y) {
  let best = null;
  for (const r of world.roads) {
    const p = nearestOnPolyline(x, y, r.points);
    if (!best || p.d < best.d) best = p;
  }
  return best ? [best.x, best.y] : null;
}

// Level base for a rect footprint: floor at the high side, walls reaching
// FOUND below, a stone course down past the low side where the ground falls.
function stand(terrain, batch, x, y, w, h, angle, plinth = 0x8a847a) {
  const { min, max } = terrain.groundRange({ rect: { x, y, w, h, angle } });
  let bottom = max - FOUND;
  if (max - min > 0.12) {
    bottom = Math.min(bottom, min - 0.3);
    batch.place(box(w + 0.3, max - min + 0.45, h + 0.3), x, y, min - 0.3, angle, 0, 0, 0, plinth);
  }
  return { base: max, bottom, min };
}

// A tuft of tall grass and weeds: a few thin leaning spikes, base on y = 0.
let _tuft = null;
function tuftGeometry() {
  if (_tuft) return _tuft;
  const parts = [];
  for (const [ax, az, h] of [[0.25, 0, 1], [-0.2, 0.25, 0.8], [0.05, -0.3, 0.9], [-0.25, -0.1, 0.7], [0.2, 0.3, 0.75]]) {
    const c = new THREE.ConeGeometry(0.14, h, 3).translate(0, h / 2, 0);
    c.rotateZ(ax * 0.9).rotateX(az * 0.9);
    c.translate(ax * 0.35, 0, az * 0.35);
    parts.push(c.toNonIndexed());
  }
  _tuft = mergeSimple(parts);
  _tuft.computeVertexNormals();
  return _tuft;
}

// Weed tufts scattered round a point.
function weeds(terrain, batch, rng, x, y, r, n, size = 0.6) {
  const g = tuftGeometry();
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * Math.sqrt(rng());
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    const s = size * (0.6 + rng() * 0.9);
    const h = terrain.heightAt(px, py);
    const m = objMatrix(px, py, h - 0.08, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s * 1.4, s * (0.8 + rng() * 0.8), s * 1.4));
    batch.add(g, m, WEED[Math.floor(rng() * WEED.length)], { cast: false });
  }
}

// ---------- the old Voss place ----------

function farmRuin(terrain, batch, l) {
  const a = l.angle || 0;
  const rng = makeRng(hashString(l.id));
  const A = batch.audit;
  const H = FARM_RUIN.house;
  const hc = localToWorld(l.x, l.y, a, H.lx, H.ly);
  const st = stand(terrain, batch, hc.x, hc.y, H.w, H.h, a);
  if (A) A.rect(l.id, 'ruin_house', hc.x, hc.y, H.w, H.h, a, st.bottom, st.base);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, hc.x, hc.y, st.base, a, lx, ly, up, color, opts);
  const wall = 0xb9b2a2; // weathered grey siding, the paint long gone
  const WH = 3.3;
  // Walls, with the bottom boards gone grey.
  P(box(H.w, WH + FOUND, H.h), 0, 0, st.bottom - st.base, wall);
  P(box(H.w + 0.04, 0.7, H.h + 0.04), 0, 0, 0, 0x9c9480, { cast: false });
  // Windows: empty, two boarded up. Door hanging open.
  const wins = [[-3.2, -H.h / 2], [0.4, -H.h / 2], [3.4, -H.h / 2], [-3.2, H.h / 2], [3.4, H.h / 2]];
  wins.forEach(([lx, ly], i) => {
    P(box(1.1, 1.25, 0.12), lx, ly, 1.1, DARK, { cast: false });
    if (i === 1 || i === 3) for (const t of [-0.3, 0.15]) P(box(1.35, 0.18, 0.08), lx, ly + Math.sign(ly) * 0.08, 1.45 + t * 1.6, 0x6a5238, { cast: false, extra: new THREE.Matrix4().makeRotationZ((rng() - 0.5) * 0.5) });
  });
  for (const ly of [-1.8, 1.8]) P(box(0.12, 1.25, 1.1), H.w / 2, ly, 1.1, DARK, { cast: false });
  P(box(0.12, 2.1, 1.1), -H.w / 2, 1, 0, DARK, { cast: false }); // doorway
  P(box(0.06, 2.0, 1.0), -H.w / 2 - 0.45, 1.6, 0.02, 0x5b3a2a, { extra: new THREE.Matrix4().makeRotationY(1.1) });
  // Roof: the middle has sagged in; the ends still hold.
  const RL = H.w + 0.8;
  const seg = RL / 3;
  const roofC = 0x6e6a60;
  // The ridge sags in the middle: each half of the roof has dropped at its
  // inner end, so the ridge line is a shallow V.
  for (const e of [-1, 1]) {
    const sag = new THREE.Matrix4().makeTranslation((e * RL) / 2, 0, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(e * 0.085))
      .multiply(new THREE.Matrix4().makeTranslation((-e * RL) / 4, 0, 0));
    P(gable(RL / 2 + 0.05, H.h + 0.8, 2.4), 0, 0, WH, e < 0 ? roofC : 0x66625a, { extra: sag });
  }
  // Holes where the tin blew off: dark rafters showing.
  // (on the slope: pitch 2.4 m over half the depth, less the sag there)
  const slope = Math.atan2(2.4, (H.h + 0.8) / 2);
  const roofAt = (lx, ly) => WH + 2.4 * (1 - Math.abs(ly) / ((H.h + 0.8) / 2)) - (RL / 2 - Math.abs(lx)) * Math.sin(0.085) + 0.03;
  P(box(seg * 0.55, 0.05, 1.6), 0.6, -1.5, roofAt(0.6, -1.5), DARK, { cast: false, extra: new THREE.Matrix4().makeRotationX(-slope) });
  P(box(1.4, 0.05, 1.1), -seg + 0.2, 2.0, roofAt(-seg + 0.2, 2.0), DARK, { cast: false, extra: new THREE.Matrix4().makeRotationX(slope) });
  // Boards missing from the walls.
  for (const [lx, ly, w, up] of [[-1.6, -H.h / 2, 1.6, 2.3], [4.6, H.h / 2, 1.2, 0.5], [1.8, H.h / 2, 0.9, 2.6]]) {
    P(box(w, 0.5, 0.1), lx, ly, up, 0x3a3630, { cast: false });
  }
  // Brick chimney, top broken off.
  P(box(0.8, WH + 2.6, 0.8), H.w / 2 - 1.4, 0.8, 0, 0xb84a3a);
  // Fallen porch roof on the front (west) side, one post still up.
  const porch = new THREE.Matrix4().makeRotationZ(0.42);
  P(box(2.6, 0.1, 4.2), -H.w / 2 - 1.4, 1, 1.1, 0x6e6a60, { extra: porch });
  P(box(0.14, 2.2, 0.14), -H.w / 2 - 2.6, 3.0, 0, 0x6a5238);

  // Collapsed shed: stubs of walls and the roof slid down to the ground.
  const S = FARM_RUIN.shed;
  const sc = localToWorld(l.x, l.y, a, S.lx, S.ly);
  const sg = terrain.groundRange({ rect: { x: sc.x, y: sc.y, w: S.w, h: S.h, angle: a } });
  const SP = (geo, lx, ly, up, color, opts) => batch.place(geo, sc.x, sc.y, sg.min, a, lx, ly, up, color, opts);
  const drop = sg.max - sg.min;
  SP(box(S.w, 1.0 + drop, 0.2), 0, -S.h / 2, -0.3, 0x5a4630);
  SP(box(0.2, 1.6 + drop, S.h), S.w / 2, 0, -0.3, 0x5a4630);
  SP(box(0.2, 0.8 + drop, S.h * 0.6), -S.w / 2, S.h * 0.2, -0.3, 0x4d3b2a);
  SP(box(S.w + 0.6, 0.08, S.h + 0.4), 0, 0.3, 0.75 + drop / 2, 0x7f8588, { extra: new THREE.Matrix4().makeRotationZ(0.28).multiply(new THREE.Matrix4().makeRotationX(-0.1)) });
  if (A) A.rect(l.id, 'ruin_shed', sc.x, sc.y, S.w, S.h, a, sg.min - 0.3, null);

  // Rusty hand pump on a cracked concrete pad.
  const pp = localToWorld(l.x, l.y, a, FARM_RUIN.pump.lx, FARM_RUIN.pump.ly);
  const pg = terrain.groundRange({ circle: { x: pp.x, y: pp.y, r: 0.7 } });
  const PP = (geo, up, color, opts) => batch.place(geo, pp.x, pp.y, pg.max, a, 0, 0, up, color, opts);
  batch.place(box(1.4, pg.max - pg.min + 0.2, 1.4), pp.x, pp.y, pg.min - 0.1, a + 8, 0, 0, 0, 0xa9a69c);
  PP(cyl(0.12, 1.25, 8), 0.1, RUST[0]);
  PP(cyl(0.16, 0.25, 8), 1.2, RUST[1]);
  PP(box(0.1, 0.1, 0.5), 1.0, RUST[2], { extra: new THREE.Matrix4().makeTranslation(0, 0, -0.3).multiply(new THREE.Matrix4().makeRotationX(0.3)) });
  PP(box(0.06, 0.06, 1.1), 1.35, RUST[3], { extra: new THREE.Matrix4().makeTranslation(0, 0, 0.45).multiply(new THREE.Matrix4().makeRotationX(-0.5)) });
  if (A) A.circle(l.id, 'ruin_pump', pp.x, pp.y, 0.7, pg.min - 0.1, pg.max + 0.1);

  // Broken windpump: the tower still stands, the wheel half gone.
  const wp = localToWorld(l.x, l.y, a, FARM_RUIN.windpump.lx, FARM_RUIN.windpump.ly);
  windpumpTower(terrain, batch, wp.x, wp.y, `${l.id}_wp`, true);

  // Overgrown yard and an old track, painted on; weeds and bushes everywhere.
  if (batch.paint) {
    const yard = [[-14, -10], [19, -10], [19, 13], [-14, 13]].map(([x, y]) => {
      const p = localToWorld(l.x, l.y, a, x, y);
      return [p.x, p.y];
    });
    batch.paint.polygon(yard, 0x7d8a4a);
    if (l.trackTo) batch.paint.stroke([[hc.x, hc.y], l.trackTo], 3, 0x8d8a5a);
  }
  weeds(terrain, batch, rng, hc.x, hc.y, 16, 70, 0.55);
  const bush = new THREE.IcosahedronGeometry(1, 1);
  for (const [lx, ly, s] of [[-6.5, -5, 1.6], [6.8, 5.8, 1.3], [-6.8, 4.8, 1.1], [2, -6.2, 1.2], [9, 9, 1.8]]) {
    const p = localToWorld(l.x, l.y, a, lx, ly);
    const h = terrain.heightAt(p.x, p.y);
    batch.add(bush, objMatrix(p.x, p.y, h - s * 0.3, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(s, s * 0.85, s)), 0x4f6a34);
    if (A) A.circle(l.id, 'bush', p.x, p.y, s * 0.6, h - s * 0.3 - 0.5 * s);
  }
  return true;
}

// ---------- rusty truck ----------

function rustyTruck(terrain, batch, l) {
  const a = l.angle || 0;
  const rng = makeRng(hashString(l.id));
  const g = terrain.groundRange({ rect: { x: l.x, y: l.y, w: TRUCK.w, h: TRUCK.h, angle: a } });
  // Sunk on flat tyres, nose down a little: the base is the mean ground.
  const base = (g.min + g.max) / 2 - 0.18;
  const tilt = new THREE.Matrix4().makeRotationX(-0.03).multiply(new THREE.Matrix4().makeRotationZ(0.025));
  const P = (geo, lx, ly, up, color, opts = {}) => batch.add(geo, objMatrix(l.x, l.y, base, a).multiply(tilt).multiply(new THREE.Matrix4().makeTranslation(lx, up, ly)).multiply(opts.extra || I), color, opts);
  if (batch.audit) batch.audit.rect(l.id, 'truck', l.x, l.y, TRUCK.w - 0.6, TRUCK.h - 1.2, a, base + 0.05, null);
  const R = RUST;
  // Wheels (flat, half sunk), frame, running boards.
  const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2).translate(0, 0.32, 0);
  for (const [lx, ly] of [[-0.95, -1.75], [0.95, -1.75], [-0.95, 1.6], [0.95, 1.6]]) P(wheel, lx, ly, 0, 0x2a2725);
  P(box(1.4, 0.3, 5.2), 0, 0, 0.45, 0x3a2f28);
  for (const s of [-1, 1]) P(box(0.28, 0.08, 1.6), s * 1.0, -0.1, 0.55, R[2]);
  // Front: a narrow hood, grille, separate fenders with headlights, bumper.
  P(box(1.15, 0.55, 1.75), 0, -1.85, 0.8, R[0]);
  P(box(1.0, 0.12, 1.7), 0, -1.85, 1.35, R[3], { extra: new THREE.Matrix4().makeRotationX(0.04) });
  P(box(1.0, 0.75, 0.1), 0, -2.72, 0.6, 0x3a3028);
  for (const s of [-1, 1]) {
    for (const ly of [-1.75, 1.6]) {
      P(box(0.42, 0.22, 1.35), s * 0.92, ly, 0.78, R[1]);
      P(box(0.42, 0.3, 0.3), s * 0.92, ly - 0.55, 0.5, R[1]);
    }
    P(cyl(0.13, 0.14, 8).rotateX(Math.PI / 2), s * 0.92, -2.5, 0.93, s < 0 ? 0xb8b0a0 : DARK);
  }
  P(box(2.0, 0.16, 0.16), 0, -2.85, 0.42, 0x6f6c66, { extra: new THREE.Matrix4().makeRotationZ(0.08) }); // bumper, one end dropped
  // Cab with empty windows.
  P(box(1.75, 1.2, 1.4), 0, -0.4, 0.75, R[3]);
  P(box(1.6, 0.18, 1.2), 0, -0.4, 1.95, R[0]);
  P(box(1.3, 0.1, 0.9), 0, -0.4, 2.13, R[2]);
  P(box(1.6, 0.55, 0.1), 0, -1.12, 1.25, DARK, { cast: false });
  for (const s of [-1, 1]) P(box(0.1, 0.5, 0.8), s * 0.96, -0.45, 1.3, DARK, { cast: false });
  // Bed: sides, no tailgate, one side bent.
  P(box(1.95, 0.12, 2.5), 0, 1.6, 0.75, R[2]);
  P(box(0.1, 0.55, 2.5), -0.95, 1.6, 0.85, R[0]);
  P(box(0.1, 0.55, 2.5), 0.95, 1.6, 0.85, R[1], { extra: new THREE.Matrix4().makeRotationZ(-0.25) });
  P(box(1.95, 0.55, 0.1), 0, 0.33, 0.85, R[0]);
  // Weeds growing up through and round it.
  weeds(terrain, batch, rng, l.x, l.y, 4.2, 22, 0.45);
  return true;
}

// ---------- the old railway and Gilmore Halt ----------

function railway(terrain, batch, l) {
  const rng = makeRng(hashString(l.id));
  const A = batch.audit;
  const H = (x, y) => terrain.heightAt(x, y);
  const B = RAILWAY.bank;
  const pts = l.points;
  // The bank: grassy sides, a gravel top.
  const sides = new Tris();
  const caps = new Tris();
  for (let i = 0; i < pts.length - 1; i++) {
    rowPrism(sides, caps, pts[i], pts[i + 1], H, { bottom: B.bottom, top: B.top, h: B.h }, A, l.id);
  }
  batch.add(sides.geometry(), I, 0x6d6a40); // browner than the grass, so the line reads
  batch.add(caps.geometry(), I, 0x8c8a82, { cast: false });
  // Sleepers all along (a few gone), rails on the stretch past the halt.
  const f = railFrame(l);
  const sleeper = box(2.5, 0.12, 0.24);
  const rails = new Tris();
  let along = 0;
  const haltAlong = alongOf(pts, f.x, f.y);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    const dx = (bx - ax) / L;
    const dy = (by - ay) / L;
    const ang = Math.atan2(dx, -dy) / DEG; // local x (the sleeper's length) across the line
    let prev = null;
    for (let t = (along === 0 ? 3 : 0.6); t < L; t += 1.3) {
      const s = along + t;
      const x = ax + dx * t;
      const y = ay + dy * t;
      const top = H(x, y) + B.h;
      const withRails = Math.abs(s - haltAlong) < 90;
      if (rng() < (withRails ? 0.92 : 0.6)) batch.place(sleeper, x, y, top - 0.06, ang + (rng() - 0.5) * 6, 0, 0, 0, 0x4a3420, { cast: false });
      if (withRails) {
        const cur = [x, y, top + 0.06];
        if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 5.5) {
          for (const side of [-0.72, 0.72]) {
            const ox = -dy * side;
            const oy = dx * side;
            rails.beam([prev[0] + ox, prev[2] + 0.07, prev[1] + oy], [cur[0] + ox, cur[2] + 0.07, cur[1] + oy], 0.14, 0.08);
          }
          prev = cur;
        } else if (!prev) prev = cur;
      }
    }
    along += L;
  }
  batch.add(rails.geometry(), I, 0x5a3a28, { cast: false });
  // Weeds and young scrub on the bank.
  const lump = tuftGeometry();
  for (let k = 0; k < 160; k++) {
    const s = rng() * along;
    const p = pointAt(pts, s);
    const side = (rng() < 0.5 ? -1 : 1) * (B.top / 2 + rng() * (B.bottom - B.top) / 2);
    const x = p.x - p.dy * side;
    const y = p.y + p.dx * side;
    const sz = 0.35 + rng() * 0.6;
    const g = H(x, y);
    batch.add(lump, objMatrix(x, y, g + B.h * (1 - (Math.abs(side) - B.top / 2) / ((B.bottom - B.top) / 2)) - sz * 0.4, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(sz, sz * (0.6 + rng()), sz)), WEED[k % WEED.length], { cast: false });
  }

  // Gilmore Halt: platform, shelter, sign, lamp post, buffer stop.
  const rx = -f.dy * f.side; // toward the platform
  const ry = f.dx * f.side;
  const off = B.bottom / 2 + RAILWAY.platform.w / 2 - 0.4;
  const cx = f.x + rx * off;
  const cy = f.y + ry * off;
  const pa = f.angle; // platform local y runs along the line
  const PL = RAILWAY.platform;
  const pg = terrain.groundRange({ rect: { x: cx, y: cy, w: PL.w, h: PL.len, angle: pa } });
  const ptop = Math.max(pg.max, H(f.x, f.y) + B.h) + 0.55;
  batch.place(box(PL.w, ptop - pg.min + 0.3, PL.len), cx, cy, pg.min - 0.3, pa, 0, 0, 0, 0x9c9480);
  batch.place(box(0.35, 0.08, PL.len), cx - rx * (PL.w / 2 - 0.17), cy - ry * (PL.w / 2 - 0.17), ptop, pa, 0, 0, 0, 0xb0a994, { cast: false });
  if (A) A.rect(l.id, 'platform', cx, cy, PL.w, PL.len, pa, pg.min - 0.3, ptop);
  // Weeds in the platform cracks.
  for (let k = 0; k < 18; k++) {
    const t = (rng() - 0.5) * PL.len * 0.95;
    const u = (rng() - 0.5) * PL.w * 0.8;
    const x = cx + f.dx * t + rx * u;
    const y = cy + f.dy * t + ry * u;
    const sz = 0.2 + rng() * 0.3;
    batch.add(lump, objMatrix(x, y, ptop - 0.05, rng() * 360, 0, 0, 0, new THREE.Matrix4().makeScale(sz, sz * 1.2, sz)), WEED[k % WEED.length], { cast: false });
  }
  // Shelter: three plank walls, open to the track, a lean-to roof.
  const SH = RAILWAY.shelter;
  const sx = cx + f.dx * SH.at + rx * 0.3;
  const sy = cy + f.dy * SH.at + ry * 0.3;
  const SP = (geo, lx, ly, up, color, opts) => batch.place(geo, sx, sy, ptop, pa, lx, ly, up, color, opts);
  // Local +x of the shelter frame is (cos pa, sin pa); the back wall is the
  // side away from the track, and the roof slopes down toward the track.
  const back = rx * Math.cos(pa * DEG) + ry * Math.sin(pa * DEG) > 0 ? 1 : -1;
  SP(box(0.12, 2.3, SH.len), back * (SH.w / 2 - 0.06), 0, 0, 0x6a5238);
  for (const e of [-1, 1]) SP(box(SH.w - 0.1, 2.2, 0.12), 0, e * SH.len / 2, 0, 0x5b4632);
  SP(box(SH.w + 0.5, 0.1, SH.len + 0.5), 0, 0, 2.3, 0x6f7477, { extra: new THREE.Matrix4().makeRotationZ(0.14 * back) });
  SP(box(0.4, 0.08, SH.len - 0.6), back * (SH.w / 2 - 0.4), 0, 0.45, 0x5a4630); // bench
  // The sign: two posts and a long faded board, reading along the platform.
  const gx = cx - f.dx * 6 + rx * 0.4;
  const gy = cy - f.dy * 6 + ry * 0.4;
  for (const e of [-1.3, 1.3]) batch.place(box(0.12, 2.3, 0.12), gx + f.dx * e, gy + f.dy * e, ptop - 0.05, pa, 0, 0, 0, 0x3a2c20);
  batch.place(box(0.08, 0.6, 3.2), gx, gy, ptop + 1.6, pa, 0, 0, 0, 0xc9c2a8);
  batch.place(box(0.1, 0.12, 2.0), gx, gy, ptop + 1.85, pa, 0, 0, 0, 0x5a5a52, { cast: false }); // faded letters (bars)
  // Lamp post, its lamp gone, leaning.
  const lx = cx + f.dx * -11 + rx * 0.9;
  const ly = cy + f.dy * -11 + ry * 0.9;
  batch.place(cyl(0.07, 3.4, 6), lx, ly, ptop - 0.05, pa, 0, 0, 0, 0x2f3a33, { extra: new THREE.Matrix4().makeRotationX(0.06) });
  batch.place(box(0.6, 0.06, 0.06), lx, ly, ptop + 3.2, pa, 0, 0, 0, 0x2f3a33);
  // Buffer stop where the rails end (east of the halt).
  const be = pointAt(pts, Math.min(along - 5, haltAlong + 88));
  const bh = H(be.x, be.y) + B.h;
  const ba = Math.atan2(-be.dx, be.dy) / DEG;
  batch.place(box(2.2, 0.9, 0.3), be.x, be.y, bh, ba, 0, 0, 0.1, 0x8a3a2a);
  for (const s of [-0.7, 0.7]) batch.place(box(0.25, 0.25, 1.6), be.x - be.dy * s, be.y + be.dx * s, bh, ba, 0, -0.6, 0.1, RUST[0], { extra: new THREE.Matrix4().makeRotationX(-0.5) });
  return true;
}

function alongOf(pts, x, y) {
  let best = Infinity;
  let at = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (L * L)));
    const d = Math.hypot(x - ax - (bx - ax) * t, y - ay - (by - ay) * t);
    if (d < best) {
      best = d;
      at = acc + L * t;
    }
    acc += L;
  }
  return at;
}

function pointAt(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (acc + L >= s || i === pts.length - 2) {
      const t = Math.max(0, Math.min(1, (s - acc) / L));
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, dx: (bx - ax) / L, dy: (by - ay) / L };
    }
    acc += L;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
}

// ---------- Ashford's old grain elevator ----------

function elevator(terrain, batch, l) {
  const a = l.angle || 0;
  const E = ELEVATOR;
  const A = batch.audit;
  const red = 0x8c2a22; // faded barn red boards
  const tin = 0x7f8588;
  const m = E.main;
  const mc = localToWorld(l.x, l.y, a, m.lx, m.ly);
  const st = stand(terrain, batch, mc.x, mc.y, m.w, m.h, a);
  if (A) A.rect(l.id, 'elevator', mc.x, mc.y, m.w, m.h, a, st.bottom, st.base);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, mc.x, mc.y, st.base, a, lx, ly, up, color, opts);
  P(box(m.w + 0.4, 0.9 + FOUND, m.h + 0.4), 0, 0, st.bottom - st.base, 0xa9a69c); // concrete footing
  P(box(m.w, E.H, m.h), 0, 0, 0.9, red);
  // Slight batter: a narrower top storey.
  P(gable(m.w + 0.6, m.h + 0.6, 2.2), 0, 0, E.H + 0.9, tin);
  // Head house (cupola) on the ridge, with its own little roof.
  P(box(3.2, 4.2, m.h * 0.75), 0, 0, E.H + 1.6, red);
  P(gable(3.8, m.h * 0.75 + 0.5, 1.4), 0, 0, E.H + 5.8, tin);
  // The faded name band (bars only, like the road signs) and a few dark doors.
  P(box(m.w + 0.04, 1.4, 0.08), 0, -m.h / 2 - 0.02, E.H - 3.2, 0xd8cfb8, { cast: false });
  for (const t of [-2.4, 0, 2.4]) P(box(1.6, 0.35, 0.06), t, -m.h / 2 - 0.07, E.H - 2.7, 0x5a4a40, { cast: false });
  P(box(1.4, 2.4, 0.1), 2.6, -m.h / 2, 0.9, 0x3a2c20, { cast: false });
  P(box(0.9, 0.9, 0.1), 0, -m.h / 2, E.H - 7, DARK, { cast: false });
  // Ladder up one corner and the loading spout toward where the rails were.
  P(box(0.5, E.H - 1, 0.1), -m.w / 2 + 0.6, -m.h / 2 - 0.08, 1.2, 0x4b4f52, { cast: false });
  const m0 = objMatrix(mc.x, mc.y, st.base, a);
  batch.add(strut(new THREE.Vector3(m.w / 2, E.H - 4, 0), new THREE.Vector3(m.w / 2 + 4.5, 4.5, 0), 0.22, 6), m0, RUST[1]);
  // Driveway shed in front: open ends, tin roof.
  const n = E.annex;
  const nc = localToWorld(l.x, l.y, a, n.lx, n.ly);
  const ns = stand(terrain, batch, nc.x, nc.y, n.w, n.h, a);
  if (A) A.rect(l.id, 'elevator_shed', nc.x, nc.y, n.w, n.h, a, ns.bottom, ns.base);
  const NP = (geo, lx, ly, up, color, opts) => batch.place(geo, nc.x, nc.y, ns.base, a, lx, ly, up, color, opts);
  for (const s of [-1, 1]) NP(box(0.25, 5 + FOUND, n.h), s * (n.w / 2 - 0.12), 0, ns.bottom - ns.base, red);
  NP(gable(n.w + 0.6, n.h + 0.4, 1.6), 0, 0, 5, tin);
  NP(box(n.w - 0.5, 1.2, 0.12), 0, n.h / 2, 3.8, red);
  // A scale-house shack beside it.
  const sh = localToWorld(l.x, l.y, a, -7.5, 6);
  const ss = stand(terrain, batch, sh.x, sh.y, 3.2, 3, a);
  batch.place(box(3.2, 2.6 + FOUND, 3), sh.x, sh.y, ss.bottom, a, 0, 0, 0, 0xd8cfb8);
  batch.place(gable(3.6, 3.4, 1), sh.x, sh.y, ss.base + 2.6 - (ss.base - ss.bottom) + FOUND, a, 0, 0, 0, tin);
  if (A) A.rect(l.id, 'scale_house', sh.x, sh.y, 3.2, 3, a, ss.bottom, ss.base);
  return true;
}

// ---------- windpumps ----------

// The tower, tail and pump rod (static). broken: a bent tail and a wheel with
// most blades gone, drawn here too (it never turns). Others turn in
// buildWindpumpWheels.
function windpumpTower(terrain, batch, x, y, id, broken) {
  const W = WINDPUMP;
  const A = batch.audit;
  const base = Math.min(...W.legs.map(([lx, ly]) => terrain.heightAt(x + lx, y + ly)));
  const m0 = objMatrix(x, y, base, 0);
  const steel = broken ? RUST[2] : 0x9aa0a3;
  const top = 0.45;
  const legs = W.legs.map(([lx, ly]) => [new THREE.Vector3(lx, -0.6, ly), new THREE.Vector3(Math.sign(lx) * top, W.H, Math.sign(ly) * top)]);
  for (const [p, q] of legs) batch.add(strut(p, q, 0.07, 4), m0, steel);
  for (const [lx, ly] of W.legs) {
    batch.place(box(0.5, 0.5, 0.5), x + lx, y + ly, terrain.heightAt(x + lx, y + ly) - 0.35, 0, 0, 0, 0, 0xa9a69c, { cast: false });
    if (A) A.rect(id, 'windpump_foot', x + lx, y + ly, 0.5, 0.5, 0, terrain.heightAt(x + lx, y + ly) - 0.35, null);
  }
  const at = (leg, f) => new THREE.Vector3().lerpVectors(leg[0], leg[1], f);
  for (let i = 0; i < 4; i++) {
    const p = legs[i];
    const q = legs[(i + 1) % 4];
    for (const f of [0.3, 0.62, 0.92]) batch.add(strut(at(p, f), at(q, f), 0.035, 3), m0, steel, { cast: false });
    batch.add(strut(at(p, 0.05), at(q, 0.3), 0.025, 3), m0, steel, { cast: false });
    batch.add(strut(at(p, 0.3), at(q, 0.62), 0.025, 3), m0, steel, { cast: false });
  }
  // Platform, head, pump rod down the middle, a small trough at the foot.
  batch.place(box(1.3, 0.08, 1.3), x, y, base, 0, 0, 0, W.H - 0.4, 0x6a5238, { cast: false });
  batch.place(box(0.5, 0.5, 0.9), x, y, base, WIND_FROM, 0, 0, W.H + 0.2, steel);
  batch.add(strut(new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, W.H, 0), 0.03, 3), m0, 0x5d6066, { cast: false });
  // Tail vane, behind the wheel.
  const tail = new THREE.Matrix4().makeTranslation(0, 0, 1.6);
  if (broken) tail.multiply(new THREE.Matrix4().makeRotationZ(0.6));
  batch.place(box(0.06, 0.06, 2.2), x, y, base, WIND_FROM, 0, 0, W.H + 0.45, steel, { extra: tail });
  batch.place(box(0.04, 1.0, 1.4), x, y, base, WIND_FROM, 0, 2.6, W.H + 0.05, broken ? RUST[0] : 0xd8d8d0, { extra: broken ? new THREE.Matrix4().makeRotationZ(0.6) : null });
  if (broken) {
    // What is left of the wheel, stuck: a few blades on a bent ring.
    const wheel = wheelGeometry(true);
    batch.add(wheel, objMatrix(x, y, base, WIND_FROM, 0, -0.7, W.H + 0.45, new THREE.Matrix4().makeRotationZ(0.4).multiply(new THREE.Matrix4().makeRotationX(0.12))), RUST[1]);
  }
  return true;
}

// Wheel of a windpump in its own frame: facing -z (the wind), centred on 0.
// partial: most blades missing.
function wheelGeometry(partial = false) {
  const R = WINDPUMP.wheelR;
  const parts = [];
  const ring = new THREE.TorusGeometry(R * 0.98, 0.035, 3, 18);
  parts.push(ring);
  parts.push(new THREE.TorusGeometry(R * 0.45, 0.03, 3, 12));
  parts.push(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8).rotateX(Math.PI / 2));
  const n = 18;
  const rng = makeRng(77);
  for (let i = 0; i < n; i++) {
    if (partial && rng() < 0.7) continue;
    const ang = (i / n) * Math.PI * 2;
    // A blade: a thin twisted plate from the inner to the outer ring.
    const b = new THREE.BoxGeometry(0.34, R * 0.58, 0.02).translate(0, R * 0.72, 0);
    b.rotateY(0.45);
    b.rotateZ(ang);
    parts.push(b);
  }
  const geos = parts.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    q.deleteAttribute('uv');
    return q;
  });
  const out = mergeSimple(geos);
  out.computeVertexNormals();
  return out;
}

function mergeSimple(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// The turning wheels of every working windpump: one instanced mesh, one
// draw call. Returns { object, update(t) } or null.
export function buildWindpumpWheels(world, terrain) {
  const list = world.landmarks.filter((l) => l.kind === 'windpump');
  if (!list.length) return null;
  const geo = wheelGeometry(false);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc8ccce, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const frames = list.map((l, i) => {
    const base = Math.min(...WINDPUMP.legs.map(([lx, ly]) => terrain.heightAt(l.x + lx, l.y + ly)));
    return { m: objMatrix(l.x, l.y, base, WIND_FROM, 0, -0.7, WINDPUMP.H + 0.45), speed: 1.1 + 0.35 * Math.sin(i * 2.1), phase: i * 1.3 };
  });
  const spin = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const update = (t) => {
    frames.forEach((f, i) => {
      spin.makeRotationZ(f.phase + t * f.speed);
      out.multiplyMatrices(f.m, spin);
      mesh.setMatrixAt(i, out);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  mesh.computeBoundingSphere();
  return { object: mesh, update };
}
