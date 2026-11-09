import * as THREE from 'three';
import { Rng } from '../core/rng';
import { sharedUniforms } from './materials';

const rainVert = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uWind;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 seed = aSeed.xyz;
  float end = aSeed.w; // 0 = top of streak, 1 = bottom
  vec3 p = seed * uBox;
  float fall = uTime * (22.0 + seed.x * 6.0);
  p.y -= fall;
  p.x += fall * uWind * 0.35;
  vec3 lo = uCenter - uBox * 0.5;
  p = lo + mod(p - lo, uBox);
  p.y -= end * 0.7;
  p.x += end * uWind * 0.25;
  vA = 1.0 - end * 0.7;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const rainFrag = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4(uColor, uOpacity * vA); }`;

const snowVert = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uWind;
uniform float uPixelRatio;
uniform float uScale;
attribute vec3 aSeed;
void main() {
  vec3 p = aSeed * uBox;
  float t = uTime * (1.4 + aSeed.y * 1.2);
  p.y -= t;
  p.x += t * uWind * 2.5 + sin(uTime * 1.3 + aSeed.z * 30.0) * 0.6;
  p.z += cos(uTime * 0.9 + aSeed.x * 20.0) * 0.4;
  vec3 lo = uCenter - uBox * 0.5;
  p = lo + mod(p - lo, uBox);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (2.0 + aSeed.x * 3.5) * uPixelRatio * uScale;
}`;
const snowFrag = /* glsl */ `
uniform float uOpacity;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), smoothstep(0.5, 0.15, d) * uOpacity);
}`;

/** Rain streaks and snowflakes wrapped around the camera focus; entirely GPU-animated. */
export class WeatherFx {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private rainMat: THREE.ShaderMaterial;
  private snowMat: THREE.ShaderMaterial;
  private maxRain: number;
  private maxSnow: number;

  constructor(maxRain = 2400, maxSnow = 1600) {
    this.maxRain = maxRain;
    this.maxSnow = maxSnow;
    const rng = new Rng(77);
    const r = new Float32Array(maxRain * 2 * 4);
    for (let i = 0; i < maxRain; i++) {
      const x = rng.float();
      const y = rng.float();
      const z = rng.float();
      r.set([x, y, z, 0, x, y, z, 1], i * 8);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxRain * 2 * 3), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(r, 4));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: rainVert,
      fragmentShader: rainFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(36, 26, 36) },
        uWind: { value: 0.3 },
        uOpacity: { value: 0.35 },
        uColor: { value: new THREE.Color(0xc6d2dc) },
      },
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 20;

    const s = new Float32Array(maxSnow * 3);
    for (let i = 0; i < s.length; i++) s[i] = rng.float();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(s, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(s, 3));
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: snowVert,
      fragmentShader: snowFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(36, 26, 36) },
        uWind: { value: 0.3 },
        uOpacity: { value: 0.9 },
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
      },
    });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 20;
    this.group.add(this.rain, this.snow);
  }

  /** `budget` scales particle counts for the quality preset (0–1). */
  update(center: THREE.Vector3, rain: number, snow: number, wind: number, budget: number, pixelRatio: number, viewHeight: number, hidden: boolean): void {
    const rc = hidden ? 0 : Math.floor(this.maxRain * rain * budget);
    const sc = hidden ? 0 : Math.floor(this.maxSnow * snow * budget);
    this.rain.visible = rc > 0;
    this.snow.visible = sc > 0;
    this.rain.geometry.setDrawRange(0, rc * 2);
    this.snow.geometry.setDrawRange(0, sc);
    for (const m of [this.rainMat, this.snowMat]) {
      m.uniforms.uCenter.value.set(center.x, center.y + 4, center.z);
      m.uniforms.uWind.value = wind;
    }
    this.snowMat.uniforms.uPixelRatio.value = pixelRatio;
    this.snowMat.uniforms.uScale.value = 1.1 + 0 * viewHeight;
    this.rainMat.uniforms.uOpacity.value = 0.25 + rain * 0.2;
  }
}
