/**
 * IndexedDB-backed audio blob cache.
 *
 * The in-memory audioResourceCache (LRU, 100-200MB) is fast but
 * ephemeral — it's lost on page reload and evicts large files.
 * This module adds a persistent backing store in IndexedDB so
 * preloaded audio survives across sessions.
 */

const DB = "aura-audio-cache";
const STORE = "audio-cache";

// ── Singleton: prevent concurrent open() calls from racing ──
let _dbPromise: Promise<IDBDatabase> | null = null;

const open = (): Promise<IDBDatabase> => {
  // Reuse existing promise if one is in flight
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      _dbPromise = null; // allow retry on next call
      reject(req.error ?? new Error("Failed to open IndexedDB"));
    };
    req.onblocked = () => {
      // Another connection is holding a lock — close it and retry
      console.warn("[CacheDB] blocked, closing old connection...");
      // The old connection (if any) should close; we retry via reject+retry
      _dbPromise = null;
      reject(new Error("IndexedDB open blocked"));
    };
  });

  return _dbPromise;
};

const closeDb = (db: IDBDatabase) => {
  db.close();
  _dbPromise = null; // allow next call to open a fresh connection
};

const run = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open();
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  const result = await new Promise<T>((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  closeDb(db);
  return result;
};

/** Store an audio blob in IndexedDB */
export const saveAudioBlob = async (key: string, blob: Blob): Promise<void> => {
  await run("readwrite", (store) => store.put(blob, key));
};

/** Load an audio blob from IndexedDB */
export const loadAudioBlob = async (key: string): Promise<Blob | null> => {
  try {
    return await run("readonly", (store) => store.get(key));
  } catch {
    return null;
  }
};

/** Delete an audio blob from IndexedDB */
export const deleteAudioBlob = async (key: string): Promise<void> => {
  await run("readwrite", (store) => store.delete(key));
};

/** Check if an audio blob exists in IndexedDB */
export const hasAudioBlob = async (key: string): Promise<boolean> => {
  try {
    const count = await run("readonly", (store) => store.count(key));
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
};

/**
 * Batch-check multiple keys in a single DB connection.
 * Much faster than calling hasAudioBlob for each key individually.
 * Returns a Set of keys that exist in the store.
 */
export const batchHasAudioBlobs = async (keys: string[]): Promise<Set<string>> => {
  const found = new Set<string>();
  if (keys.length === 0) return found;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (keys.includes(cursor.key as string)) {
            found.add(cursor.key as string);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((r) => { tx.oncomplete = () => r(); });
    closeDb(db);
  } catch (e) {
    console.warn("[CacheDB] batch check failed:", e);
  }
  return found;
};

/** List all cached audio keys */
export const listAudioKeys = async (): Promise<string[]> => {
  try {
    const keys = await run("readonly", (store) => store.getAllKeys());
    return (keys ?? []) as string[];
  } catch {
    return [];
  }
};
