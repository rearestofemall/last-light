import * as THREE from 'three';
import { hashSeed, Rng } from '../../core/rng';
import { buildTent } from './tent';
import { worldUvBox } from '../../render/textures';
import { VALLEY_HALF } from '../Terrain';
import { CLEARINGS, inCityBlock, PLAYABLE, regionAt, type RegionId, RIVERS, SEA_Y } from '../WorldDef';
import { buildCabin, CABIN_FLOOR, furniture } from './cabin';
import { fixedLight, lootCrate, mesh, oneway, type SiteContext, solid } from './kit';

export type PoiKind = 'camp' | 'hut' | 'stand' | 'wreck' | 'cache' | 'boat';

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  x: number;
  z: number;
  region: RegionId;
}

const NAMES: Record<PoiKind, string> = {
  camp: 'Abandoned camp',
  hut: 'Trapper’s hut',
  stand: 'Hunting stand',
  wreck: 'Wrecked car',
  cache: 'Supply cache',
  boat: 'Beached boat',
};

const KINDS: Record<RegionId, [PoiKind, number][]> = {
  woods: [['camp', 0.3], ['hut', 0.3], ['stand', 0.25], ['wreck', 0.15]],
  frost: [['hut', 0.4], ['camp', 0.3], ['cache', 0.3]],
  city: [['wreck', 0.5], ['cache', 0.3], ['camp', 0.2]],
  coast: [['boat', 0.35], ['hut', 0.3], ['camp', 0.35]],
};

const LOOT: Record<RegionId, [string, number, number][]> = {
  woods: [['berries', 2, 5], ['cloth', 1, 3], ['fiber', 3, 8], ['hide', 1, 2], ['fuel', 1, 1], ['bandage', 1, 1], ['canned_food', 1, 2], ['wood', 3, 8]],
  frost: [['hide', 1, 3], ['fuel', 1, 2], ['canned_food', 1, 2], ['cloth', 1, 3], ['wood', 4, 10], ['bandage', 1, 2]],
  city: [['metal', 2, 6], ['cloth', 1, 4], ['canned_food', 1, 3], ['fuel', 1, 2], ['water_clean', 1, 2], ['bandage', 1, 2]],
  coast: [['canned_food', 1, 2], ['cloth', 1, 3], ['rope', 1, 1], ['fuel', 1, 2], ['metal', 1, 3], ['raw_meat', 1, 2]],
};

/** Places to stumble upon off the road: deterministic for the world seed. */
export function generatePois(ctx: SiteContext, count = 46): Poi[] {
  const t = ctx.terrain;
  const rng = new Rng(hashSeed(t.seed, 4242));
  const pois: Poi[] = [];
  let tries = 0;
  while (pois.length < count && tries++ < 4000) {
    const x = rng.range(PLAYABLE.min + 30, PLAYABLE.max - 30);
    const z = (rng.chance(0.5) ? 1 : -1) * rng.range(22, VALLEY_HALF - 60);
    if (RIVERS.some((r) => Math.abs(x - r.x) < r.width + 22)) continue;
    if (CLEARINGS.some((c) => Math.abs(x - c.x) < c.radius + 18) && Math.abs(z) < 40) continue;
    if (inCityBlock(x) && Math.abs(z) < 55) continue;
    if (t.heightAt3(x, z) < SEA_Y + 1.5) continue;
    if (t.gradientAt(x, z) > 0.28 || t.gradientAt(x + 5, z) > 0.4 || t.gradientAt(x - 5, z) > 0.4) continue;
    if (pois.some((p) => Math.hypot(p.x - x, p.z - z) < 70)) continue;
    const region = regionAt(x).id;
    let r = rng.float();
    let kind: PoiKind = 'camp';
    for (const [k, w] of KINDS[region]) {
      r -= w;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const poi: Poi = { id: `poi-${pois.length}`, kind, name: NAMES[kind], x, z, region };
    pois.push(poi);
    buildPoi(ctx, poi, new Rng(hashSeed(t.seed, pois.length, 77)));
  }
  return pois;
}

function lootFor(region: RegionId, rng: Rng): [string, number][] {
  const table = LOOT[region];
  const out: [string, number][] = [];
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const [id, a, b] = rng.pick(table);
    out.push([id, rng.int(a, b)]);
  }
  if (rng.chance(0.12)) out.push([rng.pick(['knife', 'torch', 'bottle', 'lantern']), 1]);
  return out;
}

