// The residual diagnostics the Checks row shows (ResultsChecks.tsx): one
// per fitted data set of a curve fit or linear regression
// (datasets[].residual_check, engine residuals.fit_residuals), and the
// model's own for two-way, three-way, repeated-measures, nested and mixed
// ANOVA (residual_diagnostics, engine residuals.model_residuals). The
// t tests and one-way ANOVA keep theirs under the results table
// (top-level residual_check, StatsResults.tsx), so they are not listed.
// Pure; unit-tested.

export interface ResidualSet { key: string; title?: string; data: Record<string, unknown> }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function residualSets(result: unknown): ResidualSet[] {
  if (!isObj(result) || result.error) return [];
  const out: ResidualSet[] = [];
  if (Array.isArray(result.datasets)) {
    result.datasets.forEach((d, i) => {
      if (!isObj(d) || d.error || !isObj(d.residual_check)) return;
      const name = typeof d.name === "string" && d.name.trim() ? d.name.trim() : `Data set ${i + 1}`;
      out.push({ key: `ds-${i}`, title: name, data: d.residual_check });
    });
  }
  if (isObj(result.residual_diagnostics)) {
    out.push({ key: "model", data: result.residual_diagnostics });
  }
  return out;
}
