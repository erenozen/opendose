// Autosave to the browser: IndexedDB when available, localStorage as a
// fallback, and every call guarded (private windows, blocked storage and
// full quotas must never break the app; they only disable autosave).
//
// One record per tab session ("session:<id>"), so two tabs never write
// over each other; sessions.ts decides which tab owns which session and
// what is offered back on the next start. Builds before 2026-11-23 kept
// two shared slots, "current" and "previous": sessions.ts moves them into
// session records once (migrateLegacy).
export interface SessionRecord {
  id: string;
  savedAt: number;   // epoch ms
  title: string;
  sheets: number;
  /** The name of the sheet on screen, to tell sessions of one project apart. */
  sheet?: string;
  json: string;      // serialized project (persist.serializeProject)
}

/** The two shared slots of earlier builds (read only by the migration). */
export const LEGACY_SLOTS = ["current", "previous"] as const;
const SESSION_PREFIX = "session:";
export const sessionKey = (id: string) => `${SESSION_PREFIX}${id}`;
export const isSessionKey = (key: string) => key.startsWith(SESSION_PREFIX);
export const sessionIdOf = (key: string) => key.slice(SESSION_PREFIX.length);

/** A stored autosave record (a session's, or an old slot's without id). */
export function isAutosaveRecord(v: unknown): v is Omit<SessionRecord, "id"> {
  return !!v && typeof v === "object" && typeof (v as SessionRecord).json === "string"
    && typeof (v as SessionRecord).savedAt === "number";
}

// The "Autosave my work in this browser" switch (Preferences): on unless
// set to "off". Off: nothing is written and every kept session is deleted.
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
    const legacy: readonly string[] = LEGACY_SLOTS;
    for (const k of await autosaveKv.keys()) {
      if (isSessionKey(k) || legacy.includes(k)) await autosaveKv.delete(k);
    }
  }
}

// Set by forget.ts while it erases this browser's data: no write may land
// after the erase (a debounced autosave, a template save) and before the
// page reloads.
let frozen = false;
export function freezeStorage(): void { frozen = true; }

export const DB_NAME = "opendose";
const STORE = "autosave";
// localStorage fallback keys: "opendose-autosave-<key>" (the dash keeps
// them apart from the switch, "opendose-autosave").
const LS_PREFIX = "opendose-autosave-";
const lsKey = (key: string) => `${LS_PREFIX}${key}`;

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

/** The autosave records as a key-value store (sessions.ts works on this
 *  shape, so its tests can hand it a Map). */
export interface Kv {
  get(key: string): Promise<unknown>;
  /** False when nothing was written (autosave off, storage full). */
  put(key: string, value: unknown): Promise<boolean>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const autosaveKv: Kv = {
  async get(key) {
    try {
      const v = await idb<unknown>("readonly", (s) => s.get(key));
      if (v !== undefined) return v;
    } catch { /* fall through to localStorage */ }
    try {
      return JSON.parse(localStorage.getItem(lsKey(key)) ?? "null") ?? undefined;
    } catch {
      return undefined;
    }
  },
  async put(key, value) {
    if (frozen || !autosaveEnabled()) return false;
    try {
      await idb("readwrite", (s) => s.put(value, key));
      try { localStorage.removeItem(lsKey(key)); } catch { /* ignore */ }
      return true;
    } catch { /* fall through */ }
    try {
      localStorage.setItem(lsKey(key), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  async delete(key) {
    try { await idb("readwrite", (s) => s.delete(key)); } catch { /* ignore */ }
    try { localStorage.removeItem(lsKey(key)); } catch { /* ignore */ }
  },
  async keys() {
    const out = new Set<string>();
    try {
      const ks = await idb<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
      for (const k of ks ?? []) if (typeof k === "string") out.add(k);
    } catch { /* no database: localStorage only */ }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LS_PREFIX)) out.add(k.slice(LS_PREFIX.length));
      }
    } catch { /* no localStorage */ }
    return [...out];
  },
};

// ------------------------------------------------------------ other keys
// Other per-browser data kept next to the autosave records (saved
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

/** These other keys as a Kv (saved versions, project/versions.ts): the
 *  autosave switch does not stop them, the Forget control erases them. */
export const otherKv: Kv = {
  get: async (key) => (await readValue(key)) ?? undefined,
  put: writeValue,
  async delete(key) {
    try { await idb("readwrite", (s) => s.delete(key)); } catch { /* ignore */ }
    try { localStorage.removeItem(lsOther(key)); } catch { /* ignore */ }
  },
  async keys() {
    const out = new Set<string>();
    try {
      const ks = await idb<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
      for (const k of ks ?? []) if (typeof k === "string") out.add(k);
    } catch { /* no database: localStorage only */ }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("opendose-")) out.add(k.slice("opendose-".length));
      }
    } catch { /* no localStorage */ }
    return [...out];
  },
};
