// Camera rig: 'chase' (low behind the car, like a driver) and 'top' (close
// top-down, north up or heading up). Switching blends smoothly between them.

import * as THREE from 'three';
import { DEG } from '../../src/drive/geom.js';

const CHASE = { back: 8.5, up: 3.1, ahead: 16, lookUp: 1.0, fov: 60 };
const TOP = { width: 200, fov: 50 }; // metres of ground visible across

function angleLerp(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = null; // smoothed heading, radians
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.blend = 0; // 0 = chase, 1 = top
    this.headingUp = 0; // 0 = north up, 1 = car heading up (top view only)
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.focus = new THREE.Vector3(); // where shadows should be sharpest
    this.shadowRadius = 70;
    this.first = true;
    this._cp = new THREE.Vector3();
    this._ct = new THREE.Vector3();
    this._tp = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  shake(hitSpeed) {
    this.shakeT = 0.12;
    this.shakeAmp = 0.12 * Math.min(3, hitSpeed / 8);
  }

  // carPos: THREE.Vector3 of the car (y = ride height). heading in degrees.
  // northUp: top view keeps north up (true) or turns so the car points up (false).
  update(carPos, heading, dt, mode, groundAt, northUp = true) {
    const cam = this.camera;
    const h = heading * DEG;
    if (this.yaw === null) this.yaw = h;
    this.yaw = angleLerp(this.yaw, h, 1 - Math.exp(-dt * 4));
    const fx = Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);

    // Chase pose: behind and a little above, looking ahead down the road.
    const cp = this._cp.set(carPos.x - fx * CHASE.back, carPos.y + CHASE.up, carPos.z - fz * CHASE.back);
    cp.y = Math.max(cp.y, groundAt(cp.x, cp.z) + 1.3);
    const ct = this._ct.set(carPos.x + fx * CHASE.ahead, carPos.y + CHASE.lookUp, carPos.z + fz * CHASE.ahead);

    // Top pose: straight down, high enough to show ~200 m across.
    const aspect = cam.aspect;
    const tanHalf = Math.tan((TOP.fov / 2) * DEG);
    const topH = (TOP.width / 2) / (tanHalf * Math.max(1, aspect));
    const tp = this._tp.set(carPos.x, carPos.y + topH, carPos.z + 0.01);

    const want = mode === 'top' ? 1 : 0;
    this.blend += Math.sign(want - this.blend) * Math.min(Math.abs(want - this.blend), dt / 0.6);
    const e = this.blend * this.blend * (3 - 2 * this.blend);

    const desired = new THREE.Vector3().lerpVectors(cp, tp, e);
    const look = new THREE.Vector3().lerpVectors(ct, carPos, e);
    // Snap on the first frame or after a teleport, otherwise follow smoothly.
    if (this.first || this.pos.distanceToSquared(desired) > 80 * 80) {
      this.yaw = h;
      this.pos.copy(desired);
      this.target.copy(look);
      this.first = false;
    } else {
      // Follow tightly in top view, a bit springy in chase.
      const k = 1 - Math.exp(-dt * (e > 0.5 ? 20 : 9));
      this.pos.lerp(desired, k);
      this.target.lerp(look, k);
    }
    // Never sink into a hill.
    this.pos.y = Math.max(this.pos.y, groundAt(this.pos.x, this.pos.z) + 1.0);

    cam.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      cam.position.x += (Math.random() - 0.5) * this.shakeAmp * 2;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmp * 2;
    }
    // Top view "up" on screen: north, or the car's heading. Blend by angle so
    // toggling turns the view smoothly instead of flipping.
    const hu = northUp ? 0 : 1;
    this.headingUp += Math.sign(hu - this.headingUp) * Math.min(Math.abs(hu - this.headingUp), dt / 0.4);
    const upYaw = angleLerp(0, this.yaw, this.headingUp);
    cam.up.copy(this._up.set(Math.sin(upYaw) * e, 1 - e, -Math.cos(upYaw) * e).normalize());
    cam.lookAt(this.target);
    const fov = THREE.MathUtils.lerp(CHASE.fov, TOP.fov, e);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // Shadows: ahead of the car in chase, centred in top view.
    this.focus.set(carPos.x + fx * 35 * (1 - e), carPos.y, carPos.z + fz * 35 * (1 - e));
    this.shadowRadius = THREE.MathUtils.lerp(70, 115, e);
    return e;
  }
}
