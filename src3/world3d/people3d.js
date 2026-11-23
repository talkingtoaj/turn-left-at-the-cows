// Locals in 3D (SPEC 9q, #56). Each local is one skinned mesh: rounded body
// parts baked into one geometry, each part tied to one of 12 bones (hips,
// chest, head, upper arms, forearms, thighs, shins). One draw call per local
// (the old box people took three). Close up (under about 30 m) a local
// uses a finer geometry with eyes, brows, lips and glasses; farther off, a
// coarse one with the same bones.
//
// Looks and poses come from peopleLook.js (pure, checked by check-people).
// Part colors live in vertex colors. Shirts with a pattern (flannel plaid, a
// tourist's loud print) carry the second color in `aPat`, painted in the
// fragment shader from the rest position, so the pattern moves with the cloth.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state } from '../../src/state.js';
import { currentMissionId } from '../../src/game/tourists.js';
import { personLook, newAct, actStep, personPose, BONES } from './peopleLook.js';
import { localHears } from '../../src/world/hornHeard.js';
import { localToWorld } from '../../src/drive/geom.js';
import { DECK_TOP } from './ground.js';
import { WATER_LEVEL } from './terrain.js';

const B = Object.fromEntries(BONES.map((b, i) => [b, i]));
const PARENT = { pelvis: 'root', spine: 'pelvis', head: 'spine', uaL: 'spine', faL: 'uaL', uaR: 'spine', faR: 'uaR', thL: 'pelvis', shL: 'thL', thR: 'pelvis', shR: 'thR' };
const LOD_IN = 28; // m: switch to the fine body inside this
const LOD_OUT = 34; // and back to the coarse one outside this
const POSE_R = 90; // m: past this the pose is left as it was

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function mixHex(a, b, t) {
  _c.set(a);
  _c2.set(b);
  return _c.lerp(_c2, t).getHex();
}

// Collects parts: each is a geometry placed in the body's rest pose (model
// space, metres, facing -z), with a color (or a function of the vertex
// position) and a bone (or a function of the position).
class Parts {
  constructor(look) {
    this.look = look;
    this.list = [];
  }
  add(geo, color, bone, t = [0, 0, 0], sc = null, r = null) {
    const g = geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _m.compose(_v.set(t[0], t[1], t[2]), _q.setFromEuler(_e.set(...(r || [0, 0, 0]))), _s.set(...(sc || [1, 1, 1])));
    g.applyMatrix4(_m);
    const pos = g.attributes.position;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const pat = new Float32Array(n * 4);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const L = this.look;
    _c2.set(L.shirt2 || 0);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const hex = typeof color === 'function' ? color(x, y, z) : color;
      _c.set(hex);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      if (L.pat && hex === L.shirt) {
        pat[i * 4] = _c2.r;
        pat[i * 4 + 1] = _c2.g;
        pat[i * 4 + 2] = _c2.b;
        pat[i * 4 + 3] = L.pat;
      }
      si[i * 4] = typeof bone === 'function' ? bone(x, y, z) : bone;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPat', new THREE.BufferAttribute(pat, 4));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.list.push(g);
  }
  build() {
    const g = mergeGeometries(this.list);
    for (const p of this.list) p.dispose();
    return g;
  }
}

const sphere = (ws, hs, t0 = 0, tl = Math.PI, p0 = 0, plen = Math.PI * 2) => new THREE.SphereGeometry(1, ws, hs, p0, plen, t0, tl);
const capsule = (r, len, q) => new THREE.CapsuleGeometry(r, len, q ? 3 : 2, q ? 9 : 5);
const cylinder = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg);
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Joint positions (rest pose) for a look.
export function joints(L) {
  const s = L.height / 1.75;
  const w = L.build;
  const sx = L.woman ? 0.155 * w + 0.045 : 0.17 * w + 0.05;
  const hx = 0.085 * w;
  const y = { hip: 0.91 * s, knee: 0.5 * s, ankle: 0.09 * s, sh: 1.4 * s, elb: 1.12 * s, wr: 0.86 * s, neck: 1.48 * s, waist: 1.05 * s };
  return {
    s, w, sx, hx, y,
    at: {
      root: [0, 0, 0], pelvis: [0, 0.95 * s, 0], spine: [0, y.waist, 0], head: [0, y.neck, 0],
      uaL: [-sx, y.sh, 0], faL: [-sx, y.elb, 0], uaR: [sx, y.sh, 0], faR: [sx, y.elb, 0],
      thL: [-hx, y.hip, 0], shL: [-hx, y.knee, 0], thR: [hx, y.hip, 0], shR: [hx, y.knee, 0],
    },
  };
}

