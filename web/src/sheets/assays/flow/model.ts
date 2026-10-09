// Flow cytometry summary (assay module): a FlowJo statistics table (one
// row per sample file, one column per gate statistic, as the FlowJo
// import recipe stages it) to one value per experiment (donor, mouse,
// independent run) and condition through the engine's `flow_summary`
// (engine/opendose/flow.py: technical tubes averaged, optional FMO or
// isotype subtraction per experiment), then a linked column table with
// the experiment as the block: replicate map by an experiment column,
// statistics on replicate means (paired t test for two conditions,
// repeated-measures one-way ANOVA for more) and the column graph as a
// SuperPlot (Lord et al. 2020). Sources for the practice: Cossarizza et
// al. 2019, Eur J Immunol 49:1457, "Guidelines for the use of flow
// cytometry and cell sorting in immunological studies" (data analysis and
// statistics: biological replicates, not events or tubes, are the n);
// Roederer 2001 (FMO controls); Maecker & Trotter 2006 (controls). Pure,
// unit-tested.
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel, Project, ReplicateMap, Sheet } from "../../../project/types.ts";
import { findSheet, updateSheet } from "../../../project/ops.ts";
import { readFormat, withField } from "../../../graph/format.ts";
import { parseSource, recipeById } from "../../../share/recipes/presets.ts";
import { splitName } from "../../../share/recipes/pattern.ts";
import { switchResultsAnalysis } from "../../xy/switchAnalysis.ts";
import { ANALYSIS_REPLICATE_MEANS } from "../../column/superplotStats.ts";
import { cellOf, columnNames, distinctValues, longTable, textColumn } from "../kit/columns.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const FLOW_SOURCE = "Cossarizza et al. 2019, Eur J Immunol 49:1457 (guidelines for flow "
  + "cytometry in immunological studies: data analysis and statistics); Roederer 2001, Cytometry "
  + "45:194 (FMO controls); Maecker & Trotter 2006, Cytometry A 69:1037; Lord et al. 2020, J Cell "
  + "Biol 219:e202001064 (SuperPlots)";

export type PartRole = "experiment" | "condition" | "skip";
export type BackgroundKind = "none" | "fmo" | "isotype";

export interface FlowOptions {
  /** Column holding the sample (file) names ("" = the first text column). */
  sampleColumn: string;
  /** The statistic column analysed ("" = the first Freq. of Parent one). */
  statistic: string;
  /** How sample names split into experiment and condition. */
  delimiter: string;
  stripExtension: boolean;
  /** Role of each part of a split name ([] = guessed). */
  parts: PartRole[];
  background: { kind: BackgroundKind; condition: string };
  /** Condition every other is compared with (first in the linked table). */
  control: string;
  /** What one experiment is, as a plural noun ("donors", "mice"). */
  unit: string;
  output?: string;
}

export const DEFAULT_FLOW_OPTIONS: FlowOptions = {
  sampleColumn: "", statistic: "", delimiter: "", stripExtension: true, parts: [],
  background: { kind: "none", condition: "" }, control: "", unit: "donors",
};

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export function normalizeFlowOptions(raw: unknown): FlowOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const bg = o.background && typeof o.background === "object" ? o.background : {};
  return {
    sampleColumn: str(o.sampleColumn),
    statistic: str(o.statistic),
    delimiter: str(o.delimiter),
    stripExtension: o.stripExtension !== false,
    parts: Array.isArray(o.parts)
      ? o.parts.map((p: unknown) => (p === "experiment" || p === "condition" ? p : "skip")) : [],
    background: {
      kind: bg.kind === "fmo" || bg.kind === "isotype" ? bg.kind : "none",
      condition: str(bg.condition),
    },
    control: str(o.control),
    unit: str(o.unit).trim() || DEFAULT_FLOW_OPTIONS.unit,
    ...(typeof o.output === "string" ? { output: o.output } : {}),
  };
}

// ------------------------------------------------------------ headers

export interface StatColumn {
  index: number;
  name: string;
  /** Gate path ("Lymphocytes/Single Cells/CD4+/CD69+"), "" when none. */
  gate: string;
  /** Statistic as FlowJo writes it ("Freq. of Parent", "Median (BV421-A)"). */
  statistic: string;
  /** Short label: last gate and statistic ("CD69+ · Freq. of Parent"). */
  label: string;
  kind: "freq" | "median" | "mean" | "count" | "other";
}

