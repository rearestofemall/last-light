import * as THREE from 'three';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { ContainerRegistry, Inventory } from '../inventory/Inventory';
import { ITEMS } from '../inventory/items';
import { type LightSource, type LightSystem, makeLight } from '../lighting/LightSystem';
import type { Collider, CollisionWorld } from '../physics/CollisionWorld';
import type { Body } from '../physics/KinematicBody';
import type { Terrain } from '../world/Terrain';
import { buildPieceMesh, CELL, ghostMaterial, LEVEL_H, PIECES, type Slot } from './pieces';

/** Which axis an edge piece's wall is perpendicular to: 'x' walls stand at x = i·2. */
export type EdgeAxis = 'x' | 'z';

export interface SavedPiece {
  piece: string;
  i: number;
  j: number;
  level: number;
  base: number;
  edge?: EdgeAxis;
  rot?: number;
  open?: boolean;
  fuel?: number;
  on?: boolean;
}

export interface Placed extends SavedPiece {
  uid: string;
  open: boolean;
  group: THREE.Group;
  door?: THREE.Object3D;
  lid?: THREE.Object3D;
  colliders: Collider[];
  interactable?: Interactable;
  light?: LightSource;
}

export interface Candidate extends SavedPiece {
  slot: Slot;
  ok: boolean;
  reason: string;
}

export interface BuildHost {
  inventory: Inventory;
  playerBody(): Body;
  sleep(quality: number, at: { x: number; y: number; z: number }): void;
  openContainer(id: string, title: string): void;
  openCrafting(): void;
  day(): number;
}

const MAX_LEVEL = 3;
const keyOf = (slot: Slot, i: number, j: number, level: number, edge?: EdgeAxis) => `${slot === 'edge' ? `e${edge}` : slot}:${i}:${j}:${level}`;

/**
 * Modular grid construction in the open world. Cells are 2 × 2 m, storeys 3 m. Walls sit on
 * cell edges along either axis; floors, roofs and furniture occupy cells. Everything persists.
 */
export class BuildSystem {
  readonly group = new THREE.Group();
  private placed = new Map<string, Placed>();
  active = false;
  removeMode = false;
  selected: string | null = null;
  /** Quarter turns for furniture. */
  rotation = 0;
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

  get pieces(): IterableIterator<Placed> {
    return this.placed.values();
  }

  private at(slot: Slot, i: number, j: number, level: number, edge?: EdgeAxis): Placed | undefined {
    return this.placed.get(keyOf(slot, i, j, level, edge));
  }

  /** The four edges around cell (i, j). */
  private edgesOf(i: number, j: number, level: number): (Placed | undefined)[] {
    return [this.at('edge', i, j, level, 'x'), this.at('edge', i + 1, j, level, 'x'), this.at('edge', i, j, level, 'z'), this.at('edge', i, j + 1, level, 'z')];
  }

  private groundRange(i: number, j: number): [number, number] {
    const t = this.terrain;
    const x0 = i * CELL;
    const z0 = j * CELL;
    const hs = [t.heightAt3(x0 + 0.1, z0 + 0.1), t.heightAt3(x0 + CELL - 0.1, z0 + 0.1), t.heightAt3(x0 + 0.1, z0 + CELL - 0.1), t.heightAt3(x0 + CELL - 0.1, z0 + CELL - 0.1), t.heightAt3(x0 + 1, z0 + 1)];
    return [Math.min(...hs), Math.max(...hs)];
  }

  /** Structure base height, inherited from neighbours so storeys line up. */
  private baseFor(i: number, j: number): number {
    const [, top] = this.groundRange(i, j);
    for (const p of this.placed.values()) {
      if (Math.abs(p.i - i) <= 1 && Math.abs(p.j - j) <= 1 && Math.abs(top - p.base) < 1.6) return p.base;
    }
    return Math.ceil(top * 4) / 4 + 0.05;
  }

