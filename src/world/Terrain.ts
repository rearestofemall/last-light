import { Noise } from '../core/noise';
import { lerp, smoothstep } from '../core/math';
import { FLATTEN, REGIONS, RIDGES, RIVERS, type RiverDef, regionAt } from './WorldDef';

export type Surface = 'grass' | 'dirt' | 'rock' | 'wood' | 'water' | 'snow' | 'sand' | 'metal';

export interface WaterSample {
  surfaceY: number;
  /** Water depth above the ground at this x. */
  depth: number;
  river: RiverDef;
}

/** Depth (z) at which the terrain mesh ends; beyond it, parallax layers take over. */
export const TERRAIN_Z_BACK = -112;
export const TERRAIN_Z_FRONT = 38;
/** Half-width of the band around the gameplay plane that stays level in depth. */
export const PLANE_BAND = 4;

/**
 * The terrain heightfield.
 *  - `heightAt(x)` is the walkable profile along the gameplay plane (z = 0).
 *  - `heightAt3(x, z)` is the full 3D field used for the rendered landscape.
 * Both are pure functions of the seed, so chunks can be generated in any order.
 */
export class Terrain {
  private n: Noise;
  private d: Noise;

  private flattenRef: number[];

  constructor(readonly seed: number) {
    this.n = new Noise(seed);
    this.d = new Noise(seed ^ 0x5f3759df);
    this.flattenRef = FLATTEN.map((f) => this.raw(f.x) + (f.offset ?? 0));
  }

  /** Smoothly blended relief multiplier across region boundaries. */
  private relief(x: number): number {
    let acc = 0;
    let w = 0;
    for (const r of REGIONS) {
      const dist = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
      const k = 1 - smoothstep(0, 60, dist);
      acc += k * r.relief;
      w += k;
    }
    return w > 0 ? acc / w : regionAt(x).relief;
  }

  private raw(x: number): number {
    const n = this.n;
    const rel = this.relief(x);
    return rel * (5.5 * n.fbm1(x * 0.0055, 3) + 2.2 * n.fbm1(x * 0.024 + 100, 3)) + 0.3 * n.fbm1(x * 0.14 + 300, 2);
  }

  /** Authored ridges: a cliff to the west, plateau, gentle eastern descent. */
  private ridge(x: number): number {
    let h = 0;
    for (const r of RIDGES) {
      const up = smoothstep(r.x0, r.x0 + r.cliff, x);
      const down = 1 - smoothstep(r.x1, r.x1 + r.fade, x);
      h += r.height * up * down;
    }
    return h;
  }

  /** Profile along x after authored flattening; shared by every depth slice. */
  base(x: number): number {
    let h = this.raw(x);
    for (let i = 0; i < FLATTEN.length; i++) {
      const f = FLATTEN[i];
      const w = 1 - smoothstep(f.radius, f.radius + f.fade, Math.abs(x - f.x));
      if (w > 0) h = lerp(h, this.flattenRef[i], w);
    }
    return h + this.ridge(x);
  }

  private meander(r: RiverDef, z: number): number {
    return this.n.fbm1(z * 0.018 + r.x * 0.1, 2) * 9 * smoothstep(3, 24, Math.abs(z));
  }

  /** 0 outside the channel, 1 in the channel bed. */
  riverFactor(r: RiverDef, x: number, z: number): number {
    const d = Math.abs(x - r.x - this.meander(r, z));
    return 1 - smoothstep(r.width / 2 - 0.6, r.width / 2 + r.bank, d);
  }

  riverBedY(r: RiverDef): number {
    return this.base(r.x) - r.depth;
  }

  riverWaterY(r: RiverDef): number {
    return this.riverBedY(r) + r.waterDepth;
  }

  /**
   * Large-scale depth profile. Behind the plane the land falls away at roughly the camera's
   * view slope, so distant hills sit near a natural horizon instead of covering the sky.
   * In front, it gently descends towards the viewer.
   */
  profileOffset(z: number): number {
    const az = Math.abs(z);
    const band = smoothstep(PLANE_BAND, PLANE_BAND + 10, az);
    const dz = Math.max(0, az - PLANE_BAND);
    return band * (z < 0 ? -0.125 * dz : -0.055 * dz);
  }

  heightAt3(x: number, z: number): number {
    const az = Math.abs(z);
    const ridge = this.ridge(x);
    // Ridges run back into the hills and taper off towards the viewer.
    const b = this.base(x) - (z > 0 ? ridge * smoothstep(3, 18, z) : 0);
    const band = smoothstep(PLANE_BAND, PLANE_BAND + 10, az);
    let h = b + this.profileOffset(z);
    if (z < 0) {
      const dz = Math.max(0, az - PLANE_BAND);
      h += band * (2 + dz * 0.075) * this.d.fbm2(x * 0.022, z * 0.025, 3);
    } else {
      h += band * 0.8 * this.d.fbm2(x * 0.05, z * 0.05, 2);
    }
    h += 0.22 * this.d.fbm2(x * 0.21, z * 0.21, 2) * smoothstep(1.4, 3.5, az);
    for (const r of RIVERS) {
      const k = this.riverFactor(r, x, z);
      if (k > 0) {
        const bed = this.riverBedY(r) + this.profileOffset(z) + 0.25 * this.d.noise2(x * 0.4, z * 0.4) * k;
        h = lerp(h, bed, k);
      }
    }
    return h;
  }

  /** Water surface height of a river at depth z (rivers follow the depth profile). */
  riverWaterYAt(r: RiverDef, z: number): number {
    return this.riverWaterY(r) + this.profileOffset(z);
  }

  /** Ground height along the gameplay plane. */
  heightAt(x: number): number {
    return this.heightAt3(x, 0);
  }

  /** Signed slope (dy/dx) along the gameplay plane. */
  slopeAt(x: number): number {
    return (this.heightAt(x + 0.05) - this.heightAt(x - 0.05)) / 0.1;
  }

  waterAt(x: number): WaterSample | null {
    for (const r of RIVERS) {
      if (Math.abs(x - r.x) > r.width / 2 + r.bank) continue;
      const surfaceY = this.riverWaterY(r);
      const ground = this.heightAt(x);
      if (surfaceY > ground) return { surfaceY, depth: surfaceY - ground, river: r };
    }
    return null;
  }

  /** Low-frequency detail noise in [-1, 1] used for ground colouring. */
  colorNoise(x: number, z: number): number {
    return this.d.fbm2(x * 0.07 + 400, z * 0.07, 2);
  }

  /** 0 = open meadow, 1 = dense forest. */
  forestDensity(x: number): number {
    return smoothstep(-0.35, 0.35, this.n.fbm1(x * 0.018 + 900, 2));
  }

  /** Is the trail at this x worn dirt (vs grass)? Shared by rendering and footstep audio. */
  pathAmount(x: number): number {
    return smoothstep(-0.35, 0.1, this.d.fbm1(x * 0.045 + 50, 2));
  }

  onRidge(x: number): boolean {
    return RIDGES.some((r) => x > r.x0 + r.cliff * 0.5 && x < r.x1 + r.fade * 0.4);
  }

  surfaceAt(x: number): Surface {
    if (this.waterAt(x)) return 'water';
    for (const r of RIVERS) if (this.riverFactor(r, x, 0) > 0.25) return 'sand';
    const reg = regionAt(x).id;
    if (reg === 'frost') return 'snow';
    if (this.onRidge(x)) return 'rock';
    return this.pathAmount(x) > 0.5 ? 'dirt' : 'grass';
  }
}
