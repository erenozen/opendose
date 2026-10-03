// Monte Carlo: simulate -> analyze -> tabulate, many times. The engine's
// monte_carlo handler does the work; the app calls it in small chunks
// (the seed advanced per chunk) so the page stays responsive, shows
// progress and can stop early, then pools the chunks.
import type { EngineBridge } from "../../lib/engine";
import { parseCell } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import type { OptionsState } from "../../types";
import { MODELS_META } from "../../types";
import { simModel, simOptions, type SimForm, type SimKind, type XYSimForm } from "./simulate";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function simKindOf(t: DataTableModel): SimKind {
  return t.type === "column" ? "column" : t.type === "contingency" ? "contingency" : "xy";
}

export const MAX_REPEATS = 10000;
/** Repeats per engine call: small enough to keep the page responsive. */
export const CHUNK = 5;

export type McAnalysis = "dose_response" | "ttest" | "anova" | "column_statistics" | "contingency";

export const MC_ANALYSES: Record<SimKind, { id: McAnalysis; label: string }[]> = {
  xy: [{ id: "dose_response", label: "Nonlinear regression (curve fit)" }],
  column: [
    { id: "ttest", label: "Unpaired t test (first two groups)" },
    { id: "anova", label: "One-way ANOVA" },
    { id: "column_statistics", label: "Descriptive statistics" },
  ],
  contingency: [{ id: "contingency", label: "Contingency analysis" }],
};

export interface Tabulated { label: string; path: string }

export interface HitForm {
  kind: "none" | "contains" | "compare";
  lower: string;      // label of the CI lower bound
  upper: string;      // label of the CI upper bound
  truth: string;      // value the CI should contain
  label: string;      // compared value
  op: "lt" | "le" | "gt" | "ge";
  threshold: string;
}

export interface McOutput {
  nRequested: number;
  nRepeats: number;
  seed: number;
  cancelled: boolean;
  nFailed: number;
  errors: string[];
  labels: string[];
  values: Record<string, (number | null)[]>;
  summaries: Record<string, Summary>;
  hits: { nHits: number; nDecided: number; fraction: number | null; ci: [number | null, number | null] } | null;
  hitText: string | null;
  analysisLabel: string;
  simulation: { kind: SimKind; form: SimForm };
}

export interface MonteCarloOptions {
  /** null: use the data table's own simulation settings. */
  simulation: { kind: SimKind; form: SimForm } | null;
  analysis: McAnalysis;
  /** Nonlinear regression: copy the options of this results sheet (id),
   *  or "" to fit the simulated model with default settings. */
  fitFrom: string;
  tabulate: Tabulated[];
  hit: HitForm;
  nRepeats: string;
  seed: string;
  histogram: string;   // label drawn by the histogram graph
  output: McOutput | null;
}

export const DEFAULT_HIT: HitForm = {
  kind: "none", lower: "", upper: "", truth: "", label: "", op: "lt", threshold: "0.05",
};

export interface Summary {
  n: number; nMissing: number; mean?: number; sd?: number | null; sem?: number | null;
  median?: number; min?: number; max?: number; p2_5?: number; p97_5?: number;
}

// ------------------------------------------------------------ payloads

/** The analysis the engine repeats, as an api payload without data. */
export function analysisTemplate(o: MonteCarloOptions, kind: SimKind, form: SimForm,
  fit: OptionsState | null): { analysis: string; options: Record<string, unknown> } {
  if (o.analysis === "dose_response") {
    const f = form as XYSimForm;
    const model = kind === "xy" ? f.model : fit?.model ?? "log_inhibitor_vs_response_4pl";
    const meta = MODELS_META[model];
    const constraints: Record<string, number> = {};
    if (fit && fit.model === model && meta) {
      if (fit.top.enabled && meta.constrainable.includes("Top")) constraints.Top = parseCell(fit.top.value) ?? 0;
      if (fit.bottom.enabled && meta.constrainable.includes("Bottom")) constraints.Bottom = parseCell(fit.bottom.value) ?? 0;
      if (fit.hillSlope.enabled && meta.constrainable.includes("HillSlope")) {
        constraints.HillSlope = parseCell(fit.hillSlope.value) ?? -1;
      }
    }
    // Model constants (e.g. Ki fits) come from the simulation itself.
    for (const c of meta?.constants ?? []) {
      const v = parseCell(f.params?.[c] ?? fit?.modelConstants[c] ?? "");
      if (v !== null) constraints[c] = v;
    }
    return {
      analysis: "dose_response",
      options: {
        model,
        // simulated X is in the model's own units (log10 for log models)
        x_is_log: !!meta?.needsLogX,
        constraints,
        weighting: fit && fit.model === model ? fit.weighting : "none",
        ci_method: fit?.ciMethod ?? "asymptotic",
      },
    };
  }
  if (o.analysis === "ttest") {
    return { analysis: "ttest", options: { kind: "unpaired", welch: false, dataset_a: 0, dataset_b: 1 } };
  }
  if (o.analysis === "anova") return { analysis: "anova", options: { kind: "ordinary", comparisons: null } };
  if (o.analysis === "column_statistics") return { analysis: "column_statistics", options: {} };
  return { analysis: "contingency", options: {} };
}

