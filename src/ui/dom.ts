import type { GameEventBus } from '../core/events';

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) el.append(c);
  return el;
}

/** Menu button with hover/click sounds. */
export function menuButton(events: GameEventBus, label: string, onClick: () => void, opts: { sub?: string; disabled?: boolean; variant?: string } = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      class: `menu-btn ${opts.variant ?? ''}`,
      disabled: opts.disabled,
      onmouseenter: () => !b.disabled && events.emit('ui:sound', { kind: 'hover' }),
      onclick: () => {
        if (b.disabled) return;
        events.emit('ui:sound', { kind: 'click' });
        onClick();
      },
    },
    h('span', { class: 'menu-btn__mark' }),
    h('span', { class: 'menu-btn__label' }, label),
    opts.sub ? h('span', { class: 'menu-btn__sub' }, opts.sub) : null,
  );
  return b;
}

export function show(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('is-visible', visible);
  el.setAttribute('aria-hidden', String(!visible));
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatPlayTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const hh = Math.floor(m / 60);
  return hh > 0 ? `${hh}h ${m % 60}m` : `${m}m`;
}

export const ICONS = {
  ember: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.1-3.6 2.2-4.8.2 1.6.9 2.6 1.8 3.1C11 7.9 11 4.9 12 2z" fill="currentColor"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="40 14"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
};
