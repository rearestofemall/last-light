import type { GameEventBus } from '../core/events';
import type { PlayerController } from '../player/PlayerController';
import type { StoryState } from './StoryState';

type Step = { text: string; done: (ctx: TutorialCtx) => boolean };
interface TutorialCtx {
  moved: number;
  jumped: boolean;
  sprintTime: number;
}

const STEPS: Step[] = [
  { text: '[A] [D] Move', done: (c) => c.moved > 5 },
  { text: '[Space] Jump — hold for height', done: (c) => c.jumped },
  { text: 'Hold [Shift] to sprint', done: (c) => c.sprintTime > 1.2 },
];

/** Contextual control hints that retire themselves once the player has used each control. */
export class Tutorial {
  private step = 0;
  private delay = 2;
  private ctx: TutorialCtx = { moved: 0, jumped: false, sprintTime: 0 };
  private lastX = 0;
  private shown = -1;
  private swimHint = false;
  enabled = true;

  constructor(
    private events: GameEventBus,
    private story: StoryState,
  ) {
    events.on('player:jump', () => (this.ctx.jumped = true));
  }

  reset(x: number): void {
    this.step = this.story.flags['tutorial:basics'] ? STEPS.length : 0;
    this.swimHint = Boolean(this.story.flags['tutorial:swim']);
    this.delay = 2;
    this.ctx = { moved: 0, jumped: false, sprintTime: 0 };
    this.lastX = x;
    this.shown = -1;
  }

  update(dt: number, p: PlayerController): void {
    this.ctx.moved += Math.abs(p.body.x - this.lastX);
    this.lastX = p.body.x;
    if (p.sprinting) this.ctx.sprintTime += dt;
    if (!this.enabled) return;

    if (this.step < STEPS.length) {
      if (this.delay > 0) {
        this.delay -= dt;
        return;
      }
      const s = STEPS[this.step];
      if (s.done(this.ctx)) {
        this.step++;
        this.delay = 0.8;
        if (this.step === STEPS.length) this.story.flags['tutorial:basics'] = true;
        return;
      }
      if (this.shown !== this.step) {
        this.shown = this.step;
        this.events.emit('toast', { text: s.text, kind: 'hint', duration: 600 });
      }
    } else if (this.shown >= 0 && this.shown < STEPS.length) {
      this.shown = STEPS.length;
      this.events.emit('toast', { text: '', kind: 'hint', duration: 0.01 });
    }
    if (!this.swimHint && p.state === 'swim') {
      this.swimHint = true;
      this.story.flags['tutorial:swim'] = true;
      this.events.emit('toast', { text: 'Deep water — press [Space] near the bank to climb out', kind: 'hint', duration: 7 });
    }
  }
}
