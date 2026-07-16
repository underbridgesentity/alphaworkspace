/**
 * Minimal promise IndexedDB helper for the offline outbox. Deliberately
 * dependency-free; the service worker mirrors this shape in plain JS
 * (public/sw.js) — keep DB/store names in sync.
 */

export const IDB_NAME = "aw";
export const OUTBOX_STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
        req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(OUTBOX_STORE, mode);
    const req = run(t.objectStore(OUTBOX_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const idb = {
  getAll<T>(): Promise<T[]> {
    return tx("readonly", (s) => s.getAll() as IDBRequest<T[]>);
  },
  put<T>(value: T): Promise<IDBValidKey> {
    return tx("readwrite", (s) => s.put(value));
  },
  delete(key: string): Promise<undefined> {
    return tx("readwrite", (s) => s.delete(key) as IDBRequest<undefined>);
  },
  count(): Promise<number> {
    return tx("readonly", (s) => s.count());
  },
};
