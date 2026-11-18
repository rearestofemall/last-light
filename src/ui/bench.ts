/**
 * Workbench screen: 3D workstation + tool bar + side panels (job, diagnostics,
 * magnetic screw mat, parts tray, assembly status, log).
 */
import { CONFIG } from '../CONFIG';
import { brandById } from '../data/brands';
import { faultById, TESTS } from '../data/faults';
import { SLOT_NAMES } from '../data/parts';
import { phoneById } from '../data/phones';
import { serviceById } from '../data/research';
import { SCREWDRIVER_BITS, SCREW_COLORS } from '../data/tools';
import type { NodeDef, ScrewType, Slot } from '../data/types';
import { BENCH_TOOLS, assemblyStatus, boardAccessible, ctxFor, describeAction, installComponent, performAction, type BenchTool } from '../repair/assembly';
import { ammeter, diagComputer, inspectPart, runTestSuite, visualInspection } from '../repair/diagnostics';
import { MicroView } from '../repair/micro';
import { Workstation } from '../repair/workstation';
import { advanceMinutes } from '../sim/clock';
import { hasTool, toolTier } from '../sim/economy';
import { benchQuality } from '../sim/jobs';
import { markReady } from '../sim/customers';
import { modelsForPart, phoneFaults, phoneName, phoneValue } from '../sim/phones';
import { chance } from '../sim/rng';
import { G, changed, notify, type ComponentInst, type PhoneInst } from '../sim/state';
import { submitPuzzle } from '../sim/newgame';
import { CHALLENGES } from '../data/challenges';
import { btn, closeModal, h, modal, money, toast } from './dom';

let ws: Workstation | null = null;
let root: HTMLElement | null = null;
let side: HTMLElement | null = null;
let tip: HTMLElement | null = null;
let status: HTMLElement | null = null;
let microHost: HTMLElement | null = null;
let micro: MicroView | null = null;
let loadedId: string | null = null;

const g = () => G();
const phone = (): PhoneInst | null => (g().bench.phoneId ? g().phones[g().bench.phoneId!] ?? null : null);
const job = () => g().jobs.find((j) => j.id === g().bench.jobId) ?? null;

function log(text: string) {
  const j = job();
  if (j) j.log.push(`Day ${g().day} ${String(Math.floor(g().minute / 60)).padStart(2, '0')}:${String(g().minute % 60).padStart(2, '0')}: ${text}`);
}

export function benchElement(): HTMLElement {
  if (root) return root;
  const view = h('div', { class: 'bench-view' });
  side = h('div', { class: 'bench-side' });
  tip = h('div', { class: 'tip', style: 'display:none' });
  status = h('div', { class: 'statusline' }, 'Pick a tool, then click on the phone. Drag to rotate, scroll to zoom, right-drag to pan.');
  microHost = h('div', { style: 'position:absolute;inset:0;display:none;z-index:10;background:var(--bg)' });
  root = h('div', { class: 'bench', style: 'position:relative' }, view, side, microHost);
  view.append(tip, status);
  ws = new Workstation(view);
  ws.highlight = (n, ghost) => {
    const p = phone();
    if (!p) return 'none';
    const c = ctxFor(p);
    const s = p.nodes[n.id]?.s ?? 'in';
    if (ghost !== (s === 'out' && n.kind !== 'connector')) return 'none';
    return describeAction(c, n, g().bench.tool as BenchTool).ok ? 'ok' : 'none';
  };
  ws.onHover = (pi) => {
    const p = phone();
    if (!pi || !p || !tip) {
      if (tip) tip.style.display = 'none';
      return;
    }
    const c = ctxFor(p);
    const a = describeAction(c, pi.node, g().bench.tool as BenchTool);
    const s = p.nodes[pi.node.id]?.s ?? 'in';
    const comp = pi.node.slot ? p.components[pi.node.slot] ?? p.loose[pi.node.slot] : undefined;
    tip.replaceChildren(...[
      h('b', null, pi.node.label),
      pi.node.screw ? h('div', { class: 'mono' }, `${pi.node.screw.type} · hole ${pi.node.screw.length}mm${p.nodes[pi.node.id]?.len ? ` · fitted ${p.nodes[pi.node.id]!.len}mm` : ''}`) : null,
      h('div', { class: 'muted small' }, s === 'in' ? (pi.node.kind === 'connector' ? 'connected' : 'installed') : s === 'open' ? 'opened' : pi.node.kind === 'connector' ? 'disconnected' : 'removed'),
      comp ? h('div', { class: 'small' }, `${comp.grade}${comp.pairedTo && comp.pairedTo !== p.serial ? ' · unpaired' : ''} · ${Math.round(comp.condition)}%`) : null,
      p.heat[pi.node.id] ? h('div', { class: 'small warn' }, `Adhesive softness ${Math.round(Math.min(100, p.heat[pi.node.id]))}%`) : null,
      h('div', { class: `verb ${a.ok ? 'ok' : 'no'}` }, a.ok ? `▶ ${a.verb}` : a.reason ?? a.verb),
    ].filter(Boolean) as HTMLElement[]);
    tip.style.display = 'block';
    tip.style.left = `${Math.min(pi.x + 16, view.clientWidth - 290)}px`;
    tip.style.top = `${pi.y + 16}px`;
  };
  ws.onClick = (pi) => clickNode(pi.node);
  view.append(h('div', { class: 'overlay-top' }, toolbar(), bitbar()), viewbar());
  document.addEventListener('keydown', onKey);
  return root;
}

