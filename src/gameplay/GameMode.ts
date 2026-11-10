import type { RegionId } from '../world/WorldDef';

/** How a game was started: the story campaign, or an open sandbox with chosen rules. */
export type Pace = 'relaxed' | 'normal' | 'harsh';

export interface GameMode {
  kind: 'story' | 'free';
  /** Free Play: where you wake up. */
  region: RegionId;
  /** How fast hunger, thirst and tiredness set in, and how much harm hurts. */
  pace: Pace;
  /** Start with tools, a torch, food and a campfire. */
  starterKit: boolean;
  /** Every crafting recipe known from the start. */
  allRecipes: boolean;
  /** No wolves. */
  peaceful: boolean;
}

export const STORY_MODE: GameMode = { kind: 'story', region: 'woods', pace: 'normal', starterKit: false, allRecipes: false, peaceful: false };

export const DEFAULT_FREE_PLAY: GameMode = { kind: 'free', region: 'woods', pace: 'normal', starterKit: true, allRecipes: true, peaceful: false };

export const PACE: Record<Pace, { label: string; drain: number; damage: number }> = {
  relaxed: { label: 'Relaxed', drain: 0.5, damage: 0.5 },
  normal: { label: 'Normal', drain: 1, damage: 1 },
  harsh: { label: 'Harsh', drain: 1.5, damage: 1.4 },
};

/** Free Play start points: on the old road in each region, clear of buildings. */
export const FREE_SPAWNS: Record<RegionId, { x: number; z: number; label: string }> = {
  woods: { x: -3, z: 1.5, label: 'The Verdant Woods' },
  frost: { x: -560, z: 2.5, label: 'The Frostlands' },
  city: { x: 512, z: 2.5, label: 'The Forgotten City' },
  coast: { x: 1150, z: 2.5, label: 'The Drowned Coast' },
};

/** Items handed out with the starter kit (the parka only where it is cold). */
export function starterKit(region: RegionId): [string, number][] {
  const kit: [string, number][] = [
    ['axe', 1],
    ['knife', 1],
    ['torch', 2],
    ['berries', 6],
    ['water_clean', 2],
    ['bottle', 1],
    ['wood', 8],
    ['fiber', 6],
    ['stone', 4],
    ['campfire', 1],
    ['bedroll', 1],
  ];
  if (region === 'frost') kit.push(['parka', 1]);
  return kit;
}

/** Restores a mode from a save, filling anything missing (older saves are story games). */
export function sanitizeMode(m: unknown): GameMode {
  if (!m || typeof m !== 'object') return { ...STORY_MODE };
  const o = m as Partial<GameMode>;
  const kind = o.kind === 'free' ? 'free' : 'story';
  const region = o.region && o.region in FREE_SPAWNS ? o.region : 'woods';
  const pace = o.pace && o.pace in PACE ? o.pace : 'normal';
  return { kind, region, pace, starterKit: !!o.starterKit, allRecipes: !!o.allRecipes, peaceful: !!o.peaceful };
}
