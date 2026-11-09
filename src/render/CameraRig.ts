import * as THREE from 'three';
import { clamp, damp } from '../core/math';

export const CAMERA_PITCH = THREE.MathUtils.degToRad(9);
const DISTANCE = 140;

/**
 * Orthographic 2.5D camera. Looks at the gameplay plane from +Z, pitched down slightly
 * so the depth of the world is visible. Follows a target with look-ahead and smoothing.
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /** World-space point on the gameplay plane the camera is centred on. */
  readonly focus = new THREE.Vector3();
  viewHeight = 16.5;
  zoomTarget = 16.5;
  readonly minZoom = 11;
  readonly maxZoom = 28;
  /** Horizontal limits for the camera focus (world bounds). */
  bounds = { min: -Infinity, max: Infinity };
  private lookAhead = 0;
  private aspect = 16 / 9;
  private shake = 0;
  private shakeT = 0;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    this.applyProjection();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.applyProjection();
  }

  get viewWidth(): number {
    return this.viewHeight * this.aspect;
  }

  private applyProjection(): void {
    const h = this.viewHeight / 2;
    const w = h * this.aspect;
    const c = this.camera;
    c.left = -w;
    c.right = w;
    c.top = h;
    c.bottom = -h;
    c.updateProjectionMatrix();
  }

  zoom(steps: number): void {
    this.zoomTarget = clamp(this.zoomTarget + steps * 1.5, this.minZoom, this.maxZoom);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Jump straight to a target (no smoothing), e.g. after loading. */
  snapTo(x: number, y: number): void {
    this.lookAhead = 0;
    this.focus.set(this.clampX(x), y + 2.6, 0);
    this.applyTransform();
  }

  private clampX(x: number): number {
    const half = this.viewWidth / 2;
    const lo = this.bounds.min + half - 12;
    const hi = this.bounds.max - half + 12;
    return lo > hi ? (lo + hi) / 2 : clamp(x, lo, hi);
  }

  follow(dt: number, x: number, y: number, vx: number): void {
    this.lookAhead = damp(this.lookAhead, clamp(vx * 0.45, -3.5, 3.5), 2.2, dt);
    const tx = this.clampX(x + this.lookAhead);
    this.focus.x = damp(this.focus.x, tx, 6, dt);
    this.focus.y = damp(this.focus.y, y + 2.6, 4, dt);
    this.update(dt);
  }

  /** Free camera movement (menu attract mode). */
  pan(dt: number, x: number, y: number): void {
    this.focus.x = damp(this.focus.x, x, 0.8, dt);
    this.focus.y = damp(this.focus.y, y, 0.8, dt);
    this.update(dt);
  }

  private update(dt: number): void {
    if (Math.abs(this.viewHeight - this.zoomTarget) > 0.001) {
      this.viewHeight = damp(this.viewHeight, this.zoomTarget, 6, dt);
      this.applyProjection();
    }
    this.shakeT += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.applyTransform();
  }

  private applyTransform(): void {
    const s = this.shake * this.shake * 0.35;
    const ox = s * Math.sin(this.shakeT * 53);
    const oy = s * Math.sin(this.shakeT * 41 + 1.3);
    const f = this.focus;
    this.camera.position.set(f.x + ox, f.y + oy + Math.sin(CAMERA_PITCH) * DISTANCE, f.z + Math.cos(CAMERA_PITCH) * DISTANCE);
    this.camera.lookAt(f.x + ox, f.y + oy, f.z);
    this.camera.updateMatrixWorld();
  }
}
