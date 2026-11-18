/**
 * World simulation: per-minute tick, end-of-day processing, random events,
 * competitors & market share, research, progression stages, branches,
 * franchising and own-brand manufacturing.
 */
import { CONFIG } from '../CONFIG';
import { EVENTS, furnitureById, locationById } from '../data/business';
import { RESEARCH, researchById } from '../data/research';
import { SELLABLE_SLOTS } from '../data/parts';
import { PHONES } from '../data/phones';
import { TOOLS, toolById } from '../data/tools';
import { absMinute, setClockHooks } from './clock';
import { addReview, contractOffer, customersTick, dailyOnline, playerShare, warrantyCheck } from './customers';
import { earn, insurancePlan, ledgerSeries, spend, toolBreakdowns } from './economy';
import { employeesDaily, employeesTick } from './employees';
import { auctionsTick, deliveriesDaily, generateListings, marketDaily, partResaleValue, salesDaily } from './market';
import { phoneValue } from './phones';
import { chance, clamp, pick, rand, randi, uid, weighted } from './rng';
import { G, changed, notify } from './state';

export function initWorld() {
  setClockHooks(tickMinute, endOfDay);
}

export function tickMinute() {
  const g = G();
  customersTick();
  employeesTick();
  auctionsTick();
  // research
  const r = g.research.active;
  if (r) {
    r.minutesLeft -= 1;
    if (r.minutesLeft <= 0) {
      g.research.done.push(r.id);
      g.research.active = null;
      notify(`🔬 Research complete: ${researchById(r.id).name}!`, 'good');
      checkProgression();
    }
  }
  // load-shedding countdown (in minutes)
  if (g.effects.loadshedding > 0) {
    g.effects.loadshedding -= 1;
    if (g.effects.loadshedding <= 0) notify('💡 Power is back.', 'info');
  }
  // challenge timer
  if (g.minute % 15 === 0) changed();
}

