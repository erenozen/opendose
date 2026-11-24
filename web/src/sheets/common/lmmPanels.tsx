// Results and methods of the general linear mixed model (P-87, engine
// handler lmm): the fixed effects with Kenward-Roger or Satterthwaite df,
// the Type III F tests, the random effects (variances, SDs, the
// intercept-slope correlation), boundary and convergence notes, the
// estimated marginal means and their comparisons. Shown by the grouping-
// column mixed model of multiple-variables tables once a nested level or a
// covariate is chosen (mixedPanels.tsx delegates here).
import { formatSig } from "../../types";
import CopyableMethods from "./CopyableMethods";
import TableCopy from "./TableCopy";
import { ddfName, ddfOf } from "./ddf";
import { fixedMatrix, lmmDesignNote, lmmMethodsText, randomMatrix, randomPhrase, fixedPhrase } from "./lmmModel";
import { FamilyComparisons, Sources } from "./mixedPanels";
import { factorsOf, MIXED_SRC, scopeLabel, type ComparisonScope } from "./mixedModel";
import { SRC } from "../../guide/sources";
import { fmtCI, fmtP, levelPct, stars } from "./statFormat";
import "./sheetKit.css";
import "./mixed.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const f = (v: unknown, d?: number) => (num(v) ? formatSig(v, d) : "n/a");

const LMERTEST = { label: "Kuznetsova, Brockhoff & Christensen 2017, lmerTest package: tests in linear "
  + "mixed effects models, J Stat Softw 82(13)", url: "https://doi.org/10.18637/jss.v082.i13" };
const KR = { label: "Kenward & Roger 1997, Small sample inference for fixed effects from restricted "
  + "maximum likelihood, Biometrics 53:983-997", url: "https://doi.org/10.2307/2533558" };