// ------------------------------------------------------------ result paths

const SKIP = new Set(["curve", "points", "fitted_values", "residuals", "bands", "traceback",
  "diagnostics", "equation", "label", "comparisons", "curve_x", "curve_y"]);

/** Numeric leaves of a result, as dotted paths (lists: first 4 items). */
export function numericPaths(obj: unknown, max = 400): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string, depth: number) => {
    if (out.length >= max || depth > 7) return;
    if (typeof v === "number" && Number.isFinite(v)) { out.push(path); return; }
    if (Array.isArray(v)) {
      v.slice(0, 4).forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i), depth + 1));
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (SKIP.has(k)) continue;
        walk(x, path ? `${path}.${k}` : k, depth + 1);
      }
    }
  };
  walk(obj, "", 0);
  return out;
}

const WORDS: Record<string, string> = {
  p: "P", p_two_tailed: "P (two-tailed)", df: "df", sd: "SD", sem: "SEM", se: "SE",
  r_squared: "R²", sy_x: "Sy.x", ss_res: "SS (residual)", n_points: "points",
  F: "F", t: "t", chi2: "chi²", n: "n",
};

/** "datasets.0.fit.params.LogIC50.ci95.0" -> "LogIC50, CI lower". */
export function pathLabel(path: string): string {
  const parts = path.split(".");
  const out: string[] = [];
  let dataset: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    if (p === "datasets" || p === "group_summaries") {
      if (next !== undefined && /^\d+$/.test(next)) { dataset = String(Number(next) + 1); i++; }
      continue;
    }
    if (p === "fit" || p === "params" || p === "goodness" || p === "value" || p === "table"
      || p === "descriptive") continue;
    if (/^(ci95|ci|ci_difference|ci_mean)$/.test(p) && (next === "0" || next === "1")) {
      out.push(`${p === "ci_difference" ? "difference " : p === "ci_mean" ? "mean " : ""}CI ${next === "0" ? "lower" : "upper"}`);
      i++;
      continue;
    }
    out.push(WORDS[p] ?? p.replace(/_/g, " "));
  }
  const text = out.join(", ") || path;
  return dataset && dataset !== "1" ? `${text} (data set ${dataset})` : text;
}

/** Sensible first tabulations for each analysis, given the probe paths. */
export function defaultTabulate(analysis: McAnalysis, paths: string[], form: SimForm | null,
  kind: SimKind): { tab: Tabulated[]; hit: HitForm } {
  const pick = (re: RegExp, n = 1) => paths.filter((p) => re.test(p)).slice(0, n);
  const tab = (list: string[]) => list.map((path) => ({ label: pathLabel(path), path }));
  if (analysis === "dose_response") {
    const m = kind === "xy" && form ? simModel((form as XYSimForm).model) : null;
    const first = m?.params.find((p) => p.name.startsWith("Log")) ?? m?.params[0];
    const pname = first?.label ?? "";
    const base = `datasets.0.fit.params.${pname}`;
    const want = [`${base}.value`, `${base}.ci95.0`, `${base}.ci95.1`].filter((p) => paths.includes(p));
    const t = tab(want.length ? want : pick(/fit\.params\.[^.]+\.value$/, 1));
    const truth = first && form ? (form as XYSimForm).params[first.name] ?? String(first.value) : "";
    const hit: HitForm = want.length === 3
      ? { ...DEFAULT_HIT, kind: "contains", lower: t[1].label, upper: t[2].label, truth }
      : DEFAULT_HIT;
    return { tab: t, hit };
  }
  const pPaths: Record<McAnalysis, RegExp> = {
    dose_response: /$^/,
    ttest: /^p_two_tailed$/,
    anova: /^table\.p$/,
    column_statistics: /descriptive\.mean$/,
    contingency: /^fisher_exact\.p$/,
  };
  const t = tab(pick(pPaths[analysis], analysis === "column_statistics" ? 2 : 1));
  if (analysis === "ttest") t.push(...tab(pick(/^difference$/)));
  const isP = analysis !== "column_statistics" && t.length > 0;
  return {
    tab: t,
    hit: isP ? { ...DEFAULT_HIT, kind: "compare", label: t[0].label, op: "lt", threshold: "0.05" }
      : DEFAULT_HIT,
  };
}

// ------------------------------------------------------------ running

function asData(kind: SimKind, sim: any) {
  if (kind === "contingency") {
    return { table: sim.table, row_titles: sim.row_titles, column_titles: sim.column_titles };
  }
  return { x: sim.x, datasets: sim.datasets.map((d: any) => ({ name: d.name, ys: d.ys })) };
}

/** One simulated data set analyzed once: the result whose numbers can be
 *  tabulated (for the picker). */
export function probe(engine: EngineBridge, kind: SimKind, form: SimForm,
  template: { analysis: string; options: Record<string, unknown> }, seed: number): unknown {
  const sim = engine.analyze({ analysis: `simulate_${kind}`, data: {},
    options: { ...simOptions(kind, form), seed } }) as any;
  if (sim?.error) throw new Error(String(sim.error));
  const res = engine.analyze({ ...template, data: asData(kind, sim) }) as any;
  if (res?.error) throw new Error(String(res.error));
  return res;
}

