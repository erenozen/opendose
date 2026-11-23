// Results of the Schild plot (P-49) under an EC50-shift fit: each curve's
// EC50 and dose ratio, the line of log(DR − 1) on log[antagonist] with its
// slope's 95% CI read against 1, and the linked XY table and graph.
// Numbers: sheets/xy/schild.ts (the engine's, printed with formatSig).
import { useProject } from "../../app/context";
import { useLinkedTable } from "../../app/linkedTable";
import { newId } from "../../project/ids";
import { addSheets, findSheet, makeGraphSheet } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import { Button, NumText } from "../../components/ui";
import { SRC } from "../../guide/sources";
import { GRAPH_SCHILD } from "../../project/builtin";
import { SCHILD_OUTPUT, readSchild, schildTable, slopeSentence } from "./schild";

export function SchildResults({ sheet, result }: { sheet: ResultsSheet; result: unknown }) {
  const { project, apply, select } = useProject();
  const linked = useLinkedTable(sheet.id, SCHILD_OUTPUT);
  const v = readSchild(result);
  if (!v) return null;
  const parentName = findSheet(project, sheet.parentId)?.name ?? "table";
  const table = schildTable(result);
  const graphs = project.sheets.filter((s) => s.kind === "graph" && s.resultsId === sheet.id
    && s.graphType === GRAPH_SCHILD);
  const addGraph = () => {
    const id = newId();
    apply((p) => addSheets(p, [makeGraphSheet(id, sheet.parentId, sheet.id, GRAPH_SCHILD,
      { titles: { x: "", y: "" }, scheme: p.prefs.scheme }, `Schild plot of ${parentName}`)], sheet.id));
    select(id);
  };
  return (
    <div className="result-card schild-card">
      <h3>Schild plot</h3>
      <p className="model-line">
        Each curve&apos;s EC50 from a fit with Top, Bottom and Hill slope shared, the dose ratio
        DR = EC50 / EC50 of {v.control || "the control"}, and the straight line of log(DR − 1)
        on log[antagonist]. A display of the data: pA2 and KB above are the global fit&apos;s.
      </p>
      <div className="schild-scroll" tabIndex={0} role="region" aria-label="Dose ratios of each antagonist concentration">
        <table className="results-table">
          <caption className="sr-only">Dose ratios of each antagonist concentration</caption>
          <thead>
            <tr>
              <th scope="col">Curve</th>
              <th scope="col">[Antagonist]</th>
              <th scope="col">log[Antagonist]</th>
              <th scope="col">LogEC50</th>
              <th scope="col">Dose ratio</th>
              <th scope="col">log(DR − 1)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{v.control}</th><td>0</td><td>n/a</td><td>{v.controlLogEC50}</td>
              <td>1</td><td>n/a</td>
            </tr>
            {v.rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th><td>{r.antagonist}</td><td>{r.logB}</td>
                <td>{r.logEC50}</td><td>{r.doseRatio}</td><td>{r.y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.slope && (
        <table className="results-table goodness">
          <caption className="sr-only">Line of log(DR − 1) on log[antagonist]</caption>
          <tbody>
            <tr><th scope="row">Schild slope</th><td>{v.slope}</td></tr>
            <tr><th scope="row">95% CI of the slope (t, {v.df} df)</th><td>{v.slopeCI ?? "n/a"}</td></tr>
            {v.pSlope1 && <tr><th scope="row">P (slope = 1)</th><td>{v.pSlope1}</td></tr>}
            {v.pA2Plot && <tr><th scope="row">pA2 from the plot (X intercept)</th><td>{v.pA2Plot}</td></tr>}
            {v.r2 && <tr><th scope="row">R squared</th><td>{v.r2}</td></tr>}
            <tr><th scope="row">Points (n)</th><td>{v.n}</td></tr>
          </tbody>
        </table>
      )}
      {v.slope && <p className="caveat-note"><NumText text={slopeSentence(v)} /></p>}
      {v.error && <div className="results-error">No Schild line: {v.error}.</div>}
      {v.rows.filter((r) => !r.included).map((r) => (
        <p key={r.name} className="caveat-note">Left out: {r.name}, {r.reason}.</p>
      ))}
      <div className="schild-actions">
        {linked.outputs.map((d) => (
          <Button key={d.id} onClick={() => select(d.id)}>Open “{d.name}”</Button>
        ))}
        {!linked.outputs.length && table && (
          <Button onClick={() => linked.create(table, `Schild data of ${parentName}`)}>
            Make a linked table of log(DR − 1)
          </Button>
        )}
        {graphs.length ? (
          <Button onClick={() => select(graphs[0].id)}>Open “{graphs[0].name}”</Button>
        ) : v.points.length > 0 && <Button onClick={addGraph}>Make a Schild plot</Button>}
      </div>
      <p className="hint-block">
        <a href={SRC.arunlakshana1959.url} target="_blank" rel="noreferrer" className="guide-source">
          {SRC.arunlakshana1959.label}</a>
      </p>
    </div>
  );
}
