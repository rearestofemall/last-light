import * as THREE from 'three';
import { hashSeed, Rng } from '../core/rng';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { Inventory, ItemStack } from '../inventory/Inventory';
import { ITEMS, type ToolKind } from '../inventory/items';
import { type ChunkMaterials, CASTS, CHUNK_SIZE, KIND_MATERIAL } from './ChunkBuilder';
import { type Terrain, VALLEY_HALF } from './Terrain';
import type { VegetationLibrary, VegKind } from './vegetation';
import { CLEARINGS, inCityBlock, PLAYABLE, regionAt, type RegionId, RIVERS, SEA_Y } from './WorldDef';

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
  rock: { look: () => 'rock', scale: [0.7, 1.1], z: -1.3 },
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
  beginWork(kind?: 'chop' | 'mine' | 'gather'): boolean;
}

const SCALE0 = new THREE.Matrix4().makeScale(0, 0, 0);
const PER_CHUNK = 16;

interface LoadedChunk {
  nodes: ResourceNode[];
  /** Keyed by `kind#variant`: nodes of one kind use several shapes. */
  meshes: Map<string, THREE.InstancedMesh>;
  interactables: Interactable[];
}

/**
 * Harvestable nodes scattered over the open world. Nodes are generated deterministically
 * per terrain chunk as it streams in; only nodes the player has changed are stored.
 */
export class ResourceSystem {
  readonly group = new THREE.Group();
  private loaded = new Map<string, LoadedChunk>();
  /** Persistent state of harvested nodes: id → [hp, regrowAt]. */
  private state = new Map<string, [number, number]>();

  constructor(
    private terrain: Terrain,
    private lib: VegetationLibrary,
    private materials: ChunkMaterials,
    private interactions: InteractionSystem,
    private host: HarvestHost,
  ) {
    this.group.name = 'resources';
  }

  setMaterials(m: ChunkMaterials): void {
    this.materials = m;
  }

  private blocked(x: number, z: number): boolean {
    const t = this.terrain;
    for (const r of RIVERS) if (t.riverFactor(r, x, z) > 0.05) return true;
    const az = Math.abs(z);
    if (az < 1.6) return true;
    for (const c of CLEARINGS) if (Math.abs(x - c.x) < c.radius + 1 && az < Math.abs(c.zBack) * 0.8 + 5) return true;
    if (inCityBlock(x) && az < 48 && az > 5.5) return true;
    if (az > VALLEY_HALF - 10) return true;
    if (x < PLAYABLE.min + 4 || x > PLAYABLE.max - 4) return true;
    if (t.heightAt3(x, z) < SEA_Y + 0.5) return true;
    if (t.gradientAt(x, z) > 0.8) return true;
    return false;
  }

  private generate(i: number, j: number): ResourceNode[] {
    const rng = new Rng(hashSeed(this.terrain.seed, i, j, 991));
    const out: ResourceNode[] = [];
    for (let k = 0; k < PER_CHUNK; k++) {
      const x = i * CHUNK_SIZE + rng.float() * CHUNK_SIZE;
      const z = j * CHUNK_SIZE + rng.float() * CHUNK_SIZE;
      const roll = rng.float();
      const scaleR = rng.float();
      const rot = rng.range(0, Math.PI * 2);
      if (this.blocked(x, z)) continue;
      const reg = regionAt(x).id;
      let r = roll;
      let kind: NodeKind = 'grass';
      for (const [kk, w] of TABLE[reg]) {
        r -= w;
        if (r <= 0) {
          kind = kk;
          break;
        }
      }
      const vis = VISUALS[kind];
      const id = `n${i}_${j}_${k}`;
      const st = this.state.get(id);
      out.push({
        id,
        kind,
        x,
        y: this.terrain.heightAt3(x, z) - 0.05,
        z,
        scale: vis.scale[0] + (vis.scale[1] - vis.scale[0]) * scaleR,
        rot,
        hp: st ? st[0] : NODE_DEFS[kind].hits,
        regrowAt: st ? st[1] : 0,
        look: vis.look(reg),
        slot: -1,
        deadSlot: -1,
      });
    }
    return out;
  }

  /** Called by the chunk streamer. */
  loadChunk(i: number, j: number): void {
    const key = `${i},${j}`;
    if (this.loaded.has(key)) return;
    const nodes = this.generate(i, j);
    const counts = new Map<string, number>();
    const bump = (k: string) => {
      const c = counts.get(k) ?? 0;
      counts.set(k, c + 1);
      return c;
    };
    for (const nd of nodes) {
      nd.slot = bump(this.liveKey(nd));
      const dead = VISUALS[nd.kind].depleted;
      if (dead) nd.deadSlot = bump(this.deadKey(nd, dead));
    }
    const meshes = new Map<string, THREE.InstancedMesh>();
    for (const [key, count] of counts) {
      const [kk, vv] = key.split('#');
      const k = kk as VegKind;
      const mesh = new THREE.InstancedMesh(this.lib.variants[k][Number(vv)], this.materials[KIND_MATERIAL[k]], count);
      mesh.castShadow = CASTS[k];
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      meshes.set(key, mesh);
      this.group.add(mesh);
    }
    const lc: LoadedChunk = { nodes, meshes, interactables: [] };
    this.loaded.set(key, lc);
    for (const nd of nodes) {
      this.refresh(lc, nd);
      const def = NODE_DEFS[nd.kind];
      const it: Interactable = {
        id: nd.id,
        x: nd.x,
        y: nd.y + 0.8,
        z: nd.z,
        radius: 1.6,
        verb: def.verb,
        label: def.label,
        enabled: () => nd.regrowAt === 0,
        onInteract: () => this.harvest(lc, nd),
      };
      lc.interactables.push(it);
      this.interactions.add(it);
    }
    for (const m of meshes.values()) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }

