/**
 * Phone factory + phone helpers: resolves a model's unique internal layout,
 * creates unique phone instances (serials, faults, history) and computes
 * live market value.
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { FAULTS, SLOT_FALLBACK, SLOT_FALLBACK_2, faultById } from '../data/faults';
import { layoutById } from '../data/layouts';
import { SLOT_PRICE_FRACTION } from '../data/parts';
import { PHONES, phoneById } from '../data/phones';
import type { FaultDef, NodeDef, PartGrade, PhoneModelDef, Slot } from '../data/types';
import { chance, clamp, digits, pick, rand, randi, uid, weighted } from './rng';
import { G, type ComponentInst, type PhoneInst } from './state';

// ------------------------------------------------------------------
// Layout resolution (cached per model)
// ------------------------------------------------------------------
const nodeCache = new Map<string, NodeDef[]>();

/** The model's own nodes: layout filtered by features, scaled, mirrored, shifted. */
export function modelNodes(model: PhoneModelDef): NodeDef[] {
  const cached = nodeCache.get(model.id);
  if (cached) return cached;
  const layout = layoutById(model.layout);
  const sx = model.dims[0] / layout.dims[0];
  const sy = model.dims[1] / layout.dims[1];
  const sz = model.dims[2] / layout.dims[2];
  const kept = layout.nodes.filter((n) => !n.only || model.features.includes(n.only));
  const ids = new Set(kept.map((n) => n.id));
  const nodes = kept.map((n) => {
    let [x, y, z] = n.pos;
    if (model.mirror) x = -x;
    if (model.batteryShift && (n.slot === 'battery' || n.id === 'c_batt')) y += model.batteryShift;
    const big = n.kind === 'cover' || n.slot === 'display' || n.slot === 'innerDisplay';
    return {
      ...n,
      pos: [x * sx, y * sy, z * sz] as [number, number, number],
      size: big ? ([n.size[0] * sx, n.size[1] * sy, n.size[2]] as [number, number, number]) : n.size,
      requires: (n.requires ?? []).filter((r) => ids.has(r)),
      tetheredBy: (n.tetheredBy ?? []).filter((r) => ids.has(r)),
    };
  });
  nodeCache.set(model.id, nodes);
  return nodes;
}

export const nodeById = (model: PhoneModelDef, id: string) => modelNodes(model).find((n) => n.id === id);

export function modelSlots(model: PhoneModelDef): Slot[] {
  const s = new Set<Slot>();
  modelNodes(model).forEach((n) => n.slot && s.add(n.slot));
  return [...s];
}

/** Where does a slot actually live in this model (port on sub-board etc.)? */
export function resolveSlot(model: PhoneModelDef, slot: Slot): Slot | null {
  const slots = modelSlots(model);
  if (slots.includes(slot)) return slot;
  const a = SLOT_FALLBACK[slot] as Slot | undefined;
  if (a && slots.includes(a)) return a;
  const b = SLOT_FALLBACK_2[slot] as Slot | undefined;
  if (b && slots.includes(b)) return b;
  return null;
}

export const nodeForSlot = (model: PhoneModelDef, slot: Slot) => modelNodes(model).find((n) => n.slot === slot);

// ------------------------------------------------------------------
// Parts
// ------------------------------------------------------------------
export const partNoFor = (model: PhoneModelDef, slot: Slot) => model.sharedParts?.[slot] ?? `${model.id}:${slot}`;

/** All models a part number fits. */
export function modelsForPart(partNo: string): PhoneModelDef[] {
  return PHONES.filter((m) => modelSlots(m).some((s) => partNoFor(m, s) === partNo));
}

export function partFits(c: ComponentInst, model: PhoneModelDef, slot: Slot) {
  return c.slot === slot && c.partNo === partNoFor(model, slot);
}

export function basePartPrice(model: PhoneModelDef, slot: Slot): number {
  const brand = brandById(model.brand);
  const p = model.launchPrice * (SLOT_PRICE_FRACTION[slot] ?? 0.03) * brand.partsPriceLevel * 0.55;
  return Math.max(300, Math.round(p / 50) * 50);
}

