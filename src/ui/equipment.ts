/** Equipment: buy tools by tier, see condition, service / repair them. */
import { TOOLS, toolById } from '../data/tools';
import { buyTool, maintainTool, toolCondition } from '../sim/economy';
import { G, changed } from '../sim/state';
import { researchById } from '../data/research';
import { bar, btn, h, money } from './dom';

const CAT_NAMES: Record<string, string> = {
  screwdriver: 'Screwdrivers', opening: 'Opening tools', heat: 'Heat', ammeter: 'USB ammeter', diagcomp: 'Diagnostic computer', multimeter: 'Multimeter',
  microscope: 'Microscope', thermal: 'Thermal camera', scale: 'Precision scale', hotair: 'Hot air station', iron: 'Soldering station', ultrasonic: 'Ultrasonic cleaner',
  separator: 'Screen separator', laminator: 'OCA laminator', welder: 'Battery spot welder', programmer: 'Pairing programmer', psu: 'DC power supply',
};

export function renderEquipment(el: HTMLElement) {
  const g = G();
  const cats = [...new Set(TOOLS.map((t) => t.category))];
  el.replaceChildren(
    h('h2', null, 'Equipment'),
    h('p', { class: 'muted small' }, 'Better tools mean fewer stripped screws, fewer cracks, cleaner readings and faster work. Tools wear out; service them before they break.'),
    h('div', { class: 'grid2' }, cats.map((cat) => {
      const owned = g.tools[cat];
      const cond = owned ? toolCondition(cat) : 0;
      return h('div', { class: 'card' },
        h('div', { class: 'head' }, h('h3', null, CAT_NAMES[cat] ?? cat), h('span', { class: 'spacer' }),
          owned ? (owned.broken ? h('span', { class: 'pill bad' }, 'BROKEN') : h('span', { class: 'pill good' }, toolById(owned.id).name)) : h('span', { class: 'pill' }, 'not owned')),
        owned ? h('div', { class: 'row small' }, 'Condition', bar(cond, 100, cond < 30 ? 'bad' : 'good'), btn(`Service ${money(toolById(owned.id).maintenanceCost)}`, () => { maintainTool(cat); changed(); }, 'small', cond > 95 && !owned.broken)) : null,
        h('table', { class: 'tbl small', style: 'margin-top:6px' }, TOOLS.filter((t) => t.category === cat).map((t) => {
          const lockedR = t.research && !g.research.done.includes(t.research) && g.mode !== 'freeplay';
          const lockedS = (t.stage ?? 1) > g.stage && g.mode !== 'freeplay';
          const isOwned = owned?.id === t.id;
          return h('tr', null, h('td', null, h('b', null, `T${t.tier} `), t.name, h('div', { class: 'muted' }, t.desc)),
            h('td', { class: 'num' }, t.price ? money(t.price) : 'free'),
            h('td', null, isOwned ? h('span', { class: 'pill good' }, 'owned')
              : lockedR ? h('span', { class: 'pill' }, `research: ${researchById(t.research!).name}`)
              : lockedS ? h('span', { class: 'pill' }, `stage ${t.stage}`)
              : btn('Buy', () => { buyTool(t.id); changed(); }, 'small primary')));
        })));
    })),
  );
}
