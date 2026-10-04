// Under a results sheet: the result as a manuscript sentence (in the
// project's P-value style), the figure legend of its graph, equivalent R
// and Python code, and the doors to the journal checklists, the history
// (provenance) and the reporting details of the table.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import { CopyButton } from "../components/CiteBlock";
import type { DataSheet, DataTableModel, ResultsSheet } from "../project/types";
import { legendFor, legendGraph } from "./legendFor";
import { P_STYLES } from "./pformat";
import { resultSentence } from "./sentences";
import { snippetsFor } from "./snippets";
import { openChecklist, openHistory, openReportingDetails, softwareLabel, useReportPrefs } from "./useReport";
import "./report.css";

export default function ReportCard({ sheet, table, options, result }: {
  sheet: ResultsSheet; table: DataTableModel; options: unknown; result: unknown;
}) {
  const { project } = useProject();
  const prefs = useReportPrefs();
  const data = project.sheets.find((s) => s.id === sheet.parentId) as DataSheet | undefined;
  const graph = legendGraph(project.sheets, sheet.id, sheet.parentId);
  const sentence = useMemo(() => resultSentence(result, { style: prefs.pStyle, prefs }),
    [result, prefs]);
  const legend = useMemo(() => (data ? legendFor({
    data, table, graph, result, options, prefs, software: softwareLabel(),
  }) : ""), [data, table, graph, result, options, prefs]);
  if (!result || (typeof result === "object" && (result as { error?: unknown }).error)) return null;
  if (!sentence && !legend) return null;
  return (
    <section className="report-card" aria-label="Report">
      <h3>Report</h3>
      {sentence && (
        <div className="report-block report-sentence">
          <h4>Results sentence <span className="report-style-note">({P_STYLES[prefs.pStyle].label} style; change in Preferences)</span></h4>
          <p>{sentence}</p>
          <CopyButton text={sentence} label="Copy sentence" />
        </div>
      )}
      {legend && (
        <div className="report-block report-legend">
          <h4>Figure legend{graph ? ` (${graph.name})` : ""}</h4>
          <p>{legend}</p>
          <CopyButton text={legend} label="Copy legend" />
        </div>
      )}
      <Snippets result={result} options={options} table={table} />
      <div className="report-actions">
        <button type="button" onClick={() => openChecklist(sheet.parentId)}>Journal checklists</button>
        <button type="button" onClick={() => openHistory(sheet.parentId)}>History</button>
        {data && <button type="button" onClick={() => openReportingDetails(data.id)}>Reporting details…</button>}
      </div>
    </section>
  );
}

function Snippets({ result, options, table }: { result: unknown; options: unknown; table: DataTableModel }) {
  const [lang, setLang] = useState<"r" | "python">("r");
  const [open, setOpen] = useState(false);
  const s = useMemo(() => (open ? snippetsFor(result, options, table) : null),
    [open, result, options, table]);
  return (
    <div className="report-block snippets">
      <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Equivalent R and Python code</summary>
        {s && (s.r || s.python) ? (
          <>
            <div className="snippet-tabs" role="tablist" aria-label="Language">
              <button type="button" role="tab" aria-selected={lang === "r"} onClick={() => setLang("r")}>R</button>
              <button type="button" role="tab" aria-selected={lang === "python"} onClick={() => setLang("python")}>Python</button>
              <CopyButton text={lang === "r" ? s.r : s.python} label={`Copy ${lang === "r" ? "R" : "Python"} code`} />
            </div>
            <pre role="tabpanel" aria-label={lang === "r" ? "R code" : "Python code"}><code>{lang === "r" ? s.r : s.python}</code></pre>
            {s.caveats.length > 0 && (
              <ul aria-label="Where the defaults differ">
                {s.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
          </>
        ) : s ? <p className="hint-block">No standard R or Python call reproduces this analysis directly.</p> : null}
      </details>
    </div>
  );
}
