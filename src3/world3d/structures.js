// Buildings and landmarks as low-poly boxes and roofs. Footprints come from
// layout.js so what you see matches what you hit.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashString, localToWorld, distToPolyline, makeRng } from '../../src/drive/geom.js';
import {
  GAS, CHURCH, WATER_TOWER, MILL, RADIO_MAST, SILO, anchorPoints,
} from '../../src/drive/layout.js';
import { box, cyl, cone, pyramid, gable, strut, disc, flatPolygon } from './shapes.js';
import { buildKind } from './kinds.js';
import { buildNewLandmark } from './landmarks3d.js';
import { buildRuin, buildWindpumpWheels } from './ruins3d.js';
import { buildAirfield, buildAirfieldBuilding } from './airfield3d.js';
import { Batcher } from './batch.js';
import { state } from '../../src/state.js';
import { currentMissionId } from '../../src/game/tourists.js';

const WALLS = [0xe8e2d0, 0xf1ede4, 0xe6d9a8, 0xc9d3d6, 0xd9b9a0, 0xcfd8c4];
const ROOFS = [0x8e4b3a, 0x5a5f66, 0x6b4a3a, 0x4f6a5a, 0x7a3b3b, 0x6e6a60];
const WINDOW = 0x2c3a46;
const FOUND = 1.5; // walls reach this far below ground so slopes never show gaps

const PLINTH = 0x9a958a;

// Where a building stands on sloping ground: its floor is level with the high
// side of the footprint, so the uphill wall is never buried, and walls reach
// FOUND below that. Where the ground falls away further, a stone plinth fills
// down past the low side, so the downhill side never shows a gap.
// Returns { base, bottom } and draws the plinth when one is needed.
function standOn(terrain, batch, x, y, w, h, angle) {
  const { min, max } = terrain.groundRange({ rect: { x, y, w, h, angle } });
  let bottom = max - FOUND;
  if (max - min > 0.12) {
    bottom = Math.min(bottom, min - 0.3);
    const up = 0.18; // shows as a low stone course on the high side
    batch.place(box(w + 0.3, max - min + 0.3 + up, h + 0.3), x, y, min - 0.3, angle, 0, 0, 0, PLINTH);
  }
  return { base: max, bottom };
}

// Which side of a building faces the nearest road: 'n' | 's' | 'e' | 'w' in local terms.
function roadSide(world, b) {
  const sides = { n: [0, -b.h / 2], s: [0, b.h / 2], e: [b.w / 2, 0], w: [-b.w / 2, 0] };
  let best = 's';
  let bestD = Infinity;
  for (const [k, [lx, ly]] of Object.entries(sides)) {
    const p = localToWorld(b.x, b.y, b.angle || 0, lx * 3, ly * 3);
    for (const r of world.roads) {
      const d = distToPolyline(p.x, p.y, r.points);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
  }
  return best;
}

// Windows (and a door on `doorSide`) on the four walls of a w x d box.
function addOpenings(P, w, d, floors, doorSide, doorColor = 0x5b3a2a) {
  const sides = [
    { k: 'n', len: w, at: (t) => [t, -d / 2], g: (s) => box(s, 1.2, 0.12) },
    { k: 's', len: w, at: (t) => [t, d / 2], g: (s) => box(s, 1.2, 0.12) },
    { k: 'e', len: d, at: (t) => [w / 2, t], g: (s) => box(0.12, 1.2, s) },
    { k: 'w', len: d, at: (t) => [-w / 2, t], g: (s) => box(0.12, 1.2, s) },
  ];
  for (const s of sides) {
    const n = Math.max(1, Math.floor(s.len / 3.5));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const t = -s.len / 2 + (s.len * (i + 0.5)) / n;
        const door = s.k === doorSide && f === 0 && i === Math.floor(n / 2);
        const [lx, ly] = s.at(t);
        if (door) {
          const dg = s.k === 'n' || s.k === 's' ? box(1.1, 2.1, 0.14) : box(0.14, 2.1, 1.1);
          P(dg, lx, ly, 0, doorColor);
        } else {
          P(s.g(1.1), lx, ly, 1.1 + f * 2.8, WINDOW);
        }
      }
    }
  }
}

