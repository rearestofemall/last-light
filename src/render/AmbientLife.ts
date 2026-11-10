import * as THREE from 'three';
import { damp } from '../core/math';
import { Rng } from '../core/rng';
import { sharedUniforms } from './materials';

/*
 * Ambient life around the player, animated entirely on the GPU (one draw call each):
 *  - autumn leaves tumbling down and drifting with the wind
 *  - butterflies fluttering low over the ground on calm, warm days
 * Both wrap around the camera focus like the pollen motes.
 */

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uOn;
uniform float uLight;
attribute vec4 aSeed;
attribute vec3 aCol;
varying vec3 vCol;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
vec3 wrapBox(vec3 p) { vec3 lo = uCenter - uBox * 0.5; return lo + mod(p - lo, uBox); }
`;

const LEAF_VERT = /* glsl */ `${COMMON}
void main() {
  float t = uTime + aSeed.w * 100.0;
  vec3 p = aSeed.xyz * uBox;
  p += vec3(t * 0.5 * uWind + sin(t * 1.3 + aSeed.w * 20.0) * 0.7, -t * 0.75, cos(t * 0.9 + aSeed.x * 10.0) * 0.6);
  p = wrapBox(p);
  vec3 v = rotY(t * 2.7 + aSeed.w * 6.28) * rotX(t * 1.9 + aSeed.y * 6.0) * position * uOn;
  vCol = aCol * uLight;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + v, 1.0);
}`;

const FLY_VERT = /* glsl */ `${COMMON}
attribute float aWing;
void main() {
  float t = uTime * (0.8 + aSeed.w * 0.4) + aSeed.w * 50.0;
  vec3 base = wrapBox(aSeed.xyz * uBox);
  // Wandering loops near the ground; heading follows the path's direction.
  vec3 off = vec3(sin(t * 0.7) * 1.6 + sin(t * 1.7) * 0.4, sin(t * 2.3) * 0.25 + 0.3, cos(t * 0.5) * 1.6);
  vec3 vel = vec3(cos(t * 0.7) * 1.12 + cos(t * 1.7) * 0.68, 0.0, -sin(t * 0.5) * 0.8);
  float yaw = atan(vel.x, vel.z);
  float flap = sin(uTime * 22.0 + aSeed.w * 30.0) * 1.1;
  vec3 v = position;
  v = rotZ(aWing * flap) * v;
  v = rotY(yaw) * v * uOn;
  vCol = aCol * uLight;
  gl_Position = projectionMatrix * viewMatrix * vec4(base + off + v, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }`;

function material(vertex: string, box: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uWind: sharedUniforms.uWind,
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: box },
      uOn: { value: 0 },
      uLight: { value: 1 },
    },
  });
}

export class AmbientLife {
  readonly group = new THREE.Group();
  private leaves: THREE.InstancedMesh;
  private flies: THREE.InstancedMesh;
  private leafMat: THREE.ShaderMaterial;
  private flyMat: THREE.ShaderMaterial;
  private leafOn = 0;
  private flyOn = 0;

  constructor(leafCount = 160, flyCount = 14) {
    const rng = new Rng(777);
    // A leaf: a small diamond.
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.06, 0.035, 0, 0, 0, 0, 0.06, 0, 0, -0.06, 0, 0, 0.06, -0.035, 0, 0], 3));
    const leafInst = new THREE.InstancedBufferGeometry().copy(leafGeo as THREE.InstancedBufferGeometry);
    leafInst.instanceCount = leafCount;
    const seeds = new Float32Array(leafCount * 4);
    const cols = new Float32Array(leafCount * 3);
    const palette = [0xc8662e, 0xd99a34, 0xa8402a, 0xe0b848, 0x8a5a2a].map((h) => new THREE.Color(h));
    for (let i = 0; i < leafCount; i++) {
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rng.float();
      const c = rng.pick(palette);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    leafInst.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    leafInst.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
    this.leafMat = material(LEAF_VERT, new THREE.Vector3(36, 14, 36));
    this.leaves = new THREE.InstancedMesh(leafInst, this.leafMat, leafCount);
    this.leaves.frustumCulled = false;

    // A butterfly: two wings hinged on the body line.
    const w = 0.07;
    const pos: number[] = [];
    const wing: number[] = [];
    for (const s of [1, -1]) {
      pos.push(0, 0, 0.03, s * w, 0, 0.04, s * w * 0.9, 0, -0.03, 0, 0, 0.03, s * w * 0.9, 0, -0.03, 0, 0, -0.03);
      for (let k = 0; k < 6; k++) wing.push(s);
    }
    const flyInst = new THREE.InstancedBufferGeometry();
    flyInst.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    flyInst.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
    flyInst.instanceCount = flyCount;
    const fseeds = new Float32Array(flyCount * 4);
    const fcols = new Float32Array(flyCount * 3);
    const fpal = [0xf2e6a0, 0xf4f2ec, 0xe08a3a, 0x7ab0e8, 0xd8a0d8].map((h) => new THREE.Color(h));
    for (let i = 0; i < flyCount; i++) {
      for (let k = 0; k < 4; k++) fseeds[i * 4 + k] = rng.float();
      fseeds[i * 4 + 1] = rng.range(0, 0.25);
      const c = rng.pick(fpal);
      fcols.set([c.r, c.g, c.b], i * 3);
    }
    flyInst.setAttribute('aSeed', new THREE.InstancedBufferAttribute(fseeds, 4));
    flyInst.setAttribute('aCol', new THREE.InstancedBufferAttribute(fcols, 3));
    this.flyMat = material(FLY_VERT, new THREE.Vector3(30, 8, 30));
    this.flies = new THREE.InstancedMesh(flyInst, this.flyMat, flyCount);
    this.flies.frustumCulled = false;
    this.group.add(this.leaves, this.flies);
  }

  /**
   * @param leaves  0–1 how much leaf fall (autumn woods)
   * @param flies   0–1 how many butterflies (warm, calm daylight)
   * @param light   scene brightness for shading
   */
  update(dt: number, focus: THREE.Vector3, leaves: number, flies: number, light: number): void {
    this.leafOn = damp(this.leafOn, leaves, 0.6, dt);
    this.flyOn = damp(this.flyOn, flies, 0.8, dt);
    for (const [m, on, dy] of [
      [this.leafMat, this.leafOn, 3],
      [this.flyMat, this.flyOn, -1.2],
    ] as const) {
      m.uniforms.uCenter.value.set(focus.x, focus.y + dy, focus.z);
      m.uniforms.uOn.value = on;
      m.uniforms.uLight.value = light;
    }
    this.leaves.visible = this.leafOn > 0.02;
    this.flies.visible = this.flyOn > 0.02;
  }
}
