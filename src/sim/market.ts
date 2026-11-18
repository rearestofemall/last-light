/**
 * Used-phone marketplace (walk-in sellers, auctions, wholesale lots),
 * refurbishing & resale, parts ordering, recovered parts, recycling.
 */
import { CONFIG } from '../CONFIG';
import { SUPPLIERS, furnitureById } from '../data/business';
import { faultById } from '../data/faults';
import { CHIP_PARTS, CONSUMABLES } from '../data/parts';
import { layoutById } from '../data/layouts';
import { PHONES, phoneById } from '../data/phones';
import type { PartGrade, PhoneModelDef, Slot } from '../data/types';
import { absMinute } from './clock';
import { randomName } from './customers';
import { chipPrice, earn, inStock, spend, supplierPrice } from './economy';
import { basePartPrice, conditionGrade, createPhone, makeComponent, phoneFaults, phoneName, phoneValue, randomModel } from './phones';
import { chance, clamp, pick, rand, randi, uid } from './rng';
import { G, notify, type ComponentInst, type Listing, type PhoneInst } from './state';

// ------------------------------------------------------------------
// Listings
// ------------------------------------------------------------------
const LIES = ['Never repaired, all original!', 'Just needs a new screen, everything else perfect.', 'Battery is like new.', 'Only small issue, easy fix.', 'Never been wet, I promise.'];

function makeSellerPhone(model: PhoneModelDef): PhoneInst {
  const g = G();
  const phone = createPhone(model, { owner: 'player', faults: randi(0, 3), previousRepairChance: 0.45 });
  if (chance(CONFIG.market.stolenChance)) {
    phone.stolen = true;
    phone.lock = model.brand === 'pear' ? 'icloud' : 'frp';
  } else if (chance(CONFIG.market.lockedChance)) phone.lock = model.brand === 'pear' ? 'icloud' : 'frp';
  g.phones[phone.id] = phone;
  return phone;
}

export function generateListings() {
  const g = G();
  g.listings = g.listings.filter((l) => l.expiresDay >= g.day || (l.auction && l.auction.endsDay >= g.day));
  // clean phones of expired listings
  const live = new Set(g.listings.flatMap((l) => [l.phoneId, ...(l.lot ?? [])]));
  for (const [id, p] of Object.entries(g.phones)) if (p.owner === 'player' && !g.devices.includes(id) && !live.has(id) && g.bench.phoneId !== id) delete g.phones[id];

  const [a, b] = CONFIG.market.walkInSellersPerDay;
  for (let i = 0; i < randi(a, b + g.stage - 1); i++) {
    const model = randomModel();
    const phone = makeSellerPhone(model);
    const v = phoneValue(phone);
    const honest = chance(0.5);
    const faults = phoneFaults(phone);
    const claim = honest ? (faults.length ? `Has issues: ${faults.map((f) => faultById(f.id).symptoms[0].toLowerCase()).join(', ')}.` : 'Working phone, just upgrading.') : pick(LIES);
    g.listings.push({
      id: uid('lst'), phoneId: phone.id, source: 'walkin', ask: Math.round((v * rand(0.85, 1.35)) / 100) * 100, sellerName: randomName(), description: claim,
      expiresDay: g.day + randi(1, CONFIG.market.listingDays), inspected: false, bargainRound: 0,
    });
  }
  const [aa, ab] = CONFIG.market.auctionsPerDay;
  for (let i = 0; i < randi(aa, ab); i++) {
    const model = randomModel((m) => m.tier !== 'budget');
    const phone = makeSellerPhone(model);
    const v = phoneValue(phone);
    g.listings.push({
      id: uid('lst'), phoneId: phone.id, source: 'auction', ask: Math.round((v * 0.4) / 100) * 100, sellerName: pick(['Insurance write-offs', 'Courier lost & found', 'Corporate surplus']),
      description: 'Sold as-is. Untested.', expiresDay: g.day + 1, inspected: false, bargainRound: 0,
      auction: { bid: Math.round((v * 0.4) / 100) * 100, leader: 'rival', endsMinute: randi(12, 18) * 60, endsDay: g.day + 1 },
    });
    (g.listings[g.listings.length - 1] as any).rivalMax = v * rand(0.55, 0.9);
  }
  if (chance(CONFIG.market.wholesaleLotChance)) {
    const n = randi(4, 7);
    const ids: string[] = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const p = makeSellerPhone(randomModel((m) => m.tier === 'budget' || m.tier === 'legacy' || m.tier === 'mid'));
      // lots are mostly broken
      if (!phoneFaults(p).length) p.softwareFaults.push('f_bootloop');
      ids.push(p.id);
      total += phoneValue(p);
    }
    g.listings.push({
      id: uid('lst'), phoneId: ids[0], lot: ids, source: 'wholesale', ask: Math.round((total * rand(0.45, 0.65)) / 500) * 500,
      sellerName: pick(['Gulf Returns Trading', 'Karachi Port Lots', 'E-waste Brokers']), description: `Lot of ${n} faulty phones. No returns.`,
      expiresDay: g.day + 2, inspected: false, bargainRound: 0,
    });
  }
}

