// Shared project state for the app shell (provided by ProjectProvider).
import { createContext, useContext } from "react";
import type { History } from "../project/history";
import type { ProjectStore } from "../project/store";
import type { GraphSheet, Prefs, Project, ResultsSheet } from "../project/types";
import type { EngineState } from "../lib/engine";
import type { ResultsCache } from "./analysis";

export interface ProjectApi {
  store: ProjectStore;
  history: History;
  project: Project;
  /** Apply a pure edit; equal keys within ~1 s coalesce into one undo step. */
  apply: (fn: (p: Project) => Project, key?: string | null) => Project;
  undo: () => void;
  redo: () => void;
  /** Replace the whole project (open, restore, new). Forgets history.
   *  `readOnly` opens it as a shared project (edits refused until copied);
   *  any other replace ends read-only mode. */
  replace: (p: Project, select?: string | null, opts?: { readOnly?: boolean }) => void;

  selectedId: string | null;
  select: (id: string | null) => void;
  /** Results / graph sheet shown for a family in the workbench. */
  activeResults: (rootId: string) => ResultsSheet | null;
  activeGraph: (rootId: string) => GraphSheet | null;
  /** True once the user has moved away from the sheet shown at boot. */
  switchedRef: { current: boolean };

  prefs: Prefs;
  setPrefs: (p: Prefs) => void;

  /** The engine has booted (it may be restarting after a cancel). */
  engineReady: boolean;
  engineError: string | null;
  /** Boot progress and busy state of the engine worker. */
  engine: EngineState;
  status: string;
  setStatus: (s: string) => void;
  bootEngine: () => void;

  results: ResultsCache;

  /** A shared project opened from a link: viewable, not editable, until
   *  the user makes a copy (src/share). */
  readOnly: boolean;
}

export const Ctx = createContext<ProjectApi | null>(null);

export function useProject(): ProjectApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProject outside ProjectProvider");
  return v;
}

