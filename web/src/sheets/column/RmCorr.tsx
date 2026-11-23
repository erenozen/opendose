// Repeated-measures correlation (P-27): the Subject role control of a
// correlation and its results card (engine correlation.rm_corr); the
// rules live in rmCorr.ts.
import type { ColumnOptionsState } from "../../types";
import { formatSig } from "../../types";
import { pLabel, tableP, tableStars } from "../../report/pformat";
import { subjectDataset } from "./rmCorr";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function SubjectRoleSelect({ options, datasetNames, onChange }: {
  options: ColumnOptionsState; datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void;
}) {
  // a subject column that has since become X or Y is no role
  const d = subjectDataset(options.corrSubject);
  const role = d === options.datasetA || d === options.datasetB ? "" : options.corrSubject ?? "";
  return (
    <>
      <div className="check-row">
        <span aria-hidden="true">Subject</span>
        <select value={role} aria-label="Subject"
          onChange={(e) => onChange({ ...options, corrSubject: e.target.value })}>
          <option value="">None: every row is an independent subject</option>
          <option value="rows">Row titles name the subject</option>
          {datasetNames.map((n, i) => i === options.datasetA || i === options.datasetB ? null : (
            <option key={i} value={`d${i}`}>{`Column “${n || `Dataset ${i + 1}`}” holds subject IDs`}</option>
          ))}
        </select>
      </div>
      {role !== "" && (
        <p className="hint-block">
          Several rows per subject: repeated-measures correlation (Bakdash &amp; Marusich
          2017) gives the association within subjects, the common slope after removing each
          subject&apos;s mean. It says nothing about whether subjects with higher X have higher Y.
          Pearson only; rows without a subject are left out.
        </p>
      )}
    </>
  );
}

export function RmCorrResults({ result }: { result: any }) {
  const [a, b] = result.names ?? ["X", "Y"];
  const level = Math.round(100 * (result.ci_level ?? 0.95));
  const ci = Array.isArray(result.ci_r)
    ? `${formatSig(result.ci_r[0])} to ${formatSig(result.ci_r[1])}` : "n/a";
  const rows: [string, string][] = [
    ["Repeated-measures r (r_rm)", formatSig(result.r)],
    [`${level}% CI of r_rm (Fisher z)`, ci],
    ["df", String(result.df)],
    ["P value (two-tailed)", `${tableP(result.p_two_tailed)} ${tableStars(result.p_two_tailed)}`],
    ["Common within-subject slope", formatSig(result.slope)],
    ["n (XY pairs) / subjects", `${result.n} / ${result.n_subjects}`],
  ];
  return (
    <div className="result-card">
      <h3>Repeated-measures correlation: {a} vs. {b}</h3>
      <table className="results-table goodness">
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <p className="model-line">
        Within subjects only: r_rm(df = {result.df}) = {formatSig(result.r)}, {pLabel(result.p_two_tailed)},
        the {result.n_subjects} subjects&apos; common slope after removing each subject&apos;s
        mean (ANCOVA y ~ subject + x; df = pairs − subjects − 1). It does not say whether
        subjects with higher {a} have higher {b}. Bakdash &amp; Marusich (2017), Front Psychol
        8:456.
      </p>
    </div>
  );
}
