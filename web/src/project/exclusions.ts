// Why values were excluded, and what that leaves to analyse. Excluded
// cells stay in the table (struck through, skipped by analyses and graphs:
// project/table.ts); each may carry a reason in its data set's
// `exclusionReasons`, keyed like `excluded` ("row:sub"). This module sets
// and reads reasons, keeps them in step with the exclusions when rows or
// subcolumns move (`syncReasons`, called by the row operations of
// table.ts), counts per group what was entered, excluded and analysed, and
// writes the "n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)"
// sentence the methods paragraph and figure legends carry.
//
// Reporting rules behind it: ARRIVE 2.0 item 3b ("For each experimental
// group, report any animals, experimental units, or data points not
// included in the analysis and explain why"), item 3c (exact n per group
// per analysis), and the British Journal of Pharmacology design guidance
// (outliers stay in unless a predefined, defensible exclusion criterion
// applies). Nothing here excludes a value by itself. Pure; no runtime
// import of table.ts (it imports this module).
import type { CellRef } from "./table.ts";
import type { DataColumn, DataTableModel } from "./types.ts";

/** Reasons offered when a value is excluded (any other text is fine). */
export const PRESET_REASONS = [
  "technical failure",
  "outlier by a pre-specified rule (ROUT/Grubbs)",
  "animal welfare endpoint",
] as const;

export const MAX_REASON_LENGTH = 200;

/** Where the reporting rules come from (shown with the exclusions). */
export const EXCLUSION_SOURCES = [
  { label: "ARRIVE 2.0, item 3b: report every excluded animal, unit or data point per group, and why",
    url: "https://arriveguidelines.org/arrive-guidelines/inclusion-and-exclusion-criteria" },
  { label: "Curtis et al. 2018, Br J Pharmacol design and analysis guidance: outliers stay in unless a predefined exclusion criterion applies",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/" },
  { label: "GraphPad Prism User Guide: Excluding or highlighting values",
    url: "https://www.graphpad.com/guides/prism/latest/user-guide/excluding_values.htm" },
] as const;

/** A reason as stored: one line, trimmed, at most MAX_REASON_LENGTH. */
export function cleanReason(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, MAX_REASON_LENGTH);
}

/** Reasons read from a file: string values under "row:sub" keys. */
export function parseReasons(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    const reason = cleanReason(r);
    if (/^\d+:\d+$/.test(k) && reason) out[k] = reason;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A data set's reasons after its exclusions changed: every key is moved
 * by `move` (null drops it: the row or subcolumn is gone), and a reason
 * whose cell is no longer excluded is dropped. Returns the column itself
 * when it has no reasons, so tables without any never change shape.
 */
export function syncReasons(col: DataColumn,
  move: (key: string) => string | null = (k) => k): DataColumn {
  if (!col.exclusionReasons) return col;
  const ex = new Set(col.excluded ?? []);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(col.exclusionReasons)) {
    const nk = move(k);
    if (nk !== null && v && ex.has(nk)) out[nk] = v;
  }
  const next: DataColumn = { ...col };
  if (Object.keys(out).length) next.exclusionReasons = out;
  else delete next.exclusionReasons;
  return next;
}

const isExcl = (d: DataColumn, key: string) => !!d.excluded?.includes(key);

/** The reason recorded for an excluded cell ("" when none). */
export function reasonAt(t: DataTableModel, ref: CellRef): string {
  if (ref.kind !== "y") return "";
  const d = t.datasets[ref.dataset];
  const key = `${ref.row}:${ref.sub}`;
  return d && isExcl(d, key) ? d.exclusionReasons?.[key] ?? "" : "";
}

/** Record (or, with an empty reason, clear) the reason of excluded cells.
 *  Cells that are not excluded are left alone. */
export function setReasons(t: DataTableModel, refs: readonly CellRef[], reason: string):
  DataTableModel {
  const text = cleanReason(reason);
  const byDs = new Map<number, string[]>();
  for (const ref of refs) {
    if (ref.kind !== "y") continue;
    const d = t.datasets[ref.dataset];
    const key = `${ref.row}:${ref.sub}`;
    if (!d || !isExcl(d, key)) continue;
    byDs.set(ref.dataset, [...(byDs.get(ref.dataset) ?? []), key]);
  }
  if (!byDs.size) return t;
  return {
    ...t,
    datasets: t.datasets.map((d, i) => {
      const keys = byDs.get(i);
      if (!keys) return d;
      const reasons = { ...(d.exclusionReasons ?? {}) };
      for (const k of keys) {
        if (text) reasons[k] = text;
        else delete reasons[k];
      }
      const next: DataColumn = { ...d, exclusionReasons: reasons };
      if (!Object.keys(reasons).length) delete next.exclusionReasons;
      return next;
    }),
  };
}

