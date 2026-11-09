import { EventBus } from './EventBus';
import type { Surface } from '../world/Terrain';

export type SfxName =
  | 'chop'
  | 'mine'
  | 'gather'
  | 'pickup'
  | 'craft'
  | 'eat'
  | 'drink'
  | 'hurt'
  | 'swing'
  | 'hit'
  | 'ignite'
  | 'extinguish'
  | 'place'
  | 'remove'
  | 'door'
  | 'chest'
  | 'denied'
  | 'equip'
  | 'death'
  | 'howl'
  | 'growl'
  | 'thunder'
  | 'unlock'
  | 'radio'
  | 'discover';

/** Every cross-system event in the game, with its payload type. */
export interface GameEvents {
  'player:footstep': { surface: Surface; intensity: number; x: number };
  'player:jump': { surface: Surface };
  'player:land': { impact: number; surface: Surface };
  'player:splash': { intensity: number };
  'player:damaged': { amount: number; cause: string };
  'player:died': { cause: string };
  'player:action': { kind: 'swing' | 'work' | 'eat' };
  'interact:prompt': { text: string; alt?: string; key: string; worldX: number; worldY: number } | null;
  'note:open': { id: string; title: string; body: string; kind: 'note' | 'sign' | 'photo' | 'radio' };
  'location:discovered': { id: string; name: string; region: string; first: boolean };
  'item:gained': { id: string; qty: number };
  'recipe:unlocked': { ids: string[] };
  'quest:updated': { id: string; text: string };
  'toast': { text: string; kind?: 'info' | 'warn' | 'hint' | 'good'; duration?: number };
  'save:status': { state: 'saving' | 'saved' | 'error'; message?: string };
  'ui:sound': { kind: 'hover' | 'click' | 'open' | 'close' | 'page' };
  'sfx': { name: SfxName; x?: number; volume?: number };
  'container:open': { id: string; title: string };
  'weather:changed': { state: string };
  'time:dawn': { day: number };
  'time:dusk': { day: number };
  'ending': Record<string, never>;
}

export type GameEventBus = EventBus<GameEvents>;
export const createEventBus = (): GameEventBus => new EventBus<GameEvents>();
