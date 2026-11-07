// The tow scene after a breakdown (SPEC 9k). The mission is never lost: a
// tow truck comes along the road, the driver says a line, the screen fades,
// and the car is back at the nearest town's garage, fixed, a little later.
// Rules and words live in src/game/tow.js (engine-free); this file draws
// the truck, plays the scene and owns its few screens.
//
//   const tow = createTow(ui, { audio, rig, params })   once per session
//   tow.attach(scene, world3d)        after each region is built
//   tow.update(dt, carObj)            every frame, after car3d.update
//   tow.sound                         { x, y, throttle } or null, for audio.update
//   state.towing                      true while the scene plays (input locked)
//
// Timeline (seconds): the car stops, 2.2 waiting (smoke, warning lights),
// the truck drives in from behind (about 6) and backs up to the car (2.2),
// the driver's line (4 to 7, Enter skips), the winch (1.4), fade out (0.9),
// a card on black saying where you are and how long it took (3.4, Enter
// skips), fade in (1). About 22 seconds in all.
//
// Dev: ?breakdown=1 breaks the car down as soon as the game starts.
// window.__tow: { phase, hold (true freezes the scene), skip(), breakdown() }.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD } from '../src/world/world.js';
import { state } from '../src/state.js';
import { runtime } from './runtime.js';
import { DEG } from '../src/drive/geom.js';
import { speak } from '../src/audio/voice.js';
import { box } from './world3d/shapes.js';
import { colored } from './world3d/ambient3d.js';
import {
  garageFor, towDriverFor, towLine, towMinutes, applyTow, nearestRoad, causeText,
} from '../src/game/tow.js';

const T = {
  wait: 2.2,
  back: 2.2,
  hook: 1.4,
  fadeOut: 0.9,
  card: 3.4,
  fadeIn: 1.0,
};
const LANE = 3.2; // the truck passes this far to the left of the car
const STOP_F = 7.4; // where the truck stops, metres ahead of the car (centre to centre)

