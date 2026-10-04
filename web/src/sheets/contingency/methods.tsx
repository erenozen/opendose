// Methods text for the contingency analyses.
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { formatSig } from "../../types";
import { formatPValue } from "../../report/pformat";
import CopyableMethods from "../common/CopyableMethods";
import type { ResultsProps } from "../types";
import {
  DIFF_CI_LABELS, OR_CI_LABELS, PROP_CI_LABELS, RR_CI_LABELS,
  type CmhOptions, type ContingencyOptions, type DiffCI, type KappaOptions, type ORCI,
  type PropCI, type ProportionOptions, type RRCI,
} from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** "P = 0.0123" in the project's P-value style (report/pformat.ts). */
const P = (p: unknown) => (typeof p !== "number" ? "n/a" : formatPValue(p));

function Card({ result, sentence }: { result: any; sentence: () => string }) {
  if (!result || result.error) return null;
  let s = "";
  try { s = sentence(); } catch { s = ""; }
  if (!s) return null;
  return <CopyableMethods text={`${s} ${softwareSentence(getRuntimeVersions())}`} />;
}

export function ContingencyMethods({ options, result }: ResultsProps<ContingencyOptions, any>) {
  return <Card result={result} sentence={() => {
    const r = result;
    const two = r.rows === 2 && r.cols === 2;
    let s = two
      ? `The 2×2 contingency table was analyzed with Fisher's exact test (${P(r.fisher_exact?.p)})`
      : `The contingency table was analyzed with the chi-square test (chi-square = ${formatSig(r.chi_square?.chi2)}, df = ${r.chi_square?.df}, ${P(r.chi_square?.p)})`;
    if (r.effect_sizes) {
      const o = options;
      s += `; the relative risk was computed with the ${RR_CI_LABELS[o.rrCi as RRCI]} confidence interval, `
        + `the difference between proportions with the ${DIFF_CI_LABELS[o.diffCi as DiffCI]} interval, `
        + `the odds ratio with the ${OR_CI_LABELS[o.orCi as ORCI]} interval and proportions with the `
        + `${PROP_CI_LABELS[o.propCi as PropCI]} interval`;
    } else if (r.cramers_v) {
      s += `; the effect size is Cramér's V = ${formatSig(r.cramers_v.value)}`;
    }
    if (r.trend) {
      s += `. A chi-square test for trend (Cochran-Armitage, scores ${(r.trend.scores ?? []).map((v: number) => formatSig(v)).join(", ")}) `
        + `gave chi-square = ${formatSig(r.trend.chi2)}, df = 1, ${P(r.trend.p)}`;
    }
    return `${s}.`;
  }} />;
}

export function McNemarMethods({ result }: ResultsProps<unknown, any>) {
  return <Card result={result} sentence={() => (result.test === "bowker"
    ? `Paired categorical data were analyzed with Bowker's test of symmetry (chi-square = ${formatSig(result.chi2)}, df = ${result.df}, ${P(result.p)}).`
    : `Paired data (${formatSig(result.n_pairs)} pairs) were analyzed with McNemar's test, `
      + `using the exact binomial test on the ${formatSig((result.discordant ?? []).reduce((a: number, b: number) => a + b, 0))} discordant pairs `
      + `(${P(result.binomial?.p_two_tailed)}); the odds ratio of the discordant pairs was ${formatSig(result.odds_ratio?.value)} `
      + "with an exact (Clopper-Pearson) 95% confidence interval.")} />;
}

export function CmhMethods({ options, result }: ResultsProps<CmhOptions, any>) {
  return <Card result={result} sentence={() => `${result.n_strata} stratified 2×2 tables were analyzed with the `
    + `Cochran-Mantel-Haenszel test${options.correction ? " with continuity correction" : ""} `
    + `(chi-square = ${formatSig(result.cmh_test?.chi2)}, df = 1, ${P(result.cmh_test?.p)}); the common odds ratio `
    + `(Mantel-Haenszel, Robins-Breslow-Greenland 95% CI) was ${formatSig(result.odds_ratio?.value)}`
    + (result.breslow_day ? `, and homogeneity of the odds ratios was tested with the Breslow-Day test (${P(result.breslow_day.p)})` : "")
    + "."} />;
}

export function KappaMethods({ options, result }: ResultsProps<KappaOptions, any>) {
  return <Card result={result} sentence={() => `Agreement between two raters was quantified with Cohen's `
    + `${options.weights === "none" ? "" : `${options.weights}-weighted `}kappa `
    + `(kappa = ${formatSig(result.kappa)}, 95% CI ${formatSig(result.ci?.[0])} to ${formatSig(result.ci?.[1])}).`} />;
}

export function ProportionMethods({ options, result }: ResultsProps<ProportionOptions, any>) {
  return <Card result={result} sentence={() => {
    if (!result.groups) {
      return `The proportion was reported with the ${PROP_CI_LABELS[options.ciMethod]} 95% confidence interval`
        + (result.binomial_test ? ` and compared with ${formatSig(result.hypothetical)} by the exact binomial test (${P(result.binomial_test.p_two_tailed)})` : "")
        + ".";
    }
    return `Two proportions were compared with Fisher's exact test (${P(result.fisher_exact?.p)}); `
      + `the difference was reported with the ${DIFF_CI_LABELS[options.diffCi]} interval, the relative risk with `
      + `the ${RR_CI_LABELS[options.rrCi]} interval and the odds ratio with the ${OR_CI_LABELS[options.orCi]} interval.`;
  }} />;
}