  /** 0 = exposed, 1 = roofed, 2 = roofed and mostly walled in. */
  shelterAt(x: number, y: number, z: number): number {
    const i = Math.floor(x / CELL);
    const j = Math.floor(z / CELL);
    let best = 0;
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const r = this.at('roof', i, j, level) ?? this.at('floor', i, j, level + 1);
      if (!r) continue;
      const roofY = r.base + (level + 1) * LEVEL_H;
      if (roofY < y + 1.5 || roofY > y + 7) continue;
      const walls = this.edgesOf(i, j, level).filter(Boolean).length;
      best = Math.max(best, walls >= 3 ? 2 : 1);
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

  available(): string[] {
    return Object.keys(PIECES).filter((id) => this.host.inventory.count(PIECES[id].item) > 0);
  }

  private clearGhost(): void {
    if (this.ghost) this.group.remove(this.ghost);
    this.ghost = null;
    this.ghostKey = '';
  }

  /** Update the preview from the point the crosshair is aiming at. */
  updateCursor(hit: THREE.Vector3 | null): void {
    if (!this.active) return;
    if (this.removeMode) {
      this.clearGhost();
      this.candidate = null;
      this.highlightRemove(hit ? this.pick(hit) : null);
      return;
    }
    this.highlightRemove(null);
    if (!this.selected || this.host.inventory.count(PIECES[this.selected].item) <= 0) this.selected = this.available()[0] ?? null;
    if (!this.selected || !hit) {
      this.clearGhost();
      this.candidate = null;
      return;
    }
    const c = this.makeCandidate(this.selected, hit);
    this.candidate = c;
    const gk = `${c.piece}:${c.i}:${c.j}:${c.level}:${c.edge}:${c.rot}:${c.base}:${c.ok}`;
    if (gk !== this.ghostKey) {
      this.clearGhost();
      const g = this.makeGroup(c);
      const mat = ghostMaterial(c.ok ? 'ok' : 'bad');
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.material = mat;
          mesh.castShadow = false;
          mesh.userData.ghost = true;
        }
      });
      this.ghost = g;
      this.ghostKey = gk;
      this.group.add(g);
    }
  }

  private makeCandidate(piece: string, hit: THREE.Vector3): Candidate {
    const slot = PIECES[piece].slot;
    let i = Math.floor(hit.x / CELL);
    let j = Math.floor(hit.z / CELL);
    let edge: EdgeAxis | undefined;
    if (slot === 'edge') {
      const fx = hit.x / CELL - i;
      const fz = hit.z / CELL - j;
      const opts: [number, EdgeAxis, number, number][] = [
        [fx, 'x', i, j],
        [1 - fx, 'x', i + 1, j],
        [fz, 'z', i, j],
        [1 - fz, 'z', i, j + 1],
      ];
      opts.sort((a, b) => a[0] - b[0]);
      [, edge, i, j] = opts[0];
    }
    const base = this.baseFor(i, j);
    const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor((hit.y - base + 0.4) / LEVEL_H)));
    const c: Candidate = { piece, slot, i, j, level, base, edge, rot: this.rotation, ok: false, reason: '' };
    c.reason = this.validate(c);
    c.ok = c.reason === '';
    return c;
  }

  /** World AABB of a piece's footprint. */
  private footprint(c: SavedPiece): { x0: number; x1: number; z0: number; z1: number } {
    const slot = PIECES[c.piece].slot;
    if (slot === 'edge') {
      return c.edge === 'x' ? { x0: c.i * CELL - 0.12, x1: c.i * CELL + 0.12, z0: c.j * CELL, z1: c.j * CELL + CELL } : { x0: c.i * CELL, x1: c.i * CELL + CELL, z0: c.j * CELL - 0.12, z1: c.j * CELL + 0.12 };
    }
    return { x0: c.i * CELL, x1: c.i * CELL + CELL, z0: c.j * CELL, z1: c.j * CELL + CELL };
  }

  private validate(c: Candidate): string {
    if (this.host.inventory.count(PIECES[c.piece].item) <= 0) return `No ${ITEMS[PIECES[c.piece].item].name} in your backpack`;
    if (this.at(c.slot, c.i, c.j, c.level, c.edge)) return 'Something is already built here';
    const f = this.footprint(c);
    const y = c.base + c.level * LEVEL_H;
    const b = this.collision.bounds;
    if (f.x0 < b.minX + 2 || f.x1 > b.maxX - 2 || f.z0 < b.minZ + 2 || f.z1 > b.maxZ - 2) return 'Too close to the edge of the world';
    if (this.collision.isUnderground(f.x0 + 0.5, f.z0 + 0.5, y)) return "You can't build underground";
    for (const [x, z] of [
      [f.x0, f.z0],
      [f.x1, f.z1],
      [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2],
    ]) {
      if (this.terrain.waterAt(x, z)) return "You can't build in water";
    }
    for (const col of this.collision.query(f.x0, f.x1, f.z0, f.z1)) {
      if (col.tag?.startsWith('build:')) continue;
      if (col.minY < y + LEVEL_H && col.maxY > y + 0.1) return 'Blocked by something solid';
    }
    const [gMin, gMax] = this.groundRange(c.i, c.j);
    if (c.level === 0) {
      if (c.slot === 'floor') {
        if (gMin < c.base - 1.6) return 'Ground is too uneven';
      } else if (c.slot === 'furn') {
        if (!this.at('floor', c.i, c.j, 0) && Math.abs(gMax - c.base) > 0.7) return 'Ground is too uneven';
      } else if (c.slot === 'edge') {
        const ni = c.edge === 'x' ? c.i - 1 : c.i;
        const nj = c.edge === 'z' ? c.j - 1 : c.j;
        const onFloor = this.at('floor', c.i, c.j, 0) || this.at('floor', ni, nj, 0);
        if (!onFloor && Math.abs(gMax - c.base) > 0.7) return 'Ground is too uneven';
      } else if (c.slot === 'roof') {
        if (!this.edgesOf(c.i, c.j, 0).some(Boolean) && !this.at('roof', c.i - 1, c.j, 0) && !this.at('roof', c.i + 1, c.j, 0) && !this.at('roof', c.i, c.j - 1, 0) && !this.at('roof', c.i, c.j + 1, 0)) {
          return 'Roofs need a wall or another roof to rest on';
        }
      }
    } else {
      const L = c.level;
      let supported = false;
      if (c.slot === 'floor') supported = this.edgesOf(c.i, c.j, L - 1).some(Boolean) || !!this.at('floor', c.i - 1, c.j, L) || !!this.at('floor', c.i + 1, c.j, L) || !!this.at('floor', c.i, c.j - 1, L) || !!this.at('floor', c.i, c.j + 1, L);
      else if (c.slot === 'edge') {
        const ni = c.edge === 'x' ? c.i - 1 : c.i;
        const nj = c.edge === 'z' ? c.j - 1 : c.j;
        supported = !!this.at('edge', c.i, c.j, L - 1, c.edge) || !!this.at('floor', c.i, c.j, L) || !!this.at('floor', ni, nj, L);
      } else if (c.slot === 'roof') supported = this.edgesOf(c.i, c.j, L).some(Boolean);
      else supported = !!this.at('floor', c.i, c.j, L);
      if (!supported) return 'Needs support from below';
    }
    if (c.slot === 'edge' || c.slot === 'floor') {
      const pb = this.host.playerBody();
      const yb = c.slot === 'floor' ? y - 0.3 : y;
      const yt = c.slot === 'floor' ? y : y + LEVEL_H;
      if (pb.x + pb.r > f.x0 && pb.x - pb.r < f.x1 && pb.z + pb.r > f.z0 && pb.z - pb.r < f.z1 && pb.y < yt - 0.05 && pb.y + pb.height > yb) return 'You are in the way';
    }
    return '';
  }

  /** Rotate furniture a quarter turn (R in build mode). */
  rotate(): void {
    this.rotation = (this.rotation + 1) % 4;
    this.ghostKey = '';
  }

  confirm(): boolean {
    const c = this.candidate;
    if (!c) return false;
    if (!c.ok) {
      this.events.emit('toast', { text: c.reason, kind: 'warn', duration: 2.5 });
      this.events.emit('sfx', { name: 'denied' });
      return false;
    }
    if (this.host.inventory.remove(PIECES[c.piece].item, 1) !== 1) return false;
    this.create({ piece: c.piece, i: c.i, j: c.j, level: c.level, base: c.base, edge: c.edge, rot: c.slot === 'furn' ? c.rot : undefined });
    this.events.emit('sfx', { name: 'place', x: c.i * CELL });
    this.ghostKey = '';
    return true;
  }

  private pick(hit: THREE.Vector3): Placed | null {
    let best: Placed | null = null;
    let bd = 1.6;
    for (const p of this.placed.values()) {
      const f = this.footprint(p);
      const y0 = p.base + p.level * LEVEL_H;
      const slot = PIECES[p.piece].slot;
      const cy = slot === 'floor' ? y0 : slot === 'roof' ? y0 + LEVEL_H : y0 + (slot === 'furn' ? 0.6 : LEVEL_H / 2);
      const cx = Math.min(f.x1, Math.max(f.x0, hit.x));
      const cz = Math.min(f.z1, Math.max(f.z0, hit.z));
      const d = Math.hypot(hit.x - cx, hit.z - cz) + Math.abs(hit.y - cy) * 0.5;
      if (d < bd) {
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

  demolish(): boolean {
    const p = this.removeTarget;
    if (!p) return false;
    const def = PIECES[p.piece];
    if (def.slot === 'floor' && this.at('furn', p.i, p.j, p.level)) {
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
  private makeGroup(s: SavedPiece): THREE.Group {
    const slot = PIECES[s.piece].slot;
    const { group, door, lid } = buildPieceMesh(s.piece, s.level === 0);
    const y = s.base + s.level * LEVEL_H;
    const outer = new THREE.Group();
    if (slot === 'edge') {
      outer.position.set(s.i * CELL, y, s.j * CELL);
      if (s.edge === 'z') outer.rotation.y = Math.PI / 2;
      outer.add(group);
    } else {
      outer.position.set(s.i * CELL + CELL / 2, y, s.j * CELL + CELL / 2);
      outer.rotation.y = ((s.rot ?? 0) * Math.PI) / 2;
      group.position.set(-CELL / 2, 0, -CELL / 2);
      outer.add(group);
    }
    outer.userData.door = door;
    outer.userData.lid = lid;
    return outer;
  }

  create(s: SavedPiece): Placed {
    const def = PIECES[s.piece];
    const uid = `build-${keyOf(def.slot, s.i, s.j, s.level, s.edge)}`;
    const group = this.makeGroup(s);
    this.group.add(group);
    const p: Placed = { ...s, uid, open: !!s.open, group, door: group.userData.door, lid: group.userData.lid, colliders: [] };
    const tag = `build:${uid}`;
    const f = this.footprint(s);
    const y = s.base + s.level * LEVEL_H;
    const addCol = (minY: number, maxY: number, kind: 'solid' | 'oneway') => p.colliders.push(this.collision.add({ minX: f.x0, maxX: f.x1, minZ: f.z0, maxZ: f.z1, minY, maxY, kind, surface: 'wood', tag }));
    switch (def.slot) {
      case 'floor':
        if (s.level === 0) addCol(y - 2, y, 'solid');
        else addCol(y - 0.3, y, 'oneway');
        break;
      case 'edge':
        if (s.piece === 'door') addCol(y + 2.3, y + LEVEL_H, 'solid');
        else addCol(y, y + LEVEL_H, 'solid');
        break;
      case 'roof':
        addCol(y + LEVEL_H, y + LEVEL_H + 0.3, 'oneway');
        break;
    }
    if (s.piece === 'table') p.colliders.push(this.collision.add({ minX: f.x0 + 0.2, maxX: f.x1 - 0.2, minZ: f.z0 + 0.4, maxZ: f.z1 - 0.4, minY: y + 0.6, maxY: y + 0.92, kind: 'oneway', surface: 'wood', tag }));
    this.placed.set(keyOf(def.slot, s.i, s.j, s.level, s.edge), p);
    this.attachBehaviour(p, s);
    if (s.piece === 'door') this.setDoor(p, p.open);
    return p;
  }

  private attachBehaviour(p: Placed, s: SavedPiece): void {
    const f = this.footprint(p);
    const x = (f.x0 + f.x1) / 2;
    const z = (f.z0 + f.z1) / 2;
    const y = p.base + p.level * LEVEL_H;
    const ev = this.events;
    switch (p.piece) {
      case 'door':
        p.interactable = {
          id: p.uid,
          x,
          y: y + 1,
          z,
          radius: 1.8,
          verb: '',
          label: '',
          prompt: () => (p.open ? 'Close door' : 'Open door'),
          onInteract: () => {
            const b = this.host.playerBody();
            if (p.open && b.x + b.r > f.x0 && b.x - b.r < f.x1 && b.z + b.r > f.z0 && b.z - b.r < f.z1) {
              ev.emit('toast', { text: 'Step out of the doorway first.', kind: 'info', duration: 2 });
              return;
            }
            this.setDoor(p, !p.open);
            ev.emit('sfx', { name: 'door', x });
          },
        };
        break;
      case 'chest':
        this.containers.register(p.uid, 'Storage Chest', 16);
        p.interactable = { id: p.uid, x, y: y + 0.6, z, radius: 1.6, verb: 'Open', label: 'chest', onInteract: () => {
          ev.emit('sfx', { name: 'chest', x });
          this.host.openContainer(p.uid, 'Storage Chest');
        } };
        break;
      case 'bedroll':
      case 'bed': {
        const q = p.piece === 'bed' ? 1.3 : 1;
        p.interactable = { id: p.uid, x, y: y + 0.5, z, radius: 1.6, verb: 'Sleep in', label: p.piece === 'bed' ? 'bed' : 'bedroll', onInteract: () => this.host.sleep(q, { x, y, z }) };
        break;
      }
      case 'workbench':
        p.interactable = { id: p.uid, x, y: y + 0.9, z, radius: 1.7, verb: 'Use', label: 'workbench', onInteract: () => this.host.openCrafting() };
        break;
      case 'campfire':
      case 'lamp': {
        const kind = p.piece === 'campfire' ? 'campfire' : 'lamp';
        const light = makeLight(p.uid, kind, x, kind === 'lamp' ? y + 1.7 : y + 0.05, z);
        light.fuel = s.fuel ?? 0;
        light.on = !!s.on && light.fuel > 0;
        light.sheltered = this.shelterAt(x, y, z) > 0;
        p.light = this.lights.add(light);
        p.interactable = fireInteractable(p.uid, light, x, y + 0.6, this.host.inventory, this.lights, ev);
        p.interactable.z = z;
        p.interactable.radius = 1.8;
        break;
      }
    }
    if (p.interactable) this.interactions.add(p.interactable);
  }

  private setDoor(p: Placed, open: boolean): void {
    p.open = open;
    if (p.door) p.door.rotation.y = open ? -1.45 : 0;
    const y = p.base + p.level * LEVEL_H;
    const f = this.footprint(p);
    const tag = `build:${p.uid}`;
    const lower = p.colliders.find((c) => c.minY < y + 0.1);
    if (!open && !lower) p.colliders.push(this.collision.add({ minX: f.x0, maxX: f.x1, minZ: f.z0, maxZ: f.z1, minY: y, maxY: y + 2.3, kind: 'solid', surface: 'wood', tag }));
    if (open && lower) {
      this.collision.remove(lower);
      p.colliders.splice(p.colliders.indexOf(lower), 1);
    }
  }

  private destroy(p: Placed): void {
    this.group.remove(p.group);
    for (const c of p.colliders) this.collision.remove(c);
    if (p.interactable) this.interactions.remove(p.interactable);
    if (p.light) this.lights.remove(p.light);
    if (p.piece === 'chest') this.containers.delete(p.uid);
    this.placed.delete(keyOf(PIECES[p.piece].slot, p.i, p.j, p.level, p.edge));
    p.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  /** Re-evaluate shelter for lights (after roofs change). */
  update(): void {
    for (const p of this.placed.values()) {
      if (!p.light) continue;
      const f = this.footprint(p);
      p.light.sheltered = this.shelterAt((f.x0 + f.x1) / 2, p.base + p.level * LEVEL_H, (f.z0 + f.z1) / 2) > 0;
    }
  }

  /** Workbench within reach of a point? */
  workbenchNear(x: number, y: number, z: number): boolean {
    for (const p of this.placed.values()) {
      if (p.piece !== 'workbench') continue;
      const cx = p.i * CELL + 1;
      const cz = p.j * CELL + 1;
      if (Math.hypot(cx - x, cz - z) < 3 && Math.abs(p.base + p.level * LEVEL_H - y) < 2) return true;
    }
    return false;
  }

  clear(): void {
    for (const p of [...this.placed.values()]) this.destroy(p);
  }

  serialize(): SavedPiece[] {
    const out: SavedPiece[] = [];
    for (const p of this.placed.values()) {
      const s: SavedPiece = { piece: p.piece, i: p.i, j: p.j, level: p.level, base: p.base };
      if (p.edge) s.edge = p.edge;
      if (p.rot) s.rot = p.rot;
      if (p.piece === 'door') s.open = p.open;
      if (p.light) {
        s.fuel = Number.isFinite(p.light.fuel) ? Math.round(p.light.fuel) : 0;
        s.on = p.light.on;
      }
      out.push(s);
    }
    return out;
  }

  deserialize(pieces: SavedPiece[]): void {
    this.clear();
    const order: Slot[] = ['floor', 'edge', 'roof', 'furn'];
    const valid = pieces.filter((s) => PIECES[s.piece] && Number.isFinite(s.i) && Number.isFinite(s.j) && Number.isFinite(s.level) && Number.isFinite(s.base));
    valid.sort((a, b) => a.level - b.level || order.indexOf(PIECES[a.piece].slot) - order.indexOf(PIECES[b.piece].slot));
    for (const s of valid) {
      const slot = PIECES[s.piece].slot;
      if (slot === 'edge' && s.edge !== 'x' && s.edge !== 'z') continue;
      if (this.at(slot, s.i, s.j, s.level, s.edge)) continue;
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