export function inspectListing(l: Listing) {
  l.inspected = true;
}

export function bargainListing(l: Listing, offer: number): { ok: boolean; text: string; counter?: number } {
  const g = G();
  const phone = g.phones[l.phoneId];
  const floor = l.ask * (l.source === 'wholesale' ? 0.8 : 0.72) * (phone && phone.stolen ? 0.6 : 1);
  if (offer >= floor || offer >= l.ask) return { ok: true, text: '"Okay, done. Cash please."' };
  l.bargainRound++;
  if (l.bargainRound > 3) {
    l.expiresDay = g.day - 1;
    return { ok: false, text: '"You are wasting my time." (seller left)' };
  }
  const counter = Math.round(((l.ask + Math.max(offer, floor)) / 2) / 100) * 100;
  l.ask = counter;
  return { ok: false, text: `"No way. Best I can do is ${CONFIG.currency} ${counter.toLocaleString()}."`, counter };
}

export function buyListing(l: Listing, price: number): boolean {
  const g = G();
  if (!spend(price, 'phones')) return false;
  const ids = l.lot ?? [l.phoneId];
  const each = price / ids.length;
  for (const id of ids) {
    const p = g.phones[id];
    if (!p) continue;
    p.owner = 'player';
    p.purchasePrice = Math.round(each);
    p.repairCost = 0;
    g.devices.push(id);
  }
  g.listings = g.listings.filter((x) => x !== l);
  notify(`📱 Bought ${ids.length > 1 ? `${ids.length} phones` : phoneName(g.phones[l.phoneId])} for ${CONFIG.currency} ${price.toLocaleString()}.`, 'good');
  return true;
}

export function placeBid(l: Listing, bid: number) {
  if (!l.auction) return;
  if (bid <= l.auction.bid) return notify('Bid must be higher than the current bid.', 'bad');
  l.auction.bid = bid;
  l.auction.leader = 'you';
}

export function auctionsTick() {
  const g = G();
  for (const l of [...g.listings]) {
    if (!l.auction) continue;
    const a = l.auction;
    const rivalMax = (l as any).rivalMax ?? 0;
    if (a.leader === 'you' && a.bid < rivalMax && chance(0.08)) {
      a.bid = Math.round((a.bid * rand(1.04, 1.12)) / 100) * 100;
      a.leader = 'rival';
    }
    const ended = g.day > a.endsDay || (g.day === a.endsDay && g.minute >= a.endsMinute);
    if (ended) {
      if (a.leader === 'you') {
        if (buyListing(l, a.bid)) notify(`🔨 You won the auction for ${phoneName(g.phones[l.phoneId])}!`, 'good');
        else g.listings = g.listings.filter((x) => x !== l);
      } else {
        g.listings = g.listings.filter((x) => x !== l);
        delete g.phones[l.phoneId];
      }
    }
  }
}

// ------------------------------------------------------------------
// Refurb sales
// ------------------------------------------------------------------
export function fairPrice(phone: PhoneInst) {
  return phoneValue(phone);
}

