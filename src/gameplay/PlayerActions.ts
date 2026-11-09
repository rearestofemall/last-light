import * as THREE from 'three';
import type { GameEventBus } from '../core/events';
import type { Input } from '../core/Input';
import type { Inventory, ItemStack } from '../inventory/Inventory';
import { isConsumable, ITEMS, type ToolKind } from '../inventory/items';
import { FireVisual, type LightSource, type LightSystem, makeLight } from '../lighting/LightSystem';
import type { PlayerController } from '../player/PlayerController';
import type { PlayerModel } from '../player/PlayerModel';
import type { Survival } from '../survival/Survival';
import type { Wildlife } from '../wildlife/Wildlife';

export const HOTBAR = 6;

/**
 * What the player holds and does with it: hotbar selection, held light sources,
 * eating/drinking, equipping clothing, swinging tools at wildlife.
 */
export class PlayerActions {
  selected = 0;
  /** Equipped clothing (not in the backpack). */
  clothing: ItemStack | null = null;
  lanternOn = true;
  private heldLight: LightSource;
  private heldId: string | null = null;
  private heldMesh: THREE.Object3D | null = null;
  private torchFire = new FireVisual(0.42, 0xffa04a, true);
  private workTimer = 0;
  private swingTimer = 0;
  private lightWorld = new THREE.Vector3();

  constructor(
    private inv: Inventory,
    private player: PlayerController,
    private model: PlayerModel,
    private survival: Survival,
    lights: LightSystem,
    private wildlife: Wildlife,
    private events: GameEventBus,
  ) {
    this.heldLight = makeLight('held', 'torch', 0, 0, 0);
    this.heldLight.visual = undefined;
    this.heldLight.fuel = Infinity;
    this.heldLight.persistent = true;
    lights.add(this.heldLight);
  }

  get held(): ItemStack | null {
    return this.inv.slots[this.selected] ?? null;
  }

  /** Best tool of a kind anywhere in the backpack (tools work from the pack). */
  tool(kind: ToolKind): ItemStack | null {
    let best: ItemStack | null = null;
    for (const s of this.inv.slots) {
      if (s && ITEMS[s.id].tool?.kind === kind && (s.dur ?? 1) > 0) {
        if (!best || (s.dur ?? 0) > (best.dur ?? 0)) best = s;
      }
    }
    return best;
  }

  wearTool(stack: ItemStack): void {
    if (stack.dur === undefined) return;
    stack.dur -= 1;
    if (stack.dur <= 0) {
      const i = this.inv.slots.indexOf(stack);
      if (i >= 0) this.inv.setSlot(i, null);
      this.events.emit('toast', { text: `Your ${ITEMS[stack.id].name.toLowerCase()} broke.`, kind: 'warn', duration: 3.5 });
    }
  }

  /** Starts a short harvesting action. Returns false while the previous one is still playing. */
  beginWork(): boolean {
    if (this.workTimer > 0) return false;
    this.workTimer = 0.42;
    this.model.work();
    return true;
  }

  get lightRadius(): number {
    return this.heldLight.on ? this.heldLight.radius : 0;
  }