// extras.chimneys (optional Map): building id -> { x, y, top } where a model's
// chimney differs from the shared house formula the ambient smoke uses.
export function buildStructures(world, terrain, batch, materials, extras = {}) {
  for (const b of world.buildings) {
    const info = buildBuilding(world, terrain, batch, b);
    if (info && info.chimney && extras.chimneys) extras.chimneys.set(b.id, info.chimney);
  }
  const dynamic = [];
  const rng = makeRng(world.seed + 202);
  for (const l of world.landmarks) {
    if (l.kind === 'airfield') {
      dynamic.push(buildAirfield(world, terrain, batch, l));
      continue;
    }
    if (l.onlyMission) {
      // One mission's own piece (a tourist's parked car): its own mesh, shown
      // only while that mission plays. The region is built once for all.
      const own = new Batcher();
      own.audit = batch.audit;
      own.signs = batch.signs;
      if (buildRuin(world, terrain, own, l)) {
        const group = own.build(materials);
        const only = l.onlyMission;
        group.visible = false;
        dynamic.push({ object: group, update() { group.visible = currentMissionId(state) === only; } });
        continue;
      }
    }
    if (buildRuin(world, terrain, batch, l)) continue;
    if (buildNewLandmark(world, terrain, batch, l, rng)) continue;
    const d = buildLandmark(terrain, batch, l, rng, materials);
    if (d) dynamic.push(d);
  }
  const wheels = buildWindpumpWheels(world, terrain);
  if (wheels) dynamic.push(wheels);
  const signs = buildSigns(batch);
  if (signs) dynamic.push(signs);
  return dynamic;
}

