import * as THREE from 'three';
import { Noise } from '../core/noise';
import { Rng } from '../core/rng';
import { smoothstep } from '../core/math';
import { REGIONS } from '../world/WorldDef';

interface LayerDef {
  /** Distance in front of the camera. */
  depth: number;
  /** Fraction of camera movement the layer scrolls by (smaller = farther). */
  scroll: number;
  yBase: number;
  amp: number;
  freq: number;
  color: number;
  haze: number;
  snow: boolean;
  trees: boolean;
  /** Vertical parallax fraction. */
  yScroll: number;
}

const LAYERS: LayerDef[] = [
  { depth: 780, scroll: 0.035, yBase: -0.5, amp: 6.5, freq: 0.05, color: 0x8796ad, haze: 0xd2d5ca, snow: true, trees: false, yScroll: 0.02 },
  { depth: 740, scroll: 0.075, yBase: -2, amp: 4.5, freq: 0.06, color: 0x687f8f, haze: 0xc6cbbe, snow: false, trees: false, yScroll: 0.04 },
  { depth: 700, scroll: 0.14, yBase: -3, amp: 2.6, freq: 0.08, color: 0x4d6862, haze: 0xb6beaf, snow: false, trees: true, yScroll: 0.07 },
];

/** World x → how mountainous the backdrop is (high over the Frostlands, flat at the coast). */
function regionHeight(x: number): number {
  const weights: Record<string, number> = { frost: 1.7, woods: 1, city: 0.65, coast: 0.35 };
  let acc = 0;
  let w = 0;
  for (const r of REGIONS) {
    const d = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
    const k = 1 - smoothstep(0, 150, d);
    acc += k * weights[r.id];
    w += k;
  }
  return w > 0 ? acc / w : 1;
}

/**
 * Distant mountain and tree-line silhouettes. An orthographic camera has no natural parallax,
 * so these are camera-attached meshes that scroll at a fraction of the camera's movement.
 */
export class Parallax {
  readonly group = new THREE.Group();
  private layers: { mesh: THREE.Mesh; def: LayerDef; mat: THREE.MeshBasicMaterial }[] = [];

  constructor(seed: number, worldMin: number, worldMax: number) {
    const noise = new Noise(seed + 77);
    LAYERS.forEach((def, i) => {
      const geo = this.buildLayer(def, i, noise, worldMin, worldMax);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -def.depth;
      mesh.frustumCulled = false;
      mesh.renderOrder = -900 + i;
      this.group.add(mesh);
      this.layers.push({ mesh, def, mat });
    });
  }

  private buildLayer(def: LayerDef, index: number, noise: Noise, worldMin: number, worldMax: number): THREE.BufferGeometry {
    const uMin = worldMin * def.scroll - 80;
    const uMax = worldMax * def.scroll + 80;
    const step = def.trees ? 0.5 : 0.9;
    const positions: number[] = [];
    const colors: number[] = [];
    const top = new THREE.Color(def.color);
    const haze = new THREE.Color(def.haze);
    const snow = new THREE.Color(0xeef1f5);
    const bottomY = def.yBase - 40;
    const ridge = (v: number) => 1 - Math.abs(noise.noise2(v, index * 13.7));
    const profile = (u: number) => {
      const x = u / def.scroll;
      const f = def.freq;
      const r = 0.6 * ridge(u * f) ** 1.5 + 0.3 * ridge(u * f * 2.3 + 5) ** 2 + 0.1 * noise.noise2(u * f * 5.1, 3 + index);
      return def.yBase + def.amp * r * regionHeight(x);
    };
    const pushVert = (x: number, y: number, col: THREE.Color) => {
      positions.push(x, y, 0);
      colors.push(col.r, col.g, col.b);
    };
    const colorAt = (y: number, h: number) => {
      const t = smoothstep(bottomY + 30, h, y);
      const col = haze.clone().lerp(top, 0.25 + 0.75 * t);
      if (def.snow && y > def.yBase + def.amp * 0.62) col.lerp(snow, 0.75 * smoothstep(def.yBase + def.amp * 0.62, def.yBase + def.amp * 0.8, y));
      return col;
    };
    for (let u = uMin; u < uMax; u += step) {
      const h0 = profile(u);
      const h1 = profile(u + step);
      const c0 = colorAt(h0, h0);
      const c1 = colorAt(h1, h1);
      const cb = colorAt(bottomY, h0);
      pushVert(u, bottomY, cb);
      pushVert(u + step, bottomY, cb);
      pushVert(u + step, h1, c1);
      pushVert(u, bottomY, cb);
      pushVert(u + step, h1, c1);
      pushVert(u, h0, c0);
    }
    if (def.trees) {
      const rng = new Rng(seed32(index));
      const dark = top.clone().multiplyScalar(0.82);
      for (let u = uMin; u < uMax; u += rng.range(0.35, 1.1)) {
        const base = profile(u) - 0.4;
        const h = rng.range(0.9, 2.1);
        const w = h * rng.range(0.28, 0.4);
        const col = colorAt(base + h, base + h).lerp(dark, 0.5);
        pushVert(u - w, base, col);
        pushVert(u + w, base, col);
        pushVert(u, base + h, col);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }

  update(camX: number, camY: number): void {
    for (const l of this.layers) {
      l.mesh.position.x = -camX * l.def.scroll;
      l.mesh.position.y = -camY * l.def.yScroll;
    }
  }

  setTint(c: THREE.Color): void {
    for (const l of this.layers) l.mat.color.copy(c);
  }
}

function seed32(i: number): number {
  return 9137 + i * 7919;
}
