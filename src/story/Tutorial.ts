import type { GameEventBus } from '../core/events';
import type { WorldClock } from '../environment/WorldClock';
import type { Inventory } from '../inventory/Inventory';
import type { PlayerController } from '../player/PlayerController';
import type { StoryState } from './StoryState';

interface Ctx {
  moved: number;
  jumped: boolean;
  sprintTime: number;
  p: PlayerController;
  clock: WorldClock;
  inv: Inventory;
  story: StoryState;
}

interface Hint {
  id: string;
  text: string;
  /** When to show it. */
  when: (c: Ctx) => boolean;
  /** When it has been learned (hides it). */
  done: (c: Ctx) => boolean;
}

const HINTS: Hint[] = [
  { id: 'move', text: '[W] [A] [S] [D] Move · move the mouse to look (click to capture it)', when: () => true, done: (c) => c.moved > 6 },
  { id: 'note', text: 'Walk up to the tent and press [E] to read J.’s note', when: (c) => !c.story.readNotes.has('j-note-1'), done: (c) => c.story.readNotes.has('j-note-1') },
  { id: 'jump', text: '[Space] Jump — hold for height', when: (c) => c.moved > 5, done: (c) => c.jumped },
  { id: 'gather', text: 'Press [E] at branches, bushes, grass and rocks to gather materials', when: (c) => c.story.readNotes.has('j-note-1'), done: (c) => c.inv.count('wood') + c.inv.count('fiber') + c.inv.count('stone') >= 4 },
  { id: 'craft', text: 'Press [C] to craft. Make an axe — then trees give wood', when: (c) => c.inv.count('wood') + c.inv.count('stone') >= 4, done: (c) => c.inv.count('axe') > 0 || c.inv.count('knife') > 0 },
  { id: 'sprint', text: 'Hold [Shift] to sprint (uses stamina)', when: (c) => c.moved > 60, done: (c) => c.sprintTime > 1.2 },
  { id: 'dusk', text: 'Night is coming. Craft a campfire, then press [B] to place it and [E] to light it', when: (c) => c.clock.hour > 16.5 && c.clock.hour < 20, done: (c) => c.clock.hour > 21 || c.clock.hour < 6 },
  { id: 'torch', text: 'Select a torch with [1]–[6] to carry light. Wolves fear it', when: (c) => c.clock.hour > 18.5 && c.inv.count('torch') > 0, done: (c) => c.clock.hour < 18 },
  { id: 'map', text: '[M] Map · [J] Journal · [Tab] Backpack', when: (c) => c.story.locations.size >= 3, done: () => false },
];

/** Contextual control hints that retire themselves once the player has used each control. */
export class Tutorial {
  private ctx: Omit<Ctx, 'p' | 'clock' | 'inv'> & { moved: number } = { moved: 0, jumped: false, sprintTime: 0, story: null as unknown as StoryState };
  private lastX = 0;
  private lastZ = 0;
  private showing: string | null = null;
  private shownFor = 0;
  private delay = 2;
  enabled = true;

  constructor(
    private events: GameEventBus,
    private story: StoryState,
  ) {
    events.on('player:jump', () => (this.ctx.jumped = true));
  }

  reset(x: number): void {
    this.ctx = { moved: 0, jumped: false, sprintTime: 0, story: this.story };
    this.lastX = x;
    this.showing = null;
    this.delay = 2;
  }

  private learned(id: string): boolean {
    return Boolean(this.story.flags[`hint:${id}`]);
  }

  update(dt: number, p: PlayerController, clock: WorldClock, inv: Inventory): void {
    this.ctx.moved += Math.hypot(p.body.x - this.lastX, p.body.z - this.lastZ);
    this.lastX = p.body.x;
    this.lastZ = p.body.z;
    if (p.sprinting) this.ctx.sprintTime += dt;
    if (!this.enabled) {
      if (this.showing) this.hide();
      return;
    }
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    const c: Ctx = { ...this.ctx, p, clock, inv, story: this.story };
    if (this.showing) {
      const h = HINTS.find((x) => x.id === this.showing)!;
      this.shownFor += dt;
      if (h.done(c) || (h.id === 'map' && this.shownFor > 10)) {
        this.story.flags[`hint:${h.id}`] = true;
        this.hide();
        this.delay = 1.2;
      }
      return;
    }
    for (const h of HINTS) {
      if (this.learned(h.id) || !h.when(c)) continue;
      if (h.done(c)) {
        this.story.flags[`hint:${h.id}`] = true;
        continue;
      }
      this.showing = h.id;
      this.shownFor = 0;
      this.events.emit('toast', { text: h.text, kind: 'hint', duration: 9999 });
      break;
    }
    if (!this.story.flags['hint:swim'] && p.state === 'swim') {
      this.story.flags['hint:swim'] = true;
      this.events.emit('toast', { text: 'Deep water — press [Space] near the bank to climb out', kind: 'info', duration: 5 });
    }
  }

  private hide(): void {
    this.showing = null;
    this.events.emit('toast', { text: '', kind: 'hint', duration: 0 });
  }
}
