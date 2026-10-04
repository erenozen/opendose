// Provenance: every analysis and derived table of a family with its full
// options (defaults marked as such), the input table's fingerprint and the
// software versions, so a result can be traced and re-run. Shown in the
// History panel, copied as JSON, and written to the export bundle as
// provenance.json. Pure: the registry lookups come in as functions.
import type { DataSheet, DataTableModel, Project, ProjectPrefs, TableType } from "../project/types.ts";

/** FNV-1a 64-bit hash of a string's UTF-8 bytes, as 16 hex digits. */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/** Fingerprint of what an analysis reads from a table: the values as
 *  typed, exclusions, X, titles that name groups, and the entry format.
 *  Display-only settings (decimals) are left out. */
export function tableFingerprint(t: DataTableModel): string {
  const canonical = JSON.stringify([
    t.type, t.subcolumnFormat, t.replicateLayout, t.xFormat, t.x, t.xExcluded ?? [],
    t.rowTitles, t.datasets.map((d) => [d.name, d.rows, [...(d.excluded ?? [])].sort(),
      d.subTitles ?? [], d.varType ?? null]),
  ]);
  return `fnv1a64:${fnv1a64(canonical)}`;
}

export interface OptionEntry { value: unknown; default: boolean }

/** Options with each top-level field marked default or changed. */
export function optionEntries(resolved: unknown, defaults: unknown): Record<string, OptionEntry> {
  const out: Record<string, OptionEntry> = {};
  if (!resolved || typeof resolved !== "object") return out;
  const d = (defaults && typeof defaults === "object" ? defaults : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(resolved as Record<string, unknown>)) {
    out[k] = { value: v ?? null, default: k in d && JSON.stringify(d[k]) === JSON.stringify(v) };
  }
  return out;
}

export interface ProvenanceDeps {
  analysisLabel: (type: TableType, id: string) => string | undefined;
  defaultOptions: (type: TableType, id: string, table: DataTableModel, prefs: ProjectPrefs) => unknown;
  resolveOptions: (type: TableType, id: string, raw: unknown, table: DataTableModel,
    prefs: ProjectPrefs) => unknown;
  /** Latest result of a results sheet (null if not computed). */
  result: (sheetId: string) => unknown;
  graphLabel?: (type: TableType, id: string) => string | undefined;
}

export interface ProvenanceEnv {
  /** "OpenDose 0.2.0 (build abc, 2026-10-04)" */
  app: string;
  engine: Record<string, string> | null;
  date: string;
}

export interface ProvenanceStep {
  kind: "analysis" | "derived_table" | "graph";
  sheet: string;
  sheet_id: string;
  [key: string]: unknown;
}

export interface FamilyProvenance {
  table: {
    name: string; sheet_id: string; type: TableType; fingerprint: string;
    rows: number; data_sets: string[]; excluded_values: number;
    derived_from?: { table: string; analysis: string } | null;
  };
  steps: ProvenanceStep[];
}

export interface ProvenanceDoc {
  opendose_provenance: 1;
  app: string;
  engine: Record<string, string> | null;
  generated: string;
  preferences: Record<string, unknown>;
  families: FamilyProvenance[];
}

const excludedCount = (t: DataTableModel) =>
  t.datasets.reduce((a, d) => a + (d.excluded?.length ?? 0), 0) + (t.xExcluded?.length ?? 0);

function resultSummary(res: unknown): Record<string, unknown> | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  if (r.error) return { error: String(r.error) };
  return { analysis: r.analysis ?? null, fingerprint: `fnv1a64:${fnv1a64(JSON.stringify(res))}` };
}

/** The history of one family (a data table and what hangs off it). */
export function familyProvenance(p: Project, data: DataSheet, deps: ProvenanceDeps): FamilyProvenance {
  const t = data.table;
  const fp = tableFingerprint(t);
  const src = data.derived ? p.sheets.find((s) => s.id === data.derived!.sourceId) : undefined;
  const producer = data.derived ? p.sheets.find((s) => s.id === data.derived!.resultsId) : undefined;
  const steps: ProvenanceStep[] = [];
  for (const s of p.sheets) {
    if (s.kind === "results" && s.parentId === data.id) {
      const resolved = deps.resolveOptions(t.type, s.analysis, s.options, t, p.prefs);
      const defaults = deps.defaultOptions(t.type, s.analysis, t, p.prefs);
      steps.push({
        kind: "analysis", sheet: s.name, sheet_id: s.id, analysis: s.analysis,
        label: deps.analysisLabel(t.type, s.analysis) ?? s.analysis,
        options: optionEntries(resolved, defaults),
        input: { table: data.name, fingerprint: fp },
        frozen: !!s.frozen,
        result: resultSummary(s.frozen ? s.cached : deps.result(s.id)),
      });
    }
    if (s.kind === "data" && s.derived?.sourceId === data.id) {
      const prod = p.sheets.find((x) => x.id === s.derived!.resultsId);
      steps.push({
        kind: "derived_table", sheet: s.name, sheet_id: s.id,
        produced_by: prod?.kind === "results" ? { sheet: prod.name, analysis: prod.analysis } : null,
        fingerprint: tableFingerprint(s.table),
      });
    }
    if (s.kind === "graph" && s.parentId === data.id) {
      const bound = s.resultsId ? p.sheets.find((x) => x.id === s.resultsId) : undefined;
      steps.push({
        kind: "graph", sheet: s.name, sheet_id: s.id, graph: s.graphType,
        label: deps.graphLabel?.(t.type, s.graphType) ?? s.graphType,
        draws: bound ? bound.name : "the data table",
        formatted: !!s.settings.format, frozen: !!s.frozen,
      });
    }
  }
  return {
    table: {
      name: data.name, sheet_id: data.id, type: t.type, fingerprint: fp, rows: t.x.length,
      data_sets: t.datasets.map((d) => d.name), excluded_values: excludedCount(t),
      derived_from: data.derived ? {
        table: src?.name ?? "(missing)",
        analysis: producer?.kind === "results" ? producer.analysis : "(missing)",
      } : null,
    },
    steps,
  };
}

/** Provenance of a whole project (or of the families listed). */
export function projectProvenance(p: Project, deps: ProvenanceDeps, env: ProvenanceEnv,
  dataIds?: string[]): ProvenanceDoc {
  const datas = p.sheets.filter((s): s is DataSheet => s.kind === "data"
    && (!dataIds || dataIds.includes(s.id)));
  const { export: _e, ...prefs } = p.prefs;
  void _e;
  return {
    opendose_provenance: 1,
    app: env.app,
    engine: env.engine,
    generated: env.date,
    preferences: prefs as Record<string, unknown>,
    families: datas.map((d) => familyProvenance(p, d, deps)),
  };
}
