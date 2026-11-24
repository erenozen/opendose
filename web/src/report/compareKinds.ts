// The results sheet of "Compare fits" keeps the engine's relative_potency
// and compare_global_fits results inside its own compare_fits shape
// (sheets/xy/relativePotency.ts, compareFits.ts): `potency` holds the raw
// relative-potency result; a comparison of two models holds one row per
// data set (or one for the global fit) with its F test and AICc. These
// read them back in the engine's field names, so the statistics table and
// "What this means" read one shape. Pure.

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The raw relative-potency result of a compare_fits sheet, else null. */
export function potencyOf(r: R | null | undefined): R | null {
  return r?.analysis === "compare_fits" && r.mode === "potency" && r.potency && typeof r.potency === "object"
    ? r.potency : null;
}

/** Each row of a compare_fits "models" sheet as a compare_global_fits
 *  result (model labels, n_points, f_test, aicc), with its row name. */
export function modelComparisons(r: R | null | undefined): { name: string; global: boolean; result: R }[] {
  if (r?.analysis !== "compare_fits" || r.mode !== "models" || !Array.isArray(r.rows)) return [];
  const labels: string[] = Array.isArray(r.labels) ? r.labels.map(String) : ["Model 1", "Model 2"];
  return r.rows.filter((row: R) => row && !row.error && (row.f || row.aicc)).map((row: R) => ({
    name: String(row.name ?? ""),
    global: !!r.global,
    result: {
      analysis: "compare_global_fits",
      model_1: { label: labels[0] }, model_2: { label: labels[1] },
      n_points: row.n,
      f_test: row.f ? { F: row.f.F, dfn: row.f.dfn, dfd: row.f.dfd, p: row.f.p, simpler_model: row.f.simpler } : null,
      aicc: row.aicc ? { delta: row.aicc.delta, prefer: row.aicc.prefer, probability_1: row.aicc.probability1,
        probability_2: row.aicc.probability2 } : null,
    },
  }));
}
