import { EventBus } from './EventBus';
import type { Surface } from '../world/Terrain';

/** Every cross-system event in the game, with its payload type. */
export interface GameEvents {
  'player:footstep': { surface: Surface; intensity: number; x: number };
  'player:jump': { surface: Surface };
  'player:land': { impact: number; surface: Surface };
  'player:splash': { intensity: number };
  'interact:prompt': { text: string; key: string; worldX: number; worldY: number } | null;
  'note:open': { id: string; title: string; body: string; kind: 'note' | 'sign' };
  'location:discovered': { id: string; name: string; region: string; first: boolean };
  'toast': { text: string; kind?: 'info' | 'warn' | 'hint'; duration?: number };
  'save:status': { state: 'saving' | 'saved' | 'error'; message?: string };
  'ui:sound': { kind: 'hover' | 'click' | 'open' | 'close' | 'page' };
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
