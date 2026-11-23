import { useCallback, useEffect, useRef, useState } from "react";
import { dismissToast, notify } from "../components/ui/Toast.store";
import { analyzeAsync } from "../lib/engine";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection } from "../project/persist";
import type { Project } from "../project/types";
import { useProject } from "./context";
import { prepareReproduceCheck } from "./reproduceCheck";
import { prismTableToFamily, type PrismTable } from "./factory";

/** Files Open takes: OpenDose projects and Prism files. */
export const OPEN_ACCEPT = ".json,.pzfx,.prism,.zip";
const PRISM = /\.(pzfx|prism|prism\.zip|zip)$/i;
/** One toast follows an open from "Opening…" to its outcome. */
const TOAST_ID = "open-file";

/**
 * Open button: an OpenDose project (.json, v1 or v2) replaces the project;
 * a Prism file (.pzfx / .prism) adds its data tables to the project as new
 * families (one picked from a chooser, or all of them).
 *
 * Feedback (DECISIONS 6): a progress toast while the file is read (Prism
 * files wait for the engine), resolved in place; a failure is an error
 * toast with "Choose another file". Ctrl/Cmd+O opens the file picker.
 * `into`: the project imported Prism tables go into (the open one when
 * not given).
 */
export function useFileOpen(into?: (p: Project) => Project) {
  const { apply, replace, select, store, engineReady } = useProject();
  const [prismTables, setPrismTables] = useState<PrismTable[] | null>(null);
  const engineReadyRef = useRef(engineReady);
  engineReadyRef.current = engineReady;
  const intoRef = useRef(into);
  intoRef.current = into;

  const importTables = useCallback((tables: PrismTable[]) => {
    let first = "";
    apply((p) => {
      let next = intoRef.current ? intoRef.current(p) : p;
      for (const t of tables) {
        const r = prismTableToFamily(next, t, newId);
        next = r.project;
        if (!first) first = r.dataId;
      }
      return next;
    });
    setPrismTables(null);
    if (first) select(first);
    notify(`Imported ${tables.length} data table${tables.length === 1 ? "" : "s"} from the `
      + "Prism file; analyses are recomputed here.", { tone: "success", id: TOAST_ID });
  }, [apply, select]);

  const openPrism = useCallback(async (file: File) => {
    // Sent as bytes for both formats: a .prism file is a zip archive, and
    // reading one as text would corrupt it. The engine tells them apart.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = await analyzeAsync({
      analysis: "pzfx_import",
      data: { pzfx_b64: btoa(binary) },
      options: {},
    }, { priority: "user" }) as { error?: string; tables?: PrismTable[] };
    if (res.error || !res.tables?.length) {
      throw new Error(res.error ?? "no tables found");
    }
    if (res.tables.length === 1) importTables(res.tables);
    else {
      // The chooser banner is the next step; it says what to do.
      dismissToast(TOAST_ID);
      setPrismTables(res.tables);
    }
  }, [importTables]);

  // `pick` and `open` refer to each other ("Choose another file").
  const pickRef = useRef<() => void>(() => {});

  const open = useCallback(async (file: File) => {
    const prism = PRISM.test(file.name);
    notify(prism && !engineReadyRef.current
      ? `Opening “${file.name}” once the analysis engine has loaded…`
      : `Opening “${file.name}”…`, { tone: "progress", id: TOAST_ID });
    try {
      if (prism) {
        await openPrism(file);
        return;
      }
      const text = await file.text();
      const project = parseProjectFile(text, { prefs: store.project.prefs, ids: newId });
      // Saved by another build: recompute and compare (stable-results-versions).
      replace(prepareReproduceCheck(text, project, file.name), savedSelection(text));
      notify(`Opened “${file.name}”.`, { tone: "success", id: TOAST_ID });
    } catch (e) {
      notify(`Could not open “${file.name}”: ${e instanceof Error ? e.message : e}`, {
        tone: "error", id: TOAST_ID,
        action: { label: "Choose another file", onAction: () => pickRef.current() },
      });
    }
  }, [openPrism, replace, store]);

  /** Opens the system file picker; the chosen file is opened. */
  const pick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = OPEN_ACCEPT;
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) void open(f);
    }, { once: true });
    input.click();
  }, [open]);
  pickRef.current = pick;

  // Ctrl/Cmd+O: Open, as in every desktop app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "o") return;
      if ((e.target as HTMLElement)?.closest?.("dialog")) return;
      e.preventDefault();
      pickRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, prismTables, importTables, dismissPrism: () => setPrismTables(null) };
}
