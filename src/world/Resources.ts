import * as THREE from 'three';
import { hashSeed, Rng } from '../core/rng';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { Inventory, ItemStack } from '../inventory/Inventory';
import { ITEMS, type ToolKind } from '../inventory/items';
import { type ChunkMaterials, CASTS, KIND_MATERIAL } from './ChunkBuilder';
import type { Terrain } from './Terrain';
import type { VegetationLibrary, VegKind } from './vegetation';
import { CLEARINGS, PLAYABLE, regionAt, type RegionId, RIVERS, SEA_Y } from './WorldDef';

export type NodeKind = 'tree' | 'rock' | 'bush' | 'grass' | 'herb' | 'sticks' | 'scrap';

interface Yield {
  id: string;
  min: number;
  max: number;
  chance?: number;
  /** Bonus quantity when the player holds this tool. */
  bonus?: ToolKind;
}

interface NodeDef {
  label: string;
  verb: string;
  hits: number;
  /** Tool required to harvest at all. */
  requires?: ToolKind;
  /** Tool that halves the hits needed. */
  faster?: ToolKind;
  perHit: Yield[];
  final: Yield[];
  respawnDays: number;
  sfx: 'chop' | 'mine' | 'gather';
}

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  tree: { label: 'Tree', verb: 'Chop', hits: 4, requires: 'axe', perHit: [{ id: 'wood', min: 1, max: 1 }], final: [{ id: 'wood', min: 2, max: 3 }, { id: 'fiber', min: 0, max: 1 }], respawnDays: 4, sfx: 'chop' },
  rock: { label: 'Rock', verb: 'Break', hits: 3, faster: 'pickaxe', perHit: [{ id: 'stone', min: 1, max: 1 }], final: [{ id: 'stone', min: 1, max: 2 }, { id: 'metal', min: 1, max: 1, chance: 0.35, bonus: 'pickaxe' }], respawnDays: 5, sfx: 'mine' },
  bush: { label: 'Berry bush', verb: 'Pick', hits: 1, perHit: [], final: [{ id: 'berries', min: 2, max: 3, bonus: 'knife' }, { id: 'fiber', min: 1, max: 1, bonus: 'knife' }], respawnDays: 2, sfx: 'gather' },
  grass: { label: 'Tall grass', verb: 'Gather', hits: 1, perHit: [], final: [{ id: 'fiber', min: 2, max: 3, bonus: 'knife' }], respawnDays: 1, sfx: 'gather' },
  herb: { label: 'Medicinal herbs', verb: 'Gather', hits: 1, perHit: [], final: [{ id: 'herbs', min: 1, max: 2, bonus: 'knife' }], respawnDays: 2, sfx: 'gather' },
  sticks: { label: 'Fallen branches', verb: 'Collect', hits: 1, perHit: [], final: [{ id: 'wood', min: 2, max: 3 }], respawnDays: 1.5, sfx: 'gather' },
  scrap: { label: 'Scrap pile', verb: 'Salvage', hits: 2, faster: 'pickaxe', perHit: [{ id: 'metal', min: 1, max: 1 }], final: [{ id: 'metal', min: 0, max: 2 }, { id: 'cloth', min: 0, max: 1 }, { id: 'fuel', min: 1, max: 1, chance: 0.15 }, { id: 'canned_food', min: 1, max: 1, chance: 0.12 }], respawnDays: 6, sfx: 'mine' },
};

/** What each node kind looks like per region, available and depleted. */
const VISUALS: Record<NodeKind, { look: (r: RegionId) => VegKind; depleted?: VegKind; scale: [number, number]; z: number }> = {
  tree: { look: (r) => (r === 'frost' ? 'snowpine' : r === 'coast' ? 'pine' : 'broadleaf'), depleted: 'stump', scale: [0.55, 0.7], z: -1.6 },
  rock: { look: () => 'rock', scale: [0.7, 0.95], z: -1.3 },
  bush: { look: () => 'berrybush', depleted: 'bush', scale: [0.8, 1], z: -1.25 },
  grass: { look: (r) => (r === 'coast' || r === 'frost' ? 'reeds' : 'reeds'), scale: [0.9, 1.2], z: -1.0 },
  herb: { look: () => 'herb', scale: [1.1, 1.4], z: -1.0 },
  sticks: { look: () => 'sticks', scale: [1, 1.2], z: -0.9 },
  scrap: { look: () => 'scrap', scale: [1, 1.3], z: -1.2 },
};

