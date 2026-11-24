// The published reference datasets of the validation page as projects
// (P-127). The index (referenceDatasets.json, compiled from the corpus in
// docs/validation by scripts/reference-datasets.mjs) says what each
// dataset is, how its reference was computed (`plan`) and its published
// values; this module turns a dataset's CSV into the table and the one
// analysis that reproduce them, and the info sheet notes that carry the
// reference values into the project. Pure: unit-tested in
// __tests__/referenceDatasets.test.ts; the app side is
// openReferenceDataset.ts.
import { normalizeTable } from "../project/table.ts";
import type { DataTableModel, TableType } from "../project/types.ts";

export type DatasetPlan =
  | { kind: "column_stats" }
  | { kind: "anova" }
  | { kind: "user_fit"; equation: string; start: Record<string, number> }
  | { kind: "linreg"; throughOrigin: boolean }
  | { kind: "polynomial2" }
  | { kind: "mv_regression" };

export interface ReferenceValue {
  quantity: string;
  value: number;
  /** As the source printed it. */
  printed?: string;
  tolerance: { abs?: number; rel?: number } | null;
  source: string;
  /** The engine's result in the corpus run (results-engine.json). */
  engine?: { value: number; status: string };
}

export interface ReferenceDataset {
  id: string;
  title: string;
  file: string;
  workflow: string;
  citation: string;
  sourceUrl: string;
  licence: string;
  difficulty?: string;
  stress?: boolean;
  layout: { x?: string | string[]; y?: string[]; columns?: string[]; notes?: string };
  plan: DatasetPlan;
  references: ReferenceValue[];
}

export interface ReferenceIndex { source: string; engineRun: string | null; datasets: ReferenceDataset[] }

/** A corpus CSV: a header row, then values exactly as the source printed
 *  them (no quoting in this corpus; a blank cell is a missing value). */
export function parseCorpusCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("the file is empty");
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { header, rows };
}

const column = (h: string[], rows: string[][], name: string) => {
  const i = h.indexOf(name);
  if (i < 0) throw new Error(`the file has no column “${name}”`);
  return rows.map((r) => r[i] ?? "");
};

/** The dataset's table, values as printed (77.6E0 stays 77.6E0). */
export function datasetTable(d: ReferenceDataset, csv: string): DataTableModel {
  const { header, rows } = parseCorpusCsv(csv);
  const blank = rows.map(() => "");
  switch (d.plan.kind) {
    case "column_stats":
    case "anova": {
      const names = d.layout.columns ?? header;
      // unequal group sizes end in blank cells: trailing blank rows go
      let n = rows.length;
      while (n > 0 && names.every((c) => (column(header, rows, c)[n - 1] ?? "") === "")) n--;
      return normalizeTable({
        type: "column", x: blank.slice(0, n),
        datasets: names.map((c) => ({ name: c, rows: column(header, rows, c).slice(0, n).map((v) => [v]) })),
      });
    }
    case "user_fit":
    case "linreg":
    case "polynomial2": {
      const xName = typeof d.layout.x === "string" ? d.layout.x : header[0];
      const yName = d.layout.y?.[0] ?? header[1];
      return normalizeTable({
        type: "xy", x: column(header, rows, xName), xTitle: xName,
        datasets: [{ name: yName, rows: column(header, rows, yName).map((v) => [v]) }],
      });
    }
    case "mv_regression": {
      const xs = Array.isArray(d.layout.x) ? d.layout.x : header.slice(0, -1);
      const names = [...xs, ...(d.layout.y ?? [header[header.length - 1]])];
      return normalizeTable({
        type: "multivariable", x: blank,
        datasets: names.map((c) => ({ name: c, varType: "continuous" as const,
          rows: column(header, rows, c).map((v) => [v]) })),
      });
    }
  }
}

/** The table type, the analysis (sheets registry id) and the options set
 *  over its defaults, as the reference computed it. */
