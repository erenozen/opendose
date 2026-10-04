import { useEffect, useReducer, useRef, useState } from "react";
import {
  deleteSlot, rotateOnBoot, writeSlot, type AutosaveRecord,
} from "../project/autosave";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection, serializeProject } from "../project/persist";
import type { Project } from "../project/types";
import { useProject } from "./context";

const DELAY_MS = 800;

/**
 * Autosave the whole project to the browser after every change (debounced),
 * and offer the previous session back on startup.
 */
export function useAutosave() {
  const { store, history, replace, setStatus, readOnly, results, selectedId } = useProject();
  const [offer, setOffer] = useState<AutosaveRecord | null>(null);
  // The last session has been looked for (whether or not one exists).
  const [checked, setChecked] = useState(readOnly);
  const boot = useRef(history.present);
  // Opened from a share link: the user's own autosave is left alone while
  // the shared project is viewed. After "Make a copy" the last session is
  // rotated into "previous" as on a normal start, but not offered.
  const [sharedBoot] = useState(readOnly);

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    rotateOnBoot().then((rec) => { if (live && rec && !sharedBoot) setOffer(rec); })
      .catch(() => { /* storage unavailable */ })
      .finally(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [readOnly, sharedBoot]);

  // Computed results go into the autosave too (with the fingerprint of
  // their input), so a reload shows them at once and recomputes only what
  // changed; and so does the sheet on screen, reopened next time.
  const [resultsVersion, bumpResults] = useReducer((x: number) => x + 1, 0);
  useEffect(() => results.subscribeAll(bumpResults), [results]);

  // Nothing is written until the session actually changes something, so
  // merely opening the app never overwrites the session on offer. A
  // shared project is never written (it is in the link already).
  useEffect(() => {
    if (readOnly || history.present === boot.current) return;
    const p = history.present;
    const t = setTimeout(() => {
      void writeSlot("current", {
        savedAt: Date.now(), title: p.title, sheets: p.sheets.length,
        json: serializeProject(p, results.snapshot(),
          { keys: results.fingerprints(), selected: selectedId, compact: true }),
      });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [history.present, readOnly, results, resultsVersion, selectedId]);

  /** Reopen the last session. `auto`: opened directly at startup (the
   *  default start mode), said in the status line. */
  const restore = (opts: { auto?: boolean } = {}) => {
    if (!offer) return;
    try {
      const p = parseProjectFile(offer.json, { prefs: store.project.prefs, ids: newId });
      replace(p, savedSelection(offer.json));
      if (opts.auto) setStatus(`Reopened your last session, “${offer.title}”.`);
    } catch (e) {
      setStatus(`Could not restore: ${e instanceof Error ? e.message : e}`);
    }
    setOffer(null);
    void deleteSlot("previous");
  };

  const dismiss = () => {
    setOffer(null);
    void deleteSlot("previous");
  };

  /** "New project": forget this session's autosave too. */
  const forgetCurrent = () => { void deleteSlot("current"); };

  /** Treat `p` as the untouched starting point (no autosave until edited). */
  const markClean = (p: Project) => { boot.current = p; };

  return { offer, checked, restore, dismiss, forgetCurrent, markClean };
}
