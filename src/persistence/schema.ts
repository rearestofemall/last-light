import type { SavedPiece } from '../building/BuildSystem';
import type { SerializedInventory, ItemStack } from '../inventory/Inventory';
import type { Vitals } from '../survival/Survival';
import type { StorySave } from '../story/StoryState';

export const SAVE_VERSION = 2;

export interface PlayerSave {
  x: number;
  y: number;
  facing: 1 | -1;
}

export interface SaveData {
  version: number;
  savedAt: number;
  /** Seconds of play. */
  playTime: number;
  player: PlayerSave;
  respawn: { x: number; y: number };
  world: { seed: number; time: number; weather: { state: string; timer: number } };
  survival: { vitals: Vitals; wetness: number; sickness: number };
  inventory: SerializedInventory;
  equipment: { selected: number; clothing: ItemStack | null; lanternOn: boolean };
  crafting: string[];
  containers: Record<string, SerializedInventory>;
  structures: SavedPiece[];
  resources: Record<string, [number, number]>;
  lights: Record<string, { fuel: number; on: boolean }>;
  story: StorySave;
  /** Denormalised info for the Continue button. */
  meta: { location: string; region: string; day: number };
}

export class SaveError extends Error {
  constructor(
    readonly reason: 'corrupt' | 'newer' | 'outdated',
    message: string,
  ) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SaveError('corrupt', `Invalid number at ${path}`);
  return v;
};
const optNum = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
const strArr = (v: unknown, path: string): string[] => {
  if (!Array.isArray(v)) throw new SaveError('corrupt', `Invalid list at ${path}`);
  return v.filter((s): s is string => typeof s === 'string');
};

/**
 * Upgrades older save formats step by step. Each entry converts version N to N + 1.
 */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 (Milestone 1) had no survival, inventory or world systems: start them fresh,
  // keeping position and story progress.
  1: (d) => {
    const w = isObj(d.world) ? d.world : {};
    return {
      ...d,
      respawn: { x: -3, y: 0 },
      world: { seed: optNum(w.seed, 1914), time: 1 + 9 / 24, weather: { state: 'clear', timer: 300 } },
      survival: {},
      inventory: [],
      equipment: { selected: 0, clothing: null, lanternOn: true },
      crafting: [],
      containers: {},
      structures: [],
      resources: {},
      lights: {},
    };
  },
};

export function migrate(raw: unknown): Record<string, unknown> {
  if (!isObj(raw)) throw new SaveError('corrupt', 'Save is not an object');
  let d = raw;
  let v = typeof d.version === 'number' ? d.version : 0;
  if (v > SAVE_VERSION) throw new SaveError('newer', `Save version ${v} is newer than this game (${SAVE_VERSION}).`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError('outdated', `Save version ${v} can no longer be upgraded.`);
    d = step(d);
    v += 1;
    d.version = v;
  }
  return d;
}

/**
 * Validates the structure of a migrated save. Deep contents (inventories, structures) are
 * sanitised again by each system's deserialize(), which ignores unknown or invalid entries.
 */
export function validateSave(raw: unknown, clampX: (x: number) => number): SaveData {
  const d = migrate(raw);
  const p = d.player;
  const w = d.world;
  const s = d.story;
  const m = isObj(d.meta) ? d.meta : {};
  if (!isObj(p) || !isObj(w) || !isObj(s)) throw new SaveError('corrupt', 'Missing save sections');
  const flags: Record<string, boolean | number | string> = {};
  if (isObj(s.flags)) {
    for (const [k, v] of Object.entries(s.flags)) {
      if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') flags[k] = v;
    }
  }
  const respawn = isObj(d.respawn) ? d.respawn : {};
  const weather = isObj(w.weather) ? w.weather : {};
  const eq = isObj(d.equipment) ? d.equipment : {};
  const lights: Record<string, { fuel: number; on: boolean }> = {};
  if (isObj(d.lights)) {
    for (const [k, v] of Object.entries(d.lights)) if (isObj(v)) lights[k] = { fuel: optNum(v.fuel, 0), on: v.on === true };
  }
  const resources: Record<string, [number, number]> = {};
  if (isObj(d.resources)) {
    for (const [k, v] of Object.entries(d.resources)) if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) resources[k] = [v[0], v[1]];
  }
  return {
    version: SAVE_VERSION,
    savedAt: num(d.savedAt, 'savedAt'),
    playTime: Math.max(0, num(d.playTime, 'playTime')),
    player: { x: clampX(num(p.x, 'player.x')), y: num(p.y, 'player.y'), facing: p.facing === -1 ? -1 : 1 },
    respawn: { x: clampX(optNum(respawn.x, -3)), y: optNum(respawn.y, 0) },
    world: {
      seed: num(w.seed, 'world.seed'),
      time: Math.max(1, optNum(w.time, 1.3)),
      weather: { state: typeof weather.state === 'string' ? weather.state : 'clear', timer: optNum(weather.timer, 300) },
    },
    survival: (isObj(d.survival) ? d.survival : {}) as SaveData['survival'],
    inventory: (Array.isArray(d.inventory) ? d.inventory : []) as SerializedInventory,
    equipment: {
      selected: optNum(eq.selected, 0),
      clothing: (isObj(eq.clothing) ? eq.clothing : null) as ItemStack | null,
      lanternOn: eq.lanternOn !== false,
    },
    crafting: Array.isArray(d.crafting) ? d.crafting.filter((x): x is string => typeof x === 'string') : [],
    containers: (isObj(d.containers) ? d.containers : {}) as Record<string, SerializedInventory>,
    structures: (Array.isArray(d.structures) ? d.structures.filter((x) => isObj(x) && typeof x.piece === 'string' && typeof x.cell === 'number' && typeof x.level === 'number' && typeof x.base === 'number') : []) as SavedPiece[],
    resources,
    lights,
    story: {
      readNotes: strArr(s.readNotes, 'story.readNotes'),
      locations: strArr(s.locations, 'story.locations'),
      flags,
      explored: Array.isArray(s.explored) ? s.explored.filter((x): x is number => typeof x === 'number') : [],
    },
    meta: {
      location: typeof m.location === 'string' ? m.location : '',
      region: typeof m.region === 'string' ? m.region : '',
      day: optNum(m.day, 1),
    },
  };
}

/** FNV-1a checksum over the serialised payload, used to detect truncated or tampered saves. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface StoredRecord {
  checksum: string;
  payload: string;
}

export function encodeRecord(data: SaveData): StoredRecord {
  const payload = JSON.stringify(data);
  return { checksum: checksum(payload), payload };
}

export function decodeRecord(rec: unknown): unknown {
  if (!isObj(rec) || typeof rec.payload !== 'string' || typeof rec.checksum !== 'string') {
    throw new SaveError('corrupt', 'Save record is malformed');
  }
  if (checksum(rec.payload) !== rec.checksum) throw new SaveError('corrupt', 'Save checksum mismatch');
  try {
    return JSON.parse(rec.payload);
  } catch {
    throw new SaveError('corrupt', 'Save payload is not valid JSON');
  }
}
