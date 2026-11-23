// Water tower (#60): four braced legs on concrete piers, a riser pipe, a
// welded tank with a rounded bottom and cone roof, a catwalk with railings,
// a caged ladder up a leg face and a second one up the tank to the roof, and
// the nearest town's name painted on two sides of the tank.
// Leg feet match layout.js (WATER_TOWER), so what you see matches what you hit.
// Everything goes into the shared batch; the name goes on the shared word
// atlas (signtext.js), so the tower adds no draw calls.

import * as THREE from 'three';
import { distToPolyline } from '../../src/drive/geom.js';
import { WATER_TOWER } from '../../src/drive/layout.js';
import { box, cyl, cone, strut } from './shapes.js';
import { FaceAtlas, PAD } from './signtext.js';

const FOUND = 1.5; // legs and the riser reach this far below ground
const H0 = 21.6; // tank bottom ring (drum meets bowl), above the base
const DRUM = 7; // drum height
const BOWL = 2.4; // depth of the rounded bottom
const SEG = 32; // facets round the tank
const DA = (Math.PI * 2) / SEG;
const TOP = 0.76; // legs lean in to meet the drum's bottom ring
const LADDER_R = 7.85; // ladder up a leg face, just outside the catwalk
const DECK_W = 1.1;
const NAME_CAP = 1.6; // capital letter height on the tank, m
const NAME_UP = 3.7; // middle of the name above the tank's bottom ring
const NAME_PPM = 90;
const NAME_TOWN_MAX = 2500; // further than this from any town: no name

// Paint by tower: Ashford's is the "big silver tank", others pale blue.
const LOOKS = {
  silver: { tank: 0xbfc1bc, roof: 0x9ea3a6, steel: 0x8f918e, dark: 0x4b4f52, ink: '#1f2a3c' },
  blue: { tank: 0x93aebb, roof: 0x6c8693, steel: 0x5d6468, dark: 0x4b4f52, ink: '#7e2a20' },
};
const CONCRETE = 0xa9a69c;

// Where the tower's name and ladder go. Pure: world data in, angles out.
// Angles are three.js lathe angles round the tank: direction (sin a, cos a)
// in world (x, y). The name faces the nearest road (and its back faces away);
// the ladder goes a quarter turn round, clear of both names.
// name: the nearest town's name in capitals (no new words), or null when no
// town is near.
export function towerPlan(world, l) {
  let best = null;
  for (const r of world.roads || []) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i];
      const [bx, by] = r.points[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((l.x - ax) * dx + (l.y - ay) * dy) / L2));
      const px = ax + dx * t;
      const py = ay + dy * t;
      const d = Math.hypot(px - l.x, py - l.y);
      if (!best || d < best.d) best = { d, px, py };
    }
  }
  const nameAngle = best && best.d > 0 ? Math.atan2(best.px - l.x, best.py - l.y) : 0;
  let town = null;
  for (const t of world.towns || []) {
    const d = Math.hypot(t.x - l.x, t.y - l.y);
    if (d <= NAME_TOWN_MAX && (!town || d < town.d)) town = { d, name: t.name };
  }
  return { name: town ? town.name.toUpperCase() : null, nameAngle, ladderAngle: nameAngle + Math.PI / 2 };
}

// How many tank facets the name covers (odd, centred on the road side).
export function nameSlices(name) {
  const em = NAME_CAP / 0.72;
  const w = name.length * em * 0.68;
  const chord = 2 * WATER_TOWER.tankR * Math.sin(DA / 2);
  let n = Math.ceil(w / chord);
  if (n % 2 === 0) n++;
  return { n, w, chord, em };
}

