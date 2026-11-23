// The fit summary (FEATURE-PLAN P-17): one row per data set of an XY
// curve fit, above the per-curve cards, with the key parameter (IC50,
// EC50, Km, ...) and its CI, the other fitted parameters, R² and the
// fit's caveats with their reasons; and the linked column table of the
// same best-fit values ("Make a table of parameters"), for CSV, graphs
// and tests between data sets.
//
// Every cell is the card's own text (fitCells.ts), so a summary row is
// always its data set's card. Pure; unit-tested.
import { formatSig, type AnalysisResult, type FitResult, type ParamEntry } from "../../types.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { keyParam, paramLabel } from "../../components/answer/keyFacts.ts";
import { fitAmbiguous } from "../../guide/checks.ts";
import { ciText, fitCaveats, reportedValue, valueText, type Caveat } from "./fitCells.ts";

/** The derived-table output name (DerivedLink.output) of the parameters table. */
export const PARAMETERS_OUTPUT = "parameters";

export interface SummaryColumn {
  id: string;
  /** The header: "IC50 (µM)", "95% CI of IC50", "HillSlope", "R²". */
  label: string;
  kind: "value" | "ci" | "r2";
  /** The parameter a value or CI column reads. */
  param?: string;
}

export interface SummaryCell {
  text: string;
  /** What the column sorts on (the fitted value); null sorts last. */
  sort: number | null;
}

export interface SummaryRow {
  /** Position in the table (the sort "Table order"). */
  index: number;
  name: string;
  cells: Record<string, SummaryCell>;
  /** The fit itself, for cells drawn as the card draws them. */
  fit?: FitResult;
  caveats: Caveat[];
  /** The data set could not be fitted: the message, as its card says it. */
  error?: string;
}

export interface FitSummary {
  /** The key parameter, or null when the model has none. */
  key: string | null;
  columns: SummaryColumn[];
  rows: SummaryRow[];
}

const EMPTY: SummaryCell = { text: "—", sort: null };

/** The parameters shown, in order: the key parameter, then HillSlope,
 *  then the other fitted (not derived) parameters. The key's log twin
 *  (LogIC50 next to IC50) and Span stay on the cards. */
function shownParams(fit: FitResult): { key: string | null; others: string[] } {
  const order = (fit.param_order ?? Object.keys(fit.params)).filter((n) => fit.params[n]);
  const key = keyParam(fit);
  const others = order.filter((n) => n !== key && n !== `Log${key}` && n !== "Span"
    && !fit.params[n].derived);
  others.sort((a, b) => Number(b === "HillSlope") - Number(a === "HillSlope"));
  return { key, others };
}

/** One row per data set, or null when the sheet has fewer than two data
 *  sets (the card says it all) or no fit at all. */
export function fitSummary(result: unknown, xUnit: string): FitSummary | null {
  const r = result as AnalysisResult | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return null;
  if (r.datasets.length < 2) return null;
  const first = r.datasets.find((d) => d.fit?.params)?.fit;
  if (!first) return null;
  const { key, others } = shownParams(first);
  const columns: SummaryColumn[] = [];
  if (key) {
    columns.push({ id: `v:${key}`, label: paramLabel(key, first.params[key], xUnit), kind: "value", param: key });
    columns.push({ id: `ci:${key}`, label: `95% CI of ${key}`, kind: "ci", param: key });
  }
  for (const p of others) {
    columns.push({ id: `v:${p}`, label: paramLabel(p, first.params[p], xUnit), kind: "value", param: p });
  }
  columns.push({ id: "r2", label: "R²", kind: "r2" });
  const rows: SummaryRow[] = r.datasets.map((ds, index) => {
    const fit = ds.fit;
    if (ds.error || !fit?.params) {
      return { index, name: ds.name, caveats: [],
        cells: Object.fromEntries(columns.map((c) => [c.id, EMPTY])),
        error: `Could not fit: ${ds.error ?? "no result"}` };
    }
    const cells: Record<string, SummaryCell> = {};
    for (const c of columns) {
      const e: ParamEntry | undefined = c.param ? fit.params[c.param] : undefined;
      if (c.kind === "r2") {
        const v = fit.goodness?.r_squared;
        cells[c.id] = { text: formatSig(v), sort: typeof v === "number" ? v : null };
      } else if (!e || !c.param) {
        cells[c.id] = { text: "n/a", sort: null };
      } else if (c.kind === "value") {
        cells[c.id] = { text: valueText(c.param, e, fit), sort: Number.isFinite(e.value) ? e.value : null };
      } else {
        cells[c.id] = { text: ciText(c.param, e, fit), sort: null };
      }
    }
    return { index, name: ds.name, cells, fit, caveats: fitCaveats(fit) };
  });
  return { key, columns, rows };
}

