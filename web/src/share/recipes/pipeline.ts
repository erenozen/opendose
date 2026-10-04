// One recipe run: staging -> name pattern -> roles -> hierarchical
// aggregation -> pivot to a table type. Pure; the recipe dialog keeps the
// configuration and shows each stage.
import { applyPattern, type NamePattern } from "./pattern.ts";
import type { Staged } from "./presets.ts";
import {
  aggregate, pivot, withRoles, type AggFn, type AggStep, type OutputType, type PivotResult,
  type Role, type Staging,
} from "./staging.ts";

export interface RecipeConfig {
  /** Roles of the staged columns (the pattern's columns take theirs
   *  from the pattern). */
  roles: Role[];
  pattern: NamePattern | null;
  aggregate: boolean;
  /** Levels to aggregate into, finest first, by column name; "" = the
   *  records sharing group and time (technical replicates). */
  steps: { level: string; fn: AggFn }[];
  /** Also make a nested table of the unaggregated values grouped by the
   *  final level (the lower level kept for display). */
  keepLower: boolean;
  output: OutputType;
  name: string;
}

export function initialConfig(s: Staged): RecipeConfig {
  return {
    roles: s.staging.columns.map((c) => c.role),
    pattern: s.pattern,
    aggregate: s.aggregate.length > 0,
    steps: s.aggregate,
    keepLower: false,
    output: s.output,
    name: s.name,
  };
}

export interface PipelineOutput {
  /** Staged records with the pattern applied and roles set. */
  records: Staging;
  /** After aggregation (same as records when off). */
  aggregated: Staging;
  steps: AggStep[];
  /** Column identifying the experimental unit in the result, or -1. */
  subject: number;
  result: PivotResult | null;
  error: string;
  /** Nested table of the unaggregated values, when asked for. */
  lower: PivotResult | null;
}

export function resolveSteps(st: Staging, steps: RecipeConfig["steps"]): AggStep[] {
  return steps.map((s) => ({
    level: s.level === "" ? -1 : st.columns.findIndex((c) => c.name === s.level
      && (c.role === "subject" || c.role === "level")),
    fn: s.fn,
  })).filter((s, i) => s.level >= 0 || steps[i].level === "");
}

export function runPipeline(base: Staging, cfg: RecipeConfig): PipelineOutput {
  const roled = withRoles(base, cfg.roles);
  const records = applyPattern(roled, cfg.pattern);
  const steps = cfg.aggregate ? resolveSteps(records, cfg.steps) : [];
  const aggregated = aggregate(records, steps);
  const last = steps.length ? steps[steps.length - 1].level : undefined;
  const subject = last !== undefined ? last
    : records.columns.findIndex((c) => c.role === "subject");
  let result: PivotResult | null = null;
  let error = "";
  try {
    result = pivot(aggregated, cfg.output, { subject });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  let lower: PivotResult | null = null;
  if (cfg.keepLower && steps.length && subject >= 0) {
    try { lower = pivot(records, "nested", { subject }); } catch { lower = null; }
  }
  return { records, aggregated, steps, subject, result, error, lower };
}