function MeansTable({ title, rows, level }: { title: string; rows: R[]; level: number }) {
  if (!rows.length) return null;
  return (
    <div className="results-scroll">
      <table className="results-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr><th scope="col">Level</th><th scope="col">Mean</th><th scope="col">SE</th>
            <th scope="col">{levelPct(level)} CI</th><th scope="col">df</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.level}><th scope="row">{m.level}</th><td>{f(m.mean)}</td><td>{f(m.se)}</td>
              <td>{fmtCI(m.ci)}</td><td>{f(m.df)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LmmResults({ result: r }: { result: R }) {
  const level = num(r.ci_level) ? r.ci_level : 0.95;
  const fixed: R[] = Array.isArray(r.fixed_effects) ? r.fixed_effects : [];
  const anova: R[] = Array.isArray(r.anova) ? r.anova : [];
  const re: R[] = Array.isArray(r.random_effects) ? r.random_effects : [];
  const corr: R[] = Array.isArray(r.correlations) ? r.correlations : [];
  const shares = r.variance_shares as Record<string, number> | null;
  const emm = (r.emmeans ?? {}) as Record<string, R[]>;
  const nFactors = Array.isArray(r.factor_names) ? r.factor_names.length : 0;
  const { a: fa, b } = factorsOf(r);
  const a = nFactors ? fa : null;
  const covMeans = Object.entries((r.covariate_means ?? {}) as Record<string, number>);
  const ddf = ddfName(ddfOf(r.ddf));
  const anovaMatrix = () => [["Term", "F", "DFn", "DFd", "P"],
    ...anova.map((x) => [String(x.term), String(x.f), String(x.dfn), String(x.dfd), String(x.p)])];
  return (
    <div className="result-card mixed-results lmm-results">
      <h3>Linear mixed model{r.group ? ` with ${r.group} as a random effect` : ""}</h3>
      <p className="mixed-design-note" role="note" aria-label="Where the df come from">{lmmDesignNote(r)}</p>
      <p className="model-line">
        Fitted by REML: {fixedPhrase(r)} fixed; {randomPhrase(r)}. Outcome: {r.outcome}.
      </p>
      <p className="mixed-formula">lme4: {r.formula}</p>
      {(r.warnings ?? []).map((w: string) => <p key={w} className="result-note result-note-warn" role="note">{w}</p>)}

      <section className="mixed-block" aria-label="Fixed effects">
        <h4>Fixed effects</h4>
        <TableCopy name="Mixed model fixed effects" matrix={() => fixedMatrix(r)} />
        <div className="results-scroll">
          <table className="results-table">
            <caption className="sr-only">Fixed effects</caption>
            <thead>
              <tr><th scope="col">Term</th><th scope="col">Estimate</th><th scope="col">SE</th>
                <th scope="col">df ({ddf})</th><th scope="col">t</th><th scope="col">P value</th>
                <th scope="col">{levelPct(level)} CI</th></tr>
            </thead>
            <tbody>
              {fixed.map((x) => (
                <tr key={x.term}>
                  <th scope="row">{x.term}</th><td>{f(x.estimate)}</td><td>{f(x.se)}</td>
                  <td>{f(x.df)}</td><td>{f(x.t)}</td><td>{fmtP(x.p)}</td><td>{fmtCI(x.ci)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(a || covMeans.length > 0) && (
          <p className="hint-block mixed-method">
            {a ? `Factor coefficients compare each level with the first (${r.levels?.[a]?.[0] ?? ""}${b
              ? `; ${b}: ${r.levels?.[b]?.[0] ?? ""}` : ""}). ` : ""}
            {covMeans.length ? "A covariate's estimate is the change in the outcome per unit of it." : ""}
          </p>
        )}
      </section>

      {anova.length > 0 && (
        <section className="mixed-block" aria-label="Type III F tests">
          <h4>Type III F tests</h4>
          <TableCopy name="Mixed model F tests" matrix={anovaMatrix} />
          <div className="results-scroll">
            <table className="results-table mixed-anova">
              <caption className="sr-only">Type III F tests</caption>
              <thead>
                <tr><th scope="col">Term</th><th scope="col">F (DFn, DFd)</th><th scope="col">P value</th>
                  <th scope="col">Summary</th></tr>
              </thead>
              <tbody>
                {anova.map((x) => (
                  <tr key={x.term}>
                    <th scope="row">{x.term}</th>
                    <td>F({x.dfn}, {formatSig(x.dfd)}) = {f(x.f, 4)}</td>
                    <td>{fmtP(x.p)}</td><td>{stars(x.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mixed-block" aria-label="Random effects">
        <h4>Random effects</h4>
        <TableCopy name="Mixed model random effects" matrix={() => randomMatrix(r)} />
        <div className="results-scroll">
          <table className="results-table">
            <caption className="sr-only">Random effects</caption>
            <thead>
              <tr><th scope="col">Group</th><th scope="col">Coefficient</th><th scope="col">Variance</th>
                <th scope="col">SD</th>{shares && <th scope="col">% of total</th>}</tr>
            </thead>
            <tbody>
              {re.map((x) => (
                <tr key={`${x.group}-${x.coefficient}`}>
                  <th scope="row">{x.group}{x.at_boundary ? " (boundary)" : ""}</th><td>{x.coefficient}</td>
                  <td>{f(x.variance)}</td><td>{f(x.sd)}</td>
                  {shares && <td>{num(shares[x.group]) ? `${formatSig(100 * shares[x.group], 3)}%` : ""}</td>}
                </tr>
              ))}
              <tr><th scope="row">Residual</th><td /><td>{f(r.residual?.variance)}</td><td>{f(r.residual?.sd)}</td>
                {shares && <td>{num(shares.Residual) ? `${formatSig(100 * shares.Residual, 3)}%` : ""}</td>}</tr>
            </tbody>
          </table>
        </div>
        {corr.map((c) => (
          <p key={c.between.join()} className="model-line">
            Correlation of {c.between[0]} and {c.between[1]} by {c.group}: {f(c.r, 3)}
          </p>
        ))}
        {!shares && (r.random_slopes ?? []).length > 0 && (
          <p className="hint-block mixed-method">With a random slope the share of the variance
            between groups depends on the covariate, so no single percentage is given.</p>
        )}
      </section>

      {a && (
        <section className="mixed-block" aria-label="Estimated marginal means">
          <h4>Estimated marginal means</h4>
          {covMeans.length > 0 && (
            <p className="hint-block mixed-method">
              At the mean of {covMeans.map(([k, v]) => `${k} (${formatSig(v)})`).join(" and ")}.
            </p>
          )}
          <MeansTable title={a} rows={emm[a] ?? []} level={level} />
          {b && <MeansTable title={b} rows={emm[b] ?? []} level={level} />}
          {b && <MeansTable title="Cells" rows={emm.cells ?? []} level={level} />}
        </section>
      )}

      <FamilyComparisons block={r.comparisons} ciLevel={level}
        name="Multiple comparisons" familyHead="Within"
        what={`Compared: ${r.comparisons ? scopeLabel(r.comparisons.scope as ComparisonScope, a ?? "", b) : ""}`} />

      <section className="mixed-block" aria-label="Goodness of fit">
        <h4>Goodness of fit</h4>
        <table className="results-table goodness">
          <tbody>
            <tr><th scope="row">REML criterion</th><td>{f(r.goodness_of_fit?.reml_criterion)}</td></tr>
            <tr><th scope="row">AIC</th><td>{f(r.goodness_of_fit?.aic)}</td></tr>
            <tr><th scope="row">BIC</th><td>{f(r.goodness_of_fit?.bic)}</td></tr>
            <tr><th scope="row">Parameters</th><td>{r.n_fixed} fixed, {r.n_covariance_parameters} covariance</td></tr>
            <tr><th scope="row">Converged</th><td>{r.converged ? "yes" : `no: ${r.convergence}`}</td></tr>
          </tbody>
        </table>
        <p className="hint-block">
          Denominator df: {ddf}{r.ddf_parameters_dropped ? `, with the ${r.ddf_parameters_dropped} `
            + "variance parameter(s) at the boundary held at zero" : ""}. AIC and BIC count the fixed
          effects and covariance parameters, as lme4 does; compare them only between models with the
          same fixed effects (REML).
        </p>
      </section>
      <Sources list={[MIXED_SRC.lme4, LMERTEST, KR, SRC.aarts2014]} />
    </div>
  );
}

export function LmmMethods({ result: r }: { result: R }) {
  if (!r || r.error || !Array.isArray(r.fixed_effects)) return null;
  return <CopyableMethods text={lmmMethodsText(r)} />;
}