/** Y cells that are excluded in `after` but were not in `before` (what a
 *  Ctrl/Cmd+E just excluded), in data set, row, subcolumn order. */
export function newlyExcluded(before: DataTableModel, after: DataTableModel): CellRef[] {
  const out: CellRef[] = [];
  after.datasets.forEach((d, di) => {
    const old = new Set(before.datasets[di]?.excluded ?? []);
    for (const k of sortKeys(d.excluded ?? [])) {
      if (old.has(k)) continue;
      const [row, sub] = k.split(":").map(Number);
      out.push({ kind: "y", dataset: di, row, sub });
    }
  });
  return out;
}

/** The table with every exclusion lifted (X rows and Y cells), for the
 *  "results with excluded values included" comparison. */
export function includeExcluded(t: DataTableModel): DataTableModel {
  if (!hasExclusions(t)) return t;
  const next: DataTableModel = {
    ...t,
    datasets: t.datasets.map((d) => {
      const c: DataColumn = { ...d };
      delete c.excluded;
      delete c.exclusionReasons;
      return c;
    }),
  };
  delete next.xExcluded;
  return next;
}

export function hasExclusions(t: DataTableModel): boolean {
  return !!t.xExcluded?.length || t.datasets.some((d) => !!d.excluded?.length);
}

const sortKeys = (keys: readonly string[]) => [...keys].sort((a, b) => {
  const [ra, sa] = a.split(":").map(Number);
  const [rb, sb] = b.split(":").map(Number);
  return ra - rb || sa - sb;
});

const filled = (v: string | undefined) => (v ?? "").trim() !== "";

// ------------------------------------------------------------ listing

/** One excluded value with where it sits and why. */
export interface ExcludedValue {
  /** Data set index (-1: a whole X row of an XY table). */
  dataset: number;
  group: string;
  row: number;
  sub: number;
  /** "row 3", "Day 1, Y2", "X = 0.1". */
  where: string;
  value: string;
  /** "" when no reason was recorded. */
  reason: string;
}

const X_ROW_REASON = "X value excluded (whole row)";

function rowLabel(t: DataTableModel, r: number): string {
  if (t.type === "xy") return `X = ${t.x[r]?.trim() || "(blank)"}`;
  return t.rowTitles[r]?.trim() || `row ${r + 1}`;
}

function subLabel(t: DataTableModel, d: DataColumn, s: number): string {
  const n = d.rows[0]?.length ?? 1;
  if (n <= 1) return "";
  if (t.type === "survival") return ["Time", "Event"][s] ?? (d.subTitles?.[s] || `covariate ${s - 1}`);
  return d.subTitles?.[s]?.trim() || `Y${s + 1}`;
}

/** Every excluded value that holds something (blank cells marked as
 *  excluded are not values), table order. X rows of an XY table come
 *  first, as one entry each. */
export function excludedValues(t: DataTableModel): ExcludedValue[] {
  const out: ExcludedValue[] = [];
  if (t.type === "xy") {
    for (const r of [...(t.xExcluded ?? [])].sort((a, b) => a - b)) {
      if (!filled(t.x[r])) continue;
      out.push({ dataset: -1, group: t.xTitle || "X", row: r, sub: 0, where: `row ${r + 1}`,
        value: t.x[r], reason: X_ROW_REASON });
    }
  }
  t.datasets.forEach((d, di) => {
    for (const k of sortKeys(d.excluded ?? [])) {
      const [r, s] = k.split(":").map(Number);
      const value = d.rows[r]?.[s] ?? "";
      if (!filled(value)) continue;
      const sub = subLabel(t, d, s);
      out.push({ dataset: di, group: d.name || `Data set ${di + 1}`, row: r, sub: s,
        where: `${rowLabel(t, r)}${sub ? `, ${sub}` : ""}`, value,
        reason: d.exclusionReasons?.[k] ?? "" });
    }
  });
  return out;
}

// ------------------------------------------------------------ counting

export interface ReasonCount { reason: string; n: number }

/** Entered, excluded and analysed per group (data set; row × data set
 *  for grouped tables; subjects for survival tables). */
export interface GroupExclusions {
  name: string;
  entered: number;
  excluded: number;
  analysed: number;
  reasons: ReasonCount[];
}

function addReason(list: ReasonCount[], reason: string) {
  const hit = list.find((x) => x.reason === reason);
  if (hit) hit.n += 1;
  else list.push({ reason, n: 1 });
}

/** Can n be counted per group? Replicate values of column, XY, grouped
 *  and nested tables, and survival subjects. Summary formats (mean, SD,
 *  N), counts, parts of whole and multiple-variables tables list their
 *  excluded values without an n. */
