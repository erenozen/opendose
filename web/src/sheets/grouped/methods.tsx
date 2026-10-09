// Methods text for the grouped-table analyses: one paragraph ready to
// paste into a manuscript, generated from the options and the result.
import { useState } from "react";
import { formatSig } from "../../types";
import type { ResultsProps } from "../types";
import { pLabel } from "./format";
import { isAdditiveTwoWay } from "./interactionSummary";
import {
  CORRECTION_LABEL, FDR_METHODS, ROW_TEST_LABEL, type ColumnStatsOptions,
  type MultiTOptions, type RowMeansOptions, type ThreeWayOptions, type TwoWayOptions,
} from "./options";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const TOOL = "OpenDose (open-source, built on SciPy)";

const ROW_TEST_METHOD: Record<string, string> = {
  welch: "Welch's unpaired t test (SDs not assumed equal)",
  unpaired: "an unpaired t test (equal SDs within each row)",
  pooled: "an unpaired t test using one SD pooled across all rows",
  lognormal_welch: "Welch's t test on the logarithms (lognormal data)",
  lognormal_unpaired: "an unpaired t test on the logarithms (lognormal data)",
  lognormal_pooled: "a t test on the logarithms with the SD pooled across rows",
  paired: "a paired t test",
  ratio_paired: "a ratio paired t test",
  wilcoxon: "the Wilcoxon matched-pairs signed rank test",
  mann_whitney: "the Mann-Whitney test",
  kolmogorov_smirnov: "the Kolmogorov-Smirnov test",
};

function MethodsCard({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <button className="copy-btn" onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
        <span className="swap-label" key={copied ? "copied" : "copy"}>
          {copied ? "Copied ✓" : "Copy"}
        </span>
      </button>
    </div>
  );
}

const ok = (r: R | null): r is R => !!r && !r.error;
const cmpName: Record<string, string> = {
  tukey: "Tukey's", sidak: "Šídák's", bonferroni: "Bonferroni's",
  dunnett: "Dunnett's", holm_sidak: "Holm-Šídák", none: "Fisher's LSD",
  bky: "the two-stage step-up method of Benjamini, Krieger and Yekutieli",
  bh: "the Benjamini-Hochberg method", by: "the Benjamini-Yekutieli method",
};
const effect = (name: string, s: R | undefined) => (s && s.F != null
  ? `${name}: F(${formatSig(s.df ?? s.df_num, 3)}, ${formatSig(s.df_den ?? s.dfd ?? NaN, 3)
  }) = ${formatSig(s.F)}, ${pLabel(s.p)}`
  : "");

export function TwoWayMethods({ result, options: o }: ResultsProps<TwoWayOptions, R>) {
  if (!ok(result)) return <MethodsCard text={null} />;
  const names = Array.isArray(result.factor_names) ? result.factor_names as string[] : [];
  const fA = names[0] || o.rowFactor || "the row factor";
  const fB = names[1] || o.colFactor || "the column factor";
  let text: string;
  if (result.analysis === "mixed_rm_two_way") {
    const fe = result.fixed_effects ?? {};
    const parts = [
      effect(`${fA} × ${fB} interaction`, fe.interaction),
      effect(fA, fe.row_factor), effect(fB, fe.column_factor),
    ].filter(Boolean);
    text = `Data were analyzed with a mixed-effects model (restricted maximum likelihood, `
      + `subject as a random effect) for two-way repeated measures (${fA} × ${fB}`
      + `${result.n_missing ? `; ${result.n_missing} missing value(s)` : ""}), with `
      + `Geisser-Greenhouse correction of the repeated-measures effects, using ${TOOL}. `
      + parts.join("; ") + ".";
  } else if (String(result.analysis).startsWith("rm_two_way")) {
    const src = result.sources ?? {};
    // Each effect's denominator: its own error term (both factors
    // repeated), subjects (the between-subject factor) or the residual.
    const dfd = (k: string) => src[k]?.error_df
      ?? (k === "column_factor" && src.subjects ? src.subjects.df : src.residual?.df);
    const df = (k: string) => (src[k] && dfd(k) != null
      ? `F(${src[k].df}, ${dfd(k)}) = ${formatSig(src[k].F)}, ${pLabel(src[k].p)}` : "");
    text = `Data were analyzed by two-way repeated-measures ANOVA (${result.design}; `
      + `${result.n_subjects} subjects) with ${fA} and ${fB} as factors`
      + `${result.gg_epsilon != null
        ? `; Geisser-Greenhouse epsilon was ${formatSig(result.gg_epsilon)}` : ""}, `
      + `using ${TOOL}. Interaction: ${df("interaction")}; ${fA}: ${df("row_factor")}; `
      + `${fB}: ${df("column_factor")}.`;
  } else {
    const src = result.sources ?? {};
    const res = src.residual;
    const line = (k: string, label: string) => (src[k] && res
      ? `${label}: F(${src[k].df}, ${res.df}) = ${formatSig(src[k].F)}, ${pLabel(src[k].p)}`
      : "");
    const keys = Object.keys(src).filter((k) => k !== "residual" && k !== "interaction");
    text = `Data were analyzed by ordinary two-way ANOVA (type III sums of squares) `
      + `with ${fA} and ${fB} as factors${isAdditiveTwoWay(result)
        ? " (main effects only, without the interaction term)" : ""}${result.analysis === "two_way_anova_summary"
        ? ", computed from the entered means, SD and n" : ""}, using ${TOOL}. `
      + [line("interaction", "Interaction"), ...keys.map((k) => line(k, k))]
        .filter(Boolean).join("; ") + ".";
  }
  if (result.multiple_comparisons) {
    text += ` Multiple comparisons used ${cmpName[result.multiple_comparisons.method]
      ?? result.multiple_comparisons.method} test${result.multiple_comparisons.direction === "all_cells"
      ? ", comparing every cell mean with every other" : ""}.`;
  }
  return <MethodsCard text={text} />;
}

