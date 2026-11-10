import * as THREE from 'three';
import { damp } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Settings } from '../core/Settings';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import type { ContainerRegistry, Inventory } from '../inventory/Inventory';
import type { LightSystem } from '../lighting/LightSystem';
import { CollisionWorld } from '../physics/CollisionWorld';
import type { StoryState } from '../story/StoryState';
import { ChunkBuilder, type ChunkMaterials, createChunkMaterials } from './ChunkBuilder';
import { ChunkManager } from './ChunkManager';
import { type HarvestHost, ResourceSystem } from './Resources';
import { createSiteMaterials, type Fadeable, type Gate, type Interior, type SiteContext, type SiteHost, type SiteStation } from './sites/kit';
import { campsite, eastBlockade, huntersLodge, logBridge, rangerStation, ridgeLedges, trailhead, westBlockade } from './sites/places';
import { city, coast, frost } from './sites/regions';
import { Terrain, VALLEY_HALF } from './Terrain';
import { generatePois, type Poi } from './sites/poi';
import { bakeStatic } from './sites/bake';
import { applySurfaces } from '../render/surface';
import { VegetationLibrary } from './vegetation';
import { createRiverMesh, createWaterMaterial } from './Water';
import { PLAYABLE, RIVERS, SEA_Y, WORLD_SEED } from './WorldDef';

export interface WorldDeps {
  settings: Settings;
  events: GameEventBus;
  interactions: InteractionSystem;
  story: StoryState;
  containers: ContainerRegistry;
  lights: LightSystem;
  inventory: Inventory;
  harvest: HarvestHost;
  host: SiteHost;
}

/**
 * The physical world: terrain, streamed chunks, water, resource nodes, authored sites,
 * their colliders, and the story gates that change them.
 */
export class World {
  readonly terrain = new Terrain(WORLD_SEED);
  readonly collision: CollisionWorld;
  readonly root = new THREE.Group();
  readonly resources: ResourceSystem;
  readonly stations: SiteStation[] = [];
  /** Off-road points of interest. */
  pois: Poi[] = [];
  private chunks: ChunkManager;
  private builder: ChunkBuilder;
  private chunkMaterials: ChunkMaterials;
  private fadeables: Fadeable[] = [];
  private interiors: Interior[] = [];
  private gates: Gate[] = [];
  private npcs: { update(dt: number): void }[] = [];
  private standardMaterials: boolean;

