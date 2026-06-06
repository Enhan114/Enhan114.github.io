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

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
  try {
    const db = await open();
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = await new Promise<T>((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
    return result;
  } catch {
    return null;
  }
};

/** Store an audio blob in IndexedDB */
export const saveAudioBlob = async (key: string, blob: Blob): Promise<void> => {
  await run("readwrite", (store) => store.put(blob, key));
};

/** Load an audio blob from IndexedDB */
export const loadAudioBlob = async (key: string): Promise<Blob | null> => {
  return run("readonly", (store) => store.get(key));
};

/** Delete an audio blob from IndexedDB */
export const deleteAudioBlob = async (key: string): Promise<void> => {
  await run("readwrite", (store) => store.delete(key));
};

/** Check if an audio blob exists in IndexedDB */
export const hasAudioBlob = async (key: string): Promise<boolean> => {
  const count = await run("readonly", (store) => store.count(key));
  return (count ?? 0) > 0;
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
    // Open a cursor — more efficient than 32 individual count() calls
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
    db.close();
  } catch (e) {
    console.warn("[audioCacheDB] batch check failed:", e);
  }
  return found;
};

/** List all cached audio keys */
export const listAudioKeys = async (): Promise<string[]> => {
  const keys = await run("readonly", (store) => store.getAllKeys());
  return (keys ?? []) as string[];
};