export function ThreeWayMethods({ result, options: o }: ResultsProps<ThreeWayOptions, R>) {
  if (!ok(result)) return <MethodsCard text={null} />;
  const f = result.factor_names as string[];
  const src = result.sources as Record<string, R>;
  const res = src.residual;
  const three = Object.entries(src).find(([, s]) => s.term === "ABC");
  let text = `Data were analyzed by ordinary three-way ANOVA (type III sums of squares) `
    + `with ${f[0]}, ${f[1]} and ${f[2]} as factors (n = ${result.n}), using ${TOOL}.`;
  if (three && res) {
    text += ` Three-way interaction: F(${three[1].df}, ${res.df}) = ${formatSig(three[1].F)}, `
      + `${pLabel(three[1].p)}.`;
  }
  const mc = result.multiple_comparisons;
  if (mc) {
    const q = (FDR_METHODS as string[]).includes(mc.method);
    text += ` ${mc.n_comparisons} comparisons were corrected by ${cmpName[mc.method] ?? mc.method}`
      + `${q ? ` (Q = ${o.q}%)` : ` (alpha = ${o.alpha})`}.`;
  }
  return <MethodsCard text={text} />;
}

export function MultiTMethods({ result, options: o }: ResultsProps<MultiTOptions, R>) {
  if (!ok(result)) return <MethodsCard text={null} />;
  const fdr = result.approach === "fdr";
  const test = ROW_TEST_METHOD[o.test] ?? ROW_TEST_LABEL[o.test];
  const corr = result.method === "none"
    ? `without correction for multiple comparisons (alpha = ${formatSig(result.alpha)})`
    : fdr
      ? `controlling the false discovery rate with ${cmpName[result.method] ?? CORRECTION_LABEL[o.method]} `
        + `(Q = ${formatSig(result.q * 100)}%)`
      : `correcting for multiple comparisons with the ${CORRECTION_LABEL[o.method]} method `
        + `(alpha = ${formatSig(result.alpha)})`;
  const text = `${result.names[0]} and ${result.names[1]} were compared in each of `
    + `${result.n_tests} rows with ${test}, ${corr}, using ${TOOL}. `
    + `${result.n_flagged} row(s) were ${fdr ? "discoveries" : "statistically significant"}.`;
  return <MethodsCard text={text} />;
}

export function RowMeansMethods({ result, options: o }: ResultsProps<RowMeansOptions, R>) {
  if (!ok(result)) return <MethodsCard text={null} />;
  const what = { mean: "means", median: "medians", geometric_mean: "geometric means",
    total: "totals" }[o.calculate];
  const how = o.scope === "row"
    ? "summarizing each dataset first and then across datasets"
    : o.scope === "all_values" ? "pooling every replicate in the row" : "for each dataset separately";
  return <MethodsCard text={`Row ${what} were computed ${how}, using ${TOOL}.`} />;
}

export function ColumnStatsMethods({ result, options: o }: ResultsProps<ColumnStatsOptions, R>) {
  if (!ok(result)) return <MethodsCard text={null} />;
  const text = `Descriptive statistics and normality tests (Shapiro-Wilk, D'Agostino-Pearson, `
    + `Anderson-Darling where n allows) were computed for ${o.unit === "cell"
      ? "each row × dataset cell" : "each dataset with its rows pooled"}`
    + `${o.hypothetical.trim() ? `, with one-sample t and Wilcoxon tests against ${o.hypothetical}` : ""}`
    + `, using ${TOOL}.`;
  return <MethodsCard text={text} />;
}
