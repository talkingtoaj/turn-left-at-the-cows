// Words painted on road signs and mailbox boards (SPEC 9o). Every board gets
// a flat quad on its front face. All the quads share ONE canvas atlas (one
// texture, one material, one mesh, so one draw call). Faces with the same
// words share one cell. The quad has no back side, so a board reads from the
// front only and is blank grey from behind.
//
// Browser only: the world checker runs without a DOM and skips the paint.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signMilesText } from '../../src/units.js';

export const SIGN_PX_PER_M = 120; // texels per metre on road signs
export const PLATE_PX_PER_M = 260; // mailbox name plates are small, so denser
const ATLAS_W = 2048;
const PAD = 10; // edge colour padding so mip levels do not bleed into neighbours
const FONT = 'bold {px}px "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';

// World data keeps distances in km (they came first). Players see miles:
// "Calder 2.5 km" becomes "Calder 1½ mi". Done here so data and checks stay in metres.
export function signLineText(line) {
  return String(line).replace(/(\d+(?:\.\d+)?)\s*km\b/gi, (_, n) => `${signMilesText(parseFloat(n) * 1000)} mi`);
}

// Colours by kind: closures orange, town names and one-liners green, the rest cream.
export function signStyle(lines) {
  const first = (lines[0] || '').toUpperCase();
  if (first.includes('BRIDGE OUT') || first.includes('CLOSED')) return { board: 0xe07b20, ink: 0x1c1c1c };
  if (lines.length === 1 || /^[A-Z .]+$/.test(lines[0] || '')) return { board: 0x2f6b45, ink: 0xf0eee6 };
  return { board: 0xf0eee6, ink: 0x2a2a2a };
}

// Board size from the text, deterministic (no canvas needed), so posts and
// audits agree with or without a DOM. Letters are about 0.46 m tall (em) (em).
export const SIGN_EM = 0.46;
const SIGN_PAD_Y = 0.4;
export function signSize(lines) {
  const chars = Math.max(...lines.map((t) => signLineText(t).length));
  const w = Math.min(6.6, Math.max(1.6, 0.7 + chars * SIGN_EM * 0.52));
  const h = SIGN_PAD_Y + lines.length * 0.6;
  return { w, h };
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class FaceAtlas {
  constructor() {
    this.faces = []; // {key, w, h, ppm, draw(ctx, x, y, pw, ph), cell}
    this.keys = new Map();
    this.quads = []; // {face, matrix, w, h}
  }

  // Register a w x h quad whose front looks along local -z in `matrix`'s
  // frame. Same key = same words = one shared cell.
  add(key, w, h, ppm, draw, matrix) {
    let face = this.keys.get(key);
    if (!face) {
      face = { key, w, h, ppm, draw, cell: null };
      this.keys.set(key, face);
      this.faces.push(face);
    }
    this.quads.push({ face, matrix: matrix.clone(), w, h });
  }

  build() {
    if (!this.quads.length || typeof document === 'undefined') return null;
    // Shelf packing, tallest first.
    const order = this.faces.slice().sort((a, b) => b.h * b.ppm - a.h * a.ppm);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const f of order) {
      const pw = Math.ceil(f.w * f.ppm);
      const ph = Math.ceil(f.h * f.ppm);
      if (x + pw + PAD * 2 > ATLAS_W) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      f.cell = { x: x + PAD, y: y + PAD, pw, ph };
      x += pw + PAD * 2;
      shelf = Math.max(shelf, ph + PAD * 2);
    }
    const used = y + shelf;
    let H = 256;
    while (H < used) H *= 2;
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, ATLAS_W, H);
    for (const f of this.faces) f.draw(ctx, f.cell.x, f.cell.y, f.cell.pw, f.cell.ph);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    const geos = [];
    for (const q of this.quads) {
      const c = q.face.cell;
      const u0 = c.x / ATLAS_W;
      const u1 = (c.x + c.pw) / ATLAS_W;
      const v1 = 1 - c.y / H; // canvas y runs down, texture v runs up
      const v0 = 1 - (c.y + c.ph) / H;
      const g = new THREE.PlaneGeometry(q.w, q.h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      g.rotateY(Math.PI); // front faces local -z, single sided
      g.applyMatrix4(q.matrix);
      geos.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.geometry.computeBoundingSphere();
    for (const g of geos) g.dispose();
    this.quads.length = 0;
    this.faces.length = 0;
    this.keys.clear();
    return { object: mesh, update() {} };
  }
}

// One line of text, as big as asked, squeezed sideways if wider than maxW.
function fitText(ctx, text, cx, cy, maxW, px) {
  ctx.font = FONT.replace('{px}', String(px));
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.translate(cx, cy);
  if (w > maxW) ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawSignFace(lines, style) {
  const text = lines.map(signLineText);
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = hex(style.board);
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    ctx.strokeStyle = hex(style.ink);
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 7, y + 7, pw - 14, ph - 14);
    ctx.fillStyle = hex(style.ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = Math.round(SIGN_EM * SIGN_PX_PER_M);
    const pitch = (ph - SIGN_PAD_Y * SIGN_PX_PER_M) / text.length;
    text.forEach((t, i) => {
      fitText(ctx, t, x + pw / 2, y + (SIGN_PAD_Y / 2) * SIGN_PX_PER_M + pitch * (i + 0.5), pw - 24, px);
    });
  };
}

export function drawPlateFace(name) {
  const text = String(name).toUpperCase();
  return (ctx, x, y, pw, ph) => {
    ctx.fillStyle = '#efe8d6';
    ctx.fillRect(x - PAD, y - PAD, pw + PAD * 2, ph + PAD * 2);
    ctx.strokeStyle = '#4a3622';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 4, y + 4, pw - 8, ph - 8);
    ctx.fillStyle = '#2a1f14';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, text, x + pw / 2, y + ph / 2 + 2, pw - 20, Math.round(ph * 0.62));
  };
}
