// On foot, and turning your head in the car (round 12). The rules of
// walking are in src/game/onfoot.js; this file owns the mouse, the
// first-person camera and the in-car glance.
//
// F (car stopped or nearly) gets out at the driver's door; F within a
// couple of metres of the car gets back in. On foot: WASD walk, Shift jog,
// mouse look (click to capture the mouse, Esc lets it go; dragging with the
// left button works too when the browser will not capture it).
// In the car: hold the right mouse button and move the mouse to turn your
// head, up to 100 degrees left or right and 35 up; it eases back to the
// front when you let go. Works in the chase view (the top view ignores it).
//
//   const foot = createOnFoot({ canvas, camera, rig })
//   foot.active                 out of the car?
//   foot.toggle(car, isClear)   F: out or back in (returns true if it did)
//   foot.step(dt, keys, isClear, car)   walking, every frame on foot
//   foot.camera(dt, groundAt)   first-person camera (instead of rig.update)
//   foot.glance(dt, e)          in the car, after rig.update (e: top-view blend)
//   foot.blend(dt)              after either: eases the cut between views
//   foot.walker                 { x, y, yaw, pitch, speed, stepped, jogging }
//   foot.reset()                back in the car at once (new mission, tow)

import * as THREE from 'three';
import { WALK, createWalker, placeBeside, stepWalker, carGap } from '../src/game/onfoot.js';

const DEG = Math.PI / 180;
const MOUSE = 0.12; // degrees per pixel
const GLANCE = { yaw: 100, up: 35, down: 15, back: 5 }; // limits (deg) and ease-back rate (1/s)
const FOOT_FOV = 70;
const BLEND_S = 0.35;

