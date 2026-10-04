// Tumour growth and other longitudinal measurements per subject: reading
// long records (subject, group, time, value) from a multiple-variables
// table, or from a grouped / XY table whose subcolumns are subjects;
// the grouped layout the mixed model needs; per-subject time to an
// endpoint as a survival table; options of the three analyses. Pure (no
// React), unit-tested in __tests__/assays.test.ts.
import { normalizeTable, parseCell, withExclusionsBlanked } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { xNumbers } from "../../project/xformat.ts";

export const A_TUMOUR_MIXED = "tumour_mixed";
export const A_TUMOUR_AUC = "tumour_auc";
export const A_TUMOUR_ENDPOINT = "tumour_endpoint";
export const G_TUMOUR_CURVES = "tumour_curves";
export const G_TUMOUR_AUC_CURVES = "tumour_auc_curves";
export const G_TUMOUR_AUC = "tumour_auc_dots";
export const G_TUMOUR_ENDPOINT = "tumour_endpoint_curves";

/** Multiple-variables tables: the variable holding each role. */
export interface TumourColumns { subject: string; group: string; time: string; value: string }

export interface TumourBase {
  columns: TumourColumns;
  /** Analyse ln(value + offset). */
  log: boolean;
  offset: string;
}

export interface TumourMixedOptions extends TumourBase {
  comparisons: "sidak" | "tukey" | "bonferroni" | "none";
  direction: "columns_within_rows" | "rows_within_columns";
}

export interface TumourAucOptions extends TumourBase {
  baseline: "zero" | "first";
  perTime: boolean;
  welch: boolean;
}

export interface TumourEndpointOptions extends TumourBase {
  threshold: string;
  interpolate: boolean;
}

export type TumourOptions = TumourMixedOptions | TumourAucOptions | TumourEndpointOptions;

export interface LongRecord { subject: string; label: string; group: string; time: number; value: number }

export interface Records {
  records: LongRecord[];
  source: "long" | "grouped" | "xy";
  /** Times read from row titles that hold no number (row order used). */
  timeFromOrder?: boolean;
  error?: string;
}

const SUBJECT_RE = /^(subject|animal|mouse|mice|rat|id|patient|donor|individual|subject[ _]?id|animal[ _]?id|mouse[ _]?id|tag|ear[ _]?tag)$/i;
const GROUP_RE = /^(group|treatment|arm|cohort|condition|genotype|drug|dose[ _]?group|strain)$/i;
const TIME_RE = /^(time|day|days|week|weeks|hour|hours|h|timepoint|time[ _]?point|visit)(\s*\(.*\))?$/i;
const VALUE_RE = /^(volume|tumou?r[ _]?volume|value|size|weight|body[ _]?weight|response|measurement|y)(\s*\(.*\))?$/i;

/** First guess at which variable holds which role. */
export function guessColumns(table: DataTableModel): TumourColumns {
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const used = new Set<string>();
  const find = (re: RegExp, numeric: boolean | null) => {
    let hit = names.find((n, i) => !used.has(n) && re.test(n)
      && (numeric === null || (table.datasets[i].varType !== "categorical") === numeric));
    if (!hit) hit = names.find((n) => !used.has(n) && re.test(n));
    if (hit) used.add(hit);
    return hit ?? "";
  };
  const subject = find(SUBJECT_RE, null);
  const group = find(GROUP_RE, null);
  const time = find(TIME_RE, true);
  const value = find(VALUE_RE, true);
  const rest = names.filter((n) => !used.has(n));
  const fill = (v: string, numeric: boolean) => {
    if (v) return v;
    const i = rest.findIndex((n) => {
      const k = names.indexOf(n);
      return (table.datasets[k].varType !== "categorical") === numeric;
    });
    return i >= 0 ? rest.splice(i, 1)[0] : "";
  };
  return {
    subject: fill(subject, false),
    group: fill(group, false),
    time: fill(time, true),
    value: fill(value, true),
  };
}

export const EMPTY_COLUMNS: TumourColumns = { subject: "", group: "", time: "", value: "" };

/** The number in a row title such as "Day 14" or "14 d" (null if none). */
export function timeFromTitle(s: string): number | null {
  const m = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/i.exec(s);
  return m ? Number(m[0]) : null;
}

