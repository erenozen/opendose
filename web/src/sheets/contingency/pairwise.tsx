// Pairwise comparisons of rows after an r x c test (FEATURE-PLAN P-14):
// the controls section and the typeset table with its family line
// (pairwiseText.ts has the words). Engine:
// contingency.pairwise_rows.
import { tableP } from "../../report/pformat";
import { formatSig } from "../../types";
import FamilyLine from "../common/FamilyLine";
import {
  PAIRWISE_LABELS, PAIRWISE_TEST_LABELS, type ContingencyOptions, type PairwiseCorrection,
} from "./run";
import { RULE_SOURCES, pairTestText } from "./pairwiseText";
import "./pairwise.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function PairwiseControls({ options, set, rows }: {
  options: ContingencyOptions; set: (p: Partial<ContingencyOptions>) => void; rows: number;
}) {
  if (rows < 3) return null;
  const on = !!options.pairwise && options.pairwise !== "none";
  return (
    <section>
      <h3>Compare pairs of rows</h3>
      <label className="check-row">
        <span>Correction</span>
        <select value={options.pairwise ?? "none"}
          onChange={(e) => set({ pairwise: e.target.value as PairwiseCorrection })}>
          {(Object.keys(PAIRWISE_LABELS) as PairwiseCorrection[]).map((k) => (
            <option key={k} value={k}>{PAIRWISE_LABELS[k]}</option>
          ))}
        </select>
      </label>
      {on && (
        <>
          <label className="check-row">
            <span>Test for each pair</span>
            <select value={options.pairwiseTest ?? "auto"}
              onChange={(e) => set({ pairwiseTest: e.target.value as ContingencyOptions["pairwiseTest"] })}>
              {Object.entries(PAIRWISE_TEST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <p className="hint-block">
            Each pair of rows is tested on its own table and the P values are adjusted over all
            {` ${rows * (rows - 1) / 2}`} pairs. The results name the test each pair used.
          </p>
        </>
      )}
    </section>
  );
}

export function PairwiseResults({ pw }: { pw: any }) {
  if (!pw || !Array.isArray(pw.comparisons)) return null;
  const fdr = pw.approach === "fdr";
  return (
    <div className="pairwise-rows">
      <h4>Pairs of rows</h4>
      <FamilyLine mc={pw} />
      <div className="pairwise-scroll" role="region" aria-label="Pairs of rows" tabIndex={0}>
      <table className="results-table pairwise-table">
        <thead>
          <tr>
            <th>Comparison</th><th>Proportions (first column)</th><th>Test</th>
            <th>Unadjusted P</th><th>{fdr ? "q value" : "Adjusted P"}</th>
            <th>{fdr ? "Discovery?" : "Below 0.05?"}</th>
          </tr>
        </thead>
        <tbody>
          {pw.comparisons.map((c: any) => (
            <tr key={c.pair}>
              <th scope="row">{c.pair}</th>
              <td>{(c.proportions ?? []).map((v: number | null) => (v == null ? "n/a" : formatSig(v))).join(" vs. ")}</td>
              <td>{pairTestText(c)}</td>
              <td>{tableP(c.p_unadjusted)}</td>
              <td>{tableP(c.p_adjusted)}</td>
              <td>{c.significant == null ? "n/a" : c.significant ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {pw.rule && (
        <p className="model-line">
          Test per pair: {pw.rule.replace(/ \(Cochran.*$/, "")}.{" "}
          <span className="source-line">Sources: {RULE_SOURCES.map((s, i) => (
            <span key={s.url}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
          ))}.</span>
        </p>
      )}
    </div>
  );
}
