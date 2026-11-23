// Hand-placed props ("dressing"): a clothesline, a tyre swing, round-top pumps,
// a corn stand and the like (SPEC 9o, World). They come from the world's
// `dressing` list, supplied by add-on files (src/world/addons/props_*.js):
//   { id, kind, x, y, heading, r?, ...options }
// `heading` is the way the prop's front faces (deg, 0 = north, 90 = east, like
// signs). `r` is an optional solid radius for the car (collider) and keeps
// trees and rocks off it (layout.js, scatter.js). The list is named
// `dressing` because `world.props` is already the countryside fill (bales,
// haystacks, rocks).
//
// Still pieces go into the shared batch (merged per chunk, no draw call of
// their own). Painted words go on the shared word atlas (signtext.js). Moving
// pieces (sheets, tyre swing, OPEN sign) are one small mesh each and only
// move when the car is near.
//
// Local frame of a prop: x right, y back (away from the front), up.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl, cone, strut } from './shapes.js';
import { objMatrix } from './batch.js';
import { FaceAtlas } from './signtext.js';
import { roundPump } from './gas3d.js';

const DEG = Math.PI / 180;
const NEAR = 150; // metres: things only move inside this
const FONT = 'bold {px}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
const PAD = 10;

// ---------------------------------------------------------------- helpers

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// Bake [geometry, colour, x, y, z, rotX?, rotZ?] parts into one vertex-coloured geometry.
function bake(parts) {
  const geos = parts.map(([geo, color, x, y, z, rx = 0, rz = 0]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    _m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z);
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos);
}

// One shared material for every moving piece.
let dynMat = null;
const dynamicMat = () => dynMat || (dynMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));

// Ground under a footprint: base (highest point) and how far legs must reach down.
function footing(terrain, foot) {
  const { min, max } = terrain.groundRange(foot);
  return { base: max, min, drop: max - min + 0.3 };
}

function fitText(ctx, text, cx, cy, maxW, px) {
  ctx.font = FONT.replace('{px}', String(px));
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.translate(cx, cy);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// A painted board: background, border, lines of text (px per line is a fraction of line pitch).
function boardFace(lines, st) {
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = st.bg;
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    if (st.speckle) {
      let s = 7;
      for (let i = 0; i < 160; i++) {
        s = (s * 16807) % 2147483647;
        const a = s / 2147483647;
        s = (s * 16807) % 2147483647;
        const b = s / 2147483647;
        ctx.fillStyle = `rgba(255,255,255,${0.04 + a * 0.08})`;
        ctx.fillRect(x + a * pw, y + b * ph, 6 + b * 14, 2 + a * 4);
      }
    }
    ctx.strokeStyle = st.border;
    ctx.lineWidth = st.bw || 5;
    ctx.strokeRect(x + 8, y + 8, pw - 16, ph - 16);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pitch = (ph - 24) / lines.length;
    lines.forEach((t, i) => {
      const big = i === 0 && lines.length > 1 && st.bigFirst;
      ctx.fillStyle = st.ink;
      fitText(ctx, t, x + pw / 2, y + 12 + pitch * (i + 0.5), pw - 40, Math.round(pitch * (big ? 0.9 : 0.68)));
    });
  };
}

function addFace(batch, key, w, h, ppm, draw, x, y, base, heading, lx, ly, up) {
  if (!batch.faces) batch.faces = new FaceAtlas();
  batch.faces.add(key, w, h, ppm, draw, objMatrix(x, y, base, heading, lx, ly, up));
}

// ---------------------------------------------------------------- kinds
// Each builder: (ctx) => optional dynamic piece { object, update(time, amb, car) }.
// ctx: { p, world, terrain, batch, P(geo, lx, ly, up, color, opts), face(...) , audit }

