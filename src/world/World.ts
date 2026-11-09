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
import { Terrain, TERRAIN_Z_BACK } from './Terrain';
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
    this.collision = new CollisionWorld(this.terrain, { min: PLAYABLE.min, max: PLAYABLE.max });

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
    // Sites are static: freeze their transforms.
    sites.updateMatrixWorld(true);
    sites.traverse((o) => (o.matrixAutoUpdate = false));
  }

  private createSea(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(700, Math.abs(TERRAIN_Z_BACK) + 20, 70, 8);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(1390, SEA_Y, (TERRAIN_Z_BACK - 16) / 2 + 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = 4;
    return mesh;
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
    this.chunks.clear();
  }

  preload(focusX: number): void {
    this.chunks.buildAll(focusX);
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

  /** 2 when inside an authored building or underground, else 0. */
  insideInterior(x: number, y: number): boolean {
    return this.interiors.some((i) => x > i.x0 && x < i.x1 && y > i.y0 - 0.2 && y < i.y1);
  }

  update(dt: number, focusX: number, playerX: number, playerY: number): void {
    this.chunks.update(focusX);
    this.applyGates();
    for (const n of this.npcs) n.update(dt);
    for (const f of this.fadeables) {
      const inside = playerX > f.x0 && playerX < f.x1 && playerY > f.y0 && playerY < f.y1;
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
