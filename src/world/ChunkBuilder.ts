import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import { hashSeed, Rng } from '../core/rng';
import type { QualityProfile } from '../core/Settings';
import { addWindSway, vertexColorMaterial } from '../render/materials';
import { type Terrain, TERRAIN_Z_BACK, TERRAIN_Z_FRONT } from './Terrain';
import type { VegetationLibrary, VegKind } from './vegetation';
import { CLEARINGS, inCityBlock, REGIONS, regionAt, regionWeight, type RegionId, RIVERS, SEA_Y } from './WorldDef';

export const CHUNK_SIZE = 48;

/** Depth rows of the terrain mesh: dense near the gameplay plane, sparse far away. */
const Z_ROWS = [
  TERRAIN_Z_FRONT, 32, 27, 23, 19.5, 16.5, 14, 11.5, 9.5, 7.5, 6, 4.5, 3.2, 2, 1, 0, -1, -2, -3.2, -4.5, -6, -7.5, -9.5, -12, -15, -18.5,
  -22.5, -27, -32, -38, -45, -53, -62, -72, -83, -96, TERRAIN_Z_BACK,
];
/** Rows behind this depth use every other column (far terrain needs less detail). */
const COARSE_Z = -30;
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

export const KIND_MATERIAL: Record<VegKind, keyof ChunkMaterials> = {
  pine: 'tree',
  broadleaf: 'tree',
  birch: 'tree',
  dead: 'tree',
  snowpine: 'tree',
  bush: 'shrub',
  berrybush: 'shrub',
  fern: 'shrub',
  grass: 'grass',
  flowers: 'grass',
  herb: 'grass',
  reeds: 'grass',
  rock: 'solid',
  log: 'solid',
  stump: 'solid',
  sticks: 'solid',
  scrap: 'solid',
  drift: 'solid',
};