/** A FlowJo table header "gate/path | Statistic" read into its parts. */
export function parseStatHeader(name: string, index = 0): StatColumn {
  const at = name.lastIndexOf("|");
  const gate = at >= 0 ? name.slice(0, at).trim() : "";
  const statistic = (at >= 0 ? name.slice(at + 1) : name).trim();
  const last = gate.split("/").map((s) => s.trim()).filter(Boolean).pop() ?? "";
  const s = statistic.toLowerCase();
  const kind = /freq|%|percent/.test(s) ? "freq" : /median/.test(s) ? "median"
    : /mean/.test(s) ? "mean" : /^count|#/.test(s) ? "count" : "other";
  return { index, name, gate, statistic, label: last ? `${last} · ${statistic}` : statistic, kind };
}

/** Y-axis title of a statistic: "% CD69+ (Freq. of Parent)", "CD69+ Median (BV421-A)". */
export function statTitle(c: StatColumn): string {
  const last = c.gate.split("/").map((s) => s.trim()).filter(Boolean).pop() ?? "";
  if (c.kind === "freq") return `% ${last || "positive"} (${c.statistic})`;
  return last ? `${last} ${c.statistic}` : c.statistic;
}

// ------------------------------------------------------------ reading

export interface FlowSample { row: number; sample: string; experiment: string; condition: string; value: string }

export interface FlowData {
  sampleIndex: number;
  stats: StatColumn[];
  stat: StatColumn | null;
  delimiter: string;
  parts: PartRole[];
  /** Split names, row by row. */
  split: string[][];
  samples: FlowSample[];
  experiments: string[];
  conditions: string[];
  problem: string | null;
}

/** Index of the sample-name column: the chosen one, else the first column
 *  holding text. */
function sampleColumnOf(t: DataTableModel, o: FlowOptions): number {
  const names = columnNames(t);
  const chosen = o.sampleColumn ? names.indexOf(o.sampleColumn) : -1;
  if (chosen >= 0) return chosen;
  const text = t.datasets.findIndex((d) => d.varType === "categorical"
    || d.rows.some((r) => (r[0] ?? "").trim() !== "" && !Number.isFinite(Number(r[0]))));
  return text >= 0 ? text : 0;
}

const DELIMS = ["_", "-", " ", "."];

/** The delimiter most names contain. */
export function guessFlowDelimiter(names: string[]): string {
  const clean = names.map((n) => splitName(n, "", true)[0]).filter(Boolean);
  for (const d of DELIMS) {
    if (clean.length && clean.filter((n) => n.includes(d)).length / clean.length >= 0.8) return d;
  }
  return "_";
}

const EXPERIMENT_RE = /^(d|donor|exp|expt|experiment|e|m|mouse|p|pt|patient|s|subj|subject|rep|r|run|day|hd|bc)[ -]?\d+[a-z]?$/i;

/** Roles of the parts of split names: a part like D1 / Donor2 / M3 is the
 *  experiment, the other text part the condition; numeric tube or well
 *  numbers and constant parts are skipped. Falls back to experiment,
 *  condition for the first two parts. */
export function guessPartRoles(split: string[][]): PartRole[] {
  const width = Math.max(0, ...split.map((p) => p.length));
  const cols = Array.from({ length: width }, (_, i) => split.map((p) => p[i] ?? ""));
  const roles: PartRole[] = cols.map(() => "skip");
  const distinct = cols.map((c) => new Set(c.filter(Boolean)).size);
  const numeric = (c: string[]) => c.filter(Boolean).every((v) => /^\d+$/.test(v));
  let exp = cols.findIndex((c, i) => distinct[i] > 1 && c.filter(Boolean).every((v) => EXPERIMENT_RE.test(v)));
  // no donor-like part: the first varying text part is the experiment
  if (exp < 0) exp = cols.findIndex((c, i) => distinct[i] > 1 && !numeric(c));
  if (exp >= 0) roles[exp] = "experiment";
  const cond = cols.findIndex((c, i) => i !== exp && distinct[i] > 1 && !numeric(c));
  if (cond >= 0) roles[cond] = "condition";
  if (exp < 0 && cond < 0 && width >= 2) return ["experiment", "condition", ...roles.slice(2)];
  return roles;
}

