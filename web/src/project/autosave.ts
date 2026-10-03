// Autosave to the browser: IndexedDB when available, localStorage as a
// fallback, and every call guarded (private windows, blocked storage and
// full quotas must never break the app; they only disable autosave).
//
// Two slots. The running session writes "current". On boot, a leftover
// "current" (the last session) is rotated into "previous" and offered
// back with "Restore last session?"; dismissing deletes it.
export interface AutosaveRecord {
  savedAt: number;   // epoch ms
  title: string;
  sheets: number;
  json: string;      // serialized project (persist.serializeProject)
}

export type Slot = "current" | "previous";

const DB_NAME = "opendose";
const STORE = "autosave";
const lsKey = (slot: Slot) => `opendose-autosave-${slot}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") { resolve(null); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          try { req.result.createObjectStore(STORE); } catch { /* exists */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function idb<T>(mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    if (!db) { reject(new Error("no indexeddb")); return; }
    try {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  }));
}

function isRecord(v: unknown): v is AutosaveRecord {
  return !!v && typeof v === "object" && typeof (v as AutosaveRecord).json === "string"
    && typeof (v as AutosaveRecord).savedAt === "number";
}

export async function readSlot(slot: Slot): Promise<AutosaveRecord | null> {
  try {
    const v = await idb<unknown>("readonly", (s) => s.get(slot));
    if (isRecord(v)) return v;
  } catch { /* fall through to localStorage */ }
  try {
    const v = JSON.parse(localStorage.getItem(lsKey(slot)) ?? "null");
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

export async function writeSlot(slot: Slot, rec: AutosaveRecord): Promise<boolean> {
  try {
    await idb("readwrite", (s) => s.put(rec, slot));
    try { localStorage.removeItem(lsKey(slot)); } catch { /* ignore */ }
    return true;
  } catch { /* fall through */ }
  try {
    localStorage.setItem(lsKey(slot), JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

export async function deleteSlot(slot: Slot): Promise<void> {
  try { await idb("readwrite", (s) => s.delete(slot)); } catch { /* ignore */ }
  try { localStorage.removeItem(lsKey(slot)); } catch { /* ignore */ }
}

/** Boot: the last session's "current" becomes "previous"; returns what can
 *  be offered for restore (or null). */
export async function rotateOnBoot(): Promise<AutosaveRecord | null> {
  const cur = await readSlot("current");
  if (cur) {
    await writeSlot("previous", cur);
    await deleteSlot("current");
  }
  return readSlot("previous");
}
