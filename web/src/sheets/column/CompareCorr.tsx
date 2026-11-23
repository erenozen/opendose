// Correlation controls and results for comparing two correlations (P-48;
// the payloads are built in compareCorr.ts).
import type { ColumnOptionsState } from "../../types";
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";
import { comparePairs, comparisonTestName, designReason, type CompareDesign } from "./compareCorr";

export function CompareCorrelations({ options, names, withX, set }: {
  options: ColumnOptionsState; names: string[]; withX: boolean;
  set: (patch: Partial<ColumnOptionsState>) => void;
}) {
  const pairs = comparePairs(names, withX ? undefined : [options.datasetA, options.datasetB]);
  const value = pairs.some((p) => p.value === options.corrCompare) ? options.corrCompare! : "";
  if (!pairs.length) return null;
  return (
    <>
      <label className="check-row">
        <span>{withX ? "Compare the r of" : "Compare with the r of"}</span>
        <select value={value} onChange={(e) => set({ corrCompare: e.target.value })}>
          <option value="">No comparison</option>
          {pairs.map((p) => (
            <option key={p.value} value={p.value}>
              {withX ? `X vs. ${p.label.replace(" vs. ", " and X vs. ")}` : p.label}</option>
          ))}
        </select>
      </label>
      {value && (
        <label className="check-row">
          <span>Measured on</span>
          <select value={options.corrCompareDesign ?? "auto"}
            onChange={(e) => set({ corrCompareDesign: e.target.value as CompareDesign })}>
            <option value="auto">Read from the table (same rows: same subjects)</option>
            <option value="independent">Different subjects (independent)</option>
            <option value="dependent">The same subjects (dependent)</option>
          </select>
        </label>
      )}
      {value && (
        <p className="hint-block">
          Different subjects: Fisher&apos;s z test. The same subjects: Steiger&apos;s (1980) Z test, which
          allows for the correlation between the two r. Pearson r only.
        </p>
      )}
    </>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The comparison block under the correlation results. */
export function CorrelationComparison({ c }: { c: any }) {
  if (!c) return null;
  if (c.error) {
    return (
      <div className="result-card">
        <h3>Comparing the two correlations</h3>
        <p className="result-note">Could not compare the two correlations: {String(c.error).replace(/\.$/, "")}.</p>
      </div>
    );
  }
  const [l1, l2] = (c.labels ?? ["First", "Second"]) as string[];
  const n = c.test === "fisher_z_independent" ? `${c.n1} and ${c.n2}` : String(c.n);
  const rows: [string, string][] = [
    [`r, ${l1}`, formatSig(c.r1)],
    [`r, ${l2}`, formatSig(c.r2)],
    ["Difference (first − second)", formatSig(c.difference)],
    ["Test", comparisonTestName(String(c.test))],
    ["z", formatSig(c.z)],
    ["P value (two-tailed)", `${tableP(c.p_two_tailed)} ${tableStars(c.p_two_tailed)}`.trim()],
    [c.test === "fisher_z_independent" ? "n (XY pairs), each" : "n (subjects with every value)", n],
  ];
  return (
    <div className="result-card compare-corr">
      <h3>Comparing the two correlations</h3>
      <table className="results-table goodness">
        <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
      </table>
      <p className="hint-block">
        {c.design === "dependent" ? "The same subjects" : "Different subjects"}: {designReason(String(c.design_reason ?? "stated"))}.
        {c.rows_left_out ? ` ${c.rows_left_out} row${c.rows_left_out === 1 ? "" : "s"} without every value left out.` : ""}
        {c.test === "fisher_z_independent"
          ? " z = (atanh r₁ − atanh r₂) / √(1/(n₁ − 3) + 1/(n₂ − 3))."
          : " Steiger (1980, Psychol Bull 87:245): the Fisher z of each r, with the covariance of the two from the"
            + " correlations among the variables."}
      </p>
    </div>
  );
}
