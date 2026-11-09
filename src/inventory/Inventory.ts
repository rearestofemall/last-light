import { ITEMS, itemDef } from './items';

export interface ItemStack {
  id: string;
  qty: number;
  /** Remaining durability (tools: uses, lights: seconds). */
  dur?: number;
}

export type SerializedInventory = (ItemStack | null)[];

/**
 * A fixed-size grid of item stacks. Used for the player's backpack and every container.
 * All mutations go through here so quantities can never go negative or over-stack.
 */
export class Inventory {
  slots: (ItemStack | null)[];
  private listeners = new Set<() => void>();

  constructor(readonly size: number) {
    this.slots = new Array(size).fill(null);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected changed(): void {
    for (const l of this.listeners) l();
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  has(cost: Record<string, number>): boolean {
    return Object.entries(cost).every(([id, q]) => this.count(id) >= q);
  }

  /** How many of `id` could be added. */
  space(id: string): number {
    const d = itemDef(id);
    let n = 0;
    for (const s of this.slots) {
      if (!s) n += d.stack;
      else if (s.id === id && d.stack > 1) n += d.stack - s.qty;
    }
    return n;
  }

  /** Adds items, filling existing stacks first. Returns how many did not fit. */
  add(id: string, qty: number, dur?: number): number {
    const d = itemDef(id);
    let left = qty;
    if (d.stack > 1) {
      for (const s of this.slots) {
        if (left <= 0) break;
        if (s && s.id === id && s.qty < d.stack) {
          const n = Math.min(left, d.stack - s.qty);
          s.qty += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, d.stack);
      this.slots[i] = { id, qty: n, dur: dur ?? d.durability };
      left -= n;
    }
    if (left !== qty) this.changed();
    return left;
  }

  /** Removes up to qty (from the last stacks first). Returns how many were removed. */
  remove(id: string, qty: number): number {
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(left, s.qty);
      s.qty -= n;
      left -= n;
      if (s.qty <= 0) this.slots[i] = null;
    }
    if (left !== qty) this.changed();
    return qty - left;
  }

  removeCost(cost: Record<string, number>): boolean {
    if (!this.has(cost)) return false;
    for (const [id, q] of Object.entries(cost)) this.remove(id, q);
    return true;
  }

  takeFromSlot(i: number, qty = 1): ItemStack | null {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(qty, s.qty);
    s.qty -= n;
    const out = { id: s.id, qty: n, dur: s.dur };
    if (s.qty <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  setSlot(i: number, s: ItemStack | null): void {
    this.slots[i] = s;
    this.changed();
  }

  /**
   * Drag-and-drop between slots (possibly across inventories): merges equal stacks,
   * otherwise swaps. `half` splits the source stack.
   */
  static move(from: Inventory, fi: number, to: Inventory, ti: number, half = false): void {
    if (from === to && fi === ti) return;
    const src = from.slots[fi];
    if (!src) return;
    const dst = to.slots[ti];
    const def = ITEMS[src.id];
    const moving = half && src.qty > 1 ? Math.ceil(src.qty / 2) : src.qty;
    if (dst && dst.id === src.id && def.stack > 1) {
      const n = Math.min(moving, def.stack - dst.qty);
      dst.qty += n;
      src.qty -= n;
      if (src.qty <= 0) from.slots[fi] = null;
    } else if (!dst) {
      to.slots[ti] = { ...src, qty: moving };
      src.qty -= moving;
      if (src.qty <= 0) from.slots[fi] = null;
    } else if (!half) {
      from.slots[fi] = dst;
      to.slots[ti] = src;
    }
    from.changed();
    if (to !== from) to.changed();
  }

  /** Move a whole stack into another inventory wherever it fits (shift-click). */
  static quickTransfer(from: Inventory, fi: number, to: Inventory): void {
    const s = from.slots[fi];
    if (!s) return;
    const left = to.add(s.id, s.qty, s.dur);
    if (left === 0) from.slots[fi] = null;
    else s.qty = left;
    from.changed();
  }

  serialize(): SerializedInventory {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  deserialize(data: unknown): void {
    this.slots = new Array(this.size).fill(null);
    if (!Array.isArray(data)) return;
    data.slice(0, this.size).forEach((s, i) => {
      if (s && typeof s === 'object' && typeof s.id === 'string' && ITEMS[s.id] && typeof s.qty === 'number' && s.qty > 0) {
        const def = ITEMS[s.id];
        this.slots[i] = { id: s.id, qty: Math.min(def.stack, Math.floor(s.qty)), dur: typeof s.dur === 'number' ? s.dur : def.durability };
      }
    });
    this.changed();
  }

  clear(): void {
    this.slots.fill(null);
    this.changed();
  }
}

/** All persistent containers in the world, keyed by id (site crates, placed chests). */
export class ContainerRegistry {
  private map = new Map<string, { inv: Inventory; title: string }>();

  register(id: string, title: string, size: number, initial: [string, number][] = []): Inventory {
    let e = this.map.get(id);
    if (!e) {
      const inv = new Inventory(size);
      for (const [item, q] of initial) inv.add(item, q);
      e = { inv, title };
      this.map.set(id, e);
    }
    return e.inv;
  }

  get(id: string): { inv: Inventory; title: string } | undefined {
    return this.map.get(id);
  }

  delete(id: string): void {
    this.map.delete(id);
  }

  serialize(): Record<string, SerializedInventory> {
    const out: Record<string, SerializedInventory> = {};
    for (const [id, e] of this.map) out[id] = e.inv.serialize();
    return out;
  }

  /** Restore contents of containers that exist; unknown ids (e.g. chests) are recreated by their owners. */
  deserialize(data: Record<string, unknown>): void {
    for (const [id, inv] of Object.entries(data)) this.map.get(id)?.inv.deserialize(inv);
  }
}