// Is the skull point with normalized offset (nx, ny, nz) hair? (-z is the face.)
function hairAt(style, nx, ny, nz) {
  const face = nz < -0.5 && ny < 0.62;
  switch (style) {
    case 'bald':
      return (ny > -0.3 && ny < 0.3 && nz > -0.25 && Math.abs(nx) > 0.55) || (nz > 0.5 && ny > -0.35 && ny < 0.35);
    case 'crop':
      return (ny > 0.35 && !face) || (nz > 0.35 && ny > -0.3);
    case 'short':
      return (ny > 0.15 && !face) || (nz > 0.2 && ny > -0.45);
    default: // long, bob, bun
      return (ny > 0.05 && !face) || (nz > 0.1 && ny > -0.45) || (Math.abs(nx) > 0.75 && ny > -0.05 && nz > -0.3);
  }
}

// The body geometry for a look; q 1 fine, 0 coarse.
export function buildPersonGeometry(L, q) {
  const P = new Parts(L);
  const J = joints(L);
  const { s, w, sx, hx, y } = J;
  const skin = L.skin;
  const fem = L.woman;
  const S = q ? 1 : 0;
  const seg = (a, b) => (q ? a : b);

  // ---- torso ----
  const hipR = (fem ? 0.18 : 0.165) * w;
  const waistR = (fem ? 0.135 : 0.155) * w * (w > 1.1 ? 1.12 : 1);
  const chestR = (fem ? 0.165 : 0.18) * w;
  const shR = sx - 0.025;
  const prof = [
    [0.04, 0.84 * s], [0.13 * w, 0.865 * s], [hipR, 0.94 * s], [waistR, y.waist], [chestR, 1.22 * s],
    [chestR * 1.02, 1.32 * s], [shR, 1.39 * s], [0.14, 1.44 * s], [0.065, y.neck], [0.001, y.neck + 0.01],
  ].map(([r, yy]) => new THREE.Vector2(r, yy));
  const depth = 0.6;
  const front = (x, z) => z < 0;
  const belt = (yy) => yy > 0.985 * s && yy < 1.02 * s;
  const torsoColor = (x, yy, z) => {
    const ax = Math.abs(x);
    switch (L.torso) {
      case 'overalls':
        if (yy < 1.03 * s) return L.over;
        if (front(x, z) && ax < 0.1 * w && yy < 1.3 * s) return L.over; // bib
        if (ax > 0.055 * w && ax < 0.085 * w && yy > 1.0 * s) return L.over; // straps
        return L.shirt;
      case 'coveralls':
        return belt(yy) && front(x, z) ? mixHex(L.over, 0x000000, 0.25) : L.over;
      case 'apron':
        if (front(x, z) && ax < 0.11 * w && yy < 1.26 * s) return L.over; // bib
        if (yy > 1.03 * s && yy < 1.055 * s) return L.over; // ties
        if (ax > 0.045 && ax < 0.065 && yy > 1.26 * s) return L.over; // neck straps
        return yy < 1.0 * s ? L.lower : L.shirt;
      case 'vest':
      case 'fishvest':
        if (yy < 0.985 * s) return L.lower;
        if (belt(yy)) return 0x2a1e16;
        if (front(x, z) && ax < 0.03) return L.shirt;
        if (L.torso === 'vest' && yy > 1.14 * s && yy < 1.18 * s) return 0xd6dadc; // reflective band
        if (L.torso === 'fishvest' && front(x, z) && yy > 1.08 * s && yy < 1.16 * s && ax > 0.05 && ax < 0.13) return mixHex(L.over, 0x000000, 0.25); // pockets
        if (yy > 1.36 * s) return L.shirt;
        return L.over;
      case 'cardigan':
      case 'jacket':
        if (yy < 0.985 * s) return L.torso === 'jacket' && yy > 0.94 * s ? L.over : L.lower;
        if (front(x, z) && ax < (L.torso === 'jacket' ? 0.035 : 0.05)) return L.shirt;
        return L.over;
      case 'suit':
        if (yy < 0.985 * s) return L.lower;
        if (front(x, z) && ax < 0.045 && yy > 1.12 * s) return ax < 0.014 ? L.shirt2 : L.shirt; // shirt and tie
        return L.over;
      default:
        if (yy < 0.985 * s) return L.legs === 'skirt' ? L.lower : L.lower;
        if (belt(yy)) return 0x2a1e16;
        return L.shirt;
    }
  };
  const torso = new THREE.LatheGeometry(prof, seg(14, 7));
  P.add(torso, torsoColor, (x, yy) => (yy < 1.02 * s ? B.pelvis : B.spine), [0, 0, 0], [1, 1, depth]);

  // A skirt (or a dress) from the hips to the knee.
  if (L.legs === 'skirt') {
    const sk = new THREE.LatheGeometry([[hipR * 1.2, 0.545 * s], [hipR * 1.32, 0.56 * s], [hipR * 1.02, 1.0 * s]].map(([r, yy]) => new THREE.Vector2(r, yy)), seg(14, 7));
    const apron = L.torso === 'apron';
    P.add(sk, (x, yy, z) => (apron && z < 0 && Math.abs(x) < 0.13 * w && yy > 0.66 * s ? L.over : L.lower), B.pelvis, [0, 0, 0], [1, 1, 0.75]);
  }

  // ---- arms ----
  const sleeve = ['cardigan', 'jacket', 'coveralls', 'suit'].includes(L.torso) ? L.over : L.shirt;
  const uaR = (fem ? 0.042 : 0.048) * w;
  const faR = (fem ? 0.036 : 0.041) * w;
  for (const side of [-1, 1]) {
    const ua = side < 0 ? B.uaL : B.uaR;
    const fa = side < 0 ? B.faL : B.faR;
    const ax = side * sx;
    const upper = L.sleeves === 'short' ? (x, yy) => (yy > y.sh - 0.13 * s ? sleeve : skin) : sleeve;
    let lower = skin;
    if (L.sleeves === 'long' || L.sleeves === 'suit') lower = (x, yy) => (yy > y.wr + 0.03 ? sleeve : skin);
    else if (L.sleeves === 'rolled') lower = (x, yy) => (yy > y.elb - 0.07 * s ? sleeve : skin);
    // Shoulder cap (moves with the arm, pivots in place).
    P.add(sphere(seg(10, 6), seg(8, 4)), sleeve, ua, [ax - side * 0.018, y.sh - 0.012, 0], [uaR * 1.2, 0.058, 0.064 * w]);
    P.add(capsule(uaR, y.sh - y.elb - 0.02, q), upper, ua, [ax, (y.sh + y.elb) / 2, 0]);
    P.add(capsule(faR, y.elb - y.wr - 0.02, q), lower, fa, [ax, (y.elb + y.wr) / 2, 0]);
    // Hand: a mitten with a thumb, palm toward the body.
    P.add(sphere(seg(8, 5), seg(6, 4)), skin, fa, [ax, y.wr - 0.055, -0.005], [0.024, 0.058, 0.043]);
    if (q) P.add(capsule(0.012, 0.03, q), skin, fa, [ax - side * 0.012, y.wr - 0.04, -0.035], null, [0.5, 0, side * 0.3]);
  }

  // ---- legs ----
  const thR = (fem ? 0.075 : 0.072) * w;
  for (const side of [-1, 1]) {
    const th = side < 0 ? B.thL : B.thR;
    const sh = side < 0 ? B.shL : B.shR;
    const lx = side * hx;
    let thigh = L.lower;
    let shin = L.lower;
    if (L.legs === 'shorts') {
      thigh = (x, yy) => (yy > y.knee + 0.1 * s ? L.lower : skin);
      shin = skin;
    } else if (L.legs === 'skirt') {
      thigh = mixHex(skin, 0x2a201c, 0.45); // dark stockings
      shin = thigh;
    }
    P.add(capsule(thR, y.hip - y.knee - 0.03, q), thigh, th, [lx, (y.hip + y.knee) / 2, 0]);
    P.add(capsule(0.052 * w, y.knee - y.ankle - 0.04, q), (x, yy) => (yy < y.ankle + 0.1 ? L.boots : typeof shin === 'function' ? shin(x, yy) : shin), sh, [lx, (y.knee + y.ankle) / 2 + 0.01, 0]);
    // Boot: a rounded toe on a sole.
    P.add(sphere(seg(10, 6), seg(6, 4)), L.boots, sh, [lx, 0.06, -0.04], [0.058, 0.058, 0.125]);
    P.add(boxG(0.115, 0.03, 0.27), mixHex(L.boots, 0x000000, 0.4), sh, [lx, 0.015, -0.04]);
  }

  // ---- neck and head ----
  const yN = y.neck;
  P.add(cylinder(0.048, 0.055, 0.12, seg(10, 5)), skin, B.head, [0, yN + 0.03, 0.005]);
  // Collar (not on overalls straps or a coverall's own collar).
  if (L.torso !== 'coveralls') P.add(cylinder(0.062, 0.078, 0.045, seg(12, 6)), L.torso === 'suit' ? L.shirt : L.torso === 'cardigan' || L.torso === 'jacket' ? L.over : L.shirt, B.spine, [0, yN - 0.01, 0.006]);
  else P.add(cylinder(0.062, 0.078, 0.045, seg(12, 6)), L.over, B.spine, [0, yN - 0.01, 0.006]);
  const hc = [0, yN + 0.145, 0.005];
  const hsz = [0.093, 0.117, 0.104];
  const showHair = L.hat === 'none';
  P.add(sphere(seg(16, 7), seg(12, 5)), (x, yy, z) => {
    const nx = (x - hc[0]) / hsz[0];
    const ny = (yy - hc[1]) / hsz[1];
    const nz = (z - hc[2]) / hsz[2];
    return hairAt(L.hairStyle, nx, ny, nz) ? L.hair : skin;
  }, B.head, hc, hsz);
  // Jaw and chin, bearded or not.
  const beardAt = (x, yy, z) => {
    if (L.beard !== 'full') return skin;
    const ny = (yy - (yN + 0.08)) / 0.055;
    const nz = (z + 0.03) / 0.07;
    return ny > 0.45 && nz < -0.3 ? skin : L.hair;
  };
  P.add(sphere(seg(12, 6), seg(8, 4)), beardAt, B.head, [0, yN + 0.08, -0.028], [0.072, 0.056, 0.072]);
  // Nose, ears.
  P.add(sphere(seg(8, 4), seg(6, 3)), mixHex(skin, 0xa04030, 0.06), B.head, [0, yN + 0.125, -0.103], [0.019, 0.032, 0.026]);
  for (const side of [-1, 1]) P.add(sphere(seg(8, 4), seg(6, 3)), mixHex(skin, 0x803020, 0.08), B.head, [side * 0.093, yN + 0.13, 0.01], [0.014, 0.03, 0.021]);
  if (L.beard !== 'none') P.add(sphere(seg(8, 5), seg(6, 3)), L.hair, B.head, [0, yN + 0.098, -0.094], [0.035, 0.011, 0.014]);
  if (q) {
    // Eyes, brows, mouth.
    for (const side of [-1, 1]) {
      P.add(sphere(6, 4), 0x1d1712, B.head, [side * 0.034, yN + 0.152, -0.091], [0.011, 0.009, 0.008]);
      P.add(boxG(0.034, 0.009, 0.012), L.hair, B.head, [side * 0.035, yN + 0.174, -0.094], null, [0, 0, side * -0.12]);
    }
    if (L.beard === 'none') P.add(sphere(8, 4), mixHex(skin, 0x6a2a22, 0.3), B.head, [0, yN + 0.083, -0.096], [0.024, 0.006, 0.01]);
  }
  // Hair volume.
  if (showHair && L.hairStyle !== 'bald') {
    const long = L.hairStyle === 'long' || L.hairStyle === 'bob' || L.hairStyle === 'bun';
    P.add(sphere(seg(16, 7), seg(8, 4), 0, L.hairStyle === 'crop' ? 0.95 : 1.2), L.hair, B.head, [0, hc[1] + 0.008, hc[2] + 0.008], long ? [0.106, 0.13, 0.117] : [0.1, 0.123, 0.111]);
    // Longer hair: fuller at the sides and back, open at the face.
    if (long) P.add(sphere(seg(16, 7), seg(10, 5), 0.9, 0.75, Math.PI * 1.5 + 0.8, Math.PI * 2 - 1.6), L.hair, B.head, [0, hc[1], hc[2] + 0.006], [0.107, 0.13, 0.118]);
    if (L.hairStyle === 'long') P.add(sphere(seg(10, 5), seg(8, 4)), L.hair, B.head, [0, yN + 0.07, 0.065], [0.098, 0.15, 0.06]);
    if (L.hairStyle === 'bob') P.add(sphere(seg(14, 6), seg(8, 4), 0.9, 1.25, Math.PI * 1.5 + 0.85, Math.PI * 2 - 1.7), L.hair, B.head, [0, hc[1] - 0.005, hc[2] + 0.005], [0.108, 0.125, 0.115]);
    if (L.hairStyle === 'bun') P.add(sphere(seg(8, 5), seg(6, 4)), L.hair, B.head, [0, yN + 0.22, 0.095], [0.045, 0.045, 0.045]);
  } else if (!showHair && (L.hairStyle === 'long' || L.hairStyle === 'bun' || L.hairStyle === 'bob')) {
    // Under a hat: hair out the back.
    P.add(sphere(seg(10, 5), seg(8, 4)), L.hair, B.head, [0, yN + 0.11, 0.075], [0.072, 0.1, 0.05]);
  }
  // Glasses.
  if (L.glasses !== 'none') {
    const frame = L.glasses === 'dark' ? 0x8a7a50 : 0x2a2420;
    for (const side of [-1, 1]) {
      if (q) P.add(new THREE.TorusGeometry(0.021, 0.0035, 4, 10), frame, B.head, [side * 0.035, yN + 0.152, -0.101]);
      if (L.glasses === 'dark' || !q) P.add(cylinder(0.021, 0.021, 0.003, seg(10, 5)), L.glasses === 'dark' ? 0x12161a : frame, B.head, [side * 0.035, yN + 0.152, -0.1], null, [Math.PI / 2, 0, 0]);
      if (q) P.add(boxG(0.004, 0.004, 0.105), frame, B.head, [side * 0.088, yN + 0.155, -0.05]);
    }
    if (q) P.add(boxG(0.026, 0.004, 0.004), frame, B.head, [0, yN + 0.156, -0.101]);
  }
  // Hats.
  const hy = yN;
  switch (L.hat) {
    case 'seed': {
      const c2 = L.hatColor2;
      P.add(sphere(seg(14, 7), seg(6, 3), 0, Math.PI / 2), (x, yy, z) => (z < -0.06 && yy > hy + 0.2 ? c2 : L.hatColor), B.head, [0, hy + 0.175, 0.005], [0.106, 0.1, 0.116]);
      P.add(new THREE.CylinderGeometry(0.1, 0.1, 0.012, seg(12, 6), 1, false, Math.PI / 2, Math.PI), L.hatColor, B.head, [0, hy + 0.185, -0.06], [1, 1, 1.25], [-0.12, 0, 0]);
      if (q) P.add(sphere(6, 4), L.hatColor, B.head, [0, hy + 0.276, 0.005], [0.012, 0.008, 0.012]);
      P.add(cylinder(0.105, 0.107, 0.03, seg(14, 7)), L.hatColor, B.head, [0, hy + 0.18, 0.005], [1, 1, 1.09]);
      break;
    }
    case 'hard':
      P.add(sphere(seg(14, 7), seg(6, 3), 0, Math.PI / 2), L.hatColor, B.head, [0, hy + 0.17, 0], [0.12, 0.115, 0.13]);
      P.add(cylinder(0.13, 0.135, 0.014, seg(14, 7)), L.hatColor, B.head, [0, hy + 0.172, -0.012], [1, 1, 1.12]);
      P.add(boxG(0.028, 0.03, 0.2), L.hatColor, B.head, [0, hy + 0.27, 0.0]);
      break;
    case 'sun':
      P.add(cylinder(0.2, 0.225, 0.012, seg(18, 8)), L.hatColor, B.head, [0, hy + 0.2, 0.005]);
      P.add(cylinder(0.092, 0.104, 0.1, seg(14, 7)), L.hatColor, B.head, [0, hy + 0.255, 0.005]);
      P.add(cylinder(0.106, 0.106, 0.028, seg(14, 7)), L.hatColor2, B.head, [0, hy + 0.222, 0.005]);
      break;
    case 'bucket':
      P.add(cylinder(0.088, 0.105, 0.1, seg(14, 7)), L.hatColor, B.head, [0, hy + 0.24, 0.005]);
      P.add(cylinder(0.105, 0.16, 0.05, seg(14, 7)), mixHex(L.hatColor, 0x000000, 0.08), B.head, [0, hy + 0.18, 0.005]);
      break;
    case 'campaign':
      P.add(cylinder(0.21, 0.215, 0.01, seg(18, 8)), L.hatColor, B.head, [0, hy + 0.2, 0.005]);
      P.add(cylinder(0.035, 0.105, 0.13, 4), L.hatColor, B.head, [0, hy + 0.27, 0.005], null, [0, Math.PI / 4, 0]);
      P.add(cylinder(0.104, 0.104, 0.02, seg(12, 6)), L.hatColor2, B.head, [0, hy + 0.215, 0.005]);
      break;
  }

  // ---- things they carry ----
  if (L.carry === 'binoculars') {
    for (const side of [-1, 1]) P.add(cylinder(0.022, 0.022, 0.09, seg(8, 5)), 0x1c1c1c, B.spine, [side * 0.03, 1.24 * s, -0.135], null, [Math.PI / 2, 0, 0]);
    P.add(boxG(0.008, 0.2, 0.008), 0x2a2420, B.spine, [0, 1.35 * s, -0.11], null, [0.4, 0, 0]);
  }
  if (L.carry === 'briefcase') {
    P.add(boxG(0.09, 0.3, 0.4), 0x4a2f1c, B.faR, [sx + 0.02, y.wr - 0.24, 0]);
    P.add(boxG(0.02, 0.04, 0.12), 0x2a1a10, B.faR, [sx + 0.02, y.wr - 0.07, 0]);
  }
  if (L.carry === 'rod') {
    // From the right hand, forward and up when the arm is held out.
    const a = 0.62;
    const d = [0, -Math.cos(a), -Math.sin(a)];
    const h = [sx, y.wr - 0.05, -0.01];
    const c = (k) => [h[0] + d[0] * k, h[1] + d[1] * k, h[2] + d[2] * k];
    P.add(cylinder(0.005, 0.013, 2.6, seg(6, 4)), 0x3a2a1a, B.faR, c(1.1), null, [Math.PI + a, 0, 0]);
    P.add(cylinder(0.028, 0.028, 0.03, seg(8, 5)), 0x6a6e72, B.faR, c(0.12), null, [0, 0, Math.PI / 2]);
  }
  return P.build();
}

