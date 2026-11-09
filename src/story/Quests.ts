import type { GameEventBus } from '../core/events';
import type { StoryState } from './StoryState';

export interface QuestStep {
  id: string;
  text: string;
  /** World x of the objective, for the map marker. */
  target: number;
  done(s: StoryState): boolean;
}

const note = (id: string) => (s: StoryState) => s.readNotes.has(id);
const loc = (id: string) => (s: StoryState) => s.locations.has(id);
const flag = (id: string) => (s: StoryState) => Boolean(s.flags[id]);

/** The main questline, in order. Optional discoveries live outside it. */
export const MAIN_QUEST: QuestStep[] = [
  { id: 'wake', text: 'Read the note J. left at the tent', target: -4, done: note('j-note-1') },
  { id: 'ranger', text: 'Follow the trail east to the Ranger Station', target: 132, done: loc('ranger-station') },
  { id: 'loft', text: 'Search the ranger station for J.’s trail', target: 128, done: note('j-note-2') },
  { id: 'lodge', text: 'Cross Eastridge to the Hunter’s Lodge', target: 362, done: note('hunter-journal') },
  { id: 'gorge', text: 'Braid a rope and climb across the gorge at the old highway', target: 434, done: flag('gorge-crossed') },
  { id: 'city', text: 'Search the Forgotten City for J. (Alder Street Apartments)', target: 540, done: note('j-note-3') },
  { id: 'radio', text: 'Listen to the crystal radio at KVLT Broadcast House', target: 691, done: note('radio-1') },
  { id: 'metro', text: 'Take the metro tunnel under the collapsed overpass to the coast', target: 765, done: loc('dunes') },
  { id: 'lighthouse', text: 'Reach the Greywater Lighthouse', target: 1632, done: note('keeper-log') },
  { id: 'meridian', text: 'Find the dossier in the wreck of the Meridian', target: 1430, done: note('meridian-dossier') },
  { id: 'lantern-room', text: 'Climb to the lighthouse lantern room', target: 1632, done: note('j-note-4') },
  { id: 'pass', text: 'Make a pickaxe and dig through the rockslide at Halcyon Pass', target: -232, done: flag('pass-cleared') },
  { id: 'station', text: 'Cross the Frostlands to Halcyon Station (wear something warm)', target: -800, done: loc('halcyon-station') },
  { id: 'array', text: 'Descend into the Array beneath the station', target: -812, done: flag('found-j') },
  { id: 'end', text: 'Throw the field breaker and end the Quiet', target: -812, done: flag('ending') },
];

/** Tracks progress through the main questline and announces new objectives. */
export class Quests {
  private index = -1;

  constructor(
    private story: StoryState,
    private events: GameEventBus,
  ) {}

  get current(): QuestStep | null {
    return MAIN_QUEST[this.index] ?? null;
  }

  get completed(): QuestStep[] {
    return MAIN_QUEST.slice(0, Math.max(0, this.index));
  }

  get finished(): boolean {
    return this.index >= MAIN_QUEST.length;
  }

  /** Re-evaluates progress; steps may complete out of order, so skip anything already done. */
  update(announce = true): void {
    let i = 0;
    while (i < MAIN_QUEST.length && MAIN_QUEST[i].done(this.story)) i++;
    if (i !== this.index) {
      const advanced = i > this.index && this.index >= 0;
      this.index = i;
      const step = this.current;
      if (announce && advanced) {
        this.events.emit('sfx', { name: 'discover' });
        if (step) this.events.emit('quest:updated', { id: step.id, text: step.text });
      }
    }
  }

  reset(): void {
    this.index = -1;
  }
}
