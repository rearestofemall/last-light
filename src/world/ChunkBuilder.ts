import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';
import { hashSeed, Rng } from '../core/rng';
import type { QualityProfile } from '../core/Settings';
import { addWindSway, vertexColorMaterial } from '../render/materials';
import { type Terrain, VALLEY_HALF } from './Terrain';
import type { VegetationLibrary, VegKind } from './vegetation';
import { CLEARINGS, inCityBlock, REGIONS, regionAt, regionWeight, type RegionId, RIVERS, SEA_Y } from './WorldDef';

export const CHUNK_SIZE = 48;

/** Terrain vertex spacing in metres. */
const STEP = 2;

export interface Chunk {
  i: number;
  j: number;
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
    tree: addWindSway(vertexColorMaterial(standard), 0.0021, `tree-${standard}`, true, true),
    shrub: addWindSway(vertexColorMaterial(standard), 0.05, `shrub-${standard}`, true, true),
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

  build(i: number, j: number): Chunk {
    const group = new THREE.Group();
    group.name = `chunk-${i}-${j}`;
    const x0 = i * CHUNK_SIZE;
    const z0 = j * CHUNK_SIZE;
    const tGeo = this.buildTerrain(x0, z0);
    const tMesh = new THREE.Mesh(tGeo, this.materials.terrain);
    tMesh.receiveShadow = true;
    group.add(tMesh);
    const meshes = this.buildVegetation(i, j, x0, z0);
    for (const m of meshes) group.add(m);
    group.updateMatrixWorld(true);
    group.traverse((o) => (o.matrixAutoUpdate = false));
    return {
      i,
      j,
      group,
      dispose: () => {
        tGeo.dispose();
        for (const m of meshes) m.geometry.dispose();
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
    const az = Math.abs(z);
    // Forest floor is darker away from the trail; mountain walls turn to scree and rock.
    out.multiplyScalar(lerp(1, 0.86 + pal.frost * 0.12, smoothstep(8, 40, az) * (0.5 + 0.5 * n)));
    const wall = smoothstep(78, 115, az);
    if (wall > 0) out.lerp(pal.rock, wall * (0.6 - pal.frost * 0.4));
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

  private buildTerrain(x0: number, z0: number): THREE.BufferGeometry {
    const t = this.terrain;
    const n = CHUNK_SIZE / STEP + 1;
    const pos = new Float32Array(n * n * 3);
    const nor = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const c = new THREE.Color();
    const e = 0.6;
    for (let a = 0; a < n; a++) {
      const x = x0 + a * STEP;
      const pal = this.palette(x);
      for (let bb = 0; bb < n; bb++) {
        const z = z0 + bb * STEP;
        const h = t.heightAt3(x, z);
        const k = (bb * n + a) * 3;
        pos[k] = x;
        pos[k + 1] = h;
        pos[k + 2] = z;
        const dx = (t.heightAt3(x + e, z) - t.heightAt3(x - e, z)) / (2 * e);
        const dz = (t.heightAt3(x, z + e) - t.heightAt3(x, z - e)) / (2 * e);
        const len = Math.hypot(dx, 1, dz);
        nor[k] = -dx / len;
        nor[k + 1] = 1 / len;
        nor[k + 2] = -dz / len;
        this.terrainColor(x, z, h, 1 / len, pal, c);
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let bb = 0; bb < n - 1; bb++) {
      for (let a = 0; a < n - 1; a++) {
        const p = bb * n + a;
        idx.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
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

  private blocked(x: number, z: number, big: boolean): boolean {
    for (const r of RIVERS) if (this.terrain.riverFactor(r, x, z) > (big ? 0.02 : 0.35)) return true;
    const az = Math.abs(z);
    // Keep the trail clear of trees, and authored sites readable.
    if (big && az < 3.2) return true;
    for (const c of CLEARINGS) {
      if (Math.abs(x - c.x) < c.radius && az < (big ? Math.abs(c.zBack) * 0.8 + 4 : 6)) return true;
    }
    // City blocks: buildings line both sides of the street.
    if (inCityBlock(x) && az < 48) return big || az < 5.2;
    // Nothing grows in the sea.
    if (regionWeight('coast', x) > 0.3 && this.terrain.heightAt3(x, z) < SEA_Y + 0.3) return true;
    if (az > VALLEY_HALF + 6) return true;
    if (big && this.terrain.gradientAt(x, z) > 1.1) return true;
    return false;
  }

  private buildVegetation(ci: number, cj: number, x0: number, z0: number): THREE.Mesh[] {
    const t = this.terrain;
    const rng = new Rng(hashSeed(t.seed, ci, cj, 7));
    const p = this.profile;
    const list: Placement[] = [];
    const add = (kind: VegKind, x: number, z: number, scale: number, sink = 0.05) => {
      const variants = this.lib.variants[kind].length;
      list.push({ kind, variant: rng.int(0, variants - 1), x, y: t.heightAt3(x, z) - sink, z, scale, rot: rng.range(0, Math.PI * 2) });
    };
    const rx = () => x0 + rng.float() * CHUNK_SIZE;
    const rz = () => z0 + rng.float() * CHUNK_SIZE;

    // Trees, behind the gameplay plane. Density varies along the trail: dense stands
    // alternate with open meadows where sky and distant ranges show through.
    const nTrees = Math.round(150 * p.vegetationDensity);
    for (let i = 0; i < nTrees; i++) {
      const x = rx();
      const z = rz();
      const reg = regionAt(x);
      const density = (0.25 + 0.75 * t.forestDensity(x + z * 0.7)) * reg.forest;
      const nearTrail = Math.abs(z) < 9 ? 0.45 : 1;
      if (!rng.chance(density * nearTrail)) continue;
      if (this.blocked(x, z, true)) continue;
      const kind = pickWeighted(rng, FLORA[reg.id].trees);
      add(kind, x, z, rng.range(0.75, 1.3), 0.15);
    }
    const nBush = Math.round(46 * p.vegetationDensity);
    for (let i = 0; i < nBush; i++) {
      const x = rx();
      const f = FLORA[regionAt(x).id];
      if (!rng.chance(f.bush)) continue;
      const z = rz();
      if (Math.abs(z) < 2.2 || this.blocked(x, z, false)) continue;
      add('bush', x, z, rng.range(0.8, 1.4));
    }
    const nFern = Math.round(44 * p.vegetationDensity);
    for (let i = 0; i < nFern; i++) {
      const x = rx();
      if (!rng.chance(FLORA[regionAt(x).id].fern)) continue;
      const z = rz();
      if (Math.abs(z) < 1.7 || this.blocked(x, z, false)) continue;
      add('fern', x, z, rng.range(0.8, 1.3));
    }
    const nGrass = Math.round(360 * p.grassDensity);
    for (let i = 0; i < nGrass; i++) {
      const x = rx();
      const f = FLORA[regionAt(x).id];
      if (!rng.chance(f.grass)) continue;
      const z = rz();
      if (Math.abs(z) < 1.2 && t.pathAmount(x) > 0.4) continue;
      if (this.blocked(x, z, false)) continue;
      if (f.ground === 'drift') add('drift', x, z, rng.range(0.6, 1.2), 0.2);
      else if (f.ground === 'reeds' && rng.chance(0.4)) add('reeds', x, z, rng.range(0.7, 1.2), 0.02);
      else add(rng.chance(f.flowers) ? 'flowers' : 'grass', x, z, rng.range(0.8, 1.5), 0.02);
    }
    for (let i = 0; i < 16; i++) {
      const x = rx();
      const z = rz();
      if (Math.abs(z) < 2.8 || this.blocked(x, z, false)) continue;
      add('rock', x, z, rng.range(0.7, 2.4), 0.25);
    }
    for (let i = 0; i < 3; i++) {
      const x = rx();
      const z = rz();
      if (Math.abs(z) < 3 || this.blocked(x, z, false)) continue;
      add(regionAt(x).id === 'city' ? 'scrap' : 'log', x, z, rng.range(0.9, 1.2), 0.15);
    }
    for (let i = 0; i < 5; i++) {
      const x = rx();
      const z = rz();
      if (Math.abs(z) < 2.5 || this.blocked(x, z, false)) continue;
      add('stump', x, z, rng.range(0.8, 1.2), 0.05);
    }

    // Merge everything sharing a material into one static mesh: a handful of draw calls per
    // chunk instead of one per plant type. Small ground cover goes in its own mesh so it can be
    // hidden at a distance.
    type Acc = { pos: Float32Array; nor: Float32Array; col: Float32Array; h: Float32Array; ph: Float32Array; n: number; cast: boolean };
    const accs = new Map<string, Acc>();
    const sizes = new Map<string, number>();
    const keyFor = (k: VegKind) => (k === 'grass' || k === 'flowers' || k === 'fern' || k === 'herb' || k === 'reeds' ? 'ground' : KIND_MATERIAL[k]);
    for (const pl of list) {
      const key = keyFor(pl.kind);
      sizes.set(key, (sizes.get(key) ?? 0) + this.lib.variants[pl.kind][pl.variant].attributes.position.count);
    }
    for (const [key, size] of sizes) accs.set(key, { pos: new Float32Array(size * 3), nor: new Float32Array(size * 3), col: new Float32Array(size * 3), h: new Float32Array(size), ph: new Float32Array(size), n: 0, cast: false });
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const pl of list) {
      const geo = this.lib.variants[pl.kind][pl.variant];
      const acc = accs.get(keyFor(pl.kind))!;
      acc.cast ||= CASTS[pl.kind];
      const s2 = clamp(pl.scale, 0.3, 3);
      q.setFromAxisAngle(up, pl.rot);
      m.compose(v.set(pl.x, pl.y, pl.z), q, sc.set(s2, s2, s2));
      nm.getNormalMatrix(m);
      const P = geo.attributes.position as THREE.BufferAttribute;
      const N = geo.attributes.normal as THREE.BufferAttribute;
      const C = geo.attributes.color as THREE.BufferAttribute;
      const H = geo.attributes.aH as THREE.BufferAttribute;
      const phase = pl.x * 0.37 + pl.z * 0.23;
      for (let i = 0; i < P.count; i++) {
        const o = acc.n * 3;
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        acc.pos[o] = v.x;
        acc.pos[o + 1] = v.y;
        acc.pos[o + 2] = v.z;
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        acc.nor[o] = v.x;
        acc.nor[o + 1] = v.y;
        acc.nor[o + 2] = v.z;
        acc.col[o] = C.getX(i);
        acc.col[o + 1] = C.getY(i);
        acc.col[o + 2] = C.getZ(i);
        acc.h[acc.n] = H.getX(i) * s2;
        acc.ph[acc.n] = phase;
        acc.n++;
      }
    }
    const out: THREE.Mesh[] = [];
    for (const [key, acc] of accs) {
      if (!acc.n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(acc.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(acc.nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(acc.col, 3));
      g.setAttribute('aH', new THREE.BufferAttribute(acc.h, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(acc.ph, 1));
      g.computeBoundingSphere();
      const mat = key === 'ground' ? this.materials.grass : this.materials[key as keyof ChunkMaterials];
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = acc.cast && key !== 'ground';
      mesh.receiveShadow = key !== 'ground';
      mesh.name = key;
      out.push(mesh);
    }
    return out;
  }
}
