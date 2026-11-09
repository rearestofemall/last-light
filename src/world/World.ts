import * as THREE from 'three';
import { damp } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Settings } from '../core/Settings';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import { CollisionWorld } from '../physics/CollisionWorld';
import type { StoryState } from '../story/StoryState';
import { ChunkBuilder, type ChunkMaterials, createChunkMaterials } from './ChunkBuilder';
import { ChunkManager } from './ChunkManager';
import { createSiteMaterials, type Fadeable, type SiteContext } from './sites/kit';
import { campsite, eastBlockade, huntersLodge, logBridge, rangerStation, ridgeLedges, trailhead, westBlockade } from './sites/places';
import { Terrain } from './Terrain';
import { VegetationLibrary } from './vegetation';
import { createRiverMesh, createWaterMaterial } from './Water';
import { PLAYABLE, RIVERS, WORLD_SEED } from './WorldDef';

/**
 * The physical world: terrain, streamed chunks, rivers, authored sites and their colliders.
 */
export class World {
  readonly terrain = new Terrain(WORLD_SEED);
  readonly collision: CollisionWorld;
  readonly root = new THREE.Group();
  private chunks: ChunkManager;
  private builder: ChunkBuilder;
  private chunkMaterials: ChunkMaterials;
  private fadeables: Fadeable[] = [];
  private standardMaterials: boolean;

  constructor(
    scene: THREE.Scene,
    private settings: Settings,
    events: GameEventBus,
    interactions: InteractionSystem,
    story: StoryState,
  ) {
    this.root.name = 'world';
    scene.add(this.root);
    this.collision = new CollisionWorld(this.terrain, { min: PLAYABLE.min, max: PLAYABLE.max });

    const lib = new VegetationLibrary(WORLD_SEED);
    this.standardMaterials = settings.profile.standardMaterials;
    this.chunkMaterials = createChunkMaterials(this.standardMaterials);
    this.builder = new ChunkBuilder(this.terrain, lib, this.chunkMaterials, settings.profile);
    const chunkRoot = new THREE.Group();
    chunkRoot.name = 'chunks';
    this.root.add(chunkRoot);
    this.chunks = new ChunkManager(chunkRoot, this.builder, PLAYABLE);
    this.chunks.radius = settings.profile.chunkRadius;

    const water = createWaterMaterial();
    for (const r of RIVERS) this.root.add(createRiverMesh(this.terrain, r, water));

    const sites = new THREE.Group();
    sites.name = 'sites';
    this.root.add(sites);
    const ctx: SiteContext = {
      terrain: this.terrain,
      collision: this.collision,
      interactions,
      story,
      events,
      group: sites,
      mats: createSiteMaterials(),
      fadeables: this.fadeables,
    };
    westBlockade(ctx, -232);
    campsite(ctx, 0);
    trailhead(ctx, 26);
    logBridge(ctx);
    rangerStation(ctx, 132);
    ridgeLedges(ctx);
    huntersLodge(ctx, 362);
    eastBlockade(ctx, 410, PLAYABLE.max);
  }

  /** Rebuild streamed content after a quality change. */
  applySettings(): void {
    const p = this.settings.profile;
    this.chunks.radius = p.chunkRadius;
    if (p.standardMaterials !== this.standardMaterials) {
      this.standardMaterials = p.standardMaterials;
      for (const m of Object.values(this.chunkMaterials)) (m as THREE.Material).dispose();
      this.chunkMaterials = createChunkMaterials(this.standardMaterials);
    }
    this.builder.setProfile(p, this.chunkMaterials);
    this.chunks.clear();
  }

  preload(focusX: number): void {
    this.chunks.buildAll(focusX);
  }

  update(dt: number, focusX: number, playerX: number, playerY: number): void {
    this.chunks.update(focusX);
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
      // Let sunlight into the cut-away so the interior stays readable.
      for (const mesh of f.meshes) mesh.castShadow = f.opacity > 0.6;
    }
  }

  get loadedChunks(): number {
    return this.chunks.loaded;
  }
}
