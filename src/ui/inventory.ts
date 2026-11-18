/**
 * Inventory: stock (inspect / test / sell), ordering from suppliers,
 * chips & consumables, pending deliveries, e-waste.
 */
import { SUPPLIERS } from '../data/business';
import { CHIP_PARTS, CONSUMABLES, SELLABLE_SLOTS, SLOT_NAMES } from '../data/parts';
import { PHONES, phoneById } from '../data/phones';
import type { PartGrade, Slot } from '../data/types';
import { inspectPart } from '../repair/diagnostics';
import { advanceMinutes } from '../sim/clock';
import { chipPrice, hasTool, inStock, supplierPrice, suppliersFor } from '../sim/economy';
import { binPart, buyConsumable, disposeScrap, orderChip, orderPart, partResaleValue, recycleScrap, sellPart, storageCapacity, testPart } from '../sim/market';
import { modelSlots, modelsForPart } from '../sim/phones';
import { G, changed, type ComponentInst } from '../sim/state';
import { btn, h, modal, money, toast } from './dom';

let sub: 'stock' | 'order' | 'chips' | 'orders' = 'stock';
let orderModel = 'realmi-c55';
let orderSlot: Slot = 'display';
let filter = '';

export function renderInventory(el: HTMLElement) {
  const g = G();
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ([['stock', `Stock (${g.inventory.length}/${storageCapacity()})`], ['order', 'Order parts'], ['chips', 'Chips & consumables'], ['orders', `Deliveries (${g.orders.length})`]] as const).map(([id, label]) =>
      h('button', { class: sub === id ? 'on' : '', role: 'tab', onclick: () => { sub = id; renderInventory(el); } }, label)));
  const body = sub === 'stock' ? stock(el) : sub === 'order' ? order(el) : sub === 'chips' ? chips(el) : orders();
  el.replaceChildren(h('h2', null, 'Parts inventory'), tabs, body);
}

function stock(el: HTMLElement) {
  const g = G();
  const q = filter.toLowerCase();
  const items = g.inventory.filter((c) => !q || c.partNo.toLowerCase().includes(q) || SLOT_NAMES[c.slot].toLowerCase().includes(q) || (phoneById(c.modelId)?.name ?? '').toLowerCase().includes(q));
  const search = h('input', { type: 'text', placeholder: 'e.g. Pear 13 display', value: filter, 'aria-label': 'Filter stock', oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value; const pos = (e.target as HTMLInputElement).selectionStart; renderInventory(el); const i = el.querySelector('input[type=text]') as HTMLInputElement; i?.focus(); i?.setSelectionRange(pos, pos); } });
  return h('div', null,
    h('div', { class: 'row' }, search, h('span', { class: 'spacer' }),
      h('span', { class: 'small muted' }, `E-waste pile: ${g.scrap.toFixed(1)} units`),
      btn('Sell e-waste to recycler', () => { recycleScrap(); changed(); }, 'small'),
      btn('Dispose (pay)', () => { disposeScrap(); changed(); }, 'small')),
    items.length
      ? h('table', { class: 'tbl', style: 'margin-top:8px' },
        h('tr', null, h('th', null, 'Part'), h('th', null, 'Fits'), h('th', null, 'Grade'), h('th', { class: 'num' }, 'Cond.'), h('th', null, 'Source'), h('th', { class: 'num' }, 'Cost'), h('th', null, '')),
        items.slice(0, 200).map((c) => h('tr', null,
          h('td', null, SLOT_NAMES[c.slot], h('div', { class: 'mono muted' }, c.partNo)),
          h('td', { class: 'small' }, modelsForPart(c.partNo).map((m) => m.name).join(', ')),
          h('td', null, c.grade, c.inspected === 'fake' ? h('span', { class: 'pill bad' }, 'FAKE') : c.inspected === 'ok' ? h('span', { class: 'pill good' }, 'verified') : null, (c as any).untested ? h('span', { class: 'pill warn' }, 'untested') : null, c.faults.length && !(c as any).untested && c.source?.startsWith('Removed') ? h('span', { class: 'pill bad' }, 'faulty') : null),
          h('td', { class: 'num' }, `${Math.round(c.condition)}%`),
          h('td', { class: 'small muted' }, c.source ?? ''),
          h('td', { class: 'num' }, c.cost ? money(c.cost) : '—'),
          h('td', null, h('div', { class: 'row' },
            btn('Inspect', () => inspect(c), 'small'),
            (c as any).untested ? btn('Test', () => { advanceMinutes(5); toast(testPart(c), 'info'); changed(); }, 'small') : null,
            btn(`Sell ${money(partResaleValue(c))}`, () => { sellPart(c); changed(); }, 'small'),
            btn('Bin', () => { binPart(c); changed(); }, 'small danger'))))))
      : h('div', { class: 'empty', style: 'margin-top:8px' }, q ? 'No parts match that filter.' : 'No parts in stock. Order some, or strip donor phones from the Market.'));
}

function inspect(c: ComponentInst) {
  const res = [inspectPart(c, 'visual')];
  if (hasTool('scale')) res.push(inspectPart(c, 'scale'));
  if (hasTool('microscope')) res.push(inspectPart(c, 'microscope'));
  advanceMinutes(3);
  if (res.some((r) => r.verdict === 'fake')) c.inspected = 'fake';
  else if (res.some((r) => r.verdict === 'ok')) c.inspected = 'ok';
  modal('Inspection', h('div', null, h('ul', null, res.map((r) => h('li', { class: r.verdict === 'fake' ? 'bad' : '' }, r.text))),
    !hasTool('microscope') || !hasTool('scale') ? h('p', { class: 'muted small' }, 'A microscope and a precision scale make fakes much easier to spot.') : null),
  [{ label: 'Close', onClick: () => { changed(); } }]);
}

