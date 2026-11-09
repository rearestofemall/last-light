import { h, show } from './dom';

export class LoadingScreen {
  readonly el: HTMLElement;
  private status: HTMLElement;
  private bar: HTMLElement;

  constructor(root: HTMLElement) {
    this.status = h('div', { class: 'loading__status' }, 'Kindling…');
    this.bar = h('div', { class: 'loading__fill' });
    this.el = h(
      'div',
      { class: 'screen loading is-visible' },
      h('div', { class: 'loading__title' }, 'THE LAST LIGHT'),
      h('div', { class: 'loading__bar' }, this.bar),
      this.status,
    );
    root.append(this.el);
  }

  progress(f: number, text: string): void {
    this.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
    this.status.textContent = text;
  }

  hide(): void {
    show(this.el, false);
    setTimeout(() => this.el.remove(), 900);
  }

  error(message: string): void {
    this.status.textContent = message;
    this.el.classList.add('is-error');
  }
}