export function endOfDay() {
  const g = G();
  const before = g.cash;
  const lines: string[] = [];
  const loc = locationById(g.shop.locationId);
  // ---------- expenses ----------
  if (!g.shop.owned) {
    spend(loc.rentPerDay, 'rent', true);
    lines.push(`Rent: -${loc.rentPerDay}`);
  }
  const benches = g.shop.furniture.filter((f) => furnitureById(f.defId)?.kind === 'bench').length;
  const power = CONFIG.economy.electricityPerBenchPerDay * Math.max(1, benches) + (g.shop.furniture.some((f) => f.defId === 'ac') ? 400 : 0);
  spend(power, 'power', true);
  lines.push(`Electricity: -${power}`);
  const salaries = g.employees.reduce((a, e) => a + e.salary, 0);
  if (salaries) {
    spend(salaries, 'salaries', true);
    lines.push(`Salaries: -${salaries}`);
  }
  const ins = insurancePlan();
  if (ins.daily) {
    spend(ins.daily, 'insurance', true);
    lines.push(`Insurance: -${ins.daily}`);
  }
  for (const l of [...g.loans]) {
    const interest = Math.round(l.remaining * l.rate);
    spend(interest, 'interest', true);
    l.daysLeft--;
    if (l.daysLeft <= 0) {
      spend(l.remaining, 'loanRepay', true);
      g.loans = g.loans.filter((x) => x !== l);
      notify('🏦 A loan reached its term and was repaid from your account.', 'warn');
    }
  }
  // ---------- late game income ----------
  for (const b of g.branches) {
    const inc = b.franchise ? CONFIG.lategame.franchiseRoyaltyPerDay * (0.6 + g.rep / 100) : CONFIG.lategame.branchDailyBase * (0.4 + g.rep / 70) * (b.quality / 70) * rand(0.6, 1.4);
    earn(inc, b.franchise ? 'franchise' : 'branches');
  }
  manufacturingDaily();
  // ---------- systems ----------
  deliveriesDaily();
  marketDaily();
  salesDaily();
  warrantyCheck();
  dailyOnline();
  employeesDaily();
  toolBreakdowns();
  competitorsDaily();
  // expire customer queue (shop closes)
  for (const c of g.customers) {
    if (!c.warrantyJobId) delete g.phones[c.phoneId];
  }
  if (g.customers.length) notify(`${g.customers.length} customer(s) left at closing time.`, 'warn');
  g.customers = [];
  // overdue jobs
  for (const j of g.jobs) {
    if (j.status === 'open' && j.dueDay < g.day) {
      g.rep = clamp(g.rep - 0.4, 0, 100);
      if (j.dueDay === g.day - 1) notify(`⏰ ${j.customerName}'s repair is overdue!`, 'bad');
    }
  }
  // effects countdown
  if (g.effects.demandDays > 0) g.effects.demandDays--;
  if (g.effects.spikeDays > 0) g.effects.spikeDays--;
  else if (g.effects.spikeSlot && g.effects.spikeDays <= 0 && chance(0.3)) g.effects.spikeSlot = null;
  if (g.effects.supplierDelay > 0) g.effects.supplierDelay--;
  g.offers = g.offers.filter((o) => o.expiresDay >= g.day);

  const income = ledgerSeries(1)[0];
  g.dayReport = {
    day: g.day,
    income: income?.income ?? 0,
    expense: income?.expense ?? 0,
    lines,
  };
  void before;
  // ---------- next day ----------
  g.day += 1;
  g.minute = CONFIG.time.openHour * 60;
  if (g.mode !== 'challenge') generateListings();
  randomEvent();
  checkProgression();
  if (g.mode === 'career' && g.cash < -50_000) {
    notify('⚠ You are deep in debt. Take a loan or sell stock before the bank closes you!', 'bad');
  }
  if (g.day % 7 === 0 && (g.stage >= 3 || g.research.done.includes('business-accounts')) && chance(CONFIG.customers.businessContractChance * 2)) contractOffer();
  g.speed = 0; // pause to show the day report
  changed();
}

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------
function randomEvent() {
  const g = G();
  if (g.mode === 'challenge') return;
  if (!chance(CONFIG.events.dailyChance)) return;
  const pool = EVENTS.filter((e) => e.minStage <= g.stage);
  const ev = weighted(pool, (e) => e.weight);
  const hasUps = g.shop.furniture.some((f) => furnitureById(f.defId)?.effect?.power);
  switch (ev.id) {
    case 'supplier_delay':
      g.effects.supplierDelay = randi(2, 4);
      notify('🚢 Customs strike: supplier deliveries delayed for a few days.', 'event');
      break;
    case 'tool_break': {
      const owned = Object.entries(g.tools).filter(([, t]) => !t.broken);
      if (!owned.length) return;
      const [cat, t] = pick(owned);
      t.broken = true;
      notify(`💥 Your ${toolById(t.id).name} broke down (${cat}). Service it in Equipment.`, 'event');
      break;
    }
    case 'price_spike':
      g.effects.spikeSlot = pick(['display', 'battery', 'subBoard', 'mainCam', 'backCover']);
      g.effects.spikeDays = CONFIG.events.priceSpikeDays;
      notify(`📈 Shortage! ${g.effects.spikeSlot} parts cost ${Math.round((CONFIG.parts.spikeMultiplier - 1) * 100)}% more for ${CONFIG.events.priceSpikeDays} days.`, 'event');
      break;
    case 'price_drop':
      g.effects.spikeSlot = pick(['display', 'battery', 'subBoard', 'loudspeaker']);
      g.effects.spikeDays = 0;
      notify(`📉 Flood of stock: ${g.effects.spikeSlot} parts are 30% cheaper for now.`, 'event');
      break;
    case 'demand_up':
      g.effects.demandMult = CONFIG.events.surgeMult;
      g.effects.demandDays = CONFIG.events.demandSurgeDays;
      notify('📣 Rainy season: water-damaged and broken phones everywhere. Demand surge!', 'event');
      break;
    case 'phone_launch': {
      const m = pick(PHONES.filter((p) => p.year >= 2025));
      g.modelDemand[m.id] = 1.4;
      PHONES.filter((p) => p.brand === m.brand && p.id !== m.id).forEach((p) => (g.modelDemand[p.id] = (g.modelDemand[p.id] ?? 1) * 0.92));
      notify(`🚀 Launch hype for the ${m.name}! Older ${m.brand} models lose value.`, 'event');
      break;
    }
    case 'price_war': {
      const c = pick(g.competitors);
      c.priceIndex *= 0.75;
      c.priceWar = CONFIG.competitors.priceWarDays;
      notify(`⚔ ${c.name} started a price war: repairs 25% cheaper for a week!`, 'event');
      break;
    }
    case 'loadshedding': {
      const hrs = randi(...(CONFIG.events.loadsheddingHours as [number, number]));
      g.effects.loadshedding = hrs * 60;
      notify(hasUps ? `🔌 Load-shedding for ${hrs}h, but your UPS keeps the benches running.` : `🔌 Load-shedding for ${hrs}h! Staff can't work without backup power.`, 'event');
      break;
    }
    case 'viral_review':
      if (g.rep > 40 || chance(0.5)) {
        g.rep = clamp(g.rep + CONFIG.events.viralRep, 0, 100);
        g.effects.demandMult = 1.4;
        g.effects.demandDays = 3;
        addReview('@techwithhamza', 5, 'Went viral: "This shop fixed my phone in 30 minutes for half the price!"', true);
        notify('🌟 A TikTok about your shop went viral! Reputation and footfall up.', 'event');
      } else {
        g.rep = clamp(g.rep - CONFIG.events.viralRep / 2, 0, 100);
        addReview('@angrycustomer', 1, 'Viral rant: "They kept my phone a week and it still doesn\'t work"', true);
        notify('📉 A bad review went viral. Reputation down.', 'event');
      }
      break;
    case 'bulk_contract':
      contractOffer();
      break;
    case 'market_crash':
      PHONES.forEach((p) => (g.modelDemand[p.id] = (g.modelDemand[p.id] ?? 1) * 0.8));
      notify('📉 Used-phone prices crashed 20% after a flood of imports.', 'event');
      break;
    case 'police_raid': {
      const stolen = g.devices.filter((id) => g.phones[id]?.stolen);
      if (stolen.length) {
        stolen.forEach((id) => {
          delete g.phones[id];
        });
        g.devices = g.devices.filter((id) => !stolen.includes(id));
        spend(25_000 * stolen.length, 'misc', true);
        g.rep = clamp(g.rep - 4 * stolen.length, 0, 100);
        notify(`🚓 Police raid! ${stolen.length} stolen phone(s) found in your stock: confiscated + fined.`, 'event');
      } else {
        g.rep = clamp(g.rep + 1, 0, 100);
        notify('🚓 Police checked your stock for stolen phones. All clean!', 'event');
      }
      break;
    }
    case 'theft': {
      const cctv = g.shop.furniture.some((f) => f.defId === 'cctv');
      if (cctv && chance(0.6)) {
        notify('📹 Attempted break-in! Your CCTV scared them off.', 'event');
        break;
      }
      const lossItems = g.inventory.filter(() => chance(CONFIG.events.theftLossFraction));
      const loss = lossItems.reduce((a, c) => a + partResaleValue(c) * 2, 0);
      g.inventory = g.inventory.filter((c) => !lossItems.includes(c));
      const cover = insurancePlan().theft;
      if (cover) earn(loss * cover, 'insurance');
      notify(`🦹 Break-in! Lost ${lossItems.length} parts (~${CONFIG.currency} ${Math.round(loss).toLocaleString()}). ${cover ? `Insurance paid ${Math.round(cover * 100)}%.` : 'No insurance cover!'}`, 'event');
      break;
    }
    case 'competitor_branch': {
      const c = pick(g.competitors);
      c.branches++;
      c.rep = clamp(c.rep + 3, 0, 100);
      notify(`🏪 ${c.name} opened a branch right next to you.`, 'event');
      break;
    }
  }
}

