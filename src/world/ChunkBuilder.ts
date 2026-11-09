import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import { hashSeed, Rng } from '../core/rng';
import type { QualityProfile } from '../core/Settings';
import { addWindSway, vertexColorMaterial } from '../render/materials';
import { type Terrain, TERRAIN_Z_BACK, TERRAIN_Z_FRONT } from './Terrain';
import type { VegetationLibrary, VegKind } from './vegetation';
import { CLEARINGS, regionAt, RIVERS } from './WorldDef';

export const CHUNK_SIZE = 48;

/** Depth rows of the terrain mesh: dense near the gameplay plane, sparse far away. */
const Z_ROWS = [
  TERRAIN_Z_FRONT, 32, 27, 23, 19.5, 16.5, 14, 11.5, 9.5, 7.5, 6, 4.5, 3.2, 2, 1, 0, -1, -2, -3.2, -4.5, -6, -7.5, -9.5, -12, -15, -18.5,
  -22.5, -27, -32, -38, -45, -53, -62, -72, -83, -96, TERRAIN_Z_BACK,
];
const SKIRT_DEPTH = 34;

export interface Chunk {
  index: number;
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
  return {
    terrain,
    skirt: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    tree: addWindSway(vertexColorMaterial(standard), 0.0021, `tree-${standard}`),
    shrub: addWindSway(vertexColorMaterial(standard), 0.05, `shrub-${standard}`),
    grass: addWindSway(vertexColorMaterial(standard, { flat: false }), 0.3, `grass-${standard}`),
    solid: vertexColorMaterial(standard),
  };
}

const KIND_MATERIAL: Record<VegKind, keyof ChunkMaterials> = {
  pine: 'tree',
  broadleaf: 'tree',
  birch: 'tree',
  dead: 'tree',
  bush: 'shrub',
  fern: 'shrub',
  grass: 'grass',
  flowers: 'grass',
  rock: 'solid',
  log: 'solid',
  stump: 'solid',
};

const CASTS: Record<VegKind, boolean> = {
  pine: true,
  broadleaf: true,
  birch: true,
  dead: true,
  bush: true,
  fern: false,
  grass: false,
  flowers: false,
  rock: true,
  log: true,
  stump: true,
};

interface Placement {
  kind: VegKind;
  variant: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();

/** Builds the meshes for one streamed slice of the world. */
export class ChunkBuilder {
  constructor(
    private terrain: Terrain,
    private lib: VegetationLibrary,
    private materials: ChunkMaterials,
    private profile: QualityProfile,
  ) {}

  setProfile(p: QualityProfile, materials: ChunkMaterials): void {
    this.profile = p;
    this.materials = materials;
  }

  build(index: number): Chunk {
    const group = new THREE.Group();
    group.name = `chunk-${index}`;
    const x0 = index * CHUNK_SIZE;
    const geos: THREE.BufferGeometry[] = [];

    const tGeo = this.buildTerrain(x0);
    geos.push(tGeo);
    const tMesh = new THREE.Mesh(tGeo, this.materials.terrain);
    tMesh.receiveShadow = true;
    group.add(tMesh);

    const sGeo = this.buildSkirt(x0);
    geos.push(sGeo);
    group.add(new THREE.Mesh(sGeo, this.materials.skirt));

    const meshes = this.buildVegetation(index, x0);
    for (const m of meshes) group.add(m);

    return {
      index,
      group,
      dispose: () => {
        for (const g of geos) g.dispose();
        for (const m of meshes) m.dispose();
      },
    };
  }

