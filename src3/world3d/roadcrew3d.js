// The road crew in 3D (#95, SPEC 9s item 9; layout, dig loop and wave in
// src/world/roadcrew.js, sound in src/audio/crewSound.js): an excavator that
// digs the ditch and swings round to dump into a dump truck, the truck, cones,
// two barricades, heaps of dug dirt and a worker in a hard hat who waves.
// Built in code with rounded edges, no model files.
//
// It is a showpiece (src3/showpieces.js): it shows only when the frame rate has
// room, and only changes while out of sight. Hidden, it costs nothing.
// Draw calls when shown: 1 static mesh (tracks, truck, cones, barricades, heaps,
// the worker) + the cab, boom, stick and bucket + the bucket's dirt + the
// worker's waving arm = 8, and 5 of them cast shadows.
//
//   const crew = createRoadCrew({ scene, world, terrain, collider, params })
//   crew.update(dt, { camera, ear, detail, paused, missionIndex })
//   crew.shown, crew.pose, crew.frame, crew.group

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ROAD_CREW, CREW_PLACES, CREW_SOLIDS, ARM, crewFrame, crewToWorld, crewSolidRects, digPose, clankBetween, waving, waveAngle, crewEligible,
} from '../../src/world/roadcrew.js';
import { createShowpieceGate, showpiecesMode, sightOf } from '../showpieces.js';
import { openingFor } from '../../src/game/opening.js';
import { crewVoice, createCrewSound, CREW_HEAR_R } from '../../src/audio/crewSound.js';

const DEG = Math.PI / 180;
export const CREW_RADIUS = 44; // m: every part lies within this of the crew's centre

const YEL = 0xe0a21a;
const YEL_D = 0xb9840f;
const GREY = 0x34373a;
const STEEL = 0x6c7176;
const GLASS = 0x26384a;
const BLACK = 0x1b1b1c;
const ORANGE = 0xe0561a;
const WHITE = 0xeeeeea;
const DIRT = 0x5a4331;
const DIRT_L = 0x6d553f;
const JEANS = 0x3a4e72;
const VEST = 0xff7b1c;
const SKIN = 0xd6a077;
const HAT = 0xf1d11a;
const AMBER = 0xffb21a;
const TRUCK = 0xdc6a1c; // county orange

const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

// A geometry with flat colour in vertex colours, no uv, flat normals.
function paint(geo, color, m = null) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  if (m) g.applyMatrix4(m);
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// Rounded box centred at (x, y, z); r is the corner radius.
function rb(w, h, d, x, y, z, color, r = 0.05, rot = null) {
  const seg = Math.max(w, h, d) > 0.9 ? 2 : 1;
  const m = T(x, y, z);
  if (rot) m.multiply(rot);
  return paint(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.001)), color, m);
}
// A cylinder along an axis ('x' | 'y' | 'z').
function cyl(axis, r, len, x, y, z, color, seg = 10, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, len, seg);
  const m = T(x, y, z);
  if (axis === 'x') m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  if (axis === 'z') m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return paint(g, color, m);
}
// A side profile ([z, y] points) extruded w across x, edges rounded by b, centred on x = cx.
function side(pts, w, b, cx, color, y0 = 0, z0 = 0) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.002, w - 2 * b);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape x -> z, extrusion -> x
  return paint(g, color, T(cx, y0, z0));
}
// A track: a stadium of length len, height h.
function stadium(len, h, w, cx, color) {
  const r = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2 + r, 0);
  shape.lineTo(len / 2 - r, 0);
  shape.absarc(len / 2 - r, r, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-len / 2 + r, h);
  shape.absarc(-len / 2 + r, r, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const b = 0.05;
  const depth = w - 2 * b;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return paint(g, color, T(cx, 0, 0));
}
const merge = (list) => mergeGeometries(list, false);

// ---- the parts (each in its own local frame: x right, y up, -z forward) ----

function excavatorUnder() {
  const L = [];
  for (const s of [-1, 1]) {
    L.push(stadium(3.9, 0.95, 0.72, s * 1.08, GREY));
    L.push(rb(0.8, 0.1, 3.3, s * 1.08, 1.0, 0, YEL_D, 0.04)); // guard over the track
    L.push(cyl('x', 0.3, 0.8, s * 1.08, 0.47, 1.45, STEEL, 10)); // drive sprocket
    L.push(cyl('x', 0.28, 0.8, s * 1.08, 0.47, -1.45, STEEL, 10)); // idler
  }
  L.push(rb(1.9, 0.5, 2.8, 0, 0.62, 0, GREY, 0.06)); // frame between the tracks
  L.push(cyl('y', 0.95, 0.22, 0, 0.98, 0, STEEL, 16)); // slew ring
  return L;
}

