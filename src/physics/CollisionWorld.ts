import type { Surface, Terrain } from '../world/Terrain';

export type ColliderKind = 'solid' | 'oneway';

/** Axis-aligned box in the gameplay (XY) plane. */
export interface Collider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  kind: ColliderKind;
  surface: Surface;
  /** Optional tag so systems can identify what was hit (e.g. 'blockade:west'). */
  tag?: string;
}

const BUCKET = 16;
/** Anything deeper than this below the terrain surface is an underground level. */
export const UNDERGROUND_DEPTH = 18;

/**
 * Static collision geometry: the terrain profile plus a spatially-hashed set of boxes.
 * Everything here is 2D: only objects that straddle the gameplay plane register colliders.
 */
export class CollisionWorld {
  private buckets = new Map<number, Collider[]>();

  constructor(
    readonly terrain: Terrain,
    public bounds: { min: number; max: number },
  ) {}

  add(c: Collider): Collider {
    const b0 = Math.floor(c.minX / BUCKET);
    const b1 = Math.floor(c.maxX / BUCKET);
    for (let b = b0; b <= b1; b++) {
      let list = this.buckets.get(b);
      if (!list) this.buckets.set(b, (list = []));
      list.push(c);
    }
    return c;
  }

  remove(c: Collider): void {
    const b0 = Math.floor(c.minX / BUCKET);
    const b1 = Math.floor(c.maxX / BUCKET);
    for (let b = b0; b <= b1; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
  }

  /** All colliders whose x-range overlaps [minX, maxX]. */
  query(minX: number, maxX: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const b0 = Math.floor(minX / BUCKET);
    const b1 = Math.floor(maxX / BUCKET);
    for (let b = b0; b <= b1; b++) {
      const list = this.buckets.get(b);
      if (!list) continue;
      for (const c of list) {
        if (c.maxX > minX && c.minX < maxX && !out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  /**
   * Lowest feet height at or above `y` where a body at x is not inside terrain or a solid box.
   * Used when placing the player (spawn, load) so they never start embedded in a floor.
   */
  resolveSpawnY(x: number, y: number, hw: number, height: number): number {
    let feet = Math.max(y, this.groundAt(x, hw, y));
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const c of this.query(x - hw, x + hw)) {
        if (c.kind !== 'solid') continue;
        if (feet < c.maxY && feet + height > c.minY) {
          feet = c.maxY;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return feet;
  }

  /**
   * Highest terrain point under a body of half-width `hw` centred at x.
   * Bodies far below the surface (underground levels) ignore the terrain entirely.
   */
  groundAt(x: number, hw: number, feetY?: number): number {
    const t = this.terrain;
    const h = Math.max(t.heightAt(x - hw * 0.8), t.heightAt(x), t.heightAt(x + hw * 0.8));
    if (feetY !== undefined && feetY < h - UNDERGROUND_DEPTH) return -Infinity;
    return h;
  }

  /** True when y is in an underground level beneath the terrain at x. */
  isUnderground(x: number, y: number): boolean {
    return y < this.terrain.heightAt(x) - UNDERGROUND_DEPTH;
  }
}
