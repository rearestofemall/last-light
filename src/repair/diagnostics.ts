/**
 * Diagnostic instruments: USB ammeter, diagnostic computer, multimeter
 * (diode mode vs reference database), thermal camera, microscope, visual
 * inspection and the post-repair test suite.
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { TESTS, faultById } from '../data/faults';
import { layoutById } from '../data/layouts';
import { SLOT_NAMES, SLOT_WEIGHT } from '../data/parts';
import { phoneById } from '../data/phones';
import type { Slot, TestId } from '../data/types';
import { phoneFaults, resolveSlot } from '../sim/phones';
import { chance, clamp, hash01, rand } from '../sim/rng';
import type { ComponentInst, PhoneInst } from '../sim/state';
import { toolTier } from '../sim/economy';
import { batteryConnected, ctxFor, slotWorking } from './assembly';

const hasFault = (p: PhoneInst, pred: (id: string) => boolean) => phoneFaults(p).some((f) => pred(f.id));

/** Does the phone boot? */
export function powersOn(p: PhoneInst): boolean {
  const c = ctxFor(p);
  if (!p.components.board || !p.components.battery) return false;
  if (!batteryConnected(c)) return false;
  if (!slotWorking(c, 'board')) return false;
  return !hasFault(p, (id) => faultById(id).tests.includes('power'));
}

// ---------------- USB ammeter ----------------
export function ammeter(p: PhoneInst): { amps: number; volts: number; note: string } {
  const model = phoneById(p.modelId);
  const c = ctxFor(p);
  const tier = toolTier('ammeter');
  const noise = tier >= 2 ? 0.005 : 0.03;
  const portSlot = resolveSlot(model, 'chargePort');
  const pathOk = (!portSlot || slotWorking(c, portSlot)) && slotWorking(c, 'bridgeFlex') && !!p.components.board && slotWorking(c, 'board');
  if (!pathOk) return { amps: 0, volts: 5.0, note: 'No current: charging path not connected.' };
  const chargeFaults = phoneFaults(p).map((f) => faultById(f.id)).filter((f) => f.ammeter !== undefined);
  if (chargeFaults.length) {
    const a = Math.min(...chargeFaults.map((f) => f.ammeter!));
    const note = a === 0 ? 'Cable plugged in: 0.00A. Nothing is being drawn.' : a > 0.5 ? `Current jumps straight to ${a.toFixed(2)}A with the phone OFF. Something is pulling current.` : `Tiny trickle (${a.toFixed(2)}A). Barely charging.`;
    return { amps: Math.max(0, a + rand(-noise, noise)), volts: 5.0 - a * 0.1, note };
  }
  const batt = p.components.battery;
  if (!batt || !batteryConnected(c)) return { amps: rand(0.02, 0.05), volts: 5.0, note: 'Board draws a little, but no battery is connected.' };
  const max = Math.min(3, model.charging / 9);
  const counterfeitBatt = batt.counterfeit ? 0.6 : 1;
  const a = max * (batt.condition < 80 ? 0.7 : 1) * counterfeitBatt;
  const v = a > 2 ? 9.0 : 5.0;
  return { amps: clamp(a + rand(-noise, noise), 0, 5), volts: v, note: a > 1.5 ? 'Fast charging negotiated. Charging path is healthy.' : 'Normal charging current.' };
}

// ---------------- Diagnostic computer ----------------
export interface DiagReport {
  connected: boolean;
  mode: string;
  lines: { label: string; value: string; warn?: boolean }[];
  errors: string[];
  found: string[]; // fault ids clearly identified
}

export function diagComputer(p: PhoneInst): DiagReport {
  const model = phoneById(p.modelId);
  const brand = brandById(model.brand);
  const faults = phoneFaults(p);
  const boots = powersOn(p);
  const bootloop = p.softwareFaults.includes('f_bootloop');
  const swOnlyPowerFault = !boots && faults.filter((f) => faultById(f.id).tests.includes('power')).every((f) => f.id === 'f_bootloop');
  if (!boots && !(swOnlyPowerFault && p.components.board && p.components.battery)) {
    return { connected: false, mode: 'Not detected', lines: [], errors: ['Device not detected over USB. It does not power on: check battery / board.'], found: [] };
  }
  const lines: DiagReport['lines'] = [
    { label: 'Model', value: `${model.name} (${model.chipset})` },
    { label: 'Serial', value: p.serial },
    { label: 'IMEI', value: hasFault(p, (id) => id === 'f_baseband') ? 'UNKNOWN' : p.imei, warn: hasFault(p, (id) => id === 'f_baseband') },
    { label: 'Storage', value: `${model.variants[p.variant].ram}GB RAM / ${model.variants[p.variant].storage}GB` },
    { label: 'Activation lock', value: p.lock === 'none' ? 'Off' : p.lock === 'icloud' ? 'ON (iCloud). Cannot be removed legally' : 'ON (Google FRP)', warn: p.lock !== 'none' },
    { label: 'PTA registered', value: p.pta ? 'Yes' : 'NO (blocked SIM after 60 days)', warn: !p.pta },
  ];
  const batt = p.components.battery;
  if (batt) {
    const service = batt.condition < 80 || (brand.pairing.includes('battery') && batt.pairedTo !== p.serial);
    lines.push({ label: 'Battery health', value: brand.pairing.includes('battery') && batt.pairedTo !== p.serial ? 'Unknown part (no data)' : `${Math.round(batt.condition)}%${service ? ' (Service)' : ''}`, warn: service });
    lines.push({ label: 'Cycle count', value: String(batt.cycles ?? 0) });
  }
  for (const slot of brand.pairing) {
    const comp = p.components[slot];
    if (!comp) continue;
    const paired = comp.pairedTo === p.serial;
    lines.push({ label: `${SLOT_NAMES[slot]} serial`, value: paired ? 'Genuine, paired' : 'Unknown part', warn: !paired });
  }
  const errors: string[] = [];
  const found: string[] = [];
  for (const f of faults) {
    const d = faultById(f.id);
    if (d.diag) {
      errors.push(d.diag);
      found.push(f.id);
    }
  }
  if (bootloop) errors.unshift('Device in recovery mode (boot loop detected)');
  return { connected: true, mode: bootloop ? 'Recovery mode' : 'Normal (booted)', lines, errors, found };
}