export function listForSale(phone: PhoneInst, price: number) {
  const g = G();
  phone.forSale = { price, listedDay: g.day, grade: conditionGrade(phone) };
  notify(`🏷 Listed ${phoneName(phone)} for ${CONFIG.currency} ${price.toLocaleString()} (grade ${phone.forSale.grade}).`, 'info');
}

export function salesDaily() {
  const g = G();
  const showcase = g.shop.furniture.some((f) => f.defId === 'showcase') ? CONFIG.market.showcaseBonus : 0;
  for (const id of [...g.devices]) {
    const p = g.phones[id];
    if (!p?.forSale) continue;
    if (g.bench.phoneId === id) continue;
    const fair = fairPrice(p);
    const ratio = fair / Math.max(1, p.forSale.price);
    const prob = clamp(CONFIG.market.sellChancePerDay * Math.pow(ratio, CONFIG.market.priceElasticity) * (1 + showcase) * (0.6 + g.rep / 100), 0, 0.95);
    if (chance(prob)) {
      const price = p.forSale.price;
      earn(price, 'refurb');
      g.stats.refurbSold++;
      const profit = price - (p.purchasePrice ?? 0) - (p.repairCost ?? 0);
      notify(`🛒 Sold ${phoneName(p)} for ${CONFIG.currency} ${price.toLocaleString()} (profit ${CONFIG.currency} ${profit.toLocaleString()}).`, profit >= 0 ? 'good' : 'warn');
      g.devices = g.devices.filter((x) => x !== id);
      // hidden faults → warranty return later
      const hidden = phoneFaults(p).length;
      if (hidden && chance(0.5 + 0.15 * hidden)) {
        (g as any).returnsPending = [...((g as any).returnsPending ?? []), { day: g.day + randi(1, 5), price, phoneId: id, name: phoneName(p) }];
      } else delete g.phones[id];
      if (p.stolen) (g as any).stolenSold = ((g as any).stolenSold ?? 0) + 1;
    }
  }
  // process returns
  const pending = ((g as any).returnsPending ?? []) as { day: number; price: number; phoneId: string; name: string }[];
  for (const r of pending.filter((x) => x.day <= g.day)) {
    spend(r.price, 'refunds', true);
    g.devices.push(r.phoneId);
    const p = g.phones[r.phoneId];
    if (p) {
      p.forSale = undefined;
      p.owner = 'player';
    }
    g.rep = clamp(g.rep - 1.5, 0, 100);
    notify(`↩ A buyer returned the ${r.name} (hidden fault). Refunded ${CONFIG.currency} ${r.price.toLocaleString()}.`, 'bad');
  }
  (g as any).returnsPending = pending.filter((x) => x.day > g.day);
}

// ------------------------------------------------------------------
// Parting out & recycling
// ------------------------------------------------------------------
export function partOut(phone: PhoneInst) {
  const g = G();
  let n = 0;
  for (const [slot, c] of Object.entries(phone.components)) {
    if (!c || slot === 'board' || slot === 'simTray' || slot === 'midframe') continue;
    c.source = `Pulled from ${phoneById(phone.modelId).name}`;
    c.inspected = 'unknown';
    (c as any).untested = true;
    if (c.grade === 'genuine' && !c.counterfeit) c.grade = 'refurbished';
    c.cost = 0;
    g.inventory.push(c);
    n++;
  }
  for (const c of Object.values(phone.loose)) if (c) g.inventory.push(c);
  // the board is kept as a donor board for chips
  const board = phone.components.board;
  if (board?.chips) {
    // Donor board: harvest a few good chips (generic, fit any board)
    const layout = layoutById(phoneById(phone.modelId).layout);
    let harvested = 0;
    for (const [id, ch] of Object.entries(board.chips)) {
      const def = layout.chips.find((x) => x.id === id);
      if (!def || ch.faults.length || ch.burned || ch.removed || def.type === 'cpu' || !chance(0.35)) continue;
      g.chips[def.type] = (g.chips[def.type] ?? 0) + 1;
      harvested++;
    }
    if (harvested) notify(`Harvested ${harvested} donor chips from the board.`, 'info');
  }
  g.devices = g.devices.filter((x) => x !== phone.id);
  delete g.phones[phone.id];
  g.scrap++;
  notify(`♻ Stripped ${n} parts into inventory. The dead shell goes to the e-waste pile.`, 'good');
}

