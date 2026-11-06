// Look test, only when the URL has ?look=new (SPEC 9e). Without it nothing
// here runs and the game renders exactly as before.
//
// 1. Light: a real sky (Poly Haven HDRI, baked by tools/look/bake_sky.py) is
//    the background and, as spherical harmonics, the sky light (a LightProbe
//    in place of the hemisphere light). ACES tone mapping, warmer sun.
// 2. Ground contact: dark patches under trees and around buildings on the
//    ground (aomap.js), and walls darken towards the ground they stand on.
// 3. Textures: CC0 textures (ambientCG) as detail on the existing shapes and
//    colours, picked per piece by colour (surfaces.js). No mesh UVs needed:
//    faces are mapped flat along themselves, the ground from above.
//
// Dev URL knobs: &exp=<exposure> &sun=<sun scale> &sky=<sky scale> &tm=agx
// &sat=<saturation> &tex=0 (light only) &ao=0 (no ground contact shading).

import * as THREE from 'three';
import { TEXTURES, LAYERS, SURF, surfaceOf } from './surfaces.js';
import { buildAOMap } from './aomap.js';
import { patchObjects, patchTerrain, patchTrunks, skyMaterial } from './shaders.js';

export const LOOK_NEW = new URLSearchParams(window.location.search).get('look') === 'new';

const BASE = `${import.meta.env.BASE_URL}look/`;
const SIZE = 512;

