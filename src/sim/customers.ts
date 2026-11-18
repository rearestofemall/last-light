/**
 * Customers: generation, quoting, bargaining, jobs, pickup & payment,
 * reviews, warranty claims (incl. scammers), mail-in & business jobs.
 */
import { CONFIG } from '../CONFIG';
import { COMPANY_NAMES, FIRST_NAMES, LAST_NAMES, locationById } from '../data/business';
import { faultById } from '../data/faults';
import { SLOT_NAMES } from '../data/parts';
import { phoneById } from '../data/phones';
import { SERVICES, serviceById } from '../data/research';
import type { PhoneModelDef, Slot, TestId } from '../data/types';
import { runTestSuite } from '../repair/diagnostics';
import { absMinute, isOpen } from './clock';
import { earn, spend } from './economy';
import { basePartPrice, createPhone, phoneFaults, phoneName, phoneValue, randomModel, resolveSlot } from './phones';
import { chance, clamp, pick, rand, randi, uid, weighted } from './rng';
import { G, notify, type Customer, type Job, type PhoneInst } from './state';

export const PERSONALITIES: { id: Customer['personality']; name: string; weight: number; budget: number; patience: number; quality: number; desc: string }[] = [
  { id: 'regular', name: 'Regular', weight: 10, budget: 1.0, patience: 1.0, quality: 60, desc: 'Fair and reasonable.' },
  { id: 'impatient', name: 'Impatient', weight: 4, budget: 1.0, patience: 0.5, quality: 55, desc: 'Leaves quickly, wants it fast.' },
  { id: 'picky', name: 'Picky', weight: 3, budget: 1.2, patience: 1.0, quality: 85, desc: 'Expects genuine parts and perfect work.' },
  { id: 'cheap', name: 'Bargain hunter', weight: 5, budget: 0.7, patience: 1.2, quality: 45, desc: 'Haggles hard, accepts cheap parts.' },
  { id: 'emergency', name: 'Emergency', weight: 2, budget: 1.5, patience: 0.6, quality: 60, desc: 'Needs it today, pays extra for express.' },
  { id: 'business', name: 'Business client', weight: 1.5, budget: 1.3, patience: 1.0, quality: 70, desc: 'Brings repeat work if happy.' },
  { id: 'scammer', name: '???', weight: 0, budget: 1.0, patience: 1.0, quality: 50, desc: 'Something feels off.' },
];
export const personalityDef = (id: string) => PERSONALITIES.find((p) => p.id === id)!;

export const randomName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

/** The service that fixes a fault (first match). */
export function serviceForFault(faultId: string) {
  return SERVICES.find((s) => s.fixes.includes(faultId) && s.id !== 'sv_glass');
}

/** Price breakdown of a quote for a model. */
export function quoteFor(model: PhoneModelDef, services: string[], express = false) {
  const g = G();
  const tierMult = CONFIG.pricing.tierMult[model.tier];
  const lines: { name: string; labour: number; parts: number }[] = [];
  for (const id of services) {
    const s = serviceById(id);
    const labour = s.basePrice * tierMult * (g.pricing.services[id] ?? 1) * (g.pricing.tiers[model.tier] ?? 1);
    let parts = 0;
    const slot = s.slots?.map((x) => resolveSlot(model, x)).find(Boolean) as Slot | undefined;
    if (slot) parts = basePartPrice(model, slot) * 0.75;
    if (id === 'sv_glass') parts = 1_300;
    if (id === 'sv_board' || id === 'sv_board_adv') parts = 2_000;
    lines.push({ name: s.name, labour: Math.round(labour * g.pricing.global), parts: Math.round(parts * g.pricing.global) });
  }
  let total = lines.reduce((a, l) => a + l.labour + l.parts, 0);
  if (express) total *= 1 + CONFIG.customers.sameDayBonus;
  return { lines, total: Math.round(total / 50) * 50 };
}

/** Is a service available (research)? */
export const serviceAvailable = (id: string) => {
  const s = serviceById(id);
  const g = G();
  return !s.research || g.research.done.includes(s.research) || g.mode === 'freeplay';
};

