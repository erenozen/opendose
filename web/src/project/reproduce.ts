// Reproducing saved results. A project file keeps every results sheet's
// last result (`cached`) and, since this module, the software that saved
// it (`savedWith`). When a file saved by another build is opened, its
// analyses are recomputed by the engine at hand and each saved number is
// compared with the recomputed one at the precision the results sheets
// show: the project's significant digits, P values at four. Timing and
// version fields are ignored, and so are long numeric arrays (curve and
// density grids drawn on graphs: the parameters behind them are
// compared). Pure; the app side is app/reproduceCheck.ts and the strip.
import { pNumber } from "../report/pformat.ts";
import { formatSig } from "../types.ts";

/** The software a project file was saved with. */
export interface SavedWith {
  /** App version, "0.3.0". */
  app: string;
  /** Build commit, when the build had one. */
  commit?: string;
  /** Hash of the engine's Python files. */
  engine?: string;
  /** Python libraries of the engine that computed the results. */
  libraries?: Record<string, string>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

export function parseSavedWith(v: unknown): SavedWith | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const app = str(o.app);
  if (!app) return null;
  const out: SavedWith = { app };
  const commit = str(o.commit);
  if (commit) out.commit = commit;
  const engine = str(o.engine);
  if (engine) out.engine = engine;
  if (o.libraries && typeof o.libraries === "object" && !Array.isArray(o.libraries)) {
    const libs: Record<string, string> = {};
    for (const [k, x] of Object.entries(o.libraries as Record<string, unknown>)) {
      const s = str(x);
      if (s) libs[k.slice(0, 40)] = s;
    }
    if (Object.keys(libs).length) out.libraries = libs;
  }
  return out;
}

/** `savedWith` of a project file's text (null: not recorded, e.g. a file
 *  from before 0.3.1, or not JSON). */
export function savedWithOf(text: string): SavedWith | null {
  try { return parseSavedWith((JSON.parse(text) as { savedWith?: unknown }).savedWith); }
  catch { return null; }
}

/** Saved by exactly this build (app version, commit and engine)? */
export function sameBuild(saved: SavedWith | null, current: SavedWith): boolean {
  return !!saved && saved.app === current.app && (saved.commit ?? "") === (current.commit ?? "")
    && (saved.engine ?? "") === (current.engine ?? "");
}

/** "0.3.0", "0.3.0 (build abc1234)" when only the build differs, or
 *  "an earlier version" when the file does not say. */
export function savedLabel(saved: SavedWith | null, current: SavedWith): string {
  if (!saved) return "an earlier version";
  if (saved.app !== current.app) return saved.app;
  const build = saved.commit && saved.commit !== current.commit ? saved.commit
    : saved.engine && saved.engine !== current.engine ? `engine ${saved.engine.slice(0, 8)}` : "";
  return build ? `${saved.app} (build ${build})` : saved.app;
}

// ------------------------------------------------------------ comparing

/** Keys that never hold a result: timings, versions, seeds. */
const IGNORED = /^(elapsed|elapsed_s|runtime|duration|timing|timings|version|versions|engine_version|generated|timestamp|seed|seconds)$|_ms$/i;
/** Numeric arrays longer than this are plotting grids. */
export const LONG_ARRAY = 50;

/** A P value key: p, p_adjusted, recommended_p, p_value, … */
export function isPKey(key: string): boolean {
  return /^p$|^p_|_p$|p_?value|^pvalue/i.test(key);
}

/** Equal at `digits` significant digits (or within floating-point noise,
 *  so 0.0312499999 and 0.03125 do not count as a change). */
export function sameAtPrecision(a: number, b: number, digits: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b))) return true;
  return Number(a.toPrecision(digits)) === Number(b.toPrecision(digits));
}

export interface NumberChange {
  /** "comparisons[2].p_adjusted" */
  path: string;
  /** "adjusted P" */
  what: string;
  /** Names of the items on the way ("Treated vs Control", "Drug A"). */
  context: string[];
  saved: number;
  /** null: no longer reported. */
  now: number | null;
  p: boolean;
}

export interface Comparison {
  /** Numbers compared. */
  compared: number;
  changes: NumberChange[];
}

type Seg = string | number;

const NAME_KEYS = ["name", "label", "comparison", "term", "parameter", "group", "source", "title",
  "row", "factor", "dataset", "pair"];

