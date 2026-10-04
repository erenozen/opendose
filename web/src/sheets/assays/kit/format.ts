// Number formatting for assay results tables (results precision from
// the preferences, as every other results sheet).
import type { GraphFormat } from "../../../graph/format.ts";
import { formatSig } from "../../../types.ts";

/** Number with the results precision; "" for missing. */
export function num(v: unknown, digits?: number): string {
  return typeof v === "number" && Number.isFinite(v) ? formatSig(v, digits) : "";
}

export function pct(v: unknown, digits = 3): string {
  return typeof v === "number" && Number.isFinite(v) ? `${formatSig(v, digits)}%` : "";
}

/** "1.23 to 4.56" for a two-number interval, "" otherwise. */
export function interval(ci: unknown, digits?: number): string {
  return Array.isArray(ci) && ci.length === 2 && typeof ci[0] === "number"
    && typeof ci[1] === "number"
    ? `${formatSig(ci[0], digits)} to ${formatSig(ci[1], digits)}` : "";
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** P value as results sheets show it. */
export function pValue(p: unknown): string {
  if (!isNum(p)) return "n/a";
  return p < 0.0001 ? "< 0.0001" : formatSig(p, 4);
}

const TEST_NAMES: Record<string, string> = {
  unpaired_t: "Unpaired t test", welch_t: "Welch t test", paired_t: "Paired t test",
  ratio_paired_t: "Ratio paired t test", one_sample_ratio_t: "One-sample t test of log ratios",
  one_way_anova: "One-way ANOVA", rm_one_way_anova: "Repeated-measures one-way ANOVA",
  rm_one_way_anova_log10: "Repeated-measures one-way ANOVA on log10 values",
  mixed_rm_one_way_log10: "Mixed-effects model on log10 values (repeated measures)",
};

/** Name, statistic and P of an engine test result (t tests, one-way and
 *  repeated-measures ANOVA). */
export function testSummary(st: Record<string, unknown> | null | undefined):
  { name: string; statistic: string; p: number | null } | null {
  if (!st) return null;
  const name = TEST_NAMES[String(st.test)] ?? String(st.test ?? "Test");
  const tab = st.table as Record<string, number> | undefined;
  if (tab && isNum(tab.F)) {
    const df1 = tab.df_between ?? tab.df_treatment;
    const df2 = tab.df_within ?? tab.df_error;
    const p = tab.p ?? tab.p_geisser_greenhouse ?? tab.p_assuming_sphericity;
    return { name, statistic: `F(${df1}, ${df2}) = ${formatSig(tab.F, 4)}`, p: isNum(p) ? p : null };
  }
  if (isNum(st.t)) {
    return { name, statistic: `t = ${formatSig(st.t, 4)}, df = ${formatSig(st.df as number, 4)}`,
      p: isNum(st.p_two_tailed) ? st.p_two_tailed : null };
  }
  return { name, statistic: "", p: isNum(st.p) ? st.p : null };
}

/** Log2 Y unless Format axes chose a scale (fold-change graphs). */
export function withLog2(format: GraphFormat | undefined): GraphFormat {
  const f = format ?? ({} as GraphFormat);
  if (f.y?.scale) return f;
  return { ...f, y: { ...(f.y ?? {}), scale: "log2" } };
}
