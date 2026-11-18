/** Staff: employees, hiring, training, reviews, policies. */
import { CONFIG } from '../CONFIG';
import { fire, giveRaise, hire, maxEmployees, performanceReview, refreshCandidates, train } from '../sim/employees';
import { spend } from '../sim/economy';
import { G, changed } from '../sim/state';
import { bar, btn, h, modal, money } from './dom';

export function renderStaff(el: HTMLElement) {
  const g = G();
  const locked = g.stage < 2 && g.mode === 'career';
  el.replaceChildren(
    h('div', { class: 'row' }, h('h2', null, 'Staff'), h('span', { class: 'spacer' }),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: g.policy.autoAssign, onchange: (e: Event) => { g.policy.autoAssign = (e.target as HTMLInputElement).checked; changed(); } }), 'Technicians pick up jobs automatically'),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: !!g.policy.autoOrder, onchange: (e: Event) => { g.policy.autoOrder = (e.target as HTMLInputElement).checked; changed(); } }), 'Auto-order missing parts'),
      h('label', { class: 'row small' }, 'Preferred part grade ',
        h('select', { onchange: (e: Event) => { g.policy.grade = (e.target as HTMLSelectElement).value as any; changed(); } },
          ['genuine', 'refurbished', 'aftermarket'].map((gr) => h('option', { value: gr, selected: g.policy.grade === gr || undefined }, gr))))),
    locked ? h('div', { class: 'card hl', style: 'margin-bottom:12px' }, 'Hiring unlocks at stage 2 (Local Repair Shop). Until then the booth is all yours.') : null,
    h('h4', null, `Team (${g.employees.length}/${maxEmployees()} benches)`),
    g.employees.length
      ? h('div', { class: 'grid3' }, g.employees.map((e) => {
          const job = g.jobs.find((j) => j.id === e.jobId);
          return h('div', { class: 'card' },
            h('div', { class: 'head' }, h('h3', null, e.name), h('span', { class: 'pill' }, e.state)),
            h('div', { class: 'kv small' },
              h('span', { class: 'k' }, 'Skill'), h('span', null, bar(e.skill)),
              h('span', { class: 'k' }, 'Morale'), h('span', null, bar(e.morale, 100, e.morale < 35 ? 'bad' : 'good')),
              h('span', { class: 'k' }, 'Specialties'), h('span', null, e.specs.join(', ')),
              h('span', { class: 'k' }, 'Speed'), h('span', null, `${e.speed}x`),
              h('span', { class: 'k' }, 'Salary'), h('span', null, `${money(e.salary)}/day`),
              h('span', { class: 'k' }, 'Repairs'), h('span', null, `${e.repairs} (${e.fails} with problems)`),
              h('span', { class: 'k' }, 'Working on'), h('span', null, job ? `${job.customerName} ${Math.round(job.progress * 100)}%` : '—')),
            (e.suspicious ?? 0) > 1 ? h('p', { class: 'bad small' }, '⚠ Suspicious: genuine parts keep going missing.') : null,
            h('div', { class: 'row', style: 'margin-top:8px' },
              btn(`Train (${money(CONFIG.employees.trainingCost * (g.research.done.includes('training-2') ? 0.6 : 1))})`, () => { train(e); changed(); }, 'small', e.state === 'training'),
              btn('Raise 10%', () => { giveRaise(e); changed(); }, 'small'),
              btn('Review', () => modal(`Performance review: ${e.name}`, h('p', null, performanceReview(e)), [{ label: 'Close', onClick: () => {} }]), 'small'),
              btn('Fire', () => modal(`Fire ${e.name}?`, h('p', null, 'Other staff will be a bit shaken.'), [{ label: 'Keep', onClick: () => {} }, { label: `Fire ${e.name}`, cls: 'danger', onClick: () => { fire(e); changed(); } }]), 'small danger')));
        }))
      : h('div', { class: 'empty' }, 'No employees yet.'),
    h('div', { class: 'row', style: 'margin-top:16px' }, h('h4', { style: 'margin:0' }, 'Candidates'), h('span', { class: 'spacer' }),
      btn('Post job ad (Rs 5,000)', () => { if (spend(5000, 'misc')) { refreshCandidates(); changed(); } }, 'small')),
    h('div', { class: 'grid3', style: 'margin-top:8px' }, g.candidates.map((c) => h('div', { class: 'card' },
      h('div', { class: 'head' }, h('h3', null, c.name)),
      h('div', { class: 'kv small' },
        h('span', { class: 'k' }, 'Skill'), h('span', null, bar(c.skill)),
        h('span', { class: 'k' }, 'Specialties'), h('span', null, c.specs.join(', ')),
        h('span', { class: 'k' }, 'Speed'), h('span', null, `${c.speed}x`),
        h('span', { class: 'k' }, 'Salary'), h('span', null, `${money(c.salary)}/day`),
        h('span', { class: 'k' }, 'References'), h('span', null, c.honesty < 0.4 ? 'vague…' : 'good')),
      h('div', { class: 'row', style: 'margin-top:8px' }, btn(`Hire (${money(c.salary * CONFIG.employees.hireFeeDays)} signing)`, () => { hire(c); changed(); }, 'small primary', locked || g.employees.length >= maxEmployees()))))),
  );
}
