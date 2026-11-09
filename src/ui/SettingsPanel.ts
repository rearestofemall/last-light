import type { GameEventBus } from '../core/events';
import type { GameSettings, QualityLevel, Settings } from '../core/Settings';
import { h, ICONS, menuButton, show } from './dom';

type Section = { title: string; rows: HTMLElement[] };

/** Live-applied settings. Every control writes straight to Settings, which notifies systems. */
export class SettingsPanel {
  readonly el: HTMLElement;
  private body = h('div', { class: 'settings__body' });
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
    private settings: Settings,
  ) {
    this.el = h(
      'div',
      { class: 'overlay settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' },
      h(
        'div',
        { class: 'panel settings__panel' },
        h('header', { class: 'panel__head' }, h('h2', {}, 'Settings'), h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() })),
        this.body,
        h('footer', { class: 'panel__foot' }, menuButton(events, 'Back', () => this.close(), { variant: 'is-compact' })),
      ),
    );
    root.append(this.el);
    settings.onChange(() => this.visible && this.render());
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(): void {
    this.render();
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'open' });
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }

  private render(): void {
    const s = this.settings.get();
    const sections: Section[] = [
      {
        title: 'Graphics',
        rows: [
          this.segmented('Quality', 'Vegetation density, shadow resolution, view distance', s.quality, [
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
          ], (v) => this.settings.set({ quality: v as QualityLevel })),
          this.toggle('Shadows', 'Dynamic sun shadows', 'shadows', s),
          this.slider('Render scale', 'Lower for better performance', s.renderScale, 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => this.settings.set({ renderScale: v })),
          this.toggle('Adaptive resolution', 'Lowers resolution on slow hardware to keep the game smooth', 'adaptiveResolution', s),
        ],
      },
      {
        title: 'Audio',
        rows: [
          this.volume('Master', 'masterVolume', s),
          this.volume('Music', 'musicVolume', s),
          this.volume('Effects', 'sfxVolume', s),
          this.volume('Ambience', 'ambienceVolume', s),
          this.toggle('Mute all', '', 'muted', s),
        ],
      },
      {
        title: 'Interface',
        rows: [this.toggle('Tutorial hints', 'Show control hints while playing', 'showHints', s), this.toggle('Show FPS', '', 'showFps', s)],
      },
    ];
    this.body.replaceChildren(...sections.map((sec) => h('section', { class: 'settings__section' }, h('h3', {}, sec.title), ...sec.rows)));
  }

  private row(label: string, hint: string, control: HTMLElement): HTMLElement {
    return h('div', { class: 'setting' }, h('div', { class: 'setting__label' }, h('span', {}, label), hint ? h('small', {}, hint) : null), control);
  }

  private segmented(label: string, hint: string, value: string, opts: [string, string][], set: (v: string) => void): HTMLElement {
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
    for (const [v, text] of opts) {
      group.append(
        h('button', {
          class: v === value ? 'is-active' : '',
          role: 'radio',
          'aria-checked': String(v === value),
          onclick: () => {
            this.events.emit('ui:sound', { kind: 'click' });
            set(v);
          },
        }, text),
      );
    }
    return this.row(label, hint, group);
  }

  private toggle(label: string, hint: string, key: keyof GameSettings, s: GameSettings): HTMLElement {
    const on = Boolean(s[key]);
    const btn = h('button', {
      class: `toggle ${on ? 'is-on' : ''}`,
      role: 'switch',
      'aria-checked': String(on),
      'aria-label': label,
      onclick: () => {
        this.events.emit('ui:sound', { kind: 'click' });
        this.settings.set({ [key]: !on } as Partial<GameSettings>);
      },
    }, h('span', { class: 'toggle__knob' }));
    return this.row(label, hint, btn);
  }

  private slider(label: string, hint: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, set: (v: number) => void): HTMLElement {
    const out = h('output', {}, fmt(value));
    const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label }) as HTMLInputElement;
    const paint = () => input.style.setProperty('--fill', `${((Number(input.value) - min) / (max - min)) * 100}%`);
    paint();
    input.addEventListener('input', () => {
      out.textContent = fmt(Number(input.value));
      paint();
    });
    input.addEventListener('change', () => set(Number(input.value)));
    return this.row(label, hint, h('div', { class: 'slider' }, input, out));
  }

  private volume(label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambienceVolume', s: GameSettings): HTMLElement {
    return this.slider(label, '', s[key], 0, 1, 0.05, (v) => `${Math.round(v * 100)}`, (v) => this.settings.set({ [key]: v }));
  }
}
