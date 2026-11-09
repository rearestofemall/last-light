import * as THREE from 'three';
import type { Atmosphere } from './Atmosphere';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform vec2 uSunPos;
uniform float uTime;
uniform float uScroll;
uniform float uAspect;
uniform float uCloudCover;
uniform float uHorizonY;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}

void main() {
  float y = vUv.y;
  float t = clamp((y - uHorizonY) / (1.0 - uHorizonY), 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.6));
  col = mix(uGround, col, smoothstep(uHorizonY - 0.15, uHorizonY + 0.03, y));

  vec2 p = vec2((vUv.x - 0.5) * uAspect, y);
  vec2 sp = vec2((uSunPos.x - 0.5) * uAspect, uSunPos.y);
  float d = length(p - sp);
  col += uSunColor * (0.22 * exp(-d * 2.5) + 0.45 * exp(-d * 12.0));
  col = mix(col, uSunColor * 1.5 + 0.25, smoothstep(0.036, 0.03, d));

  // Drifting cloud bank
  vec2 cp = vec2(p.x * 1.3 + uScroll + uTime * 0.006, (y - uHorizonY) * 3.2);
  float n = fbm(cp * vec2(1.1, 2.6) + vec2(0.0, uTime * 0.0015));
  float band = smoothstep(uHorizonY, uHorizonY + 0.2, y) * (1.0 - smoothstep(0.82, 1.08, y));
  float cl = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.22, n) * band;
  float shade = smoothstep(0.35, 0.85, fbm(cp * 2.0 + 3.0));
  vec3 cloud = mix(uCloudColor * 0.78, uCloudColor, shade) + uSunColor * 0.25 * exp(-d * 2.0);
  col = mix(col, cloud, cl * 0.9);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Full-screen sky backdrop rendered behind everything. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uCloudColor: { value: new THREE.Color() },
        uSunPos: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uAspect: { value: 1 },
        uCloudCover: { value: 0.4 },
        uHorizonY: { value: 0.42 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  apply(a: Atmosphere): void {
    const u = this.material.uniforms;
    u.uZenith.value.copy(a.zenith);
    u.uHorizon.value.copy(a.horizon);
    u.uGround.value.copy(a.fog);
    u.uSunColor.value.copy(a.sunColor).multiplyScalar(Math.min(1, a.sunIntensity / 2.7));
    u.uCloudColor.value.copy(a.cloudColor);
    u.uSunPos.value.copy(a.sunScreen);
    u.uCloudCover.value = a.cloudCover;
  }

  update(time: number, camX: number, aspect: number): void {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uScroll.value = camX * 0.0035;
    u.uAspect.value = aspect;
  }
}