// The cab and all that turns with it, pivot at the swing axis (y = 0 there).
function excavatorCab() {
  const L = [];
  L.push(rb(2.7, 0.3, 3.3, 0, 0.15, 0.05, GREY, 0.05)); // deck
  L.push(rb(2.3, 1.05, 1.5, 0, 0.82, 1.15, YEL, 0.1)); // engine hood
  L.push(rb(2.5, 1.0, 0.85, 0, 0.8, 2.0, YEL_D, 0.1)); // counterweight
  L.push(rb(1.3, 0.55, 1.5, -0.65, 0.58, -0.55, YEL, 0.08)); // cab floor and side
  L.push(rb(1.3, 1.5, 1.45, -0.65, 1.28, -0.55, YEL, 0.1)); // operator cab
  L.push(rb(1.1, 0.95, 0.05, -0.65, 1.42, -1.29, GLASS, 0.02)); // windscreen
  L.push(rb(0.05, 0.95, 1.1, -1.31, 1.42, -0.55, GLASS, 0.02)); // side glass
  L.push(rb(0.05, 0.95, 1.1, 0.0, 1.42, -0.55, GLASS, 0.02)); // glass toward the boom
  L.push(rb(1.5, 0.1, 1.65, -0.65, 2.08, -0.55, GREY, 0.04)); // roof
  L.push(cyl('y', 0.1, 0.14, -1.0, 2.2, 0.0, AMBER, 8)); // beacon
  L.push(cyl('y', 0.07, 0.8, 0.75, 1.75, 1.0, STEEL, 8)); // exhaust
  L.push(rb(0.55, 0.55, 1.5, 1.0, 0.55, -0.05, YEL_D, 0.05)); // toolbox beside the boom
  L.push(rb(0.55, 0.7, 0.5, 0.45, 0.58, -0.55, YEL, 0.06)); // boom bracket
  return L;
}

// The boom lies along -z from its foot (z = 0) to z = -ARM.boom, with a banana arch above the line.
function boomGeo() {
  const E = ARM.boom;
  const pts = [[0.2, 0.34], [-0.9, 0.58], [-1.8, 0.62], [-2.7, 0.4], [-E, 0.2], [-E, -0.2], [-2.4, -0.02], [-1.2, 0.0], [0.2, -0.3]];
  return merge([side(pts, 0.42, 0.04, 0, YEL), cyl('z', 0.07, 1.6, 0, 0.78, -1.1, STEEL, 8)]);
}
function stickGeo() {
  const E = ARM.stick;
  const pts = [[0.25, 0.22], [-0.8, 0.3], [-E, 0.14], [-E, -0.14], [-0.8, -0.24], [0.25, -0.22]];
  return merge([side(pts, 0.34, 0.04, 0, YEL_D), cyl('z', 0.06, 1.1, 0, 0.42, -0.3, STEEL, 8)]);
}
function bucketGeo() {
  const E = ARM.bucket;
  const pts = [[0.2, 0.42], [-0.3, 0.55], [-0.75, 0.3], [-E, -0.04], [-E + 0.12, -0.14], [-0.5, -0.22], [0.05, -0.04]];
  const L = [side(pts, 0.92, 0.04, 0, GREY)];
  for (const x of [-0.34, -0.11, 0.11, 0.34]) L.push(rb(0.09, 0.14, 0.16, x, -0.12, -E - 0.02, STEEL, 0.02));
  return merge(L);
}
function loadGeo() {
  return merge([rb(0.8, 0.3, 0.75, 0, 0.34, -0.5, DIRT, 0.1), rb(0.45, 0.2, 0.4, 0.1, 0.52, -0.55, DIRT_L, 0.08)]);
}

