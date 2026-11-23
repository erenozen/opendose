// .pzfx export: which data tables of a project can be written as a
// GraphPad Prism data file (engine handler pzfx_export, pzfx.write_pzfx),
// and what is lost on the way. Pure.
import { addSheets, makeInfoSheet, uniqueName } from "../project/ops.ts";
import { changeLog, plannedSummary, type AnalysisPlan } from "../project/plan.ts";
import { designText } from "../project/studyDesign.ts";
import type {
  DataSheet, DataTableModel, InfoConstant, InfoSheet, Project, SubcolumnFormat,
} from "../project/types.ts";

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

/** A Prism Info sheet: its title, notes and constants (pzfx.py). */
export interface PzfxInfo { title: string; notes: string; constants: InfoConstant[] }

export interface PzfxSelection {
  tables: { title: string; table: DataTableModel }[];
  /** Tables left out, with the reason. */
  skipped: string[];
  /** Tables written with something lost. */
  notes: string[];
  /** Info sheets written as Prism Info sheets. */
  info: PzfxInfo[];
}

const planDay = (iso: string) => iso.slice(0, 10);

/** An analysis plan as plain text, for the notes of a Prism Info sheet
 *  (Prism has no plan: it comes back as notes when the file is opened). */
export function planText(plan: AnalysisPlan): string {
  const lines = [`Analysis plan (written ${planDay(plan.writtenAt)}${plan.locked
    ? `, locked ${planDay(plan.lockedAt ?? plan.writtenAt)}` : ", not locked"})`];
  if (plan.primaryOutcome.trim()) lines.push(`Primary outcome: ${plan.primaryOutcome.trim()}`);
  lines.push(`Test: ${plannedSummary(plan)}`);
  if (plan.comparison) lines.push(`Comparison: ${plan.comparison.b} with ${plan.comparison.a}`);
  if (plan.groups.length) lines.push(`Groups: ${plan.groups.join(", ")}`);
  lines.push(`Exclusions: ${plan.exclusionRule.trim() || "none planned"}`);
  lines.push(`α = ${plan.alpha}`);
  for (const n of plan.designNotes ?? []) lines.push(`Design: ${n}`);
  const log = changeLog(plan);
  if (log.length) lines.push("Changes after locking:", ...log);
  return lines.join("\n");
}

/** Info sheets to export: every one, or with one table only the project's
 *  own and that table's. A sheet with no notes, no plan and no constant
 *  value is left out (Prism gets its empty default sheet instead). */
export function pzfxInfo(p: Project, dataId?: string): PzfxInfo[] {
  return p.sheets
    .filter((s): s is InfoSheet => s.kind === "info" && (!dataId || !s.parentId || s.parentId === dataId))
    .filter((s) => s.notes.trim() || s.plan || (s.design && designText(s.design))
      || s.constants.some((c) => c.value.trim()))
    .map((s) => ({
      title: s.name,
      notes: [s.notes.trim(), s.plan ? planText(s.plan) : "", s.design ? designText(s.design) : ""]
        .filter(Boolean).join("\n\n"),
      constants: s.constants.filter((c) => c.name.trim()).map((c) => ({ name: c.name, value: c.value })),
    }));
}

/** Prism Info sheets opened with a .pzfx file, as project info sheets.
 *  Empty ones (no notes, no constant value: an earlier OpenDose export's
 *  placeholder) are skipped. */
export function infoSheetsFromPrism(p: Project, info: PzfxInfo[] | undefined, ids: () => string): Project {
  let next = p;
  for (const s of info ?? []) {
    if (!s.notes.trim() && !s.constants.some((c) => c.value.trim())) continue;
    const sheet: InfoSheet = {
      ...makeInfoSheet(ids(), uniqueName(next, s.title.trim() || "Project info")),
      notes: s.notes,
      constants: s.constants.map((c) => ({ name: c.name, value: c.value })),
    };
    next = addSheets(next, [sheet]);
  }
  return next;
}

/** The tables to export: every data table of the project, or one. */
export function pzfxSelection(p: Project, dataId?: string): PzfxSelection {
  const out: PzfxSelection = { tables: [], skipped: [], notes: [], info: pzfxInfo(p, dataId) };
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
  const r = engine.analyze({ analysis: "pzfx_export", data: { tables: sel.tables, info: sel.info }, options: {} }) as
    { error?: string; xml?: string; warnings?: string[] };
  if (r.error || !r.xml) return { error: `The .pzfx file could not be written: ${r.error ?? "no output"}` };
  const info = sel.info.length
    ? [`Info sheets in it: ${sel.info.map((s) => `“${s.title}”`).join(", ")}`] : [];
  return { xml: r.xml, messages: [...sel.notes, ...info,
    ...(sel.skipped.length ? [`Not included: ${sel.skipped.join("; ")}`] : [])] };
}
