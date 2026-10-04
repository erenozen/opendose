import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  engineState, startEngine, subscribeEngine, type EngineState,
} from "../lib/engine";
import { newId } from "../project/ids";
import { syncInfoLinks } from "../project/infoLinks";
import { familyChildren, familyRootId, findSheet } from "../project/ops";
import { loadPrefs, projectPrefs, savePrefs } from "../project/prefs";
import { ProjectStore } from "../project/store";
import type {
  GraphSheet, Prefs, Project, ResultsSheet,
} from "../project/types";
import { setDisplayDigits } from "../types";
import { setReportPrefs } from "../report/pformat";
import { reportPrefsOf } from "../report/prefs";
import { clearShareLink, readShareBoot } from "../share/boot";
import { ResultsCache } from "./analysis";
import { sampleProject } from "./factory";
import { primeSampleResults } from "./sampleResults";
import { Ctx, type ProjectApi } from "./context";

function firstSheetId(p: Project): string | null {
  return p.sheets.find((s) => s.kind === "data")?.id ?? p.sheets[0]?.id ?? null;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  // A share link in the address ("#p=…") opens that project, read-only.
  const [shareBoot] = useState(() => readShareBoot(projectPrefs(loadPrefs()), newId));
  const [store] = useState(() => new ProjectStore(
    shareBoot.project ?? sampleProject(projectPrefs(loadPrefs()), newId)));
  // The example's results as computed when this build was made: shown at
  // first paint, replaced by the live engine's as soon as it is up.
  const [isSample] = useState(() => !shareBoot.project);
  const [readOnly, setReadOnly] = useState(!!shareBoot.project);
  const readOnlyRef = useRef(readOnly);
  const [status, setStatus] = useState("Starting Python runtime…");
  const history = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const project = history.present;
  const [results] = useState(() => {
    const cache = new ResultsCache();
    // A link may carry cached results: show them before the engine runs.
    if (shareBoot.project) {
      cache.prime(shareBoot.project.sheets.filter((s): s is ResultsSheet => s.kind === "results"));
    } else if (isSample) {
      primeSampleResults(store.project, cache);
    }
    return cache;
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    () => (shareBoot.selected && findSheet(store.project, shareBoot.selected)
      ? shareBoot.selected : firstSheetId(store.project)));
  const switchedRef = useRef(false);
  // Per family (data sheet id): which results / graph the workbench shows.
  const [activeRes, setActiveRes] = useState<Record<string, string>>({});
  const [activeGr, setActiveGr] = useState<Record<string, string>>({});

  /** Show sheet `id` of project `p`: select it and, for a results sheet or
   *  a graph, make it the one its family's workbench shows. */
  const focus = useCallback((p: Project, id: string | null) => {
    const s = findSheet(p, id);
    setSelectedId(s ? s.id : null);
    if (!s) return;
    const root = familyRootId(p, s.id);
    if (!root) return;
    if (s.kind === "results") {
      setActiveRes((m) => ({ ...m, [root]: s.id }));
      const g = familyChildren(p, root)
        .find((c): c is GraphSheet => c.kind === "graph" && c.resultsId === s.id);
      if (g) setActiveGr((m) => ({ ...m, [root]: g.id }));
    } else if (s.kind === "graph") {
      setActiveGr((m) => ({ ...m, [root]: s.id }));
      if (s.resultsId) {
        const rid = s.resultsId;
        setActiveRes((m) => ({ ...m, [root]: rid }));
      }
    }
  }, []);

  const select = useCallback((id: string | null) => {
    if (id !== selectedId) switchedRef.current = true;
    focus(store.project, id);
  }, [store, selectedId, focus]);

  // A share link's saved selection: its results / graph tab too.
  useEffect(() => {
    if (shareBoot.selected) focus(store.project, shareBoot.selected);
  }, [shareBoot, store, focus]);

  // Selection must always point at an existing sheet (undo can remove it).
  useEffect(() => {
    if (selectedId && findSheet(project, selectedId)) return;
    setSelectedId(firstSheetId(project));
  }, [project, selectedId]);

  const activeResults = useCallback((root: string): ResultsSheet | null => {
    const kids = familyChildren(project, root)
      .filter((c): c is ResultsSheet => c.kind === "results");
    return kids.find((k) => k.id === activeRes[root]) ?? kids[0] ?? null;
  }, [project, activeRes]);

  const activeGraph = useCallback((root: string): GraphSheet | null => {
    const kids = familyChildren(project, root)
      .filter((c): c is GraphSheet => c.kind === "graph");
    const chosen = kids.find((k) => k.id === activeGr[root]);
    const res = activeResults(root);
    // An explicitly chosen graph wins only if it belongs to the active
    // analysis (or to none); otherwise show the active analysis' graph.
    if (chosen && (!chosen.resultsId || !res || chosen.resultsId === res.id)) return chosen;
    return kids.find((k) => res && k.resultsId === res.id)
      ?? kids.find((k) => !k.resultsId) ?? (res ? null : kids[0] ?? null);
  }, [project, activeGr, activeResults]);

  // Every edit also refreshes analysis constants hooked to info-sheet
  // constants (project/infoLinks.ts), in the same undo step.
  // A shared project is read-only until copied: edits are refused.
  const apply = useCallback((fn: (p: Project) => Project, key: string | null = null) => {
    if (readOnlyRef.current) {
      setStatus("This shared project is read-only. Make a copy to edit it.");
      return store.project;
    }
    return store.apply((p) => syncInfoLinks(fn(p)), key);
  }, [store]);

  const replace = useCallback((p: Project, sel?: string | null,
    opts: { readOnly?: boolean } = {}) => {
    results.clear();
    results.prime(p.sheets.filter((s): s is ResultsSheet => s.kind === "results"));
    readOnlyRef.current = !!opts.readOnly;
    setReadOnly(!!opts.readOnly);
    if (!opts.readOnly) clearShareLink();
    store.reset(p);
    switchedRef.current = true;
    setActiveRes({});
    setActiveGr({});
    focus(p, sel !== undefined && findSheet(p, sel) ? sel : firstSheetId(p));
  }, [store, results, focus]);

  // ---- prefs: local per browser, project-level copy travels with files
  const setPrefs = useCallback((next: Prefs) => {
    setPrefsState(next);
    savePrefs(next);
    const pp = projectPrefs(next);
    store.apply((p) => (JSON.stringify(p.prefs) === JSON.stringify(pp)
      ? p : { ...p, prefs: pp }), "prefs");
  }, [store]);

  // Results precision and the P-value style follow the open project.
  setDisplayDigits(project.prefs.digits);
  setReportPrefs(reportPrefsOf(project.prefs));

  // Theme: "auto" follows the OS; light/dark force it. The data-theme
  // attribute drives the CSS tokens, and the event tells the Plotly
  // components to re-read their chrome colors.
  useEffect(() => {
    if (prefs.theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
    window.dispatchEvent(new Event("opendose-theme"));
  }, [prefs.theme]);

  // ---- engine (a worker started by boot.ts before React rendered)
  const [shareError] = useState(shareBoot.error);
  const engine: EngineState = useSyncExternalStore(subscribeEngine, engineState);
  const [engineReady, setEngineReady] = useState(engine.phase === "ready");
  const engineError = engine.phase === "failed" ? engine.error : null;
  const bootEngine = useCallback(() => {
    startEngine()
      .then(() => {
        setEngineReady(true);
        setStatus(shareError ? `Could not open the share link: ${shareError}` : "");
      })
      .catch(() => { setStatus(""); });
  }, [shareError]);
  useEffect(() => { bootEngine(); }, [bootEngine]);
  // Loading messages while the engine boots.
  const bootMessage = engine.progress?.message;
  useEffect(() => {
    if (!engineReady && bootMessage) setStatus(bootMessage);
  }, [engineReady, bootMessage]);
  // For the e2e and performance scripts.
  useEffect(() => {
    (globalThis as { __opendose?: unknown }).__opendose = { store, results };
  }, [store, results]);

  const api = useMemo<ProjectApi>(() => ({
    store, history, project,
    apply, undo: store.undo, redo: store.redo, replace,
    selectedId, select, activeResults, activeGraph, switchedRef,
    prefs, setPrefs,
    engineReady, engineError, status, setStatus, bootEngine, engine,
    results, readOnly,
  }), [store, history, project, apply, replace, selectedId, select, activeResults,
    activeGraph, prefs, setPrefs, engineReady, engineError, status, bootEngine, engine,
    results, readOnly]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