/** A name for an item of an array of results, if it carries one. */
function itemName(o: unknown): string | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  for (const k of NAME_KEYS) if (typeof r[k] === "string" && r[k]) return String(r[k]);
  for (const [a, b] of [["group1", "group2"], ["a", "b"], ["group_a", "group_b"]]) {
    if (typeof r[a] === "string" && typeof r[b] === "string") return `${r[a]} vs ${r[b]}`;
  }
  return null;
}

/** Objects whose keys name groups ({Control: {...}, Treated: {...}}). */
const KEYED = new Set(["curves", "groups", "by_group", "per_group", "group_stats", "datasets", "columns"]);

const HUMAN: Record<string, string> = {
  p: "P", p_adjusted: "adjusted P", p_unadjusted: "unadjusted P", recommended_p: "P",
  p_two_tailed: "P (two-tailed)", r_squared: "R²", ci95: "95% CI", ci: "CI", se: "SE",
  sd: "SD", sem: "SEM", df: "df", n: "n", chi2: "chi-square", chi_square: "chi-square test",
  fisher_exact: "Fisher's exact test", logrank: "log-rank test",
  f_test_variances: "F test for equal variances", ci_difference: "CI of the difference",
  se_difference: "SE of the difference",
};

function human(key: string): string {
  return HUMAN[key] ?? key.replace(/_/g, " ");
}

/** Containers whose name adds nothing to a number's label. */
const GENERIC = new Set(["fit", "params", "result", "table", "goodness", "fitted_values"]);
/** Keys that need their owner to mean something (P of which test?). */
const OWNED = new Set(["p", "F", "statistic", "chi2", "df", "dfn", "dfd", "z", "t", "value", "estimate"]);

/** What a path's number is: its key, with the test or parameter it
 *  belongs to where the key alone says little ("F test for equal
 *  variances P", "LogIC50", "LogIC50 95% CI lower limit"). */
function whatOf(path: Seg[]): string {
  const keys = path.filter((s): s is string => typeof s === "string");
  const last = path[path.length - 1];
  const key = keys[keys.length - 1] ?? "value";
  const parentSeg = path[path.length - (typeof last === "number" ? 3 : 2)];
  const parent = typeof parentSeg === "string" && !GENERIC.has(parentSeg) ? parentSeg : undefined;
  if (typeof last === "number" && /(^|_)ci(\d+)?(_|$)|interval/i.test(key)) {
    return `${parent ? `${human(parent)} ` : ""}${human(key)} ${last === 0 ? "lower" : last === 1 ? "upper" : `[${last}]`} limit`;
  }
  if ((key === "value" || key === "estimate") && parent) return human(parent);
  if (OWNED.has(key) && parent) return `${human(parent)} ${human(key)}`;
  return human(key);
}

/** Two-group results name their groups in `names`: "n_b" is the n of
 *  the second group. */
function sideOf(key: string | number | undefined, names: unknown): { base: string; group: string } | null {
  if (typeof key !== "string" || !Array.isArray(names)) return null;
  const m = key.match(/^(.+)_(a|b)$/);
  const g = m ? names[m[2] === "a" ? 0 : 1] : null;
  return m && typeof g === "string" ? { base: m[1], group: g } : null;
}

const pathText = (path: Seg[]) => path.map((s, i) => (typeof s === "number" ? `[${s}]`
  : `${i ? "." : ""}${s}`)).join("");

/**
 * Every saved number compared with the recomputed result at display
 * precision. Numbers only the new result has (new outputs) are not
 * changes; a saved number the new result no longer has is.
 */
