/**
 * Front desk: customer queue (quotes, bargaining, warranty claims) and the
 * job board (assign to staff, load on bench, upsell, tracking).
 */
import { CONFIG } from '../CONFIG';
import { phoneById } from '../data/phones';
import { SERVICES, serviceById } from '../data/research';
import { visualInspection, diagComputer } from '../repair/diagnostics';
import { acceptJob, declineCustomer, personalityDef, proposeExtra, proposeQuote, quoteFor, serviceAvailable } from '../sim/customers';
import { assign, planJob, unassign } from '../sim/employees';
import { hasTool } from '../sim/economy';
import { phoneName, phoneValue } from '../sim/phones';
import { advanceMinutes } from '../sim/clock';
import { G, changed, notify, type Customer, type Job } from '../sim/state';
import { loadOnBench } from './bench';
import { bar, btn, closeModal, h, modal, money, toast } from './dom';
import { goTab } from './nav';

export function renderFront(el: HTMLElement) {
  const g = G();
  const queue = g.customers;
  const open = g.jobs.filter((j) => j.status === 'open');
  const ready = g.jobs.filter((j) => j.status === 'ready');
  el.replaceChildren(
    h('div', { class: 'row' }, h('h2', null, 'Front desk'), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `Open ${String(CONFIG.time.openHour).padStart(2, '0')}:00 to ${CONFIG.time.closeHour}:00`)),
    h('h4', null, `Waiting at the counter (${queue.length})`),
    queue.length
      ? h('div', { class: 'grid3' }, queue.map(customerCard))
      : h('div', { class: 'empty' }, 'Nobody is waiting. Customers walk in during opening hours; reputation, location and prices bring more.'),
    h('h4', null, `Open jobs (${open.length})`),
    open.length ? jobTable(open) : h('div', { class: 'empty' }, 'No open jobs.'),
    h('h4', null, `Ready for pickup (${ready.length})`),
    ready.length
      ? h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Customer'), h('th', null, 'Phone'), h('th', null, 'Quality'), h('th', null, 'Price')),
        ready.map((j) => h('tr', null, h('td', null, j.customerName), h('td', null, phoneName(g.phones[j.phoneId])), h('td', null, `${j.quality}/100`), h('td', { class: 'num' }, j.warranty ? 'warranty' : money(j.price)))))
      : h('div', { class: 'empty' }, 'Finished repairs wait here until the customer collects them.'),
  );
}

function customerCard(c: Customer) {
  const g = G();
  const p = g.phones[c.phoneId];
  const pers = personalityDef(c.personality);
  return h('div', { class: `card ${c.warrantyJobId ? 'hl' : ''}` },
    h('div', { class: 'head' }, h('h3', null, c.name), c.repeat ? h('span', { class: 'pill good' }, 'regular') : null, c.warrantyJobId ? h('span', { class: 'pill warn' }, 'warranty') : null, c.mailIn ? h('span', { class: 'pill' }, 'mail-in') : null),
    h('div', { class: 'small' }, phoneName(p)),
    h('p', { style: 'margin:6px 0' }, `"${c.symptoms.join('", "')}"`),
    h('div', { class: 'small muted' }, `${pers.name}${c.warrantyJobId ? '' : ` · budget ~${money(Math.round(c.budget / 500) * 500)}`} · ${c.deadlineDays === 0 ? 'needs it today' : `back in ${c.deadlineDays}d`}`),
    h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'small muted' }, 'Patience'), bar(c.patience, c.maxPatience, c.patience / c.maxPatience < 0.3 ? 'bad' : '')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      c.warrantyJobId ? btn('Handle claim', () => warrantyDialog(c), 'primary') : btn('Talk / quote', () => quoteDialog(c), 'primary'),
    ));
}

