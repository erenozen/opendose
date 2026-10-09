// Which numbers of a result changed when the same analysis ran on new
// data: every number in the engine's result is compared, path by path,
// and the key ones (P values first, then fitted parameters, then the
// largest relative changes) are listed with both values. Pure: the
// numbers come from the engine (old and new results); nothing here
// computes a statistic. Used by the replay log (project/replay.ts).
import { tableP } from "../report/pformat.ts";

export type ChangeKind = "p" | "param" | "other";

export interface NumberChange {
  /** Path in the result ("datasets[Drug A].fit.params.LogIC50.value"). */
  path: string;
  /** Readable name ("Drug A · LogIC50"). */
  label: string;
  before: number | null;
  after: number | null;
  kind: ChangeKind;
}

export interface ResultDiff {
  /** Numbers compared (present on either side). */
  compared: number;
  changed: NumberChange[];
  /** Error text of a side that failed. */
  beforeError?: string;
  afterError?: string;
}

/** Arrays longer than this are curves or per-point series, not results. */
const LONG_ARRAY = 40;
/** Keys holding drawing data (curves, bands, plot grids). */
const SKIP_KEYS = /^(curve|curves|band|bands|plot|plots|grid|svg|png|figure|traces)$/i;
/** Keys of P values. "p1" / "p2" (proportions) are not. */
const P_KEY = /^(?:p|pval|pvalue|p_value|p_(?:adj\w*|adjusted|exact|two\w*|one\w*|less|greater|raw|unadjusted|holm|bonferroni|sidak|dunn|tukey|trend|corrected|logrank|interaction|row|rows|column|columns|col|overall|value_\w+)|(?:adj|adjusted|raw|corrected|unadjusted)_p(?:_value)?)$/i;

export function isPKey(key: string): boolean { return P_KEY.test(key); }

interface Leaf { value: number | null; segs: string[] }

/** Every number in a result, by path. Arrays of named items (data sets,
 *  comparisons) are keyed by their name so a reordered list still lines
 *  up; long numeric arrays (curves) and drawing data are left out. */
export function flattenNumbers(result: unknown): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  const walk = (v: unknown, path: string, segs: string[]) => {
    if (typeof v === "number") {
      out.set(path, { value: Number.isFinite(v) ? v : null, segs });
      return;
    }
    if (v === null) {
      // a missing number (an SE that could not be computed) still counts
      if (segs.length && /^(p|se|sd|value|mean|median|ci\d*|lo|hi|lower|upper|estimate)$/i
        .test(segs[segs.length - 1])) out.set(path, { value: null, segs });
      return;
    }
    if (Array.isArray(v)) {
      if (v.length > LONG_ARRAY) return;
      const names = v.map((x) => (x && typeof x === "object" && !Array.isArray(x)
        && typeof (x as { name?: unknown }).name === "string" ? (x as { name: string }).name
        : null));
      const named = names.every((n) => n) && new Set(names).size === names.length;
      v.forEach((x, i) => {
        const tag = named ? names[i]! : String(i);
        walk(x, `${path}[${tag}]`, [...segs, named ? `@${tag}` : `#${i}`]);
      });
      return;
    }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (SKIP_KEYS.test(k)) continue;
        walk(x, path ? `${path}.${k}` : k, [...segs, k]);
      }
    }
  };
  walk(result, "", []);
  return out;
}

const WORDS: Record<string, string> = {
  p: "P", p_value: "P", pvalue: "P", se: "SE", sd: "SD", sem: "SEM", df: "df", n: "n",
  r_squared: "R²", r2: "R²", chi2: "χ²", chi_square: "Chi-square", t: "t", f: "F",
  ci: "CI", ci95: "95% CI", mean: "mean", median: "median", hr: "hazard ratio",
  odds_ratio: "odds ratio", sy_x: "Sy.x", ss_res: "sum of squares",
  fisher_exact: "Fisher's exact", chi_square_yates: "Chi-square (Yates)", logrank: "log-rank",
  relative_risk: "relative risk", cramers_v: "Cramér's V",
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Path parts that only nest: they add nothing to a label. */
const QUIET = new Set(["params", "fit", "value", "result", "results", "stats", "statistics",
  "goodness", "summary", "fitted_values", "estimate"]);

function word(seg: string): string {
  if (WORDS[seg.toLowerCase()]) return WORDS[seg.toLowerCase()];
  if (isPKey(seg)) return `P (${seg.replace(/^p_|_p(_value)?$/i, "").replace(/_/g, " ")})`;
  return seg.replace(/_/g, " ");
}

/** "datasets", "@Drug A", "fit", "params", "LogIC50", "ci95", "#0" ->
 *  "Drug A · LogIC50 · 95% CI lower". */
export function labelFor(segs: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const next = segs[i + 1];
    if (s.startsWith("@")) { parts.push(s.slice(1)); continue; }
    if (s.startsWith("#")) {
      const prev = segs[i - 1] ?? "";
      if (/^(ci\d*(_.+)?|interval|range)$/i.test(prev) && (s === "#0" || s === "#1")) {
        parts[parts.length - 1] = `${parts[parts.length - 1]} ${s === "#0" ? "lower" : "upper"}`;
      } else parts.push(`row ${Number(s.slice(1)) + 1}`);
      continue;
    }
    const ci = /^ci(\d*)_(.+)$/i.exec(s);
    if (ci) {   // "ci_cramers_v" -> "Cramér's V 95% CI"
      parts.push(`${word(ci[2])} ${ci[1] ? `${ci[1]}% ` : ""}CI`);
      continue;
    }
    if (next?.startsWith("@")) continue;   // "datasets" before a named item
    if (QUIET.has(s.toLowerCase()) && i < segs.length - 1) continue;
    if (s.toLowerCase() === "value" && parts.length) continue;
    parts.push(word(s));
  }
  return parts.map(cap).join(" · ") || "Value";
}

