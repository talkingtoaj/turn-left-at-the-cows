// The crop duster (#90, flight in src/world/duster.js): the airfield's plane
// model painted as a yellow farm sprayer with a spray bar, a prop disc, and a
// mist trail behind it while it works the field. 3 draw calls while it is in
// the sky (body, prop disc, mist), none otherwise.
//
//   createDuster3D(scene, world, terrain, params) -> null | { sound, update(missionIndex, clockSec, camera, listener) }
//     null in any region but Fenwick, or with ?duster=off.
//     ?duster=now starts the flight at once (for shots) instead of when the
//     opening rain has cleared.
//   sound: one entry for the audio's plane voice (same shape as
//     planes3d.js: { engine, x, y, dz, vx, vy, vz, throttle, ground }).
//
// The mist is not stored: it is laid along where the plane was over the last
// few seconds, which the flight function can answer for any time.

import * as THREE from 'three';
import { planeGeometry } from './planes3d.js';
import { DUSTER, dusterAt, dusterLength } from '../../src/world/duster.js';
import { OPENING } from '../../src/game/opening.js';
import { MISSION_LIST } from '../../src/game/missionList.js';

const DEG = Math.PI / 180;
const SOUND_C = 343;
// The audio's Doppler is gentle; the pass is a short event, so the pitch drop
// is made clearer by telling it the plane is this much faster than it is.
const DOPPLER_BOOST = 1.8;
// Mist: points laid back along the track, one every MIST_DT s for MIST_N points.
const MIST_N = 28;
const MIST_DT = 0.14;
const MIST_HALF = 6; // metres each side of the plane at once
const MIST_SPREAD = 0.55; // metres wider each point back
const MIST_ALPHA = 0.85;

export function createDuster3D(scene, world, terrain, params) {
  if (params.get('duster') === 'off') return null;
  if (!(world.regionId || 'fenwick').startsWith('fenwick')) return null;
  const now = params.get('duster') === 'now';

  const body = new THREE.Mesh(
    planeGeometry({ kind: 'low', color: 0xb5301f, prop: 'none', body: 0xf0c22e, boom: true }),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 20),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.position.set(0, 1.1, -2.6);
  const obj = new THREE.Group();
  obj.add(body, disc);
  obj.rotation.order = 'YXZ';
  for (const o of [obj, body, disc]) o.frustumCulled = false;
  obj.visible = false;
  obj.name = 'duster';

  // Mist ribbon: three vertices a point (left, middle, right), alpha 0 at the edges.
  const nv = MIST_N * 3;
  const pos = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) col.set([0.98, 0.99, 0.93, 0], i * 4);
  const idx = [];
  for (let k = 0; k < MIST_N - 1; k++) {
    const a = k * 3;
    const b = a + 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mg.setAttribute('color', new THREE.BufferAttribute(col, 4));
  mg.setIndex(idx);
  const mist = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  mist.frustumCulled = false;
  mist.visible = false;
  mist.name = 'duster-mist';
  scene.add(obj, mist);

  const sound = { engine: false, x: 0, y: 0, dz: 0, vx: 0, vy: 0, vz: 0, throttle: 0, ground: false };
  const cur = {};
  const heard = {};
  const past = {};
  const hz = MISSION_LIST[0].startMinutes * 60 + OPENING.SKY_CLEAR; // clock second it appears (the sun is out)
  let startClock = now ? null : hz;
  const length = dusterLength();

  // The flight time for a clock reading (seconds); the 'now' flag starts it on the first look.
  function flightTime(clockSec) {
    if (startClock === null || (now && clockSec < startClock - 1)) startClock = clockSec; // first look, or a replay
    return clockSec - startClock;
  }

  function layMist(t) {
    let live = 0;
    let prev = null;
    for (let k = 0; k < MIST_N; k++) {
      const s = dusterAt(t - k * MIST_DT, past);
      const on = s.visible && s.spray && (t - k * MIST_DT) < length;
      const fade = on ? MIST_ALPHA * (1 - k / MIST_N) * Math.min(1, (k + 0.5) / 2) : 0;
      if (fade > 0) live++;
      const w = MIST_HALF + k * MIST_SPREAD;
      const nx = on ? -Math.cos(s.heading * DEG) : 0; // across the track (east is x, north is -y)
      const ny = on ? -Math.sin(s.heading * DEG) : 0;
      const x = on ? s.x : prev ? prev.x : 0;
      const y = on ? s.y : prev ? prev.y : 0;
      // It sinks as it ages, to just above the crop.
      const h = on ? terrain.heightAt(x, y) + Math.max(0.9, s.alt * (1 - k / MIST_N) + 0.6) : prev ? prev.h : 0;
      prev = { x, y, h };
      for (let j = 0; j < 3; j++) {
        const o = (k * 3 + j) * 3;
        const side = (j - 1) * w;
        pos[o] = x + nx * side;
        pos[o + 1] = h;
        pos[o + 2] = y + ny * side;
        col[(k * 3 + j) * 4 + 3] = j === 1 ? fade : 0;
      }
    }
    mg.attributes.position.needsUpdate = true;
    mg.attributes.color.needsUpdate = true;
    return live > 1;
  }

  return {
    sound,
    startClock: () => startClock, // dev: for shots that set the clock to a chosen moment of the flight
    // clockSec: the game clock in seconds; missionIndex: only mission 1 (0) shows it.
    update(missionIndex, clockSec, camera, listener) {
      const t = missionIndex === 0 ? flightTime(clockSec) : -1;
      const s = dusterAt(t, cur);
      obj.visible = !!s.visible;
      if (s.visible) {
        const gy = terrain.heightAt(s.x, s.y) + s.alt;
        obj.position.set(s.x, gy, s.y);
        obj.rotation.set(s.pitch, -s.heading * DEG, -s.bank, 'YXZ');
        disc.rotation.z += 0.9;
      }
      mist.visible = missionIndex === 0 && t >= 0 && t < length + MIST_N * MIST_DT ? layMist(t) : false;
      // Sound: from where the plane was when the sound we hear now left it.
      if (!listener || !s.visible) {
        sound.engine = false;
        return;
      }
      let h = s;
      for (let k = 0; k < 2; k++) {
        const dist = Math.hypot(h.x - listener.x, h.y - listener.y, (terrain.heightAt(h.x, h.y) + h.alt) - listener.z);
        h = dusterAt(t - dist / SOUND_C, heard);
      }
      sound.engine = !!h.visible;
      sound.x = h.x;
      sound.y = h.y;
      sound.dz = terrain.heightAt(h.x, h.y) + h.alt - listener.z;
      sound.vx = (h.vx || 0) * DOPPLER_BOOST;
      sound.vy = (h.vy || 0) * DOPPLER_BOOST;
      sound.vz = (h.vz || 0) * DOPPLER_BOOST;
      sound.throttle = h.throttle || 0;
      sound.ground = false;
    },
  };
}
