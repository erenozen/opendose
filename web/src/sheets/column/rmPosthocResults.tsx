// The comparisons table after repeated-measures one-way ANOVA (and after
// the mixed-effects model when values are missing): mean difference, CI,
// adjusted and unadjusted P, the family line, and how the error term was
// computed (rmPosthoc.ts).
import { formatSig } from "../../types";
import { tableP, tableStars } from "../../report/pformat";
import { adjustedHeader, familyOf, hasUnadjusted } from "../../report/family";
import FamilyLine from "../common/FamilyLine";
import { baselineName } from "./rmPosthoc";

/* eslint-disable @typescript-eslint/no-explicit-any */

const NAMES: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", sidak: "Šídák", bonferroni: "Bonferroni",
  holm: "Holm (Bonferroni step-down)", holm_sidak: "Holm-Šídák", fisher_lsd: "Fisher's LSD",
  fisher: "Fisher's LSD",
};

const ci = (c: unknown) => (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number"
  ? `${formatSig(c[0])} to ${formatSig(c[1])}` : "n/a");

export function RmComparisons({ mc, names, mixed = false }: {
  mc: any; names?: string[]; mixed?: boolean;
}) {
  const fam = familyOf(mc);
  const unadj = hasUnadjusted(mc.comparisons) && fam?.kind !== "unadjusted";
  const m = String(mc.method ?? "");
  const base = m === "dunnett" ? baselineName(mc, names ?? mc.names ?? []) : null;
  const how = mixed ? "estimated means of the mixed model"
    : mc.error === "per_pair" ? "each pair's own paired differences, sphericity not assumed"
      : "pooled RM ANOVA residual, sphericity assumed";
  const level = Math.round(100 * (mc.ci_level ?? 0.95));
  return (
    <>
      <h4>
        {NAMES[m] ?? m} multiple comparisons{base ? ` vs. ${base}` : ""} ({how}
        {typeof mc.df === "number" ? `, df = ${formatSig(mc.df)}` : ""})
        {(m === "fisher_lsd" || m === "fisher") && ", P not adjusted"}
      </h4>
      <FamilyLine family={fam} />
      <table className="results-table comparisons-table rm-comparisons">
        <thead>
          <tr><th>Comparison</th><th>Mean difference</th><th>{level}% CI</th>
            <th>{adjustedHeader(fam)}</th>{unadj && <th>Unadjusted P</th>}<th>Summary</th></tr>
        </thead>
        <tbody>
          {mc.comparisons.map((c: any, i: number) => {
            const p = c.p_adjusted ?? (fam?.kind === "unadjusted" ? c.p_unadjusted : null);
            return (
              <tr key={i}>
                <th>{c.pair}</th>
                <td>{formatSig(c.difference)}</td>
                <td>{ci(c.ci)}</td>
                <td data-p={p ?? undefined}>{tableP(p)}</td>
                {unadj && <td data-p={c.p_unadjusted ?? undefined}>{tableP(c.p_unadjusted)}</td>}
                <td>{tableStars(p)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Array.isArray(mc.notes) && mc.notes.length > 0 && (
        <p className="model-line">{mc.notes.join(" ")}</p>
      )}
    </>
  );
}

/** RM one-way design fitted as a mixed-effects model (values missing). */
export function MixedRmOneWay({ result }: { result: any }) {
  const fe = result.fixed_effect ?? {};
  const means: any[] = Array.isArray(result.estimated_means) ? result.estimated_means : [];
  const mc = result.multiple_comparisons;
  return (
    <div className="result-card">
      <h3>Repeated measures with missing values: mixed-effects model</h3>
      <p className="model-line">
        {result.method ?? "Mixed-effects model (REML)"}, {result.n_subjects} subjects,{" "}
        {result.n_missing} missing value{result.n_missing === 1 ? "" : "s"} of{" "}
        {(result.n_values ?? 0) + (result.n_missing ?? 0)}: subjects with missing values are kept.
      </p>
      <table className="results-table goodness">
        <tbody>
          <tr><th>Treatment F (DFn, DFd)</th>
            <td>{`F(${formatSig(fe.df_num)}, ${formatSig(fe.df_den)}) = ${formatSig(fe.F)}`}</td></tr>
          <tr><th>P (Geisser-Greenhouse corrected)</th>
            <td>{`${tableP(fe.p_geisser_greenhouse ?? fe.p)} ${tableStars(fe.p_geisser_greenhouse ?? fe.p)}`}</td></tr>
          <tr><th>P (assuming sphericity)</th><td>{tableP(fe.p)}</td></tr>
          <tr><th>Geisser-Greenhouse epsilon</th><td>{formatSig(result.gg_epsilon)}</td></tr>
          {Array.isArray(result.random_effects) && result.random_effects.map((r: any) => (
            <tr key={r.name}><th>SD: {r.name}</th><td>{formatSig(r.sd)}</td></tr>
          ))}
        </tbody>
      </table>
      {means.length > 0 && (
        <>
          <h4>Estimated means</h4>
          <table className="results-table">
            <thead><tr><th>Treatment</th><th>n</th><th>Mean</th><th>SE</th><th>95% CI</th></tr></thead>
            <tbody>
              {means.map((m) => (
                <tr key={m.name}><th>{m.name}</th><td>{m.n}</td><td>{formatSig(m.mean)}</td>
                  <td>{formatSig(m.se)}</td><td>{ci(m.ci)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {mc && Array.isArray(mc.comparisons) && (
        <RmComparisons mc={mc} names={result.names} mixed />
      )}
      {result.sphericity_note && <p className="model-line">{String(result.sphericity_note)}</p>}
    </div>
  );
}
