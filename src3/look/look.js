// The game's look (SPEC 9e, default since 9h). With ?look=old nothing here
// runs and the game renders with the old light and flat colours.
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
// 4. Weather (weather.js): sunny, partly cloudy and overcast, drifting slowly.
// 5. Rain (round 8, src/game/wetness.js): a darker sky and light while it
//    rains; wet, darker ground, muddy low ground and dirt roads, shiny
//    asphalt and stone (shaders.js WET).
//
// Dev URL knobs: ?weather=sunny|cloudy|overcast|cycle &exp=<exposure> &sun=<sun scale> &sky=<sky scale> &tm=agx
// &sat=<saturation> &grade=0 (no colour grade; knobs g_olive g_warm g_teal g_lift g_cream g_vig g_grain, see grade.js) &tex=0 (light only) &ao=0 (no ground contact shading).

import * as THREE from 'three';
import { TEXTURES, LAYERS, SURF, surfaceOf } from './surfaces.js';
import { buildAOMap } from './aomap.js';
import { makeGrade, gradeGLSL, creamTint, applyOverlay } from './grade.js';
import { patchObjects, patchTerrain, patchTrunks, patchRocks, patchWetPlants, skyMaterial, WET } from './shaders.js';
import { createWeatherClock, keyLooks, lookAt, emptyLook } from './weather.js';
import { cloudCover, cloudUniforms } from '../world3d/clouds.js';

export const LOOK_NEW = new URLSearchParams(window.location.search).get('look') !== 'old';

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

