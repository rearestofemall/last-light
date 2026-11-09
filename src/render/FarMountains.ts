import * as THREE from 'three';
import { Noise } from '../core/noise';

/**
 * A ring of distant mountain silhouettes centred on the camera: the backdrop beyond the
 * streamed terrain. Higher and snowier to the west (the Frostlands), lower to the east
 * where the coast opens to the sea.
 */
export class FarMountains {
  readonly group = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;

  constructor(seed: number) {
    const noise = new Noise(seed + 501);
    const R = 560;
    const segs = 240;
    const pos: number[] = [];
    const col: number[] = [];
    const haze = new THREE.Color(0xc9cfc4);
    const rock = new THREE.Color(0x7d8ea0);
    const snow = new THREE.Color(0xeef2f6);
    const layer = (radius: number, amp: number, base: number, tint: number, snowy: boolean) => {
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const h = (a: number) => {
          // West (−x) is a = 3π/2; scale the range there.
          const west = Math.max(0, -Math.sin(a));
          const r = 1 - Math.abs(noise.noise2(Math.cos(a) * 3 + radius, Math.sin(a) * 3));
          return base + amp * (0.35 + 0.65 * r * r) * (0.7 + west * 0.9);
        };
        const p = (a: number, y: number) => [Math.sin(a) * radius, y, Math.cos(a) * radius];
        const h0 = h(a0);
        const h1 = h(a1);
        const top = rock.clone().lerp(haze, tint);
        const c = (y: number, hh: number) => {
          const k = Math.min(1, Math.max(0, (y - base + 40) / (hh - base + 40)));
          const out = haze.clone().lerp(top, k);
          if (snowy && y > base + amp * 0.75) out.lerp(snow, 0.7);
          return out;
        };
        const quad = [p(a0, base - 80), p(a1, base - 80), p(a1, h1), p(a0, base - 80), p(a1, h1), p(a0, h0)];
        const cols = [c(base - 80, h0), c(base - 80, h1), c(h1, h1), c(base - 80, h0), c(h1, h1), c(h0, h0)];
        for (const q of quad) pos.push(...q);
        for (const cc of cols) col.push(cc.r, cc.g, cc.b);
      }
    };
    layer(R + 80, 150, 10, 0.55, true);
    layer(R, 80, 0, 0.3, false);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -900;
    this.group.add(mesh);
  }

  update(cam: THREE.Vector3, groundY: number): void {
    this.group.position.set(cam.x, groundY - 20, cam.z);
  }

  setTint(c: THREE.Color): void {
    this.mat.color.copy(c);
  }
}