async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`look: ${url} ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(SIZE, SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, SIZE, SIZE);
  return g.getImageData(0, 0, SIZE, SIZE).data;
}

const LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

// Colour layer as detail: each texel's linear colour over the layer's mean,
// so a texture brightens and darkens the piece's own colour but keeps it.
// Stored as ratio / 2 in 8 bits (ratio 0..2).
function detailLayer(px, out, off, { strength, chroma }) {
  const n = SIZE * SIZE;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let k = 0; k < n * 4; k += 4) {
    mr += LIN[px[k]];
    mg += LIN[px[k + 1]];
    mb += LIN[px[k + 2]];
  }
  mr /= n;
  mg /= n;
  mb /= n;
  const ml = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
  for (let k = 0; k < n * 4; k += 4) {
    const r = LIN[px[k]];
    const g = LIN[px[k + 1]];
    const b = LIN[px[k + 2]];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / ml;
    const q = [r / mr, g / mg, b / mb];
    for (let c = 0; c < 3; c++) {
      const ratio = 1 + (l + (q[c] - l) * chroma - 1) * strength;
      out[off + k + c] = Math.max(0, Math.min(255, Math.round(ratio * 127.5)));
    }
    out[off + k + 3] = 255;
  }
}

function arrayTexture(data, layers, renderer) {
  const t = new THREE.DataArrayTexture(data, SIZE, SIZE, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  t.colorSpace = THREE.NoColorSpace; // detail ratios and normals, not colours
  t.needsUpdate = true;
  return t;
}

async function loadTextures(renderer) {
  const n = TEXTURES.length;
  const albedo = new Uint8Array(SIZE * SIZE * 4 * n);
  const normal = new Uint8Array(SIZE * SIZE * 4 * n);
  await Promise.all(TEXTURES.map(async (t, i) => {
    const off = i * SIZE * SIZE * 4;
    detailLayer(await loadPixels(`${BASE}tex/${t.name}.webp`), albedo, off, t);
    if (t.normal) normal.set(await loadPixels(`${BASE}tex/${t.name}_n.webp`), off);
    else for (let k = 0; k < SIZE * SIZE; k++) normal.set([128, 128, 255, 255], off + k * 4);
  }));
  return { albedo: arrayTexture(albedo, n, renderer), normal: arrayTexture(normal, n, renderer) };
}

async function loadSky() {
  const info = await (await fetch(`${BASE}sky.json`)).json();
  const tex = await new THREE.TextureLoader().loadAsync(`${BASE}sky.webp`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter; // no mipmaps: they would show a seam where u wraps
  tex.generateMipmaps = false;
  return { info, tex };
}

// Call before the world is built. Loads everything and sets up the renderer.
export async function createLook(renderer, params) {
  const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  const opts = {
    exposure: num('exp', 0.45),
    sun: num('sun', 0.95),
    sky: num('sky', 1.0),
    textures: params.get('tex') !== '0',
    ao: params.get('ao') !== '0',
  };
  const t0 = performance.now();
  const [sky, tex] = await Promise.all([loadSky(), opts.textures ? loadTextures(renderer) : null]);
  // ACES, after taking a little saturation out (ACES alone makes the greens
  // glow) and warming it slightly. Inline in every shader, no extra pass.
  const sat = num('sat', 0.78);
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( l ), color, ${sat.toFixed(3)} ) * vec3( 1.03, 1.0, 0.95 );
  return ACESFilmicToneMapping( color );
}`,
  );
  renderer.toneMapping = params.get('tm') === 'agx' ? THREE.AgXToneMapping : THREE.CustomToneMapping;
  renderer.toneMappingExposure = opts.exposure;
  console.info(`[look] new look on, assets ready in ${Math.round(performance.now() - t0)} ms`);

  return {
    opts,
    // After buildWorld3D: swap lights and sky, add textures and contact shading.
    apply(scene, world3d, world, scenery) {
      const t1 = performance.now();
      const { info } = sky;
      const P = opts.sky;
      const lin = (a, s = 1) => new THREE.Color().setRGB(a[0] * s, a[1] * s, a[2] * s, THREE.LinearSRGBColorSpace);

      // Sky light. The hemisphere light goes; a probe holds the sky's light
      // plus a little green light bounced up from the ground.
      world3d.hemi.intensity = 0;
      world3d.hemi.visible = false;
      const probe = new THREE.LightProbe();
      info.sh.forEach((c, i) => probe.sh.coefficients[i].set(c[0], c[1], c[2]));
      const bounce = lin([0.16, 0.24, 0.1]); // ground radiance, below the horizon
      const b = new THREE.Vector3(bounce.r, bounce.g, bounce.b);
      probe.sh.coefficients[0].addScaledVector(b, 0.282095 * 2 * Math.PI);
      probe.sh.coefficients[1].addScaledVector(b, -0.488603 * Math.PI);
      probe.intensity = P;
      scene.add(probe);

      // Sun: the HDRI's sun, a touch warmer.
      const s = info.sun;
      const sMax = Math.max(...s);
      world3d.sun.color.setRGB((s[0] / sMax) * 1.0, (s[1] / sMax) * 0.97, (s[2] / sMax) * 0.9, THREE.LinearSRGBColorSpace);
      world3d.sun.intensity = sMax * P * opts.sun;

      // Fog and background take the sky's horizon colour.
      const fog = lin(info.horizon, P);
      scene.fog.color.copy(fog);
      scene.background = fog.clone();
      world3d.sky.material.dispose();
      world3d.sky.material = skyMaterial(sky.tex, info.bgMax * P, scene.fog.color);

      const ao = opts.ao ? buildAOMap(world, scenery) : null;
      const shared = {
        albedo: tex ? tex.albedo : null,
        normal: tex ? tex.normal : null,
        ao,
        layers: LAYERS,
        surf: SURF,
      };
      if (tex || ao) {
        const terrainMats = new Set();
        world3d.ground.traverse((o) => { if (o.isMesh) terrainMats.add(o.material); });
        for (const m of terrainMats) patchTerrain(m, shared);
        const patched = tagObjects(world3d.objects, world3d.terrain, shared);
        // Other meshes sharing those materials (moving parts) get a plain tag.
        scene.traverse((o) => {
          if (o.isMesh && patched.has(o.material) && !o.geometry.attributes.lookSurf) {
            const n = o.geometry.attributes.position.count;
            const d = new Float32Array(n * 2);
            for (let k = 0; k < n; k++) d[k * 2 + 1] = -1e4;
            o.geometry.setAttribute('lookSurf', new THREE.BufferAttribute(d, 2));
          }
        });
        if (tex) {
          const trunks = new Set();
          world3d.trees.object.traverse((o) => {
            if (o.isInstancedMesh && o.material.color && o.material.color.getHex() === 0x5a4030) trunks.add(o.material);
          });
          for (const m of trunks) patchTrunks(m, shared);
        }
      }
      console.info(`[look] applied in ${Math.round(performance.now() - t1)} ms`);
    },
    // After the ambient life is built: the low-poly sky clouds would sit in
    // front of the photo sky, which has its own clouds. Move them to a layer
    // the camera does not draw (their ground shadows stay).
    afterAmbient(scene) {
      scene.traverse((o) => {
        if (o.isInstancedMesh && o.renderOrder === -999 && o.material.emissive) o.layers.set(31);
      });
    },
  };
}

// Static batches: add per vertex [surface id, ground height] and patch their
// (shared) materials. Ground pieces (roads, pads) and standing things differ.
function tagObjects(root, terrain, shared) {
  const col = new THREE.Color();
  const patched = new Set();
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.type !== 'MeshLambertMaterial' || !o.material.vertexColors) return;
    const geo = o.geometry;
    const c = geo.attributes.color;
    const p = geo.attributes.position;
    if (!c || !p) return;
    const onGround = !o.material.flatShading;
    const data = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i += 3) {
      col.setRGB(c.getX(i), c.getY(i), c.getZ(i));
      const s = shared.albedo ? surfaceOf(col.getHex(), onGround) : 0;
      for (let k = i; k < Math.min(i + 3, p.count); k++) {
        data[k * 2] = s;
        data[k * 2 + 1] = terrain.heightAt(p.getX(k), p.getZ(k));
      }
    }
    geo.setAttribute('lookSurf', new THREE.BufferAttribute(data, 2));
    if (!patched.has(o.material)) {
      patched.add(o.material);
      patchObjects(o.material, shared, onGround);
    }
  });
  return patched;
}