// One material for every local: smooth shading, vertex colors, and the
// shirt pattern from aPat (rgb second color, w: 1 plaid, 2 loud print).
function personMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPat;\nvarying vec4 vPat;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = aPat;\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vPat;\nvarying vec3 vRest;\nfloat pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vPat.w > 0.5) {
        float u = vRest.x + vRest.z * 0.7;
        float v = vRest.y;
        if (vPat.w < 1.5) {
          // Flannel: two crossing bands and a thin light line.
          float a = smoothstep(0.24, 0.3, abs(fract(u * 9.0) - 0.5));
          float b = smoothstep(0.24, 0.3, abs(fract(v * 9.0) - 0.5));
          float line = step(0.47, abs(fract(u * 9.0 + 0.25) - 0.5)) + step(0.47, abs(fract(v * 9.0 + 0.25) - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vPat.rgb, 0.5 * (a + b));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.82, 0.72), 0.35 * min(line, 1.0));
        } else {
          // A loud print: big flowers and leaves scattered over the shirt.
          vec2 g = vec2(u, v) * 7.0;
          vec2 c = floor(g);
          float m = 0.0;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
            vec2 k = c + vec2(float(i), float(j));
            vec2 o = vec2(pHash(k), pHash(k + 7.3));
            float d = length(g - k - o);
            float r = 0.25 + 0.15 * pHash(k + 3.1);
            m = max(m, 1.0 - smoothstep(r - 0.05, r, d));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vPat.rgb, m);
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'person-pattern';
  return mat;
}

