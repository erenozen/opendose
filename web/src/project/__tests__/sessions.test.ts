// Autosave sessions (sessions.ts): one per tab, decided with Web Locks,
// the one-time move of the old shared slots, the bound on kept sessions,
// and the storage line. Locks, sessionStorage and the StorageManager are
// fakes; the store is a Map (and, for the migration, the real localStorage
// fallback of autosave.ts on a fake localStorage).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { autosaveKv, sessionKey, type Kv, type SessionRecord } from "../autosave.ts";
import {
  describeStorage, formatBytes, listSessions, MAX_KEPT, migrateLegacy, requestPersistence,
  SessionManager, storageReport, TAB_KEY, type LocksLike, type StorageManagerLike,
} from "../sessions.ts";

function mapKv(init: Record<string, unknown> = {}): Kv & { m: Map<string, unknown> } {
  const m = new Map<string, unknown>(Object.entries(init));
  return {
    m,
    get: async (k) => m.get(k),
    put: async (k, v) => { m.set(k, structuredClone(v)); return true; },
    delete: async (k) => { m.delete(k); },
    keys: async () => [...m.keys()],
  };
}

/** A lock manager shared by every "tab" of one test, as the browser's is
 *  per origin: exclusive locks, ifAvailable, a queue with abort. */
function fakeLocks(): LocksLike {
  const held = new Set<string>();
  const queue = new Map<string, (() => void)[]>();
  const grant = (name: string, cb: (l: unknown) => unknown) => {
    held.add(name);
    return Promise.resolve().then(() => cb({ name })).finally(() => {
      held.delete(name);
      const next = queue.get(name)?.shift();
      if (next) next();
    });
  };
  return {
    request(name, opts, cb) {
      if (!held.has(name)) return grant(name, cb);
      if (opts.ifAvailable) return Promise.resolve().then(() => cb(null));
      return new Promise((resolve, reject) => {
        const go = () => { opts.signal?.removeEventListener("abort", onAbort); grant(name, cb).then(resolve, reject); };
        const onAbort = () => {
          const q = queue.get(name) ?? [];
          queue.set(name, q.filter((f) => f !== go));
          reject(new DOMException("aborted", "AbortError"));
        };
        opts.signal?.addEventListener("abort", onAbort);
        queue.set(name, [...(queue.get(name) ?? []), go]);
      });
    },
    query: async () => ({ held: [...held].map((name) => ({ name })) }),
  };
}

function tabStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

let n = 0;
const ids = () => `t${++n}`;
const rec = (title: string, savedAt: number, json = `{"title":"${title}"}`) =>
  ({ savedAt, title, sheets: 1, json });

function tab(kv: Kv, locks: LocksLike | null, store = tabStore()) {
  return { store, mgr: new SessionManager({ kv, locks, tab: store, newId: ids, reloadWaitMs: 50 }) };
}
const close = (t: { mgr: SessionManager }) => t.mgr.claims.release(t.mgr.tabId);

test("two tabs write two sessions; a new tab offers both and each restores its own", async () => {
  const kv = mapKv();
  const locks = fakeLocks();
  const a = tab(kv, locks);
  assert.deepEqual(await a.mgr.boot({ autoOpen: true }), { reopen: null, offers: [], heldElsewhere: null });
  await a.mgr.write(rec("Dose response", 1000, "A-json"));
  // B opens while A is live: A is not offered and B gets its own session.
  const b = tab(kv, locks);
  const bBoot = await b.mgr.boot({ autoOpen: true });
  assert.equal(bBoot.offers.length, 0);
  assert.notEqual(b.mgr.tabId, a.mgr.tabId);
  await b.mgr.write(rec("Untitled project", 2000, "B-json"));
  await a.mgr.write(rec("Dose response", 3000, "A-json-2"));
  assert.equal((await kv.get(sessionKey(a.mgr.tabId)) as SessionRecord).json, "A-json-2");
  assert.equal((await kv.get(sessionKey(b.mgr.tabId)) as SessionRecord).json, "B-json");
  const [aId, bId] = [a.mgr.tabId, b.mgr.tabId];
  await close(a);
  await close(b);

  const c = tab(kv, locks);
  const boot = await c.mgr.boot({ autoOpen: true });
  assert.equal(boot.reopen, null, "two sessions: nothing reopens by itself");
  assert.deepEqual(boot.offers.map((r) => [r.id, r.title, r.savedAt, r.json]),
    [[aId, "Dose response", 3000, "A-json-2"], [bId, "Untitled project", 2000, "B-json"]]);
  const ra = await c.mgr.adopt(aId);
  assert.ok(ra.status === "ok" && ra.record.json === "A-json-2" && ra.released === null);
  assert.equal(c.mgr.tabId, aId);
  assert.equal(c.store.m.get(TAB_KEY), aId);
  const rb = await c.mgr.adopt(bId);
  assert.ok(rb.status === "ok" && rb.record.json === "B-json");
  // The session C left is free again and still kept (offered back).
  assert.ok(rb.status === "ok" && rb.released?.id === aId && rb.released.json === "A-json-2");
  const d = tab(kv, locks);
  assert.deepEqual((await d.mgr.boot({ autoOpen: false })).offers.map((r) => r.id), [aId]);
});