// Painted signs the ruins asked for (batch.signs, see ruins3d.js): one mesh
// per image, its quads merged. Browser only (the image loads async; the
// world checker and dev tools run without a DOM and skip them).
function buildSigns(batch) {
  const list = batch.signs;
  batch.signs = null;
  if (!list || !list.length || typeof document === 'undefined') return null;
  const group = new THREE.Group();
  const byName = new Map();
  for (const s of list) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(new THREE.PlaneGeometry(s.w, s.h).applyMatrix4(s.matrix));
  }
  const loader = new THREE.TextureLoader();
  for (const [name, geos] of byName) {
    const tex = loader.load(`${import.meta.env.BASE_URL}look/signs/${name}.webp`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { object: group, update() {} };
}

function buildBuilding(world, terrain, batch, b) {
  const a = b.angle || 0;
  const hsh = hashString(b.id);
  const { base, bottom } = standOn(terrain, batch, b.x, b.y, b.w, b.h, a);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, b.x, b.y, base, a, lx, ly, up, color, opts);
  if (batch.audit) batch.audit.rect(b.id, b.kind, b.x, b.y, b.w, b.h, a, bottom, base);

  if (buildAirfieldBuilding(world, terrain, batch, b, base)) return;

  if (b.kind === 'gas') {
    const s = GAS.shop;
    const c = GAS.canopy;
    // Shop: white walls, red band, flat roof, big front window facing the pumps.
    P(box(s.w, 4 + FOUND, s.h), s.lx, s.ly, -FOUND, 0xeceae3);
    P(box(s.w + 0.3, 0.6, s.h + 0.3), s.lx, s.ly, 3.4, 0xc0392b);
    P(box(s.w + 0.1, 0.15, s.h + 0.1), s.lx, s.ly, 4.0, 0x6f6c66);
    P(box(s.w * 0.6, 1.6, 0.12), s.lx - 1, s.ly - s.h / 2, 0.9, WINDOW);
    P(box(1.1, 2.1, 0.14), s.lx + 3.5, s.ly - s.h / 2, 0, 0x7f8c8d);
    // Canopy on two pillars standing on the pump islands.
    P(box(c.w + 0.5, 0.8, c.h + 0.5), c.lx, c.ly, 4.6, 0xc0392b);
    P(box(c.w, 0.05, c.h), c.lx, c.ly, 4.57, 0xeceae3, { cast: false });
    for (const isl of GAS.islands) {
      P(box(isl.w, 0.2, isl.h), isl.lx, isl.ly, 0, 0x9a9890);
      P(box(0.4, 4.6, 0.4), isl.lx, isl.ly, 0, 0xd8d8d0);
      for (const dx of [-1.2, 1.2]) {
        P(box(0.7, 1.5, 0.5), isl.lx + dx, isl.ly, 0.2, 0xb3261e);
        P(box(0.72, 0.25, 0.52), isl.lx + dx, isl.ly, 1.7, 0xf2f2f2);
      }
    }
    return;
  }

  if (b.kind === 'shop') {
    P(box(b.w, 5 + FOUND, b.h), 0, 0, -FOUND, 0xc9b28f);
    P(box(b.w + 0.3, 0.5, b.h + 0.3), 0, 0, 5, 0x8a7a62); // parapet
    P(box(b.w - 0.6, 0.1, b.h - 0.6), 0, 0, 5.2, 0x6f6d68);
    // Shop front on the west (street) side with a striped awning.
    P(box(0.12, 1.8, b.h * 0.7), -b.w / 2, 0, 0.8, WINDOW);
    P(box(0.14, 2.2, 1.2), -b.w / 2, b.h * 0.4, 0, 0x5b3a2a);
    const n = 8;
    const seg = (b.h - 1) / n;
    for (let i = 0; i < n; i++) {
      const tilt = new THREE.Matrix4().makeRotationZ(-0.35);
      batch.place(box(1.8, 0.08, seg), b.x, b.y, base, a, -b.w / 2 - 0.85, -b.h / 2 + 0.5 + (i + 0.5) * seg, 2.9,
        i % 2 ? 0xf2efe6 : 0x2f6f8f, { extra: tilt });
    }
    P(box(0.12, 0.8, 1.2), b.w / 2, -2, 2.4, WINDOW);
    return;
  }

  if (b.kind === 'barn') {
    const wallH = 6;
    P(box(b.w, wallH + FOUND, b.h), 0, 0, -FOUND, 0xa8352b);
    P(gable(b.w + 0.8, b.h + 0.8, 4.5), 0, 0, wallH, 0x5a5f66);
    // White corner trim and big doors with an X on the long south side.
    for (const [lx, ly] of [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]]) {
      P(box(0.35, wallH, 0.35), lx, ly, 0, 0xf0ece2);
    }
    for (const side of [-1, 1]) {
      const ly = side * (b.h / 2);
      P(box(5, 4.4, 0.14), 0, ly, 0, 0x8c2a22);
      P(box(5.2, 0.25, 0.18), 0, ly, 4.4, 0xf0ece2);
      const diag = new THREE.Matrix4().makeRotationZ(Math.atan2(4.4, 5));
      batch.place(box(6.6, 0.22, 0.18), b.x, b.y, base, a, 0, ly, 2.1, 0xf0ece2, { extra: diag });
      const diag2 = new THREE.Matrix4().makeRotationZ(-Math.atan2(4.4, 5));
      batch.place(box(6.6, 0.22, 0.18), b.x, b.y, base, a, 0, ly, 2.1, 0xf0ece2, { extra: diag2 });
      P(box(1.4, 1.4, 0.14), 0, ly, 7.0 - 0.9, 0xf0ece2);
    }
    // Hay loft opening in the gable ends.
    for (const side of [-1, 1]) P(box(0.14, 1.6, 2), side * b.w / 2, 0, 6.4, 0x3a2a20);
    // Cupola on the ridge.
    P(box(2.4, 2.2, 2.4), 0, 0, wallH + 3.6, 0xf0ece2);
    P(pyramid(3.0, 1.6), 0, 0, wallH + 5.8, 0x5a5f66);
    // Silo with a domed top.
    const sp = { lx: b.w / 2 + SILO.dx, ly: SILO.ly };
    P(cyl(SILO.r, 14 + FOUND, 14), sp.lx, sp.ly, -FOUND, 0xbfc1bc);
    for (let y = 2; y < 14; y += 3) P(cyl(SILO.r + 0.08, 0.2, 14), sp.lx, sp.ly, y, 0x8f918e);
    const dome = new THREE.SphereGeometry(SILO.r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    P(dome, sp.lx, sp.ly, 14, 0x9ea3a6);
    return;
  }

  const kind = buildKind(batch, b, base, roadSide(world, b));
  if (kind) return kind;

  // Houses and the farmhouse.
  const farm = b.kind === 'farmhouse';
  const floors = farm || hsh % 3 === 0 ? 2 : 1;
  const wallH = floors === 2 ? 5.6 : 3.2;
  const wall = farm ? 0xf1ede4 : WALLS[(hsh >> 3) % WALLS.length];
  const roof = farm ? 0x5d6066 : ROOFS[hsh % ROOFS.length];
  P(box(b.w, wallH + FOUND, b.h), 0, 0, -FOUND, wall);
  const short = Math.min(b.w, b.h);
  P(gable(b.w + 0.8, b.h + 0.8, short * 0.42), 0, 0, wallH, roof);
  addOpenings(P, b.w, b.h, floors, roadSide(world, b));
  // Chimney poking through the roof.
  const cx = ((hsh >> 4) % 2 ? 1 : -1) * b.w * 0.25;
  const cy = ((hsh >> 6) % 2 ? 1 : -1) * b.h * 0.2;
  P(box(1, short * 0.42 + 1.4, 1), cx, cy, wallH, 0x7b5a4a);
  if (farm) {
    // Porch on the south side.
    P(box(b.w * 0.7, 0.2, 2.4), 0, b.h / 2 + 1.2, 2.6, 0x8a8c8f);
    P(box(b.w * 0.7, 0.25, 2.4), 0, b.h / 2 + 1.2, 0, 0xb8b0a0, { cast: false });
    for (const lx of [-b.w * 0.33, 0, b.w * 0.33]) P(box(0.2, 2.6, 0.2), lx, b.h / 2 + 2.2, 0, 0xf1ede4);
  }
}

