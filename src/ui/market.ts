/**
 * Used-phone marketplace + my devices (refurbish & resell, strip for parts)
 * + live price charts.
 */
import { CONFIG } from '../CONFIG';
import { faultById } from '../data/faults';
import { PHONES, phoneById } from '../data/phones';
import { runTestSuite, visualInspection } from '../repair/diagnostics';
import { advanceMinutes } from '../sim/clock';
import { bargainListing, buyListing, fairPrice, inspectListing, listForSale, partOut, placeBid } from '../sim/market';
import { conditionGrade, phoneName, phoneValue } from '../sim/phones';
import { G, changed, type Listing } from '../sim/state';
import { loadOnBench } from './bench';
import { btn, h, modal, money, sparkline, toast } from './dom';
import { goTab } from './nav';

let sub: 'buy' | 'mine' | 'prices' = 'buy';

export function renderMarket(el: HTMLElement) {
  const g = G();
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    ([['buy', `Buy phones (${g.listings.length})`], ['mine', `My devices (${g.devices.length})`], ['prices', 'Market prices']] as const).map(([id, label]) =>
      h('button', { class: sub === id ? 'on' : '', role: 'tab', onclick: () => { sub = id; renderMarket(el); } }, label)));
  el.replaceChildren(h('h2', null, 'Phone market'), tabs, sub === 'buy' ? buy() : sub === 'mine' ? mine() : prices());
}

function buy() {
  const g = G();
  if (!g.listings.length) return h('div', { class: 'empty' }, 'No phones on offer today. New sellers show up every morning.');
  return h('div', { class: 'grid3' }, g.listings.map((l) => listingCard(l)));
}

function listingCard(l: Listing) {
  const g = G();
  const ids = l.lot ?? [l.phoneId];
  const phones = ids.map((id) => g.phones[id]).filter(Boolean);
  const first = phones[0];
  if (!first) return null;
  const label = l.lot ? `Wholesale lot: ${phones.length} phones` : phoneName(first);
  return h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h3', null, label), h('span', { class: `pill ${l.source === 'auction' ? 'accent' : ''}` }, l.source)),
    h('div', { class: 'small muted' }, `Seller: ${l.sellerName}`),
    h('p', { class: 'small', style: 'margin:6px 0' }, `"${l.description}"`),
    l.inspected
      ? h('div', { class: 'small' }, phones.map((p) => {
          const tests = runTestSuite(p).results;
          const fails = Object.entries(tests).filter(([, v]) => v === 'fail').map(([k]) => k);
          return h('div', { style: 'border-top:1px solid var(--line);padding-top:4px;margin-top:4px' },
            l.lot ? h('b', null, phoneName(p)) : null,
            h('div', null, `Looks: ${visualInspection(p).slice(0, 2).join(' · ')}`),
            h('div', { class: fails.length ? 'warn' : 'good' }, fails.length ? `Quick test fails: ${fails.join(', ')}` : 'Quick test: everything works'),
            p.lock !== 'none' ? h('div', { class: 'bad' }, `🔒 Activation locked (${p.lock}). ${p.stolen ? 'Seller has no box or receipt...' : ''}`) : null,
            !p.pta ? h('div', { class: 'warn' }, 'Not PTA registered (-30% value)') : null,
            h('div', { class: 'muted' }, `Est. value as-is ${money(phoneValue(p))}, fixed ~${money(phoneValue(p, { assumeFixed: true }))}`));
        }))
      : h('p', { class: 'small muted' }, 'Not inspected yet.'),
    l.auction
      ? h('div', { class: 'row', style: 'margin-top:8px' },
          h('span', null, `Bid ${money(l.auction.bid)} `, h('span', { class: `pill ${l.auction.leader === 'you' ? 'good' : 'bad'}` }, l.auction.leader === 'you' ? 'you lead' : 'outbid')),
          h('span', { class: 'small muted' }, `ends day ${l.auction.endsDay} ${l.auction.endsMinute / 60}:00`),
          btn('Inspect', () => { advanceMinutes(CONFIG.market.inspectMinutes); inspectListing(l); changed(); }, 'small', l.inspected),
          btn(`Bid ${money(Math.round(l.auction.bid * 1.08 / 100) * 100)}`, () => { placeBid(l, Math.round(l.auction!.bid * 1.08 / 100) * 100); changed(); }, 'small primary'))
      : h('div', { class: 'row', style: 'margin-top:8px' },
          h('b', null, money(l.ask)),
          h('span', { class: 'spacer' }),
          btn('Inspect', () => { advanceMinutes(CONFIG.market.inspectMinutes * (l.lot?.length ?? 1)); inspectListing(l); changed(); }, 'small', l.inspected),
          btn('Haggle', () => haggle(l), 'small'),
          btn('Buy', () => { buyListing(l, l.ask); changed(); }, 'small primary')));
}

