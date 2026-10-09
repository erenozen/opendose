// Which numbers of a result changed when the same analysis ran on new
// data. The comparison itself is the reproduction check's
// (project/reproduce.ts compareResults: every number, at the precision
// the results sheets show, long plotting grids left out, items named by
// their group or test); this module ranks the changes for the replay log
// (P values first, then fitted parameters, then the largest relative
// changes) and writes them with both values. Pure: the numbers come from
// the engine; nothing here computes a statistic.
import { tableP } from "../report/pformat.ts";
import { compareResults, formatChanged, type NumberChange as Compared } from "./reproduce.ts";

export type ChangeKind = "p" | "param" | "other";

export interface NumberChange {
  /** Path in the result ("datasets[0].fit.params.LogIC50.value"). */
  path: string;
  /** Readable name ("Drug A · LogIC50"). */
  label: string;
  before: number | null;
  after: number | null;
  kind: ChangeKind;
}

export interface ResultDiff {
  /** Numbers compared. */
  compared: number;
  changed: NumberChange[];
  /** Error text of a side that failed. */
  beforeError?: string;
  afterError?: string;
}

const errorOf = (r: unknown): string | undefined => {
  if (r && typeof r === "object" && "error" in r && (r as { error?: unknown }).error) {
    return String((r as { error: unknown }).error);
  }
  return undefined;
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function kindOf(c: Compared): ChangeKind {
  if (c.p) return "p";
  return /(^|\.)params\.[^.[]+\.value$/.test(c.path) ? "param" : "other";
}

/** "Drug A · LogIC50", "Fisher's exact test P". */
export function labelOf(c: Pick<Compared, "context" | "what">): string {
  return [...c.context, c.what].map(cap).join(" · ");
}

/** Compare two results of the same analysis at `digits` significant
 *  digits (the project's results precision; P values at four). */
export function diffResults(before: unknown, after: unknown, digits = 4): ResultDiff {
  const beforeError = errorOf(before);
  const afterError = errorOf(after);
  if (beforeError || afterError) {
    return { compared: 0, changed: [], ...(beforeError ? { beforeError } : {}),
      ...(afterError ? { afterError } : {}) };
  }
  const c = compareResults(before, after, { digits });
  return {
    compared: c.compared,
    changed: c.changes.map((x) => ({ path: x.path, label: labelOf(x), before: x.saved,
      after: x.now, kind: kindOf(x) })),
  };
}

/** Relative size of a change (Infinity when a number goes). */
export function relChange(c: NumberChange): number {
  if (c.before === null || c.after === null) return Infinity;
  return Math.abs(c.after - c.before) / Math.max(Math.abs(c.before), 1e-300);
}

/** The changes worth listing first: P values, then fitted parameters,
 *  then the rest by relative size; at most `max`. */
export function keyChanges(d: ResultDiff, max = 8): NumberChange[] {
  const rank = (c: NumberChange) => (c.kind === "p" ? 0 : c.kind === "param" ? 1 : 2);
  return [...d.changed].sort((x, y) => rank(x) - rank(y)
    || (rank(x) === 2 ? relChange(y) - relChange(x) : 0)).slice(0, max);
}

/** "0.03172 → 2.678e-4" (P as the results tables show it, in the
 *  project's P style) or "-6.983 → -6.9 (+1.2%)" at the results
 *  precision. */
export function describeChange(c: NumberChange, digits = 4): string {
  if (c.kind === "p") {
    const f = (v: number | null) => (v === null ? "not reported" : tableP(v));
    return `${f(c.before)} → ${f(c.after)}`;
  }
  const base = `${formatChanged(c.before, false, digits)} → ${formatChanged(c.after, false, digits)}`;
  if (c.before === null || c.after === null || c.before === 0) return base;
  const pct = (c.after - c.before) / Math.abs(c.before) * 100;
  const shown = Math.abs(pct) >= 10 ? pct.toFixed(0) : Math.abs(pct) >= 1 ? pct.toFixed(1)
    : pct.toPrecision(1);
  return `${base} (${pct > 0 ? "+" : ""}${shown}%)`;
}