// The sharp sky (SPEC 9n): the same photo at 4096 x 1024, fetched once the
// game runs and swapped in when it has arrived. Decoded off the main thread
// (createImageBitmap) and uploaded at once, with mipmaps: the sky shader
// picks the mip level itself so the seam where u wraps does not show.
async function loadSharpSky(name, renderer) {
  const res = await fetch(`${BASE}${name}_4k.webp`);
  if (!res.ok) throw new Error(`look: ${name}_4k.webp ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bmp);
  tex.flipY = false; // flipped while decoding
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  renderer.initTexture(tex);
  return tex;
}

// Phones and low-memory devices keep the small sky (and cannot squint with
// the right mouse button anyway). ?sharpsky=0 / 1 forces it.
function wantSharpSky(params) {
  if (params.has('sharpsky')) return params.get('sharpsky') !== '0';
  const mem = navigator.deviceMemory;
  if (mem !== undefined && mem < 4) return false;
  return !window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: fine)').matches;
}

async function loadSky(name) {
  const info = await (await fetch(`${BASE}${name}.json`)).json();
  const tex = await new THREE.TextureLoader().loadAsync(`${BASE}${name}.webp`);
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
  const [sky, sunnySky, tex] = await Promise.all([loadSky('sky'), loadSky('sky_sunny'), opts.textures ? loadTextures(renderer) : null]);
  // ACES, after taking a little saturation out (ACES alone makes the greens
  // glow) and warming it slightly. Inline in every shader, no extra pass.
  const sat = num('sat', 0.78);
  const grade = makeGrade(params); // src3/look/grade.js; a mission preset can pass its own
  const cream = creamTint(grade);
  applyOverlay(grade);
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( l ), color, ${sat.toFixed(3)} ) * vec3( 1.03, 1.0, 0.95 );
  color = ACESFilmicToneMapping( color );${gradeGLSL(grade)}
  return color;
}`,
  );
  renderer.toneMapping = params.get('tm') === 'agx' ? THREE.AgXToneMapping : THREE.CustomToneMapping;
  renderer.toneMappingExposure = opts.exposure;
  console.info(`[look] new look on, assets ready in ${Math.round(performance.now() - t0)} ms`);

  let weather = null;
  let carEnv = null;
  let skyMat = null; // the sky dome's material (one per region)
  let sharp = null; // the sharp sky's loading, once started
  const envImg = sunnySky.tex.image; // the small clear sky, for the car reflections
  // Rain (round 8, src/game/wetness.js): how hard it rains darkens the sky,
  // the light and the haze; the wetness goes to every patched material.
  const rainNow = { rain: 0, wet: 0, storm: 0 };
  return {
    opts,
    // Reflections for the cars' paint, glass and chrome: the sunny sky above
    // a soft green-brown ground, as a PMREM map (made once, on first use).
    carEnv() {
      if (carEnv) return carEnv;
      const img = envImg;
      const W = 1024;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = W / 2;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, W, W / 4);
      const grad = g.createLinearGradient(0, W / 4, 0, W / 2);
      grad.addColorStop(0, '#b4bab2');
      grad.addColorStop(0.12, '#8a9274');
      grad.addColorStop(0.3, '#69744e');
      grad.addColorStop(1, '#4a5536');
      g.fillStyle = grad;
      g.fillRect(0, W / 4, W, W / 4);
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(renderer);
      carEnv = pm.fromEquirectangular(t).texture;
      pm.dispose();
      t.dispose();
      return carEnv;
    },
    // After buildWorld3D: swap lights and sky, add textures and contact shading.
    apply(scene, world3d, world, scenery) {
      const t1 = performance.now();
      const lin = (a, s = 1) => new THREE.Color().setRGB(a[0] * s, a[1] * s, a[2] * s, THREE.LinearSRGBColorSpace);

      // Sky light. The hemisphere light goes; a probe holds the sky's light
      // plus a little green light bounced up from the ground. The weather
      // (weather.js) blends its coefficients, the sun, fog and sky dome.
      world3d.hemi.intensity = 0;
      world3d.hemi.visible = false;
      const probe = new THREE.LightProbe();
      scene.add(probe);
      const bounce = lin([0.16, 0.24, 0.1]); // ground radiance, below the horizon
      const keys = keyLooks(sky.info, sunnySky.info, opts, [bounce.r, bounce.g, bounce.b]);
      const clock = createWeatherClock(world.seed || 1, params.get('weather'));
      const cur = emptyLook();

      scene.background = scene.fog.color.clone();
      world3d.sky.material.dispose();
      skyMat = skyMaterial(sunnySky.tex, sky.tex, sunnySky.info.bgMax, sky.info.bgMax, scene.fog.color);
      world3d.sky.material = skyMat;
      const sunLight = world3d.sun;
      let lastW = -1;
      let lastRain = -1;
      let lastStorm = -1;
      WET.lookSkyCol.value = scene.fog.color; // wet surfaces reflect the haze
      weather = {
        clock,
        update(state) {
          const w = clock.update(state);
          const rk = rainNow.rain;
          const st = rainNow.storm;
          if (Math.abs(w - lastW) < 1e-4 && Math.abs(rk - lastRain) < 1e-3 && Math.abs(st - lastStorm) < 1e-3) return;
          lastW = w;
          lastRain = rk;
          lastStorm = st;
          lookAt(keys, w, cur);
          // Rain: a darker, bluer-grey day; the sun all but gone.
          // A thunder spell (SPEC 9n, src3/world3d/lightning3d.js storm):
          // darker still, so a bolt stands out; never black.
          const dim = (1 - 0.28 * rk) * (1 - 0.3 * st);
          cur.sh.forEach((c, i) => probe.sh.coefficients[i].set(c[0] * dim, c[1] * dim, c[2] * dim * (1 + 0.03 * rk)));
          sunLight.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2], THREE.LinearSRGBColorSpace);
          sunLight.intensity = cur.sun * (1 - 0.6 * rk);
          sunLight.shadow.intensity = cur.shadow * (1 - 0.5 * rk);
          const fd = (1 - 0.38 * rk) * (1 - 0.5 * st);
          scene.fog.color.setRGB(cur.fog[0] * cream[0] * fd * (1 - 0.03 * rk), cur.fog[1] * cream[1] * fd, cur.fog[2] * cream[2] * fd * (1 + 0.03 * rk), THREE.LinearSRGBColorSpace);
          scene.background.copy(scene.fog.color);
          skyMat.uniforms.gain.value = cur.gain * (1 - 0.42 * rk) * (1 - 0.55 * st);
          skyMat.uniforms.skyMix.value = cur.skyMix;
          skyMat.uniforms.grey.value = cur.grey;
          cloudCover.value = cur.cover;
          cloudUniforms.uCloudDark.value = cur.dark;
        },
      };
      weather.update({ missionIndex: 0, clockMinutes: 0 });

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
          if (world3d.scatter.materials) patchRocks(world3d.scatter.materials.rock, shared);
        }
        if (world3d.scatter.materials) {
          patchWetPlants(world3d.scatter.materials.shrub);
          patchWetPlants(world3d.scatter.materials.tuft);
        }
      }
      console.info(`[look] applied in ${Math.round(performance.now() - t1)} ms`);
    },
    // Every frame: weather drift (cheap: uniforms only, and only on change).
    // rain, wet: src/game/wetness.js; storm: src3/world3d/lightning3d.js.
    update(state, rain = 0, wet = 0, storm = 0) {
      rainNow.rain = rain;
      rainNow.storm = storm;
      rainNow.wet = wet;
      WET.lookWet.value = wet;
      if (weather) weather.update(state);
    },
    get weather() { return weather ? weather.clock.w : null; },
    // Once the game runs (src3/main.js startGame): fetch the sharp skies and
    // swap both in together when they have arrived, so the weather keeps
    // blending a matching pair. The small ones are freed. Safe to call again.
    sharpenSky() {
      if (sharp || !wantSharpSky(params)) return sharp;
      const t2 = performance.now();
      sharp = Promise.all([loadSharpSky('sky', renderer), loadSharpSky('sky_sunny', renderer)])
        .then(([c, s]) => {
          const old = [sky.tex, sunnySky.tex];
          sky.tex = c;
          sunnySky.tex = s;
          if (skyMat) {
            skyMat.uniforms.skyC.value = c;
            skyMat.uniforms.skyS.value = s;
          }
          old.forEach((t) => t.dispose());
          console.info(`[look] sharp sky in after ${Math.round(performance.now() - t2)} ms`);
        })
        .catch((e) => console.warn('[look] sharp sky not loaded, keeping the small one', e));
      return sharp;
    },
    // Textures that outlive a region (src3/main.js keeps them when it
    // disposes one): the texture arrays, the skies and the car reflections.
    keepTextures() {
      return [tex && tex.albedo, tex && tex.normal, sky.tex, sunnySky.tex, carEnv];
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