const TABLE: Record<RegionId, [NodeKind, number][]> = {
  woods: [['tree', 0.3], ['bush', 0.18], ['rock', 0.14], ['grass', 0.14], ['herb', 0.1], ['sticks', 0.1], ['scrap', 0.04]],
  frost: [['tree', 0.26], ['rock', 0.3], ['sticks', 0.2], ['herb', 0.08], ['scrap', 0.16]],
  city: [['scrap', 0.45], ['bush', 0.12], ['grass', 0.12], ['rock', 0.12], ['sticks', 0.1], ['tree', 0.09]],
  coast: [['sticks', 0.24], ['scrap', 0.24], ['rock', 0.2], ['grass', 0.18], ['herb', 0.08], ['bush', 0.06]],
};

export interface ResourceNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  hp: number;
  /** Day number at which the node regrows (0 = available). */
  regrowAt: number;
  look: VegKind;
  bucket: number;
  slot: number;
  deadSlot: number;
}

export interface HarvestHost {
  inventory: Inventory;
  events: GameEventBus;
  /** The best tool of this kind the player carries. */
  tool(kind: ToolKind): ItemStack | null;
  wearTool(stack: ItemStack): void;
  day(): number;
  /** Plays the work animation and blocks repeated hits for a moment. Returns false if busy. */
  beginWork(): boolean;
}

const BUCKET = 96;
const SCALE0 = new THREE.Matrix4().makeScale(0, 0, 0);

/** Harvestable nodes along the gameplay plane, rendered in culled spatial buckets. */
export class ResourceSystem {
  readonly nodes: ResourceNode[] = [];
  private byId = new Map<string, ResourceNode>();
  private buckets = new Map<number, Map<VegKind, THREE.InstancedMesh>>();
  readonly group = new THREE.Group();
  private interactables = new Map<string, Interactable>();

  constructor(
    private terrain: Terrain,
    private lib: VegetationLibrary,
    private materials: ChunkMaterials,
    private interactions: InteractionSystem,
    private host: HarvestHost,
  ) {
    this.group.name = 'resources';
    this.generate();
    this.buildMeshes();
  }

  private blocked(x: number): boolean {
    for (const r of RIVERS) if (Math.abs(x - r.x) < r.width / 2 + r.bank + 1.5) return true;
    for (const c of CLEARINGS) if (Math.abs(x - c.x) < c.radius + 1) return true;
    if (this.terrain.heightAt(x) < SEA_Y + 0.5) return true;
    if (Math.abs(this.terrain.slopeAt(x)) > 0.9) return true;
    return false;
  }