// ------------------------------------------------------------------
// Spawning
// ------------------------------------------------------------------
export function spawnCustomer(opts: { mailIn?: boolean; faultId?: string; modelId?: string; name?: string } = {}): Customer {
  const g = G();
  const model = opts.modelId ? phoneById(opts.modelId) : randomModel();
  const faults = randi(1, 1) + (chance(CONFIG.customers.hiddenExtraFaultChance) ? 1 : 0) + (chance(0.12) ? 1 : 0);
  const phone = createPhone(model, { owner: 'customer', faults: opts.faultId ? faults - 1 : faults, faultIds: opts.faultId ? [opts.faultId] : undefined });
  if (!phoneFaults(phone).length) createPhoneFallback(phone);
  g.phones[phone.id] = phone;
  const pers = weighted(PERSONALITIES, (p) => p.weight);
  // Reported symptoms: from non-hidden faults
  const pf = phoneFaults(phone);
  const reported = pf.filter((f, i) => i === 0 || !chance(faultById(f.id).hiddenChance));
  const symptoms = [...new Set(reported.map((f) => pick(faultById(f.id).symptoms)))];
  const value = phoneValue(phone, { assumeFixed: true });
  const fairCost = quoteFor(model, reported.map((f) => serviceForFault(f.id)?.id).filter(Boolean) as string[]).total;
  const budget = Math.round(Math.min(value * 0.7, fairCost * rand(0.85, 1.35) * pers.budget) / 100) * 100;
  let name = opts.name ?? randomName();
  let repeat = false;
  let loyalty = 0;
  if (!opts.name && g.regulars.length && chance(CONFIG.customers.repeatChance)) {
    const r = pick(g.regulars);
    name = r.name;
    repeat = true;
    loyalty = r.loyalty;
  }
  const patienceBonus = shopPatienceBonus();
  const maxP = rand(...(CONFIG.customers.patienceMinutes as [number, number])) * pers.patience * (1 + patienceBonus) * (g.mode === 'expert' ? CONFIG.modes.expert.patienceMult : 1) * (1 + loyalty / 200);
  const c: Customer = {
    id: uid('cus'),
    name,
    personality: pers.id,
    phoneId: phone.id,
    symptoms,
    budget: Math.max(1500, budget),
    patience: maxP,
    maxPatience: maxP,
    expectedQuality: pers.quality + randi(-10, 10),
    deadlineDays: pers.id === 'emergency' ? 0 : randi(...(CONFIG.customers.deadlineDays as [number, number])),
    arrivedAt: absMinute(),
    bargainRound: 0,
    repeat,
    loyalty,
    mailIn: opts.mailIn,
  };
  (phone as any).reported = reported.map((f) => f.id);
  if (!opts.mailIn) g.customers.push(c);
  return c;
}

function createPhoneFallback(phone: PhoneInst) {
  // always give walk-ins at least one fault
  phone.softwareFaults.push('f_os_glitch');
}

function shopPatienceBonus() {
  const g = G();
  let b = 0;
  for (const f of g.shop.furniture) {
    const def = furnitureDef(f.defId);
    b += def?.effect?.patience ?? 0;
  }
  return Math.min(0.8, b);
}
import { furnitureById as furnitureDef } from '../data/business';

/** Scammer / warranty claimant arriving with an older job. */
export function spawnWarrantyClaim(job: Job, faultId: string | null, scam?: 'swapped' | 'physical') {
  const g = G();
  let phone = g.phones[job.phoneId];
  if (!phone) return;
  if (scam === 'swapped') {
    // Different phone of the same model, broken, pretending to be the one you fixed
    const fake = createPhone(phoneById(phone.modelId), { owner: 'customer', faults: 1 });
    fake.colour = phone.colour;
    g.phones[fake.id] = fake;
    phone = fake;
  } else if (scam === 'physical') {
    const disp = phone.components.display;
    if (disp && !disp.faults.includes('f_screen_cracked')) disp.faults.push('f_screen_cracked', 'f_touch_dead');
    phone.cosmetic = Math.min(phone.cosmetic, 35);
  }
  const symptoms = faultId ? [pick(faultById(faultId).symptoms)] : scam === 'physical' ? ['Screen stopped working by itself (warranty!)'] : ['Your repair failed, fix it for free'];
  const c: Customer = {
    id: uid('cus'), name: job.customerName, personality: scam ? 'scammer' : job.personality, phoneId: phone.id, symptoms, budget: 0,
    patience: 180, maxPatience: 180, expectedQuality: job.expectedQuality, deadlineDays: 1, arrivedAt: absMinute(), bargainRound: 0, repeat: true,
    loyalty: job.loyalty, warrantyJobId: job.id, scam,
    note: scam ? 'Claims your earlier repair failed.' : `Warranty claim for job on ${phoneName(phone)}.`,
  };
  (phone as any).reported = faultId ? [faultId] : phoneFaults(phone).map((f) => f.id);
  g.customers.push(c);
  g.stats.warrantyClaims++;
  notify(`🔁 ${c.name} is back with a warranty claim.`, 'warn');
}