// ------------------------------------------------------------------
// Competitors & market share
// ------------------------------------------------------------------
export function playerPriceIndex() {
  const g = G();
  const svc = Object.values(g.pricing.services);
  const avg = svc.length ? svc.reduce((a, b) => a + b, 0) / svc.length : 1;
  return g.pricing.global * avg;
}

export function computeShares() {
  const g = G();
  const a = CONFIG.competitors.shareRepExponent;
  const b = CONFIG.competitors.sharePriceExponent;
  const me = Math.pow(Math.max(1, g.rep), a) / Math.pow(playerPriceIndex(), b) * Math.sqrt(1 + g.branches.length);
  const scores = g.competitors.map((c) => Math.pow(Math.max(1, c.rep), a) / Math.pow(c.priceIndex, b) * Math.sqrt(c.branches));
  const total = me + scores.reduce((x, y) => x + y, 0);
  g.competitors.forEach((c, i) => (c.share = scores[i] / total));
  return me / total;
}

function competitorsDaily() {
  const g = G();
  for (const c of g.competitors) {
    if (c.priceWar > 0) {
      c.priceWar--;
      if (c.priceWar === 0) c.priceIndex /= 0.75;
    }
    c.rep = clamp(c.rep + rand(-0.6, 0.8), 5, 95);
    // react to the player stealing share
    if (playerShare() > 0.4 && chance(0.05)) {
      c.priceIndex = clamp(c.priceIndex * 0.95, 0.5, 2);
    }
    if (chance(0.01 * c.branches)) c.branches++;
  }
  const share = computeShares();
  g.shareHistory.push(Math.round(share * 1000) / 10);
  if (g.shareHistory.length > 60) g.shareHistory.shift();
}

