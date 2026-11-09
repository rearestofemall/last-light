import * as THREE from 'three';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { ContainerRegistry, Inventory } from '../inventory/Inventory';
import { ITEMS } from '../inventory/items';
import { type LightSource, type LightSystem, makeLight } from '../lighting/LightSystem';
import type { Collider, CollisionWorld } from '../physics/CollisionWorld';
import type { Body } from '../physics/KinematicBody';
import type { Terrain } from '../world/Terrain';
import { buildPieceMesh, CELL, ghostMaterial, LEVEL_H, PIECES, type Slot, Z_BACK, Z_FRONT } from './pieces';

export interface Placed {
  uid: string;
  piece: string;
  /** Cell index (or edge index for edge pieces). */
  cell: number;
  level: number;
  /** World y of the structure's ground floor (level 0). */
  base: number;
  open: boolean;
  group: THREE.Group;
  door?: THREE.Object3D;
  lid?: THREE.Object3D;
  colliders: Collider[];
  interactable?: Interactable;
  light?: LightSource;
}

export interface Candidate {
  piece: string;
  slot: Slot;
  cell: number;
  level: number;
  base: number;
  x: number;
  y: number;
  ok: boolean;
  reason: string;
}

export interface BuildHost {
  inventory: Inventory;
  playerBody(): Body;
  sleep(quality: number, at: { x: number; y: number }): void;
  openContainer(id: string, title: string): void;
  openCrafting(): void;
  day(): number;
}

export interface SavedPiece {
  piece: string;
  cell: number;
  level: number;
  base: number;
  open?: boolean;
  fuel?: number;
  on?: boolean;
}

const key = (slot: Slot, cell: number, level: number) => `${slot}:${cell}:${level}`;
const MAX_LEVEL = 3;

/**
 * Modular grid construction in the gameplay plane. Cells are 2 m wide, storeys 3 m tall.
 * Edge pieces (walls, doors) sit on cell boundaries and block movement; floors, roofs,
 * back walls and furniture occupy cells. Everything is persisted.
 */
export class BuildSystem {
  readonly group = new THREE.Group();
  private placed = new Map<string, Placed>();
  active = false;
  removeMode = false;
  selected: string | null = null;
  candidate: Candidate | null = null;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private removeTarget: Placed | null = null;

  constructor(
    private terrain: Terrain,
    private collision: CollisionWorld,
    private interactions: InteractionSystem,
    private lights: LightSystem,
    private containers: ContainerRegistry,
    private events: GameEventBus,
    private host: BuildHost,
  ) {
    this.group.name = 'structures';
  }

  // ------------------------------------------------------------------ queries
  get pieces(): IterableIterator<Placed> {
    return this.placed.values();
  }

  private at(slot: Slot, cell: number, level: number): Placed | undefined {
    return this.placed.get(key(slot, cell, level));
  }

  /** Structure base height for a cell, inherited from neighbours so storeys line up. */
  private baseFor(cell: number): number {
    for (const p of this.placed.values()) {
      const c = PIECES[p.piece].slot === 'edge' ? [p.cell - 1, p.cell] : [p.cell];
      if (c.includes(cell) || c.includes(cell - 1) || c.includes(cell + 1)) {
        const ground = this.groundTop(cell);
        if (Math.abs(ground - p.base) < 1.6) return p.base;
      }
    }
    return Math.ceil(this.groundTop(cell) * 4) / 4 + 0.05;
  }

  private groundTop(cell: number): number {
    const x0 = cell * CELL;
    return Math.max(this.terrain.heightAt(x0 + 0.1), this.terrain.heightAt(x0 + CELL / 2), this.terrain.heightAt(x0 + CELL - 0.1));
  }

  private groundBottom(cell: number): number {
    const x0 = cell * CELL;
    return Math.min(this.terrain.heightAt(x0 + 0.1), this.terrain.heightAt(x0 + CELL / 2), this.terrain.heightAt(x0 + CELL - 0.1));
  }

