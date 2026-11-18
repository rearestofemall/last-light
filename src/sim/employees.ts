/**
 * Employee AI: hiring, walking to benches, doing repairs with progress and
 * skill-based success, training, morale, and dishonest part swapping.
 */
import { CONFIG } from '../CONFIG';
import { furnitureById, locationById } from '../data/business';
import { faultById } from '../data/faults';
import { CHIP_PARTS } from '../data/parts';
import { phoneById } from '../data/phones';
import { serviceById } from '../data/research';
import { absMinute } from './clock';
import { acceptJobTestsFor, finishJobQuality } from './jobs';
import { randomName } from './customers';
import { spend } from './economy';
import { autoOrderFor } from './market';
import { makeComponent, phoneFaults, resolveSlot, partNoFor, componentQuality } from './phones';
import { chance, clamp, pick, rand, randi, uid } from './rng';
import { G, notify, type Candidate, type Employee, type Job } from './state';

const SPECS = ['screens', 'batteries', 'microsoldering', 'software', 'diagnostics'];

export function makeCandidate(): Candidate {
  const g = G();
  const skill = clamp(Math.round(rand(15, 45) + g.stage * rand(4, 10)), 5, 95);
  const specs = [pick(SPECS)];
  if (chance(0.3)) specs.push(pick(SPECS.filter((s) => !specs.includes(s))));
  return {
    id: uid('emp'),
    name: randomName(),
    skill,
    specs,
    salary: Math.round((skill * CONFIG.employees.baseSalaryPerSkill * rand(0.85, 1.2)) / 50) * 50,
    speed: +rand(0.7, 1.4).toFixed(2),
    honesty: chance(0.15) ? rand(0.05, 0.35) : rand(0.6, 1),
    morale: randi(60, 85),
  };
}

export function refreshCandidates() {
  const g = G();
  g.candidates = Array.from({ length: CONFIG.employees.candidates }, makeCandidate);
}

export function maxEmployees() {
  const g = G();
  const benches = g.shop.furniture.filter((f) => furnitureById(f.defId)?.kind === 'bench').length;
  return Math.max(0, benches - 1); // one bench is yours
}

export function hire(c: Candidate) {
  const g = G();
  if (g.stage < 2 && g.mode === 'career') return notify('You can hire staff once you become a Local Repair Shop (stage 2).', 'bad');
  if (g.employees.length >= maxEmployees()) return notify('No free workbench. Buy another bench in Shop → Build.', 'bad');
  if (!spend(c.salary * CONFIG.employees.hireFeeDays, 'salaries')) return;
  const loc = locationById(g.shop.locationId);
  g.employees.push({ ...c, jobId: null, x: 1, y: loc.h - 1, tx: 1, ty: loc.h - 1, state: 'idle', repairs: 0, fails: 0, revenue: 0, hiredDay: g.day });
  g.candidates = g.candidates.filter((x) => x.id !== c.id);
  assignBenches();
  notify(`👋 Hired ${c.name} (skill ${c.skill}).`, 'good');
}

export function fire(e: Employee) {
  const g = G();
  if (e.jobId) unassign(g.jobs.find((j) => j.id === e.jobId)!);
  g.employees = g.employees.filter((x) => x !== e);
  g.employees.forEach((x) => (x.morale = Math.max(0, x.morale - 5)));
  notify(`${e.name} was let go.`, 'warn');
}

export function train(e: Employee) {
  const g = G();
  const cost = CONFIG.employees.trainingCost * (g.research.done.includes('training-2') ? 0.6 : 1);
  if (!spend(cost, 'salaries')) return;
  if (e.jobId) unassign(g.jobs.find((j) => j.id === e.jobId)!);
  e.state = 'training';
  e.trainingUntil = absMinute() + 8 * 60;
  notify(`📚 ${e.name} is at a training course for the day.`, 'info');
}

export function giveRaise(e: Employee) {
  e.salary = Math.round((e.salary * 1.1) / 50) * 50;
  e.morale = clamp(e.morale + CONFIG.employees.moraleRaiseOnRaise, 0, 100);
  notify(`${e.name} got a 10% raise. Morale up!`, 'good');
}

export function performanceReview(e: Employee): string {
  const rate = e.repairs ? Math.round(((e.repairs - e.fails) / e.repairs) * 100) : 0;
  const lines = [
    `${e.name}: ${e.repairs} repairs, ${rate}% success, revenue ${CONFIG.currency} ${e.revenue.toLocaleString()}.`,
    e.morale < 40 ? 'Seems unhappy. Consider a raise.' : e.morale > 80 ? 'Highly motivated.' : 'Morale is fine.',
  ];
  if ((e.suspicious ?? 0) > 1) lines.push('⚠ Several of their repairs came back with suspicious non-genuine parts.');
  return lines.join(' ');
}