let personMat = null;
const bucketMat = new THREE.MeshLambertMaterial({ vertexColors: true });

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  _c.set(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A skinned mesh for one local, its bones in their rest pose.
function makePerson(L) {
  const near = buildPersonGeometry(L, 1);
  const far = buildPersonGeometry(L, 0);
  const mesh = new THREE.SkinnedMesh(far, personMat);
  const J = joints(L);
  const bones = BONES.map(() => new THREE.Bone());
  BONES.forEach((name, i) => {
    const at = J.at[name];
    const par = PARENT[name];
    const pa = par ? J.at[par] : [0, 0, 0];
    bones[i].position.set(at[0] - pa[0], at[1] - pa[1], at[2] - pa[2]);
    bones[i].name = name;
    if (par) bones[B[par]].add(bones[i]);
  });
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  // The arms swing a little past the rest pose: a sphere round the body.
  near.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
  far.boundingSphere = near.boundingSphere;
  mesh.boundingSphere = near.boundingSphere.clone();
  return { mesh, bones, near, far, J };
}

// Where a perched local (l.sit, from build.js perchOn) sits: her hips on the
// deck top, facing the bridge's middle; the bucket beside her on the deck; the
// rod tip in the sitting pose; and a bobber on the water out in front.
function seatOf(l, world, look, made) {
  const b = world.bridges.find((q) => q.id === l.sit.bridgeId);
  const yaw = -(l.sit.heading * Math.PI) / 180;
  const J = made.J;
  const thighR = (look.woman ? 0.075 : 0.072) * look.build;
  const y = DECK_TOP - J.y.hip + thighR * 0.8;
  const toMid = Math.sign(l.sit.along) || 1; // the bridge's middle is toward -along
  const bk = localToWorld(b.x, b.y, b.angle, l.sit.across - 0.7, l.sit.along + toMid * 0.45);
  // Pose the bones as she sits, then read the rod tip off the right forearm.
  const pose = personPose(look, newAct(), 0, { moving: false, walk: 0, headYaw: null });
  const { mesh, bones } = made;
  mesh.position.set(l.x, y, l.y);
  mesh.rotation.y = yaw;
  for (let i = 1; i < BONES.length; i++) bones[i].rotation.set(...pose.rot[BONES[i]]);
  bones[B.pelvis].position.y = J.at.pelvis[1] - pose.drop;
  mesh.updateMatrixWorld(true);
  const tip = rodTip(J).applyMatrix4(mesh.skeleton.boneInverses[B.faR]).applyMatrix4(bones[B.faR].matrixWorld);
  // The bobber floats a couple of metres past the tip, straight out in front.
  const fx = -Math.sin(yaw); // the model faces -z
  const fy = -Math.cos(yaw);
  const reach = Math.hypot(tip.x - l.x, tip.z - l.y) + 1.6;
  const bob = new THREE.Vector3(l.x + fx * reach, WATER_LEVEL, l.y + fy * reach);
  return { y, yaw, bucket: { x: bk.x, y: bk.y, h: DECK_TOP }, tip, bob };
}

// The rod tip in the rest pose (model space), as buildPersonGeometry puts it.
function rodTip(J) {
  const a = 0.62;
  const k = 1.1 + 1.3;
  return new THREE.Vector3(J.sx, J.y.wr - 0.05 - Math.cos(a) * k, -0.01 - Math.sin(a) * k);
}

// A thin line from the rod tip to a red and white bobber with a ring of
// ripple round it, in the space of a mesh at (ox, oh, oy).
function fishingLine(tip, bob, ox, oh, oy) {
  const t = new THREE.Vector3(tip.x - ox, tip.y - oh, tip.z - oy);
  const top = new THREE.Vector3(bob.x - ox, bob.y - oh + 0.06, bob.z - oy);
  const len = t.distanceTo(top);
  const line = new THREE.CylinderGeometry(0.004, 0.004, len, 3, 1, true);
  line.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(t).normalize()));
  line.translate((t.x + top.x) / 2, (t.y + top.y) / 2, (t.z + top.z) / 2);
  const w = new THREE.Vector3(bob.x - ox, bob.y - oh, bob.z - oy);
  return [
    colored(line, 0xd8d8d0),
    colored(sphere(8, 4, 0, Math.PI / 2).scale(0.045, 0.05, 0.045).translate(w.x, w.y + 0.01, w.z), 0xd23a2a),
    colored(sphere(8, 3, Math.PI / 2, Math.PI / 2).scale(0.045, 0.03, 0.045).translate(w.x, w.y + 0.01, w.z), 0xf2f0ea),
    colored(new THREE.TorusGeometry(0.2, 0.008, 3, 18).rotateX(Math.PI / 2).translate(w.x, w.y + 0.005, w.z), 0x9fb8c8),
    colored(new THREE.TorusGeometry(0.36, 0.006, 3, 22).rotateX(Math.PI / 2).translate(w.x, w.y + 0.004, w.z), 0x8eaabb),
  ];
}

