import type { GameEventBus } from '../core/events';
import type { Inventory } from '../inventory/Inventory';
import { ITEMS } from '../inventory/items';
import { type Recipe, RECIPES, type Station } from './recipes';

export interface CraftContext {
  inventory: Inventory;
  /** Stations within reach of the player right now. */
  stations: Set<Station>;
}

export type CraftCheck = { ok: true } | { ok: false; reason: string };

/** Known recipes, unlock rules and the craft transaction (consume → produce). */
export class Crafting {
  readonly known = new Set<string>();

  constructor(private events: GameEventBus) {
    this.reset();
  }

  reset(): void {
    this.known.clear();
    for (const r of RECIPES) if (r.unlock === 'start') this.known.add(r.id);
  }

  /** Called with an unlock key (e.g. "note:ranger-log"); returns the newly learned recipes. */
  trigger(key: string): Recipe[] {
    const learned = RECIPES.filter((r) => r.unlock === key && !this.known.has(r.id));
    for (const r of learned) this.known.add(r.id);
    if (learned.length) {
      this.events.emit('recipe:unlocked', { ids: learned.map((r) => r.id) });
      const names = [...new Set(learned.map((r) => ITEMS[r.out].name))].join(', ');
      this.events.emit('toast', { text: `New recipes: ${names}`, kind: 'good', duration: 6 });
      this.events.emit('sfx', { name: 'unlock' });
    }
    return learned;
  }

  /** Learn recipes for an unlock key without announcing them (loading older saves). */
  /** Free Play option: every recipe known. */
  learnAll(): void {
    for (const r of RECIPES) this.known.add(r.id);
  }

  learnSilently(key: string): void {
    for (const r of RECIPES) if (r.unlock === key) this.known.add(r.id);
  }

  check(r: Recipe, ctx: CraftContext): CraftCheck {
    if (!this.known.has(r.id)) return { ok: false, reason: 'Unknown recipe' };
    if (r.station && !ctx.stations.has(r.station)) return { ok: false, reason: r.station === 'fire' ? 'Needs a lit fire nearby' : 'Needs a workbench nearby' };
    if (!ctx.inventory.has(r.cost)) return { ok: false, reason: 'Missing materials' };
    // Make sure the output fits after the inputs are removed (approximation: freed slots count).
    const freed = Object.keys(r.cost).some((id) => ctx.inventory.count(id) === r.cost[id]);
    if (ctx.inventory.space(r.out) < r.qty && !freed) return { ok: false, reason: 'Backpack is full' };
    return { ok: true };
  }

  craft(r: Recipe, ctx: CraftContext): boolean {
    const c = this.check(r, ctx);
    if (!c.ok) {
      this.events.emit('toast', { text: c.reason, kind: 'warn', duration: 2.5 });
      this.events.emit('sfx', { name: 'denied' });
      return false;
    }
    ctx.inventory.removeCost(r.cost);
    const left = ctx.inventory.add(r.out, r.qty);
    if (left > 0) {
      // Should not happen thanks to check(), but never destroy items silently.
      for (const [id, q] of Object.entries(r.cost)) ctx.inventory.add(id, q);
      return false;
    }
    this.events.emit('item:gained', { id: r.out, qty: r.qty });
    this.events.emit('sfx', { name: 'craft' });
    return true;
  }

  serialize(): string[] {
    return [...this.known];
  }

  deserialize(ids: string[]): void {
    this.reset();
    for (const id of ids) if (RECIPES.some((r) => r.id === id)) this.known.add(id);
  }
}
