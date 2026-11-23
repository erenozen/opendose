// Autosave sessions: one per tab, so tabs never write over each other.
//
// - A tab's session id lives in sessionStorage, which is per tab and
//   survives a reload of that tab. The tab holds a Web Lock named after
//   its session for as long as it is open; the browser releases it when
//   the tab closes or navigates away.
// - A session whose lock nobody holds belongs to a tab that has closed:
//   it is offered back on the next start. A duplicated tab copies the
//   sessionStorage id, but the lock is still held by the original, so the
//   copy starts a session of its own and says so (heldElsewhere).
// - At most MAX_KEPT sessions of closed tabs are kept: at each start the
//   oldest beyond that are deleted. Restoring a session moves the tab onto
//   it (no copy is made); discarding deletes it.
// - Without Web Locks (browsers before 2022) no tab can tell whether
//   another is open: every other session is offered, and restoring one
//   copies it into a new session and deletes the original, so two tabs
//   still never share a record.
//
// Everything storage-specific comes in through SessionDeps, so the unit
// tests run this on a Map, a fake lock manager and a fake sessionStorage.
import {
  isAutosaveRecord, isSessionKey, LEGACY_SLOTS, sessionIdOf, sessionKey,
  type Kv, type SessionRecord,
} from "./autosave.ts";

export const MAX_KEPT = 10;
/** sessionStorage key of this tab's session id. */
export const TAB_KEY = "opendose-session";
const LOCK_PREFIX = "opendose-session:";
/** After a reload the old page's lock can outlive it by a moment. */
export const RELOAD_WAIT_MS = 1500;

/** The parts of navigator.locks used here. */
export interface LocksLike {
  request(name: string, options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown> | unknown): Promise<unknown>;
  query(): Promise<{ held?: { name?: string }[] }>;
}

export interface SessionDeps {
  kv: Kv;
  locks: LocksLike | null;
  tab: Pick<Storage, "getItem" | "setItem"> | null;
  newId: () => string;
  /** How long a reloaded tab waits for its old page's lock (tests: less). */
  reloadWaitMs?: number;
}

// ------------------------------------------------------------ locks

/** This page's session locks. Without a lock manager every claim succeeds
 *  and `known` is false. */
export class Claims {
  private held = new Map<string, { release: () => void; done: Promise<unknown> }>();
  private locks: LocksLike | null;
  constructor(locks: LocksLike | null) { this.locks = locks; }

  get known(): boolean { return !!this.locks; }

  /** Take the lock of session `id`: at once, or within `waitMs`. */
  claim(id: string, waitMs = 0): Promise<boolean> {
    const locks = this.locks;
    if (!locks || this.held.has(id)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const entry = { release: () => {}, done: Promise.resolve() as Promise<unknown> };
      const hold = new Promise<void>((r) => { entry.release = r; });
      const ctl = waitMs > 0 ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), waitMs) : null;
      entry.done = Promise.resolve(locks.request(LOCK_PREFIX + id,
        ctl ? { signal: ctl.signal } : { ifAvailable: true },
        async (lock) => {
          if (timer) clearTimeout(timer);
          if (!lock) { resolve(false); return; }
          this.held.set(id, entry);
          resolve(true);
          await hold;
        })).catch(() => { resolve(false); });
    });
  }

  /** Let go of session `id`; resolves once the lock is free for others. */
  async release(id: string): Promise<void> {
    const h = this.held.get(id);
    if (!h) return;
    this.held.delete(id);
    h.release();
    await h.done;
  }

  /** Sessions whose lock another page holds. */
  async heldElsewhere(): Promise<Set<string>> {
    const out = new Set<string>();
    if (!this.locks) return out;
    try {
      const q = await this.locks.query();
      for (const l of q.held ?? []) {
        const id = l.name?.startsWith(LOCK_PREFIX) ? l.name.slice(LOCK_PREFIX.length) : null;
        if (id && !this.held.has(id)) out.add(id);
      }
    } catch { /* no answer: treat every session as free */ }
    return out;
  }
}

// ------------------------------------------------------------ records

export async function readSession(kv: Kv, id: string): Promise<SessionRecord | null> {
  const v = await kv.get(sessionKey(id));
  return isAutosaveRecord(v) ? { ...v, id } : null;
}