function benchSpots() {
  const g = G();
  return g.shop.furniture.filter((f) => furnitureById(f.defId)?.kind === 'bench');
}

export function assignBenches() {
  const g = G();
  const benches = benchSpots();
  // first bench is the player's
  g.employees.forEach((e, i) => (e.benchId = benches[i + 1]?.id));
}

export function benchTierFor(e: Employee) {
  const f = G().shop.furniture.find((x) => x.id === e.benchId);
  return f ? furnitureById(f.defId).effect?.benchTier ?? 1 : 1;
}

// ------------------------------------------------------------------
// Assignment
// ------------------------------------------------------------------
export function assign(job: Job, e: Employee) {
  const g = G();
  if (e.state === 'training') return notify(`${e.name} is in training.`, 'bad');
  if (!e.benchId) return notify(`${e.name} has no bench.`, 'bad');
  if (g.bench.jobId === job.id) return notify('That job is on your own bench. Unload it first.', 'bad');
  if (e.jobId) unassign(g.jobs.find((j) => j.id === e.jobId)!);
  job.assignedTo = e.id;
  job.progress = 0;
  e.jobId = job.id;
  e.state = 'walking';
  const bench = g.shop.furniture.find((f) => f.id === e.benchId)!;
  e.tx = bench.x + 0.5;
  e.ty = bench.y + 1.3;
  job.log.push(`Day ${g.day}: assigned to ${e.name}.`);
}

export function unassign(job: Job | undefined) {
  if (!job) return;
  const g = G();
  const e = g.employees.find((x) => x.id === job.assignedTo);
  if (e) {
    e.jobId = null;
    e.state = 'idle';
  }
  job.assignedTo = null;
  job.progress = 0;
}

/** What does this job need: faults to fix + parts to take from inventory. */
export function planJob(job: Job) {
  const g = G();
  const phone = g.phones[job.phoneId];
  const model = phoneById(phone.modelId);
  const fixes = new Set(job.services.flatMap((s) => serviceById(s).fixes));
  const faults = phoneFaults(phone).filter((f) => fixes.has(f.id));
  const needs: { faultId: string; kind: string; slot?: string; partNo?: string; chipType?: string; difficulty: number; spec: string; ok: boolean; reason?: string }[] = [];
  const done = (r: string) => g.research.done.includes(r) || g.mode === 'freeplay';
  for (const f of faults) {
    const d = faultById(f.id);
    const tierAdd = model.tier === 'flagship' ? 10 : model.tier === 'foldable' ? 25 : 0;
    if (d.fix === 'replace') {
      const slot = resolveSlot(model, d.target.slot!)!;
      const partNo = partNoFor(model, slot);
      const ok = g.inventory.some((p) => p.partNo === partNo);
      needs.push({ faultId: f.id, kind: 'replace', slot, partNo, difficulty: 30 + tierAdd + (slot === 'innerDisplay' || slot === 'hinge' ? 20 : 0), spec: slot === 'display' || slot === 'innerDisplay' ? 'screens' : slot.startsWith('battery') ? 'batteries' : 'diagnostics', ok, reason: ok ? undefined : `needs part ${partNo}` });
    } else if (d.fix === 'chipReplace' || d.fix === 'chipRemove' || d.fix === 'jumper') {
      const chip = CHIP_PARTS.find((c) => c.type === d.target.chip);
      const research = chip?.needsReball ? 'reballing' : 'microsoldering';
      const hasChip = d.fix !== 'chipReplace' || (g.chips[d.target.chip!] ?? 0) > 0;
      const ok = done(research) && hasChip;
      needs.push({ faultId: f.id, kind: d.fix, chipType: d.target.chip, difficulty: chip?.needsReball ? 85 : 60, spec: 'microsoldering', ok, reason: !done(research) ? `research ${research}` : !hasChip ? `needs chip ${d.target.chip}` : undefined });
    } else if (d.fix === 'software') {
      const ok = done('software-flash');
      needs.push({ faultId: f.id, kind: 'software', difficulty: 15, spec: 'software', ok, reason: ok ? undefined : 'research software-flash' });
    } else if (d.fix === 'clean') {
      const ok = f.id === 'f_port_dirty' || done('water-damage');
      needs.push({ faultId: f.id, kind: 'clean', difficulty: f.id === 'f_port_dirty' ? 10 : 40, spec: 'diagnostics', ok, reason: ok ? undefined : 'research water-damage' });
    }
  }
  return needs;
}

