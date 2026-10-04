// Long ("tidy") records -> the data layout four analyses read, for the
// "From long table…" chooser (LongTableDialog.tsx):
//
//   cmh      stratum, row factor, column factor, count (or one record per
//            subject) -> a contingency table with the strata as blocks of
//            consecutive rows titled "Stratum: level" (contingency/run.ts
//            strataOf);
//   roc      marker value, status -> two columns, condition present
//            (patients) and absent (controls) (column/roc.ts);
//   quantal  dose, N, responders, optional group -> an XY table, one data
//            set per group with Y1 = responders and Y2 = N (xy/quantal.ts);
//   xy       data set, X, Y -> an XY table with one data set per data-set
//            value and replicates side by side when an X repeats (the
//            import recipes' pivot, share/recipes/staging.ts).
//
// Pure and unit-tested (__tests__/longTable.test.ts). Every builder takes
// the table being replaced and keeps its type and display settings.
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { parseSource } from "../../share/recipes/presets.ts";
import { distinct, makeStaging, numText, pivot, type Role } from "../../share/recipes/staging.ts";
import { cellNumber, isMissing, isNumericColumn } from "../../share/tidy.ts";

export type LongTarget = "cmh" | "roc" | "quantal" | "xy";

/** A long table: a header row and records. */
export interface LongSource { headers: string[]; rows: string[][] }

/** What a fill produces: the new table, a one-line summary, notes and an
 *  options patch for the analysis that asked (merged over its options). */
export interface LongFill {
  table: DataTableModel;
  summary: string;
  notes: string[];
  options?: Record<string, unknown>;
}

export type LongResult = LongFill | { error: string };

/** Pasted or file text: the first row holds the column titles. */
export function parseLongText(text: string): LongSource | { error: string } {
  if (!text.trim()) return { error: "Paste a table, or choose a file." };
  const m = parseSource(text);
  if (m.length < 2) return { error: "Need a header row and at least one record." };
  const width = Math.max(...m.map((r) => r.length));
  if (width < 2) return { error: "Need at least two columns (check the separator)." };
  const headers = Array.from({ length: width }, (_, c) => (m[0][c] ?? "").trim() || `Column ${c + 1}`);
  const rows = m.slice(1).map((r) => Array.from({ length: width }, (_, c) => (r[c] ?? "").trim()))
    .filter((r) => r.some((v) => v !== ""));
  return { headers, rows };
}

/** A multiple-variables table as a long table (one variable per column). */
export function sourceFromVariables(t: DataTableModel): LongSource {
  const headers = t.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const rows = t.x.map((_, r) => t.datasets.map((d) => (d.rows[r]?.[0] ?? "").trim()))
    .filter((r) => r.some((v) => v !== ""));
  return { headers, rows };
}

// ------------------------------------------------------------ roles

/** Role keys of each target, in the order the dialog asks for them. */
export const TARGET_ROLES: Record<LongTarget, { key: string; label: string; optional?: boolean }[]> = {
  cmh: [
    { key: "stratum", label: "Stratum" },
    { key: "row", label: "Row factor (e.g. exposure)" },
    { key: "col", label: "Column factor (e.g. outcome)" },
    { key: "count", label: "Count", optional: true },
  ],
  roc: [
    { key: "value", label: "Marker value" },
    { key: "status", label: "Status (outcome)" },
  ],
  quantal: [
    { key: "dose", label: "Dose" },
    { key: "n", label: "Number of subjects (N)" },
    { key: "responders", label: "Responders" },
    { key: "group", label: "Group", optional: true },
  ],
  xy: [
    { key: "dataset", label: "Data set (curve)", optional: true },
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
  ],
};

export type Roles = Record<string, number>;

