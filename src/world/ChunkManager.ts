import type * as THREE from 'three';
import { type Chunk, type ChunkBuilder, CHUNK_SIZE } from './ChunkBuilder';
import { TERRAIN_Z_MAX, TERRAIN_Z_MIN } from './Terrain';

/** Streams a ring of world chunks around the camera, building a few per frame. */
export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  radius = 3;
  /** Chunks built per frame while streaming. */
  perFrame = 1;
  /** Hooks for content that streams in a tighter ring around the player (resource nodes). */
  onLoad: (i: number, j: number) => void = () => {};
  onUnload: (i: number, j: number) => void = () => {};
  /** Radius (in chunks) of the near ring: resource nodes and ground cover. */
  nearRadius = 1.6;
  private near = new Set<string>();

  constructor(
    private parent: THREE.Object3D,
    private builder: ChunkBuilder,
    private limits: { min: number; max: number },
  ) {}

  private wanted(fx: number, fz: number): [number, number][] {
    const ci = Math.floor(fx / CHUNK_SIZE);
    const cj = Math.floor(fz / CHUNK_SIZE);
    const iLo = Math.floor((this.limits.min - 60) / CHUNK_SIZE);
    const iHi = Math.floor((this.limits.max + 60) / CHUNK_SIZE);
    const jLo = Math.floor(TERRAIN_Z_MIN / CHUNK_SIZE);
    const jHi = Math.floor((TERRAIN_Z_MAX - 1) / CHUNK_SIZE);
    const out: [number, number][] = [];
    const R = this.radius;
    for (let i = ci - R; i <= ci + R; i++) {
      for (let j = cj - R; j <= cj + R; j++) {
        if (i < iLo || i > iHi || j < jLo || j > jHi) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > (R + 0.5) ** 2) continue;
        out.push([i, j]);
      }
    }
    return out.sort((a, b) => (a[0] - ci) ** 2 + (a[1] - cj) ** 2 - ((b[0] - ci) ** 2 + (b[1] - cj) ** 2));
  }

  buildAll(fx: number, fz: number): void {
    for (const [i, j] of this.wanted(fx, fz)) this.ensure(i, j);
    this.evict(fx, fz);
  }

  update(fx: number, fz: number): void {
    let built = 0;
    for (const [i, j] of this.wanted(fx, fz)) {
      if (built >= this.perFrame) break;
      if (!this.chunks.has(`${i},${j}`)) {
        this.ensure(i, j);
        built++;
      }
    }
    this.evict(fx, fz);
  }

  private ensure(i: number, j: number): void {
    const k = `${i},${j}`;
    if (this.chunks.has(k)) return;
    const chunk = this.builder.build(i, j);
    this.chunks.set(k, chunk);
    this.parent.add(chunk.group);
  }

  /** Near-ring bookkeeping: ground cover visibility and resource streaming. */
  private updateNear(fx: number, fz: number): void {
    const cx = fx / CHUNK_SIZE - 0.5;
    const cz = fz / CHUNK_SIZE - 0.5;
    const R2 = this.nearRadius * this.nearRadius;
    for (const [k, chunk] of this.chunks) {
      const d2 = (chunk.i - cx) ** 2 + (chunk.j - cz) ** 2;
      const isNear = d2 <= R2;
      const ground = chunk.group.getObjectByName('ground');
      if (ground) ground.visible = d2 <= (this.nearRadius + 0.6) ** 2;
      if (isNear && !this.near.has(k)) {
        this.near.add(k);
        this.onLoad(chunk.i, chunk.j);
      }
    }
    for (const k of [...this.near]) {
      const chunk = this.chunks.get(k);
      const [i, j] = k.split(',').map(Number);
      const d2 = (i - cx) ** 2 + (j - cz) ** 2;
      if (!chunk || d2 > (this.nearRadius + 0.7) ** 2) {
        this.near.delete(k);
        this.onUnload(i, j);
      }
    }
  }

  private evict(fx: number, fz: number): void {
    this.updateNear(fx, fz);
    const ci = Math.floor(fx / CHUNK_SIZE);
    const cj = Math.floor(fz / CHUNK_SIZE);
    const R = this.radius + 1.5;
    for (const [k, chunk] of this.chunks) {
      if ((chunk.i - ci) ** 2 + (chunk.j - cj) ** 2 > R * R) {
        this.parent.remove(chunk.group);
        chunk.dispose();
        this.chunks.delete(k);
      }
    }
  }

  clear(): void {
    for (const chunk of this.chunks.values()) {
      this.parent.remove(chunk.group);
      chunk.dispose();
    }
    this.chunks.clear();
    for (const k of this.near) {
      const [i, j] = k.split(',').map(Number);
      this.onUnload(i, j);
    }
    this.near.clear();
  }

  get loaded(): number {
    return this.chunks.size;
  }
}
