// The standard curve's Precision report (P-94): every sample measured on
// two or more plates (runs) is a precision sample; its dilution-corrected
// replicate concentrations, the plate as the run and an optional Day
// column go to the engine (precision_study, engine/opendose/precision.py:
// repeatability, between-run, between-day and total CV with CIs, CLSI
// EP05-A3 / VCA; recovery against the Concentration typed on its rows,
// ICH M10). Pure: unit-tested in __tests__/stdcurve.test.ts.
import { formatSig } from "../../../types.ts";
import type { StdRow } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PrecisionSample {
  name: string;
  values: number[];
  runs: string[];
  days?: string[];
  nominal?: number;
}

export interface PrecisionInput {
  samples: PrecisionSample[];
  /** Replicates left out (outside the quantification range), per sample. */
  notes: string[];
}

/** The precision samples from the rows and each plate's engine result.
 *  rows: readRows' rows; plates: runStdCurve's per-plate results in the
 *  order stdPayloads made them (unknowns in row order within a plate). */
export function precisionSamples(rows: StdRow[], plates: { plate: string; res: any }[]): PrecisionInput {
  const byName = new Map<string, { values: number[]; runs: string[]; days: string[]; nominal?: number;
    plates: Set<string>; out: number }>();
  const multi = plates.length > 1;
  for (const { plate, res } of plates) {
    if (!res || res.error || !Array.isArray(res.unknowns)) continue;
    const mine = rows.filter((r) => r.kind === "unknown" && (multi ? r.plate === plate : true));
    mine.forEach((row, i) => {
      const u = res.unknowns[i];
      if (!u || u.name !== row.name) return;
      const e = byName.get(row.name) ?? { values: [], runs: [], days: [], plates: new Set<string>(), out: 0 };
      e.plates.add(plate);
      if (e.nominal === undefined && row.conc !== null && row.conc > 0) e.nominal = row.conc;
      const reps: unknown[] = Array.isArray(u.corrected_replicates) ? u.corrected_replicates : [];
      for (const v of reps) {
        if (u.status === "ok" && typeof v === "number" && Number.isFinite(v)) {
          e.values.push(v);
          e.runs.push(plate);
          e.days.push(row.day ?? "");
        } else if (v !== undefined) {
          e.out++;
        }
      }
      byName.set(row.name, e);
    });
  }
  const samples: PrecisionSample[] = [];
  const notes: string[] = [];
  for (const [name, e] of byName) {
    if (e.plates.size < 2) continue;
    const anyDay = e.days.some((d) => d.trim() !== "");
    samples.push({
      name, values: e.values, runs: e.runs,
      ...(anyDay ? { days: e.days } : {}),
      ...(e.nominal !== undefined ? { nominal: e.nominal } : {}),
    });
    if (e.out) {
      notes.push(`${name}: ${e.out} replicate${e.out === 1 ? "" : "s"} outside the quantification range `
        + "(or off the curve) left out of its precision.");
    }
  }
  return { samples, notes };
}

/** "8.2% (95% CI 6.6 to 10.8)". */
export function cvText(c: any, digits = 3): string {
  if (!c || typeof c.cv_percent !== "number") return "n/a";
  const r = (v: number) => formatSig(v, digits);
  const ci = Array.isArray(c.cv_ci) ? ` (${r(c.cv_ci[0])} to ${r(c.cv_ci[1])})` : "";
  return `${r(c.cv_percent)}%${ci}`;
}
