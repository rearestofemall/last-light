import type { GameEventBus } from '../core/events';
import type { Inventory } from '../inventory/Inventory';
import { ITEMS } from '../inventory/items';
import type { Vitals } from '../survival/Survival';
import { h, ICONS, show } from './dom';
import { itemIcon, VITAL_ICONS } from './icons';
import type { Projector } from './types';

interface Toast {
  el: HTMLElement;
  until: number;
}

export interface HudFrame {
  vitals: Vitals;
  warmthTarget: number;
  wet: number;
  sick: boolean;
  /** 0–1 how dark it is around the player after their own light is considered. */
  gloom: number;
  clock: string;
  day: number;
  season: string;
  weather: string;
  tempC: number;
  objective: string | null;
}

const VITAL_ORDER: (keyof Vitals)[] = ['health', 'hunger', 'thirst', 'warmth', 'stamina', 'energy'];
const VITAL_LABEL: Record<keyof Vitals, string> = { health: 'Health', hunger: 'Food', thirst: 'Water', warmth: 'Warmth', stamina: 'Stamina', energy: 'Energy' };

/** In-game overlay: vitals, hotbar, prompts, banners, toasts, world info, vignettes. */
export class HUD {
  readonly el: HTMLElement;
  private prompt: HTMLElement;
  private promptText: HTMLElement;
  private promptAlt: HTMLElement;
  private promptWorld: { x: number; y: number } | null = null;
  private banner: HTMLElement;
  private bannerRegion = h('div', { class: 'banner__region' });
  private bannerName = h('div', { class: 'banner__name' });
  private bannerTimer = 0;
  private location = h('div', { class: 'hud__location' });
  private objective = h('div', { class: 'hud__objective' });
  private toasts = h('div', { class: 'hud__toasts', 'aria-live': 'polite' });
  private hint = h('div', { class: 'hud__hint' });
  private hintTimer = 0;
  private saving: HTMLElement;
  private savingTimer = 0;
  private fps = h('div', { class: 'hud__fps' });
  private info = h('div', { class: 'hud__info' });
  private vitals = h('div', { class: 'hud__vitals' });
  private vitalEls = new Map<keyof Vitals, { el: HTMLElement; ring: HTMLElement; val: HTMLElement }>();
  private status = h('div', { class: 'hud__status' });
  private hotbar = h('div', { class: 'hud__hotbar' });
  private hotbarName = h('div', { class: 'hud__hotbar-name' });
  private hotbarNameTimer = 0;
  private gloom = h('div', { class: 'hud__gloom' });
  private hurt = h('div', { class: 'hud__hurt' });
  private hurtLevel = 0;
  private list: Toast[] = [];
  private time = 0;
  private lastSelected = -1;
  private lastInfo = '';
  buildMode = false;