const BUILDERS = {
  // Two posts, a line and four sheets that flap (a sheet is a 5 x 4 grid of
  // vertices; the free edge sways most). Line runs along local x.
  clothesline(c) {
    const { p, terrain, P } = c;
    const len = p.length || 7;
    const f = footing(terrain, { rect: { x: p.x, y: p.y, w: len, h: 1, angle: p.heading } });
    c.base = f.base;
    c.audit('clothesline', 'rect', { w: len, h: 0.6 }, f);
    for (const sx of [-1, 1]) {
      P(box(0.1, 2.1 + f.drop, 0.1), sx * len / 2, 0, -f.drop, 0x6a4c2e);
      P(box(0.9, 0.08, 0.08), sx * len / 2, 0, 2.0, 0x6a4c2e, { cast: false });
    }
    P(box(len, 0.025, 0.025), 0, 0, 1.96, 0xd8d4c8, { cast: false });
    const sheets = [
      { w: 1.5, col: 0xf4f1ea }, { w: 1.2, col: 0x7aa7d6 }, { w: 1.7, col: 0xf0d77a }, { w: 1.1, col: 0xe59aa4 },
    ];
    const NU = 4;
    const NV = 3;
    const pos = [];
    const col = [];
    const idx = [];
    const rest = [];
    let x0 = -len / 2 + 0.6;
    const gap = (len - 1.2 - sheets.reduce((a, s) => a + s.w, 0)) / (sheets.length - 1);
    for (const s of sheets) {
      const base0 = pos.length / 3;
      const h = s.col === 0xe59aa4 ? 0.9 : 1.35;
      for (let j = 0; j <= NV; j++) {
        for (let i = 0; i <= NU; i++) {
          const x = x0 + (s.w * i) / NU;
          const y = 1.95 - (h * j) / NV;
          pos.push(x, y, 0);
          rest.push(j / NV, x);
          const sh = 0.93 + 0.07 * (j / NV);
          _c.set(s.col).multiplyScalar(sh);
          col.push(_c.r, _c.g, _c.b);
        }
      }
      for (let j = 0; j < NV; j++) {
        for (let i = 0; i < NU; i++) {
          const a = base0 + j * (NU + 1) + i;
          idx.push(a, a + 1, a + NU + 1, a + 1, a + NU + 2, a + NU + 1);
        }
      }
      x0 += s.w + gap;
    }
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(pos);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, dynamicMat());
    mesh.castShadow = true;
    mesh.position.set(p.x, f.base, p.y);
    mesh.rotation.y = -p.heading * DEG;
    mesh.frustumCulled = false;
    const n = posArr.length / 3;
    return {
      object: mesh,
      update(time, amb, car) {
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        const near = dx * dx + dy * dy < NEAR * NEAR;
        mesh.visible = near || dx * dx + dy * dy < 400 * 400;
        if (!near) return;
        const ws = amb && amb.wind ? amb.wind.speed : 3;
        const amp = Math.min(0.32, 0.06 + 0.035 * ws);
        for (let k = 0; k < n; k++) {
          const v = rest[k * 2];
          const x = rest[k * 2 + 1];
          posArr[k * 3 + 2] = amp * v * (Math.sin(time * 1.7 + x * 1.3 + p.x) + 0.4 * Math.sin(time * 3.1 + x * 2.1)) + 0.04 * v;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  },

  // A big old oak with a tyre on two ropes from a low branch. The tyre swings.
  tyre_swing(c) {
    const { p, terrain, P } = c;
    const f = footing(terrain, { circle: { x: p.x, y: p.y, r: 1.2 } });
    c.base = f.base;
    c.audit('tyre_swing', 'circle', { r: 1.0 }, f);
    P(cyl(0.55, 6 + f.drop, 7, 0.38), 0, 0, -f.drop, 0x5b4630);
    // Low limb to the right, where the swing hangs.
    P(box(3.4, 0.28, 0.28), 1.7, 0, 4.7, 0x5b4630, { extra: new THREE.Matrix4().makeRotationZ(0.08) });
    const leaf = [0x4f7f3c, 0x5d8f45, 0x467535];
    const blobs = [[0, 0, 7.4, 3.2], [2.1, 0.4, 6.7, 2.4], [-2, -0.6, 6.8, 2.5], [0.4, 1.8, 6.6, 2.2], [0.5, -1.7, 7.0, 2.3]];
    blobs.forEach(([lx, ly, up, r], i) => P(new THREE.IcosahedronGeometry(r, 1), lx, ly, up, leaf[i % 3]));
    const rope = 3.9;
    const geo = bake([
      [cyl(0.025, rope, 4), 0x8a7a5a, -0.25, -rope, 0],
      [cyl(0.025, rope, 4), 0x8a7a5a, 0.25, -rope, 0],
      [new THREE.TorusGeometry(0.38, 0.14, 6, 12), 0x1e1e1e, 0, -rope - 0.05, 0, Math.PI / 2],
    ]);
    const mesh = new THREE.Mesh(geo, dynamicMat());
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const g = new THREE.Group();
    // The pivot is on the limb, 3 m out along local x.
    const a = p.heading * DEG;
    const ox = 3.0 * Math.cos(a);
    const oz = 3.0 * Math.sin(a);
    g.position.set(p.x + ox, f.base + 4.85, p.y + oz);
    g.rotation.y = -a;
    g.add(mesh);
    return {
      object: g,
      update(time, amb, car) {
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        const d2 = dx * dx + dy * dy;
        g.visible = d2 < 400 * 400;
        if (d2 > NEAR * NEAR) return;
        const ws = amb && amb.wind ? amb.wind.speed : 3;
        const amp = 0.08 + Math.min(0.12, ws * 0.015);
        g.children[0].rotation.x = amp * Math.sin(time * 1.9 + p.x) + 0.02;
        g.children[0].rotation.z = 0.35 * amp * Math.sin(time * 1.3 + 1);
      },
    };
  },

  // Two old round-top pumps on a concrete island (a glass globe on a red body).
  round_pumps(c) {
    const { p, terrain, P } = c;
    const f = footing(terrain, { rect: { x: p.x, y: p.y, w: 4, h: 1.8, angle: p.heading } });
    c.base = f.base;
    c.audit('round_pumps', 'rect', { w: 4, h: 1.8 }, f);
    P(box(4, 0.16 + f.drop, 1.8), 0, 0, -f.drop, 0x9a9890);
    // The round-top pump is shared with the gas stations (gas3d.js), with a glass globe.
    roundPump(P, -1.1, 0, 0.16, { body: 0xb3261e, globe: true, side: -1 });
    roundPump(P, 1.1, 0, 0.16, { body: 0xd8d0b0, panel: 0xf2ecd8, top: 0xb3261e, globe: true, side: 1 });
    return null;
  },

  // Words painted on a wall of a building. options: building, wall ('w'), lines.
  wall_ad(c) {
    const { p, world, terrain, batch } = c;
    const b = world.buildings.find((q) => q.id === p.building);
    if (!b) return null;
    const f = footing(terrain, { rect: { x: b.x, y: b.y, w: b.w, h: b.h, angle: b.angle || 0 } });
    // Gas shop: 12 x 6 at (-4, 4) inside the 22 x 14 plot (see GAS in layout.js).
    const wx = b.x - 4 - 6;
    const wy = b.y + 4;
    const w = p.w || 4.6;
    const h = p.h || 2.1;
    addFace(batch, `ad:${p.lines.join('|')}`, w, h, 140, boardFace(p.lines, {
      bg: '#d9c9a3', border: '#8a2a22', ink: '#a8281f', bigFirst: true, speckle: true, bw: 6,
    }), wx - 0.03, wy, f.base, 270, 0, 0, 1.0 + h / 2);
    return null;
  },

  // A roadside corn stand: roofed counter, crates of corn, a painted board and
  // a locked-looking honesty box with a slot.
  corn_stand(c) {
    const { p, terrain, P, batch } = c;
    const f = footing(terrain, { rect: { x: p.x, y: p.y, w: 5, h: 3, angle: p.heading } });
    c.base = f.base;
    c.audit('corn_stand', 'rect', { w: 5, h: 3 }, f);
    for (const [lx, ly] of [[-1.6, -1.0], [1.6, -1.0], [-1.6, 1.0], [1.6, 1.0]]) P(box(0.12, 2.3 + f.drop, 0.12), lx, ly, -f.drop, 0x6a4c2e);
    P(box(3.8, 0.1, 2.8), 0, 0, 2.3, 0x9aa0a4, { extra: new THREE.Matrix4().makeRotationX(0.12) });
    P(box(3.2, 0.9, 0.9), 0, -0.2, 0, 0x8a6a42); // counter
    P(box(3.3, 0.06, 1.0), 0, -0.2, 0.9, 0xb89a68);
    // Corn: yellow cobs piled in crates, a green husk on top.
    [[-1.0, 0xe3c04a], [0, 0xe8cc5a], [1.0, 0xdcb842]].forEach(([lx, col]) => {
      P(box(0.8, 0.3, 0.6), lx, -0.2, 0.96, 0x7a5a36, { cast: false });
      P(box(0.7, 0.28, 0.5), lx, -0.2, 1.2, col, { cast: false });
      P(box(0.5, 0.16, 0.3), lx + 0.05, -0.2, 1.44, 0x6f9a3c, { cast: false });
    });
    // Board hung under the front beam, facing the road.
    P(box(3.4, 0.1, 0.1), 0, -1.0, 2.05, 0x6a4c2e, { cast: false });
    const bw = 2.7;
    const bh = 0.95;
    P(box(bw + 0.1, bh + 0.1, 0.05), 0, -1.06, 1.05, 0x3a2a1a, { cast: false });
    addFace(batch, `corn:${p.lines.join('|')}`, bw, bh, 160, boardFace(p.lines, {
      bg: '#f1e6b8', border: '#2f6b45', ink: '#2f5a2a', bigFirst: true, bw: 5,
    }), p.x, p.y, f.base, p.heading, 0, -1.1, 1.05 + bh / 2 + 0.05);
    // Honesty box on its own post at the right end: wood, slot in the lid.
    P(box(0.1, 0.9 + f.drop, 0.1), 2.5, -0.9, -f.drop, 0x6a4c2e);
    P(box(0.46, 0.34, 0.34), 2.5, -0.9, 0.9, 0xb3261e);
    P(box(0.28, 0.02, 0.05), 2.5, -0.9, 1.25, 0x1a1a1a, { cast: false });
    P(box(0.5, 0.05, 0.38), 2.5, -0.9, 1.24, 0x7a1b14, { cast: false });
    return null;
  },

  // A letter board on two posts: black felt, white letters.
  church_board(c) {
    const { p, terrain, P, batch } = c;
    const w = p.w || 4.4;
    const h = p.h || 1.9;
    const f = footing(terrain, { rect: { x: p.x, y: p.y, w: w, h: 0.5, angle: p.heading } });
    c.base = f.base;
    c.audit('church_board', 'rect', { w, h: 0.5 }, f);
    for (const sx of [-1, 1]) P(box(0.16, 1.0 + f.drop, 0.16), sx * (w / 2 - 0.2), 0, -f.drop, 0xe8e4da);
    P(box(w + 0.2, h + 0.2, 0.18), 0, 0, 1.0, 0xe8e4da);
    P(box(w + 0.4, 0.12, 0.3), 0, 0, 1.0 + h + 0.2, 0x4a4e55);
    addFace(batch, `board:${p.lines.join('|')}`, w, h, 150, (ctx, x, y, pw, ph) => {
      ctx.fillStyle = '#1b1d1c';
      ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
      ctx.fillStyle = '#f2efe6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pitch = ph / (p.lines.length + 0.4);
      p.lines.forEach((t, i) => {
        // Letters pushed on a track one at a time: spaced out, a touch off level.
        const px = Math.round(pitch * 0.62);
        ctx.font = FONT.replace('{px}', String(px));
        const step = Math.min(px * 0.78, (pw - 40) / t.length);
        const x0 = x + pw / 2 - (step * (t.length - 1)) / 2;
        const cy = y + pitch * (i + 0.7);
        for (let k = 0; k < t.length; k++) ctx.fillText(t[k], x0 + k * step, cy + (((k * 7 + i * 3) % 5) - 2) * 0.8);
      });
    }, p.x, p.y, f.base, p.heading, 0, -0.1, 1.0 + h / 2 + 0.1);
    return null;
  },

  // A rusted car left in the weeds: a faded 1950s sedan, no glass, the front
  // left wheel off (lying in the grass) so it sits down on that corner, rust
  // through the paint, and weeds up round it. Front is local -y.
  junk_car(c) {
    const { p, terrain, P } = c;
    const f = footing(terrain, { rect: { x: p.x, y: p.y, w: 2.0, h: 4.8, angle: p.heading } });
    c.base = f.base;
    c.audit('junk_car', 'rect', { w: 2.0, h: 4.8 }, f);
    const paint = 0x5f7a86; // faded blue
    const rust = 0x8a4a2a;
    const dark = 0x1c2024;
    const chrome = 0x9a9890;
    // Down on the corner with the missing wheel.
    const tilt = new THREE.Matrix4().makeRotationZ(0.06).multiply(new THREE.Matrix4().makeRotationX(-0.035));
    const T = { extra: tilt };
    // Wheels sit under the body, not on its side: the upper body rides
    // above them, and the lower sills leave a gap (the arch) round each one.
    const WY = 1.45; // axle, along the car
    const WR = 0.4; // tire outer radius
    const BOT = 0.34; // sill bottom
    const MID = 0.64; // where the sills meet the upper body
    const TOP = 1.0; // body top (hood and trunk)
    P(box(1.8, TOP - MID, 4.6), 0, 0, MID, paint, T);
    // Sills: front overhang, between the wheels, rear overhang (to the ground on a slope).
    const sill = (y0, y1) => P(box(1.74, MID - BOT + f.drop, y1 - y0), 0, (y0 + y1) / 2, BOT - f.drop, paint, T);
    sill(-2.3, -WY - WR - 0.05);
    sill(-WY + WR + 0.05, WY - WR - 0.05);
    sill(WY + WR + 0.05, 2.3);
    // Dark wheel wells, so the arches read as holes.
    for (const ly of [-WY, WY]) P(box(1.5, MID - 0.25, WR * 2 + 0.1), 0, ly, 0.25, dark, { ...T, cast: false });
    // Cabin: a sloped frustum, dark all round (the glass is long gone), with a roof.
    const cabin = new THREE.CylinderGeometry(0.75, 1, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.16, 1, 1.41).translate(0, 0.25, 0);
    P(cabin, 0, 0.25, TOP, dark, T);
    P(box(1.26, 0.07, 1.5), 0, 0.25, TOP + 0.5, paint, T);
    // Rust through the paint: a patch on the hood and along the sides.
    P(box(1.0, 0.02, 0.9), 0.15, -1.6, TOP, rust, { ...T, cast: false });
    for (const [lx, ly, len] of [[0.905, -0.4, 0.9], [0.905, 1.9, 0.5], [-0.905, 0.3, 1.1], [-0.905, -1.95, 0.4]]) {
      P(box(0.02, 0.22, len), lx, ly, MID + 0.06, rust, { ...T, cast: false });
    }
    // Chrome bumpers, a grille and two headlights at the front.
    P(box(1.86, 0.15, 0.16), 0, -2.36, BOT + 0.06, chrome, { ...T, cast: false });
    P(box(1.86, 0.15, 0.16), 0, 2.36, BOT + 0.06, chrome, { ...T, cast: false });
    P(box(1.1, 0.24, 0.04), 0, -2.31, MID + 0.03, 0x2a2a2a, { ...T, cast: false });
    for (const lx of [-0.66, 0.66]) {
      P(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 8).rotateX(Math.PI / 2), lx, -2.31, MID + 0.15, 0xcfc9b4, { ...T, cast: false });
    }
    // Three wheels (tire and hubcap); the front left one lies in the grass.
    const tire = () => new THREE.TorusGeometry(WR - 0.12, 0.12, 6, 12).rotateY(Math.PI / 2);
    const hub = () => new THREE.CylinderGeometry(0.17, 0.17, 0.16, 10).rotateZ(Math.PI / 2);
    for (const [lx, ly] of [[0.78, -WY], [0.78, WY], [-0.78, WY]]) {
      P(tire(), lx, ly, WR - 0.02, 0x222222, { cast: false });
      P(hub(), lx, ly, WR - 0.02, 0x8d8a82, { cast: false });
    }
    P(new THREE.TorusGeometry(WR - 0.12, 0.12, 6, 12).rotateX(Math.PI / 2), -1.7, -1.9, 0.1, 0x222222, { cast: false });
    P(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 10), -1.7, -1.9, 0.02, 0x8d8a82, { cast: false });
    // Weeds: dry blades standing round it.
    let s = 31;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {
      const ang = r() * 6.28;
      const rad = 1.0 + r() * 1.7;
      const hh = 0.5 + r() * 0.6;
      P(cone(0.1 + r() * 0.08, hh, 4), Math.cos(ang) * rad, Math.sin(ang) * rad * 1.5, -0.05, r() > 0.5 ? 0x9a9a5c : 0x6f8a46, { cast: false });
    }
    return null;
  },

  // A pole sign with OPEN in neon on both faces (towards west and east
  // travellers). Emissive and unlit; flickers a little when near.
  open_sign(c) {
    const { p, terrain, P } = c;
    const f = footing(terrain, { circle: { x: p.x, y: p.y, r: 0.4 } });
    c.base = f.base;
    c.audit('open_sign', 'circle', { r: 0.35 }, f);
    const H = 4.2;
    P(cyl(0.09, H + f.drop, 6), 0, 0, -f.drop, 0x55585e);
    P(box(0.12, 0.12, 0.7), 0, 0, H - 0.1, 0x55585e, { cast: false });
    P(box(2.3, 1.3, 0.3), 0, 0, H, 0x1c1c20);
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#17090c';
    g.fillRect(0, 0, 512, 256);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#4fd0ff';
    g.shadowColor = '#4fd0ff';
    g.shadowBlur = 14;
    g.lineWidth = 7;
    g.strokeRect(20, 20, 472, 216);
    g.fillStyle = '#ff5a64';
    g.shadowColor = '#ff2a3a';
    g.shadowBlur = 26;
    g.font = 'bold 150px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
    g.fillText('OPEN', 256, 110);
    g.shadowBlur = 12;
    g.fillStyle = '#ffd9a0';
    g.font = 'bold 54px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
    g.fillText('DINER', 256, 205);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    // Two quads, back to back: the front faces local -z (the sign's heading).
    const front = new THREE.PlaneGeometry(2.1, 1.05).rotateY(Math.PI).translate(0, 0, -0.16);
    const back = new THREE.PlaneGeometry(2.1, 1.05).translate(0, 0, 0.16);
    const geo = mergeGeometries([front, back]);
    front.dispose();
    back.dispose();
    const sign = new THREE.Mesh(geo, mat);
    const holder = new THREE.Group();
    holder.add(sign);
    holder.position.set(p.x, f.base + H + 0.65, p.y);
    holder.rotation.y = -p.heading * DEG;
    // Soft halo behind, if the world has a glow texture.
    let halo = null;
    if (c.materials && c.materials.glowTex) {
      halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: c.materials.glowTex, color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      }));
      halo.scale.set(5, 3, 1);
      halo.position.set(0, 0, 0);
      holder.add(halo);
    }
    return {
      object: holder,
      update(time, amb, car) {
        const dx = car.x - p.x;
        const dy = car.y - p.y;
        const d2 = dx * dx + dy * dy;
        holder.visible = d2 < 450 * 450;
        if (d2 > NEAR * NEAR) return;
        // Mostly steady, one small stutter every few seconds.
        const t = time % 7;
        const k = t > 6.5 && t < 6.62 ? 0.55 : 0.94 + 0.06 * Math.sin(time * 9);
        mat.color.setScalar(k);
        if (halo) halo.material.opacity = 0.35 * k;
      },
    };
  },

  // Water tower: four legs, a drum with orange and white checks, a cone roof.
  checker_tank(c) {
    const { p, terrain, P } = c;
    const f = footing(terrain, { circle: { x: p.x, y: p.y, r: 3.0 } });
    c.base = f.base;
    c.audit('checker_tank', 'circle', { r: 3.0 }, f);
    const top = 14;
    const R = 2.9;
    const A = 2.5;
    const B = 1.9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const foot = new THREE.Vector3(sx * A, -f.drop, sy * A);
      const head = new THREE.Vector3(sx * B, top, sy * B);
      P(strut(foot, head, 0.17, 5), 0, 0, 0, 0x6f6c66);
    }
    for (const y of [4.5, 9]) {
      for (const [sx, sy, w, d] of [[0, -1, 2 * (A - 0.0), 0.1], [0, 1, 2 * A, 0.1], [-1, 0, 0.1, 2 * A], [1, 0, 0.1, 2 * A]]) {
        const k = 1 - (y / top) * ((A - B) / A);
        P(box(w * k, 0.1, d * k), sx * A * k, sy * A * k, y, 0x6f6c66, { cast: false });
      }
    }
    const COLS = 14;
    const ROWS = 3;
    const rowH = 1.2;
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const seg = new THREE.CylinderGeometry(R, R, rowH, 1, 1, true, (i / COLS) * Math.PI * 2, (1 / COLS) * Math.PI * 2).translate(0, rowH / 2, 0);
        P(seg, 0, 0, top + j * rowH, (i + j) % 2 ? 0xf2efe6 : 0xe8731c);
      }
    }
    P(new THREE.CircleGeometry(R, 14).rotateX(Math.PI / 2), 0, 0, top - 0.01, 0x4a4e55);
    P(cone(R + 0.25, 1.4, 14), 0, 0, top + ROWS * rowH, 0x4a4e55);
    P(cyl(0.05, 1.2, 4), 0, 0, top + ROWS * rowH + 1.4, 0x2a2a2a);
    P(cyl(0.05, 14, 4), A * 0.65, A * 0.65, 0.2, 0x2a2a2a, { cast: false }); // ladder rail
    return null;
  },
};