/** Test a recovered part: reveals whether it works. */
export function testPart(c: ComponentInst): string {
  (c as any).untested = false;
  if (c.faults.length) {
    c.condition = Math.min(c.condition, 20);
    return `❌ Faulty: ${c.faults.map((f) => faultById(f).name).join(', ')}`;
  }
  return `✅ Works. Condition ${Math.round(c.condition)}%.`;
}

export function partResaleValue(c: ComponentInst) {
  const model = phoneById(c.modelId);
  const grade = c.counterfeit ? 'counterfeit' : c.grade;
  const working = c.faults.length ? 0.1 : 1;
  return Math.round(basePartPrice(model, c.slot) * CONFIG.parts.gradePriceMult[grade] * CONFIG.market.partResaleMult * (c.condition / 100) * working / 10) * 10;
}

export function sellPart(c: ComponentInst) {
  const g = G();
  const v = partResaleValue(c);
  g.inventory = g.inventory.filter((x) => x !== c);
  earn(v, 'parts');
  g.stats.partsSold++;
  notify(`Sold ${c.partNo} for ${CONFIG.currency} ${v.toLocaleString()}.`, 'good');
}

export function binPart(c: ComponentInst) {
  const g = G();
  g.inventory = g.inventory.filter((x) => x !== c);
  g.scrap += 0.2;
}

export function recycleScrap(): void {
  const g = G();
  const n = Math.floor(g.scrap);
  if (!n) return notify('No e-waste to sell.', 'info');
  earn(n * CONFIG.market.recyclerPricePerPhone, 'parts');
  g.scrap -= n;
  notify(`♻ Sold ${n} units of e-waste to the recycler.`, 'good');
}

export function disposeScrap() {
  const g = G();
  if (!g.scrap) return;
  spend(Math.ceil(g.scrap) * CONFIG.parts.ewasteDisposalCost, 'misc', true);
  g.scrap = 0;
  notify('E-waste disposed of responsibly.', 'info');
}

// ------------------------------------------------------------------
// Ordering parts
// ------------------------------------------------------------------
export function storageCapacity() {
  const g = G();
  return 40 + g.shop.furniture.reduce((a, f) => a + (furnitureById(f.defId)?.effect?.storage ?? 0), 0);
}

export function orderPart(model: PhoneModelDef, slot: Slot, grade: PartGrade, supplierId: string, qty: number) {
  const g = G();
  const sup = SUPPLIERS.find((s) => s.id === supplierId)!;
  if (!inStock(model, slot, sup)) return notify(`${sup.name} has no ${slot} for ${model.name} today.`, 'bad');
  if (g.inventory.length + qty > storageCapacity()) return notify('Not enough shelf space. Buy shelves in Shop → Build.', 'bad');
  const unit = supplierPrice(model, slot, grade, sup);
  if (!spend(unit * qty, 'inventory')) return;
  const delay = sup.deliveryDays + (g.effects.supplierDelay > 0 && sup.deliveryDays > 0 ? 2 : 0) + (chance(1 - sup.reliability) ? randi(1, 3) : 0);
  const order = { id: uid('ord'), supplierId, items: [{ partNo: `${model.id}:${slot}`, slot, modelId: model.id, grade, qty, unit }], dueDay: g.day + delay, total: unit * qty };
  if (delay === 0) deliver(order);
  else {
    g.orders.push(order);
    notify(`📦 Ordered ${qty}× ${model.name} ${slot} (${grade}) from ${sup.name}. ETA day ${order.dueDay}.`, 'info');
  }
}

export function orderChip(type: string, qty: number) {
  const g = G();
  const unit = chipPrice(type);
  if (!spend(unit * qty, 'inventory')) return;
  g.chips[type] = (g.chips[type] ?? 0) + qty;
  notify(`Bought ${qty}× ${CHIP_PARTS.find((c) => c.type === type)?.name}.`, 'good');
}

