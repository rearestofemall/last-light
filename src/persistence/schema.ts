import type { StorySave } from '../story/StoryState';

export const SAVE_VERSION = 1;

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
  world: { seed: number; time: number };
  story: StorySave;
  /** Denormalised info for the Continue button. */
  meta: { location: string; region: string };
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
const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string') throw new SaveError('corrupt', `Invalid string at ${path}`);
  return v;
};
const strArr = (v: unknown, path: string): string[] => {
  if (!Array.isArray(v)) throw new SaveError('corrupt', `Invalid list at ${path}`);
  return v.filter((s): s is string => typeof s === 'string');
};

/**
 * Upgrades older save formats step by step. Each entry converts version N to N + 1.
 * Add an entry here whenever SAVE_VERSION is bumped.
 */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

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

/** Validates (and sanitises) a migrated save. Throws SaveError on structural problems. */
export function validateSave(raw: unknown, clampX: (x: number) => number): SaveData {
  const d = migrate(raw);
  const p = d.player;
  const w = d.world;
  const s = d.story;
  const m = d.meta;
  if (!isObj(p) || !isObj(w) || !isObj(s)) throw new SaveError('corrupt', 'Missing save sections');
  const flags: Record<string, boolean | number | string> = {};
  if (isObj(s.flags)) {
    for (const [k, v] of Object.entries(s.flags)) {
      if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') flags[k] = v;
    }
  }
  return {
    version: SAVE_VERSION,
    savedAt: num(d.savedAt, 'savedAt'),
    playTime: Math.max(0, num(d.playTime, 'playTime')),
    player: {
      x: clampX(num(p.x, 'player.x')),
      y: num(p.y, 'player.y'),
      facing: p.facing === -1 ? -1 : 1,
    },
    world: { seed: num(w.seed, 'world.seed'), time: num(w.time, 'world.time') },
    story: {
      readNotes: strArr(s.readNotes, 'story.readNotes'),
      locations: strArr(s.locations, 'story.locations'),
      flags,
    },
    meta: {
      location: isObj(m) && typeof m.location === 'string' ? str(m.location, 'meta.location') : '',
      region: isObj(m) && typeof m.region === 'string' ? str(m.region, 'meta.region') : '',
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
