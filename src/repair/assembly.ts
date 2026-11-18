/**
 * Disassembly / reassembly rules. Pure logic, no rendering.
 *
 * Node states: 'in' (installed/connected/closed), 'open' (cover lifted but
 * still tethered), 'out' (removed / disconnected).
 * A node can be worked on only when everything listed in `requires`
 * (things physically on top of it) is not 'in'.
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { SLOT_NAMES } from '../data/parts';
import { phoneById } from '../data/phones';
import { SCREWDRIVER_BITS } from '../data/tools';
import type { NodeDef, PhoneModelDef, ScrewType, Slot } from '../data/types';
import { addFault, modelNodes, partFits } from '../sim/phones';
import { chance, clamp, uid } from '../sim/rng';
import { G, notify, type ComponentInst, type PhoneInst } from '../sim/state';
import { advanceMinutes } from '../sim/clock';
import { toolTier } from '../sim/economy';

export type BenchTool = 'screwdriver' | 'spudger' | 'tweezers' | 'heat' | 'opener' | 'ipa' | 'brush';

export const BENCH_TOOLS: { id: BenchTool; name: string; key: string; icon: string; hint: string }[] = [
  { id: 'screwdriver', name: 'Screwdriver', key: '1', icon: '🪛', hint: 'Remove / drive screws. Pick the right bit.' },
  { id: 'spudger', name: 'Spudger', key: '2', icon: '🥢', hint: 'Disconnect / connect flex connectors.' },
  { id: 'tweezers', name: 'Tweezers / hands', key: '3', icon: '✋', hint: 'Lift brackets and parts, pull battery tabs, place parts.' },
  { id: 'heat', name: 'Heat', key: '4', icon: '🔥', hint: 'Soften adhesive before opening glued parts.' },
  { id: 'opener', name: 'Suction cup + pick', key: '5', icon: '🧲', hint: 'Open / close covers, pry glued parts.' },
  { id: 'ipa', name: 'Isopropyl alcohol', key: '6', icon: '🧴', hint: 'Dissolve battery adhesive (consumes IPA).' },
  { id: 'brush', name: 'Brush + pick', key: '7', icon: '🖌️', hint: 'Clean lint and debris out of ports.' },
];

export interface Ctx {
  phone: PhoneInst;
  model: PhoneModelDef;
  nodes: NodeDef[];
  byId: Map<string, NodeDef>;
}

export function ctxFor(phone: PhoneInst): Ctx {
  const model = phoneById(phone.modelId);
  const nodes = modelNodes(model);
  return { phone, model, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
}

const st = (c: Ctx, id: string) => c.phone.nodes[id]?.s ?? 'in';

/** Things on top that still block this node. */
export function blockers(c: Ctx, n: NodeDef): NodeDef[] {
  return (n.requires ?? []).filter((r) => st(c, r) === 'in').map((r) => c.byId.get(r)!).filter(Boolean);
}

/** Screws need the thing they screw into to be installed. */
export function screwBase(c: Ctx, n: NodeDef): NodeDef[] {
  return c.nodes.filter((o) => o.requires?.includes(n.id));
}

export function isAccessible(c: Ctx, n: NodeDef) {
  return blockers(c, n).length === 0;
}

export function batteryConnected(c: Ctx): boolean {
  return c.nodes.some((n) => n.isBattery && st(c, n.id) === 'in' && (c.phone.components[c.byId.get(n.connects!)?.slot as Slot]?.condition ?? 0) > 0);
}

export interface ActionInfo {
  verb: string;
  ok: boolean;
  reason?: string;
}

