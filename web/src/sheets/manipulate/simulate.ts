// Simulated data tables: dialog state ("forms"), engine options built
// from them, and engine output -> data table. The form is what a
// simulated data sheet stores, so "Simulate again" and "Edit simulation"
// reopen exactly what was chosen.
import type { EngineBridge } from "../../lib/engine";
import { normalizeTable, parseCell } from "../../project/table";
import type { DataTableModel, SimulationSpec } from "../../project/types";
import { MODELS_META } from "../../types";
import { fmtCell } from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SimKind = SimulationSpec["kind"];

// ------------------------------------------------------------ XY models

export interface SimParam { name: string; label: string; value: number }
export interface SimModel {
  id: string;
  /** Parameters in the engine's names (LogXmid), shown with `label`. */
  params: SimParam[];
  x: { kind: "arithmetic" | "geometric"; start: number; step: number; stop: number };
  sd: number;
}

const P = (name: string, value: number, label = name): SimParam => ({ name, label, value });
const doseX = { kind: "arithmetic" as const, start: -9, step: 0.5, stop: -5 };

/** Every curve model the fitter knows, with sensible starting values.
 *  The EC50-shift model is a global fit across data sets and is left out. */
export const SIM_MODELS: SimModel[] = [
  { id: "log_inhibitor_vs_response_4pl", x: doseX, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogXmid", -7, "LogIC50"), P("HillSlope", -1)] },
  { id: "log_inhibitor_vs_response_3pl", x: doseX, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogXmid", -7, "LogIC50"), P("HillSlope", -1)] },
  { id: "log_agonist_vs_response_4pl", x: doseX, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogXmid", -7, "LogEC50"), P("HillSlope", 1)] },
  { id: "log_agonist_vs_response_3pl", x: doseX, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogXmid", -7, "LogEC50"), P("HillSlope", 1)] },
  { id: "michaelis_menten", x: { kind: "arithmetic", start: 0, step: 5, stop: 50 }, sd: 3,
    params: [P("Vmax", 100), P("Km", 5)] },
  { id: "saturation_binding", x: { kind: "arithmetic", start: 0, step: 5, stop: 50 }, sd: 30,
    params: [P("Bmax", 1000), P("Kd", 5)] },
  { id: "one_site_competition", x: { kind: "arithmetic", start: -10, step: 0.5, stop: -4 }, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogIC50", -7)] },
  { id: "one_site_fit_ki", x: { kind: "arithmetic", start: -11, step: 0.5, stop: -5 }, sd: 5,
    params: [P("Top", 100), P("Bottom", 0), P("LogKi", -8), P("HotNM", 1), P("HotKdNM", 1)] },
  { id: "two_site_competition", x: { kind: "arithmetic", start: -11, step: 0.5, stop: -3 }, sd: 3,
    params: [P("Top", 100), P("Bottom", 0), P("FracHi", 0.5), P("LogIC50_HiAff", -8),
      P("LogIC50_LoAff", -5)] },
  { id: "one_phase_decay", x: { kind: "arithmetic", start: 0, step: 1, stop: 20 }, sd: 3,
    params: [P("Y0", 100), P("Plateau", 0), P("K", 0.3)] },
  { id: "one_phase_association", x: { kind: "arithmetic", start: 0, step: 1, stop: 20 }, sd: 3,
    params: [P("Y0", 0), P("Plateau", 100), P("K", 0.3)] },
  { id: "exponential_growth", x: { kind: "arithmetic", start: 0, step: 1, stop: 10 }, sd: 5,
    params: [P("Y0", 10), P("K", 0.2)] },
  { id: "two_phase_decay", x: { kind: "arithmetic", start: 0, step: 1, stop: 30 }, sd: 2,
    params: [P("Y0", 100), P("Plateau", 0), P("PercentFast", 60), P("KFast", 1), P("KSlow", 0.1)] },
  { id: "straight_line", x: { kind: "arithmetic", start: 0, step: 1, stop: 10 }, sd: 1,
    params: [P("Slope", 2), P("Yintercept", 1)] },
  { id: "polynomial_second", x: { kind: "arithmetic", start: -5, step: 1, stop: 5 }, sd: 1,
    params: [P("B0", 1), P("B1", 2), P("B2", 0.5)] },
  { id: "polynomial_third", x: { kind: "arithmetic", start: -5, step: 1, stop: 5 }, sd: 2,
    params: [P("B0", 1), P("B1", 2), P("B2", 0.5), P("B3", 0.1)] },
];

export function simModel(id: string): SimModel {
  return SIM_MODELS.find((m) => m.id === id) ?? SIM_MODELS[0];
}

export function modelLabel(id: string): string {
  return MODELS_META[id]?.label ?? id;
}

// ------------------------------------------------------------ forms

export interface ErrorForm {
  kind: "none" | "gaussian" | "relative" | "t" | "poisson";
  sd: string;
  percent: string;
  df: string;
  outliers: boolean;
  outlierProbability: string;   // percent
  outlierMultiple: string;
}

export interface XYSimForm {
  model: string;
  params: Record<string, string>;
  nDatasets: string;
  /** Data-set-specific values (merged over `params`): [data set][name]. */
  perDataset: Record<string, string>[];
  xKind: "arithmetic" | "geometric" | "linear" | "log";
  xStart: string;
  xStep: string;      // increment (arithmetic) or factor (geometric)
  xStop: string;
  xCount: string;
  xBy: "stop" | "count";
  replicates: string;
  error: ErrorForm;
  ideal: boolean;
}

export interface ColumnSimForm {
  groups: { name: string; n: string; mean: string }[];
  error: ErrorForm;
  randomMeans: boolean;
  meanOfMeans: string;
  sdOfMeans: string;
}

export interface ContingencySimForm {
  design: "cross_sectional" | "prospective" | "experimental" | "case_control";
  rowTitles: string[];
  columnTitles: string[];
  /** Meaning depends on the design: cell probabilities (cross-sectional),
   *  outcome probabilities per row (prospective / experimental), or
   *  exposure probabilities per column (case-control). */
  probs: string[][];
  total: string;
  rowTotals: string[];
  columnTotals: string[];
}

export type SimForm = XYSimForm | ColumnSimForm | ContingencySimForm;

export const defaultError = (sd: number): ErrorForm => ({
  kind: "gaussian", sd: String(sd), percent: "10", df: "3",
  outliers: false, outlierProbability: "5", outlierMultiple: "5",
});

export function defaultXYForm(modelId = SIM_MODELS[0].id): XYSimForm {
  const m = simModel(modelId);
  return {
    model: m.id,
    params: Object.fromEntries(m.params.map((p) => [p.name, String(p.value)])),
    nDatasets: "1",
    perDataset: [],
    xKind: m.x.kind, xStart: String(m.x.start), xStep: String(m.x.step),
    xStop: String(m.x.stop), xCount: "9", xBy: "stop",
    replicates: "3",
    error: defaultError(m.sd),
    ideal: false,
  };
}

export function defaultColumnForm(): ColumnSimForm {
  return {
    groups: [
      { name: "Control", n: "8", mean: "10" },
      { name: "Treated", n: "8", mean: "12" },
    ],
    error: defaultError(2),
    randomMeans: false, meanOfMeans: "10", sdOfMeans: "2",
  };
}

export function defaultContingencyForm(): ContingencySimForm {
  return {
    design: "prospective",
    rowTitles: ["Exposed", "Not exposed"],
    columnTitles: ["Disease", "No disease"],
    probs: [["0.3", "0.7"], ["0.1", "0.9"]],
    total: "200",
    rowTotals: ["100", "100"],
    columnTotals: ["100", "100"],
  };
}

export function defaultForm(kind: SimKind): SimForm {
  return kind === "xy" ? defaultXYForm() : kind === "column" ? defaultColumnForm()
    : defaultContingencyForm();
}

// ------------------------------------------------------------ engine options

function num(v: string, what: string): number {
  const n = parseCell(v ?? "");
  if (n === null) throw new Error(`Enter a number for ${what}`);
  return n;
}

function int(v: string, what: string, lo: number, hi: number): number {
  const n = Math.round(num(v, what));
  if (n < lo || n > hi) throw new Error(`${what} must be between ${lo} and ${hi}`);
  return n;
}

function errorOptions(e: ErrorForm): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: e.kind };
  if (e.kind === "gaussian") out.sd = num(e.sd, "the SD");
  if (e.kind === "relative") out.percent = num(e.percent, "the percent error");
  if (e.kind === "t") { out.sd = num(e.sd, "the SD"); out.df = num(e.df, "df"); }
  if (e.outliers && e.kind !== "none" && e.kind !== "poisson") {
    out.outliers = {
      probability: num(e.outlierProbability, "the outlier probability") / 100,
      sd_multiple: num(e.outlierMultiple, "the outlier size"),
      direction: "both",
    };
  }
  return out;
}

/** Simulation options for the engine (simulate_xy / _column / _contingency
 *  and monte_carlo's "simulation"), without the seed. */
export function simOptions(kind: SimKind, form: SimForm): Record<string, unknown> {
  if (kind === "xy") {
    const f = form as XYSimForm;
    const m = simModel(f.model);
    const base = Object.fromEntries(m.params.map((p) => [p.name, num(f.params[p.name] ?? String(p.value), p.label)]));
    const n = int(f.nDatasets, "The number of data sets", 1, 26);
    const params = n > 1 && f.perDataset.some((d) => d && Object.values(d).some((v) => v.trim()))
      ? Array.from({ length: n }, (_, i) => {
        const over: Record<string, number> = {};
        for (const [k, v] of Object.entries(f.perDataset[i] ?? {})) {
          if (v.trim()) over[k] = num(v, `${k} of data set ${i + 1}`);
        }
        return { ...base, ...over };
      })
      : base;
    const x: Record<string, unknown> = { kind: f.xKind, start: num(f.xStart, "the first X") };
    if (f.xKind === "arithmetic") x.increment = num(f.xStep, "the X increment");
    if (f.xKind === "geometric") x.factor = num(f.xStep, "the X factor");
    if (f.xKind === "linear" || f.xKind === "log" || f.xBy === "stop") x.stop = num(f.xStop, "the last X");
    if (f.xKind === "linear" || f.xKind === "log" || f.xBy === "count") {
      x.count = int(f.xCount, "The number of X values", 1, 10000);
    }
    return {
      model: m.id, params, x, n_datasets: n,
      replicates: int(f.replicates, "Replicates", 1, 100),
      error: errorOptions(f.error),
    };
  }
  if (kind === "column") {
    const f = form as ColumnSimForm;
    if (!f.groups.length) throw new Error("Add at least one group");
    return {
      groups: f.groups.map((g, i) => ({
        name: g.name || `Group ${i + 1}`,
        n: int(g.n, `n of ${g.name || `group ${i + 1}`}`, 0, 10000),
        mean: f.randomMeans ? 0 : num(g.mean, `the mean of ${g.name || `group ${i + 1}`}`),
      })),
      error: errorOptions(f.error),
      ...(f.randomMeans ? { random_means: { mean: num(f.meanOfMeans, "the mean of the means"),
        sd: num(f.sdOfMeans, "the SD of the means") } } : {}),
    };
  }
  const f = form as ContingencySimForm;
  const r = f.rowTitles.length;
  const c = f.columnTitles.length;
  const grid = f.probs.slice(0, r).map((row, i) => row.slice(0, c).map((v, j) =>
    num(v, `probability in row ${i + 1}, column ${j + 1}`)));
  if (grid.flat().some((v) => v < 0)) throw new Error("Probabilities cannot be negative");
  const norm = (xs: number[], what: string) => {
    const s = xs.reduce((a, b) => a + b, 0);
    if (!(s > 0)) throw new Error(`${what} must not all be zero`);
    return xs.map((v) => v / s);
  };
  const common = { row_titles: f.rowTitles, column_titles: f.columnTitles, design: f.design };
  if (f.design === "cross_sectional") {
    return { ...common, total: int(f.total, "The total", 1, 1e6), cell_probabilities: grid };
  }
  if (f.design === "case_control") {
    return {
      ...common,
      column_totals: f.columnTotals.slice(0, c).map((v, j) => int(v, `the total of column ${j + 1}`, 0, 1e6)),
      exposure_probabilities: Array.from({ length: c }, (_, j) =>
        norm(grid.map((row) => row[j]), `The probabilities of column ${j + 1}`)),
    };
  }
  return {
    ...common,
    row_totals: f.rowTotals.slice(0, r).map((v, i) => int(v, `the total of row ${i + 1}`, 0, 1e6)),
    outcome_probabilities: grid.map((row, i) => norm(row, `The probabilities of row ${i + 1}`)),
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Run a simulation and return the table it makes. Throws on bad input. */
export function simulateTable(engine: EngineBridge, kind: SimKind, form: SimForm,
  seed: number): DataTableModel {
  const options = { ...simOptions(kind, form), seed };
  const r = engine.analyze({ analysis: `simulate_${kind}`, data: {}, options }) as any;
  if (r?.error) throw new Error(String(r.error));
  if (kind === "xy") {
    const f = form as XYSimForm;
    const m = simModel(f.model);
    const meta = MODELS_META[m.id];
    const datasets = r.datasets.map((d: any) => ({
      name: d.name, rows: d.ys.map((row: (number | null)[]) => row.map(fmtCell)),
    }));
    if (f.ideal) {
      for (const d of r.datasets) {
        datasets.push({ name: `${d.name} (ideal)`, rows: d.ideal.map((v: number | null) => [fmtCell(v)]) });
      }
    }
    return normalizeTable({
      type: "xy", x: r.x.map(fmtCell), datasets,
      xTitle: meta?.xLabel ?? "X",
      xUnit: meta?.needsLogX ? "M" : "",
    }, "xy");
  }
  if (kind === "column") {
    const n = Math.max(1, ...r.datasets.map((d: any) => d.ys.length));
    return normalizeTable({
      type: "column", x: Array(n).fill(""),
      datasets: r.datasets.map((d: any) => ({
        name: d.name, rows: d.ys.map((row: (number | null)[]) => [fmtCell(row[0])]),
      })),
    }, "column");
  }
  const table: number[][] = r.table;
  return normalizeTable({
    type: "contingency", x: table.map(() => ""), rowTitles: r.row_titles,
    datasets: r.column_titles.map((name: string, j: number) => ({
      name, rows: table.map((row) => [String(row[j])]),
    })),
  }, "contingency");
}

// ------------------------------------------------------------ text

const ERROR_TEXT = (e: ErrorForm) => {
  const base = {
    none: "no random error",
    gaussian: `Gaussian random error (SD ${e.sd})`,
    relative: `Gaussian relative error (SD ${e.percent}% of each value)`,
    t: `t-distributed random error (SD ${e.sd}, ${e.df} df)`,
    poisson: "Poisson random error",
  }[e.kind];
  return e.outliers && e.kind !== "none" && e.kind !== "poisson"
    ? `${base}, with ${e.outlierProbability}% of values made outliers ${e.outlierMultiple} SD away`
    : base;
};

/** "Data were simulated …" for methods text and the table note. */
export function simulationSentence(spec: { kind: SimKind; form: unknown; seed: number }): string {
  try {
    if (spec.kind === "xy") {
      const f = spec.form as XYSimForm;
      const m = simModel(f.model);
      const ps = m.params.map((p) => `${p.label} = ${f.params[p.name] ?? p.value}`).join(", ");
      const x = f.xKind === "arithmetic" || f.xKind === "geometric"
        ? `X from ${f.xStart} ${f.xKind === "geometric" ? "times" : "in steps of"} ${f.xStep}`
          + (f.xBy === "stop" ? ` to ${f.xStop}` : `, ${f.xCount} values`)
        : `${f.xCount} X values ${f.xKind === "log" ? "spaced evenly on a log scale" : "evenly spaced"} from ${f.xStart} to ${f.xStop}`;
      return `Data were simulated from the ${modelLabel(m.id)} model (${ps}) at ${x}, `
        + `${f.nDatasets} data set${f.nDatasets === "1" ? "" : "s"} with ${f.replicates} `
        + `replicate${f.replicates === "1" ? "" : "s"} each, adding ${ERROR_TEXT(f.error)} `
        + `(random seed ${spec.seed}).`;
    }
    if (spec.kind === "column") {
      const f = spec.form as ColumnSimForm;
      const groups = f.groups.map((g) => (f.randomMeans ? `${g.name} (n = ${g.n})`
        : `${g.name} (n = ${g.n}, mean ${g.mean})`)).join(", ");
      return `Data were simulated for ${f.groups.length} group${f.groups.length === 1 ? "" : "s"}: `
        + `${groups}${f.randomMeans ? `, each population mean drawn from a Gaussian distribution with mean ${f.meanOfMeans} and SD ${f.sdOfMeans}` : ""}, `
        + `with ${ERROR_TEXT(f.error)} (random seed ${spec.seed}).`;
    }
    const f = spec.form as ContingencySimForm;
    const design = {
      cross_sectional: `a cross-sectional design (${f.total} subjects in all)`,
      prospective: `a prospective design (row totals ${f.rowTotals.join(", ")})`,
      experimental: `an experimental design (row totals ${f.rowTotals.join(", ")})`,
      case_control: `a case-control design (column totals ${f.columnTotals.join(", ")})`,
    }[f.design];
    return `A ${f.rowTitles.length} × ${f.columnTitles.length} contingency table was simulated `
      + `under ${design} (random seed ${spec.seed}).`;
  } catch {
    return `Data were simulated (random seed ${spec.seed}).`;
  }
}
