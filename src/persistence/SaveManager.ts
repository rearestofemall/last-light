import { decodeRecord, encodeRecord, type SaveData, SaveError, validateSave } from './schema';
import { IndexedDBStore, type KVStore, MemoryStore } from './stores';

export type LoadResult =
  | { ok: true; data: SaveData; recoveredFromBackup: boolean }
  | { ok: false; reason: 'none' | 'corrupt' | 'newer' | 'outdated'; message: string };

const SLOT = 'slot-0';
const BACKUP = 'slot-0.backup';

/**
 * Versioned, checksummed save slots. Before each overwrite the previous save is copied to a
 * backup slot, so a crash mid-write or a corrupted record can be recovered from.
 */
export class SaveManager {
  private store: KVStore = new MemoryStore();

  constructor(private clampX: (x: number) => number) {}

  async init(): Promise<void> {
    try {
      this.store = await IndexedDBStore.open();
    } catch (e) {
      console.warn('[save] IndexedDB unavailable, progress will not persist:', e);
      this.store = new MemoryStore();
    }
  }

  /** For tests and tools. */
  useStore(store: KVStore): void {
    this.store = store;
  }

  get persistent(): boolean {
    return this.store.persistent;
  }

  async save(data: SaveData): Promise<void> {
    const prev = await this.store.get(SLOT).catch(() => undefined);
    if (prev !== undefined) {
      try {
        decodeRecord(prev); // only back up a known-good record
        await this.store.put(BACKUP, prev);
      } catch {
        /* previous record was bad; keep the older backup */
      }
    }
    await this.store.put(SLOT, encodeRecord(data));
  }

  private async read(key: string): Promise<SaveData | null> {
    const rec = await this.store.get(key);
    if (rec === undefined || rec === null) return null;
    return validateSave(decodeRecord(rec), this.clampX);
  }

  async load(): Promise<LoadResult> {
    let primaryError: SaveError | null = null;
    try {
      const d = await this.read(SLOT);
      if (d) return { ok: true, data: d, recoveredFromBackup: false };
    } catch (e) {
      primaryError = e instanceof SaveError ? e : new SaveError('corrupt', String(e));
      if (primaryError.reason === 'newer') return { ok: false, reason: 'newer', message: primaryError.message };
    }
    try {
      const b = await this.read(BACKUP);
      if (b) return { ok: true, data: b, recoveredFromBackup: primaryError !== null };
    } catch {
      /* fall through */
    }
    if (primaryError) return { ok: false, reason: primaryError.reason, message: primaryError.message };
    return { ok: false, reason: 'none', message: 'No saved game.' };
  }

  /** Info for the Continue button, or the reason a save exists but can't be used. */
  async summary(): Promise<{ summary: { savedAt: number; location: string; region: string; playTime: number } | null; problem: string | null }> {
    const r = await this.load();
    if (r.ok) {
      return { summary: { savedAt: r.data.savedAt, location: r.data.meta.location, region: r.data.meta.region, playTime: r.data.playTime }, problem: null };
    }
    const problem =
      r.reason === 'none'
        ? null
        : r.reason === 'newer'
          ? 'Your saved game was made by a newer version of The Last Light and can’t be opened here.'
          : 'Your saved game is damaged and couldn’t be restored. Starting a new game will replace it.';
    return { summary: null, problem };
  }

  async clear(): Promise<void> {
    await this.store.delete(SLOT);
    await this.store.delete(BACKUP);
  }
}