// ------------------------------------------------------------------
// Queue handling
// ------------------------------------------------------------------
export function arrivalRatePerMinute(): number {
  const g = G();
  const loc = locationById(g.shop.locationId);
  const repF = 0.7 + g.rep / 100;
  const myShare = 0.75 + playerShare() * 3;
  const decor = g.shop.furniture.reduce((a, f) => a + (furnitureDef(f.defId)?.effect?.rep ?? 0), 0);
  const stageF = 1 + (g.stage - 1) * 0.35;
  const demand = g.effects.demandDays > 0 ? g.effects.demandMult : 1;
  const tycoon = g.mode === 'tycoon' ? 1.6 : 1;
  return (CONFIG.customers.baseArrivalsPerHour / 60) * loc.traffic * repF * clamp(myShare, 0.75, 1.5) * stageF * demand * tycoon * (1 + Math.min(0.3, decor * 0.03));
}

export function playerShare() {
  const g = G();
  const total = g.competitors.reduce((a, c) => a + c.share, 0);
  return clamp(1 - total, 0.02, 1);
}

export function customersTick() {
  const g = G();
  if (g.mode !== 'challenge' && isOpen() && g.customers.length < CONFIG.customers.maxQueue + g.stage && chance(arrivalRatePerMinute())) {
    const c = spawnCustomer();
    notify(`🚶 ${c.name} walked in: "${c.symptoms[0]}"`, 'info');
  }
  // patience
  for (const c of [...g.customers]) {
    c.patience -= 1;
    if (c.patience <= 0) {
      g.customers = g.customers.filter((x) => x !== c);
      g.stats.customersLost++;
      g.rep = clamp(g.rep - 0.35, 0, 100);
      if (!c.warrantyJobId) delete g.phones[c.phoneId];
      notify(`😤 ${c.name} got tired of waiting and left.`, 'bad');
      if (chance(0.3)) addReview(c.name, 2, 'Waited forever at the counter and nobody helped me.', true);
    }
  }
  // pickups
  const now = absMinute();
  for (const j of g.jobs) {
    if (j.status === 'ready' && j.pickupAt !== undefined && now >= j.pickupAt && (isOpen() || j.mailIn)) settleJob(j);
  }
}

// ------------------------------------------------------------------
// Quotes, bargaining and acceptance
// ------------------------------------------------------------------
export interface QuoteResponse {
  accepted: boolean;
  counter?: number;
  leave?: boolean;
  text: string;
}

export function willingness(c: Customer, express: boolean) {
  const pers = personalityDef(c.personality);
  let w = c.budget * (1 + CONFIG.customers.acceptQuoteSlack) * (1 + c.loyalty / 300);
  if (express && c.personality === 'emergency') w *= 1 + CONFIG.customers.sameDayBonus;
  if (pers.id === 'cheap') w *= 0.95;
  // reputation lets you charge more
  w *= 0.85 + G().rep / 300;
  return w;
}