export function employeesTick() {
  const g = G();
  const powered = g.effects.loadshedding <= 0 || g.shop.furniture.some((f) => furnitureById(f.defId)?.effect?.power);
  const now = absMinute();
  const step = (CONFIG.employees.walkSpeedTilesPerSec * 60) / CONFIG.time.gameMinutesPerRealSecond / 60;
  for (const e of g.employees) {
    // walking
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const s = Math.min(d, step * 2);
      e.x += (dx / d) * s;
      e.y += (dy / d) * s;
    }
    if (e.state === 'training') {
      if (now >= (e.trainingUntil ?? 0)) {
        const gain = CONFIG.employees.trainingSkillGain * (g.research.done.includes('training-1') ? 1.5 : 1) * (g.research.done.includes('training-2') ? 2 : 1);
        e.skill = clamp(Math.round(e.skill + gain), 0, 100);
        e.state = 'idle';
        e.morale = clamp(e.morale + 5, 0, 100);
        notify(`🎓 ${e.name} finished training. Skill now ${e.skill}.`, 'good');
      }
      continue;
    }
    if (!e.jobId) {
      if (g.policy.autoAssign && e.benchId && g.minute % 10 === 0) autoPick(e);
      if (e.state !== 'idle') e.state = 'idle';
      if (d < 0.05 && chance(0.02)) {
        const loc = locationById(g.shop.locationId);
        e.tx = rand(1, loc.w - 1);
        e.ty = rand(loc.h - 2, loc.h - 0.6);
      }
      continue;
    }
    const job = g.jobs.find((j) => j.id === e.jobId);
    if (!job || job.status !== 'open') {
      e.jobId = null;
      e.state = 'idle';
      continue;
    }
    if (d > 0.1) {
      e.state = 'walking';
      continue;
    }
    if (!powered) continue;
    e.state = 'working';
    const plan = planJob(job);
    if (job.progress === 0 && plan.some((p) => !p.ok)) {
      // can't start: put it back in the queue (and auto-order parts if allowed)
      job.waitingParts = true;
      notify(`⏸ ${e.name} can't start ${job.customerName}'s job: ${plan.filter((p) => !p.ok).map((p) => p.reason).join(', ')}.`, 'warn');
      if (g.policy.autoOrder && !(job as any).ordered) {
        (job as any).ordered = true;
        autoOrderFor(plan);
      }
      job.assignedTo = null;
      e.jobId = null;
      e.state = 'idle';
      continue;
    }
    job.waitingParts = false;
    const diff = plan.reduce((a, p) => a + p.difficulty, 0) / Math.max(1, plan.length);
    const minutes = Math.max(20, job.services.reduce((a, s) => a + serviceById(s).minutes, 0) || 30);
    const rate = (e.speed * (0.5 + e.morale / 100) * (1 + (e.skill - diff) / 250)) / minutes;
    job.progress += Math.max(0.002, rate);
    if (job.progress >= 1) completeEmployeeJob(e, job, plan);
  }
}

function autoPick(e: Employee) {
  const g = G();
  const job = g.jobs
    .filter((j) => j.status === 'open' && !j.assignedTo && g.bench.jobId !== j.id && !(j as any).diagnosisOnly && j.services.length)
    .sort((a, b) => a.dueDay - b.dueDay)
    .find((j) => {
      const plan = planJob(j);
      const ok = plan.every((p) => p.ok);
      j.waitingParts = !ok;
      if (!ok && g.policy.autoOrder && !(j as any).ordered) {
        (j as any).ordered = true;
        autoOrderFor(plan);
      }
      return ok;
    });
  if (job) assign(job, e);
}

