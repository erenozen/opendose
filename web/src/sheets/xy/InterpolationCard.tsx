// The interpolated unknowns of a curve fit (P-22): one typeset row per
// unknown with its X, 95% CI and 95% prediction interval, and the flag of
// every unknown outside the standards. Numbers from the engine through
// sheets/xy/interpolation.ts.
import { useId } from "react";
import { NumText } from "../../components/ui";
import { SRC } from "../../guide/sources";
import type { DataTableModel } from "../../project/types";
import { interpolationTable } from "./interpolation";

const SOURCES = [SRC.gpInterpolate, SRC.greenwell2014];

export function InterpolationCard({ result, table, xUnit }: {
  result: unknown; table: DataTableModel; xUnit: string;
}) {
  const id = useId();
  const t = interpolationTable(result, table);
  if (!t) return null;
  const many = new Set(t.rows.map((r) => r.dataset)).size > 1;
  const xHead = t.xIsLog ? `X (${xUnit})` : "X";
  return (
    <div className="result-card interpolation-card">
      <h3 id={`${id}-title`}>Interpolated unknowns</h3>
      <div className="fit-summary-scroll" tabIndex={0} role="region" aria-labelledby={`${id}-title`}>
        <table className="results-table interpolation-table" aria-labelledby={`${id}-title`}>
          <thead>
            <tr>
              {many && <th scope="col">Data set</th>}
              <th scope="col">Unknown</th>
              <th scope="col">Y</th>
              {t.xIsLog && <th scope="col">log X</th>}
              <th scope="col">{xHead}</th>
              <th scope="col">95% CI of X</th>
              <th scope="col">95% prediction interval</th>
              <th scope="col">Flag</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className={r.position === "within" ? undefined : `interp-${r.position}`}>
                {many && <td>{r.dataset}</td>}
                <th scope="row">{r.unknown}</th>
                <td>{r.y}</td>
                {t.xIsLog && <td>{r.x}</td>}
                <td>{t.xIsLog ? r.conc : r.x}</td>
                <td>{r.ci}</td>
                <td>{r.pi}</td>
                <td className="interp-note">{r.note ? <NumText text={r.note} /> : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint-block">
        The 95% CI is where the curve&apos;s 95% confidence band reaches each Y: the uncertainty of
        the curve alone. The 95% prediction interval adds the scatter of one reading, so it is the
        range for a single measured sample (inversion interval). Both are searched over the
        standards&apos; X range extended by half of it each way; &quot;(very wide)&quot; marks a
        limit that does not close inside it.
        {!t.prediction && " No prediction interval for a weighted fit or a fit to means with SD and N: "
          + "Sy.x there is not the scatter of one reading."}
      </p>
      <p className="hint-block experiments-sources">
        {SOURCES.map((src) => (
          <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="guide-source">
            {src.label}</a>
        ))}
      </p>
    </div>
  );
}
