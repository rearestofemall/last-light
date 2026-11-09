import type * as THREE from 'three';
import { type Chunk, type ChunkBuilder, CHUNK_SIZE } from './ChunkBuilder';

/** Streams world chunks in and out around the camera, building at most one per frame. */
export class ChunkManager {
  private chunks = new Map<number, Chunk>();
  radius = 3;

  constructor(
    private parent: THREE.Object3D,
    private builder: ChunkBuilder,
    private limits: { min: number; max: number },
  ) {}

  private wanted(focusX: number): number[] {
    const c = Math.floor(focusX / CHUNK_SIZE);
    const lo = Math.floor((this.limits.min - 60) / CHUNK_SIZE);
    const hi = Math.floor((this.limits.max + 60) / CHUNK_SIZE);
    const out: number[] = [];
    for (let i = c - this.radius; i <= c + this.radius; i++) if (i >= lo && i <= hi) out.push(i);
    // Closest first
    return out.sort((a, b) => Math.abs(a - c) - Math.abs(b - c));
  }

  /** Synchronously ensure every chunk around focusX exists (loading screens). */
  buildAll(focusX: number): void {
    for (const i of this.wanted(focusX)) this.ensure(i);
    this.evict(focusX);
  }

  update(focusX: number): void {
    for (const i of this.wanted(focusX)) {
      if (!this.chunks.has(i)) {
        this.ensure(i);
        break;
      }
    }
    this.evict(focusX);
  }

  private ensure(i: number): void {
    if (this.chunks.has(i)) return;
    const chunk = this.builder.build(i);
    this.chunks.set(i, chunk);
    this.parent.add(chunk.group);
  }

  private evict(focusX: number): void {
    const c = Math.floor(focusX / CHUNK_SIZE);
    for (const [i, chunk] of this.chunks) {
      if (Math.abs(i - c) > this.radius + 1) {
        this.parent.remove(chunk.group);
        chunk.dispose();
        this.chunks.delete(i);
      }
    }
  }

  /** Drop everything (e.g. quality change); chunks rebuild on demand. */
  clear(): void {
    for (const chunk of this.chunks.values()) {
      this.parent.remove(chunk.group);
      chunk.dispose();
    }
    this.chunks.clear();
  }

  get loaded(): number {
    return this.chunks.size;
  }
}
