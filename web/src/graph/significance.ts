// Pairwise comparisons on graphs: P-value summaries, bracket stacking and
// the compact letter display. Pure functions, unit-tested.
import {
  currentReportPrefs, pNumber, pSummary, starScale as pStarScale, type PStyle as ReportPStyle,
} from "../report/pformat.ts";

/** One pairwise comparison, as drawn on a graph. `a` and `b` are group
 *  (dataset) names; `family` separates comparisons made within different
 *  rows of a two-way design. */
export interface Comparison {
  a: string;
  b: string;
  p: number;
  family?: string;
}

/** Stable identity of a comparison (stored in ComparisonsFormat.hidden). */
export function pairKey(c: { a: string; b: string; family?: string }): string {
  return `${c.family ?? ""}␟${c.a}␟${c.b}`;
}

/** Asterisk summary with the usual thresholds: ns P > 0.05, * P ≤ 0.05,
 *  ** P ≤ 0.01, *** P ≤ 0.001, **** P ≤ 0.0001. */
export function pStars(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p <= 0.0001) return "****";
  if (p <= 0.001) return "***";
  if (p <= 0.01) return "**";
  if (p <= 0.05) return "*";
  return "ns";
}

/** Exact P for a graph label: four significant digits, "< 0.0001" below. */
export function formatP(p: number, prefix = "P = "): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.0001) return prefix ? `${prefix.replace("=", "<")}0.0001` : "< 0.0001";
  const s = p >= 0.001 ? p.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
    : Number(p.toPrecision(2)).toString();
  return `${prefix}${s}`;
}

// ------------------------------------------------------------ P styles
// One P-value style for the whole project: the reporting preference
// (Preferences → Reporting, report/prefs.ts) is the single source, and the
// rules live in report/pformat.ts. A graph may override the style
// (GraphFormat.pStyle) and "hide ns" (ComparisonsFormat.hideNs); absent,
// both follow the project. The functions below are the graph-side names
// of the pformat rules, so brackets, results tables, sentences and legends
// never disagree.

export type PStyle = ReportPStyle;

export const P_STYLES: readonly (readonly [PStyle, string])[] = [
  ["graphpad", "GraphPad (0.0123, < 0.0001, ****)"],
  ["apa", "APA (.012, < .001, ***)"],
  ["nejm", "NEJM (0.01, < 0.001, ***)"],
];

