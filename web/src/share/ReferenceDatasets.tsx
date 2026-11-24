// The validation page's reference datasets (P-127): every published
// dataset that ships with the site, with its reference values, and "Open
// this dataset", which opens it as a project (its table, the analysis the
// reference was computed with, an info sheet with the published values).
// The open project closes, with Undo, as Open… does.
import { Button, Num } from "../components/ui";
import { REFERENCE_DIGITS } from "./openReferenceDataset";
import {
  datasetShortName, referenceText, toleranceText, type ReferenceDataset, type ReferenceIndex,
} from "./referenceDatasets";

const ANALYSIS: Record<ReferenceDataset["plan"]["kind"], string> = {
  column_stats: "Column statistics",
  anova: "One-way ANOVA",
  user_fit: "Curve fit, NIST's equation from Start 1",
  linreg: "Linear regression",
  polynomial2: "Curve fit, second order polynomial",
  mv_regression: "Multiple linear regression",
};

function engineSummary(d: ReferenceDataset): string {
  const tested = d.references.filter((r) => r.engine);
  const out = tested.filter((r) => r.engine!.status !== "pass").length;
  if (!tested.length) return "";
  if (!out) return `the engine's test run matches all ${tested.length} within the tolerance`;
  return `the engine's test run matches ${tested.length - out} of ${tested.length}`
    + (d.stress ? " (a float64 stress test: see the info sheet)" : "");
}

export default function ReferenceDatasets({ index, query, onOpen }: {
  index: ReferenceIndex;
  query: string;
  onOpen: (d: ReferenceDataset) => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = index.datasets.filter((d) => !q
    || `${d.title} ${ANALYSIS[d.plan.kind]} ${d.workflow}`.toLowerCase().includes(q));
  if (!shown.length) return null;
  return (
    <section className="validation-group validation-datasets" aria-labelledby="val-datasets">
      <h3 id="val-datasets">Reference datasets you can open</h3>
      <p>
        The {index.datasets.length} NIST Statistical Reference Datasets below ship with OpenDose
        (public domain). Open one as a project: its table, the analysis its certified values come
        from, and an info sheet that lists every certified value. Results show {REFERENCE_DIGITS} significant
        digits. The rest of the corpus (R, textbook and package data) is checked by the test suite only.
      </p>
      <div className="validation-table-wrap" tabIndex={0} role="region" aria-label="Reference datasets">
        <table className="validation-table">
          <thead>
            <tr>
              <th scope="col">Dataset</th>
              <th scope="col">Analysis</th>
              <th scope="col">Certified values</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <th scope="row" className="validation-dataset">
                  {datasetShortName(d)}
                  <span className="validation-note">
                    {d.title.replace(/^NIST StRD /, "").replace(/:.*$/, "")}
                    {d.difficulty ? `, ${d.difficulty.toLowerCase()}` : ""}
                  </span>
                  <Button size="sm" className="validation-open"
                    aria-label={`Open this dataset: ${datasetShortName(d)}`}
                    onClick={() => onOpen(d)}>Open this dataset</Button>
                </th>
                <td>{ANALYSIS[d.plan.kind]}</td>
                <td>
                  <details className="validation-values">
                    <summary>{d.references.length} values{engineSummary(d) ? `; ${engineSummary(d)}` : ""}</summary>
                    <ul>
                      {d.references.map((r) => (
                        <li key={r.quantity}>
                          <span className="validation-q">{r.quantity}</span>{" "}
                          <Num>{referenceText(r)}</Num>
                          <span className="validation-note">
                            {r.source}; {toleranceText(r.tolerance)}
                            {r.engine ? <>; engine <Num>{String(r.engine.value)}</Num></> : "; not computed by OpenDose"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