  constructor(root: HTMLElement, events: GameEventBus) {
    this.promptText = h('span', { class: 'prompt__text' });
    this.promptAlt = h('span', { class: 'prompt__alt' });
    this.prompt = h('div', { class: 'hud__prompt' }, h('kbd', {}, 'E'), this.promptText, this.promptAlt);
    this.banner = h('div', { class: 'hud__banner' }, this.bannerRegion, h('div', { class: 'banner__rule' }), this.bannerName);
    this.saving = h('div', { class: 'hud__saving' }, h('span', { class: 'hud__saving-icon', html: ICONS.save }), h('span', { class: 'hud__saving-text' }, 'Saving'));
    for (const k of VITAL_ORDER) {
      const ring = h('div', { class: 'vital__ring' });
      const val = h('div', { class: 'vital__val' });
      const el = h('div', { class: `vital vital--${k}`, title: VITAL_LABEL[k] }, ring, h('div', { class: 'vital__icon', html: VITAL_ICONS[k] }), val);
      this.vitalEls.set(k, { el, ring, val });
      this.vitals.append(el);
    }
    this.el = h(
      'div',
      { class: 'hud' },
      this.gloom,
      this.hurt,
      h('div', { class: 'hud__topleft' }, this.location, this.objective),
      this.info,
      this.banner,
      this.prompt,
      this.toasts,
      this.hint,
      h('div', { class: 'hud__bottomleft' }, this.status, this.vitals),
      h('div', { class: 'hud__bottom' }, this.hotbarName, this.hotbar),
      this.saving,
      this.fps,
    );
    root.append(this.el);

    events.on('interact:prompt', (p) => {
      if (p) {
        this.promptText.textContent = p.text;
        this.promptAlt.innerHTML = p.alt ? `<kbd>R</kbd>${p.alt}` : '';
        this.promptWorld = { x: p.worldX, y: p.worldY };
      } else this.promptWorld = null;
      this.prompt.classList.toggle('is-visible', p !== null);
    });
    events.on('toast', (t) => {
      if (t.kind === 'hint') {
        if (t.text) this.showHint(t.text, t.duration ?? 6);
        else this.clearHint();
      } else this.toast(t.text, t.kind ?? 'info', t.duration ?? 4);
    });
    events.on('item:gained', (e) => this.toast(`+${e.qty} ${ITEMS[e.id].name}`, 'item', 2.2));
    events.on('player:damaged', (e) => {
      this.hurtLevel = Math.min(1, this.hurtLevel + 0.25 + e.amount / 30);
    });
    events.on('save:status', (s) => {
      this.saving.classList.toggle('is-error', s.state === 'error');
      (this.saving.lastChild as HTMLElement).textContent = s.state === 'saving' ? 'Saving' : s.state === 'saved' ? 'Saved' : s.message ?? 'Save failed';
      this.saving.classList.toggle('is-spinning', s.state === 'saving');
      this.saving.classList.add('is-visible');
      this.savingTimer = s.state === 'saving' ? 30 : 2.2;
    });
  }

  setVisible(v: boolean): void {
    show(this.el, v);
  }

  setLocation(region: string, name: string): void {
    this.location.textContent = name ? `${region} · ${name}` : region;
  }

  showBanner(region: string, name: string): void {
    this.bannerRegion.textContent = region;
    this.bannerName.textContent = name;
    this.banner.classList.remove('is-visible');
    void this.banner.offsetWidth;
    this.banner.classList.add('is-visible');
    this.bannerTimer = 4.5;
  }

  toast(text: string, kind: string, duration: number): void {
    // Merge repeated item pickups into one line.
    if (kind === 'item') {
      const last = this.list[this.list.length - 1];
      const m = /^\+(\d+) (.+)$/.exec(text);
      const lm = last && last.el.dataset.kind === 'item' ? /^\+(\d+) (.+)$/.exec(last.el.textContent ?? '') : null;
      if (m && lm && lm[2] === m[2]) {
        last.el.textContent = `+${Number(lm[1]) + Number(m[1])} ${m[2]}`;
        last.until = this.time + duration;
        return;
      }
    }
    const el = h('div', { class: `toast is-${kind}`, 'data-kind': kind }, text);
    this.toasts.append(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    this.list.push({ el, until: this.time + duration });
    while (this.list.length > 4) this.dismiss(this.list.shift()!);
  }

  private dismiss(t: Toast): void {
    t.el.classList.remove('is-visible');
    setTimeout(() => t.el.remove(), 400);
  }

  showHint(text: string, duration: number): void {
    this.hint.innerHTML = text.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');
    this.hint.classList.add('is-visible');
    this.hintTimer = duration;
  }

  clearHint(): void {
    this.hintTimer = 0;
    this.hint.classList.remove('is-visible');
  }

  renderHotbar(inv: Inventory, selected: number): void {
    const slots: HTMLElement[] = [];
    for (let i = 0; i < 6; i++) {
      const s = inv.slots[i];
      const d = s ? ITEMS[s.id] : null;
      const dur = s && d?.durability ? Math.max(0, (s.dur ?? d.durability) / d.durability) : null;
      slots.push(
        h(
          'div',
          { class: `hotslot ${i === selected ? 'is-selected' : ''}` },
          h('span', { class: 'hotslot__key' }, String(i + 1)),
          s ? h('span', { class: 'hotslot__icon', html: itemIcon(s.id) }) : null,
          s && s.qty > 1 ? h('span', { class: 'hotslot__qty' }, String(s.qty)) : null,
          dur !== null ? h('span', { class: 'hotslot__dur', style: `--d:${dur}` }) : null,
        ),
      );
    }
    this.hotbar.replaceChildren(...slots);
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      const s = inv.slots[selected];
      this.hotbarName.textContent = s ? ITEMS[s.id].name : 'Bare hands';
      this.hotbarName.classList.add('is-visible');
      this.hotbarNameTimer = 1.6;
    }
  }