/** What the selected tool would do to this node (used for hover hints and clicks). */
export function describeAction(c: Ctx, n: NodeDef, tool: BenchTool): ActionInfo {
  const s = st(c, n.id);
  const g = G();
  const b = blockers(c, n);
  const blockedMsg = b.length ? `Blocked by: ${b.slice(0, 3).map((x) => x.label).join(', ')}${b.length > 3 ? '…' : ''}` : undefined;

  switch (n.kind) {
    case 'screw': {
      if (tool !== 'screwdriver') return { verb: 'Use the screwdriver', ok: false, reason: 'Screws need the screwdriver (1).' };
      if (s === 'in') {
        if (b.length) return { verb: 'Unscrew', ok: false, reason: blockedMsg };
        const bits = SCREWDRIVER_BITS[toolTier('screwdriver')] ?? [];
        if (!bits.includes(n.screw!.type)) return { verb: 'Unscrew', ok: false, reason: `Your driver set has no ${n.screw!.type} bit. Upgrade it in Equipment.` };
        if (g.bench.bit !== n.screw!.type) return { verb: 'Unscrew', ok: false, reason: `Wrong bit: select ${n.screw!.type} (it is ${g.bench.bit}).` };
        return { verb: `Unscrew (${n.screw!.type})`, ok: true };
      }
      const base = screwBase(c, n).filter((x) => st(c, x.id) !== 'in');
      if (base.length) return { verb: 'Drive screw', ok: false, reason: `Install ${base[0].label} first.` };
      if (b.length) return { verb: 'Drive screw', ok: false, reason: blockedMsg };
      if (!g.bench.screwSel) return { verb: 'Drive screw', ok: false, reason: 'Pick a screw from the magnetic mat first.' };
      if (g.bench.bit !== n.screw!.type) return { verb: 'Drive screw', ok: false, reason: `Select the ${n.screw!.type} bit.` };
      return { verb: 'Drive selected screw', ok: true };
    }
    case 'connector': {
      if (tool !== 'spudger') return { verb: 'Use the spudger', ok: false, reason: 'Connectors are popped with the spudger (2).' };
      if (b.length) return { verb: s === 'in' ? 'Disconnect' : 'Connect', ok: false, reason: blockedMsg };
      if (s === 'in') return { verb: 'Disconnect', ok: true };
      const target = c.byId.get(n.connects!);
      if (target && st(c, target.id) === 'out') return { verb: 'Connect', ok: false, reason: `${target.label} is not installed.` };
      return { verb: 'Connect', ok: true };
    }
    case 'bracket':
    case 'shield': {
      if (tool !== 'tweezers') return { verb: 'Use tweezers', ok: false, reason: 'Lift brackets with tweezers (3).' };
      if (b.length) return { verb: s === 'in' ? 'Remove' : 'Install', ok: false, reason: blockedMsg };
      return { verb: s === 'in' ? 'Lift out bracket' : 'Place bracket', ok: true };
    }
    case 'cover': {
      if (tool === 'heat') {
        if (s !== 'in') return { verb: 'Heat', ok: false, reason: 'Already open.' };
        if (!n.glued) return { verb: 'Heat', ok: false, reason: 'Clip-on cover: no adhesive to heat.' };
        return { verb: `Heat adhesive (${Math.round(c.phone.heat[n.id] ?? 0)}°)`, ok: true };
      }
      if (s === 'in') {
        if (tool !== 'opener') return { verb: 'Open', ok: false, reason: 'Open covers with the suction cup + pick (5).' };
        if (b.length) return { verb: 'Open', ok: false, reason: blockedMsg };
        return { verb: n.clips ? 'Pry clips open' : 'Open (suction + pick)', ok: true };
      }
      if (s === 'open') {
        if (tool === 'opener') return { verb: 'Close & press', ok: true };
        if (tool === 'tweezers') {
          const t = (n.tetheredBy ?? []).filter((id) => st(c, id) === 'in');
          if (t.length) return { verb: 'Remove', ok: false, reason: `Still tethered: disconnect ${t.map((x) => c.byId.get(x)!.label).join(', ')}` };
          return { verb: 'Remove from phone', ok: true };
        }
        return { verb: 'Close (opener) / remove (tweezers)', ok: false, reason: 'Opener closes it, tweezers remove it.' };
      }
      if (tool !== 'tweezers') return { verb: 'Place', ok: false, reason: 'Place parts with tweezers (3).' };
      if (b.length) return { verb: 'Place', ok: false, reason: blockedMsg };
      return { verb: `Fit ${n.label}`, ok: true };
    }
    case 'part': {
      if (tool === 'brush') {
        const comp = c.phone.components[n.slot!];
        if (!comp) return { verb: 'Clean', ok: false, reason: 'Nothing installed here.' };
        return { verb: 'Clean port / contacts', ok: true };
      }
      if (tool === 'heat') {
        if (s !== 'in' || !n.glued) return { verb: 'Heat', ok: false, reason: 'Only glued parts need heat.' };
        return { verb: `Heat adhesive (${Math.round(c.phone.heat[n.id] ?? 0)}°)`, ok: true };
      }
      if (tool === 'ipa') {
        if (s !== 'in' || !n.glued) return { verb: 'IPA', ok: false, reason: 'Only glued parts.' };
        return { verb: 'Apply isopropyl under adhesive', ok: (g.consumables.ipa ?? 0) > 0, reason: (g.consumables.ipa ?? 0) > 0 ? undefined : 'Out of IPA.' };
      }
      if (s === 'in') {
        if (b.length) return { verb: 'Remove', ok: false, reason: blockedMsg };
        if (n.glued && !n.pullTabs && tool !== 'opener') return { verb: 'Pry out', ok: false, reason: 'Glued in: heat it, then pry with the opener (5).' };
        if (n.glued && n.pullTabs && tool !== 'tweezers' && tool !== 'opener') return { verb: 'Remove', ok: false, reason: 'Pull the adhesive tabs with tweezers (3), or pry with the opener.' };
        if (!n.glued && tool !== 'tweezers') return { verb: 'Remove', ok: false, reason: 'Lift parts out with tweezers (3).' };
        return { verb: n.glued ? (tool === 'tweezers' ? 'Pull adhesive tabs' : 'Pry out') : 'Remove part', ok: true };
      }
      if (tool !== 'tweezers') return { verb: 'Install', ok: false, reason: 'Install parts with tweezers (3).' };
      if (b.length) return { verb: 'Install', ok: false, reason: blockedMsg };
      return { verb: `Install ${SLOT_NAMES[n.slot!] ?? n.label}…`, ok: true };
    }
  }
  return { verb: '?', ok: false };
}

