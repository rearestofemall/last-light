import type { GameEventBus } from '../core/events';
import { h, ICONS, show } from './dom';

/** Paper-styled reader for journals, letters and signs. */
export class NoteReader {
  readonly el: HTMLElement;
  private title = h('h2', { class: 'note__title' });
  private body = h('div', { class: 'note__body' });
  private paper: HTMLElement;
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
  ) {
    this.paper = h(
      'article',
      { class: 'note__paper' },
      h('button', { class: 'icon-btn note__close', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() }),
      this.title,
      this.body,
      h('footer', { class: 'note__hint' }, h('kbd', {}, 'E'), ' or ', h('kbd', {}, 'Esc'), ' to close'),
    );
    this.el = h('div', { class: 'overlay note', role: 'dialog', 'aria-modal': 'true', onclick: (e: Event) => e.target === this.el && this.close() }, this.paper);
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(title: string, body: string, kind: 'note' | 'sign'): void {
    this.title.textContent = title;
    this.body.replaceChildren(...body.split(/\n\s*\n/).map((p) => h('p', {}, p.trim())));
    this.paper.classList.toggle('is-sign', kind === 'sign');
    this.paper.scrollTop = 0;
    show(this.el, true);
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }
}
