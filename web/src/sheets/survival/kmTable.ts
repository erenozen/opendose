// The Kaplan-Meier table of one group: every distinct time with the
// number at risk, events and censored subjects there, and the survival
// estimate with its Greenwood SE and confidence limits (carried over from
// the last event time at censoring-only times, as a step function). The
// estimates come from the engine (survival.km_curve, at event times);
// the counts from the table. Pure; unit-tested in __tests__/kmTable.test.ts.
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export interface KmPoint { time: number; survival: number; se?: number; lower?: number; upper?: number }

export interface KmRow {
  time: number;
  atRisk: number;
  events: number;
  censored: number;
  survival: number;
  se: number | null;
  lower: number | null;
  upper: number | null;
  /** Log-transform band (R survfit's default), when the engine gives it. */
  lowerLog?: number | null;
  upperLog?: number | null;
}

/** Rows of the engine's Kaplan-Meier table (survival.km_curve "table":
 *  one per event time, as R's summary.survfit). */
export function kmRowsFromEngine(rows: Record<string, unknown>[]): KmRow[] {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return rows.map((r) => ({
    time: n(r.time) ?? 0, atRisk: n(r.at_risk) ?? 0, events: n(r.events) ?? 0,
    censored: n(r.censored) ?? 0, survival: n(r.survival) ?? 1, se: n(r.se),
    lower: n(r.lower), upper: n(r.upper), lowerLog: n(r.lower_log), upperLog: n(r.upper_log),
  }));
}

/** Times and event codes (1 = event, 0 = censored) per group, as the
 *  survival analysis reads them: the first two subcolumns, rows with both. */
export function survivalGroups(table: DataTableModel): { name: string; times: number[]; events: number[] }[] {
  const data = numericData(table);
  return data.datasets.map((d) => {
    const times: number[] = [];
    const events: number[] = [];
    for (const row of d.ys) {
      if (row.length >= 2 && row[0] != null && row[1] != null) {
        times.push(row[0]);
        events.push(Math.trunc(row[1]));
      }
    }
    return { name: d.name, times, events };
  }).filter((g) => g.times.length > 0);
}

export function kmTable(times: number[], events: number[], points: KmPoint[]): KmRow[] {
  const ts = [...new Set(times)].sort((a, b) => a - b);
  const pts = [...points].sort((a, b) => a.time - b.time);
  return ts.map((t) => {
    let atRisk = 0, ev = 0, cens = 0;
    times.forEach((x, i) => {
      if (x >= t) atRisk++;
      if (x === t) {
        if (events[i] === 1) ev++;
        else if (events[i] === 0) cens++;
      }
    });
    let p: KmPoint | undefined;
    for (const q of pts) {
      if (q.time <= t) p = q;
      else break;
    }
    return {
      time: t, atRisk, events: ev, censored: cens,
      survival: p?.survival ?? 1,
      se: p?.se ?? null,
      lower: p?.lower ?? null,
      upper: p?.upper ?? null,
    };
  });
}