  constructor(
    scene: THREE.Scene,
    private d: WorldDeps,
  ) {
    this.root.name = 'world';
    scene.add(this.root);
    this.collision = new CollisionWorld(this.terrain, { minX: PLAYABLE.min, maxX: PLAYABLE.max, minZ: -VALLEY_HALF, maxZ: VALLEY_HALF });

    const lib = new VegetationLibrary(WORLD_SEED);
    this.standardMaterials = d.settings.profile.standardMaterials;
    this.chunkMaterials = createChunkMaterials(this.standardMaterials);
    this.builder = new ChunkBuilder(this.terrain, lib, this.chunkMaterials, d.settings.profile);
    const chunkRoot = new THREE.Group();
    chunkRoot.name = 'chunks';
    this.root.add(chunkRoot);
    this.chunks = new ChunkManager(chunkRoot, this.builder, PLAYABLE);
    this.chunks.radius = d.settings.profile.chunkRadius;

    const water = createWaterMaterial(0x2f5a5c);
    const salt = createWaterMaterial(0x2a4f60);
    const ice = new THREE.MeshStandardMaterial({ color: 0xcfe3ef, roughness: 0.15, metalness: 0.1 });
    for (const r of RIVERS) this.root.add(createRiverMesh(this.terrain, r, r.frozen ? ice : r.salt ? salt : water));
    this.root.add(this.createSea(salt));

    this.resources = new ResourceSystem(this.terrain, lib, this.chunkMaterials, d.interactions, d.harvest);
    this.root.add(this.resources.group);
    this.chunks.onLoad = (i, j) => this.resources.loadChunk(i, j);
    this.chunks.onUnload = (i, j) => this.resources.unloadChunk(i, j);

    const sites = new THREE.Group();
    sites.name = 'sites';
    this.root.add(sites);
    const ctx: SiteContext = {
      terrain: this.terrain,
      collision: this.collision,
      interactions: d.interactions,
      story: d.story,
      events: d.events,
      group: sites,
      mats: createSiteMaterials(),
      fadeables: this.fadeables,
      interiors: this.interiors,
      gates: this.gates,
      containers: d.containers,
      lights: d.lights,
      inventory: d.inventory,
      host: d.host,
      stations: this.stations,
      npcs: this.npcs,
    };
    frost(ctx);
    westBlockade(ctx, -232);
    campsite(ctx, 0);
    trailhead(ctx, 26);
    logBridge(ctx);
    rangerStation(ctx, 132);
    ridgeLedges(ctx);
    huntersLodge(ctx, 362);
    eastBlockade(ctx, 410, 436);
    city(ctx);
    coast(ctx);
    this.pois = generatePois(ctx);
    const baked = bakeStatic(sites);
    // Fading walls now live in merged meshes: point the fade system at those.
    for (const f of this.fadeables) f.meshes = [...new Set(f.meshes.map((m) => baked.replaced.get(m) ?? m))];
    console.info(`[world] baked ${baked.before} site meshes into ${baked.after}`);
    // World-space texturing and relief on every tiled surface.
    applySurfaces(sites);
    // Sites are static: freeze their transforms.
    sites.updateMatrixWorld(true);
    sites.traverse((o) => (o.matrixAutoUpdate = false));
    // Distance culling: everything past the fog is moved to a layer the cameras don't render.
    const sphere = new THREE.Sphere();
    sites.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Sprite).isSprite) return;
      const geo = m.geometry;
      if (!geo) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      sphere.copy(geo.boundingSphere!).applyMatrix4(o.matrixWorld);
      this.cullables.push({ obj: o, x: sphere.center.x, z: sphere.center.z, r: sphere.radius, culled: false });
    });
  }

  private cullables: { obj: THREE.Object3D; x: number; z: number; r: number; culled: boolean }[] = [];
  private cullTimer = 0;
  /** Site objects farther than this (beyond the fog) are not drawn. */
  static readonly SITE_VIEW = 195;

  private cullSites(fx: number, fz: number): void {
    const R = World.SITE_VIEW;
    for (const c of this.cullables) {
      const far = Math.hypot(c.x - fx, c.z - fz) - c.r > R;
      if (far === c.culled) continue;
      c.culled = far;
      if (far) c.obj.layers.set(1);
      else c.obj.layers.set(0);
    }
  }

  /** The sea north of the Drowned Coast, ending in a horizon apron under the mountains' haze. */
  private createSea(material: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(760, 470, 76, 47);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, material);
    water.position.set(1400, SEA_Y, -20 - 235);
    water.receiveShadow = true;
    water.renderOrder = 4;
    g.add(water);
    return g;
  }

  /** Rebuild streamed content after a quality change. */
  applySettings(): void {
    const p = this.d.settings.profile;
    this.chunks.radius = p.chunkRadius;
    if (p.standardMaterials !== this.standardMaterials) {
      this.standardMaterials = p.standardMaterials;
      this.chunkMaterials = createChunkMaterials(this.standardMaterials);
    }
    this.builder.setProfile(p, this.chunkMaterials);
    this.resources.setMaterials(this.chunkMaterials);
    this.chunks.clear();
  }

  preload(focusX: number, focusZ: number): void {
    this.chunks.buildAll(focusX, focusZ);
    this.cullSites(focusX, focusZ);
  }

  /** Apply any gates whose story flag has been set (call after loading, and each frame). */
  applyGates(): void {
    for (const g of this.gates) {
      if (!g.applied && this.d.story.flags[g.flag]) {
        g.applied = true;
        g.apply();
      }
    }
  }

  /** True inside an authored building or underground level. */
  insideInterior(x: number, y: number, z: number): boolean {
    return this.interiors.some((i) => x > i.x0 && x < i.x1 && z > i.z0 && z < i.z1 && y > i.y0 - 0.2 && y < i.y1);
  }

  /** Ceiling of the storey the player is on, inside multi-storey buildings (null elsewhere or on the top floor). */
  ceilingAt(x: number, y: number, z: number): number | null {
    for (const i of this.interiors) {
      if (!i.storeys || i.storeys < 2 || i.floor0 === undefined || !i.storeyH) continue;
      if (!(x > i.x0 - 0.5 && x < i.x1 + 0.5 && z > i.z0 - 0.5 && z < i.z1 + 0.5 && y > i.y0 - 0.2 && y < i.y1)) continue;
      const k = Math.floor((y - i.floor0 + 0.4) / i.storeyH);
      if (k >= i.storeys - 1) return null;
      return i.floor0 + (k + 1) * i.storeyH - 0.3;
    }
    return null;
  }

  /** Nearest undiscovered-or-not point of interest within range. */
  poiNear(x: number, z: number, range: number): Poi | null {
    for (const p of this.pois) if (Math.hypot(p.x - x, p.z - z) < range) return p;
    return null;
  }

  update(dt: number, focusX: number, focusZ: number, playerX: number, playerY: number, playerZ: number): void {
    this.chunks.update(focusX, focusZ);
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.3;
      this.cullSites(focusX, focusZ);
    }
    this.applyGates();
    for (const n of this.npcs) n.update(dt);
    for (const f of this.fadeables) {
      const inside = playerX > f.x0 && playerX < f.x1 && playerZ > f.z0 && playerZ < f.z1 && playerY > f.y0 && playerY < f.y1;
      const target = inside ? 0.12 : 1;
      if (Math.abs(f.opacity - target) < 0.001) continue;
      f.opacity = damp(f.opacity, target, 8, dt);
      if (Math.abs(f.opacity - target) < 0.01) f.opacity = target;
      for (const m of f.materials) {
        m.opacity = f.opacity;
        m.depthWrite = f.opacity > 0.98;
      }
      for (const mesh of f.meshes) mesh.castShadow = f.opacity > 0.6;
    }
  }

  get loadedChunks(): number {
    return this.chunks.loaded;
  }
}