test("a reload of the same tab reopens its own session; a new tab never takes a live one", async () => {
  const kv = mapKv();
  const locks = fakeLocks();
  const a = tab(kv, locks);
  await a.mgr.boot({ autoOpen: true });
  await a.mgr.write(rec("Assay 3", 10, "own"));
  const id = a.mgr.tabId;
  const other = tab(kv, locks);
  const ob = await other.mgr.boot({ autoOpen: true });
  assert.equal(ob.reopen, null);
  assert.equal(ob.offers.length, 0, "a live tab's session is never offered elsewhere");
  // Reload: the old page goes (its lock with it), the tab's sessionStorage stays.
  await close(a);
  const again = tab(kv, locks, a.store);
  const r = await again.mgr.boot({ autoOpen: true });
  assert.equal(r.reopen?.json, "own");
  assert.equal(again.mgr.tabId, id);
});

test("the lock of a reloaded page that is released late is waited for", async () => {
  const kv = mapKv();
  const locks = fakeLocks();
  const a = tab(kv, locks);
  await a.mgr.boot({ autoOpen: true });
  await a.mgr.write(rec("Assay 3", 10, "own"));
  const again = tab(kv, locks, a.store);
  setTimeout(() => { void close(a); }, 10);
  const r = await again.mgr.boot({ autoOpen: true });
  assert.equal(r.reopen?.json, "own");
  assert.equal(r.heldElsewhere, null);
});

test("a duplicated tab starts its own session and reports the one held elsewhere", async () => {
  const kv = mapKv();
  const locks = fakeLocks();
  const a = tab(kv, locks);
  await a.mgr.boot({ autoOpen: true });
  await a.mgr.write(rec("Assay 3", 10, "own"));
  const dup = tab(kv, locks, tabStore(Object.fromEntries(a.store.m)));
  const r = await dup.mgr.boot({ autoOpen: true });
  assert.equal(r.heldElsewhere?.id, a.mgr.tabId);
  assert.equal(r.reopen, null);
  assert.notEqual(dup.mgr.tabId, a.mgr.tabId);
  assert.equal(dup.store.m.get(TAB_KEY), dup.mgr.tabId);
  await dup.mgr.write(rec("Assay 3", 20, "dup"));
  assert.equal((await kv.get(sessionKey(a.mgr.tabId)) as SessionRecord).json, "own", "never written by the copy");
  assert.equal(await dup.mgr.adopt(a.mgr.tabId).then((x) => x.status), "held");
  assert.equal(await dup.mgr.discard(a.mgr.tabId), "held");
});

test("?example=1 (no auto open) offers the tab's own last session and writes elsewhere", async () => {
  const kv = mapKv();
  const locks = fakeLocks();
  const a = tab(kv, locks);
  await a.mgr.boot({ autoOpen: true });
  await a.mgr.write(rec("Two-factor", 10, "mine"));
  const id = a.mgr.tabId;
  await close(a);
  const again = tab(kv, locks, a.store);
  const r = await again.mgr.boot({ autoOpen: false });
  assert.equal(r.reopen, null);
  assert.deepEqual(r.offers.map((o) => o.id), [id]);
  assert.notEqual(again.mgr.tabId, id);
  await again.mgr.write(rec("Example", 20, "example edit"));
  assert.equal((await kv.get(sessionKey(id)) as SessionRecord).json, "mine");
});

