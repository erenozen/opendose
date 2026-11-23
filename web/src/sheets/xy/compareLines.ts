// "Compare slopes and intercepts" of a linear regression with two or more
// data sets (FEATURE-PLAN P-13): the rows of the typeset block and the
// sentences that read it, from the engine's compare_lines (linregress.
// compare_lines: the F test of equal slopes, then, for parallel lines, of
// equal intercepts; Zar ch. 18, the analysis of covariance of the lines).
// The intercept test is said to be meaningful only when the slopes are
// not shown to differ, next to its P. Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { pLabel, formatPValue } from "../../report/pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const COMPARE_LINES_SOURCES = [
  { label: "GraphPad Curve Fitting Guide: Comparing slopes and intercepts",
    url: "https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_comparingslopesandintercepts.htm" },
];

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "F (1, 12) = 0.644, P = 0.4379", or the undefined F said in words. */
export function fText(t: R | undefined): string {
  if (!t) return "n/a";
  if (!num(t.F)) return `F (${t.dfn}, ${t.dfd}) undefined: the lines fit every point exactly`;
  return `F (${t.dfn}, ${t.dfd}) = ${formatSig(t.F)}, ${pLabel(t.p)}`;
}

export function usableCompare(c: unknown): c is R {
  const x = c as R | null;
  return !!x && typeof x === "object" && !!x.slopes_test && !!x.common_slope;
}

export interface CompareRow { label: string; value: string; note?: string }

/** The block's rows, in reading order: the slopes, then the intercepts. */
export function compareLinesRows(c: R): CompareRow[] {
  const names: string[] = c.names ?? [];
  const rows: CompareRow[] = [];
  if (Array.isArray(c.slopes)) {
    rows.push({ label: "Slopes", value: c.slopes.map((b: number, i: number) =>
      `${names[i] ?? `Line ${i + 1}`} ${formatSig(b)}`).join(", ") });
  }
  rows.push({ label: "Are the slopes equal?", value: fText(c.slopes_test),
    note: c.slopes_differ ? "The slopes differ." : "The slopes are not shown to differ." });
  const sd = c.slope_difference as R | undefined;
  if (sd && num(sd.value)) {
    const lvl = Math.round((c.ci_level ?? 0.95) * 100);
    rows.push({ label: `Slope difference (${names[0]} − ${names[1]})`, value: formatSig(sd.value),
      note: `${lvl}% CI ${formatSig(sd.ci[0])} to ${formatSig(sd.ci[1])}` });
  }
  const cs = c.common_slope as R;
  rows.push({ label: "Common slope (parallel lines)", value: formatSig(cs.value),
    note: `95% CI ${formatSig(cs.ci[0])} to ${formatSig(cs.ci[1])}` });
  rows.push({ label: "Are the intercepts equal?", value: fText(c.intercepts_test),
    note: c.intercepts_meaningful
      ? (c.intercepts_differ ? "The lines are parallel but at different heights."
        : "The intercepts are not shown to differ: one line may describe all the data.")
      : "Not meaningful: the slopes differ, so the lines are not parallel and the gap between "
        + "them changes with X." });
  const pl = c.pooled_line as R | undefined;
  if (pl && c.intercepts_meaningful && !c.intercepts_differ) {
    rows.push({ label: "Pooled line (all the points)",
      value: `Y = ${formatSig(pl.slope)}*X ${pl.y_intercept < 0 ? "-" : "+"} ${formatSig(Math.abs(pl.y_intercept))}` });
  }
  return rows;
}

/** The methods sentence. */
export function compareLinesMethods(c: R): string {
  if (!usableCompare(c)) return "";
  const s = c.slopes_test, e = c.intercepts_test;
  return `Slopes were compared by the F test of one common slope against a slope per data set `
    + `(analysis of covariance; Zar, Biostatistical Analysis, ch. 18): F(${s.dfn}, ${s.dfd}) = `
    + `${num(s.F) ? formatSig(s.F) : "undefined"}, ${formatPValue(s.p)}`
    + (c.intercepts_meaningful
      ? `; with the slopes not shown to differ, intercepts were compared given the common slope `
        + `(F(${e.dfn}, ${e.dfd}) = ${num(e.F) ? formatSig(e.F) : "undefined"}, ${formatPValue(e.p)}).`
      : "; the intercepts were not compared because the slopes differ.");
}
