import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from "react";
import { getEngine } from "../lib/engine";
import { newId } from "../project/ids";
import { syncInfoLinks } from "../project/infoLinks";
import { familyChildren, familyRootId, findSheet } from "../project/ops";
import { loadPrefs, projectPrefs, savePrefs } from "../project/prefs";
import { ProjectStore } from "../project/store";
import type {
  GraphSheet, Prefs, Project, ResultsSheet,
} from "../project/types";
import { setDisplayDigits } from "../types";
import { clearShareLink, readShareBoot } from "../share/boot";
import { ResultsCache } from "./analysis";
import { sampleProject } from "./factory";
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
    }
    return cache;
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    () => firstSheetId(store.project));
  const switchedRef = useRef(false);
  // Per family (data sheet id): which results / graph the workbench shows.
  const [activeRes, setActiveRes] = useState<Record<string, string>>({});
  const [activeGr, setActiveGr] = useState<Record<string, string>>({});

  const select = useCallback((id: string | null) => {
    const p = store.project;
    const s = findSheet(p, id);
    if (id !== selectedId) switchedRef.current = true;
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
  }, [store, selectedId]);

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
    setSelectedId(sel !== undefined && findSheet(p, sel) ? sel : firstSheetId(p));
  }, [store, results]);

  // ---- prefs: local per browser, project-level copy travels with files
  const setPrefs = useCallback((next: Prefs) => {
    setPrefsState(next);
    savePrefs(next);
    const pp = projectPrefs(next);
    store.apply((p) => (JSON.stringify(p.prefs) === JSON.stringify(pp)
      ? p : { ...p, prefs: pp }), "prefs");
  }, [store]);

  // Results precision follows the open project.
  setDisplayDigits(project.prefs.digits);

  // Theme: "auto" follows the OS; light/dark force it. The data-theme
  // attribute drives the CSS tokens, and the event tells the Plotly
  // components to re-read their chrome colors.
  useEffect(() => {
    if (prefs.theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
    window.dispatchEvent(new Event("opendose-theme"));
  }, [prefs.theme]);

  // ---- engine
  const [shareError] = useState(shareBoot.error);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const bootEngine = useCallback(() => {
    setEngineError(null);
    setStatus("Starting Python runtime…");
    getEngine(setStatus)
      .then(() => {
        setEngineReady(true);
        setStatus(shareError ? `Could not open the share link: ${shareError}` : "");
      })
      .catch((err) => {
        // getEngine resets its cached promise on failure, so Retry can
        // simply call this again.
        setEngineError(err instanceof Error ? err.message : String(err));
        setStatus("");
      });
  }, [shareError]);
  useEffect(() => { bootEngine(); }, [bootEngine]);

  const api = useMemo<ProjectApi>(() => ({
    store, history, project,
    apply, undo: store.undo, redo: store.redo, replace,
    selectedId, select, activeResults, activeGraph, switchedRef,
    prefs, setPrefs,
    engineReady, engineError, status, setStatus, bootEngine,
    results, readOnly,
  }), [store, history, project, apply, replace, selectedId, select, activeResults,
    activeGraph, prefs, setPrefs, engineReady, engineError, status, bootEngine,
    results, readOnly]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

