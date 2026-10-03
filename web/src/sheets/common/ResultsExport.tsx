import { useRef, useState, type ReactNode } from "react";
import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText, resultsMatrix } from "./download";
import "./grid.css";

/** Copy / CSV / TSV strip above a results sheet. */
export default function ResultsExport({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const slug = fileSlug(name, "results");
  const get = () => resultsMatrix(ref.current);
  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote((n) => (n === msg ? "" : n)), 2500);
  };
  return (
    <div className="results-export-wrap">
      <div className="results-export" role="group" aria-label="Export these results">
        <span className="hint" role="status">{note}</span>
        <button type="button" title="Copy the results as tab-separated text"
          onClick={async () => {
            const m = get();
            if (!m.length) { flash("No results to copy yet."); return; }
            flash(await copyText(toDelimited(m, "tsv")) ? "Copied." : "Copy failed.");
          }}>Copy results</button>
        <button type="button" title="Download the results as CSV"
          onClick={() => downloadText(`${slug}.csv`, toDelimited(get(), "csv"),
            "text/csv;charset=utf-8")}>CSV</button>
        <button type="button" title="Download the results as tab-separated text"
          onClick={() => downloadText(`${slug}.txt`, toDelimited(get(), "tsv"),
            "text/tab-separated-values;charset=utf-8")}>TSV</button>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}
