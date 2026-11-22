import { useRef, type ReactNode } from "react";
import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText, resultsMatrix } from "./download";
import { copyHtml, readSections } from "../../export/clipboard";
import { wordHtml, wordPlain } from "../../export/wordTable";
import { Button, SwapLabel, notify, useLabelSwap } from "../../components/ui";
import { useScrollRegions, useTypesetTables } from "./resultsTypeset";
import "./grid.css";

/** Copy / Copy for Word / CSV / TSV strip above a results sheet. Copy
 *  says "Copied" on the button itself for two seconds (DECISIONS 6); a
 *  failure is an error toast with the way out. The tables below it are
 *  typeset (numbers right-aligned) and scroll sideways when too wide. */
export default function ResultsExport({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const copied = useLabelSwap();
  const word = useLabelSwap();
  useTypesetTables(ref);
  useScrollRegions(ref);
  const slug = fileSlug(name, "results");
  const get = () => resultsMatrix(ref.current);
  const nothing = () => notify("No results to copy yet: the analysis has not produced any.",
    { tone: "info" });
  const failed = () => notify(`Could not copy the results of “${name}”: the browser refused `
    + "the clipboard. Download them as CSV instead.", { tone: "error" });
  return (
    <div className="results-export-wrap">
      <div className="results-export" role="group" aria-label="Export these results">
        <Button size="sm" variant="ghost" title="Copy the results as tab-separated text"
          onClick={async () => {
            const m = get();
            if (!m.length) { nothing(); return; }
            if (await copyText(toDelimited(m, "tsv"))) copied.flash("Results copied");
            else failed();
          }}>
          <SwapLabel swapped={copied.swapped} done="Copied">Copy results</SwapLabel>
        </Button>
        <Button size="sm" variant="ghost"
          title="Copy the results as formatted tables that paste into Word, PowerPoint or Google Docs"
          onClick={async () => {
            const sections = readSections(ref.current);
            if (!sections.some((x) => x.rows.length)) { nothing(); return; }
            const ok = await copyHtml(wordHtml(sections, name), wordPlain(sections, name));
            if (ok) word.flash("Copied as a table: paste into Word or PowerPoint");
            else failed();
          }}>
          <SwapLabel swapped={word.swapped} done="Copied">Copy for Word</SwapLabel>
        </Button>
        <Button size="sm" variant="ghost" title="Download the results as CSV"
          onClick={() => downloadText(`${slug}.csv`, toDelimited(get(), "csv"),
            "text/csv;charset=utf-8")}>CSV</Button>
        <Button size="sm" variant="ghost" title="Download the results as tab-separated text"
          onClick={() => downloadText(`${slug}.txt`, toDelimited(get(), "tsv"),
            "text/tab-separated-values;charset=utf-8")}>TSV</Button>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}