  unloadChunk(i: number, j: number): void {
    const key = `${i},${j}`;
    const lc = this.loaded.get(key);
    if (!lc) return;
    for (const m of lc.meshes.values()) {
      this.group.remove(m);
      m.dispose();
    }
    for (const it of lc.interactables) this.interactions.remove(it);
    this.loaded.delete(key);
  }

  /** Deterministic shape variant for a node (from its id). */
  private variantOf(nd: ResourceNode, kind: VegKind): number {
    let h = 0;
    for (let i = 0; i < nd.id.length; i++) h = (h * 31 + nd.id.charCodeAt(i)) | 0;
    return Math.abs(h) % Math.min(3, this.lib.variants[kind].length);
  }
  private liveKey(nd: ResourceNode): string {
    return `${nd.look}#${this.variantOf(nd, nd.look)}`;
  }
  private deadKey(nd: ResourceNode, dead: VegKind): string {
    return `${dead}#${this.variantOf(nd, dead)}`;
  }

  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  private refresh(lc: LoadedChunk, nd: ResourceNode): void {
    const alive = nd.regrowAt === 0;
    this.euler.set(0, nd.rot, nd.kind === 'tree' && alive ? (NODE_DEFS.tree.hits - nd.hp) * 0.03 : 0);
    this.quat.setFromEuler(this.euler);
    this.v.set(nd.x, nd.y, nd.z);
    this.s.setScalar(nd.scale);
    this.matrix.compose(this.v, this.quat, this.s);
    const live = lc.meshes.get(this.liveKey(nd))!;
    live.setMatrixAt(nd.slot, alive ? this.matrix : SCALE0);
    live.instanceMatrix.needsUpdate = true;
    const deadKind = VISUALS[nd.kind].depleted;
    if (deadKind && nd.deadSlot >= 0) {
      const dead = lc.meshes.get(this.deadKey(nd, deadKind))!;
      this.s.setScalar(nd.kind === 'bush' ? nd.scale * 0.85 : nd.scale * 1.3);
      this.matrix.compose(this.v, this.quat, this.s);
      dead.setMatrixAt(nd.deadSlot, alive ? SCALE0 : this.matrix);
      dead.instanceMatrix.needsUpdate = true;
    }
  }

  private roll(y: Yield, rng: () => number): number {
    if (y.chance !== undefined && rng() > y.chance) {
      if (!(y.bonus && this.host.tool(y.bonus))) return 0;
    }
    let q = y.min + Math.floor(rng() * (y.max - y.min + 1));
    if (y.bonus && this.host.tool(y.bonus)) q += 1;
    return q;
  }

  private harvest(lc: LoadedChunk, nd: ResourceNode): void {
    const def = NODE_DEFS[nd.kind];
    const h = this.host;
    if (def.requires && !h.tool(def.requires)) {
      h.events.emit('toast', { text: `You need ${ITEMS[def.requires].name.toLowerCase().replace('basic ', 'an ')} for that.`, kind: 'warn', duration: 3 });
      h.events.emit('sfx', { name: 'denied' });
      return;
    }
    if (!h.beginWork(def.sfx)) return;
    const tool = def.requires ? h.tool(def.requires) : def.faster ? h.tool(def.faster) : null;
    if (tool) h.wearTool(tool);
    nd.hp -= def.faster && h.tool(def.faster) ? 2 : 1;
    h.events.emit('sfx', { name: def.sfx, x: nd.x });
    const give = (list: Yield[]) => {
      for (const y of list) {
        const q = this.roll(y, Math.random);
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
    this.state.set(nd.id, [nd.hp, nd.regrowAt]);
    this.refresh(lc, nd);
  }

  /** Regrow nodes whose time has come. */
  update(day: number): void {
    for (const [id, st] of this.state) if (st[1] > 0 && day >= st[1]) this.state.delete(id);
    for (const lc of this.loaded.values()) {
      for (const nd of lc.nodes) {
        if (nd.regrowAt > 0 && day >= nd.regrowAt) {
          nd.regrowAt = 0;
          nd.hp = NODE_DEFS[nd.kind].hits;
          this.refresh(lc, nd);
        }
      }
    }
  }

  serialize(): Record<string, [number, number]> {
    return Object.fromEntries(this.state);
  }

  deserialize(data: Record<string, unknown>): void {
    this.state.clear();
    for (const [id, d] of Object.entries(data)) {
      if (Array.isArray(d) && typeof d[0] === 'number' && typeof d[1] === 'number') this.state.set(id, [d[0], d[1]]);
    }
    for (const [key, lc] of this.loaded) {
      for (const nd of lc.nodes) {
        const st = this.state.get(nd.id);
        nd.hp = st ? st[0] : NODE_DEFS[nd.kind].hits;
        nd.regrowAt = st ? st[1] : 0;
        this.refresh(lc, nd);
      }
      void key;
    }
  }
}
