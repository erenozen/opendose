// One methods sentence per manipulation, and the simulation sentence.
import type { DataTableModel } from "../../project/types";
import {
  BUILTIN_FUNCS, EXTRA_Y_FUNCS, PHARM_FUNCS,
  type BaselineOptions, type ConcOptions, type FractionOptions, type NormalizeOptions,
  type PruneOptions, type TransformOptions, type TransposeOptions,
} from "./run";

const plain = (s: string) => s.replace("×", "multiplied by").replace("−", "minus");

export function transformMethods(o: TransformOptions, t: DataTableModel): string {
  if (o.mode === "pharm") {
    const f = PHARM_FUNCS.find((p) => p.id === o.pharm) ?? PHARM_FUNCS[0];
    return `Data were transformed for a ${f.label} plot (X = ${f.x}, Y = ${f.y}`
      + `${f.k ? `, with ${f.k} = ${o.pharmK}` : ""}).`;
  }
  if (o.mode === "user") {
    const parts = [o.xFormula.trim() && t.type === "xy" ? o.xFormula.trim() : "",
      o.yFormula.trim()].filter(Boolean).map((f) => f.replace(/\s*\n\s*/g, "; "));
    const k = o.constants.filter((c) => c.name.trim())
      .map((c) => `${c.name.trim()} = ${c.value}`).join(", ");
    return `Data were transformed with the user-defined formula${parts.length > 1 ? "s" : ""} `
      + `${parts.join(" and ")}${k ? ` (${o.constantsPerDataset ? "constants set per data set; defaults " : ""}${k})` : ""}.`;
  }
  const bits: string[] = [];
  const xb = t.type === "xy" ? BUILTIN_FUNCS.find((f) => f.id === o.xFunc) : undefined;
  if (xb) bits.push(plain(xb.x).replace("K", o.xK));
  const yb = BUILTIN_FUNCS.find((f) => f.id === o.yFunc);
  const ye = EXTRA_Y_FUNCS.find((f) => f.id === o.yFunc);
  const yLabel = yb?.y ?? ye?.label;
  const yHasK = yb?.k || ye?.k;
  if (yLabel) {
    bits.push(plain(yLabel) + (yHasK ? (o.kPerDataset ? " (K set per data set)" : ` with K = ${o.yK}`) : ""));
  }
  if (!bits.length) return "The data table was copied without transformation.";
  return `Data were transformed: ${bits.join("; ")}.`
    .replace(/log\(/g, "log10(");
}

export function concMethods(o: ConcOptions): string {
  const steps: string[] = [];
  if (o.zero === "value") steps.push(`zero concentrations were replaced by ${o.zeroValue}`);
  if (o.zero === "auto") steps.push("zero concentrations were replaced by a value two log units below the lowest nonzero concentration");
  if (o.units !== "none") steps.push(`concentrations were ${o.units === "multiply" ? "multiplied" : "divided"} by ${o.factor}`);
  if (o.log !== "none") steps.push(`X was transformed to ${o.log === "log10" ? "log10" : "natural log"}(concentration)`);
  if (!steps.length) return "Concentrations were left unchanged.";
  const s = steps.join(", then ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

const OP_TEXT: Record<BaselineOptions["operation"], string> = {
  subtract: "subtracted from each value",
  divide: "divided into each value",
  fraction_difference: "used to express each value as a fractional difference from baseline",
  percent_difference: "used to express each value as a percent difference from baseline",
  percent_of_baseline: "used to express each value as a percent of baseline",
  add: "added to each value",
  multiply: "multiplied with each value",
};

export function baselineMethods(o: BaselineOptions, t: DataTableModel): string {
  const where: Record<BaselineOptions["baseline"], string> = {
    column: `the matching row of data set ${t.datasets[o.baselineDataset]?.name ?? "A"}`,
    alternate: "the paired baseline data set (every other data set)",
    first_row: "the first row",
    last_row: "the last row",
    first_rows: `the mean of the first ${o.k} rows`,
    last_rows: `the mean of the last ${o.k} rows`,
    first_last_rows: `the mean of the first and last ${o.k} rows`,
    value: `the constant ${o.value}`,
  };
  return `A baseline taken from ${where[o.baseline]}`
    + `${o.linearBaseline ? " (smoothed by linear regression against X)" : ""}`
    + ` was ${OP_TEXT[o.operation]}.`;
}

export function normalizeMethods(o: NormalizeOptions): string {
  const zero = { smallest: "the smallest value in each data set", first: "the first row",
    value: `${o.zeroValue}` }[o.zeroMode];
  const hundred = { largest: "the largest value in each data set", last: "the last row",
    sum: "the sum of all values", value: `${o.hundredValue}` }[o.hundredMode];
  return `Data were normalized so that 0% is ${zero} and 100% is ${hundred}`
    + `, reported as ${o.asPercent ? "percentages" : "fractions"}`
    + `${o.subcolumns === "mean" ? " (scale set from the row means)" : " (each subcolumn separately)"}.`;
}

export function transposeMethods(o: TransposeOptions): string {
  return `The table was transposed so that each row became a data set`
    + `${o.replicates === "mean" ? ", replicates replaced by their mean" : ""}.`;
}

export function pruneMethods(o: PruneOptions, t: DataTableModel): string {
  const bits: string[] = [];
  if (o.useRange && t.type === "xy") {
    bits.push(`rows with X ${o.xMin !== "" && o.xMax !== "" ? `between ${o.xMin} and ${o.xMax}`
      : o.xMin !== "" ? `of at least ${o.xMin}` : o.xMax !== "" ? `of at most ${o.xMax}` : "in any range"} were kept`);
  }
  if (o.mode === "keep_every") bits.push(`one row in every ${o.k} was kept, starting at row ${o.start}`);
  if (o.mode === "average") bits.push(`each group of ${o.k} consecutive rows was averaged into one`);
  if (!bits.length) return "All rows were kept.";
  const s = `The table was pruned: ${bits.join(", then ")}.`;
  return s;
}

export function fractionMethods(o: FractionOptions): string {
  const by = { column: "its column total", row: "its row total", grand: "the grand total" }[o.divideBy];
  const ci = o.ci ? `, with ${o.ciLevel}% confidence intervals by the ${{
    wilson_brown: "Wilson/Brown hybrid", wilson: "Wilson", clopper_pearson: "Clopper-Pearson",
  }[o.ciMethod]} method` : "";
  return `Each value was divided by ${by} and reported as a ${o.asPercent ? "percentage" : "fraction"}${ci}.`;
}