test("one session of a closed tab reopens directly on a normal start", async () => {
  const kv = mapKv({ [sessionKey("old")]: rec("Assay", 5, "old-json") });
  const t = tab(kv, fakeLocks());
  const r = await t.mgr.boot({ autoOpen: true });
  assert.equal(r.reopen?.json, "old-json");
  assert.deepEqual(r.offers, []);
  assert.equal(t.mgr.tabId, "old");
});

test(`at most ${MAX_KEPT} sessions of closed tabs are kept: the oldest go, live ones stay`, async () => {
  const init: Record<string, unknown> = {};
  for (let i = 1; i <= MAX_KEPT + 3; i++) init[sessionKey(`s${i}`)] = { id: `s${i}`, ...rec(`P${i}`, i) };
  const kv = mapKv(init);
  const locks = fakeLocks();
  // s1 (the oldest) is open in a live tab: neither offered nor deleted.
  const live = tab(kv, locks, tabStore({ [TAB_KEY]: "s1" }));
  await live.mgr.boot({ autoOpen: true });
  assert.equal(live.mgr.tabId, "s1");
  const t = tab(kv, locks);
  const r = await t.mgr.boot({ autoOpen: false });
  assert.equal(r.offers.length, MAX_KEPT);
  assert.deepEqual(r.offers.map((o) => o.id), Array.from({ length: MAX_KEPT }, (_, i) => `s${MAX_KEPT + 3 - i}`));
  const left = (await listSessions(kv)).map((o) => o.id).sort();
  assert.ok(left.includes("s1"), "the live session is kept");
  assert.ok(!left.includes("s2") && !left.includes("s3"), "the two oldest closed ones are deleted");
  assert.equal(left.length, MAX_KEPT + 1);
});

test("discard deletes a closed tab's session; New project deletes the tab's own", async () => {
  const kv = mapKv({ [sessionKey("x")]: rec("X", 1) });
  const t = tab(kv, fakeLocks());
  await t.mgr.boot({ autoOpen: false });
  assert.equal(await t.mgr.discard("x"), "ok");
  assert.equal(kv.m.has(sessionKey("x")), false);
  await t.mgr.write(rec("Mine", 2));
  await t.mgr.forgetOwn();
  assert.equal(kv.m.has(sessionKey(t.mgr.tabId)), false);
});

test("without Web Locks every other session is offered and a restore copies, never shares", async () => {
  const kv = mapKv({ [sessionKey("x")]: rec("X", 1, "x-json"), [sessionKey("y")]: rec("Y", 2, "y-json") });
  const t = tab(kv, null);
  const r = await t.mgr.boot({ autoOpen: true });
  assert.equal(r.reopen, null);
  assert.deepEqual(r.offers.map((o) => o.id), ["y", "x"]);
  const a = await t.mgr.adopt("x");
  assert.ok(a.status === "ok" && a.record.json === "x-json");
  assert.ok(!["x", "y"].includes(t.mgr.tabId));
  assert.equal(kv.m.has(sessionKey("x")), false);
  assert.equal((kv.m.get(sessionKey(t.mgr.tabId)) as SessionRecord).json, "x-json");
});

test("the old shared slots move into sessions once: idempotent and lossless", async () => {
  const cur = rec("Assay 3", 200, "cur-json");
  const prev = rec("Assay 2", 100, "prev-json");
  const kv = mapKv({ current: cur, previous: prev, templates: [{ name: "kept" }] });
  const ids1 = await migrateLegacy(kv);
  assert.deepEqual(ids1, ["legacy-current-200", "legacy-previous-100"]);
  assert.equal(kv.m.has("current") || kv.m.has("previous"), false);
  const snapshot = JSON.stringify([...kv.m].sort());
  assert.deepEqual(await migrateLegacy(kv), [], "a second run finds nothing to move");
  assert.equal(JSON.stringify([...kv.m].sort()), snapshot);
  assert.deepEqual((await listSessions(kv)).map((r) => [r.title, r.json]),
    [["Assay 3", "cur-json"], ["Assay 2", "prev-json"]]);
  assert.deepEqual(kv.m.get("templates"), [{ name: "kept" }], "other records are left alone");

  // Interrupted after writing the session but before deleting the slot:
  // the rerun writes the same record again, nothing is doubled.
  const half = mapKv({ current: cur, [sessionKey("legacy-current-200")]: { id: "legacy-current-200", ...cur } });
  await migrateLegacy(half);
  assert.deepEqual([...half.m.keys()], [sessionKey("legacy-current-200")]);

  // The same project in both slots becomes one session.
  const same = mapKv({ current: cur, previous: { ...cur, savedAt: 150 } });
  await migrateLegacy(same);
  assert.deepEqual([...same.m.keys()], [sessionKey("legacy-current-200")]);
});