function engineHit(h: HitForm): Record<string, unknown> | null {
  if (h.kind === "contains") {
    const v = parseCell(h.truth);
    if (!h.lower || !h.upper || v === null) return null;
    return { op: "contains", lower: h.lower, upper: h.upper, value: v };
  }
  if (h.kind === "compare") {
    const v = parseCell(h.threshold);
    if (!h.label || v === null) return null;
    return { name: h.label, op: h.op, value: v };
  }
  return null;
}

export function hitText(h: HitForm): string | null {
  if (h.kind === "contains") return `the interval from ${h.lower} to ${h.upper} contains ${h.truth}`;
  if (h.kind === "compare") {
    const op = { lt: "<", le: "≤", gt: ">", ge: "≥" }[h.op];
    return `${h.label} ${op} ${h.threshold}`;
  }
  return null;
}

/** Percentile with linear interpolation (numpy's default). */
function percentile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarize(vals: (number | null)[]): Summary {
  const a = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  const n = a.length;
  if (!n) return { n: 0, nMissing: vals.length };
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : null;
  const sorted = [...a].sort((x, y) => x - y);
  return {
    n, nMissing: vals.length - n, mean, sd, sem: sd === null ? null : sd / Math.sqrt(n),
    median: percentile(sorted, 0.5), min: sorted[0], max: sorted[n - 1],
    p2_5: percentile(sorted, 0.025), p97_5: percentile(sorted, 0.975),
  };
}

export interface RunPlan {
  kind: SimKind;
  form: SimForm;
  template: { analysis: string; options: Record<string, unknown> };
  tabulate: Tabulated[];
  hit: HitForm;
  n: number;
  seed: number;
  analysisLabel: string;
}

/** Run a plan chunk by chunk, yielding to the page between chunks.
 *  `shouldStop` is checked between chunks; the pooled output so far is
 *  returned either way. */
export async function runMonteCarlo(engine: EngineBridge, plan: RunPlan,
  onProgress: (done: number) => void, shouldStop: () => boolean): Promise<McOutput> {
  const labels = plan.tabulate.map((t) => t.label);
  const paths = Object.fromEntries(plan.tabulate.map((t) => [t.label, t.path]));
  const hit = engineHit(plan.hit);
  const simulation = { kind: plan.kind, ...simOptions(plan.kind, plan.form) };
  const values: Record<string, (number | null)[]> = Object.fromEntries(labels.map((l) => [l, []]));
  const flags: (boolean | null)[] = [];
  const errors: string[] = [];
  let nFailed = 0;
  let done = 0;
  let cancelled = false;
  for (let chunk = 0; done < plan.n; chunk++) {
    if (shouldStop()) { cancelled = true; break; }
    const size = Math.min(CHUNK, plan.n - done);
    const r = engine.analyze({
      analysis: "monte_carlo", data: {},
      options: {
        simulation, analysis: plan.template, n_repeats: size, tabulate: paths,
        seed: plan.seed + chunk, hit, keep_values: true,
      },
    }) as any;
    if (r?.error) throw new Error(String(r.error));
    for (const l of labels) values[l].push(...(r.values?.[l] ?? Array(size).fill(null)));
    if (hit) flags.push(...(r.hits?.flags ?? Array(size).fill(null)));
    nFailed += r.n_failed ?? 0;
    for (const e of r.errors ?? []) {
      if (errors.length < 5) errors.push(String(e).replace(/^repeat (\d+)/, (_m, k) => `repeat ${done + Number(k)}`));
    }
    done += size;
    onProgress(done);
    await new Promise((res) => setTimeout(res, 0));
  }
  let hits: McOutput["hits"] = null;
  if (hit) {
    const decided = flags.filter((f): f is boolean => f !== null);
    const nHits = decided.filter(Boolean).length;
    let ci: [number | null, number | null] = [null, null];
    if (decided.length) {
      // CI of the proportion by the engine's recommended method.
      const c = engine.analyze({
        analysis: "fraction_of_total_table",
        data: { datasets: [{ name: "hits", ys: [[nHits], [decided.length - nHits]] }] },
        options: { divide_by: "column", ci: true, ci_method: "wilson_brown", ci_level: 0.95 },
      }) as any;
      ci = [c?.datasets?.[0]?.ci_lower?.[0] ?? null, c?.datasets?.[0]?.ci_upper?.[0] ?? null];
    }
    hits = { nHits, nDecided: decided.length, fraction: decided.length ? nHits / decided.length : null, ci };
  }
  return {
    nRequested: plan.n, nRepeats: done, seed: plan.seed, cancelled, nFailed, errors, labels,
    values, summaries: Object.fromEntries(labels.map((l) => [l, summarize(values[l])])),
    hits, hitText: hit ? hitText(plan.hit) : null, analysisLabel: plan.analysisLabel,
    simulation: { kind: plan.kind, form: plan.form },
  };
}