export function readFlow(t: DataTableModel, o: FlowOptions): FlowData {
  const si = sampleColumnOf(t, o);
  const names = columnNames(t);
  const stats = names.map((n, i) => ({ n, i }))
    .filter(({ i }) => i !== si && t.datasets[i].varType !== "categorical"
      && t.datasets[i].rows.some((r) => (r[0] ?? "").trim() !== ""))
    .map(({ n, i }) => parseStatHeader(n, i));
  const stat = stats.find((s) => s.name === o.statistic) ?? stats.find((s) => s.kind === "freq") ?? stats[0] ?? null;
  const sampleText = textColumn(t, si);
  const rows = sampleText.map((s, r) => ({ s, r })).filter(({ s }) => s !== "");
  const delimiter = o.delimiter || guessFlowDelimiter(rows.map((x) => x.s));
  const split = rows.map(({ s }) => splitName(s, delimiter, o.stripExtension));
  const guessed = guessPartRoles(split);
  const width = Math.max(0, ...split.map((p) => p.length));
  const parts = Array.from({ length: width }, (_, i) => o.parts.length ? o.parts[i] ?? "skip" : guessed[i]);
  const values = stat ? textColumn(t, stat.index) : [];
  const expI = parts.indexOf("experiment");
  const condI = parts.map((p, i) => (p === "condition" ? i : -1)).filter((i) => i >= 0);
  const samples: FlowSample[] = rows.map(({ s, r }, k) => ({
    row: r, sample: s,
    experiment: expI >= 0 ? split[k][expI] ?? "" : "",
    condition: condI.map((i) => split[k][i] ?? "").filter(Boolean).join(" "),
    value: values[r] ?? "",
  }));
  const experiments = distinctValues(samples.map((x) => x.experiment));
  const conditions = distinctValues(samples.map((x) => x.condition));
  let problem: string | null = null;
  if (!rows.length) problem = "No samples yet: paste a FlowJo table (one row per sample).";
  else if (!stat) problem = "No statistic columns: the table needs numeric columns such as “CD69+ | Freq. of Parent”.";
  else if (expI < 0) problem = "Choose which part of the sample names is the donor / experiment.";
  else if (!condI.length) problem = "Choose which part of the sample names is the condition.";
  else if (experiments.length < 2) problem = "Only one donor / experiment found: statistics need at least two.";
  else if (conditions.length < 2) problem = "Only one condition found: nothing to compare.";
  return { sampleIndex: si, stats, stat, delimiter, parts, split, samples, experiments, conditions, problem };
}

/** Conditions in analysis order: the control first, the background left out. */
export function conditionOrder(d: FlowData, o: FlowOptions): string[] {
  const bg = o.background.kind !== "none" ? o.background.condition : "";
  const rest = d.conditions.filter((c) => c !== bg);
  const control = rest.includes(o.control) ? o.control : rest[0];
  return control ? [control, ...rest.filter((c) => c !== control)] : rest;
}

/** A condition named like a control for background subtraction. */
export function guessBackground(conditions: string[]): { kind: BackgroundKind; condition: string } {
  const fmo = conditions.find((c) => /^fmo\b|\bfmo$/i.test(c));
  if (fmo) return { kind: "fmo", condition: fmo };
  const iso = conditions.find((c) => /^(iso|isotype)\b/i.test(c));
  if (iso) return { kind: "isotype", condition: iso };
  return { kind: "none", condition: "" };
}

// ------------------------------------------------------------ engine

export type FlowResult = Record<string, any> & { error?: string };

export function flowPayload(d: FlowData, o: FlowOptions): Record<string, any> {
  const stat = d.stat!;
  const bg = o.background.kind !== "none" && d.conditions.includes(o.background.condition)
    ? { kind: o.background.kind, condition: o.background.condition } : { kind: "none" };
  return {
    analysis: "flow_summary",
    data: { records: d.samples.filter((s) => s.experiment && s.condition).map((s) => ({
      sample: s.sample, experiment: s.experiment, condition: s.condition,
      gate: stat.gate || null, statistic: stat.statistic, value: s.value,
    })) },
    options: {
      statistic: stat.statistic, ...(stat.gate ? { gate: stat.gate } : {}), background: bg,
      conditions: conditionOrder(d, o), experiments: d.experiments,
    },
  };
}

export function runFlow(analyze: (p: unknown) => unknown, t: DataTableModel, o: FlowOptions): FlowResult {
  const d = readFlow(t, o);
  if (d.problem) return { error: d.problem };
  if (o.background.kind !== "none" && !d.conditions.includes(o.background.condition)) {
    return { error: "Choose the FMO / isotype control condition (or no background subtraction)." };
  }
  const r = analyze(flowPayload(d, o)) as FlowResult;
  if (!r || r.error) return r ?? { error: "no result" };
  return { ...r, stat_label: d.stat!.label, y_title: statTitle(d.stat!), unit: o.unit, sample_column: columnNames(t)[d.sampleIndex] };
}

// ------------------------------------------------------------ output