export function proposeQuote(c: Customer, price: number, express: boolean): QuoteResponse {
  const w = willingness(c, express);
  if (c.personality === 'emergency' && !express) {
    c.patience -= 20;
    return { accepted: false, text: '"I need it TODAY. Can you do express?"' };
  }
  if (price <= w) return { accepted: true, text: pick(['"Okay, deal. Please be careful with it."', '"Fine, go ahead."', '"Theek hai, kar dein."']) };
  c.bargainRound++;
  c.patience -= 15;
  if (c.bargainRound > CONFIG.customers.bargainRounds || price > w * 1.8) {
    return { accepted: false, leave: true, text: pick(['"That\'s way too much. I\'ll go to Mobile Doctor."', '"Forget it."', '"Bhai, itna mehnga? No thanks."']) };
  }
  const counter = Math.round((w * rand(0.82, 0.98)) / 50) * 50;
  c.lastOffer = counter;
  return { accepted: false, counter, text: `"Too expensive. I can pay ${CONFIG.currency} ${counter.toLocaleString()}."` };
}

/** Create a job from an accepted quote. */
export function acceptJob(c: Customer, services: string[], price: number, express: boolean, diagnosisOnly = false): Job {
  const g = G();
  const phone = g.phones[c.phoneId];
  const days = express ? 0 : c.deadlineDays;
  const job: Job = {
    id: uid('job'),
    customerName: c.name,
    customerId: c.id,
    personality: c.personality,
    phoneId: c.phoneId,
    symptoms: c.symptoms,
    services: diagnosisOnly ? [] : services,
    price: diagnosisOnly ? CONFIG.pricing.diagnosticFee : price,
    depositPaid: 0,
    dueDay: g.day + days,
    createdDay: g.day,
    status: 'open',
    assignedTo: null,
    progress: 0,
    quality: null,
    mistakes: [],
    partsCost: 0,
    warranty: !!c.warrantyJobId,
    warrantyOf: c.warrantyJobId,
    originalImei: c.warrantyJobId ? g.phones[g.jobs.find((j) => j.id === c.warrantyJobId)?.phoneId ?? '']?.imei ?? '' : phone.imei,
    expectedQuality: c.expectedQuality,
    budget: c.budget,
    mailIn: c.mailIn,
    log: [`Day ${g.day}: received. Customer says: ${c.symptoms.join('; ')}`],
    replacedGrades: [],
    counterfeitUsed: false,
    loyalty: c.loyalty,
    scam: c.scam,
  };
  (job as any).reported = (phone as any).reported ?? [];
  (job as any).testsBefore = runTestSuite(phone).results;
  (job as any).express = express;
  (job as any).diagnosisOnly = diagnosisOnly;
  g.jobs.push(job);
  g.customers = g.customers.filter((x) => x !== c);
  g.stats.customersServed++;
  return job;
}

export function declineCustomer(c: Customer, reason = '') {
  const g = G();
  g.customers = g.customers.filter((x) => x !== c);
  if (c.warrantyJobId) {
    if (c.scam) {
      notify(`✅ You rejected ${c.name}'s bogus warranty claim. Good catch.`, 'good');
      g.rep = clamp(g.rep + 0.3, 0, 100);
    } else {
      g.rep = clamp(g.rep - 3, 0, 100);
      addReview(c.name, 1, 'Refused to honour their own warranty. Avoid!', true);
      notify(`❌ You refused a legitimate warranty claim. Reputation hit.`, 'bad');
    }
  } else delete g.phones[c.phoneId];
  void reason;
}

/** Offer the customer extra services found during diagnosis (upsell). */
export function proposeExtra(job: Job, services: string[]): boolean {
  const g = G();
  const phone = g.phones[job.phoneId];
  const model = phoneById(phone.modelId);
  const add = quoteFor(model, services).total;
  const p = CONFIG.customers.upsellAcceptBase * clamp((job.budget * 1.3) / Math.max(1, job.price + add), 0.2, 1.4) + job.loyalty / 400;
  if (chance(p)) {
    job.services = [...new Set([...job.services, ...services])];
    job.price += add;
    if ((job as any).diagnosisOnly) {
      (job as any).diagnosisOnly = false;
      job.price -= CONFIG.pricing.diagnosticFee * 0.5; // diagnostic fee partly waived
    }
    job.log.push(`Day ${g.day}: customer approved extra work (${services.map((s) => serviceById(s).name).join(', ')}) for +${add}.`);
    notify(`📞 ${job.customerName} approved the extra work (+${CONFIG.currency} ${add.toLocaleString()}).`, 'good');
    return true;
  }
  job.log.push(`Day ${g.day}: customer declined extra work.`);
  notify(`📞 ${job.customerName} declined the extra work.`, 'warn');
  return false;
}

