export type Station = 'fire' | 'workbench';

export interface Recipe {
  id: string;
  out: string;
  qty: number;
  cost: Record<string, number>;
  station?: Station;
  group: 'Survival' | 'Tools & Light' | 'Food & Medicine' | 'Building' | 'Furniture';
  /** How the recipe is learned. 'start' = known from the beginning. */
  unlock: 'start' | string;
  /** Display name when several recipes make the same item. */
  name?: string;
}

/**
 * Unlock keys:
 *  note:<id>  — reading a document
 *  loc:<id>   — discovering a location
 */
export const RECIPES: Recipe[] = [
  { id: 'campfire', out: 'campfire', qty: 1, cost: { wood: 4, stone: 4 }, group: 'Survival', unlock: 'start' },
  { id: 'knife', out: 'knife', qty: 1, cost: { stone: 2, fiber: 2, wood: 1 }, group: 'Tools & Light', unlock: 'start' },
  { id: 'axe', out: 'axe', qty: 1, cost: { wood: 3, stone: 3, fiber: 3 }, group: 'Tools & Light', unlock: 'start' },
  { id: 'torch', out: 'torch', qty: 1, cost: { wood: 1, fiber: 2 }, group: 'Tools & Light', unlock: 'start' },
  { id: 'bandage', out: 'bandage', qty: 1, cost: { cloth: 2 }, group: 'Food & Medicine', unlock: 'start' },
  { id: 'cooked_meat', out: 'cooked_meat', qty: 1, cost: { raw_meat: 1 }, station: 'fire', group: 'Food & Medicine', unlock: 'start' },
  { id: 'water_clean', out: 'water_clean', qty: 1, cost: { water_dirty: 1 }, station: 'fire', group: 'Food & Medicine', unlock: 'start' },
  { id: 'bottle', out: 'bottle', qty: 1, cost: { hide: 1, fiber: 3 }, group: 'Survival', unlock: 'loc:blackwater', name: 'Waterskin' },
  { id: 'bottle_scrap', out: 'bottle', qty: 1, cost: { metal: 2 }, group: 'Survival', unlock: 'loc:blackwater', name: 'Tin Canteen' },
  { id: 'floor', out: 'floor', qty: 1, cost: { wood: 4 }, group: 'Building', unlock: 'note:ranger-log' },
  { id: 'wall', out: 'wall', qty: 1, cost: { wood: 4, fiber: 1 }, group: 'Building', unlock: 'note:ranger-log' },
  { id: 'chest', out: 'chest', qty: 1, cost: { wood: 6, fiber: 2 }, group: 'Furniture', unlock: 'note:ranger-log' },
  { id: 'roof', out: 'roof', qty: 1, cost: { wood: 3, fiber: 3 }, group: 'Building', unlock: 'note:ranger-log' },
  { id: 'door', out: 'door', qty: 1, cost: { wood: 5, fiber: 2 }, group: 'Building', unlock: 'note:ranger-log' },
  { id: 'backwall', out: 'backwall', qty: 1, cost: { wood: 3 }, group: 'Building', unlock: 'note:ranger-log' },
  { id: 'bedroll', out: 'bedroll', qty: 1, cost: { fiber: 6, cloth: 2 }, group: 'Survival', unlock: 'note:j-note-2' },
  { id: 'window', out: 'window', qty: 1, cost: { wood: 3, metal: 1 }, group: 'Building', unlock: 'note:ranger-manual' },
  { id: 'table', out: 'table', qty: 1, cost: { wood: 5 }, group: 'Furniture', unlock: 'note:ranger-manual' },
  { id: 'workbench', out: 'workbench', qty: 1, cost: { wood: 8, stone: 4, metal: 2 }, group: 'Furniture', unlock: 'note:ranger-manual' },
  { id: 'lantern', out: 'lantern', qty: 1, cost: { metal: 3, fuel: 1, cloth: 1 }, station: 'workbench', group: 'Tools & Light', unlock: 'note:hunter-journal' },
  { id: 'rope', out: 'rope', qty: 1, cost: { fiber: 10, hide: 1 }, group: 'Survival', unlock: 'note:hunter-journal' },
  { id: 'remedy', out: 'remedy', qty: 1, cost: { herbs: 3, water_clean: 1 }, station: 'fire', group: 'Food & Medicine', unlock: 'note:clinic-notes' },
  { id: 'pickaxe', out: 'pickaxe', qty: 1, cost: { metal: 5, wood: 2, fiber: 2 }, station: 'workbench', group: 'Tools & Light', unlock: 'note:hardware-ledger' },
  { id: 'lamp', out: 'lamp', qty: 1, cost: { metal: 3, fuel: 1 }, station: 'workbench', group: 'Furniture', unlock: 'note:hardware-ledger' },
  { id: 'parka', out: 'parka', qty: 1, cost: { hide: 5, cloth: 4, fiber: 4 }, station: 'workbench', group: 'Survival', unlock: 'note:keeper-log' },
  { id: 'bed', out: 'bed', qty: 1, cost: { wood: 6, cloth: 4, hide: 2 }, group: 'Furniture', unlock: 'note:keeper-log' },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
