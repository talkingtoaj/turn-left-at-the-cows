// Buildings and landmarks as low-poly boxes and roofs. Footprints come from
// layout.js so what you see matches what you hit.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashString, localToWorld, distToPolyline, makeRng } from '../../src/drive/geom.js';
import {
  GAS, MILL, RADIO_MAST, SILO, anchorPoints,
} from '../../src/drive/layout.js';
import { box, cyl, cone, pyramid, gable, strut, disc, flatPolygon } from './shapes.js';
import { buildKind } from './kinds.js';
import { buildNewLandmark } from './landmarks3d.js';
import { buildChurch } from './church3d.js';
import { buildRuin, buildWindpumpWheels } from './ruins3d.js';
import { buildAirfield, buildAirfieldBuilding } from './airfield3d.js';
import { buildGasStation } from './gas3d.js';
import { buildFarmhouse } from './farmhouse3d.js';
import { buildHouse } from './house3d.js';
import { buildWaterTower } from './watertower3d.js';
import { buildGrainElevator, buildFarmSilo } from './elevator3d.js';
import { buildShop } from './shops3d.js';
import { buildBarn } from './barn3d.js';
import { buildDogYards } from './dog3d.js';
import { Batcher } from './batch.js';
import { state } from '../../src/state.js';
import { currentMissionId } from '../../src/game/tourists.js';

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

// How far each side of a building ('n' | 's' | 'e' | 'w' in local terms) is from the nearest road.
export function sideDistances(world, b) {
  const sides = { n: [0, -b.h / 2], s: [0, b.h / 2], e: [b.w / 2, 0], w: [-b.w / 2, 0] };
  const out = {};
  for (const [k, [lx, ly]] of Object.entries(sides)) {
    const p = localToWorld(b.x, b.y, b.angle || 0, lx * 3, ly * 3);
    out[k] = Infinity;
    for (const r of world.roads) out[k] = Math.min(out[k], distToPolyline(p.x, p.y, r.points));
  }
  return out;
}

// Which side of a building faces the nearest road.
function roadSide(world, b) {
  const d = sideDistances(world, b);
  let best = 'n';
  for (const k of ['n', 's', 'e', 'w']) if (d[k] < d[best]) best = k;
  return best;
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
    if (l.kind === 'grain_elevator') {
      buildGrainElevator(world, terrain, batch, l); // elevator3d.js (#67)
      continue;
    }
    if (buildRuin(world, terrain, batch, l)) continue;
    if (buildNewLandmark(world, terrain, batch, l, rng)) continue;
    if (l.kind === 'water_tower') {
      buildWaterTower(world, terrain, batch, l); // watertower3d.js (#60)
      continue;
    }
    const d = buildLandmark(terrain, batch, l, rng, materials);
    if (d) dynamic.push(d);
  }
  buildDogYards(world, terrain, batch); // the farm dog's fence and doghouse (dog3d.js, #68)
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
    buildGasStation(b, base, batch, P); // gas3d.js (#58)
    return;
  }

  if (b.kind === 'shop') {
    buildShop(b, base, batch, roadSide(world, b)); // shops3d.js (#70)
    return;
  }

  if (b.kind === 'barn') {
    buildBarn(batch, b, base, sideDistances(world, b)); // barn3d.js (#79)
    return;
  }

  const kind = buildKind(batch, b, base, roadSide(world, b));
  if (kind) return kind;

  if (b.kind === 'farmhouse') {
    buildFarmhouse(terrain, batch, b, base, hsh, sideDistances(world, b)); // farmhouse3d.js (#63)
    return;
  }

  return buildHouse(world, terrain, batch, b, base, roadSide(world, b)); // house3d.js (#76)
}

function buildLandmark(terrain, batch, l, rng, materials) {
  const base = terrain.heightAt(l.x, l.y);
  const P = (geo, lx, ly, up, color, opts) => batch.place(geo, l.x, l.y, base, 0, lx, ly, up, color, opts);
  const A = batch.audit;

  if (l.kind === 'church') {
    buildChurch(terrain, batch, l, rng); // church3d.js (#59)
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
