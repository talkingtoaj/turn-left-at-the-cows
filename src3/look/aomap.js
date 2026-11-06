// Look test: soft dark patches on the ground where things stand on it (under
// trees and bushes, around building walls). One small single channel texture
// over the whole world, 2 m per texel, multiplied into the ground colour.

import * as THREE from 'three';

export const AO_RES = 2; // metres per texel

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildAOMap(world, scenery) {
  const W = Math.ceil(world.size.w / AO_RES);
  const H = Math.ceil(world.size.h / AO_RES);
  const ao = new Float32Array(W * H).fill(1);

  // Darken everything within `reach` metres of (x, y); fn(x, y) -> 0..1 darkening.
  const area = (x, y, reach, fn) => {
    const i0 = Math.max(0, Math.floor((x - reach) / AO_RES));
    const i1 = Math.min(W - 1, Math.ceil((x + reach) / AO_RES));
    const j0 = Math.max(0, Math.floor((y - reach) / AO_RES));
    const j1 = Math.min(H - 1, Math.ceil((y + reach) / AO_RES));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = fn((i + 0.5) * AO_RES, (j + 0.5) * AO_RES);
        if (d > 0) ao[j * W + i] *= 1 - d;
      }
    }
  };

  const disc = (x0, y0, r, dark) => area(x0, y0, r, (x, y) => dark * (1 - smooth(0.2 * r, r, Math.hypot(x - x0, y - y0))));
  for (const t of scenery.trees) disc(t.x, t.y, t.r * 1.3 + 1.5, t.kind === 'pine' ? 0.5 : 0.42);
  for (const b of scenery.bushes) disc(b.x, b.y, b.r * 1.4 + 0.5, 0.25);

  // Buildings: a band around the walls.
  const BAND = 3;
  for (const b of world.buildings) {
    const a = ((b.angle || 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    area(b.x, b.y, Math.hypot(b.w, b.h) / 2 + BAND, (x, y) => {
      const dx = x - b.x;
      const dy = y - b.y;
      const lx = Math.abs(dx * c + dy * s) - b.w / 2;
      const ly = Math.abs(-dx * s + dy * c) - b.h / 2;
      const e = Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
      return 0.45 * (1 - smooth(0, BAND, e));
    });
  }

  const bytes = new Uint8Array(W * H);
  for (let k = 0; k < bytes.length; k++) bytes[k] = Math.round(ao[k] * 255);
  const tex = new THREE.DataTexture(bytes, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return { tex, size: new THREE.Vector2(W * AO_RES, H * AO_RES) };
}