function truckGeo() {
  const L = [];
  L.push(rb(1.0, 0.28, 7.3, 0, 0.98, 0, GREY, 0.05)); // chassis rails
  const wheel = (x, z, wide) => {
    L.push(cyl('x', 0.52, wide, x, 0.52, z, BLACK, 12));
    L.push(cyl('x', 0.3, wide + 0.04, x, 0.52, z, STEEL, 8));
  };
  for (const s of [-1, 1]) {
    wheel(s * 1.1, -2.6, 0.34);
    for (const z of [1.15, 2.5]) wheel(s * 1.0, z, 0.72);
    L.push(rb(0.4, 0.14, 1.2, s * 1.1, 1.18, -2.6, TRUCK, 0.05)); // front mudguard
    L.push(rb(0.9, 0.14, 2.4, s * 1.0, 1.2, 1.82, GREY, 0.05)); // rear mudguard
  }
  L.push(rb(2.0, 0.95, 1.5, 0, 1.6, -3.05, TRUCK, 0.12)); // hood
  L.push(rb(2.4, 1.7, 1.75, 0, 2.15, -1.45, TRUCK, 0.14)); // cab
  L.push(rb(2.0, 0.78, 0.05, 0, 2.5, -2.34, GLASS, 0.02)); // windscreen
  for (const s of [-1, 1]) L.push(rb(0.05, 0.72, 1.15, s * 1.21, 2.45, -1.45, GLASS, 0.02)); // side glass
  L.push(rb(1.6, 0.6, 0.06, 0, 1.55, -3.82, BLACK, 0.02)); // grille
  for (const s of [-1, 1]) L.push(rb(0.28, 0.2, 0.07, s * 0.75, 1.9, -3.8, WHITE, 0.03)); // headlights
  L.push(rb(2.45, 0.3, 0.28, 0, 0.88, -3.78, GREY, 0.06)); // bumper
  L.push(cyl('y', 0.08, 1.7, 1.05, 2.75, -0.55, STEEL, 8)); // exhaust stack
  L.push(rb(0.9, 0.13, 0.22, 0, 3.07, -1.2, AMBER, 0.04)); // light bar
  // The bed: floor, sides, headboard, tailgate, and the dirt in it.
  L.push(rb(2.5, 0.2, 4.3, 0, 1.3, 1.65, GREY, 0.05));
  for (const s of [-1, 1]) L.push(rb(0.18, 1.1, 4.3, s * 1.23, 1.9, 1.65, TRUCK, 0.06));
  L.push(rb(2.5, 1.5, 0.2, 0, 2.05, -0.4, TRUCK, 0.06));
  L.push(rb(2.5, 1.0, 0.16, 0, 1.85, 3.8, TRUCK, 0.05));
  L.push(rb(2.1, 0.55, 3.8, 0, 1.68, 1.7, DIRT, 0.12));
  L.push(rb(1.4, 0.4, 2.0, 0.05, 2.05, 1.9, DIRT_L, 0.12));
  return merge(L);
}

function coneGeo() {
  return merge([
    cyl('y', 0.17, 0.62, 0, 0.35, 0, ORANGE, 8, 0.045),
    cyl('y', 0.115, 0.13, 0, 0.4, 0, WHITE, 8, 0.1),
    rb(0.4, 0.04, 0.4, 0, 0.02, 0, BLACK, 0.015),
  ]);
}
function barricadeGeo() {
  const L = [];
  for (const x of [-0.75, 0.75]) L.push(rb(0.07, 1.15, 0.07, x, 0.58, 0.0, STEEL, 0.02));
  for (const y of [1.0, 0.72, 0.44]) {
    for (let i = 0; i < 6; i++) L.push(rb(0.27, 0.2, 0.05, -0.68 + i * 0.27, y, -0.06, i % 2 ? WHITE : ORANGE, 0.015));
  }
  return merge(L);
}
function spoilGeo() {
  return merge([
    rb(1.9, 0.5, 1.3, 0, 0.2, 0, DIRT, 0.2),
    rb(1.1, 0.4, 0.8, -0.2, 0.5, 0.1, DIRT_L, 0.15),
    rb(0.8, 0.3, 0.7, 0.6, 0.3, -0.5, DIRT, 0.12),
  ]);
}
function workerGeo() {
  const L = [];
  for (const x of [-0.11, 0.11]) {
    L.push(rb(0.17, 0.85, 0.2, x, 0.5, 0, JEANS, 0.04));
    L.push(rb(0.18, 0.1, 0.3, x, 0.05, -0.04, BLACK, 0.03));
  }
  L.push(rb(0.5, 0.62, 0.28, 0, 1.2, 0, VEST, 0.06));
  L.push(rb(0.52, 0.06, 0.3, 0, 1.08, 0, WHITE, 0.02), rb(0.52, 0.06, 0.3, 0, 1.34, 0, WHITE, 0.02));
  L.push(rb(0.12, 0.55, 0.14, -0.32, 1.18, 0, 0x5a6b7d, 0.04)); // left arm, hanging
  L.push(paint(new THREE.SphereGeometry(0.13, 8, 6), SKIN, T(0, 1.64, 0)));
  L.push(paint(new THREE.SphereGeometry(0.155, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), HAT, T(0, 1.68, 0)));
  L.push(rb(0.34, 0.03, 0.38, 0, 1.675, -0.07, HAT, 0.01));
  return merge(L);
}
function armGeo() {
  // Pivot at the shoulder, hanging down.
  return merge([rb(0.12, 0.5, 0.14, 0, -0.25, 0, 0x5a6b7d, 0.04), rb(0.1, 0.1, 0.12, 0, -0.55, 0, SKIN, 0.03)]);
}