function onKey(e: KeyboardEvent) {
  if (!root?.isConnected || micro) return;
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || document.querySelector('.modal-backdrop')) return;
  const t = BENCH_TOOLS.find((x) => x.key === e.key);
  if (t) setTool(t.id);
  if (e.key === 'g' || e.key === 'G') toggleGhost();
  if (e.key === 'f' || e.key === 'F') ws?.flip();
  if (e.key === 'b' || e.key === 'B') {
    const bits = SCREWDRIVER_BITS[toolTier('screwdriver')] ?? [];
    const i = bits.indexOf(g().bench.bit);
    setBit(bits[(i + 1) % bits.length]);
  }
}

function setTool(t: BenchTool) {
  g().bench.tool = t;
  root?.querySelector('.toolbar')?.replaceWith(toolbar());
  ws?.refreshMaterials();
  if (status) status.textContent = BENCH_TOOLS.find((x) => x.id === t)!.hint;
}

function setBit(b: ScrewType) {
  g().bench.bit = b;
  root?.querySelector('.bitbar')?.replaceWith(bitbar());
  ws?.refreshMaterials();
}

function toggleGhost() {
  if (!ws) return;
  ws.ghostMode = !ws.ghostMode;
  ws.refresh();
  root?.querySelector('.viewbar')?.replaceWith(viewbar());
  if (status) status.textContent = ws.ghostMode ? 'Reassembly mode: removed parts show as ghosts. Click a ghost to put it back.' : 'Reassembly mode off.';
}

function toolbar() {
  return h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Bench tools' },
    BENCH_TOOLS.map((t) => h('button', { class: `tool-btn ${g().bench.tool === t.id ? 'active' : ''}`, title: `${t.name} (${t.key}): ${t.hint}`, 'aria-label': t.name, onclick: () => setTool(t.id) }, `${t.icon} ${t.name}`, h('kbd', null, t.key))));
}