  private terrainColor(x: number, z: number, ny: number, out: THREE.Color): THREE.Color {
    const t = this.terrain;
    const pal = regionAt(x).palette;
    const n = t.colorNoise(x, z);
    out.setHex(pal.grass).lerp(tmpColor.setHex(pal.grassDry), smoothstep(-0.15, 0.7, n));
    // Shaded forest floor further back
    if (z < -6) out.multiplyScalar(lerp(1, 0.82, smoothstep(-6, -30, z)));
    const az = Math.abs(z);
    const path = t.pathAmount(x) * (1 - smoothstep(0.7, 1.9, az + n * 0.4));
    if (path > 0) out.lerp(tmpColor.setHex(pal.dirt), path);
    if (t.onRidge(x) && az < 7) out.lerp(tmpColor.setHex(pal.rock), 0.45 * (1 - smoothstep(3, 7, az)));
    const rockK = smoothstep(0.84, 0.6, ny);
    if (rockK > 0) out.lerp(tmpColor.setHex(pal.rock), rockK);
    let rf = 0;
    for (const r of RIVERS) rf = Math.max(rf, t.riverFactor(r, x, z));
    if (rf > 0) {
      out.lerp(tmpColor2.setHex(0x6f6a4c), smoothstep(0.45, 0.7, rf));
      out.lerp(tmpColor2.setHex(0x3a3a2c), smoothstep(0.75, 1, rf));
    }
    return out;
  }