// ------------------------------------------------------------------
// Research
// ------------------------------------------------------------------
export function researchAvailable(id: string) {
  const g = G();
  const r = researchById(id);
  if (g.research.done.includes(id)) return { ok: false, reason: 'Done' };
  if (r.stage > g.stage) return { ok: false, reason: `Stage ${r.stage} required` };
  const missing = r.requires.filter((x) => !g.research.done.includes(x));
  if (missing.length) return { ok: false, reason: `Needs ${missing.map((m) => researchById(m).name).join(', ')}` };
  if (g.research.active) return { ok: false, reason: 'Another project is running' };
  return { ok: true };
}

export function startResearch(id: string) {
  const g = G();
  const r = researchById(id);
  if (!researchAvailable(id).ok) return;
  if (!spend(r.cost, 'research')) return;
  g.research.active = { id, minutesLeft: r.hours * 60 };
  notify(`🔬 Research started: ${r.name} (${r.hours} working hours).`, 'info');
}

// ------------------------------------------------------------------
// Progression
// ------------------------------------------------------------------
export function netWorth() {
  const g = G();
  const inv = g.inventory.reduce((a, c) => a + (c.cost ?? partResaleValue(c)), 0);
  const devices = g.devices.reduce((a, id) => a + (g.phones[id] ? phoneValue(g.phones[id]) : 0), 0);
  const tools = Object.values(g.tools).reduce((a, t) => a + toolById(t.id).price * 0.5, 0);
  const shop = g.shop.owned ? locationById(g.shop.locationId).buyPrice : 0;
  const branches = g.branches.length * CONFIG.lategame.branchOpenCost * 0.5;
  const loans = g.loans.reduce((a, l) => a + l.remaining, 0);
  return Math.round(g.cash + inv + devices + tools + shop + branches - loans);
}

export function nextStageInfo() {
  const g = G();
  const next = CONFIG.progression.stages.find((s) => s.id === g.stage + 1);
  if (!next) return null;
  const nw = netWorth();
  const checks = [
    { label: `Reputation ${next.rep}`, ok: g.rep >= next.rep, cur: Math.round(g.rep) },
    { label: `${next.repairs} repairs completed`, ok: g.stats.repairs >= next.repairs, cur: g.stats.repairs },
    { label: `Net worth ${CONFIG.currency} ${next.netWorth.toLocaleString()}`, ok: nw >= next.netWorth, cur: nw },
    ...next.research.map((r) => ({ label: `Research: ${researchById(r).name}`, ok: g.research.done.includes(r), cur: g.research.done.includes(r) ? 1 : 0 })),
  ];
  return { next, checks, ready: checks.every((c) => c.ok) };
}

export function checkProgression() {
  const g = G();
  if (g.mode === 'freeplay' || g.mode === 'challenge') return;
  const info = nextStageInfo();
  if (info?.ready) {
    g.stage = info.next.id;
    notify(`🏆 Promoted to stage ${g.stage}: ${info.next.name}! New tools, research and options unlocked.`, 'good');
    changed();
  }
}

// ------------------------------------------------------------------
// Locations, branches, franchise, manufacturing
// ------------------------------------------------------------------
export function moveTo(locationId: string, buy: boolean) {
  const g = G();
  const loc = locationById(locationId);
  if (loc.stage > g.stage && g.mode !== 'freeplay') return notify(`Needs stage ${loc.stage}.`, 'bad');
  const deposit = buy ? loc.buyPrice : loc.rentPerDay * 10;
  if (!spend(deposit, 'rent')) return;
  // keep furniture that fits, refund the rest at 50%
  for (const f of [...g.shop.furniture]) {
    const def = furnitureById(f.defId);
    if (f.x + def.w > loc.w || f.y + def.h > loc.h) {
      g.shop.furniture = g.shop.furniture.filter((x) => x !== f);
      earn(def.price * CONFIG.shop.sellBackFraction, 'furniture');
    }
  }
  g.shop.locationId = locationId;
  g.shop.owned = buy;
  for (const e of g.employees) {
    e.x = e.tx = 1;
    e.y = e.ty = loc.h - 1;
  }
  notify(`🏬 Moved to ${loc.name}${buy ? ' (owned!)' : ''}.`, 'good');
}