export function makeComponent(model: PhoneModelDef, slot: Slot, grade: PartGrade, opts: Partial<ComponentInst> = {}): ComponentInst {
  const counterfeit = grade === 'counterfeit';
  const quality = CONFIG.parts.gradeQuality[grade];
  const c: ComponentInst = {
    id: uid('part'),
    slot,
    partNo: partNoFor(model, slot),
    modelId: model.id,
    grade: counterfeit ? 'genuine' : grade, // counterfeits pretend to be genuine
    counterfeit,
    condition: grade === 'refurbished' ? randi(82, 95) : counterfeit ? randi(70, 90) : grade === 'aftermarket' ? randi(88, 100) : 100,
    pairedTo: null,
    faults: [],
    inspected: 'unknown',
    ...opts,
  };
  if (slot === 'battery' || slot === 'battery2') c.cycles = grade === 'refurbished' ? randi(80, 300) : 0;
  if (slot === 'board') {
    c.chips = {};
    for (const ch of layoutById(model.layout).chips) c.chips[ch.id] = { faults: [], removed: false, burned: false };
    c.corrosion = 0;
    c.jumpers = 0;
  }
  void quality;
  return c;
}

/** Quality 0..100 of an installed component (grade + condition). */
export function componentQuality(c: ComponentInst): number {
  const g = c.counterfeit ? 'counterfeit' : c.grade;
  return (CONFIG.parts.gradeQuality[g] * c.condition) / 100;
}

// ------------------------------------------------------------------
// Faults
// ------------------------------------------------------------------
export function faultEligible(f: FaultDef, model: PhoneModelDef): boolean {
  if (f.weight <= 0) return false;
  if (f.requiresFeature && !model.features.includes(f.requiresFeature)) return false;
  if (f.minTier && !f.minTier.includes(model.tier)) return false;
  if (f.target.slot && !resolveSlot(model, f.target.slot)) return false;
  return true;
}

/** Add a fault into the right component / chip / software. Returns false if impossible. */
export function addFault(phone: PhoneInst, faultId: string): boolean {
  const f = faultById(faultId);
  const model = phoneById(phone.modelId);
  if (f.target.software) {
    if (!phone.softwareFaults.includes(faultId)) phone.softwareFaults.push(faultId);
    return true;
  }
  if (f.target.chip || f.target.board) {
    const board = phone.components.board ?? phone.loose.board;
    if (!board) return false;
    if (f.target.board) {
      board.corrosion = Math.max(board.corrosion ?? 0, rand(0.4, 1));
      if (!board.faults.includes(faultId)) board.faults.push(faultId);
      phone.waterSeal = false;
      return true;
    }
    const chipDef = layoutById(model.layout).chips.find((c) => c.type === f.target.chip);
    if (!chipDef || !board.chips) return false;
    const chip = board.chips[chipDef.id];
    if (!chip.faults.includes(faultId)) chip.faults.push(faultId);
    return true;
  }
  const slot = resolveSlot(model, f.target.slot!);
  if (!slot) return false;
  const comp = phone.components[slot];
  if (!comp) return false;
  if (!comp.faults.includes(faultId)) comp.faults.push(faultId);
  if (faultId === 'f_batt_worn') comp.condition = Math.min(comp.condition, randi(58, 74));
  if (faultId === 'f_batt_swollen') comp.condition = Math.min(comp.condition, randi(50, 70));
  if (faultId === 'f_batt_dead') comp.condition = 0;
  return true;
}

/** Fault that appears when a chip is missing, burnt or badly soldered. */
export const CHIP_MISSING_FAULT: Record<string, string> = {
  cpu: 'f_pmic', nand: 'f_nand', pmic: 'f_pmic', chargeIC: 'f_charge_ic', audioIC: 'f_audio_ic', baseband: 'f_baseband', wifi: 'f_wifi',
  backlight: 'f_backlight_ic', cap_vbus: 'f_cap_vbus', cap_main: 'f_cap_main', cap_bl: 'f_cap_bl', filter_bl: 'f_screw_backlight',
  conn_disp: 'f_backlight_ic', conn_batt: 'f_pmic',
};

export interface FaultRef {
  id: string;
  where: string; // slot / chip id / 'software'
  component?: ComponentInst;
}