// Cow mailbox (the Hartley box, restyled): called by buildMailboxes
// (fields3d.js). Returns true when a mailbox is to be painted as a cow.
export function isCowMailbox(world, m) {
  return (world.dressing || []).some((d) => d.kind === 'cow_mailbox' && d.mailbox === m.id);
}

// White box (colour set by the caller), black patches, pink muzzle, ears and horns.
export function cowMailboxParts(P) {
  P(box(0.26, 0.12, 0.2), 0, 0.1, 1.15, 0x1c1c1c, { cast: false });
  P(box(0.26, 0.1, 0.16), 0, -0.12, 1.25, 0x1c1c1c, { cast: false });
  P(box(0.1, 0.22, 0.22), 0.12, 0.0, 1.1, 0x1c1c1c, { cast: false });
  P(box(0.1, 0.02, 0.14), 0.0, 0.14, 1.42, 0x1c1c1c, { cast: false });
  P(box(0.26, 0.18, 0.06), 0, -0.26, 1.1, 0xe9a0a8, { cast: false }); // muzzle round the door
  P(box(0.22, 0.3, 0.03), 0, -0.3, 1.1, 0x2a2a2a, { cast: false });
  for (const sx of [-1, 1]) {
    P(box(0.12, 0.05, 0.1), sx * 0.2, -0.12, 1.36, 0xf4f1ea, { cast: false, extra: new THREE.Matrix4().makeRotationZ(sx * -0.4) }); // ears
    P(box(0.04, 0.12, 0.04), sx * 0.1, -0.2, 1.42, 0xe8dcb0, { cast: false }); // horns
  }
}

