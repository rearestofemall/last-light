import type { GameEventBus } from '../core/events';
import { NOTES } from './notes';

export interface StorySave {
  readNotes: string[];
  locations: string[];
  flags: Record<string, boolean | number | string>;
}

/** Tracks what the player has read and discovered. Expanded into the full questline in M5. */
export class StoryState {
  readonly readNotes = new Set<string>();
  readonly locations = new Set<string>();
  flags: Record<string, boolean | number | string> = {};

  constructor(private events: GameEventBus) {}

  openNote(id: string): void {
    const n = NOTES[id];
    if (!n) return;
    this.readNotes.add(id);
    this.events.emit('note:open', { id, title: n.title, body: n.body, kind: n.kind });
  }

  /** Returns true the first time a location is visited. */
  discover(id: string): boolean {
    if (this.locations.has(id)) return false;
    this.locations.add(id);
    return true;
  }

  serialize(): StorySave {
    return { readNotes: [...this.readNotes], locations: [...this.locations], flags: { ...this.flags } };
  }

  deserialize(s: StorySave): void {
    this.readNotes.clear();
    this.locations.clear();
    for (const n of s.readNotes) if (NOTES[n]) this.readNotes.add(n);
    for (const l of s.locations) this.locations.add(l);
    this.flags = { ...s.flags };
  }

  reset(): void {
    this.readNotes.clear();
    this.locations.clear();
    this.flags = {};
  }
}