/** Every kept session, most recently saved first. */
export async function listSessions(kv: Kv): Promise<SessionRecord[]> {
  const out: SessionRecord[] = [];
  for (const k of await kv.keys()) {
    if (!isSessionKey(k)) continue;
    const r = await readSession(kv, sessionIdOf(k));
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Move the shared "current" and "previous" slots of earlier builds into
 *  sessions of their own, so an upgrade offers back what was there. The
 *  new record is written before the old slot is deleted, and its id comes
 *  from the slot and its save time, so a second run (another tab, or one
 *  interrupted half-way) writes the same record again: idempotent and
 *  lossless. Two slots holding the same project become one session.
 *  Returns the ids written. */
export async function migrateLegacy(kv: Kv): Promise<string[]> {
  const written: string[] = [];
  const seen = new Set<string>();
  for (const slot of [...LEGACY_SLOTS]) {
    const v = await kv.get(slot);
    if (!isAutosaveRecord(v)) continue;
    if (!seen.has(v.json)) {
      const id = `legacy-${slot}-${v.savedAt}`;
      const rec: SessionRecord = {
        id, savedAt: v.savedAt, json: v.json,
        title: typeof v.title === "string" ? v.title : "Untitled project",
        sheets: typeof v.sheets === "number" ? v.sheets : 0,
      };
      // Not written (storage full, autosave off): keep the old slot.
      if (!await kv.put(sessionKey(id), rec)) continue;
      written.push(id);
      seen.add(v.json);
    }
    await kv.delete(slot);
  }
  return written;
}

// ------------------------------------------------------------ the tab

export interface BootResult {
  /** This tab's own session after a reload, or the one session of a closed
   *  tab when exactly one is kept: open it at once. */
  reopen: SessionRecord | null;
  /** Sessions of closed tabs, most recent first. */
  offers: SessionRecord[];
  /** The session this tab had is open in another tab (a duplicated tab). */
  heldElsewhere: SessionRecord | null;
}

export type AdoptResult =
  | { status: "ok"; record: SessionRecord; released: SessionRecord | null }
  | { status: "held" }
  | { status: "gone" };

export class SessionManager {
  tabId = "";
  readonly claims: Claims;
  private d: SessionDeps;
  constructor(d: SessionDeps) {
    this.d = d;
    this.claims = new Claims(d.locks);
  }

  private remember(id: string) {
    this.tabId = id;
    try { this.d.tab?.setItem(TAB_KEY, id); } catch { /* no sessionStorage */ }
  }

  /** Decide this tab's session and what to offer. `autoOpen`: the start
   *  may reopen a session directly (false for ?example=1 and share links:
   *  then everything is offered instead). */
  async boot({ autoOpen }: { autoOpen: boolean }): Promise<BootResult> {
    const { kv } = this.d;
    await migrateLegacy(kv);
    let prev: string | null = null;
    try { prev = this.d.tab?.getItem(TAB_KEY) ?? null; } catch { /* no sessionStorage */ }
    let reopen: SessionRecord | null = null;
    let heldElsewhere: SessionRecord | null = null;
    if (prev && await this.claims.claim(prev, this.d.reloadWaitMs ?? RELOAD_WAIT_MS)) {
      const rec = await readSession(kv, prev);
      if (!rec || autoOpen) { this.remember(prev); reopen = rec; }
      // Not reopened: it is offered below, and this tab writes elsewhere.
      else await this.claims.release(prev);
    } else if (prev) {
      heldElsewhere = await readSession(kv, prev);
    }
    if (!this.tabId) {
      const id = this.d.newId();
      await this.claims.claim(id);
      this.remember(id);
    }
    const busy = await this.claims.heldElsewhere();
    let offers = (await listSessions(kv)).filter((r) => r.id !== this.tabId && !busy.has(r.id));
    offers = await this.prune(offers);
    if (!reopen && autoOpen && offers.length === 1) {
      const r = await this.adopt(offers[0].id);
      if (r.status === "ok") { reopen = r.record; offers = []; }
    }
    return { reopen, offers, heldElsewhere };
  }

  /** Keep the MAX_KEPT most recent sessions of closed tabs; delete the
   *  rest (each under its lock, so a tab restoring one at that moment
   *  keeps it). Returns the kept ones. */
  private async prune(offers: SessionRecord[]): Promise<SessionRecord[]> {
    for (const r of offers.slice(MAX_KEPT)) {
      if (!await this.claims.claim(r.id)) continue;
      await this.d.kv.delete(sessionKey(r.id));
      await this.claims.release(r.id);
    }
    return offers.slice(0, MAX_KEPT);
  }

  /** Write this tab's session. */
  write(rec: Omit<SessionRecord, "id">): Promise<boolean> {
    if (!this.tabId) return Promise.resolve(false);
    return this.d.kv.put(sessionKey(this.tabId), { ...rec, id: this.tabId });
  }

  /** "New project": this tab's saved session is deleted. */
  forgetOwn(): Promise<void> {
    return this.tabId ? this.d.kv.delete(sessionKey(this.tabId)) : Promise.resolve();
  }

  /** Move this tab onto session `id` (Restore). The session this tab had
   *  stays in storage and is returned as `released`, to be offered. */
  async adopt(id: string): Promise<AdoptResult> {
    const { kv } = this.d;
    const old = this.tabId;
    if (!this.claims.known) {
      const rec = await readSession(kv, id);
      if (!rec) return { status: "gone" };
      const fresh = this.d.newId();
      if (!await kv.put(sessionKey(fresh), { ...rec, id: fresh })) return { status: "gone" };
      await kv.delete(sessionKey(id));
      this.remember(fresh);
      return { status: "ok", record: rec, released: old ? await readSession(kv, old) : null };
    }
    if (!await this.claims.claim(id)) return { status: "held" };
    const rec = await readSession(kv, id);
    if (!rec) { await this.claims.release(id); return { status: "gone" }; }
    this.remember(id);
    if (old && old !== id) await this.claims.release(old);
    return { status: "ok", record: rec, released: old && old !== id ? await readSession(kv, old) : null };
  }

  /** Delete a session of a closed tab. "held": another tab has it open. */
  async discard(id: string): Promise<"ok" | "held"> {
    if (!await this.claims.claim(id)) return "held";
    await this.d.kv.delete(sessionKey(id));
    await this.claims.release(id);
    return "ok";
  }
}

// ------------------------------------------------------------ storage

/** The parts of navigator.storage used here. */
export interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

/** Ask the browser to keep this site's storage (once it holds work).
 *  Returns the answer, or null when the browser cannot be asked. */
export async function requestPersistence(sm: StorageManagerLike | null | undefined): Promise<boolean | null> {
  if (!sm?.persist) return null;
  try {
    if (sm.persisted && await sm.persisted()) return true;
    return await sm.persist();
  } catch {
    return null;
  }
}

export interface StorageReport {
  usage: number | null;
  quota: number | null;
  /** null: the browser does not say. */
  persisted: boolean | null;
}

export async function storageReport(sm: StorageManagerLike | null | undefined): Promise<StorageReport> {
  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;
  try {
    const e = await sm?.estimate?.();
    if (typeof e?.usage === "number") usage = e.usage;
    if (typeof e?.quota === "number") quota = e.quota;
  } catch { /* not answered */ }
  try {
    if (sm?.persisted) persisted = await sm.persisted();
  } catch { /* not answered */ }
  return { usage, quota, persisted };
}

/** Bytes in decimal units, as browsers report quotas: "820 kB", "48 MB",
 *  with a no-break space so the value never wraps away from its unit. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1000) return `${Math.round(n)}\u00a0B`;
  const units = ["kB", "MB", "GB", "TB"];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}\u00a0${units[i]}`;
}

/** The Preferences line about this browser's storage. */
export function describeStorage(r: StorageReport): string {
  const parts: string[] = [];
  if (r.usage !== null) {
    parts.push(`OpenDose uses ${formatBytes(r.usage)} of this browser's storage`
      + `${r.quota !== null ? ` (${formatBytes(r.quota)} allowed)` : ""}, the offline copy of the app included.`);
  }
  if (r.persisted === true) {
    parts.push("Persistent storage: granted. The browser keeps it until you delete it.");
  } else if (r.persisted === false) {
    parts.push("Persistent storage: not granted. The browser may clear it when space runs low "
      + "or after weeks without a visit, so save projects you need as files.");
  } else {
    parts.push("This browser does not say whether it keeps this storage, so save projects you need as files.");
  }
  return parts.join(" ");
}