// ---------------- Multimeter (diode mode) ----------------
export function referenceValue(modelId: string, tpId: string): number {
  const model = phoneById(modelId);
  const tp = layoutById(model.layout).testPoints.find((t) => t.id === tpId)!;
  return +(tp.ref * (0.85 + 0.3 * hash01(modelId + tpId))).toFixed(3);
}

export function diodeReading(p: PhoneInst, board: ComponentInst, tpId: string): string {
  const model = phoneById(p.modelId);
  const tp = layoutById(model.layout).testPoints.find((t) => t.id === tpId)!;
  const ref = referenceValue(model.id, tpId);
  const noise = CONFIG.diag.multimeterNoise[toolTier('multimeter') - 1] ?? 0.03;
  let open = false;
  let short = false;
  let low = false;
  for (const cid of tp.chips) {
    const ch = board.chips?.[cid];
    if (!ch) continue;
    const def = layoutById(model.layout).chips.find((x) => x.id === cid)!;
    if (ch.removed && !def.type.startsWith('cap_')) open = true;
    if (ch.unsoldered) open = true;
    if (ch.burned) short = true;
    for (const f of ch.faults) {
      const d = faultById(f).diode;
      if (d === 'short') short = true;
      else if (d === 'open') open = true;
      else if (d === 'low') low = true;
    }
  }
  if (short) return (0.002 + Math.random() * 0.006).toFixed(3);
  if (open) return 'OL';
  let v = ref * (low ? 0.55 : 1) * (1 - (board.corrosion ?? 0) * 0.25);
  v += rand(-noise, noise);
  return v.toFixed(3);
}

// ---------------- Thermal camera ----------------
/** Returns chip ids that heat up when voltage is injected, with intensity. */
export function thermalScan(board: ComponentInst, modelId: string): { chip: string; heat: number }[] {
  const model = phoneById(modelId);
  const out: { chip: string; heat: number }[] = [];
  for (const ch of layoutById(model.layout).chips) {
    const inst = board.chips?.[ch.id];
    if (!inst || inst.removed) continue;
    const hot = inst.burned || inst.faults.some((f) => faultById(f).thermal);
    if (hot) out.push({ chip: ch.id, heat: 1 });
    else if (ch.type === 'cpu') out.push({ chip: ch.id, heat: 0.25 });
  }
  return out;
}

// ---------------- Microscope ----------------
export function microscopeFindings(board: ComponentInst, modelId: string): string[] {
  const tier = toolTier('microscope');
  const reveal = [0, 0.55, 0.85, 1][tier];
  const model = phoneById(modelId);
  const out: string[] = [];
  if ((board.corrosion ?? 0) > 0.05 && chance(Math.max(reveal, 0.6))) out.push(`Corrosion level ${Math.round((board.corrosion ?? 0) * 100)}%: green deposits around connectors and caps.`);
  for (const ch of layoutById(model.layout).chips) {
    const inst = board.chips?.[ch.id];
    if (!inst) continue;
    if (inst.burned) out.push(`${ch.name}: burnt / discoloured.`);
    for (const f of inst.faults) {
      const d = faultById(f);
      if (d.microscope && chance(reveal)) out.push(`${ch.name}: ${d.microscope}`);
    }
  }
  for (const f of board.faults) {
    const d = faultById(f);
    if (d.microscope && !out.some((o) => o.includes('Corrosion'))) out.push(d.microscope);
  }
  if (!out.length) out.push('Nothing obvious under the microscope.');
  return out;
}

