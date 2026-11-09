import { ITEMS } from '../inventory/items';
import { PIECES } from '../building/pieces';
import { h, show } from './dom';
import { itemIcon } from './icons';

/** Bottom bar shown in build mode: placeable pieces, selection, validity feedback. */
export class BuildBar {
  readonly el: HTMLElement;
  private list = h('div', { class: 'build__list' });
  private status = h('div', { class: 'build__status' });
  onSelect: (id: string) => void = () => {};

  constructor(root: HTMLElement) {
    this.el = h(
      'div',
      { class: 'build' },
      this.status,
      this.list,
      h('div', { class: 'build__help', html: '<kbd>Click</kbd> place · <kbd>X</kbd> demolish mode · <kbd>1</kbd>–<kbd>9</kbd> choose · <kbd>B</kbd> done' }),
    );
    root.append(this.el);
  }

  set visible(v: boolean) {
    show(this.el, v);
  }

  render(available: { id: string; count: number }[], selected: string | null, removeMode: boolean, reason: string): void {
    this.list.replaceChildren(
      ...(available.length
        ? available.map((a, i) =>
            h(
              'button',
              { class: `hotslot ${a.id === selected && !removeMode ? 'is-selected' : ''}`, title: PIECES[a.id].name, onclick: () => this.onSelect(a.id) },
              h('span', { class: 'hotslot__key' }, String(i + 1)),
              h('span', { class: 'hotslot__icon', html: itemIcon(PIECES[a.id].item) }),
              h('span', { class: 'hotslot__qty' }, String(a.count)),
            ),
          )
        : [h('div', { class: 'build__empty' }, 'Nothing to build. Craft floors, walls, fires and furniture first (C).')]),
    );
    if (removeMode) {
      this.status.textContent = 'Demolish mode — click a piece to take it apart (refunds the piece)';
      this.status.className = 'build__status is-remove';
    } else if (selected) {
      this.status.textContent = reason ? reason : `Place ${ITEMS[PIECES[selected].item].name}`;
      this.status.className = `build__status ${reason ? 'is-bad' : 'is-ok'}`;
    } else {
      this.status.textContent = '';
      this.status.className = 'build__status';
    }
  }
}
