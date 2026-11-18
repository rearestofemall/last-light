/**
 * App shell: main menu, HUD, navigation, notification log, day report,
 * and the real-time game loop.
 */
import { CONFIG } from '../CONFIG';
import { loadGame, saveGame, slotInfo, SLOTS, deleteSave } from '../save/save';
import { advanceMinutes } from '../sim/clock';
import { newGame } from '../sim/newgame';
import { G, changed, fmtTime, hasGame, onChange, onNotify, setGame, type GameMode } from '../sim/state';
import { initWorld } from '../sim/world';
import { benchElement, benchHidden, syncBench, renderSide } from './bench';
import { renderBusiness } from './business';
import { btn, closeModal, h, modal, modalOpen, money, toast } from './dom';
import { renderEquipment } from './equipment';
import { renderFinance } from './finance';
import { renderFront } from './front';
import { renderInventory } from './inventory';
import { renderMarket } from './market';
import { setNavHandler } from './nav';
import { renderResearch } from './research';
import { renderShop } from './shop';
import { renderStaff } from './staff';

interface Tab { id: string; label: string; icon: string; render?: (el: HTMLElement) => void; live?: boolean; badge?: () => number }
const TABS: Tab[] = [
  { id: 'front', label: 'Front desk', icon: '🧾', render: renderFront, badge: () => G().customers.length },
  { id: 'bench', label: 'Workbench', icon: '🔧' },
  { id: 'shop', label: 'Shop floor', icon: '🏪', render: renderShop, live: true },
  { id: 'inventory', label: 'Inventory', icon: '📦', render: renderInventory },
  { id: 'market', label: 'Phone market', icon: '📱', render: renderMarket },
  { id: 'staff', label: 'Staff', icon: '🧑‍🔧', render: renderStaff },
  { id: 'equipment', label: 'Equipment', icon: '🛠', render: renderEquipment },
  { id: 'research', label: 'Research', icon: '🔬', render: renderResearch },
  { id: 'finance', label: 'Finance', icon: '💰', render: renderFinance },
  { id: 'business', label: 'Business', icon: '🏢', render: renderBusiness },
];

let current = 'front';
let mainEl: HTMLElement;
let hudEl: HTMLElement;
let navEl: HTMLElement;
let logEl: HTMLElement;
let dirty = true;
let app: HTMLElement;

export function boot(root: HTMLElement) {
  app = root;
  initWorld();
  onNotify((text, kind) => {
    if (kind !== 'info') toast(text, kind);
    dirty = true;
  });
  onChange(() => (dirty = true));
  setNavHandler(goTab);
  showMenu();
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    if (hasGame() && hudEl?.isConnected) {
      const g = G();
      if (g.dayReport) showDayReport();
      else if (g.speed > 0 && !modalOpen()) advanceMinutes(dt * CONFIG.time.gameMinutesPerRealSecond * CONFIG.time.speeds[g.speed]);
      updateHud();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(() => {
    if (!hasGame() || !mainEl?.isConnected || !dirty) return;
    const tab = TABS.find((x) => x.id === current)!;
    const focused = document.activeElement;
    const typing = focused && mainEl.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'SELECT');
    if (modalOpen() || typing) return;
    dirty = false;
    renderNav();
    renderLog();
    if (tab.render && !tab.live) tab.render(mainEl);
    if (current === 'bench') renderSide();
  }, 700);
  window.addEventListener('beforeunload', () => { if (hasGame()) saveGame('auto'); });
}

// ------------------------------------------------------------------
// Main menu
// ------------------------------------------------------------------
const MODES: { id: GameMode; name: string; desc: string }[] = [
  { id: 'career', name: 'Career', desc: 'Start with a tiny mall booth and grow into an international electronics brand.' },
  { id: 'tycoon', name: 'Tycoon', desc: 'Business-focused: start with a shop, staff and auto-assigned repairs.' },
  { id: 'freeplay', name: 'Free play', desc: 'Unlimited money, everything unlocked. Take phones apart for fun.' },
  { id: 'challenge', name: 'Challenge', desc: 'Timed diagnostic puzzles with scores. All tools provided.' },
  { id: 'expert', name: 'Expert', desc: 'Less cash, impatient customers, pricier parts, harsher mistakes.' },
];