// ------------------------------------------------------------------
// Performing actions
// ------------------------------------------------------------------
function minutesFor(kind: keyof typeof CONFIG.repair.minutes) {
  const skill = G().playerSkill;
  return CONFIG.repair.minutes[kind] * clamp(1.3 - skill / 150, 0.6, 1.3);
}

function mistake(text: string) {
  const g = G();
  g.bench.mistakes.push(text);
  notify(`⚠ ${text}`, 'bad');
}

const expert = () => G().mode === 'expert';

/** Risky actions while the battery is still connected can short the board. */
function shortRisk(c: Ctx, n: NodeDef) {
  if (!batteryConnected(c) || n.isBattery) return;
  // purely mechanical parts can't short anything
  if (n.slot && ['simTray', 'backCover', 'midframe', 'battery', 'battery2', 'frame', 'hinge'].includes(n.slot)) return;
  const p = CONFIG.repair.shortChanceBatteryConnected * (expert() ? CONFIG.modes.expert.shortChanceMult : 1);
  if (!chance(p)) return;
  if (n.connects && c.byId.get(n.connects)?.slot === 'display' && chance(0.6)) {
    addFault(c.phone, 'f_display_lines');
    mistake('Sparks! Plugging the display with the battery connected damaged the panel.');
  } else {
    addFault(c.phone, 'f_short_damage');
    mistake('Short circuit! You worked with the battery connected. The PMIC area is scorched.');
  }
}

export interface ActionResult {
  ok: boolean;
  msg: string;
  needsPart?: { slot: Slot; node: NodeDef };
}

