/**
 * Job completion helpers shared by the player's bench and employees.
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { phoneById } from '../data/phones';
import type { TestId } from '../data/types';
import { assemblyStatus, ctxFor } from '../repair/assembly';
import { runTestSuite } from '../repair/diagnostics';
import { markReady } from './customers';
import { toolTier } from './economy';
import { componentQuality } from './phones';
import { clamp } from './rng';
import { G, type Job, type PhoneInst } from './state';

export function acceptJobTestsFor(phone: PhoneInst): Partial<Record<TestId, boolean>> {
  const r = runTestSuite(phone).results;
  const out: Partial<Record<TestId, boolean>> = {};
  for (const [k, v] of Object.entries(r)) if (v !== 'n/a') out[k as TestId] = v === 'pass';
  return out;
}

export function finishJobQuality(job: Job, quality: number, tests: Partial<Record<TestId, boolean>>, mistakes: string[] = []) {
  markReady(job, quality, tests, mistakes);
}

/** Quality score for a repair done on the player's bench. */
export function benchQuality(phone: PhoneInst, mistakes: string[]): { quality: number; breakdown: string[] } {
  const g = G();
  const c = ctxFor(phone);
  const status = assemblyStatus(c);
  const model = phoneById(phone.modelId);
  const brand = brandById(model.brand);
  const lines: string[] = [];
  let q = 100;
  if (mistakes.length) {
    q -= mistakes.length * CONFIG.repair.mistakeQualityPenalty;
    lines.push(`-${mistakes.length * CONFIG.repair.mistakeQualityPenalty} mistakes (${mistakes.length})`);
  }
  if (status.missingScrews.length) {
    q -= status.missingScrews.length * CONFIG.repair.missingScrewQualityPenalty;
    lines.push(`-${status.missingScrews.length * CONFIG.repair.missingScrewQualityPenalty} missing screws (${status.missingScrews.length})`);
  }
  if (!status.assembled) {
    q -= 30;
    lines.push('-30 phone not fully assembled');
  }
  const mine = phone.history.filter((h) => h.by === g.shopName && h.day >= g.day - 3);
  for (const h of mine) {
    const comp = phone.components[h.slot];
    if (!comp) continue;
    const pen = Math.round((100 - componentQuality(comp)) * 0.35);
    if (pen > 0) {
      q -= pen;
      lines.push(`-${pen} ${comp.grade} ${h.slot} part`);
    }
    if (brand.pairing.includes(h.slot) && comp.pairedTo !== phone.serial) {
      q -= CONFIG.repair.unknownPartPenalty;
      lines.push(`-${CONFIG.repair.unknownPartPenalty} unpaired ${h.slot}`);
    }
  }
  const tiers = ['screwdriver', 'opening', 'heat'].map((t) => toolTier(t));
  const tb = Math.round(((tiers.reduce((a, b) => a + b, 0) / 3) - 1) * CONFIG.repair.toolTierQualityBonus);
  if (tb) {
    q += tb;
    lines.push(`+${tb} better tools`);
  }
  const sb = Math.round((g.playerSkill - 50) * CONFIG.repair.skillQualityWeight);
  q += sb;
  lines.push(`${sb >= 0 ? '+' : ''}${sb} your skill`);
  const fails = Object.values(runTestSuite(phone).results).filter((r) => r === 'fail').length;
  if (fails) {
    q -= fails * 6;
    lines.push(`-${fails * 6} failing tests (${fails})`);
  }
  return { quality: clamp(Math.round(q), 0, 100), breakdown: lines };
}