// Each local is one skinned mesh that turns to face the car, walks with
// its ambient wander, waves when the car pulls up and talks with its hands.
export function buildLocals(world, terrain, audit = null) {
  if (!personMat) personMat = personMaterial();
  const group = new THREE.Group();
  const people = [];
  world.locals.forEach((l) => {
    const look = personLook(l);
    const made = makePerson(look);
    const p = made.mesh;
    const sit = l.sit ? seatOf(l, world, look, made) : null;
    if (sit) {
      p.position.set(l.x, sit.y, l.y);
      p.rotation.y = sit.yaw;
    } else p.position.set(l.x, terrain.heightAt(l.x, l.y), l.y);
    if (look.carry === 'rod') {
      // The bucket stands beside her (on the ground, or on the deck she sits
      // on) and does not turn with her.
      const at = sit ? sit.bucket : { x: l.x + 0.7, y: l.y + 0.5, h: null };
      const bh = at.h ?? terrain.heightAt(at.x, at.y) - 0.04;
      const parts = [
        colored(cylinder(0.2, 0.16, 0.36, 12).translate(0, 0.18, 0), 0x8a8f96),
        colored(new THREE.TorusGeometry(0.2, 0.012, 4, 14).rotateX(Math.PI / 2).translate(0, 0.36, 0), 0x6a6e74),
        colored(new THREE.TorusGeometry(0.17, 0.006, 3, 10, Math.PI).translate(0, 0.36, 0), 0x55595e),
      ];
      // Sitting, her line runs from the rod tip to a bobber on the water. Same
      // mesh as the bucket: no extra draw call.
      if (sit) parts.push(...fishingLine(sit.tip, sit.bob, at.x, bh, at.y));
      const bucket = new THREE.Mesh(mergeGeometries(parts), bucketMat);
      bucket.position.set(at.x, bh, at.y);
      bucket.castShadow = true;
      group.add(bucket);
    }
    // A sitter is over the water on a deck, not standing on the ground.
    if (audit && !sit) audit.circle(l.id, 'local', l.x, l.y, 0.12, terrain.heightAt(l.x, l.y), terrain.heightAt(l.x, l.y));
    group.add(p);
    people.push({ id: l.id, only: l.onlyMission || null, obj: p, ...made, look, act: newAct(), x: l.x, y: l.y, yaw: sit ? sit.yaw : 0, sit: !!sit, head: 0, walk: 0, lod: false });
  });
  let clock = 0;
  let hornN = 0; // the last horn (amb.horn.n) the locals heard (#74)
  const poseIn = { moving: false, walk: 0, headYaw: null };
  const actIn = { carDist: Infinity, carSpeed: 0, onFoot: false, moving: false, talking: false };
  return {
    object: group,
    people,
    // Follow the ambient wander (amb.personPos), walk, and turn towards the
    // viewer (the car, or you on foot) when close: the head first, then the body.
    update(car, dt, amb) {
      clock += dt;
      const missionId = currentMissionId(state);
      const pc = state.car || car;
      const horn = amb && amb.horn && amb.horn.n !== hornN ? amb.horn : null;
      if (amb && amb.horn) hornN = amb.horn.n;
      for (const p of people) {
        const pos = amb && amb.personPos ? amb.personPos(p.id) : null;
        if (pos) {
          p.x = pos.x;
          p.y = pos.y;
        }
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        const d2 = dx * dx + dy * dy;
        // Past 350 m a person is a pixel or two in the haze.
        p.obj.visible = d2 < 350 * 350 && (!p.only || p.only === missionId);
        if (d2 > 250 * 250) continue;
        if (!p.sit) p.obj.position.set(p.x, terrain.heightAt(p.x, p.y), p.y);
        const near = p.lod ? d2 < LOD_OUT * LOD_OUT : d2 < LOD_IN * LOD_IN;
        if (near !== p.lod) {
          p.lod = near;
          p.obj.geometry = near ? p.near : p.far;
        }
        const moving = !!(pos && pos.moving);
        if (horn && p.obj.visible) {
          const wait = localHears(p.act, Math.hypot(horn.x - p.x, horn.y - p.y), p.look.seed, { moving, seated: p.sit });
          if (wait != null) p.act.waveIn = wait;
        }
        const watch = !moving && d2 < 60 * 60;
        const toViewer = Math.atan2(-dx, -dy); // model faces -z
        let target;
        if (p.sit) target = p.yaw; // sitting: only the head turns to look
        else if (moving) target = -(pos.heading * Math.PI) / 180;
        else if (watch) target = toViewer;
        else target = pos ? -(pos.heading * Math.PI) / 180 : p.yaw;
        let d = target - p.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        // The body turns slowly when standing; the head leads (below).
        p.yaw += d * Math.min(1, dt * (moving ? 6 : 1.6));
        p.obj.rotation.y = p.yaw;
        if (d2 > POSE_R * POSE_R) continue;
        let hw = 0;
        if (watch) {
          hw = toViewer - p.yaw;
          hw = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(hw), Math.cos(hw))));
        }
        p.head += (hw - p.head) * Math.min(1, dt * 7);
        p.walk = moving ? p.walk + dt * 7 : 0;
        actIn.carDist = Math.hypot(pc.x - p.x, pc.y - p.y);
        actIn.carSpeed = pc.speed || 0;
        actIn.onFoot = !!state.onFoot;
        actIn.moving = moving;
        actIn.talking = state.talkingTo === p.id;
        actStep(p.act, actIn, dt);
        poseIn.moving = moving;
        poseIn.walk = p.walk;
        poseIn.headYaw = watch || Math.abs(p.head) > 0.02 ? p.head : null;
        const pose = personPose(p.look, p.act, clock, poseIn);
        for (let i = 1; i < BONES.length; i++) {
          const r = pose.rot[BONES[i]];
          p.bones[i].rotation.set(r[0], r[1], r[2]);
        }
        p.bones[B.pelvis].position.y = p.J.at.pelvis[1] - pose.drop;
        p.bones[B.spine].scale.set(pose.breathe, 1, pose.breathe);
      }
    },
  };
}