export function countable(t: DataTableModel): boolean {
  if (t.type === "survival") return true;
  return t.subcolumnFormat === "replicates"
    && (t.type === "column" || t.type === "xy" || t.type === "grouped" || t.type === "nested");
}

/** Per group counts, or null when the table has no countable n. Groups
 *  without any value entered are left out. */
export function exclusionGroups(t: DataTableModel): GroupExclusions[] | null {
  if (!countable(t)) return null;
  const xOut = new Set(t.type === "xy" ? t.xExcluded ?? [] : []);
  const groups: GroupExclusions[] = [];
  const nRows = t.x.length;
  t.datasets.forEach((d, di) => {
    const name = d.name.trim() || `Data set ${di + 1}`;
    const reasonOf = (r: number, s: number) => d.exclusionReasons?.[`${r}:${s}`] ?? "";
    if (t.type === "survival") {
      const g: GroupExclusions = { name, entered: 0, excluded: 0, analysed: 0, reasons: [] };
      for (let r = 0; r < nRows; r++) {
        const row = d.rows[r] ?? [];
        if (!row.slice(0, 2).some(filled)) continue;
        g.entered += 1;
        const subs = row.map((_, s) => s).filter((s) => isExcl(d, `${r}:${s}`));
        if (subs.length) {
          g.excluded += 1;
          addReason(g.reasons, subs.map((s) => reasonOf(r, s)).find(Boolean) ?? "");
        }
      }
      g.analysed = g.entered - g.excluded;
      groups.push(g);
      return;
    }
    const cellGroup = (rows: number[], label: string) => {
      const g: GroupExclusions = { name: label, entered: 0, excluded: 0, analysed: 0, reasons: [] };
      for (const r of rows) {
        (d.rows[r] ?? []).forEach((v, s) => {
          if (!filled(v)) return;
          g.entered += 1;
          if (xOut.has(r)) { g.excluded += 1; addReason(g.reasons, X_ROW_REASON); }
          else if (isExcl(d, `${r}:${s}`)) { g.excluded += 1; addReason(g.reasons, reasonOf(r, s)); }
        });
      }
      g.analysed = g.entered - g.excluded;
      return g;
    };
    if (t.type === "grouped") {
      for (let r = 0; r < nRows; r++) {
        groups.push(cellGroup([r], `${t.rowTitles[r]?.trim() || `Row ${r + 1}`} · ${name}`));
      }
      return;
    }
    groups.push(cellGroup(Array.from({ length: nRows }, (_, r) => r), name));
  });
  return groups.filter((g) => g.entered > 0);
}

/** "tumour ulceration", or "tumour ulceration (2), technical failure (1)". */
export function reasonsText(reasons: readonly ReasonCount[]): string {
  const named = reasons.map((x) => ({ ...x, reason: x.reason || "reason not recorded" }));
  if (named.length === 1) return named[0].reason;
  return [...named].sort((a, b) => b.n - a.n).map((x) => `${x.reason} (${x.n})`).join(", ");
}

/** "n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)". */
export function groupSentence(g: GroupExclusions, opts: { name?: boolean } = {}): string {
  const tail = g.excluded ? ` (${g.excluded} excluded: ${reasonsText(g.reasons)})` : "";
  return `${opts.name ? `${g.name}, ` : ""}n = ${g.entered} enrolled, ${g.analysed} analysed${tail}`;
}

function listJoin(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The exclusions of a table as one clause for methods and legends (no
 * final full stop), or null when nothing is excluded. One group:
 * "n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)"; several:
 * "Treated, n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration);
 * no exclusions in Control". Tables without a countable n:
 * "3 values excluded from the analysis (technical failure (2), …)".
 */
export function exclusionSentence(t: DataTableModel): string | null {
  const groups = exclusionGroups(t);
  if (!groups) {
    const vals = excludedValues(t);
    if (!vals.length) return null;
    const reasons: ReasonCount[] = [];
    vals.forEach((v) => addReason(reasons, v.reason));
    return `${vals.length} value${vals.length === 1 ? "" : "s"} excluded from the analysis (${reasonsText(reasons)})`;
  }
  const hit = groups.filter((g) => g.excluded > 0);
  if (!hit.length) return null;
  if (groups.length === 1) return groupSentence(hit[0]);
  const rest = groups.filter((g) => g.excluded === 0).map((g) => g.name);
  const parts = hit.map((g) => groupSentence(g, { name: true }));
  if (rest.length) {
    parts.push(`no exclusions in ${rest.length <= 3 ? listJoin(rest) : `the other ${rest.length} groups`}`);
  }
  return parts.join("; ");
}

/** Every excluded value has a reason recorded (false when none is
 *  excluded). */
export function allReasoned(t: DataTableModel): boolean {
  const vals = excludedValues(t);
  return vals.length > 0 && vals.every((v) => v.reason !== "");
}