function order(el: HTMLElement) {
  const g = G();
  const model = phoneById(orderModel);
  const slots = modelSlots(model).filter((s) => SELLABLE_SLOTS.includes(s));
  if (!slots.includes(orderSlot)) orderSlot = slots[0];
  const modelSel = h('select', { 'aria-label': 'Phone model', onchange: (e: Event) => { orderModel = (e.target as HTMLSelectElement).value; renderInventory(el); } },
    PHONES.map((p) => h('option', { value: p.id, selected: p.id === orderModel || undefined }, p.name)));
  const slotSel = h('select', { 'aria-label': 'Part', onchange: (e: Event) => { orderSlot = (e.target as HTMLSelectElement).value as Slot; renderInventory(el); } },
    slots.map((s) => h('option', { value: s, selected: s === orderSlot || undefined }, SLOT_NAMES[s])));
  const sups = suppliersFor(g.stage);
  const shared = modelsForPart(`${model.sharedParts?.[orderSlot] ?? model.id + ':' + orderSlot}`);
  return h('div', null,
    h('div', { class: 'row' }, h('label', null, 'Model ', modelSel), h('label', null, 'Part ', slotSel)),
    shared.length > 1 ? h('p', { class: 'small good', style: 'margin-top:6px' }, `Shared part: also fits ${shared.filter((m) => m.id !== model.id).map((m) => m.name).join(', ')}`) : null,
    h('table', { class: 'tbl', style: 'margin-top:10px' },
      h('tr', null, h('th', null, 'Supplier'), h('th', null, 'Delivery'), h('th', null, 'Reliability'), ...(['genuine', 'refurbished', 'aftermarket'] as PartGrade[]).map((gr) => h('th', { class: 'num' }, gr))),
      sups.map((s) => {
        const avail = inStock(model, orderSlot, s);
        return h('tr', null,
          h('td', null, h('b', null, s.name), h('div', { class: 'small muted' }, s.desc)),
          h('td', null, s.deliveryDays ? `${s.deliveryDays} day(s)` : 'same day'),
          h('td', null, `${Math.round(s.reliability * 100)}%`),
          ...(['genuine', 'refurbished', 'aftermarket'] as PartGrade[]).map((gr) => h('td', { class: 'num' },
            !s.grades.includes(gr) ? h('span', { class: 'muted' }, '—') : !avail ? h('span', { class: 'muted small' }, 'out of stock') :
              h('div', { class: 'row', style: 'justify-content:flex-end' }, h('span', { class: 'mono' }, money(supplierPrice(model, orderSlot, gr, s))),
                btn('Buy 1', () => { orderPart(model, orderSlot, gr, s.id, 1); changed(); }, 'small'),
                btn('×5', () => { orderPart(model, orderSlot, gr, s.id, 5); changed(); }, 'small')))));
      })),
    h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Genuine = perfect, no warnings. Refurbished = pulled originals with some wear. Aftermarket = cheap, dimmer screens / smaller batteries. Shady suppliers sometimes sell counterfeits as "genuine": inspect before use. Prices drift daily.'));
}

function chips(el: HTMLElement) {
  const g = G();
  void el;
  return h('div', { class: 'grid2' },
    h('div', { class: 'card' }, h('h3', null, 'Board-level chips'), h('p', { class: 'muted small' }, 'Generic parts: they fit any board. Needs microsoldering research.'),
      h('table', { class: 'tbl' }, CHIP_PARTS.map((c) => h('tr', null, h('td', null, c.name, c.needsReball ? h('span', { class: 'pill' }, 'BGA reball') : null), h('td', { class: 'num' }, `×${g.chips[c.type] ?? 0}`), h('td', { class: 'num mono' }, money(chipPrice(c.type))),
        h('td', null, btn('Buy', () => { orderChip(c.type, 1); changed(); }, 'small', g.stage < 2 && g.mode === 'career' && !g.research.done.includes('microsoldering'))))))),
    h('div', { class: 'card' }, h('h3', null, 'Consumables'),
      h('table', { class: 'tbl' }, CONSUMABLES.map((c) => h('tr', null, h('td', null, h('b', null, c.name), h('div', { class: 'small muted' }, c.desc)), h('td', { class: 'num' }, `×${g.consumables[c.id] ?? 0}`),
        h('td', null, btn(`+${c.packSize} for ${money(c.price)}`, () => { buyConsumable(c.id); changed(); }, 'small')))))));
}

function orders() {
  const g = G();
  if (!g.orders.length) return h('div', { class: 'empty' }, 'No pending deliveries.');
  return h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Supplier'), h('th', null, 'Items'), h('th', null, 'ETA'), h('th', { class: 'num' }, 'Total')),
    g.orders.map((o) => h('tr', null, h('td', null, SUPPLIERS.find((s) => s.id === o.supplierId)?.name), h('td', null, o.items.map((i) => `${i.qty}× ${phoneById(i.modelId).name} ${SLOT_NAMES[i.slot as Slot]} (${i.grade})`).join(', ')),
      h('td', null, `day ${o.dueDay}`), h('td', { class: 'num' }, money(o.total)))));
}