  select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.events.emit('sfx', { name: 'equip' });
  }

  /** F / left click with the selected item. */
  use(): void {
    const s = this.held;
    if (!s) return this.swing(5);
    const d = ITEMS[s.id];
    if (isConsumable(d) && d.effects) return this.consume(this.selected);
    if (d.category === 'clothing') return this.equip(this.selected);
    if (d.id === 'lantern') {
      this.lanternOn = !this.lanternOn;
      this.events.emit('sfx', { name: this.lanternOn ? 'ignite' : 'extinguish' });
      return;
    }
    if (d.category === 'placeable') {
      this.events.emit('toast', { text: 'Press B to build with this.', kind: 'hint', duration: 3 });
      return;
    }
    if (d.id === 'bottle') {
      this.events.emit('toast', { text: 'Stand at a river and press R to fill it.', kind: 'hint', duration: 3 });
      return;
    }
    const dmg = d.tool?.damage ?? d.damage ?? 5;
    this.swing(dmg, d.tool ? s : null);
  }

  private swing(damage: number, tool: ItemStack | null = null): void {
    if (this.swingTimer > 0) return;
    if (this.survival.vitals.stamina < 6) {
      this.events.emit('toast', { text: 'Too exhausted to swing.', kind: 'info', duration: 1.5 });
      return;
    }
    this.swingTimer = 0.5;
    this.survival.vitals.stamina -= 6;
    this.model.swing();
    this.events.emit('sfx', { name: 'swing' });
    const b = this.player.body;
    const hit = this.wildlife.strike(b.x, b.y, b.z, this.player.facingX, this.player.facingZ, 2.1, damage);
    if (hit) {
      this.events.emit('sfx', { name: 'hit', x: b.x });
      if (tool) this.wearTool(tool);
    }
  }

  consume(slot: number): void {
    const s = this.inv.slots[slot];
    if (!s) return;
    const d = ITEMS[s.id];
    if (!d.effects) return;
    this.inv.takeFromSlot(slot, 1);
    this.survival.apply(d.effects);
    if (d.id === 'remedy') this.survival.sickness = 0;
    if (d.returns) this.inv.add(d.returns, 1);
    this.events.emit('sfx', { name: d.category === 'drink' ? 'drink' : 'eat' });
    this.model.eat();
    if (d.sickness && Math.random() < d.sickness) {
      this.survival.sickness = 90;
      this.survival.damage(6, 'food poisoning');
      this.events.emit('toast', { text: 'Your stomach turns. That was a mistake.', kind: 'warn', duration: 4 });
    }
  }

  equip(slot: number): void {
    const s = this.inv.slots[slot];
    if (!s) return;
    const prev = this.clothing;
    this.clothing = { ...s, qty: 1 };
    this.inv.takeFromSlot(slot, 1);
    if (prev) this.inv.add(prev.id, 1, prev.dur);
    this.events.emit('toast', { text: `Wearing: ${ITEMS[s.id].name}`, kind: 'good', duration: 2.5 });
    this.events.emit('sfx', { name: 'equip' });
  }

  unequip(): void {
    if (!this.clothing) return;
    if (this.inv.add(this.clothing.id, 1, this.clothing.dur) === 0) this.clothing = null;
  }

  get warmthBonus(): number {
    return this.clothing ? ITEMS[this.clothing.id].warmth ?? 0 : 0;
  }

  update(dt: number, input: Input, rain: number, sheltered: boolean): void {
    this.workTimer = Math.max(0, this.workTimer - dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    for (let i = 0; i < HOTBAR; i++) if (input.consume(`slot${i + 1}` as 'slot1')) this.select(i);
    if (input.wheelDelta !== 0 && input.held('sprint')) {
      this.select((this.selected + (input.wheelDelta > 0 ? 1 : HOTBAR - 1)) % HOTBAR);
      input.wheelDelta = 0;
    }
    if (input.consume('use') || input.consume('click')) this.use();

    // Held light sources burn from the stack's durability.
    const s = this.held;
    const light = this.heldLight;
    const submerged = this.player.submersion > 1.1;
    let on = false;
    if (s?.id === 'torch' && !submerged) {
      on = true;
      const burn = 1 + (sheltered ? 0 : rain * 1.5);
      s.dur = (s.dur ?? 300) - dt * burn;
      if (s.dur <= 0) {
        this.inv.takeFromSlot(this.selected, 1);
        this.events.emit('toast', { text: 'Your torch sputters out.', kind: 'warn', duration: 3 });
        this.events.emit('sfx', { name: 'extinguish' });
        on = false;
      }
    } else if (s?.id === 'lantern' && this.lanternOn) {
      if ((s.dur ?? 0) <= 0) {
        if (this.inv.remove('fuel', 1) === 1) {
          s.dur = 600;
          this.events.emit('toast', { text: 'You refill the lantern with oil.', kind: 'info', duration: 2.5 });
        }
      }
      if ((s.dur ?? 0) > 0) {
        on = true;
        s.dur = (s.dur ?? 0) - dt;
      }
    }
    const def = s ? ITEMS[s.id] : null;
    if (def?.light) {
      light.radius = def.light.radius;
      light.intensity = def.light.intensity;
      light.color = def.light.color;
      light.kind = s!.id === 'torch' ? 'torch' : 'lantern';
      light.exposedFlame = s!.id === 'torch';
    }
    light.on = on;
    this.model.handAnchor.getWorldPosition(this.lightWorld);
    light.x = this.lightWorld.x;
    light.y = this.lightWorld.y;
    light.z = this.lightWorld.z + 0.3;
    this.updateHeldMesh(s?.id ?? null, on);
  }

  private updateHeldMesh(id: string | null, lit: boolean): void {
    if (id !== this.heldId) {
      this.heldId = id;
      if (this.heldMesh) this.model.handAnchor.remove(this.heldMesh);
      this.heldMesh = id ? heldModel(id, this.torchFire) : null;
      if (this.heldMesh) this.model.handAnchor.add(this.heldMesh);
    }
    this.torchFire.set(lit && id === 'torch', 1, 1);
    if (this.heldMesh && id === 'lantern') {
      const glow = this.heldMesh.getObjectByName('glow') as THREE.Mesh | undefined;
      if (glow) (glow.material as THREE.MeshBasicMaterial).color.setHex(lit ? 0xffd27a : 0x2a2620);
    }
  }

  serialize(): { selected: number; clothing: ItemStack | null; lanternOn: boolean } {
    return { selected: this.selected, clothing: this.clothing, lanternOn: this.lanternOn };
  }

  deserialize(d: { selected?: number; clothing?: ItemStack | null; lanternOn?: boolean }): void {
    this.selected = Math.max(0, Math.min(HOTBAR - 1, d.selected ?? 0));
    this.clothing = d.clothing && ITEMS[d.clothing.id] ? d.clothing : null;
    this.lanternOn = d.lanternOn ?? true;
  }

  reset(): void {
    this.selected = 0;
    this.clothing = null;
    this.lanternOn = true;
  }
}

