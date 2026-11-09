import type { GameEventBus } from '../core/events';
import { formatPlayTime, h, ICONS, menuButton, show, timeAgo } from './dom';
import type { GameApi } from './types';

export class MainMenu {
  readonly el: HTMLElement;
  private list = h('nav', { class: 'menu__list' });
  private notice = h('p', { class: 'menu__notice' });

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
    private api: GameApi,
    private actions: { openSettings(): void; openControls(): void; confirm(title: string, body: string, ok: string): Promise<boolean> },
  ) {
    this.el = h(
      'div',
      { class: 'screen menu' },
      h('div', { class: 'menu__shade' }),
      h(
        'div',
        { class: 'menu__column' },
        h(
          'header',
          { class: 'menu__title' },
          h('div', { class: 'menu__ember', html: ICONS.ember }),
          h('h1', {}, 'The Last Light'),
          h('p', { class: 'menu__tagline' }, 'When the world went quiet, only fire remembered how to shine.'),
        ),
        this.list,
        this.notice,
      ),
      h('footer', { class: 'menu__footer' }, 'v0.1 — Milestone 1 · Verdant Woods'),
    );
    root.append(this.el);
  }

  async open(): Promise<void> {
    await this.refresh();
    show(this.el, true);
  }

  close(): void {
    show(this.el, false);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  async refresh(): Promise<void> {
    const { summary, problem } = await this.api.getSaveSummary();
    const items: HTMLElement[] = [];
    if (summary) {
      const where = summary.location || summary.region || 'The wilderness';
      items.push(menuButton(this.events, 'Continue', () => void this.api.continueGame(), { sub: `${where} · ${formatPlayTime(summary.playTime)} · ${timeAgo(summary.savedAt)}`, variant: 'is-primary' }));
    }
    items.push(
      menuButton(this.events, 'New Game', async () => {
        if (summary) {
          const ok = await this.actions.confirm('Start a new journey?', 'Your current save will be overwritten.', 'Start New Game');
          if (!ok) return;
        }
        void this.api.newGame();
      }, { variant: summary ? '' : 'is-primary' }),
      menuButton(this.events, 'Settings', () => this.actions.openSettings()),
      menuButton(this.events, 'Controls', () => this.actions.openControls()),
    );
    this.list.replaceChildren(...items);
    this.notice.textContent = !this.api.persistentSaves
      ? 'Saving is unavailable in this browser mode — progress will be lost when you close the tab.'
      : (problem ?? '');
  }
}
