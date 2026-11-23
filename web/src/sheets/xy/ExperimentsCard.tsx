// The typeset tables of potency across experiments (P-08): each
// experiment's own fit, then the summary on n = experiments, and the
// linked column table of per-experiment logIC50 values. Numbers come from
// the engine (potency.py) through sheets/xy/experiments.ts.
import { useProject } from "../../app/context";
import { useLinkedTable } from "../../app/linkedTable";
import { findSheet } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import { Button, NumText } from "../../components/ui";
import { SRC } from "../../guide/sources";
import {
  POTENCY_OUTPUT, exclusionText, potencySummaries, potencyTable, type PotencySummary,
} from "./experiments";

const SOURCES = [SRC.lazic2010, SRC.christopoulos1998];

function SummaryCard({ s, xUnit }: { s: PotencySummary; xUnit: string }) {
  const log = `Log${s.label}`;
  if (s.error) {
    return (
      <div className="result-card experiments-card">
        <h3>Across experiments: {s.name}</h3>
        <div className="results-error">Could not fit each experiment: {s.error}.</div>
      </div>
    );
  }
  return (
    <div className="result-card experiments-card">
      <h3>Across experiments: {s.name}</h3>
      <p className="model-line">
        Each experiment fitted on its own with the same model and options. The {log} of each
        experiment is one value: mean, SD and a t-based 95% CI on n − 1 df, n = experiments;
        the geometric-mean {s.label} and its CI are the antilogs.
      </p>
      <table className="results-table">
        <caption className="sr-only">Fit of each experiment of {s.name}</caption>
        <thead>
          <tr>
            <th scope="col">Experiment</th>
            <th scope="col">{log}</th>
            <th scope="col">{s.label} ({xUnit})</th>
            <th scope="col">95% CI of {log} (its wells)</th>
            <th scope="col">In the summary</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.name}>
              <th scope="row">{r.name}</th>
              <td>{r.logValue}</td>
              <td>{r.value}</td>
              <td>{r.logCI}</td>
              <td>{r.included ? "Yes" : `No: ${r.reason}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="results-table goodness">
        <caption className="sr-only">Summary across experiments of {s.name}</caption>
        <tbody>
          <tr><th scope="row">Experiments (n)</th><td>{s.n} of {s.of}</td></tr>
          {s.meanLog && <tr><th scope="row">Mean {log}</th><td>{s.meanLog}</td></tr>}
          {s.sdLog && <tr><th scope="row">SD of {log}</th><td>{s.sdLog}</td></tr>}
          {s.ciLog && (
            <tr><th scope="row">95% CI of mean {log} (t, {s.df} df)</th><td>{s.ciLog}</td></tr>
          )}
          {s.pMean && <tr><th scope="row">Mean p{s.label}</th><td>{s.pMean}</td></tr>}
          {s.pCI && <tr><th scope="row">95% CI of mean p{s.label}</th><td>{s.pCI}</td></tr>}
          {s.geomean && (
            <tr><th scope="row">Geometric-mean {s.label} ({xUnit})</th><td>{s.geomean}</td></tr>
          )}
          {s.geomeanCI && (
            <tr><th scope="row">95% CI of geometric-mean {s.label}</th><td>{s.geomeanCI}</td></tr>
          )}
        </tbody>
      </table>
      {s.withheld && (
        <p className="caveat-note">
          <NumText text={`No SD or CI across experiments: ${s.withheld}.`} />
        </p>
      )}
      {!s.withheld && s.rows.filter((r) => !r.included).map((r) => (
        <p key={r.name} className="caveat-note"><NumText text={exclusionText(r)} /></p>
      ))}
      {s.notes.map((n) => <p key={n} className="caveat-note"><NumText text={n} /></p>)}
      <p className="hint-block experiments-sources">
        {SOURCES.map((src) => (
          <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="guide-source">
            {src.label}</a>
        ))}
      </p>
    </div>
  );
}

function LinkedTableRow({ result, sheet, label }: { result: unknown; sheet: ResultsSheet; label: string }) {
  const { project, select } = useProject();
  const linked = useLinkedTable(sheet.id, POTENCY_OUTPUT);
  const parentName = findSheet(project, sheet.parentId)?.name ?? "table";
  const table = potencyTable(result);
  if (!table) return null;
  return (
    <div className="copy-table-row">
      {linked.outputs.map((d) => (
        <Button key={d.id} onClick={() => select(d.id)}>Open “{d.name}”</Button>
      ))}
      {!linked.outputs.length && (
        <Button onClick={() => linked.create(table, `Log${label} per experiment of ${parentName}`)}>
          Make a linked table of Log{label} values
        </Button>
      )}
      <span className="hint-block">
        A column table with one Log{label} per experiment and data set, for a t test or ANOVA
        between compounds. It follows the data and these settings.
      </span>
    </div>
  );
}

export function ExperimentsResults({ sheet, result, xUnit }: {
  sheet: ResultsSheet; result: unknown; xUnit: string;
}) {
  const sums = potencySummaries(result);
  if (!sums.length) return null;
  return (
    <>
      {sums.map((s) => <SummaryCard key={s.name} s={s} xUnit={xUnit} />)}
      <LinkedTableRow result={result} sheet={sheet} label={sums.find((s) => !s.error)?.label ?? "IC50"} />
    </>
  );
}
