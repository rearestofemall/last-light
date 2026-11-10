import type { GameEventBus } from '../core/events';
import { formatPlayTime, h, ICONS, menuButton, show, timeAgo } from './dom';
import { DEFAULT_FREE_PLAY, FREE_SPAWNS, type GameMode, PACE, type Pace, STORY_MODE } from '../gameplay/GameMode';
import type { RegionId } from '../world/WorldDef';
import type { GameApi, SaveSummary } from './types';

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
      h('footer', { class: 'menu__footer' }, 'v1.0'),
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
    this.summary = summary;
    const items: HTMLElement[] = [];
    if (summary) {
      const where = summary.location || summary.region || 'The wilderness';
      const mode = summary.freePlay ? 'Free Play · ' : '';
      items.push(menuButton(this.events, 'Continue', () => void this.api.continueGame(), { sub: `${mode}Day ${summary.day} · ${where} · ${formatPlayTime(summary.playTime)} · ${timeAgo(summary.savedAt)}`, variant: 'is-primary' }));
    }
    items.push(
      menuButton(this.events, 'New Game', () => this.showModes(), { variant: summary ? '' : 'is-primary' }),
      menuButton(this.events, 'Settings', () => this.actions.openSettings()),
      menuButton(this.events, 'Controls', () => this.actions.openControls()),
    );
    this.el.classList.remove('is-options');
    this.list.replaceChildren(...items);
    this.notice.textContent = !this.api.persistentSaves
      ? 'Saving is unavailable in this browser mode — progress will be lost when you close the tab.'
      : (problem ?? '');
  }

  private summary: SaveSummary | null = null;
  private free: GameMode = { ...DEFAULT_FREE_PLAY };

  /** Starting over replaces the single save slot: ask first. */
  private async start(mode: GameMode): Promise<void> {
    if (this.summary) {
      const ok = await this.actions.confirm('Start a new journey?', 'Your current save will be overwritten.', 'Start New Game');
      if (!ok) return;
    }
    void this.api.newGame(mode);
  }

  private showModes(): void {
    this.el.classList.remove('is-options');
    this.list.replaceChildren(
      menuButton(this.events, 'Story', () => void this.start({ ...STORY_MODE }), { sub: 'Follow J. across the four regions and learn why the lights went out.', variant: 'is-primary' }),
      menuButton(this.events, 'Free Play', () => this.showFreePlay(), { sub: 'The whole world open from the start. No objectives — survive, explore and build your way.' }),
      menuButton(this.events, 'Back', () => void this.refresh()),
    );
  }

  private showFreePlay(): void {
    this.el.classList.add('is-options');
    const m = this.free;
    const choice = <K extends 'region' | 'pace'>(label: string, key: K, options: [GameMode[K], string][]) => {
      const row = h('div', { class: 'menu-opt' }, h('span', { class: 'menu-opt__label' }, label));
      const group = h('div', { class: 'menu-opt__choices', role: 'radiogroup', 'aria-label': label });
      for (const [value, text] of options) {
        const b = h('button', { class: `menu-opt__choice ${m[key] === value ? 'is-on' : ''}`, role: 'radio', 'aria-checked': String(m[key] === value) }, text);
        b.onclick = () => {
          m[key] = value;
          this.events.emit('ui:sound', { kind: 'click' });
          this.showFreePlay();
        };
        group.append(b);
      }
      row.append(group);
      return row;
    };
    const toggle = (label: string, hint: string, key: 'starterKit' | 'allRecipes' | 'peaceful') => {
      const b = h(
        'button',
        { class: `menu-opt menu-opt--toggle ${m[key] ? 'is-on' : ''}`, role: 'switch', 'aria-checked': String(m[key]) },
        h('span', { class: 'menu-opt__label' }, label),
        h('span', { class: 'menu-opt__hint' }, hint),
        h('span', { class: 'menu-opt__switch' }),
      );
      b.onclick = () => {
        m[key] = !m[key];
        this.events.emit('ui:sound', { kind: 'click' });
        this.showFreePlay();
      };
      return b;
    };
    this.list.replaceChildren(
      h('h2', { class: 'menu-opt__title' }, 'Free Play'),
      choice('Start in', 'region', (Object.keys(FREE_SPAWNS) as RegionId[]).map((r) => [r, FREE_SPAWNS[r].label.replace('The ', '')])),
      choice('Survival pace', 'pace', (Object.keys(PACE) as Pace[]).map((p) => [p, PACE[p].label])),
      toggle('Starter kit', 'Axe, knife, torches, food, water, a campfire and a bedroll', 'starterKit'),
      toggle('All recipes known', 'Craft anything from the start', 'allRecipes'),
      toggle('Peaceful', 'No wolves', 'peaceful'),
      menuButton(this.events, 'Begin', () => void this.start({ ...m, kind: 'free' }), { variant: 'is-primary' }),
      menuButton(this.events, 'Back', () => this.showModes()),
    );
  }
}
