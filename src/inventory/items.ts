import type { Vitals } from '../survival/Survival';

export type ItemCategory = 'resource' | 'food' | 'drink' | 'medicine' | 'tool' | 'light' | 'placeable' | 'clothing';

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  resource: 'Resource',
  food: 'Food',
  drink: 'Drink',
  medicine: 'Medicine',
  tool: 'Tool',
  light: 'Light',
  placeable: 'Structure',
  clothing: 'Clothing',
};

export type ToolKind = 'axe' | 'knife' | 'pickaxe';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  stack: number;
  /** Vitals restored (or drained) when consumed. */
  effects?: Partial<Vitals>;
  /** Item left behind after consuming (e.g. an empty container). */
  returns?: string;
  /** Chance (0–1) of an upset stomach when consumed. */
  sickness?: number;
  tool?: { kind: ToolKind; damage: number };
  /** Max durability: tool uses, or seconds of burn for lights. */
  durability?: number;
  light?: { radius: number; intensity: number; color: number; fuelItem?: string };
  /** Seconds of fire this item adds when burned as fuel. */
  burn?: number;
  /** Build piece placed by this item. */
  piece?: string;
  warmth?: number;
  /** Damage when used as a weapon with no tool (e.g. a lit torch). */
  damage?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: 'Wood', category: 'resource', stack: 30, burn: 90, description: 'Split logs and branches. Burns well; the backbone of every fire and shelter.' },
  stone: { id: 'stone', name: 'Stone', category: 'resource', stack: 30, description: 'Fist-sized stones. Fire rings, tool heads, foundations.' },
  fiber: { id: 'fiber', name: 'Plant Fiber', category: 'resource', stack: 30, burn: 10, description: 'Tough grass and bark strips. Twist it into cord, or use it as tinder.' },
  metal: { id: 'metal', name: 'Metal Scraps', category: 'resource', stack: 30, description: 'Bent sheet metal, bolts and wire salvaged from a world that stopped.' },
  cloth: { id: 'cloth', name: 'Cloth', category: 'resource', stack: 20, burn: 20, description: 'Torn fabric. Bandages, bedding and warm clothes.' },
  hide: { id: 'hide', name: 'Animal Hide', category: 'resource', stack: 20, description: 'Rough-scraped hide. Warm and windproof once stitched.' },
  fuel: { id: 'fuel', name: 'Lamp Oil', category: 'resource', stack: 10, burn: 240, description: 'A dented can of lamp oil. Feeds lanterns and lamps; flares up a dying fire.' },
  herbs: { id: 'herbs', name: 'Medicinal Herbs', category: 'resource', stack: 20, description: 'Yarrow and willow bark. Chewed raw it dulls pain; brewed it heals.', effects: { health: 4 } },
  rope: { id: 'rope', name: 'Rope', category: 'resource', stack: 5, description: 'Braided fibre rope, ten metres of it. Strong enough to hold your weight.' },
  berries: { id: 'berries', name: 'Wild Berries', category: 'food', stack: 15, effects: { hunger: 8, thirst: 3 }, description: 'Tart and filling enough. A handful at a time.' },
  raw_meat: { id: 'raw_meat', name: 'Raw Meat', category: 'food', stack: 8, effects: { hunger: 15 }, sickness: 0.5, description: 'Cook it over a fire. Eaten raw, it may turn your stomach.' },
  cooked_meat: { id: 'cooked_meat', name: 'Cooked Meat', category: 'food', stack: 8, effects: { hunger: 38, warmth: 6 }, description: 'Hot, smoky and real. Restores a lot of hunger.' },
  canned_food: { id: 'canned_food', name: 'Canned Beans', category: 'food', stack: 8, effects: { hunger: 30, thirst: 4 }, description: 'Pre-Quiet rations. The label promises "hearty". It delivers.' },
  water_dirty: { id: 'water_dirty', name: 'Unboiled Water', category: 'drink', stack: 5, effects: { thirst: 30 }, sickness: 0.3, returns: 'bottle', description: 'River water in a container. Boil it at a fire to make it safe.' },
  water_clean: { id: 'water_clean', name: 'Clean Water', category: 'drink', stack: 5, effects: { thirst: 40 }, returns: 'bottle', description: 'Boiled and safe.' },
  bottle: { id: 'bottle', name: 'Water Container', category: 'tool', stack: 5, description: 'An empty container. Fill it at a river or lake (R near water).' },
  bandage: { id: 'bandage', name: 'Bandage', category: 'medicine', stack: 10, effects: { health: 22 }, description: 'Clean strips of cloth. Stops bleeding, restores health.' },
  remedy: { id: 'remedy', name: 'Herbal Remedy', category: 'medicine', stack: 5, effects: { health: 45, energy: 10 }, returns: 'bottle', description: 'Bitter herbal brew. Heals well and settles the stomach.' },
  knife: { id: 'knife', name: 'Gathering Knife', category: 'tool', stack: 1, durability: 80, tool: { kind: 'knife', damage: 14 }, description: 'A sharpened stone blade. More fibre, herbs and berries from every plant; skins game.' },
  axe: { id: 'axe', name: 'Basic Axe', category: 'tool', stack: 1, durability: 70, tool: { kind: 'axe', damage: 22 }, description: 'Stone head lashed to a haft. Fells trees. A weapon when it must be.' },
  pickaxe: { id: 'pickaxe', name: 'Pickaxe', category: 'tool', stack: 1, durability: 90, tool: { kind: 'pickaxe', damage: 18 }, description: 'Scrap-metal pick. Breaks rock faster, pries metal from stone, clears rockfalls.' },
  torch: { id: 'torch', name: 'Torch', category: 'light', stack: 3, durability: 300, damage: 10, light: { radius: 9, intensity: 2.2, color: 0xffa04a }, description: 'Burns for about five minutes once lit. Wolves keep their distance. Rain shortens its life.' },
  lantern: { id: 'lantern', name: 'Lantern', category: 'light', stack: 1, durability: 600, light: { radius: 12, intensity: 2.6, color: 0xffc070, fuelItem: 'fuel' }, description: 'A storm lantern. Wide, steady light that rain can’t put out. Refuels from lamp oil; press F to switch on or off.' },
  parka: { id: 'parka', name: 'Hide Parka', category: 'clothing', stack: 1, warmth: 30, description: 'Stitched hide over a cloth lining. Keeps out the worst of the cold. Equip with F.' },
  campfire: { id: 'campfire', name: 'Campfire', category: 'placeable', stack: 5, piece: 'campfire', description: 'A stone ring and kindling. Place it in build mode (B), then light it.' },
  floor: { id: 'floor', name: 'Wooden Floor', category: 'placeable', stack: 10, piece: 'floor', description: 'A plank floor section, two metres wide.' },
  wall: { id: 'wall', name: 'Wooden Wall', category: 'placeable', stack: 10, piece: 'wall', description: 'A solid wall that blocks wind and wildlife.' },
  door: { id: 'door', name: 'Wooden Door', category: 'placeable', stack: 5, piece: 'door', description: 'A wall with a door you can open and close (E).' },
  backwall: { id: 'backwall', name: 'Back Wall', category: 'placeable', stack: 10, piece: 'backwall', description: 'Rear wall panel. With a roof, it makes a cell properly sheltered.' },
  window: { id: 'window', name: 'Window Wall', category: 'placeable', stack: 10, piece: 'window', description: 'Rear wall panel with a window. Counts as a back wall.' },
  roof: { id: 'roof', name: 'Roof', category: 'placeable', stack: 10, piece: 'roof', description: 'Keeps rain and snow off. Fires beneath it stay lit in a storm.' },
  chest: { id: 'chest', name: 'Storage Chest', category: 'placeable', stack: 3, piece: 'chest', description: 'Stores sixteen stacks of items.' },
  bedroll: { id: 'bedroll', name: 'Bedroll', category: 'placeable', stack: 2, piece: 'bedroll', description: 'Sleep to restore energy and pass the night. You will wake here if you fall.' },
  bed: { id: 'bed', name: 'Bed', category: 'placeable', stack: 2, piece: 'bed', description: 'A proper bed. Better sleep, and a warmer night.' },
  table: { id: 'table', name: 'Table', category: 'placeable', stack: 3, piece: 'table', description: 'A sturdy table. Something to stand on, and something to come home to.' },
  workbench: { id: 'workbench', name: 'Workbench', category: 'placeable', stack: 1, piece: 'workbench', description: 'Unlocks advanced crafting while you stand nearby.' },
  lamp: { id: 'lamp', name: 'Oil Lamp', category: 'placeable', stack: 3, piece: 'lamp', description: 'A fixed hanging lamp. Burns lamp oil for a long, steady light.' },
};

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  return d;
}

export function isConsumable(d: ItemDef): boolean {
  return d.category === 'food' || d.category === 'drink' || d.category === 'medicine' || (d.id === 'herbs');
}