  setBuildMode(on: boolean): void {
    this.buildMode = on;
    this.hotbar.parentElement!.classList.toggle('is-hidden', on);
  }

  frame(f: HudFrame): void {
    for (const k of VITAL_ORDER) {
      const e = this.vitalEls.get(k)!;
      const v = f.vitals[k];
      e.ring.style.setProperty('--p', `${v}`);
      e.val.textContent = String(Math.round(v));
      const low = k === 'warmth' ? v < 25 : v < 20;
      e.el.classList.toggle('is-low', low);
      e.el.classList.toggle('is-critical', k === 'warmth' ? v < 12 : v < 8);
      if (k === 'warmth') {
        e.el.dataset.trend = f.warmthTarget > v + 3 ? 'up' : f.warmthTarget < v - 3 ? 'down' : '';
        e.el.style.setProperty('--warm', `${v}`);
      }
    }
    const st: string[] = [];
    if (f.wet > 0.35) st.push('Soaked');
    if (f.sick) st.push('Sick');
    if (f.vitals.warmth < 25) st.push(f.vitals.warmth < 12 ? 'Freezing' : 'Cold');
    if (f.vitals.energy < 15) st.push('Exhausted');
    this.status.textContent = st.join(' · ');
    const info = `Day ${f.day} · ${f.clock}|${f.season} · ${f.weather} · ${Math.round(f.tempC)}°C`;
    if (info !== this.lastInfo) {
      this.lastInfo = info;
      const [a, b] = info.split('|');
      this.info.replaceChildren(h('div', { class: 'info__time' }, a), h('div', { class: 'info__wx' }, b));
    }
    this.objective.textContent = f.objective ? f.objective : '';
    this.objective.style.display = f.objective ? '' : 'none';
    this.gloom.style.opacity = String(Math.min(0.85, f.gloom));
  }

  update(dt: number, project: Projector, fps: number | null): void {
    this.time += dt;
    if (this.promptWorld) {
      const p = project(this.promptWorld.x, this.promptWorld.y + 0.9, 0);
      this.prompt.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('is-visible');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.remove('is-visible');
    }
    if (this.savingTimer > 0) {
      this.savingTimer -= dt;
      if (this.savingTimer <= 0) this.saving.classList.remove('is-visible');
    }
    if (this.hotbarNameTimer > 0) {
      this.hotbarNameTimer -= dt;
      if (this.hotbarNameTimer <= 0) this.hotbarName.classList.remove('is-visible');
    }
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.4);
    this.hurt.style.opacity = String(this.hurtLevel);
    while (this.list.length && this.list[0].until < this.time) this.dismiss(this.list.shift()!);
    this.fps.style.display = fps === null ? 'none' : '';
    if (fps !== null) this.fps.textContent = `${Math.round(fps)} fps`;
  }

  reset(): void {
    for (const t of this.list) t.el.remove();
    this.list = [];
    this.clearHint();
    this.banner.classList.remove('is-visible');
    this.prompt.classList.remove('is-visible');
    this.promptWorld = null;
    this.hurtLevel = 0;
    this.lastSelected = -1;
  }
}
