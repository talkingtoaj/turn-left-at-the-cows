// Ground paint: field soil, pasture grass (with mowing stripes), hay, yards
// and pads are painted onto the terrain instead of lying on it as strips, so
// nothing can float or sink on a slope.
//
// Shapes are rasterised (1 m per texel, anti-aliased edges) into one texture
// per terrain chunk that has any paint. A second small texture holds the
// direction of hay windrow stripes, which are too thin for 1 m texels and are
// drawn in the shader instead. No DOM needed (plain typed arrays).

import * as THREE from 'three';
import { bbox, pointInPolygon, distToPolygonEdge, distToSegment } from '../../src/drive/geom.js';
import { CHUNK } from './terrain.js';

export const PAINT_RES = 1; // metres per texel
const N = Math.round(CHUNK / PAINT_RES); // texels per chunk side

const _c = new THREE.Color();
// Hex colour to sRGB bytes.
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export class GroundPaint {
  constructor(world) {
    this.world = world;
    this.chunks = new Map(); // "ci:cj" -> { color: Uint8Array(N*N*4), stripe: Uint8Array(N*N*2) }
  }

  chunk(ci, cj) {
    const k = `${ci}:${cj}`;
    let c = this.chunks.get(k);
    if (!c) {
      c = { ci, cj, color: new Uint8Array(N * N * 4), stripe: new Uint8Array(N * N * 2) };
      this.chunks.set(k, c);
    }
    return c;
  }

  // Visit every texel centre in a world box, with its chunk and index.
  each(minX, minY, maxX, maxY, fn) {
    const i0 = Math.max(0, Math.floor(minX / PAINT_RES));
    const j0 = Math.max(0, Math.floor(minY / PAINT_RES));
    const i1 = Math.min(Math.ceil(this.world.size.w / PAINT_RES), Math.ceil(maxX / PAINT_RES));
    const j1 = Math.min(Math.ceil(this.world.size.h / PAINT_RES), Math.ceil(maxY / PAINT_RES));
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const x = (i + 0.5) * PAINT_RES;
        const y = (j + 0.5) * PAINT_RES;
        fn(x, y, i, j);
      }
    }
  }

  // Blend one texel: colour (sRGB bytes) with coverage a (0..1).
  // stripe: null, or { angle (radians, 0..PI) } for hay windrows.
  // Colours are stored straight (not premultiplied); texels just outside a
  // shape take its colour at zero coverage so filtering does not darken edges.
  blend(i, j, col, a, stripe) {
    const c = a > 0 ? this.chunk(Math.floor(i / N), Math.floor(j / N)) : this.chunks.get(`${Math.floor(i / N)}:${Math.floor(j / N)}`);
    if (!c) return;
    const k = (j % N) * N + (i % N);
    const p = c.color;
    const o = k * 4;
    const old = p[o + 3] / 255;
    if (a <= 0) {
      if (old === 0) for (let q = 0; q < 3; q++) p[o + q] = col[q];
      return;
    }
    const na = a + old * (1 - a);
    for (let q = 0; q < 3; q++) p[o + q] = Math.round((col[q] * a + p[o + q] * old * (1 - a)) / na);
    p[o + 3] = Math.round(255 * na);
    const s = c.stripe;
    if (stripe) {
      s[k * 2] = Math.round((stripe.angle / Math.PI) * 255) & 255;
      s[k * 2 + 1] = Math.round(255 * a + s[k * 2 + 1] * (1 - a));
    } else {
      s[k * 2 + 1] = Math.round(s[k * 2 + 1] * (1 - a));
    }
  }

  // Polygon (world [x, y] points). color: hex, or fn(x, y) -> hex.
  polygon(poly, color, stripe = null) {
    const bb = bbox(poly);
    const cache = new Map();
    const colOf = (x, y) => {
      const hex = typeof color === 'function' ? color(x, y) : color;
      let v = cache.get(hex);
      if (!v) cache.set(hex, (v = rgb(hex)));
      return v;
    };
    this.each(bb.minX - 1, bb.minY - 1, bb.maxX + 1, bb.maxY + 1, (x, y, i, j) => {
      const d = distToPolygonEdge(x, y, poly);
      const inside = pointInPolygon(x, y, poly);
      const sd = inside ? -d : d; // signed distance, negative inside
      const a = Math.max(0, Math.min(1, 0.5 - sd / PAINT_RES));
      this.blend(i, j, colOf(x, y), a, stripe);
    });
  }

  // Band along a polyline of the given width.
  stroke(pts, width, color) {
    const bb = bbox(pts);
    const col = rgb(color);
    const half = width / 2;
    this.each(bb.minX - half - 1, bb.minY - half - 1, bb.maxX + half + 1, bb.maxY + half + 1, (x, y, i, j) => {
      let d = Infinity;
      for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, distToSegment(x, y, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
      this.blend(i, j, col, Math.max(0, Math.min(1, 0.5 - (d - half) / PAINT_RES)), null);
    });
  }

  disc(x0, y0, r, color) {
    const col = rgb(color);
    this.each(x0 - r - 1, y0 - r - 1, x0 + r + 1, y0 + r + 1, (x, y, i, j) => {
      const d = Math.hypot(x - x0, y - y0) - r;
      this.blend(i, j, col, Math.max(0, Math.min(1, 0.5 - d / PAINT_RES)), null);
    });
  }

  // Paint, in shader terms, for one chunk: textures or null.
  textures(ci, cj) {
    const c = this.chunks.get(`${ci}:${cj}`);
    if (!c) return null;
    if (!c.tex) {
      const color = new THREE.DataTexture(c.color, N, N, THREE.RGBAFormat);
      color.colorSpace = THREE.SRGBColorSpace;
      const stripe = new THREE.DataTexture(c.stripe, N, N, THREE.RGFormat);
      for (const t of [color, stripe]) {
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
      }
      // Stripe angles must not be blended across mip levels into nonsense.
      stripe.minFilter = THREE.LinearFilter;
      stripe.generateMipmaps = false;
      c.tex = { color, stripe, origin: new THREE.Vector2(ci * CHUNK, cj * CHUNK) };
    }
    return c.tex;
  }
}

