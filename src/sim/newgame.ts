/**
 * New game setup for each mode + challenge puzzles.
 */
import { CONFIG } from '../CONFIG';
import { COMPETITORS } from '../data/business';
import { CHALLENGES } from '../data/challenges';
import { CHIP_PARTS, SLOT_PRICE_FRACTION } from '../data/parts';
import { PHONES, phoneById } from '../data/phones';
import { RESEARCH } from '../data/research';
import { STARTING_TOOLS, TOOLS, toolById } from '../data/tools';
import type { PartGrade, Slot } from '../data/types';
import { refreshCandidates, hire, assignBenches } from './employees';
import { generateListings } from './market';
import { createPhone, makeComponent, modelBaseValue, phoneFaults } from './phones';
import { runTestSuite } from '../repair/diagnostics';
import { pick, uid } from './rng';
import { G, notify, setGame, type GameMode, type GameState } from './state';
import { computeShares } from './world';
import { absMinute } from './clock';

export function newGame(mode: GameMode, shopName: string): GameState {
  const loc = mode === 'tycoon' ? 'shop' : mode === 'freeplay' ? 'centre' : 'booth';
  const cashMult = mode === 'expert' ? CONFIG.modes.expert.cashMult : mode === 'tycoon' ? CONFIG.modes.tycoon.cashMult : 1;
  const g: GameState = {
    version: 1,
    mode,
    shopName: shopName || 'Phone Bazaar',
    day: 1,
    minute: CONFIG.time.openHour * 60,
    speed: 1,
    cash: mode === 'freeplay' ? CONFIG.start.freePlayCash : Math.round(CONFIG.start.cash * cashMult),
    rep: CONFIG.start.reputation,
    stage: mode === 'freeplay' ? 5 : mode === 'tycoon' ? 2 : 1,
    playerSkill: CONFIG.start.playerSkill,
    stats: { repairs: 0, failed: 0, refurbSold: 0, partsSold: 0, customersServed: 0, customersLost: 0, warrantyClaims: 0 },
    phones: {},
    customers: [],
    jobs: [],
    employees: [],
    candidates: [],
    inventory: [],
    chips: {},
    consumables: { adhesive: 10, ipa: 10, kapton: 10, flux: 2, jumper: 5, glassOca: 0, solderBalls: 0 },
    orders: [],
    tools: {},
    research: { done: [], active: null },
    listings: [],
    devices: [],
    ledger: {},
    loans: [],
    insurance: 'none',
    pricing: { global: 1, services: {}, tiers: { budget: 1, mid: 1, flagship: 1, foldable: 1, legacy: 1 } },
    partPriceIndex: Object.fromEntries(Object.keys(SLOT_PRICE_FRACTION).map((k) => [k, 1])),
    modelDemand: Object.fromEntries(PHONES.map((p) => [p.id, 1])),
    priceHistory: {},
    competitors: COMPETITORS.map((c) => ({ ...c, priceWar: 0, share: 0.2 })),
    shareHistory: [],
    reviews: [],
    shop: {
      locationId: loc,
      owned: false,
      furniture: [],
      wall: '#e9e4da',
      floor: '#b9a68a',
      signColor: '#ff6b2c',
    },
    branches: [],
    businessAccounts: [],
    offers: [],
    manufacturing: { setup: false, designs: [], stock: {}, sold: 0 },
    effects: { loadshedding: 0, demandMult: 1, demandDays: 0, spikeSlot: null, spikeDays: 0, supplierDelay: 0 },
    bench: { phoneId: null, jobId: null, tool: 'screwdriver', bit: 'phillips', screwSel: null, mistakes: [] },
    log: [],
    dayReport: null,
    regulars: [],
    policy: { autoAssign: mode === 'tycoon', autoOrder: mode === 'tycoon', grade: 'aftermarket', warrantyDays: CONFIG.customers.warrantyDays },
    onlineRequests: [],
    scrap: 0,
  };
  setGame(g);
  // furniture
  const F = (defId: string, x: number, y: number) => g.shop.furniture.push({ id: uid('f'), defId, x, y });
  if (loc === 'booth') {
    F('bench_basic', 0, 0);
    F('shelf_small', 6, 0);
    F('counter', 2, 3);
    F('chairs', 5, 3);
  } else if (loc === 'shop') {
    F('bench_basic', 0, 0);
    F('bench_basic', 3, 0);
    F('bench_basic', 6, 0);
    F('shelf_large', 8, 0);
    F('counter', 3, 4);
    F('chairs', 7, 5);
    F('plant', 0, 5);
  } else {
    F('bench_pro', 0, 0);
    F('bench_pro', 3, 0);
    F('bench_pro', 6, 0);
    F('bench_pro', 9, 0);
    F('shelf_large', 12, 0);
    F('shelf_large', 12, 2);
    F('counter_glass', 5, 6);
    F('sofa', 10, 7);
    F('ups', 0, 8);
    F('cctv', 13, 8);
  }
  // tools
  const tools = mode === 'freeplay' ? highestTools() : STARTING_TOOLS;
  for (const id of tools) g.tools[toolById(id).category] = { id, wear: 0 };
  if (mode === 'tycoon') for (const id of ['driver_2', 'open_2', 'heat_2', 'diag_1', 'meter_1', 'scope_1']) g.tools[toolById(id).category] = { id, wear: 0 };
  if (mode === 'freeplay') g.research.done = RESEARCH.map((r) => r.id);
  if (mode === 'freeplay') for (const c of CHIP_PARTS) g.chips[c.type] = 20;
  if (mode === 'freeplay') Object.keys(g.consumables).forEach((k) => (g.consumables[k] = 99));
  // starter stock: a few common parts
  const starters: [string, Slot, PartGrade][] = [
    ['realmi-c55', 'battery', 'aftermarket'],
    ['realmi-c55', 'display', 'aftermarket'],
    ['redmo-12c', 'subBoard', 'aftermarket'],
    ['tecnoh-spark-10', 'battery', 'aftermarket'],
    ['galaxo-a14', 'display', 'aftermarket'],
  ];
  for (const [m, s, gr] of starters) {
    const model = phoneById(m);
    g.inventory.push(makeComponent(model, s, gr, { cost: 1500, source: 'Starter stock' }));
  }
  // price history seed
  for (const m of PHONES) g.priceHistory[m.id] = Array.from({ length: 14 }, () => Math.round(modelBaseValue(m) * (0.95 + Math.random() * 0.1)));
  refreshCandidates();
  generateListings();
  computeShares();
  if (mode === 'tycoon') {
    for (let i = 0; i < CONFIG.modes.tycoon.startEmployees; i++) {
      const c = g.candidates[i];
      g.cash += c.salary * CONFIG.employees.hireFeeDays;
      hire(c);
    }
    refreshCandidates();
    assignBenches();
  }
  if (mode === 'challenge') {
    g.research.done = RESEARCH.map((r) => r.id);
    for (const id of highestTools()) g.tools[toolById(id).category] = { id, wear: 0 };
    for (const c of CHIP_PARTS) g.chips[c.type] = 10;
    Object.keys(g.consumables).forEach((k) => (g.consumables[k] = 50));
    g.challenge = { puzzle: 0, score: 0, startedMinute: 0, startedDay: 1, history: [] };
    startPuzzle(0);
  }
  return g;
}

