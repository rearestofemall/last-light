import type { GameEventBus } from '../core/events';
import { h, menuButton, show } from './dom';

/** Full-screen fades used for sleep, travel and the ending. */
export class Fader {
  readonly el: HTMLElement;
  private text = h('div', { class: 'fader__text' });

  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'fader' }, this.text);
    root.append(this.el);
  }

  /** Fade to black (or white), run `mid`, then fade back in. */
  async run(text: string, mid: () => void | Promise<void>, hold = 900, white = false): Promise<void> {
    this.text.textContent = text;
    this.el.classList.toggle('is-white', white);
    this.el.classList.add('is-visible');
    await wait(650);
    await mid();
    await wait(hold);
    this.el.classList.remove('is-visible');
    await wait(500);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DeathScreen {
  readonly el: HTMLElement;
  private cause = h('p', { class: 'death__cause' });
  private resolve: (() => void) | null = null;

  constructor(root: HTMLElement, events: GameEventBus) {
    this.el = h(
      'div',
      { class: 'overlay death', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'death__panel' },
        h('h2', {}, 'The light goes out'),
        this.cause,
        h('nav', { class: 'menu__list' }, menuButton(events, 'Wake up', () => this.finish(), { variant: 'is-primary' })),
        h('p', { class: 'death__hint' }, 'You’ll wake where you last slept — or at the old campsite. Your pack is still with you.'),
      ),
    );
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(cause: string): Promise<void> {
    this.cause.textContent = `You succumbed to ${cause}.`;
    show(this.el, true);
    return new Promise((r) => (this.resolve = r));
  }

  private finish(): void {
    show(this.el, false);
    this.resolve?.();
    this.resolve = null;
  }
}

/** Epilogue + credits after throwing the breaker. */
export class EndingScreen {
  readonly el: HTMLElement;
  private body = h('div', { class: 'ending__body' });
  private resolve: (() => void) | null = null;

  constructor(root: HTMLElement, events: GameEventBus) {
    this.el = h(
      'div',
      { class: 'overlay ending', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'ending__inner' }, this.body, h('div', { class: 'ending__actions' }, menuButton(events, 'Continue exploring', () => this.finish(), { variant: 'is-primary' }))),
    );
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(text: string, stats: string): Promise<void> {
    this.body.replaceChildren(...text.split(/\n\s*\n/).map((p, i) => h('p', { class: i === 0 ? 'ending__first' : '', style: `animation-delay:${0.6 + i * 1.4}s` }, p.trim())), h('p', { class: 'ending__stats' }, stats));
    show(this.el, true);
    return new Promise((r) => (this.resolve = r));
  }

  private finish(): void {
    show(this.el, false);
    this.resolve?.();
    this.resolve = null;
  }
}