// ------------------------------------------------------------------
// Quote dialog with bargaining
// ------------------------------------------------------------------
function quoteDialog(c: Customer) {
  const g = G();
  const phone = g.phones[c.phoneId];
  const model = phoneById(phone.modelId);
  const selected = new Set<string>();
  let express = c.personality === 'emergency';
  let price = 0;
  const conversation = h('div', { class: 'card', style: 'background:var(--panel-2)' }, h('p', null, `${c.name}: "${c.symptoms.join('. ')}."`), c.note ? h('p', { class: 'muted small' }, c.note) : null);
  const priceInput = h('input', { type: 'number', step: 50, min: 0, style: 'width:140px' }) as HTMLInputElement;
  const total = h('div', { class: 'small' });
  const recompute = () => {
    const q = quoteFor(model, [...selected], express);
    price = q.total;
    priceInput.value = String(price);
    total.replaceChildren(...q.lines.map((l) => h('div', { class: 'row' }, h('span', null, l.name), h('span', { class: 'spacer' }), h('span', { class: 'mono muted' }, `labour ${money(l.labour)} + parts ~${money(l.parts)}`))), h('div', null, express ? `Express (same day) +${Math.round(CONFIG.customers.sameDayBonus * 100)}%` : ''));
  };
  const svcList = h('div', { class: 'col', style: 'max-height:260px;overflow:auto' },
    SERVICES.map((s) => {
      const avail = serviceAvailable(s.id);
      const cb = h('input', { type: 'checkbox', disabled: !avail, onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? selected.add(s.id) : selected.delete(s.id); recompute(); } });
      return h('label', { class: 'row small', style: avail ? '' : 'opacity:.45' }, cb, s.name, !avail ? h('span', { class: 'pill' }, 'research') : null, h('span', { class: 'spacer' }), h('span', { class: 'muted mono' }, money(quoteFor(model, [s.id]).total)));
    }));
  const exp = h('input', { type: 'checkbox', checked: express, onchange: (e: Event) => { express = (e.target as HTMLInputElement).checked; recompute(); } });
  recompute();
  const say = (who: string, text: string, cls = '') => conversation.append(h('p', { class: cls }, h('b', null, `${who}: `), text));
  modal(`Customer: ${c.name}`, h('div', null,
    h('div', { class: 'kv small' },
      h('span', { class: 'k' }, 'Phone'), h('span', null, `${phoneName(phone)} · ${model.tier}`),
      h('span', { class: 'k' }, 'Looks'), h('span', null, visualInspection(phone).slice(0, 2).join(' · ')),
      h('span', { class: 'k' }, 'Value fixed'), h('span', null, money(phoneValue(phone, { assumeFixed: true }))),
      h('span', { class: 'k' }, 'Personality'), h('span', null, `${personalityDef(c.personality).name}: ${personalityDef(c.personality).desc}`)),
    h('h4', null, 'Services to quote'),
    svcList,
    h('label', { class: 'row small', style: 'margin-top:6px' }, exp, 'Express same-day repair'),
    total,
    h('div', { class: 'row', style: 'margin-top:8px' }, h('b', null, 'Your price'), priceInput, h('span', { class: 'muted small' }, 'Edit to haggle')),
    h('h4', null, 'Conversation'), conversation),
  [
    { label: 'Send away', cls: 'danger', onClick: () => { declineCustomer(c); notify(`${c.name} left.`, 'info'); changed(); } },
    { label: `Diagnose first (${money(CONFIG.pricing.diagnosticFee)})`, onClick: () => {
      acceptJob(c, [], CONFIG.pricing.diagnosticFee, false, true);
      notify(`${c.name} left the phone for diagnosis. Call them with a quote later (Jobs → Call).`, 'info');
      changed();
    } },
    { label: 'Offer price', cls: 'primary', onClick: () => {
      if (!selected.size) { toast('Select at least one service.', 'warn'); return false; }
      const offer = Math.max(0, +priceInput.value || price);
      say('You', `${money(offer)}${express ? ' (express)' : ''}`);
      const r = proposeQuote(c, offer, express);
      say(c.name, r.text, r.accepted ? 'good' : r.leave ? 'bad' : '');
      if (r.accepted) {
        const job = acceptJob(c, [...selected], offer, express);
        notify(`🧾 Job accepted: ${c.name}, ${money(offer)}, due day ${job.dueDay}.`, 'good');
        setTimeout(() => { closeModal(); changed(); }, 700);
        return false;
      }
      if (r.leave) {
        declineCustomer(c);
        setTimeout(() => { closeModal(); changed(); }, 900);
        return false;
      }
      if (r.counter) {
        priceInput.value = String(r.counter);
        conversation.append(h('div', { class: 'row' }, btn(`Accept ${money(r.counter)}`, () => {
          const job = acceptJob(c, [...selected], r.counter!, express);
          notify(`🧾 Deal at ${money(r.counter!)}: due day ${job.dueDay}.`, 'good');
          closeModal();
          changed();
        }, 'small primary')));
      }
      return false;
    } },
  ], { wide: true });
}

