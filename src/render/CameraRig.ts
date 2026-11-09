import * as THREE from 'three';
import { clamp, damp } from '../core/math';

/**
 * Third-person orbit camera. Mouse (pointer lock) controls yaw and pitch, the wheel
 * zooms, and the camera pulls in when terrain would come between it and the player.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Point the camera orbits (player head). */
  readonly focus = new THREE.Vector3();
  /** Horizontal angle; 0 = camera south of the player looking north (−z). */
  yaw = 0;
  pitch = 0.32;
  private liftedPitch = 0.32;
  distance = 7.5;
  zoomTarget = 7.5;
  readonly minZoom = 2.6;
  readonly maxZoom = 16;
  sensitivity = 0.0025;
  /** Height function for camera collision. */
  ground: ((x: number, z: number) => number) | null = null;
  /** Inside multi-storey buildings: keep the camera under this height. */
  ceiling: number | null = null;
  private shake = 0;
  private shakeT = 0;
  private aspect = 16 / 9;
  private smoothedDist = 7.5;
  /** Unused in 3D; kept for API compatibility with the 2.5D rig. */
  bounds = { min: -Infinity, max: Infinity };
  /** For fade/occlusion helpers. */
  get viewHeight(): number {
    return this.smoothedDist * 2;
  }

  constructor() {
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.25, 900);
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  get viewWidth(): number {
    return this.viewHeight * this.aspect;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch = clamp(this.pitch + dy * this.sensitivity, -0.35, 1.2);
  }

  zoom(steps: number): void {
    this.zoomTarget = clamp(this.zoomTarget + steps * 1.1, this.minZoom, this.maxZoom);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Unit vectors of the camera's heading on the ground plane. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  snapTo(x: number, y: number, z = 0): void {
    this.focus.set(x, y + 1.6, z);
    this.smoothedDist = this.distance = this.zoomTarget;
    this.apply(0);
  }

  follow(dt: number, x: number, y: number, z: number): void {
    this.focus.x = damp(this.focus.x, x, 14, dt);
    this.focus.z = damp(this.focus.z, z, 14, dt);
    this.focus.y = damp(this.focus.y, y + 1.6, 9, dt);
    this.distance = damp(this.distance, this.zoomTarget, 8, dt);
    this.apply(dt);
  }

  /** Slow cinematic orbit (main menu). */
  pan(dt: number, x: number, y: number, z = 0): void {
    this.yaw += dt * 0.03;
    this.focus.x = damp(this.focus.x, x, 0.8, dt);
    this.focus.y = damp(this.focus.y, y, 0.8, dt);
    this.focus.z = damp(this.focus.z, z, 0.8, dt);
    this.pitch = 0.18;
    this.distance = damp(this.distance, 16, 1, dt);
    this.apply(dt);
  }

  private apply(dt: number): void {
    this.shakeT += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const f = this.focus;
    // When terrain blocks the view, first try lifting the camera over it, then pull in.
    const blockAt = (pitch: number): number => {
      if (!this.ground) return -1;
      const c = Math.cos(pitch);
      const dx = Math.sin(this.yaw) * c;
      const dy = Math.sin(pitch);
      const dz = Math.cos(this.yaw) * c;
      for (let s = 0.6; s <= this.distance; s += 0.5) {
        if (f.y + dy * s < this.ground(f.x + dx * s, f.z + dz * s) + 0.4) return s;
      }
      return -1;
    };
    let pitch = this.pitch;
    let d = this.distance;
    let hit = blockAt(pitch);
    for (let k = 1; hit >= 0 && k <= 5; k++) {
      const p2 = Math.min(1.25, this.pitch + k * 0.12);
      if (blockAt(p2) < 0) {
        pitch = p2;
        hit = -1;
      }
    }
    if (hit >= 0) d = Math.max(0.6, hit - 0.5);
    this.liftedPitch = dt > 0 ? damp(this.liftedPitch, pitch, pitch > this.liftedPitch ? 10 : 3, dt) : pitch;
    const cp = Math.cos(this.liftedPitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.liftedPitch), Math.cos(this.yaw) * cp);
    this.smoothedDist = dt > 0 && d > this.smoothedDist ? damp(this.smoothedDist, d, 4, dt) : d;
    const s = this.shake * this.shake * 0.25;
    const ox = s * Math.sin(this.shakeT * 53);
    const oy = s * Math.sin(this.shakeT * 41 + 1.3);
    this.camera.position.set(f.x + dir.x * this.smoothedDist + ox, f.y + dir.y * this.smoothedDist + oy, f.z + dir.z * this.smoothedDist);
    // Keep the camera above ground even when pitched low.
    if (this.ground) {
      const g = this.ground(this.camera.position.x, this.camera.position.z) + 0.35;
      if (this.camera.position.y < g) this.camera.position.y = g;
    }
    if (this.ceiling !== null && this.camera.position.y > this.ceiling) this.camera.position.y = Math.max(this.ceiling, f.y - 0.6);
    this.camera.lookAt(f.x + ox, f.y + oy, f.z);
    this.camera.updateMatrixWorld();
  }
}
