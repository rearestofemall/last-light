/** Research tree, grouped by progression stage. */
import { CONFIG } from '../CONFIG';
import { RESEARCH, researchById } from '../data/research';
import { researchAvailable, startResearch } from '../sim/world';
import { G, changed } from '../sim/state';
import { bar, btn, h, money } from './dom';

export function renderResearch(el: HTMLElement) {
  const g = G();
  const active = g.research.active;
  el.replaceChildren(
    h('h2', null, 'Research & techniques'),
    active
      ? h('div', { class: 'card hl', style: 'margin-bottom:12px' }, h('div', { class: 'row' }, h('b', null, `Researching: ${researchById(active.id).name}`), h('span', { class: 'spacer' }), `${Math.ceil(active.minutesLeft / 60)}h left`),
        bar(researchById(active.id).hours * 60 - active.minutesLeft, researchById(active.id).hours * 60))
      : h('p', { class: 'muted small' }, 'Pick a project. Research runs while the clock runs (game hours).'),
    ...CONFIG.progression.stages.map((s) => h('div', null,
      h('h4', null, `Stage ${s.id}: ${s.name}${s.id > g.stage ? ' (locked)' : ''}`),
      h('div', { class: 'grid3' }, RESEARCH.filter((r) => r.stage === s.id).map((r) => {
        const done = g.research.done.includes(r.id);
        const av = researchAvailable(r.id);
        return h('div', { class: `card ${done ? '' : av.ok ? 'hl' : ''}`, style: done ? 'opacity:.7' : '' },
          h('div', { class: 'head' }, h('h3', null, r.name), done ? h('span', { class: 'pill good' }, 'done') : null),
          h('p', { class: 'small' }, r.desc),
          r.requires.length ? h('div', { class: 'small muted' }, `Requires: ${r.requires.map((x) => researchById(x).name).join(', ')}`) : null,
          !done ? h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'small' }, `${money(r.cost)} · ${r.hours}h`), h('span', { class: 'spacer' }),
            av.ok ? btn('Start', () => { startResearch(r.id); changed(); }, 'small primary') : h('span', { class: 'small muted' }, av.reason)) : null);
      })))),
  );
}