/** Long records from the table. */
export function tumourRecords(table: DataTableModel, columns: TumourColumns): Records {
  const t = withExclusionsBlanked(table);
  if (t.type === "multivariable") {
    const names = t.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
    const idx = (n: string) => (n ? names.indexOf(n) : -1);
    const si = idx(columns.subject);
    const gi = idx(columns.group);
    const ti = idx(columns.time);
    const vi = idx(columns.value);
    if (si < 0 || ti < 0 || vi < 0) {
      return { records: [], source: "long",
        error: "Choose the variables that hold the subject, the time and the measured value" };
    }
    const cell = (k: number, r: number) => (t.datasets[k]?.rows[r]?.[0] ?? "").trim();
    const records: LongRecord[] = [];
    for (let r = 0; r < t.x.length; r++) {
      const subject = cell(si, r);
      const time = parseCell(cell(ti, r));
      const value = parseCell(cell(vi, r));
      if (!subject || time === null || value === null) continue;
      const group = gi >= 0 ? cell(gi, r) || "(no group)" : "All";
      records.push({ subject: `${group}::${subject}`, label: subject, group, time, value });
    }
    return { records, source: "long" };
  }
  if (t.type !== "grouped" && t.type !== "xy") {
    return { records: [], source: "long",
      error: "Use a multiple-variables table (one row per measurement), or a grouped or XY table with subjects as subcolumns" };
  }
  let times: (number | null)[];
  let timeFromOrder = false;
  if (t.type === "xy") {
    times = xNumbers(t);
  } else {
    times = t.rowTitles.map(timeFromTitle);
    if (times.some((v) => v === null)) {
      timeFromOrder = true;
      times = t.rowTitles.map((_, i) => i + 1);
    }
  }
  const records: LongRecord[] = [];
  t.datasets.forEach((d, di) => {
    const group = d.name.trim() || `Group ${di + 1}`;
    const width = Math.max(1, ...d.rows.map((row) => row.length));
    for (let k = 0; k < width; k++) {
      const label = d.subTitles?.[k]?.trim() || `${group} #${k + 1}`;
      d.rows.forEach((row, r) => {
        const time = times[r];
        const value = parseCell(row[k] ?? "");
        if (time === null || time === undefined || value === null) return;
        records.push({ subject: `${group}::${k}`, label, group, time, value });
      });
    }
  });
  return { records, source: t.type, timeFromOrder };
}

/** ln(value + offset), or null where that is undefined. */
export function transformValue(v: number, o: TumourBase): number | null {
  if (!o.log) return v;
  const shifted = v + (parseCell(o.offset) ?? 0);
  return shifted > 0 ? Math.log(shifted) : null;
}

export function transformed(records: LongRecord[], o: TumourBase): { records: LongRecord[]; dropped: number } {
  let dropped = 0;
  const out: LongRecord[] = [];
  for (const r of records) {
    const v = transformValue(r.value, o);
    if (v === null) { dropped++; continue; }
    out.push({ ...r, value: v });
  }
  return { records: out, dropped };
}

export interface SubjectSeries { subject: string; label: string; group: string; t: number[]; y: number[] }

/** Records per subject (time order; duplicate times averaged), groups in
 *  order of first appearance. */
export function subjectSeries(records: LongRecord[]): { groups: string[]; subjects: SubjectSeries[]; duplicates: number } {
  const groups: string[] = [];
  const by = new Map<string, { label: string; group: string; pts: Map<number, number[]> }>();
  for (const r of records) {
    if (!groups.includes(r.group)) groups.push(r.group);
    let s = by.get(r.subject);
    if (!s) { s = { label: r.label, group: r.group, pts: new Map() }; by.set(r.subject, s); }
    const list = s.pts.get(r.time) ?? [];
    list.push(r.value);
    s.pts.set(r.time, list);
  }
  let duplicates = 0;
  const subjects: SubjectSeries[] = [];
  for (const [subject, s] of by) {
    const ts = [...s.pts.keys()].sort((a, b) => a - b);
    subjects.push({
      subject, label: s.label, group: s.group, t: ts,
      y: ts.map((tt) => {
        const v = s.pts.get(tt)!;
        if (v.length > 1) duplicates += v.length - 1;
        return v.reduce((a, b) => a + b, 0) / v.length;
      }),
    });
  }
  return { groups, subjects, duplicates };
}

const fmtNum = (v: number) => String(Number(v.toPrecision(12)));

/** Grouped layout for the two-way mixed model: rows = time points,
 *  data sets = groups, subcolumns = the subjects of that group. */
export function groupedFromRecords(records: LongRecord[], timeTitle = "Day"): DataTableModel {
  const { groups, subjects } = subjectSeries(records);
  const times = [...new Set(subjects.flatMap((s) => s.t))].sort((a, b) => a - b);
  return normalizeTable({
    type: "grouped",
    rowTitles: times.map((v) => `${timeTitle} ${fmtNum(v)}`),
    x: times.map(() => ""),
    datasets: groups.map((g) => {
      const subs = subjects.filter((s) => s.group === g);
      return {
        name: g,
        subTitles: subs.map((s) => s.label),
        rows: times.map((tt) => subs.map((s) => {
          const i = s.t.indexOf(tt);
          return i >= 0 ? fmtNum(s.y[i]) : "";
        })),
      };
    }),
  });
}

