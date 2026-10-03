import { useEffect, useRef, useState } from "react";
import {
  deleteSlot, rotateOnBoot, writeSlot, type AutosaveRecord,
} from "../project/autosave";
import { newId } from "../project/ids";
import { parseProjectFile, serializeProject } from "../project/persist";
import type { Project } from "../project/types";
import { useProject } from "./context";

const DELAY_MS = 800;

/**
 * Autosave the whole project to the browser after every change (debounced),
 * and offer the previous session back on startup.
 */
export function useAutosave() {
  const { store, history, replace, setStatus } = useProject();
  const [offer, setOffer] = useState<AutosaveRecord | null>(null);
  const boot = useRef(history.present);

  useEffect(() => {
    let live = true;
    rotateOnBoot().then((rec) => { if (live && rec) setOffer(rec); })
      .catch(() => { /* storage unavailable */ });
    return () => { live = false; };
  }, []);

  // Nothing is written until the session actually changes something, so
  // merely opening the app never overwrites the session on offer.
  useEffect(() => {
    if (history.present === boot.current) return;
    const p = history.present;
    const t = setTimeout(() => {
      void writeSlot("current", {
        savedAt: Date.now(), title: p.title, sheets: p.sheets.length,
        json: serializeProject(p),
      });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [history.present]);

  const restore = () => {
    if (!offer) return;
    try {
      const p = parseProjectFile(offer.json, { prefs: store.project.prefs, ids: newId });
      replace(p);
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

  return { offer, restore, dismiss, forgetCurrent, markClean };
}
