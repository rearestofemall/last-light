/// <reference lib="webworker" />
import { chunkBuffers, ChunkGenerator } from './chunkData';
import { Terrain } from './Terrain';
import { VegetationLibrary } from './vegetation';
import { WORLD_SEED } from './WorldDef';

/*
 * Background chunk generation. The world is deterministic, so this worker rebuilds the same
 * terrain and vegetation library from the seed and answers {id, i, j, densities} requests with
 * the chunk's typed arrays (transferred, not copied). The main thread never stalls on noise.
 */

const terrain = new Terrain(WORLD_SEED);
const generator = new ChunkGenerator(terrain, new VegetationLibrary(WORLD_SEED), { vegetationDensity: 1, grassDensity: 1 });

self.onmessage = (e: MessageEvent<{ id: number; i: number; j: number; lod: boolean; vegetationDensity: number; grassDensity: number }>) => {
  const { id, i, j, lod, vegetationDensity, grassDensity } = e.data;
  generator.profile = { vegetationDensity, grassDensity };
  const data = generator.generate(i, j, lod);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, i, j, lod, data }, chunkBuffers(data));
};