  /** 0 = exposed, 1 = roofed, 2 = roofed with a back wall. */
  shelterAt(x: number, y: number): number {
    const cell = Math.floor(x / CELL);
    let best = 0;
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const roof = this.at('roof', cell, level);
      const above = this.at('floor', cell, level + 1);
      const r = roof ?? above;
      if (!r) continue;
      const roofY = r.base + (level + 1) * LEVEL_H;
      if (roofY < y + 1.5 || roofY > y + 7) continue;
      const back = this.at('back', cell, level);
      best = Math.max(best, back ? 2 : 1);
    }
    return best;
  }

  // ------------------------------------------------------------------ build mode
  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.clearGhost();
      this.candidate = null;
      this.removeMode = false;
      this.highlightRemove(null);
    }
  }

  /** Placeable item ids currently in the backpack. */
  available(): string[] {
    const out: string[] = [];
    for (const id of Object.keys(PIECES)) if (this.host.inventory.count(PIECES[id].item) > 0) out.push(id);
    return out;
  }

  private clearGhost(): void {
    if (this.ghost) this.group.remove(this.ghost);
    this.ghost = null;
    this.ghostKey = '';
  }

  /** Update the preview from the cursor's world position. */
  updateCursor(wx: number, wy: number): void {
    if (!this.active) return;
    if (this.removeMode) {
      this.clearGhost();
      this.candidate = null;
      this.highlightRemove(this.pick(wx, wy));
      return;
    }
    this.highlightRemove(null);
    if (!this.selected || this.host.inventory.count(PIECES[this.selected].item) <= 0) {
      this.selected = this.available()[0] ?? null;
    }
    if (!this.selected) {
      this.clearGhost();
      this.candidate = null;
      return;
    }
    const c = this.makeCandidate(this.selected, wx, wy);
    this.candidate = c;
    const gk = `${c.piece}:${c.cell}:${c.level}:${c.base}:${c.ok}`;
    if (gk !== this.ghostKey) {
      this.clearGhost();
      const { group } = buildPieceMesh(c.piece, c.level === 0);
      const mat = ghostMaterial(c.ok ? 'ok' : 'bad');
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.material = mat;
          mesh.castShadow = false;
        }
      });
      group.position.set(c.x, c.y, 0);
      this.ghost = group;
      this.ghostKey = gk;
      this.group.add(group);
    }
  }

  private makeCandidate(piece: string, wx: number, wy: number): Candidate {
    const slot = PIECES[piece].slot;
    const edge = slot === 'edge';
    const cell = edge ? Math.round(wx / CELL) : Math.floor(wx / CELL);
    const baseCell = edge ? (wx < cell * CELL ? cell - 1 : cell) : cell;
    const base = this.baseFor(baseCell);
    const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor((wy - base + 0.4) / LEVEL_H)));
    const x = cell * CELL;
    const y = base + level * LEVEL_H;
    const c: Candidate = { piece, slot, cell, level, base, x, y, ok: false, reason: '' };
    c.reason = this.validate(c);
    c.ok = c.reason === '';
    return c;
  }

  private validate(c: Candidate): string {
    if (this.host.inventory.count(PIECES[c.piece].item) <= 0) return `No ${ITEMS[PIECES[c.piece].item].name} in your backpack`;
    if (this.at(c.slot, c.cell, c.level)) return 'Something is already built here';
    const x0 = c.slot === 'edge' ? c.x - 0.15 : c.x;
    const x1 = c.slot === 'edge' ? c.x + 0.15 : c.x + CELL;
    if (x0 < this.collision.bounds.min + 2 || x1 > this.collision.bounds.max - 2) return 'Too close to the edge of the world';
    if (this.collision.isUnderground(c.x + 1, c.y)) return "You can't build underground";
    if (this.terrain.waterAt((x0 + x1) / 2) || this.terrain.waterAt(x0) || this.terrain.waterAt(x1)) return "You can't build in water";
    const cells = c.slot === 'edge' ? [c.cell - 1, c.cell] : [c.cell];
    // Authored structures (cabins, rocks) block building.
    for (const col of this.collision.query(x0, x1)) {
      if (col.tag?.startsWith('build:')) continue;
      if (col.minY < c.y + LEVEL_H && col.maxY > c.y + 0.1) return 'Blocked by something solid';
    }
    if (c.level === 0) {
      const cellsGround = c.slot === 'edge' ? cells.filter((cc) => this.at('floor', cc, 0) === undefined) : cells;
      for (const cc of cellsGround) {
        if (c.slot === 'floor') {
          if (this.groundBottom(cc) < c.base - 1.6) return 'Ground is too uneven';
        } else if (!this.at('floor', cc, 0) && Math.abs(this.groundTop(cc) - c.base) > 0.7) {
          return 'Ground is too uneven';
        }
      }
    } else {
      const below = c.level - 1;
      let supported = false;
      switch (c.slot) {
        case 'floor':
        case 'roof':
          supported =
            !!this.at('edge', c.cell, below) ||
            !!this.at('edge', c.cell + 1, below) ||
            !!this.at('floor', c.cell - 1, c.level) ||
            !!this.at('floor', c.cell + 1, c.level) ||
            !!this.at('back', c.cell, below);
          if (c.slot === 'roof') supported ||= !!this.at('edge', c.cell, c.level) || !!this.at('edge', c.cell + 1, c.level) || !!this.at('back', c.cell, c.level) || !!this.at('roof', c.cell - 1, c.level) || !!this.at('roof', c.cell + 1, c.level);
          break;
        case 'edge':
          supported = !!this.at('edge', c.cell, below) || cells.some((cc) => !!this.at('floor', cc, c.level));
          break;
        case 'back':
        case 'furn':
          supported = !!this.at('floor', c.cell, c.level) || (c.slot === 'back' && !!this.at('back', c.cell, below));
          break;
      }
      if (!supported) return 'Needs support from below';
    }
    if (c.slot === 'roof' && c.level === 0 && !this.at('edge', c.cell, 0) && !this.at('edge', c.cell + 1, 0) && !this.at('back', c.cell, 0) && !this.at('roof', c.cell - 1, 0) && !this.at('roof', c.cell + 1, 0)) {
      return 'Roofs need a wall or another roof to rest on';
    }
    // Solid pieces can't be built through the player.
    if (c.slot === 'edge' || c.slot === 'floor') {
      const b = this.host.playerBody();
      const px0 = b.x - b.halfWidth;
      const px1 = b.x + b.halfWidth;
      const yb = c.slot === 'floor' ? c.y - 0.3 : c.y;
      const yt = c.slot === 'floor' ? c.y : c.y + LEVEL_H;
      if (px1 > x0 && px0 < x1 && b.y < yt - 0.05 && b.y + b.height > yb) return 'You are in the way';
    }
    return '';
  }

  /** Place the current candidate. */
  confirm(): boolean {
    const c = this.candidate;
    if (!c) return false;
    if (!c.ok) {
      this.events.emit('toast', { text: c.reason, kind: 'warn', duration: 2.5 });
      this.events.emit('sfx', { name: 'denied' });
      return false;
    }
    if (this.host.inventory.remove(PIECES[c.piece].item, 1) !== 1) return false;
    this.create({ piece: c.piece, cell: c.cell, level: c.level, base: c.base });
    this.events.emit('sfx', { name: 'place', x: c.x });
    this.ghostKey = '';
    return true;
  }

  private pick(wx: number, wy: number): Placed | null {
    let best: Placed | null = null;
    let bd = Infinity;
    for (const p of this.placed.values()) {
      const slot = PIECES[p.piece].slot;
      const y0 = p.base + p.level * LEVEL_H;
      const cx = slot === 'edge' ? p.cell * CELL : p.cell * CELL + CELL / 2;
      const cy = slot === 'floor' ? y0 : slot === 'roof' ? y0 + LEVEL_H : y0 + (slot === 'furn' ? 0.6 : LEVEL_H / 2);
      const d = Math.abs(wx - cx) * (slot === 'edge' ? 1.6 : 1) + Math.abs(wy - cy) * 0.7;
      if (d < bd && d < 1.8) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private highlightRemove(p: Placed | null): void {
    if (p === this.removeTarget) return;
    const restore = (pl: Placed) =>
      pl.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.mat) {
          m.material = m.userData.mat;
          delete m.userData.mat;
        }
      });
    if (this.removeTarget) restore(this.removeTarget);
    this.removeTarget = p;
    if (p) {
      p.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.userData.mat = m.material;
          m.material = ghostMaterial('remove');
        }
      });
    }
  }

  /** Demolish the piece under the cursor, refunding its item. */
  demolish(): boolean {
    const p = this.removeTarget;
    if (!p) return false;
    const def = PIECES[p.piece];
    // Don't pull the floor out from under things.
    if (def.slot === 'floor' && (this.at('furn', p.cell, p.level) || this.at('back', p.cell, p.level))) {
      this.events.emit('toast', { text: 'Remove what stands on this floor first.', kind: 'warn', duration: 2.5 });
      return false;
    }
    if (p.piece === 'chest') {
      const inv = this.containers.get(p.uid)?.inv;
      if (inv && inv.slots.some((s) => s)) {
        this.events.emit('toast', { text: 'Empty the chest before taking it apart.', kind: 'warn', duration: 2.5 });
        return false;
      }
    }
    if (this.host.inventory.add(def.item, 1) > 0) {
      this.events.emit('toast', { text: 'No room in your backpack.', kind: 'warn', duration: 2.5 });
      return false;
    }
    this.highlightRemove(null);
    this.destroy(p);
    this.events.emit('sfx', { name: 'remove' });
    return true;
  }

  // ------------------------------------------------------------------ lifecycle
  create(s: SavedPiece): Placed {
    const def = PIECES[s.piece];
    // Deterministic id from grid position: chest contents and saves key off it.
    const uid = `build-${key(def.slot, s.cell, s.level)}`;
    const { group, door, lid } = buildPieceMesh(s.piece, s.level === 0);
    const x = s.cell * CELL;
    const y = s.base + s.level * LEVEL_H;
    group.position.set(x, y, 0);
    this.group.add(group);
    const p: Placed = { uid, piece: s.piece, cell: s.cell, level: s.level, base: s.base, open: !!s.open, group, door, lid, colliders: [] };
    const tag = `build:${uid}`;
    const addCol = (c: Omit<Collider, 'tag'>) => p.colliders.push(this.collision.add({ ...c, tag }));
    switch (def.slot) {
      case 'floor':
        addCol({ minX: x, maxX: x + CELL, minY: y - (s.level === 0 ? 2 : 0.3), maxY: y, kind: s.level === 0 ? 'solid' : 'oneway', surface: 'wood' });
        break;
      case 'edge':
        if (s.piece === 'door') addCol({ minX: x - 0.12, maxX: x + 0.12, minY: y + 2.3, maxY: y + LEVEL_H, kind: 'solid', surface: 'wood' });
        else addCol({ minX: x - 0.12, maxX: x + 0.12, minY: y, maxY: y + LEVEL_H, kind: 'solid', surface: 'wood' });
        break;
      case 'roof':
        addCol({ minX: x, maxX: x + CELL, minY: y + LEVEL_H, maxY: y + LEVEL_H + 0.3, kind: 'oneway', surface: 'wood' });
        break;
      default:
        break;
    }
    if (s.piece === 'table') addCol({ minX: x + 0.2, maxX: x + CELL - 0.2, minY: y + 0.6, maxY: y + 0.92, kind: 'oneway', surface: 'wood' });
    this.placed.set(key(def.slot, s.cell, s.level), p);
    this.attachBehaviour(p, s);
    if (s.piece === 'door') this.setDoor(p, p.open);
    return p;
  }

  private attachBehaviour(p: Placed, s: SavedPiece): void {
    const x = p.cell * CELL + CELL / 2;
    const y = p.base + p.level * LEVEL_H;
    const inv = this.host.inventory;
    const ev = this.events;
    switch (p.piece) {
      case 'door': {
        p.interactable = {
          id: p.uid,
          x: p.cell * CELL,
          y: y + 1,
          radius: 1.4,
          verb: '',
          label: '',
          prompt: () => (p.open ? 'Close door' : 'Open door'),
          onInteract: () => {
            const b = this.host.playerBody();
            if (p.open && Math.abs(b.x - p.cell * CELL) < b.halfWidth + 0.15) {
              ev.emit('toast', { text: 'Step out of the doorway first.', kind: 'info', duration: 2 });
              return;
            }
            this.setDoor(p, !p.open);
            ev.emit('sfx', { name: 'door', x: p.cell * CELL });
          },
        };
        break;
      }
      case 'chest': {
        this.containers.register(p.uid, 'Storage Chest', 16);
        p.interactable = {
          id: p.uid,
          x,
          y: y + 0.6,
          radius: 1.3,
          verb: 'Open',
          label: 'chest',
          onInteract: () => {
            ev.emit('sfx', { name: 'chest', x });
            this.host.openContainer(p.uid, 'Storage Chest');
          },
        };
        break;
      }
      case 'bedroll':
      case 'bed': {
        const q = p.piece === 'bed' ? 1.3 : 1;
        p.interactable = {
          id: p.uid,
          x,
          y: y + 0.5,
          radius: 1.3,
          verb: 'Sleep in',
          label: p.piece === 'bed' ? 'bed' : 'bedroll',
          onInteract: () => this.host.sleep(q, { x, y }),
        };
        break;
      }
      case 'workbench':
        p.interactable = { id: p.uid, x, y: y + 0.9, radius: 1.5, verb: 'Use', label: 'workbench', onInteract: () => this.host.openCrafting() };
        break;
      case 'campfire':
      case 'lamp': {
        const kind = p.piece === 'campfire' ? 'campfire' : 'lamp';
        const light = makeLight(p.uid, kind, kind === 'lamp' ? x + 0.5 : x, kind === 'lamp' ? y + 1.7 : y + 0.05, kind === 'lamp' ? -1.2 : -0.6);
        light.fuel = s.fuel ?? (kind === 'campfire' ? 0 : 0);
        light.on = !!s.on && light.fuel > 0;
        light.sheltered = this.shelterAt(x, y) > 0;
        p.light = this.lights.add(light);
        p.interactable = fireInteractable(p.uid, light, x, y + 0.6, inv, this.lights, ev);
        break;
      }
    }
    if (p.interactable) this.interactions.add(p.interactable);
  }

  private setDoor(p: Placed, open: boolean): void {
    p.open = open;
    if (p.door) p.door.rotation.y = open ? -1.35 : 0;
    // Closed doors block the doorway; open doors leave only the lintel.
    const tag = `build:${p.uid}`;
    const existing = p.colliders.find((c) => c.minY < p.base + p.level * LEVEL_H + 0.1);
    const y = p.base + p.level * LEVEL_H;
    const x = p.cell * CELL;
    if (!open && !existing) p.colliders.push(this.collision.add({ minX: x - 0.12, maxX: x + 0.12, minY: y, maxY: y + 2.3, kind: 'solid', surface: 'wood', tag }));
    if (open && existing) {
      this.collision.remove(existing);
      p.colliders.splice(p.colliders.indexOf(existing), 1);
    }
  }

  private destroy(p: Placed): void {
    this.group.remove(p.group);
    for (const c of p.colliders) this.collision.remove(c);
    if (p.interactable) this.interactions.remove(p.interactable);
    if (p.light) this.lights.remove(p.light);
    if (p.piece === 'chest') this.containers.delete(p.uid);
    this.placed.delete(key(PIECES[p.piece].slot, p.cell, p.level));
    p.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  /** Re-evaluate shelter for lights (after roofs change). */
  update(): void {
    for (const p of this.placed.values()) {
      if (p.light) p.light.sheltered = this.shelterAt(p.cell * CELL + 1, p.base + p.level * LEVEL_H) > 0;
      if (p.lid) p.lid.rotation.x = 0;
    }
  }

  clear(): void {
    for (const p of [...this.placed.values()]) this.destroy(p);
  }

  serialize(): SavedPiece[] {
    const pieces: SavedPiece[] = [];
    for (const p of this.placed.values()) {
      const s: SavedPiece = { piece: p.piece, cell: p.cell, level: p.level, base: p.base };
      if (p.piece === 'door') s.open = p.open;
      if (p.light) {
        s.fuel = Number.isFinite(p.light.fuel) ? Math.round(p.light.fuel) : 0;
        s.on = p.light.on;
      }
      pieces.push(s);
    }
    return pieces;
  }

  /** Recreate structures. Chest contents are restored afterwards through the container registry. */
  deserialize(pieces: SavedPiece[]): void {
    this.clear();
    // Floors and walls first so support exists for everything above.
    const order: Slot[] = ['floor', 'edge', 'back', 'roof', 'furn'];
    const sorted = [...pieces].filter((s) => PIECES[s.piece]).sort((a, b) => a.level - b.level || order.indexOf(PIECES[a.piece].slot) - order.indexOf(PIECES[b.piece].slot));
    for (const s of sorted) {
      if (this.at(PIECES[s.piece].slot, s.cell, s.level)) continue;
      this.create(s);
    }
    this.update();
  }
}