export function buyCurrentLocation() {
  const g = G();
  const loc = locationById(g.shop.locationId);
  if (g.shop.owned) return;
  if (!spend(loc.buyPrice, 'rent')) return;
  g.shop.owned = true;
  notify(`🏠 You now own ${loc.name}. No more rent!`, 'good');
}

const AREAS = ['Saddar', 'Johar Town', 'Clifton', 'Blue Area', 'Model Town', 'Bahria Town', 'Satellite Town', 'Cantt', 'F-10 Markaz', 'Tariq Road'];

export function openBranch(franchise = false) {
  const g = G();
  if (!franchise && g.stage < 4 && g.mode !== 'freeplay') return notify('Branches unlock at stage 4 (Repair Company).', 'bad');
  if (franchise && !g.research.done.includes('franchising') && g.mode !== 'freeplay') return notify('Research the franchise programme first.', 'bad');
  if (!franchise && !spend(CONFIG.lategame.branchOpenCost, 'equipment')) return;
  const area = pick(AREAS.filter((a) => !g.branches.some((b) => b.area === a))) ?? pick(AREAS);
  g.branches.push({ id: uid('br'), name: `${g.shopName} ${area}`, area, openedDay: g.day, staff: franchise ? 0 : 3, quality: franchise ? 55 : 70, franchise });
  if (franchise) {
    earn(CONFIG.lategame.franchiseFee, 'franchise');
    notify(`🤝 Sold a franchise in ${area} for ${CONFIG.currency} ${CONFIG.lategame.franchiseFee.toLocaleString()}.`, 'good');
  } else notify(`🏪 Opened a new branch in ${area}.`, 'good');
}

export function upgradeBranch(id: string) {
  const g = G();
  const b = g.branches.find((x) => x.id === id);
  if (!b || b.franchise) return;
  if (!spend(800_000, 'equipment')) return;
  b.quality = clamp(b.quality + 8, 0, 100);
  b.staff++;
}

export function setupManufacturing() {
  const g = G();
  if (!g.research.done.includes('manufacturing') && g.mode !== 'freeplay') return notify('Research manufacturing first.', 'bad');
  if (!spend(CONFIG.lategame.manufacturingSetup, 'equipment')) return;
  g.manufacturing.setup = true;
  notify('🏭 Your factory line is ready. Design your first phone!', 'good');
}

export function designPhone(name: string, tier: 'budget' | 'mid' | 'flagship', price: number) {
  const g = G();
  const quality = CONFIG.lategame.designQuality[tier] + Math.round(g.rep / 10);
  g.manufacturing.designs.push({ id: uid('des'), name, tier, price, quality });
  notify(`📐 Designed the ${name}.`, 'good');
}

export function produceBatch(designId: string) {
  const g = G();
  const d = g.manufacturing.designs.find((x) => x.id === designId);
  if (!d) return;
  const cost = CONFIG.lategame.unitCost[d.tier] * CONFIG.lategame.unitsPerBatch;
  if (!spend(cost, 'equipment')) return;
  g.manufacturing.stock[d.id] = (g.manufacturing.stock[d.id] ?? 0) + CONFIG.lategame.unitsPerBatch;
  notify(`🏭 Produced ${CONFIG.lategame.unitsPerBatch} units of ${d.name}.`, 'good');
}

function manufacturingDaily() {
  const g = G();
  for (const d of g.manufacturing.designs) {
    const stock = g.manufacturing.stock[d.id] ?? 0;
    if (!stock) continue;
    const fair = CONFIG.lategame.unitCost[d.tier] * (1.2 + d.quality / 100);
    const demand = 25 * Math.pow(fair / d.price, 2.5) * (0.5 + g.rep / 80) * (1 + g.branches.length * 0.3);
    const sold = Math.min(stock, Math.max(0, Math.round(demand * rand(0.6, 1.3))));
    if (!sold) continue;
    g.manufacturing.stock[d.id] -= sold;
    g.manufacturing.sold += sold;
    earn(sold * d.price, 'manufacturing');
  }
}

// ------------------------------------------------------------------
// misc
// ------------------------------------------------------------------
export const allResearch = RESEARCH;
export const allTools = TOOLS;
export const sellableSlots = SELLABLE_SLOTS;
export const nowAbs = absMinute;
