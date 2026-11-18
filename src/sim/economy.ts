/**
 * Money, ledger (profit & loss), tools, part pricing, loans and insurance.
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { SUPPLIERS } from '../data/business';
import { CHIP_PARTS } from '../data/parts';
import { phoneById } from '../data/phones';
import { TOOLS, toolById } from '../data/tools';
import type { PartGrade, PhoneModelDef, Slot, SupplierDef } from '../data/types';
import { basePartPrice } from './phones';
import { uid } from './rng';
import { G, notify } from './state';

export const INCOME_CATS = ['repairs', 'refurb', 'parts', 'online', 'contracts', 'branches', 'franchise', 'manufacturing', 'insurance', 'loan'] as const;
export const EXPENSE_CATS = ['rent', 'power', 'salaries', 'inventory', 'phones', 'equipment', 'insurance', 'interest', 'research', 'furniture', 'refunds', 'misc', 'loanRepay'] as const;

export const CAT_NAMES: Record<string, string> = {
  repairs: 'Repairs', refurb: 'Refurb sales', parts: 'Part resale', online: 'Online / mail-in', contracts: 'Business contracts', branches: 'Branches',
  franchise: 'Franchise royalties', manufacturing: 'Own-brand phones', insurance: 'Insurance', loan: 'Loans taken', rent: 'Rent', power: 'Electricity',
  salaries: 'Salaries', inventory: 'Parts & stock', phones: 'Phones bought', equipment: 'Equipment', interest: 'Loan interest', research: 'Research',
  furniture: 'Shop fit-out', refunds: 'Refunds & warranty', misc: 'Misc', loanRepay: 'Loan repayment',
};

function book(cat: string, amount: number) {
  const g = G();
  const day = (g.ledger[g.day] ??= {});
  day[cat] = (day[cat] ?? 0) + amount;
}

export function earn(amount: number, cat: string) {
  const g = G();
  amount = Math.round(amount);
  g.cash += amount;
  book(cat, amount);
}

/** Spend money. Returns false (and spends nothing) if you can't afford it. */
export function spend(amount: number, cat: string, allowDebt = false): boolean {
  const g = G();
  amount = Math.round(amount);
  if (g.mode === 'freeplay') {
    book(cat, -amount);
    return true;
  }
  if (!allowDebt && g.cash < amount) {
    notify(`Not enough cash (${fmt(amount)} needed).`, 'bad');
    return false;
  }
  g.cash -= amount;
  book(cat, -amount);
  return true;
}

const fmt = (n: number) => `${CONFIG.currency} ${Math.round(n).toLocaleString('en-US')}`;

/** Aggregate the ledger: per-day totals for the last N days. */
export function ledgerSeries(days: number) {
  const g = G();
  const out: { day: number; income: number; expense: number; cats: Record<string, number> }[] = [];
  for (let d = Math.max(1, g.day - days + 1); d <= g.day; d++) {
    const cats = g.ledger[d] ?? {};
    let income = 0;
    let expense = 0;
    for (const [k, v] of Object.entries(cats)) {
      if (k === 'loan' || k === 'loanRepay') continue;
      if (v >= 0) income += v;
      else expense -= v;
    }
    out.push({ day: d, income, expense, cats });
  }
  return out;
}

// ------------------------------------------------------------------
// Tools
// ------------------------------------------------------------------
/** Tier of the owned tool in a category (0 = none, or broken). */
export function toolTier(cat: string): number {
  const g = G();
  if (g.mode === 'freeplay') return Math.max(...TOOLS.filter((t) => t.category === cat).map((t) => t.tier), 0);
  const t = g.tools[cat];
  if (!t || t.broken) return 0;
  return toolById(t.id).tier;
}

export function hasTool(cat: string) {
  return toolTier(cat) > 0;
}