function completeEmployeeJob(e: Employee, job: Job, plan: ReturnType<typeof planJob>) {
  const g = G();
  const phone = g.phones[job.phoneId];
  const model = phoneById(phone.modelId);
  const bt = benchTierFor(e);
  let fails = 0;
  const grades: number[] = [];
  for (const p of plan) {
    const specBonus = e.specs.includes(p.spec) ? CONFIG.employees.specializationBonus : 0;
    const success = chance(clamp(0.72 + (e.skill + specBonus - p.difficulty) / 110 + (bt - 1) * 0.04, 0.15, 0.98));
    if (!success) {
      fails++;
      job.mistakes.push(`${e.name} failed: ${faultById(p.faultId).name}`);
      if (chance(0.15)) {
        const disp = phone.components.display;
        if (disp && !disp.faults.includes('f_flex_torn')) disp.faults.push('f_flex_torn');
        job.mistakes.push(`${e.name} tore a flex cable.`);
      }
      continue;
    }
    if (p.kind === 'replace') {
      const pref = g.policy.grade;
      const candidates = g.inventory.filter((x) => x.partNo === p.partNo);
      let part = candidates.find((x) => x.grade === pref && x.inspected !== 'fake') ?? candidates.find((x) => x.inspected !== 'fake') ?? candidates[0];
      if (!part) {
        fails++;
        continue;
      }
      g.inventory = g.inventory.filter((x) => x !== part);
      // dishonest swap
      if (e.honesty < 0.4 && part.grade === 'genuine' && !part.counterfeit && chance(CONFIG.employees.dishonestSwapChancePerDay * 4)) {
        part = makeComponent(model, part.slot, 'counterfeit', { cost: part.cost });
        e.suspicious = (e.suspicious ?? 0) + 1;
        const cctv = g.shop.furniture.some((f) => f.defId === 'cctv');
        if (cctv && chance(CONFIG.employees.stealCatchChanceCctv)) {
          notify(`📹 CCTV caught ${e.name} pocketing a genuine ${p.slot} and fitting a fake! (Staff → review)`, 'bad');
          e.suspicious += 2;
        }
      }
      const old = phone.components[part.slot];
      if (old) {
        old.source = 'Removed (customer)';
        g.inventory.push(old);
      }
      phone.components[part.slot] = part;
      phone.history.push({ day: g.day, slot: part.slot, grade: part.counterfeit ? 'counterfeit' : part.grade, by: g.shopName });
      job.replacedGrades.push(part.counterfeit ? 'counterfeit' : part.grade);
      if (part.counterfeit) job.counterfeitUsed = true;
      job.partsCost += part.cost ?? 0;
      grades.push(componentQuality(part));
      if ((g.consumables.adhesive ?? 0) > 0 && ['display', 'battery', 'backCover', 'innerDisplay'].includes(part.slot)) g.consumables.adhesive--;
    } else if (p.kind === 'chipReplace' || p.kind === 'chipRemove' || p.kind === 'jumper') {
      const board = phone.components.board;
      if (!board?.chips) continue;
      for (const ch of Object.values(board.chips)) ch.faults = ch.faults.filter((f) => f !== p.faultId);
      if (p.kind === 'chipReplace') g.chips[p.chipType!] = Math.max(0, (g.chips[p.chipType!] ?? 0) - 1);
      if (p.kind === 'jumper') board.jumpers = (board.jumpers ?? 0) + 1;
    } else if (p.kind === 'software') {
      phone.softwareFaults = phone.softwareFaults.filter((f) => f !== p.faultId);
    } else if (p.kind === 'clean') {
      for (const comp of Object.values(phone.components)) {
        if (!comp) continue;
        comp.faults = comp.faults.filter((f) => f !== p.faultId);
        if (p.faultId === 'f_water') comp.corrosion = 0;
      }
    }
  }
  const avgGrade = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 90;
  const quality = clamp(e.skill * 0.45 + avgGrade * 0.35 + bt * 5 + 15 - fails * 18, 5, 100);
  finishJobQuality(job, quality, acceptJobTestsFor(phone));
  e.repairs++;
  if (fails) e.fails++;
  e.revenue += job.price;
  e.skill = clamp(e.skill + CONFIG.employees.xpPerRepair * (1 - e.skill / 120), 0, 100);
  e.jobId = null;
  e.state = 'idle';
  notify(`🔧 ${e.name} finished ${job.customerName}'s ${model.name}${fails ? ` (${fails} problem${fails > 1 ? 's' : ''})` : ''}.`, fails ? 'warn' : 'good');
}

/** Daily: salaries handled in world; morale & quitting here. */
export function employeesDaily() {
  const g = G();
  for (const e of [...g.employees]) {
    const fair = e.skill * CONFIG.employees.baseSalaryPerSkill;
    e.morale = clamp(e.morale - CONFIG.employees.moraleDecayPerDay - (e.salary < fair * 0.9 ? 2 : 0) + (e.salary > fair * 1.1 ? 1 : 0), 0, 100);
    if (e.morale < 15 && chance(0.3)) {
      notify(`🚪 ${e.name} quit (morale too low).`, 'bad');
      fire(e);
    }
  }
  if (g.day % 7 === 0) refreshCandidates();
}