  private generate(): void {
    const rng = new Rng(hashSeed(this.terrain.seed, 991));
    let x = PLAYABLE.min + 6;
    let n = 0;
    while (x < PLAYABLE.max - 6) {
      x += rng.range(5, 12);
      if (this.blocked(x)) continue;
      const reg = regionAt(x).id;
      let r = rng.float();
      let kind: NodeKind = 'grass';
      for (const [k, w] of TABLE[reg]) {
        r -= w;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      const vis = VISUALS[kind];
      const z = vis.z + rng.range(-0.25, 0.15);
      const node: ResourceNode = {
        id: `n${n++}`,
        kind,
        x,
        y: this.terrain.heightAt3(x, z) - 0.05,
        z,
        scale: rng.range(vis.scale[0], vis.scale[1]),
        rot: rng.range(0, Math.PI * 2),
        hp: NODE_DEFS[kind].hits,
        regrowAt: 0,
        look: vis.look(reg),
        bucket: Math.floor(x / BUCKET),
        slot: -1,
        deadSlot: -1,
      };
      this.nodes.push(node);
      this.byId.set(node.id, node);
      this.register(node);
    }
  }

  private register(node: ResourceNode): void {
    const def = NODE_DEFS[node.kind];
    const it: Interactable = {
      id: node.id,
      x: node.x,
      y: node.y + 0.8,
      radius: 1.3,
      verb: def.verb,
      label: def.label,
      enabled: () => node.regrowAt === 0,
      onInteract: () => this.harvest(node),
    };
    this.interactables.set(node.id, it);
    this.interactions.add(it);
  }

  private buildMeshes(): void {
    // Count instances per bucket and look.
    const counts = new Map<number, Map<VegKind, number>>();
    const bump = (b: number, k: VegKind) => {
      let m = counts.get(b);
      if (!m) counts.set(b, (m = new Map()));
      const c = m.get(k) ?? 0;
      m.set(k, c + 1);
      return c;
    };
    for (const nd of this.nodes) {
      nd.slot = bump(nd.bucket, nd.look);
      const dead = VISUALS[nd.kind].depleted;
      if (dead) nd.deadSlot = bump(nd.bucket, dead);
    }
    for (const [b, kinds] of counts) {
      const map = new Map<VegKind, THREE.InstancedMesh>();
      for (const [k, count] of kinds) {
        const mesh = new THREE.InstancedMesh(this.lib.variants[k][0], this.materials[KIND_MATERIAL[k]], count);
        mesh.castShadow = CASTS[k];
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        map.set(k, mesh);
        this.group.add(mesh);
      }
      this.buckets.set(b, map);
    }
    for (const nd of this.nodes) this.refresh(nd);
    for (const map of this.buckets.values()) {
      for (const mesh of map.values()) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  private refresh(nd: ResourceNode): void {
    const map = this.buckets.get(nd.bucket);
    if (!map) return;
    const alive = nd.regrowAt === 0;
    // Damaged trees lean a little as they're chopped.
    this.quat.setFromEuler(new THREE.Euler(0, nd.rot, nd.kind === 'tree' && alive ? (NODE_DEFS.tree.hits - nd.hp) * 0.03 : 0));
    this.v.set(nd.x, nd.y, nd.z);
    this.s.setScalar(nd.scale);
    this.matrix.compose(this.v, this.quat, this.s);
    const live = map.get(nd.look)!;
    live.setMatrixAt(nd.slot, alive ? this.matrix : SCALE0);
    live.instanceMatrix.needsUpdate = true;
    const deadKind = VISUALS[nd.kind].depleted;
    if (deadKind && nd.deadSlot >= 0) {
      const dead = map.get(deadKind)!;
      this.s.setScalar(nd.kind === 'bush' ? nd.scale * 0.85 : nd.scale * 1.3);
      this.matrix.compose(this.v, this.quat, this.s);
      dead.setMatrixAt(nd.deadSlot, alive ? SCALE0 : this.matrix);
      dead.instanceMatrix.needsUpdate = true;
    }
  }

  private roll(y: Yield, rng: () => number): number {
    if (y.chance !== undefined && rng() > y.chance) {
      // Bonus tools guarantee chance-based yields.
      if (!(y.bonus && this.host.tool(y.bonus))) return 0;
    }
    let q = y.min + Math.floor(rng() * (y.max - y.min + 1));
    if (y.bonus && this.host.tool(y.bonus)) q += 1;
    return q;
  }

  harvest(nd: ResourceNode): void {
    const def = NODE_DEFS[nd.kind];
    const h = this.host;
    if (def.requires && !h.tool(def.requires)) {
      h.events.emit('toast', { text: `You need ${ITEMS[def.requires].name.toLowerCase().replace('basic ', 'an ')} for that.`, kind: 'warn', duration: 3 });
      h.events.emit('sfx', { name: 'denied' });
      return;
    }
    if (!h.beginWork()) return;
    const tool = def.requires ? h.tool(def.requires) : def.faster ? h.tool(def.faster) : null;
    if (tool) h.wearTool(tool);
    const dmg = def.faster && h.tool(def.faster) ? 2 : 1;
    nd.hp -= dmg;
    h.events.emit('sfx', { name: def.sfx, x: nd.x });
    const rng = Math.random;
    const give = (list: Yield[]) => {
      for (const y of list) {
        const q = this.roll(y, rng);
        if (q <= 0) continue;
        const left = h.inventory.add(y.id, q);
        if (q - left > 0) h.events.emit('item:gained', { id: y.id, qty: q - left });
        if (left > 0) h.events.emit('toast', { text: 'Your backpack is full.', kind: 'warn', duration: 2.5 });
      }
    };
    give(def.perHit);
    if (nd.hp <= 0) {
      give(def.final);
      nd.hp = def.hits;
      nd.regrowAt = h.day() + def.respawnDays;
    }
    this.refresh(nd);
  }

  /** Regrow nodes whose time has come. */
  update(day: number): void {
    for (const nd of this.nodes) {
      if (nd.regrowAt > 0 && day >= nd.regrowAt) {
        nd.regrowAt = 0;
        nd.hp = NODE_DEFS[nd.kind].hits;
        this.refresh(nd);
      }
    }
  }

  serialize(): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const nd of this.nodes) if (nd.regrowAt > 0 || nd.hp < NODE_DEFS[nd.kind].hits) out[nd.id] = [nd.hp, nd.regrowAt];
    return out;
  }

  deserialize(data: Record<string, unknown>): void {
    for (const nd of this.nodes) {
      const d = data[nd.id];
      if (Array.isArray(d) && typeof d[0] === 'number' && typeof d[1] === 'number') {
        nd.hp = d[0];
        nd.regrowAt = d[1];
      } else {
        nd.hp = NODE_DEFS[nd.kind].hits;
        nd.regrowAt = 0;
      }
      this.refresh(nd);
    }
  }

  get(id: string): ResourceNode | undefined {
    return this.byId.get(id);
  }
}
