// The standard curve's Precision report (P-94): repeatability (within-
// run), between-run, between-day and total CV with their CIs (CLSI
// EP05-A3, VCA), the repeatability coefficient (Bland & Altman 1996) and
// recovery against the nominal concentration with the ICH M10 verdict,
// for every sample measured on two or more plates. Numbers from the
// engine (precision_study); pure parts in precision.ts.
import { formatSig } from "../../../types";
import "./precision.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COMPONENTS: [string, string][] = [
  ["repeatability", "Repeatability (within run)"],
  ["between_run", "Between run"],
  ["between_day", "Between day"],
  ["total", "Within laboratory (total)"],
];

export const PRECISION_SOURCES = "CLSI EP05-A3 (2014); VCA (Schuetzenmeister & Dufey); "
  + "Bland & Altman 1996, BMJ 313:744; ICH M10 (2022) section 3.2.5";

function Verdict({ rec }: { rec: any }) {
  if (!rec || rec.error) return <>{rec?.error ?? "no nominal"}</>;
  if (typeof rec.accepted !== "boolean") return <>n/a</>;
  return <>{rec.accepted ? "Pass" : `Fail (${[!rec.accuracy_accepted && "recovery",
    !rec.precision_accepted && "CV"].filter(Boolean).join(", ")})`}</>;
}

/** A CV with its CI on a second, quieter line (keeps the table narrow). */
function Cv({ c }: { c: any }) {
  if (!c || typeof c.cv_percent !== "number") return <>n/a</>;
  return (
    <>{formatSig(c.cv_percent, 3)}%
      {Array.isArray(c.cv_ci) && (
        <span className="precision-ci">{formatSig(c.cv_ci[0], 3)} to {formatSig(c.cv_ci[1], 3)}</span>
      )}</>
  );
}

function Recovery({ rec }: { rec: any }) {
  if (!rec || rec.error || typeof rec.recovery_percent !== "number") return <>—</>;
  return (
    <>{formatSig(rec.recovery_percent, 4)}%
      {Array.isArray(rec.recovery_ci) && (
        <span className="precision-ci">{formatSig(rec.recovery_ci[0], 4)} to {formatSig(rec.recovery_ci[1], 4)}</span>
      )}</>
  );
}

/** intro: what a run is in this layout (the standard curve: a plate). */
export function PrecisionReport({ p, unit, intro }: { p: any; unit: string; intro?: string }) {
  if (!p) return null;
  if (p.error) return <p className="results-error">Precision report: {String(p.error)}</p>;
  const samples: any[] = Array.isArray(p.samples) ? p.samples : [];
  const level = `${Math.round((p.ci_level ?? 0.95) * 100)}%`;
  const days = samples.some((s) => s.n_days);
  return (
    <section className="precision-report" aria-label="Precision and recovery">
      <h4>Precision and recovery</h4>
      <p className="hint-block">
        {intro ?? `Samples measured on two or more plates: each plate is a run${days ? ", within its day" : ""}.`}
        {" "}CVs with their {level} CI below them; recovery = mean / nominal, accepted within ±{formatSig(p.recovery_limit_percent)}%
        with within-run and total CV at most {formatSig(p.cv_limit_percent)}% (ICH M10).
      </p>
      <div className="results-scroll">
        <table className="results-table">
          <caption className="sr-only">Precision and recovery</caption>
          <thead>
            <tr><th scope="col">Sample</th><th scope="col">Runs</th><th scope="col">Mean ({unit})</th>
              <th scope="col">Repeatability CV</th><th scope="col">Between-run CV</th>
              {days && <th scope="col">Between-day CV</th>}
              <th scope="col">Total CV</th><th scope="col">Recovery</th><th scope="col">Accepted</th></tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.name}>
                <th scope="row">{s.name}</th>
                {s.error ? <td colSpan={days ? 8 : 7}>{s.error}</td> : <>
                  <td>{s.n_runs}{s.n_days ? ` (${s.n_days} days)` : ""}</td>
                  <td>{formatSig(s.mean)}</td>
                  <td><Cv c={s.components?.repeatability} /></td>
                  <td><Cv c={s.components?.between_run} /></td>
                  {days && <td>{s.components?.between_day ? <Cv c={s.components.between_day} /> : "—"}</td>}
                  <td><Cv c={s.components?.total} /></td>
                  <td><Recovery rec={s.recovery} /></td>
                  <td><Verdict rec={s.recovery} /></td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {samples.filter((s) => !s.error).map((s) => (
        <details key={s.name} className="precision-detail">
          <summary>{s.name}: variance components ({s.design}, {s.n} values)</summary>
          <div className="results-scroll">
            <table className="results-table">
              <caption className="sr-only">{s.name}: variance components</caption>
              <thead>
                <tr><th scope="col">Component</th><th scope="col">Variance</th><th scope="col">SD</th>
                  <th scope="col">CV</th><th scope="col">{level} CI of the variance</th>
                  <th scope="col">% of total</th></tr>
              </thead>
              <tbody>
                {COMPONENTS.filter(([k]) => s.components?.[k]).map(([k, label]) => {
                  const c = s.components[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{label}</th><td>{formatSig(c.variance)}</td><td>{formatSig(c.sd)}</td>
                      <td>{c.cv_percent == null ? "n/a" : `${formatSig(c.cv_percent, 3)}%`}</td>
                      <td>{formatSig(c.variance_ci[0])} to {formatSig(c.variance_ci[1])} ({c.ci_method})</td>
                      <td>{c.percent_of_total == null ? "" : `${formatSig(c.percent_of_total, 3)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint-block">
            Repeatability coefficient {formatSig(s.repeatability_coefficient)} {unit}: two replicates of
            this sample in one run differ by less than this in 95% of pairs (1.96 × √2 × repeatability SD;
            Bland &amp; Altman 1996).
          </p>
          {(s.warnings ?? []).map((w: string) => <p key={w} className="result-note" role="note">{w}</p>)}
        </details>
      ))}
      {(p.notes ?? []).map((n: string) => <p key={n} className="hint-block">{n}</p>)}
      <p className="hint-block">Sources: {PRECISION_SOURCES}.</p>
    </section>
  );
}