function haggle(l: Listing) {
  const input = h('input', { type: 'number', step: 100, value: Math.round(l.ask * 0.75 / 100) * 100, style: 'width:140px' }) as HTMLInputElement;
  const talk = h('div', { class: 'small' });
  modal(`Haggle with ${l.sellerName}`, h('div', null, h('p', null, `Asking ${money(l.ask)}.`), h('div', { class: 'row' }, 'Your offer ', input), talk),
    [
      { label: 'Walk away', onClick: () => {} },
      { label: 'Offer', cls: 'primary', onClick: () => {
        const offer = +input.value;
        const r = bargainListing(l, offer);
        talk.append(h('p', null, r.text));
        if (r.ok) {
          buyListing(l, offer);
          changed();
          return true;
        }
        if (r.counter) input.value = String(r.counter);
        changed();
        return false;
      } },
    ]);
}

function mine() {
  const g = G();
  if (!g.devices.length) return h('div', { class: 'empty' }, 'You own no phones. Buy broken phones cheap, fix them, and sell them for profit.');
  return h('table', { class: 'tbl' },
    h('tr', null, h('th', null, 'Phone'), h('th', null, 'Grade'), h('th', null, 'Faults known'), h('th', { class: 'num' }, 'Paid + parts'), h('th', { class: 'num' }, 'Value now'), h('th', null, 'Status'), h('th', null, '')),
    g.devices.map((id) => {
      const p = g.phones[id];
      if (!p) return null;
      const known = (p.knownFaults ?? []).map((f) => faultById(f).name);
      const value = phoneValue(p);
      const cost = (p.purchasePrice ?? 0) + (p.repairCost ?? 0);
      return h('tr', null,
        h('td', null, phoneName(p), p.lock !== 'none' ? h('span', { class: 'pill bad' }, 'locked') : null, !p.pta ? h('span', { class: 'pill warn' }, 'non-PTA') : null),
        h('td', null, conditionGrade(p)),
        h('td', { class: 'small' }, known.join(', ') || h('span', { class: 'muted' }, 'run tests on the bench')),
        h('td', { class: 'num' }, money(cost)),
        h('td', { class: `num ${value > cost ? 'good' : 'bad'}` }, money(value)),
        h('td', null, p.forSale ? h('span', { class: 'pill accent' }, `for sale ${money(p.forSale.price)}`) : g.bench.phoneId === id ? h('span', { class: 'pill' }, 'on bench') : '—'),
        h('td', null, h('div', { class: 'row' },
          btn('Bench', () => { loadOnBench(id, null); goTab('bench'); }, 'small'),
          p.forSale ? btn('Unlist', () => { p.forSale = undefined; changed(); }, 'small') : btn('Sell…', () => sellDialog(id), 'small primary', g.bench.phoneId === id),
          btn('Strip for parts', () => { if (g.bench.phoneId === id) return toast('Unload it from the bench first.', 'warn'); partOut(p); changed(); }, 'small danger'))));
    }));
}

function sellDialog(id: string) {
  const g = G();
  const p = g.phones[id];
  const fair = fairPrice(p);
  const input = h('input', { type: 'number', step: 500, value: Math.round(fair / 500) * 500, style: 'width:160px' }) as HTMLInputElement;
  modal(`Sell ${phoneName(p)}`, h('div', null,
    h('p', null, `Grade ${conditionGrade(p)} · fair market price about ${money(fair)}.`),
    h('div', { class: 'row' }, 'Asking price ', input),
    h('p', { class: 'muted small' }, 'Cheaper sells faster. A refurb showcase helps. Hidden faults come back as returns.')),
  [{ label: 'Cancel', onClick: () => {} }, { label: 'List for sale', cls: 'primary', onClick: () => { listForSale(p, +input.value); changed(); } }]);
}

function prices() {
  const g = G();
  const sorted = [...PHONES].sort((a, b) => b.launchPrice - a.launchPrice);
  return h('table', { class: 'tbl' },
    h('tr', null, h('th', null, 'Model'), h('th', null, 'Tier'), h('th', null, 'Year'), h('th', { class: 'num' }, 'Launch'), h('th', { class: 'num' }, 'Used value'), h('th', null, 'Demand'), h('th', null, '60-day trend')),
    sorted.map((m) => {
      const hist = g.priceHistory[m.id] ?? [];
      const d = g.modelDemand[m.id] ?? 1;
      return h('tr', null, h('td', null, m.name), h('td', null, m.tier), h('td', null, m.year), h('td', { class: 'num' }, money(m.launchPrice)), h('td', { class: 'num' }, money(hist[hist.length - 1] ?? 0)),
        h('td', { class: d > 1.05 ? 'good' : d < 0.95 ? 'bad' : '' }, `${Math.round(d * 100)}%`), h('td', null, sparkline(hist)));
    }));
}

export const _phoneById = phoneById;
