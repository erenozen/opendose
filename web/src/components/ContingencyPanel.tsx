import { useEffect, useState, type ReactNode } from "react";
import HSplitter from "./HSplitter";
import { getEngine } from "../lib/engine";
import { formatSig } from "../types";

// Prism contingency table: rows = groups, columns = outcomes; counts only.
const DEFAULT = {
  rowLabels: ["Exposed", "Not exposed"],
  colLabels: ["Event", "No event"],
  cells: [["15", "85"], ["5", "95"]],
};

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtP(p: any): string {
  if (typeof p !== "number") return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

function fmtCI(ci: any): string {
  if (!Array.isArray(ci)) return "n/a";
  return `${formatSig(ci[0])} to ${formatSig(ci[1])}`;
}

export default function ContingencyPanel({ engineReady, splitter }: {
  engineReady: boolean;
  splitter?: ReactNode;
}) {
  const [rowLabels, setRowLabels] = useState(DEFAULT.rowLabels);
  const [colLabels, setColLabels] = useState(DEFAULT.colLabels);
  const [cells, setCells] = useState(DEFAULT.cells);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!engineReady) return;
    const t = setTimeout(async () => {
      const table = cells.map((row) => row.map((v) => Number(v.trim() || "0")));
      if (table.some((row) => row.some((v) => !Number.isFinite(v) || v < 0))) {
        return;
      }
      const engine = await getEngine();
      setResult(engine.analyze({
        analysis: "contingency",
        data: { table },
        options: {},
      }));
    }, 400);
    return () => clearTimeout(t);
  }, [cells, engineReady]);

  const setCell = (r: number, c: number, v: string) =>
    setCells(cells.map((row, i) =>
      i === r ? row.map((x, j) => (j === c ? v : x)) : row));

  const addRow = () => {
    setRowLabels([...rowLabels, `Row ${rowLabels.length + 1}`]);
    setCells([...cells, colLabels.map(() => "0")]);
  };
  const addCol = () => {
    setColLabels([...colLabels, `Outcome ${colLabels.length + 1}`]);
    setCells(cells.map((row) => [...row, "0"]));
  };
  const is2x2 = cells.length === 2 && cells[0].length === 2;

  return (
    <>
      <div className="left" inert={!engineReady}>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th className="rownum" />
                {colLabels.map((c, j) => (
                  <th key={j}>
                    <input className="ds-name" value={c}
                      onChange={(e) => setColLabels(
                        colLabels.map((x, k) => (k === j ? e.target.value : x)))} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cells.map((row, i) => (
                <tr key={i}>
                  <th className="row-label">
                    <input className="ds-name" value={rowLabels[i]}
                      onChange={(e) => setRowLabels(
                        rowLabels.map((x, k) => (k === i ? e.target.value : x)))} />
                  </th>
                  {row.map((v, j) => (
                    <td key={j}>
                      <input inputMode="numeric" value={v}
                        onChange={(e) => setCell(i, j, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-actions">
            <button onClick={addRow}>+ Row</button>
            <button onClick={addCol}>+ Column</button>
            <span className="hint">Enter counts (not percentages).</span>
          </div>
        </div>
        <HSplitter />
        <div className="controls">
          <section>
            <h3>How to enter data</h3>
            <p className="hint-block">
              Rows are groups (e.g. exposed / not exposed); columns are
              outcomes. Enter the number of subjects in each cell as counts,
              not percentages. Click a label to rename it.
            </p>
          </section>
          <section>
            <h3>Which test</h3>
            <p className="hint-block">
              For 2×2 tables, Fisher&apos;s exact test is reported and
              recommended. Chi-square (with and without Yates&apos;
              correction) covers larger tables; odds ratio, relative risk
              and sensitivity/specificity are computed for 2×2.
            </p>
          </section>
        </div>
      </div>
      {splitter}
      <div className="right">
        {result && !result.error && (
          <div className="result-card">
            <h3>Contingency table analysis</h3>
            <table className="results-table goodness">
              <tbody>
                {is2x2 && result.fisher_exact && (
                  <tr>
                    <th>Fisher's exact test (recommended for 2×2)</th>
                    <td>P = {fmtP(result.fisher_exact.p)}</td>
                  </tr>
                )}
                <tr>
                  <th>Chi-square, df</th>
                  <td>
                    {formatSig(result.chi_square.chi2)}, {result.chi_square.df}
                    {", "}P = {fmtP(result.chi_square.p)}
                  </td>
                </tr>
                {result.chi_square_yates && (
                  <tr>
                    <th>Chi-square with Yates' correction</th>
                    <td>{formatSig(result.chi_square_yates.chi2)}, P ={" "}
                      {fmtP(result.chi_square_yates.p)}</td>
                  </tr>
                )}
                {result.odds_ratio && (
                  <tr>
                    <th>Odds ratio (Woolf 95% CI)</th>
                    <td>{formatSig(result.odds_ratio.value)}{" "}
                      ({fmtCI(result.odds_ratio.ci)})</td>
                  </tr>
                )}
                {result.relative_risk && (
                  <tr>
                    <th>Relative risk (95% CI)</th>
                    <td>{formatSig(result.relative_risk.value)}{" "}
                      ({fmtCI(result.relative_risk.ci)})</td>
                  </tr>
                )}
                {result.proportions && (
                  <tr>
                    <th>Difference between proportions</th>
                    <td>{formatSig(result.proportions.p1)} −{" "}
                      {formatSig(result.proportions.p2)} ={" "}
                      {formatSig(result.proportions.difference)}</td>
                  </tr>
                )}
                {result.sensitivity && (
                  <>
                    <tr>
                      <th>Sensitivity (Wilson 95% CI)</th>
                      <td>{formatSig(result.sensitivity.value)}{" "}
                        ({fmtCI(result.sensitivity.ci)})</td>
                    </tr>
                    <tr>
                      <th>Specificity (Wilson 95% CI)</th>
                      <td>{formatSig(result.specificity.value)}{" "}
                        ({fmtCI(result.specificity.ci)})</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
        {result?.error && (
          <div className="results-error">{String(result.error)}</div>
        )}
      </div>
    </>
  );
}