function highestTools() {
  const best: Record<string, string> = {};
  for (const t of TOOLS) {
    const cur = best[t.category];
    if (!cur || toolById(cur).tier < t.tier) best[t.category] = t.id;
  }
  return Object.values(best);
}

// ------------------------------------------------------------------
// Challenge mode
// ------------------------------------------------------------------
export function startPuzzle(i: number) {
  const g = G();
  const ch = CHALLENGES[i];
  if (!ch) return;
  const model = phoneById(ch.modelId);
  const phone = createPhone(model, { owner: 'player', faultIds: ch.faults, previousRepairChance: 0 });
  g.phones[phone.id] = phone;
  g.devices.push(phone.id);
  // spare parts for every slot (genuine) so the puzzle is about diagnosis
  for (const f of ch.faults) void f;
  const slots = Object.keys(phone.components) as Slot[];
  for (const s of slots) {
    if (s === 'board' || s === 'midframe') continue;
    g.inventory.push(makeComponent(model, s, 'genuine', { cost: 0, source: 'Challenge kit', pairedTo: phone.serial }));
  }
  g.challenge!.puzzle = i;
  g.challenge!.startedMinute = absMinute();
  g.bench = { phoneId: phone.id, jobId: null, tool: 'screwdriver', bit: 'phillips', screwSel: null, mistakes: [] };
  notify(`🧩 Challenge ${i + 1}: ${ch.name}. ${ch.brief}`, 'event');
}

export function submitPuzzle(): { score: number; passed: boolean; text: string } {
  const g = G();
  const ch = g.challenge!;
  const phone = g.phones[g.bench.phoneId!];
  const remaining = phoneFaults(phone).length;
  const tests = runTestSuite(phone).results;
  const fails = Object.values(tests).filter((r) => r === 'fail').length;
  const used = absMinute() - ch.startedMinute;
  const passed = remaining === 0 && fails === 0;
  const score = passed
    ? Math.max(0, CONFIG.challenge.scorePerPuzzle + Math.max(0, CONFIG.challenge.puzzleMinutes - used) * CONFIG.challenge.timeBonusPerMinute - g.bench.mistakes.length * CONFIG.challenge.mistakePenalty)
    : 0;
  ch.score += score;
  ch.history.push({ puzzle: ch.puzzle, score });
  const text = passed ? `Solved in ${used} min with ${g.bench.mistakes.length} mistakes: +${score} points.` : `Not solved: ${remaining} fault(s) left, ${fails} test(s) failing. 0 points.`;
  // clean up and go next
  g.devices = g.devices.filter((x) => x !== phone.id);
  delete g.phones[phone.id];
  g.inventory = g.inventory.filter((x) => x.source !== 'Challenge kit');
  g.bench = { phoneId: null, jobId: null, tool: 'screwdriver', bit: 'phillips', screwSel: null, mistakes: [] };
  if (ch.puzzle + 1 < CHALLENGES.length) startPuzzle(ch.puzzle + 1);
  else notify(`🏁 Challenge complete! Final score: ${ch.score}`, 'good');
  return { score, passed, text };
}

export const pickAny = pick;
