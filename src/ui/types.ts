import type { Settings } from '../core/Settings';

export interface SaveSummary {
  savedAt: number;
  location: string;
  region: string;
  playTime: number;
  day: number;
}

/** What the UI is allowed to ask the game to do. The UI never owns game state. */
export interface GameApi {
  readonly settings: Settings;
  readonly persistentSaves: boolean;
  newGame(): Promise<void>;
  continueGame(): Promise<void>;
  saveGame(): Promise<boolean>;
  quitToMenu(): Promise<void>;
  resume(): void;
  getSaveSummary(): Promise<{ summary: SaveSummary | null; problem: string | null }>;
}

/** Projects a world point to CSS pixels. */
export type Projector = (x: number, y: number, z: number) => { x: number; y: number; visible: boolean };