export function performAction(c: Ctx, n: NodeDef, tool: BenchTool): ActionResult {
  const info = describeAction(c, n, tool);
  if (!info.ok) return { ok: false, msg: info.reason ?? 'Not possible.' };
  const g = G();
  const p = c.phone;
  const ns = p.nodes[n.id] ?? (p.nodes[n.id] = { s: 'in' });
  wearTool(tool);

  // ---------- screws ----------
  if (n.kind === 'screw') {
    if (ns.s === 'in') {
      const tier = toolTier('screwdriver');
      const strip = CONFIG.repair.screwStripChanceCheap / (tier === 1 ? 1 : tier === 2 ? 3 : 10);
      let msg = `Removed ${n.label}.`;
      if (ns.stripped || chance(strip)) {
        mistake(`Stripped the head of ${n.label}. Extracting it took a while.`);
        advanceMinutes(5);
        msg = 'Stripped screw extracted.';
      }
      p.mat.push({ id: uid('scr'), type: n.screw!.type, length: ns.len ?? n.screw!.length, from: n.id });
      ns.s = 'out';
      ns.len = undefined;
      advanceMinutes(minutesFor('screw'));
      return { ok: true, msg };
    }
    const sc = p.mat.find((m) => m.id === g.bench.screwSel);
    if (!sc) return { ok: false, msg: 'Pick a screw from the mat.' };
    if (sc.type !== n.screw!.type) return { ok: false, msg: `A ${sc.type} screw does not fit a ${n.screw!.type} hole.` };
    p.mat = p.mat.filter((m) => m !== sc);
    g.bench.screwSel = null;
    ns.s = 'in';
    ns.len = sc.length;
    advanceMinutes(minutesFor('screw'));
    const hole = n.screw!.length;
    if (sc.length > hole + CONFIG.repair.longScrewTolerance) {
      if (n.longScrewFault) addFault(p, n.longScrewFault);
      mistake(`Long screw damage! A ${sc.length}mm screw went into a ${hole}mm hole${n.longScrewFault ? ' and tore through the board' : ''}.`);
      return { ok: true, msg: 'Screw driven... it went in a little too far.' };
    }
    if (sc.length < hole - 0.4) {
      mistake(`Short screw: ${sc.length}mm in a ${hole}mm hole barely grips.`);
    }
    return { ok: true, msg: `Drove ${sc.length}mm ${sc.type} screw.` };
  }

  // ---------- connectors ----------
  if (n.kind === 'connector') {
    if (ns.s === 'in') {
      shortRisk(c, n);
      ns.s = 'out';
      advanceMinutes(minutesFor('connector'));
      if (n.isBattery) return { ok: true, msg: 'Battery disconnected. Safe to work.' };
      return { ok: true, msg: `${n.label} disconnected.` };
    }
    shortRisk(c, n);
    ns.s = 'in';
    advanceMinutes(minutesFor('connector'));
    return { ok: true, msg: `${n.label} connected (click!).` };
  }

  // ---------- brackets ----------
  if (n.kind === 'bracket' || n.kind === 'shield') {
    ns.s = ns.s === 'in' ? 'out' : 'in';
    advanceMinutes(minutesFor('bracket'));
    return { ok: true, msg: ns.s === 'out' ? `${n.label} removed.` : `${n.label} placed.` };
  }

  // ---------- heat ----------
  if (tool === 'heat') {
    const tier = toolTier('heat');
    const add = CONFIG.repair.heatPerApplication * [0.8, 1, 1.4, 1.6][tier];
    const h = (p.heat[n.id] = Math.min(CONFIG.repair.heatMax + 20, (p.heat[n.id] ?? 0) + add));
    advanceMinutes(minutesFor('heat') / (tier >= 2 ? 1.5 : 1));
    if (h > CONFIG.repair.overheatDamage && chance(tier === 3 ? 0.1 : 0.35)) {
      if (n.slot === 'display' || n.slot === 'innerDisplay') {
        const comp = p.components[n.slot];
        if (comp && !comp.faults.includes('f_display_lines')) comp.faults.push('f_display_lines');
        mistake('Overheated the panel: heat marks / lines on the OLED.');
      } else if (n.slot === 'battery' || n.slot === 'battery2') {
        const comp = p.components[n.slot];
        if (comp) comp.condition = Math.max(0, comp.condition - 25);
        mistake('Overheated the battery: it is degraded.');
      } else mistake('Too much heat: adhesive is smoking.');
    }
    return { ok: true, msg: `Adhesive at ${Math.round(Math.min(100, h))}% softness.` };
  }

  if (tool === 'ipa') {
    g.consumables.ipa = (g.consumables.ipa ?? 0) - 1;
    p.heat[`ipa:${n.id}`] = 1;
    advanceMinutes(2);
    return { ok: true, msg: 'Isopropyl soaked under the adhesive.' };
  }

  if (tool === 'brush') {
    const comp = p.components[n.slot!]!;
    advanceMinutes(6);
    if (comp.faults.includes('f_port_dirty')) {
      if (chance(CONFIG.repair.portCleanSuccess)) {
        comp.faults = comp.faults.filter((f) => f !== 'f_port_dirty');
        return { ok: true, msg: 'A big wad of lint came out. Port is clean!' };
      }
      return { ok: true, msg: 'Some lint came out, but it is still packed. Try again.' };
    }
    return { ok: true, msg: 'Cleaned. Nothing much came out.' };
  }

  // ---------- covers ----------
  if (n.kind === 'cover') {
    if (ns.s === 'in' && tool === 'opener') {
      openGlued(c, n);
      ns.s = (n.tetheredBy ?? []).length ? 'open' : 'out';
      if (ns.s === 'out') takeOut(c, n);
      return { ok: true, msg: ns.s === 'open' ? `${n.label} opened like a book. Disconnect its cables to remove it.` : `${n.label} removed.` };
    }
    if (ns.s === 'open' && tool === 'opener') {
      seal(c, n);
      ns.s = 'in';
      advanceMinutes(minutesFor('close'));
      return { ok: true, msg: `${n.label} closed and pressed.` };
    }
    if (ns.s === 'open' && tool === 'tweezers') {
      ns.s = 'out';
      takeOut(c, n);
      advanceMinutes(1);
      return { ok: true, msg: `${n.label} set aside on the tray.` };
    }
    // placing back: needs a component
    return { ok: false, msg: '', needsPart: { slot: n.slot!, node: n } };
  }

  // ---------- parts ----------
  if (n.kind === 'part') {
    if (ns.s === 'in') {
      shortRisk(c, n);
      if (n.glued) {
        if (n.pullTabs && tool === 'tweezers') {
          if (p.heat[`tabsbroken:${n.id}`]) return { ok: false, msg: 'The tabs are already broken: pry it out with the opener.' };
          const ipa = p.heat[`ipa:${n.id}`] ? 0.3 : 1;
          const heat = 1 - Math.min(1, (p.heat[n.id] ?? 0) / 100) * 0.6;
          if (chance(CONFIG.repair.adhesivePullFailChance * ipa * heat)) {
            n.pullTabs && (p.heat[`tabsbroken:${n.id}`] = 1);
            advanceMinutes(2);
            return { ok: false, msg: 'Snap! A pull tab broke. Use heat/IPA and pry it out with the opener.' };
          }
        } else {
          openGlued(c, n);
        }
      }
      if ((n.slot === 'battery' || n.slot === 'battery2') && tool === 'opener') {
        const ipa = p.heat[`ipa:${n.id}`] ? 0.2 : 1;
        const heat = 1 - Math.min(1, (p.heat[n.id] ?? 0) / 100) * 0.7;
        if (chance(CONFIG.repair.punctureChance * ipa * heat * (expert() ? 1.5 : 1))) {
          const comp = p.components[n.slot]!;
          comp.condition = 0;
          if (!comp.faults.includes('f_batt_dead')) comp.faults.push('f_batt_dead');
          p.cosmetic = Math.max(0, p.cosmetic - 15);
          mistake('🔥 You punctured the battery! It vented smoke. Battery destroyed, frame scorched.');
        }
      }
      ns.s = 'out';
      takeOut(c, n);
      advanceMinutes(minutesFor('part'));
      return { ok: true, msg: `${n.label} removed and placed on the tray.` };
    }
    return { ok: false, msg: '', needsPart: { slot: n.slot!, node: n } };
  }
  return { ok: false, msg: 'Nothing happens.' };
}

