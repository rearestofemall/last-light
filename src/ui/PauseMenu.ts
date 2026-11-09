import type { GameEventBus } from '../core/events';
import { h, menuButton, show } from './dom';
import type { GameApi } from './types';

export class PauseMenu {
  readonly el: HTMLElement;
  private saveBtn: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    events: GameEventBus,
    private api: GameApi,
    actions: { openSettings(): void; openControls(): void; confirm(title: string, body: string, ok: string): Promise<boolean> },
  ) {
    this.saveBtn = menuButton(events, 'Save Game', async () => {
      this.saveBtn.disabled = true;
      await this.api.saveGame();
      this.saveBtn.disabled = false;
    });
    this.el = h(
      'div',
      { class: 'overlay pause' },
      h(
        'div',
        { class: 'pause__panel' },
        h('h2', { class: 'pause__title' }, 'Paused'),
        h(
          'nav',
          { class: 'menu__list' },
          menuButton(events, 'Resume', () => this.api.resume(), { variant: 'is-primary' }),
          this.saveBtn,
          menuButton(events, 'Settings', () => actions.openSettings()),
          menuButton(events, 'Controls', () => actions.openControls()),
          menuButton(events, 'Quit to Main Menu', async () => {
            const ok = await actions.confirm('Return to the main menu?', 'Your progress will be saved first.', 'Save & Quit');
            if (ok) await this.api.quitToMenu();
          }),
        ),
      ),
    );
    root.append(this.el);
  }

  set(visible: boolean): void {
    show(this.el, visible);
  }
}
