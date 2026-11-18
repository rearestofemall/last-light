/**
 * Finance: profit & loss chart (daily / weekly / monthly), category
 * breakdown, loans, insurance and repair pricing.
 */
import { CONFIG } from '../CONFIG';
import { SERVICES } from '../data/research';
import { CAT_NAMES, ledgerSeries, repayLoan, takeLoan } from '../sim/economy';
import { G, changed } from '../sim/state';
import { btn, h, money } from './dom';

let period: 'daily' | 'weekly' | 'monthly' = 'daily';
const INCOME_COLOR = '#3987e5';
const EXPENSE_COLOR = '#d95f87';

interface Bucket { label: string; income: number; expense: number; cats: Record<string, number> }

function buckets(): Bucket[] {
  const size = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const count = period === 'daily' ? 30 : 12;
  const series = ledgerSeries(size * count);
  const out: Bucket[] = [];
  for (let i = 0; i < series.length; i += size) {
    const chunk = series.slice(i, i + size);
    const b: Bucket = { label: period === 'daily' ? `D${chunk[0].day}` : `${period === 'weekly' ? 'W' : 'M'}${Math.ceil(chunk[0].day / size)}`, income: 0, expense: 0, cats: {} };
    for (const d of chunk) {
      b.income += d.income;
      b.expense += d.expense;
      for (const [k, v] of Object.entries(d.cats)) b.cats[k] = (b.cats[k] ?? 0) + v;
    }
    out.push(b);
  }
  return out;
}

function chart(data: Bucket[]) {
  const wrap = h('div', { style: 'position:relative' });
  const c = h('canvas', { class: 'chart', role: 'img', 'aria-label': 'Income and expenses bar chart' }) as HTMLCanvasElement;
  const tip = h('div', { class: 'tip', style: 'display:none' });
  wrap.append(c, tip);
  const draw = () => {
    const W = c.clientWidth || 800;
    const H = 220;
    c.width = W * 2;
    c.height = H * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    const pad = { l: 64, r: 8, t: 8, b: 22 };
    const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
    const ih = H - pad.t - pad.b;
    // recessive grid
    ctx.strokeStyle = '#2a2f37';
    ctx.fillStyle = '#8b93a1';
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih - (ih * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(W - pad.r, y);
      ctx.stroke();
      const v = (max * i) / 4;
      ctx.fillText(v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)), 8, y + 4);
    }
    const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
    const bw = Math.max(2, Math.min(14, slot / 2 - 3));
    data.forEach((d, i) => {
      const x = pad.l + i * slot + slot / 2;
      const bars: [number, string, number][] = [[d.income, INCOME_COLOR, x - bw - 1], [d.expense, EXPENSE_COLOR, x + 1]];
      for (const [v, col, bx] of bars) {
        const bh = (v / max) * ih;
        if (bh <= 0) continue;
        ctx.fillStyle = col;
        ctx.beginPath();
        (ctx as any).roundRect ? (ctx as any).roundRect(bx, pad.t + ih - bh, bw, bh, [4, 4, 0, 0]) : ctx.rect(bx, pad.t + ih - bh, bw, bh);
        ctx.fill();
      }
      if (data.length <= 12 || i % 5 === 0) {
        ctx.fillStyle = '#8b93a1';
        ctx.fillText(d.label, x - 10, H - 6);
      }
    });
    c.onmousemove = (e) => {
      const r = c.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left - pad.l) / slot);
      const d = data[i];
      if (!d) return (tip.style.display = 'none');
      tip.replaceChildren(h('b', null, d.label), h('div', null, `Income ${money(d.income)}`), h('div', null, `Expenses ${money(d.expense)}`), h('div', null, `Profit ${money(d.income - d.expense)}`));
      tip.style.display = 'block';
      tip.style.left = `${Math.min(e.clientX - r.left + 12, W - 180)}px`;
      tip.style.top = `${e.clientY - r.top}px`;
    };
    c.onmouseleave = () => (tip.style.display = 'none');
  };
  requestAnimationFrame(draw);
  return wrap;
}