/** Risky opening of glued covers / parts: cracks and flex tears when cold. */
function openGlued(c: Ctx, n: NodeDef) {
  const p = c.phone;
  const tier = toolTier('opening');
  const tierMult = [1, 1, 0.7, 0.4][tier];
  const heat = Math.min(100, p.heat[n.id] ?? 0);
  advanceMinutes(minutesFor('open'));
  const risk = expert() ? CONFIG.modes.expert.damageRiskMult : 1;
  if (n.clips) {
    if (chance(0.08 * tierMult)) {
      p.cosmetic = Math.max(0, p.cosmetic - 5);
      mistake('Snapped a plastic clip on the back cover.');
    }
    return;
  }
  if (!n.glued) return;
  const comp = p.components[n.slot!];
  if (heat < CONFIG.repair.safeOpenHeat) {
    const crackP = CONFIG.repair.crackChanceCold * (1 - heat / CONFIG.repair.safeOpenHeat) * tierMult * risk * (n.slot === 'innerDisplay' ? CONFIG.repair.foldableCrackMult : 1);
    if (comp && chance(crackP)) {
      const f = n.slot === 'backCover' ? 'f_backglass' : n.slot === 'display' || n.slot === 'innerDisplay' ? (n.slot === 'innerDisplay' ? 'f_inner_crease' : 'f_screen_cracked') : null;
      if (f && !comp.faults.includes(f)) comp.faults.push(f);
      mistake(`Cracked the ${n.label.toLowerCase()} while prying the cold adhesive.`);
    }
    if ((n.tetheredBy ?? []).length && comp && chance(CONFIG.repair.flexTearChance * tierMult * risk * (1 - heat / 100))) {
      if (!comp.faults.includes('f_flex_torn')) comp.faults.push('f_flex_torn');
      mistake('Opened too far: tore the display flex cable.');
    }
  }
  delete p.heat[n.id];
}

