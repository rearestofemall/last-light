/** Tiny DOM helpers: element builder, modal dialogs, toasts, formatting. */
import { CONFIG } from '../CONFIG';

type Attrs = Record<string, any> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'value') (el as any).value = v;
      else if (k === 'checked') (el as any).checked = v;
      else if (k === 'disabled') (el as any).disabled = v;
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const money = (n: number) => `${CONFIG.currency} ${Math.round(n).toLocaleString('en-US')}`;
export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
export const pct = (n: number) => `${Math.round(n)}%`;

export function btn(label: Child, onclick: () => void, cls = '', disabled = false, title = '') {
  return h('button', { class: `btn ${cls}`, onclick: (e: MouseEvent) => { e.stopPropagation(); onclick(); }, disabled, title: title || undefined }, label);
}

// ---------------- Modal ----------------
let modalRoot: HTMLElement | null = null;
let lastFocus: Element | null = null;

export function closeModal() {
  if (modalRoot) {
    modalRoot.remove();
    modalRoot = null;
    (lastFocus as HTMLElement | null)?.focus?.();
  }
}

export function modal(title: string, body: Child, actions: { label: string; onClick: () => void | boolean; cls?: string }[] = [], opts: { wide?: boolean; dismissable?: boolean } = {}) {
  closeModal();
  lastFocus = document.activeElement;
  const dismiss = opts.dismissable !== false;
  const dialog = h(
    'div',
    { class: `modal ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', null, title), dismiss ? h('button', { class: 'icon-btn', 'aria-label': 'Close', title: 'Close (Esc)', onclick: closeModal }, '✕') : null),
    h('div', { class: 'modal-body' }, body),
    actions.length
      ? h(
          'div',
          { class: 'modal-actions' },
          actions.map((a) =>
            h('button', {
              class: `btn ${a.cls ?? ''}`,
              onclick: () => {
                const r = a.onClick();
                if (r !== false) closeModal();
              },
            }, a.label),
          ),
        )
      : null,
  );
  modalRoot = h('div', { class: 'modal-backdrop', onclick: (e: MouseEvent) => { if (e.target === modalRoot && dismiss) closeModal(); } }, dialog);
  document.body.appendChild(modalRoot);
  const focusable = dialog.querySelector<HTMLElement>('input, select, .modal-actions button, button');
  focusable?.focus();
  return dialog;
}

export const modalOpen = () => !!modalRoot;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalRoot && modalRoot.querySelector('.icon-btn')) closeModal();
});

// ---------------- Toasts ----------------
let toastRoot: HTMLElement | null = null;
export function toast(text: string, kind = 'info') {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(toastRoot);
  }
  const t = h('div', { class: `toast ${kind}` }, text);
  toastRoot.prepend(t);
  while (toastRoot.children.length > 5) toastRoot.lastChild!.remove();
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4600);
}

export function bar(value: number, max = 100, cls = '') {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  return h('div', { class: `bar ${cls}` }, h('div', { class: 'bar-fill', style: `width:${p}%` }));
}

export function field(label: string, input: HTMLElement, hint?: string) {
  const id = `f_${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
}

export function sparkline(values: number[], w = 120, hgt = 32, color = 'var(--accent)') {
  const c = h('canvas', { width: w * 2, height: hgt * 2, style: `width:${w}px;height:${hgt}px` }) as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  if (values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * (w * 2 - 4) + 2;
      const y = hgt * 2 - 4 - ((v - min) / span) * (hgt * 2 - 8);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  return c;
}