export function compareResults(saved: unknown, now: unknown,
  opts: { digits: number; pDigits?: number }): Comparison {
  const out: Comparison = { compared: 0, changes: [] };
  const pDigits = opts.pDigits ?? 4;
  const rootNames = saved && typeof saved === "object" ? (saved as { names?: unknown }).names : null;
  const walk =(s: unknown, n: unknown, path: Seg[], names: string[], pKey: boolean) => {
    if (typeof s === "number") {
      if (!Number.isFinite(s)) return;
      out.compared += 1;
      const v = typeof n === "number" && Number.isFinite(n) ? n : null;
      if (v === null || !sameAtPrecision(s, v, pKey ? pDigits : opts.digits)) {
        const side = path.length === 1 ? sideOf(path[0], rootNames) : null;
        out.changes.push({ path: pathText(path),
          what: side ? human(side.base) : whatOf(path),
          context: side ? [...names, side.group] : [...names], saved: s, now: v, p: pKey });
      }
      return;
    }
    if (Array.isArray(s)) {
      if (s.length > LONG_ARRAY && s.every((x) => typeof x === "number" || x === null)) return;
      const arr = Array.isArray(n) ? n : [];
      s.forEach((x, i) => {
        const name = itemName(x);
        walk(x, arr[i], [...path, i], name ? [...names, name] : names, pKey);
      });
      return;
    }
    if (s && typeof s === "object") {
      const o = (n && typeof n === "object" && !Array.isArray(n) ? n : {}) as Record<string, unknown>;
      for (const [k, x] of Object.entries(s as Record<string, unknown>)) {
        if (IGNORED.test(k)) continue;
        // A keyed collection (curves: {Control: {...}}) names its items.
        const parent = path[path.length - 1];
        const named = x && typeof x === "object" && typeof parent === "string"
          && KEYED.has(parent) ? [...names, k] : names;
        walk(x, o[k], [...path, k], named, isPKey(k));
      }
    }
  };
  walk(saved, now, [], [], false);
  return out;
}

/** A number as the change list writes it: P values exactly (results
 *  precision, at least four digits), others at the results precision. */
export function formatChanged(v: number | null, p: boolean, digits: number): string {
  if (v === null) return "not reported";
  return p ? pNumber(v, "graphpad", "table", "exact") : formatSig(v, digits);
}

/** "adjusted P (One-way ANOVA of Liver, Treated vs Control) 0.0312 → 0.0308" */
export function changeLine(c: NumberChange, sheet: string, digits: number): string {
  return `${c.what} (${[sheet, ...c.context].join(", ")}) ${formatChanged(c.saved, c.p, digits)} → ${formatChanged(c.now, c.p, digits)}`;
}

// ------------------------------------------------------------ report

/** The comparison of one results sheet. */
export interface SheetCheck {
  sheetId: string;
  name: string;
  /** Result id (`result.analysis`), for the change log. */
  analysis: string;
  status: "reproduced" | "changed" | "failed" | "skipped";
  compared: number;
  changes: NumberChange[];
  /** Why it failed or was skipped. */
  note?: string;
}

export interface ReproductionReport {
  file: string;
  savedWith: SavedWith | null;
  current: SavedWith;
  /** ISO time of the check. */
  checkedAt: string;
  digits: number;
  sheets: SheetCheck[];
}

export interface ReproductionTotals {
  compared: number;
  changed: number;
  sheets: number;
  changedSheets: number;
  failed: number;
  skipped: number;
}

export function totals(r: Pick<ReproductionReport, "sheets">): ReproductionTotals {
  const t: ReproductionTotals = { compared: 0, changed: 0, sheets: 0, changedSheets: 0, failed: 0, skipped: 0 };
  for (const s of r.sheets) {
    if (s.status === "failed") { t.failed += 1; continue; }
    if (s.status === "skipped") { t.skipped += 1; continue; }
    t.sheets += 1;
    t.compared += s.compared;
    t.changed += s.changes.length;
    if (s.changes.length) t.changedSheets += 1;
  }
  return t;
}

/** Every changed number of a report as a line
 *  ("adjusted P (One-way ANOVA of Liver, A vs B) 0.0312 → 0.0308"). */
export function changedLines(r: Pick<ReproductionReport, "sheets" | "digits">): string[] {
  return r.sheets.flatMap((s) => s.changes.map((c) => changeLine(c, s.name, r.digits)));
}

/** "All 48 results reproduced with OpenDose 0.4.0 (saved with 0.3.0)" or
 *  "2 of 48 results changed with OpenDose 0.4.0 (saved with 0.3.0)". */
export function headline(r: ReproductionReport): string {
  const t = totals(r);
  const versions = `with OpenDose ${r.current.app} (saved with ${savedLabel(r.savedWith, r.current)})`;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let s = t.changed
    ? `${t.changed} of ${plural(t.compared, "result")} changed ${versions}`
    : t.sheets ? `All ${plural(t.compared, "result")} reproduced ${versions}`
      : `No saved results could be compared ${versions}`;
  const extra = [t.failed && `${t.failed} ${t.failed === 1 ? "analysis" : "analyses"} could not be recomputed`,
    t.skipped && `${t.skipped} not compared (see History)`].filter(Boolean);
  if (extra.length) s += `; ${extra.join("; ")}`;
  return s;
}