function seal(c: Ctx, n: NodeDef) {
  const g = G();
  if (!n.glued) return;
  if ((g.consumables.adhesive ?? 0) > 0) {
    g.consumables.adhesive--;
  } else {
    c.phone.waterSeal = false;
    g.bench.mistakes.push(`Closed ${n.label.toLowerCase()} without new adhesive (no water seal).`);
    notify('No adhesive in stock: closed without a seal. Water resistance lost.', 'warn');
  }
}

function takeOut(c: Ctx, n: NodeDef) {
  const p = c.phone;
  if (!n.slot) return;
  const comp = p.components[n.slot];
  if (comp) {
    p.loose[n.slot] = comp;
    delete p.components[n.slot];
  }
}

/** Install a specific component into a node (from tray or inventory). */
export function installComponent(c: Ctx, n: NodeDef, comp: ComponentInst, from: 'tray' | 'inventory'): ActionResult {
  const g = G();
  const p = c.phone;
  if (!partFits(comp, c.model, n.slot!)) {
    advanceMinutes(3);
    return { ok: false, msg: `${comp.partNo} does not fit: wrong connector / size for ${c.model.name}.` };
  }
  shortRisk(c, n);
  if (from === 'tray') delete p.loose[n.slot!];
  else {
    g.inventory = g.inventory.filter((x) => x !== comp);
    p.history.push({ day: g.day, slot: n.slot!, grade: comp.counterfeit ? 'counterfeit' : comp.grade, by: g.shopName });
    p.repairCost = (p.repairCost ?? 0) + (comp.cost ?? 0);
  }
  p.components[n.slot!] = comp;
  const ns = p.nodes[n.id] ?? (p.nodes[n.id] = { s: 'out' });
  if (n.kind === 'cover') {
    ns.s = (n.tetheredBy ?? []).length ? 'open' : 'in';
    if (ns.s === 'in') seal(c, n);
  } else {
    ns.s = 'in';
    if (n.glued) seal(c, n);
  }
  advanceMinutes(minutesFor('part'));
  const brand = brandById(c.model.brand);
  let msg = `Installed ${SLOT_NAMES[n.slot!]} (${comp.grade}).`;
  if (brand.pairing.includes(n.slot!) && comp.pairedTo !== p.serial) msg += ' ⚠ Not paired to this board: expect "unknown part" warnings.';
  if (ns.s === 'open') msg += ' Connect its cables, then close it with the opener.';
  return { ok: true, msg };
}

function wearTool(tool: BenchTool) {
  const g = G();
  const cat = tool === 'screwdriver' ? 'screwdriver' : tool === 'heat' ? 'heat' : tool === 'opener' || tool === 'spudger' || tool === 'tweezers' ? 'opening' : null;
  if (!cat || !g.tools[cat]) return;
  g.tools[cat].wear += 1;
}

/** Summary of the phone's assembly state. */
export function assemblyStatus(c: Ctx) {
  const missingScrews = c.nodes.filter((n) => n.kind === 'screw' && st(c, n.id) !== 'in');
  const notIn = c.nodes.filter((n) => n.kind !== 'screw' && st(c, n.id) !== 'in');
  const disconnected = notIn.filter((n) => n.kind === 'connector');
  const missingParts = notIn.filter((n) => n.kind === 'part' || n.kind === 'cover' || n.kind === 'bracket');
  return { missingScrews, disconnected, missingParts, assembled: notIn.length === 0, closed: missingParts.length === 0 };
}

/** Is the board exposed enough for probing with a multimeter? */
export function boardAccessible(c: Ctx): boolean {
  const board = c.nodes.find((n) => n.slot === 'board');
  if (!board) return false;
  if (st(c, board.id) === 'out') return true;
  return (board.requires ?? []).every((r) => {
    const rn = c.byId.get(r)!;
    if (rn.kind === 'connector' || rn.kind === 'part') return true;
    return st(c, r) !== 'in';
  });
}

/** Node ids that are relevant to a slot's function (the part + its connectors). */
export function slotWorking(c: Ctx, slot: Slot): boolean {
  const n = c.nodes.find((x) => x.slot === slot);
  if (!n) return true;
  if (!c.phone.components[slot]) return false;
  if (st(c, n.id) === 'out') return false;
  const conns = c.nodes.filter((x) => x.kind === 'connector' && x.connects === n.id);
  return conns.every((x) => st(c, x.id) === 'in');
}