export const CASTS: Record<VegKind, boolean> = {
  pine: true,
  broadleaf: true,
  birch: true,
  dead: true,
  snowpine: true,
  bush: true,
  berrybush: true,
  fern: false,
  grass: false,
  flowers: false,
  herb: false,
  reeds: false,
  rock: true,
  log: true,
  stump: true,
  sticks: false,
  scrap: true,
  drift: false,
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

/** Per-region vegetation recipe. */
const FLORA: Record<RegionId, { trees: [VegKind, number][]; bush: number; fern: number; grass: number; flowers: number; ground: VegKind }> = {
  woods: { trees: [['pine', 0.5], ['broadleaf', 0.28], ['birch', 0.12], ['dead', 0.1]], bush: 1, fern: 1, grass: 1, flowers: 0.14, ground: 'grass' },
  frost: { trees: [['snowpine', 0.82], ['dead', 0.18]], bush: 0, fern: 0, grass: 0.12, flowers: 0, ground: 'drift' },
  city: { trees: [['broadleaf', 0.5], ['dead', 0.3], ['birch', 0.2]], bush: 0.8, fern: 0.3, grass: 0.8, flowers: 0.1, ground: 'grass' },
  coast: { trees: [['pine', 0.55], ['dead', 0.45]], bush: 0.5, fern: 0, grass: 0.9, flowers: 0.08, ground: 'reeds' },
};

function pickWeighted(rng: Rng, list: [VegKind, number][]): VegKind {
  let r = rng.float();
  for (const [k, w] of list) {
    r -= w;
    if (r <= 0) return k;
  }
  return list[list.length - 1][0];
}

interface Palette {
  grass: THREE.Color;
  dry: THREE.Color;
  dirt: THREE.Color;
  rock: THREE.Color;
  city: number;
  coast: number;
  frost: number;
}

const tmp = new THREE.Color();
const ASPHALT = new THREE.Color(0x3a3a3c);
const SIDEWALK = new THREE.Color(0x8a8780);
const SAND = new THREE.Color(0xcbbb8f);
const WET_SAND = new THREE.Color(0x8f8463);
const GRAVEL = new THREE.Color(0x6f6a4c);
const BED = new THREE.Color(0x3a3a2c);
const ICE_BED = new THREE.Color(0xa9bccb);

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

    // Static content: skip per-frame matrix recomputation.
    group.updateMatrixWorld(true);
    group.traverse((o) => (o.matrixAutoUpdate = false));

    return {
      index,
      group,
      dispose: () => {
        for (const g of geos) g.dispose();
        for (const m of meshes) m.dispose();
      },
    };
  }

  private palette(x: number): Palette {
    const p: Palette = { grass: new THREE.Color(0, 0, 0), dry: new THREE.Color(0, 0, 0), dirt: new THREE.Color(0, 0, 0), rock: new THREE.Color(0, 0, 0), city: 0, coast: 0, frost: 0 };
    let total = 0;
    for (const r of REGIONS) {
      const w = regionWeight(r.id, x, 40);
      if (w <= 0) continue;
      total += w;
      p.grass.add(tmp.setHex(r.palette.grass).multiplyScalar(w));
      p.dry.add(tmp.setHex(r.palette.grassDry).multiplyScalar(w));
      p.dirt.add(tmp.setHex(r.palette.dirt).multiplyScalar(w));
      p.rock.add(tmp.setHex(r.palette.rock).multiplyScalar(w));
      if (r.id === 'city') p.city = w;
      if (r.id === 'coast') p.coast = w;
      if (r.id === 'frost') p.frost = w;
    }
    const k = 1 / Math.max(total, 1e-6);
    p.grass.multiplyScalar(k);
    p.dry.multiplyScalar(k);
    p.dirt.multiplyScalar(k);
    p.rock.multiplyScalar(k);
    p.city *= k;
    p.coast *= k;
    p.frost *= k;
    return p;
  }

  private terrainColor(x: number, z: number, h: number, ny: number, pal: Palette, out: THREE.Color): THREE.Color {
    const t = this.terrain;
    const n = t.colorNoise(x, z);
    out.copy(pal.grass).lerp(pal.dry, smoothstep(-0.15, 0.7, n));
    if (z < -6) out.multiplyScalar(lerp(1, 0.82 + pal.frost * 0.15, smoothstep(-6, -30, z)));
    const az = Math.abs(z);
    const path = t.pathAmount(x) * (1 - smoothstep(0.7, 1.9, az + n * 0.4)) * (1 - pal.city);
    if (path > 0) out.lerp(pal.dirt, path);
    if (pal.city > 0) {
      const road = (1 - smoothstep(3.0, 3.3, az)) * pal.city;
      const walk = smoothstep(3.0, 3.3, az) * (1 - smoothstep(4.6, 4.9, az)) * pal.city;
      out.lerp(ASPHALT, road * (0.85 + 0.15 * n)).lerp(SIDEWALK, walk);
    }
    if (pal.coast > 0) {
      const beach = 1 - smoothstep(1.2, 3.2, h - SEA_Y);
      if (beach > 0) out.lerp(SAND, beach * pal.coast);
      if (h - SEA_Y < 0.4) out.lerp(WET_SAND, pal.coast * 0.7);
      out.lerp(SAND, pal.coast * 0.35 * smoothstep(0.2, 0.8, n));
    }
    if (t.onRidge(x) && az < 7) out.lerp(pal.rock, 0.45 * (1 - smoothstep(3, 7, az)));
    const rockK = smoothstep(0.84, 0.6, ny) * (1 - pal.frost * 0.4);
    if (rockK > 0) out.lerp(pal.rock, rockK);
    for (const r of RIVERS) {
      const rf = t.riverFactor(r, x, z);
      if (rf <= 0) continue;
      if (r.frozen) out.lerp(ICE_BED, smoothstep(0.3, 0.7, rf));
      else {
        out.lerp(r.salt ? SAND : GRAVEL, smoothstep(0.45, 0.7, rf));
        out.lerp(r.salt ? WET_SAND : BED, smoothstep(0.75, 1, rf));
      }
    }
    return out;
  }

  private buildTerrain(x0: number): THREE.BufferGeometry {
    const t = this.terrain;
    const cols = CHUNK_SIZE + 1;
    const pals: Palette[] = [];
    for (let i = 0; i < cols; i++) pals.push(this.palette(x0 + i));
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const rowStart: number[] = [];
    const rowCols: number[][] = [];
    const c = new THREE.Color();
    const e = 0.5;
    for (let j = 0; j < Z_ROWS.length; j++) {
      const z = Z_ROWS[j];
      const step = z < COARSE_Z ? 2 : 1;
      rowStart.push(pos.length / 3);
      const xs: number[] = [];
      for (let i = 0; i < cols; i += step) xs.push(i);
      if (xs[xs.length - 1] !== cols - 1) xs.push(cols - 1);
      rowCols.push(xs);
      for (const i of xs) {
        const x = x0 + i;
        const h = t.heightAt3(x, z);
        pos.push(x, h, z);
        const dx = (t.heightAt3(x + e, z) - t.heightAt3(x - e, z)) / (2 * e);
        const dz = (t.heightAt3(x, z + e) - t.heightAt3(x, z - e)) / (2 * e);
        const len = Math.hypot(dx, 1, dz);
        nor.push(-dx / len, 1 / len, -dz / len);
        this.terrainColor(x, z, h, 1 / len, pals[i], c);
        col.push(c.r, c.g, c.b);
      }
    }
    // Stitch consecutive rows that may have different column counts.
    const idx: number[] = [];
    for (let j = 0; j < Z_ROWS.length - 1; j++) {
      const A = rowCols[j];
      const B = rowCols[j + 1];
      const a0 = rowStart[j];
      const b0 = rowStart[j + 1];
      let ia = 0;
      let ib = 0;
      while (ia < A.length - 1 || ib < B.length - 1) {
        const nextA = ia < A.length - 1 ? A[ia + 1] : Infinity;
        const nextB = ib < B.length - 1 ? B[ib + 1] : Infinity;
        if (nextA <= nextB) {
          idx.push(a0 + ia, a0 + ia + 1, b0 + ib);
          ia++;
        } else {
          idx.push(a0 + ia, b0 + ib + 1, b0 + ib);
          ib++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
    for (let i = 0; i <= CHUNK_SIZE; i += 2) {
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
    const n = CHUNK_SIZE / 2;
    for (let i = 0; i < n; i++) {
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
    // City facades occupy the band behind the street.
    if (inCityBlock(x) && z < -4 && z > -46) return true;
    if (inCityBlock(x) && Math.abs(z) < 5.2) return true;
    // Nothing grows in the sea.
    if (regionWeight('coast', x) > 0.3 && this.terrain.heightAt3(x, z) < SEA_Y + 0.3) return true;
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

    // Trees, behind the gameplay plane. Density varies along the trail: dense stands
    // alternate with open meadows where sky and distant ranges show through.
    const nTrees = Math.round(250 * p.vegetationDensity);
    for (let i = 0; i < nTrees; i++) {
      const x = rx();
      const reg = regionAt(x);
      const z = -3.3 - rng.float() * (Math.abs(TERRAIN_Z_BACK) - 6);
      const density = (0.25 + 0.75 * t.forestDensity(x)) * reg.forest;
      const depthKeep = z > -9 ? 0.3 : z > -18 ? 0.6 : 1;
      if (!rng.chance(density * depthKeep)) continue;
      if (this.blocked(x, z, true)) continue;
      const kind = pickWeighted(rng, FLORA[reg.id].trees);
      const scale = z > -9 ? rng.range(0.6, 0.85) : z > -18 ? rng.range(0.75, 1.1) : rng.range(0.8, 1.35);
      add(kind, x, z, scale, 0.15);
    }
    const nBush = Math.round(46 * p.vegetationDensity);
    for (let i = 0; i < nBush; i++) {
      const x = rx();
      const f = FLORA[regionAt(x).id];
      if (!rng.chance(f.bush)) continue;
      const z = rng.range(-42, 30);
      if (Math.abs(z) < 2.6 || this.blocked(x, z, false)) continue;
      add('bush', x, z, rng.range(0.8, 1.4));
    }
    const nFern = Math.round(44 * p.vegetationDensity);
    for (let i = 0; i < nFern; i++) {
      const x = rx();
      if (!rng.chance(FLORA[regionAt(x).id].fern)) continue;
      const z = rng.range(-26, 26);
      if (Math.abs(z) < 1.7 || this.blocked(x, z, false)) continue;
      add('fern', x, z, rng.range(0.8, 1.3));
    }
    const nGrass = Math.round(420 * p.grassDensity);
    for (let i = 0; i < nGrass; i++) {
      const x = rx();
      const f = FLORA[regionAt(x).id];
      if (!rng.chance(f.grass)) continue;
      const z = rng.range(-18, 36);
      if (Math.abs(z) < 1.2 && t.pathAmount(x) > 0.4) continue;
      if (this.blocked(x, z, false)) continue;
      if (f.ground === 'drift') add('drift', x, z, rng.range(0.6, 1.2), 0.2);
      else if (f.ground === 'reeds' && rng.chance(0.4)) add('reeds', x, z, rng.range(0.7, 1.2), 0.02);
      else add(rng.chance(f.flowers) ? 'flowers' : 'grass', x, z, rng.range(0.8, 1.5), 0.02);
    }
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
      add(regionAt(x).id === 'city' ? 'scrap' : 'log', x, z, rng.range(0.9, 1.2), 0.15);
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
