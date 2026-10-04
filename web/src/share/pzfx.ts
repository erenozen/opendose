// .pzfx export: which data tables of a project can be written as a
// GraphPad Prism data file (engine handler pzfx_export, pzfx.write_pzfx),
// and what is lost on the way. Pure.
import type { DataSheet, DataTableModel, Project, SubcolumnFormat } from "../project/types.ts";

/** Table types the .pzfx writer knows. */
export const PZFX_TYPES = new Set(["xy", "column", "grouped", "contingency", "survival"]);

/** Subcolumn formats written with their Prism Y format (others are
 *  written as plain subcolumns). */
export const PZFX_FORMATS = new Set<SubcolumnFormat>([
  "replicates", "mean_sd_n", "mean_sem_n", "mean_cv_n", "mean_sd", "mean_sem",
]);

const TYPE_NAMES: Record<string, string> = {
  partsofwhole: "parts-of-whole", multivariable: "multiple-variables", nested: "nested",
};

export interface PzfxSelection {
  tables: { title: string; table: DataTableModel }[];
  /** Tables left out, with the reason. */
  skipped: string[];
  /** Tables written with something lost. */
  notes: string[];
}

/** The tables to export: every data table of the project, or one. */
export function pzfxSelection(p: Project, dataId?: string): PzfxSelection {
  const out: PzfxSelection = { tables: [], skipped: [], notes: [] };
  const sheets = p.sheets.filter((s): s is DataSheet => s.kind === "data" && (!dataId || s.id === dataId));
  for (const s of sheets) {
    const t = s.table;
    if (!PZFX_TYPES.has(t.type)) {
      out.skipped.push(`“${s.name}” (${TYPE_NAMES[t.type] ?? t.type} tables have no .pzfx equivalent)`);
      continue;
    }
    if (!PZFX_FORMATS.has(t.subcolumnFormat)) {
      out.notes.push(`“${s.name}”: its summary format has no Prism equivalent, so its subcolumns are written as plain values`);
    }
    if (t.type === "survival" && t.datasets.some((d) => (d.rows[0]?.length ?? 2) > 2)) {
      out.notes.push(`“${s.name}”: covariate columns are not part of a Prism survival table and were left out`);
    }
    if (t.type === "xy" && t.xFormat !== "numbers") {
      out.notes.push(`“${s.name}”: dates or elapsed times in X are written as typed`);
    }
    out.tables.push({ title: s.name, table: t });
  }
  return out;
}

/** File name for the export. */
export function pzfxFileName(title: string): string {
  const s = title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
  return `${s || "opendose-data"}.pzfx`;
}

type Engine = { analyze: (p: unknown) => unknown };

/** Run the export: the XML text and every message worth telling. */
export function exportPzfx(engine: Engine, sel: PzfxSelection):
  { xml: string; messages: string[] } | { error: string } {
  if (!sel.tables.length) {
    return { error: sel.skipped.length
      ? `Nothing to export as .pzfx: ${sel.skipped.join("; ")}.`
      : "Nothing to export: the project has no data tables." };
  }
  const r = engine.analyze({ analysis: "pzfx_export", data: { tables: sel.tables }, options: {} }) as
    { error?: string; xml?: string; warnings?: string[] };
  if (r.error || !r.xml) return { error: `The .pzfx file could not be written: ${r.error ?? "no output"}` };
  return { xml: r.xml, messages: [...sel.notes, ...(sel.skipped.length ? [`Not included: ${sel.skipped.join("; ")}`] : [])] };
}