// ------------------------------------------------------------------
// Completion, pickup, payment & reviews
// ------------------------------------------------------------------
export function markReady(job: Job, quality: number, tests: Partial<Record<TestId, boolean>>, mistakes: string[]) {
  const g = G();
  job.status = 'ready';
  job.quality = Math.round(quality);
  job.testsAfter = tests;
  job.mistakes.push(...mistakes);
  job.completedDay = g.day;
  const delay = rand(...(CONFIG.customers.pickupDelayMinutes as [number, number]));
  job.pickupAt = absMinute() + (job.mailIn ? 5 : delay);
  job.log.push(`Day ${g.day}: repair finished. Quality ${job.quality}/100.`);
}

export function settleJob(job: Job) {
  const g = G();
  const phone = g.phones[job.phoneId];
  if (!phone) {
    job.status = 'done';
    return;
  }
  const reported: string[] = (job as any).reported ?? [];
  const remaining = phoneFaults(phone).map((f) => f.id);
  const unresolved = reported.filter((f) => remaining.includes(f));
  const before = (job as any).testsBefore ?? {};
  const after = runTestSuite(phone).results;
  const newlyBroken = Object.keys(after).filter((t) => before[t] === 'pass' && after[t as TestId] === 'fail');
  const lateDays = Math.max(0, (job.completedDay ?? g.day) - job.dueDay);
  let sat = 72;
  if (unresolved.length) sat -= 45;
  sat -= newlyBroken.length * 18;
  sat += ((job.quality ?? 50) - job.expectedQuality) * 0.5;
  sat -= lateDays * CONFIG.customers.lateDayPenalty * 100;
  if (job.budget) sat += clamp(((job.budget - job.price) / job.budget) * 25, -15, 15);
  if (job.personality === 'picky' && job.replacedGrades.some((gr) => gr !== 'genuine')) sat -= 15;
  if (job.personality === 'cheap') sat += 5;
  sat += job.loyalty / 10;
  const stars = clamp(Math.round(sat / 20), 1, 5);
  let paid = 0;
  const diagOnly = (job as any).diagnosisOnly;
  if (job.warranty) {
    paid = 0;
  } else if (diagOnly) {
    paid = CONFIG.pricing.diagnosticFee;
  } else if (unresolved.length || newlyBroken.length) {
    paid = unresolved.length >= reported.length ? 0 : Math.round(job.price * 0.5);
  } else paid = job.price;
  if (paid > 0) earn(paid, job.mailIn ? 'online' : job.businessId ? 'contracts' : 'repairs');
  if (job.mailIn) spend(CONFIG.customers.mailInShipping, 'misc', true);
  job.status = 'done';
  job.pickupAt = undefined;
  g.stats.repairs++;
  if (unresolved.length || newlyBroken.length) g.stats.failed++;
  // reputation
  // good reviews matter less the better known you are; bad ones always hurt
  const repDelta = stars >= 3 ? (stars - 3) * CONFIG.customers.reviewWeight * 0.5 * (1 - g.rep / 110) : (stars - 3) * CONFIG.customers.reviewWeight;
  g.rep = clamp(g.rep + repDelta, 0, 100);
  // regulars remember you
  const reg = g.regulars.find((r) => r.name === job.customerName);
  if (reg) {
    reg.loyalty = clamp(reg.loyalty + (stars - 3) * 10, -50, 100);
    reg.visits++;
  } else if (stars >= 4) g.regulars.push({ name: job.customerName, loyalty: 10, visits: 1 });
  if (g.regulars.length > 40) g.regulars.shift();
  const text = reviewText(stars, unresolved.length > 0, newlyBroken.length > 0, lateDays > 0, job);
  if (chance(0.55) || stars <= 2) addReview(job.customerName, stars, text, job.mailIn || chance(0.4));
  const name = phoneName(phone);
  notify(
    paid > 0
      ? `💰 ${job.customerName} picked up the ${name} and paid ${CONFIG.currency} ${paid.toLocaleString()} (${'★'.repeat(stars)}${'☆'.repeat(5 - stars)})`
      : `😠 ${job.customerName} picked up the ${name} and refused to pay. ${unresolved.length ? 'The problem is still there!' : 'Something else broke!'}`,
    paid > 0 ? 'good' : 'bad',
  );
  // keep phone for warranty tracking, but mark as with customer
  phone.owner = 'customer';
}

