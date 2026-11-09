import type { GameEventBus } from '../core/events';
import { h, ICONS, show } from './dom';
import type { Projector } from './types';

interface Toast {
  el: HTMLElement;
  until: number;
}

/** In-game overlay: interaction prompt, location banner, toasts, save indicator, FPS. */
export class HUD {
  readonly el: HTMLElement;
  private prompt: HTMLElement;
  private promptText: HTMLElement;
  private promptWorld: { x: number; y: number } | null = null;
  private banner: HTMLElement;
  private bannerRegion = h('div', { class: 'banner__region' });
  private bannerName = h('div', { class: 'banner__name' });
  private bannerTimer = 0;
  private location = h('div', { class: 'hud__location' });
  private toasts = h('div', { class: 'hud__toasts', 'aria-live': 'polite' });
  private hint = h('div', { class: 'hud__hint' });
  private hintTimer = 0;
  private saving: HTMLElement;
  private savingTimer = 0;
  private fps = h('div', { class: 'hud__fps' });
  private list: Toast[] = [];
  private time = 0;

  constructor(root: HTMLElement, events: GameEventBus) {
    this.promptText = h('span', { class: 'prompt__text' });
    this.prompt = h('div', { class: 'hud__prompt' }, h('kbd', {}, 'E'), this.promptText);
    this.banner = h('div', { class: 'hud__banner' }, this.bannerRegion, h('div', { class: 'banner__rule' }), this.bannerName);
    this.saving = h('div', { class: 'hud__saving' }, h('span', { class: 'hud__saving-icon', html: ICONS.save }), h('span', { class: 'hud__saving-text' }, 'Saving'));
    this.el = h('div', { class: 'hud' }, this.location, this.banner, this.prompt, this.toasts, this.hint, this.saving, this.fps);
    root.append(this.el);

    events.on('interact:prompt', (p) => {
      if (p) {
        this.promptText.textContent = p.text;
        this.promptWorld = { x: p.worldX, y: p.worldY };
      } else this.promptWorld = null;
      this.prompt.classList.toggle('is-visible', p !== null);
    });
    events.on('toast', (t) => (t.kind === 'hint' ? this.showHint(t.text, t.duration ?? 6) : this.toast(t.text, t.kind ?? 'info', t.duration ?? 4)));
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
    void this.banner.offsetWidth; // restart animation
    this.banner.classList.add('is-visible');
    this.bannerTimer = 4.5;
  }

  toast(text: string, kind: string, duration: number): void {
    const el = h('div', { class: `toast is-${kind}` }, text);
    this.toasts.append(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    this.list.push({ el, until: this.time + duration });
    while (this.list.length > 3) this.dismiss(this.list.shift()!);
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
  }
}