/** Options of a graph's P-value style select: "" follows the project. */
export function pStyleOptions(): readonly (readonly [PStyle | "", string])[] {
  const proj = currentReportPrefs().pStyle;
  const name = P_STYLES.find(([v]) => v === proj)?.[1].replace(/ \(.*$/, "") ?? proj;
  return [["", `As in Preferences (${name})`], ...P_STYLES];
}

export function isPStyle(v: unknown): v is PStyle {
  return v === "graphpad" || v === "apa" || v === "nejm";
}

/** The P style a graph draws in: its own override, else the project's. */
export function graphPStyle(format: { pStyle?: PStyle } | null | undefined): PStyle {
  return format?.pStyle ?? currentReportPrefs().pStyle;
}

/** Whether a graph leaves non-significant pairs out: its own override,
 *  else the project's "hide ns". */
export function graphHideNs(c: { hideNs?: boolean } | null | undefined): boolean {
  return c?.hideNs ?? currentReportPrefs().hideNs;
}

/** Changes whenever the project's P style or "hide ns" does: graph
 *  effects list it as a dependency so brackets redraw. */
export function pStyleKey(): string {
  const r = currentReportPrefs();
  return `${r.pStyle}|${r.hideNs ? 1 : 0}`;
}

/** Asterisks for P in a style (report/pformat.ts pSummary): ≤ 0.05 / 0.01
 *  / 0.001, and ≤ 0.0001 in the GraphPad style; "ns" above 0.05. */
export function starsFor(p: number, style: PStyle = currentReportPrefs().pStyle): string {
  if (!Number.isFinite(p)) return "";
  return pSummary(p, style, false);
}

/** Exact P in a style. `prefix` is "P = ", "p = " or "" (below the floor
 *  the "=" turns into "<"). The GraphPad style is formatP exactly; APA and
 *  NEJM use the pformat rules. */
export function formatPStyle(p: number, style: PStyle = currentReportPrefs().pStyle,
  prefix = "P = "): string {
  if (style === "graphpad") return formatP(p, prefix);
  if (!Number.isFinite(p)) return "";
  const n = pNumber(p, style, "text");
  const bound = n.startsWith("<") || n.startsWith(">");
  const num = bound ? n.slice(1).trim() : n;
  if (!prefix) return bound ? `${n[0]} ${num}` : num;
  return bound ? `${prefix.replace("=", n[0])}${num}` : `${prefix}${num}`;
}

/** The asterisk scale in words, for a figure legend (pformat starScale). */
export function starScale(style: PStyle = currentReportPrefs().pStyle,
  hideNs = false): string {
  return pStarScale(style, hideNs);
}

/** Not significant at 0.05 (what "hide ns" hides). */
export function isNs(p: number, style: PStyle = currentReportPrefs().pStyle): boolean {
  return starsFor(p, style) === "ns";
}

/** Split an engine "A vs. B" label into two known group names. Names can
 *  themselves contain " vs. ", so try every split point. */
export function splitPair(label: string, names: string[]): [string, string] | null {
  const set = new Set(names);
  const sep = " vs. ";
  let at = label.indexOf(sep);
  while (at >= 0) {
    const a = label.slice(0, at), b = label.slice(at + sep.length);
    if (set.has(a) && set.has(b)) return [a, b];
    at = label.indexOf(sep, at + 1);
  }
  return null;
}

// ------------------------------------------------------------ brackets

export interface BracketInput {
  key: string;
  /** Positions of the two groups (any order). */
  x0: number;
  x1: number;
  label: string;
}

export interface Bracket extends BracketInput {
  lo: number;
  hi: number;
  /** Height of the horizontal bar (axis units). */
  y: number;
  /** 0 = lowest tier. */
  level: number;
}

/**
 * Place brackets so none overlaps the data or another bracket.
 *
 * `topAt(lo, hi)` gives the highest data value (axis units) between two
 * positions, inclusive. Brackets are placed narrowest first (then left to
 * right); each sits one `step` above the data it spans and one `step`
 * above every already placed bracket whose span touches its own, so
 * wider comparisons climb over narrower ones.
 */
export function stackBrackets(items: BracketInput[],
  topAt: (lo: number, hi: number) => number, step: number): Bracket[] {
  const sorted = items
    .map((it) => ({ ...it, lo: Math.min(it.x0, it.x1), hi: Math.max(it.x0, it.x1) }))
    .sort((p, q) => (p.hi - p.lo) - (q.hi - q.lo) || p.lo - q.lo || p.hi - q.hi);
  const placed: Bracket[] = [];
  const eps = 1e-9;
  for (const it of sorted) {
    let y = topAt(it.lo, it.hi) + step;
    for (const p of placed) {
      if (it.lo <= p.hi + eps && p.lo <= it.hi + eps) y = Math.max(y, p.y + step);
    }
    placed.push({ ...it, y, level: 0 });
  }
  // Tiers for styling/tests: distinct heights in ascending order.
  const heights = [...new Set(placed.map((b) => b.y))].sort((a, b) => a - b);
  for (const b of placed) b.level = heights.indexOf(b.y);
  return placed;
}

// --------------------------------------------- compact letter display

/**
 * Compact letter display by the insert-and-absorb algorithm (Piepho 2004).
 * Groups that share a letter are not significantly different.
 *
 * Start with one letter shared by every group. For each significant pair
 * (i, j), every letter column holding both is split into two copies, one
 * without i and one without j; then any column contained in another is
 * absorbed (removed). Columns are finally lettered in the order of the
 * first group (in `order`, default by index) that carries them.
 *
 * Returns, per group index, its letters as column indices (0 = "a").
 */
export function letterColumns(n: number, significant: [number, number][],
  order?: number[]): number[][] {
  if (n <= 0) return [];
  let cols: Set<number>[] = [new Set(Array.from({ length: n }, (_, i) => i))];
  for (const [i, j] of significant) {
    if (i === j || i < 0 || j < 0 || i >= n || j >= n) continue;
    const next: Set<number>[] = [];
    for (const c of cols) {
      if (c.has(i) && c.has(j)) {
        const a = new Set(c); a.delete(i);
        const b = new Set(c); b.delete(j);
        next.push(a, b);
      } else next.push(c);
    }
    cols = absorb(next);
  }
  const rank = new Map<number, number>();
  (order ?? Array.from({ length: n }, (_, i) => i)).forEach((g, r) => rank.set(g, r));
  const first = (c: Set<number>) => Math.min(...[...c].map((g) => rank.get(g) ?? g + n));
  cols.sort((a, b) => first(a) - first(b));
  const out: number[][] = Array.from({ length: n }, () => []);
  cols.forEach((c, k) => { for (const g of c) out[g].push(k); });
  return out;
}

function absorb(cols: Set<number>[]): Set<number>[] {
  const keep: Set<number>[] = [];
  const subset = (a: Set<number>, b: Set<number>) =>
    a.size <= b.size && [...a].every((x) => b.has(x));
  cols.forEach((c, i) => {
    if (c.size === 0) return;
    const swallowed = cols.some((d, j) => j !== i && subset(c, d)
      // identical columns: keep the first copy only
      && (c.size < d.size || j < i));
    if (!swallowed) keep.push(c);
  });
  return keep;
}

/** Spell letter columns: a..z, then aa, ab, ...; or A..Z; or 1, 2, ... */
export function letterName(k: number, style: "lower" | "upper" | "numbers" = "lower"): string {
  if (style === "numbers") return String(k + 1);
  let s = "";
  let v = k;
  do {
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26) - 1;
  } while (v >= 0);
  return style === "upper" ? s.toUpperCase() : s;
}