const hm = (c: number, emissive = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive, emissiveIntensity: emissive ? 1 : 0 });
const M = { wood: hm(0x6b4a2e), stone: hm(0x8a8780), metal: hm(0x8f979e), dark: hm(0x2c2a28) };

function heldModel(id: string, fire: FireVisual): THREE.Object3D | null {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (id) {
    case 'torch':
      add(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), M.wood, 0, 0, 0.12).rotation.x = Math.PI / 2 - 0.5;
      add(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 6), M.dark, 0, 0.13, 0.36).rotation.x = Math.PI / 2 - 0.5;
      fire.group.position.set(0, 0.16, 0.4);
      g.add(fire.group);
      break;
    case 'lantern': {
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 4), M.metal, 0, -0.05, 0);
      add(new THREE.CylinderGeometry(0.09, 0.1, 0.05, 8), M.metal, 0, -0.14, 0);
      const glow = add(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }), 0, -0.25, 0);
      glow.name = 'glow';
      glow.castShadow = false;
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8), M.metal, 0, -0.35, 0);
      break;
    }
    case 'axe':
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), M.wood, 0, 0, 0.2).rotation.x = Math.PI / 2 - 0.3;
      add(new THREE.BoxGeometry(0.05, 0.2, 0.16), M.stone, 0, 0.17, 0.52);
      break;
    case 'pickaxe':
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), M.wood, 0, 0, 0.2).rotation.x = Math.PI / 2 - 0.3;
      add(new THREE.BoxGeometry(0.04, 0.5, 0.06), M.metal, 0, 0.17, 0.52);
      break;
    case 'knife':
      add(new THREE.BoxGeometry(0.03, 0.04, 0.12), M.wood, 0, 0, 0.04);
      add(new THREE.BoxGeometry(0.015, 0.05, 0.2), M.stone, 0, 0, 0.19);
      break;
    default:
      return null;
  }
  return g;
}