export function buildWaterTower(world, terrain, batch, l) {
  const plan = towerPlan(world, l);
  const look = /ashford/i.test(plan.name || '') ? LOOKS.silver : LOOKS.blue;
  const R = WATER_TOWER.tankR;
  const base = terrain.heightAt(l.x, l.y);
  const A = batch.audit;
  const M = new THREE.Matrix4().makeTranslation(l.x, base, l.y);
  const add = (geo, color, opts) => batch.add(geo, M, color, opts);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Snap the lathe so a facet's centre faces the road: the name sits flat on it.
  const phi0 = plan.nameAngle - DA / 2;
  const lathe = (pts, color, opts) => add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), SEG, phi0), color, opts);

  // ---- Legs on concrete piers, with splice collars.
  const legs = WATER_TOWER.legs.map(([x, y]) => [V(x, -FOUND, y), V(x * TOP, H0, y * TOP)]);
  const at = (leg, f) => new THREE.Vector3().lerpVectors(leg[0], leg[1], f);
  for (const [x, y] of WATER_TOWER.legs) {
    const g = terrain.heightAt(l.x + x, l.y + y) - base;
    add(cyl(1.0, 1.4, 8, 0.8).translate(x, g - 0.9, y), CONCRETE);
    add(box(1.0, 0.08, 1.0).translate(x, g + 0.5, y), look.dark);
    if (A) {
      A.circle(l.id, 'tower_leg', l.x + x, l.y + y, WATER_TOWER.legR * 0.7, base - FOUND);
      A.circle(l.id, 'tower_pier', l.x + x, l.y + y, 1.0, base + g - 0.9);
    }
  }
  const LEVELS = [0.27, 0.52, 0.76];
  for (const leg of legs) {
    add(strut(leg[0], leg[1], 0.42, 8), look.steel);
    for (const f of LEVELS) add(strut(at(leg, f - 0.008), at(leg, f + 0.008), 0.55, 8), look.steel);
    // Cap plate where the leg meets the tank's ring girder.
    add(strut(at(leg, 0.985), at(leg, 1.0), 0.6, 8), look.dark);
  }
  // ---- Bracing: horizontal struts at three levels, X tension rods in four
  // panels per face, a turnbuckle where each pair crosses.
  const panels = [[0.11, 0.27], [0.27, 0.52], [0.52, 0.76], [0.76, 0.95]];
  for (let i = 0; i < 4; i++) {
    const a = legs[i];
    const b = legs[(i + 1) % 4];
    for (const f of LEVELS) add(strut(at(a, f), at(b, f), 0.14, 6), look.steel);
    for (const [f0, f1] of panels) {
      add(strut(at(a, f0), at(b, f1), 0.045, 4), look.dark, { cast: false });
      add(strut(at(b, f0), at(a, f1), 0.045, 4), look.dark, { cast: false });
      const mid = new THREE.Vector3().addVectors(at(a, f0), at(b, f1)).add(at(b, f0)).add(at(a, f1)).multiplyScalar(0.25);
      add(strut(mid.clone().setY(mid.y - 0.18), mid.clone().setY(mid.y + 0.18), 0.07, 6), look.dark, { cast: false });
    }
  }

  // ---- Riser pipe from a valve pad up to the bowl, with flanges.
  add(cyl(1.5, 0.5, 12).translate(0, -0.3, 0), CONCRETE);
  add(box(1.2, 0.9, 0.9).translate(1.1, 0.2, 0), look.dark); // valve box
  const riserTop = H0 - BOWL + 0.1;
  add(cyl(WATER_TOWER.riserR, riserTop + FOUND, 12).translate(0, -FOUND, 0), look.steel);
  for (const y of [0.9, riserTop * 0.33, riserTop * 0.66, riserTop - 0.5]) add(cyl(WATER_TOWER.riserR + 0.12, 0.16, 12).translate(0, y, 0), look.dark);
  if (A) A.circle(l.id, 'tower_riser', l.x, l.y, 1.5, base - 0.3);

  // ---- Tank: rounded bottom and drum (one turned piece), weld seams, a
  // ring girder where the legs meet it, a knuckle band and the cone roof.
  const bowl = [];
  for (let i = 0; i <= 7; i++) {
    const t = (i / 7) * (Math.PI / 2);
    bowl.push([R * Math.sin(t), H0 - BOWL * Math.cos(t)]);
  }
  bowl[0][0] = 0.001;
  lathe([...bowl, [R, H0 + DRUM]], look.tank);
  for (const y of [DRUM / 3, (DRUM * 2) / 3]) lathe([[R, H0 + y - 0.04], [R + 0.035, H0 + y - 0.03], [R + 0.035, H0 + y + 0.03], [R, H0 + y + 0.04]], look.roof, { cast: false });
  lathe([[R - 0.1, H0 - 0.55], [R + 0.18, H0 - 0.55], [R + 0.18, H0 + 0.02], [R - 0.1, H0 + 0.02]], look.dark);
  lathe([[R, H0 + DRUM - 0.3], [R + 0.06, H0 + DRUM - 0.3], [R + 0.06, H0 + DRUM], [R, H0 + DRUM]], look.roof);
  lathe([[0.001, H0 + DRUM - 0.01], [R + 0.25, H0 + DRUM - 0.01], [R + 0.25, H0 + DRUM + 0.18], [0.75, H0 + DRUM + 2.3], [0.001, H0 + DRUM + 2.3]], look.roof);
  // Finial vent on top.
  add(cyl(0.45, 0.45, 12).translate(0, H0 + DRUM + 2.25, 0), look.dark);
  add(cone(0.7, 0.45, 12).translate(0, H0 + DRUM + 2.7, 0), look.roof);
  add(cyl(0.05, 1.4, 6).translate(0, H0 + DRUM + 3.1, 0), look.dark, { cast: false });

  // ---- Catwalk round the bottom ring: deck, brackets, posts, two rails and a
  // toe board. A gap in the rails where the ladder comes up.
  const deckY = H0 + 0.02;
  const RO = R + DECK_W;
  lathe([[R - 0.05, deckY], [RO, deckY], [RO, deckY + 0.1], [R - 0.05, deckY + 0.1]], look.dark);
  lathe([[RO - 0.03, deckY + 0.1], [RO, deckY + 0.1], [RO, deckY + 0.26], [RO - 0.03, deckY + 0.26]], look.steel, { cast: false });
  const gap = 0.16; // half the ladder gap, radians
  const gapFrom = plan.ladderAngle + gap;
  const arc = Math.PI * 2 - gap * 2;
  for (const y of [0.55, 1.1]) {
    // After the turn a torus point at angle u sits at lathe angle 90deg - u; rotateY adds to it.
    const rail = new THREE.TorusGeometry(RO - 0.05, 0.045, 4, 64, arc).rotateX(Math.PI / 2).rotateY(gapFrom + arc - Math.PI / 2);
    add(rail.translate(0, deckY + 0.1 + y, 0), look.steel, { cast: false });
  }
  const NP = 28;
  for (let k = 0; k < NP; k++) {
    const a = gapFrom + (arc * k) / (NP - 1);
    const s = Math.sin(a);
    const c = Math.cos(a);
    add(box(0.07, 1.15, 0.07).translate(s * (RO - 0.05), deckY + 0.1, c * (RO - 0.05)), look.steel, { cast: false });
    if (k % 2 === 0) add(strut(V(s * (R + 0.15), deckY - 0.9, c * (R + 0.15)), V(s * (RO - 0.1), deckY - 0.02, c * (RO - 0.1)), 0.05, 4), look.dark, { cast: false });
  }

  // ---- Ladders: a caged one up the middle of a leg face, standing off from
  // the bracing, and an open one up the tank wall to the roof.
  const ls = Math.sin(plan.ladderAngle);
  const lc = Math.cos(plan.ladderAngle);
  const side = V(lc, 0, -ls);
  const LP = (r, y, sd = 0) => V(ls * r + lc * sd, y, lc * r - ls * sd);
  const ladder = (r, y0, y1, rungFrom, cage) => {
    for (const sd of [-0.23, 0.23]) add(strut(LP(r, y0, sd), LP(r, y1, sd), 0.035, 4), look.steel, { cast: false });
    for (let y = rungFrom; y < y1 - 0.2; y += 0.3) add(strut(LP(r, y, -0.23), LP(r, y, 0.23), 0.022, 4), look.steel, { cast: false });
    if (!cage) return;
    for (let y = cage[0]; y <= cage[1]; y += 1.1) {
      const hoop = new THREE.TorusGeometry(0.4, 0.028, 3, 10, Math.PI).rotateX(Math.PI / 2).rotateY(plan.ladderAngle);
      const c0 = LP(r + 0.05, y);
      add(hoop.translate(c0.x, c0.y, c0.z), look.steel, { cast: false });
    }
    for (const [o, sd] of [[0.43, 0], [0.33, -0.28], [0.33, 0.28]]) add(strut(LP(r + o, cage[0], sd), LP(r + o, cage[1], sd), 0.022, 3), look.steel, { cast: false });
  };
  const lx = l.x + ls * LADDER_R;
  const ly = l.y + lc * LADDER_R;
  const gl = terrain.heightAt(lx, ly) - base;
  ladder(LADDER_R, gl - 0.25, deckY + 1.2, Math.max(gl + 0.35, 0.35), [Math.max(gl, 0) + 2.6, deckY - 0.4]);
  if (A) A.circle(l.id, 'tower_ladder', lx, ly, 0.3, base + gl - 0.25);
  // Stand-offs from the ladder to the face's horizontal struts.
  const faceMid = (f) => {
    // The leg face this ladder is on: the two legs whose feet are nearest its direction.
    const feet = legs.map((leg, i) => [i, leg[0].x * ls + leg[0].z * lc]).sort((p, q) => q[1] - p[1]);
    return new THREE.Vector3().addVectors(at(legs[feet[0][0]], f), at(legs[feet[1][0]], f)).multiplyScalar(0.5);
  };
  for (const f of LEVELS) {
    const m = faceMid(f);
    for (const sd of [-0.23, 0.23]) add(strut(m.clone().addScaledVector(side, sd * 2), LP(LADDER_R, m.y, sd), 0.04, 4), look.dark, { cast: false });
  }
  // Up the tank wall, from the catwalk to the roof edge, with a grab hoop over the top.
  ladder(R + 0.3, deckY + 0.1, H0 + DRUM + 1.0, deckY + 0.4, null);
  for (const y of [deckY + 1.6, H0 + DRUM / 2, H0 + DRUM - 0.6]) for (const sd of [-0.23, 0.23]) add(strut(LP(R - 0.05, y, sd), LP(R + 0.3, y, sd), 0.03, 4), look.dark, { cast: false });
  const grab = new THREE.TorusGeometry(0.23, 0.035, 3, 8, Math.PI).rotateY(plan.ladderAngle);
  const g0 = LP(R + 0.15, H0 + DRUM + 1.0);
  add(grab.translate(g0.x, g0.y, g0.z), look.steel, { cast: false });
  // Roof hatch beside the ladder top.
  const hatch = box(0.9, 0.35, 0.9).rotateX(0.38).rotateY(plan.ladderAngle);
  const h0 = LP(R - 1.1, H0 + DRUM + 0.45);
  add(hatch.translate(h0.x, h0.y, h0.z), look.dark);

  // ---- The name, on the road side and the back.
  if (plan.name && typeof document !== 'undefined') paintName(batch, l, base, plan, look, R);
}

