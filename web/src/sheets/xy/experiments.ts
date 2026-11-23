// Potency across independent experiments (FEATURE-PLAN P-08). When an XY
// table carries a replicate map (which subcolumns share an experiment), a
// curve fit also fits each experiment on its own and summarises their
// log potencies on n = experiments (engine/opendose/potency.py: mean
// logIC50, SD, t-based 95% CI, the geometric-mean IC50 with its antilogged
// CI, pIC50 when the unit is molar). The pooled fit stays as it was; its
// CI counts wells (the "CI counts wells, not experiments" chip).
//
// This module builds the engine option from the table, reads the result
// for the headline and the typeset table, and makes the linked column
// table of per-experiment logIC50 values (one data set per XY data set,
// one row per experiment) for a t test or ANOVA between compounds. Every
// number is the engine's, printed with formatSig. Pure; unit-tested.
import { formatSig } from "../../types.ts";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { replicateInfo } from "../common/superplot.ts";
import { concentrationUnit } from "./rangeReport.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The derived-table output name (DerivedLink.output) of the logIC50 table. */
export const POTENCY_OUTPUT = "potency";

/** log10 of a molar concentration unit in mol/L, or null when the unit is
 *  not molar (µg/mL, %, empty): pIC50 is only claimed for molar units. */
export function molarExponent(unit: string): number | null {
  const u = unit.trim().replace(/^μ/, "µ").replace(/^u(?=M$)/, "µ");
  const table: Record<string, number> = { M: 0, mM: -3, "µM": -6, nM: -9, pM: -12, fM: -15 };
  return u in table ? table[u] : null;
}

export interface ExperimentsOption {
  of: number[];
  names: string[];
  log10_molar: number | null;
}

/** The engine's `experiments` option for this table, or null when the
 *  table has no replicate map with two or more experiments (or holds
 *  means with errors instead of replicate values). */
export function experimentsOption(table: DataTableModel): ExperimentsOption | null {
  if (table.type !== "xy" || table.subcolumnFormat !== "replicates") return null;
  const map = table.replicates;
  if (!map || map.by !== "subcolumns") return null;
  const info = replicateInfo(table);
  if (info.names.length < 2) return null;
  const subs = Math.max(1, ...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const of = Array.from({ length: subs }, (_, k) => info.of(0, 0, k));
  if (of.some((e) => e < 0)) return null;
  return { of, names: info.names, log10_molar: molarExponent(concentrationUnit(table)) };
}

// ------------------------------------------------------------ reading

export interface ExperimentRow {
  name: string;
  /** "-7.345" */
  logValue: string;
  /** "4.516e-8" */
  value: string;
  /** "-7.435 to -7.255" (the experiment's own CI, counting its wells) */
  logCI: string;
  included: boolean;
  /** Why it was left out. */
  reason?: string;
}

export interface PotencySummary {
  /** The XY data set. */
  name: string;
  /** "IC50" / "EC50". */
  label: string;
  /** "pIC50" when the unit is molar, else "logIC50". */
  keyName: string;
  rows: ExperimentRow[];
  /** n = experiments used, of how many. */
  n: number;
  of: number;
  df: number;
  /** Set when there is no SD or CI to report (n < 2): the reason. */
  withheld?: string;
  meanLog?: string;
  sdLog?: string;
  ciLog?: string;
  pMean?: string;
  pCI?: string;
  geomean?: string;
  geomeanCI?: string;
  tCrit?: string;
  /** Caveats read with the numbers (two experiments, SD of 0). */
  notes: string[];
  /** The engine could not do it at all (bad map, model without logIC50). */
  error?: string;
}

const range = (c: unknown): string => (Array.isArray(c) && c.length === 2
  && typeof c[0] === "number" && typeof c[1] === "number"
  ? `${formatSig(c[0])} to ${formatSig(c[1])}` : "n/a");

function summaryOf(name: string, e: R): PotencySummary {
  const label = String(e.label ?? "IC50");
  const s = (e.summary ?? {}) as R;
  const fits = (e.fits ?? []) as R[];
  const molar = typeof s.p_mean === "number";
  const out: PotencySummary = {
    name, label, keyName: molar ? `p${label}` : `log${label}`,
    rows: fits.map((f) => ({
      name: String(f.name),
      logValue: typeof f.log_value === "number" ? formatSig(f.log_value) : "n/a",
      value: typeof f.value === "number" ? formatSig(f.value) : "n/a",
      logCI: range(f.ci95_log),
      included: !!f.included,
      ...(f.included ? {} : { reason: String(f.reason ?? "left out") }),
    })),
    n: Number(s.n ?? 0), of: fits.length, df: Number(s.df ?? 0), notes: [],
  };
  if (typeof s.mean_log === "number") out.meanLog = formatSig(s.mean_log);
  if (molar) out.pMean = formatSig(s.p_mean);
  if (typeof s.geomean === "number") out.geomean = formatSig(s.geomean);
  if (s.withheld) {
    out.withheld = String(s.withheld);
    return out;
  }
  out.sdLog = formatSig(s.sd_log);
  out.ciLog = range(s.ci95_log);
  out.tCrit = formatSig(s.t_crit);
  out.geomeanCI = range(s.geomean_ci95);
  if (molar) out.pCI = range(s.p_ci95);
  if (out.n === 2) {
    out.notes.push(`Two experiments: the CI rests on 1 degree of freedom (t = ${out.tCrit}), `
      + "so it is very wide. A third experiment narrows it most.");
  }
  if (s.sd_log === 0) out.notes.push(`The ${out.keyName} values are identical: SD 0, and the CI has no width.`);
  return out;
}

/** One summary per data set that was fitted per experiment. */
export function potencySummaries(result: unknown): PotencySummary[] {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return [];
  const out: PotencySummary[] = [];
  for (const d of r.datasets as R[]) {
    const e = d.experiments as R | undefined;
    if (!e) continue;
    if (e.error) {
      out.push({ name: String(d.name), label: "IC50", keyName: "logIC50", rows: [], n: 0, of: 0,
        df: 0, notes: [], error: String(e.error) });
      continue;
    }
    out.push(summaryOf(String(d.name), e));
  }
  return out;
}

/** "Experiment 3 left out: ambiguous fit: …". */
export function exclusionText(row: ExperimentRow): string {
  return `${row.name} left out: ${row.reason ?? "no usable value"}.`;
}

// ------------------------------------------------------------ linked table

/** The column table of per-experiment log potencies: one data set per
 *  XY data set that was fitted per experiment, one row per experiment
 *  (row titles = experiment names); an experiment left out of the
 *  summary is an empty cell, so tests on the table use the same values.
 *  null while there is nothing to show (an error, no map). */
export function potencyTable(result: unknown): DataTableModel | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || !Array.isArray(r.datasets)) return null;
  const sets = (r.datasets as R[]).filter((d) => d.experiments && !d.experiments.error
    && Array.isArray(d.experiments.fits));
  if (!sets.length) return null;
  const names: string[] = [];
  for (const d of sets) {
    for (const f of d.experiments.fits as R[]) if (!names.includes(String(f.name))) names.push(String(f.name));
  }
  const label = String(sets[0].experiments.label ?? "IC50");
  return normalizeTable({
    type: "column",
    yTitle: `log${label}`,
    rowTitles: names,
    datasets: sets.map((d) => ({
      name: String(d.name),
      rows: names.map((n) => {
        const f = (d.experiments.fits as R[]).find((x) => String(x.name) === n);
        return [f?.included && typeof f.log_value === "number" ? String(f.log_value) : ""];
      }),
    })),
  });
}
