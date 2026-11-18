/**
 * Shop floor: live view of staff walking to benches and customers queueing,
 * plus build mode (grid placement of furniture, walls, floor, signage).
 */
import { CONFIG } from '../CONFIG';
import { FURNITURE, furnitureById, locationById } from '../data/business';
import { assignBenches } from '../sim/employees';
import { earn, spend } from '../sim/economy';
import { uid } from '../sim/rng';
import { G, changed, notify } from '../sim/state';
import { btn, h, money } from './dom';

let selDef: string | null = null;
let selPlaced: string | null = null;
let hover: { x: number; y: number } | null = null;

export function renderShop(el: HTMLElement) {
  const g = G();
  const loc = locationById(g.shop.locationId);
  const T = Math.max(CONFIG.shop.tile, Math.min(72, Math.floor(((el.clientWidth || 900) - 340) / loc.w)));
  const canvas = h('canvas', { width: loc.w * T * 2, height: (loc.h + 1) * T * 2, style: `width:${loc.w * T}px;height:${(loc.h + 1) * T}px`, 'aria-label': 'Shop floor' }) as HTMLCanvasElement;
  const side = h('div', { class: 'col' });
  const renderSide = () => {
    const placed = g.shop.furniture.find((f) => f.id === selPlaced);
    side.replaceChildren(
      h('div', { class: 'card' },
        h('h3', null, 'Build mode'),
        h('p', { class: 'small muted' }, 'Pick an item, then click a free tile. Click placed furniture to select it, then move or sell it.'),
        placed ? h('div', { class: 'row' }, h('b', null, furnitureById(placed.defId).name), h('span', { class: 'spacer' }),
          btn(`Sell (+${money(furnitureById(placed.defId).price * CONFIG.shop.sellBackFraction)})`, () => {
            g.shop.furniture = g.shop.furniture.filter((f) => f !== placed);
            earn(furnitureById(placed.defId).price * CONFIG.shop.sellBackFraction, 'furniture');
            selPlaced = null;
            assignBenches();
            renderSide();
            changed();
          }, 'small danger'), btn('Deselect', () => { selPlaced = null; renderSide(); }, 'small')) : null),
      h('div', { class: 'palette' }, FURNITURE.map((f) => {
        const locked = (f.stage ?? 1) > g.stage && g.mode !== 'freeplay';
        return h('button', { class: `item ${selDef === f.id ? 'sel' : ''}`, disabled: locked, title: locked ? `Stage ${f.stage}` : '', onclick: () => { selDef = selDef === f.id ? null : f.id; selPlaced = null; renderSide(); } },
          h('span', { class: 'swatch', style: `background:${f.color}` }),
          h('span', { class: 'spacer', style: 'text-align:left' }, f.name, h('div', { class: 'small muted' }, `${f.w}×${f.h} · ${effectText(f.effect)}`)),
          h('span', { class: 'small mono' }, locked ? `stage ${f.stage}` : money(f.price)));
      })),
      h('div', { class: 'card' }, h('h3', null, 'Appearance'),
        h('label', { class: 'row small' }, 'Walls ', h('input', { type: 'color', value: g.shop.wall, oninput: (e: Event) => (g.shop.wall = (e.target as HTMLInputElement).value) })),
        h('label', { class: 'row small' }, 'Floor ', h('input', { type: 'color', value: g.shop.floor, oninput: (e: Event) => (g.shop.floor = (e.target as HTMLInputElement).value) })),
        h('label', { class: 'row small' }, 'Sign ', h('input', { type: 'color', value: g.shop.signColor, oninput: (e: Event) => (g.shop.signColor = (e.target as HTMLInputElement).value) })),
        h('label', { class: 'row small' }, 'Shop name ', h('input', { type: 'text', value: g.shopName, onchange: (e: Event) => { g.shopName = (e.target as HTMLInputElement).value || g.shopName; changed(); } }))),
    );
  };
  renderSide();

  const tileAt = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / T), y: Math.floor((e.clientY - r.top) / T) - 1 };
  };
  const occupied = (x: number, y: number, w: number, hh: number, ignore?: string) =>
    g.shop.furniture.some((f) => {
      if (f.id === ignore) return false;
      const d = furnitureById(f.defId);
      return x < f.x + d.w && x + w > f.x && y < f.y + d.h && y + hh > f.y;
    });
  canvas.addEventListener('mousemove', (e) => (hover = tileAt(e)));
  canvas.addEventListener('mouseleave', () => (hover = null));
  canvas.addEventListener('click', (e) => {
    const t = tileAt(e);
    if (t.y < 0) return;
    const clicked = g.shop.furniture.find((f) => { const d = furnitureById(f.defId); return t.x >= f.x && t.x < f.x + d.w && t.y >= f.y && t.y < f.y + d.h; });
    if (selPlaced && !clicked) {
      const f = g.shop.furniture.find((x) => x.id === selPlaced)!;
      const d = furnitureById(f.defId);
      if (t.x + d.w > loc.w || t.y + d.h > loc.h || occupied(t.x, t.y, d.w, d.h, f.id)) return notify('Does not fit there.', 'bad');
      f.x = t.x;
      f.y = t.y;
      assignBenches();
      return;
    }
    if (clicked && !selDef) {
      selPlaced = clicked.id;
      renderSide();
      return;
    }
    if (selDef) {
      const d = furnitureById(selDef);
      if (t.x + d.w > loc.w || t.y + d.h > loc.h || occupied(t.x, t.y, d.w, d.h)) return notify('Does not fit there.', 'bad');
      if (!spend(d.price, 'furniture')) return;
      g.shop.furniture.push({ id: uid('f'), defId: d.id, x: t.x, y: t.y });
      assignBenches();
      notify(`Placed ${d.name}.`, 'good');
      changed();
    }
  });

  const ctx = canvas.getContext('2d')!;
  const draw = () => {
    if (!canvas.isConnected) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    // wall strip + sign
    ctx.fillStyle = g.shop.wall;
    ctx.fillRect(0, 0, loc.w * T, T);
    ctx.fillStyle = g.shop.signColor;
    ctx.fillRect(loc.w * T * 0.3, 6, loc.w * T * 0.4, T - 12);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.shopName.toUpperCase(), (loc.w * T) / 2, T / 2 + 5);
    ctx.textAlign = 'left';
    // floor
    for (let y = 0; y < loc.h; y++) for (let x = 0; x < loc.w; x++) {
      ctx.fillStyle = (x + y) % 2 ? g.shop.floor : shade(g.shop.floor, -12);
      ctx.fillRect(x * T, (y + 1) * T, T, T);
    }
    // door
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect((loc.w - 2) * T, (loc.h + 1) * T - 6, T * 1.5, 6);
    // furniture
    for (const f of g.shop.furniture) {
      const d = furnitureById(f.defId);
      ctx.fillStyle = d.color;
      ctx.fillRect(f.x * T + 3, (f.y + 1) * T + 3, d.w * T - 6, d.h * T - 6);
      ctx.strokeStyle = f.id === selPlaced ? '#ff7a2f' : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = f.id === selPlaced ? 3 : 1;
      ctx.strokeRect(f.x * T + 3, (f.y + 1) * T + 3, d.w * T - 6, d.h * T - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.font = '10px sans-serif';
      ctx.fillText(d.name.slice(0, d.w * 7), f.x * T + 6, (f.y + 1) * T + 14);
    }
    const benches = g.shop.furniture.filter((f) => furnitureById(f.defId).kind === 'bench');
    if (benches[0]) {
      ctx.fillStyle = '#ff7a2f';
      ctx.beginPath();
      ctx.arc((benches[0].x + 0.5) * T, (benches[0].y + 2.2) * T, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText('You', (benches[0].x + 0.5) * T - 9, (benches[0].y + 2.2) * T + 22);
    }
    // employees
    for (const e of g.employees) {
      const px = e.x * T;
      const py = (e.y + 1) * T;
      ctx.fillStyle = e.state === 'working' ? '#46c37b' : e.state === 'training' ? '#5aa9e6' : '#e6e8ec';
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(e.name.split(' ')[0], px - 12, py + 20);
      const job = g.jobs.find((j) => j.id === e.jobId);
      if (job && e.state === 'working') {
        ctx.fillStyle = '#2c313a';
        ctx.fillRect(px - 16, py - 18, 32, 4);
        ctx.fillStyle = '#46c37b';
        ctx.fillRect(px - 16, py - 18, 32 * job.progress, 4);
      }
    }
    // customers queue near the counter
    const counter = g.shop.furniture.find((f) => furnitureById(f.defId).kind === 'reception');
    g.customers.forEach((c, i) => {
      const cx = counter ? (counter.x + 0.5 + i * 0.6) * T : (1 + i * 0.6) * T;
      const cy = counter ? (counter.y + 2.4) * T : (loc.h) * T;
      ctx.fillStyle = c.patience / c.maxPatience < 0.3 ? '#ef5b5b' : '#e8b13a';
      ctx.beginPath();
      ctx.arc(cx, Math.min(cy, (loc.h + 0.6) * T), 7, 0, Math.PI * 2);
      ctx.fill();
    });
    // hover ghost
    if (hover && hover.y >= 0 && (selDef || selPlaced)) {
      const d = furnitureById(selDef ?? g.shop.furniture.find((f) => f.id === selPlaced)!.defId);
      ctx.fillStyle = 'rgba(255,122,47,0.35)';
      ctx.fillRect(hover.x * T, (hover.y + 1) * T, d.w * T, d.h * T);
    }
    if (g.effects.loadshedding > 0 && !g.shop.furniture.some((f) => furnitureById(f.defId).effect?.power)) {
      ctx.fillStyle = 'rgba(0,0,20,0.45)';
      ctx.fillRect(0, T, loc.w * T, loc.h * T);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('LOAD-SHEDDING: no power', 10, T + 20);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  el.replaceChildren(
    h('div', { class: 'row' }, h('h2', null, `Shop floor: ${loc.name}`), h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, `${loc.w}×${loc.h} · ${g.shop.owned ? 'owned' : `rent ${money(loc.rentPerDay)}/day`}`)),
    h('div', { class: 'floor-wrap' }, h('div', { class: 'floor' }, canvas), side),
  );
}

function effectText(e?: Record<string, any>) {
  if (!e) return '';
  const p: string[] = [];
  if (e.benchTier) p.push(`bench T${e.benchTier}`);
  if (e.storage) p.push(`+${e.storage} storage`);
  if (e.rep) p.push(`+${e.rep} rep`);
  if (e.patience) p.push(`+${Math.round(e.patience * 100)}% patience`);
  if (e.power) p.push('backup power');
  return p.join(', ') || 'security';
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
