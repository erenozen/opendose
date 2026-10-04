import { useState } from "react";
import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText } from "./download";
import "./grid.css";

/** "Copy table" / "CSV" for one results table (the shell's Copy results
 *  strip exports the whole sheet). `matrix` is the table as rows of text,
 *  header row first, at full precision. */
export default function TableCopy({ name, matrix }: { name: string; matrix: () => string[][] }) {
  const [note, setNote] = useState("");
  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote((n) => (n === msg ? "" : n)), 2500);
  };
  return (
    <div className="results-export table-copy" role="group" aria-label={`Export ${name}`}>
      <span className="hint" role="status">{note}</span>
      <button type="button" aria-label={`Copy ${name} as tab-separated text`}
        onClick={async () => {
          const m = matrix();
          if (m.length < 2) { flash("Nothing to copy yet."); return; }
          flash(await copyText(toDelimited(m, "tsv")) ? "Copied." : "Copy failed.");
        }}>Copy table</button>
      <button type="button" aria-label={`Download ${name} as CSV`}
        onClick={() => downloadText(`${fileSlug(name, "table")}.csv`, toDelimited(matrix(), "csv"),
          "text/csv;charset=utf-8")}>CSV</button>
    </div>
  );
}