/** Letters per group, as strings. */
export function compactLetters(n: number, significant: [number, number][],
  style: "lower" | "upper" | "numbers" = "lower", order?: number[]): string[] {
  return letterColumns(n, significant, order).map((ks) =>
    ks.map((k) => letterName(k, style)).join(style === "numbers" ? "," : ""));
}

/** The input the engine's `compact_letters` handler receives, and the
 *  key its answer is cached under. */
export function lettersPayload(groups: string[], comparisons: Comparison[],
  alpha: number) {
  return {
    groups,
    comparisons: comparisons.map((c) => ({ a: c.a, b: c.b, p: c.p, significant: c.p < alpha })),
    alpha,
  };
}

export function lettersInputKey(groups: string[], comparisons: Comparison[],
  alpha: number): string {
  return JSON.stringify(lettersPayload(groups, comparisons, alpha));
}

/** Read the engine's answer: `{letters: string[]}` (per group, in order),
 *  `{letters: {name: letters}}` or `{groups: [{name, letters}]}`. */
export function parseEngineLetters(res: unknown, groups: string[]): string[] | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  if (r.error) return null;
  if (Array.isArray(r.letters) && r.letters.length === groups.length) {
    return r.letters.map((l) => String(l));
  }
  if (r.letters && typeof r.letters === "object" && !Array.isArray(r.letters)) {
    const m = r.letters as Record<string, unknown>;
    if (groups.every((g) => typeof m[g] === "string")) return groups.map((g) => m[g] as string);
  }
  if (Array.isArray(r.groups)) {
    const m = new Map<string, string>();
    for (const g of r.groups) {
      if (g && typeof g === "object" && typeof (g as Record<string, unknown>).name === "string") {
        m.set((g as Record<string, string>).name, String((g as Record<string, unknown>).letters ?? ""));
      }
    }
    if (groups.every((g) => m.has(g))) return groups.map((g) => m.get(g)!);
  }
  return null;
}