function reviewText(stars: number, unresolved: boolean, broke: boolean, late: boolean, job: Job) {
  if (unresolved) return pick(['They charged me and the problem is still there.', 'Did not fix anything. Waste of time.', 'Same problem after "repair". Useless.']);
  if (broke) return pick(['Fixed one thing, broke another. Now my camera does not work!', 'Phone came back worse than I gave it.']);
  if (late) return pick(['Good repair but took way longer than promised.', 'Late, but it works now.']);
  if (stars >= 5) return pick(['Excellent work, phone feels brand new!', 'Honest guys, fair price, super fast. Highly recommended!', 'Best repair shop in the market. Showed me the old part too.']);
  if (stars === 4) return pick(['Good service, reasonable price.', 'Fixed my phone same day. Happy.', 'Works perfectly, a bit pricey.']);
  if (stars === 3) return pick(['It works. Nothing special.', 'Okay repair, screen feels a bit different.']);
  void job;
  return pick(['Not happy with the quality.', 'Phone feels cheap after the repair.']);
}

export function addReview(name: string, stars: number, text: string, online: boolean) {
  const g = G();
  g.reviews.unshift({ day: g.day, stars, text, name, online });
  if (g.reviews.length > 120) g.reviews.length = 120;
}

/** Daily: parts on finished jobs can fail inside the warranty window. */
export function warrantyCheck() {
  const g = G();
  const days = g.policy.warrantyDays;
  for (const j of g.jobs) {
    if (j.status !== 'done' || j.warranty || (j as any).claimed) continue;
    if (g.day - (j.completedDay ?? 0) > days) continue;
    const phone = g.phones[j.phoneId];
    if (!phone) continue;
    for (const comp of Object.values(phone.components)) {
      if (!comp || !phone.history.some((h) => h.slot === comp.slot && h.by === g.shopName)) continue;
      const grade = comp.counterfeit ? 'counterfeit' : comp.grade;
      const p = CONFIG.parts.gradeWarrantyFailChance[grade] / Math.max(1, days) * (comp.condition < 80 ? 1.5 : 1);
      if (chance(p)) {
        const failFault: Record<string, string> = { display: 'f_touch_dead', battery: 'f_batt_worn', loudspeaker: 'f_loudspeaker', subBoard: 'f_port_damaged', chargeFlex: 'f_chargeflex', mainCam: 'f_maincam', frontCam: 'f_frontcam', earpiece: 'f_earpiece', backCover: 'f_backglass' };
        const fid = failFault[comp.slot];
        if (!fid) continue;
        if (!comp.faults.includes(fid)) comp.faults.push(fid);
        if (comp.slot === 'battery') comp.condition = Math.min(comp.condition, 70);
        (j as any).claimed = true;
        spawnWarrantyClaim(j, fid);
        break;
      }
    }
  }
  // scammers
  const recent = g.jobs.filter((j) => j.status === 'done' && !j.warranty && g.day - (j.completedDay ?? 0) <= days && !(j as any).claimed);
  if (recent.length && chance(CONFIG.customers.scammerChance)) {
    const j = pick(recent);
    (j as any).claimed = true;
    spawnWarrantyClaim(j, null, chance(0.5) ? 'swapped' : 'physical');
  }
  // forget old phones
  for (const j of g.jobs) {
    if (j.status === 'done' && g.day - (j.completedDay ?? 0) > days + 2 && g.phones[j.phoneId] && !g.devices.includes(j.phoneId)) {
      delete g.phones[j.phoneId];
    }
  }
  g.jobs = g.jobs.filter((j) => !(j.status === 'done' && g.day - (j.completedDay ?? 0) > days + 10));
}