test("a session written the old way (localStorage fallback) is offered after the upgrade", async () => {
  const ls = new Map<string, string>();
  const fake = {
    get length() { return ls.size; },
    key: (i: number) => [...ls.keys()][i] ?? null,
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => { ls.set(k, v); },
    removeItem: (k: string) => { ls.delete(k); },
  };
  const g = globalThis as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = fake;
  try {
    // Exactly what the old writeSlot("previous", …) left without IndexedDB.
    ls.set("opendose-autosave-previous", JSON.stringify(rec("Old work", 42, "old-json")));
    ls.set("opendose-templates", "[]");
    const t = new SessionManager({ kv: autosaveKv, locks: fakeLocks(), tab: tabStore(), newId: ids });
    const r = await t.boot({ autoOpen: false });
    assert.deepEqual(r.offers.map((o) => [o.id, o.title, o.json]), [["legacy-previous-42", "Old work", "old-json"]]);
    assert.equal(ls.has("opendose-autosave-previous"), false);
    assert.ok(ls.has("opendose-autosave-session:legacy-previous-42"));
    assert.equal(ls.get("opendose-templates"), "[]");
  } finally {
    g.localStorage = before;
  }
});

test("persistence is asked for once there is work, and never promised", async () => {
  let asked = 0;
  const sm = (granted: boolean, already = false): StorageManagerLike => ({
    persisted: async () => already,
    persist: async () => { asked++; return granted; },
    estimate: async () => ({ usage: 48_200_000, quota: 2_147_483_648 }),
  });
  assert.equal(await requestPersistence(sm(true)), true);
  assert.equal(await requestPersistence(sm(false)), false);
  assert.equal(asked, 2);
  assert.equal(await requestPersistence(sm(false, true)), true);
  assert.equal(asked, 2, "already persistent: not asked again");
  assert.equal(await requestPersistence({}), null);
  assert.equal(await requestPersistence(null), null);

  assert.deepEqual(await storageReport(sm(false)), { usage: 48_200_000, quota: 2_147_483_648, persisted: false });
  assert.equal(describeStorage(await storageReport(sm(false, true))),
    "OpenDose uses 48\u00a0MB of this browser's storage (2.1\u00a0GB allowed), the offline copy of the app included. "
    + "Persistent storage: granted. The browser keeps it until you delete it.");
  assert.equal(describeStorage(await storageReport(sm(false))),
    "OpenDose uses 48\u00a0MB of this browser's storage (2.1\u00a0GB allowed), the offline copy of the app included. "
    + "Persistent storage: not granted. The browser may clear it when space runs low or after weeks "
    + "without a visit, so save projects you need as files.");
  assert.equal(describeStorage(await storageReport({})),
    "This browser does not say whether it keeps this storage, so save projects you need as files.");
  const broken: StorageManagerLike = {
    estimate: async () => { throw new Error("no"); }, persisted: async () => { throw new Error("no"); },
  };
  assert.deepEqual(await storageReport(broken), { usage: null, quota: null, persisted: null });
});

test("bytes read in decimal units", () => {
  assert.equal(formatBytes(0), "0\u00a0B");
  assert.equal(formatBytes(999), "999\u00a0B");
  assert.equal(formatBytes(1000), "1\u00a0kB");
  assert.equal(formatBytes(820_400), "820\u00a0kB");
  assert.equal(formatBytes(1_460_000), "1.5\u00a0MB");
  assert.equal(formatBytes(48_200_000), "48\u00a0MB");
  assert.equal(formatBytes(2_147_483_648), "2.1\u00a0GB");
  assert.equal(formatBytes(NaN), "");
});