function kindOf(segs: string[]): ChangeKind {
  const last = segs[segs.length - 1] ?? "";
  if (isPKey(last)) return "p";
  if (segs.includes("params") && (last === "value" || !segs.slice(segs.indexOf("params") + 2).length)) {
    return "param";
  }
  return "other";
}

/** Equal up to floating-point noise. */
export function sameNumber(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= 1e-12 + 1e-9 * Math.max(Math.abs(a), Math.abs(b));
}

const errorOf = (r: unknown): string | undefined => {
  if (r && typeof r === "object" && "error" in r && (r as { error?: unknown }).error) {
    return String((r as { error: unknown }).error);
  }
  return undefined;
};

/** Compare two results of the same analysis. */
export function diffResults(before: unknown, after: unknown): ResultDiff {
  const beforeError = errorOf(before);
  const afterError = errorOf(after);
  if (beforeError || afterError) {
    return { compared: 0, changed: [], ...(beforeError ? { beforeError } : {}),
      ...(afterError ? { afterError } : {}) };
  }
  const a = flattenNumbers(before);
  const b = flattenNumbers(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const changed: NumberChange[] = [];
  for (const k of keys) {
    const x = a.get(k);
    const y = b.get(k);
    const va = x?.value ?? null;
    const vb = y?.value ?? null;
    if (sameNumber(va, vb)) continue;
    const segs = (y ?? x)!.segs;
    changed.push({ path: k, label: labelFor(segs), before: va, after: vb, kind: kindOf(segs) });
  }
  return { compared: keys.size, changed };
}

/** Relative size of a change (Infinity when a number appears or goes). */
export function relChange(c: NumberChange): number {
  if (c.before === null || c.after === null) return Infinity;
  const base = Math.max(Math.abs(c.before), 1e-300);
  return Math.abs(c.after - c.before) / base;
}

/** The changes worth listing first: P values, then fitted parameters,
 *  then the rest by relative size; at most `max`. */
export function keyChanges(d: ResultDiff, max = 8): NumberChange[] {
  const rank = (c: NumberChange) => (c.kind === "p" ? 0 : c.kind === "param" ? 1 : 2);
  return [...d.changed].sort((x, y) => rank(x) - rank(y)
    || (rank(x) === 2 ? relChange(y) - relChange(x) : 0)).slice(0, max);
}

/** A number for the log: 4 significant digits, scientific when tiny or huge. */
export function fmtNumber(v: number | null): string {
  if (v === null) return "none";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(3).replace(/\.?0+e/, "e");
  return String(Number(v.toPrecision(4)));
}

/** "0.0317 → 0.0012" (P in the project's P style) or
 *  "1.04e-7 → 1.21e-7 (+16%)". */
export function describeChange(c: NumberChange): string {
  if (c.kind === "p") {
    const f = (v: number | null) => (v === null ? "none" : tableP(v));
    return `${f(c.before)} → ${f(c.after)}`;
  }
  const base = `${fmtNumber(c.before)} → ${fmtNumber(c.after)}`;
  if (c.before === null || c.after === null || c.before === 0) return base;
  const pct = (c.after - c.before) / Math.abs(c.before) * 100;
  const shown = Math.abs(pct) >= 10 ? pct.toFixed(0) : Math.abs(pct) >= 1 ? pct.toFixed(1) : pct.toPrecision(1);
  return `${base} (${pct > 0 ? "+" : ""}${shown}%)`;
}
