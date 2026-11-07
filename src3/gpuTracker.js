// GPU resource tracker for region switching (src3/main.js).
//
// three.js listens for 'dispose' on every geometry, material, texture,
// render target and instanced mesh the first time it puts one on the GPU.
// While a region is current, those registrations are noted here, so when
// the player leaves the region everything it uploaded can be disposed,
// including textures that only live in patched shader uniforms (ground paint,
// contact shading) where a scene walk would never find them.
// Things that outlive regions (the player's car, the look's textures) are
// passed in `keep` and left alone. A module-cached piece that is disposed
// and used again later is simply uploaded again.

import * as THREE from 'three';

let current = null;
const orig = THREE.EventDispatcher.prototype.addEventListener;
THREE.EventDispatcher.prototype.addEventListener = function addEventListener(type, listener) {
  if (type === 'dispose' && current) current.add(this);
  return orig.call(this, type, listener);
};

// Start noting GPU uploads into a new set (returned).
export function trackRegion() {
  current = new Set();
  return current;
}

// Everything reachable from `roots` (Object3Ds): geometries, materials and
// the textures on them. Plus `extra` (textures, render targets).
export function collectKeep(roots, extra = []) {
  const keep = new Set(extra.filter(Boolean));
  const addMat = (m) => {
    if (!m) return;
    keep.add(m);
    for (const v of Object.values(m)) if (v && v.isTexture) keep.add(v);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) keep.add(u.value);
  };
  for (const root of roots) {
    root.traverse((o) => {
      if (o.geometry) keep.add(o.geometry);
      if (Array.isArray(o.material)) o.material.forEach(addMat);
      else addMat(o.material);
    });
  }
  return keep;
}

// Dispose everything in `set` that is not in `keep`. Returns how many.
export function disposeTracked(set, keep) {
  let n = 0;
  if (set === current) current = null;
  for (const o of set) {
    if (keep.has(o) || typeof o.dispose !== 'function') continue;
    try {
      o.dispose();
      n++;
    } catch (e) {
      // already gone
    }
  }
  set.clear();
  return n;
}
