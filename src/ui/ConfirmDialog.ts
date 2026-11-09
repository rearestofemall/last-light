import type { GameEventBus } from '../core/events';
import { h, menuButton, show } from './dom';

/** Modal yes/no prompt. Resolves to the player's choice. */
export class ConfirmDialog {
  readonly el: HTMLElement;
  private title = h('h3', { class: 'dialog__title' });
  private body = h('p', { class: 'dialog__body' });
  private actions = h('div', { class: 'dialog__actions' });
  private resolve: ((v: boolean) => void) | null = null;

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
  ) {
    this.el = h('div', { class: 'overlay dialog', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'panel dialog__panel' }, this.title, this.body, this.actions));
    root.append(this.el);
  }

  get open(): boolean {
    return this.resolve !== null;
  }

  ask(title: string, body: string, confirm: string, cancel = 'Cancel'): Promise<boolean> {
    this.title.textContent = title;
    this.body.textContent = body;
    this.actions.replaceChildren(
      menuButton(this.events, cancel, () => this.finish(false), { variant: 'is-compact' }),
      menuButton(this.events, confirm, () => this.finish(true), { variant: 'is-compact is-primary' }),
    );
    show(this.el, true);
    return new Promise((r) => (this.resolve = r));
  }

  /** Esc → cancel. */
  cancel(): void {
    this.finish(false);
  }

  private finish(v: boolean): void {
    show(this.el, false);
    const r = this.resolve;
    this.resolve = null;
    r?.(v);
  }
}
