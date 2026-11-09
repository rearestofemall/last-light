import type { GameEventBus } from '../core/events';
import { h, ICONS, menuButton, show } from './dom';

const CONTROLS: [string, string[]][] = [
  ['Move', ['A', 'D']],
  ['Sprint', ['Shift']],
  ['Jump / swim up', ['Space']],
  ['Drop through platform', ['S', '+', 'Space']],
  ['Interact · gather · read', ['E']],
  ['Secondary action (fill, put out)', ['R']],
  ['Use held item · attack · eat', ['F', '/', 'Click']],
  ['Select hotbar slot', ['1', '–', '6']],
  ['Backpack', ['Tab']],
  ['Crafting', ['C']],
  ['Build mode', ['B']],
  ['Demolish (in build mode)', ['X']],
  ['Map', ['M']],
  ['Journal', ['J']],
  ['Zoom camera', ['Mouse wheel']],
  ['Pause', ['Esc']],
];

export class ControlsPanel {
  readonly el: HTMLElement;
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
  ) {
    const rows = CONTROLS.map(([label, keys]) =>
      h('div', { class: 'control-row' }, h('span', {}, label), h('span', { class: 'keys' }, ...keys.map((k) => (k === '+' || k === '/' || k === '–' ? h('i', {}, k) : h('kbd', {}, k))))),
    );
    this.el = h(
      'div',
      { class: 'overlay controls', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Controls' },
      h(
        'div',
        { class: 'panel controls__panel' },
        h('header', { class: 'panel__head' }, h('h2', {}, 'Controls'), h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() })),
        h('div', { class: 'controls__body' }, ...rows, h('p', { class: 'controls__note' }, 'Arrow keys also work for movement and jumping.')),
        h('footer', { class: 'panel__foot' }, menuButton(events, 'Back', () => this.close(), { variant: 'is-compact' })),
      ),
    );
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(): void {
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'open' });
  }

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }
}
