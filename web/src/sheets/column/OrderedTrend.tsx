// The trend-across-ordered-columns option (controls) and its results
// block (P-41); the wording lives in orderedTrend.ts.
import type { ColumnOptionsState } from "../../types";
import { formatSig } from "../../types";
import { tableP } from "../../report/pformat";
import { trendNote, trendOrderHint, trendRows } from "./orderedTrend";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function OrderedTrendOption({ options, datasetNames, onChange, repeated }: {
  options: ColumnOptionsState; datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void; repeated: boolean;
}) {
  return (
    <>
      <label className="check-row">
        <input type="checkbox" checked={!!options.rankTrend}
          onChange={(e) => onChange({ ...options, rankTrend: e.target.checked })} />
        <span>{repeated
          ? "Page's test for trend across ordered treatments"
          : "Jonckheere-Terpstra test for trend across ordered columns"}</span>
      </label>
      {options.rankTrend && (
        <p className="hint-block">
          {trendOrderHint(datasetNames, repeated ? "treatments" : "columns")}
        </p>
      )}
    </>
  );
}

export function OrderedTrendResults({ block }: { block: any }) {
  if (!block) return null;
  const title = block.test === "page" ? "Trend across ordered treatments (Page's test)"
    : "Trend across ordered columns (Jonckheere-Terpstra)";
  if (block.error) return <p className="result-note">{title}: {String(block.error)}</p>;
  const rows = trendRows(block, (v) => formatSig(v), tableP);
  return (
    <>
      <h4>{title}</h4>
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <p className="model-line">{trendNote(block)}</p>
    </>
  );
}
