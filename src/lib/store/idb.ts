// A tiny key-value store on the device (IndexedDB). This is the working copy
// Lumen reads from, so the app opens instantly and works offline.

const DB = "lumen", STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const r = run(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

export const idb = {
  get: <T>(key: string) => tx<T | undefined>("readonly", s => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => tx("readwrite", s => s.put(value, key)).then(() => undefined),
  del: (key: string) => tx("readwrite", s => s.delete(key)).then(() => undefined),
  keys: () => tx<IDBValidKey[]>("readonly", s => s.getAllKeys()).then(k => k.map(String)),
  clear: () => tx("readwrite", s => s.clear()).then(() => undefined),
};