function warrantyDialog(c: Customer) {
  const g = G();
  const phone = g.phones[c.phoneId];
  const orig = g.jobs.find((j) => j.id === c.warrantyJobId);
  const info = h('div', { class: 'col small' });
  modal(`Warranty claim: ${c.name}`, h('div', null,
    h('p', null, `"${c.symptoms.join('. ')}"`),
    h('div', { class: 'kv small' },
      h('span', { class: 'k' }, 'Phone'), h('span', null, phoneName(phone)),
      h('span', { class: 'k' }, 'Our record'), h('span', null, orig ? `Day ${orig.completedDay}: ${orig.services.map((s) => serviceById(s).name).join(', ')} · IMEI ${orig.originalImei}` : 'unknown')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      btn('👁 Inspect for physical damage', () => {
        advanceMinutes(2);
        info.append(h('div', null, 'Visual: ' + visualInspection(phone).join(' · ')));
      }, 'small'),
      btn('💻 Check IMEI', () => {
        if (!hasTool('diagcomp')) return toast('Needs a diagnostic computer.', 'bad');
        advanceMinutes(3);
        const r = diagComputer(phone);
        const imei = r.lines.find((l) => l.label === 'IMEI')?.value ?? 'not readable (no boot)';
        info.append(h('div', { class: orig && imei !== orig.originalImei && r.connected ? 'bad' : '' }, `IMEI read: ${imei}${orig && r.connected ? (imei === orig.originalImei ? ' ✔ matches' : ' ✖ DOES NOT MATCH') : ''}`));
      }, 'small')),
    info,
    h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Honour real claims (free repair). Physical damage or a swapped phone is not covered. Rejecting a real claim hurts your reputation.')),
  [
    { label: 'Reject claim', cls: 'danger', onClick: () => { declineCustomer(c); changed(); } },
    { label: 'Accept warranty repair', cls: 'primary', onClick: () => {
      const svc = orig?.services ?? [];
      acceptJob(c, svc, 0, false);
      notify(`Warranty job opened for ${c.name}.`, 'info');
      changed();
    } },
  ]);
}

// ------------------------------------------------------------------
// Job board
// ------------------------------------------------------------------
function jobTable(jobs: Job[]) {
  const g = G();
  return h('table', { class: 'tbl' },
    h('tr', null, h('th', null, 'Customer'), h('th', null, 'Phone'), h('th', null, 'Work'), h('th', null, 'Due'), h('th', null, 'Technician'), h('th', null, 'Status'), h('th', null, '')),
    jobs.sort((a, b) => a.dueDay - b.dueDay).map((j) => {
      const p = g.phones[j.phoneId];
      const onBench = g.bench.jobId === j.id;
      const sel = h('select', {
        'aria-label': 'Assign technician',
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          if (!v) unassign(j);
          else assign(j, g.employees.find((x) => x.id === v)!);
          changed();
        },
      }, h('option', { value: '' }, onBench ? 'You (bench)' : '—'), g.employees.map((e) => h('option', { value: e.id, selected: j.assignedTo === e.id || undefined }, `${e.name} (${e.skill})`)));
      const plan = j.services.length ? planJob(j) : [];
      const missing = plan.filter((x) => !x.ok);
      return h('tr', null,
        h('td', null, j.customerName, j.warranty ? h('span', { class: 'pill warn' }, 'warranty') : null, j.mailIn ? h('span', { class: 'pill' }, 'mail-in') : null, j.businessId ? h('span', { class: 'pill accent' }, 'fleet') : null),
        h('td', { class: 'small' }, phoneName(p)),
        h('td', { class: 'small' }, j.services.map((s) => serviceById(s).name).join(', ') || h('i', null, 'diagnosis'), missing.length ? h('div', { class: 'warn small' }, `Needs: ${missing.map((m) => m.reason).join(', ')}`) : null),
        h('td', { class: j.dueDay < g.day ? 'bad' : j.dueDay === g.day ? 'warn' : '' }, j.dueDay === g.day ? 'today' : `day ${j.dueDay}`),
        h('td', null, g.employees.length ? sel : h('span', { class: 'muted small' }, onBench ? 'You' : '—')),
        h('td', null, j.assignedTo ? bar(j.progress * 100, 100, 'good') : onBench ? h('span', { class: 'pill accent' }, 'on bench') : j.waitingParts ? h('span', { class: 'pill warn' }, 'waiting parts') : h('span', { class: 'pill' }, 'queued')),
        h('td', null, h('div', { class: 'row' },
          btn('Bench', () => { loadOnBench(j.phoneId, j.id); goTab('bench'); }, 'small', onBench),
          btn('Call', () => upsellDialog(j), 'small', false, 'Offer extra work found during diagnosis'),
        )));
    }));
}

function upsellDialog(j: Job) {
  const g = G();
  const p = g.phones[j.phoneId];
  const model = phoneById(p.modelId);
  const selected = new Set<string>();
  const sum = h('div', { class: 'small' });
  modal(`Call ${j.customerName}`, h('div', null,
    h('p', { class: 'small muted' }, `Current: ${j.services.map((s) => serviceById(s).name).join(', ') || 'diagnosis only'} · ${money(j.price)}. Propose additional work you found:`),
    h('div', { class: 'col', style: 'max-height:280px;overflow:auto' },
      SERVICES.filter((s) => serviceAvailable(s.id) && !j.services.includes(s.id)).map((s) => h('label', { class: 'row small' },
        h('input', { type: 'checkbox', onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? selected.add(s.id) : selected.delete(s.id); sum.textContent = `+${money(quoteFor(model, [...selected]).total)}`; } }),
        s.name, h('span', { class: 'spacer' }), h('span', { class: 'muted mono' }, money(quoteFor(model, [s.id]).total))))),
    sum),
  [
    { label: 'Cancel', onClick: () => {} },
    { label: 'Call customer', cls: 'primary', onClick: () => { if (!selected.size) return false; proposeExtra(j, [...selected]); changed(); } },
  ]);
}

export { goTab };
