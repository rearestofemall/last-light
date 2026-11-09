import type { GameEventBus } from '../core/events';
import { NOTES } from './notes';

export interface StorySave {
  readNotes: string[];
  locations: string[];
  flags: Record<string, boolean | number | string>;
  /** Explored 20 m bins of the world strip, for the map. */
  explored?: number[];
}

export const MAP_BIN = 24;

/** Integer key of the explored map cell containing (x, z). */
export function exploredKey(x: number, z: number): number {
  return (Math.floor(x / MAP_BIN) + 100) * 1000 + (Math.floor(z / MAP_BIN) + 500);
}

/** Tracks what the player has read, discovered and done. */
export class StoryState {
  readonly readNotes = new Set<string>();
  readonly locations = new Set<string>();
  readonly explored = new Set<number>();
  flags: Record<string, boolean | number | string> = {};
  /** Called with unlock keys ("note:x", "loc:y") so crafting can learn recipes. */
  onUnlock: (key: string) => void = () => {};

  constructor(private events: GameEventBus) {}

  openNote(id: string): void {
    const n = NOTES[id];
    if (!n) return;
    const first = !this.readNotes.has(id);
    this.readNotes.add(id);
    this.events.emit('note:open', { id, title: n.title, body: n.body, kind: n.kind });
    if (first) {
      this.onUnlock(`note:${id}`);
      if (!n.main && n.kind !== 'sign') this.events.emit('toast', { text: `Discovery recorded in your journal (J)`, kind: 'good', duration: 3.5 });
    }
  }

  /** Returns true the first time a location is visited. */
  discover(id: string): boolean {
    if (this.locations.has(id)) return false;
    this.locations.add(id);
    this.onUnlock(`loc:${id}`);
    return true;
  }

  /** Mark the map cell at (x, z) explored (cells are MAP_BIN metres square). */
  explore(x: number, z = 0): void {
    this.explored.add(exploredKey(x, z));
  }

  serialize(): StorySave {
    return { readNotes: [...this.readNotes], locations: [...this.locations], flags: { ...this.flags }, explored: [...this.explored] };
  }

  deserialize(s: StorySave): void {
    this.reset();
    for (const n of s.readNotes) if (NOTES[n]) this.readNotes.add(n);
    for (const l of s.locations) this.locations.add(l);
    for (const b of s.explored ?? []) if (Number.isFinite(b)) this.explored.add(b);
    this.flags = { ...s.flags };
  }

  reset(): void {
    this.readNotes.clear();
    this.locations.clear();
    this.explored.clear();
    this.flags = {};
  }
}