// ------------------------------------------------------------------
// Online: mail-in requests & business accounts
// ------------------------------------------------------------------
export function dailyOnline() {
  const g = G();
  g.onlineRequests = g.onlineRequests.filter((r) => r.expiresDay >= g.day);
  if (g.research.done.includes('online-repairs') || g.mode === 'freeplay') {
    const n = Math.floor(CONFIG.customers.mailInPerDay * (0.5 + g.rep / 50) + Math.random());
    for (let i = 0; i < n; i++) {
      const model = randomModel();
      const pool = SERVICES.filter((s) => serviceAvailable(s.id)).flatMap((s) => s.fixes).map(faultById).filter((f) => f.weight > 0 && f.target.slot && resolveSlot(model, f.target.slot) || (f.weight > 0 && !f.target.slot && f.target.software));
      if (!pool.length) continue;
      const f = weighted(pool, (x) => x.weight);
      g.onlineRequests.push({ id: uid('req'), name: randomName(), modelId: model.id, symptom: pick(f.symptoms), faultId: f.id, expiresDay: g.day + 2 });
    }
  }
  // business accounts send phones
  for (const acc of g.businessAccounts) {
    acc.daysLeft--;
    if (chance(acc.phonesPerWeek / 7)) {
      const model = randomModel((m) => m.tier !== 'foldable');
      const c = spawnCustomer({ mailIn: true, modelId: model.id, name: `${acc.company} (fleet)` });
      const phone = g.phones[c.phoneId];
      const reported = ((phone as any).reported as string[]) ?? [];
      const services = [...new Set(reported.map((f) => serviceForFault(f)?.id).filter(Boolean) as string[])];
      const job = acceptJob(c, services, acc.pricePerJob, false);
      job.businessId = acc.id;
      job.dueDay = g.day + 2;
      job.personality = 'business';
      job.log.push(`Fleet job from ${acc.company}.`);
      notify(`🏢 ${acc.company} sent a fleet phone for repair.`, 'info');
    }
  }
  const expired = g.businessAccounts.filter((a) => a.daysLeft <= 0);
  for (const a of expired) notify(`🏢 Contract with ${a.company} ended.`, 'info');
  g.businessAccounts = g.businessAccounts.filter((a) => a.daysLeft > 0);
}

export function acceptOnlineRequest(id: string) {
  const g = G();
  const r = g.onlineRequests.find((x) => x.id === id);
  if (!r) return;
  const c = spawnCustomer({ mailIn: true, modelId: r.modelId, faultId: r.faultId, name: r.name });
  c.symptoms = [r.symptom];
  const svc = serviceForFault(r.faultId);
  const model = phoneById(r.modelId);
  const price = quoteFor(model, svc ? [svc.id] : []).total + CONFIG.customers.mailInShipping;
  const job = acceptJob(c, svc ? [svc.id] : [], price, false);
  job.dueDay = g.day + 3;
  job.log.push('Mail-in repair booked online. Courier collected the phone.');
  g.onlineRequests = g.onlineRequests.filter((x) => x !== r);
  notify(`📦 Mail-in from ${r.name} received (${model.name}).`, 'good');
}

export function contractOffer() {
  const g = G();
  const company = pick(COMPANY_NAMES);
  g.offers.push({ id: uid('off'), kind: 'contract', company, phones: randi(3, 8), pricePerJob: randi(30, 70) * 100, days: randi(14, 45), expiresDay: g.day + 3 });
  notify(`🏢 ${company} wants a repair contract! See Online → Business.`, 'event');
}

export function acceptOffer(id: string) {
  const g = G();
  const o = g.offers.find((x) => x.id === id);
  if (!o) return;
  g.businessAccounts.push({ id: uid('acc'), company: o.company, phonesPerWeek: o.phones, pricePerJob: o.pricePerJob, daysLeft: o.days, satisfaction: 70, delivered: 0 });
  g.offers = g.offers.filter((x) => x !== o);
  notify(`🤝 Contract signed with ${o.company}.`, 'good');
}

export const slotLabel = (s: Slot) => SLOT_NAMES[s];