export function renderFinance(el: HTMLElement) {
  const g = G();
  const data = buckets();
  const totals: Record<string, number> = {};
  for (const b of data) for (const [k, v] of Object.entries(b.cats)) totals[k] = (totals[k] ?? 0) + v;
  const inc = data.reduce((a, b) => a + b.income, 0);
  const exp = data.reduce((a, b) => a + b.expense, 0);
  const legendDot = (c: string) => h('span', { style: `display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:4px` });
  el.replaceChildren(
    h('h2', null, 'Finance'),
    h('div', { class: 'grid3' },
      h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Cash'), h('div', { style: 'font-size:22px;font-weight:600' }, money(g.cash))),
      h('div', { class: 'card' }, h('div', { class: 'muted small' }, `Income (${period}, shown)`), h('div', { style: 'font-size:22px;font-weight:600' }, money(inc))),
      h('div', { class: 'card' }, h('div', { class: 'muted small' }, 'Profit (shown)'), h('div', { style: 'font-size:22px;font-weight:600', class: inc - exp >= 0 ? 'good' : 'bad' }, money(inc - exp)))),
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'row' }, h('h3', { style: 'margin:0' }, 'Profit & loss'), h('span', { class: 'small' }, legendDot(INCOME_COLOR), 'Income  ', legendDot(EXPENSE_COLOR), 'Expenses'), h('span', { class: 'spacer' }),
        (['daily', 'weekly', 'monthly'] as const).map((p) => btn(p, () => { period = p; renderFinance(el); }, `small ${period === p ? 'active' : ''}`))),
      chart(data)),
    h('div', { class: 'grid2', style: 'margin-top:12px' },
      h('div', { class: 'card' }, h('h3', null, 'Where the money comes from / goes'),
        h('table', { class: 'tbl small' }, Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('tr', null, h('td', null, CAT_NAMES[k] ?? k), h('td', { class: `num ${v >= 0 ? 'good' : 'bad'}` }, money(v)))))),
      h('div', { class: 'card' }, h('h3', null, 'Loans'),
        g.loans.length ? h('table', { class: 'tbl small' }, g.loans.map((l) => h('tr', null, h('td', null, money(l.remaining)), h('td', null, `${(l.rate * 100).toFixed(2)}%/day`), h('td', null, `${l.daysLeft} days`), h('td', null, btn('Repay', () => { repayLoan(l.id); changed(); }, 'small'))))) : h('p', { class: 'muted small' }, 'No loans.'),
        h('div', { class: 'row' }, CONFIG.economy.loanOptions.map((o, i) => btn(`Borrow ${money(o.amount)} (${o.days}d)`, () => { takeLoan(i); changed(); }, 'small'))),
        h('h3', { style: 'margin-top:12px' }, 'Insurance'),
        h('div', { class: 'col' }, CONFIG.economy.insurancePlans.map((p) => h('label', { class: 'row small' },
          h('input', { type: 'radio', name: 'ins', checked: g.insurance === p.id, onchange: () => { g.insurance = p.id; changed(); } }),
          `${p.name}: ${money(p.daily)}/day, covers ${Math.round(p.theft * 100)}% theft / damage`))))),
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('h3', null, 'Repair pricing'),
      h('p', { class: 'muted small' }, 'Higher prices = more profit per job but fewer customers and lower market share. Warranty length affects reviews and claims.'),
      h('div', { class: 'row' },
        h('label', { class: 'row small' }, 'Global markup ', rangeInput(g.pricing.global, 0.6, 2, (v) => (g.pricing.global = v))),
        h('label', { class: 'row small' }, 'Warranty days ', h('input', { type: 'number', min: 0, max: 180, value: g.policy.warrantyDays, style: 'width:70px', onchange: (e: Event) => { g.policy.warrantyDays = +(e.target as HTMLInputElement).value; changed(); } }))),
      h('h4', null, 'By phone tier'),
      h('div', { class: 'row' }, Object.keys(g.pricing.tiers).map((t) => h('label', { class: 'row small' }, `${t} `, rangeInput(g.pricing.tiers[t], 0.6, 2, (v) => (g.pricing.tiers[t] = v))))),
      h('h4', null, 'By service'),
      h('div', { class: 'grid3' }, SERVICES.map((s) => h('label', { class: 'row small' }, h('span', { style: 'min-width:150px' }, s.name), rangeInput(g.pricing.services[s.id] ?? 1, 0.5, 2.5, (v) => (g.pricing.services[s.id] = v)))))),
  );
}

function rangeInput(value: number, min: number, max: number, set: (v: number) => void) {
  const out = h('span', { class: 'mono' }, `${Math.round(value * 100)}%`);
  const r = h('input', { type: 'range', min, max, step: 0.05, value, oninput: (e: Event) => { const v = +(e.target as HTMLInputElement).value; set(v); out.textContent = `${Math.round(v * 100)}%`; } });
  return h('span', { class: 'row' }, r, out);
}