/** Drop the time points at which some group has no value at all (the
 *  model cannot estimate that cell); returns the table and their titles. */
export function dropEmptyCells(t: DataTableModel): { table: DataTableModel; dropped: string[] } {
  const empty = t.rowTitles.map((_, r) => t.datasets.some((d) => (d.rows[r] ?? []).every((v) => v.trim() === "")));
  if (!empty.some(Boolean)) return { table: t, dropped: [] };
  const keep = empty.map((e, r) => (e ? -1 : r)).filter((r) => r >= 0);
  return {
    table: normalizeTable({
      ...t,
      x: keep.map((r) => t.x[r]),
      rowTitles: keep.map((r) => t.rowTitles[r]),
      datasets: t.datasets.map((d) => ({ ...d, rows: keep.map((r) => d.rows[r]) })),
    }),
    dropped: t.rowTitles.filter((_, r) => empty[r]),
  };
}

export interface EndpointRow { group: string; label: string; time: number; event: 0 | 1; lastValue: number }

/** Time to reach a threshold value per subject: the first measurement at
 *  or above it (with `interpolate`, the crossing time between that and
 *  the previous measurement, on the log scale where both are positive,
 *  as growth is exponential); subjects that never reach it are censored
 *  at their last measurement. */
export function endpointRows(records: LongRecord[], threshold: number, interpolate: boolean): EndpointRow[] {
  const { subjects } = subjectSeries(records);
  return subjects.map((s) => {
    const j = s.y.findIndex((v) => v >= threshold);
    if (j < 0) {
      return { group: s.group, label: s.label, time: s.t[s.t.length - 1], event: 0 as const,
        lastValue: s.y[s.y.length - 1] };
    }
    let time = s.t[j];
    if (interpolate && j > 0) {
      const [t0, t1, v0, v1] = [s.t[j - 1], s.t[j], s.y[j - 1], s.y[j]];
      const frac = v0 > 0 && v1 > 0 && threshold > 0
        ? (Math.log(threshold) - Math.log(v0)) / (Math.log(v1) - Math.log(v0))
        : (threshold - v0) / (v1 - v0);
      if (Number.isFinite(frac)) time = t0 + (t1 - t0) * Math.min(1, Math.max(0, frac));
    }
    return { group: s.group, label: s.label, time, event: 1 as const, lastValue: s.y[j] };
  });
}

/** Survival table (time, event per subject, one data set per group). */
export function survivalFromEndpoints(rows: EndpointRow[], groups: string[]): DataTableModel {
  return normalizeTable({
    type: "survival",
    datasets: groups.map((g) => ({
      name: g,
      subTitles: ["Time", "Event"],
      rows: rows.filter((r) => r.group === g).map((r) => [fmtNum(r.time), String(r.event)]),
    })),
  });
}

/** Column table of one value per subject (the AUCs), one data set per
 *  group. */
export function columnFromValues(datasets: { name: string; ys: (number | null)[][] }[],
  yTitle: string): DataTableModel {
  return normalizeTable({
    type: "column",
    yTitle,
    datasets: datasets.map((d) => ({
      name: d.name,
      rows: d.ys.map((r) => [r[0] === null || r[0] === undefined ? "" : fmtNum(r[0])]),
    })),
  });
}

// ------------------------------------------------------------ options

const obj = (raw: unknown) => (raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : d);

function base(raw: Record<string, unknown>, table: DataTableModel, log: boolean): TumourBase {
  const c = obj(raw.columns);
  const guess = table.type === "multivariable" ? guessColumns(table) : EMPTY_COLUMNS;
  return {
    columns: {
      subject: str(c.subject, guess.subject), group: str(c.group, guess.group),
      time: str(c.time, guess.time), value: str(c.value, guess.value),
    },
    log: bool(raw.log, log),
    offset: str(raw.offset, "0"),
  };
}

export function normalizeMixed(raw: unknown, table: DataTableModel): TumourMixedOptions {
  const o = obj(raw);
  return {
    ...base(o, table, true),
    comparisons: pick(o.comparisons, ["sidak", "tukey", "bonferroni", "none"] as const, "sidak"),
    direction: pick(o.direction, ["columns_within_rows", "rows_within_columns"] as const,
      "columns_within_rows"),
  };
}

export function normalizeTumourAuc(raw: unknown, table: DataTableModel): TumourAucOptions {
  const o = obj(raw);
  return {
    ...base(o, table, false),
    baseline: pick(o.baseline, ["zero", "first"] as const, "zero"),
    perTime: bool(o.perTime, false),
    welch: bool(o.welch, false),
  };
}

export function normalizeEndpoint(raw: unknown, table: DataTableModel): TumourEndpointOptions {
  const o = obj(raw);
  return {
    ...base(o, table, false),
    log: false,
    threshold: str(o.threshold, "1000"),
    interpolate: bool(o.interpolate, true),
  };
}
