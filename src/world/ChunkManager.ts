import type * as THREE from 'three';
import { type Chunk, type ChunkBuilder, CHUNK_SIZE } from './ChunkBuilder';
import type { ChunkData } from './chunkData';
import { TERRAIN_Z_MAX, TERRAIN_Z_MIN } from './Terrain';

/**
 * Streams a ring of world chunks around the camera. Chunks are generated on a background
 * worker and turned into meshes at most one per frame, so walking never stalls the game.
 */
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

  /** Chunks farther than this (in chunks) use low-detail trees. */
  lodRadius = 1.8;
  /** Small ground cover (grass, flowers, ferns) is drawn within this radius (in chunks). */
  groundRadius = 1.25;

  private wantsLod(i: number, j: number, fx: number, fz: number): boolean {
    const ci = fx / CHUNK_SIZE - 0.5;
    const cj = fz / CHUNK_SIZE - 0.5;
    return (i - ci) ** 2 + (j - cj) ** 2 > this.lodRadius * this.lodRadius;
  }

  buildAll(fx: number, fz: number): void {
    for (const [i, j] of this.wanted(fx, fz)) {
      const lod = this.wantsLod(i, j, fx, fz);
      const c = this.chunks.get(`${i},${j}`);
      if (!c) this.add(i, j, this.builder.build(i, j, lod));
      else if (c.lod && !lod) this.replace(i, j, this.builder.build(i, j, false));
    }
    this.evict(fx, fz);
  }

  update(fx: number, fz: number): void {
    // Integrate one finished chunk per frame (new, or a detail upgrade of a nearby one).
    const ready = this.arrived.shift();
    let changed = false;
    if (ready) {
      const k = `${ready.i},${ready.j}`;
      const have = this.chunks.get(k);
      if (!have) {
        this.add(ready.i, ready.j, this.builder.fromData(ready.i, ready.j, ready.data, ready.lod));
        changed = true;
      } else if (have.lod && !ready.lod) {
        this.replace(ready.i, ready.j, this.builder.fromData(ready.i, ready.j, ready.data, false));
        changed = true;
      }
    }
    // The bookkeeping below only matters once the focus moves or chunks change.
    const moved = Math.abs(fx - this.lastFx) > 1.5 || Math.abs(fz - this.lastFz) > 1.5;
    if (!moved && !changed && !this.missing && this.arrived.length === 0) return;
    this.lastFx = fx;
    this.lastFz = fz;
    this.missing = false;
    let built = 0;
    for (const [i, j] of this.wanted(fx, fz)) {
      const k = `${i},${j}`;
      const have = this.chunks.get(k);
      const lod = this.wantsLod(i, j, fx, fz);
      if (have && (lod || !have.lod)) continue;
      this.missing = true;
      if (this.pending.has(k)) continue;
      if (this.worker) {
        if (this.pending.size >= 2) break;
        this.request(i, j, lod);
      } else {
        if (built >= this.perFrame) break;
        if (have) this.replace(i, j, this.builder.build(i, j, false));
        else this.add(i, j, this.builder.build(i, j, lod));
        built++;
      }
    }
    this.evict(fx, fz);
  }

  private lastFx = Infinity;
  private lastFz = Infinity;
  /** Some wanted chunk is not built (or not detailed enough) yet: keep checking. */
  private missing = true;

  // ---- background generation ----
  private worker: Worker | null = null;
  private pending = new Set<string>();
  private arrived: { i: number; j: number; lod: boolean; data: ChunkData }[] = [];
  private generation = 0;
  private reqId = 0;
  private reqGen = new Map<number, number>();

  /** Use a worker for chunk generation (falls back to the main thread if it fails). */
  enableWorker(): void {
    if (this.worker || typeof Worker === 'undefined') return;
    try {
      const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; i: number; j: number; lod: boolean; data: ChunkData }>) => {
        const { id, i, j, lod, data } = e.data;
        this.pending.delete(`${i},${j}`);
        if (this.reqGen.get(id) !== this.generation) return;
        this.reqGen.delete(id);
        this.arrived.push({ i, j, lod, data });
      };
      w.onerror = (err) => {
        console.warn('[chunks] worker failed, building on the main thread', err.message);
        w.terminate();
        this.worker = null;
        this.pending.clear();
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  private request(i: number, j: number, lod: boolean): void {
    const id = ++this.reqId;
    this.reqGen.set(id, this.generation);
    this.pending.add(`${i},${j}`);
    this.worker!.postMessage({ id, i, j, lod, ...this.builder.densities });
  }

  private add(i: number, j: number, chunk: Chunk): void {
    this.chunks.set(`${i},${j}`, chunk);
    this.parent.add(chunk.group);
  }

  /** Swap a chunk for a rebuilt one (detail upgrade); ground-cover visibility carries over. */
  private replace(i: number, j: number, chunk: Chunk): void {
    const k = `${i},${j}`;
    const old = this.chunks.get(k);
    if (old) {
      const og = old.group.getObjectByName('ground');
      const ng = chunk.group.getObjectByName('ground');
      if (og && ng) ng.visible = og.visible;
      this.parent.remove(old.group);
      old.dispose();
    }
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
      if (ground) ground.visible = d2 <= this.groundRadius ** 2;
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
    // Results still in flight belong to the old settings: drop them.
    this.generation++;
    this.arrived = [];
    this.missing = true;
    this.lastFx = Infinity;
    this.pending.clear();
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