/** "Donor" for "donors", "Mouse" for "mice": the experiment column's title. */
export function unitSingular(unit: string): string {
  const u = unit.trim() || "experiments";
  const s = /mice$/i.test(u) ? u.replace(/mice$/i, "mouse") : /ies$/i.test(u) ? u.replace(/ies$/i, "y")
    : u.replace(/s$/i, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The linked column table: the experiment column (labels) and one data
 *  set per condition, one row per experiment, with the replicate map
 *  set to that column, so statistics on replicate means match the
 *  conditions by experiment and the graph colours points by it. */
export function flowTable(res: FlowResult): DataTableModel | null {
  if (!res || res.error || !res.table || !Array.isArray(res.experiments)) return null;
  const exps: string[] = res.experiments;
  const conds: string[] = res.conditions ?? [];
  if (!exps.length || conds.length < 2) return null;
  const replicates: ReplicateMap = { by: "column", column: 0, unit: String(res.unit || "donors") };
  return {
    ...normalizeTable({
      type: "column", x: exps.map(() => ""), rowTitles: exps, yTitle: String(res.y_title ?? ""),
      datasets: [
        { name: unitSingular(String(res.unit ?? "")), rows: exps.map((e) => [e]) },
        ...conds.map((c, j) => ({ name: c, rows: exps.map((_, r) => [cellOf(res.values?.[r]?.[j] ?? null)]) })),
      ],
    }),
    replicates,
  };
}

/** Statistics on the experiment means: the paired t test for two
 *  conditions, repeated-measures one-way ANOVA (Dunnett against the
 *  control condition) for more. */
export function flowStatsOptions(conditions: number): Record<string, unknown> {
  return conditions === 2
    ? { test: "paired", datasetA: 0, datasetB: 1, comparisons: "dunnett", controlIndex: 0, center: "mean" }
    : { test: "rm_anova", datasetA: 0, datasetB: 1, comparisons: "dunnett", controlIndex: 0, center: "mean" };
}

/** The linked table's first results sheet becomes statistics on replicate
 *  means (paired / RM by experiment) and its graph a SuperPlot joining
 *  each experiment's values; the table's reporting details say what one n
 *  is. Pure (one undo step with the rest of the wizard's finish). */
export function setupFlowOutput(p: Project, linkedId: string, unit: string): Project {
  const data = findSheet(p, linkedId);
  if (!data || data.kind !== "data") return p;
  const groups = data.table.datasets.length - 1;
  let next = updateSheet<Sheet>(p, linkedId, (s) => (s.kind === "data"
    ? { ...s, report: { ...(s.report ?? {}), unit: unit.trim() || "donors", valueIs: "experiment" } } : s));
  const res = next.sheets.filter((s) => s.kind === "results" && s.parentId === linkedId);
  for (const r of res) {
    if (r.kind !== "results" || r.analysis === ANALYSIS_REPLICATE_MEANS) continue;
    next = switchResultsAnalysis(next, r.id, {
      analysis: ANALYSIS_REPLICATE_MEANS, options: flowStatsOptions(groups),
      sheetName: (t) => `${groups === 2 ? "Paired t test" : "RM one-way ANOVA"} of ${t}`,
      graphFrom: "scatter", graphTo: "scatter",
    });
    for (const g of next.sheets) {
      if (g.kind !== "graph" || g.resultsId !== r.id) continue;
      next = updateSheet<Sheet>(next, g.id, (s) => {
        if (s.kind !== "graph") return s;
        const own = (s.settings.column ?? {}) as Record<string, unknown>;
        const f = readFormat(s.settings);
        const format = withField(f, "comparisons", { ...(f.comparisons ?? {}), show: true });
        return { ...s, settings: { ...s.settings, format, column: { ...own,
          superplot: { center: "mean", error: "sd", encode: "both", link: true, on: true } } } };
      });
    }
  }
  return next;
}

// ------------------------------------------------------------ import

/** A pasted or opened FlowJo table as the module's input table (the
 *  FlowJo import recipe: summary rows dropped, the first column = sample
 *  names). Null when nothing could be read. */
export function tableFromFlowJo(text: string): { table: DataTableModel; samples: number } | null {
  const m = parseSource(text);
  if (!m.length) return null;
  const recipe = recipeById("flowjo");
  if (!recipe) return null;
  const st = recipe.stage(m).staging;
  if (!st.rows.length) return null;
  return {
    table: longTable(st.columns.map((c, i) => ({
      name: c.name, varType: i === 0 || !c.numeric ? "categorical" : "continuous",
      values: st.rows.map((r) => r[i] ?? ""),
    }))),
    samples: st.rows.length,
  };
}