/** All active faults in the installed phone (loose parts are excluded). */
export function phoneFaults(phone: PhoneInst): FaultRef[] {
  const out: FaultRef[] = [];
  for (const [slot, c] of Object.entries(phone.components)) {
    if (!c) continue;
    c.faults.forEach((id) => out.push({ id, where: slot, component: c }));
    if (c.chips) {
      const model = phoneById(phone.modelId);
      const defs = layoutById(model.layout).chips;
      for (const [cid, ch] of Object.entries(c.chips)) {
        ch.faults.forEach((id) => out.push({ id, where: cid, component: c }));
        // missing / burnt / badly soldered chips break their function
        const def = defs.find((d) => d.id === cid);
        if (!def) continue;
        const broken = ch.burned || ch.unsoldered || (ch as any).ripped || (ch as any).coldJoint || (ch.removed && !def.type.startsWith('cap_'));
        const vf = CHIP_MISSING_FAULT[def.type];
        if (broken && vf && !ch.faults.includes(vf)) out.push({ id: vf, where: cid, component: c });
      }
    }
  }
  phone.softwareFaults.forEach((id) => out.push({ id, where: 'software' }));
  return out;
}

// ------------------------------------------------------------------
// Phone creation
// ------------------------------------------------------------------
export function currentYear() {
  return 2026 + Math.floor(((G()?.day ?? 1) - 1) / 365);
}

export interface CreateOpts {
  owner: 'customer' | 'player';
  faults?: number;
  faultIds?: string[];
  forceFault?: (f: FaultDef) => boolean;
  previousRepairChance?: number;
}

export function createPhone(model: PhoneModelDef, opts: CreateOpts): PhoneInst {
  const serial = `${model.brand.slice(0, 2).toUpperCase()}${digits(2)}${String.fromCharCode(65 + randi(0, 25))}${digits(6)}`;
  const age = Math.max(0, currentYear() - model.year);
  const phone: PhoneInst = {
    id: uid('ph'),
    modelId: model.id,
    serial,
    imei: `35${digits(13)}`,
    variant: randi(0, model.variants.length - 1),
    colour: pick(model.colours),
    components: {},
    loose: {},
    nodes: {},
    mat: [],
    heat: {},
    softwareFaults: [],
    lock: 'none',
    pta: !chance(CONFIG.market.nonPtaChance),
    stolen: false,
    cosmetic: clamp(randi(55, 100) - age * 6, 15, 100),
    waterSeal: true,
    history: [],
    owner: opts.owner,
    knownFaults: [],
  };
  for (const n of modelNodes(model)) {
    phone.nodes[n.id] = { s: 'in', len: n.screw?.length };
    if (n.slot && !phone.components[n.slot]) {
      const c = makeComponent(model, n.slot, 'genuine', { pairedTo: serial });
      c.condition = n.slot === 'battery' || n.slot === 'battery2' ? clamp(100 - age * 7 - randi(0, 10), 70, 100) : clamp(100 - randi(0, age * 4), 70, 100);
      if (c.cycles !== undefined) c.cycles = Math.round(age * randi(180, 320) + randi(0, 80));
      phone.components[n.slot] = c;
    }
  }
  // Previous repair history: some parts already swapped
  const prevChance = opts.previousRepairChance ?? Math.min(0.6, 0.1 + age * 0.08);
  if (chance(prevChance)) {
    const candidates: Slot[] = (['display', 'battery', 'backCover', 'subBoard', 'chargeFlex', 'loudspeaker'] as Slot[]).filter((s) => phone.components[s]);
    const n = randi(1, 2);
    for (let i = 0; i < n && candidates.length; i++) {
      const slot = candidates.splice(randi(0, candidates.length - 1), 1)[0];
      const grade = weighted(['aftermarket', 'refurbished', 'counterfeit', 'genuine'] as PartGrade[], (g) => ({ aftermarket: 5, refurbished: 2, counterfeit: 2, genuine: 1 })[g]);
      const comp = makeComponent(model, slot, grade);
      comp.condition = randi(60, 95);
      phone.components[slot] = comp;
      phone.history.push({ day: -randi(30, 700), slot, grade: comp.counterfeit ? 'counterfeit' : grade, by: pick(['Unknown shop', 'Hall Road kiosk', 'Brand service centre']) });
      if (comp.counterfeit && chance(0.5)) comp.faults.push(slot === 'battery' ? 'f_batt_worn' : slot === 'display' ? 'f_touch_dead' : 'f_loudspeaker');
    }
  }
  // Faults
  if (opts.faultIds) opts.faultIds.forEach((f) => addFault(phone, f));
  const count = opts.faults ?? 0;
  const pool = FAULTS.filter((f) => faultEligible(f, model) && (!opts.forceFault || opts.forceFault(f)));
  for (let i = 0; i < count && pool.length; i++) {
    const f = weighted(pool, (x) => x.weight);
    addFault(phone, f.id);
  }
  if (phoneFaults(phone).some((f) => f.id === 'f_screen_cracked' || f.id === 'f_backglass')) phone.cosmetic = Math.min(phone.cosmetic, randi(20, 60));
  return phone;
}

