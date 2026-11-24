// What Apply to new data (ReplayDialog) and Run on many files
// (BatchDialog) share: reading a file of new data into tables, re-running
// a table's recorded import on it, and waiting until every results sheet
// has been recomputed by the engine.
import { resolveOptions, resultKey, sheetRunner, type ResultsCache } from "../app/analysis";
import { prismTableToFamily, type PrismTable } from "../app/factory";
import { analyzeAsync, readWorkbook, type XlsxSheet } from "../lib/engine";
import { textOf, workbookFormat } from "../lib/fileText";
import { sha256Hex } from "../lib/sha256";
import { newId } from "../project/ids";
import type { ImportSource } from "../project/importRecord";
import { sheetTable } from "../project/leftOut";
import { findSheet, makeProject } from "../project/ops";
import type { IncomingTable, Reimport } from "../project/replay";
import type { DataSheet, Project } from "../project/types";
import { analysisDef } from "../sheets/registry";
import type { ReportedSheet } from "../sheets/common/workbookReportText";
import { reimport } from "./recipes/reimport";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const stemOf = (file: string) => file.replace(/\.[^.]+$/, "");

/**
 * Bring every results sheet of the project up to date (the same runs the
 * workbench and the background refresh make, at user priority) and wait
 * until nothing has changed for a moment (derived tables settle too).
 * Returns the current result of every results sheet that has one.
 * `stop` ends the wait early (the caller cancelled).
 */
export async function settle(get: () => Project, results: ResultsCache, timeoutMs = 120000,
  onProgress?: (left: number) => void, stop?: () => boolean): Promise<Map<string, unknown>> {
  const t0 = Date.now();
  let quiet = 0;
  let last = "";
  while (Date.now() - t0 < timeoutMs && !stop?.()) {
    const p = get();
    let left = 0;
    const keys: string[] = [];
    for (const s of p.sheets) {
      if (s.kind !== "results" || s.frozen) continue;
      const data = findSheet(p, s.parentId) as DataSheet | undefined;
      if (!data || data.kind !== "data") continue;
      const def = analysisDef(data.table.type, s.analysis);
      if (!def) continue;
      const table = sheetTable(s, data.table);
      const options = resolveOptions(def, s.options, table, p.prefs);
      const key = resultKey(s.analysis, options, table);
      keys.push(key);
      if (results.isCurrent(s.id, key)) continue;
      left++;
      if (results.isCancelled(s.id, key)) results.retry(s.id);
      if (results.pending(s.id)?.key !== key) {
        results.run(s.id, key, sheetRunner(def, table, options), "user");
      }
    }
    onProgress?.(left);
    // done when every result is current and no input has changed for a
    // moment (a derived table rewritten from new results changes keys)
    const sig = keys.join("|");
    quiet = !left && sig === last ? quiet + 1 : 0;
    last = sig;
    if (quiet >= 4) break;
    await sleep(250);
  }
  const out = new Map<string, unknown>();
  const p = get();
  for (const s of p.sheets) {
    if (s.kind !== "results") continue;
    const r = s.frozen ? s.cached : results.get(s.id)?.result;
    if (r !== undefined && r !== null) out.set(s.id, r);
  }
  return out;
}

/** A table of the new data; a worksheet keeps its rows and flags, and
 *  its source is taken with the workbook report's choices (sheetCells). */
export type Incoming = IncomingTable & { sheet?: XlsxSheet & ReportedSheet };

/** Tables in a file of new data, each with the file's SHA-256. */
export async function readIncoming(file: File, prefs: Project["prefs"]): Promise<Incoming[]> {
  const name = file.name;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info: ImportSource = { name, bytes: bytes.length, sha256: await sha256Hex(bytes) };
  const format = workbookFormat(name);
  if (format) {
    const sheets = (await readWorkbook(bytes, format))
      .filter((s) => s.rows.some((r) => r.some((c) => c.trim())));
    return sheets.map((s) => {
      const origin = sheets.length === 1 ? name : `${name} › ${s.name}`;
      return { name: sheets.length === 1 ? stemOf(name) : s.name, origin,
        file: { ...info, worksheet: s.name }, sheet: { ...s, name: origin, format } };
    });
  }
  if (/\.(pzfx|prism)$/i.test(name)) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = await analyzeAsync({ analysis: "pzfx_import", data: { pzfx_b64: btoa(binary) },
      options: {} }, { priority: "user" }) as { error?: string; tables?: PrismTable[] };
    if (res.error || !res.tables?.length) throw new Error(res.error ?? "no tables found");
    return res.tables.map((t) => {
      const r = prismTableToFamily(makeProject(prefs), t, newId);
      const data = findSheet(r.project, r.dataId) as DataSheet;
      return { name: t.title || stemOf(name), origin: `${name} › ${t.title || "table"}`, table: data.table,
        file: info };
    });
  }
  if (/\.(numbers|xlsb)$/i.test(name)) {
    throw new Error("only .xlsx, .xls and .ods workbooks can be read; save the sheet as .xlsx or CSV");
  }
  return [{ name: stemOf(name), origin: name, source: textOf(bytes), file: info }];
}

/** Pasted text as new data, with the text's SHA-256. */
export async function pastedIncoming(text: string): Promise<IncomingTable> {
  return { name: "Pasted data", origin: "pasted data", source: text,
    file: { name: "pasted text", pasted: true, bytes: new TextEncoder().encode(text).length,
      sha256: await sha256Hex(text) } };
}

/** Re-run a plan table's recorded import (P-76) on a source. */
export const recordedReimport: Reimport = (plan, src) => {
  if (!plan.imported || src.source === undefined) return null;
  return reimport(plan.imported, src.source, plan.table);
};
