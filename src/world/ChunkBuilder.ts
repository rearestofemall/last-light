import * as THREE from 'three';
import type { QualityProfile } from '../core/Settings';
import { addWindSway, vertexColorMaterial } from '../render/materials';
import { groundDetail, stoneDetail } from '../render/surface';
import { type ChunkData, ChunkGenerator } from './chunkData';
import type { Terrain } from './Terrain';
import type { VegetationLibrary } from './vegetation';

export { CASTS, CHUNK_SIZE, KIND_MATERIAL } from './chunkData';

export interface Chunk {
  i: number;
  j: number;
  /** Built with low-detail trees (distant). */
  lod: boolean;
  group: THREE.Group;
  dispose(): void;
}

export interface ChunkMaterials {
  terrain: THREE.Material;
  skirt: THREE.Material;
  tree: THREE.Material;
  shrub: THREE.Material;
  grass: THREE.Material;
  solid: THREE.Material;
}

export function createChunkMaterials(standard: boolean): ChunkMaterials {
  const terrain = standard
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  groundDetail(terrain);
  const solid = vertexColorMaterial(standard);
  stoneDetail(solid);
  return {
    terrain,
    skirt: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    tree: addWindSway(vertexColorMaterial(standard), 0.0021, `tree-${standard}`, true, true),
    shrub: addWindSway(vertexColorMaterial(standard), 0.05, `shrub-${standard}`, true, true),
    grass: addWindSway(vertexColorMaterial(standard, { flat: false }), 0.3, `grass-${standard}`),
    solid,
  };
}

/**
 * Turns chunk data (generated here or in the chunk worker) into meshes: one terrain mesh and
 * a few merged vegetation meshes per chunk.
 */
export class ChunkBuilder {
  readonly generator: ChunkGenerator;

  constructor(
    terrain: Terrain,
    lib: VegetationLibrary,
    private materials: ChunkMaterials,
    private profile: QualityProfile,
  ) {
    this.generator = new ChunkGenerator(terrain, lib, profile);
  }

  setProfile(p: QualityProfile, materials: ChunkMaterials): void {
    this.profile = p;
    this.generator.profile = p;
    this.materials = materials;
  }

  get densities(): { vegetationDensity: number; grassDensity: number } {
    return { vegetationDensity: this.profile.vegetationDensity, grassDensity: this.profile.grassDensity };
  }

  /** Synchronous build on the main thread (preloading, or without workers). */
  build(i: number, j: number, lod = false): Chunk {
    return this.fromData(i, j, this.generator.generate(i, j, lod), lod);
  }

  fromData(i: number, j: number, d: ChunkData, lod = false): Chunk {
    const group = new THREE.Group();
    group.name = `chunk-${i}-${j}`;
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(d.terrain.pos, 3));
    tGeo.setAttribute('normal', new THREE.BufferAttribute(d.terrain.nor, 3));
    tGeo.setAttribute('color', new THREE.BufferAttribute(d.terrain.col, 3));
    tGeo.setIndex(new THREE.BufferAttribute(d.terrain.index, 1));
    tGeo.computeBoundingSphere();
    const tMesh = new THREE.Mesh(tGeo, this.materials.terrain);
    tMesh.receiveShadow = true;
    group.add(tMesh);
    const meshes: THREE.Mesh[] = [];
    for (const v of d.veg) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(v.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(v.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(v.col, 3));
      g.setAttribute('aH', new THREE.BufferAttribute(v.h, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(v.ph, 1));
      g.computeBoundingSphere();
      const mat = v.key === 'ground' ? this.materials.grass : this.materials[v.key as keyof ChunkMaterials];
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = v.cast;
      mesh.receiveShadow = v.key !== 'ground';
      mesh.name = v.key;
      meshes.push(mesh);
      group.add(mesh);
    }
    group.updateMatrixWorld(true);
    group.traverse((o) => (o.matrixAutoUpdate = false));
    return {
      i,
      j,
      lod,
      group,
      dispose: () => {
        tGeo.dispose();
        for (const m of meshes) m.geometry.dispose();
      },
    };
  }
}