/** Inspect a part for counterfeits. Returns verdict + text. */
export function inspectPart(c: ComponentInst, method: 'microscope' | 'scale' | 'visual'): { verdict: 'ok' | 'fake' | 'unsure'; text: string } {
  const tier = toolTier(method === 'scale' ? 'scale' : 'microscope');
  if (method === 'scale') {
    if (!tier) return { verdict: 'unsure', text: 'You need a precision scale.' };
    const w = SLOT_WEIGHT[c.slot] ?? 3;
    const real = c.counterfeit ? w * rand(0.82, 0.93) : w * rand(0.99, 1.01);
    const fake = c.counterfeit && chance(CONFIG.diag.scaleFakeReveal);
    return { verdict: fake ? 'fake' : 'unsure', text: `Weighs ${real.toFixed(2)}g (spec ${w.toFixed(2)}g).${fake ? ' Way too light: this is a fake.' : ' Within tolerance.'}` };
  }
  if (method === 'microscope') {
    if (!tier) return { verdict: 'unsure', text: 'You need a microscope.' };
    if (c.counterfeit && chance(CONFIG.diag.microscopeFakeReveal[tier - 1])) return { verdict: 'fake', text: 'Logo print is blurry, IC markings are laser-etched over sanded chips: counterfeit!' };
    if (c.counterfeit) return { verdict: 'unsure', text: 'Markings look okay at this magnification.' };
    return { verdict: tier >= 2 ? 'ok' : 'unsure', text: tier >= 2 ? 'Crisp OEM markings, factory solder joints: genuine.' : 'Markings look okay at this magnification.' };
  }
  return { verdict: 'unsure', text: c.counterfeit && chance(0.15) ? 'Packaging looks slightly off...' : 'Looks fine to the naked eye.' };
}

// ---------------- Visual inspection ----------------
export function visualInspection(p: PhoneInst): string[] {
  const out: string[] = [];
  for (const f of phoneFaults(p)) {
    const d = faultById(f.id);
    if (d.visual) out.push(d.visual);
  }
  out.push(`Cosmetic condition: ${p.cosmetic}%`);
  if (p.history.length) out.push('Screws show tool marks: phone has been opened before.');
  if (!p.waterSeal) out.push('Adhesive seal is broken.');
  return out;
}

// ---------------- Test suite ----------------
export type TestResult = Record<TestId, 'pass' | 'fail' | 'n/a'>;

export function runTestSuite(p: PhoneInst): { results: TestResult; notes: string[] } {
  const model = phoneById(p.modelId);
  const brand = brandById(model.brand);
  const c = ctxFor(p);
  const results = {} as TestResult;
  const notes: string[] = [];
  const faults = phoneFaults(p).map((f) => faultById(f.id));
  const on = powersOn(p);
  const working = (s: Slot) => {
    const r = resolveSlot(model, s);
    return r ? slotWorking(c, r) : true;
  };
  for (const t of TESTS) {
    if (!on) {
      results[t.id] = t.id === 'charging' ? (ammeter(p).amps > 0.3 && !faults.some((f) => f.tests.includes('charging')) ? 'pass' : 'fail') : 'fail';
      continue;
    }
    let ok = !faults.some((f) => f.tests.includes(t.id));
    switch (t.id) {
      case 'display':
      case 'touch':
        ok = ok && working('display') && (!model.features.length || true);
        if (p.components.innerDisplay !== undefined || c.nodes.some((n) => n.slot === 'innerDisplay')) ok = ok && working('innerDisplay');
        break;
      case 'frontCam': ok = ok && working('frontCam'); break;
      case 'rearCam': ok = ok && working('mainCam') && working('wideCam') && working('teleCam'); break;
      case 'earpiece': ok = ok && working('earpiece'); break;
      case 'loudspeaker': ok = ok && working('loudspeaker'); break;
      case 'mic': ok = ok && working('mic'); break;
      case 'charging': ok = ok && working('chargePort') && working('bridgeFlex') && ammeter(p).amps > 0.3; break;
      case 'network': ok = ok && working('antenna') && working('simTray') && working('bridgeFlex'); break;
      case 'vibration': ok = ok && working('vibrator'); break;
      case 'buttons': ok = ok && working('powerFlex') && working('volumeFlex'); break;
      case 'sensors': ok = ok && working('earpiece'); break;
      case 'biometric': {
        const slot: Slot | null = model.features.includes('faceId') ? 'faceId' : model.features.includes('fingerprint') ? 'fingerprint' : null;
        if (!slot) { results[t.id] = 'n/a'; continue; }
        ok = ok && working(slot);
        const comp = p.components[slot];
        if (comp && brand.pairing.includes(slot) && comp.pairedTo !== p.serial) {
          ok = false;
          notes.push(`${SLOT_NAMES[slot]} is not paired to this board: biometrics disabled.`);
        }
        break;
      }
      case 'wifi': break;
    }
    results[t.id] = ok ? 'pass' : 'fail';
  }
  if (!on) notes.unshift('Phone does not power on.');
  const disp = p.components.display;
  if (disp && on) {
    if (disp.grade === 'aftermarket' || disp.counterfeit) notes.push('Display: dimmer, colours slightly off, touch a bit laggy (non-OEM panel).');
    if (brand.pairing.includes('display') && disp.pairedTo !== p.serial) notes.push('Display: "Unknown part" message, True Tone unavailable.');
  }
  const batt = p.components.battery;
  if (batt && on && brand.pairing.includes('battery') && batt.pairedTo !== p.serial) notes.push('Battery: "Unknown part / health unavailable" message.');
  return { results, notes };
}
