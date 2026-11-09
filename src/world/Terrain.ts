import { Noise } from '../core/noise';
import { lerp, smoothstep } from '../core/math';
import { FLATTEN, REGIONS, RIDGES, RIVERS, type RiverDef, regionAt, regionWeight, SEA_Y } from './WorldDef';

/** Pseudo-river describing the sea (for water queries). */
const SEA_RIVER: RiverDef = { id: 'sea', x: 1400, width: 600, depth: 0, waterDepth: 0, bank: 0, salt: true };

export type Surface = 'grass' | 'dirt' | 'rock' | 'wood' | 'water' | 'snow' | 'sand' | 'metal' | 'ice';

export interface WaterSample {
  surfaceY: number;
  /** Water depth above the ground at this x. */
  depth: number;
  river: RiverDef;
}

/** Depth (z) at which the terrain mesh ends; beyond it, parallax layers take over. */
/** Half-width of the valley (z extent of the walkable world). */
export const VALLEY_HALF = 390;
/** Terrain is generated over this z range (mountains beyond the walkable land). */
export const TERRAIN_Z_MIN = -440;
export const TERRAIN_Z_MAX = 440;
/** The gorge between the woods and the city: a canyon across the whole map. */
export const GORGE = { x0: 437, x1: 451 };
/** The mountain ridge between the woods and the Frostlands; the only pass is at the road. */
export const PASS_RIDGE = { x0: -246, x1: -222, notch: 7 };
/** Half-width of the trail band that stays level (sites are built on it). */
export const PLANE_BAND = 4;

/**
 * The terrain heightfield of a long valley running west → east.
 *  - Along the trail (z ≈ 0) the profile equals `heightAt(x)`, which all sites are built on.
 *  - Away from the trail: rolling hills, then mountain walls that close the valley.
 *  - On the Drowned Coast the northern side falls away beneath the sea.
 * Pure function of the seed, so chunks can be generated in any order.
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

  /** Mountain walls that close the valley; lower on the coast's sea side. */
  private walls(x: number, z: number): number {
    const az = Math.abs(z);
    const k = smoothstep(VALLEY_HALF - 40, VALLEY_HALF + 30, az);
    if (k <= 0) return 0;
    const frost = regionWeight('frost', x, 80);
    const coastSea = z < 0 ? regionWeight('coast', x, 60) : 0;
    const h = (26 + 20 * this.d.fbm2(x * 0.012, z * 0.012, 3) + frost * 22) * (1 - coastSea);
    return k * h;
  }

  heightAt3(x: number, z: number): number {
    const az = Math.abs(z);
    // Authored cliff ridges are local landmarks near the road, not map-wide walls.
    const b = this.base(x) - this.ridge(x) * smoothstep(28, 80, az);
    const off = smoothstep(PLANE_BAND, PLANE_BAND + 18, az);
    const rel = this.relief(x);
    let h = b;
    h += off * rel * (2.8 * this.d.fbm2(x * 0.018, z * 0.02, 3) + 1.1 * this.d.fbm2(x * 0.07 + 9, z * 0.07, 2));
    h += 0.22 * this.d.fbm2(x * 0.21, z * 0.21, 2) * smoothstep(1.4, 3.5, az);
    h += this.walls(x, z);
    // Hills and valleys over the open land, growing away from the road.
    const far = smoothstep(20, 120, az);
    h += far * rel * 9 * this.d.fbm2(x * 0.006 + 40, z * 0.006, 3);
    // Border ridge to the Frostlands, notched where the road crosses.
    const ridge = smoothstep(PASS_RIDGE.x0, PASS_RIDGE.x0 + 6, x) * (1 - smoothstep(PASS_RIDGE.x1 - 6, PASS_RIDGE.x1, x));
    if (ridge > 0) h += ridge * 34 * smoothstep(PASS_RIDGE.notch, PASS_RIDGE.notch + 10, az);
    // The gorge.
    const g = smoothstep(GORGE.x0 - 1, GORGE.x0 + 2, x) * (1 - smoothstep(GORGE.x1 - 2, GORGE.x1 + 1, x));
    if (g > 0) h -= g * 22;
    // The coast's north shore drops beneath the sea.
    if (z < 0) {
      const coast = regionWeight('coast', x, 60);
      if (coast > 0) h -= coast * smoothstep(-24, -70, z) * 14;
    }
    for (const r of RIVERS) {
      const k = this.riverFactor(r, x, z);
      if (k > 0) {
        const bed = this.riverBedY(r) + 0.25 * this.d.noise2(x * 0.4, z * 0.4) * k;
        h = lerp(h, bed, k);
      }
    }
    return h;
  }

  /** Water surface height of a river (rivers are level across the valley). */
  riverWaterYAt(r: RiverDef, _z: number): number {
    return this.riverWaterY(r);
  }

  /** Ground height along the gameplay plane. */
  heightAt(x: number): number {
    return this.heightAt3(x, 0);
  }

  /** Signed slope (dy/dx) along the trail. */
  slopeAt(x: number, z = 0): number {
    return (this.heightAt3(x + 0.05, z) - this.heightAt3(x - 0.05, z)) / 0.1;
  }

  /** Steepness (gradient magnitude) at a point. */
  gradientAt(x: number, z: number): number {
    const e = 0.3;
    const dx = (this.heightAt3(x + e, z) - this.heightAt3(x - e, z)) / (2 * e);
    const dz = (this.heightAt3(x, z + e) - this.heightAt3(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  waterAt(x: number, z = 0): WaterSample | null {
    for (const r of RIVERS) {
      if (r.frozen || Math.abs(x - r.x) > r.width / 2 + r.bank + 10) continue;
      if (this.riverFactor(r, x, z) <= 0) continue;
      const surfaceY = this.riverWaterY(r);
      const ground = this.heightAt3(x, z);
      if (surfaceY > ground) return { surfaceY, depth: surfaceY - ground, river: r };
    }
    // The sea along the coast.
    if (z < -10 && regionWeight('coast', x, 60) > 0.2) {
      const ground = this.heightAt3(x, z);
      if (SEA_Y > ground) return { surfaceY: SEA_Y, depth: SEA_Y - ground, river: SEA_RIVER };
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

  surfaceAt(x: number, z = 0): Surface {
    if (this.waterAt(x, z)) return 'water';
    for (const r of RIVERS) if (this.riverFactor(r, x, z) > 0.25) return r.frozen ? 'ice' : 'sand';
    const reg = regionAt(x).id;
    if (reg === 'frost') return 'snow';
    const az = Math.abs(z);
    if (reg === 'city') return az < 5 ? 'rock' : 'grass';
    if (reg === 'coast') return az < 2 && this.pathAmount(x) > 0.3 ? 'sand' : this.heightAt3(x, z) < SEA_Y + 2 ? 'sand' : 'grass';
    if (this.onRidge(x) && az < 7) return 'rock';
    return az < 1.6 && this.pathAmount(x) > 0.5 ? 'dirt' : 'grass';
  }
}