// ---- assembly ----

function matrixAt(x, y, z, headingDeg) {
  return T(x, y, z).multiply(new THREE.Matrix4().makeRotationY(-headingDeg * DEG));
}
function placed(geo, m) {
  const g = geo.clone();
  g.applyMatrix4(m);
  return g;
}

export function createRoadCrew({ scene, world, terrain, collider = null, params = new URLSearchParams() }) {
  const F = crewFrame(world);
  const none = { shown: false, pose: null, frame: null, group: null, update() {}, dispose() {} };
  if (!F || (world.regionId || ROAD_CREW.region) !== ROAD_CREW.region) return none;
  const heightAt = (p) => terrain.heightAt(p.x, p.y);
  const worldOf = (pl) => crewToWorld(F, pl.u, pl.off);
  const gate = createShowpieceGate({ mode: showpiecesMode(params), latch: true });
  const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const group = new THREE.Group();
  group.name = 'roadcrew';
  group.visible = false;
  const toDispose = [];
  const mesh = (geo, shadow = true) => {
    const m = new THREE.Mesh(geo, mat());
    m.castShadow = shadow;
    m.receiveShadow = true;
    toDispose.push(geo, m.material);
    return m;
  };

  // Static: one mesh in world space.
  const statics = [];
  const exW = worldOf(CREW_PLACES.excavator);
  const exSolid = CREW_SOLIDS.find((s) => s.id === 'excavator');
  const exGround = terrain.groundRange({ rect: { x: exW.x, y: exW.y, w: exSolid.w, h: exSolid.len, angle: F.heading } }).max - 0.05;
  statics.push(placed(merge(excavatorUnder()), matrixAt(exW.x, exGround, exW.y, F.heading)));
  const trW = worldOf(CREW_PLACES.truck);
  const trSolid = CREW_SOLIDS.find((s) => s.id === 'truck');
  const trGround = terrain.groundRange({ rect: { x: trW.x, y: trW.y, w: trSolid.w, h: trSolid.len, angle: F.heading } }).max - 0.03;
  statics.push(placed(truckGeo(), matrixAt(trW.x, trGround, trW.y, F.heading)));
  const cone = coneGeo();
  for (const c of CREW_PLACES.cones) {
    const w = worldOf(c);
    statics.push(placed(cone, matrixAt(w.x, heightAt(w), w.y, F.heading)));
  }
  const barr = barricadeGeo();
  for (const c of CREW_PLACES.barricades) {
    const w = worldOf(c);
    statics.push(placed(barr, matrixAt(w.x, heightAt(w), w.y, F.heading)));
  }
  const spoil = spoilGeo();
  CREW_PLACES.spoil.forEach((c, i) => {
    const w = worldOf(c);
    statics.push(placed(spoil, matrixAt(w.x, heightAt(w) - 0.1, w.y, F.heading + i * 40)));
  });
  const wkW = worldOf(CREW_PLACES.worker);
  const wkGround = heightAt(wkW);
  const wkHeading = F.heading - 90; // faces the road, to the left of travel
  statics.push(placed(workerGeo(), matrixAt(wkW.x, wkGround, wkW.y, wkHeading)));
  const staticMesh = mesh(merge(statics));
  group.add(staticMesh);
  statics.length = 0;

  // The cab and the arm.
  const cabRoot = new THREE.Group();
  cabRoot.position.set(exW.x, exGround, exW.y);
  cabRoot.rotation.y = -F.heading * DEG;
  const cab = new THREE.Group();
  cab.position.y = 1.0; // the swing axis: the deck sits on the slew ring
  cab.add(mesh(merge(excavatorCab())));
  const boom = new THREE.Group();
  boom.position.set(0.45, 0.5, -0.7); // foot: ARM.foot is 0.7 out and 1.5 up from the ground at the axis
  boom.add(mesh(boomGeo()));
  const stick = new THREE.Group();
  stick.position.z = -ARM.boom;
  stick.add(mesh(stickGeo()));
  const bucket = new THREE.Group();
  bucket.position.z = -ARM.stick;
  bucket.add(mesh(bucketGeo()));
  const load = mesh(loadGeo(), false);
  bucket.add(load);
  stick.add(bucket);
  boom.add(stick);
  cab.add(boom);
  cabRoot.add(cab);
  group.add(cabRoot);

  // The worker's waving arm.
  const arm = mesh(armGeo(), false);
  const armRoot = new THREE.Group();
  armRoot.position.set(wkW.x, wkGround + 1.42, wkW.y);
  armRoot.rotation.y = -wkHeading * DEG;
  arm.position.set(0.31, 0, 0);
  armRoot.add(arm);
  group.add(armRoot);
  scene.add(group);

  // Centre of the crew for the sight test.
  const centre = crewToWorld(F, 0, 6);
  const solidsAdded = { v: false };
  let secs = 0; // crew clock: seconds the world has run unpaused
  let t = 0; // the dig loop's clock, runs only while shown
  let was = false; // was the worker waving
  let waveK = 0; // 0 arm down .. 1 fully waving
  let sound = null;
  const fwd = new THREE.Vector3();
  const api = {
    group, frame: F, pose: digPose(0), shown: false, wave: 0,
    centre,
    freeze: false, // dev (tools/shots-roadcrew.mjs): hold the dig loop where seek() put it
    seek(s) { t = s; },
    // detail: the resolution scaler's number (src3/resscale.js).
    update(dt, { camera, ear, detail = 1, paused = false, missionIndex = 0 } = {}) {
      if (!paused) secs += dt;
      camera.getWorldDirection(fwd);
      const sight = sightOf(camera.position, { x: fwd.x, z: fwd.z }, centre.x, centre.y, CREW_RADIUS);
      const eligible = crewEligible({
        regionId: world.regionId || ROAD_CREW.region, secs, opening: openingFor(missionIndex) && params.get('opening') !== 'off',
      });
      const shown = gate.update({ detail, dist: sight.dist, behind: sight.behind, eligible });
      if (shown !== group.visible) {
        group.visible = shown;
        if (shown && !solidsAdded.v && collider) {
          collider.addSolids({ rects: crewSolidRects(F).map((r) => ({ ...r, kind: 'crew' })), circles: [] });
          solidsAdded.v = true;
        }
      }
      api.shown = shown;
      if (!shown) return;
      const tPrev = t;
      if (!paused && !api.freeze) t += dt;
      const p = digPose(t);
      api.pose = p;
      cab.rotation.y = -p.swing;
      boom.rotation.x = p.boom;
      stick.rotation.x = p.stick - p.boom;
      bucket.rotation.x = p.bucket - p.stick;
      // The dirt rides in the bucket from the scoop and drops out at the dump.
      const drop = p.dropping ? Math.max(0, 1 - (p.t - 7.4) / 1.0) : 1;
      load.visible = !!p.loaded && drop > 0.02;
      load.scale.setScalar(Math.max(0.05, drop));
      // The wave: starts when you come near, stops when you are well past.
      const dEar = Math.hypot(ear.x - wkW.x, ear.y - wkW.y);
      was = waving(dEar, was);
      waveK += ((was ? 1 : 0) - waveK) * Math.min(1, dt * 6);
      api.wave = waveK;
      arm.rotation.z = 0.08 + (2.5 + waveAngle(t) - 0.08) * waveK;
      // Sound, near enough to hear.
      const d = Math.hypot(ear.x - exW.x, ear.y - exW.y);
      if (!sound && d < CREW_HEAR_R) sound = createCrewSound();
      if (sound) {
        const v = crewVoice(ear, { x: exW.x, y: exW.y }, p.loaded ? 1 : 0.3);
        sound.update(v, !paused && clankBetween(tPrev, t), paused);
        if (d > CREW_HEAR_R + 60) { sound.dispose(); sound = null; }
      }
    },
    dispose() {
      if (sound) sound.dispose();
      sound = null;
      for (const d of toDispose) d.dispose();
    },
  };
  globalThis.__crew = api;
  return api;
}
