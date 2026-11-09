import * as THREE from 'three';
import { Rng } from '../core/rng';
import { sharedUniforms } from './materials';

const vert = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uSize;
uniform float uPixelRatio;
uniform float uScale;
attribute vec3 aSeed;
varying float vAlpha;
void main() {
  vec3 p = aSeed * uBox;
  p += vec3(uTime * 0.22 + sin(uTime * 0.5 + aSeed.y * 20.0) * 0.8,
            sin(uTime * 0.7 + aSeed.x * 30.0) * 0.5 - uTime * 0.06,
            cos(uTime * 0.4 + aSeed.z * 10.0) * 0.5);
  vec3 lo = uCenter - uBox * 0.5;
  p = lo + mod(p - lo, uBox);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * uScale * (0.45 + aSeed.x);
  vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed.y * 50.0));
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
}`;

/** Drifting motes of pollen and dust in the sunlight, wrapped around the camera focus. */
export class Particles {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(count: number) {
    const rng = new Rng(4242);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng.float();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(56, 24, 30) },
        uSize: { value: 5 },
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uColor: { value: new THREE.Color(0xfff0c8) },
        uOpacity: { value: 0.55 },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Pollen by day becomes faint fireflies at night. */
  setNight(darkness: number): void {
    const u = this.material.uniforms;
    u.uColor.value.setRGB(1, 0.94 - darkness * 0.1, 0.78 - darkness * 0.35);
    u.uOpacity.value = 0.5 + darkness * 0.5;
    u.uSize.value = 5 + darkness * 2;
  }

  setCount(count: number): void {
    this.points.geometry.setDrawRange(0, count);
  }

  update(center: THREE.Vector3, pixelRatio: number, viewHeight: number): void {
    const u = this.material.uniforms;
    u.uCenter.value.set(center.x, center.y + 2, -4);
    u.uPixelRatio.value = pixelRatio;
    u.uScale.value = 20 / viewHeight;
  }
}
