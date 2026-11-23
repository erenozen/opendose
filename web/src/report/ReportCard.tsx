// Under a results sheet: the result as a manuscript sentence (in the
// project's P-value style), the figure legend of its graph, equivalent R
// and Python code, and the doors to the journal checklists, the history
// (provenance) and the reporting details of the table.
import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import { CopyButton } from "../components/CiteBlock";
import { Tabs } from "../components/ui";
import type { DataSheet, DataTableModel, ResultsSheet } from "../project/types";
import { legendFor, legendGraph } from "./legendFor";
import { valuesPhrase } from "./valuesAre";
import { useFamilyEquivalence } from "./estimation/useFamilyEquivalence";
import { P_STYLES } from "./pformat";
import { resultSentence } from "./sentences";
import { snippetsFor } from "./snippets";
import { openChecklist, openHistory, openReportingDetails, softwareLabel, useReportPrefs } from "./useReport";
import "./report.css";
import { Button } from "../components/ui";

export default function ReportCard({ sheet, table, options, result }: {
  sheet: ResultsSheet; table: DataTableModel; options: unknown; result: unknown;
}) {
  const { project } = useProject();
  const prefs = useReportPrefs();
  const data = project.sheets.find((s) => s.id === sheet.parentId) as DataSheet | undefined;
  const graph = legendGraph(project.sheets, sheet.id, sheet.parentId);
  const sentence = useMemo(() => resultSentence(result, { style: prefs.pStyle, prefs }),
    [result, prefs]);
  const valuesAre = data ? valuesPhrase(project, data) : null;
  const equivalence = useFamilyEquivalence(graph);
  const legend = useMemo(() => (data ? legendFor({
    data, table, graph, result, options, prefs, software: softwareLabel(), valuesAre, equivalence,
  }) : ""), [data, table, graph, result, options, prefs, valuesAre, equivalence]);
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
        <Button onClick={() => openChecklist(sheet.parentId)}>Journal checklists</Button>
        <Button onClick={() => openHistory(sheet.parentId)}>History</Button>
        {data && <Button onClick={() => openReportingDetails(data.id)}>Reporting details…</Button>}
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
            <Tabs value={lang} onValueChange={setLang}>
              <div className="snippet-tabs">
                <Tabs.List aria-label="Language">
                  <Tabs.Tab value="r">R</Tabs.Tab>
                  <Tabs.Tab value="python">Python</Tabs.Tab>
                </Tabs.List>
                <CopyButton text={lang === "r" ? s.r : s.python} label={`Copy ${lang === "r" ? "R" : "Python"} code`} />
              </div>
              <Tabs.Panel value={lang}>
                <pre><code>{lang === "r" ? s.r : s.python}</code></pre>
              </Tabs.Panel>
            </Tabs>
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