export function showMenu() {
  setGame(null);
  let mode: GameMode = 'career';
  const name = h('input', { type: 'text', value: 'Phone Bazaar', 'aria-label': 'Shop name', style: 'width:240px' }) as HTMLInputElement;
  const modeCards = () => h('div', { class: 'grid3' }, MODES.map((m) => h('div', { class: `card mode ${mode === m.id ? 'sel' : ''}`, tabindex: 0, role: 'button', onclick: () => { mode = m.id; grid.replaceWith((grid = modeCards())); } }, h('h3', null, m.name), h('p', { class: 'small muted' }, m.desc))));
  let grid = modeCards();
  const slots = h('div', { class: 'col' }, SLOTS.map((s) => {
    const info = slotInfo(s);
    return h('div', { class: 'row card', style: 'padding:8px' }, h('b', { style: 'width:70px' }, s === 'auto' ? 'Autosave' : `Slot ${s}`), h('span', { class: 'small muted spacer' }, info.label),
      btn('Load', () => { if (loadGame(s)) startShell(); else toast('Could not load that save.', 'bad'); }, 'small', !info.exists),
      btn('Delete', () => { deleteSave(s); showMenu(); }, 'small danger', !info.exists));
  }));
  app.replaceChildren(h('div', { class: 'menu' }, h('div', { class: 'menu-inner' },
    h('h1', null, 'Phone ', h('span', null, 'Bazaar')),
    h('p', { class: 'muted' }, 'Phone repair simulator & business tycoon. Open phones screw by screw, hunt faults with real instruments, microsolder boards, and build a repair empire.'),
    h('h4', null, 'New game'),
    grid,
    h('div', { class: 'row', style: 'margin-top:12px' }, h('label', { class: 'row' }, 'Shop name ', name), h('span', { class: 'spacer' }),
      btn('Start', () => { newGame(mode, name.value.trim()); startShell(); if (mode !== 'challenge') howToPlay(); }, 'primary')),
    h('h4', { style: 'margin-top:24px' }, 'Continue'),
    slots,
    h('p', { class: 'muted small', style: 'margin-top:24px' }, 'All brands and phones are parodies. Saves live in this browser (localStorage).'),
  )));
}

function howToPlay() {
  modal('Welcome to your repair booth', h('div', null,
    h('ol', null,
      h('li', null, h('b', null, 'Front desk: '), 'customers describe symptoms. Quote services (labour + parts), haggle, or take the phone in for diagnosis first.'),
      h('li', null, h('b', null, 'Workbench: '), 'load the job. Pick a tool (keys 1-7) and click parts on the 3D phone. Heat glued covers before opening. ', h('b', null, 'Disconnect the battery first!')),
      h('li', null, 'Screws go onto the magnetic mat in order. Putting a long screw in a short hole damages the board.'),
      h('li', null, 'Diagnose with the USB ammeter, diagnostic computer, test suite, multimeter and microscope. One symptom can have several causes.'),
      h('li', null, 'Replace parts from Inventory (order from suppliers, beware fakes). Press G for reassembly ghosts, put everything back, run the tests, then Finish & return.'),
      h('li', null, 'Grow: buy equipment, research techniques, hire staff, buy broken phones to refurbish, move to bigger shops.')),
    h('p', { class: 'muted small' }, 'Time runs while the shop is open. Use the speed buttons or Space to pause.')),
  [{ label: 'Open the shop', cls: 'primary', onClick: () => {} }]);
}

// ------------------------------------------------------------------
// Shell
// ------------------------------------------------------------------
function startShell() {
  const g = G();
  hudEl = h('div', { class: 'hud' });
  navEl = h('nav', { class: 'nav', 'aria-label': 'Sections' });
  mainEl = h('main', { class: 'main' });
  logEl = h('aside', { class: 'logpanel', 'aria-label': 'Event log' });
  app.replaceChildren(hudEl, h('div', { class: 'body' }, navEl, mainEl, logEl));
  buildHud();
  current = g.mode === 'challenge' ? 'bench' : 'front';
  goTab(current);
  document.onkeydown = (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || modalOpen()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setSpeed(G().speed === 0 ? 1 : 0);
    }
  };
}

let hudRefs: Record<string, HTMLElement> = {};
function buildHud() {
  const g = G();
  const stat = (k: string, id: string) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), (hudRefs[id] = h('span', { class: 'v' })));
  const speeds = h('div', { class: 'speed', role: 'group', 'aria-label': 'Game speed' }, CONFIG.time.speeds.map((s, i) => {
    const b = h('button', { 'aria-label': i === 0 ? 'Pause' : `${s}x speed`, title: i === 0 ? 'Pause (Space)' : `${s}x`, onclick: () => setSpeed(i) }, i === 0 ? '❚❚' : `${s}x`);
    hudRefs[`sp${i}`] = b;
    return b;
  }));
  hudEl.replaceChildren(
    h('span', { class: 'brand' }, g.shopName),
    stat('Day', 'day'), stat('Time', 'time'), speeds,
    stat('Cash', 'cash'), stat('Reputation', 'rep'), stat('Stage', 'stage'),
    (hudRefs.alert = h('span', { class: 'small warn' })),
    h('span', { class: 'spacer' }),
    btn('💾 Save', saveMenu, 'small'),
    btn('☰ Menu', () => modal('Leave game?', h('p', null, 'Your progress is autosaved.'), [{ label: 'Stay', onClick: () => {} }, { label: 'Save & quit to menu', cls: 'primary', onClick: () => { saveGame('auto'); benchHidden(); showMenu(); } }]), 'small'),
  );
  updateHud();
}