// Hay windrow stripes: gap between rows and the stripe colour relative to the
// hay base (linear), used by the terrain shader.
export const HAY_GAP = 1.6;
export const HAY_STRIPE_W = 0.55;
export function stripeTint(base, stripe) {
  const a = _c.set(base).clone();
  const b = _c.set(stripe);
  return new THREE.Vector3(b.r / a.r, b.g / a.g, b.b / a.b);
}

// Patch a terrain material so painted chunks show their paint. Returns
// fn(ci, cj) -> material for that chunk (the shared one when unpainted).
export function paintedMaterials(baseMat, paint, tint) {
  const cache = new Map();
  return (ci, cj) => {
    const tex = paint.textures(ci, cj);
    if (!tex) return baseMat;
    const k = `${ci}:${cj}`;
    if (cache.has(k)) return cache.get(k);
    const m = baseMat.clone();
    m.defines = { ...(m.defines || {}), USE_GROUND_PAINT: '' };
    m.customProgramCacheKey = () => 'ground-paint';
    m.onBeforeCompile = (sh) => {
      sh.uniforms.paintMap = { value: tex.color };
      sh.uniforms.stripeMap = { value: tex.stripe };
      sh.uniforms.paintOrigin = { value: tex.origin };
      sh.uniforms.paintSize = { value: CHUNK };
      sh.uniforms.stripeTint = { value: tint };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPaintXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintXZ = position.xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vPaintXZ;
uniform sampler2D paintMap;
uniform sampler2D stripeMap;
uniform vec2 paintOrigin;
uniform float paintSize;
uniform vec3 stripeTint;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 puv = (vPaintXZ - paintOrigin) / paintSize;
  vec4 paint = texture2D(paintMap, puv);
  if (paint.a > 0.002) {
    // Keep a little of the grass texture's grain under the paint.
    float grain = mix(1.0, texture2D(map, vMapUv).g * 1.1, 0.35);
    vec3 col = paint.rgb * grain;
    vec2 st = texture2D(stripeMap, puv).rg;
    if (st.y > 0.01) {
      float ang = st.x * PI;
      float v = dot(vPaintXZ, vec2(cos(ang), sin(ang))) / ${HAY_GAP.toFixed(2)};
      float dist = abs(fract(v) - 0.5) * ${HAY_GAP.toFixed(2)};
      float aa = max(fwidth(v) * ${HAY_GAP.toFixed(2)}, 0.02);
      float line = 1.0 - smoothstep(${(HAY_STRIPE_W / 2).toFixed(3)} - aa, ${(HAY_STRIPE_W / 2).toFixed(3)} + aa, dist);
      // Fade the stripes out where they would only shimmer.
      line *= 1.0 - smoothstep(0.25, 0.6, fwidth(v));
      col = mix(col, col * stripeTint, line * st.y);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, col, paint.a);
  }
}`);
    };
    cache.set(k, m);
    return m;
  };
}
