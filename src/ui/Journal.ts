import type { GameEventBus } from '../core/events';
import { NOTES } from '../story/notes';
import { MAIN_QUEST, type Quests } from '../story/Quests';
import type { StoryState } from '../story/StoryState';
import { LOCATIONS } from '../world/WorldDef';
import { h, ICONS, show } from './dom';

type Tab = 'quest' | 'docs' | 'found';

/** Objectives, collected documents and discoveries. Documents can be re-read. */
export class Journal {
  readonly el: HTMLElement;
  private tabs = h('div', { class: 'bp__tabs' });
  private body = h('div', { class: 'journal__body' });
  private tab: Tab = 'quest';
  private story: StoryState | null = null;
  private quests: Quests | null = null;
  onClose: () => void = () => {};

  constructor(
    root: HTMLElement,
    private events: GameEventBus,
  ) {
    this.el = h(
      'div',
      { class: 'overlay journal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Journal' },
      h('div', { class: 'panel journal__panel' }, h('header', { class: 'panel__head' }, this.tabs, h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.close, onclick: () => this.close() })), this.body),
    );
    root.append(this.el);
  }

  get visible(): boolean {
    return this.el.classList.contains('is-visible');
  }

  open(story: StoryState, quests: Quests, stats: string): void {
    this.story = story;
    this.quests = quests;
    this.stats = stats;
    this.render();
    show(this.el, true);
    this.events.emit('ui:sound', { kind: 'page' });
  }

  private stats = '';

  close(): void {
    if (!this.visible) return;
    show(this.el, false);
    this.events.emit('ui:sound', { kind: 'close' });
    this.onClose();
  }

  private render(): void {
    const s = this.story!;
    const tab = (id: Tab, label: string) =>
      h('button', { class: `bp__tab ${this.tab === id ? 'is-active' : ''}`, onclick: () => {
        this.tab = id;
        this.events.emit('ui:sound', { kind: 'click' });
        this.render();
      } }, label);
    this.tabs.replaceChildren(tab('quest', 'Journey'), tab('docs', 'Documents'), tab('found', 'Discoveries'));
    if (this.tab === 'quest') {
      const q = this.quests!;
      const cur = q.current;
      const items = MAIN_QUEST.map((st, i) => {
        const done = q.completed.includes(st) || (q.finished && i < MAIN_QUEST.length);
        const active = st === cur;
        if (!done && !active) return null;
        return h('li', { class: `quest ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}` }, st.text);
      });
      this.body.replaceChildren(
        h('p', { class: 'journal__lead' }, cur ? 'Current objective' : 'The Quiet is over.'),
        h('ol', { class: 'quest-list' }, ...items),
        h('p', { class: 'journal__stats' }, this.stats),
      );
      return;
    }
    if (this.tab === 'docs') {
      const docs = Object.values(NOTES).filter((n) => s.readNotes.has(n.id) && (n.kind === 'note' || n.kind === 'sign') && n.id !== 'epilogue');
      this.body.replaceChildren(
        docs.length
          ? h('div', { class: 'doc-list' }, ...docs.map((n) => h('button', { class: `doc ${n.main ? 'is-main' : ''}`, onclick: () => s.openNote(n.id) }, h('span', { class: 'doc__title' }, n.title), h('span', { class: 'doc__kind' }, n.main ? 'Main story' : n.kind === 'sign' ? 'Sign' : 'Found document'))))
          : h('p', { class: 'journal__empty' }, 'Nothing collected yet. Read notes, signs and journals you find in the world.'),
      );
      return;
    }
    const finds = Object.values(NOTES).filter((n) => s.readNotes.has(n.id) && (n.kind === 'photo' || n.kind === 'radio'));
    const totalFinds = Object.values(NOTES).filter((n) => n.kind === 'photo' || n.kind === 'radio').length;
    const places = LOCATIONS.filter((l) => s.locations.has(l.id));
    this.body.replaceChildren(
      h('h3', { class: 'journal__h' }, `Photographs & transmissions (${finds.length}/${totalFinds})`),
      h('div', { class: 'doc-list' }, ...finds.map((n) => h('button', { class: 'doc', onclick: () => s.openNote(n.id) }, h('span', { class: 'doc__title' }, n.title), h('span', { class: 'doc__kind' }, n.kind === 'photo' ? 'Photograph' : 'Radio')))),
      h('h3', { class: 'journal__h' }, `Places (${places.length}/${LOCATIONS.length})`),
      h('div', { class: 'place-list' }, ...places.map((l) => h('span', { class: 'place' }, l.name))),
    );
  }
}