function setSpeed(i: number) {
  G().speed = i;
  updateHud();
}

function updateHud() {
  const g = G();
  if (!hudRefs.day) return;
  hudRefs.day.textContent = String(g.day);
  hudRefs.time.textContent = fmtTime(g.minute);
  hudRefs.cash.textContent = money(g.cash);
  hudRefs.cash.className = `v ${g.cash < 0 ? 'bad' : ''}`;
  hudRefs.rep.textContent = `${Math.round(g.rep)}/100`;
  hudRefs.stage.textContent = g.mode === 'challenge' ? `Score ${g.challenge?.score ?? 0}` : `${g.stage}: ${CONFIG.progression.stages[g.stage - 1].name}`;
  CONFIG.time.speeds.forEach((_, i) => hudRefs[`sp${i}`]?.classList.toggle('on', g.speed === i));
  const alerts: string[] = [];
  if (g.effects.loadshedding > 0) alerts.push('🔌 load-shedding');
  if (g.research.active) alerts.push('🔬 researching');
  if (g.challenge) {
    const left = CONFIG.challenge.puzzleMinutes - (g.day * 1440 + g.minute - g.challenge.startedMinute);
    alerts.push(left > 0 ? `⏱ ${left} min for full time bonus` : '⏱ time bonus gone');
  }
  hudRefs.alert.textContent = alerts.join(' · ');
}

function renderNav() {
  navEl.replaceChildren(...TABS.map((t) => {
    const b = t.badge?.() ?? 0;
    return h('button', { class: current === t.id ? 'on' : '', onclick: () => goTab(t.id), 'aria-current': current === t.id ? 'page' : undefined, title: t.label },
      h('span', null, t.icon), h('span', { class: 'lbl' }, t.label), b ? h('span', { class: 'badge' }, b) : null);
  }));
}

function renderLog() {
  const g = G();
  logEl.replaceChildren(h('h4', { style: 'margin-top:0' }, 'Activity'), ...g.log.slice(0, 60).map((l) => h('div', { class: `entry ${l.kind}` }, h('span', { class: 't' }, `D${l.day} ${fmtTime(l.minute)}`), l.text)));
}

export function goTab(id: string) {
  current = id;
  const tab = TABS.find((t) => t.id === id)!;
  renderNav();
  renderLog();
  mainEl.classList.toggle('bench-mode', id === 'bench');
  if (id === 'bench') {
    mainEl.replaceChildren(benchElement());
    syncBench();
  } else {
    benchHidden();
    tab.render?.(mainEl);
  }
}

function saveMenu() {
  modal('Save game', h('div', { class: 'col' }, SLOTS.filter((s) => s !== 'auto').map((s) => h('div', { class: 'row' }, h('b', null, `Slot ${s}`), h('span', { class: 'small muted spacer' }, slotInfo(s).label),
    btn('Save here', () => { if (saveGame(s)) toast(`Saved to slot ${s}.`, 'good'); else toast('Save failed (storage full or blocked).', 'bad'); closeModal(); }, 'small primary')))),
  [{ label: 'Close', onClick: () => {} }]);
}

function showDayReport() {
  const g = G();
  const r = g.dayReport!;
  g.dayReport = null;
  saveGame('auto');
  modal(`End of day ${r.day}`, h('div', null,
    h('div', { class: 'kv' },
      h('span', { class: 'k' }, 'Income'), h('span', { class: 'good' }, money(r.income)),
      h('span', { class: 'k' }, 'Expenses'), h('span', { class: 'bad' }, money(r.expense)),
      h('span', { class: 'k' }, 'Profit'), h('span', { class: r.income - r.expense >= 0 ? 'good' : 'bad' }, money(r.income - r.expense)),
      h('span', { class: 'k' }, 'Cash'), h('span', null, money(g.cash)),
      h('span', { class: 'k' }, 'Reputation'), h('span', null, `${Math.round(g.rep)}/100`)),
    h('ul', { class: 'small muted' }, r.lines.map((l) => h('li', null, l))),
    h('p', { class: 'small muted' }, 'Autosaved.')),
  [{ label: `Start day ${g.day}`, cls: 'primary', onClick: () => { g.speed = 1; changed(); } }], { dismissable: false });
}