// ------------------------------------------------------------------
// Value & grading
// ------------------------------------------------------------------
export function modelBaseValue(model: PhoneModelDef): number {
  const brand = brandById(model.brand);
  const age = Math.max(0, currentYear() - model.year + ((G()?.day ?? 1) % 365) / 365);
  const yearly = 1 - CONFIG.economy.phoneDepreciationPerYear / brand.retention;
  const f = clamp(Math.pow(yearly, age), 0.07, 1);
  const demand = G()?.modelDemand?.[model.id] ?? 1;
  return model.launchPrice * f * demand;
}

/** Live market value of a phone instance in its current state. */
export function phoneValue(phone: PhoneInst, opts: { assumeFixed?: boolean } = {}): number {
  const model = phoneById(phone.modelId);
  let v = modelBaseValue(model) * (1 + model.variants[phone.variant].priceAdd / model.launchPrice);
  if (!opts.assumeFixed) for (const f of phoneFaults(phone)) v *= 1 - faultById(f.id).valueLoss;
  v *= 0.7 + 0.3 * (phone.cosmetic / 100);
  for (const [slot, c] of Object.entries(phone.components)) {
    if (!c) continue;
    if (c.counterfeit || c.grade === 'aftermarket') v *= slot === 'display' ? 0.85 : 0.96;
    if (c.grade === 'refurbished') v *= 0.98;
    if (c.pairedTo && c.pairedTo !== phone.serial && brandById(model.brand).pairing.includes(c.slot)) v *= 0.95;
  }
  const missing = modelSlots(model).filter((s) => !phone.components[s]).length;
  v *= Math.pow(0.8, missing);
  const batt = phone.components.battery;
  if (batt) v *= 0.85 + 0.15 * (batt.condition / 100);
  if (!phone.pta) v *= 1 - CONFIG.economy.ptaDiscount;
  if (phone.lock !== 'none') v *= 0.22;
  return Math.max(500, Math.round(v / 100) * 100);
}

export function conditionGrade(phone: PhoneInst): import('../data/types').ConditionGrade {
  const faults = phoneFaults(phone);
  if (faults.some((f) => ['power', 'display'].some((t) => faultById(f.id).tests.includes(t as any)))) return 'Dead';
  if (faults.length > 1) return 'C';
  const batt = phone.components.battery?.condition ?? 100;
  const nonGenuine = Object.values(phone.components).filter((c) => c && (c.grade === 'aftermarket' || c.counterfeit)).length;
  if (faults.length === 1 || phone.cosmetic < 45) return 'C';
  if (phone.cosmetic < 70 || batt < 80 || nonGenuine > 1) return 'B';
  if (phone.cosmetic < 88 || batt < 90 || nonGenuine > 0) return 'A';
  if (phone.cosmetic >= 97 && batt >= 99 && !phone.history.length) return 'New';
  return 'A+';
}

export const phoneName = (phone: PhoneInst) => {
  const m = phoneById(phone.modelId);
  const v = m.variants[phone.variant];
  return `${m.name} ${v.storage >= 1024 ? '1TB' : v.storage + 'GB'} ${phone.colour}`;
};

/** Pick a phone model weighted for the player's current stage / research. */
export function randomModel(filter?: (m: PhoneModelDef) => boolean): PhoneModelDef {
  const g = G();
  const done = g?.research.done ?? [];
  const pool = PHONES.filter((m) => {
    if (filter && !filter(m)) return false;
    if (m.tier === 'foldable') return done.includes('foldables') || g?.mode === 'freeplay';
    if (m.tier === 'flagship') return done.includes('flagships') || (g?.stage ?? 1) >= 2 || g?.mode === 'freeplay' || chance(0.25);
    return true;
  });
  return weighted(pool, (m) => {
    const brand = brandById(m.brand);
    const tierW = { budget: 5, mid: 4, flagship: 2.5, foldable: 0.8, legacy: 1.5 }[m.tier];
    const recency = clamp(1 - (currentYear() - m.year) * 0.08, 0.3, 1);
    return tierW * recency * (brand.tier === 'premium' ? 1.3 : 1) * (g?.modelDemand?.[m.id] ?? 1);
  });
}