function buildLandmark(terrain, batch, l, rng, materials) {
  const base = terrain.heightAt(l.x, l.y);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, 0, lx, ly, up, color, opts);
  const A = batch.audit;

  if (l.kind === 'church') {
    const n = CHURCH.nave;
    const t = CHURCH.tower;
    const stone = 0xe4ded0;
    if (A) {
      A.rect(l.id, 'church', l.x + n.lx, l.y + n.ly, n.w, n.h, 0, base - FOUND, base);
      A.rect(l.id, 'church', l.x + t.lx, l.y + t.ly, t.w, t.h, 0, base - FOUND, base);
    }
    P(box(n.w, 7 + FOUND, n.h), n.lx, n.ly, -FOUND, stone);
    P(gable(n.w + 0.8, n.h + 0.8, 6), n.lx, n.ly, 7, 0x55585e);
    // Tall pointed windows along the nave.
    for (let y = n.ly - n.h / 2 + 3; y < n.ly + n.h / 2 - 1; y += 4) {
      for (const side of [-1, 1]) P(box(0.14, 3.2, 1.1), side * n.w / 2, y, 2, 0x3b4a6b);
    }
    // Tower with a spire, belfry openings and a gold cross.
    P(box(t.w, 17 + FOUND, t.h), t.lx, t.ly, -FOUND, stone);
    P(box(t.w + 0.4, 0.5, t.h + 0.4), t.lx, t.ly, 17, 0xb9b2a2);
    for (const [dx, dy, g] of [[0, -t.h / 2, box(1.4, 2.2, 0.14)], [0, t.h / 2, box(1.4, 2.2, 0.14)], [-t.w / 2, 0, box(0.14, 2.2, 1.4)], [t.w / 2, 0, box(0.14, 2.2, 1.4)]]) {
      P(g, t.lx + dx, t.ly + dy, 13.5, 0x2a2a2a);
    }
    P(box(1.8, 2.8, 0.14), t.lx, t.ly - t.h / 2, 0, 0x5b3a2a); // door
    P(pyramid(t.w + 0.2, 15), t.lx, t.ly, 17.5, 0x4b4e55);
    P(box(0.25, 2.6, 0.25), t.lx, t.ly, 32.3, 0xd9c27a);
    P(box(1.4, 0.25, 0.25), t.lx, t.ly, 33.8, 0xd9c27a);
    P(box(0.2, 1.4, 0.2), n.lx, n.ly + n.h / 2, 12.5, 0xd9c27a);
    P(box(0.9, 0.2, 0.2), n.lx, n.ly + n.h / 2, 13.3, 0xd9c27a);
    // Gravestones either side of the nave.
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? -1 : 1;
      const gx = side * (9 + rng() * 6);
      const gy = -12 + rng() * 30;
      const tilt = new THREE.Matrix4().makeRotationZ((rng() - 0.5) * 0.2);
      batch.place(box(0.7, 0.9, 0.2), l.x, l.y, base, 0, gx, gy, 0, 0xb9b6ae, { cast: false, extra: tilt });
      if (A) A.rect(l.id, 'gravestone', l.x + gx, l.y + gy, 0.7, 0.2, 0, base, base + 0.4);
    }
    return null;
  }

  if (l.kind === 'water_tower') {
    const H = 20;
    const R = WATER_TOWER.tankR;
    // The legs run up to the rim of the tank's rounded bottom (it starts at H + 1.6),
    // so the tank sits on them instead of floating above their tips.
    const top = 0.66;
    const legTop = H + 1.5;
    const legs = WATER_TOWER.legs.map(([x, y]) => [new THREE.Vector3(x, -FOUND, y), new THREE.Vector3(x * top, legTop, y * top)]);
    const steel = 0x5d6468;
    if (A) for (const [x, y] of WATER_TOWER.legs) A.circle(l.id, 'tower_leg', l.x + x, l.y + y, WATER_TOWER.legR * 0.7, base - FOUND);
    for (const [a, b] of legs) batch.add(strut(a, b, WATER_TOWER.legR * 0.7, 6), mAt(l.x, base, l.y), steel);
    // Horizontal rings and X bracing between legs.
    const at = (leg, f) => new THREE.Vector3().lerpVectors(leg[0], leg[1], f);
    for (let i = 0; i < 4; i++) {
      const A = legs[i];
      const B = legs[(i + 1) % 4];
      for (const f of [0.38, 0.72]) batch.add(strut(at(A, f), at(B, f), 0.12), mAt(l.x, base, l.y), steel);
      batch.add(strut(at(A, 0.1), at(B, 0.38), 0.07), mAt(l.x, base, l.y), steel);
      batch.add(strut(at(B, 0.1), at(A, 0.38), 0.07), mAt(l.x, base, l.y), steel);
      batch.add(strut(at(A, 0.38), at(B, 0.72), 0.07), mAt(l.x, base, l.y), steel);
      batch.add(strut(at(B, 0.38), at(A, 0.72), 0.07), mAt(l.x, base, l.y), steel);
    }
    // Tank: rounded bottom, drum, cone roof, a catwalk ring.
    const bottom = new THREE.ConeGeometry(R, 2.2, 16).rotateX(Math.PI).translate(0, -1.1, 0);
    P(bottom, 0, 0, H + 1.6, 0x7f9aa6);
    P(cyl(R, 7, 16), 0, 0, H + 1.6, 0x93aebb);
    P(cyl(R + 0.05, 0.6, 16), 0, 0, H + 5.2, 0xb7cdd6);
    P(cone(R + 0.4, 2.6, 16), 0, 0, H + 8.6, 0x6c8693);
    P(cyl(R + 0.9, 0.15, 16), 0, 0, H + 1.9, 0x4b4f52);
    P(cyl(0.3, 0.8, 6), 0, 0, H + 11, 0x4b4f52);
    return null;
  }

  if (l.kind === 'mill_ruin') {
    // Scorched ground with ash.
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const r = 11 + rng() * 4;
      pts.push([l.x + Math.cos(ang) * r * 1.1, l.y + Math.sin(ang) * r * 0.85]);
    }
    // Painted onto the ground, so it follows the slope.
    if (batch.paint) {
      batch.paint.polygon(pts, 0x4a4436);
      const ash = [];
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ash.push([l.x - 1 + Math.cos(ang) * 6.5 * 1.15, l.y + Math.sin(ang) * 6.5 * 0.85]);
      }
      batch.paint.polygon(ash, 0x34302a);
    }
    // Standing walls: jagged stone, blackened on top.
    for (const w of MILL.walls) {
      const along = w.w >= w.h;
      const len = along ? w.w : w.h;
      const pieces = Math.max(1, Math.round(len / 1.5));
      const seg = len / pieces;
      const maxH = 2 + rng() * 4.5;
      for (let i = 0; i < pieces; i++) {
        const t = -len / 2 + seg * (i + 0.5);
        const hgt = Math.max(0.6, maxH * (0.5 + rng() * 0.5));
        const lx = w.lx + (along ? t : 0);
        const ly = w.ly + (along ? 0 : t);
        const gw = along ? seg : w.w;
        const gd = along ? w.h : seg;
        P(box(gw, hgt + FOUND, gd), lx, ly, -FOUND, 0x877763); // stone wall texture
        if (A) A.rect(l.id, 'mill_wall', l.x + lx, l.y + ly, gw, gd, 0, base - FOUND, base + Math.min(0.5, hgt / 2));
        P(box(gw + 0.02, 0.5 + rng() * 0.6, gd + 0.02), lx, ly, hgt - 0.4, 0x3b342d); // scorched
      }
    }
    const c = MILL.chimney;
    P(box(c.w, 13 + FOUND, c.h), c.lx, c.ly, -FOUND, 0x7a6c5b);
    P(box(c.w + 0.3, 0.5, c.h + 0.3), c.lx, c.ly, 12.6, 0x3c332b);
    P(box(c.w * 0.5, 0.3, c.h * 0.5), c.lx, c.ly, 13.0, 0x111111);
    // Rubble, fallen charred beams (some leaning), and a millstone.
    const rubble = new THREE.DodecahedronGeometry(0.4, 0);
    for (let i = 0; i < 40; i++) {
      const s = 0.5 + rng() * 1.2;
      const m = mAt(l.x + (rng() - 0.5) * 20, base, l.y + (rng() - 0.5) * 14, new THREE.Matrix4().makeScale(s, s * 0.6, s));
      batch.add(rubble, m, rng() < 0.5 ? 0x857563 : 0x5f554a, { cast: false });
    }
    for (let i = 0; i < 7; i++) {
      const lean = new THREE.Matrix4().makeRotationX(i < 3 ? 0.6 + rng() * 0.4 : Math.PI / 2 - 0.05);
      batch.place(box(0.45, 3 + rng() * 4, 0.45), l.x, l.y, base, rng() * 180, (rng() - 0.5) * 10, (rng() - 0.5) * 8, 0.1, 0x2a2520, { extra: lean }); // charred
    }
    P(cyl(1.4, 0.45, 12), 11, 5, 0, 0x8f8a80);
    if (A) A.circle(l.id, 'millstone', l.x + 11, l.y + 5, 1.4, base, base + 0.2);
    millWheel(terrain, batch, l, rng);
    return null;
  }

  if (l.kind === 'radio_mast') {
    const H = 70;
    const r = 0.9;
    const legAt = (k, y) => new THREE.Vector3(Math.sin((k * 120 * Math.PI) / 180) * r, y, -Math.cos((k * 120 * Math.PI) / 180) * r);
    const m0 = mAt(l.x, base, l.y);
    P(cyl(RADIO_MAST.baseR, 0.6, 12), 0, 0, -0.2, 0xa9a69c);
    if (A) A.circle(l.id, 'mast_base', l.x, l.y, RADIO_MAST.baseR, base - 0.2, base + 0.3);
    // Lattice in red and white bands, 10 m each.
    const step = 2.5;
    for (let y = 0; y < H; y += step) {
      const color = Math.floor(y / 10) % 2 ? 0xf2f2f2 : 0xc0392b;
      for (let k = 0; k < 3; k++) {
        batch.add(strut(legAt(k, y), legAt(k, y + step), 0.12), m0, color);
        batch.add(strut(legAt(k, y), legAt((k + 1) % 3, y + step), 0.05), m0, color, { cast: false });
        batch.add(strut(legAt(k, y + step), legAt((k + 1) % 3, y + step), 0.05), m0, color, { cast: false });
      }
    }
    // Anchor blocks; guy wires are lines (see below).
    for (const p of anchorPoints(l)) {
      const ab = terrain.heightAt(p.x, p.y);
      batch.add(box(RADIO_MAST.anchorR * 2, 0.8 + FOUND, RADIO_MAST.anchorR * 2), mAt(p.x, ab - FOUND, p.y), 0xa9a69c);
      if (A) A.rect(l.id, 'mast_anchor', p.x, p.y, RADIO_MAST.anchorR * 2, RADIO_MAST.anchorR * 2, 0, ab - FOUND, ab + 0.4);
    }
    const wire = [];
    for (const p of anchorPoints(l)) {
      const ab = terrain.heightAt(p.x, p.y) + 0.8;
      for (const hh of [22, 44, 66]) wire.push(p.x, ab, p.y, l.x, base + hh, l.y);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.8 }));
    // Blinking red light on top: an unlit bulb plus a glow
    // sprite that shows through fog. Small and soft by day, but seen from
    // far off: past the far plane the glow is drawn just inside it, along the
    // same line of sight (its size is in screen terms, so it looks the same).
    const obj = new THREE.Group();
    obj.add(wires);
    const bulbs = [];
    const glows = [];
    for (const [hh, gs] of [[H + 0.5, 0.026]]) {
      const light = new THREE.Group();
      light.position.set(l.x, base + hh, l.y);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false, toneMapped: false }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        // Normal blending: a red dot reads against a bright sky, where an
        // additive glow would wash out to pink.
        map: materials.glowTex, color: 0xff2414, fog: false, transparent: true, opacity: 0.9, depthWrite: false,
        sizeAttenuation: false, toneMapped: false,
      }));
      glow.scale.set(gs, gs, 1);
      glow.frustumCulled = false;
      const home = light.position.clone();
      const dir = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      glow.onBeforeRender = (r, sc, cam) => {
        camPos.setFromMatrixPosition(cam.matrixWorld);
        dir.subVectors(home, camPos);
        const d = dir.length();
        const lim = (cam.far || 1e9) * 0.9;
        if (d > lim) glow.position.copy(dir.multiplyScalar(lim / d)).add(camPos).sub(home);
        else glow.position.set(0, 0, 0);
        glow.updateMatrixWorld();
      };
      light.add(bulb, glow);
      obj.add(light);
      bulbs.push(bulb);
      glows.push(glow);
    }
    return {
      object: obj,
      update(t) {
        // (dev: window.__mastLight = true / false holds it on or off for screenshots)
        const on = globalThis.__mastLight ?? (t % 1.6) < 0.8;
        for (const b of bulbs) b.material.color.setHex(on ? 0xff2a1a : 0x3a0a08);
        for (const g of glows) g.visible = on;
      },
    };
  }
  return null;
}

