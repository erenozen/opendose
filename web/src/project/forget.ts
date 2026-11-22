// "Forget this computer's data" (Preferences): erase everything OpenDose
// keeps in this browser, for shared lab computers.
//
// Erased: the IndexedDB database (autosaved sessions, saved templates) and
// every localStorage / sessionStorage entry whose key starts with
// "opendose-" or "opendose." (autosave fallbacks, import recipes, plate
// layouts, "My equations", settings). Entries of anything else served from
// the same origin are left alone. Kept: files the user saved, and the
// service worker's offline copy of the app, which holds no data.
import { closeDb, DB_NAME, freezeStorage } from "./autosave.ts";

type KeyStore = Pick<Storage, "length" | "key" | "removeItem">;

/** Is this storage key one of OpenDose's? */
export function isOpendoseKey(key: string): boolean {
  return key.startsWith("opendose-") || key.startsWith("opendose.");
}

/** Remove OpenDose's entries from a Storage; returns how many. */
export function clearOpendoseKeys(storage: KeyStore): number {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && isOpendoseKey(k)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}

export interface ForgetOutcome {
  /** Storage entries removed. */
  entries: number;
  /** The database: deleted, held open by another OpenDose tab, or absent. */
  database: "deleted" | "blocked" | "unavailable";
}

function deleteDatabase(): Promise<ForgetOutcome["database"]> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve("unavailable"); return; }
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve("deleted");
      req.onerror = () => resolve("unavailable");
      // Another tab still has it open: the deletion completes when that
      // tab closes, but say so now.
      req.onblocked = () => resolve("blocked");
    } catch {
      resolve("unavailable");
    }
  });
}

/** Erase OpenDose's data from this browser. Nothing is written afterwards
 *  (the caller reloads the page). */
export async function forgetBrowserData(): Promise<ForgetOutcome> {
  freezeStorage();
  await closeDb();
  let entries = 0;
  for (const get of [() => globalThis.localStorage, () => globalThis.sessionStorage]) {
    try {
      const s = get();
      if (s) entries += clearOpendoseKeys(s);
    } catch { /* storage unavailable */ }
  }
  return { entries, database: await deleteDatabase() };
}