// ---------------------------------------------------------------- build

export function buildDressing(world, terrain, batch, materials = {}) {
  // Dev: ?dressing=off leaves the props out (to compare draw calls).
  const off = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dressing') === 'off';
  const list = off ? [] : world.dressing || [];
  const dynamic = [];
  for (const p of list) {
    const build = BUILDERS[p.kind];
    if (!build) continue; // e.g. cow_mailbox, drawn by buildMailboxes
    const base0 = terrain.heightAt(p.x, p.y);
    const c = {
      p, world, terrain, batch, materials, base: base0,
      P: (geo, lx, ly, up, color, opts) => batch.place(geo, p.x, p.y, c.base, p.heading || 0, lx, ly, up, color, opts),
      audit: (kind, shape, size, f) => {
        const A = batch.audit;
        if (!A) return;
        if (shape === 'circle') A.circle(p.id, kind, p.x, p.y, size.r, f.min - 0.3, f.base);
        else A.rect(p.id, kind, p.x, p.y, size.w, size.h, p.heading || 0, f.min - 0.3, f.base);
      },
    };
    const d = build(c);
    if (d) dynamic.push(d);
  }
  return dynamic;
}

// Solid circles for the car and tree-free zones: [{ id, x, y, r }].
export function dressingSolids(world) {
  return (world.dressing || []).filter((p) => p.r).map((p) => ({ id: p.id, x: p.x, y: p.y, r: p.r }));
}