function bitbar() {
  const bits = SCREWDRIVER_BITS[toolTier('screwdriver')] ?? [];
  return h('div', { class: 'bitbar', role: 'group', 'aria-label': 'Screwdriver bit' },
    h('span', { class: 'tool-btn', style: 'cursor:default' }, 'Bit (B):'),
    (['phillips', 'pentalobe', 'tripoint', 'standoff', 'torx'] as ScrewType[]).map((b) =>
      h('button', { class: `tool-btn ${g().bench.bit === b ? 'active' : ''}`, disabled: !bits.includes(b), title: bits.includes(b) ? `${b} bit` : `${b}: not in your driver set`, onclick: () => setBit(b) },
        h('span', { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${SCREW_COLORS[b]};margin-right:4px` }), b)));
}

function viewbar() {
  return h('div', { class: 'viewbar' },
    h('button', { class: 'tool-btn', title: 'Front view', onclick: () => ws?.setView('front') }, 'Front'),
    h('button', { class: 'tool-btn', title: 'Back view', onclick: () => ws?.setView('back') }, 'Back'),
    h('button', { class: 'tool-btn', title: 'Flip phone (F)', onclick: () => ws?.flip() }, '⟲ Flip', h('kbd', null, 'F')),
    h('button', { class: `tool-btn ${ws?.ghostMode ? 'active' : ''}`, title: 'Reassembly mode: show removed parts as clickable ghosts (G)', onclick: toggleGhost }, '👻 Reassemble', h('kbd', null, 'G')));
}

// ------------------------------------------------------------------
// Interaction
// ------------------------------------------------------------------
function clickNode(n: NodeDef) {
  const p = phone();
  if (!p) return;
  const c = ctxFor(p);
  const res = performAction(c, n, g().bench.tool as BenchTool);
  if (res.needsPart) {
    choosePart(n, res.needsPart.slot);
    return;
  }
  if (status) status.textContent = res.msg;
  if (res.ok) log(res.msg);
  else if (res.msg) toast(res.msg, 'warn');
  if (n.kind === 'screw') g().bench.screwSel = null;
  afterChange();
}

function afterChange() {
  ws?.refresh();
  renderSide();
  changed();
}

function choosePart(n: NodeDef, slot: Slot) {
  const p = phone()!;
  const c = ctxFor(p);
  const model = c.model;
  const tray = p.loose[slot];
  const inv = g().inventory.filter((x) => x.slot === slot);
  const fitsLabel = (x: ComponentInst) => modelsForPart(x.partNo).map((m) => m.name).join(' / ') || x.modelId;
  const install = (comp: ComponentInst, from: 'tray' | 'inventory') => {
    closeModal();
    const r = installComponent(c, n, comp, from);
    if (status) status.textContent = r.msg;
    toast(r.msg, r.ok ? 'good' : 'bad');
    if (r.ok) log(r.msg);
    afterChange();
  };
  const row = (comp: ComponentInst, from: 'tray' | 'inventory') =>
    h('tr', null,
      h('td', null, from === 'tray' ? h('b', null, 'Original (tray)') : fitsLabel(comp)),
      h('td', null, comp.grade, comp.inspected === 'fake' ? h('span', { class: 'pill bad' }, 'FAKE') : null),
      h('td', { class: 'num' }, `${Math.round(comp.condition)}%`),
      h('td', { class: 'small muted' }, comp.faults.length && from === 'tray' ? comp.faults.map((f) => faultById(f).name).join(', ') : comp.source ?? ''),
      h('td', null, btn('Install', () => install(comp, from), 'small primary')));
  modal(`Install ${SLOT_NAMES[slot]}: ${model.name}`,
    h('div', null,
      h('p', { class: 'muted small' }, 'Parts only fit their exact model unless they are a shared part number. Wrong parts waste time.'),
      tray || inv.length
        ? h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Part'), h('th', null, 'Grade'), h('th', null, 'Cond.'), h('th', null, 'Notes'), h('th', null, '')),
          tray ? row(tray, 'tray') : null, inv.slice(0, 40).map((x) => row(x, 'inventory')))
        : h('div', { class: 'empty' }, `No ${SLOT_NAMES[slot]} parts in stock. Order one in Inventory → Order parts.`)),
    [{ label: 'Cancel', onClick: () => {} }], { wide: true });
}

// ------------------------------------------------------------------
// Loading
// ------------------------------------------------------------------
export function loadOnBench(phoneId: string, jobId: string | null) {
  const gg = g();
  if (gg.bench.phoneId && gg.bench.phoneId !== phoneId) unload(true);
  gg.bench.phoneId = phoneId;
  gg.bench.jobId = jobId;
  gg.bench.mistakes = [];
  gg.bench.screwSel = null;
  const j = job();
  if (j?.assignedTo) {
    const e = gg.employees.find((x) => x.id === j.assignedTo);
    if (e) {
      e.jobId = null;
      e.state = 'idle';
    }
    j.assignedTo = null;
  }
  syncBench();
}

export function unload(silent = false) {
  const gg = g();
  const p = phone();
  const j = job();
  if (j) j.mistakes.push(...gg.bench.mistakes);
  gg.bench.phoneId = null;
  gg.bench.jobId = null;
  gg.bench.mistakes = [];
  if (!silent && p) notify(`Put ${phoneName(p)} back on the shelf.`, 'info');
  syncBench();
}

/** Called when the bench tab is shown or the phone changes. */
export function syncBench() {
  benchElement();
  const p = phone();
  if ((p?.id ?? null) !== loadedId) {
    loadedId = p?.id ?? null;
    ws!.load(p);
    if (micro) closeMicro();
  }
  ws!.refresh();
  ws!.start();
  root!.querySelector('.no-phone')?.remove();
  if (!p) root!.querySelector('.bench-view')!.append(noPhone());
  renderSide();
}

export function benchHidden() {
  ws?.stop();
}

function noPhone() {
  const gg = g();
  const open = gg.jobs.filter((j) => j.status === 'open' && !j.assignedTo);
  const devices = gg.devices.map((id) => gg.phones[id]).filter(Boolean);
  return h('div', { class: 'no-phone' },
    h('h2', null, 'The bench is empty'),
    h('p', null, 'Load a customer job or one of your own phones.'),
    h('div', { class: 'col', style: 'max-height:50%;overflow:auto;min-width:360px' },
      open.map((j) => btn(`🔧 ${j.customerName}: ${phoneName(gg.phones[j.phoneId])} (${j.symptoms[0]})`, () => loadOnBench(j.phoneId, j.id))),
      devices.map((d) => btn(`📱 Own: ${phoneName(d)}`, () => loadOnBench(d.id, null))),
      !open.length && !devices.length ? h('p', { class: 'muted' }, 'No jobs yet. Serve customers at the Front desk.') : null));
}

// ------------------------------------------------------------------
// Side panel
// ------------------------------------------------------------------
export function renderSide() {
  if (!side) return;
  const p = phone();
  if (!p) {
    side.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Workbench'), h('p', { class: 'muted small' }, 'Tools: 1 screwdriver · 2 spudger · 3 tweezers · 4 heat · 5 opener · 6 IPA · 7 brush. G = reassembly ghosts, F = flip, B = cycle bit.')));
    return;
  }
  const c = ctxFor(p);
  const model = c.model;
  const brand = brandById(model.brand);
  const j = job();
  const st = assemblyStatus(c);
  const gg = g();
  side.replaceChildren(
    // ---- device / job
    h('div', { class: 'card' },
      h('div', { class: 'head' }, h('h3', null, phoneName(p))),
      h('div', { class: 'kv small' },
        h('span', { class: 'k' }, 'Brand'), h('span', null, `${brand.name} (repairability ${brand.repairability}/10)`),
        h('span', { class: 'k' }, 'Opening'), h('span', null, { front: 'Front display first', back: 'Back glass first', screwback: 'Screwed plastic back' }[phoneLayoutOpening(model.layout)]),
        h('span', { class: 'k' }, 'Serial'), h('span', { class: 'mono' }, p.serial),
        j ? [h('span', { class: 'k' }, 'Customer'), h('span', null, `${j.customerName} (${j.personality})`), h('span', { class: 'k' }, 'Complaint'), h('span', null, j.symptoms.join('; ')), h('span', { class: 'k' }, 'Services'), h('span', null, j.services.map((s) => serviceById(s).name).join(', ') || 'Diagnosis only'), h('span', { class: 'k' }, 'Price'), h('span', null, j.warranty ? 'Warranty (free)' : money(j.price)), h('span', { class: 'k' }, 'Due'), h('span', null, `Day ${j.dueDay}`)] : [h('span', { class: 'k' }, 'Value now'), h('span', null, money(phoneValue(p)))],
      ),
      j?.warranty ? h('p', { class: 'warn small' }, `Warranty claim. IMEI on our record: ${j.originalImei}. Check it matches!`) : null,
      h('div', { class: 'row', style: 'margin-top:8px' },
        gg.mode === 'challenge' ? btn('✅ Submit solution', submitChallenge, 'primary') : j ? btn('✅ Finish & return', finishJob, 'primary') : btn('Done', () => unload()),
        btn('Unload', () => unload()),
      )),
    // ---- diagnostics
    h('div', { class: 'card' },
      h('h3', null, 'Diagnostics'),
      h('div', { class: 'row' },
        btn('👁 Visual', doVisual, 'small'),
        btn('⚡ USB ammeter', doAmmeter, 'small', !hasTool('ammeter'), hasTool('ammeter') ? '' : 'Buy a USB ammeter'),
        btn('💻 Diag computer', doDiag, 'small', !hasTool('diagcomp'), hasTool('diagcomp') ? '' : 'Buy a diagnostic computer'),
        btn('🧪 Test suite', doTests, 'small'),
        btn('🔬 Board / microscope', openMicro, 'small', !(p.loose.board || boardAccessible(c)), 'Expose or remove the logic board first'),
        btn('💾 Flash firmware', doFlash, 'small', !hasTool('diagcomp') || !(gg.research.done.includes('software-flash') || gg.mode === 'freeplay'), 'Needs diagnostic computer + Firmware flashing research'),
        btn('🔗 Program / pair', doPair, 'small', !hasTool('programmer'), 'Needs a pairing programmer (research Parts pairing)'),
      )),
    // ---- screw mat
    h('div', { class: 'card' },
      h('div', { class: 'head' }, h('h3', null, 'Magnetic screw mat'), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${p.mat.length} screws`)),
      p.mat.length
        ? h('div', { class: 'mat' }, p.mat.map((s) => h('button', {
            class: `screw ${gg.bench.screwSel === s.id ? 'sel' : ''}`,
            style: `border-color:${SCREW_COLORS[s.type]}`,
            title: `${s.type} ${s.length}mm (from ${c.byId.get(s.from)?.label ?? s.from}). Click, then click an empty hole.`,
            onclick: () => { gg.bench.screwSel = gg.bench.screwSel === s.id ? null : s.id; if (gg.bench.screwSel) { setTool('screwdriver'); setBit(s.type); } renderSide(); ws?.refreshMaterials(); },
          }, h('span', null, s.type.slice(0, 2).toUpperCase()), h('span', { class: 'mono' }, s.length.toFixed(1)))))
        : h('div', { class: 'empty-state' }, 'Removed screws land here, in order. Remember where the long ones go!')),
    // ---- tray
    h('div', { class: 'card' },
      h('h3', null, 'Parts tray'),
      Object.keys(p.loose).length
        ? Object.entries(p.loose).map(([slot, comp]) => comp && h('div', { class: 'tray-item' },
            h('span', { class: 'spacer' }, SLOT_NAMES[slot as Slot], h('span', { class: 'muted small' }, ` · ${comp.grade} · ${Math.round(comp.condition)}%`)),
            btn('Install', () => { const n = c.nodes.find((x) => x.slot === slot); if (n) { setTool('tweezers'); const a = describeAction(c, n, 'tweezers'); if (a.ok) choosePart(n, slot as Slot); else toast(a.reason ?? 'Not yet.', 'warn'); } }, 'small', false, 'Put this (or a replacement) back in'),
            btn('🔍', () => inspectTray(comp), 'small', false, 'Inspect for counterfeit'),
            slot === 'display' ? btn('Glass-only', () => glassOnly(comp), 'small', false, 'Separate cracked glass + laminate new glass') : null,
            slot === 'board' ? btn('Microscope', openMicro, 'small') : null))
        : h('div', { class: 'empty-state' }, 'Removed parts appear here.')),
    // ---- assembly
    h('div', { class: 'card' },
      h('h3', null, 'Assembly status'),
      h('div', { class: 'small' },
        h('div', null, st.assembled ? h('span', { class: 'good' }, '✔ Fully assembled') : h('span', { class: 'warn' }, `${st.missingParts.length} part(s) out, ${st.disconnected.length} connector(s) open`)),
        st.missingScrews.length ? h('div', { class: 'warn' }, `${st.missingScrews.length} screw hole(s) empty`) : null,
        gg.bench.mistakes.length ? h('div', { class: 'bad' }, `Mistakes: ${gg.bench.mistakes.length}`) : null,
        h('div', { class: 'muted' }, `Adhesive ${gg.consumables.adhesive ?? 0} · IPA ${gg.consumables.ipa ?? 0}`),
      )),
    j ? h('details', { class: 'card' }, h('summary', null, 'Job log / diagnostic report'), h('div', { class: 'small', style: 'max-height:240px;overflow:auto' }, j.log.slice(-40).map((l) => h('div', null, l)))) : null,
  );
}

function phoneLayoutOpening(layout: string): 'front' | 'back' | 'screwback' {
  return layout === 'flagship-front' ? 'front' : layout === 'budget-screwback' ? 'screwback' : 'back';
}

// ------------------------------------------------------------------
// Diagnostics actions
// ------------------------------------------------------------------
/** Remember faults that a diagnostic clearly revealed (shown in My devices). */
function learn(p: PhoneInst, how: 'tests' | 'diag' | 'visual', failed: string[] = []) {
  const known = new Set(p.knownFaults ?? []);
  for (const f of phoneFaults(p)) {
    const d = faultById(f.id);
    if (how === 'visual' && d.visual) known.add(f.id);
    if (how === 'diag' && d.diag) known.add(f.id);
    if (how === 'tests' && d.tests.some((t) => failed.includes(t))) known.add(f.id);
  }
  // forget faults that are gone
  const live = new Set(phoneFaults(p).map((f) => f.id));
  p.knownFaults = [...known].filter((f) => live.has(f));
}

function doVisual() {
  const p = phone()!;
  advanceMinutes(1);
  const v = visualInspection(p);
  learn(p, 'visual');
  v.forEach((x) => log(`Visual: ${x}`));
  modal('Visual inspection', h('ul', null, v.map((x) => h('li', null, x))), [{ label: 'Close', onClick: () => {} }]);
  renderSide();
}

function doAmmeter() {
  const p = phone()!;
  advanceMinutes(2);
  const r = ammeter(p);
  log(`USB ammeter: ${r.volts.toFixed(2)}V ${r.amps.toFixed(2)}A. ${r.note}`);
  modal('USB ammeter', h('div', null,
    h('div', { class: 'mono', style: 'font-size:32px;background:#0b1a10;color:#6dff9e;padding:12px;border-radius:6px;text-align:center' }, `${r.volts.toFixed(2)}V  ${r.amps.toFixed(2)}A`),
    h('p', { style: 'margin-top:8px' }, r.note),
    h('p', { class: 'muted small' }, '0.00A = nothing drawn (port, flex, charging IC, or not connected). High current with the phone off = a short. Normal phones pull 1-3A.')),
    [{ label: 'Close', onClick: () => {} }]);
  renderSide();
}

function doDiag() {
  const p = phone()!;
  advanceMinutes(CONFIG.diag.diagComputerMinutes[Math.min(1, toolTier('diagcomp') - 1)]);
  const r = diagComputer(p);
  p.diagRun = true;
  learn(p, 'diag');
  log(`Diag computer: ${r.connected ? r.mode : 'not detected'}. ${r.errors.join('; ')}`);
  const j = job();
  if (j?.warranty && r.connected) {
    const imei = r.lines.find((l) => l.label === 'IMEI')?.value;
    if (imei && imei !== j.originalImei) toast('⚠ IMEI does not match the phone we repaired!', 'bad');
  }
  modal('Diagnostic computer', h('div', null,
    h('p', null, h('b', null, r.connected ? `Connected: ${r.mode}` : 'No device detected')),
    r.lines.length ? h('table', { class: 'tbl small' }, r.lines.map((l) => h('tr', { class: l.warn ? 'bad-row' : '' }, h('td', null, l.label), h('td', { class: 'mono' }, l.value)))) : null,
    h('h4', null, 'Errors / logs'),
    r.errors.length ? h('ul', null, r.errors.map((e) => h('li', null, e))) : h('p', { class: 'muted' }, 'No errors reported.')),
  [{ label: 'Close', onClick: () => {} }], { wide: false });
  renderSide();
}

function doTests() {
  const p = phone()!;
  advanceMinutes(CONFIG.diag.testSuiteMinutes);
  const { results, notes } = runTestSuite(p);
  learn(p, 'tests', Object.entries(results).filter(([, v]) => v === 'fail').map(([k]) => k));
  log(`Test suite: ${Object.entries(results).filter(([, v]) => v === 'fail').map(([k]) => k).join(', ') || 'all passed'}`);
  modal('Test suite', h('div', null,
    h('div', { class: 'tests' }, TESTS.map((t) => [h('span', null, t.name), h('span', { class: results[t.id] === 'pass' ? 'good' : results[t.id] === 'fail' ? 'bad' : 'muted' }, results[t.id] === 'pass' ? '✔ pass' : results[t.id] === 'fail' ? '✖ fail' : 'n/a')])),
    notes.length ? h('ul', { class: 'small warn' }, notes.map((n) => h('li', null, n))) : null),
  [{ label: 'Close', onClick: () => {} }]);
  renderSide();
}

function doFlash() {
  const p = phone()!;
  const r = diagComputer(p);
  if (!r.connected) return toast('Phone not detected. It must power on (or be in recovery).', 'bad');
  advanceMinutes(CONFIG.repair.flashMinutesBase / (toolTier('diagcomp') >= 2 ? 1.6 : 1));
  if (p.components.board?.chips && Object.values(p.components.board.chips).some((ch) => ch.faults.includes('f_nand'))) {
    log('Flash failed: storage write error.');
    return toast('Flash failed at 37%: storage write error. Hardware problem!', 'bad');
  }
  const n = p.softwareFaults.length;
  p.softwareFaults = [];
  log(`Firmware flashed (${n} software issue(s) cleared).`);
  toast(n ? 'Firmware flashed. Fresh OS, phone boots cleanly.' : 'Firmware flashed. No change.', 'good');
  afterChange();
}

function doPair() {
  const p = phone()!;
  const gg = g();
  const model = phoneById(p.modelId);
  const brand = brandById(model.brand);
  if (!gg.research.done.includes('parts-pairing') && gg.mode !== 'freeplay') return toast('Research Parts pairing first.', 'bad');
  const unpaired = brand.pairing.filter((s) => p.components[s] && p.components[s]!.pairedTo !== p.serial);
  if (!unpaired.length) return toast('All serialized parts are paired.', 'info');
  modal('Pairing programmer', h('div', null, h('p', null, 'Copy the board serial into the replacement part:'),
    unpaired.map((s) => h('div', { class: 'row' }, SLOT_NAMES[s], h('span', { class: 'spacer' }),
      btn('Program', () => {
        if (s === 'faceId' && !gg.research.done.includes('faceid-transfer') && gg.mode !== 'freeplay') return toast('Face ID needs the Face ID transfer research.', 'bad');
        advanceMinutes(15);
        if (chance(s === 'faceId' ? 0.75 : 0.92)) {
          p.components[s]!.pairedTo = p.serial;
          log(`Programmed ${s} to board serial.`);
          toast(`${SLOT_NAMES[s]} paired. Warning gone.`, 'good');
        } else toast('Programming failed. Try again.', 'warn');
        closeModal();
        afterChange();
      }, 'small primary')))), [{ label: 'Close', onClick: () => {} }]);
}

function inspectTray(comp: ComponentInst) {
  const res = [inspectPart(comp, 'visual')];
  if (hasTool('scale')) res.push(inspectPart(comp, 'scale'));
  if (hasTool('microscope')) res.push(inspectPart(comp, 'microscope'));
  advanceMinutes(3);
  if (res.some((r) => r.verdict === 'fake')) comp.inspected = 'fake';
  else if (res.some((r) => r.verdict === 'ok')) comp.inspected = 'ok';
  modal('Part inspection', h('ul', null, res.map((r) => h('li', { class: r.verdict === 'fake' ? 'bad' : '' }, r.text))), [{ label: 'Close', onClick: () => {} }]);
}

function glassOnly(comp: ComponentInst) {
  const gg = g();
  if (!gg.research.done.includes('glass-only') && gg.mode !== 'freeplay') return toast('Research Glass-only refurbishing first.', 'bad');
  if (!hasTool('separator') || !hasTool('laminator')) return toast('Needs a screen separator and an OCA laminator.', 'bad');
  if (!comp.faults.includes('f_screen_cracked')) return toast('The glass is not cracked.', 'info');
  if ((gg.consumables.glassOca ?? 0) <= 0) return toast('Out of glass + OCA sheets.', 'bad');
  gg.consumables.glassOca--;
  advanceMinutes(60);
  const tier = Math.min(toolTier('separator'), toolTier('laminator'));
  if (chance(CONFIG.repair.glassOnlySuccess[Math.max(0, tier - 1)] + gg.playerSkill / 500)) {
    comp.faults = comp.faults.filter((f) => f !== 'f_screen_cracked');
    comp.refurbished = true;
    log('Glass-only refurb: separated, new glass laminated. Original panel kept (no pairing warning).');
    toast('Glass replaced! Original OLED kept: no pairing warning, huge margin.', 'good');
  } else {
    if (!comp.faults.includes('f_display_dead')) comp.faults.push('f_display_dead');
    gg.bench.mistakes.push('Cracked the OLED during glass separation');
    toast('The OLED cracked during separation. Panel ruined.', 'bad');
  }
  afterChange();
}

// ------------------------------------------------------------------
// Microscope view
// ------------------------------------------------------------------
function openMicro() {
  const p = phone();
  if (!p || !microHost) return;
  const board = p.loose.board ?? p.components.board;
  if (!board) return toast('No logic board.', 'bad');
  micro = new MicroView(p, board, !!p.loose.board, log, closeMicro);
  microHost.replaceChildren(micro.root);
  microHost.style.display = 'block';
}

function closeMicro() {
  if (micro) micro.running = false;
  micro = null;
  if (microHost) {
    microHost.style.display = 'none';
    microHost.replaceChildren();
  }
  afterChange();
}

// ------------------------------------------------------------------
// Finishing
// ------------------------------------------------------------------
function finishJob() {
  const p = phone()!;
  const j = job()!;
  const gg = g();
  const { results, notes } = runTestSuite(p);
  const q = benchQuality(p, gg.bench.mistakes);
  const st = assemblyStatus(ctxFor(p));
  const fails = Object.entries(results).filter(([, v]) => v === 'fail');
  modal('Return phone to customer?', h('div', null,
    !st.assembled ? h('p', { class: 'bad' }, '⚠ The phone is not fully assembled! The customer will notice.') : null,
    h('h4', null, `Quality score: ${q.quality}/100`),
    h('ul', { class: 'small' }, q.breakdown.map((b) => h('li', null, b))),
    h('h4', null, 'Final test suite'),
    fails.length ? h('p', { class: 'bad' }, `Failing: ${fails.map(([k]) => TESTS.find((t) => t.id === k)?.name).join(', ')}`) : h('p', { class: 'good' }, 'All tests pass.'),
    notes.length ? h('ul', { class: 'small warn' }, notes.map((n) => h('li', null, n))) : null,
    h('p', { class: 'muted small' }, 'Old parts left on the tray go to your inventory as used parts.')),
  [
    { label: 'Keep working', onClick: () => {} },
    {
      label: 'Return to customer',
      cls: 'primary',
      onClick: () => {
        for (const comp of Object.values(p.loose)) if (comp) { comp.source = 'Removed (customer)'; gg.inventory.push(comp); }
        p.loose = {};
        const tests: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(results)) if (v !== 'n/a') tests[k] = v === 'pass';
        markReady(j, q.quality, tests, gg.bench.mistakes);
        gg.playerSkill = Math.min(100, gg.playerSkill + 0.8 * (1 - gg.playerSkill / 120));
        gg.bench.mistakes = [];
        notify(`📞 Called ${j.customerName}: phone ready for pickup.`, 'good');
        unload(true);
        changed();
      },
    },
  ]);
}

function submitChallenge() {
  const r = submitPuzzle();
  const ch = g().challenge!;
  modal(r.passed ? 'Solved!' : 'Not quite', h('div', null, h('p', null, r.text), h('p', null, `Total score: ${ch.score}`),
    ch.puzzle + 1 >= CHALLENGES.length && ch.history.length >= CHALLENGES.length ? h('p', { class: 'good' }, 'All challenges done!') : null),
  [{ label: 'Continue', onClick: () => {} }]);
  syncBench();
}

/** Debug/test access to the 3D workstation. */
export const _workstation = () => ws;
