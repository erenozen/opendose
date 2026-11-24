// File › Export statistics table (.csv, .xlsx) and Copy statistics table
// for Word (P-66): the table is read from the results the app already
// holds (computed in the background for every results sheet), so the
// Word copy runs inside the click that asked for it. A sheet still
// computing gets a row saying so (report/statsTable.ts), never nothing.
import { resolveOptions, type ResultsCache } from "../app/analysis";
import { copyHtml } from "../export/clipboard";
import { saveBlob } from "../export/download";
import { statsCsv, statsWord, statsWorkbook, panelsByResults } from "../export/statsExport";
import { versionLabel } from "../export/cite";
import { XLSX_MIME } from "../export/xlsx";
import type { DataSheet, Project } from "../project/types";
import { resultOf } from "../report/facts";
import { currentReportPrefs } from "../report/pformat";
import { statsTable, type StatsEntry, type StatsTable } from "../report/statsTable";
import type { ScriptEntry } from "../report/scripts";
import { analysisDef } from "../sheets/registry";
import { stem } from "./bundle";
import type { StatsFormat } from "./events";

/** Every results sheet in project order, with its result and panels. */
export function projectStatsEntries(p: Project, cache: ResultsCache): StatsEntry[] {
  const panels = panelsByResults(p);
  const byId = new Map(p.sheets.map((s) => [s.id, s]));
  const out: StatsEntry[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const data = byId.get(s.parentId) as DataSheet | undefined;
    const type = data?.kind === "data" ? data.table.type : null;
    out.push({
      sheet: s.name, data: data?.name ?? "", analysisId: s.analysis,
      analysisLabel: (type && analysisDef(type, s.analysis)?.label) || s.analysis,
      panels: panels.get(s.id) ?? [], result: resultOf(s, cache),
    });
  }
  return out;
}

/** Every results sheet with its table, resolved options and result, for
 *  the bundle's analysis.py and analysis.R (report/scripts.ts, P-67). */
export function projectScriptEntries(p: Project, cache: ResultsCache): Omit<ScriptEntry, "csv">[] {
  const byId = new Map(p.sheets.map((s) => [s.id, s]));
  const out: Omit<ScriptEntry, "csv">[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const data = byId.get(s.parentId) as DataSheet | undefined;
    if (data?.kind !== "data") continue;
    const def = analysisDef(data.table.type, s.analysis);
    out.push({ sheet: s.name, analysisId: s.analysis, result: resultOf(s, cache), table: data.table,
      options: resolveOptions(def, s.options, data.table, p.prefs), dataName: data.name });
  }
  return out;
}

export function projectStatsTable(p: Project, cache: ResultsCache): StatsTable & { pending: number } {
  const entries = projectStatsEntries(p, cache);
  const r = currentReportPrefs();
  return { ...statsTable(entries, { style: r.pStyle, prefs: r }),
    pending: entries.filter((e) => e.result === null || e.result === undefined).length };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The toast's second half: what is in the table and what is not. */
function contents(t: StatsTable & { pending: number }): string {
  const parts = [plural(t.rows.length, "row")];
  if (t.pending) parts.push(`${plural(t.pending, "results sheet")} still computing (their rows say so)`);
  const other = t.untabulated.length - t.pending;
  if (other > 0) parts.push(`${plural(other, "results sheet")} with nothing to tabulate (the Note column says why)`);
  return parts.join("; ");
}

type Notify = (text: string, o: { tone: "success" | "info" | "error" }) => void;

/** Save or copy the table; says what happened in a toast. */
export async function exportStatsTable(format: StatsFormat, p: Project, cache: ResultsCache,
  notify: Notify): Promise<void> {
  if (!p.sheets.some((s) => s.kind === "results")) {
    notify("This project has no results sheets yet: analyze a data table, then export the statistics table.",
      { tone: "info" });
    return;
  }
  const t = projectStatsTable(p, cache);
  const base = `${stem(p.title, "opendose-project")}-statistics`;
  try {
    if (format === "word") {
      const w = statsWord(t.rows, `${p.title || "OpenDose project"}: statistics`);
      const ok = await copyHtml(w.html, w.plain);
      if (!ok) throw new Error("the browser did not allow the copy");
      notify(`Copied the statistics table for Word: ${contents(t)}.`, { tone: "success" });
      return;
    }
    const name = `${base}.${format}`;
    if (format === "csv") {
      saveBlob(new Blob(["﻿", statsCsv(t.rows)], { type: "text/csv;charset=utf-8" }), name);
    } else {
      const bytes = statsWorkbook(t.rows, { title: p.title, app: `OpenDose ${versionLabel()}`,
        date: new Date().toISOString() });
      saveBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }), name);
    }
    notify(`Saved “${name}”: ${contents(t)}.`, { tone: "success" });
  } catch (e) {
    const why = String(e instanceof Error ? e.message : e).replace(/\.$/, "");
    notify(format === "word"
      ? `Could not copy the statistics table: ${why}. Export it as .csv or .xlsx instead.`
      : `Could not save the statistics table: ${why}. Try again, or copy it for Word instead.`, { tone: "error" });
  }
}