const CSS = `
.tow-root { position: absolute; inset: 0; pointer-events: none; font-family: Arial, Helvetica, sans-serif; }
.tow-banner { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px);
  padding: 10px 18px; background: rgba(35,37,42,0.92); border: 2px solid #e6a23a; border-radius: 10px;
  color: #ece7d8; font-size: 16px; line-height: 1.4; text-align: center; box-shadow: 3px 3px 0 rgba(0,0,0,0.3);
  display: none; }
.tow-banner b { color: #e6b450; display: block; font-size: 18px; margin-bottom: 2px; }
.tow-sub { position: absolute; left: 50%; bottom: calc(92px + 14px); transform: translateX(-50%); width: min(760px, calc(100% - 32px));
  padding: 14px 20px 30px; background: rgba(35,37,42,0.96); border: 2px solid #6b6e74; border-radius: 10px;
  box-shadow: 4px 4px 0 rgba(0,0,0,0.3); display: none; }
.tow-sub-name { color: #e6b450; font-weight: bold; font-size: 16px; margin-bottom: 8px; }
.tow-sub-text { color: #ece7d8; font-size: 18px; line-height: 1.45; }
.tow-sub-more { position: absolute; right: 16px; bottom: 9px; font-size: 12px; color: #8a8d92; font-family: "Courier New", Courier, monospace; }
.tow-fade { position: absolute; inset: 0; background: #121214; opacity: 0; display: none;
  align-items: center; justify-content: center; text-align: center; }
.tow-card { color: #ece7d8; max-width: min(520px, calc(100% - 40px)); opacity: 0; transition: opacity 0.4s; }
.tow-card h2 { margin: 0 0 10px; color: #e6b450; font-size: 26px; }
.tow-card p { margin: 6px 0; font-size: 17px; line-height: 1.45; }
.tow-card .tow-time { color: #a9acb2; font-size: 15px; margin-top: 14px; }
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// ---------- the truck ----------

function wheel(x, z, r = 0.46, w = 0.34) {
  return [
    colored(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, r, z), 0x1d1d1d),
    colored(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 8).rotateZ(Math.PI / 2).translate(x, r, z), 0xbdb8aa),
  ];
}

// A low-poly tow truck in model space: forward is -z, base on y = 0,
// about 6.6 m long. The light bar's lenses are separate (they flash).
function truckGeo() {
  const CAB = 0xc4472c; // faded fire-engine red
  const DARK = 0x2b2c2f;
  const parts = [
    colored(box(1.8, 0.32, 6.1).translate(0, 0.52, -0.1), DARK), // chassis
    colored(box(2.0, 0.85, 1.25).translate(0, 0.8, -2.65), CAB), // bonnet
    colored(box(2.04, 0.18, 0.12).translate(0, 0.62, -3.3), 0x8f8f8a), // bumper
    colored(box(1.3, 0.5, 0.06).translate(0, 0.95, -3.29), 0x3a3b3d), // grille
    colored(box(0.32, 0.2, 0.06).translate(-0.72, 1.28, -3.29), 0xfff1c0), // lamps
    colored(box(0.32, 0.2, 0.06).translate(0.72, 1.28, -3.29), 0xfff1c0),
    colored(box(2.1, 1.85, 1.55).translate(0, 0.8, -1.3), CAB), // cab
    colored(box(1.9, 0.62, 0.06).translate(0, 1.85, -2.1), 0x34414b), // windscreen
    colored(box(0.06, 0.55, 1.0).translate(-1.06, 1.85, -1.3), 0x34414b), // side windows
    colored(box(0.06, 0.55, 1.0).translate(1.06, 1.85, -1.3), 0x34414b),
    colored(box(2.14, 0.14, 1.59).translate(0, 1.55, -1.3), 0xe9e2cf), // cream stripe
    colored(box(2.06, 0.28, 3.4).translate(0, 0.7, 1.3), 0x6d6a63), // bed deck
    colored(box(0.1, 0.45, 3.4).translate(-1.0, 0.98, 1.3), CAB), // bed sides
    colored(box(0.1, 0.45, 3.4).translate(1.0, 0.98, 1.3), CAB),
    colored(box(1.4, 0.7, 0.9).translate(0, 0.98, 0.1), 0x4a4b4e), // winch housing
    colored(box(1.1, 0.12, 0.7).translate(0, 0.2, 3.15), DARK), // wheel lift
    colored(box(0.06, 0.06, 0.06).translate(-0.95, 0.9, 2.98), 0xb02018), // tail lights
    colored(box(0.06, 0.06, 0.06).translate(0.95, 0.9, 2.98), 0xb02018),
    ...wheel(-0.95, -2.5), ...wheel(0.95, -2.5), ...wheel(-0.95, 1.7), ...wheel(0.95, 1.7),
  ];
  // The boom: a yellow arm rising toward the back, a cable and a hook.
  const boom = box(0.26, 0.26, 3.0).translate(0, -0.13, -1.5).rotateX(-0.5).translate(0, 1.2, 2.7);
  parts.push(colored(boom, 0xe0b23a));
  parts.push(colored(box(0.3, 1.0, 0.3).translate(0, 0.98, 0.3), 0xe0b23a)); // boom post
  parts.push(colored(box(0.04, 1.0, 0.04).translate(0, 1.05, 2.72), 0x222222)); // cable
  parts.push(colored(box(0.18, 0.22, 0.1).translate(0, 0.85, 2.72), 0x555555)); // hook
  // Light bar base on the roof.
  parts.push(colored(box(1.5, 0.12, 0.32).translate(0, 2.65, -1.3), 0x333333));
  return mergeGeometries(parts);
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,220,140,1)');
  grad.addColorStop(0.3, 'rgba(255,170,40,0.6)');
  grad.addColorStop(1, 'rgba(255,140,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

function buildTruck() {
  const group = new THREE.Group();
  group.name = 'towTruck';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(truckGeo(), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Two amber lenses on the bar, each with a soft glow, flashing in turn.
  const lenses = [];
  for (const x of [-0.45, 0.45]) {
    const lm = new THREE.MeshBasicMaterial({ color: 0x7a4a10 });
    const lens = new THREE.Mesh(box(0.42, 0.2, 0.26), lm);
    lens.position.set(x, 2.77, -1.3);
    group.add(lens);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    glow.position.set(x, 2.88, -1.3);
    glow.scale.setScalar(2.2);
    group.add(glow);
    lenses.push({ lm, glow });
  }
  group.visible = false;
  return { group, lenses };
}

// ---------- the scene ----------

export function createTow(ui, { audio = null, rig = null, params = new URLSearchParams() } = {}) {
  if (!document.getElementById('tow-style')) {
    const st = document.createElement('style');
    st.id = 'tow-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = el('div', 'tow-root', ui);
  const banner = el('div', 'tow-banner', root);
  const sub = el('div', 'tow-sub', root);
  const subName = el('div', 'tow-sub-name', sub);
  const subText = el('div', 'tow-sub-text', sub);
  el('div', 'tow-sub-more', sub, 'Enter: go on');
  const fade = el('div', 'tow-fade', root);
  const card = el('div', 'tow-card', fade);

  let truck = null; // { group, lenses } in the current region's scene
  let surfaceAt = null;
  let seq = null; // the scene while it plays
  let hold = false; // dev: freeze the scene where it is
  let skipReq = false;
  const sound = { x: 0, y: 0, throttle: 0 };
  let soundOn = false;
  let devBreak = params.get('breakdown') === '1';

  window.addEventListener('keydown', (e) => {
    if (!seq) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Escape') {
      skipReq = true;
      e.preventDefault();
    }
  });
  fade.addEventListener('click', () => {
    skipReq = true;
  });
  sub.style.pointerEvents = 'auto';
  sub.addEventListener('click', () => {
    skipReq = true;
  });

  // ----- path: along the road from behind the car, past it on the left,
  // swing in ahead of it, then back up to it.
  function planPath(car) {
    const h = car.heading * DEG;
    const fx = Math.sin(h);
    const fy = -Math.cos(h);
    const rx = Math.cos(h);
    const ry = Math.sin(h);
    const local = (f, r) => new THREE.Vector3(car.x + fx * f + rx * r, 0, car.y + fy * f + ry * r);
    const pts = [];
    const n = nearestRoad(WORLD, car.x, car.y);
    if (n) {
      const r = n.road;
      // Travel the way the car points.
      const s = n.dx * fx + n.dy * fy >= 0 ? 1 : -1;
      const len = r.length || r.points.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - r.points[i - 1][0], p[1] - r.points[i - 1][1]) : 0), 0);
      const end = n.d < 25 ? 14 : 0; // stop the road part this far short of the car's spot on it
      const from = Math.max(0, Math.min(len, n.along - s * 75));
      const to = Math.max(0, Math.min(len, n.along - s * end));
      const steps = Math.max(1, Math.round(Math.abs(to - from) / 6));
      const cum = [0];
      for (let i = 1; i < r.points.length; i++) cum.push(cum[i - 1] + Math.hypot(r.points[i][0] - r.points[i - 1][0], r.points[i][1] - r.points[i - 1][1]));
      const at = (d) => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const a = r.points[i - 1];
        const b = r.points[i];
        const L = cum[i] - cum[i - 1] || 1;
        const t = Math.max(0, Math.min(1, (d - cum[i - 1]) / L));
        const dx = ((b[0] - a[0]) / L) * s;
        const dy = ((b[1] - a[1]) / L) * s;
        // Left of the way we travel: (dy, -dx).
        return new THREE.Vector3(a[0] + (b[0] - a[0]) * t + dy * LANE, 0, a[1] + (b[1] - a[1]) * t - dx * LANE);
      };
      if (Math.abs(to - from) > 5) for (let i = 0; i <= steps; i++) pts.push(at(from + ((to - from) * i) / steps));
    }
    if (!pts.length) pts.push(local(-70, -LANE));
    pts.push(local(-6, -LANE), local(5, -LANE), local(11, -LANE * 0.6), local(STOP_F + 8, 0));
    // Drop points that double back on themselves (a road behind a car
    // parked at an angle).
    const clean = [pts[0]];
    for (const p of pts.slice(1)) if (p.distanceTo(clean[clean.length - 1]) > 2) clean.push(p);
    const curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
    return { curve, length: curve.getLength(), fwd: { fx, fy }, end: local(STOP_F + 8, 0), stop: local(STOP_F, 0) };
  }

  function placeTruck(x, y, heading) {
    const g = truck.group;
    const h = heading * DEG;
    const sx = Math.sin(h);
    const sy = -Math.cos(h);
    const hf = surfaceAt(x + sx * 2.3, y + sy * 2.3);
    const hb = surfaceAt(x - sx * 2.3, y - sy * 2.3);
    g.position.set(x, (hf + hb) / 2, y);
    g.rotation.set(Math.atan2(hf - hb, 4.6), -h, 0, 'YXZ');
    sound.x = x;
    sound.y = y;
  }

  function setBanner(html) {
    if (html === null) {
      banner.style.display = 'none';
      return;
    }
    banner.innerHTML = html;
    banner.style.display = 'block';
  }

  function start() {
    const car = state.car;
    const g = garageFor(WORLD, car.x, car.y);
    const driver = towDriverFor(WORLD);
    seq = {
      phase: 'wait', t: 0, g, driver,
      line: towLine(WORLD, state, g),
      minutes: towMinutes(g.dist),
      path: planPath(car),
      carHeading: car.heading,
      lift: 0,
    };
    state.towing = true;
    state.inputLocked = true;
    const cause = state.damage ? state.damage.cause : 'engine';
    setBanner(`<b>Broken down</b>${causeText(cause)} Someone's bound to come along.`);
  }

  function next(phase) {
    seq.phase = phase;
    seq.t = 0;
    skipReq = false;
  }

  function finish() {
    seq = null;
    state.towing = false;
    state.inputLocked = false;
    fade.style.display = 'none';
    fade.style.opacity = '0';
    card.style.opacity = '0';
    setBanner(null);
    sub.style.display = 'none';
    soundOn = false;
  }

  function showCard() {
    const { g, minutes } = seq;
    card.textContent = '';
    el('h2', null, card, `Towed to ${g.town}`);
    el('p', null, card, g.garage
      ? `${g.mechanic} at the garage patched her up. She runs fine, give or take a dent.`
      : `${g.mechanic} patched her up by the side of the road. She runs fine, give or take a dent.`);
    el('p', null, card, 'Your notes and your map came along too. The job is still yours.');
    const tows = state.tows || 0;
    el('p', 'tow-time', card, `${minutes} minutes later${tows > 1 ? ` · towed ${tows} times this trip` : ''}`);
  }

  // Dev: break the car down now (?breakdown=1, __tow.breakdown()).
  function breakdown() {
    const d = state.damage;
    if (!d || d.brokenDown) return;
    d.engine = 0;
    d.tyres = Math.min(d.tyres, 0.6);
    d.steering = Math.min(d.steering, 0.7);
    d.compass = Math.min(d.compass, 0.5);
    if (!d.dents.length) {
      d.dents.push({ f: 1, r: 0.2, amount: 0.22 }, { f: 0.3, r: -0.95, amount: 0.1 });
      d.dentsV++;
    }
  }

  window.__tow = {
    get phase() {
      return seq ? seq.phase : null;
    },
    get seq() {
      return seq;
    },
    get hold() {
      return hold;
    },
    set hold(v) {
      hold = !!v;
    },
    skip() {
      skipReq = true;
    },
    breakdown,
  };

  return {
    get sound() {
      return soundOn ? sound : null;
    },
    get active() {
      return !!seq;
    },
    attach(scene, world3d) {
      surfaceAt = world3d.surfaceAt;
      truck = buildTruck();
      scene.add(truck.group);
      // A region change during the scene (should not happen) just ends it.
      if (seq) finish();
    },
    update(dt, carObj) {
      if (!truck) return;
      if (devBreak && !state.inputLocked && !runtime.paused) {
        devBreak = false;
        state.briefPending = false;
        breakdown();
      }
      if (!seq) {
        const d = state.damage;
        if (d && d.brokenDown && d.stopT > 1.2 && !state.won && !state.inputLocked && !runtime.paused && !state.briefPending) start();
        if (!seq) return;
      }
      if (runtime.paused || hold) dt = 0;
      seq.t += dt;
      const car = state.car;
      const time = performance.now() / 1000;
      // Light bar: the two lenses take turns.
      if (truck.group.visible) {
        const on = Math.floor(time * 5) % 2;
        truck.lenses.forEach((l, i) => {
          const lit = i === on;
          l.lm.color.setHex(lit ? 0xffb02e : 0x7a4a10);
          l.glow.visible = lit;
        });
      }
      const P = seq.path;
      switch (seq.phase) {
        case 'wait':
          if (seq.t >= T.wait || skipReq) {
            next('drive');
            truck.group.visible = true;
            soundOn = true;
            seq.driveT = Math.max(5, Math.min(8, P.length / 11));
          }
          break;
        case 'drive': {
          // Eases out to a stop: u = 1 - (1 - t)^2.
          const k = Math.min(1, seq.t / seq.driveT);
          const u = 1 - (1 - k) * (1 - k);
          const p = P.curve.getPointAt(u);
          const tan = P.curve.getTangentAt(Math.min(0.999, u));
          placeTruck(p.x, p.z, (Math.atan2(tan.x, -tan.z) / DEG + 360) % 360);
          sound.throttle = 1 - k;
          if (seq.t > 2.5) setBanner(null);
          if (k >= 1 || skipReq) {
            setBanner(null);
            next('back');
          }
          break;
        }
        case 'back': {
          // Reverse straight back to the car, facing the way it faces.
          const k = Math.min(1, seq.t / T.back);
          const e = k * k * (3 - 2 * k);
          const x = P.end.x + (P.stop.x - P.end.x) * e;
          const y = P.end.z + (P.stop.z - P.end.z) * e;
          placeTruck(x, y, seq.carHeading);
          sound.throttle = 0.25 * Math.sin(k * Math.PI);
          if (k >= 1 || skipReq) {
            placeTruck(P.stop.x, P.stop.z, seq.carHeading);
            sound.throttle = 0;
            next('talk');
            subName.textContent = `${seq.driver.name} (${seq.driver.role})`;
            subText.textContent = seq.line;
            sub.style.display = 'block';
            speak(seq.driver.id, seq.line);
            if (audio) audio.cue('tow/chain', 0.45);
            seq.talkT = Math.max(4, Math.min(7, 2.5 + seq.line.length * 0.05));
          }
          break;
        }
        case 'talk':
          if (seq.t >= seq.talkT || skipReq) {
            sub.style.display = 'none';
            speak(null);
            if (audio) audio.cue('tow/winch', 0.5);
            next('hook');
          }
          break;
        case 'hook':
          seq.lift = Math.min(1, seq.t / T.hook);
          if (seq.t >= T.hook || skipReq) {
            next('fadeOut');
            fade.style.display = 'flex';
          }
          break;
        case 'fadeOut': {
          const k = Math.min(1, seq.t / T.fadeOut);
          fade.style.opacity = String(k);
          if (k >= 1) {
            applyTow(state, seq.g, seq.minutes);
            truck.group.visible = false;
            soundOn = false;
            seq.lift = 0;
            if (rig) rig.first = true;
            showCard();
            card.style.opacity = '1';
            next('card');
          }
          break;
        }
        case 'card':
          if (seq.t >= T.card || skipReq) {
            card.style.opacity = '0';
            next('fadeIn');
          }
          break;
        case 'fadeIn': {
          const k = Math.min(1, seq.t / T.fadeIn);
          fade.style.opacity = String(1 - k);
          if (k >= 1) finish();
          break;
        }
        default:
          break;
      }
      // The winch lifts the car's front a little.
      if (seq && seq.lift > 0 && carObj) {
        const l = seq.lift * seq.lift * (3 - 2 * seq.lift);
        carObj.position.y += l * 0.3;
        carObj.rotateX(l * 0.1);
      }
      if (!seq) return;
      // Keep the car still.
      car.speed = 0;
    },
  };
}