export function buyTool(id: string): boolean {
  const g = G();
  const def = toolById(id);
  if (def.research && !g.research.done.includes(def.research) && g.mode !== 'freeplay') {
    notify('Research required first.', 'bad');
    return false;
  }
  if (!spend(def.price, 'equipment')) return false;
  g.tools[def.category] = { id, wear: 0 };
  notify(`Bought ${def.name}.`, 'good');
  return true;
}

export function toolCondition(cat: string): number {
  const g = G();
  const t = g.tools[cat];
  if (!t) return 0;
  const def = toolById(t.id);
  return Math.max(0, 100 - (t.wear / def.durability) * 100);
}

export function maintainTool(cat: string) {
  const g = G();
  const t = g.tools[cat];
  if (!t) return;
  const def = toolById(t.id);
  if (!spend(def.maintenanceCost, 'equipment')) return;
  t.wear = 0;
  t.broken = false;
  notify(`${def.name} serviced.`, 'good');
}

/** Daily wear check: worn tools can break down. */
export function toolBreakdowns() {
  const g = G();
  for (const [cat, t] of Object.entries(g.tools)) {
    if (t.broken) continue;
    const cond = toolCondition(cat);
    if (cond <= 0 || (cond < 25 && Math.random() < 0.15)) {
      t.broken = true;
      notify(`🔧 ${toolById(t.id).name} broke down! Service it in Equipment.`, 'bad');
    }
  }
}

// ------------------------------------------------------------------
// Part pricing
// ------------------------------------------------------------------
export function supplierPrice(model: PhoneModelDef, slot: Slot, grade: PartGrade, sup: SupplierDef): number {
  const g = G();
  const base = basePartPrice(model, slot);
  const idx = g.partPriceIndex[slot] ?? 1;
  const spike = g.effects.spikeSlot === slot ? (g.effects.spikeDays > 0 ? CONFIG.parts.spikeMultiplier : 0.7) : 1;
  const expert = g.mode === 'expert' ? CONFIG.modes.expert.partsPriceMult : 1;
  const disc = 1 - Math.min(0.15, g.stage * 0.02 + g.rep / 1000); // negotiation leverage
  return Math.max(150, Math.round((base * CONFIG.parts.gradePriceMult[grade] * sup.priceMult * idx * spike * expert * disc) / 10) * 10);
}

export function chipPrice(type: string) {
  return CHIP_PARTS.find((c) => c.type === type)?.price ?? 500;
}

/** Is a part available at this supplier today? (deterministic-ish per day) */
export function inStock(model: PhoneModelDef, slot: Slot, sup: SupplierDef): boolean {
  const brand = brandById(model.brand);
  const seed = (model.id.length * 31 + slot.length * 17 + sup.id.length * 7 + G().day * 13) % 100;
  return seed / 100 < brand.partsAvailability + (sup.id === 'shenzhen' ? 0.1 : 0);
}

export const suppliersFor = (stage: number) => SUPPLIERS.filter((s) => s.minStage <= stage || G().mode === 'freeplay');

export const modelOf = (id: string) => phoneById(id);

// ------------------------------------------------------------------
// Loans & insurance
// ------------------------------------------------------------------
export function takeLoan(idx: number) {
  const g = G();
  const opt = CONFIG.economy.loanOptions[idx];
  if (g.loans.length >= 3) return notify('The bank refuses: too many open loans.', 'bad');
  g.loans.push({ id: uid('loan'), principal: opt.amount, remaining: opt.amount, rate: opt.rate, daysLeft: opt.days });
  earn(opt.amount, 'loan');
  notify(`Loan of ${fmt(opt.amount)} approved.`, 'good');
}

export function repayLoan(id: string) {
  const g = G();
  const l = g.loans.find((x) => x.id === id);
  if (!l) return;
  if (!spend(l.remaining, 'loanRepay')) return;
  g.loans = g.loans.filter((x) => x !== l);
  notify('Loan repaid in full.', 'good');
}

export function insurancePlan() {
  return CONFIG.economy.insurancePlans.find((p) => p.id === G().insurance) ?? CONFIG.economy.insurancePlans[0];
}