export function datasetAnalysis(d: ReferenceDataset): {
  type: TableType; analysis: string; options: Record<string, unknown>;
} {
  const p = d.plan;
  switch (p.kind) {
    case "column_stats":
      return { type: "column", analysis: "column", options: { analysis: "column_statistics" } };
    case "anova":
      return { type: "column", analysis: "column",
        options: { analysis: "anova", anovaKind: "parametric", anovaSd: "equal" } };
    case "user_fit":
      return {
        type: "xy", analysis: "nonlin", options: {
          model: "user", autoFit: "requested", weighting: "none",
          userEquation: {
            id: d.id, name: `${datasetShortName(d)} (NIST)`,
            text: p.equation, xIsLog: false,
            // NIST's first set of starting values ("Start 1")
            rules: Object.fromEntries(Object.entries(p.start).map(([k, v]) =>
              [k, { kind: "value", value: String(v), op: "*", of: "YMAX" }])),
            constraints: {}, transforms: [],
          },
        },
      };
    case "linreg":
      return { type: "xy", analysis: "linear_regression", options: { throughOrigin: p.throughOrigin } };
    case "polynomial2":
      return { type: "xy", analysis: "nonlin",
        options: { model: "polynomial_second", autoFit: "requested", weighting: "none" } };
    case "mv_regression":
      return { type: "multivariable", analysis: "mv_regression", options: {} };
  }
}

/** A short name for the sheet ("Misra1a", "SmLs01"). */
export function datasetShortName(d: ReferenceDataset): string {
  return d.title.replace(/^NIST StRD [^:]*:\s*/, "").replace(/\s*\(.*\)\s*$/, "").trim() || d.id;
}

/** "rel 1e-6", "± 0.0005", "exact" (small numbers in e-notation, as the
 *  checks above them write tolerances). */
export function toleranceText(t: ReferenceValue["tolerance"]): string {
  const n = (v: number) => (v !== 0 && Math.abs(v) < 1e-3 ? v.toExponential() : String(v));
  if (!t) return "exact";
  if (typeof t.rel === "number") return `rel ${n(t.rel)}`;
  if (typeof t.abs === "number") return t.abs === 0 ? "exact" : `± ${n(t.abs)}`;
  return "exact";
}

/** The reference as the source printed it, else the number. */
export const referenceText = (r: ReferenceValue) => r.printed ?? String(r.value);

const STATUS_WORDS: Record<string, string> = {
  pass: "within the tolerance", fail: "outside the tolerance",
};

/** The info sheet's notes: where the data and the reference values come
 *  from, every published value with its source and tolerance, and what
 *  the engine's own test run gave for it. */
export function referenceNotes(d: ReferenceDataset, digits: number): string {
  const lines = [
    d.title,
    "",
    `Data and reference values: ${d.citation}`,
    `Downloaded from ${d.sourceUrl}. Licence: ${d.licence}.`,
    ...(d.difficulty ? [`NIST's rating: ${d.difficulty.toLowerCase()}.`] : []),
    ...(d.stress ? ["A numerical stress test: certified values a float64 computation may not reach to every digit."] : []),
    ...(d.plan.kind === "user_fit"
      ? ["The fit starts from NIST's first set of starting values (Start 1), entered as the equation's initial values."] : []),
    `Results show ${digits} significant digits (Preferences), so they can be read against the certified values.`,
    "",
    "Published reference values (quantity = value; source; tolerance; the OpenDose engine's test run):",
    ...d.references.map((r) => {
      const ours = r.engine
        ? `engine ${r.engine.value} (${STATUS_WORDS[r.engine.status] ?? r.engine.status})`
        : "not computed by OpenDose";
      return `${r.quantity} = ${referenceText(r)}; ${r.source}; ${toleranceText(r.tolerance)}; ${ours}`;
    }),
  ];
  return lines.join("\n");
}

/** The dataset a validation-page check names in its source ("NIST StRD
 *  Longley (1967) certified values" -> nist-longley). */
export function datasetForSource(source: string, datasets: ReferenceDataset[]): ReferenceDataset | undefined {
  const m = /NIST StRD\s+([A-Za-z0-9]+)/.exec(source);
  if (!m) return undefined;
  const id = `nist-${m[1].toLowerCase()}`;
  return datasets.find((d) => d.id === id);
}