export function createOnFoot({ canvas, camera, rig, canLook = () => true }) {
  const walker = createWalker();
  let active = false;
  const glance = { yaw: 0, pitch: 0, held: false };
  let dragging = false; // left-drag look without pointer lock
  let bob = 0;
  // The cut between the chase camera and your eyes, eased over BLEND_S.
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 1 };
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmpQ = new THREE.Quaternion();

  const locked = () => document.pointerLockElement === canvas;
  const turn = (dx, dy) => {
    if (active) {
      walker.yaw = (walker.yaw + dx * MOUSE + 360) % 360;
      walker.pitch = Math.max(-85, Math.min(85, walker.pitch - dy * MOUSE));
    } else if (glance.held) {
      glance.yaw = Math.max(-GLANCE.yaw, Math.min(GLANCE.yaw, glance.yaw + dx * MOUSE));
      glance.pitch = Math.max(-GLANCE.down, Math.min(GLANCE.up, glance.pitch - dy * MOUSE));
    }
  };

  canvas.addEventListener('mousedown', (e) => {
    if (!canLook()) return;
    if (active && e.button === 0) {
      dragging = true;
      if (!locked() && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch (err) {
          // No pointer lock here: dragging still looks around.
        }
      }
    } else if (!active && e.button === 2) {
      glance.held = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) dragging = false;
    if (e.button === 2) glance.held = false;
  });
  window.addEventListener('blur', () => {
    dragging = false;
    glance.held = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!canLook()) return;
    if (active ? locked() || dragging : glance.held) turn(e.movementX || 0, e.movementY || 0);
  });

  function startBlend() {
    from.pos.copy(camera.position);
    from.quat.copy(camera.quaternion);
    from.t = 0;
  }

  function release() {
    if (locked() && document.exitPointerLock) document.exitPointerLock();
    dragging = false;
  }

  const api = {
    walker,
    get active() {
      return active;
    },
    get locked() {
      return locked();
    },
    get glancing() {
      return glance.held || Math.abs(glance.yaw) > 1 || Math.abs(glance.pitch) > 1;
    },
    // Dev and screenshots: look this way (degrees).
    setLook(yaw, pitch = 0) {
      if (active) {
        walker.yaw = (yaw + 360) % 360;
        walker.pitch = pitch;
      } else {
        glance.yaw = yaw;
        glance.pitch = pitch;
      }
    },
    holdGlance(on) {
      glance.held = !!on;
    },
    // F: out of the car (when it is stopped) or back in (when close to it).
    toggle(car, isClear) {
      if (!active) {
        if (Math.abs(car.speed) > WALK.exitSpeed) return false;
        const at = placeBeside(car, isClear);
        if (!at) return false;
        startBlend();
        active = true;
        car.speed = 0;
        walker.x = at.x;
        walker.y = at.y;
        walker.yaw = (car.heading + glance.yaw + 360) % 360;
        walker.pitch = glance.pitch;
        walker.vx = walker.vy = walker.speed = 0;
        walker.stepAcc = 0;
        glance.yaw = glance.pitch = 0;
        glance.held = false;
        return true;
      }
      if (carGap(car, walker.x, walker.y) > WALK.carReach) return false;
      startBlend();
      active = false;
      release();
      rig.first = true; // the chase camera snaps behind the car; the blend eases it
      return true;
    },
    reset() {
      if (!active) return;
      active = false;
      release();
      rig.first = true;
      from.t = 1;
    },
    // Let go of the mouse (a dialogue or the map opens).
    release,
    step(dt, keys, isClear, car) {
      const input = {
        fwd: keys.has('KeyW') || keys.has('ArrowUp'),
        back: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        jog: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
      // Arrow keys turn instead of strafing when the mouse is not captured.
      if (!locked() && !dragging) {
        const t = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        if (t) walker.yaw = (walker.yaw + t * 90 * dt + 360) % 360;
        input.left = keys.has('KeyA');
        input.right = keys.has('KeyD');
      }
      return stepWalker(walker, input, dt, isClear, car);
    },
    // First-person camera at eye height, a small bob as you walk.
    camera(dt, groundAt) {
      const g = groundAt(walker.x, walker.y);
      if (walker.speed > 0.2) bob += dt * (walker.jogging ? 13 : 9);
      else bob *= Math.max(0, 1 - dt * 6);
      const amp = walker.jogging ? 0.045 : 0.025;
      camera.up.set(0, 1, 0);
      camera.position.set(walker.x, g + WALK.eye + Math.sin(bob) * amp * Math.min(1, walker.speed), walker.y);
      look.set(walker.pitch * DEG, -walker.yaw * DEG, 0, 'YXZ');
      camera.quaternion.setFromEuler(look);
      if (camera.fov !== FOOT_FOV) {
        camera.fov = FOOT_FOV;
        camera.updateProjectionMatrix();
      }
      // Sharp shadows just ahead of you.
      const h = walker.yaw * DEG;
      rig.focus.set(walker.x + Math.sin(h) * 18, g, walker.y - Math.cos(h) * 18);
      rig.shadowRadius = 45;
    },
    // In the car: turn the view by the glance (after rig.update). In the top
    // view (e near 1) there is nothing to turn.
    glance(dt, e) {
      if (!glance.held) {
        const k = Math.min(1, dt * GLANCE.back);
        glance.yaw -= glance.yaw * k;
        glance.pitch -= glance.pitch * k;
        if (Math.abs(glance.yaw) < 0.05) glance.yaw = 0;
        if (Math.abs(glance.pitch) < 0.05) glance.pitch = 0;
      }
      const w = 1 - Math.min(1, e * 2);
      if (w <= 0 || (!glance.yaw && !glance.pitch)) return;
      camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, -glance.yaw * DEG * w);
      camera.rotateX(glance.pitch * DEG * w);
    },
    // Ease from the view before getting in or out to the new one.
    blend(dt) {
      if (from.t >= 1) return;
      from.t = Math.min(1, from.t + dt / BLEND_S);
      const u = from.t * from.t * (3 - 2 * from.t);
      camera.position.lerpVectors(from.pos, camera.position, u);
      tmpQ.copy(camera.quaternion);
      camera.quaternion.copy(from.quat).slerp(tmpQ, u);
    },
    // The direction you look, for sound and the compass (degrees).
    get heading() {
      return active ? walker.yaw : null;
    },
  };
  return api;
}
