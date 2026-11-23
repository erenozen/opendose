import { useEffect, useRef, useState } from "react";
import { autosaveKv, type SessionRecord } from "../project/autosave";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection, serializeProject } from "../project/persist";
import {
  requestPersistence, SessionManager, type BootResult, type LocksLike,
} from "../project/sessions";
import type { Project } from "../project/types";
import { notify } from "../components/ui/Toast.store";
import { requestShell } from "./commandRegistry";
import { useProject } from "./context";

const DELAY_MS = 800;

// One session manager per page, booted once (StrictMode runs effects
// twice; a share link boots it only after "Make a copy").
let manager: SessionManager | null = null;
let booting: Promise<BootResult> | null = null;
function sessions(): SessionManager {
  manager ??= new SessionManager({
    kv: autosaveKv,
    locks: browserLocks(),
    tab: tabStorage(),
    newId: () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : newId()),
  });
  return manager;
}
function browserLocks(): LocksLike | null {
  try { return (navigator.locks as LocksLike | undefined) ?? null; } catch { return null; }
}
function tabStorage(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}
// The browser is asked to keep the storage once, after the first write:
// a first look at the example holds nothing worth keeping.
let askedPersistence = false;

const byRecent = (a: SessionRecord, b: SessionRecord) => b.savedAt - a.savedAt;

/**
 * Autosave the project to this tab's own session after every change
 * (debounced), reopen it after a reload, and offer the sessions of closed
 * tabs on startup (project/sessions.ts).
 */
export function useAutosave({ autoOpen }: { autoOpen: boolean }) {
  const { store, history, replace, readOnly, results, selectedId } = useProject();
  const [offers, setOffers] = useState<SessionRecord[]>([]);
  const [heldElsewhere, setHeldElsewhere] = useState<SessionRecord | null>(null);
  const [hidden, setHidden] = useState(false);
  // The sessions have been looked for (whether or not one exists).
  const [checked, setChecked] = useState(readOnly);
  const boot = useRef(history.present);
  // Opened from a share link: the user's own sessions are left alone while
  // the shared project is viewed. After "Make a copy" the copy gets a
  // session of its own; nothing is reopened or offered.
  const [sharedBoot] = useState(readOnly);
  const [mayReopen] = useState(autoOpen && !readOnly);

  /** Put a saved session's project on screen. */
  const show = useRef<(rec: SessionRecord, how: "auto" | "restore" | "copy") => void>(() => {});
  show.current = (rec, how) => {
    try {
      const p = parseProjectFile(rec.json, { prefs: store.project.prefs, ids: newId });
      replace(p, savedSelection(rec.json));
      if (how === "auto") notify(`Reopened your last session, “${rec.title}”.`, { tone: "info" });
      if (how === "copy") {
        notify(`Opened a copy of “${rec.title}”. Edits here are kept as this tab's own session.`,
          { tone: "success" });
      }
    } catch (e) {
      // Object, reason, next step (content.md): the saved copy is unreadable,
      // so the way back is the project file, if one was saved.
      notify(`Could not restore your last session, “${rec.title}”: `
        + `${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}. `
        + "Open its project file if you saved one.", {
        tone: "error",
        action: { label: "Open a project file", onAction: () => requestShell("open") },
      });
    }
  };

  const reopened = useRef(false);
  useEffect(() => {
    if (readOnly) return;
    let live = true;
    booting ??= sessions().boot({ autoOpen: mayReopen });
    booting.then((r) => {
      if (!live) return;
      if (r.reopen && !reopened.current) {
        reopened.current = true;
        show.current(r.reopen, "auto");
      }
      if (!sharedBoot) {
        setOffers(r.offers);
        setHeldElsewhere(r.heldElsewhere);
      }
    }).catch(() => { /* storage unavailable */ })
      .finally(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [readOnly, sharedBoot, mayReopen]);

  // Computed results go into the autosave too (with the fingerprint of
  // their input), so a reload shows them at once and recomputes only what
  // changed; and so does the sheet on screen, reopened next time. Writes
  // are scheduled outside React: results arriving never re-render the app.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const serialize = useRef<() => string>(() => "");
  serialize.current = () => serializeProject(store.project, results.snapshot(),
    { keys: results.fingerprints(), selected: selectedRef.current, compact: true });
  const writeNow = async () => {
    if (!booting) return;
    await booting.catch(() => null);
    const p = store.project;
    const sheet = p.sheets.find((s) => s.id === selectedRef.current)?.name;
    const ok = await sessions().write({
      savedAt: Date.now(), title: p.title, sheets: p.sheets.length,
      ...(sheet ? { sheet } : {}), json: serialize.current(),
    });
    if (ok && !askedPersistence) {
      askedPersistence = true;
      void requestPersistence(typeof navigator !== "undefined" ? navigator.storage : null);
    }
  };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useRef(() => {});
  schedule.current = () => {
    // Nothing is written until the session actually changes something,
    // so merely opening the app never writes a session. A shared project
    // is never written (it is in the link already).
    if (readOnly || store.project === boot.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void writeNow();
    }, DELAY_MS);
  };
  const flush = async () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    await writeNow();
  };
  useEffect(() => results.subscribeAll(() => schedule.current()), [results]);
  useEffect(() => { schedule.current(); }, [history.present, selectedId, readOnly]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // For the e2e scripts (scripts/e2e-check.mjs): this tab's session id
  // and the JSON its autosave writes, as __opendose is.
  useEffect(() => {
    (globalThis as { __opendoseAutosave?: unknown }).__opendoseAutosave = {
      session: () => manager?.tabId ?? null,
      json: () => serialize.current(),
      project: () => serializeProject(store.project),
    };
  }, [store]);

  /** Move this tab onto a session of a closed tab and open it. */
  const restoring = useRef(false);
  const restore = async (id: string) => {
    const rec = offers.find((o) => o.id === id);
    // One at a time: a double click restores once.
    if (!rec || restoring.current) return;
    restoring.current = true;
    await flush();
    const r = await sessions().adopt(id).finally(() => { restoring.current = false; });
    const others = (o: SessionRecord[]) => o.filter((x) => x.id !== id);
    if (r.status === "held") {
      setOffers(others);
      setHeldElsewhere(rec);
      return;
    }
    if (r.status === "gone") {
      setOffers(others);
      notify(`Could not restore “${rec.title}”: it is no longer in this browser, `
        + "so another tab has restored or discarded it. Look for it in your other OpenDose tabs.",
      { tone: "error" });
      return;
    }
    show.current(r.record, "restore");
    // The session this tab had stays kept, and is offered with the rest.
    const released = r.released;
    setOffers((o) => (released ? [...others(o), released].sort(byRecent) : others(o)));
  };

  /** Delete a closed tab's session for good (the banner asks first). */
  const discard = async (id: string) => {
    await sessions().discard(id);
    setOffers((o) => o.filter((x) => x.id !== id));
  };

  /** The session open in another tab, opened here as this tab's own. */
  const copyHeld = () => {
    if (heldElsewhere) show.current(heldElsewhere, "copy");
    setHeldElsewhere(null);
  };

  /** "New project": forget this tab's session too. */
  const forgetCurrent = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void sessions().forgetOwn();
  };

  /** Treat `p` as the untouched starting point (no autosave until edited). */
  const markClean = (p: Project) => { boot.current = p; };

  return {
    checked,
    offers: hidden ? [] : offers,
    heldElsewhere,
    restore, discard, copyHeld,
    hide: () => setHidden(true),
    dismissHeld: () => setHeldElsewhere(null),
    forgetCurrent, markClean,
  };
}

export type AutosaveApi = ReturnType<typeof useAutosave>;