/** E: light / feed the fire, R: put it out. Shared by placed fires, lamps and site fire barrels. */
export function fireInteractable(id: string, light: LightSource, x: number, y: number, inv: Inventory, lights: LightSystem, ev: GameEventBus): Interactable {
  const isLamp = light.kind === 'lamp';
  const fuelItems = isLamp ? ['fuel'] : ['wood', 'fuel', 'cloth', 'fiber'];
  const fuelName = () => {
    const f = fuelItems.find((i) => inv.count(i) > 0);
    return f ? ITEMS[f].name.toLowerCase() : null;
  };
  const what = light.kind === 'campfire' ? 'fire' : light.kind === 'barrel' ? 'fire barrel' : 'lamp';
  return {
    id,
    x,
    y,
    radius: 1.5,
    verb: '',
    label: '',
    priority: 0.1,
    prompt: () => {
      const f = fuelName();
      if (light.on) return f ? `Add ${f} to the ${what}` : `The ${what} is burning`;
      if (light.fuel > 5) return `Light the ${what}`;
      return f ? `Fuel the ${what} with ${f}` : `The ${what} needs ${isLamp ? 'lamp oil' : 'wood'}`;
    },
    altPrompt: () => (light.on ? `Put out the ${what}` : null),
    onAlt: () => lights.extinguish(light),
    onInteract: () => {
      if (!light.on && light.fuel > 5) {
        lights.ignite(light);
        return;
      }
      const f = fuelItems.find((i) => inv.count(i) > 0);
      if (!f) {
        ev.emit('toast', { text: isLamp ? 'You need lamp oil.' : 'You need something to burn: wood, fibre, cloth or oil.', kind: 'warn', duration: 3 });
        ev.emit('sfx', { name: 'denied' });
        return;
      }
      if (light.fuel >= light.maxFuel - 30) {
        ev.emit('toast', { text: `The ${what} is fully stocked.`, kind: 'info', duration: 2 });
        return;
      }
      inv.remove(f, 1);
      light.fuel = Math.min(light.maxFuel, light.fuel + (isLamp ? 900 : (ITEMS[f].burn ?? 60) * 2));
      if (!light.on) lights.ignite(light);
      else ev.emit('sfx', { name: 'ignite', x });
    },
  };
}

/** Exported for tests. */
export { key as pieceKey, Z_BACK as BUILD_Z_BACK, Z_FRONT as BUILD_Z_FRONT };