  private buildTerrain(x0: number): THREE.BufferGeometry {
    const t = this.terrain;
    const cols = CHUNK_SIZE + 1;
    const rows = Z_ROWS.length;
    const pos = new Float32Array(cols * rows * 3);
    const nor = new Float32Array(cols * rows * 3);
    const col = new Float32Array(cols * rows * 3);
    const c = new THREE.Color();
    const e = 0.5;
    for (let j = 0; j < rows; j++) {
      const z = Z_ROWS[j];
      for (let i = 0; i < cols; i++) {
        const x = x0 + i;
        const h = t.heightAt3(x, z);
        const k = (j * cols + i) * 3;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
        const dx = (t.heightAt3(x + e, z) - t.heightAt3(x - e, z)) / (2 * e);
        const dz = (t.heightAt3(x, z + e) - t.heightAt3(x, z - e)) / (2 * e);
        const len = Math.hypot(dx, 1, dz);
        nor[k] = -dx / len;
        nor[k + 1] = 1 / len;
        nor[k + 2] = -dz / len;
        this.terrainColor(x, z, 1 / len, c);
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        const b = a + cols;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  /** Cross-section of earth along the front edge, so the world reads as a diorama. */
  private buildSkirt(x0: number): THREE.BufferGeometry {
    const t = this.terrain;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const z = TERRAIN_Z_FRONT;
    const strata = [0x4a3826, 0x3d2f22, 0x463a2e, 0x36302a, 0x2c2723];
    const c = new THREE.Color();
    const bands = 6;
    for (let i = 0; i <= CHUNK_SIZE; i++) {
      const x = x0 + i;
      const top = t.heightAt3(x, z);
      for (let b = 0; b <= bands; b++) {
        const f = b / bands;
        const y = top - f * f * SKIRT_DEPTH;
        c.setHex(strata[Math.min(strata.length - 1, Math.floor(f * strata.length + t.colorNoise(x, b) * 0.6))]);
        c.multiplyScalar(1 - f * 0.35);
        pos.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
    }
    const per = bands + 1;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      for (let b = 0; b < bands; b++) {
        const a = i * per + b;
        idx.push(a, a + 1, a + per, a + 1, a + per + 1, a + per);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  private blocked(x: number, z: number, big: boolean): boolean {
    for (const r of RIVERS) if (this.terrain.riverFactor(r, x, z) > (big ? 0.02 : 0.35)) return true;
    for (const c of CLEARINGS) {
      if (Math.abs(x - c.x) < c.radius && z > (big ? c.zBack : -5)) return true;
    }
    return false;
  }

  private buildVegetation(index: number, x0: number): THREE.InstancedMesh[] {
    const t = this.terrain;
    const rng = new Rng(hashSeed(t.seed, index, 7));
    const p = this.profile;
    const list: Placement[] = [];
    const add = (kind: VegKind, x: number, z: number, scale: number, sink = 0.05) => {
      const variants = this.lib.variants[kind].length;
      list.push({ kind, variant: rng.int(0, variants - 1), x, y: t.heightAt3(x, z) - sink, z, scale, rot: rng.range(0, Math.PI * 2) });
    };
    const rx = () => x0 + rng.float() * CHUNK_SIZE;

    // Trees, behind the gameplay plane.
    // Forest density varies along the trail: dense stands alternate with open meadows where
    // the sky and distant ranges show through. Near the plane, trees are sparser and smaller
    // so the player stays readable against the background.
    const nTrees = Math.round(250 * p.vegetationDensity);
    for (let i = 0; i < nTrees; i++) {
      const x = rx();
      const z = -3.3 - rng.float() * (Math.abs(TERRAIN_Z_BACK) - 6);
      const density = 0.25 + 0.75 * t.forestDensity(x);
      const depthKeep = z > -9 ? 0.3 : z > -18 ? 0.6 : 1;
      if (!rng.chance(density * depthKeep)) continue;
      if (this.blocked(x, z, true)) continue;
      const roll = rng.float();
      const kind: VegKind = roll < 0.5 ? 'pine' : roll < 0.78 ? 'broadleaf' : roll < 0.9 ? 'birch' : 'dead';
      const scale = z > -9 ? rng.range(0.6, 0.85) : z > -18 ? rng.range(0.75, 1.1) : rng.range(0.8, 1.35);
      add(kind, x, z, scale, 0.15);
    }
    // Shrubs and ferns either side of the plane.
    const nBush = Math.round(46 * p.vegetationDensity);
    for (let i = 0; i < nBush; i++) {
      const x = rx();
      const z = rng.range(-42, 30);
      if (Math.abs(z) < 2.6 || this.blocked(x, z, false)) continue;
      add('bush', x, z, rng.range(0.8, 1.4));
    }
    const nFern = Math.round(44 * p.vegetationDensity);
    for (let i = 0; i < nFern; i++) {
      const x = rx();
      const z = rng.range(-26, 26);
      if (Math.abs(z) < 1.7 || this.blocked(x, z, false)) continue;
      add('fern', x, z, rng.range(0.8, 1.3));
    }
    // Grass and flowers.
    const nGrass = Math.round(420 * p.grassDensity);
    for (let i = 0; i < nGrass; i++) {
      const x = rx();
      const z = rng.range(-18, 36);
      if (Math.abs(z) < 1.2 && t.pathAmount(x) > 0.4) continue;
      if (this.blocked(x, z, false)) continue;
      add(rng.chance(0.14) ? 'flowers' : 'grass', x, z, rng.range(0.8, 1.5), 0.02);
    }
    // Rocks, logs and stumps.
    for (let i = 0; i < 16; i++) {
      const x = rx();
      const z = rng.range(-70, 34);
      if (Math.abs(z) < 2.8 || this.blocked(x, z, false)) continue;
      add('rock', x, z, rng.range(0.7, z > 0 ? 1.8 : 2.6), 0.25);
    }
    for (let i = 0; i < 3; i++) {
      const x = rx();
      const z = rng.chance(0.5) ? rng.range(-30, -4) : rng.range(4, 24);
      if (this.blocked(x, z, false)) continue;
      add('log', x, z, rng.range(0.9, 1.2), 0.15);
    }
    for (let i = 0; i < 5; i++) {
      const x = rx();
      const z = rng.range(-40, 20);
      if (Math.abs(z) < 2.5 || this.blocked(x, z, false)) continue;
      add('stump', x, z, rng.range(0.8, 1.2), 0.05);
    }

    // Group into instanced meshes per (kind, variant).
    const groups = new Map<string, Placement[]>();
    for (const pl of list) {
      const key = `${pl.kind}:${pl.variant}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(pl);
    }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [key, items] of groups) {
      const [kind, vi] = key.split(':') as [VegKind, string];
      const geo = this.lib.variants[kind][Number(vi)];
      const mesh = new THREE.InstancedMesh(geo, this.materials[KIND_MATERIAL[kind]], items.length);
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        const sc = clamp(it.scale, 0.3, 3);
        s.set(sc, sc, sc);
        v.set(it.x, it.y, it.z);
        m.compose(v, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = CASTS[kind];
      mesh.receiveShadow = kind !== 'grass' && kind !== 'flowers';
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }
}
