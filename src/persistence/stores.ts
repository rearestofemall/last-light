/** Minimal async key-value store abstraction (IndexedDB in browsers, memory as fallback). */
export interface KVStore {
  readonly persistent: boolean;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements KVStore {
  readonly persistent = false;
  private map = new Map<string, unknown>();
  async get(key: string): Promise<unknown> {
    return structuredClone(this.map.get(key));
  }
  async put(key: string, value: unknown): Promise<void> {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

const DB_NAME = 'the-last-light';
const STORE = 'saves';

export class IndexedDBStore implements KVStore {
  readonly persistent = true;
  private constructor(private db: IDBDatabase) {}

  static open(): Promise<IndexedDBStore> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(new IndexedDBStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  private tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error ?? r.error);
      t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    });
  }

  get(key: string): Promise<unknown> {
    return this.tx('readonly', (s) => s.get(key));
  }
  async put(key: string, value: unknown): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}