function buildPoi(ctx: SiteContext, p: Poi, rng: Rng): void {
  const t = ctx.terrain;
  const m = ctx.mats;
  const g = t.heightAt3(p.x, p.z);
  const root = new THREE.Group();
  root.position.set(p.x, g, p.z);
  root.rotation.y = rng.range(-0.4, 0.4);
  ctx.group.add(root);
  const loot = lootFor(p.region, rng);
  switch (p.kind) {
    case 'camp': {
      const t = buildTent({
        color: p.region === 'frost' ? 0xd8dcd6 : rng.pick([0x6b7a4a, 0x8a7a5a, 0xa8562e, 0x3f5a6e, 0x5f6b3a]),
        width: rng.range(2.2, 2.7),
        length: rng.range(2.2, 2.8),
        height: rng.range(1.35, 1.65),
        seed: rng.int(0, 1e6),
      });
      t.position.set(-2.5, 0, -1.5);
      t.rotation.y = rng.range(-0.5, 0.5);
      root.add(t);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        mesh(new THREE.DodecahedronGeometry(0.16, 0), m.rock, 1.2 + Math.cos(a) * 0.5, 0.08, 1 + Math.sin(a) * 0.4, root);
      }
      mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.05, 10), m.ash, 1.2, 0.03, 1, root, false);
      lootCrate(ctx, `${p.id}-crate`, p.x - 0.5, g, p.z + 1.6, 'Abandoned pack', loot);
      break;
    }
    case 'hut': {
      const cab = buildCabin(ctx, { x: p.x, z: p.z, width: 6, height: 3, zBack: -2.6, zFront: 2.6, style: p.region === 'coast' ? 'cottage' : 'hut', ground: g + 0.1 });
      furniture.bed(ctx, cab.group, 1.6, -1.6);
      furniture.table(ctx, cab.group, -1.4, -1.7, 1.2);
      lootCrate(ctx, `${p.id}-crate`, p.x - 1.6, cab.floorY, p.z + 1.2, 'Hut chest', loot);
      if (p.region === 'frost') fixedLight(ctx, `${p.id}-barrel`, 'barrel', p.x + 4.2, g + 1, p.z + 2.5, 600, false);
      break;
    }
    case 'stand': {
      const h = 3.2;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        mesh(new THREE.CylinderGeometry(0.1, 0.12, h + 1.2, 6), m.woodDark, sx * 1.1, (h + 1.2) / 2, sz * 1.1, root);
      }
      mesh(worldUvBox(2.6, 0.15, 2.6, 1.2), m.woodDark, 0, h, 0, root);
      for (let r2 = 0.5; r2 < h; r2 += 0.55) mesh(new THREE.BoxGeometry(0.06, 0.05, 0.7), m.woodDark, 1.35, r2, 0, root);
      oneway(ctx, p.x - 1.3, p.x + 1.3, g + h + 0.07, 'wood', undefined, p.z - 1.3, p.z + 1.3);
      // Ladder rungs as small one-way steps so you can climb.
      for (let k = 1; k <= 3; k++) oneway(ctx, p.x + 1.3, p.x + 2.2, g + k * 0.8, 'wood', undefined, p.z - 0.4, p.z + 0.4);
      lootCrate(ctx, `${p.id}-crate`, p.x - 0.4, g + h + 0.07, p.z - 0.4, 'Hunter’s box', loot);
      break;
    }
    case 'wreck': {
      const paint = new THREE.MeshStandardMaterial({ color: rng.pick([0x6b2f2a, 0x31495a, 0x8a8a7a, 0x3e4a3a]), roughness: 0.6, metalness: 0.4 });
      const car = new THREE.Group();
      car.rotation.set(0, rng.range(0, 3), rng.range(-0.15, 0.15));
      root.add(car);
      mesh(new THREE.BoxGeometry(4.1, 0.75, 1.8), paint, 0, 0.75, 0, car);
      mesh(new THREE.BoxGeometry(2.2, 0.62, 1.62), m.glass, -0.2, 1.42, 0, car);
      for (const wx of [-1.3, 1.3]) for (const wz of [-0.85, 0.85]) mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10).rotateX(Math.PI / 2), m.charcoal, wx, 0.35, wz, car);
      solid(ctx, p.x - 2, p.x + 2, g, g + 1.4, 'metal', undefined, p.z - 2, p.z + 2);
      lootCrate(ctx, `${p.id}-crate`, p.x + 3, g, p.z, 'Car boot', loot, 8, false);
      break;
    }
    case 'cache': {
      for (let i = 0; i < 4; i++) furniture.crate(ctx, root, rng.range(-1.5, 1.5), rng.range(-1.5, 1.5), rng.range(0.6, 1), 0);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), m.metal, 0, 1.5, -2.2, root);
      mesh(new THREE.PlaneGeometry(1.1, 0.7), m.red, 0.6, 2.6, -2.2, root);
      lootCrate(ctx, `${p.id}-crate`, p.x + 1.8, g, p.z + 1.4, 'Supply crate', loot.concat([['fuel', 1]]));
      fixedLight(ctx, `${p.id}-barrel`, 'barrel', p.x - 2.4, g + 1, p.z + 1.8, 300, false);
      break;
    }
    case 'boat': {
      const hull = new THREE.Group();
      hull.rotation.z = 0.25;
      root.add(hull);
      mesh(worldUvBox(6, 1.2, 2.2, 1.4), m.woodDark, 0, 0.6, 0, hull);
      mesh(new THREE.ConeGeometry(1.1, 1.8, 4).rotateZ(-Math.PI / 2), m.woodDark, 3.8, 0.7, 0, hull);
      mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 6), m.woodDark, -0.5, 2.6, 0, hull);
      solid(ctx, p.x - 3, p.x + 4.5, g, g + 1.5, 'wood', undefined, p.z - 1.2, p.z + 1.2);
      lootCrate(ctx, `${p.id}-crate`, p.x - 1, g, p.z + 2.2, 'Fisherman’s locker', loot);
      break;
    }
  }
  void CABIN_FLOOR;
}
