import { useRef, type ReactNode } from "react";
import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText, resultsMatrix } from "./download";
import { copyHtml, readSections } from "../../export/clipboard";
import { wordHtml, wordPlain } from "../../export/wordTable";
import { Button, Menu, SwapLabel, notify, useLabelSwap } from "../../components/ui";
import { saveBlob } from "../../export/download";
import { versionLabel } from "../../export/cite";
import { projectWorkbook, renamedPhrase } from "../../export/workbook";
import { XLSX_MIME } from "../../export/xlsx";
import { useScrollRegions, useTypesetTables } from "./resultsTypeset";
import "./grid.css";

/** Copy / Copy for Word / Download (CSV, TSV, Excel) strip above a
 *  results sheet. Copy says "Copied" on the button itself for two
 *  seconds (DECISIONS 6); a failure is an error toast with the way out.
 *  The three downloads share one menu so the strip stays at three
 *  controls on a phone (buttons.md: at most four in a row). The tables
 *  below it are typeset (numbers right-aligned) and scroll sideways when
 *  too wide. */
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
        <Menu>
          <Menu.Trigger variant="ghost" size="sm">
            Download<span className="caret" aria-hidden="true">▾</span>
          </Menu.Trigger>
          <Menu.Content aria-label="Download these results">
            <Menu.Item description="Comma-separated, as shown"
              onSelect={() => downloadText(`${slug}.csv`, toDelimited(get(), "csv"),
                "text/csv;charset=utf-8")}>CSV</Menu.Item>
            <Menu.Item description="Tab-separated text, as shown"
              onSelect={() => downloadText(`${slug}.txt`, toDelimited(get(), "tsv"),
                "text/tab-separated-values;charset=utf-8")}>TSV</Menu.Item>
            <Menu.Item description="One sheet, numbers stored as numbers"
              onSelect={() => {
                const m = get();
                if (!m.length) {
                  notify("No results to download yet: the analysis has not produced any.", { tone: "info" });
                  return;
                }
                const wb = projectWorkbook({ title: name, app: `OpenDose ${versionLabel()}`,
                  date: new Date().toISOString(), tables: [],
                  results: [{ name, analysis: "", data: "", matrix: m }] });
                saveBlob(new Blob([wb.bytes as Uint8Array<ArrayBuffer>], { type: XLSX_MIME }), `${slug}.xlsx`);
                // the browser shows the download; only a changed sheet name is news
                if (wb.renamed.length) {
                  notify(`Saved “${slug}.xlsx”: ${renamedPhrase(wb.renamed).replace(/^1 sheet name was/, "the sheet name was")}.`,
                    { tone: "info" });
                }
              }}>Excel workbook (.xlsx)</Menu.Item>
          </Menu.Content>
        </Menu>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}
