// "Convert Prism files to CSV…" (Save menu, start screen): pick several
// .prism / .pzfx files; each is read by the engine (pzfx_import, as Open
// does) and every data table is saved as CSV in one zip (./prismBatch.ts).
import { useRef, useState } from "react";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import { prismTableToFamily, type PrismTable } from "../app/factory";
import { saveBlob } from "../export/download";
import { analyzeAsync } from "../lib/engine";
import { newId } from "../project/ids";
import { makeProject } from "../project/ops";
import type { DataTableModel } from "../project/types";
import type { ReadFile } from "./prismBatch";

export function usePrismBatch() {
  const { store } = useProject();
  const ui = useUi();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const convert = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    ui.notify(`Converting ${list.length} Prism file${list.length === 1 ? "" : "s"} to CSV…`);
    try {
      // The zip code loads on first use.
      const { base64Of, prismCsvZip } = await import("./prismBatch");
      const read: ReadFile<PrismTable>[] = [];
      for (const f of list) {
        try {
          const res = await analyzeAsync({ analysis: "pzfx_import",
            data: { pzfx_b64: base64Of(new Uint8Array(await f.arrayBuffer())) }, options: {} },
          { priority: "user" }) as { error?: string; tables?: PrismTable[] };
          read.push(res.error || !res.tables
            ? { name: f.name, tables: [], error: res.error ?? "no data tables" }
            : { name: f.name, tables: res.tables });
        } catch (e) {
          read.push({ name: f.name, tables: [], error: e instanceof Error ? e.message : String(e) });
        }
      }
      // The table Open would create, so the CSV has the same columns.
      const toTable = (t: PrismTable): DataTableModel => {
        const r = prismTableToFamily(makeProject(store.project.prefs), t, newId);
        const s = r.project.sheets.find((x) => x.id === r.dataId);
        if (s?.kind !== "data") throw new Error("table not converted");
        return s.table;
      };
      const out = prismCsvZip(read, toTable, new Date().toISOString().slice(0, 10));
      if (out.tables) {
        saveBlob(new Blob([out.zip as BlobPart], { type: "application/zip" }), "prism-tables-csv.zip");
      }
      ui.notify(out.tables
        ? `Saved ${out.tables} table${out.tables === 1 ? "" : "s"} from ${out.files} file`
          + `${out.files === 1 ? "" : "s"} as CSV (prism-tables-csv.zip)`
          + (out.failed.length ? `; not converted: ${out.failed.join("; ")}.` : ".")
        : `No data tables converted: ${out.failed.join("; ")}.`);
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <input ref={ref} type="file" accept=".prism,.pzfx" multiple hidden
      aria-label="GraphPad Prism files (.prism, .pzfx) to convert to CSV"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        void convert(files);
      }} />
  );
  return { input, pick: () => ref.current?.click(), busy, convert };
}
