// Words and tables of the general linear mixed model (P-87, engine
// handler lmm, engine/opendose/lmm.py): fixed factors and covariates, a
// grouping column with an optional nested level, random slopes, Kenward-
// Roger or Satterthwaite df. Every number comes from the engine; this
// module only picks and words them. Pure: unit-tested in
// __tests__/lmmModel.test.ts.
import { pEquals } from "../../report/pformat.ts";
import { formatSig } from "../../types.ts";
import { ddfMethodsSentence, ddfName, ddfOf } from "./ddf.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const raw = (v: unknown) => (num(v) ? String(v) : v == null ? "" : String(v));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Group names and counts in model order: [[name, count], ...]. */
export function groupCounts(r: R): [string, number][] {
  const g = r?.n_groups && typeof r.n_groups === "object" ? r.n_groups as Record<string, number> : {};
  return Object.entries(g).filter(([, n]) => num(n));
}

/** "df come from 12 animal groups (36 slice groups within them), not from
 *  201 values: Kenward-Roger df for each test." */
export function lmmDesignNote(r: R): string {
  const [top, nested] = groupCounts(r);
  if (!top) return "";
  const groups = `${plural(top[1], `${top[0]} group`)}${nested
    ? ` (${plural(nested[1], `${nested[0]} group`)} within them)` : ""}`;
  return `df come from the ${groups}, not from the ${r.n_values} values: `
    + `${ddfName(ddfOf(r.ddf))} df for each test, estimate and comparison.`;
}

/** The random part in words: "a random intercept for each animal, with a
 *  random slope of Days (correlated with the intercept), and one for each
 *  slice within its animal". */
export function randomPhrase(r: R): string {
  const [top, nested] = groupCounts(r);
  if (!top) return "";
  const slopes: string[] = Array.isArray(r.random_slopes) ? r.random_slopes : [];
  let t = `a random intercept for each ${top[0]}`;
  if (slopes.length) {
    t += ` with a random slope of ${slopes.join(" and ")} (${r.slope_structure === "independent"
      ? "independent of" : "correlated with"} the intercept)`;
  }
  if (nested) t += `, and one for each ${nested[0]} within its ${top[0]}`;
  return t;
}

/** The fixed part in words. */
export function fixedPhrase(r: R): string {
  const f: string[] = Array.isArray(r.factor_names) ? r.factor_names : [];
  const c: string[] = Array.isArray(r.covariates) ? r.covariates : [];
  const parts = [];
  if (f.length === 2) parts.push(`${f[0]}, ${f[1]} and their interaction`);
  else if (f.length === 1) parts.push(f[0]);
  if (c.length) parts.push(`${c.length > 1 ? "the covariates" : "the covariate"} ${c.join(" and ")}`);
  return parts.join(" and ") || "an intercept only";
}

/** Copyable methods paragraph. */
export function lmmMethodsText(r: R): string {
  const ddf = ddfOf(r.ddf);
  const outcome = String(r.outcome ?? "The outcome");
  const counts = groupCounts(r).map(([n, k]) => plural(k, `${n} group`)).join(" and ");
  const nFixed = (r.factor_names?.length ?? 0) + (r.covariates?.length ?? 0);
  let t = `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)} was analysed with a linear mixed `
    + `model with ${fixedPhrase(r)} as ${nFixed === 1 ? "a fixed effect" : "fixed effects"} and `
    + `${randomPhrase(r)} (lme4 notation: `
    + `${r.formula}), fitted by restricted maximum likelihood (REML) on ${r.n_values} values `
    + `from ${counts}. Fixed effects were tested with Type III F tests. `
    + `${ddfMethodsSentence(ddf === "containment" ? "kenward_roger" : ddf)} `;
  const rows: R[] = Array.isArray(r.anova) ? r.anova : [];
  if (rows.length) {
    t += rows.map((x) => `${x.term}: F(${x.dfn}, ${formatSig(x.dfd)}) = ${formatSig(x.f)}, `
      + `P ${pEquals(x.p)}`).join("; ") + ". ";
  }
  if (r.singular) {
    t += `The fit was singular (${(r.boundary as string[]).join("; ")} at the boundary of the `
      + "parameter space). ";
  }
  if (r.converged === false) t += "The REML optimisation did not converge. ";
  t += "Analysis in OpenDose (open-source, built on SciPy).";
  return t;
}

/** The fixed-effects table as a matrix for Copy / CSV. */
export function fixedMatrix(r: R): string[][] {
  const rows: R[] = Array.isArray(r.fixed_effects) ? r.fixed_effects : [];
  return [["Term", "Estimate", "SE", "df", "t", "P", "CI lower", "CI upper"],
    ...rows.map((x) => [String(x.term), raw(x.estimate), raw(x.se), raw(x.df), raw(x.t), raw(x.p),
      raw(x.ci?.[0]), raw(x.ci?.[1])])];
}

/** The random-effects table as a matrix for Copy / CSV. */
export function randomMatrix(r: R): string[][] {
  const re: R[] = Array.isArray(r.random_effects) ? r.random_effects : [];
  return [["Group", "Coefficient", "Variance", "SD"],
    ...re.map((x) => [String(x.group), String(x.coefficient), raw(x.variance), raw(x.sd)]),
    ["Residual", "", raw(r.residual?.variance), raw(r.residual?.sd)]];
}