// The mill's water wheel: fallen off its axle in the fire and leaning back
// against the creek-side wall, charred paddles between two rusted iron rims,
// its foot sunk in the bank.
function millWheel(terrain, batch, l, rng) {
  const W = MILL.wheel;
  const R = W.r;
  const cx = l.x + W.lx;
  const cy = l.y + W.ly;
  const g = terrain.groundRange({ rect: { x: cx, y: cy, w: W.w, h: W.h, angle: 0 } });
  const lean = new THREE.Matrix4().makeRotationX(0.3).multiply(new THREE.Matrix4().makeRotationZ(0.12));
  const frame = new THREE.Matrix4().makeTranslation(cx, g.min + R - 0.55, cy).multiply(lean);
  const rim = new THREE.TorusGeometry(R, 0.11, 4, 22);
  // Iron rims and axle, heavy rust; spokes and paddles old wet wood, some charred.
  for (const z of [-0.55, 0.55]) batch.add(rim, frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)), 0x5f3b25);
  batch.add(new THREE.CylinderGeometry(0.35, 0.35, 1.5, 8).rotateX(Math.PI / 2), frame, 0x52301c);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const z of [-0.5, 0.5]) {
      const sp = box(0.14, R, 0.14).rotateZ(a);
      batch.add(sp, frame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)), 0x3a3430, { cast: false });
    }
  }
  for (let i = 0; i < 20; i++) {
    if (rng() < 0.3) continue; // burned away
    const a = (i / 20) * Math.PI * 2;
    const paddle = new THREE.BoxGeometry(0.08, 0.7, 1.2).translate(0, R - 0.3, 0).rotateZ(a);
    batch.add(paddle, frame, rng() < 0.5 ? 0x2b2621 : 0x3a3430, { cast: false });
  }
  if (batch.audit) batch.audit.rect(l.id, 'mill_wheel', cx, cy, 1.0, 0.8, 0, g.min - 0.55 + R - R * Math.cos(0.12) - 0.4, null);
}

function mAt(x, y, z, extra = null) {
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  if (extra) m.multiply(extra);
  return m;
}
