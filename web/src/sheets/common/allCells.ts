// "Compare every cell mean with every other cell mean" after an ordinary
// two-way ANOVA. With the interaction term in the model, the two-way
// residual is the pooled within-cell variation, which is exactly the
// residual of a one-way ANOVA that treats each row × data-set cell as a
// group; Tukey's test (k = number of cells, df = N − cells), Šídák and
// Bonferroni over all pairs of cells are therefore the one-way
// comparisons of the cells (R's TukeyHSD(aov(y ~ A * B), "A:B")). The
// engine's one-way handler computes them. Pure apart from the engine call.

/** The engine bridge, structurally (keeps this module node-testable). */
type EngineBridge = { analyze: (payload: unknown) => unknown };
type R = Record<string, unknown>;

export interface CellGrid {
  rowNames: string[];
  colNames: string[];
  /** cells[row][col] = replicate values (null = missing). */
  cells: (number | null)[][][];
}

/** The one-way payload: one group per non-empty cell, named "row:column". */
export function allCellsPayload(g: CellGrid, method: string): R {
  const datasets: { name: string; ys: number[][] }[] = [];
  g.rowNames.forEach((rn, i) => g.colNames.forEach((cn, j) => {
    const vals = (g.cells[i]?.[j] ?? []).filter((v): v is number => v !== null);
    if (vals.length) datasets.push({ name: `${rn}:${cn}`, ys: vals.map((v) => [v]) });
  }));
  return { analysis: "anova", data: { x: [], datasets }, options: { comparisons: method } };
}

/** The comparisons in the two-way result's shape (family "All cells"). */
export function allCellsComparisons(engine: EngineBridge, g: CellGrid, method: string): R {
  const payload = allCellsPayload(g, method);
  const groups = ((payload.data as R).datasets as unknown[]).length;
  if (groups < 2) return { error: "Comparing all cells needs at least two cells with values" };
  const r = engine.analyze(payload) as R;
  if (!r || r.error) return { error: String(r?.error ?? "no result") };
  const table = r.table as R;
  const mc = r.multiple_comparisons as R | undefined;
  if (!mc) return { error: "no comparisons returned" };
  const comparisons = (mc.comparisons as R[]).map((c) => ({
    family: "All cells",
    pair: c.pair,
    difference: c.difference,
    ci95: c.ci ?? null,
    statistic: c.statistic,
    p_adjusted: c.p_adjusted,
    significant_05: c.significant_05,
    // the family labels (unadjusted P, family size, method)
    ...(c.p_unadjusted !== undefined ? { p_unadjusted: c.p_unadjusted } : {}),
    ...(c.family_size !== undefined ? { family_size: c.family_size, method: c.method } : {}),
  }));
  return {
    method,
    direction: "all_cells",
    ms_residual: table?.ms_within,
    df_residual: table?.df_within,
    n_comparisons: comparisons.length,
    n_cells: groups,
    comparisons,
    ...(cellsFamily(mc.family) ? { family: cellsFamily(mc.family) } : {}),
  };
}

/** The one-way family block, worded for cells ("all pairs of 6 cells"). */
export function cellsFamily(block: unknown): R | null {
  if (!block || typeof block !== "object") return null;
  const b = block as R;
  return { ...b, label: String(b.label ?? "").replace(/ groups\)$/, " cells)") };
}
