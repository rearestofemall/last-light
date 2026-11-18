/**
 * Business: progression, locations, competitors & market share, branches,
 * franchising, own-brand manufacturing, online (mail-in / contracts) and reviews.
 */
import { CONFIG } from '../CONFIG';
import { LOCATIONS, locationById } from '../data/business';
import { phoneById } from '../data/phones';
import { acceptOffer, acceptOnlineRequest, playerShare } from '../sim/customers';
import { phoneName } from '../sim/phones';
import { G, changed } from '../sim/state';
import { buyCurrentLocation, designPhone, moveTo, netWorth, nextStageInfo, openBranch, playerPriceIndex, produceBatch, setupManufacturing, upgradeBranch } from '../sim/world';
import { bar, btn, h, modal, money, sparkline, stars } from './dom';

export function renderBusiness(el: HTMLElement) {
  const g = G();
  const info = nextStageInfo();
  const stage = CONFIG.progression.stages.find((s) => s.id === g.stage)!;
  const loc = locationById(g.shop.locationId);
  const share = playerShare();
  el.replaceChildren(
    h('h2', null, 'Business'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card hl' },
        h('h3', null, `Stage ${g.stage}: ${stage.name}`),
        h('div', { class: 'kv small' }, h('span', { class: 'k' }, 'Net worth'), h('span', null, money(netWorth())), h('span', { class: 'k' }, 'Reputation'), h('span', null, `${Math.round(g.rep)}/100`), h('span', { class: 'k' }, 'Repairs done'), h('span', null, g.stats.repairs)),
        info ? h('div', null, h('h4', null, `Next: ${info.next.name}`), info.checks.map((c) => h('div', { class: `small ${c.ok ? 'good' : ''}` }, `${c.ok ? '✔' : '○'} ${c.label}`))) : h('p', { class: 'good' }, 'Top of the ladder: an international electronics brand!')),
      h('div', { class: 'card' },
        h('h3', null, 'Market share'),
        h('div', { class: 'row' }, h('b', { style: 'font-size:22px' }, `${Math.round(share * 100)}%`), h('span', { class: 'muted small' }, `your price index ${Math.round(playerPriceIndex() * 100)}%`), h('span', { class: 'spacer' }), sparkline(g.shareHistory, 160, 36)),
        h('table', { class: 'tbl small' },
          h('tr', null, h('td', null, h('b', null, g.shopName)), h('td', null, bar(share * 100)), h('td', { class: 'num' }, `${Math.round(share * 100)}%`), h('td', null, `rep ${Math.round(g.rep)}`)),
          g.competitors.map((c) => h('tr', null, h('td', null, c.name, c.priceWar ? h('span', { class: 'pill bad' }, 'price war') : null), h('td', null, bar(c.share * 100)), h('td', { class: 'num' }, `${Math.round(c.share * 100)}%`),
            h('td', null, `rep ${Math.round(c.rep)} · price ${Math.round(c.priceIndex * 100)}% · ${c.branches} shop${c.branches > 1 ? 's' : ''}`)))))),
    h('h4', null, 'Locations'),
    h('div', { class: 'grid3' }, LOCATIONS.map((l) => h('div', { class: `card ${l.id === loc.id ? 'hl' : ''}` },
      h('div', { class: 'head' }, h('h3', null, l.name), l.id === loc.id ? h('span', { class: 'pill accent' }, g.shop.owned ? 'yours (owned)' : 'current (rented)') : null),
      h('p', { class: 'small' }, l.desc),
      h('div', { class: 'small muted' }, `${l.w}×${l.h} tiles · traffic ×${l.traffic} · rent ${money(l.rentPerDay)}/day · buy ${money(l.buyPrice)} · stage ${l.stage}`),
      h('div', { class: 'row', style: 'margin-top:6px' },
        l.id === loc.id
          ? btn(`Buy this place (${money(l.buyPrice)})`, () => { buyCurrentLocation(); changed(); }, 'small', g.shop.owned)
          : [btn('Rent & move', () => { moveTo(l.id, false); changed(); }, 'small', l.stage > g.stage && g.mode !== 'freeplay'), btn('Buy & move', () => { moveTo(l.id, true); changed(); }, 'small', l.stage > g.stage && g.mode !== 'freeplay')])))),
    h('div', { class: 'grid2', style: 'margin-top:12px' },
      h('div', { class: 'card' },
        h('h3', null, 'Branches & franchises'),
        g.branches.length ? h('table', { class: 'tbl small' }, g.branches.map((b) => h('tr', null, h('td', null, b.name), h('td', null, b.franchise ? 'franchise' : `${b.staff} staff`), h('td', null, `quality ${b.quality}`),
          h('td', null, b.franchise ? '' : btn('Upgrade (Rs 800k)', () => { upgradeBranch(b.id); changed(); }, 'small'))))) : h('p', { class: 'muted small' }, 'No branches yet.'),
        h('div', { class: 'row' },
          btn(`Open branch (${money(CONFIG.lategame.branchOpenCost)})`, () => { openBranch(false); changed(); }, 'small', g.stage < 4 && g.mode !== 'freeplay'),
          btn(`Sell franchise (+${money(CONFIG.lategame.franchiseFee)})`, () => { openBranch(true); changed(); }, 'small', !g.research.done.includes('franchising') && g.mode !== 'freeplay'))),
      h('div', { class: 'card' },
        h('h3', null, 'Own-brand phones'),
        !g.manufacturing.setup
          ? h('div', null, h('p', { class: 'small muted' }, 'Late game: design and manufacture your own phones, sold through your shops.'), btn(`Build factory line (${money(CONFIG.lategame.manufacturingSetup)})`, () => { setupManufacturing(); changed(); }, 'small', !g.research.done.includes('manufacturing') && g.mode !== 'freeplay'))
          : h('div', null,
              g.manufacturing.designs.length ? h('table', { class: 'tbl small' }, g.manufacturing.designs.map((d) => h('tr', null, h('td', null, d.name), h('td', null, d.tier), h('td', null, `Q${d.quality}`), h('td', null, money(d.price)), h('td', null, `stock ${g.manufacturing.stock[d.id] ?? 0}`),
                h('td', null, btn(`Produce ${CONFIG.lategame.unitsPerBatch}`, () => { produceBatch(d.id); changed(); }, 'small'))))) : null,
              h('p', { class: 'small muted' }, `Units sold: ${g.manufacturing.sold}`),
              btn('Design a new phone', designDialog, 'small primary')))),
    h('h4', null, 'Online & business accounts'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h3', null, 'Mail-in requests'),
        !g.research.done.includes('online-repairs') && g.mode !== 'freeplay' ? h('p', { class: 'muted small' }, 'Research Online booking & mail-in to accept repairs by courier.')
          : g.onlineRequests.length ? h('table', { class: 'tbl small' }, g.onlineRequests.map((r) => h('tr', null, h('td', null, r.name), h('td', null, phoneById(r.modelId).name), h('td', null, `"${r.symptom}"`), h('td', null, btn('Accept', () => { acceptOnlineRequest(r.id); changed(); }, 'small primary')))))
          : h('p', { class: 'muted small' }, 'No new requests today.'),
        h('h4', null, 'Repair tracking'),
        h('table', { class: 'tbl small' }, g.jobs.filter((j) => j.mailIn && j.status !== 'done').map((j) => h('tr', null, h('td', null, j.customerName), h('td', null, phoneName(g.phones[j.phoneId])), h('td', null, j.status === 'ready' ? 'Shipped back' : j.assignedTo || g.bench.jobId === j.id ? 'In repair' : 'Received'))))),
      h('div', { class: 'card' }, h('h3', null, 'Business contracts'),
        g.offers.map((o) => h('div', { class: 'row small' }, `${o.company}: ~${o.phones} phones/week at ${money(o.pricePerJob)} for ${o.days} days`, h('span', { class: 'spacer' }), btn('Sign', () => { acceptOffer(o.id); changed(); }, 'small primary'))),
        g.businessAccounts.length ? h('table', { class: 'tbl small' }, g.businessAccounts.map((a) => h('tr', null, h('td', null, a.company), h('td', null, `${a.phonesPerWeek}/wk`), h('td', null, money(a.pricePerJob)), h('td', null, `${a.daysLeft}d left`)))) : h('p', { class: 'muted small' }, 'No active contracts. Offers arrive as your reputation grows.'))),
    h('h4', null, `Reviews (${g.reviews.length})`),
    g.reviews.length ? h('div', { class: 'grid3' }, g.reviews.slice(0, 12).map((r) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', null, r.name), h('span', { class: 'spacer' }), h('span', { class: r.stars >= 4 ? 'good' : r.stars <= 2 ? 'bad' : '' }, stars(r.stars))),
      h('p', { class: 'small' }, r.text), h('div', { class: 'small muted' }, `Day ${r.day}${r.online ? ' · online' : ''}`)))) : h('div', { class: 'empty' }, 'No reviews yet.'),
  );
}

function designDialog() {
  const name = h('input', { type: 'text', value: `${G().shopName} One` }) as HTMLInputElement;
  const tier = h('select', null, ['budget', 'mid', 'flagship'].map((t) => h('option', { value: t }, t))) as HTMLSelectElement;
  const price = h('input', { type: 'number', value: 40000, step: 1000 }) as HTMLInputElement;
  modal('Design a phone', h('div', null, h('label', { class: 'field' }, 'Name', name), h('label', { class: 'field' }, 'Tier', tier), h('label', { class: 'field' }, 'Retail price', price),
    h('p', { class: 'small muted' }, `Unit cost: budget ${money(CONFIG.lategame.unitCost.budget)}, mid ${money(CONFIG.lategame.unitCost.mid)}, flagship ${money(CONFIG.lategame.unitCost.flagship)}.`)),
  [{ label: 'Cancel', onClick: () => {} }, { label: 'Create design', cls: 'primary', onClick: () => { designPhone(name.value, tier.value as any, +price.value); changed(); } }]);
}
