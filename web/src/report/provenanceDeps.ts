// Registry and runtime lookups for provenance.ts (kept out of it so the
// provenance logic stays pure and testable).
import type { ResultsCache } from "../app/analysis";
import { resolveOptions } from "../app/analysis";
import { versionLabel } from "../export/cite";
import { getRuntimeVersions } from "../lib/engine";
import { analysisDef, graphDef } from "../sheets/registry";
import type { ProvenanceDeps, ProvenanceEnv } from "./provenance";

export function provenanceDeps(cache: ResultsCache): ProvenanceDeps {
  return {
    analysisLabel: (type, id) => analysisDef(type, id)?.label,
    defaultOptions: (type, id, table, prefs) => analysisDef(type, id)?.defaultOptions({ table, prefs }),
    resolveOptions: (type, id, raw, table, prefs) => resolveOptions(analysisDef(type, id), raw, table, prefs),
    result: (sheetId) => cache.get(sheetId)?.result ?? null,
    graphLabel: (type, id) => graphDef(type, id)?.label,
  };
}

export function provenanceEnv(): ProvenanceEnv {
  const v = getRuntimeVersions();
  return {
    app: `OpenDose ${versionLabel()}`,
    engine: v ? { python: v.python, numpy: v.numpy, scipy: v.scipy, pyodide: v.pyodide } : null,
    date: new Date().toISOString(),
  };
}
