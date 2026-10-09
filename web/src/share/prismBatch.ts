// "Convert Prism files to CSV…": several GraphPad Prism files (.prism,
// .pzfx) read by the engine's pzfx_import handler (the same path as Open)
// and every data table written as a CSV, one folder per file, zipped with
// a README. Analyses, graphs and layouts inside the files are not
// converted (they are not imported either). The assembly is pure and
// unit-tested in __tests__/prismBatch.test.ts; the table mapping is
// injected (app/factory.ts prismTableToFamily in the app), so the CSV
// columns are those of the table Open would create.
import { strToU8, zipSync } from "fflate";
import { DEFAULT_EXPORT, tableMatrix, toDelimited } from "../project/exportTable.ts";
import type { DataTableModel } from "../project/types.ts";
import { stem, uniq } from "./bundle.ts";

/** One table as the engine reads it from a Prism file (app/factory.ts). */
export interface PrismTableLike { title: string; table_type: string }

export interface ReadFile<T extends PrismTableLike = PrismTableLike> {
  name: string;
  tables: T[];
  /** Why the file could not be read (then `tables` is empty). */
  error?: string;
}

export interface BatchResult {
  zip: Uint8Array;
  files: number;
  tables: number;
  failed: string[];
}

/** Zip of every table of every file as CSV, plus README.txt. */
export function prismCsvZip<T extends PrismTableLike>(read: ReadFile<T>[],
  toTable: (t: T) => DataTableModel, date: string): BatchResult {
  const out: Record<string, Uint8Array> = {};
  const lines: string[] = [];
  const failed: string[] = [];
  let count = 0;
  const folders = uniq(read.map((f) => stem(f.name.replace(/\.(prism|pzfx|zip)$/i, ""), "file")));
  read.forEach((f, i) => {
    if (f.error || !f.tables.length) {
      failed.push(`${f.name}: ${f.error ?? "no data tables"}`);
      return;
    }
    const names = uniq(f.tables.map((t, j) => stem(t.title, `table-${j + 1}`)));
    lines.push(`${f.name} -> ${folders[i]}/`);
    f.tables.forEach((t, j) => {
      const path = `${folders[i]}/${names[j]}.csv`;
      out[path] = strToU8(toDelimited(tableMatrix(toTable(t), DEFAULT_EXPORT), "csv"));
      lines.push(`  ${names[j]}.csv  "${t.title || `Table ${j + 1}`}" (${t.table_type})`);
      count++;
    });
  });
  const readme = [
    `GraphPad Prism files converted to CSV by OpenDose, ${date}.`,
    "",
    "Every data table of each file is one CSV (comma-separated, titles in the first row;",
    "excluded values end in *). Analyses, graphs and layouts inside the files are not",
    "converted: open a CSV, or the Prism file itself, in OpenDose and the analyses are",
    "recomputed there.",
    "",
    ...lines,
    ...(failed.length ? ["", "Not converted:", ...failed.map((m) => `  ${m}`)] : []),
    "",
  ].join("\n");
  out["README.txt"] = strToU8(readme);
  return { zip: zipSync(out), files: read.length - failed.length, tables: count, failed };
}

/** The bytes of a file as base64 (the engine's pzfx_import input). */
export function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
