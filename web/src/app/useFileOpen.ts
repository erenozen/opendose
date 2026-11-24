import { useCallback, useEffect, useRef, useState } from "react";
import { dismissToast, notify } from "../components/ui/Toast.store";
import { analyzeAsync } from "../lib/engine";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection } from "../project/persist";
import type { Project } from "../project/types";
import { isExampleProject } from "../guide/firstRun";
import { useProject } from "./context";
import { prepareReproduceCheck } from "./reproduceCheck";
import { prismTableToFamily, type PrismTable } from "./factory";
import { openTableFile, TABLE_OPEN, TABLE_OPEN_ACCEPT } from "./tableFile";
import { infoSheetsFromPrism, type PzfxInfo } from "../share/pzfx";
import { canPickFiles, linkFile, openPicker, type FileHandleLike } from "./fileSave";

/** Files Open takes: OpenDose projects, Prism files and one table file
 *  (CSV, TSV, text, .xlsx, .xls, .ods), which goes to the Import dialog. */
export const OPEN_ACCEPT = `.json,.pzfx,.prism,.zip,${TABLE_OPEN_ACCEPT}`;
export const OPENABLE = /\.(json|pzfx|prism|zip)$/i;
const PRISM = /\.(pzfx|prism|prism\.zip|zip)$/i;
/** One toast follows an open from "Opening…" to its outcome. */
const TOAST_ID = "open-file";

/**
 * Open button: an OpenDose project (.json, v1 or v2) replaces the project;
 * a Prism file (.pzfx / .prism) adds its data tables to the project as new
 * families (one picked from a chooser, or all of them); a table file
 * (CSV, TSV, text, a workbook) opens the Import dialog for a new table.
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

  // The opened file's Info sheets (constants and notes), added with its tables.
  const prismInfo = useRef<PzfxInfo[]>([]);
  const importTables = useCallback((tables: PrismTable[]) => {
    let first = "";
    let infoAdded = 0;
    apply((p) => {
      let next = intoRef.current ? intoRef.current(p) : p;
      for (const t of tables) {
        const r = prismTableToFamily(next, t, newId);
        next = r.project;
        if (!first) first = r.dataId;
      }
      const before = next.sheets.length;
      next = infoSheetsFromPrism(next, prismInfo.current, newId);
      infoAdded = next.sheets.length - before;
      return next;
    });
    prismInfo.current = [];
    setPrismTables(null);
    if (first) select(first);
    notify(`Imported ${tables.length} data table${tables.length === 1 ? "" : "s"}`
      + (infoAdded ? ` and ${infoAdded} info sheet${infoAdded === 1 ? "" : "s"}` : "")
      + " from the Prism file; analyses are recomputed here.", { tone: "success", id: TOAST_ID });
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
    }, { priority: "user" }) as { error?: string; tables?: PrismTable[]; info?: PzfxInfo[] };
    if (res.error || !res.tables?.length) {
      throw new Error(res.error ?? "no tables found");
    }
    prismInfo.current = res.info ?? [];
    if (res.tables.length === 1) importTables(res.tables);
    else {
      // The chooser banner is the next step; it says what to do.
      dismissToast(TOAST_ID);
      setPrismTables(res.tables);
    }
  }, [importTables]);

  // `pick` and `open` refer to each other ("Choose another file").
  const pickRef = useRef<() => void>(() => {});
  const pickNow = useCallback(() => pickRef.current(), []);

  /** `handle`: the file on disk (the system picker, the installed app's
   *  file handler), so Save writes back into it (P-71). */
  const open = useCallback(async (file: File, opts: { handle?: FileHandleLike } = {}) => {
    if (TABLE_OPEN.test(file.name)) { openTableFile(file); return; }
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
      // Opening replaces the project and its undo history (and the
      // autosave soon after): the project it closes comes back with Undo,
      // unless nothing would be lost (no data tables, or the example).
      const before = store.project;
      const worth = before.sheets.some((s) => s.kind === "data") && !isExampleProject(before);
      // Saved by another build: recompute and compare (stable-results-versions).
      replace(prepareReproduceCheck(text, project, file.name), savedSelection(text));
      if (opts.handle) linkFile(opts.handle);
      notify(`Opened “${file.name}”.`, {
        tone: "success", id: TOAST_ID,
        action: worth ? { label: "Undo", onAction: () => replace(before) } : undefined,
      });
    } catch (e) {
      notify(`Could not open “${file.name}”: ${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}.`, {
        tone: "error", id: TOAST_ID,
        action: { label: "Choose another file", onAction: () => pickRef.current() },
      });
    }
  }, [openPrism, replace, store]);

  /** Opens the system file picker; the chosen file is opened. Where the
   *  browser can write files back (Chromium), its own picker, so the file
   *  stays linked; elsewhere a file input. */
  const pick = useCallback(async () => {
    if (canPickFiles()) {
      const got = await openPicker(OPEN_ACCEPT);
      if (got === null) return;
      if (got !== "unavailable") { void open(got.file, { handle: got.handle }); return; }
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = OPEN_ACCEPT;
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) void open(f);
    }, { once: true });
    input.click();
  }, [open]);
  pickRef.current = () => { void pick(); };

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

  return { open, pick: pickNow, prismTables, importTables, dismissPrism: () => setPrismTables(null) };
}

interface LaunchParams { files?: readonly FileHandleLike[] }
interface LaunchQueueLike { setConsumer(fn: (p: LaunchParams) => void): void }

/**
 * The installed app's file handler (web app manifest `file_handlers`): a
 * .json, .pzfx or .prism file double-clicked in the system opens through
 * `open`, the same path as Open…, with its handle, so Save writes back
 * into it. Launches wait until `ready` (the start has decided which
 * project opens), so the last session never replaces the launched file.
 */
export function useLaunchQueue(open: (f: File, o: { handle?: FileHandleLike }) => Promise<void> | void,
  ready: boolean) {
  const queued = useRef<FileHandleLike[]>([]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const q = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
    if (!q) return;
    q.setConsumer((params) => {
      const handles = (params.files ?? []).filter((h) => OPENABLE.test(h.name) || TABLE_OPEN.test(h.name));
      // A project or Prism file first, as a drop picks (App.tsx).
      const first = handles.find((h) => OPENABLE.test(h.name)) ?? handles[0];
      if (!first) return;
      queued.current.push(first);
      setCount((n) => n + 1);
    });
  }, []);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!ready || !queued.current.length) return;
    const handles = queued.current.splice(0);
    void (async () => {
      for (const h of handles) {
        try {
          await openRef.current(await h.getFile(), { handle: h });
        } catch (e) {
          notify(`Could not open “${h.name}”: ${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}.`,
            { tone: "error", id: TOAST_ID });
        }
      }
    })();
  }, [ready, count]);
}