// One quad per tank facet, a hair outside it; each shows its slice of the
// word. The cells are see-through round the letters (the atlas cuts out
// alpha), so the tank's own paint and texture show between them.
function paintName(batch, l, base, plan, look, R) {
  if (!batch.faces) batch.faces = new FaceAtlas();
  const { n, w, chord, em } = nameSlices(plan.name);
  const hgt = NAME_CAP * 1.5;
  const r = R * Math.cos(DA / 2) + 0.03;
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  for (const back of [0, Math.PI]) {
    for (let j = -(n - 1) / 2; j <= (n - 1) / 2; j++) {
      const a = plan.nameAngle + back + j * DA;
      const draw = (ctx, x, y, pw, ph) => {
        ctx.save();
        ctx.clearRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
        ctx.beginPath();
        ctx.rect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
        ctx.clip();
        const px = Math.round(em * NAME_PPM);
        ctx.font = `900 ${px}px "Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
        ctx.fillStyle = look.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(plan.name).width;
        const want = w * NAME_PPM;
        ctx.translate(x + pw / 2 - j * pw, y + ph / 2 + px * 0.04);
        if (tw > want) ctx.scale(want / tw, 1);
        ctx.fillText(plan.name, 0, 0);
        ctx.restore();
      };
      m.makeTranslation(l.x + Math.sin(a) * r, base + H0 + NAME_UP, l.y + Math.cos(a) * r);
      m.multiply(rot.makeRotationY(a + Math.PI));
      batch.faces.add(`tower:${plan.name}:${look.ink}:${j}`, chord, hgt, NAME_PPM, draw, m);
    }
  }
}
