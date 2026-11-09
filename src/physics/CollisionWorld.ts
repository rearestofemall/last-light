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
    let feet = Math.max(y, this.groundAt(x, hw));
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

  /** Highest terrain point under a body of half-width `hw` centred at x. */
  groundAt(x: number, hw: number): number {
    const t = this.terrain;
    return Math.max(t.heightAt(x - hw * 0.8), t.heightAt(x), t.heightAt(x + hw * 0.8));
  }
}