/** "Table order", or a column with its direction, or caveats first. */
export type SummarySort = { by: "order" } | { by: "flags" } | { by: string; dir: "asc" | "desc" };

/** The rows in the order asked for; rows without a value keep their
 *  table order at the end, whatever the direction. */
export function sortRows(rows: SummaryRow[], sort: SummarySort): SummaryRow[] {
  const out = [...rows];
  if (sort.by === "order") return out;
  if (sort.by === "flags") {
    const weight = (r: SummaryRow) => (r.error ? 2 : r.caveats.length ? 1 : 0);
    return out.sort((a, b) => weight(b) - weight(a) || a.index - b.index);
  }
  const { by } = sort;
  const sign = "dir" in sort && sort.dir === "desc" ? -1 : 1;
  return out.sort((a, b) => {
    const x = a.cells[by]?.sort ?? null;
    const y = b.cells[by]?.sort ?? null;
    if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0) || a.index - b.index;
    return sign * (x - y) || a.index - b.index;
  });
}

/** The choices of the "Sort rows by" select: value -> words. */
export function sortChoices(s: FitSummary): { value: string; label: string }[] {
  const out = [{ value: "order", label: "Table order" }];
  for (const c of s.columns) {
    if (c.kind === "ci") continue;
    out.push({ value: `${c.id}|asc`, label: `${c.label}, lowest first` });
    out.push({ value: `${c.id}|desc`, label: `${c.label}, highest first` });
  }
  out.push({ value: "flags", label: "Flagged fits first" });
  return out;
}

export function parseSort(value: string): SummarySort {
  if (value === "flags") return { by: "flags" };
  const [by, dir] = value.split("|");
  return by && (dir === "asc" || dir === "desc") ? { by, dir } : { by: "order" };
}

// ------------------------------------------------------------ linked table

/** The column table of best-fit values: one row per XY data set (row
 *  titles = data set names), one data set per parameter in the fit's
 *  order, then R². A value the results do not report (an IC50 shown as
 *  "> 30 µM", the parameters of an ambiguous fit, a data set that could
 *  not be fitted) is an empty cell, so a graph or test of the table never uses
 *  a number the results withhold. null while there is no fit. */
export function parametersTable(result: unknown, xUnit: string): DataTableModel | null {
  const r = result as AnalysisResult | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return null;
  const fits = r.datasets.map((d) => (d.error ? undefined : d.fit));
  const first = fits.find((f) => f?.params);
  if (!first) return null;
  const names: string[] = [];
  for (const f of fits) {
    for (const n of f ? f.param_order ?? Object.keys(f.params) : []) {
      if (f?.params[n] && !names.includes(n)) names.push(n);
    }
  }
  const cell = (f: FitResult | undefined, n: string): string => {
    const e = f?.params[n];
    if (!f || !e || fitAmbiguous(f)) return "";
    const v = reportedValue(n, e, f);
    return v === null ? "" : String(v);
  };
  return normalizeTable({
    type: "column",
    yTitle: "Best-fit value",
    rowTitles: r.datasets.map((d) => d.name),
    datasets: [
      ...names.map((n) => ({
        name: paramLabel(n, first.params[n] ?? { value: 0, se: null, ci95: null, constrained: false }, xUnit),
        rows: fits.map((f) => [cell(f, n)]),
      })),
      { name: "R²", rows: fits.map((f) => {
        const v = f?.goodness?.r_squared;
        return [typeof v === "number" && Number.isFinite(v) ? String(v) : ""];
      }) },
    ],
  });
}
