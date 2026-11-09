import type { Crafting } from '../crafting/Crafting';
import { type Recipe, RECIPES, type Station } from '../crafting/recipes';
import type { GameEventBus } from '../core/events';
import { Inventory, type ItemStack } from '../inventory/Inventory';
import { CATEGORY_LABEL, isConsumable, ITEMS } from '../inventory/items';
import { h, ICONS, menuButton, show } from './dom';
import { itemIcon } from './icons';

export interface BackpackHost {
  inventory: Inventory;
  crafting: Crafting;
  stations(): Set<Station>;
  use(slot: number): void;
  equip(slot: number): void;
  clothing(): ItemStack | null;
  unequip(): void;
}

type Tab = 'items' | 'craft';

interface DragState {
  inv: Inventory;
  index: number;
  ghost: HTMLElement;
  startX: number;
  startY: number;
  moved: boolean;
  half: boolean;
}

/**
 * Backpack, crafting and container transfer in one panel. Slots support drag-and-drop
 * (right-drag splits a stack), shift-click to quick-transfer, and double-click to use.
 */
export class Backpack {
  readonly el: HTMLElement;
  private tabs = h('div', { class: 'bp__tabs', role: 'tablist' });
  private body = h('div', { class: 'bp__body' });
  private tab: Tab = 'items';
  private container: { id: string; title: string; inv: Inventory } | null = null;
  private selected: { inv: Inventory; index: number } | null = null;
  private recipe: Recipe | null = null;
  private drag: DragState | null = null;
  private unsub: (() => void)[] = [];
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
    private host: BackpackHost,
  ) {
    this.el = h(
      'div',
      { class: 'overlay backpack', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Backpack' },
      h(
        'div',
        { class: 'panel bp' },
        h('header', { class: 'panel__head' }, this.tabs, h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() })),
        this.body,
        h('footer', { class: 'bp__foot' }, 'Drag to move · Right-drag to split · Shift-click to transfer · Double-click to use · Tab / C to close'),
      ),
    );
    root.append(this.el);
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    host.inventory.onChange(() => this.visible && this.render());
    host.crafting && events.on('recipe:unlocked', () => this.visible && this.render());
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(tab: Tab, container?: { id: string; title: string; inv: Inventory }): void {
    this.tab = tab;
    this.container = container ?? null;
    this.selected = null;
    for (const u of this.unsub) u();
    this.unsub = [];
    if (this.container) this.unsub.push(this.container.inv.onChange(() => this.visible && this.render()));
    this.render();
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'open' });
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.container = null;
    for (const u of this.unsub) u();
    this.unsub = [];
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }

  /** Re-render if open (e.g. station availability changed). */
  refresh(): void {
    if (this.visible) this.render();
  }

  private render(): void {
    const tab = (id: Tab, label: string) =>
      h('button', { class: `bp__tab ${this.tab === id ? 'is-active' : ''}`, role: 'tab', 'aria-selected': String(this.tab === id), onclick: () => {
        this.tab = id;
        this.events.emit('ui:sound', { kind: 'click' });
        this.render();
      } }, label);
    this.tabs.replaceChildren(tab('items', this.container ? `Backpack ⇄ ${this.container.title}` : 'Backpack'), tab('craft', 'Crafting'));
    this.body.replaceChildren(this.tab === 'items' ? this.renderItems() : this.renderCraft());
  }

  // ------------------------------------------------------------ items
  private slot(inv: Inventory, i: number, extraClass = ''): HTMLElement {
    const s = inv.slots[i];
    const d = s ? ITEMS[s.id] : null;
    const dur = s && d?.durability ? Math.max(0, (s.dur ?? d.durability) / d.durability) : null;
    const sel = this.selected && this.selected.inv === inv && this.selected.index === i;
    const el = h(
      'div',
      { class: `slot ${extraClass} ${sel ? 'is-selected' : ''} ${s ? '' : 'is-empty'}`, 'data-index': i, title: d ? d.name : '' },
      s ? h('span', { class: 'slot__icon', html: itemIcon(s.id) }) : null,
      s && s.qty > 1 ? h('span', { class: 'slot__qty' }, String(s.qty)) : null,
      dur !== null ? h('span', { class: 'slot__dur', style: `--d:${dur}` }) : null,
    );
    (el as HTMLElement & { _inv?: Inventory })._inv = inv;
    el.addEventListener('pointerdown', (e) => this.onDown(e, inv, i));
    el.addEventListener('dblclick', () => this.quickUse(inv, i));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  private renderItems(): HTMLElement {
    const inv = this.host.inventory;
    const grid = h('div', { class: 'bp__grid' });
    for (let i = 0; i < inv.size; i++) grid.append(this.slot(inv, i, i < 6 ? 'is-hot' : ''));
    const cloth = this.host.clothing();
    const equip = h(
      'div',
      { class: 'bp__equip' },
      h('div', { class: 'bp__label' }, 'Worn'),
      h(
        'div',
        { class: `slot is-wide ${cloth ? '' : 'is-empty'}`, title: cloth ? `${ITEMS[cloth.id].name} — click to take off` : 'Clothing', onclick: () => {
          this.host.unequip();
          this.render();
        } },
        cloth ? h('span', { class: 'slot__icon', html: itemIcon(cloth.id) }) : h('span', { class: 'slot__hint' }, 'No coat'),
      ),
    );
    const left = h('section', { class: 'bp__col' }, h('div', { class: 'bp__label' }, 'Backpack', h('span', { class: 'bp__sub' }, 'Top row is your hotbar (1–6)')), grid, equip);
    let right: HTMLElement;
    if (this.container) {
      const cg = h('div', { class: 'bp__grid' });
      for (let i = 0; i < this.container.inv.size; i++) cg.append(this.slot(this.container.inv, i));
      const takeAll = menuButton(this.events, 'Take all', () => {
        const c = this.container!.inv;
        for (let i = 0; i < c.size; i++) if (c.slots[i]) Inventory.quickTransfer(c, i, inv);
      }, { variant: 'is-compact' });
      right = h('section', { class: 'bp__col' }, h('div', { class: 'bp__label' }, this.container.title), cg, h('div', { class: 'bp__actions' }, takeAll), this.details());
    } else {
      right = h('section', { class: 'bp__col bp__col--details' }, this.details());
    }
    return h('div', { class: 'bp__items' }, left, right);
  }

  private details(): HTMLElement {
    const sel = this.selected;
    const s = sel ? sel.inv.slots[sel.index] : null;
    if (!sel || !s) return h('div', { class: 'bp__details is-empty' }, 'Select an item to see what it does.');
    const d = ITEMS[s.id];
    const actions: HTMLElement[] = [];
    const isPlayer = sel.inv === this.host.inventory;
    if (isPlayer) {
      if (isConsumable(d) && d.effects) actions.push(menuButton(this.events, d.category === 'drink' ? 'Drink' : d.category === 'medicine' || d.id === 'herbs' ? 'Use' : 'Eat', () => this.host.use(sel.index), { variant: 'is-compact is-primary' }));
      if (d.category === 'clothing') actions.push(menuButton(this.events, 'Wear', () => this.host.equip(sel.index), { variant: 'is-compact is-primary' }));
      if (s.qty > 1) actions.push(menuButton(this.events, 'Split', () => this.split(sel.inv, sel.index), { variant: 'is-compact' }));
      actions.push(menuButton(this.events, 'Discard one', () => {
        sel.inv.takeFromSlot(sel.index, 1);
      }, { variant: 'is-compact' }));
    }
    const effects = d.effects
      ? Object.entries(d.effects)
          .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k}`)
          .join(' · ')
      : '';
    const dur = d.durability ? `${d.light ? 'Burn time' : 'Condition'}: ${d.light ? `${Math.ceil((s.dur ?? d.durability) / 60)} min` : `${Math.ceil(((s.dur ?? d.durability) / d.durability) * 100)}%`}` : '';
    return h(
      'div',
      { class: 'bp__details' },
      h('div', { class: 'det__head' }, h('span', { class: 'det__icon', html: itemIcon(s.id) }), h('div', {}, h('div', { class: 'det__name' }, d.name), h('div', { class: 'det__cat' }, `${CATEGORY_LABEL[d.category]}${s.qty > 1 ? ` · ×${s.qty}` : ''}`))),
      h('p', { class: 'det__desc' }, d.description),
      effects ? h('div', { class: 'det__meta' }, effects) : null,
      dur ? h('div', { class: 'det__meta' }, dur) : null,
      d.warmth ? h('div', { class: 'det__meta' }, `+${d.warmth} warmth when worn`) : null,
      actions.length ? h('div', { class: 'bp__actions' }, ...actions) : null,
    );
  }

  private split(inv: Inventory, i: number): void {
    const s = inv.slots[i];
    if (!s || s.qty < 2) return;
    const empty = inv.slots.findIndex((x) => x === null);
    if (empty < 0) return;
    Inventory.move(inv, i, inv, empty, true);
  }

  private quickUse(inv: Inventory, i: number): void {
    if (inv !== this.host.inventory) {
      Inventory.quickTransfer(inv, i, this.host.inventory);
      return;
    }
    const s = inv.slots[i];
    if (!s) return;
    const d = ITEMS[s.id];
    if (isConsumable(d) && d.effects) this.host.use(i);
    else if (d.category === 'clothing') this.host.equip(i);
  }

  private onDown(e: PointerEvent, inv: Inventory, index: number): void {
    if (!inv.slots[index]) {
      this.selected = { inv, index };
      this.render();
      return;
    }
    if (e.shiftKey) {
      const other = inv === this.host.inventory ? this.container?.inv : this.host.inventory;
      if (other) Inventory.quickTransfer(inv, index, other);
      return;
    }
    const ghost = h('div', { class: 'slot is-ghost', html: itemIcon(inv.slots[index]!.id) });
    this.drag = { inv, index, ghost, startX: e.clientX, startY: e.clientY, moved: false, half: e.button === 2 };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
      d.moved = true;
      document.body.append(d.ghost);
    }
    if (d.moved) d.ghost.style.transform = `translate(${e.clientX - 24}px, ${e.clientY - 24}px)`;
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    if (!d.moved) {
      this.selected = { inv: d.inv, index: d.index };
      this.render();
      return;
    }
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.slot') as (HTMLElement & { _inv?: Inventory }) | null;
    if (target?._inv && target.dataset.index !== undefined) {
      Inventory.move(d.inv, d.index, target._inv, Number(target.dataset.index), d.half);
      this.selected = { inv: target._inv, index: Number(target.dataset.index) };
      this.events.emit('ui:sound', { kind: 'click' });
    }
  }

  // ------------------------------------------------------------ crafting
  private renderCraft(): HTMLElement {
    const inv = this.host.inventory;
    const stations = this.host.stations();
    const known = RECIPES.filter((r) => this.host.crafting.known.has(r.id));
    const unknown = RECIPES.length - known.length;
    const groups = new Map<string, Recipe[]>();
    for (const r of known) {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group)!.push(r);
    }
    if (!this.recipe || !this.host.crafting.known.has(this.recipe.id)) this.recipe = known[0] ?? null;
    const list = h('div', { class: 'craft__list' });
    for (const [g, rs] of groups) {
      list.append(h('div', { class: 'bp__label' }, g));
      for (const r of rs) {
        const ok = this.host.crafting.check(r, { inventory: inv, stations }).ok;
        list.append(
          h('button', { class: `craft__item ${this.recipe === r ? 'is-active' : ''} ${ok ? 'is-ready' : ''}`, onclick: () => {
            this.recipe = r;
            this.events.emit('ui:sound', { kind: 'click' });
            this.render();
          } }, h('span', { class: 'craft__icon', html: itemIcon(r.out) }), h('span', {}, ITEMS[r.out].name + (r.qty > 1 ? ` ×${r.qty}` : '')), ok ? h('span', { class: 'craft__dot' }) : null),
        );
      }
    }
    if (unknown > 0) list.append(h('p', { class: 'craft__unknown' }, `${unknown} more recipe${unknown > 1 ? 's' : ''} to discover. Read what others left behind.`));
    const r = this.recipe;
    let detail: HTMLElement;
    if (!r) detail = h('div', { class: 'bp__details is-empty' }, 'No recipes yet.');
    else {
      const d = ITEMS[r.out];
      const check = this.host.crafting.check(r, { inventory: inv, stations });
      const reqs = Object.entries(r.cost).map(([id, q]) => {
        const have = inv.count(id);
        return h('div', { class: `req ${have >= q ? 'is-met' : ''}` }, h('span', { class: 'req__icon', html: itemIcon(id) }), h('span', { class: 'req__name' }, ITEMS[id].name), h('span', { class: 'req__qty' }, `${have} / ${q}`));
      });
      const station = r.station ? h('div', { class: `req ${stations.has(r.station) ? 'is-met' : ''}` }, h('span', { class: 'req__name' }, r.station === 'fire' ? 'Near a lit fire' : 'At a workbench')) : null;
      const btn = menuButton(this.events, check.ok ? 'Craft' : check.reason, () => {
        this.host.crafting.craft(r, { inventory: inv, stations: this.host.stations() });
        this.render();
      }, { variant: `is-compact ${check.ok ? 'is-primary' : ''}`, disabled: !check.ok });
      detail = h(
        'div',
        { class: 'bp__details' },
        h('div', { class: 'det__head' }, h('span', { class: 'det__icon', html: itemIcon(r.out) }), h('div', {}, h('div', { class: 'det__name' }, d.name + (r.qty > 1 ? ` ×${r.qty}` : '')), h('div', { class: 'det__cat' }, CATEGORY_LABEL[d.category]))),
        h('p', { class: 'det__desc' }, d.description),
        h('div', { class: 'bp__label' }, 'Requires'),
        ...reqs,
        station,
        h('div', { class: 'bp__actions' }, btn),
      );
    }
    return h('div', { class: 'bp__craft' }, list, h('section', { class: 'bp__col bp__col--details' }, detail));
  }
}
