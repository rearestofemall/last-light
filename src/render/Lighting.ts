import * as THREE from 'three';
import type { Atmosphere } from './Atmosphere';

/** Sun (shadow-casting), sky/ground hemisphere and a soft cool fill. */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fill: THREE.DirectionalLight;
  readonly group = new THREE.Group();
  private sunDir = new THREE.Vector3(0.5, 0.7, 0.5).normalize();
  private shadowSize = 2048;

  constructor() {
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -44;
    cam.right = 44;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.fill = new THREE.DirectionalLight(0x9fb4d0, 0.35);
    this.fill.position.set(-0.6, 0.4, 1).multiplyScalar(100);
    this.group.add(this.sun, this.sun.target, this.hemi, this.fill, this.fill.target);
  }

  setShadowMapSize(size: number): void {
    if (size === this.shadowSize) return;
    this.shadowSize = size;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  apply(a: Atmosphere): void {
    this.sun.color.copy(a.sunColor);
    this.sun.intensity = a.sunIntensity;
    this.sunDir.copy(a.sunDir);
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
  }

  /** Keep the shadow frustum centred on the focus, snapped to shadow texels to avoid shimmer. */
  update(focus: THREE.Vector3): void {
    const texel = (this.sun.shadow.camera.right - this.sun.shadow.camera.left) / this.shadowSize;
    const fx = Math.round(focus.x / texel) * texel;
    const fy = Math.round(focus.y / texel) * texel;
    this.sun.target.position.set(fx, fy, -8);
    this.sun.position.set(fx + this.sunDir.x * 150, fy + this.sunDir.y * 150, -8 + this.sunDir.z * 150);
    this.fill.target.position.set(fx, fy, 0);
    this.fill.position.set(fx - 60, fy + 40, 100);
  }
}