export function buyConsumable(id: string) {
  const g = G();
  const c = CONSUMABLES.find((x) => x.id === id)!;
  if (!spend(c.price, 'inventory')) return;
  g.consumables[id] = (g.consumables[id] ?? 0) + c.packSize;
}

function deliver(order: G_Order) {
  const g = G();
  const sup = SUPPLIERS.find((s) => s.id === order.supplierId)!;
  for (const it of order.items) {
    const model = phoneById(it.modelId);
    for (let i = 0; i < it.qty; i++) {
      const fake = it.grade === 'genuine' && chance(sup.fakeRisk * (g.mode === 'expert' ? 1.5 : 1));
      const c = makeComponent(model, it.slot as Slot, fake ? 'counterfeit' : it.grade, { cost: it.unit, source: sup.name });
      if (fake && chance(0.25)) c.faults.push(it.slot === 'battery' ? 'f_batt_worn' : it.slot === 'display' ? 'f_touch_dead' : 'f_loudspeaker');
      g.inventory.push(c);
    }
  }
  notify(`📦 Delivery from ${sup.name} arrived.`, 'good');
}
type G_Order = ReturnType<typeof G>['orders'][number];

export function deliveriesDaily() {
  const g = G();
  for (const o of [...g.orders]) {
    if (o.dueDay <= g.day) {
      if (g.effects.supplierDelay > 0 && chance(0.5)) {
        o.dueDay++;
        continue;
      }
      deliver(o);
      g.orders = g.orders.filter((x) => x !== o);
    }
  }
}

/** Market drift + price history for charts. */
export function marketDaily() {
  const g = G();
  for (const m of PHONES) {
    const d = g.modelDemand[m.id] ?? 1;
    g.modelDemand[m.id] = clamp(d + rand(-CONFIG.economy.marketDriftPerDay, CONFIG.economy.marketDriftPerDay) + (1 - d) * 0.05, 0.6, 1.5);
    const hist = (g.priceHistory[m.id] ??= []);
    const v = Math.round(createValueProxy(m));
    hist.push(v);
    if (hist.length > 60) hist.shift();
  }
  for (const k of Object.keys(g.partPriceIndex)) {
    const v = g.partPriceIndex[k];
    g.partPriceIndex[k] = clamp(v + rand(-CONFIG.parts.priceDriftPerDay, CONFIG.parts.priceDriftPerDay) + (1 - v) * 0.05, 0.7, 1.4);
  }
}

import { modelBaseValue } from './phones';
const createValueProxy = (m: PhoneModelDef) => modelBaseValue(m);

export const absNow = absMinute;

/** Staff policy: order whatever a job is missing from the cheapest supplier in stock. */
export function autoOrderFor(plan: { kind: string; slot?: string; partNo?: string; chipType?: string; ok: boolean }[]) {
  const g = G();
  for (const need of plan) {
    if (need.ok) continue;
    if (need.chipType && need.kind === 'chipReplace') {
      orderChip(need.chipType, 1);
      continue;
    }
    if (!need.partNo || !need.slot) continue;
    const modelId = need.partNo.includes(':') ? need.partNo.split(':')[0] : PHONES.find((m) => Object.values(m.sharedParts ?? {}).includes(need.partNo!))?.id;
    if (!modelId) continue;
    const model = phoneById(modelId);
    const slot = need.slot as Slot;
    const offers = SUPPLIERS.filter((s) => (s.minStage <= g.stage || g.mode === 'freeplay') && inStock(model, slot, s))
      .flatMap((s) => s.grades.filter((gr) => gr === g.policy.grade || gr === 'aftermarket').map((gr) => ({ s, gr, price: supplierPrice(model, slot, gr, s) })))
      .sort((a, b) => (a.gr === g.policy.grade ? 0 : 1) - (b.gr === g.policy.grade ? 0 : 1) || a.price - b.price);
    if (offers[0]) orderPart(model, slot, offers[0].gr, offers[0].s.id, 1);
    else notify(`No supplier has a ${slot} for ${model.name} today.`, 'warn');
  }
}
