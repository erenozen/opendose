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

// The "Autosave my work in this browser" switch (Preferences): on unless
// set to "off". Off: nothing is written to the slots and both are deleted.
const SWITCH_KEY = "opendose-autosave";
export function autosaveEnabled(): boolean {
  try { return localStorage.getItem(SWITCH_KEY) !== "off"; } catch { return true; }
}
export async function setAutosaveEnabled(on: boolean): Promise<void> {
  try {
    if (on) localStorage.removeItem(SWITCH_KEY);
    else localStorage.setItem(SWITCH_KEY, "off");
  } catch { /* storage unavailable: autosave stays as it was */ }
  if (!on) {
    await deleteSlot("current");
    await deleteSlot("previous");
  }
}

// Set by forget.ts while it erases this browser's data: no write may land
// after the erase (a debounced autosave, a template save) and before the
// page reloads.
let frozen = false;
export function freezeStorage(): void { frozen = true; }

export const DB_NAME = "opendose";
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

/** Close this page's connection to the database (forget.ts deletes it;
 *  an open connection would hold the deletion back). */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  try { (await p)?.close(); } catch { /* ignore */ }
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
  if (frozen || !autosaveEnabled()) return false;
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

// ------------------------------------------------------------ other keys
// Other per-browser data kept next to the autosave slots (saved
// templates): same database and store, same localStorage fallback, every
// call guarded.
const lsOther = (key: string) => `opendose-${key}`;

export async function readValue(key: string): Promise<unknown> {
  try {
    const v = await idb<unknown>("readonly", (s) => s.get(key));
    if (v !== undefined) return v;
  } catch { /* fall through to localStorage */ }
  try {
    return JSON.parse(localStorage.getItem(lsOther(key)) ?? "null");
  } catch {
    return null;
  }
}

export async function writeValue(key: string, value: unknown): Promise<boolean> {
  if (frozen) return false;
  try {
    await idb("readwrite", (s) => s.put(value, key));
    try { localStorage.removeItem(lsOther(key)); } catch { /* ignore */ }
    return true;
  } catch { /* fall through */ }
  try {
    localStorage.setItem(lsOther(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
