// What the meta-analysis results sheet, its headline and its methods text
// print, from the engine's numbers (meta.py) with the formatters every
// results table uses (formatSig, tableP, pLabel). Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { pLabel, tableP } from "../pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const scaleIsRatio = (scale: unknown) => scale === "log_ratio" || scale === "ratio";

export const pctLevel = (l: unknown) => `${Number(((typeof l === "number" ? l : 0.95) * 100).toPrecision(4))}%`;

export const tau2Method = (r: R) => (r.random?.method === "DL" ? "DerSimonian-Laird" : "REML");

/** "Hartung-Knapp (t, 12 df)" or "z (normal)". */
export const intervalName = (r: R) => (r.random?.test === "knha"
  ? `Hartung-Knapp (t, ${r.random.df} df)` : "z (normal)");

const range = (ci: unknown) => (Array.isArray(ci) && ci.length === 2
  ? `${formatSig(ci[0])} to ${formatSig(ci[1])}` : "n/a");

/** A pooled or study block on the reported scale: the ratio and its CI
 *  for ratios, else the estimate and its CI. */
export function shown(blk: R | null | undefined, scale: unknown): { value: string; ci: string } {
  if (!blk) return { value: "n/a", ci: "n/a" };
  return scaleIsRatio(scale)
    ? { value: formatSig(blk.ratio), ci: range(blk.ratio_ci) }
    : { value: formatSig(blk.estimate), ci: range(blk.ci) };
}

/** The name of the pooled quantity: "Pooled ratio" or "Pooled estimate". */
export const pooledName = (r: R) => (scaleIsRatio(r.scale) ? "Pooled ratio" : "Pooled estimate");

export interface StudyRow {
  label: string;
  /** The estimate as pooled (log ratio for ratios). */
  estimate: string;
  se: string;
  /** Ratio and its CI for ratios, else the estimate's CI. */
  ratio?: string;
  ci: string;
  weightRandom: string;
  weightFixed: string;
}

export function studyRows(r: R): StudyRow[] {
  const ratio = scaleIsRatio(r.scale);
  return (r.studies ?? []).map((s: R) => ({
    label: String(s.label),
    estimate: formatSig(s.estimate),
    se: formatSig(s.se),
    ...(ratio ? { ratio: formatSig(s.ratio) } : {}),
    ci: ratio ? range(s.ratio_ci) : range(s.ci),
    weightRandom: `${formatSig(s.weight_random)}%`,
    weightFixed: `${formatSig(s.weight_fixed)}%`,
  }));
}

export interface PooledRow {
  label: string;
  estimate: string;
  se: string;
  ratio?: string;
  ci: string;
  p: string;
}

/** The derived rows under the experiments: common effect, random effects
 *  (with the chosen interval) and the prediction interval. */
export function pooledRows(r: R): PooledRow[] {
  const ratio = scaleIsRatio(r.scale);
  const out: PooledRow[] = [];
  const row = (label: string, blk: R): PooledRow => ({
    label, estimate: formatSig(blk.estimate), se: formatSig(blk.se),
    ...(ratio ? { ratio: formatSig(blk.ratio) } : {}),
    ci: ratio ? range(blk.ratio_ci) : range(blk.ci), p: tableP(blk.p),
  });
  if (r.fixed) out.push(row("Common effect (inverse variance)", r.fixed));
  if (r.random) out.push(row(`Random effects (${tau2Method(r)}, ${r.random.test === "knha" ? "Hartung-Knapp" : "z"})`, r.random));
  if (r.prediction) {
    out.push({ label: "Prediction interval (a new experiment)", estimate: "", se: "",
      ...(ratio ? { ratio: "" } : {}),
      ci: ratio ? range(r.prediction.ratio_ci) : range(r.prediction.ci), p: "" });
  }
  return out;
}

/** Heterogeneity lines: [name, value] pairs for the second table. */
export function heterogeneityRows(r: R): [string, string][] {
  const h = r.heterogeneity ?? {};
  const re = r.random ?? {};
  const rows: [string, string][] = [
    [`τ² (${tau2Method(r)})`, `${formatSig(re.tau2)}${re.tau2_se != null ? ` (SE ${formatSig(re.tau2_se)})` : ""}`],
    ["τ", formatSig(re.tau)],
    ["I²", `${formatSig(h.I2)}%`],
    ["H²", formatSig(h.H2)],
    [`Cochran's Q (${h.df} df)`, `${formatSig(h.Q)}, ${pLabel(h.p)}`],
    ["I² from Q", `${formatSig(h.I2_Q)}%`],
  ];
  return rows;
}

/** The headline figure (DECISIONS 3): the random-effects estimate on the
 *  reported scale with its CI, then τ², I², k and P. */
export function metaHeadline(r: R): { title: string; name: string; value: string; ci: string; facts: string[] } {
  const s = shown(r.random, r.scale);
  const k = r.k ?? (r.studies ?? []).length;
  return {
    title: `${r.name ? `${r.name}: ` : ""}${k} experiments combined`,
    name: `${pooledName(r)}, random effects`,
    value: s.value,
    ci: `${pctLevel(r.ci_level)} CI ${s.ci} (${r.random?.test === "knha" ? "Hartung-Knapp" : "z"})`,
    facts: [`τ² ${formatSig(r.random?.tau2)}`, `I² ${formatSig(r.heterogeneity?.I2)}%`, pLabel(r.random?.p)],
  };
}

/** The methods paragraph. */
export function metaMethodsText(r: R): string {
  const ratio = scaleIsRatio(r.scale);
  const knha = r.random?.test === "knha";
  return `${r.k} experiments were combined by inverse-variance meta-analysis`
    + `${ratio ? " of log ratios, reported back-transformed as ratios" : ""}: a common-effect model and a `
    + `random-effects model with the between-experiment variance τ² estimated by `
    + `${r.random?.method === "DL" ? "the DerSimonian-Laird method (DerSimonian & Laird 1986)"
      : "restricted maximum likelihood (REML; Viechtbauer 2005)"}. `
    + `The ${pctLevel(r.ci_level)} CI of the random-effects estimate `
    + `${knha ? `used the Hartung-Knapp method (t distribution on ${r.random.df} df; Hartung & Knapp 2001), `
      + "recommended when there are few experiments (IntHout et al. 2014)"
      : "used the normal distribution"}. `
    + "Heterogeneity is reported as τ², I² (Higgins & Thompson 2002) and Cochran's Q"
    + `${r.prediction ? `, with a ${pctLevel(r.ci_level)} prediction interval for a new experiment `
      + `(t distribution on ${r.prediction.df} df; Riley et al. 2011)` : ""}.`;
}
