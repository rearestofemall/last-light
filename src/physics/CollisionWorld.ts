import type { Surface, Terrain } from '../world/Terrain';

export type ColliderKind = 'solid' | 'oneway';

/** Axis-aligned box in world space. */
export interface Collider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind: ColliderKind;
  surface: Surface;
  /** Optional tag so systems can identify what was hit (e.g. 'roof', 'build:…'). */
  tag?: string;
}

const BUCKET = 16;
/** Anything deeper than this below the terrain surface is an underground level. */
export const UNDERGROUND_DEPTH = 18;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Static collision geometry: the terrain heightfield plus a spatially hashed set of boxes.
 */
export class CollisionWorld {
  private buckets = new Map<number, Collider[]>();
  private stamp = 0;
  private marks = new WeakMap<Collider, number>();

  constructor(
    readonly terrain: Terrain,
    public bounds: Bounds,
  ) {}

  private key(bx: number, bz: number): number {
    return (bx + 4096) * 8192 + (bz + 4096);
  }

  add(c: Collider): Collider {
    for (let bx = Math.floor(c.minX / BUCKET); bx <= Math.floor(c.maxX / BUCKET); bx++) {
      for (let bz = Math.floor(c.minZ / BUCKET); bz <= Math.floor(c.maxZ / BUCKET); bz++) {
        const k = this.key(bx, bz);
        let list = this.buckets.get(k);
        if (!list) this.buckets.set(k, (list = []));
        list.push(c);
      }
    }
    return c;
  }

  remove(c: Collider): void {
    for (let bx = Math.floor(c.minX / BUCKET); bx <= Math.floor(c.maxX / BUCKET); bx++) {
      for (let bz = Math.floor(c.minZ / BUCKET); bz <= Math.floor(c.maxZ / BUCKET); bz++) {
        const list = this.buckets.get(this.key(bx, bz));
        if (!list) continue;
        const i = list.indexOf(c);
        if (i >= 0) list.splice(i, 1);
      }
    }
  }

  /** All colliders overlapping the XZ rectangle. */
  query(minX: number, maxX: number, minZ: number, maxZ: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const s = ++this.stamp;
    for (let bx = Math.floor(minX / BUCKET); bx <= Math.floor(maxX / BUCKET); bx++) {
      for (let bz = Math.floor(minZ / BUCKET); bz <= Math.floor(maxZ / BUCKET); bz++) {
        const list = this.buckets.get(this.key(bx, bz));
        if (!list) continue;
        for (const c of list) {
          if (this.marks.get(c) === s) continue;
          if (c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ) {
            this.marks.set(c, s);
            out.push(c);
          }
        }
      }
    }
    return out;
  }

  /**
   * Highest terrain point under a body footprint (radius r). Bodies far below the
   * surface (underground levels) ignore the terrain entirely.
   */
  groundAt(x: number, z: number, r: number, feetY?: number): number {
    const t = this.terrain;
    const k = r * 0.75;
    const h = Math.max(t.heightAt3(x, z), t.heightAt3(x - k, z), t.heightAt3(x + k, z), t.heightAt3(x, z - k), t.heightAt3(x, z + k));
    if (feetY !== undefined && feetY < h - UNDERGROUND_DEPTH) return -Infinity;
    return h;
  }

  /**
   * Highest walkable surface at a single point no higher than `maxY`: terrain (unless deep
   * underground) or the top of a box (floors, steps, rocks). Used to plant feet.
   */
  heightBelow(x: number, z: number, maxY: number): number {
    const t = this.terrain.heightAt3(x, z);
    let h = maxY < t - UNDERGROUND_DEPTH || t > maxY ? -Infinity : t;
    for (const c of this.query(x - 0.01, x + 0.01, z - 0.01, z + 0.01, this.probe)) {
      if (c.maxY <= maxY && c.maxY > h) h = c.maxY;
    }
    return h;
  }

  private probe: Collider[] = [];

  isUnderground(x: number, z: number, y: number): boolean {
    return y < this.terrain.heightAt3(x, z) - UNDERGROUND_DEPTH;
  }

  /** Lowest feet height ≥ y where a body is not inside terrain or a solid box. */
  resolveSpawnY(x: number, z: number, y: number, r: number, height: number): number {
    let feet = Math.max(y, this.groundAt(x, z, r, y));
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const c of this.query(x - r, x + r, z - r, z + r)) {
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
}
