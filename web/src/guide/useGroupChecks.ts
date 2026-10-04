// Per-group summaries of a table with the engine's Shapiro-Wilk P merged
// in, for the "Which test?" data checks and the results chips. The engine
// call is cheap (one column_statistics run), debounced, cached per table
// object, and never blocks: until it returns, normality is unknown.
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { analyzeAsync } from "../lib/engine";
import { numericData } from "../project/table";
import type { DataTableModel } from "../project/types";
import type { GroupCheck } from "./recommend";
import { groupChecks } from "./stats";

const cache = new WeakMap<DataTableModel, (number | null)[]>();
const COLUMN_LIKE = new Set(["column", "xy", "nested"]);

/** Shapiro-Wilk P per data set (null when n < 3 or not computable). */
export async function normalityPs(table: DataTableModel): Promise<(number | null)[]> {
  const hit = cache.get(table);
  if (hit) return hit;
  let ps: (number | null)[] = table.datasets.map(() => null);
  try {
    const r = await analyzeAsync({ analysis: "column_statistics", data: numericData(table),
      options: { normality_tests: ["shapiro_wilk"] } }, { priority: "background" }) as {
      datasets?: { normality?: { shapiro_wilk?: { p?: number | null } } }[] };
    ps = (r.datasets ?? []).map((d) => {
      const p = d.normality?.shapiro_wilk?.p;
      return typeof p === "number" && Number.isFinite(p) ? p : null;
    });
  } catch { /* leave unknown */ }
  cache.set(table, ps);
  return ps;
}

export function withNormality(groups: GroupCheck[], ps: (number | null)[] | null): GroupCheck[] {
  if (!ps) return groups;
  return groups.map((g, i) => ({ ...g, normalityP: ps[i] ?? null }));
}

export function useGroupChecks(table: DataTableModel | null, enabled = true): GroupCheck[] {
  const { engineReady } = useProject();
  const base = useMemo(() => (table && COLUMN_LIKE.has(table.type) ? groupChecks(table) : []),
    [table]);
  const [ps, setPs] = useState<{ table: DataTableModel; ps: (number | null)[] } | null>(null);
  useEffect(() => {
    if (!table || !enabled || !engineReady || !COLUMN_LIKE.has(table.type)
      || table.subcolumnFormat !== "replicates") return;
    let live = true;
    const t = setTimeout(() => {
      void normalityPs(table).then((r) => { if (live) setPs({ table, ps: r }); });
    }, cache.has(table) ? 0 : 450);
    return () => { live = false; clearTimeout(t); };
  }, [table, enabled, engineReady]);
  return useMemo(() => withNormality(base, ps?.table === table ? ps.ps : null),
    [base, ps, table]);
}