const RE: Record<string, RegExp> = {
  stratum: /strat|centre|center|site|clinic|study|dept|department|block|hospital|batch|age|sex|gender/,
  count: /^(count|counts|n|freq|frequency|number|num|cases|total|weight|w)$/,
  value: /value|marker|score|level|conc|measure|result|biomarker|test/,
  status: /status|outcome|disease|class|label|diagnos|condition|truth|case|group|response/,
  dose: /dose|conc|concentration|^x$|level/,
  n: /^(n|total|subjects|tested|treated|exposed|size|trials)$/,
  responders: /dead|death|responders|respond|affected|died|killed|positive|events|^r$|number|count|success/,
  group: /group|type|form|compound|drug|treatment|sex|strain|line|agent/,
  dataset: /dataset|data set|group|curve|series|condition|treatment|drug|compound|sample|line|subject/,
  x: /^(x|dose|log ?dose|conc|concentration|time|log)|dose|conc|time/,
  y: /^(y|response|value|signal|od|activity|inhibition|viability)|response|value/,
};

const ID_RE = /^(id|#|no\.?|row|subject|subject ?id|patient|patient ?id|record|obs|observation|index|sample ?id)$/;

/** First guess of the roles from the column titles and contents. */
export function guessRoles(src: LongSource, target: LongTarget): Roles {
  const used = new Set<number>();
  const norm = src.headers.map((h) => h.trim().toLowerCase());
  const numeric = src.headers.map((_, c) => isNumericColumn(src.rows.map((r) => r[c] ?? "")));
  const out: Roles = {};
  // identifier columns (subject id, row number) are never a guess
  const idLike = norm.map((h) => ID_RE.test(h));
  const pick = (key: string, want: "num" | "cat" | "any", optional = false) => {
    const ok = (c: number) => !used.has(c) && !idLike[c]
      && (want === "any" || (want === "num") === numeric[c]);
    let c = norm.findIndex((h, i) => ok(i) && RE[key]?.test(h));
    if (c < 0 && !optional) c = norm.findIndex((_, i) => ok(i));
    if (c < 0 && !optional) c = norm.findIndex((_, i) => !used.has(i));
    out[key] = c;
    if (c >= 0) used.add(c);
  };
  if (target === "cmh") {
    pick("count", "num", true);
    pick("stratum", "any");
    pick("row", "any");
    pick("col", "any");
  } else if (target === "roc") {
    pick("status", "any");
    pick("value", "num");
  } else if (target === "quantal") {
    pick("dose", "num");
    pick("n", "num");
    pick("responders", "num");
    pick("group", "any", true);
  } else {
    pick("x", "num");
    pick("y", "num");
    pick("dataset", "cat", true);
  }
  return out;
}

const col = (src: LongSource, c: number) => src.rows.map((r) => (c >= 0 ? r[c] ?? "" : ""));

/** Distinct non-missing values of a column, in first-appearance order. */
export function levelsOf(src: LongSource, c: number): string[] {
  return c < 0 ? [] : distinct(col(src, c).filter((v) => !isMissing(v)));
}

const POSITIVE = /^(1|yes|y|true|positive|pos|\+|case|cases|disease|diseased|poor|present|abnormal|sick|cancer|malignant|dead|died|event|affected|condition)$/i;

/** The level that most likely means "condition present". */
export function guessPositive(levels: string[]): string {
  return levels.find((l) => POSITIVE.test(l.trim())) ?? levels[levels.length > 1 ? 1 : 0] ?? "";
}

const need = (roles: Roles, keys: string[]) => keys.find((k) => !(roles[k] >= 0));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function distinctRoles(roles: Roles, keys: string[]): boolean {
  const cs = keys.map((k) => roles[k]).filter((c) => c >= 0);
  return new Set(cs).size === cs.length;
}

/** Shared fields of a replacement table: the base's type and display
 *  settings, no exclusions or replicate map. */
function replace(base: DataTableModel, fields: Partial<DataTableModel>): DataTableModel {
  const { replicates: _r, xExcluded: _e, ...rest } = base;
  void _r; void _e;
  return normalizeTable({ ...rest, subcolumnFormat: "replicates", ...fields }, base.type);
}

// ------------------------------------------------------------ CMH

/** Stratum × row × column counts as a contingency table with the strata
 *  as blocks of rows titled "Stratum: row level". Repeated combinations
 *  add up; without a count column every record counts one subject. */
export function cmhFromLong(src: LongSource, roles: Roles, base: DataTableModel): LongResult {
  const missing = need(roles, ["stratum", "row", "col"]);
  if (missing) return { error: `Choose the ${missing === "col" ? "column factor" : missing === "row" ? "row factor" : "stratum"} column.` };
  if (!distinctRoles(roles, ["stratum", "row", "col", "count"])) return { error: "Choose a different column for each role." };
  const { stratum: s, row: r, col: c, count: n = -1 } = roles;
  const keep = src.rows.filter((x) => !isMissing(x[s] ?? "") && !isMissing(x[r] ?? "") && !isMissing(x[c] ?? ""));
  let bad = 0;
  const strata = distinct(keep.map((x) => x[s]));
  const rowLv = distinct(keep.map((x) => x[r]));
  const colLv = distinct(keep.map((x) => x[c]));
  if (strata.length < 2) return { error: "Need at least two strata." };
  if (rowLv.length < 2 || colLv.length < 2) return { error: "The row and column factors need at least two levels each." };
  const counts = strata.map(() => rowLv.map(() => colLv.map(() => 0)));
  for (const x of keep) {
    let w = 1;
    if (n >= 0) {
      const v = cellNumber(x[n] ?? "");
      if (v === null || v < 0) { bad++; continue; }
      w = v;
    }
    counts[strata.indexOf(x[s])][rowLv.indexOf(x[r])][colLv.indexOf(x[c])] += w;
  }
  const rowTitles = strata.flatMap((st) => rowLv.map((lv) => `${st}: ${lv}`));
  const table = replace(base, {
    x: rowTitles.map(() => ""),
    rowTitles,
    datasets: colLv.map((lv, j) => ({
      name: lv,
      rows: strata.flatMap((_, k) => rowLv.map((_, i) => [numText(counts[k][i][j])])),
    })),
  });
  const notes: string[] = [];
  if (n < 0) notes.push("No count column: every record counts as one subject.");
  if (bad) notes.push(`${plural(bad, "record")} without a usable count left out.`);
  const skipped = src.rows.length - keep.length;
  if (skipped) notes.push(`${plural(skipped, "record")} with a blank stratum, row or column left out.`);
  return {
    table,
    summary: `${strata.length} strata of ${rowLv.length} × ${colLv.length} tables`,
    notes,
  };
}

// ------------------------------------------------------------ ROC

/** Marker values split by status: condition present (first column) and
 *  absent (second column). */
export function rocFromLong(src: LongSource, roles: Roles, positive: string,
  base: DataTableModel): LongResult {
  const missing = need(roles, ["value", "status"]);
  if (missing) return { error: `Choose the ${missing === "value" ? "marker value" : "status"} column.` };
  if (!distinctRoles(roles, ["value", "status"])) return { error: "Choose a different column for each role." };
  const levels = levelsOf(src, roles.status);
  if (levels.length < 2) return { error: "The status column needs at least two levels." };
  if (!levels.includes(positive)) return { error: "Choose which status means the condition is present." };
  const yes: string[] = [];
  const no: string[] = [];
  let blank = 0;
  for (const x of src.rows) {
    const st = x[roles.status] ?? "";
    const v = cellNumber(x[roles.value] ?? "");
    if (isMissing(st) || v === null) { blank++; continue; }
    (st === positive ? yes : no).push(x[roles.value]);
  }
  if (!yes.length || !no.length) return { error: "Both groups need at least one marker value." };
  const others = levels.filter((l) => l !== positive);
  const noName = others.length === 1 ? others[0] : `Not ${positive}`;
  const n = Math.max(yes.length, no.length);
  const table = replace(base, {
    x: Array(n).fill(""),
    rowTitles: [],
    datasets: [
      { name: positive, rows: Array.from({ length: n }, (_, i) => [yes[i] ?? ""]) },
      { name: noName, rows: Array.from({ length: n }, (_, i) => [no[i] ?? ""]) },
    ],
  });
  const notes: string[] = [];
  if (others.length > 1) notes.push(`Controls pool ${others.length} statuses: ${others.join(", ")}.`);
  if (blank) notes.push(`${plural(blank, "record")} without a marker value or status left out.`);
  return {
    table,
    summary: `${yes.length} with the condition (${positive}), ${no.length} without (${noName})`,
    notes,
    options: { patients: 0, controls: 1, compare: false },
  };
}

// ------------------------------------------------------------ quantal

/** Dose, N and responders (one record per dose group, any number per
 *  dose) as an XY table: X = dose, one data set per group with Y1 =
 *  responders and Y2 = N. Records at the same dose stay separate rows. */
export function quantalFromLong(src: LongSource, roles: Roles, base: DataTableModel): LongResult {
  const missing = need(roles, ["dose", "n", "responders"]);
  if (missing) return { error: `Choose the ${missing === "n" ? "number of subjects" : missing} column.` };
  if (!distinctRoles(roles, ["dose", "n", "responders", "group"])) return { error: "Choose a different column for each role." };
  const g = roles.group ?? -1;
  type Rec = { dose: number; doseText: string; n: string; r: string };
  const byGroup = new Map<string, Rec[]>();
  let skipped = 0;
  for (const x of src.rows) {
    const dose = cellNumber(x[roles.dose] ?? "");
    const n = cellNumber(x[roles.n] ?? "");
    const r = cellNumber(x[roles.responders] ?? "");
    const name = g >= 0 ? (x[g] ?? "").trim() : (base.datasets[0]?.name.trim() || "Data set A");
    if (dose === null || n === null || r === null || (g >= 0 && isMissing(name))) { skipped++; continue; }
    if (n <= 0 || r < 0 || r > n) {
      return { error: `At dose ${x[roles.dose]}${g >= 0 ? ` (${name})` : ""}: responders must be between 0 and N, with N > 0.` };
    }
    if (!byGroup.has(name)) byGroup.set(name, []);
    byGroup.get(name)!.push({ dose, doseText: x[roles.dose], n: x[roles.n], r: x[roles.responders] });
  }
  if (!byGroup.size) return { error: "No record has a dose, an N and a number of responders." };
  // Rows: (dose, k-th record at that dose) over all groups, doses ascending.
  const keys = new Map<string, { dose: number; text: string; k: number }>();
  for (const recs of byGroup.values()) {
    recs.sort((a, b) => a.dose - b.dose);
    const seen = new Map<number, number>();
    for (const rec of recs) {
      const k = seen.get(rec.dose) ?? 0;
      seen.set(rec.dose, k + 1);
      const key = `${rec.dose}#${k}`;
      if (!keys.has(key)) keys.set(key, { dose: rec.dose, text: rec.doseText, k });
    }
  }
  const rows = [...keys.entries()].sort((a, b) => a[1].dose - b[1].dose || a[1].k - b[1].k);
  const index = new Map(rows.map(([key], i) => [key, i]));
  const datasets = [...byGroup.entries()].map(([name, recs]) => {
    const grid = rows.map(() => ["", ""]);
    const seen = new Map<number, number>();
    for (const rec of recs) {
      const k = seen.get(rec.dose) ?? 0;
      seen.set(rec.dose, k + 1);
      grid[index.get(`${rec.dose}#${k}`)!] = [rec.r, rec.n];
    }
    return { name, subTitles: ["Responders", "N"], rows: grid };
  });
  const table = replace(base, {
    x: rows.map(([, v]) => v.text),
    xTitle: src.headers[roles.dose] || base.xTitle,
    rowTitles: [],
    datasets,
  });
  const notes: string[] = [];
  if (skipped) notes.push(`${plural(skipped, "record")} without a dose, N or responders left out.`);
  const zero = rows.filter(([, v]) => v.dose === 0).length;
  if (zero) notes.push("Dose 0 rows are used as the control group by the quantal fit.");
  return {
    table,
    summary: `${plural(byGroup.size, "group")}, ${plural(rows.length, "row")} (dose groups)`,
    notes,
    options: { layout: "subcolumns" },
  };
}

// ------------------------------------------------------------ XY

/** Data set, X, Y records as an XY table: one data set per data-set
 *  value, X ascending, replicates side by side when an X repeats. */
export function xyFromLong(src: LongSource, roles: Roles, base: DataTableModel): LongResult {
  const missing = need(roles, ["x", "y"]);
  if (missing) return { error: `Choose the ${missing.toUpperCase()} column.` };
  if (!distinctRoles(roles, ["dataset", "x", "y"])) return { error: "Choose a different column for each role." };
  const ds = roles.dataset ?? -1;
  const rows = src.rows.filter((x) => cellNumber(x[roles.x] ?? "") !== null && cellNumber(x[roles.y] ?? "") !== null);
  if (!rows.length) return { error: "No record has a numeric X and Y." };
  const roleOf = (c: number): Role => (c === ds ? "group" : c === roles.x ? "time" : c === roles.y ? "value" : "skip");
  const st = makeStaging(src.headers, rows, src.headers.map((_, c) => roleOf(c)));
  let out;
  try {
    out = pivot(st, "xy", { subject: -1 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const t = out.table;
  const table = replace(base, {
    x: t.x,
    xTitle: src.headers[roles.x] || base.xTitle,
    rowTitles: [],
    datasets: t.datasets.map((d) => ({ name: ds >= 0 ? d.name : (base.datasets[0]?.name || "Data set A"), rows: d.rows })),
  });
  const reps = Math.max(...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const notes: string[] = [];
  const skipped = src.rows.length - rows.length;
  if (skipped) notes.push(`${plural(skipped, "record")} without a numeric X and Y left out.`);
  // X below 0, or titled as a logarithm, is already log(concentration)
  const logX = table.x.some((v) => (cellNumber(v) ?? 0) < 0) || /\blog/i.test(src.headers[roles.x] ?? "");
  if (logX) notes.push("X is read as log10(concentration) (“X values are already log10” is ticked).");
  return {
    table,
    summary: `${plural(table.datasets.length, "data set")}, ${plural(table.x.length, "X value")}`
      + (reps > 1 ? `, up to ${reps} replicates per X` : ""),
    notes,
    ...(logX ? { options: { xIsLog: true } } : {}),
  };
}

/** Build the fill of a target. */
export function fillFromLong(target: LongTarget, src: LongSource, roles: Roles, positive: string,
  base: DataTableModel): LongResult {
  if (!src.rows.length) return { error: "The table has no records." };
  switch (target) {
    case "cmh": return cmhFromLong(src, roles, base);
    case "roc": return rocFromLong(src, roles, positive, base);
    case "quantal": return quantalFromLong(src, roles, base);
    default: return xyFromLong(src, roles, base);
  }
}

/** The first rows of a table as text, header first, for the preview. */
export function previewMatrix(t: DataTableModel, maxRows = 12): string[][] {
  const hasX = t.type === "xy";
  const hasTitles = !hasX && t.rowTitles.some((r) => r.trim());
  const head = [
    ...(hasX ? [t.xTitle || "X"] : hasTitles ? [""] : []),
    ...t.datasets.flatMap((d) => {
      const w = d.rows[0]?.length ?? 1;
      return w > 1 ? Array.from({ length: w }, (_, s) => `${d.name}: ${d.subTitles?.[s] || `Y${s + 1}`}`) : [d.name];
    }),
  ];
  const body = t.x.slice(0, maxRows).map((x, r) => [
    ...(hasX ? [x] : hasTitles ? [t.rowTitles[r] ?? ""] : []),
    ...t.datasets.flatMap((d) => d.rows[r] ?? []),
  ]);
  return [head, ...body];
}
